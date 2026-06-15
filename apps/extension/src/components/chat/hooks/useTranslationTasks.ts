/**
 * 说明：`useTranslationTasks` 组件模块。
 *
 * 职责：
 * - 承载 `useTranslationTasks` 相关的当前文件实现与模块边界；
 * - 对外暴露 `UseTranslationTasksOptions`、`UseTranslationTasksResult`、`useTranslationTasks` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { createId } from '@/lib/utils/id';
import { streamChatWithDeveloperMode as streamChat } from '@/lib/developer/stream-chat-with-developer-mode';
import type {
  Message,
  MessageTranslation,
  ResolvedConversationContext,
  UpdateTopicMessages,
} from '@/types/chat';
import type { ChatErrorDetails } from '@/lib/chat-stream';
import type { I18nText } from '@/types/i18n';

type AbortRegistryEntry = {
  controller: AbortController;
  topicId: string;
  kind: 'chat' | 'aux';
};

type TranslationTaskState = {
  reqId: string;
  topicId: string;
  messageId: string;
  language: string;
};

/** 导出类型：`UseTranslationTasksOptions`。 */
export interface UseTranslationTasksOptions {
  readonly topic: ResolvedConversationContext | null;
  readonly messagesAll: Message[];
  readonly latestMessagesRef: MutableRefObject<Message[]>;
  readonly abortControllersRef: MutableRefObject<Map<string, AbortRegistryEntry>>;
  readonly onUpdateMessages: UpdateTopicMessages;
}

/** 导出类型：`UseTranslationTasksResult`。 */
export interface UseTranslationTasksResult {
  readonly clearTranslations: (messageId: string) => void;
  readonly discardTranslationTaskByReqId: (reqId: string, options?: { removeLoading?: boolean }) => void;
  readonly removeTranslation: (messageId: string, language: string) => void;
  readonly translateAssistantMessage: (messageId: string, language: string) => Promise<void>;
}

/**
 * 内部函数：`buildTranslationTaskKey`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function buildTranslationTaskKey(messageId: string, language: string) {
  return `${messageId}::${language}`;
}

/**
 * 内部函数：`upsertTranslationItem`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function upsertTranslationItem(
  translations: Message['translations'],
  nextTranslation: MessageTranslation,
): MessageTranslation[] {
  const current = Array.isArray(translations) ? translations : [];
  const index = current.findIndex((translation) => translation.language === nextTranslation.language);
  if (index < 0) return [...current, nextTranslation];
  return current.map((translation, idx) => (idx === index ? nextTranslation : translation));
}

/**
 * 内部函数：`removeTranslationItem`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function removeTranslationItem(messages: Message[], messageId: string, language: string): Message[] | null {
  let changed = false;
  const next = messages.map((message) => {
    if (message.id !== messageId) return message;
    if (!Array.isArray(message.translations) || message.translations.length === 0) return message;
    const filtered = message.translations.filter((translation) => translation.language !== language);
    if (filtered.length === message.translations.length) return message;
    changed = true;
    return {
      ...message,
      ...(filtered.length > 0 ? { translations: filtered } : { translations: undefined }),
    };
  });
  return changed ? next : null;
}

/**
 * 内部函数：`clearAllTranslationItems`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function clearAllTranslationItems(messages: Message[], messageId: string): Message[] | null {
  let changed = false;
  const next = messages.map((message) => {
    if (message.id !== messageId) return message;
    if (!Array.isArray(message.translations) || message.translations.length === 0) return message;
    changed = true;
    return { ...message, translations: undefined };
  });
  return changed ? next : null;
}

/**
 * 内部函数：`upsertTranslationState`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function upsertTranslationState(
  messages: Message[],
  messageId: string,
  nextTranslation: MessageTranslation,
): Message[] | null {
  let changed = false;
  const next = messages.map((message) => {
    if (message.id !== messageId) return message;
    changed = true;
    return {
      ...message,
      translations: upsertTranslationItem(message.translations, nextTranslation),
    };
  });
  return changed ? next : null;
}

/**
 * 导出 Hook：`useTranslationTasks`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useTranslationTasks({
  topic,
  messagesAll,
  latestMessagesRef,
  abortControllersRef,
  onUpdateMessages,
}: UseTranslationTasksOptions) {
  const { t } = useTranslation();
  const topicMessageSnapshotsRef = useRef<Map<string, Message[]>>(new Map());
  const translationTasksRef = useRef<Map<string, TranslationTaskState>>(new Map());
  const translationTaskReqIndexRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!topic?.id) return;
    topicMessageSnapshotsRef.current.set(topic.id, messagesAll);
  }, [messagesAll, topic?.id]);

  const commitMessagesForTopic = useCallback((targetTopicId: string, nextMessages: Message[]) => {
    topicMessageSnapshotsRef.current.set(targetTopicId, nextMessages);
    if (topic?.id === targetTopicId) latestMessagesRef.current = nextMessages;
    onUpdateMessages(targetTopicId, nextMessages);
  }, [latestMessagesRef, onUpdateMessages, topic?.id]);

  const getMessagesSnapshotForTopic = useCallback((targetTopicId: string) => {
    if (topic?.id === targetTopicId) return latestMessagesRef.current;
    return topicMessageSnapshotsRef.current.get(targetTopicId) ?? [];
  }, [latestMessagesRef, topic?.id]);

  const removeTranslationEntryFromTopic = useCallback((targetTopicId: string, messageId: string, language: string) => {
    const current = getMessagesSnapshotForTopic(targetTopicId);
    const next = removeTranslationItem(current, messageId, language);
    if (!next) return;
    commitMessagesForTopic(targetTopicId, next);
  }, [commitMessagesForTopic, getMessagesSnapshotForTopic]);

  const clearTranslationEntriesForTopic = useCallback((targetTopicId: string, messageId: string) => {
    const current = getMessagesSnapshotForTopic(targetTopicId);
    const next = clearAllTranslationItems(current, messageId);
    if (!next) return;
    commitMessagesForTopic(targetTopicId, next);
  }, [commitMessagesForTopic, getMessagesSnapshotForTopic]);

  const upsertTranslationEntryForTopic = useCallback((targetTopicId: string, messageId: string, translation: MessageTranslation) => {
    const current = getMessagesSnapshotForTopic(targetTopicId);
    const next = upsertTranslationState(current, messageId, translation);
    if (!next) return;
    commitMessagesForTopic(targetTopicId, next);
  }, [commitMessagesForTopic, getMessagesSnapshotForTopic]);

  const releaseTranslationTask = useCallback((taskKey: string, expectedReqId?: string) => {
    const current = translationTasksRef.current.get(taskKey);
    if (!current) return;
    if (expectedReqId && current.reqId !== expectedReqId) return;
    translationTasksRef.current.delete(taskKey);
    translationTaskReqIndexRef.current.delete(current.reqId);
  }, []);

  const discardTranslationTaskByReqId = useCallback((reqId: string, options?: { removeLoading?: boolean }) => {
    const taskKey = translationTaskReqIndexRef.current.get(reqId);
    if (!taskKey) return;
    const task = translationTasksRef.current.get(taskKey);
    translationTaskReqIndexRef.current.delete(reqId);
    if (!task) return;
    translationTasksRef.current.delete(taskKey);
    if (options?.removeLoading) {
      removeTranslationEntryFromTopic(task.topicId, task.messageId, task.language);
    }
  }, [removeTranslationEntryFromTopic]);

  const cancelTranslationTask = useCallback((taskKey: string, options?: { removeLoading?: boolean }) => {
    const task = translationTasksRef.current.get(taskKey);
    if (!task) return;
    abortControllersRef.current.get(task.reqId)?.controller.abort();
    abortControllersRef.current.delete(task.reqId);
    translationTasksRef.current.delete(taskKey);
    translationTaskReqIndexRef.current.delete(task.reqId);
    if (options?.removeLoading) {
      removeTranslationEntryFromTopic(task.topicId, task.messageId, task.language);
    }
  }, [abortControllersRef, removeTranslationEntryFromTopic]);

  const cancelTranslationTasksForMessage = useCallback((targetTopicId: string, messageId: string, options?: { removeLoading?: boolean }) => {
    const taskKeys = Array.from(translationTasksRef.current.entries())
      .filter(([, task]) => task.topicId === targetTopicId && task.messageId === messageId)
      .map(([taskKey]) => taskKey);
    for (const taskKey of taskKeys) cancelTranslationTask(taskKey, options);
  }, [cancelTranslationTask]);

  const clearTranslations = useCallback((messageId: string) => {
    if (!topic) return;
    cancelTranslationTasksForMessage(topic.id, messageId);
    clearTranslationEntriesForTopic(topic.id, messageId);
  }, [cancelTranslationTasksForMessage, clearTranslationEntriesForTopic, topic]);

  const removeTranslation = useCallback((messageId: string, language: string) => {
    if (!topic) return;
    cancelTranslationTask(buildTranslationTaskKey(messageId, language));
    removeTranslationEntryFromTopic(topic.id, messageId, language);
  }, [cancelTranslationTask, removeTranslationEntryFromTopic, topic]);

  const translateAssistantMessage = useCallback(async (messageId: string, language: string) => {
    if (!topic) return;
    if (!language.trim()) return;

    const latest = latestMessagesRef.current;
    const target = latest.find((message) => message.id === messageId) ?? null;
    if (!target || target.role !== 'assistant') return;
    const sourceText = String(target.content || '').trim();
    if (!sourceText) return;

    const taskKey = buildTranslationTaskKey(messageId, language);
    cancelTranslationTask(taskKey);

        /**
     * 内部函数变量：`claimTask`。
     *
     * @remarks
     * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
     */
    const claimTask = (reqId: string) => {
      const current = translationTasksRef.current.get(taskKey);
      if (current) translationTaskReqIndexRef.current.delete(current.reqId);
      translationTasksRef.current.set(taskKey, { reqId, topicId: topic.id, messageId, language });
      translationTaskReqIndexRef.current.set(reqId, taskKey);
    };
        /**
     * 内部函数变量：`isTaskCurrent`。
     *
     * @remarks
     * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
     */
    const isTaskCurrent = (reqId: string) => translationTasksRef.current.get(taskKey)?.reqId === reqId;
        /**
     * 内部函数变量：`upsert`。
     *
     * @remarks
     * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
     */
    const upsert = (translation: MessageTranslation, reqId: string) => {
      if (!isTaskCurrent(reqId)) return;
      upsertTranslationEntryForTopic(topic.id, messageId, translation);
    };

    const system = t('translation.messageSystemPrompt');
    const prompt = t('translation.messageUserPrompt', { language, text: sourceText });

    const initialReservationId = createId();
    claimTask(initialReservationId);
    if (!isTaskCurrent(initialReservationId)) {
      releaseTranslationTask(taskKey, initialReservationId);
      return;
    }

        /**
     * 内部函数变量：`runTranslationAttempt`。
     *
     * @remarks
     * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
     */
    const runTranslationAttempt = async (): Promise<void> => {
      const reqId = createId();
      claimTask(reqId);

      const controller = new AbortController();
      abortControllersRef.current.set(reqId, { controller, topicId: topic.id, kind: 'aux' });

      let out = '';
      upsert({ language, status: 'loading', content: '' }, reqId);

      try {
        await new Promise<void>((resolve, reject) => {
          streamChat({
            developerSource: 'message-translation',
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: prompt },
            ],
            model: topic.model,
            temperature: 0.2,
            topP: 0.9,
            maxTokens: Math.min(2048, Math.max(256, topic.maxTokens || 2048)),
            signal: controller.signal,
            onDelta: (chunk) => {
              if (!isTaskCurrent(reqId)) return;
              out += chunk;
              upsert({ language, status: 'loading', content: out }, reqId);
            },
            onDone: () => resolve(),
            onError: (error, details) => reject({ error, details } satisfies { error: I18nText; details?: ChatErrorDetails }),
          });
        });
        if (controller.signal.aborted || !isTaskCurrent(reqId)) return;
        upsert({
          language,
          status: 'success',
          content: out,
        }, reqId);
      } catch (error) {
        if (controller.signal.aborted || !isTaskCurrent(reqId)) return;
        const failure = error as { error?: unknown; details?: ChatErrorDetails };
        const message: I18nText =
          failure.error && typeof failure.error === 'object' && 'key' in failure.error
            ? failure.error as I18nText
            : { key: 'errors.unknown' };
        upsert({
          language,
          status: 'error',
          content: '',
          error: message,
          ...(failure.details ? { errorDetails: { ...failure.details } } : {}),
        }, reqId);
      } finally {
        abortControllersRef.current.delete(reqId);
        releaseTranslationTask(taskKey, reqId);
      }
    };

    await runTranslationAttempt();
  }, [abortControllersRef, cancelTranslationTask, latestMessagesRef, releaseTranslationTask, t, topic, upsertTranslationEntryForTopic]);

  const result = {
    clearTranslations,
    discardTranslationTaskByReqId,
    removeTranslation,
    translateAssistantMessage,
  } satisfies UseTranslationTasksResult;

  return result;
}
