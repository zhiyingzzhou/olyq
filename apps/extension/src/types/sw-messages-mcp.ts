/**
 * 说明：`sw-messages-mcp` 类型定义模块。
 *
 * 职责：
 * - 承载 Service Worker one-shot MCP 消息契约；
 * - 收口 remote-only MCP 的连接、列工具、调工具与 OAuth 授权消息；
 * - 把 MCP 消息真相从总消息文件里拆开，避免类型文件继续膨胀。
 */

/** UI 读取 SW 统一 MCP session 池的当前共享状态。 */
export interface SwMsg_McpServersStatusGet {
  /** 消息类型：读取 SW 侧 MCP 共享连接池状态。 */
  type: 'mcp/servers/status/get';
}

/** UI 请求 SW 为指定 MCP server 建立或复用共享连接。 */
export interface SwMsg_McpServerConnect {
  /** 消息类型：请求连接指定 MCP server。 */
  type: 'mcp/server/connect';
  /** 连接请求参数。 */
  payload: {
    /** 目标 serverId；SW 会在自身上下文里读取最新存储并连接。 */
    serverId: string;
  };
}

/** UI 请求 SW 主动断开指定 MCP server 的共享连接。 */
export interface SwMsg_McpServerDisconnect {
  /** 消息类型：请求断开指定 MCP server。 */
  type: 'mcp/server/disconnect';
  /** 断开请求参数。 */
  payload: {
    /** 要断开的 serverId。 */
    serverId: string;
  };
}

/** UI 请求 SW 返回指定 MCP server 的工具列表。 */
export interface SwMsg_McpServerTools {
  /** 消息类型：获取指定 MCP server 的工具目录。 */
  type: 'mcp/server/tools';
  /** 读取工具列表时的请求参数。 */
  payload: {
    /** 目标 serverId。 */
    serverId: string;
    /** 是否忽略 SW 本地工具缓存并强制重新请求 `tools/list`。 */
    forceRefresh?: boolean;
  };
}

/** UI 请求 SW 通过共享 MCP session 执行一次工具调用。 */
export interface SwMsg_McpToolCall {
  /** 消息类型：通过 SW 共享 session 调用 MCP 工具。 */
  type: 'mcp/tool/call';
  /** MCP 工具调用请求负载。 */
  payload: {
    /** 目标 serverId。 */
    serverId: string;
    /** 要调用的工具名。 */
    toolName: string;
    /** 原样传给 MCP `tools/call` 的 arguments。 */
    args: unknown;
  };
}

/** UI 请求 SW 显式触发一次 MCP OAuth 授权。 */
export interface SwMsg_McpServerOAuthAuthorize {
  /** 消息类型：为指定 MCP server 执行 OAuth 授权。 */
  type: 'mcp/server/oauth/authorize';
  /** 授权请求参数。 */
  payload: {
    /** 目标 serverId。 */
    serverId: string;
  };
}

/** UI 请求 SW 清理指定 MCP server 的 OAuth 授权缓存。 */
export interface SwMsg_McpServerOAuthClear {
  /** 消息类型：清理指定 MCP server 的 OAuth 授权缓存。 */
  type: 'mcp/server/oauth/clear';
  /** 清理请求参数。 */
  payload: {
    /** 目标 serverId。 */
    serverId: string;
  };
}

/** 所有 MCP one-shot 入站消息联合类型。 */
export type SwMcpInboundMessage =
  | SwMsg_McpServersStatusGet
  | SwMsg_McpServerConnect
  | SwMsg_McpServerDisconnect
  | SwMsg_McpServerTools
  | SwMsg_McpToolCall
  | SwMsg_McpServerOAuthAuthorize
  | SwMsg_McpServerOAuthClear;
