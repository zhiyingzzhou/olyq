/**
 * 说明：`useChatAreaMessageActions` 组件模块。
 *
 * 职责：
 * - 承载 `useChatAreaMessageActions` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useChatAreaMessageActions` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";
import { createId } from "@/lib/utils/id";
import { toast } from "@/hooks/useToast";
import { postUiPortMessage } from "@/extension/bridge/ui-port";
import { deleteAttachments } from "@/lib/attachments";
import { generateSpeechAttachment } from "@/lib/speech";
import { useChatStore } from "@/hooks/useChatStore";
import { useAssistantStore } from "@/hooks/useAssistantStore";
import { useChatSettingsStore } from "@/hooks/useChatSettingsStore";
import { isContextDividerMessage } from "@/lib/chat/chat-utils";
import { getMessageToolCalls, patchToolTrace } from "@/lib/chat/message-trace";
import { toI18nTextFromError } from "@/lib/i18n/error";
import { confirmClearTopicMessages } from "../confirmClearTopicMessages";
import type {
  Message,
  ResolvedConversationContext,
  ToolCallInfo,
  UpdateTopicMessages,
} from "@/types/chat";

/**
 * 导出 Hook：`useChatAreaMessageActions`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useChatAreaMessageActions(params: {
  abortControllersRef: MutableRefObject<Map<string, { controller: AbortController; topicId: string; kind: "chat" | "aux" }>>;
  cleanupUnusedAttachments: (removed: Message[], remaining: Message[]) => void;
  confirm: (options: {
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "destructive";
  }) => Promise<boolean>;
  discardTranslationTaskByReqId: (requestId: string, options?: { removeLoading?: boolean }) => void;
  inputWrapRef: RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  latestMessagesRef: MutableRefObject<Message[]>;
  onUpdateMessages: UpdateTopicMessages;
  setExpandedThinkingIds: Dispatch<SetStateAction<Set<string>>>;
  scrollToBottom: () => void;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  t: (key: string, params?: Record<string, unknown>) => string;
  topic: ResolvedConversationContext | null;
}) {
  const {
    abortControllersRef,
    cleanupUnusedAttachments,
    confirm,
    discardTranslationTaskByReqId,
    inputWrapRef,
    isLoading,
    latestMessagesRef,
    onUpdateMessages,
    scrollToBottom,
    setExpandedThinkingIds,
    setIsLoading,
    t,
    topic,
  } = params;

  const patchToolCallInMessages = useCallback((toolCallIdRaw: string, patch: Partial<ToolCallInfo>) => {
    if (!topic) return;
    const toolCallId = String(toolCallIdRaw || "").trim();
    if (!toolCallId) return;
    let changed = false;
    const next = latestMessagesRef.current.map((message) => {
      const toolCalls = getMessageToolCalls(message);
      if (toolCalls.length === 0) return message;
      const nextTrace = patchToolTrace(message.trace, toolCallId, patch);
      if (nextTrace === message.trace) return message;
      changed = true;
      return { ...message, trace: nextTrace };
    });
    if (changed) onUpdateMessages(topic.id, next);
  }, [latestMessagesRef, onUpdateMessages, topic]);

  const appendAttachmentToMessage = useCallback((messageIdRaw: string, attachment: NonNullable<Message["attachments"]>[number]) => {
    if (!topic) return false;
    const messageId = String(messageIdRaw || "").trim();
    if (!messageId) return false;

    let changed = false;
    const next = latestMessagesRef.current.map((message) => {
      if (message.id !== messageId) return message;
      changed = true;
      return {
        ...message,
        attachments: [...(message.attachments || []), attachment],
      };
    });

    if (changed) onUpdateMessages(topic.id, next);
    return changed;
  }, [latestMessagesRef, onUpdateMessages, topic]);

  const handleToolAbort = useCallback((toolCallIdRaw: string) => {
    const toolCallId = String(toolCallIdRaw || "").trim();
    if (!toolCallId) return;
    const ok = postUiPortMessage({ type: "chat/tool-abort", toolCallId });
    if (!ok) {
      toast({ title: t("common.error"), description: t("chat.toolPortUnavailable"), variant: "destructive" });
      return;
    }
    patchToolCallInMessages(toolCallId, { status: "cancelled", error: { key: "chat.toolAborted" } });
    toast({ title: t("common.cancelled"), description: t("chat.toolAbortRequested") });
  }, [patchToolCallInMessages, t]);

  const setThinkingExpanded = useCallback((messageId: string, next: boolean) => {
    const id = String(messageId || "").trim();
    if (!id) return;
    setExpandedThinkingIds((prev) => {
      const has = prev.has(id);
      if (next === has) return prev;
      const output = new Set(prev);
      if (next) output.add(id);
      else output.delete(id);
      return output;
    });
  }, [setExpandedThinkingIds]);

  const stopGeneration = useCallback(() => {
    for (const [requestId, entry] of abortControllersRef.current) {
      if (entry.kind === "aux") discardTranslationTaskByReqId(requestId, { removeLoading: true });
      entry.controller.abort();
    }
    abortControllersRef.current.clear();
    setIsLoading(false);
  }, [abortControllersRef, discardTranslationTaskByReqId, setIsLoading]);

  const toggleNewContext = useCallback(() => {
    if (!topic || isLoading) return;
    const current = latestMessagesRef.current;
    if (current.length === 0) return;
    const last = current.at(-1);
    if (last && isContextDividerMessage(last)) {
      onUpdateMessages(topic.id, current.slice(0, -1));
    } else {
      onUpdateMessages(topic.id, [...current, {
        id: createId(),
        role: "system",
        content: "",
        subtype: "context-divider",
        createdAt: Date.now(),
      }]);
    }
    scrollToBottom();
    queueMicrotask(() => {
      const element = inputWrapRef.current?.querySelector("textarea") as HTMLTextAreaElement | null;
      element?.focus();
    });
  }, [inputWrapRef, isLoading, latestMessagesRef, onUpdateMessages, scrollToBottom, topic]);

  const clearMessages = useCallback(async () => {
    await confirmClearTopicMessages({
      confirm,
      disabled: isLoading,
      t,
      topicId: topic?.id,
    });
  }, [confirm, isLoading, t, topic]);

  const deleteGroupAssistants = useCallback((askId: string) => {
    if (!topic) return;
    const removed: Message[] = [];
    const remaining = latestMessagesRef.current.filter((message) => {
      const shouldRemove = message.role === "assistant" && message.askId === askId;
      if (shouldRemove) removed.push(message);
      return !shouldRemove;
    });
    cleanupUnusedAttachments(removed, remaining);
    onUpdateMessages(topic.id, remaining);
  }, [cleanupUnusedAttachments, latestMessagesRef, onUpdateMessages, topic]);

  const toggleUseful = useCallback((askId: string, assistantMsgId: string) => {
    if (!topic) return;
    const next = latestMessagesRef.current.map((message) => {
      if (message.role !== "assistant") return message;
      const inGroup = message.askId ? message.askId === askId : message.id === assistantMsgId;
      if (!inGroup) return message;
      if (message.id === assistantMsgId) return { ...message, useful: !message.useful };
      return message.useful ? { ...message, useful: false } : message;
    });
    onUpdateMessages(topic.id, next);
  }, [latestMessagesRef, onUpdateMessages, topic]);

  const createBranchFromMessage = useCallback((messageId: string) => {
    if (!topic?.assistantId) return;
    const index = latestMessagesRef.current.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    const cloned = latestMessagesRef.current.slice(0, index + 1);
    const chatState = useChatStore.getState();
    const assistantState = useAssistantStore.getState();
    const title = `${topic.title} · ${t("message.newBranch")}`;
    const id = assistantState.createTopic(topic.assistantId, title);
    if (!id) return;
    assistantState.updateTopicMeta(id, { topicPrompt: topic.topicPrompt, isNameManuallyEdited: false, order: Date.now() });
    chatState.updateTopicMessages(id, cloned);
    toast({ title: t("common.tip"), description: t("message.branchCreated") });
  }, [latestMessagesRef, t, topic]);

  const deleteMessage = useCallback((messageId: string) => {
    if (!topic) return;
    const currentMessages = latestMessagesRef.current;
    const message = currentMessages.find((item) => item.id === messageId) ?? null;
    if (message?.attachments?.length) {
      const ids = message.attachments.filter((attachment) => (attachment?.type === "image" || attachment?.type === "file") && attachment.id).map((attachment) => attachment.id);
      const stillUsed = new Set<string>();
      for (const item of currentMessages) {
        if (item.id === messageId) continue;
        for (const attachment of item.attachments || []) {
          if ((attachment?.type === "image" || attachment?.type === "file") && attachment.id) stillUsed.add(attachment.id);
        }
      }
      void deleteAttachments(ids.filter((id) => !stillUsed.has(id)));
    }
    onUpdateMessages(topic.id, currentMessages.filter((messageItem) => messageItem.id !== messageId));
  }, [latestMessagesRef, onUpdateMessages, topic]);

  const editMessage = useCallback((messageId: string, content: string) => {
    if (!topic) return;
    onUpdateMessages(topic.id, latestMessagesRef.current.map((message) => (message.id === messageId ? { ...message, content } : message)));
  }, [latestMessagesRef, onUpdateMessages, topic]);

  const speakMessage = useCallback(async (messageIdRaw: string) => {
    if (!topic) return;
    const messageId = String(messageIdRaw || "").trim();
    if (!messageId) return;

    const message = latestMessagesRef.current.find((item) => item.id === messageId && item.role === "assistant") ?? null;
    const text = String(message?.content || "").trim();
    if (!message || !text) {
      toast({ title: t("chat.speechContentMissingTitle"), description: t("chat.speechContentMissingDesc"), variant: "destructive" });
      return;
    }

    const settings = useChatSettingsStore.getState().settings;
    const speechModel = String(settings.defaultSpeechModel || "").trim();
    const speechVoice = String(settings.defaultSpeechVoice || "").trim();
    if (!speechModel) {
      toast({ title: t("chat.speechModelMissingTitle"), description: t("chat.speechModelMissingDesc"), variant: "destructive" });
      return;
    }

    const requestId = createId();
    const controller = new AbortController();
    abortControllersRef.current.set(requestId, { controller, topicId: topic.id, kind: "aux" });
    toast({ title: t("common.tip"), description: t("chat.speechGenerating") });

    try {
      const result = await generateSpeechAttachment({
        model: speechModel,
        text,
        voice: speechVoice || undefined,
        signal: controller.signal,
      });

      const appended = appendAttachmentToMessage(messageId, result.attachment);
      if (!appended) {
        URL.revokeObjectURL(result.objectUrl);
        void deleteAttachments([result.attachment.id]);
        return;
      }

      const audio = new Audio(result.objectUrl);
            /**
       * 内部函数变量：`releaseObjectUrl`。
       *
       * @remarks
       * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
       */
      const releaseObjectUrl = () => {
        try {
          URL.revokeObjectURL(result.objectUrl);
        } catch {
          // ignore revoke failures
        }
      };
      audio.addEventListener("ended", releaseObjectUrl, { once: true });
      audio.addEventListener("error", releaseObjectUrl, { once: true });

      void audio.play().catch(() => {
        releaseObjectUrl();
        toast({ title: t("common.error"), description: t("chat.speechPlaybackFailed"), variant: "destructive" });
      });

      toast({ title: t("common.success"), description: t("chat.speechAdded") });
    } catch (error: unknown) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      if (!cancelled) {
        const errorText = toI18nTextFromError(error);
        toast({
          title: t("common.error"),
          description: t(errorText.key, errorText.params as Record<string, unknown> | undefined),
          variant: "destructive",
        });
      }
    } finally {
      const current = abortControllersRef.current.get(requestId);
      if (current?.controller === controller) abortControllersRef.current.delete(requestId);
    }
  }, [abortControllersRef, appendAttachmentToMessage, latestMessagesRef, t, topic]);

  return {
    appendAttachmentToMessage,
    clearMessages,
    createBranchFromMessage,
    deleteGroupAssistants,
    deleteMessage,
    editMessage,
    handleToolAbort,
    patchToolCallInMessages,
    setThinkingExpanded,
    speakMessage,
    stopGeneration,
    toggleNewContext,
    toggleUseful,
  };
}
