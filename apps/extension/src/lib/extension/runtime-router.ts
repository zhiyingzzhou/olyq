/**
 * 说明：扩展运行时 typed router。
 *
 * 职责：
 * - 为 Service Worker、Content Script 等运行时提供按 `message.type` 分发的统一实现；
 * - 让 handler 在编译期拿到对应 type 的精确消息结构；
 * - 把未知消息、缺 handler 消息和具体业务 handler 解耦。
 *
 * 边界：
 * - 这里只做同步分发，不访问 `chrome.*`；
 * - Chrome callback 生命周期、`sendResponse` 保活和 Port 清理由各运行时适配层负责。
 */
import type {
  ExtensionMessageHandlerMap,
  ExtensionTypedMessage,
} from '@/types/extension-messaging';
import { readExtensionMessageType } from '@/types/extension-messaging';

/** typed router 分发结果。 */
export type ExtensionRouterDispatchResult<TResult> =
  | {
      /** 已命中 handler。 */
      handled: true;
      /** handler 返回值。 */
      result: TResult;
    }
  | {
      /** 未命中 handler。 */
      handled: false;
    };

/** typed router 实例。 */
export type ExtensionRuntimeRouter<
  TMessage extends ExtensionTypedMessage,
  TResult,
  TContext,
> = {
  /** 仅用于在类型系统中保留当前 router 绑定的消息联合类型。 */
  readonly __messageType?: TMessage;
  /** 按消息 type 分发。 */
  dispatch: (rawMessage: unknown, context: TContext) => ExtensionRouterDispatchResult<TResult>;
};

/**
 * 创建扩展运行时 typed router。
 *
 * @param handlers - 按消息类型索引的 handler map。
 * @returns 只暴露 `dispatch` 的 router。
 */
export function createExtensionRuntimeRouter<
  TMessage extends ExtensionTypedMessage,
  TResult,
  TContext,
>(
  handlers: ExtensionMessageHandlerMap<TMessage, TResult, TContext>,
): ExtensionRuntimeRouter<TMessage, TResult, TContext> {
  return {
    dispatch: (rawMessage, context) => {
      const type = readExtensionMessageType(rawMessage);
      if (!type) return { handled: false };
      const handler = handlers[type as TMessage['type']];
      if (!handler) return { handled: false };
      const dispatchHandler = handler as (message: TMessage, context: TContext) => TResult;
      return {
        handled: true,
        result: dispatchHandler(rawMessage as TMessage, context),
      };
    },
  };
}
