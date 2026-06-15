/**
 * 说明：扩展运行时通信错误模块。
 *
 * 职责：
 * - 统一表达 runtime / Port 不可用、消息发送失败和空响应；
 * - 避免业务模块继续依赖浏览器原始 `lastError.message` 做分支；
 * - 为 UI 或 content-script 层提供稳定、可测试的错误类型。
 */

/** 扩展 runtime 通信失败原因。 */
export type ExtensionRuntimeErrorReason =
  | 'runtime-unavailable'
  | 'message-send-failed'
  | 'empty-response'
  | 'port-unavailable'
  | 'port-disconnected';

/** 扩展 runtime 通信错误。 */
export class ExtensionRuntimeError extends Error {
  /** 稳定失败原因。 */
  readonly reason: ExtensionRuntimeErrorReason;

  /** 浏览器原始错误细节，仅用于诊断。 */
  readonly detail: string | null;

  constructor(
    reason: ExtensionRuntimeErrorReason,
    options: { detail?: string | null; cause?: unknown } = {},
  ) {
    super(reason);
    this.name = 'ExtensionRuntimeError';
    this.reason = reason;
    this.detail = typeof options.detail === 'string' && options.detail.trim()
      ? options.detail.trim()
      : null;
    if ('cause' in options) {
      (this as unknown as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** 判断未知错误是否为扩展 runtime 错误。 */
export function isExtensionRuntimeError(error: unknown): error is ExtensionRuntimeError {
  return error instanceof ExtensionRuntimeError;
}
