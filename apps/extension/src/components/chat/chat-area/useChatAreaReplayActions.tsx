/**
 * 说明：`useChatAreaReplayActions` 组件模块。
 *
 * 职责：
 * - 承载 `useChatAreaReplayActions` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useChatAreaReplayActions` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { TFunction } from "i18next";
import { createId } from "@/lib/utils/id";
import { buildChatSystemContent } from "@/lib/chat/context-pipeline";
import { useAssistantStore } from "@/hooks/useAssistantStore";
import { resolveBrowserContextEffectiveState, resolveBrowserContextForSend } from "@/lib/browser-context";
import { deleteAttachments } from "@/lib/attachments";
import { toast } from "@/hooks/useToast";
import { useChatSettingsStore } from "@/hooks/useChatSettingsStore";
import { formatI18nText } from "@/lib/i18n/format";
import { toI18nTextFromError } from "@/lib/i18n/error";
import { isDedicatedImageModelLike } from "@/lib/ai/model-filters";
import { collectContiguousAskAssistants, pickContextMessages } from "@/lib/chat/chat-utils";
import { hasMessageToolCalls } from "@/lib/chat/message-trace";
import { runStreamChat, type BuildApiMessagesOptions } from "@/lib/chat/run-stream-chat";
import { logger } from "@/lib/logger";
import type { Msg as ApiMsg } from "@/lib/chat-stream";
import type { Message, ResolvedConversationContext, UpdateTopicMessages } from "@/types/chat";
import { getActiveMessages } from "@/types/chat";
import { buildPageStyleVisionAttachmentsFromFrames, supportsPageStyleVisionInput } from "./page-style-input";
import { collectInputImagesFromAttachments, generateImageReplyAttachments } from "./shared";
import { executeMultiTargetChatTransaction } from "./multi-target-chat-executor";
import { resolveBrowserContextSendPreflightBudgetMs } from "./browser-context-send-budget";
import { buildUserModelContent } from "./useChatAreaSendActions.helpers";
import { createChatResendUserAskPlan } from "./useChatAreaReplayActions.resendPlan";

/**
 * 导出 Hook：`useChatAreaReplayActions`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useChatAreaReplayActions(params: {
  abortControllersRef: MutableRefObject<Map<string, { controller: AbortController; topicId: string; kind: "chat" | "aux" }>>;
  buildApiMessages: (options: BuildApiMessagesOptions) => Promise<ApiMsg[]>;
  isLoading: boolean;
  latestMessagesRef: MutableRefObject<Message[]>;
  modelMap: Map<string, unknown>;
  onUpdateMessages: UpdateTopicMessages;
  scrollToBottom: () => void;
  scrollToBottomAfterNextCommitIfFollowing: () => boolean;
  setBrowserContextPreflightPhase?: (phase: "style-capture" | null) => void;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  t: TFunction;
  topic: ResolvedConversationContext | null;
}) {
  const {
    abortControllersRef,
    buildApiMessages,
    isLoading,
    latestMessagesRef,
    modelMap,
    onUpdateMessages,
    scrollToBottom,
    scrollToBottomAfterNextCommitIfFollowing,
    setBrowserContextPreflightPhase,
    setIsLoading,
    t,
    topic,
  } = params;
  const logReplayBreadcrumb = useCallback((message: string, data?: Record<string, unknown>) => {
    if (!import.meta.env.DEV && !useChatSettingsStore.getState().settings.enableDeveloperMode) return;
    logger.chat.debug(message, data);
  }, []);
  const resolveBrowserContextSendArtifacts = useCallback(async (userMessageId: string, query: string, modelIds: ReadonlyArray<string>, signal: AbortSignal) => {
    if (!topic) {
      return {
        systemContent: '',
        attachmentsByModelId: new Map(),
      };
    }
    const effectiveState = resolveBrowserContextEffectiveState({
      assistant: useAssistantStore.getState().assistants.find((assistant) => assistant.id === topic.assistantId) ?? null,
      conversationKey: topic.id,
    });
    const requireStyleSignals = effectiveState.effective && effectiveState.conversationMode.styleSignalsEnabled;
    const requireCaptures = requireStyleSignals && modelIds.some((modelId) => supportsPageStyleVisionInput(modelMap.get(modelId)));
    let preflight;
    try {
      if (requireCaptures) setBrowserContextPreflightPhase?.("style-capture");
      preflight = await resolveBrowserContextForSend({
        assistantId: topic.assistantId,
        conversationKey: topic.id,
        requireReadableDom: true,
        requireStyleSignals,
        requireCaptures,
        budgetMs: resolveBrowserContextSendPreflightBudgetMs({
          ...effectiveState,
          requireCaptures,
        }),
        signal,
      });
    } finally {
      if (requireCaptures) setBrowserContextPreflightPhase?.(null);
    }
    const { systemContent } = await buildChatSystemContent({
      topic,
      query,
      browserContextPrompt: preflight.browserContext.prompt,
      signal,
    });
    const captureAttachments = requireCaptures && preflight.captureFrames.length > 0
      ? buildPageStyleVisionAttachmentsFromFrames(preflight.captureFrames)
      : null;
    return {
      systemContent,
      attachmentsByModelId: new Map(
        modelIds
          .filter((modelId) => requireCaptures && supportsPageStyleVisionInput(modelMap.get(modelId)) && captureAttachments)
          .map((modelId) => [
            modelId,
            [{ messageId: userMessageId, attachments: captureAttachments! }],
          ] as const),
      ),
    };
  }, [modelMap, setBrowserContextPreflightPhase, topic]);

  const regenerate = useCallback(async () => {
    if (!topic) return;
    const currentMessages = getActiveMessages(topic);
    if (currentMessages.length < 2) return;
    const removed = currentMessages.at(-1) ?? null;
    const messages = currentMessages.slice(0, -1);
    onUpdateMessages(topic.id, messages);
    scrollToBottom();
    if (removed?.attachments?.length) {
      const stillUsed = new Set<string>();
      for (const message of messages) {
        for (const attachment of message.attachments || []) if ((attachment?.type === "image" || attachment?.type === "file") && attachment.id) stillUsed.add(attachment.id);
      }
      void deleteAttachments(removed.attachments.filter((attachment) => (attachment?.type === "image" || attachment?.type === "file") && attachment.id && !stillUsed.has(attachment.id)).map((attachment) => attachment.id));
    }
    const lastUserMsg = [...messages].reverse().find((message) => message.role === "user");
    if (!lastUserMsg) return;

    const askId = lastUserMsg.askId || lastUserMsg.id;
    setIsLoading(true);
    const requestId = createId();
    const controller = new AbortController();
    abortControllersRef.current.set(requestId, { controller, topicId: topic.id, kind: "chat" });
    try {
      if (modelMap.get(topic.model) && isDedicatedImageModelLike(modelMap.get(topic.model) as never)) {
        const prompt = buildUserModelContent({
          text: lastUserMsg.content,
          modelContext: lastUserMsg.modelContext,
          contextReferences: lastUserMsg.contextReferences,
          t,
        });
        const inputImages = await collectInputImagesFromAttachments(lastUserMsg.attachments, controller.signal);
        if (!prompt && inputImages.length === 0) {
          toast({ title: t("chat.imagePromptEmptyTitle"), description: t("chat.imagePromptEmptyDesc"), variant: "destructive" });
          return;
        }
        if (inputImages.length > 0) toast({ title: t("common.tip"), description: t("chat.imageInputNotice", { count: inputImages.length }) });
        const outputAttachments = await generateImageReplyAttachments({ model: topic.model, prompt, inputImages, signal: controller.signal });
        onUpdateMessages(topic.id, [...messages, { id: createId(), role: "assistant", askId, modelId: topic.model, content: "", attachments: outputAttachments, status: "success", createdAt: Date.now() }]);
        return;
      }

      const contextMsgs = pickContextMessages(messages, topic.contextLength);
      const browserContextArtifacts = await resolveBrowserContextSendArtifacts(
        lastUserMsg.id,
        lastUserMsg.content,
        [topic.model],
        controller.signal,
      );
      const apiMsgs = await buildApiMessages({
        modelId: topic.model,
        systemContent: browserContextArtifacts.systemContent,
        contextMessages: contextMsgs,
        signal: controller.signal,
        ephemeralUserAttachments: browserContextArtifacts.attachmentsByModelId.get(topic.model),
      });
      await runStreamChat({
        apiMsgs: apiMsgs as never,
        topic,
        modelId: topic.model,
        askId,
        targetIndex: messages.length,
        mode: "insert",
        signal: controller.signal,
        baseMsgs: messages,
        topicId: topic.id,
        onUpdateMessages,
        getLatestMessages: () => latestMessagesRef.current,
        onFinish: () => { abortControllersRef.current.delete(requestId); setIsLoading(false); },
        onError: () => { abortControllersRef.current.delete(requestId); setIsLoading(false); },
      });
    } catch (error: unknown) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      if (!cancelled) {
        const message = formatI18nText(t, toI18nTextFromError(error));
        toast({ title: t("common.error"), description: message, variant: "destructive" });
      }
    } finally {
      abortControllersRef.current.delete(requestId);
      setIsLoading(false);
    }
  }, [abortControllersRef, buildApiMessages, latestMessagesRef, modelMap, onUpdateMessages, resolveBrowserContextSendArtifacts, scrollToBottom, setIsLoading, t, topic]);

  const mentionModelForAsk = useCallback(async (askId: string, modelId: string) => {
    if (!topic || isLoading) return;
    const normalizedModelId = String(modelId || "").trim();
    if (!normalizedModelId) return;
    const current = latestMessagesRef.current;
    const userIndex = current.findIndex((message) => message.role === "user" && (message.askId || message.id) === askId);
    if (userIndex < 0) return;
    const userMsg = current[userIndex]!;
    const insertIndex = userIndex + 1 + collectContiguousAskAssistants(current, userIndex, askId).length;
    setIsLoading(true);
    const requestId = createId();
    const controller = new AbortController();
    abortControllersRef.current.set(requestId, { controller, topicId: topic.id, kind: "chat" });
    try {
      const contextBase = current.slice(0, userIndex + 1);
      const contextMsgs = pickContextMessages(contextBase, topic.contextLength);
      const browserContextArtifacts = await resolveBrowserContextSendArtifacts(
        userMsg.id,
        userMsg.content,
        [normalizedModelId],
        controller.signal,
      );
      const apiMsgs = await buildApiMessages({
        modelId: normalizedModelId,
        systemContent: browserContextArtifacts.systemContent,
        contextMessages: contextMsgs,
        signal: controller.signal,
        ephemeralUserAttachments: browserContextArtifacts.attachmentsByModelId.get(normalizedModelId),
      });
      await runStreamChat({
        apiMsgs: apiMsgs as never,
        topic,
        modelId: normalizedModelId,
        askId,
        targetIndex: insertIndex,
        mode: "insert",
        signal: controller.signal,
        baseMsgs: current,
        topicId: topic.id,
        onUpdateMessages,
        getLatestMessages: () => latestMessagesRef.current,
        onFinish: () => { abortControllersRef.current.delete(requestId); setIsLoading(false); },
        onError: () => { abortControllersRef.current.delete(requestId); setIsLoading(false); },
      });
    } catch (error: unknown) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      if (!cancelled) {
        const message = formatI18nText(t, toI18nTextFromError(error));
        toast({ title: t("common.error"), description: message, variant: "destructive" });
      }
      abortControllersRef.current.delete(requestId);
      setIsLoading(false);
    }
  }, [abortControllersRef, buildApiMessages, isLoading, latestMessagesRef, onUpdateMessages, resolveBrowserContextSendArtifacts, setIsLoading, t, topic]);

  const retryFailedAll = useCallback(async (askId: string) => {
    if (!topic || isLoading) return;
    const current = latestMessagesRef.current;
    const userIndex = current.findIndex((message) => message.role === "user" && (message.askId || message.id) === askId);
    if (userIndex < 0) return;
    const userMsg = current[userIndex]!;
    const assistants = collectContiguousAskAssistants(current, userIndex, askId)
      .filter((message) => message.status === "error" || (!String(message.content || "").trim() && !hasMessageToolCalls(message)))
      .map((message) => ({ id: message.id, modelId: message.modelId }));
    if (assistants.length === 0) return;

    setIsLoading(true);
    const transactionId = createId();
    const controller = new AbortController();
    abortControllersRef.current.set(transactionId, { controller, topicId: topic.id, kind: "chat" });
    const resetMessages = current.map((message) => {
      if (message.role !== "assistant") return message;
      const assistant = assistants.find((item) => item.id === message.id);
      if (!assistant) return message;
      const nextModelId = assistant.modelId || topic.model;
      return {
        ...message,
        modelId: nextModelId,
        content: "",
        trace: undefined,
        translations: undefined,
        attachments: undefined,
        status: "processing" as const,
        ...(modelMap.get(nextModelId) && isDedicatedImageModelLike(modelMap.get(nextModelId) as never) ? { renderHint: "image" as const } : { renderHint: undefined }),
        error: undefined,
        errorDetails: undefined,
      };
    });

    await executeMultiTargetChatTransaction({
      abortControllersRef,
      buildApiMessages,
      contextMessages: pickContextMessages(current.slice(0, userIndex + 1), topic.contextLength),
      controller,
      imageSourceAttachments: userMsg.attachments,
      initialMessages: resetMessages,
      latestMessagesRef,
      modelMap,
      onUpdateMessages,
      query: userMsg.content,
      setBrowserContextPreflightPhase,
      setIsLoading,
      t,
      targets: assistants.map((assistant) => ({
        assistantId: assistant.id,
        askId,
        modelId: assistant.modelId || topic.model,
      })),
      topic,
      transactionId,
      userMessage: userMsg,
    });
  }, [abortControllersRef, buildApiMessages, isLoading, latestMessagesRef, modelMap, onUpdateMessages, setBrowserContextPreflightPhase, setIsLoading, t, topic]);

  const regenerateAssistantMessage = useCallback(async (assistantMsgId: string) => {
    if (!topic || isLoading) return;
    const current = latestMessagesRef.current;
    const index = current.findIndex((message) => message.id === assistantMsgId);
    if (index < 0) return;
    const target = current[index]!;
    if (target.role !== "assistant") return;
    const askId = target.askId;
    if (!askId) return;
    const userIndex = current.findIndex((message, messageIndex) => messageIndex < index && message.role === "user" && (message.askId || message.id) === askId);
    if (userIndex < 0) return;
    const userMsg = current[userIndex]!;
    const regenModelId = String(target.modelId || topic.model || "").trim();
    const dedicatedImage = Boolean(modelMap.get(regenModelId) && isDedicatedImageModelLike(modelMap.get(regenModelId) as never));
    const resetBaseMsgs = current.map((message) => message.id === assistantMsgId ? {
      ...message,
      content: "",
      trace: undefined,
      translations: undefined,
      attachments: undefined,
      status: "processing" as const,
      renderHint: dedicatedImage ? "image" as const : undefined,
      error: undefined,
      errorDetails: undefined,
    } : message);
    onUpdateMessages(topic.id, resetBaseMsgs);
    setIsLoading(true);
    const requestId = createId();
    const controller = new AbortController();
    abortControllersRef.current.set(requestId, { controller, topicId: topic.id, kind: "chat" });
        /**
     * 内部函数变量：`cleanup`。
     *
     * @remarks
     * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
     */
    const cleanup = () => {
      abortControllersRef.current.delete(requestId);
      setIsLoading(false);
    };
    try {
      if (dedicatedImage) {
        const prompt = buildUserModelContent({
          text: userMsg.content,
          modelContext: userMsg.modelContext,
          contextReferences: userMsg.contextReferences,
          t,
        });
        const inputImages = await collectInputImagesFromAttachments(userMsg.attachments, controller.signal);
        if (!prompt && inputImages.length === 0) {
          onUpdateMessages(topic.id, resetBaseMsgs.map((message) => message.id === assistantMsgId ? { ...message, status: "error", error: { key: "chat.imagePromptEmptyDesc" } } : message));
          return;
        }
        const outputAttachments = await generateImageReplyAttachments({ model: regenModelId, prompt, inputImages, signal: controller.signal });
        onUpdateMessages(topic.id, latestMessagesRef.current.map((message) => message.id === assistantMsgId ? { ...message, modelId: regenModelId, content: "", attachments: outputAttachments, status: "success", renderHint: "image", error: undefined } : message));
        cleanup();
        return;
      }
      const contextBase = resetBaseMsgs.slice(0, userIndex + 1);
      const contextMsgs = pickContextMessages(contextBase, topic.contextLength);
      const browserContextArtifacts = await resolveBrowserContextSendArtifacts(
        userMsg.id,
        userMsg.content,
        [regenModelId],
        controller.signal,
      );
      const apiMsgs = await buildApiMessages({
        modelId: regenModelId,
        systemContent: browserContextArtifacts.systemContent,
        contextMessages: contextMsgs,
        signal: controller.signal,
        ephemeralUserAttachments: browserContextArtifacts.attachmentsByModelId.get(regenModelId),
      });
      await runStreamChat({
        apiMsgs,
        topic,
        modelId: regenModelId,
        askId,
        targetIndex: index,
        mode: "replace",
        signal: controller.signal,
        baseMsgs: resetBaseMsgs,
        topicId: topic.id,
        onUpdateMessages,
        getLatestMessages: () => latestMessagesRef.current,
        onFinish: cleanup,
        onError: cleanup,
      });
    } catch (error: unknown) {
      cleanup();
      const errorI18n = toI18nTextFromError(error);
      const message = formatI18nText(t, errorI18n);
      toast({ title: t("common.error"), description: message, variant: "destructive" });
      onUpdateMessages(topic.id, latestMessagesRef.current.map((item) => item.id === assistantMsgId ? { ...item, status: "error", error: errorI18n } : item));
    }
  }, [abortControllersRef, buildApiMessages, isLoading, latestMessagesRef, modelMap, onUpdateMessages, resolveBrowserContextSendArtifacts, setIsLoading, t, topic]);

  const resendUserAsk = useCallback(async (askIdRaw: string) => {
    if (!topic || isLoading) return;
    const askId = String(askIdRaw || "").trim();
    if (!askId) return;
    const transactionId = createId();
    const current = latestMessagesRef.current;
    const resendPlan = createChatResendUserAskPlan({ askId, current, modelMap, topicModel: topic.model });
    if (!resendPlan) return;
    logReplayBreadcrumb("user_regenerate_start", {
      transactionId,
      askId,
      topicId: topic.id,
      existingAssistants: resendPlan.existingAssistantCount,
      modelsToInsert: resendPlan.insertedModelCount,
    });
    setIsLoading(true);
    const controller = new AbortController();
    abortControllersRef.current.set(transactionId, { controller, topicId: topic.id, kind: "chat" });
    scrollToBottomAfterNextCommitIfFollowing();
    await executeMultiTargetChatTransaction({
      abortControllersRef,
      buildApiMessages,
      contextMessages: pickContextMessages(resendPlan.workingMsgs.slice(0, resendPlan.userIndex + 1), topic.contextLength),
      controller,
      imageSourceAttachments: resendPlan.userMsg.attachments,
      initialMessages: resendPlan.workingMsgs,
      latestMessagesRef,
      modelMap,
      onTargetLaunch: ({ modelId, requestId, targetId }) => {
        logReplayBreadcrumb("user_regenerate_stream_launch", {
          transactionId,
          requestId,
          askId,
          topicId: topic.id,
          targetId,
          modelId,
        });
      },
      onTransactionError: ({ cancelled, error }) => {
        logReplayBreadcrumb("user_regenerate_preflight_error", {
          transactionId,
          askId,
          topicId: topic.id,
          cancelled,
          error: error instanceof Error ? error.message : String(error),
        });
      },
      onUpdateMessages,
      query: resendPlan.userMsg.content,
      setBrowserContextPreflightPhase,
      setIsLoading,
      t,
      targets: resendPlan.targets,
      topic,
      transactionId,
      userMessage: resendPlan.userMsg,
    });
  }, [abortControllersRef, buildApiMessages, isLoading, latestMessagesRef, logReplayBreadcrumb, modelMap, onUpdateMessages, scrollToBottomAfterNextCommitIfFollowing, setBrowserContextPreflightPhase, setIsLoading, t, topic]);

  return {
    mentionModelForAsk,
    regenerate,
    regenerateAssistantMessage,
    resendUserAsk,
    retryFailedAll,
  };
}
