/**
 * 说明：`chatVirtualizerStartup` 主聊天宿主恢复模块。
 *
 * 职责：
 * - 承担主聊天 startup restore 与宿主前台重测的共享运行时步骤；
 * - 避免 `useChatAreaVirtualizer.ts` 再同时承担命令门面和宿主生命周期编排。
 *
 * 边界：
 * - 本文件不直接持有 React state；
 * - 只消费外层传入的 refs、命令门面和测量能力。
 */
import type { MutableRefObject, RefObject } from "react";

import type { ChatScrollCommand } from "./chatScrollCommands";
import type { ChatScrollSession } from "./chatScrollSession";
import type { ChatScrollMode } from "./useChatAreaScrollOwner";

interface TryRunChatStartupRestoreParams {
  readonly ensureCurrentSession: () => ChatScrollSession;
  readonly issueScrollCommand: (
    command: ChatScrollCommand,
    options?: { cancelStartupRestore?: boolean; defer?: "microtask" | "raf"; minimumDataRevision?: number | null },
  ) => boolean;
  readonly pendingStartupRestoreTopicIdRef: MutableRefObject<string | null>;
  readonly resetAndMeasureRows: () => void;
  readonly rowsLength: number;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly startupRestoreTokenRef: MutableRefObject<number>;
  readonly topicId: string | null;
}

/**
 * 在 viewport 可用后尝试执行当前 topic 的 startup restore。
 *
 * @param params - 当前 restore 所需的 session、命令和 DOM 能力。
 * @returns 当前是否真的启动了一次 restore 流程。
 */
export function tryRunChatStartupRestore({
  ensureCurrentSession,
  issueScrollCommand,
  pendingStartupRestoreTopicIdRef,
  resetAndMeasureRows,
  rowsLength,
  scrollRef,
  startupRestoreTokenRef,
  topicId,
}: TryRunChatStartupRestoreParams) {
  const currentTopicId = topicId ?? "";
  if (!currentTopicId) return false;
  if (pendingStartupRestoreTopicIdRef.current !== currentTopicId) return false;
  if (rowsLength < 1) return false;

  const element = scrollRef.current;
  const viewportWidth = element?.clientWidth ?? 0;
  const viewportHeight = element?.clientHeight ?? 0;
  if (!element || viewportWidth <= 0 || viewportHeight <= 0) return false;

  const restoreToken = startupRestoreTokenRef.current;
  const restoreSession = ensureCurrentSession();
  pendingStartupRestoreTopicIdRef.current = null;
  resetAndMeasureRows();

  requestAnimationFrame(() => {
    if (startupRestoreTokenRef.current !== restoreToken) return;
    if ((topicId ?? "") !== currentTopicId) return;
    resetAndMeasureRows();
    issueScrollCommand({
      snapshot: restoreSession.viewportSnapshot,
      type: "row-snapshot",
    }, { cancelStartupRestore: false });
  });

  const fontsReady = document.fonts?.ready;
  if (fontsReady && typeof fontsReady.then === "function") {
    void fontsReady.then(() => {
      requestAnimationFrame(() => {
        if (startupRestoreTokenRef.current !== restoreToken) return;
        if ((topicId ?? "") !== currentTopicId) return;
        resetAndMeasureRows();
      });
    });
  }

  return true;
}

interface ScheduleChatForegroundRefreshParams {
  readonly foregroundRefreshFrameRef: MutableRefObject<number | null>;
  readonly issueScrollCommand: (
    command: ChatScrollCommand,
    options?: { cancelStartupRestore?: boolean; defer?: "microtask" | "raf"; minimumDataRevision?: number | null },
  ) => boolean;
  readonly measureMountedRowsOnly: () => void;
  readonly pendingStartupRestoreTopicIdRef: MutableRefObject<string | null>;
  readonly resetAndMeasureRows: () => void;
  readonly resetAndMeasureRowsWithAnchor: () => boolean;
  readonly rowsLengthRef: MutableRefObject<number>;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly scrollModeRef: MutableRefObject<ChatScrollMode>;
  readonly syncViewportMetrics: () => boolean;
  readonly topicId: string | null;
  readonly tryRunStartupRestore: () => boolean;
}

/**
 * 在扩展页重新回到前台时补当前宿主的虚拟行测量。
 *
 * @param params - 当前宿主前台恢复所需的 refs 和命令能力。
 */
export function scheduleChatForegroundRefresh({
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
}: ScheduleChatForegroundRefreshParams) {
  const element = scrollRef.current;
  if (!element || document.visibilityState === "hidden") return;

  if (foregroundRefreshFrameRef.current != null) {
    cancelAnimationFrame(foregroundRefreshFrameRef.current);
  }
  foregroundRefreshFrameRef.current = requestAnimationFrame(() => {
    foregroundRefreshFrameRef.current = null;
    runChatHostMeasurementRefresh({
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
  });
}

type RunChatHostMeasurementRefreshParams = Omit<ScheduleChatForegroundRefreshParams, "foregroundRefreshFrameRef">;

/**
 * 执行一次主聊天宿主测量刷新。
 *
 * @param params - 当前宿主测量、滚动 owner 和启动恢复能力。
 * @returns 本次是否消费了可用的滚动容器。
 *
 * @remarks
 * 这条路径统一承接 foreground 与 ResizeObserver：
 * - viewport 未变时只补测挂载行，避免清空 TanStack Virtual 尺寸缓存；
 * - 用户阅读态遇到真实尺寸变化时，先用当前 row anchor 保护阅读线，再做破坏性重测；
 * - 只有仍处于 `follow-bottom` 的 owner 可以在重测后继续补底部命令。
 */
export function runChatHostMeasurementRefresh({
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
}: RunChatHostMeasurementRefreshParams) {
  const element = scrollRef.current;
  if (!element || document.visibilityState === "hidden") return false;

  const sizeChanged = syncViewportMetrics();
  if (pendingStartupRestoreTopicIdRef.current === (topicId ?? "")) {
    void tryRunStartupRestore();
    return true;
  }

  if (!sizeChanged) {
    measureMountedRowsOnly();
    return true;
  }

  if (scrollModeRef.current === "follow-bottom") {
    resetAndMeasureRows();
    if (rowsLengthRef.current > 0) {
      issueScrollCommand({ type: "bottom" }, { defer: "raf" });
    }
    return true;
  }

  if (scrollModeRef.current === "detached-reading") {
    if (!resetAndMeasureRowsWithAnchor()) {
      resetAndMeasureRows();
    }
    return true;
  }

  resetAndMeasureRows();
  return true;
}
