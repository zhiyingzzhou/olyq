/**
 * 说明：`useChatAreaLayoutState` 组件模块。
 *
 * 职责：
 * - 承载 `useChatAreaLayoutState` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useChatAreaLayoutState` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只消费主聊天虚拟化门面，不再承载第二套滚动状态机或 DOM 滚动写入。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useContentSearch } from "@/components/chat/hooks/useContentSearch";
import { useMessageNavigation } from "@/components/chat/hooks/useMessageNavigation";
import { useChatSearchDomEffects } from "@/components/chat/hooks/useChatSearchDomEffects";
import { useMultiSelect } from "@/components/chat/hooks/useMultiSelect";
import { useTranslationTasks } from "@/components/chat/hooks/useTranslationTasks";
import type { Message, ResolvedConversationContext, UpdateTopicMessages } from "@/types/chat";
import { buildRows, tailSignature, visibleAssistantOutputSignature } from "@/lib/chat/chat-utils";
import { useChatAreaVirtualizer } from "./useChatAreaVirtualizer";

type Confirm = (options: {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive";
}) => Promise<boolean>;

/**
 * 导出 Hook：`useChatAreaLayoutState`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useChatAreaLayoutState(params: {
  abortControllersRef: MutableRefObject<Map<string, { controller: AbortController; topicId: string; kind: "chat" | "aux" }>>;
  confirm: Confirm;
  latestMessagesRef: MutableRefObject<Message[]>;
  messageNavigation: "off" | "buttons" | "anchor";
  messagesAll: Message[];
  onUpdateMessages: UpdateTopicMessages;
  topic: ResolvedConversationContext | null;
  isLoading: boolean;
}) {
  const { abortControllersRef, confirm, isLoading, latestMessagesRef, messageNavigation, messagesAll, onUpdateMessages, topic } = params;
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const lastResetTopicIdRef = useRef<string | null>(null);
  const [expandedThinkingIds, setExpandedThinkingIds] = useState<Set<string>>(() => new Set());
  const {
    multiSelectMode,
    setMultiSelectMode,
    selectedIds,
    setSelectedIds,
    allSelected,
    selectDragRef,
    selectRect,
    setSelectRect,
    enterMultiSelect,
    exitMultiSelect,
    toggleSelect,
    toggleSelectAll,
    cleanupUnusedAttachments,
    handleMultiSelectCopy,
    handleMultiSelectSave,
    handleMultiSelectDelete,
    onMultiSelectMouseDown,
  } = useMultiSelect({
    topic,
    latestMessagesRef,
    onUpdateMessages,
    scrollRef,
    inputWrapRef,
    confirm,
  });

  const contentSearch = useContentSearch({ messagesAll, multiSelectMode, inputWrapRef });
  const translationTasks = useTranslationTasks({ topic, messagesAll, latestMessagesRef, abortControllersRef, onUpdateMessages });
  const tailSig = tailSignature(messagesAll);
  const lastMessage = messagesAll.at(-1) ?? null;
  const lastMessageId = messagesAll.at(-1)?.id ?? null;
  const lastVisibleOutputSignature = visibleAssistantOutputSignature(lastMessage);

  useEffect(() => {
    setExpandedThinkingIds(new Set());
  }, [topic?.id]);

  const rows = useMemo(() => buildRows(messagesAll, 0, isLoading), [isLoading, messagesAll]);
  const roleByMsgId = useMemo(() => {
    const map = new Map<string, Message["role"]>();
    for (const message of messagesAll) map.set(message.id, message.role);
    return map;
  }, [messagesAll]);
  const msgIdToRowIndex = useMemo(() => {
    const map = new Map<string, number>();
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row) continue;
      if (row.kind === "message") map.set(row.message.id, index);
      if (row.kind === "divider") map.set(row.message.id, index);
      if (row.kind === "group") row.assistants.forEach((assistant) => map.set(assistant.id, index));
    }
    return map;
  }, [rows]);
  const chatVirtualizer = useChatAreaVirtualizer({
    lastMessageId,
    lastVisibleOutputSignature,
    messageCount: messagesAll.length,
    messageIdToRowIndex: msgIdToRowIndex,
    rows,
    scrollRef,
    tailSig,
    topicId: topic?.id ?? null,
  });
  // bottom banner 的真源只认：已读节点之后的新节点，或已读尾部 assistant 的正文/附件继续增长。
  const readMarkerIndex = chatVirtualizer.readMarker.lastMessageId
    ? messagesAll.findIndex((message) => message.id === chatVirtualizer.readMarker.lastMessageId)
    : -1;
  const newNodeCount = Math.max(
    0,
    messagesAll.length - (readMarkerIndex >= 0 ? readMarkerIndex + 1 : chatVirtualizer.readMarker.messageCount),
  );
  const hasUnreadTailOutput = (
    newNodeCount === 0
    && lastMessage?.role === "assistant"
    && lastMessage.id === chatVirtualizer.readMarker.lastMessageId
    && lastVisibleOutputSignature !== chatVirtualizer.readMarker.lastVisibleOutputSignature
  );
  const hasUnreadTail = newNodeCount > 0 || hasUnreadTailOutput;
  // 用户已经接管阅读时，未读尾部优先于上一帧 strict-bottom 几何快照，避免小数上翻后被旧几何压掉提示。
  const canShowDetachedReadingBanner = (
    !chatVirtualizer.hasFollowBottomIntent
    && (!chatVirtualizer.isStrictBottom || hasUnreadTail)
  );
  const newCount = canShowDetachedReadingBanner
    ? (newNodeCount > 0 ? newNodeCount : (hasUnreadTailOutput ? 1 : 0))
    : 0;
  const showNewBanner = canShowDetachedReadingBanner && newCount > 0;

  const scrollToBottom = useCallback(() => {
    if (rows.length === 0) return;
    chatVirtualizer.scrollToBottom("raf");
  }, [chatVirtualizer, rows.length]);

  const scrollToBottomIfFollowing = useCallback(() => {
    if (rows.length === 0) return false;
    return chatVirtualizer.scrollToBottomIfFollowing("raf");
  }, [chatVirtualizer, rows.length]);

  const scrollToBottomAfterNextCommit = useCallback(() => {
    if (rows.length === 0) return;
    chatVirtualizer.scrollToBottomAfterNextCommit("raf");
  }, [chatVirtualizer, rows.length]);

  const scrollToBottomAfterNextCommitIfFollowing = useCallback(() => {
    if (rows.length === 0) return false;
    return chatVirtualizer.scrollToBottomAfterNextCommitIfFollowing("raf");
  }, [chatVirtualizer, rows.length]);

  const scrollToTop = useCallback(() => {
    if (rows.length === 0) return;
    chatVirtualizer.scrollToTop("raf");
  }, [chatVirtualizer, rows.length]);

  const updateGroupPrefs = useCallback((askId: string, patch: Partial<NonNullable<Message["groupPrefs"]>>) => {
    if (!topic) return;
    const nextMessages = latestMessagesRef.current.map((message) => {
      if (message.role !== "user") return message;
      const resolvedAskId = message.askId || message.id;
      if (resolvedAskId !== askId) return message;
      return { ...message, groupPrefs: { ...(message.groupPrefs || { style: "fold" }), ...patch } };
    });
    onUpdateMessages(topic.id, nextMessages);
  }, [latestMessagesRef, onUpdateMessages, topic]);

  const jumpToMessageAnchor = useCallback((messageId: string) => {
    const id = String(messageId || "").trim();
    if (!id || !topic) return false;
    if (multiSelectMode) exitMultiSelect();
    const target = latestMessagesRef.current.find((message) => message.id === id) ?? null;
    if (!target) return false;
    if (target.role === "assistant" && target.askId) {
      updateGroupPrefs(target.askId, { foldSelectedModelId: id });
    }
    return chatVirtualizer.jumpToMessageAnchor(id, "start");
  }, [chatVirtualizer, exitMultiSelect, latestMessagesRef, multiSelectMode, topic, updateGroupPrefs]);

  const messageNavigationState = useMessageNavigation({
    topic,
    messagesAll,
    rows,
    viewportSnapshot: chatVirtualizer.viewportSnapshot,
    isAtBottom: chatVirtualizer.isStrictBottom,
    messageNavigation,
    multiSelectMode,
    jumpToMessageAnchor,
    scrollToTop,
    scrollToBottom,
  });

  useChatSearchDomEffects({
    effectiveSearchCaseSensitive: contentSearch.effectiveSearchCaseSensitive,
    effectiveSearchWholeWord: contentSearch.effectiveSearchWholeWord,
    expandedThinkingIds,
    latestMessagesRef,
    msgIdToRowIndex,
    navigationFlashRequest: messageNavigationState.navFlashRequest,
    pendingSearchJumpRef: contentSearch.pendingSearchJumpRef,
    roleByMsgId,
    scrollRangeIntoView: chatVirtualizer.scrollRangeIntoView,
    scrollToMessageRow: chatVirtualizer.scrollToMessageRow,
    scrollRef,
    searchActiveIndex: contentSearch.searchActiveIndex,
    searchIncludeUser: contentSearch.searchIncludeUser,
    searchMatches: contentSearch.searchMatches,
    searchOpen: contentSearch.searchOpen,
    searchQuery: contentSearch.searchQuery,
    updateGroupPrefs,
  });

  const resetTransientChatUiState = useCallback(() => {
    setMultiSelectMode(false);
    setSelectedIds(new Set());
    setSelectRect(null);
    selectDragRef.current = null;
    const resetSearchState = (contentSearch as { resetSearchState?: unknown }).resetSearchState;
    if (typeof resetSearchState === "function") {
      resetSearchState();
    } else {
      contentSearch.pendingSearchJumpRef.current = null;
    }
    messageNavigationState.setNavPanelOpen(false);
    messageNavigationState.setFlowOpen(false);
  }, [
    contentSearch,
    messageNavigationState,
    selectDragRef,
    setMultiSelectMode,
    setSelectRect,
    setSelectedIds,
  ]);

  useEffect(() => {
    const currentTopicId = topic?.id ?? "";
    if (lastResetTopicIdRef.current === currentTopicId) return;
    lastResetTopicIdRef.current = currentTopicId;
    resetTransientChatUiState();
  }, [resetTransientChatUiState, topic?.id]);

  const handleScroll = useCallback(() => {
    chatVirtualizer.handleScroll();
  }, [chatVirtualizer]);

  return {
    ...contentSearch,
    ...messageNavigationState,
    ...translationTasks,
    allSelected,
    cleanupUnusedAttachments,
    enterMultiSelect,
    expandedThinkingIds,
    exitMultiSelect,
    handleMultiSelectCopy,
    handleMultiSelectDelete,
    handleMultiSelectSave,
    handleScroll,
    handleScrollbarDragStart: chatVirtualizer.handleScrollbarDragStart,
    handleKeyScrollIntent: chatVirtualizer.handleKeyScrollIntent,
    handleTouchMove: chatVirtualizer.handleTouchMove,
    handleTouchStart: chatVirtualizer.handleTouchStart,
    handleTranscriptInteraction: chatVirtualizer.handleTranscriptInteraction,
    handleWheelIntent: chatVirtualizer.handleWheelIntent,
    hasFollowBottomIntent: chatVirtualizer.hasFollowBottomIntent,
    inputWrapRef,
    isAtBottom: chatVirtualizer.isAtBottom,
    isStrictBottom: chatVirtualizer.isStrictBottom,
    isAtTop: chatVirtualizer.isAtTop,
    measureElement: chatVirtualizer.measureElement,
    messageViewportHeight: chatVirtualizer.messageViewportHeight,
    msgIdToRowIndex,
    multiSelectMode,
    newCount,
    onMultiSelectMouseDown,
    readMarker: chatVirtualizer.readMarker,
    rootRef,
    roleByMsgId,
    rows,
    scrollRangeIntoView: chatVirtualizer.scrollRangeIntoView,
    scrollRef,
    scrollToBottom,
    scrollToBottomIfFollowing,
    scrollToBottomAfterNextCommit,
    scrollToBottomAfterNextCommitIfFollowing,
    jumpToMessageAnchor,
    scrollToTop,
    selectDragRef,
    selectRect,
    selectedIds,
    setExpandedThinkingIds,
    setSelectRect,
    setSelectedIds,
    showNewBanner,
    tailSig,
    toggleSelect,
    toggleSelectAll,
    updateGroupPrefs,
    viewportSnapshot: chatVirtualizer.viewportSnapshot,
    virtualItems: chatVirtualizer.virtualItems,
    virtualTotalSize: chatVirtualizer.totalSize,
    visibleTopRowIndex: chatVirtualizer.visibleTopRowIndex,
  };
}
