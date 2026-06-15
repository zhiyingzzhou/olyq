/**
 * 说明：Sidepanel 页面工具专用 typed Port。
 *
 * 职责：
 * - 在 Sidepanel 主工作区启动后连接 `olyq:sidepanel`；
 * - 只承载页面工具命令和 ack，不混入聊天流、健康检查或 content inline 通道；
 * - 断线后按轻量退避重连，避免 SW 回收或 Sidepanel 重载时命令桥永久失效。
 *
 * 边界：
 * - 本模块只在扩展 Sidepanel 页面使用；
 * - Port 创建统一委托给 `connectPageToolPortClient()`；
 * - 普通 UI 长任务仍走 `ui-port.ts` 的 `olyq:ui`。
 */
import type {
  SidePanelPageToolCommandMessage,
  SidePanelPageToolOutboundMessage,
} from '@/types/sidepanel-page-tool-port';
import { logger } from '@/lib/logger';
import {
  connectPageToolPortClient,
  type PageToolPortClient,
} from '@/lib/extension/page-tool-port-client';

type SidePanelPageToolSubscriber = (msg: SidePanelPageToolCommandMessage) => void;

let client: PageToolPortClient | null = null;
let bootstrapPromise: Promise<chrome.runtime.Port | null> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let bridgeReadyClient: PageToolPortClient | null = null;

const subscribers = new Set<SidePanelPageToolSubscriber>();

/** 安排专用 Port 断线后的重连。 */
function scheduleReconnect(): void {
  if (reconnectTimer) return;
  const delay = Math.min(500 * 2 ** reconnectAttempts, 10_000);
  reconnectAttempts = Math.min(reconnectAttempts + 1, 6);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void ensureSidePanelPageToolPortReady();
  }, delay);
}

/** 通知 SW：React bridge 已完成命令订阅，不再只是 raw Port 连接。 */
function notifyBridgeReadyIfPossible(): void {
  if (!client || subscribers.size === 0 || bridgeReadyClient === client) return;
  const ok = client.post({ type: 'sidepanel/page-tool-bridge-ready' });
  bridgeReadyClient = ok ? client : null;
}

/**
 * 响应 Service Worker 对当前页面工具 generation 的 ready 请求。
 *
 * @param generation - 当前页面工具 owner 代际。
 */
function respondBridgeReadyForGeneration(generation: number): void {
  if (!client || subscribers.size === 0) return;
  const ok = client.post({
    type: 'sidepanel/page-tool-bridge-ready',
    generation,
  });
  if (!ok) bridgeReadyClient = null;
}

/** 绑定 Port 监听。 */
function attachPortListeners(nextClient: PageToolPortClient): void {
  nextClient.onMessage((msg) => {
    if (msg.type === 'sidepanel/page-tool-ready-request') {
      respondBridgeReadyForGeneration(msg.generation);
      return;
    }
    if (msg.type !== 'sidepanel/page-tool-command') return;
    for (const subscriber of subscribers) subscriber(msg);
  });

  nextClient.onDisconnect(() => {
    logger.sw.debug('sidepanel page tool port disconnected');
    if (client === nextClient) client = null;
    if (bridgeReadyClient === nextClient) bridgeReadyClient = null;
    scheduleReconnect();
  });

  reconnectAttempts = 0;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/** 建立专用 Port。 */
function connectSidePanelPageToolPort(): chrome.runtime.Port | null {
  try {
    const nextClient = connectPageToolPortClient();
    client = nextClient;
    attachPortListeners(nextClient);
    notifyBridgeReadyIfPossible();
    return nextClient.port;
  } catch (error) {
    logger.sw.debug('sidepanel page tool port connect failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    client = null;
    return null;
  }
}

/** 确保 Sidepanel 页面工具专用 Port 已建立。 */
export async function ensureSidePanelPageToolPortReady(): Promise<chrome.runtime.Port | null> {
  if (client) return client.port;
  if (!bootstrapPromise) {
    bootstrapPromise = Promise.resolve(connectSidePanelPageToolPort()).finally(() => {
      bootstrapPromise = null;
    });
  }
  return await bootstrapPromise;
}

/**
 * 订阅 Sidepanel 页面工具命令。
 *
 * @param subscriber - 命令处理函数。
 * @returns 取消订阅函数。
 */
export function onSidePanelPageToolCommand(subscriber: SidePanelPageToolSubscriber): () => void {
  subscribers.add(subscriber);
  notifyBridgeReadyIfPossible();
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) bridgeReadyClient = null;
  };
}

/**
 * 通过专用 Port 发送页面工具命令 ack。
 *
 * @param msg - ack 消息。
 * @returns 是否成功写入 Port。
 */
export function postSidePanelPageToolMessage(msg: SidePanelPageToolOutboundMessage): boolean {
  return client?.post(msg) ?? false;
}
