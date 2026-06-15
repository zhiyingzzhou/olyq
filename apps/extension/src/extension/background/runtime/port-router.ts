/**
 * 说明：Service Worker UI Port typed router 适配层。
 *
 * 职责：
 * - 将 Port handler map 封装为 typed router；
 * - 避免 `service-worker.ts` 直接按 `msg.type` 做裸字符串索引；
 * - 继续复用现有聊天、媒体、健康检查 handler 的生命周期语义。
 */
import type { UiPortOutboundMessage } from '@/types/sw-port-messages';
import { createExtensionRuntimeRouter } from '@/lib/extension/runtime-router';
import type { PortMessageHandlerMap } from '../message-handlers/types';

/** UI Port router 分发上下文。 */
export type ServiceWorkerPortRouterContext = {
  /** 发起消息的 Port。 */
  port: chrome.runtime.Port;
};

/** 创建 Service Worker UI Port router。 */
export function createServiceWorkerPortRouter(handlers: PortMessageHandlerMap) {
  return createExtensionRuntimeRouter<UiPortOutboundMessage, void, ServiceWorkerPortRouterContext>(
    Object.fromEntries(
      Object.entries(handlers).map(([type, handler]) => [
        type,
        (message: UiPortOutboundMessage, context: ServiceWorkerPortRouterContext) => (
          handler(context.port, message as unknown as Record<string, unknown>)
        ),
      ]),
    ) as never,
  );
}
