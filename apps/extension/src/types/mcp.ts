/**
 * 说明：`mcp` 类型定义模块。
 *
 * 职责：
 * - 承载浏览器扩展内 remote-only MCP 的类型真源；
 * - 对外暴露 `McpServerType`、`McpOAuthConfig`、`McpSettingsConfig`、`McpServerConfig` 等公开能力；
 * - 明确本轮只支持 `Streamable HTTP + headers + OAuth`，不再保留 bridge / stdio 双轨。
 *
 * 边界：
 * - 本文件只描述当前 schema 与跨模块共享类型；
 * - 不在这里实现 transport、OAuth 或存储逻辑。
 */

/** 当前浏览器扩展唯一允许的 MCP 连接类型。 */
export type McpServerType = 'streamable-http';

/** 结构化字符串字典。 */
export type McpStringMap = Record<string, string>;

/** OAuth registration strategy。 */
export type McpOAuthRegistrationStrategy = 'dynamic' | 'preregistered';

/** token endpoint auth method。 */
export type McpOAuthTokenEndpointAuthMethod = 'none' | 'client_secret_post';

/**
 * 单个 MCP server 的 OAuth 配置。
 *
 * 说明：
 * - `enabled=false` 时只使用静态 headers；
 * - `dynamic` 优先走 DCR；如果用户同时补了 prereg client，则 DCR 不可用时允许回退；
 * - metadata override 只接受安全 URL，真正校验由 OAuth 运行时负责。
 */
export type McpOAuthConfig = {
  /** 是否启用 OAuth。 */
  enabled: boolean;
  /** 注册策略：默认优先动态注册。 */
  registrationStrategy: McpOAuthRegistrationStrategy;
  /** 显式申请的 scope 列表。 */
  scopes: string[];
  /** 可选：显式覆盖 resource 参数。 */
  resource?: string;
  /** 可选：受保护资源 metadata URL override。 */
  protectedResourceMetadataUrl?: string;
  /** 可选：授权服务器 metadata URL override。 */
  authorizationServerMetadataUrl?: string;
  /** DCR 时上报的 client name。 */
  dynamicClientName?: string;
  /** 预注册 client_id；DCR 不可用时可作为回退。 */
  preregClientId?: string;
  /** 预注册 client_secret；仅在服务端要求时使用。 */
  preregClientSecret?: string;
  /** token endpoint 鉴权方式。 */
  tokenEndpointAuthMethod?: McpOAuthTokenEndpointAuthMethod;
};

/** MCP 全局设置。 */
export type McpSettingsConfig = {
  /** 是否将 MCP tools 注入聊天。 */
  chatToolsEnabled: boolean;
};

/** 单个 MCP Server 的用户草稿配置。 */
export type McpServerDraftConfig = {
  /** Server 名称。 */
  name: string;
  /** 当前唯一允许的 transport。 */
  type: McpServerType;
  /** Streamable HTTP 服务地址。 */
  url: string;
  /** 静态请求头。 */
  headers: McpStringMap;
  /** OAuth 配置。 */
  oauth: McpOAuthConfig;
};

/** 单个 MCP Server 的持久化配置。 */
export type McpServerConfig = McpServerDraftConfig & {
  /** Server ID。 */
  id: string;
  /** 是否启用该 Server。 */
  enabled: boolean;
};

/** OAuth 授权服务器 metadata。 */
export type McpAuthorizationServerMetadata = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  revocationEndpoint?: string;
  scopesSupported?: string[];
};

/** 受保护资源 metadata。 */
export type McpProtectedResourceMetadata = {
  resource?: string;
  authorizationServers?: string[];
  scopesSupported?: string[];
};

/** 动态或预注册后得到的 client identity。 */
export type McpOAuthClientIdentity = {
  clientId: string;
  clientSecret?: string;
  tokenEndpointAuthMethod: McpOAuthTokenEndpointAuthMethod;
  registrationStrategy: McpOAuthRegistrationStrategy;
};

/** MCP OAuth 缓存条目。 */
export type McpOAuthCacheEntry = {
  serverOrigin: string;
  clientNamespace: string;
  client: McpOAuthClientIdentity;
  protectedResourceMetadataUrl?: string;
  authorizationServerMetadataUrl?: string;
  metadata: McpAuthorizationServerMetadata;
  resource?: string;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
};

/** OAuth 缓存表。 */
export type McpOAuthCacheStore = Record<string, McpOAuthCacheEntry>;

/** MCP tools/list 返回的工具元信息。 */
export type McpTool = {
  /** 工具名（唯一标识）。 */
  name: string;
  /** 可选：工具描述。 */
  description?: string;
  /** JSON Schema 输入结构。 */
  inputSchema?: unknown;
};

/** MCP 工具调用审计记录。 */
export type McpAuditRecord = {
  /** 记录 ID。 */
  id: string;
  /** 发生时间（毫秒时间戳）。 */
  at: number;
  /** Server ID。 */
  serverId: string;
  /** 工具名。 */
  tool: string;
  /** 入参。 */
  args: unknown;
  /** 是否成功。 */
  ok: boolean;
  /** 耗时（毫秒）。 */
  durationMs: number;
  /** 成功结果。 */
  result?: unknown;
  /** 失败错误。 */
  error?: string;
};
