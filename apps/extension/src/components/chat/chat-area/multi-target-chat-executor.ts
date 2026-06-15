/**
 * 说明：`multi-target-chat-executor` 组件模块。
 *
 * 职责：
 * - 收口聊天区“同一 ask fan-out 到多个 assistant 目标”的并发事务编排；
 * - 统一负责 stub/reset 写回、事务级预处理、并发启动、最终收尾；
 *
 * 边界：
 * - 这里只处理 chat-area 前端发起层的多目标并发，不改后台协议或 requestId 多路复用契约；
 * - 单目标发送/重跑仍沿用原有调用方语义，由调用方决定是否复用这里的单目标模式。
 */
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { TFunction } from "i18next";
import { buildChatSystemContent } from "@/lib/chat/context-pipeline";
import { useAssistantStore } from "@/hooks/useAssistantStore";
import { resolveBrowserContextEffectiveState, resolveBrowserContextForSend } from "@/lib/browser-context";
import { runStreamChat, type BuildApiMessagesOptions, type RunStreamChatOptions } from "@/lib/chat/run-stream-chat";
import { formatI18nText } from "@/lib/i18n/format";
import { toI18nTextFromError } from "@/lib/i18n/error";
import { toast } from "@/hooks/useToast";
import { isDedicatedImageModelLike } from "@/lib/ai/model-filters";
import { createId } from "@/lib/utils/id";
import type { Msg as ApiMsg } from "@/lib/chat-stream";
import type {
  Message,
  MessageAttachment,
  ResolvedConversationContext,
  UpdateTopicMessages,
} from "@/types/chat";
import type { I18nText } from "@/types/i18n";
import { buildPageStyleVisionAttachmentsFromFrames, supportsPageStyleVisionInput } from "./page-style-input";
import { collectInputImagesFromAttachments, generateImageReplyAttachments } from "./shared";
import { resolveBrowserContextSendPreflightBudgetMs } from "./browser-context-send-budget";
import { buildUserModelContent } from "./useChatAreaSendActions.helpers";

/** 单个多目标事务里的 assistant 执行目标。 */
export interface MultiTargetChatExecutionTarget {
  /** 当前 assistant 消息 ID；要求调用方在事务开始前已写入 stub 或 reset。 */
  assistantId: string;
  /** 所属 ask ID。 */
  askId: string;
  /** 目标模型 ID。 */
  modelId: string;
}

interface ExecuteMultiTargetChatTransactionParams {
  abortControllersRef: MutableRefObject<Map<string, { controller: AbortController; topicId: string; kind: "chat" | "aux" }>>;
  buildApiMessages: (options: BuildApiMessagesOptions) => Promise<ApiMsg[]>;
  contextMessages: Message[];
  controller: AbortController;
  imageSourceAttachments?: MessageAttachment[];
  initialMessages: Message[];
  latestMessagesRef: MutableRefObject<Message[]>;
  modelMap: Map<string, unknown>;
  onInitialMessagesCommitted?: () => void;
  onTransactionError?: (payload: { cancelled: boolean; error: unknown; message: string }) => void;
  onTargetLaunch?: (payload: { modelId: string; requestId: string; targetId: string }) => void;
  onUpdateMessages: UpdateTopicMessages;
  query: string;
  setBrowserContextPreflightPhase?: (phase: "style-capture" | null) => void;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  streamOptions?: Pick<
    RunStreamChatOptions,
    | "developerSource"
    | "enableGenerateImageOverride"
    | "enableWebSearchOverride"
    | "memoryOverride"
    | "useAssistantRuntimeFeatures"
    | "webSearchProviderIdOverride"
    | "webSearchSettingsOverride"
  >;
  t: TFunction;
  targets: MultiTargetChatExecutionTarget[];
  topic: ResolvedConversationContext;
  transactionId: string;
  userMessage: Message;
}

/**
 * 内部函数：`updateAssistantMessageById`。
 *
 * @remarks
 * 多目标并发下不能再依赖“前一个模型先完成”的顺序来找位置；
 * 这里始终按 assistantId 在最新快照里做原位替换，保证并发写回不会串 slot。
 */
function updateAssistantMessageById(
  messages: Message[],
  assistantId: string,
  updater: (message: Message) => Message,
): Message[] {
  return messages.map((message) => {
    if (message.role !== "assistant" || message.id !== assistantId) return message;
    return updater(message);
  });
}

/**
 * 导出函数：`executeMultiTargetChatTransaction`。
 *
 * @remarks
 * 统一执行一次多目标聊天事务：
 * - 先把调用方准备好的 stub/reset 写进消息真源；
 * - 再只做一次系统提示词、风格截图和图片输入预处理；
 * - 最后并发启动全部目标，并由事务层统一回收 loading / abort controller。
 */
export async function executeMultiTargetChatTransaction({
  abortControllersRef,
  buildApiMessages,
  contextMessages,
  controller,
  imageSourceAttachments,
  initialMessages,
  latestMessagesRef,
  modelMap,
  onInitialMessagesCommitted,
  onTransactionError,
  onTargetLaunch,
  onUpdateMessages,
  query,
  setBrowserContextPreflightPhase,
  setIsLoading,
  streamOptions,
  t,
  targets,
  topic,
  transactionId,
  userMessage,
}: ExecuteMultiTargetChatTransactionParams): Promise<void> {
  let workingMessages = initialMessages;
  const targetIds = new Set(targets.map((target) => target.assistantId));
  const targetIndexByAssistantId = new Map(
    initialMessages.map((message, index) => [message.id, index] as const),
  );

  /**
   * 说明：
   * - 这里显式同步 `latestMessagesRef.current`，避免并发回调还没等 React render 完就拿到旧快照；
   * - send/replay/compare 统一从这一层写消息，减少各入口自己维护工作副本的分叉。
   */
  const onUpdate = (messages: Message[]) => {
    workingMessages = messages;
    latestMessagesRef.current = messages;
    onUpdateMessages(topic.id, messages);
  };

  /**
   * 内部函数变量：`finalizePendingTargets`。
   *
   * @remarks
   * 事务级预处理失败或整体取消时，需要一次性把仍处于 preparing/processing 的目标收口到终态，
   * 避免 UI 留下一组无法继续操作的空壳 assistant。
   */
  const finalizePendingTargets = (status: NonNullable<Message["status"]>, error: I18nText) => {
    onUpdate(workingMessages.map((message) => {
      if (message.role !== "assistant" || !targetIds.has(message.id)) return message;
      if (message.status !== "preparing" && message.status !== "processing") return message;
      return {
        ...message,
        status,
        error,
        errorDetails: undefined,
      };
    }));
  };

  onUpdate(initialMessages);
  onInitialMessagesCommitted?.();

  try {
    const textTargets = targets.filter((target) => !(modelMap.get(target.modelId) && isDedicatedImageModelLike(modelMap.get(target.modelId) as never)));
    const imageTargets = targets.filter((target) => modelMap.get(target.modelId) && isDedicatedImageModelLike(modelMap.get(target.modelId) as never));

    const browserContextEffectiveState = resolveBrowserContextEffectiveState({
      assistant: useAssistantStore.getState().assistants.find((assistant) => assistant.id === topic.assistantId) ?? null,
      conversationKey: topic.id,
    });
    const requireStyleSignals = browserContextEffectiveState.effective
      && browserContextEffectiveState.conversationMode.styleSignalsEnabled;
    const requireCaptures = requireStyleSignals && textTargets.some((target) => supportsPageStyleVisionInput(modelMap.get(target.modelId)));
    if (requireCaptures) setBrowserContextPreflightPhase?.("style-capture");
    const preflightTask = resolveBrowserContextForSend({
      assistantId: topic.assistantId,
      conversationKey: topic.id,
      requireReadableDom: true,
      requireStyleSignals,
      requireCaptures,
      budgetMs: resolveBrowserContextSendPreflightBudgetMs({
        ...browserContextEffectiveState,
        requireCaptures,
      }),
      signal: controller.signal,
    })
      .finally(() => {
        if (requireCaptures) setBrowserContextPreflightPhase?.(null);
      });
    const [preflight, inputImages] = await Promise.all([
      preflightTask,
      imageTargets.length > 0
        ? collectInputImagesFromAttachments(imageSourceAttachments, controller.signal)
        : Promise.resolve([]),
    ]);
    const { systemContent } = await buildChatSystemContent({
      topic,
      query,
      browserContextPrompt: preflight.browserContext.prompt,
      signal: controller.signal,
    });
    const sharedPageStyleAttachments = requireCaptures && preflight.captureFrames.length > 0
      ? buildPageStyleVisionAttachmentsFromFrames(preflight.captureFrames)
      : undefined;

    let warnedImageInput = false;
    await Promise.all(targets.map(async (target) => {
      const targetIndex = targetIndexByAssistantId.get(target.assistantId);
      if (typeof targetIndex !== "number") return;
      const dedicatedImage = Boolean(modelMap.get(target.modelId) && isDedicatedImageModelLike(modelMap.get(target.modelId) as never));

      if (dedicatedImage) {
        const imagePrompt = buildUserModelContent({
          text: query,
          modelContext: userMessage.modelContext,
          contextReferences: userMessage.contextReferences,
          t,
        });
        if (!imagePrompt.trim() && inputImages.length === 0) {
          onUpdate(updateAssistantMessageById(workingMessages, target.assistantId, (message) => ({
            ...message,
            modelId: target.modelId,
            status: "error",
            renderHint: "image",
            error: { key: "chat.imagePromptEmptyDesc" },
          })));
          return;
        }
        if (inputImages.length > 0 && !warnedImageInput) {
          warnedImageInput = true;
          toast({
            title: t("common.tip"),
            description: t("chat.imageInputNotice", { count: inputImages.length }),
          });
        }
        try {
          const outputAttachments = await generateImageReplyAttachments({
            model: target.modelId,
            prompt: imagePrompt,
            inputImages,
            signal: controller.signal,
          });
          onUpdate(updateAssistantMessageById(workingMessages, target.assistantId, (message) => ({
            ...message,
            modelId: target.modelId,
            content: "",
            attachments: outputAttachments,
            status: "success",
            renderHint: "image",
            error: undefined,
            errorDetails: undefined,
          })));
        } catch (error: unknown) {
          const cancelled = error instanceof DOMException && error.name === "AbortError";
          const errorI18n = cancelled ? { key: "chat.generationCancelled" } : toI18nTextFromError(error);
          onUpdate(updateAssistantMessageById(workingMessages, target.assistantId, (message) => ({
            ...message,
            modelId: target.modelId,
            status: cancelled ? "paused" : "error",
            renderHint: "image",
            error: errorI18n,
            errorDetails: undefined,
          })));
        }
        return;
      }

      const requestId = createId();
      onTargetLaunch?.({ modelId: target.modelId, requestId, targetId: target.assistantId });
      const pageStyleAttachments = (
        requireCaptures
        && supportsPageStyleVisionInput(modelMap.get(target.modelId))
      )
        ? sharedPageStyleAttachments
        : undefined;
      const apiMessages = await buildApiMessages({
        modelId: target.modelId,
        systemContent,
        contextMessages,
        signal: controller.signal,
        ephemeralUserAttachments: pageStyleAttachments
          ? [{ messageId: userMessage.id, attachments: pageStyleAttachments }]
          : undefined,
      });
      await runStreamChat({
        apiMsgs: apiMessages as never,
        topic,
        requestId,
        askId: target.askId,
        modelId: target.modelId,
        targetIndex,
        mode: "replace",
        signal: controller.signal,
        baseMsgs: initialMessages,
        topicId: topic.id,
        onUpdateMessages: (_, messages) => { onUpdate(messages); },
        getLatestMessages: () => latestMessagesRef.current,
        onFinish: () => undefined,
        onError: () => undefined,
        ...streamOptions,
      });
    }));
  } catch (error: unknown) {
    const cancelled = error instanceof DOMException && error.name === "AbortError";
    const errorI18n = cancelled ? { key: "chat.generationCancelled" } : toI18nTextFromError(error);
    const message = cancelled
      ? t("chat.generationCancelled")
      : formatI18nText(t, errorI18n);
    onTransactionError?.({ cancelled, error, message });
    finalizePendingTargets(cancelled ? "paused" : "error", errorI18n);
    toast({
      title: cancelled ? t("common.cancelled") : t("common.error"),
      description: message,
      variant: cancelled ? "default" : "destructive",
    });
  } finally {
    abortControllersRef.current.delete(transactionId);
    setIsLoading(false);
  }
}
