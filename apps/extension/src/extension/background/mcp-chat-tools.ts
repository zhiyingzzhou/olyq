/**
 * 说明：`mcp-chat-tools` 后台运行时模块。
 *
 * 职责：
 * - 在聊天请求前按需收集并注入 MCP ToolSet；
 * - 会话与工具目录复用 Service Worker 统一持有的 session pool；
 * - 全局开关改由 `McpSettingsConfig.chatToolsEnabled` 控制。
 */
import { jsonSchema, tool, type ToolSet } from 'ai';
import type { McpTool } from '../../types/mcp';
import { appendMcpAudit, loadMcpServers, loadMcpSettingsConfig } from '../../lib/mcp/storage';
import { createId } from '../../lib/utils/id';
import type { ChatStreamParams } from '../../lib/ai/types';
import type { StreamChatProgressEvent } from '../../lib/ai/stream-chat-types';
import { buildFunctionCallToolName } from '../../lib/mcp/toolname';
import { MCP_SERVERS_STORAGE_KEY, MCP_SETTINGS_STORAGE_KEY } from '../../lib/mcp/constants';
import { logger } from '../../lib/logger';
import { getStorageAdapter } from '../../lib/storage/storage-adapter';
import { I18nError } from '../../lib/i18n/error';
import { createAutoMcpServerSelection, normalizeMcpServerIds, sanitizeMcpServerSelection } from '../../lib/mcp/selection';
import { callToolFromPool, listToolsFromPool, reconcileSessionPool } from './mcp-session-pool';
import { routeMcpServersForChat, type McpAutoRouterDecision } from './mcp-auto-router';
import { runWithChatPipelineHeartbeat } from './chat-pipeline-activity';

const serverNameById = new Map<string, string>();
let invalidated = true;
let lastSig = '';

/** 当前聊天请求的 MCP 工具执行保活事件回调。 */
type McpToolProgressEmitter = (event: Omit<StreamChatProgressEvent, 'requestId'>) => void;

/** 标记 MCP tool 配置缓存已失效。 */
function invalidate() {
  invalidated = true;
}

/**
 * 计算当前 MCP chat tools 配置签名。
 *
 * @param settings - MCP 全局设置快照。
 * @param servers - 当前持久化的 server 列表。
 * @returns 用于判定是否需要重建工具集的稳定签名。
 */
function configSignature(
  settings: { chatToolsEnabled: boolean },
  servers: Array<{
    id: string;
    enabled: boolean;
    type: string;
    url: string;
    headers: Record<string, string>;
    oauth: {
      enabled: boolean;
      registrationStrategy: string;
      scopes: string[];
      resource?: string;
      protectedResourceMetadataUrl?: string;
      authorizationServerMetadataUrl?: string;
      dynamicClientName?: string;
      preregClientId?: string;
      preregClientSecret?: string;
      tokenEndpointAuthMethod?: string;
    };
  }>,
) {
  const parts = [
    settings.chatToolsEnabled ? '1' : '0',
    servers
      .map((server) => JSON.stringify({
        id: server.id,
        enabled: server.enabled,
        type: server.type,
        url: String(server.url || '').trim(),
        headers: Object.entries(server.headers || {})
          .map(([key, value]) => [String(key || '').trim(), String(value ?? '')] as const)
          .filter(([key]) => Boolean(key))
          .sort(([a], [b]) => a.localeCompare(b)),
        oauth: {
          enabled: Boolean(server.oauth.enabled),
          registrationStrategy: server.oauth.registrationStrategy,
          scopes: [...(server.oauth.scopes || [])].map((scope) => String(scope || '').trim()).filter(Boolean).sort(),
          resource: String(server.oauth.resource || '').trim(),
          protectedResourceMetadataUrl: String(server.oauth.protectedResourceMetadataUrl || '').trim(),
          authorizationServerMetadataUrl: String(server.oauth.authorizationServerMetadataUrl || '').trim(),
          dynamicClientName: String(server.oauth.dynamicClientName || '').trim(),
          preregClientId: String(server.oauth.preregClientId || '').trim(),
          preregClientSecret: String(server.oauth.preregClientSecret || '').trim(),
          tokenEndpointAuthMethod: String(server.oauth.tokenEndpointAuthMethod || 'none').trim(),
        },
      }))
      .sort()
      .join(','),
  ];
  return parts.join('|');
}

/**
 * 读取并缓存当前启用中的 MCP servers。
 *
 * @returns 当前允许注入聊天的启用 server 列表。
 */
async function ensureEnabledServers() {
  const [settings, servers] = await Promise.all([
    loadMcpSettingsConfig().catch(() => null),
    loadMcpServers().catch(() => []),
  ]);

  if (!settings || !settings.chatToolsEnabled) {
    serverNameById.clear();
    lastSig = '';
    invalidated = false;
    await reconcileSessionPool().catch(() => {});
    return [] as typeof servers;
  }

  const sig = configSignature(settings, servers);
  if (!invalidated && sig === lastSig) {
    return servers.filter((server) => server.enabled);
  }
  lastSig = sig;
  invalidated = false;

  const enabledServers = servers.filter((server) => server.enabled);
  serverNameById.clear();
  for (const server of enabledServers) serverNameById.set(server.id, server.name);
  await reconcileSessionPool().catch(() => {});
  return enabledServers;
}

/**
 * 规整 MCP tool 的输入 schema。
 *
 * @param inputSchema - MCP `tools/list` 返回的原始 schema。
 * @returns 至少满足 JSON Schema object 形状的 schema。
 */
function normalizeSchema(inputSchema: unknown) {
  if (typeof inputSchema === 'object' && inputSchema !== null) return inputSchema as Record<string, unknown>;
  return { type: 'object', properties: {} } as Record<string, unknown>;
}

/** 当前请求最终允许注入的 MCP server 计算结果。 */
interface ResolvedChatMcpServers {
  /** 允许注入工具的 server 列表。 */
  servers: Awaited<ReturnType<typeof ensureEnabledServers>>;
  /** 自动路由结果；仅 auto 模式存在。 */
  routerDecision?: McpAutoRouterDecision;
}

/**
 * 根据当前 MCP 选择模型解析本轮允许注入的 server。
 *
 * 失败语义：auto 路由失败或无匹配时返回空列表，不会退回全量注入。
 */
async function resolveChatMcpServers(ctx: { requestId: string; params: ChatStreamParams; signal: AbortSignal }): Promise<ResolvedChatMcpServers> {
  const enabledServers = await ensureEnabledServers();
  if (enabledServers.length === 0) return { servers: [] };

  const selection = sanitizeMcpServerSelection(ctx.params.mcpSelection ?? createAutoMcpServerSelection(), 'auto');
  if (selection.mode === 'disabled') return { servers: [] };

  if (selection.mode === 'manual') {
    const manualServerSet = new Set(normalizeMcpServerIds(selection.manualServerIds));
    if (manualServerSet.size === 0) return { servers: [] };
    return { servers: enabledServers.filter((server) => manualServerSet.has(server.id)) };
  }

  const routerDecision = await routeMcpServersForChat({
    requestId: ctx.requestId,
    params: ctx.params,
    enabledServers,
    signal: ctx.signal,
  });
  if (!routerDecision.needsMcp || routerDecision.serverIds.length === 0) {
    return { servers: [], routerDecision };
  }

  const routedServerSet = new Set(routerDecision.serverIds);
  return {
    servers: enabledServers.filter((server) => routedServerSet.has(server.id)),
    routerDecision,
  };
}

/**
 * 为一次聊天请求收集可注入的 MCP ToolSet。
 *
 * @param ctx - 当前聊天请求上下文。
 * @returns 当前轮可用的 MCP ToolSet；无可用工具时返回 `undefined`。
 */
export async function collectMcpToolsForChat(ctx: {
  requestId: string;
  params: ChatStreamParams;
  signal: AbortSignal;
  emitProgress?: McpToolProgressEmitter;
}): Promise<ToolSet | undefined> {
  if (ctx.params.topicKind !== 'topic') return undefined;

  const resolved = await resolveChatMcpServers(ctx);
  if (resolved.routerDecision) {
    ctx.params.mcpAutoRouterState = {
      evaluated: true,
      needsMcp: resolved.routerDecision.needsMcp,
      serverIds: [...resolved.routerDecision.serverIds],
      selectedServerIds: resolved.servers.map((server) => server.id),
      injectedToolNames: [],
      intent: resolved.routerDecision.intent,
      reason: resolved.routerDecision.reason,
    };
  }
  if (resolved.routerDecision && ctx.params.debug) {
    logger.mcp.debug('MCP auto router decision', {
      requestId: ctx.requestId,
      needsMcp: resolved.routerDecision.needsMcp,
      selectedServerCount: resolved.routerDecision.serverIds.length,
      intent: resolved.routerDecision.intent,
      confidence: resolved.routerDecision.confidence,
      reason: resolved.routerDecision.reason,
    });
  }
  if (resolved.servers.length === 0) {
    if (resolved.routerDecision?.needsMcp) {
      throw new I18nError('errors.mcpAutoRouterNoEnabledServer');
    }
    return undefined;
  }

  const out: ToolSet = {};

  for (const server of resolved.servers) {
    const serverId = server.id;

    let tools: McpTool[];
    try {
      tools = (await runWithChatPipelineHeartbeat(
        ctx,
        'mcp-tool-listing',
        () => listToolsFromPool(serverId, { ttlMs: 60_000 }),
      )).tools;
    } catch (error) {
      if (resolved.routerDecision?.needsMcp) {
        logger.mcp.error('MCP auto router selected server but tool listing failed', error, { requestId: ctx.requestId, serverId });
        throw new I18nError('errors.mcpAutoRouterToolListFailed', { server: server.name || serverId });
      }
      continue;
    }

    for (const item of tools) {
      const toolName = String(item.name || '').trim();
      if (!toolName) continue;
      const serverName = serverNameById.get(serverId) || serverId;
      const key = buildFunctionCallToolName(serverName, toolName);
      if (key in out) continue;

      out[key] = tool({
        description: item.description || toolName,
        inputSchema: jsonSchema(normalizeSchema(item.inputSchema)),
        execute: async (args: unknown, options) => {
          const startedAt = Date.now();
          try {
            const callPromise = callToolFromPool(serverId, toolName, args);
            /** 把 SDK abortSignal 转成 MCP 工具执行 Promise 的中断竞争项。 */
            const abortPromise = new Promise<never>((_, reject) => {
              /** 把 UI 侧取消信号稳定映射成 DOMException 中断。 */
              const onAbort = () => reject(new DOMException('Tool call aborted', 'AbortError'));
              if (options.abortSignal?.aborted) {
                onAbort();
                return;
              }
              options.abortSignal?.addEventListener('abort', onAbort, { once: true });
            });
            const result = await runWithChatPipelineHeartbeat(
              ctx,
              'tool-execution',
              () => Promise.race([callPromise, abortPromise]),
            );
            abortPromise.catch(() => {});

            const ok = !result.isError;
            const durationMs = Date.now() - startedAt;
            const content = result.content ?? null;
            void appendMcpAudit({
              id: createId(),
              at: startedAt,
              serverId,
              tool: toolName,
              args,
              ok,
              durationMs,
              ...(ok ? { result: content } : { error: typeof content === 'string' ? content : JSON.stringify(content) }),
            }).catch((error) => logger.mcp.error('audit append failed', error, { serverId, tool: toolName }));

            if (result.isError) {
              const detail = (() => {
                try {
                  return typeof content === 'string' ? content : JSON.stringify(content ?? '');
                } catch {
                  return String(content ?? '');
                }
              })().trim();
              throw detail
                ? new I18nError('errors.toolExecutionFailedWithDetail', { detail })
                : new I18nError('errors.toolExecutionFailed');
            }

            return typeof content === 'string' ? content : JSON.stringify(content ?? '');
          } catch (error: unknown) {
            const durationMs = Date.now() - startedAt;
            const message = error instanceof Error ? error.message : String(error);
            void appendMcpAudit({
              id: createId(),
              at: startedAt,
              serverId,
              tool: toolName,
              args,
              ok: false,
              durationMs,
              error: message,
            }).catch((auditError) => logger.mcp.error('audit append failed (error path)', auditError, { serverId, tool: toolName }));
            throw error;
          }
        },
      });
    }
  }

  if (resolved.routerDecision?.needsMcp && Object.keys(out).length === 0) {
    throw new I18nError('errors.mcpAutoRouterNoTools');
  }

  if (resolved.routerDecision) {
    ctx.params.mcpAutoRouterState = {
      ...(ctx.params.mcpAutoRouterState ?? {
        evaluated: true,
        needsMcp: resolved.routerDecision.needsMcp,
        serverIds: [...resolved.routerDecision.serverIds],
        selectedServerIds: resolved.servers.map((server) => server.id),
      }),
      injectedToolNames: Object.keys(out),
    };
  }

  if (
    resolved.routerDecision?.needsMcp
    && !ctx.params.forcedFirstToolName
    && Object.keys(out).length > 0
  ) {
    ctx.params.forcedFirstToolName = Object.keys(out)[0];
    if (ctx.params.mcpAutoRouterState) {
      ctx.params.mcpAutoRouterState.forcedFirstToolName = ctx.params.forcedFirstToolName;
    }
    if (ctx.params.debug) {
      logger.mcp.debug('MCP auto router forced first tool', {
        requestId: ctx.requestId,
        toolName: ctx.params.forcedFirstToolName,
      });
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

try {
  getStorageAdapter().onChange((changes) => {
    if (changes[MCP_SETTINGS_STORAGE_KEY] || changes[MCP_SERVERS_STORAGE_KEY]) invalidate();
  });
} catch {
  // 忽略测试环境里的 storage 监听缺失。
}
