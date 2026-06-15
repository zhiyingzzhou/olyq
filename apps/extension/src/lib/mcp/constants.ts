/**
 * 说明：`constants` 基础能力模块。
 *
 * 职责：
 * - 承载 remote-only MCP 相关存储键常量；
 * - 删除 bridge 时代的存储命名，避免残留第二真源。
 */

/** MCP 全局设置在存储层中的键名。 */
export const MCP_SETTINGS_STORAGE_KEY = 'olyq.mcp.settings.v1';
/** MCP Servers 列表在存储层中的键名。 */
export const MCP_SERVERS_STORAGE_KEY = 'olyq.mcp.servers.v1';
/** MCP 工具调用审计日志在存储层中的键名。 */
export const MCP_AUDIT_STORAGE_KEY = 'olyq.mcp.audit.v1';
/** MCP OAuth 缓存表在存储层中的键名。 */
export const MCP_OAUTH_CACHE_STORAGE_KEY = 'olyq.mcp.oauth-cache.v1';
