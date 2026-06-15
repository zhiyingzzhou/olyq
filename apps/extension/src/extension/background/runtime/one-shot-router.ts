/**
 * 说明：Service Worker one-shot typed router 适配层。
 *
 * 职责：
 * - 将旧的 one-shot handler map 封装成 typed router；
 * - 让 `service-worker.ts` 不再自行按裸字符串索引 handler；
 * - 保持 Chrome `sendResponse` 生命周期由具体 handler 决定。
 */
import type { SwInboundMessage } from '@/types/sw-messages';
import { createExtensionRuntimeRouter } from '@/lib/extension/runtime-router';
import type { OneShotHandlerMap } from '../message-handlers/types';

/** one-shot router 分发上下文。 */
export type ServiceWorkerOneShotRouterContext = {
  /** 消息来源。 */
  sender: chrome.runtime.MessageSender;
  /** Chrome callback 响应函数。 */
  sendResponse: (response: unknown) => void;
};

/** 创建 Service Worker one-shot router。 */
export function createServiceWorkerOneShotRouter(handlers: OneShotHandlerMap) {
  return createExtensionRuntimeRouter<SwInboundMessage, boolean | void, ServiceWorkerOneShotRouterContext>(
    Object.fromEntries(
      Object.entries(handlers).map(([type, handler]) => [
        type,
        (message: SwInboundMessage, context: ServiceWorkerOneShotRouterContext) => (
          handler(message as unknown as Record<string, unknown>, context.sender, context.sendResponse)
        ),
      ]),
    ) as never,
  );
}
