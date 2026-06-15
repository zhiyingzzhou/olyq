/**
 * 说明：`one-shot-mcp-handlers` 后台运行时模块。
 *
 * 职责：
 * - 承载 one-shot 路由里所有 remote-only MCP 命令；
 * - 统一处理 serverId 校验、连接、列工具、调工具与 OAuth 授权清理；
 * - 保持 service worker 路由层只做分发，不把 MCP 细节继续塞回总文件。
 */
import type { SwStdResponse } from '@/types/sw-messages';
import { i18nText } from '@/lib/i18n/text';
import { toI18nTextFromError } from '@/lib/i18n/error';

import { loadMcpSessionPoolRuntime } from './runtime-loaders';
import type { OneShotHandler } from './types';

type SendResponse = (response: unknown) => void;

/**
 * 从 one-shot 消息里提取并校验 MCP serverId。
 *
 * @param msg - 当前 one-shot 消息。
 * @param sendResponse - 当前消息的同步响应回调。
 * @returns 合法的 serverId；缺失时会直接回写错误并返回 `null`。
 */
function withServerId(msg: Record<string, unknown>, sendResponse: SendResponse): string | null {
  const payload = (msg.payload as Record<string, unknown> | undefined) ?? {};
  const serverId = String(payload.serverId || '').trim();
  if (!serverId) {
    sendResponse({ ok: false, error: i18nText('errors.mcpCommandMissing') } satisfies SwStdResponse);
    return null;
  }
  return serverId;
}

/**
 * 读取 MCP session pool 快照。
 *
 * @param _msg - 当前消息体，这个 handler 不消费 payload。
 * @param _sender - 当前消息发送者。
 * @param sendResponse - 当前消息的响应回调。
 * @returns `true`，表示响应会异步回写。
 */
function handleMcpServersStatusGet(
  _msg: Record<string, unknown>,
  _sender: chrome.runtime.MessageSender,
  sendResponse: SendResponse,
): boolean {
  void loadMcpSessionPoolRuntime()
    .then(({ getSessionPoolSnapshot }) => getSessionPoolSnapshot())
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error: unknown) => sendResponse({ ok: false, error: toI18nTextFromError(error) } satisfies SwStdResponse));
  return true;
}

/**
 * 连接指定 MCP server。
 *
 * @param msg - 当前 one-shot 消息。
 * @param _sender - 当前消息发送者。
 * @param sendResponse - 当前消息的响应回调。
 * @returns `true`，表示响应会异步回写。
 */
function handleMcpServerConnect(
  msg: Record<string, unknown>,
  _sender: chrome.runtime.MessageSender,
  sendResponse: SendResponse,
): boolean {
  const serverId = withServerId(msg, sendResponse);
  if (!serverId) return false;

  void loadMcpSessionPoolRuntime()
    .then(({ listToolsFromPool }) => listToolsFromPool(serverId, { forceRefresh: false }))
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error: unknown) => sendResponse({ ok: false, error: toI18nTextFromError(error) } satisfies SwStdResponse));
  return true;
}

/**
 * 断开指定 MCP server 的共享会话。
 *
 * @param msg - 当前 one-shot 消息。
 * @param _sender - 当前消息发送者。
 * @param sendResponse - 当前消息的响应回调。
 * @returns `true`，表示响应会异步回写。
 */
function handleMcpServerDisconnect(
  msg: Record<string, unknown>,
  _sender: chrome.runtime.MessageSender,
  sendResponse: SendResponse,
): boolean {
  const serverId = withServerId(msg, sendResponse);
  if (!serverId) return false;

  void loadMcpSessionPoolRuntime()
    .then(({ disconnectSessionFromPool }) => disconnectSessionFromPool(serverId))
    .then(() => sendResponse({ ok: true, payload: undefined }))
    .catch((error: unknown) => sendResponse({ ok: false, error: toI18nTextFromError(error) } satisfies SwStdResponse));
  return true;
}

/**
 * 读取指定 server 的工具列表。
 *
 * @param msg - 当前 one-shot 消息。
 * @param _sender - 当前消息发送者。
 * @param sendResponse - 当前消息的响应回调。
 * @returns `true`，表示响应会异步回写。
 */
function handleMcpServerTools(
  msg: Record<string, unknown>,
  _sender: chrome.runtime.MessageSender,
  sendResponse: SendResponse,
): boolean {
  const serverId = withServerId(msg, sendResponse);
  if (!serverId) return false;

  const payload = (msg.payload as Record<string, unknown> | undefined) ?? {};
  const forceRefresh = typeof payload.forceRefresh === 'boolean' ? payload.forceRefresh : Boolean(payload.forceRefresh);
  void loadMcpSessionPoolRuntime()
    .then(({ listToolsFromPool }) => listToolsFromPool(serverId, { forceRefresh }))
    .then((result) => sendResponse({ ok: true, payload: result }))
    .catch((error: unknown) => sendResponse({ ok: false, error: toI18nTextFromError(error) } satisfies SwStdResponse));
  return true;
}

/**
 * 调用指定 server 的 MCP 工具。
 *
 * @param msg - 当前 one-shot 消息。
 * @param _sender - 当前消息发送者。
 * @param sendResponse - 当前消息的响应回调。
 * @returns `true`，表示响应会异步回写。
 */
function handleMcpToolCall(
  msg: Record<string, unknown>,
  _sender: chrome.runtime.MessageSender,
  sendResponse: SendResponse,
): boolean {
  const serverId = withServerId(msg, sendResponse);
  if (!serverId) return false;

  const payload = (msg.payload as Record<string, unknown> | undefined) ?? {};
  const toolName = String(payload.toolName || '').trim();
  if (!toolName) {
    sendResponse({ ok: false, error: i18nText('errors.mcpCommandMissing') } satisfies SwStdResponse);
    return false;
  }

  void loadMcpSessionPoolRuntime()
    .then(({ callToolFromPool }) => callToolFromPool(serverId, toolName, payload.args))
    .then((result) => sendResponse({ ok: true, payload: result }))
    .catch((error: unknown) => sendResponse({ ok: false, error: toI18nTextFromError(error) } satisfies SwStdResponse));
  return true;
}

/**
 * 触发指定 server 的 OAuth 授权流程。
 *
 * @param msg - 当前 one-shot 消息。
 * @param _sender - 当前消息发送者。
 * @param sendResponse - 当前消息的响应回调。
 * @returns `true`，表示响应会异步回写。
 */
function handleMcpServerOAuthAuthorize(
  msg: Record<string, unknown>,
  _sender: chrome.runtime.MessageSender,
  sendResponse: SendResponse,
): boolean {
  const serverId = withServerId(msg, sendResponse);
  if (!serverId) return false;

  void loadMcpSessionPoolRuntime()
    .then(({ authorizeServerFromPool }) => authorizeServerFromPool(serverId))
    .then(() => sendResponse({ ok: true, payload: undefined }))
    .catch((error: unknown) => sendResponse({ ok: false, error: toI18nTextFromError(error) } satisfies SwStdResponse));
  return true;
}

/**
 * 清除指定 server 的 OAuth 授权缓存。
 *
 * @param msg - 当前 one-shot 消息。
 * @param _sender - 当前消息发送者。
 * @param sendResponse - 当前消息的响应回调。
 * @returns `true`，表示响应会异步回写。
 */
function handleMcpServerOAuthClear(
  msg: Record<string, unknown>,
  _sender: chrome.runtime.MessageSender,
  sendResponse: SendResponse,
): boolean {
  const serverId = withServerId(msg, sendResponse);
  if (!serverId) return false;

  void loadMcpSessionPoolRuntime()
    .then(({ clearServerAuthorizationFromPool }) => clearServerAuthorizationFromPool(serverId))
    .then(() => sendResponse({ ok: true, payload: undefined }))
    .catch((error: unknown) => sendResponse({ ok: false, error: toI18nTextFromError(error) } satisfies SwStdResponse));
  return true;
}

/**
 * 创建 one-shot 路由需要挂载的 MCP handler 集合。
 *
 * @returns MCP 相关消息名到 handler 的静态映射。
 */
export function createMcpOneShotHandlers(): Record<string, OneShotHandler> {
  return {
    'mcp/servers/status/get': handleMcpServersStatusGet,
    'mcp/server/connect': handleMcpServerConnect,
    'mcp/server/disconnect': handleMcpServerDisconnect,
    'mcp/server/tools': handleMcpServerTools,
    'mcp/tool/call': handleMcpToolCall,
    'mcp/server/oauth/authorize': handleMcpServerOAuthAuthorize,
    'mcp/server/oauth/clear': handleMcpServerOAuthClear,
  };
}
