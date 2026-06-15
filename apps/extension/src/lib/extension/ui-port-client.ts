/**
 * 说明：`olyq:ui` Port 的 typed client。
 *
 * 职责：
 * - 为 content script inline card 与扩展 UI 提供同一套 Port 创建、订阅、发送和断开封装；
 * - 将 direct `chrome.runtime.connect({ name: "olyq:ui" })` 收口到单一运行时边界；
 * - 保持消息类型来自 `sw-port-messages.ts`，不再让业务模块拼裸 Port。
 */
import type { UiPortInboundMessage, UiPortOutboundMessage } from '@/types/sw-port-messages';
import { getExtensionRuntime } from './runtime-api';
import { ExtensionRuntimeError } from './runtime-errors';

/** UI Port 消息订阅取消函数。 */
export type UiPortUnsubscribe = () => void;

/** typed UI Port client。 */
export type UiPortClient = {
  /** 原生 Port，只允许需要注册到旧 API 的桥接层读取。 */
  readonly port: chrome.runtime.Port;
  /** 发送 typed Port 消息。 */
  post: (message: UiPortOutboundMessage) => boolean;
  /** 订阅 typed 入站消息。 */
  onMessage: (listener: (message: UiPortInboundMessage) => void) => UiPortUnsubscribe;
  /** 订阅断线。 */
  onDisconnect: (listener: () => void) => UiPortUnsubscribe;
  /** 主动断开 Port。 */
  disconnect: () => void;
};

/** 创建 typed UI Port client。 */
export function connectUiPortClient(): UiPortClient {
  const runtime = getExtensionRuntime();
  if (!runtime?.connect) {
    throw new ExtensionRuntimeError('runtime-unavailable', {
      detail: 'chrome.runtime.connect is unavailable',
    });
  }

  const port = runtime.connect({ name: 'olyq:ui' });
  return {
    port,
    post: (message) => {
      try {
        port.postMessage(message);
        return true;
      } catch {
        return false;
      }
    },
    onMessage: (listener) => {
      /** 过滤非 typed Port 消息后再交给业务订阅者。 */
      const wrapped = (message: unknown) => {
        if (!message || typeof message !== 'object') return;
        if (typeof (message as { type?: unknown }).type !== 'string') return;
        listener(message as UiPortInboundMessage);
      };
      port.onMessage.addListener(wrapped);
      return () => port.onMessage.removeListener(wrapped);
    },
    onDisconnect: (listener) => {
      port.onDisconnect.addListener(listener);
      return () => port.onDisconnect.removeListener(listener);
    },
    disconnect: () => {
      try {
        port.disconnect();
      } catch {
        // Port 已经断开时无需再向页面抛错。
      }
    },
  };
}
