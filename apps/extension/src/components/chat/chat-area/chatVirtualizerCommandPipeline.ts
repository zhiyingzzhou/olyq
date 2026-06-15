/**
 * 说明：`chatVirtualizerCommandPipeline` 主聊天滚动命令管线模块。
 *
 * 职责：
 * - 收口主聊天 programmatic scroll command 的装配、执行与结算回写；
 * - 把 `useChatAreaVirtualizer.ts` 从命令编排细节里剥离，避免继续膨胀成热点文件。
 *
 * 边界：
 * - 本文件只编排主聊天滚动命令，不负责 virtualizer 实例创建；
 * - 不直接写 DOM 滚动，真实滚动仍然只通过 virtualizer facade 落到 `scrollToFn`。
 */
import { useCallback, useEffect, type MutableRefObject, type RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";

import { cssEscape, type ChatRow } from "@/lib/chat/chat-utils";
import {
  captureChatViewportSnapshot,
  isChatMessageVisibleInViewport,
  readChatViewportSnapshot,
  runChatScrollCommand,
  type ChatScrollCommand,
} from "./chatScrollCommands";
import { resolveChatViewportAnchor, type ChatScrollSession } from "./chatScrollSession";
import { applyChatProgrammaticCommandOutcome } from "./chatVirtualizerSessionOutcome";
import { useChatVirtualizerCommands } from "./chatVirtualizerCommands";
import type {
  ChatFollowMode,
  ChatProgrammaticCommandOutcome,
  ChatProgrammaticCommandSession,
  ChatProgrammaticSettleTarget,
} from "./useChatAreaScrollOwner";

interface PendingBottomRetrySnapshot {
  readonly repeatCount: number;
  readonly scrollHeight: number;
  readonly scrollTop: number;
  readonly token: number;
}

interface UseChatVirtualizerCommandPipelineParams {
  readonly activeProgrammaticCommandRef: MutableRefObject<ChatProgrammaticCommandSession | null>;
  readonly anchorTailSlackHeightRef: MutableRefObject<number>;
  readonly beginProgrammaticCommand: (
    type: ChatProgrammaticCommandSession["type"],
    settleTarget: ChatProgrammaticSettleTarget,
    options?: { anchorMessageId?: string | null; minimumDataRevision?: number | null },
  ) => { readonly token: number };
  readonly bottomCommandRevisionRef: MutableRefObject<{ key: string; revision: number }>;
  readonly cancelPendingModeSettle: () => void;
  readonly cancelPendingStartupRestore: () => void;
  readonly cancelProgrammaticCommand: (token?: number) => void;
  readonly claimProgrammaticCommandAttempt: (token: number, options?: { dataRevision?: number | null }) => number | null;
  readonly commitSession: (patch: Partial<ChatScrollSession>) => void;
  readonly disableAnchorTailSlack: () => void;
  readonly enableAnchorTailSlack: () => void;
  readonly handleProgrammaticCommandPendingRef: MutableRefObject<(session: ChatProgrammaticCommandSession) => void>;
  readonly handleProgrammaticCommandSettledRef: MutableRefObject<(outcome: ChatProgrammaticCommandOutcome) => void>;
  readonly isProgrammaticCommandAttemptActive: (token: number, attempt: number) => boolean;
  readonly markProgrammaticCommandReady: (token: number, attempt: number) => boolean;
  readonly measureMountedRows: () => void;
  readonly messageIdToRowIndex: Map<string, number>;
  readonly pendingBottomRetrySnapshotRef: MutableRefObject<PendingBottomRetrySnapshot | null>;
  readonly readScrollPositionState: (element: HTMLDivElement) => {
    atTop: boolean;
    currentTop: number;
    distance: number;
    nearBottom: boolean;
    strictBottom: boolean;
  };
  readonly resolveSnapshotRowIndex: Parameters<typeof runChatScrollCommand>[0]["resolveRestoreRowIndex"];
  readonly rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  readonly rowsLengthRef: MutableRefObject<number>;
  readonly rowsRef: MutableRefObject<ChatRow[]>;
  readonly scheduleProgrammaticModeSettle: (token?: number, attempt?: number) => void;
  readonly scheduleScrollCommand: (run: () => void, defer?: "microtask" | "raf") => void;
  readonly scrollModeRef: MutableRefObject<"startup-restore" | ChatFollowMode | "programmatic">;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly topicId: string | null;
}

interface ReadViewportSnapshotOptions {
  readonly preferRowAnchor?: boolean;
}

/**
 * 导出 Hook：`useChatVirtualizerCommandPipeline`。
 *
 * @remarks
 * 为主聊天虚拟滚动组装统一 command pipeline，并返回外部可消费的滚动命令门面。
 */
export function useChatVirtualizerCommandPipeline({
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
}: UseChatVirtualizerCommandPipelineParams) {
  const captureViewportSnapshot = useCallback(() => (
    captureChatViewportSnapshot({
      commitSession,
      readScrollPositionState,
      rowsLengthRef,
      rowsRef,
      scrollRef,
      topicId,
    })
  ), [commitSession, readScrollPositionState, rowsLengthRef, rowsRef, scrollRef, topicId]);

  const readViewportSnapshot = useCallback((options?: ReadViewportSnapshotOptions) => (
    readChatViewportSnapshot({
      preferRowAnchor: options?.preferRowAnchor,
      readScrollPositionState,
      rowsLengthRef,
      rowsRef,
      scrollRef,
      topicId,
    })
  ), [readScrollPositionState, rowsLengthRef, rowsRef, scrollRef, topicId]);

  const captureViewportSnapshotForMessageAnchor = useCallback((messageId: string) => {
    const element = scrollRef.current;
    if (!element) return false;

    const targetNode = element.querySelector<HTMLElement>(`[data-msg-id="${cssEscape(messageId)}"]`);
    if (!targetNode) return false;

    const rowNode = targetNode.closest<HTMLElement>("[data-index]") ?? targetNode;
    const rawRowIndex = Number(rowNode.dataset.index ?? "-1");
    if (!Number.isFinite(rawRowIndex) || rawRowIndex < 0 || rawRowIndex >= rowsLengthRef.current) return false;

    const containerRect = element.getBoundingClientRect();
    const targetRect = targetNode.getBoundingClientRect();
    const anchor = resolveChatViewportAnchor(rowsRef.current[rawRowIndex], rawRowIndex, topicId);
    commitSession({
      viewportSnapshot: {
        ...anchor,
        kind: "row-anchor",
        offset: Math.round(targetRect.top - containerRect.top),
      },
    });
    return true;
  }, [commitSession, rowsLengthRef, rowsRef, scrollRef, topicId]);

  useEffect(() => {
    handleProgrammaticCommandSettledRef.current = (outcome) => {
      applyChatProgrammaticCommandOutcome({
        captureViewportSnapshot,
        captureViewportSnapshotForMessageAnchor,
        commitSession,
        outcome,
      });
      if (outcome.settleTarget === "follow-bottom" || outcome.type === "top") {
        disableAnchorTailSlack();
        return;
      }
      if (outcome.type === "message-anchor") {
        enableAnchorTailSlack();
      }
    };
  }, [
    captureViewportSnapshot,
    captureViewportSnapshotForMessageAnchor,
    commitSession,
    disableAnchorTailSlack,
    enableAnchorTailSlack,
    handleProgrammaticCommandSettledRef,
  ]);

  const isMessageVisibleInViewport = useCallback((messageId: string) => (
    isChatMessageVisibleInViewport({ messageId, scrollRef })
  ), [scrollRef]);

  const runScrollCommand = useCallback((command: ChatScrollCommand, programmaticCommandToken: number) => (
    runChatScrollCommand({
      claimProgrammaticCommandAttempt,
      command,
      dataRevision: command.type === "bottom" || (command.type === "row-snapshot" && command.snapshot.kind === "bottom")
        ? bottomCommandRevisionRef.current.revision
        : null,
      getScrollBottomSlack: () => anchorTailSlackHeightRef.current,
      isProgrammaticCommandAttemptActive,
      markProgrammaticCommandReady,
      measureMountedRows,
      messageIdToRowIndex,
      programmaticCommandToken,
      readScrollPositionState,
      resolveRestoreRowIndex: resolveSnapshotRowIndex,
      rowVirtualizer,
      rowsLengthRef,
      scheduleProgrammaticModeSettle,
      scrollRef,
    })
  ), [
    anchorTailSlackHeightRef,
    bottomCommandRevisionRef,
    claimProgrammaticCommandAttempt,
    isProgrammaticCommandAttemptActive,
    markProgrammaticCommandReady,
    measureMountedRows,
    messageIdToRowIndex,
    readScrollPositionState,
    resolveSnapshotRowIndex,
    rowVirtualizer,
    rowsLengthRef,
    scheduleProgrammaticModeSettle,
    scrollRef,
  ]);

  useEffect(() => {
    handleProgrammaticCommandPendingRef.current = (session) => {
      if (session.settleTarget !== "follow-bottom") return;
      const MAX_BOTTOM_STALL_RETRIES = 6;
      scheduleScrollCommand(() => {
        if (activeProgrammaticCommandRef.current?.token !== session.token) return;
        const element = scrollRef.current;
        if (element) {
          const previousSnapshot = pendingBottomRetrySnapshotRef.current;
          const currentScrollHeight = element.scrollHeight;
          const currentScrollTop = element.scrollTop;
          const previousScrollHeight = previousSnapshot?.scrollHeight ?? null;
          const previousScrollTop = previousSnapshot?.scrollTop ?? null;
          const sameGeometry = Boolean(
            previousSnapshot
            && previousSnapshot.token === session.token
            && previousScrollTop === currentScrollTop
            && previousScrollHeight === currentScrollHeight
          );
          if (sameGeometry && (previousSnapshot?.repeatCount ?? 0) >= MAX_BOTTOM_STALL_RETRIES) {
            return;
          }
          pendingBottomRetrySnapshotRef.current = {
            token: session.token,
            repeatCount: sameGeometry ? (previousSnapshot?.repeatCount ?? 0) + 1 : 0,
            scrollHeight: currentScrollHeight,
            scrollTop: currentScrollTop,
          };
        } else {
          pendingBottomRetrySnapshotRef.current = null;
        }
        runScrollCommand({ type: "bottom" }, session.token);
      }, "raf");
    };
  }, [
    activeProgrammaticCommandRef,
    handleProgrammaticCommandPendingRef,
    pendingBottomRetrySnapshotRef,
    runScrollCommand,
    scheduleScrollCommand,
    scrollRef,
  ]);

  const issueScrollCommand = useCallback((
    command: ChatScrollCommand,
    options?: { cancelStartupRestore?: boolean; defer?: "microtask" | "raf"; minimumDataRevision?: number | null },
  ) => {
    if (command.type === "message-anchor") {
      enableAnchorTailSlack();
    } else if (command.type === "bottom" || command.type === "top") {
      disableAnchorTailSlack();
    }
    cancelPendingModeSettle();
    if (options?.cancelStartupRestore !== false) {
      cancelPendingStartupRestore();
    }
    const settleTarget: ChatProgrammaticSettleTarget = (
      command.type === "bottom" || (command.type === "row-snapshot" && command.snapshot.kind === "bottom")
    )
      ? "follow-bottom"
      : "detached-reading";
    if (settleTarget === "follow-bottom" && options?.minimumDataRevision != null) {
      commitSession({ followMode: "follow-bottom" });
    }
    const session = beginProgrammaticCommand(command.type, settleTarget, {
      anchorMessageId: command.type === "message-anchor" ? command.messageId : null,
      minimumDataRevision: settleTarget === "follow-bottom" ? (options?.minimumDataRevision ?? null) : null,
    });
    scheduleScrollCommand(() => {
      const status = runScrollCommand(command, session.token);
      if (status === "executed") return;
      cancelProgrammaticCommand(session.token);
    }, options?.defer);
    return true;
  }, [
    beginProgrammaticCommand,
    cancelPendingModeSettle,
    cancelPendingStartupRestore,
    cancelProgrammaticCommand,
    commitSession,
    disableAnchorTailSlack,
    enableAnchorTailSlack,
    runScrollCommand,
    scheduleScrollCommand,
  ]);

  const {
    jumpToMessageAnchor,
    scrollRangeIntoView,
    scrollToBottom,
    scrollToBottomAfterNextCommit,
    scrollToBottomAfterNextCommitIfFollowing,
    scrollToBottomIfFollowing,
    scrollToMessageRow,
    scrollToRowIndex,
    scrollToTop,
  } = useChatVirtualizerCommands({
    beginProgrammaticCommand,
    claimProgrammaticCommandAttempt,
    getNextBottomCommandRevision: () => bottomCommandRevisionRef.current.revision + 1,
    hasFollowBottomIntent: () => (
      scrollModeRef.current === "follow-bottom"
      || activeProgrammaticCommandRef.current?.settleTarget === "follow-bottom"
    ),
    issueScrollCommand,
    isMessageVisibleInViewport,
    markProgrammaticCommandReady,
    messageIdToRowIndex,
    rowVirtualizer,
    rowsLengthRef,
    rowsRef,
    scheduleProgrammaticModeSettle,
    scheduleScrollCommand,
  });

  return {
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
  };
}
