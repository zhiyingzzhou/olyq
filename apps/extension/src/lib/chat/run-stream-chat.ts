/**
 * 说明：`run-stream-chat` 基础能力模块。
 *
 * 职责：
 * - 承载 `run-stream-chat` 相关的当前文件实现与模块边界；
 * - 对外暴露 `runStreamChat` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useAssistantStore } from '@/hooks/useAssistantStore';
import { streamChatWithDeveloperMode as streamChat } from '@/lib/developer/stream-chat-with-developer-mode';
import {
  createAutoMcpServerSelection,
} from '@/lib/mcp/selection';
import { buildMemoryChatParams, getMemoryConfig } from '@/lib/memory';
import { getWebSearchSettings } from '@/lib/web-search/settings';
import type { Message, MessageUpdateOptions } from '@/types/chat';
import type { I18nText } from '@/types/i18n';
import { createId } from '@/lib/utils/id';
import {
  appendReasoningTrace,
  getTraceReasoningText,
  getTraceToolCalls,
  patchToolTrace,
  pushToolCallTrace,
} from '@/lib/chat/message-trace';

import { persistPendingStreamFiles } from './run-stream-chat-file-events';
import { runStreamChatPreflight } from './run-stream-chat-preflight';
import type {
  PendingStreamFile,
  RunStreamAssistantState,
  RunStreamChatOptions,
} from './run-stream-chat-types';

export type { BuildApiMessagesOptions, RunStreamChatOptions, SendMessageParams } from './run-stream-chat-types';

/**
 * 内部函数：`createAssistantSnapshot`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function createAssistantSnapshot(args: {
  askId?: string;
  assistantId: string;
  createdAt: number;
  modelId: string;
  state: RunStreamAssistantState;
}): Message {
  const { askId, assistantId, createdAt, modelId, state } = args;
  return {
    id: assistantId,
    role: 'assistant',
    askId,
    modelId,
    content: state.content,
    trace: state.trace.length > 0 ? [...state.trace] : undefined,
    ...(state.webSearchStatus ? { webSearchStatus: state.webSearchStatus } : {}),
    ...(state.webSearchResults && state.webSearchResults.length > 0 ? { webSearchResults: state.webSearchResults } : {}),
    ...(state.webSearchProviderId ? { webSearchProviderId: state.webSearchProviderId } : {}),
    ...(state.webSearchQuery ? { webSearchQuery: state.webSearchQuery } : {}),
    ...(state.webSearchError ? { webSearchError: state.webSearchError } : {}),
    status: state.status,
    ...(state.error ? { error: state.error } : {}),
    ...(state.errorDetails ? { errorDetails: state.errorDetails } : {}),
    ...(state.attachments.length > 0 ? { attachments: [...state.attachments] } : {}),
    createdAt,
  };
}

/**
 * 内部函数：`mergeUserGroupPrefsFromLatest`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function mergeUserGroupPrefsFromLatest(
  getLatestMessages: RunStreamChatOptions['getLatestMessages'],
  streamMessages: Array<Message | null>,
) {
  if (!getLatestMessages) return;
  const latest = getLatestMessages();
  if (!Array.isArray(latest) || latest.length === 0) return;

  const prefsById = new Map<string, NonNullable<Message['groupPrefs']>>();
  for (const message of latest) {
    if (message?.role !== 'user' || !message.groupPrefs) continue;
    prefsById.set(message.id, message.groupPrefs);
  }
  if (prefsById.size === 0) return;

  for (let index = 0; index < streamMessages.length; index += 1) {
    const message = streamMessages[index];
    if (!message || message.role !== 'user') continue;
    const groupPrefs = prefsById.get(message.id);
    if (!groupPrefs || message.groupPrefs === groupPrefs) continue;
    streamMessages[index] = { ...message, groupPrefs };
  }
}

/**
 * 把内部流式占位数组收窄为真实消息数组。
 *
 * 说明：
 * - `null` 只表示“assistant 回复正在生成、等待第一次快照写入”的内部占位；
 * - 对外写回 store 前必须经过这里，避免用双断言把占位伪装成真实 `Message`。
 */
function toCommittedStreamMessages(streamMessages: Array<Message | null>): Message[] {
  return streamMessages.filter((message): message is Message => message !== null);
}

/**
 * 内部函数：`toToolErrorPatch`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function toToolErrorPatch(rawError: I18nText) {
  return {
    status: 'error' as const,
    error: rawError,
  };
}

/**
 * 导出函数：`runStreamChat`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function runStreamChat(opts: RunStreamChatOptions) {
  const isE2E = import.meta.env.VITE_OLYQ_E2E === '1';
  const requestId = opts.requestId || createId();
  const developerSource = opts.developerSource ?? 'chat-topic';
  const useAssistantRuntimeFeatures = opts.useAssistantRuntimeFeatures !== false;
  const modelId = opts.modelId || opts.topic.model;
  const existingMessage = opts.mode === 'replace' ? opts.baseMsgs[opts.targetIndex] : null;
  const assistantId = existingMessage?.role === 'assistant' ? existingMessage.id : createId();
  const assistantCreatedAt = existingMessage?.role === 'assistant' ? existingMessage.createdAt : Date.now();
  const streamMessages: Array<Message | null> = [...opts.baseMsgs];
  if (opts.mode === 'insert') {
    streamMessages.splice(opts.targetIndex, 0, null);
  } else {
    streamMessages[opts.targetIndex] = null;
  }

  const assistantRuntime: RunStreamAssistantState = {
    attachments: [],
    content: '',
    status: 'processing',
    trace: [],
  };
  const pendingFiles: PendingStreamFile[] = [];
  let terminal = false;
  const terminalState: { kind: 'done' | 'error' | 'aborted' } = { kind: 'error' };
  let scheduledFlushHandle: number | null = null;
  let scheduledTouchTopicMeta = false;
  let initialAssistantSnapshotCommitted = false;

  /**
   * 内部函数变量：`cancelScheduledFlush`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const cancelScheduledFlush = () => {
    if (scheduledFlushHandle == null) return;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(scheduledFlushHandle);
    else window.clearTimeout(scheduledFlushHandle);
    scheduledFlushHandle = null;
  };

  /**
   * 内部函数变量：`commitSnapshot`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const commitSnapshot = (options?: MessageUpdateOptions) => {
    const assistantMessage = createAssistantSnapshot({
      askId: opts.askId,
      assistantId,
      createdAt: assistantCreatedAt,
      modelId,
      state: assistantRuntime,
    });
    const latest = opts.getLatestMessages?.();
    if (Array.isArray(latest) && latest.length > 0) {
      const existingIndex = latest.findIndex((message) => message.id === assistantId);
      if (existingIndex >= 0) {
        const merged = [...latest];
        merged[existingIndex] = assistantMessage;
        opts.onUpdateMessages(opts.topicId, merged, options);
        if (!initialAssistantSnapshotCommitted) {
          initialAssistantSnapshotCommitted = true;
          opts.onInitialAssistantSnapshotCommitted?.();
        }
        return;
      }
    }
    streamMessages[opts.targetIndex] = assistantMessage;
    mergeUserGroupPrefsFromLatest(opts.getLatestMessages, streamMessages);
    opts.onUpdateMessages(opts.topicId, toCommittedStreamMessages(streamMessages), options);
    if (!initialAssistantSnapshotCommitted) {
      initialAssistantSnapshotCommitted = true;
      opts.onInitialAssistantSnapshotCommitted?.();
    }
  };

  /**
   * 内部函数变量：`flushNow`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const flushNow = (options?: MessageUpdateOptions) => {
    cancelScheduledFlush();
    scheduledTouchTopicMeta = false;
    commitSnapshot(options);
  };

  /**
   * 内部函数变量：`scheduleFlush`。
   *
   * @remarks
   * 文本和 reasoning 的 stream delta 高频到来时，统一合并到同一帧再写 UI，
   * 避免每个 chunk 都触发一次完整消息树刷新和 topic meta 联动。
   */
  const scheduleFlush = (options?: MessageUpdateOptions) => {
    scheduledTouchTopicMeta ||= options?.touchTopicMeta !== false;
    if (scheduledFlushHandle != null) return;

    /**
     * 内部函数变量：`run`。
     *
     * @remarks
     * 把当前帧内合并好的 assistant 快照一次性写回 UI；
     * 逐 chunk 文本更新会汇总到这里，减少 React 与 topic store 的高频抖动。
     */
    const run = () => {
      scheduledFlushHandle = null;
      const nextTouchTopicMeta = scheduledTouchTopicMeta;
      scheduledTouchTopicMeta = false;
      commitSnapshot({ touchTopicMeta: nextTouchTopicMeta });
    };
    if (typeof requestAnimationFrame === 'function') scheduledFlushHandle = requestAnimationFrame(run);
    else scheduledFlushHandle = window.setTimeout(run, 16);
  };

    /**
   * 内部函数变量：`failBeforeStreamStarts`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const failBeforeStreamStarts = (message: I18nText, details?: Message['errorDetails']) => {
    assistantRuntime.status = 'error';
    assistantRuntime.error = message;
    assistantRuntime.errorDetails = details;
    flushNow();
    opts.onError(message, details);
  };

  const assistant = useAssistantRuntimeFeatures && opts.topic.assistantId
    ? useAssistantStore.getState().getAssistant(opts.topic.assistantId)
    : null;
  const assistantWebSearchProviderId = typeof assistant?.webSearchProviderId === 'string'
    ? assistant.webSearchProviderId.trim() || undefined
    : undefined;
  const webSearchSettings = opts.webSearchSettingsOverride === null
    ? undefined
    : (opts.webSearchSettingsOverride ?? (assistantWebSearchProviderId ? getWebSearchSettings() : undefined));
  const preflight = await runStreamChatPreflight({
    assistantWebSearchProviderId: opts.webSearchProviderIdOverride === null
      ? undefined
      : (opts.webSearchProviderIdOverride ?? assistantWebSearchProviderId),
    developerSource,
    isE2E,
    modelId,
    requestId,
    signal: opts.signal,
    topicId: opts.topicId,
    webSearchSettings,
  });

  if (preflight.kind === 'paused') {
    assistantRuntime.status = 'paused';
    assistantRuntime.error = preflight.message;
    flushNow();
    opts.onFinish();
    return;
  }
  if (preflight.kind === 'error') {
    failBeforeStreamStarts(preflight.message, preflight.details);
    return;
  }

  if (opts.signal.aborted) {
    assistantRuntime.status = 'paused';
    assistantRuntime.error = { key: 'chat.generationCancelled' };
    flushNow();
    opts.onFinish();
    return;
  }

  const topicKind = 'topic' as const;
  const mcpSelection = opts.topic.mcpSelection ?? createAutoMcpServerSelection();
  const memory = opts.memoryOverride === null
    ? undefined
    : (opts.memoryOverride ?? (useAssistantRuntimeFeatures
      ? buildMemoryChatParams({
          config: getMemoryConfig(),
          assistantEnableMemory: assistant?.enableMemory,
          assistantId: opts.topic.assistantId,
          userId: 'default-user',
        })
      : undefined));

  await new Promise<void>((resolve) => {
        /**
     * 内部函数变量：`finishOnce`。
     *
     * @remarks
     * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
     */
    const finishOnce = () => {
      if (terminal) return;
      terminal = true;
      resolve();
    };

    void streamChat({
      developerSource,
      requestId,
      messages: opts.apiMsgs,
      model: modelId,
      temperature: opts.topic.temperature,
      topP: opts.topic.topP,
      maxTokens: opts.topic.maxTokens,
      modelParams: opts.topic.modelParams,
      enableGenerateImage: opts.enableGenerateImageOverride ?? (useAssistantRuntimeFeatures ? opts.topic.enableGenerateImage : false),
      enableWebSearch: opts.enableWebSearchOverride ?? (useAssistantRuntimeFeatures ? Boolean(assistant?.enableWebSearch) : false),
      webSearchProviderId: opts.webSearchProviderIdOverride === null
        ? undefined
        : (opts.webSearchProviderIdOverride ?? assistantWebSearchProviderId),
      webSearchSettings,
      memory,
      topicKind,
      mcpSelection,
      signal: opts.signal,
      onDelta: (chunk) => {
        assistantRuntime.content += chunk;
        scheduleFlush({ touchTopicMeta: false });
      },
      onReasoning: (chunk) => {
        assistantRuntime.trace = appendReasoningTrace(assistantRuntime.trace, chunk);
        scheduleFlush({ touchTopicMeta: false });
      },
      onToolCall: (event) => {
        if (event.toolName === 'builtin__web_search') {
          assistantRuntime.webSearchStatus = 'searching';
          assistantRuntime.webSearchError = undefined;
          assistantRuntime.webSearchProviderId = assistantRuntime.webSearchProviderId || assistantWebSearchProviderId || undefined;
          flushNow();
          return;
        }
        assistantRuntime.trace = pushToolCallTrace(assistantRuntime.trace, { ...event, status: 'calling' });
        flushNow();
      },
      onToolResult: (event) => {
        assistantRuntime.trace = patchToolTrace(assistantRuntime.trace, event.toolCallId, {
          result: event.result,
          status: 'done',
        });
        if (event.toolName === 'builtin__web_search') {
          assistantRuntime.webSearchStatus = 'done';
          assistantRuntime.webSearchError = undefined;
          const payload = event.result as Record<string, unknown> | null;
          if (payload && typeof payload.providerId === 'string' && payload.providerId.trim()) {
            assistantRuntime.webSearchProviderId = payload.providerId.trim();
          }
          if (payload && typeof payload.query === 'string' && payload.query.trim()) {
            assistantRuntime.webSearchQuery = payload.query.trim();
          }
          if (payload && Array.isArray(payload.results)) {
            assistantRuntime.webSearchResults = payload.results
              .map((item) => (item && typeof item === 'object' ? item as Record<string, unknown> : null))
              .filter(Boolean)
              .map((item) => ({
                title: typeof item!.title === 'string' ? item!.title : '',
                url: typeof item!.url === 'string' ? item!.url : '',
                snippet: typeof item!.snippet === 'string' ? item!.snippet : '',
              }))
              .filter((item) => item.title || item.url || item.snippet);
          }
        }
        opts.onToolResultEvent?.(event);
        flushNow();
      },
      onToolError: (event) => {
        assistantRuntime.trace = patchToolTrace(
          assistantRuntime.trace,
          event.toolCallId,
          toToolErrorPatch(event.error),
        );
        if (event.toolName === 'builtin__web_search') {
          assistantRuntime.webSearchStatus = 'done';
          assistantRuntime.webSearchError = event.error || { key: 'errors.webSearchFailed' };
          assistantRuntime.webSearchProviderId = assistantRuntime.webSearchProviderId || assistantWebSearchProviderId || undefined;
          flushNow();
          return;
        }
        flushNow();
      },
      onSource: (event) => {
        const source = event.source;
        const url = String(source.url || '').trim();
        if (!url) return;
        const existing = assistantRuntime.webSearchResults ?? [];
        if (!existing.some((item) => item.url === url)) {
          assistantRuntime.webSearchResults = [
            ...existing,
            {
              title: String(source.title || ''),
              url,
              snippet: String(source.snippet || ''),
            },
          ];
        }
        assistantRuntime.webSearchStatus = 'done';
        assistantRuntime.webSearchError = undefined;
        assistantRuntime.webSearchProviderId = assistantRuntime.webSearchProviderId || String(modelId.split('/')[0] || 'model-native');
        flushNow();
      },
      onFile: (event) => {
        pendingFiles.push(event);
      },
      onDone: () => {
        if (terminal) return;
        terminalState.kind = 'done';
        finishOnce();
      },
      onAbort: () => {
        if (terminal) return;
        terminalState.kind = 'aborted';
        finishOnce();
      },
      onError: (error, details) => {
        if (terminal) return;
        terminalState.kind = 'error';
        assistantRuntime.status = 'error';
        assistantRuntime.error = error;
        assistantRuntime.errorDetails = details;
        flushNow();
        opts.onError(error, details);
        finishOnce();
      },
    });
  });

  const { attachments, imageDownloadError } = await persistPendingStreamFiles({
    developerSource,
    pendingFiles,
    requestId,
    terminalKind: terminalState.kind,
  });
  if (attachments.length > 0) {
    assistantRuntime.attachments = attachments;
  }

  if (terminalState.kind === 'done') {
    const hasAnyTextOutput = Boolean(
      String(assistantRuntime.content || '').trim() || getTraceReasoningText(assistantRuntime.trace).trim(),
    );
    const hasAnyToolOutput = getTraceToolCalls(assistantRuntime.trace).length > 0;
    const hasAnyOutput = hasAnyTextOutput || hasAnyToolOutput || assistantRuntime.attachments.length > 0;
    if (!hasAnyOutput && pendingFiles.length > 0) {
      assistantRuntime.status = 'error';
      assistantRuntime.error = imageDownloadError
        ? imageDownloadError
        : { key: 'errors.imageDownloadFailedGeneric' };
      flushNow();
      opts.onError(assistantRuntime.error);
      return;
    }

    assistantRuntime.status = 'success';
    flushNow();
    opts.onFinish();
    return;
  }

  if (terminalState.kind === 'aborted') {
    assistantRuntime.status = 'paused';
    assistantRuntime.error = assistantRuntime.error || { key: 'chat.generationCancelled' };
    flushNow();
    opts.onFinish();
    return;
  }

  if (pendingFiles.length > 0 && assistantRuntime.attachments.length > 0) {
    flushNow();
  }
}
