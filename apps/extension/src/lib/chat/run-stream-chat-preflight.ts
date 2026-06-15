/**
 * 说明：`run-stream-chat-preflight` 基础能力模块。
 *
 * 职责：
 * - 承载 `run-stream-chat-preflight` 相关的当前文件实现与模块边界；
 * - 对外暴露 `RunStreamChatPreflightResult`、`runStreamChatPreflight` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { emitDeveloperDebugEvent } from '@/lib/developer/debug-events';
import { I18nError, toI18nTextFromError } from '@/lib/i18n/error';
import { getWebSearchNetworkHostMatchPatterns } from '@/lib/web-search/host-match-patterns';
import type { Message } from '@/types/chat';
import type { I18nText } from '@/types/i18n';
import type { WebSearchProviderId } from '@/lib/web-search/types';
import type { WebSearchSettings } from '@/lib/web-search/types';
import type { DeveloperDebugSource } from '@/hooks/useDeveloperToolsStore';

const CHAT_PREFLIGHT_TIMEOUT_MS = 10_000;

interface RunStreamChatPreflightOptions {
  readonly assistantWebSearchProviderId?: string;
  readonly developerSource: DeveloperDebugSource;
  readonly isE2E: boolean;
  readonly modelId: string;
  readonly requestId: string;
  readonly signal: AbortSignal;
  readonly topicId: string;
  readonly webSearchSettings?: WebSearchSettings;
}

/** 导出类型：`RunStreamChatPreflightResult`。 */
export type RunStreamChatPreflightResult =
  | { kind: 'continue' }
  | { kind: 'paused'; message: I18nText }
  | { kind: 'error'; message: I18nText; details?: Message['errorDetails'] };

/**
 * 内部函数：`normalizePreflightError`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function normalizePreflightError(
  preflightError: unknown,
): RunStreamChatPreflightResult {
  if (preflightError instanceof DOMException && preflightError.name === 'AbortError') {
    return {
      kind: 'paused',
      message: { key: 'chat.generationCancelled' },
    };
  }
  if (preflightError instanceof I18nError && preflightError.i18n.key === 'errors.requestTimedOutOrDisconnected') {
    return {
      kind: 'error',
      message: { key: 'errors.requestTimedOutOrDisconnected' },
    };
  }
  const messageI18n = toI18nTextFromError(preflightError);
  return {
    kind: 'error',
    message: messageI18n,
    details: preflightError instanceof I18nError
      ? {
          messageI18n,
          name: preflightError.name,
          message: preflightError.message,
          ...(typeof preflightError.stack === 'string' && preflightError.stack.trim()
            ? { stack: preflightError.stack }
            : {}),
        }
      : undefined,
  };
}

/**
 * 导出函数：`runStreamChatPreflight`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function runStreamChatPreflight({
  assistantWebSearchProviderId,
  developerSource,
  isE2E,
  modelId,
  requestId,
  signal,
  topicId,
  webSearchSettings,
}: RunStreamChatPreflightOptions): Promise<RunStreamChatPreflightResult> {
  if (isE2E || signal.aborted) return { kind: 'continue' };

  let preflightPhase: 'waiting' | 'finished' = 'waiting';
  let rejectPreflightTimeout: ((reason?: unknown) => void) | null = null;
  let preflightTimer: ReturnType<typeof setTimeout> | null = null;
  let preflightAbortListener: (() => void) | null = null;

  const preflightTimeoutPromise = new Promise<never>((_, reject) => {
    rejectPreflightTimeout = reject;
  });
  const preflightAbortPromise = new Promise<never>((_, reject) => {
        /**
     * 内部函数变量：`abortNow`。
     *
     * @remarks
     * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
     */
    const abortNow = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) {
      abortNow();
      return;
    }
    preflightAbortListener = abortNow;
    signal.addEventListener('abort', abortNow, { once: true });
  });

    /**
   * 内部函数变量：`cleanupWatchdog`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const cleanupWatchdog = () => {
    if (preflightTimer) {
      clearTimeout(preflightTimer);
      preflightTimer = null;
    }
    if (preflightAbortListener) {
      signal.removeEventListener('abort', preflightAbortListener);
      preflightAbortListener = null;
    }
    preflightPhase = 'finished';
  };

    /**
   * 内部函数变量：`racePreflight`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const racePreflight = async <T>(promise: Promise<T>): Promise<T> => {
    if (preflightPhase === 'waiting') {
      return await Promise.race([promise, preflightTimeoutPromise, preflightAbortPromise]);
    }
    return await Promise.race([promise, preflightAbortPromise]);
  };

  emitDeveloperDebugEvent({
    requestId,
    source: developerSource,
    kind: 'chat_request_preflight_start',
    payload: { modelId, topicId },
  });

  preflightTimer = setTimeout(() => {
    if (preflightPhase !== 'waiting') return;
    emitDeveloperDebugEvent({
      requestId,
      source: developerSource,
      kind: 'chat_request_preflight_timeout',
      payload: { modelId, topicId },
    });
    rejectPreflightTimeout?.(new I18nError('errors.requestTimedOutOrDisconnected'));
  }, CHAT_PREFLIGHT_TIMEOUT_MS);

  try {
    if (assistantWebSearchProviderId && webSearchSettings) {
      try {
        const patterns = await racePreflight(Promise.resolve(
          getWebSearchNetworkHostMatchPatterns(
            assistantWebSearchProviderId as WebSearchProviderId,
            webSearchSettings,
          ),
        ));
        if (patterns.length > 0) {
          void patterns;
        }
      } catch (error) {
        const normalized = normalizePreflightError(error);
        if (normalized.kind === 'paused') {
          cleanupWatchdog();
          return normalized;
        }
        if (normalized.kind === 'error' && normalized.message.key === 'errors.requestTimedOutOrDisconnected') {
          cleanupWatchdog();
          return normalized;
        }
      }
    }
  } catch (error) {
    cleanupWatchdog();
    return normalizePreflightError(error);
  }

  cleanupWatchdog();
  return { kind: 'continue' };
}
