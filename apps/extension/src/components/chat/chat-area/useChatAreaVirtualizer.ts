/**
 * 说明：`useChatAreaVirtualizer` 组件模块。
 *
 * 职责：
 * - 承载聊天主列表虚拟滚动的唯一真源；
 * - 统一收口动态高度测量、viewport 监听、启动恢复、贴底跟随、程序化跳转和用户阅读锁；
 * - 对外暴露稳定的虚拟化门面，避免业务层继续直接依赖原始 virtualizer 实例或直接写入 DOM 滚动位置。
 *
 * 边界：
 * - 本文件只处理聊天主列表的虚拟滚动与滚动状态机契约；
 * - 具体 session 类型、viewport snapshot 捕获和滚动命令执行逻辑已经拆到独立 helper，避免再次形成新热点文件。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

import type { ChatRow } from "@/lib/chat/chat-utils";
import {
  isSameReadMarker,
  useChatScrollSessionState,
} from "./chatScrollSession";
import { useChatVirtualizerBottomReadSync } from "./chatVirtualizerBottomReadSync";
import { useChatVirtualizerCommandPipeline } from "./chatVirtualizerCommandPipeline";
import { useChatVirtualizerRowVirtualizer } from "./chatVirtualizerRowVirtualizer";
import { scheduleChatForegroundRefresh, tryRunChatStartupRestore } from "./chatVirtualizerStartup";
import { useChatAnchorTailSlack } from "./chatVirtualizerTailSlack";
import { useChatVirtualizerMeasurementRuntime } from "./chatVirtualizerMeasurements";
import {
  mountChatViewportLifecycle,
  resetChatViewportFrames,
  type ChatViewportRuntime,
} from "./chatVirtualizerViewport";
import {
  useChatAreaScrollOwner,
  type ChatFollowMode,
  type ChatProgrammaticCommandOutcome,
  type ChatProgrammaticCommandSession,
} from "./useChatAreaScrollOwner";

export type { ChatReadMarker, ChatViewportSnapshot, ChatVirtualScrollAlign } from "./chatScrollSession";

interface UseChatAreaVirtualizerParams {
  readonly lastMessageId: string | null;
  readonly lastVisibleOutputSignature: string;
  readonly messageCount: number;
  readonly messageIdToRowIndex: Map<string, number>;
  readonly rows: ChatRow[];
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly tailSig: string;
  readonly topicId: string | null;
}

/**
 * 导出 Hook：`useChatAreaVirtualizer`。
 *
 * @remarks
 * 为聊天主列表提供统一虚拟化门面。
 */
export function useChatAreaVirtualizer({
  lastMessageId,
  lastVisibleOutputSignature,
  messageCount,
  messageIdToRowIndex,
  rows,
  scrollRef,
  tailSig,
  topicId,
}: UseChatAreaVirtualizerParams) {
  const [messageViewportHeight, setMessageViewportHeight] = useState<number | null>(null);
  const [visibleTopRowIndex, setVisibleTopRowIndex] = useState<number | null>(null);
  const [ownerSeedFollowMode, setOwnerSeedFollowMode] = useState<ChatFollowMode>("follow-bottom");
  const rowsLengthRef = useRef(rows.length);
  const rowsRef = useRef(rows);
  const bottomCommandRevisionRef = useRef({ key: `${rows.length}:${tailSig}`, revision: 0 });
  const foregroundRefreshFrameRef = useRef<number | null>(null);
  const pendingBottomRetrySnapshotRef = useRef<{
    token: number;
    repeatCount: number;
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const detachedReadingAnchorRowIndexRef = useRef<number | null>(null);
  const viewportRuntimeRef = useRef<ChatViewportRuntime | null>(null);
  const handleProgrammaticCommandPendingRef = useRef<(session: ChatProgrammaticCommandSession) => void>(() => undefined);
  const handleProgrammaticCommandSettledRef = useRef<(outcome: ChatProgrammaticCommandOutcome) => void>(() => undefined);
  const syncStrictBottomReadMarkerRef = useRef<() => boolean>(() => false);
  rowsLengthRef.current = rows.length;
  rowsRef.current = rows;
  const nextBottomCommandKey = `${rows.length}:${tailSig}`;
  if (bottomCommandRevisionRef.current.key !== nextBottomCommandKey) {
    bottomCommandRevisionRef.current = {
      key: nextBottomCommandKey,
      revision: bottomCommandRevisionRef.current.revision + 1,
    };
  }
  const handleOwnerProgrammaticCommandPending = useCallback((session: ChatProgrammaticCommandSession) => {
    handleProgrammaticCommandPendingRef.current(session);
  }, []);
  const handleOwnerProgrammaticCommandSettled = useCallback((outcome: ChatProgrammaticCommandOutcome) => {
    handleProgrammaticCommandSettledRef.current(outcome);
    if (outcome.strictBottom) syncStrictBottomReadMarkerRef.current();
  }, []);

  const { commitSession, ensureCurrentSession, handleFollowModeChange, readMarker, resolveSnapshotRowIndex, viewportSnapshot } = useChatScrollSessionState({
    lastMessageId,
    lastVisibleOutputSignature,
    messageCount,
    messageIdToRowIndex,
    rows,
    topicId,
  });
  detachedReadingAnchorRowIndexRef.current = viewportSnapshot.kind === "row-anchor"
    ? viewportSnapshot.rowIndex
    : visibleTopRowIndex;

  const { anchorTailSlackHeight, anchorTailSlackHeightRef, disableAnchorTailSlack, enableAnchorTailSlack } = useChatAnchorTailSlack(messageViewportHeight);
  const canSettleOwnerProgrammaticCommand = useCallback((session: ChatProgrammaticCommandSession) => (
    session.settleTarget !== "follow-bottom"
    || session.minimumDataRevision == null
    || bottomCommandRevisionRef.current.revision >= session.minimumDataRevision
  ), []);

  const {
    activeProgrammaticCommandRef,
    beginProgrammaticCommand,
    cancelPendingModeSettle,
    cancelProgrammaticCommand,
    cancelPendingStartupRestore,
    claimProgrammaticCommandAttempt,
    handleKeyScrollIntent: ownerHandleKeyScrollIntent,
    handleScroll: handleOwnerScroll,
    handleScrollbarDragStart: ownerHandleScrollbarDragStart,
    handleTouchMove: ownerHandleTouchMove,
    handleTouchStart: ownerHandleTouchStart,
    handleTranscriptInteraction: ownerHandleTranscriptInteraction,
    handleWheelIntent: ownerHandleWheelIntent,
    isAtBottom,
    isAtTop,
    isStrictBottom,
    isProgrammaticCommandAttemptActive,
    markProgrammaticCommandReady,
    pendingStartupRestoreTopicIdRef,
    readScrollPositionState,
    scheduleProgrammaticModeSettle,
    scheduleScrollCommand,
    scrollModeRef,
    scrollModeSnapshot,
    startupRestoreTokenRef,
    syncScrollPositionFromDom,
    syncPositionState,
  } = useChatAreaScrollOwner({
    canSettleProgrammaticCommand: canSettleOwnerProgrammaticCommand,
    initialFollowMode: ownerSeedFollowMode,
    onFollowModeChange: handleFollowModeChange,
    onProgrammaticCommandPending: handleOwnerProgrammaticCommandPending,
    onProgrammaticCommandSettled: handleOwnerProgrammaticCommandSettled,
    scrollRef,
    topicId,
  });

  const scrollToFn = useCallback((offset: number, options: { adjustments?: number; behavior?: ScrollBehavior }, _instance: unknown) => {
    scrollRef.current?.scrollTo({ top: offset + (options.adjustments ?? 0), behavior: options.behavior ?? "auto" });
  }, [scrollRef]);

  const bottomReadSync = useChatVirtualizerBottomReadSync({
    commitSession,
    lastMessageId,
    lastVisibleOutputSignature,
    messageCount,
    scrollModeRef,
    syncScrollPositionFromDom,
  });
  const {
    cancelPendingBottomReadSync,
    markRead,
    scheduleStrictBottomReadMarkerSync,
    syncStrictBottomReadMarker,
  } = bottomReadSync;
  syncStrictBottomReadMarkerRef.current = syncStrictBottomReadMarker;

  const rowVirtualizer = useChatVirtualizerRowVirtualizer({
    activeProgrammaticCommandRef,
    detachedReadingAnchorRowIndexRef,
    getScrollElement: () => scrollRef.current,
    onVirtualizerChange: () => {
      /**
       * TanStack Virtual 的 ResizeObserver 可能晚于 React 的流式正文 commit 才把动态行高写回。
       * 这里把“测量 epoch 已更新”的事实接回同一个几何同步队列：follow-bottom 可刷新已读；
       * detached-reading 只同步 strict-bottom 状态，不接管 owner，也不清掉未读尾部。
       */
      scheduleStrictBottomReadMarkerSync({ replacePending: true });
    },
    rows,
    rowsLengthRef,
    scrollModeRef,
    scrollToFn,
    setVisibleTopRowIndex,
    topicId,
  });

  const {
    lastViewportSizeRef,
    measureElement,
    measureMountedRows,
    measureMountedRowsOnly,
    mountedRowsMeasureFrameRef,
    resetAndMeasureRows,
    syncViewportMetrics,
  } = useChatVirtualizerMeasurementRuntime({
    onRowsMeasured: () => scheduleStrictBottomReadMarkerSync({ replacePending: true }),
    rowVirtualizer,
    scrollRef,
    setMessageViewportHeight,
  });

  const handleWheelIntent = useCallback((deltaY: number) => {
    ownerHandleWheelIntent(deltaY);
  }, [ownerHandleWheelIntent]);

  const handleTouchMove = useCallback((clientY: number) => {
    ownerHandleTouchMove(clientY);
  }, [ownerHandleTouchMove]);

  const handleKeyScrollIntent = useCallback((key: string) => {
    ownerHandleKeyScrollIntent(key);
  }, [ownerHandleKeyScrollIntent]);

  const handleTranscriptInteraction = useCallback((options?: Parameters<typeof ownerHandleTranscriptInteraction>[0]) => {
    ownerHandleTranscriptInteraction(options);
  }, [ownerHandleTranscriptInteraction]);

  const handleScrollbarDragStart = useCallback(() => {
    ownerHandleScrollbarDragStart();
  }, [ownerHandleScrollbarDragStart]);

  const {
    captureViewportSnapshot,
    issueScrollCommand,
    jumpToMessageAnchor,
    readViewportSnapshot,
    scrollRangeIntoView,
    scrollToBottom,
    scrollToBottomAfterNextCommit,
    scrollToBottomAfterNextCommitIfFollowing,
    scrollToBottomIfFollowing,
    scrollToMessageRow,
    scrollToRowIndex,
    scrollToTop,
  } = useChatVirtualizerCommandPipeline({
    activeProgrammaticCommandRef,
    anchorTailSlackHeightRef,
    beginProgrammaticCommand,
    bottomCommandRevisionRef,
    cancelPendingModeSettle,
    cancelPendingStartupRestore,
    cancelProgrammaticCommand,
    claimProgrammaticCommandAttempt,
    commitSession,
    disableAnchorTailSlack,
    enableAnchorTailSlack,
    handleProgrammaticCommandPendingRef,
    handleProgrammaticCommandSettledRef,
    isProgrammaticCommandAttemptActive,
    markProgrammaticCommandReady,
    measureMountedRows,
    messageIdToRowIndex,
    pendingBottomRetrySnapshotRef,
    readScrollPositionState,
    resolveSnapshotRowIndex,
    rowVirtualizer,
    rowsLengthRef,
    rowsRef,
    scheduleProgrammaticModeSettle,
    scheduleScrollCommand,
    scrollModeRef,
    scrollRef,
    topicId,
  });

  const resetAndMeasureRowsWithAnchor = useCallback(() => {
    const snapshot = readViewportSnapshot({ preferRowAnchor: true });
    if (!snapshot) return false;
    resetAndMeasureRows();
    return issueScrollCommand({
      snapshot,
      type: "row-snapshot",
    }, {
      cancelStartupRestore: false,
      defer: "raf",
    });
  }, [issueScrollCommand, readViewportSnapshot, resetAndMeasureRows]);

  const tryRunStartupRestore = useCallback(() => (
    tryRunChatStartupRestore({
      ensureCurrentSession,
      issueScrollCommand,
      pendingStartupRestoreTopicIdRef,
      resetAndMeasureRows,
      rowsLength: rows.length,
      scrollRef,
      startupRestoreTokenRef,
      topicId,
    })
  ), [
    ensureCurrentSession,
    issueScrollCommand,
    pendingStartupRestoreTopicIdRef,
    resetAndMeasureRows,
    rows.length,
    scrollRef,
    startupRestoreTokenRef,
    topicId,
  ]);

  const scheduleForegroundRefresh = useCallback(() => {
    scheduleChatForegroundRefresh({
      foregroundRefreshFrameRef,
      issueScrollCommand,
      measureMountedRowsOnly,
      pendingStartupRestoreTopicIdRef,
      resetAndMeasureRows,
      resetAndMeasureRowsWithAnchor,
      rowsLengthRef,
      scrollRef,
      scrollModeRef,
      syncViewportMetrics,
      topicId,
      tryRunStartupRestore,
    });
  }, [
    issueScrollCommand,
    measureMountedRowsOnly,
    pendingStartupRestoreTopicIdRef,
    resetAndMeasureRows,
    resetAndMeasureRowsWithAnchor,
    rowsLengthRef,
    scrollRef,
    scrollModeRef,
    syncViewportMetrics,
    topicId,
    tryRunStartupRestore,
  ]);

  useEffect(() => {
    if (rows.length === 0) return;
    if (scrollModeRef.current !== "follow-bottom") return;
    issueScrollCommand({ type: "bottom" }, { defer: "raf" });
  }, [issueScrollCommand, rows.length, scrollModeRef, tailSig]);

  viewportRuntimeRef.current = {
    cancelPendingModeSettle,
    issueScrollCommand,
    measureMountedRowsOnly,
    pendingStartupRestoreTopicIdRef,
    resetAndMeasureRows,
    resetAndMeasureRowsWithAnchor,
    rowsLengthRef,
    scheduleForegroundRefresh,
    scrollModeRef,
    syncViewportMetrics,
    topicId,
    tryRunStartupRestore,
  };

  const handleScroll = useCallback(() => {
    const shouldCaptureViewportSnapshot = handleOwnerScroll();
    const element = scrollRef.current;
    const syncedBottom = syncStrictBottomReadMarker();
    if (element && scrollModeRef.current === "follow-bottom" && !(syncedBottom || readScrollPositionState(element).strictBottom)) {
      scrollToBottomIfFollowing("raf");
    }
    if (!shouldCaptureViewportSnapshot) return;
    captureViewportSnapshot();
  }, [
    captureViewportSnapshot,
    handleOwnerScroll,
    readScrollPositionState,
    scrollModeRef,
    scrollRef,
    scrollToBottomIfFollowing,
    syncStrictBottomReadMarker,
  ]);

  useEffect(() => {
    const currentSession = ensureCurrentSession();
    cancelPendingBottomReadSync();
    setOwnerSeedFollowMode(currentSession.followMode);
    disableAnchorTailSlack();
    commitSession({
      followMode: currentSession.followMode,
      readMarker: currentSession.readMarker,
      viewportSnapshot: currentSession.viewportSnapshot,
    });

    setVisibleTopRowIndex(null);
    setMessageViewportHeight(null);
    lastViewportSizeRef.current = null;

    resetChatViewportFrames({
      foregroundRefreshFrameRef,
      mountedRowsMeasureFrameRef,
    });

    if (currentSession.viewportSnapshot.kind === "top") {
      syncPositionState(true, false, false);
      return;
    }

    if (currentSession.viewportSnapshot.kind === "bottom") {
      syncPositionState(false, true, true);
      return;
    }

    syncPositionState(false, false, false);
  }, [
    commitSession,
    cancelPendingBottomReadSync,
    disableAnchorTailSlack,
    ensureCurrentSession,
    foregroundRefreshFrameRef,
    lastViewportSizeRef,
    mountedRowsMeasureFrameRef,
    syncPositionState,
    topicId,
  ]);

  useEffect(() => {
    const currentSession = ensureCurrentSession();
    if (!isSameReadMarker(currentSession.readMarker, readMarker)) {
      commitSession({ readMarker: currentSession.readMarker });
    }
  }, [commitSession, ensureCurrentSession, lastVisibleOutputSignature, messageCount, readMarker, tailSig, topicId]);

  useEffect(() => {
    if (rows.length > 0) return;
    setVisibleTopRowIndex(null);
    disableAnchorTailSlack();
    syncPositionState(true, true, true);
  }, [disableAnchorTailSlack, rows.length, syncPositionState]);

  useEffect(() => {
    return mountChatViewportLifecycle({
      frameRefs: {
        foregroundRefreshFrameRef,
        mountedRowsMeasureFrameRef,
      },
      runtimeRef: viewportRuntimeRef,
      scrollRef,
    });
  }, [foregroundRefreshFrameRef, mountedRowsMeasureFrameRef, scrollRef, topicId, viewportRuntimeRef]);

  useEffect(() => {
    void tryRunStartupRestore();
  }, [tryRunStartupRestore]);

  useEffect(() => {
    if (rows.length < 1) return;
    if (pendingStartupRestoreTopicIdRef.current === (topicId ?? "")) return;
    if (scrollModeRef.current !== "follow-bottom") return;

    issueScrollCommand({ type: "bottom" }, { defer: "raf" });
  }, [issueScrollCommand, pendingStartupRestoreTopicIdRef, rows, scrollModeRef, topicId]);

  useEffect(() => {
    if (!isStrictBottom) return;
    disableAnchorTailSlack();
  }, [disableAnchorTailSlack, isStrictBottom]);

  useLayoutEffect(() => {
    syncStrictBottomReadMarker();
    scheduleStrictBottomReadMarkerSync();
  }, [anchorTailSlackHeight, isStrictBottom, lastVisibleOutputSignature, rows.length, scheduleStrictBottomReadMarkerSync, scrollModeSnapshot, syncStrictBottomReadMarker]);

  useEffect(() => {
    scheduleStrictBottomReadMarkerSync({ replacePending: true });
  }, [anchorTailSlackHeight, lastVisibleOutputSignature, rows.length, scheduleStrictBottomReadMarkerSync]);

  /**
   * 这里不能再把 `getVirtualItems()` / `getTotalSize()` 包进 `useMemo`。
   *
   * 说明：
   * - TanStack Virtual 在测量后会复用同一个 virtualizer 实例，但其内部快照会更新；
   * - 如果外层只按实例引用做 memo，渲染层就会继续拿到旧的 start / totalSize；
   * - 这正是聊天区出现“中间大空白、底部大空白”的根因之一。
   */
  const virtualTotalSize = rowVirtualizer.getTotalSize() + anchorTailSlackHeight;
  // follow-bottom 的意图由滚动 owner 持有；layout 层只能消费这个只读事实，不能用瞬时几何 gap 反推出“用户在上方阅读”。
  const hasFollowBottomIntent = (
    scrollModeSnapshot === "follow-bottom"
    || activeProgrammaticCommandRef.current?.settleTarget === "follow-bottom"
  );

  return {
    handleKeyScrollIntent,
    handleScroll,
    handleScrollbarDragStart,
    handleTouchMove,
    handleTouchStart: ownerHandleTouchStart,
    handleTranscriptInteraction,
    handleWheelIntent,
    hasFollowBottomIntent,
    isAtBottom,
    isAtTop,
    isStrictBottom,
    markRead,
    measureElement,
    messageViewportHeight,
    readMarker,
    scrollRangeIntoView,
    scrollToBottom,
    scrollToBottomIfFollowing,
    scrollToBottomAfterNextCommit,
    scrollToBottomAfterNextCommitIfFollowing,
    jumpToMessageAnchor,
    scrollToMessageRow,
    scrollToRowIndex,
    scrollToTop,
    totalSize: virtualTotalSize,
    viewportSnapshot,
    virtualItems: rowVirtualizer.getVirtualItems(),
    visibleTopRowIndex,
  };
}
