/**
 * 说明：UI 与 Service Worker 的共享 typed Port 单例。
 *
 * 职责：
 * - 为 Side Panel / chat-stream 提供唯一 `olyq:ui` 长连接；
 * - 统一消息广播、订阅、断线重连和 SW 唤醒；
 * - 对外保留 `getUiPort / ensureUiPortReady / onUiPortMessage / postUiPortMessage` 入口。
 *
 * 边界：
 * - 本模块不直接创建原生 Port，Port 建立统一委托给 `connectUiPortClient()`；
 * - 一次性 SW 唤醒统一委托给 `sendExtensionMessage()`；
 * - 调用方若需要原生 Port 身份，只能通过 `getUiPort()` 读取当前 client 的只读 port。
 */
import type { UiPortInboundMessage, UiPortOutboundMessage } from '@/types/sw-port-messages';
import type { SwStdResponse } from '@/types/sw-messages';
import { logger } from '@/lib/logger';
import { sendExtensionMessage } from '@/lib/extension/runtime-api';
import { connectUiPortClient, type UiPortClient } from '@/lib/extension/ui-port-client';

let client: UiPortClient | null = null;
let portBootstrapPromise: Promise<chrome.runtime.Port | null> | null = null;

const IS_E2E_PORT_DEBUG = import.meta.env.VITE_OLYQ_E2E === '1';
const SW_WAKE_RETRY_DELAYS_MS = [0, 80, 180] as const;
const WAKE_TIMEOUT_MS = 400;
const MAX_RECONNECT_ATTEMPTS = 8;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 30_000;
const STABLE_THRESHOLD_MS = 5_000;

/** UI Port 消息订阅回调。 */
type UiPortSubscriber = (msg: UiPortInboundMessage) => void;

/** 当前挂在共享 Port 上的订阅者集合。 */
const subscribers = new Set<UiPortSubscriber>();

let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let cooldownTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let stableTimer: ReturnType<typeof setTimeout> | null = null;

/** 输出 E2E Port 诊断日志。 */
function logUiPortDebug(message: string, payload?: Record<string, unknown>): void {
  if (!IS_E2E_PORT_DEBUG) return;
  logger.sw.debug(`E2E ui-port ${message}`, payload);
}

/** 从 Port 消息里读取 requestId，供诊断日志使用。 */
function readPortRequestId(message: UiPortInboundMessage | UiPortOutboundMessage): string {
  return 'requestId' in message && typeof message.requestId === 'string' ? message.requestId : '';
}

/** 延迟指定毫秒。 */
async function delay(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

/** 按指数退避策略安排下一次重连。 */
function scheduleReconnect(): void {
  if (reconnectTimer) return;
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    if (!cooldownTimer) {
      cooldownTimer = globalThis.setTimeout(() => {
        reconnectAttempts = 0;
        cooldownTimer = null;
      }, 60_000);
    }
    return;
  }

  const waitMs = Math.min(BASE_DELAY_MS * 2 ** reconnectAttempts, MAX_DELAY_MS);
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void ensureUiPortReady();
  }, waitMs);
}

/** 标记当前连接已经稳定，重置后续断线重连退避。 */
function markPortStableAfterThreshold(): void {
  if (stableTimer) {
    clearTimeout(stableTimer);
    stableTimer = null;
  }
  stableTimer = setTimeout(() => {
    stableTimer = null;
    reconnectAttempts = 0;
  }, STABLE_THRESHOLD_MS);
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/** 绑定 typed client 的消息与断线监听。 */
function attachUiPortListeners(nextClient: UiPortClient): void {
  nextClient.onMessage((message) => {
    logUiPortDebug('message', {
      type: message.type,
      requestId: readPortRequestId(message),
    });
    for (const subscriber of subscribers) subscriber(message);
  });

  nextClient.onDisconnect(() => {
    logUiPortDebug('disconnect', { name: nextClient.port.name });
    if (client === nextClient) client = null;
    if (stableTimer) {
      clearTimeout(stableTimer);
      stableTimer = null;
    }
    scheduleReconnect();
  });

  markPortStableAfterThreshold();
}

/** 创建共享 UI Port client。 */
function connectUiPort(): chrome.runtime.Port | null {
  try {
    const nextClient = connectUiPortClient();
    client = nextClient;
    logUiPortDebug('connect success', {
      name: nextClient.port.name,
      href: globalThis.location?.href ?? '',
    });
    attachUiPortListeners(nextClient);
    return nextClient.port;
  } catch (error) {
    logUiPortDebug('connect failed', {
      error: error instanceof Error ? error.message : String(error),
      href: globalThis.location?.href ?? '',
    });
    client = null;
    return null;
  }
}

/** 唤醒 MV3 Service Worker，避免随后建立的 Port 命中尚未注册监听器的短窗口。 */
async function wakeServiceWorker(): Promise<void> {
  for (const retryDelayMs of SW_WAKE_RETRY_DELAYS_MS) {
    await delay(retryDelayMs);
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    const result = await Promise.race<'ack' | 'failed'>([
      sendExtensionMessage<SwStdResponse>({ type: 'sw/ping' })
        .then(() => 'ack' as const)
        .catch((error: unknown) => {
          logUiPortDebug('wake failed', {
            retryDelayMs,
            error: error instanceof Error ? error.message : String(error),
          });
          return 'failed' as const;
        }),
      new Promise<'failed'>((resolve) => {
        timeoutId = globalThis.setTimeout(() => resolve('failed'), WAKE_TIMEOUT_MS);
      }),
    ]);
    if (timeoutId) globalThis.clearTimeout(timeoutId);
    if (result === 'ack') {
      logUiPortDebug('wake ack', { retryDelayMs });
      return;
    }
  }
}

/** 返回当前已经 ready 的共享 Port；不会隐式发起新的后台连接。 */
export function getUiPort(): chrome.runtime.Port | null {
  if (!client) return null;
  logUiPortDebug('reuse existing port', { name: client.port.name });
  return client.port;
}

/** 显式确保共享 Port 已建立；内部会先唤醒 Service Worker 再连接。 */
export async function ensureUiPortReady(): Promise<chrome.runtime.Port | null> {
  if (client) {
    logUiPortDebug('reuse existing port', { name: client.port.name });
    return client.port;
  }

  if (!portBootstrapPromise) {
    portBootstrapPromise = (async () => {
      await wakeServiceWorker();
      return connectUiPort();
    })().finally(() => {
      portBootstrapPromise = null;
    });
  }

  return await portBootstrapPromise;
}

/** 订阅 Port 消息。 */
export function onUiPortMessage(fn: UiPortSubscriber): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** 通过共享 Port 发送消息到 Service Worker。 */
export function postUiPortMessage(msg: UiPortOutboundMessage): boolean {
  if (!client) {
    logUiPortDebug('post skipped: no port', {
      type: msg.type,
      requestId: readPortRequestId(msg),
    });
    return false;
  }

  const ok = client.post(msg);
  logUiPortDebug(ok ? 'post success' : 'post failed', {
    type: msg.type,
    requestId: readPortRequestId(msg),
  });
  return ok;
}
