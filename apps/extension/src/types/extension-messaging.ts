/**
 * 说明：扩展跨运行时通信的共享类型工具。
 *
 * 职责：
 * - 为 one-shot message、Port message 和 typed router 提供通用类型积木；
 * - 让调用方按 `type` 字段获得精确收窄后的消息结构；
 * - 统一表达 `{ ok, payload, error }` 这类跨运行时响应。
 *
 * 边界：
 * - 本文件只定义类型，不访问 `chrome.*`，也不创建任何运行时对象；
 * - 具体发送、连接、分发由 `lib/extension/*` 与各运行时 router 承担。
 */
import type { I18nText } from './i18n';

/** 任意具备字符串 `type` 字段的扩展协议消息。 */
export type ExtensionTypedMessage = {
  /** 消息类型。 */
  type: string;
};

/** 从联合消息里取出指定 `type` 对应的成员。 */
export type ExtensionMessageByType<
  TMessage extends ExtensionTypedMessage,
  TType extends TMessage['type'],
> = Extract<TMessage, { type: TType }>;

/** one-shot 响应成功态。 */
export type ExtensionRuntimeOk<TPayload = undefined, TExtra extends object = object> =
  ([TPayload] extends [undefined] ? { ok: true } : { ok: true; payload: TPayload }) & TExtra;

/** one-shot 响应失败态。 */
export type ExtensionRuntimeError<TExtra extends object = object> = {
  /** 标记消息处理失败。 */
  ok: false;
  /** 稳定国际化错误；底层错误详情不作为业务分支真源。 */
  error?: I18nText;
} & TExtra;

/** one-shot 标准响应联合。 */
export type ExtensionRuntimeResponse<TPayload = undefined, TExtra extends object = object> =
  | ExtensionRuntimeOk<TPayload, TExtra>
  | ExtensionRuntimeError<TExtra>;

/** typed router 中单个消息类型对应的 handler。 */
export type ExtensionMessageHandler<
  TMessage extends ExtensionTypedMessage,
  TType extends TMessage['type'],
  TResult,
  TContext,
> = (
  message: ExtensionMessageByType<TMessage, TType>,
  context: TContext,
) => TResult;

/** typed router 的 handler map。 */
export type ExtensionMessageHandlerMap<
  TMessage extends ExtensionTypedMessage,
  TResult,
  TContext,
> = {
  [TType in TMessage['type']]?: ExtensionMessageHandler<TMessage, TType, TResult, TContext>;
};

/** 从未知输入中读取稳定 message type。 */
export function readExtensionMessageType(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && type.trim() ? type : null;
}
