/**
 * 说明：`stream-chat-event-emitter` AI 能力模块。
 *
 * 职责：
 * - 承载 `stream-chat-event-emitter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `StreamChatEventEmitter`、`createStreamChatEventEmitter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { APICallError, RetryError } from 'ai';

import { logger } from '@/lib/logger';
import { i18nText } from '@/lib/i18n/text';
import { toI18nTextFromError } from '@/lib/i18n/error';
import { sanitizeRequestBodyValuesForDebug } from './stream-chat-debug';
import {
  sanitizeHeadersForDebug,
  formatDebugBody,
  formatDebugPayload,
  formatErrorDetails,
} from './stream-chat-errors';
import {
  formatApiUrlHint,
  selectDiagnosticApiCallErrorFromRetryError,
  toApiCallErrorText,
  toUserFacingAiErrorText,
} from './utils/api-errors';
import type { StreamChatEvent, StreamChatUsage } from './stream-chat-types';

/** 导出类型：`StreamChatEventEmitter`。 */
export interface StreamChatEventEmitter {
  emitDebug: (kind: string, payload: unknown) => void;
  emitDone: (usage?: StreamChatUsage) => void;
  emitError: (error: unknown) => void;
  safeEmit: (event: StreamChatEvent) => void;
}

interface CreateStreamChatEventEmitterOptions {
  readonly debugEnabled: boolean;
  readonly onEvent: (event: StreamChatEvent) => void;
  readonly requestId: string;
  readonly signal: AbortSignal;
}

/**
 * 导出函数：`createStreamChatEventEmitter`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function createStreamChatEventEmitter({
  debugEnabled,
  onEvent,
  requestId,
  signal,
}: CreateStreamChatEventEmitterOptions): StreamChatEventEmitter {
    /**
   * 内部函数变量：`safeEmit`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const safeEmit = (event: StreamChatEvent) => {
    try {
      onEvent(event);
    } catch (error) {
      logger.chat.error('streamChat onEvent failed', error, {
        requestId,
        eventType: String((event as { type?: unknown })?.type ?? ''),
      });
    }
  };

    /**
   * 内部函数变量：`emitDebug`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const emitDebug = (kind: string, payload: unknown) => {
    if (!debugEnabled) return;
    safeEmit({ type: 'chat/debug', requestId, kind, payload });
  };

    /**
   * 内部函数变量：`emitDone`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const emitDone = (usage?: StreamChatUsage) => {
    safeEmit({ type: 'chat/done', requestId, usage });
  };

    /**
   * 内部函数变量：`emitApiCallError`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const emitApiCallError = (apiError: APICallError, label: string, detailsSource: unknown = apiError) => {
    const errorI18n = toApiCallErrorText(apiError);
    const safeUrl = typeof apiError.url === 'string' ? formatApiUrlHint(apiError.url) : undefined;

    emitDebug('ai-sdk/apicall-error', {
      name: apiError.name,
      message: apiError.message,
      url: safeUrl,
      statusCode: apiError.statusCode,
      isRetryable: apiError.isRetryable,
      responseHeaders: sanitizeHeadersForDebug(apiError.responseHeaders),
      responseBody: formatDebugPayload(apiError.responseBody),
      data: formatDebugPayload(apiError.data),
      requestBodyValues: debugEnabled ? sanitizeRequestBodyValuesForDebug(apiError.requestBodyValues) : undefined,
    });

    // 已经转换为 chat/error 的 Provider/API 失败属于业务诊断，不再走 error 级别，
    // 避免 Chrome 扩展管理页把外部服务失败标成扩展内部错误。
    logger.chat.warn(label, {
      requestId,
      name: apiError.name,
      message: apiError.message,
      statusCode: typeof apiError.statusCode === 'number' ? apiError.statusCode : undefined,
      url: safeUrl,
      responseBody: formatDebugBody(apiError.responseBody),
    });

    safeEmit({
      type: 'chat/error',
      requestId,
      error: errorI18n,
      details: formatErrorDetails(detailsSource, { messageI18n: errorI18n }),
    });
  };

    /**
   * 内部函数变量：`emitError`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const emitError = (error: unknown) => {
    if (RetryError.isInstance(error)) {
      const apiError = selectDiagnosticApiCallErrorFromRetryError(error);
      if (apiError) {
        emitApiCallError(apiError, 'RetryError(APICallError)', error);
        return;
      }
      const messageI18n = toUserFacingAiErrorText(error);
      safeEmit({
        type: 'chat/error',
        requestId,
        error: messageI18n,
        details: formatErrorDetails(error, { messageI18n }),
      });
      return;
    }

    if (APICallError.isInstance(error)) {
      emitApiCallError(error, 'APICallError');
      return;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      const isUserCancel = signal?.aborted === true;
      const errorI18n = isUserCancel ? i18nText('errors.cancelled') : i18nText('errors.requestTimedOutOrDisconnected');
      safeEmit({
        type: 'chat/error',
        requestId,
        error: errorI18n,
        details: formatErrorDetails(error, { messageI18n: errorI18n }),
      });
      return;
    }

    const errorI18n = toI18nTextFromError(error);
    safeEmit({
      type: 'chat/error',
      requestId,
      error: errorI18n,
      details: formatErrorDetails(error, { messageI18n: errorI18n }),
    });
  };

  return {
    emitDebug,
    emitDone,
    emitError,
    safeEmit,
  };
}
