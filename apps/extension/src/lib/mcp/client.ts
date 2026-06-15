/**
 * 说明：`client` 基础能力模块。
 *
 * 职责：
 * - 承载 remote-only MCP client session 抽象；
 * - 统一把 Streamable HTTP transport 映射成 `listTools / callTool / close`；
 * - 删除 bridge / stdio transport 分支，确保浏览器扩展只保留远程 MCP。
 */
import type { McpServerConfig, McpTool } from '@/types/mcp';
import { StreamableHttpTransport } from '@/lib/mcp/transports/streamable-http';
import { I18nError } from '@/lib/i18n/error';
import { toHostMatchPatternFromUrl } from '@/lib/extension/host-match-patterns';

type ToolListItem = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

type ToolListResult = {
  tools: ToolListItem[];
  nextCursor?: string;
};

/** MCP `tools/call` 的精简结果。 */
export type CallToolResult = {
  content?: unknown;
  isError?: boolean;
};

/** 当前 MCP 连接协商后的元信息。 */
export type McpConnectionMeta = {
  protocolVersion: string;
  serverName?: string;
  serverVersion?: string;
};

/** 浏览器扩展内部复用的 MCP 会话抽象。 */
export type McpClientSession = {
  meta: McpConnectionMeta;
  listTools: () => Promise<McpTool[]>;
  callTool: (name: string, args: unknown) => Promise<CallToolResult>;
  close: () => void;
};

const PROTOCOL_VERSION = '2025-11-25';
const INIT_TIMEOUT = 15_000;
const REQUEST_TIMEOUT = 60_000;

/**
 * 生成 MCP initialize 阶段上报的 clientInfo。
 *
 * @returns 当前扩展固定使用的 client 名称与版本。
 */
function getClientInfo() {
  return { name: 'Olyq', version: '0.1.0' };
}

/**
 * 为 MCP 请求包装统一超时。
 *
 * @param promise - 原始请求 Promise。
 * @param ms - 超时时间。
 * @param label - 超时文案里展示的操作标签。
 * @returns 带统一超时错误语义的 Promise。
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new I18nError('errors.operationTimeout', { label, ms })), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * 把 transport 能力适配成浏览器扩展统一消费的会话对象。
 *
 * @param transport - 底层 transport 适配器。
 * @param meta - 已协商完成的连接元信息。
 * @param closeFn - 关闭会话时的清理回调。
 * @returns MCP client session 抽象。
 */
function buildSession(
  transport: { request: <T>(method: string, params: unknown) => Promise<T> },
  meta: McpConnectionMeta,
  closeFn: () => void,
): McpClientSession {
  return {
    meta,
    listTools: async () => {
      const result = await withTimeout(transport.request<ToolListResult>('tools/list', {}), REQUEST_TIMEOUT, 'tools/list');
      return Array.isArray(result.tools)
        ? result.tools
          .map((tool) => ({
            name: String(tool.name || ''),
            description: tool.description,
            inputSchema: tool.inputSchema,
          }))
          .filter((tool) => tool.name)
        : [];
    },
    callTool: async (name, args) => {
      return await withTimeout(transport.request<CallToolResult>('tools/call', { name, arguments: args }), REQUEST_TIMEOUT, 'tools/call');
    },
    close: closeFn,
  };
}

/**
 * 校验远程 MCP server URL 可被普通 http/https host access 覆盖。
 *
 * @param server - 待连接的 MCP server 配置。
 * @returns 权限满足时正常结束；否则抛出统一错误。
 */
async function ensureRemotePermission(server: McpServerConfig) {
  if (!server.url) {
    throw new I18nError('errors.mcpStreamableHttpUrlMissing');
  }

  const pattern = toHostMatchPatternFromUrl(server.url);
  if (!pattern) throw new I18nError('errors.invalidUrl', { url: server.url });
}

/** 连接一个远程 MCP server，并返回可复用的会话对象。 */
export async function connectMcpServer(server: McpServerConfig): Promise<McpClientSession> {
  await ensureRemotePermission(server);

  const transport = new StreamableHttpTransport({
    server,
    protocolVersion: PROTOCOL_VERSION,
  });
  const initParams = {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: getClientInfo(),
  };
  const init = await withTimeout(transport.initialize(initParams), INIT_TIMEOUT, 'MCP initialize');
  const meta: McpConnectionMeta = {
    protocolVersion: init.protocolVersion,
    serverName: init.serverInfo?.name,
    serverVersion: init.serverInfo?.version,
  };
  return buildSession(transport, meta, () => {});
}
