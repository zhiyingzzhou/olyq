/**
 * 说明：MCP Server 配置的 secret 拆分模块。
 *
 * 职责：
 * - 把 `olyq.mcp.servers.v1` 里的静态 headers 与 OAuth client secret 移入加密 secret 域；
 * - 让 server id/name/type/url/enabled/scopes 等元数据继续参与 structured cloud sync；
 * - 为 Data Contract Registry 和同步引擎提供拆分/合并同一入口。
 *
 * 边界：
 * - 本模块不读写 storage，不执行 MCP 网络请求；
 * - 当前浏览器扩展只支持 remote `streamable-http` MCP，不提供 stdio/bridge 兼容；
 * - 所有静态 headers 都按敏感处理，避免 Authorization 等凭据明文进入远端同步包。
 */
import type { McpServerConfig, McpStringMap } from '@/types/mcp';
import { normalizeStoredMcpServer } from '@/lib/mcp/config';
import { isRecord } from '@/lib/utils/type-guards';

/** 单个 MCP server 的敏感配置。 */
export interface McpServerSecretRecord {
  /** 静态请求头，整体按敏感字段处理。 */
  headers?: McpStringMap;
  /** OAuth 预注册 client secret。 */
  preregClientSecret?: string;
}

/** MCP server 明文配置与 secret 的拆分结果。 */
export interface McpServerSecretSplitResult {
  /** 可明文同步的 MCP server 元数据。 */
  publicServers: McpServerConfig[];
  /** 需要进入 secretVault 的敏感字段。 */
  secretsByServerId: Record<string, McpServerSecretRecord>;
}

/**
 * 规整 MCP server 列表。
 *
 * @param raw - 原始 server storage 值。
 * @returns 当前 v1 server 配置数组。
 */
function normalizeMcpServers(raw: unknown): McpServerConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (isRecord(item) ? normalizeStoredMcpServer(item) : null))
    .filter((server): server is McpServerConfig => Boolean(server));
}

/**
 * 判断静态 headers 是否包含至少一个有效 key。
 *
 * @param headers - MCP 静态请求头。
 * @returns 存在非空 header key 时返回 `true`。
 */
function hasHeaders(headers: McpStringMap): boolean {
  return Object.keys(headers).some((key) => key.trim());
}

/**
 * 规整可选 secret 字符串。
 *
 * @param value - 原始值。
 * @returns 非空字符串；非法或空白时返回 `undefined`。
 */
function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** 提取单个 MCP server 的敏感字段。 */
export function extractMcpServerSecret(server: McpServerConfig): McpServerSecretRecord {
  const secret: McpServerSecretRecord = {};
  if (hasHeaders(server.headers)) secret.headers = { ...server.headers };
  const preregClientSecret = pickString(server.oauth.preregClientSecret);
  if (preregClientSecret) secret.preregClientSecret = preregClientSecret;
  return secret;
}

/** 去掉单个 MCP server 的敏感字段，只保留可明文同步的元数据。 */
export function stripMcpServerSecret(server: McpServerConfig): McpServerConfig {
  return {
    ...server,
    headers: {},
    oauth: {
      ...server.oauth,
      preregClientSecret: undefined,
    },
  };
}

/** 将 `olyq.mcp.servers.v1` 拆成明文元数据与 secret 包。 */
export function splitMcpServerSecrets(raw: unknown): McpServerSecretSplitResult {
  const servers = normalizeMcpServers(raw);
  const publicServers: McpServerConfig[] = [];
  const secretsByServerId: Record<string, McpServerSecretRecord> = {};

  for (const server of servers) {
    publicServers.push(stripMcpServerSecret(server));
    const secret = extractMcpServerSecret(server);
    if (Object.keys(secret).length > 0) secretsByServerId[server.id] = secret;
  }

  return { publicServers, secretsByServerId };
}

/**
 * 把明文 MCP server 元数据与解密后的 secret 重新合并。
 *
 * @param rawServers - 明文 server 元数据。
 * @param rawSecrets - 解密后的 secret 包。
 * @returns 可写回 `olyq.mcp.servers.v1` 的完整 server 列表。
 */
export function mergeMcpServerSecrets(rawServers: unknown, rawSecrets: unknown): McpServerConfig[] {
  const servers = normalizeMcpServers(rawServers);
  const secrets = rawSecrets && typeof rawSecrets === 'object' && !Array.isArray(rawSecrets)
    ? rawSecrets as Record<string, McpServerSecretRecord>
    : {};

  return normalizeMcpServers(servers.map((server) => {
    const secret = secrets[server.id] ?? {};
    return {
      ...server,
      headers: secret.headers ? { ...secret.headers } : server.headers,
      oauth: {
        ...server.oauth,
        ...(pickString(secret.preregClientSecret) ? { preregClientSecret: secret.preregClientSecret } : {}),
      },
    };
  }));
}
