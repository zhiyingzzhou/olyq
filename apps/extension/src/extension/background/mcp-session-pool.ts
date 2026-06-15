/**
 * 说明：`mcp-session-pool` 后台运行时模块。
 *
 * 职责：
 * - 由 Service Worker 统一持有 remote MCP session；
 * - 指纹只覆盖远程 URL、headers、OAuth 配置与授权态；
 * - 删除 bridge / stdio reconnect / browser sync 相关所有权。
 */
import { connectMcpServer, type CallToolResult, type McpClientSession, type McpConnectionMeta } from '../../lib/mcp/client';
import { clearMcpOAuthAuthorization, ensureMcpOAuthAccessToken } from '../../lib/mcp/oauth';
import { MCP_SERVERS_STORAGE_KEY } from '../../lib/mcp/constants';
import { loadMcpServers } from '../../lib/mcp/storage';
import { getStorageAdapter } from '../../lib/storage/storage-adapter';
import type { McpServerConfig, McpTool } from '../../types/mcp';

type SessionPoolEntry = {
  fingerprint: string;
  session: McpClientSession;
  meta: McpConnectionMeta;
  tools: McpTool[];
  toolsFetchedAt: number | null;
};

/** 暴露给 UI 的 MCP session pool 快照项。 */
export type SessionPoolSnapshotItem = {
  connected: boolean;
  meta?: McpConnectionMeta;
  tools: McpTool[];
};

const sessionPool = new Map<string, SessionPoolEntry>();
const pendingSessionLoads = new Map<string, Promise<SessionPoolEntry>>();
let storageWatcherInstalled = false;

/** 安装一次性 storage 监听，用于在 server 列表变化时收敛 session 池。 */
function ensurePoolStorageWatcher() {
  if (storageWatcherInstalled) return;
  storageWatcherInstalled = true;
  try {
    getStorageAdapter().onChange((changes) => {
      if (!changes[MCP_SERVERS_STORAGE_KEY]) return;
      void reconcileSessionPool();
    });
  } catch {
    // 测试环境允许缺少 storage 事件。
  }
}

/**
 * 计算一个 remote MCP server 的会话指纹。
 *
 * @param server - 当前 server 配置。
 * @returns 只覆盖 remote URL、headers 与 OAuth 配置的稳定指纹。
 */
function buildSessionFingerprint(server: McpServerConfig) {
  return JSON.stringify({
    server: {
      id: server.id,
      enabled: Boolean(server.enabled),
      type: server.type,
      url: String(server.url || '').trim(),
      headers: Object.entries(server.headers || {})
        .map(([key, value]) => [String(key || '').trim(), String(value ?? '')] as const)
        .filter(([key]) => Boolean(key))
        .sort(([a], [b]) => a.localeCompare(b)),
      oauth: {
        enabled: Boolean(server.oauth.enabled),
        registrationStrategy: server.oauth.registrationStrategy,
        scopes: [...server.oauth.scopes].sort(),
        resource: String(server.oauth.resource || '').trim(),
        protectedResourceMetadataUrl: String(server.oauth.protectedResourceMetadataUrl || '').trim(),
        authorizationServerMetadataUrl: String(server.oauth.authorizationServerMetadataUrl || '').trim(),
        dynamicClientName: String(server.oauth.dynamicClientName || '').trim(),
        preregClientId: String(server.oauth.preregClientId || '').trim(),
        preregClientSecret: String(server.oauth.preregClientSecret || '').trim(),
        tokenEndpointAuthMethod: server.oauth.tokenEndpointAuthMethod || 'none',
      },
    },
  });
}

/**
 * 从 server 列表里查找仍处于启用状态的目标 server。
 *
 * @param servers - 当前持久化 server 列表。
 * @param serverId - 目标 serverId。
 * @returns 启用中的 server；未命中时返回 `null`。
 */
function findEnabledServer(servers: McpServerConfig[], serverId: string) {
  return servers.find((server) => server.id === serverId && server.enabled) ?? null;
}

/**
 * 关闭并移除一个 session pool 条目。
 *
 * @param serverId - 目标 serverId。
 */
async function closePoolEntry(serverId: string) {
  const entry = sessionPool.get(serverId);
  if (!entry) return;
  try {
    entry.session.close();
  } catch {
    // 忽略关闭异常，确保池记录会被删除。
  }
  sessionPool.delete(serverId);
}

/**
 * 为指定 server 创建新的 session pool 条目。
 *
 * @param serverId - 目标 serverId。
 * @returns 新建或复用后的 pool 条目。
 */
async function createPoolEntry(serverId: string): Promise<SessionPoolEntry> {
  const servers = await loadMcpServers();
  const server = findEnabledServer(servers, serverId);
  if (!server) {
    throw new Error(`MCP server is missing or disabled: ${serverId}`);
  }

  if (server.oauth.enabled) {
    // 预热一次授权态，让指纹在同一次交互里尽量收敛到最新 token/client cache。
    await ensureMcpOAuthAccessToken(server, { allowInteractive: false }).catch(() => null);
  }

  const fingerprint = buildSessionFingerprint(server);
  const existing = sessionPool.get(serverId);
  if (existing && existing.fingerprint === fingerprint) {
    return existing;
  }
  if (existing) {
    await closePoolEntry(serverId);
  }

  const session = await connectMcpServer(server);
  const entry: SessionPoolEntry = {
    fingerprint,
    session,
    meta: session.meta,
    tools: [],
    toolsFetchedAt: null,
  };
  sessionPool.set(serverId, entry);
  return entry;
}

/**
 * 确保指定 server 在 session pool 中存在且指纹最新。
 *
 * @param serverId - 目标 serverId。
 * @returns 可直接使用的 pool 条目。
 */
async function ensurePoolEntry(serverId: string): Promise<SessionPoolEntry> {
  ensurePoolStorageWatcher();
  const existing = sessionPool.get(serverId);
  if (existing) {
    const servers = await loadMcpServers();
    const server = findEnabledServer(servers, serverId);
    if (!server) {
      await closePoolEntry(serverId);
      throw new Error(`MCP server is missing or disabled: ${serverId}`);
    }
    if (existing.fingerprint === buildSessionFingerprint(server)) {
      return existing;
    }
    await closePoolEntry(serverId);
  }

  const pending = pendingSessionLoads.get(serverId);
  if (pending) return pending;

  const task = createPoolEntry(serverId).finally(() => {
    if (pendingSessionLoads.get(serverId) === task) {
      pendingSessionLoads.delete(serverId);
    }
  });
  pendingSessionLoads.set(serverId, task);
  return task;
}

/**
 * 主动断开指定 server 的共享会话。
 *
 * @param serverId - 目标 serverId。
 */
export async function disconnectSessionFromPool(serverId: string) {
  ensurePoolStorageWatcher();
  await closePoolEntry(serverId);
}

/**
 * 清理指定 server 的 OAuth 授权缓存，并断开当前共享会话。
 *
 * @param serverId - 目标 serverId。
 */
export async function clearServerAuthorizationFromPool(serverId: string) {
  ensurePoolStorageWatcher();
  const servers = await loadMcpServers();
  const server = servers.find((item) => item.id === serverId) ?? null;
  if (!server) return;
  await clearMcpOAuthAuthorization(server);
  await closePoolEntry(serverId);
}

/**
 * 触发指定 server 的交互式 OAuth 授权。
 *
 * @param serverId - 目标 serverId。
 */
export async function authorizeServerFromPool(serverId: string) {
  ensurePoolStorageWatcher();
  const servers = await loadMcpServers();
  const server = servers.find((item) => item.id === serverId) ?? null;
  if (!server) {
    throw new Error(`MCP server is missing: ${serverId}`);
  }
  if (!server.oauth.enabled) {
    throw new Error('当前 MCP server 未启用 OAuth');
  }
  await ensureMcpOAuthAccessToken(server, { allowInteractive: true, forceRefresh: true });
  await closePoolEntry(serverId);
}

/**
 * 读取指定 server 的工具列表，并按 TTL 复用缓存。
 *
 * @param serverId - 目标 serverId。
 * @param options - 刷新策略与 TTL。
 * @returns 最新的连接元信息与工具列表。
 */
export async function listToolsFromPool(
  serverId: string,
  options?: {
    forceRefresh?: boolean;
    ttlMs?: number;
  },
): Promise<{ meta: McpConnectionMeta; tools: McpTool[] }> {
  const entry = await ensurePoolEntry(serverId);
  const ttlMs = typeof options?.ttlMs === 'number' && Number.isFinite(options.ttlMs)
    ? Math.max(0, Math.floor(options.ttlMs))
    : 60_000;
  const now = Date.now();
  const canReuseCache = !options?.forceRefresh
    && entry.toolsFetchedAt !== null
    && now - entry.toolsFetchedAt < ttlMs;

  if (!canReuseCache) {
    const tools = await entry.session.listTools();
    entry.tools = tools;
    entry.toolsFetchedAt = now;
    entry.meta = entry.session.meta;
  }

  return { meta: entry.meta, tools: [...entry.tools] };
}

/**
 * 通过共享 session 调用一次 MCP 工具。
 *
 * @param serverId - 目标 serverId。
 * @param toolName - 工具名。
 * @param args - 工具入参。
 * @returns MCP 工具调用结果。
 */
export async function callToolFromPool(
  serverId: string,
  toolName: string,
  args: unknown,
): Promise<CallToolResult> {
  const entry = await ensurePoolEntry(serverId);
  entry.meta = entry.session.meta;
  return await entry.session.callTool(toolName, args);
}

/**
 * 读取当前 MCP session pool 的共享快照。
 *
 * @returns 以 `serverId` 为键的连接快照。
 */
export async function getSessionPoolSnapshot(): Promise<Record<string, SessionPoolSnapshotItem>> {
  ensurePoolStorageWatcher();
  await reconcileSessionPool();

  const snapshot: Record<string, SessionPoolSnapshotItem> = {};
  for (const [serverId, entry] of sessionPool) {
    snapshot[serverId] = {
      connected: true,
      meta: entry.meta,
      tools: [...entry.tools],
    };
  }
  return snapshot;
}

/**
 * 根据持久化 server 列表收敛现有 session pool。
 *
 * @returns 清理完成后正常结束。
 */
export async function reconcileSessionPool() {
  ensurePoolStorageWatcher();
  const servers = await loadMcpServers();
  const enabledServers = new Map(
    servers
      .filter((server) => server.enabled)
      .map((server) => [server.id, server] as const),
  );

  for (const [serverId, entry] of [...sessionPool.entries()]) {
    const server = enabledServers.get(serverId);
    if (!server) {
      await closePoolEntry(serverId);
      continue;
    }

    const nextFingerprint = buildSessionFingerprint(server);
    if (entry.fingerprint !== nextFingerprint) {
      await closePoolEntry(serverId);
    }
  }
}
