/**
 * 说明：`background-client` 基础能力模块。
 *
 * 职责：
 * - 承载 `background-client` 相关的当前文件实现与模块边界；
 * - 对外暴露 `McpSharedServerState`、`getSharedMcpServerStates`、`connectSharedMcpServer` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { CallToolResult, McpConnectionMeta } from '@/lib/mcp/client';
import type { McpTool } from '@/types/mcp';
import type { I18nText } from '@/types/i18n';
import { sendExtensionMessage } from '@/lib/extension/runtime-api';
import type { SwMcpInboundMessage } from '@/types/sw-messages-mcp';

/**
 * UI -\> Service Worker 的 MCP 代理客户端。
 *
 * 约束：
 * - UI 页面不再直接创建 MCP transport；
 * - 所有真实连接都由 SW 的 session pool 持有；
 * - UI 只通过一次性消息请求“连接 / 断开 / 列工具 / 调工具 / 读取共享状态”。
 */

/** Service Worker 返回的成功响应。 */
type SwOkResponse<T> = {
  /** 标记本次消息执行成功。 */
  ok: true;
} & ([T] extends [void] ? { payload?: T } : { payload: T });

/** Service Worker 返回的失败响应。 */
type SwErrorResponse = {
  /** 标记本次消息执行失败。 */
  ok: false;
  /** 可选：国际化错误信息。 */
  error?: I18nText;
};

/** UI \<- Service Worker 的标准响应联合。 */
type SwResponse<T> = SwOkResponse<T> | SwErrorResponse;

/**
 * UI 侧可读取到的 MCP 共享服务状态。
 *
 * 说明：
 * - 该状态来自 Service Worker 维护的共享 session pool 快照；
 * - 用于设置页展示连接状态、服务端元信息与最近工具目录缓存。
 */
export type McpSharedServerState = {
  /** 当前 server 是否已经被 SW session pool 持有。 */
  connected: boolean;
  /** 最近一次成功握手的服务端元信息。 */
  meta?: McpConnectionMeta;
  /** 最近一次缓存的工具列表。 */
  tools: McpTool[];
};

/** 请求 SW 建立共享 MCP 连接时的 payload。 */
type McpConnectPayload = {
  /** 目标 serverId；SW 会据此读取存储中的真实配置。 */
  serverId: string;
};

/** 请求 SW 返回 MCP 工具列表时的 payload。 */
type McpToolsPayload = {
  /** 目标 serverId。 */
  serverId: string;
  /** 是否强制刷新 `tools/list`，忽略本地缓存。 */
  forceRefresh?: boolean;
};

/** 请求 SW 调用 MCP 工具时的 payload。 */
type McpCallToolPayload = {
  /** 目标 serverId。 */
  serverId: string;
  /** 要调用的工具名。 */
  toolName: string;
  /** 原样透传给 MCP `tools/call` 的 arguments。 */
  args: unknown;
};

/**
 * 归一化 Service Worker 返回的错误对象。
 *
 * @param error - SW 返回的 error 字段。
 * @returns 可直接抛出的 Error 或 I18nText。
 */
function normalizeSwError(error: unknown) {
  if (error && typeof error === 'object' && 'key' in (error as Record<string, unknown>)) {
    return error as I18nText;
  }
  if (typeof error === 'string' && error.trim()) {
    return new Error(error);
  }
  return new Error('Unknown Service Worker MCP error');
}

/**
 * 发送一次性消息到 Service Worker。
 *
 * @param message - 消息类型与负载。
 * @returns Promise 化的成功负载。
 */
async function sendSwMessage<T>(message: SwMcpInboundMessage): Promise<T> {
  const response = await sendExtensionMessage<SwResponse<T> | undefined>(message);
  if (!response) {
    throw new Error('Empty Service Worker response');
  }
  if (!response.ok) {
    throw normalizeSwError(response.error);
  }
  return response.payload as T;
}

/** 读取 SW 维护的所有共享 MCP 连接状态。 */
export function getSharedMcpServerStates() {
  return sendSwMessage<Record<string, McpSharedServerState>>({
    type: 'mcp/servers/status/get',
  });
}

/**
 * 请求 SW 建立或复用某个 MCP 共享连接。
 *
 * @param serverId - 目标 MCP server ID。
 */
export function connectSharedMcpServer(serverId: string) {
  return sendSwMessage<{ meta: McpConnectionMeta; tools: McpTool[] }>({
    type: 'mcp/server/connect',
    payload: {
      serverId,
    } satisfies McpConnectPayload,
  });
}

/**
 * 请求 SW 主动断开某个 MCP 共享连接。
 *
 * @param serverId - 目标 MCP server ID。
 */
export function disconnectSharedMcpServer(serverId: string) {
  return sendSwMessage<void>({
    type: 'mcp/server/disconnect',
    payload: {
      serverId,
    } satisfies McpConnectPayload,
  });
}

/**
 * 请求 SW 返回某个 MCP server 的工具目录。
 *
 * @param serverId - 目标 MCP server ID。
 * @param options - 可选：是否强制刷新工具缓存。
 */
export function listSharedMcpServerTools(serverId: string, options?: { forceRefresh?: boolean }) {
  return sendSwMessage<{ meta: McpConnectionMeta; tools: McpTool[] }>({
    type: 'mcp/server/tools',
    payload: {
      serverId,
      forceRefresh: Boolean(options?.forceRefresh),
    } satisfies McpToolsPayload,
  });
}

/**
 * 请求 SW 通过共享 session 调用一次 MCP 工具。
 *
 * @param serverId - 目标 MCP server ID。
 * @param toolName - 工具名。
 * @param args - 原样透传的 arguments。
 */
export function callSharedMcpTool(serverId: string, toolName: string, args: unknown) {
  return sendSwMessage<CallToolResult>({
    type: 'mcp/tool/call',
    payload: {
      serverId,
      toolName,
      args,
    } satisfies McpCallToolPayload,
  });
}

/** 显式触发指定 MCP server 的 OAuth 授权。 */
export function authorizeSharedMcpServer(serverId: string) {
  return sendSwMessage<void>({
    type: 'mcp/server/oauth/authorize',
    payload: {
      serverId,
    } satisfies McpConnectPayload,
  });
}

/** 清除指定 MCP server 的 OAuth 授权缓存。 */
export function clearSharedMcpServerAuthorization(serverId: string) {
  return sendSwMessage<void>({
    type: 'mcp/server/oauth/clear',
    payload: {
      serverId,
    } satisfies McpConnectPayload,
  });
}
