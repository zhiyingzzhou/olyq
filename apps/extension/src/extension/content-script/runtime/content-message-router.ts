/**
 * 说明：Content Script 入站消息 typed router。
 *
 * 职责：
 * - 收口 `chrome.runtime.onMessage.addListener` 的唯一 content-script 使用点；
 * - 按 `CsInboundMessage['type']` 分发到精确 handler；
 * - 保持异步 handler 可返回 `true` 以延长 Chrome callback 生命周期。
 */
import type { CsInboundMessage } from '@/types/content-script-messages';
import { createExtensionRuntimeRouter } from '@/lib/extension/runtime-router';
import { getExtensionRuntime } from '@/lib/extension/runtime-api';

/** Content Script 入站 handler。 */
export type ContentMessageHandler<TType extends CsInboundMessage['type']> = (
  message: Extract<CsInboundMessage, { type: TType }>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | void;

/** Content Script 入站 handler map。 */
export type ContentMessageHandlerMap = {
  [TType in CsInboundMessage['type']]?: ContentMessageHandler<TType>;
};

/** 安装 content-script 消息 router。 */
export function installContentMessageRouter(handlers: ContentMessageHandlerMap): void {
  const runtime = getExtensionRuntime();
  if (!runtime?.onMessage?.addListener) return;

  const router = createExtensionRuntimeRouter<CsInboundMessage, boolean | void, {
    sender: chrome.runtime.MessageSender;
    sendResponse: (response?: unknown) => void;
  }>(
    Object.fromEntries(
      Object.entries(handlers).map(([type, handler]) => [
        type,
        (message: CsInboundMessage, context: {
          sender: chrome.runtime.MessageSender;
          sendResponse: (response?: unknown) => void;
        }) => handler(message as never, context.sender, context.sendResponse),
      ]),
    ) as never,
  );

  runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
    const result = router.dispatch(rawMessage, { sender, sendResponse });
    if (!result.handled) return;
    return result.result;
  });
}
