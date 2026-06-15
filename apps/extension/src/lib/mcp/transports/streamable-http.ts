/**
 * 说明：`streamable-http` 基础能力模块。
 *
 * 职责：
 * - 承载当前 remote-only MCP 的 Streamable HTTP transport；
 * - 处理 `POST -> application/json` 与 `POST -> text/event-stream` 两种响应；
 * - 统一处理 `mcp-session-id` 续用、OAuth bearer 注入、401 后 discovery / auth / retry。
 */
import type { McpServerConfig } from '@/types/mcp';
import { ensureMcpOAuthAccessToken } from '@/lib/mcp/oauth';
import { createJsonRpcId, isJsonRpcError, isJsonRpcResponse, type JsonRpcNotification, type JsonRpcRequest, type JsonRpcResponse } from '@/lib/mcp/jsonrpc';
import { parseSseStream } from '@/lib/mcp/sse';
import { isPlainRecord } from '@/lib/utils/type-guards';
import { I18nError } from '@/lib/i18n/error';

type McpClientInfo = {
  name: string;
  version: string;
};

type McpServerInfo = {
  name?: string;
  version?: string;
};

type InitializeParams = {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  clientInfo: McpClientInfo;
};

type InitializeResult = {
  protocolVersion: string;
  capabilities?: Record<string, unknown>;
  serverInfo?: McpServerInfo;
};

/**
 * 规整用户配置里的静态请求头。
 *
 * @param raw - 原始 headers 配置。
 * @returns 去掉空 key 后的 headers 对象。
 */
function toHeaders(raw: Record<string, string> | undefined) {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!key) continue;
    out[key] = String(value);
  }
  return out;
}

/**
 * 以大小写不敏感方式读取响应头。
 *
 * @param headers - 原始响应头对象。
 * @param key - 目标 header 名称。
 * @returns 命中的 header 值；不存在时返回 `null`。
 */
function getHeaderInsensitive(headers: Headers, key: string) {
  const direct = headers.get(key);
  if (direct) return direct;
  for (const [headerKey, value] of headers.entries()) {
    if (headerKey.toLowerCase() === key.toLowerCase()) return value;
  }
  return null;
}

/**
 * 把 Streamable HTTP 响应规整成 JSON-RPC 响应对象。
 *
 * @param message - 当前发送的 JSON-RPC 消息。
 * @param res - 原始 HTTP 响应。
 * @param signal - 可选中断信号。
 * @returns 命中的 JSON-RPC 响应；通知型 `202/204` 时返回 `null`。
 */
async function parseResponseAsJsonRpc(message: JsonRpcRequest | JsonRpcNotification, res: Response, signal?: AbortSignal): Promise<JsonRpcResponse | null> {
  if (res.status === 202 || res.status === 204) return null;

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const json: unknown = await res.json();
    if (!isJsonRpcResponse(json)) throw new I18nError('errors.mcpNotJsonRpcResponse');
    return json;
  }

  if (contentType.includes('text/event-stream')) {
    if (!res.body) throw new I18nError('errors.mcpSseMissingBody');
    const wantedId = (message as { id?: unknown }).id;
    for await (const event of parseSseStream(res.body, signal)) {
      const data = String(event.data || '').trim();
      if (!data) continue;
      const parsed: unknown = JSON.parse(data);
      if (!isJsonRpcResponse(parsed)) continue;
      if (parsed.id !== wantedId) continue;
      return parsed;
    }
    throw new I18nError('errors.mcpSseNoMatchingResponse');
  }

  const detail = await res.text().catch(() => '');
  throw new I18nError('errors.mcpUnsupportedResponseTypeWithDetail', {
    contentType: contentType || 'unknown',
    detail: detail.slice(0, 200),
  });
}

/**
 * 浏览器扩展内的 Streamable HTTP MCP transport。
 *
 * 说明：
 * - 只支持 `POST -> application/json` 与 `POST -> text/event-stream`；
 * - 会统一续用 `mcp-session-id`，并在 401/403 时触发 OAuth 授权重试。
 */
export class StreamableHttpTransport {
  private readonly server: McpServerConfig;

  private readonly headers: Record<string, string>;

  private negotiatedProtocolVersion: string;

  private sessionId: string | null = null;

  constructor({
    server,
    protocolVersion,
  }: {
    server: McpServerConfig;
    protocolVersion: string;
  }) {
    this.server = server;
    this.headers = toHeaders(server.headers);
    this.negotiatedProtocolVersion = protocolVersion;
  }

  /** 返回当前协商中的 MCP protocol version。 */
  getProtocolVersion() {
    return this.negotiatedProtocolVersion;
  }

  /** 返回当前复用中的 `mcp-session-id`。 */
  getSessionId() {
    return this.sessionId;
  }

  /**
   * 组装一次 Streamable HTTP 请求的最终请求头。
   *
   * @param options - OAuth 注入与重试选项。
   * @returns 带静态 headers、session 与 OAuth token 的最终 headers。
   */
  private async createRequestHeaders(options?: { allowInteractiveOAuth?: boolean; forceRefreshToken?: boolean; bearerChallengeHeader?: string | null }) {
    const headers: Record<string, string> = {
      ...this.headers,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    };
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;
    if (this.negotiatedProtocolVersion) headers['mcp-protocol-version'] = this.negotiatedProtocolVersion;

    const auth = await ensureMcpOAuthAccessToken(this.server, {
      allowInteractive: options?.allowInteractiveOAuth,
      forceRefresh: options?.forceRefreshToken,
      bearerChallengeHeader: options?.bearerChallengeHeader,
    });
    if (auth?.accessToken) {
      headers.authorization = `Bearer ${auth.accessToken}`;
    }

    return headers;
  }

  /**
   * 发送一次 JSON-RPC POST 请求，并处理 OAuth 重试。
   *
   * @param message - 待发送的 JSON-RPC 消息。
   * @param signal - 可选中断信号。
   * @param options - 是否允许 401/403 自动重试。
   * @returns 规整后的 JSON-RPC 响应。
   */
  private async postRpc(
    message: JsonRpcRequest | JsonRpcNotification,
    signal?: AbortSignal,
    options?: { retryOnUnauthorized?: boolean },
  ): Promise<JsonRpcResponse | null> {
    const headers = await this.createRequestHeaders();
    const res = await fetch(this.server.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(message),
      signal,
    });

    const sessionId = getHeaderInsensitive(res.headers, 'mcp-session-id');
    if (sessionId) this.sessionId = sessionId;

    if ((res.status === 401 || res.status === 403) && options?.retryOnUnauthorized !== false && this.server.oauth.enabled) {
      const retryHeaders = await this.createRequestHeaders({
        allowInteractiveOAuth: true,
        forceRefreshToken: true,
        bearerChallengeHeader: res.headers.get('www-authenticate'),
      });
      const retryResponse = await fetch(this.server.url, {
        method: 'POST',
        headers: retryHeaders,
        body: JSON.stringify(message),
        signal,
      });
      const retrySessionId = getHeaderInsensitive(retryResponse.headers, 'mcp-session-id');
      if (retrySessionId) this.sessionId = retrySessionId;
      if (retryResponse.status === 401 || retryResponse.status === 403) {
        const detail = await retryResponse.text().catch(() => '');
        throw detail
          ? new I18nError('errors.mcpHttpErrorWithDetail', {
            status: retryResponse.status,
            statusText: retryResponse.statusText,
            detail: detail.slice(0, 200),
          })
          : new I18nError('errors.mcpHttpError', {
            status: retryResponse.status,
            statusText: retryResponse.statusText,
          });
      }
      return await parseResponseAsJsonRpc(message, retryResponse, signal);
    }

    if (res.status !== 200 && res.status !== 202 && res.status !== 204) {
      const detail = await res.text().catch(() => '');
      throw detail
        ? new I18nError('errors.mcpHttpErrorWithDetail', {
          status: res.status,
          statusText: res.statusText,
          detail: detail.slice(0, 200),
        })
        : new I18nError('errors.mcpHttpError', {
          status: res.status,
          statusText: res.statusText,
        });
    }

    return await parseResponseAsJsonRpc(message, res, signal);
  }

  /**
   * 执行 MCP initialize 握手。
   *
   * @param params - initialize 请求参数。
   * @returns initialize 结果。
   */
  async initialize(params: InitializeParams) {
    const request: JsonRpcRequest = { jsonrpc: '2.0', id: createJsonRpcId(), method: 'initialize', params };
    const response = await this.postRpc(request);
    if (!response) throw new I18nError('errors.mcpInitializeNoResponse');
    if (isJsonRpcError(response)) throw new I18nError('errors.mcpJsonRpcErrorWithDetail', { detail: response.error.message });
    const result = response.result;
    if (!isPlainRecord(result) || typeof result.protocolVersion !== 'string') {
      throw new I18nError('errors.mcpInitializeInvalidResponse');
    }
    const init = result as InitializeResult;
    this.negotiatedProtocolVersion = init.protocolVersion;
    await this.notify('notifications/initialized', {});
    return init;
  }

  /**
   * 发送一次带返回值的 JSON-RPC 请求。
   *
   * @param method - JSON-RPC 方法名。
   * @param params - 请求参数。
   * @param signal - 可选中断信号。
   * @returns 解析后的 JSON-RPC `result`。
   */
  async request<T = unknown>(method: string, params?: unknown, signal?: AbortSignal): Promise<T> {
    const request: JsonRpcRequest = { jsonrpc: '2.0', id: createJsonRpcId(), method, params };
    const response = await this.postRpc(request, signal);
    if (!response) throw new I18nError('errors.mcpRequestNoResponse');
    if (isJsonRpcError(response)) throw new I18nError('errors.mcpJsonRpcErrorWithDetail', { detail: response.error.message });
    return response.result as T;
  }

  /**
   * 发送一次 JSON-RPC 通知。
   *
   * @param method - JSON-RPC 方法名。
   * @param params - 通知参数。
   */
  async notify(method: string, params?: unknown) {
    const notification: JsonRpcNotification = { jsonrpc: '2.0', method, params };
    await this.postRpc(notification);
  }
}
