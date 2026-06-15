/**
 * 说明：`stream-chat` AI 能力模块。
 *
 * 职责：
 * - 承载 `stream-chat` 相关的当前文件实现与模块边界；
 * - 对外暴露 `streamChat` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 基于 Vercel AI SDK 的统一流式聊天入口。
 *
 * 数据链路：UI（Port）→ service-worker.ts → streamChat() → AI SDK → 通过 Port 回传增量事件。
 */

import {
  generateText as aiGenerateText,
  streamText as aiStreamText,
  type LanguageModelMiddleware,
  type ToolSet,
} from 'ai';

import { I18nError } from '@/lib/i18n/error';
import { logger } from '@/lib/logger';

import { rememberUnsupportedOpenAiResponsesStoreTarget } from './openai-responses-store-capability';
import { createStreamChatEventEmitter } from './stream-chat-event-emitter';
import { processGenerateTextResult } from './stream-chat-generate-result';
import {
  getFileInputError,
  getImageInputError,
  hasFileAttachments,
  hasImageAttachments,
  supportsFileInput,
  supportsVisionInput,
  toAiSdkMessages,
} from './stream-chat-message-helpers';
import { consumeStreamTextResult } from './stream-chat-stream-consumer';
import { shouldIncludeRawChunksForActivity } from './stream-chat-activity';
import { buildRuntimeCallPlan, resolveStreamContext } from './stream-chat-context';
import { mergeToolSets, resolveNativeWebSearchPatch } from './native-web-search';
import {
  buildRuntimeTextCallArgs,
  resolveRuntimeTextExecutionMode,
} from './runtime-text-call';
import { createChatSmoothStreamTransform } from './chat-stream-smoothing';
import type { StreamChatDeps, StreamChatEvent, StreamChatOptions } from './stream-chat-types';

export type {
  StreamChatDebugEvent,
  StreamChatDeltaEvent,
  StreamChatDeps,
  StreamChatDoneEvent,
  StreamChatErrorEvent,
  StreamChatEvent,
  StreamChatFileEvent,
  StreamChatFileUrlEvent,
  StreamChatMemoryChangedEvent,
  StreamChatMemoryErrorEvent,
  StreamChatProgressEvent,
  StreamChatOptions,
  StreamChatReasoningEvent,
  StreamChatSourceEvent,
  StreamChatToolCallEvent,
  StreamChatToolErrorEvent,
  StreamChatToolResultEvent,
  StreamChatUsage,
} from './stream-chat-types';
export type { StreamChatErrorDetails } from './stream-chat-errors';

/**
 * 内部函数：`resolveDeps`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function resolveDeps(overrides?: Partial<StreamChatDeps>): StreamChatDeps {
  return {
    streamText: aiStreamText,
    generateText: aiGenerateText,
    resolveStreamContext,
    buildRuntimeCallPlan,
    ...(overrides ?? {}),
  };
}

/**
 * 从 OpenAI Responses 原始 chunk 中提取服务端实际接受的 `store` 值。
 *
 * 说明：
 * - 只认 `response.created` 事件；
 * - 一旦上游真实返回 `store=false`，后续 step 需要立即停用 `item_reference`，
 *   否则 AI SDK 会继续引用上一轮未落库的 `fc_*` / `msg_*` 条目并触发 404。
 */
function readOpenAiResponsesStoreFromRawChunk(rawValue: unknown): boolean | undefined {
  if (!rawValue || typeof rawValue !== 'object') return undefined;
  const chunk = rawValue as { type?: unknown; response?: unknown };
  if (chunk.type !== 'response.created') return undefined;
  if (!chunk.response || typeof chunk.response !== 'object') return undefined;
  const response = chunk.response as { store?: unknown };
  return typeof response.store === 'boolean' ? response.store : undefined;
}

/**
 * 创建 OpenAI Responses `store` 探针 middleware。
 *
 * 说明：
 * - 运行时会强制打开 raw chunks，仅用于内部探测 `response.created.store`；
 * - 若调用方原本没请求 raw chunks，会在 middleware 内把 raw 事件重新吞掉，
 *   保持对外行为不变；
 * - 探测到上游真实 `store=false` 后，外层 `prepareStep` 会在下一 step 强制退回
 *   `providerOptions.openai.store=false`，避免继续发送无效 `item_reference`。
 */
function createOpenAiResponsesStoreProbeMiddleware(
  onObservedStore: (store: boolean) => void,
): LanguageModelMiddleware {
  let requestedIncludeRawChunks = false;

  return {
    specificationVersion: 'v3',
    transformParams: async ({ params, type }) => {
      if (type !== 'stream') return params;
      requestedIncludeRawChunks = Boolean(params.includeRawChunks);
      return requestedIncludeRawChunks ? params : { ...params, includeRawChunks: true };
    },
    wrapStream: async ({ doStream }) => {
      const result = await doStream();
      return {
        ...result,
        stream: result.stream.pipeThrough(
          new TransformStream({
            /**
             * 拦截 OpenAI Responses 原始 chunk，仅提取首步 `response.created.store` 真值。
             *
             * 说明：
             * - raw chunk 会先用于探测上游真实是否接受了 `store=true`；
             * - 若外部调用方原本没有请求 raw chunks，这里会在完成探测后直接吞掉 raw 事件；
             * - 其它事件保持原样透传，避免改变现有流式消费语义。
             */
            transform(chunk, controller) {
              if (chunk.type === 'raw') {
                const observedStore = readOpenAiResponsesStoreFromRawChunk(chunk.rawValue);
                if (observedStore !== undefined) {
                  onObservedStore(observedStore);
                }
                if (!requestedIncludeRawChunks) return;
              }
              controller.enqueue(chunk);
            },
          }),
        ),
      };
    },
  };
}

/**
 * 导出函数：`streamChat`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function streamChat({
  requestId,
  params,
  onEvent,
  signal,
  tools,
  deps: overrideDeps,
}: StreamChatOptions): Promise<void> {
  const deps = resolveDeps(overrideDeps);
  const debugEnabled = Boolean(params.debug);
  const emitter = createStreamChatEventEmitter({
    debugEnabled,
    onEvent: onEvent as (event: StreamChatEvent) => void,
    requestId,
    signal,
  });

  try {
    const ctx = await deps.resolveStreamContext(params);
    const {
      providerId,
      modelId,
      providerConfig,
      providerType,
      effectiveProviderType,
      openaiCompatibleProviderKey,
      modelConfig,
      resolvedModelMeta,
      featureKeys,
      providerContract,
    } = ctx;

    if (signal.aborted) return;

    if (hasImageAttachments(params.messages)) {
      const providerImageError = getImageInputError({
        providerName: providerConfig?.name || providerId,
        contract: providerContract,
        transportProtocol: resolvedModelMeta.transportProtocol,
      });
      if (providerImageError) throw providerImageError;
      if (
        providerConfig?.apiOptions?.isNotSupportImageInput
      ) {
        throw new I18nError('errors.imageInputNotSupportedByProvider', { providerName: providerConfig?.name || providerId });
      }
      if (!supportsVisionInput({
          kind: resolvedModelMeta.kind,
          inputModalities: resolvedModelMeta.inputModalities,
          featureKeys,
        })) {
        throw new I18nError('errors.imageInputModelNotRecognized');
      }
    }

    if (hasFileAttachments(params.messages)) {
      if (providerConfig?.apiOptions?.isNotSupportFileInput) {
        throw new I18nError('errors.fileInputNotSupportedByProvider', { providerName: providerConfig?.name || providerId });
      }
      const providerFileError = getFileInputError({
        providerId,
        providerName: providerConfig?.name || providerId,
        contract: providerContract,
        transportProtocol: resolvedModelMeta.transportProtocol,
        messages: params.messages,
      });
      if (providerFileError) throw providerFileError;
      if (!supportsFileInput({
        inputModalities: resolvedModelMeta.inputModalities,
        featureKeys,
      })) {
        throw new I18nError('errors.fileInputModelNotRecognized');
      }
    }

    const messages = toAiSdkMessages(params.messages);
    const nativeWebSearchPatch = await resolveNativeWebSearchPatch(ctx, params, tools);
    const requestedTools: ToolSet | undefined = mergeToolSets(tools, nativeWebSearchPatch?.tools);
    const runtimeCallPlan = await deps.buildRuntimeCallPlan(
      ctx,
      params,
      requestedTools as Record<string, unknown> | undefined,
      { providerOptionsPatch: nativeWebSearchPatch?.providerOptions },
    );
    const wantsInlineImage = runtimeCallPlan.wantsInlineImage;
    const hasRequestedTools = Boolean(requestedTools && Object.keys(requestedTools).length > 0);
    if (hasRequestedTools && !runtimeCallPlan.toolParameterSupport.tools && params.forcedFirstToolName) {
      throw new I18nError('errors.modelToolCallingNotSupported');
    }
    if (
      hasRequestedTools
      && runtimeCallPlan.toolParameterSupport.tools
      && !runtimeCallPlan.toolParameterSupport.toolChoice
      && params.forcedFirstToolName
    ) {
      throw new I18nError('errors.modelToolChoiceNotSupported', { tool: params.forcedFirstToolName });
    }
    const toolEnabled = hasRequestedTools && runtimeCallPlan.toolParameterSupport.tools;
    const shouldProbeOpenAiResponsesStore = Boolean(
      toolEnabled
      && runtimeCallPlan.openAiResponsesStoreAutoStrategyApplied
      && runtimeCallPlan.openAiResponsesStoreValue === true
      && !runtimeCallPlan.openAiResponsesStoreKnownUnsupported,
    );
    const topicKind = params.topicKind ?? 'topic';
    const shouldForceWebSearchFirstStep = Boolean(
      toolEnabled
      && topicKind === 'topic'
      && runtimeCallPlan.toolParameterSupport.toolChoice
      && requestedTools
      && typeof requestedTools.builtin__web_search !== 'undefined',
    );
    const shouldForceMcpFirstStep = Boolean(
      toolEnabled
      && topicKind === 'topic'
      && params.forcedFirstToolName
      && runtimeCallPlan.toolParameterSupport.toolChoice
      && requestedTools
      && typeof requestedTools[params.forcedFirstToolName] !== 'undefined',
    );

    if (topicKind === 'topic' && params.forcedFirstToolName && !shouldForceMcpFirstStep) {
      throw new I18nError('errors.mcpForcedToolUnavailable', { tool: params.forcedFirstToolName });
    }
    let observedOpenAiResponsesStoreValue = runtimeCallPlan.openAiResponsesStoreValue;
    let openAiResponsesStoreMismatchLogged = false;
    let openAiResponsesStoreFallbackLogged = false;

    const additionalMiddlewares: LanguageModelMiddleware[] = [];
    if (shouldProbeOpenAiResponsesStore) {
      additionalMiddlewares.push(
        createOpenAiResponsesStoreProbeMiddleware((store) => {
          observedOpenAiResponsesStoreValue = store;
          if (
            !openAiResponsesStoreMismatchLogged
            && store !== runtimeCallPlan.openAiResponsesStoreValue
          ) {
            openAiResponsesStoreMismatchLogged = true;
            logger.chat.warn('streamChat observed OpenAI Responses store mismatch', {
              requestId,
              providerId,
              modelId,
              intendedStore: runtimeCallPlan.openAiResponsesStoreValue,
              observedStore: store,
            });
            void rememberUnsupportedOpenAiResponsesStoreTarget({
              providerId,
              modelId,
              effectiveProviderType,
              transportProtocol: resolvedModelMeta.transportProtocol,
              apiHost: providerConfig?.apiHost,
            }).catch(() => {
              logger.chat.warn('streamChat failed to persist unsupported OpenAI Responses store target', {
                requestId,
                providerId,
                modelId,
              });
            });
          }
        }),
      );
    }

    if (debugEnabled) {
      logger.chat.debug('streamChat resolved', {
        requestId,
        providerId,
        providerType: providerType ?? '',
        effectiveProviderType: effectiveProviderType ?? '',
        modelId,
        kind: resolvedModelMeta.kind,
        toolEnabled,
        hasInjectedMcpTools: runtimeCallPlan.hasInjectedMcpTools,
        wantsInlineImage,
        shouldForceWebSearchFirstStep,
        shouldForceMcpFirstStep,
        forcedFirstToolName: shouldForceMcpFirstStep ? params.forcedFirstToolName : undefined,
        nativeWebSearch: nativeWebSearchPatch
          ? {
              state: nativeWebSearchPatch.capability.state,
              injectionKind: nativeWebSearchPatch.capability.injectionKind,
              toolName: nativeWebSearchPatch.capability.toolName,
              officialEntry: nativeWebSearchPatch.capability.officialEntry,
            }
          : undefined,
        openAiResponsesStoreAutoStrategyApplied: runtimeCallPlan.openAiResponsesStoreAutoStrategyApplied,
        openAiResponsesStoreKnownUnsupported: runtimeCallPlan.openAiResponsesStoreKnownUnsupported,
        openAiResponsesStoreValue: runtimeCallPlan.openAiResponsesStoreValue,
      });
    }

    const execution = resolveRuntimeTextExecutionMode(
      runtimeCallPlan,
      modelConfig?.supportedTextDelta,
    );
    const callArgs = buildRuntimeTextCallArgs({
      runtimeCallPlan,
      messages,
      signal,
      additionalMiddlewares,
      ...(toolEnabled
        ? {
            tools: requestedTools,
            stopWhen: ({ steps }: { steps: ReadonlyArray<unknown> }) => steps.length >= 5,
          }
        : {}),
      ...(shouldForceWebSearchFirstStep || shouldForceMcpFirstStep || shouldProbeOpenAiResponsesStore
        ? {
            prepareStep: ({ stepNumber }: { stepNumber: number }) => {
              const nextStepConfig: Record<string, unknown> = {};

              if (shouldForceWebSearchFirstStep) {
                nextStepConfig.toolChoice =
                  stepNumber === 0
                    ? { type: 'tool' as const, toolName: 'builtin__web_search' }
                    : 'auto';
              }

              if (shouldForceMcpFirstStep && params.forcedFirstToolName) {
                nextStepConfig.toolChoice =
                  stepNumber === 0
                    ? { type: 'tool' as const, toolName: params.forcedFirstToolName }
                    : 'auto';
              }

              if (
                shouldProbeOpenAiResponsesStore
                && stepNumber > 0
                && observedOpenAiResponsesStoreValue === false
              ) {
                nextStepConfig.providerOptions = {
                  openai: {
                    store: false,
                  },
                };
                if (!openAiResponsesStoreFallbackLogged) {
                  openAiResponsesStoreFallbackLogged = true;
                  logger.chat.warn('streamChat disabled OpenAI Responses store for follow-up steps', {
                    requestId,
                    providerId,
                    modelId,
                    fallbackStepNumber: stepNumber,
                  });
                }
              }

              return Object.keys(nextStepConfig).length > 0 ? nextStepConfig : undefined;
            },
          }
        : {}),
    });

    if (execution.mode === 'generateText' && execution.reason === 'runtime-plan') {
      if (debugEnabled) {
        logger.chat.debug('streamChat mode=generateText', { requestId, providerId, modelId });
      }
      const result = await deps.generateText(callArgs);
      processGenerateTextResult({
        debugKind: 'ai-sdk/generateText',
        effectiveProviderType,
        emitFiles: wantsInlineImage,
        emitter,
        noOutputWantsInlineImage: wantsInlineImage,
        providerType,
        requestId,
        requiredFirstToolName: shouldForceMcpFirstStep ? params.forcedFirstToolName : undefined,
        result,
        signal,
      });
      return;
    }

    if (execution.mode === 'generateText' && execution.reason === 'no-text-delta') {
      if (debugEnabled) {
        logger.chat.debug('streamChat mode=generateText (no text-delta)', {
          requestId,
          providerId,
          modelId,
        });
      }
      const result = await deps.generateText(callArgs);
      processGenerateTextResult({
        debugKind: 'ai-sdk/generateText:no-text-delta',
        effectiveProviderType,
        emitFiles: false,
        emitter,
        noOutputWantsInlineImage: false,
        providerType,
        requestId,
        requiredFirstToolName: shouldForceMcpFirstStep ? params.forcedFirstToolName : undefined,
        result,
        signal,
      });
      return;
    }

    /**
     * 已验证的 reasoning/thinking 流会先吐非正文 raw chunk。
     *
     * 说明：
     * - developer mode 仍只决定 `chat/debug` 是否外发；
     * - raw chunks 的内部开启由 stream-chat-activity 统一判定，供 watchdog/store probe 消费；
     * - 非目标 transport 不开启 raw，避免把未知 provider chunk 扩散成隐式心跳。
     */
    const shouldIncludeRawChunks = debugEnabled || shouldIncludeRawChunksForActivity({
      transportProtocol: resolvedModelMeta.transportProtocol,
    });

    const result = deps.streamText({
      ...callArgs,
      experimental_transform: createChatSmoothStreamTransform(),
      ...(shouldIncludeRawChunks ? { includeRawChunks: true } : {}),
    });

    await consumeStreamTextResult({
      debugEnabled,
      effectiveProviderType,
      emitter,
      openaiCompatibleProviderKey,
      providerId,
      providerType,
      requestId,
      result,
      signal,
      transportProtocol: resolvedModelMeta.transportProtocol,
      wantsInlineImage,
      requiredFirstToolName: shouldForceMcpFirstStep ? params.forcedFirstToolName : undefined,
    });
  } catch (error) {
    emitter.emitError(error);
    emitter.emitDone(undefined);
  }
}
