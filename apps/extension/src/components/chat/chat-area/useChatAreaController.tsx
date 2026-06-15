/**
 * 说明：`useChatAreaController` 组件模块。
 *
 * 职责：
 * - 承载 `useChatAreaController` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useChatAreaController`、`ChatAreaController` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ForwardedRef } from "react";
import { useTranslation } from "react-i18next";
import { shallow } from "zustand/shallow";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useModelOptions } from "@/hooks/useModelOptions";
import { useChatSettingsStore } from "@/hooks/useChatSettingsStore";
import { useAssistantStore } from "@/hooks/useAssistantStore";
import { isInlineImageModelLike } from "@/lib/ai/model-filters";
import { buildRows, type GroupRow } from "@/lib/chat/chat-utils";
import type { Message } from "@/types/chat";
import { getActiveMessages } from "@/types/chat";
import { useChatAreaLayoutState } from "./useChatAreaLayoutState";
import { useChatAreaMessageActions } from "./useChatAreaMessageActions";
import { useChatAreaReplayActions } from "./useChatAreaReplayActions";
import { useChatAreaSendActions } from "./useChatAreaSendActions";
import type { ChatAreaHandle, ChatAreaProps } from "./types";
import type { ChatInputExternalDraft, ChatInputExternalDraftAcceptResult } from "../chat-input/types";

/**
 * 导出 Hook：`useChatAreaController`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useChatAreaController(
  { topic, conversationState, messagesLoading = false, onUpdateMessages, onOpenPrompts, onModelSwitch, onOpenModelManager, onOpenWebSearchSettings, onOpenNativeWebSearchSettings, onOpenMcpSettings, onOpenMemorySettings }: ChatAreaProps,
  ref: ForwardedRef<ChatAreaHandle>,
) {
  const { t } = useTranslation();
  const { confirm, ConfirmDialogPortal } = useConfirmDialog();
  const { providers, models, modelMap, getModelLabel, getModelShortLabel } = useModelOptions();
  const settings = useChatSettingsStore((state) => ({
    confirmDeleteMessage: state.settings.confirmDeleteMessage ?? true,
    confirmRegenerateMessage: state.settings.confirmRegenerateMessage ?? true,
    translateLanguages: Array.isArray(state.settings.translateLanguages) ? state.settings.translateLanguages : [],
    exportMenuOptions: state.settings.exportMenuOptions ?? {},
    showMessageOutline: state.settings.showMessageOutline ?? false,
    messageNavigation: state.settings.messageNavigation ?? "buttons",
    enableDeveloperMode: state.settings.enableDeveloperMode ?? false,
  }), shallow);
  const updateAssistantConfig = useAssistantStore((state) => state.updateAssistantConfig);
  const updateTopicMeta = useAssistantStore((state) => state.updateTopicMeta);
  const messagesAll = useMemo(() => (topic ? getActiveMessages(topic) : []), [topic]);
  const latestMessagesRef = useRef<Message[]>(messagesAll);
  latestMessagesRef.current = messagesAll;
  const abortControllersRef = useRef<Map<string, { controller: AbortController; topicId: string; kind: "chat" | "aux" }>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [browserContextPreflightPhase, setBrowserContextPreflightPhase] = useState<"style-capture" | null>(null);
  const [fullscreenCompareAskId, setFullscreenCompareAskId] = useState<string | null>(null);
  const [pendingInputDrafts, setPendingInputDrafts] = useState<ChatInputExternalDraft[]>([]);
  const [keepInputVisibleForExternalDraft, setKeepInputVisibleForExternalDraft] = useState(false);
  const externalDraftResolversRef = useRef(new Map<string, {
    resolve: () => void;
    reject: (error: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
    frame: number | null;
  }>());
  const resolvedConversationState: 'empty' | 'loading' | 'ready' = conversationState ?? (topic ? (messagesLoading ? 'loading' : 'ready') : 'empty');
  const externalDraftReadyRef = useRef(false);
  externalDraftReadyRef.current = resolvedConversationState === 'ready' && Boolean(topic);

  const providerLogoMap = useMemo(() => new Map<string, string | undefined>((providers || []).map((provider) => [provider.id, provider.logo])), [providers]);
    /**
   * 内部函数变量：`getProviderLogo`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const getProviderLogo = (providerId: string) => providerLogoMap.get(providerId);

  useEffect(() => {
    if (!topic) return;
    const option = modelMap.get(topic.model);
    const supportsInlineImage = Boolean(option && isInlineImageModelLike(option));
    if (!topic.assistantId) return;
    if (supportsInlineImage && !topic.enableGenerateImage) updateAssistantConfig(topic.assistantId, { enableGenerateImage: true });
    else if (!supportsInlineImage && topic.enableGenerateImage) updateAssistantConfig(topic.assistantId, { enableGenerateImage: false });
  }, [modelMap, topic, updateAssistantConfig]);

  useEffect(() => {
    setFullscreenCompareAskId(null);
    setBrowserContextPreflightPhase(null);
    setKeepInputVisibleForExternalDraft(false);
  }, [topic?.id]);

  const layout = useChatAreaLayoutState({
    abortControllersRef,
    confirm,
    isLoading,
    latestMessagesRef,
    messageNavigation: settings.messageNavigation,
    messagesAll,
    onUpdateMessages,
    topic,
  });
  const messageActions = useChatAreaMessageActions({
    abortControllersRef,
    cleanupUnusedAttachments: layout.cleanupUnusedAttachments,
    confirm,
    discardTranslationTaskByReqId: layout.discardTranslationTaskByReqId,
    inputWrapRef: layout.inputWrapRef,
    isLoading,
    latestMessagesRef,
    onUpdateMessages,
    setExpandedThinkingIds: layout.setExpandedThinkingIds,
    scrollToBottom: layout.scrollToBottom,
    setIsLoading,
    t,
    topic,
  });
  const sendActions = useChatAreaSendActions({
    abortControllersRef,
    isLoading,
    latestMessagesRef,
    modelMap,
    onUpdateMessages,
    scrollToBottom: layout.scrollToBottom,
    scrollToBottomIfFollowing: layout.scrollToBottomIfFollowing,
    scrollToBottomAfterNextCommit: layout.scrollToBottomAfterNextCommit,
    setBrowserContextPreflightPhase,
    setIsLoading,
    t,
    topic,
  });
  const replayActions = useChatAreaReplayActions({
    abortControllersRef,
    buildApiMessages: sendActions.buildApiMessages,
    isLoading,
    latestMessagesRef,
    modelMap,
    onUpdateMessages,
    scrollToBottom: layout.scrollToBottom,
    scrollToBottomAfterNextCommitIfFollowing: layout.scrollToBottomAfterNextCommitIfFollowing,
    setBrowserContextPreflightPhase,
    setIsLoading,
    t,
    topic,
  });
  const discardTranslationTaskByReqId = layout.discardTranslationTaskByReqId;
  const fullscreenCompareGroup = useMemo<GroupRow | null>(() => {
    if (!fullscreenCompareAskId) return null;
    const groupRows = buildRows(messagesAll, 0, isLoading);
    return groupRows.find((row): row is GroupRow => row.kind === "group" && row.askId === fullscreenCompareAskId) ?? null;
  }, [fullscreenCompareAskId, isLoading, messagesAll]);

  useEffect(() => {
    if (!fullscreenCompareAskId) return;
    if (fullscreenCompareGroup) return;
    setFullscreenCompareAskId(null);
  }, [fullscreenCompareAskId, fullscreenCompareGroup]);

  const openCompareFullscreen = useCallback((askId: string) => {
    const normalizedAskId = String(askId || "").trim();
    if (!normalizedAskId) return;
    setFullscreenCompareAskId(normalizedAskId);
  }, []);

  const closeCompareFullscreen = useCallback(() => {
    setFullscreenCompareAskId(null);
  }, []);

  /**
   * 将外部草稿追加到聊天输入区消费队列。
   *
   * @param draft - 已经完成结构化渲染和附件落库的输入草稿。
   */
  const insertDraft = useCallback((draft: ChatInputExternalDraft) => {
    setPendingInputDrafts((current) => [...current, draft]);
  }, []);

  /**
   * 将外部草稿交给 ChatInput，并等待输入区真实接受。
   *
   * 说明：
   * - 这里是页面工具命令 ack 的业务门闩；
   * - 只有 ChatInput 完成附件入队、预览生成、文字预填和聚焦后才 resolve；
   * - 超时或拒绝会让 SW 返回失败，截图编辑器因此保留在页面上。
   *
   * @param draft - 页面工具生成的输入草稿。
   * @returns ChatInput 接受完成 Promise。
   */
  const acceptExternalDraft = useCallback((draft: ChatInputExternalDraft) => (
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        externalDraftResolversRef.current.delete(draft.id);
        setPendingInputDrafts((current) => current.filter((item) => item.id !== draft.id));
        reject(new Error('external draft accept timeout'));
      }, 15_000);
      const entry = { resolve, reject, timer, frame: null as number | null };
      externalDraftResolversRef.current.set(draft.id, entry);

      /**
       * 等待聊天区本身进入 ready，再把外部草稿交给 ChatInput。
       *
       * 说明：
       * - Sidepanel Port / bridge ready 只代表跨运行时通道可用；
       * - ChatInput 的附件预览和元素引用卡是组件本地状态，不能在 loading 壳里
       *   短暂挂载并提前 ack，否则 loading 重新渲染会卸掉已接受草稿；
       * - 因此页面工具 ack 的最后门闩必须放在 ChatArea 自己的 ready 状态之后。
       */
      const enqueueWhenReady = () => {
        if (!externalDraftResolversRef.current.has(draft.id)) return;
        if (!externalDraftReadyRef.current) {
          entry.frame = window.requestAnimationFrame(enqueueWhenReady);
          return;
        }
        entry.frame = null;
        setPendingInputDrafts((current) => (
          current.some((item) => item.id === draft.id) ? current : [...current, draft]
        ));
      };

      enqueueWhenReady();
    })
  ), []);

  /**
   * 输入区确认消费草稿后，从队列中移除对应项。
   *
   * @param draftId - 已被消费的草稿 ID。
   */
  const completeExternalDraft = useCallback((draftId: string, result: ChatInputExternalDraftAcceptResult) => {
    const pending = externalDraftResolversRef.current.get(draftId);
    if (pending) {
      externalDraftResolversRef.current.delete(draftId);
      clearTimeout(pending.timer);
      if (pending.frame !== null) window.cancelAnimationFrame(pending.frame);
      if (result.ok) {
        setKeepInputVisibleForExternalDraft(true);
        pending.resolve();
      } else {
        pending.reject(result.error ?? new Error('external draft rejected'));
      }
    }
    setPendingInputDrafts((current) => {
      if (current[0]?.id === draftId) return current.slice(1);
      return current.filter((draft) => draft.id !== draftId);
    });
  }, []);

  useEffect(() => {
    const controllers = abortControllersRef.current;
    const externalDraftResolvers = externalDraftResolversRef.current;
    return () => {
      for (const [requestId, entry] of controllers) {
        if (entry.kind === "aux") discardTranslationTaskByReqId(requestId, { removeLoading: true });
        entry.controller.abort();
      }
      controllers.clear();
      for (const [, pending] of externalDraftResolvers) {
        clearTimeout(pending.timer);
        if (pending.frame !== null) window.cancelAnimationFrame(pending.frame);
        pending.reject(new Error('chat area unmounted'));
      }
      externalDraftResolvers.clear();
    };
  }, [discardTranslationTaskByReqId]);

  useImperativeHandle(ref, () => ({
    send: (text: string) => { void sendActions.sendMessage({ text }); },
    sendWithAttachments: (payload) => { void sendActions.sendMessage({ text: payload.text, attachments: payload.attachments }); },
    insertDraft,
    acceptExternalDraft,
    completeExternalDraft,
    stop: messageActions.stopGeneration,
    sendCompare: (text: string, modelIds: string[]) => { void sendActions.sendCompare(text, modelIds); },
    scrollToMessage: layout.jumpToMessageAnchor,
    openCompareFullscreen,
  }), [acceptExternalDraft, completeExternalDraft, insertDraft, layout.jumpToMessageAnchor, messageActions.stopGeneration, openCompareFullscreen, sendActions]);

  const tokenEstimate = useMemo(() => messagesAll.reduce((acc, message) => acc + Math.ceil(message.content.length / 3), 0), [messagesAll]);
  const modelName = topic ? getModelLabel(topic.model) : "";
  const askIdHasImage = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const message of messagesAll) {
      if (message.role !== "user") continue;
      map.set(message.askId || message.id, Boolean(message.attachments?.some((attachment) => attachment.type === "image")));
    }
    return map;
  }, [messagesAll]);
  const slashCommands = useMemo(() => [
    { id: "new_context", name: t("chat.newContext"), action: messageActions.toggleNewContext },
    { id: "search_in_chat", name: t("search.inChat"), action: () => layout.openSearch() },
    { id: "multi_select", name: t("message.multiSelect"), action: () => layout.enterMultiSelect() },
    { id: "flow", name: t("navigation.flow"), action: () => layout.setFlowOpen(true) },
    { id: "bottom", name: t("navigation.bottom"), action: layout.scrollToBottom },
  ], [layout, messageActions.toggleNewContext, t]);

  return {
    ConfirmDialogPortal,
    askIdHasImage,
    browserContextPreflightPhase,
    closeCompareFullscreen,
    conversationState: resolvedConversationState,
    fullscreenCompareAskId,
    fullscreenCompareGroup,
    getModelLabel,
    getModelShortLabel,
    getProviderLogo,
    isAtBottom: layout.isAtBottom,
    isLoading,
    layout,
    messageActions,
    messagesAll,
    messagesLoading,
    modelMap,
    modelName,
    models,
    onModelSwitch,
    onOpenMcpSettings,
    onOpenMemorySettings,
    onOpenModelManager,
    onOpenPrompts,
    onOpenWebSearchSettings,
    onOpenNativeWebSearchSettings,
    openCompareFullscreen,
    pendingInputDraft: pendingInputDrafts[0] ?? null,
    keepInputVisibleForExternalDraft,
    providerLogoMap,
    replayActions,
    sendActions,
    settings,
    slashCommands,
    t,
    tokenEstimate,
    topic,
    updateAssistantConfig,
    updateTopicMeta,
    completeExternalDraft,
  };
}

/** 导出类型：`ChatAreaController`。 */
export type ChatAreaController = ReturnType<typeof useChatAreaController>;
