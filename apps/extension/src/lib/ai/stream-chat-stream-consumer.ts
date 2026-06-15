/**
 * 说明：`stream-chat-stream-consumer` AI 能力模块。
 *
 * 职责：
 * - 承载 `stream-chat-stream-consumer` 相关的当前文件实现与模块边界；
 * - 对外暴露 `consumeStreamTextResult` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { I18nError, isI18nError } from '@/lib/i18n/error';
import { i18nText } from '@/lib/i18n/text';
import { logger } from '@/lib/logger';
import { extractInlineImageFilesFromProviderMetadata, extractInlineImageUrlsFromProviderMetadata } from './openai-compatible/inline-images';
import {
  readActivityFromAiSdkPart,
  readActivityFromRawChunk,
} from './stream-chat-activity';
import { sanitizeRequestBodyValuesForDebug } from './stream-chat-debug';
import {
  buildNoOutputHintFromResponseBody,
  formatDebugPayload,
} from './stream-chat-errors';
import {
  buildNoOutputError,
  isAbortError,
  mapUsage,
} from './stream-chat-message-helpers';
import type { StreamChatDeps } from './stream-chat-types';
import type { StreamChatProgressStage } from './stream-chat-types';
import type { StreamChatEventEmitter } from './stream-chat-event-emitter';
import type { ProviderType, TransportProtocol } from './types';

interface ConsumeStreamTextResultOptions {
  readonly debugEnabled: boolean;
  readonly effectiveProviderType?: ProviderType;
  readonly emitter: StreamChatEventEmitter;
  readonly openaiCompatibleProviderKey: string | null;
  readonly providerId: string;
  readonly providerType?: ProviderType;
  readonly requestId: string;
  readonly result: ReturnType<StreamChatDeps['streamText']>;
  readonly signal: AbortSignal;
  readonly transportProtocol?: TransportProtocol;
  readonly wantsInlineImage: boolean;
  /** 自动 MCP 路由命中后，首步必须出现的工具名；存在时禁止先输出普通文本。 */
  readonly requiredFirstToolName?: string;
}

/**
 * 内部函数：`toToolErrorI18n`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function toToolErrorI18n(error: unknown) {
  if (isI18nError(error)) return error.i18n;
  const detail = (() => {
    if (error instanceof Error) return error.message;
    try {
      return typeof error === 'string' ? error : JSON.stringify(error);
    } catch {
      return String(error);
    }
  })();
  return detail
    ? i18nText('errors.toolExecutionFailedWithDetail', { detail })
    : i18nText('errors.toolExecutionFailed');
}

/**
 * 导出函数：`consumeStreamTextResult`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function consumeStreamTextResult({
  debugEnabled,
  effectiveProviderType,
  emitter,
  openaiCompatibleProviderKey,
  providerId,
  providerType,
  requestId,
  result,
  signal,
  transportProtocol,
  wantsInlineImage,
  requiredFirstToolName,
}: ConsumeStreamTextResultOptions): Promise<void> {
  let hasAssistantVisibleOutput = false;
  let hasUserVisibleOutput = false;
  let extractedInlineImages = false;
  let lastFinishUsage: { inputTokens?: number | null; outputTokens?: number | null } | undefined;
  let streamInterrupted = false;
  let streamCompleted = false;
  let streamReachedTerminalState = false;
  let requiredFirstToolCalled = false;
  const emittedSourceUrls = new Set<string>();

  /**
   * 一些链路会先给出 `start-step` / raw reasoning / `reasoning-start`
   * 这类进度事件，再在较晚时刻产出真正的正文 delta。这里统一把
   * “流确实还在推进”的事实下沉成 `chat/progress`，供 UI watchdog
   * 刷新首包/空闲计时，但不伪造任何可见内容。
   */
  const emitProgress = (stage: StreamChatProgressStage) => {
    emitter.safeEmit({ type: 'chat/progress', requestId, stage });
  };

  /**
   * 自动 MCP 路由命中后，首个用户可见行为必须是指定 MCP tool-call。
   * 这样可以把 provider 忽略 `toolChoice`、工具未真正进入请求、或 SDK 适配不支持强制工具
   * 这几类问题暴露成明确错误，而不是继续把普通聊天文本流给用户。
   */
  const assertRequiredFirstToolBeforeVisibleOutput = (kind: string) => {
    if (!requiredFirstToolName || requiredFirstToolCalled) return;
    throw new I18nError('errors.mcpForcedToolCallMissing', { tool: requiredFirstToolName, kind });
  };

  /**
   * 内部函数变量：`shouldIgnoreLateAbort`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const shouldIgnoreLateAbort = (error: unknown) =>
    isAbortError(error)
    && hasAssistantVisibleOutput
    && (signal.aborted || streamReachedTerminalState || streamCompleted);

  try {
    for await (const part of result.fullStream) {
      if (signal.aborted) {
        streamInterrupted = true;
        break;
      }

      const progressStage = part.type === 'raw'
        ? readActivityFromRawChunk(part.rawValue, { transportProtocol })
        : readActivityFromAiSdkPart(part);
      if (progressStage) emitProgress(progressStage);

      switch (part.type) {
        case 'start-step':
          emitter.emitDebug('ai-sdk/start-step', {
            request: { body: sanitizeRequestBodyValuesForDebug(part.request?.body) },
            warnings: part.warnings,
          });
          break;

        case 'text-start':
          break;

        case 'text-delta':
          if (part.text) {
            assertRequiredFirstToolBeforeVisibleOutput('text-delta');
            hasUserVisibleOutput = true;
            hasAssistantVisibleOutput = true;
            emitter.safeEmit({ type: 'chat/delta', requestId, delta: part.text });
          }
          break;

        case 'reasoning-start':
          break;

        case 'reasoning-delta':
          if (part.text) {
            assertRequiredFirstToolBeforeVisibleOutput('reasoning-delta');
            hasUserVisibleOutput = true;
            hasAssistantVisibleOutput = true;
            emitter.safeEmit({ type: 'chat/reasoning', requestId, delta: part.text });
          }
          break;

        case 'reasoning-end':
          break;

        case 'source':
          if (part.sourceType === 'url') {
            const url = typeof part.url === 'string' ? part.url.trim() : '';
            if (url && !emittedSourceUrls.has(url)) {
              emittedSourceUrls.add(url);
              hasUserVisibleOutput = true;
              emitter.safeEmit({
                type: 'chat/source',
                requestId,
                source: {
                  title: typeof part.title === 'string' ? part.title : '',
                  url,
                  snippet: '',
                },
              });
            }
          }
          break;

        case 'tool-input-start':
          break;

        case 'tool-input-delta':
          break;

        case 'tool-input-end':
          break;

        case 'tool-call':
          if (requiredFirstToolName && !requiredFirstToolCalled) {
            if (part.toolName !== requiredFirstToolName) {
              throw new I18nError('errors.mcpForcedToolCallMismatch', { expected: requiredFirstToolName, actual: part.toolName });
            }
            requiredFirstToolCalled = true;
          }
          hasUserVisibleOutput = true;
          emitter.safeEmit({
            type: 'chat/tool-call',
            requestId,
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: part.input,
          });
          break;

        case 'tool-result':
          hasUserVisibleOutput = true;
          emitter.safeEmit({
            type: 'chat/tool-result',
            requestId,
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: part.output,
          });
          break;

        case 'tool-error':
          hasUserVisibleOutput = true;
          emitter.safeEmit({
            type: 'chat/tool-error',
            requestId,
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: part.input,
            error: toToolErrorI18n(part.error),
          });
          break;

        case 'file':
          if (part.file?.base64 && part.file.mediaType?.startsWith('image/')) {
            assertRequiredFirstToolBeforeVisibleOutput('file');
            hasUserVisibleOutput = true;
            hasAssistantVisibleOutput = true;
            emitter.safeEmit({
              type: 'chat/file',
              requestId,
              data: part.file.base64,
              mediaType: part.file.mediaType,
            });
          }
          break;

        case 'finish-step':
          streamReachedTerminalState = true;
          lastFinishUsage = part.usage;
          emitter.emitDebug('ai-sdk/finish-step', {
            response: {
              id: part.response?.id,
              modelId: part.response?.modelId,
              timestamp: part.response?.timestamp,
              headers: part.response?.headers,
            },
            usage: part.usage,
            finishReason: part.finishReason,
            rawFinishReason: part.rawFinishReason,
            providerMetadata: part.providerMetadata,
          });

          if (wantsInlineImage && !extractedInlineImages && openaiCompatibleProviderKey) {
            const urls = extractInlineImageUrlsFromProviderMetadata(part.providerMetadata, providerId);
            const files = extractInlineImageFilesFromProviderMetadata(part.providerMetadata, providerId);
            if (files.length > 0) {
              extractedInlineImages = true;
              assertRequiredFirstToolBeforeVisibleOutput('inline-image-file');
              assertRequiredFirstToolBeforeVisibleOutput('inline-image-url');
              hasUserVisibleOutput = true;
              hasAssistantVisibleOutput = true;
              for (const file of files) {
                emitter.safeEmit({
                  type: 'chat/file',
                  requestId,
                  data: file.base64,
                  mediaType: file.mediaType,
                });
              }
              emitter.emitDebug('inline-image:from-metadata', { count: files.length, providerId });
            } else if (urls.length > 0) {
              extractedInlineImages = true;
              hasUserVisibleOutput = true;
              hasAssistantVisibleOutput = true;
              for (const url of urls) {
                emitter.safeEmit({ type: 'chat/file-url', requestId, url });
              }
              const preview = (() => {
                const first = urls[0] || '';
                if (!first) return '';
                if (first.startsWith('data:')) return `${first.slice(0, 60)}…`;
                try {
                  const parsed = new URL(first);
                  return `${parsed.origin}${parsed.pathname}`;
                } catch {
                  return first.slice(0, 120);
                }
              })();
              emitter.emitDebug('inline-image:urls', { providerId, count: urls.length, preview });
            }
          }
          break;

        case 'raw':
          emitter.emitDebug('ai-sdk/raw', formatDebugPayload(part.rawValue));
          break;

        case 'error':
          if (shouldIgnoreLateAbort(part.error)) {
            logger.chat.warn('streamChat ignored late abort from stream part after assistant output', {
              requestId,
            });
            emitter.emitDone(mapUsage(lastFinishUsage));
            return;
          }
          emitter.emitError(part.error);
          emitter.emitDone(undefined);
          return;
      }
    }

    streamCompleted = !streamInterrupted;

    if (!signal.aborted && requiredFirstToolName && !requiredFirstToolCalled) {
      throw new I18nError('errors.mcpForcedToolCallMissing', { tool: requiredFirstToolName, kind: 'stream-end' });
    }

    if (!signal.aborted && !hasUserVisibleOutput) {
      let noOutputHint: { key: string; params?: Record<string, unknown> } | null = null;
      try {
        const steps = await result.steps;
        const last = steps[steps.length - 1];
        noOutputHint = buildNoOutputHintFromResponseBody(
          last?.response?.body,
          effectiveProviderType || providerType,
          wantsInlineImage,
        );
      } catch {
        // 忽略 steps 读取失败，继续使用统一 no-output 错误。
      }
      if (noOutputHint) {
        throw new I18nError(noOutputHint.key, noOutputHint.params);
      }
      throw buildNoOutputError({ wantsInlineImage });
    }

    if (debugEnabled) {
      try {
        const steps = await result.steps;
        const last = steps[steps.length - 1];
        if (last) {
          emitter.emitDebug('ai-sdk/steps:last', {
            request: { body: sanitizeRequestBodyValuesForDebug(last.request?.body) },
            response: {
              id: last.response?.id,
              modelId: last.response?.modelId,
              timestamp: last.response?.timestamp,
              headers: last.response?.headers,
              body: formatDebugPayload(last.response?.body),
            },
            usage: last.usage,
            finishReason: last.finishReason,
            rawFinishReason: last.rawFinishReason,
            warnings: last.warnings,
            providerMetadata: last.providerMetadata,
          });
        }
      } catch (error) {
        emitter.emitDebug('ai-sdk/steps:error', error instanceof Error ? error.message : String(error));
      }
    }

    const usage = await result.usage;
    emitter.emitDone(mapUsage(usage));
  } catch (error) {
    if (streamCompleted && shouldIgnoreLateAbort(error)) {
      logger.chat.warn('streamChat ignored late abort after completed stream', {
        requestId,
      });
      emitter.emitDone(mapUsage(lastFinishUsage));
      return;
    }
    throw error;
  }
}
