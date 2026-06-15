/**
 * 说明：`stream-chat-generate-result` AI 能力模块。
 *
 * 职责：
 * - 承载 `stream-chat-generate-result` 相关的当前文件实现与模块边界；
 * - 对外暴露 `processGenerateTextResult` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { I18nError } from '@/lib/i18n/error';
import { sanitizeRequestBodyValuesForDebug } from './stream-chat-debug';
import { buildNoOutputError, mapUsage } from './stream-chat-message-helpers';
import { buildNoOutputHintFromResponseBody, formatDebugPayload } from './stream-chat-errors';
import type { StreamChatDeps } from './stream-chat-types';
import type { StreamChatEventEmitter } from './stream-chat-event-emitter';
import type { ProviderType } from './types';

interface ProcessGenerateTextResultOptions {
  readonly debugKind: string;
  readonly effectiveProviderType?: ProviderType;
  readonly emitFiles: boolean;
  readonly emitter: StreamChatEventEmitter;
  readonly noOutputWantsInlineImage: boolean;
  readonly providerType?: ProviderType;
  readonly requestId: string;
  /** 自动 MCP 路由命中后，非流式结果也必须先包含这个工具调用。 */
  readonly requiredFirstToolName?: string;
  readonly result: Awaited<ReturnType<StreamChatDeps['generateText']>>;
  readonly signal: AbortSignal;
}

/**
 * 导出函数：`processGenerateTextResult`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function processGenerateTextResult({
  debugKind,
  effectiveProviderType,
  emitFiles,
  emitter,
  noOutputWantsInlineImage,
  providerType,
  requestId,
  requiredFirstToolName,
  result,
  signal,
}: ProcessGenerateTextResultOptions) {
  emitter.emitDebug(debugKind, {
    request: { body: sanitizeRequestBodyValuesForDebug(result.request?.body) },
    response: {
      id: result.response?.id,
      modelId: result.response?.modelId,
      timestamp: result.response?.timestamp,
      headers: result.response?.headers,
      body: formatDebugPayload(result.response?.body),
    },
    usage: result.usage,
    finishReason: result.finishReason,
    rawFinishReason: result.rawFinishReason,
    warnings: result.warnings,
    providerMetadata: result.providerMetadata,
  });

  let hasUserVisibleOutput = false;
  const resultRecord = result as unknown as {
    toolCalls?: Array<{ toolName?: unknown }>;
    steps?: Array<{ toolCalls?: Array<{ toolName?: unknown }> }>;
  };
  const generatedToolCalls = [
    ...(Array.isArray(resultRecord.toolCalls) ? resultRecord.toolCalls : []),
    ...(Array.isArray(resultRecord.steps)
      ? resultRecord.steps.flatMap((step) => (Array.isArray(step.toolCalls) ? step.toolCalls : []))
      : []),
  ];
  const requiredFirstToolCalled = requiredFirstToolName
    ? generatedToolCalls.some((item) => item?.toolName === requiredFirstToolName)
    : false;

  /** 非流式结果没有 `fullStream` 顺序事件，只能在任何可见输出前校验目标工具是否出现。 */
  const assertRequiredFirstToolBeforeVisibleOutput = (kind: string) => {
    if (!requiredFirstToolName || requiredFirstToolCalled) return;
    throw new I18nError('errors.mcpForcedToolCallMissing', { tool: requiredFirstToolName, kind });
  };

  if (result.reasoningText) {
    assertRequiredFirstToolBeforeVisibleOutput('generateText:reasoning');
    hasUserVisibleOutput = true;
    emitter.safeEmit({ type: 'chat/reasoning', requestId, delta: result.reasoningText });
  }

  if (result.text) {
    assertRequiredFirstToolBeforeVisibleOutput('generateText:text');
    hasUserVisibleOutput = true;
    emitter.safeEmit({ type: 'chat/delta', requestId, delta: result.text });
  }

  if (emitFiles) {
    for (const file of result.files || []) {
      if (file?.base64 && file.mediaType?.startsWith('image/')) {
        assertRequiredFirstToolBeforeVisibleOutput('generateText:file');
        hasUserVisibleOutput = true;
        emitter.safeEmit({ type: 'chat/file', requestId, data: file.base64, mediaType: file.mediaType });
      }
    }
  }

  const emittedSourceUrls = new Set<string>();
  for (const source of result.sources || []) {
    if (source.sourceType !== 'url') continue;
    const url = typeof source.url === 'string' ? source.url.trim() : '';
    if (!url || emittedSourceUrls.has(url)) continue;
    emittedSourceUrls.add(url);
    hasUserVisibleOutput = true;
    emitter.safeEmit({
      type: 'chat/source',
      requestId,
      source: {
        title: typeof source.title === 'string' ? source.title : '',
        url,
        snippet: '',
      },
    });
  }

  if (!signal.aborted && requiredFirstToolName && !requiredFirstToolCalled) {
    throw new I18nError('errors.mcpForcedToolCallMissing', { tool: requiredFirstToolName, kind: 'generateText:end' });
  }

  if (!signal.aborted && !hasUserVisibleOutput) {
    const noOutputHint = buildNoOutputHintFromResponseBody(
      result.response?.body,
      effectiveProviderType || providerType,
      noOutputWantsInlineImage,
    );
    if (noOutputHint) {
      throw new I18nError(noOutputHint.key, noOutputHint.params);
    }
    throw buildNoOutputError({ wantsInlineImage: noOutputWantsInlineImage });
  }

  emitter.emitDone(mapUsage(result.usage));
}
