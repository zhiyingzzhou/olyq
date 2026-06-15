/**
 * 说明：`mcp-auto-router` 后台运行时模块。
 *
 * 职责：
 * - 在 MCP 自动模式下，用当前对话模型判断本轮是否需要 MCP；
 * - 只读取启用 server 的最小摘要，不列真实 tools，也不调用 MCP server；
 * - 所有失败、超时和低置信度结果都收敛为“不注入 MCP”，保证普通对话流畅。
 */
import { Output, generateText as aiGenerateText } from 'ai';
import { z } from 'zod';

import type { ChatStreamParams } from '../../lib/ai/types';
import type { McpServerConfig } from '../../types/mcp';
import { logger } from '../../lib/logger';
import {
  buildTextTaskCallPlan,
  toGenerateTextCallSettings,
  type TextTaskCallPlanDeps,
} from './text-task-call-plan';

/** MCP 自动路由可识别的意图类型。 */
export type McpAutoRouterIntent = 'none' | 'read' | 'write' | 'browser' | 'security' | 'unknown';

/** 传给 router 的 server 最小摘要，严禁包含 headers/OAuth/token。 */
export interface McpAutoRouterServerSummary {
  /** MCP server ID。 */
  id: string;
  /** 用户配置的 server 名称。 */
  name: string;
  /** Streamable HTTP URL，仅用于帮助模型理解服务来源。 */
  url: string;
}

/** MCP 自动路由结果。 */
export interface McpAutoRouterDecision {
  /** 本轮是否需要注入 MCP。 */
  needsMcp: boolean;
  /** 候选 server ID 列表，必须由调用方再与启用列表取交集。 */
  serverIds: string[];
  /** 模型对路由结果的置信度，范围 0..1。 */
  confidence: number;
  /** 本轮外部能力意图。 */
  intent: McpAutoRouterIntent;
  /** 简短原因，仅用于 debug，不向普通 UI 暴露。 */
  reason: string;
}

/** MCP 自动路由执行选项。 */
export interface RouteMcpServersForChatOptions {
  /** 当前聊天请求 ID。 */
  requestId: string;
  /** 当前聊天请求参数。 */
  params: ChatStreamParams;
  /** 当前启用的 MCP server 列表。 */
  enabledServers: McpServerConfig[];
  /** 外层取消信号。 */
  signal: AbortSignal;
  /** 可选超时，默认 1200ms。 */
  timeoutMs?: number;
  /** 测试注入：替换 AI SDK generateText。 */
  generateText?: typeof aiGenerateText;
  /** 测试注入：替换 stream context 解析。 */
  resolveContext?: TextTaskCallPlanDeps['resolveContext'];
  /** 测试注入：替换运行时计划构造。 */
  buildPlan?: TextTaskCallPlanDeps['buildPlan'];
}

const ROUTER_TIMEOUT_MS = 1_200;
const ROUTER_CONFIDENCE_FLOOR = 0.55;
const ROUTER_SCHEMA = z.object({
  needsMcp: z.boolean(),
  serverIds: z.array(z.string()).default([]),
  server: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.8),
  intent: z.enum(['none', 'read', 'write', 'browser', 'security', 'unknown']).default('unknown'),
  reason: z.string().default(''),
});

/** 构造“不注入 MCP”的稳定路由结果。 */
export function createNoMcpRouterDecision(reason = 'no-mcp-needed'): McpAutoRouterDecision {
  return {
    needsMcp: false,
    serverIds: [],
    confidence: 1,
    intent: 'none',
    reason,
  };
}

/** 把启用 server 收敛成可发给模型的最小摘要。 */
export function summarizeMcpServersForRouter(servers: McpServerConfig[]): McpAutoRouterServerSummary[] {
  return servers.map((server) => ({
    id: String(server.id || '').trim(),
    name: String(server.name || '').trim(),
    url: String(server.url || '').trim(),
  })).filter((server) => Boolean(server.id));
}

/** 只取最近几条文本消息，避免 router prompt 过长拖慢首字。 */
function summarizeRecentMessages(params: ChatStreamParams): string {
  const lines: string[] = [];
  for (const message of params.messages.slice(-6)) {
    const role = String(message.role || 'unknown');
    const content = (() => {
      if (typeof message.content === 'string') return message.content;
      try {
        return JSON.stringify(message.content);
      } catch {
        return String(message.content ?? '');
      }
    })().slice(0, 1200);
    lines.push(`${role}: ${content}`);
  }
  return lines.join('\n');
}

/** 根据 router 输出和启用 server 集合做最后安全归一化。 */
export function normalizeMcpRouterDecision(raw: unknown, enabledServerIds: Set<string>): McpAutoRouterDecision {
  const parsed = ROUTER_SCHEMA.safeParse(raw);
  if (!parsed.success) return createNoMcpRouterDecision('invalid-router-output');

  const rawServerIds = parsed.data.serverIds.length > 0
    ? parsed.data.serverIds
    : (parsed.data.server ? [parsed.data.server] : []);
  const serverIds = rawServerIds
    .map((id) => String(id || '').trim())
    .filter((id, index, all) => Boolean(id) && enabledServerIds.has(id) && all.indexOf(id) === index);

  if (!parsed.data.needsMcp) return createNoMcpRouterDecision(parsed.data.reason || 'router-said-no');
  if (parsed.data.confidence < ROUTER_CONFIDENCE_FLOOR) return createNoMcpRouterDecision('router-low-confidence');
  if (serverIds.length === 0) return createNoMcpRouterDecision('router-no-enabled-server-match');

  return {
    needsMcp: true,
    serverIds,
    confidence: parsed.data.confidence,
    intent: parsed.data.intent,
    reason: parsed.data.reason,
  };
}

/** 组合 router prompt，明确禁止它假设未配置 server 或请求真实工具目录。 */
function buildRouterPrompt(params: ChatStreamParams, serverSummaries: McpAutoRouterServerSummary[]): string {
  return [
    '你是 MCP 工具路由器，只输出符合 schema 的结构化结果。',
    '判断当前用户请求是否需要使用已启用的 MCP server。',
    '必须使用 serverIds 数组返回候选 server ID；不要只返回 server 字段。',
    '不要调用工具，不要请求工具列表，不要选择未列出的 server。',
    '普通寒暄、解释概念、写作、代码建议、总结用户已提供内容时 needsMcp=false。',
    '用户询问坐标、地址、路线、POI、地图搜索、位置查询时，如果已启用地图类 server，应 needsMcp=true。',
    '用户请求依赖外部系统当前状态，或要求读取/创建/更新外部系统资源时 needsMcp=true。',
    '如果确实没有匹配 server，或只是泛泛提到工具概念，选择 needsMcp=false。',
    '',
    `已启用 MCP servers:\n${JSON.stringify(serverSummaries)}`,
    '',
    `最近对话:\n${summarizeRecentMessages(params)}`,
  ].join('\n');
}

/** 带超时执行 Promise；超时和取消统一交给调用方安全降级。 */
function withTimeout<T>(promise: Promise<T>, signal: AbortSignal, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    /** 收束 Promise 生命周期并清理 timer / abort listener。 */
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      fn();
    };
    /** 把外层取消信号稳定映射成 router abort。 */
    const onAbort = () => finish(() => reject(new DOMException('MCP router aborted', 'AbortError')));
    const timer = setTimeout(() => finish(() => reject(new DOMException('MCP router timeout', 'TimeoutError'))), timeoutMs);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

/**
 * 在 MCP 自动模式下路由本轮候选 server。
 *
 * 失败语义：任何异常、超时、低置信度或无匹配 server 都返回 `needsMcp=false`，
 * 保证不会退回“全量注入全部 MCP”的旧行为。
 */
export async function routeMcpServersForChat(options: RouteMcpServersForChatOptions): Promise<McpAutoRouterDecision> {
  const startedAt = Date.now();
  const serverSummaries = summarizeMcpServersForRouter(options.enabledServers);
  if (serverSummaries.length === 0) return createNoMcpRouterDecision('no-enabled-servers');

  const enabledServerIds = new Set(serverSummaries.map((server) => server.id));
  const generateText = options.generateText ?? aiGenerateText;

  try {
    const decision = await withTimeout((async () => {
      const plan = await buildTextTaskCallPlan({
        ...options.params,
        temperature: 0,
        maxTokens: Math.min(options.params.maxTokens || 128, 128),
      }, {
        resolveContext: options.resolveContext,
        buildPlan: options.buildPlan,
      });
      const result = await generateText({
        model: plan.languageModel,
        prompt: buildRouterPrompt(options.params, serverSummaries),
        output: Output.object({ schema: ROUTER_SCHEMA }),
        ...toGenerateTextCallSettings(plan.callSettings),
        abortSignal: options.signal,
        ...(plan.providerOptions ? { providerOptions: plan.providerOptions } : {}),
      });
      return normalizeMcpRouterDecision(result.output, enabledServerIds);
    })(), options.signal, options.timeoutMs ?? ROUTER_TIMEOUT_MS);

    logger.mcp.debug('MCP auto router finished', {
      requestId: options.requestId,
      durationMs: Date.now() - startedAt,
      needsMcp: decision.needsMcp,
      selectedServerCount: decision.serverIds.length,
      intent: decision.intent,
      confidence: decision.confidence,
      reason: decision.reason,
    });
    return decision;
  } catch (error) {
    logger.mcp.warn('MCP auto router skipped MCP injection', {
      requestId: options.requestId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    return createNoMcpRouterDecision('router-failed');
  }
}
