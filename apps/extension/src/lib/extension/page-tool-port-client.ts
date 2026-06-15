/**
 * 说明：`olyq:sidepanel` 页面工具 Port typed client。
 *
 * 职责：
 * - 收口 Sidepanel 页面工具专用 Port 的创建与消息发送；
 * - 避免 bridge 层直接调用 `chrome.runtime.connect`；
 * - 保留 `generation` ready / command ack 的现有协议语义。
 */
import {
  SIDEPANEL_PAGE_TOOL_PORT_NAME,
  type SidePanelPageToolInboundMessage,
  type SidePanelPageToolOutboundMessage,
} from '@/types/sidepanel-page-tool-port';
import { getExtensionRuntime } from './runtime-api';
import { ExtensionRuntimeError } from './runtime-errors';

/** 页面工具 Port client。 */
export type PageToolPortClient = {
  /** 原生 Port，用于现有 SW bridge 判断身份。 */
  readonly port: chrome.runtime.Port;
  /** 发送页面工具 Port 消息。 */
  post: (message: SidePanelPageToolOutboundMessage) => boolean;
  /** 订阅页面工具入站消息。 */
  onMessage: (listener: (message: SidePanelPageToolInboundMessage) => void) => () => void;
  /** 订阅断线事件。 */
  onDisconnect: (listener: () => void) => () => void;
};

/** 建立 Sidepanel 页面工具专用 Port。 */
export function connectPageToolPortClient(): PageToolPortClient {
  const runtime = getExtensionRuntime();
  if (!runtime?.connect) {
    throw new ExtensionRuntimeError('runtime-unavailable', {
      detail: 'chrome.runtime.connect is unavailable',
    });
  }
  const port = runtime.connect({ name: SIDEPANEL_PAGE_TOOL_PORT_NAME });
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
      /** 过滤非页面工具 typed Port 消息后再交给业务订阅者。 */
      const wrapped = (message: unknown) => {
        if (!message || typeof message !== 'object') return;
        if (typeof (message as { type?: unknown }).type !== 'string') return;
        listener(message as SidePanelPageToolInboundMessage);
      };
      port.onMessage.addListener(wrapped);
      return () => port.onMessage.removeListener(wrapped);
    },
    onDisconnect: (listener) => {
      port.onDisconnect.addListener(listener);
      return () => port.onDisconnect.removeListener(listener);
    },
  };
}
