/**
 * 说明：`config` 基础能力模块。
 *
 * 职责：
 * - 承载 remote-only MCP server schema 的解析、规整与共享导入导出；
 * - 明确当前浏览器扩展只接受显式 `Streamable HTTP`，不再接受 `stdio` / bridge 字段；
 * - 为 UI、存储和共享 JSON 提供同一套标准化入口。
 *
 * 边界：
 * - 本文件只处理结构规整，不直接访问存储或浏览器 API；
 * - OAuth metadata 发现与安全校验由运行时模块负责。
 */
import { I18nError } from '@/lib/i18n/error';
import { isPlainRecord } from '@/lib/utils/type-guards';
import type {
  McpOAuthConfig,
  McpOAuthRegistrationStrategy,
  McpOAuthTokenEndpointAuthMethod,
  McpServerConfig,
  McpServerDraftConfig,
  McpServerType,
  McpStringMap,
} from '@/types/mcp';

type RawMcpServerRecord = Record<string, unknown>;

/** 当前 transport 是否属于远程 HTTP MCP。 */
export function isHttpMcpServerType(type: McpServerType): boolean {
  return type === 'streamable-http';
}

/** 默认 OAuth 配置。 */
export function getDefaultMcpOAuthConfig(): McpOAuthConfig {
  return {
    enabled: false,
    registrationStrategy: 'dynamic',
    scopes: [],
    tokenEndpointAuthMethod: 'none',
  };
}

/** 返回 UI 新建 MCP 服务时使用的严格默认草稿。 */
export function getDefaultMcpServerDraft(): McpServerDraftConfig {
  return {
    name: '',
    type: 'streamable-http',
    url: '',
    headers: {},
    oauth: getDefaultMcpOAuthConfig(),
  };
}

/**
 * 规整一个可选字符串字段。
 *
 * @param value - 原始输入。
 * @returns 去空白后的非空字符串；否则返回 `undefined`。
 */
function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * 把弱类型对象规整成字符串字典。
 *
 * @param value - 原始输入。
 * @param fieldName - 出错时用于提示的字段名。
 * @returns 规整后的字符串字典。
 */
function normalizeStringMap(value: unknown, fieldName: string): McpStringMap {
  if (value == null) return {};
  if (!isPlainRecord(value)) throw new I18nError('errors.mcpConfigStringMapRequired', { field: fieldName });

  const out: McpStringMap = {};
  for (const [key, rawVal] of Object.entries(value)) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) continue;
    out[normalizedKey] = String(rawVal ?? '');
  }
  return out;
}

/**
 * 规整 OAuth scope 列表。
 *
 * @param value - 原始输入。
 * @returns 去空白、去空项后的 scope 列表。
 */
function normalizeScopes(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new I18nError('errors.mcpConfigArgsArrayRequired');
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

/**
 * 规整 token endpoint 鉴权方式。
 *
 * @param value - 原始输入。
 * @returns 当前支持的鉴权方式。
 */
function normalizeTokenEndpointAuthMethod(value: unknown): McpOAuthTokenEndpointAuthMethod {
  const normalized = trimOptionalString(value);
  if (!normalized || normalized === 'none') return 'none';
  if (normalized === 'client_secret_post') return 'client_secret_post';
  throw new I18nError('errors.mcpConfigTypeUnsupported', { type: normalized });
}

/**
 * 规整 OAuth registration strategy。
 *
 * @param value - 原始输入。
 * @returns 当前支持的注册策略。
 */
function normalizeRegistrationStrategy(value: unknown): McpOAuthRegistrationStrategy {
  const normalized = trimOptionalString(value);
  if (!normalized || normalized === 'dynamic') return 'dynamic';
  if (normalized === 'preregistered') return 'preregistered';
  throw new I18nError('errors.mcpConfigTypeUnsupported', { type: normalized });
}

/**
 * 把弱类型 OAuth 配置规整成扩展内部标准结构。
 *
 * @param value - 原始输入。
 * @returns 规整后的 OAuth 配置。
 */
function normalizeMcpOAuthConfig(value: unknown): McpOAuthConfig {
  if (value == null) return getDefaultMcpOAuthConfig();
  if (!isPlainRecord(value)) throw new I18nError('errors.mcpConfigServerObjectRequired');

  const enabled = typeof value.enabled === 'boolean' ? value.enabled : false;
  const registrationStrategy = normalizeRegistrationStrategy(value.registrationStrategy);
  const scopes = normalizeScopes(value.scopes);
  const resource = trimOptionalString(value.resource);
  const protectedResourceMetadataUrl = trimOptionalString(value.protectedResourceMetadataUrl);
  const authorizationServerMetadataUrl = trimOptionalString(value.authorizationServerMetadataUrl);
  const dynamicClientName = trimOptionalString(value.dynamicClientName);
  const preregClientId = trimOptionalString(value.preregClientId);
  const preregClientSecret = trimOptionalString(value.preregClientSecret);
  const tokenEndpointAuthMethod = normalizeTokenEndpointAuthMethod(value.tokenEndpointAuthMethod);

  if (enabled && registrationStrategy === 'preregistered' && !preregClientId) {
    throw new I18nError('errors.mcpConfigNameRequired');
  }

  return {
    enabled,
    registrationStrategy,
    scopes,
    ...(resource ? { resource } : {}),
    ...(protectedResourceMetadataUrl ? { protectedResourceMetadataUrl } : {}),
    ...(authorizationServerMetadataUrl ? { authorizationServerMetadataUrl } : {}),
    ...(dynamicClientName ? { dynamicClientName } : {}),
    ...(preregClientId ? { preregClientId } : {}),
    ...(preregClientSecret ? { preregClientSecret } : {}),
    tokenEndpointAuthMethod,
  };
}

/**
 * 判断输入里是否显式声明了本地 stdio MCP 字段。
 *
 * @param raw - 当前待规整的弱类型对象。
 * @returns 命中 stdio/本地进程字段时返回 `true`。
 */
function hasExplicitStdioFields(raw: RawMcpServerRecord): boolean {
  return ['command', 'args', 'cwd', 'env', 'stdio'].some((field) => field in raw);
}

/**
 * 在 strict/loose 解析前统一拦截当前产品不接受的旧字段。
 *
 * @param raw - 当前待规整的弱类型对象。
 */
function assertRemoteOnlyFieldSet(raw: RawMcpServerRecord) {
  if (hasExplicitStdioFields(raw)) {
    throw new I18nError('errors.mcpConfigStdioUnsupported');
  }
  if ('transport' in raw && trimOptionalString(raw.transport)) {
    throw new I18nError('errors.mcpConfigTypeMustBeStreamableHttp');
  }
}

/** 严格解析 MCP 服务类型。 */
export function normalizeMcpServerType(rawType: unknown): McpServerType {
  const normalized = trimOptionalString(rawType);
  if (!normalized) throw new I18nError('errors.mcpConfigTypeRequired');
  if (normalized === 'streamable-http') return 'streamable-http';
  if (normalized === 'stdio') throw new I18nError('errors.mcpConfigStdioUnsupported');
  throw new I18nError('errors.mcpConfigTypeMustBeStreamableHttp');
}

/** 严格规整单个 MCP 服务草稿。 */
export function normalizeMcpServerDraft(input: unknown, aliasName?: string): McpServerDraftConfig {
  if (!isPlainRecord(input)) throw new I18nError('errors.mcpConfigServerObjectRequired');

  const raw = input as RawMcpServerRecord;
  assertRemoteOnlyFieldSet(raw);
  const name = trimOptionalString(raw.name) || trimOptionalString(aliasName);
  if (!name) throw new I18nError('errors.mcpConfigNameRequired');

  const type = normalizeMcpServerType(raw.type);
  const url = trimOptionalString(raw.url);
  if (!url) throw new I18nError('errors.mcpStreamableHttpUrlMissing');

  return {
    name,
    type,
    url,
    headers: normalizeStringMap(raw.headers, 'headers'),
    oauth: normalizeMcpOAuthConfig(raw.oauth),
  };
}

/** 规整共享/导入的 MCP 服务草稿。 */
export function normalizeSharedMcpServerDraft(input: unknown, aliasName?: string): McpServerDraftConfig {
  return normalizeMcpServerDraft(input, aliasName);
}

/**
 * 以宽松模式规整当前弹窗里的远程 MCP 草稿。
 *
 * 说明：
 * - 只用于当前弹窗从 JSON 回填到表单；
 * - 允许 `type` / `url` 临时缺失，便于用户继续在表单里补完；
 * - 不作为旧 schema 兼容层。
 */
export function normalizeLooseMcpServerDraft(input: unknown, aliasName?: string): McpServerDraftConfig {
  if (!isPlainRecord(input)) throw new I18nError('errors.mcpConfigServerObjectRequired');

  const raw = input as RawMcpServerRecord;
  assertRemoteOnlyFieldSet(raw);
  const name = trimOptionalString(raw.name) || trimOptionalString(aliasName) || 'server';
  const rawType = trimOptionalString(raw.type);
  const type = rawType ? normalizeMcpServerType(rawType) : 'streamable-http';
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';

  return {
    name,
    type,
    url,
    headers: normalizeStringMap(raw.headers, 'headers'),
    oauth: normalizeMcpOAuthConfig(raw.oauth),
  };
}

/** 把存储层的弱类型对象归一化为内部 `McpServerConfig`。 */
export function normalizeStoredMcpServer(input: unknown): McpServerConfig | null {
  if (!isPlainRecord(input)) return null;
  const raw = input as RawMcpServerRecord;
  const id = trimOptionalString(raw.id);
  if (!id) return null;

  try {
    const draft = normalizeMcpServerDraft(raw);
    return {
      id,
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
      ...draft,
    };
  } catch {
    return null;
  }
}

/** 解析标准 `mcpServers` 共享配置对象。 */
export function parseMcpServersConfig(input: unknown): Array<{ alias: string; server: McpServerDraftConfig }> {
  if (!isPlainRecord(input)) throw new I18nError('errors.mcpConfigRootObjectRequired');
  const servers = input.mcpServers;
  if (!isPlainRecord(servers)) throw new I18nError('errors.mcpConfigServersRequired');

  const entries = Object.entries(servers);
  if (entries.length === 0) throw new I18nError('errors.mcpConfigSingleServerRequired');

  return entries.map(([alias, value]) => ({ alias, server: normalizeSharedMcpServerDraft(value, alias) }));
}

/** 解析只包含一个服务的共享配置。 */
export function parseSingleMcpServerConfig(input: unknown): { alias: string; server: McpServerDraftConfig } {
  const entries = parseMcpServersConfig(input);
  if (entries.length !== 1) throw new I18nError('errors.mcpConfigSingleServerRequired');
  return entries[0]!;
}

/** 解析只包含一个服务的宽松草稿配置。 */
export function parseSingleLooseMcpServerDraft(input: unknown): { alias: string; server: McpServerDraftConfig } {
  if (!isPlainRecord(input)) throw new I18nError('errors.mcpConfigRootObjectRequired');
  const servers = input.mcpServers;
  if (!isPlainRecord(servers)) throw new I18nError('errors.mcpConfigServersRequired');

  const entries = Object.entries(servers);
  if (entries.length !== 1) throw new I18nError('errors.mcpConfigSingleServerRequired');

  const [alias, value] = entries[0]!;
  return {
    alias,
    server: normalizeLooseMcpServerDraft(value, alias),
  };
}

/** 从 JSON 字符串解析单个 MCP 服务配置。 */
export function parseSingleMcpServerConfigJson(raw: string): { alias: string; server: McpServerDraftConfig } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new I18nError('errors.jsonParseFailedWithDetail', {
      detail,
      hint: raw.slice(0, 80) || '{}',
    });
  }

  return parseSingleMcpServerConfig(parsed);
}

/** 从 JSON 字符串解析单个宽松 MCP 服务草稿。 */
export function parseSingleLooseMcpServerDraftJson(raw: string): { alias: string; server: McpServerDraftConfig } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new I18nError('errors.jsonParseFailedWithDetail', {
      detail,
      hint: raw.slice(0, 80) || '{}',
    });
  }

  return parseSingleLooseMcpServerDraft(parsed);
}

/**
 * 把 OAuth 配置序列化成共享 JSON 结构。
 *
 * @param oauth - 当前 OAuth 配置。
 * @returns 可写入共享 JSON 的对象；禁用时返回 `undefined`。
 */
function toSerializableOauth(oauth: McpOAuthConfig): Record<string, unknown> | undefined {
  if (!oauth.enabled) return undefined;
  return {
    enabled: true,
    registrationStrategy: oauth.registrationStrategy,
    ...(oauth.scopes.length > 0 ? { scopes: oauth.scopes } : {}),
    ...(oauth.resource ? { resource: oauth.resource } : {}),
    ...(oauth.protectedResourceMetadataUrl ? { protectedResourceMetadataUrl: oauth.protectedResourceMetadataUrl } : {}),
    ...(oauth.authorizationServerMetadataUrl ? { authorizationServerMetadataUrl: oauth.authorizationServerMetadataUrl } : {}),
    ...(oauth.dynamicClientName ? { dynamicClientName: oauth.dynamicClientName } : {}),
    ...(oauth.preregClientId ? { preregClientId: oauth.preregClientId } : {}),
    ...(oauth.preregClientSecret ? { preregClientSecret: oauth.preregClientSecret } : {}),
    ...(oauth.tokenEndpointAuthMethod ? { tokenEndpointAuthMethod: oauth.tokenEndpointAuthMethod } : {}),
  };
}

/**
 * 把单个 MCP server 导出成共享 JSON 结构。
 *
 * @param server - 草稿或已保存的 server 配置。
 * @returns 可写入 `mcpServers` 的对象。
 */
function toSerializableServer(server: McpServerDraftConfig | McpServerConfig): Record<string, unknown> {
  return {
    type: server.type,
    url: server.url,
    ...(Object.keys(server.headers).length > 0 ? { headers: server.headers } : {}),
    ...(toSerializableOauth(server.oauth) ? { oauth: toSerializableOauth(server.oauth) } : {}),
  };
}

/** 把单个服务导出为 `mcpServers` JSON 字符串。 */
export function stringifySingleMcpServerConfig(server: McpServerDraftConfig | McpServerConfig, alias?: string): string {
  const key = String(alias || server.name || 'server').trim() || 'server';
  return JSON.stringify(
    {
      mcpServers: {
        [key]: toSerializableServer(server),
      },
    },
    null,
    2,
  );
}
