/**
 * 说明：`chatVirtualizerViewport` 主聊天 viewport 生命周期模块。
 *
 * 职责：
 * - 承担聊天滚动容器的 resize/foreground 监听与清理；
 * - 通过 runtime ref 读取最新命令门面，避免 observer effect 因闭包抖动反复重挂。
 *
 * 边界：
 * - 本文件不持有 React state；
 * - 不负责 session、read marker 或导航业务语义。
 */
import type { MutableRefObject, RefObject } from "react";

import type { ChatScrollCommand } from "./chatScrollCommands";
import { runChatHostMeasurementRefresh } from "./chatVirtualizerStartup";
import type { ChatScrollMode } from "./useChatAreaScrollOwner";

interface ChatViewportFrameRefs {
  readonly foregroundRefreshFrameRef: MutableRefObject<number | null>;
  readonly mountedRowsMeasureFrameRef: MutableRefObject<number | null>;
}

/**
 * 导出类型：viewport 生命周期在运行期读取的最新命令门面。
 *
 * @remarks
 * observer 与前后台监听只通过这一个 runtime ref 读取最新滚动语义，避免 effect 因闭包变化重挂。
 */
export interface ChatViewportRuntime {
  readonly cancelPendingModeSettle: () => void;
  readonly issueScrollCommand: (
    command: ChatScrollCommand,
    options?: { cancelStartupRestore?: boolean; defer?: "microtask" | "raf"; minimumDataRevision?: number | null },
  ) => boolean;
  readonly measureMountedRowsOnly: () => void;
  readonly pendingStartupRestoreTopicIdRef: MutableRefObject<string | null>;
  readonly resetAndMeasureRows: () => void;
  readonly resetAndMeasureRowsWithAnchor: () => boolean;
  readonly rowsLengthRef: MutableRefObject<number>;
  readonly scheduleForegroundRefresh: () => void;
  readonly scrollModeRef: MutableRefObject<ChatScrollMode>;
  readonly syncViewportMetrics: () => boolean;
  readonly topicId: string | null;
  readonly tryRunStartupRestore: () => boolean;
}

interface MountChatViewportLifecycleParams {
  readonly frameRefs: ChatViewportFrameRefs;
  readonly runtimeRef: MutableRefObject<ChatViewportRuntime | null>;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
}

/**
 * 清理 viewport 生命周期持有的所有 rAF 句柄。
 *
 * @param frameRefs - 当前 hook 维护的前台重测、挂载补测和 snapshot 帧引用。
 */
export function resetChatViewportFrames(frameRefs: ChatViewportFrameRefs) {
  if (frameRefs.foregroundRefreshFrameRef.current != null) {
    cancelAnimationFrame(frameRefs.foregroundRefreshFrameRef.current);
    frameRefs.foregroundRefreshFrameRef.current = null;
  }
  if (frameRefs.mountedRowsMeasureFrameRef.current != null) {
    cancelAnimationFrame(frameRefs.mountedRowsMeasureFrameRef.current);
    frameRefs.mountedRowsMeasureFrameRef.current = null;
  }
}

/**
 * 安装主聊天 viewport 生命周期监听。
 *
 * @param params - 当前滚动容器、runtime ref 与帧引用。
 * @returns 对应的清理函数。
 */
export function mountChatViewportLifecycle({
  frameRefs,
  runtimeRef,
  scrollRef,
}: MountChatViewportLifecycleParams) {
  const element = scrollRef.current;
  if (!element) {
    return () => {
      resetChatViewportFrames(frameRefs);
      runtimeRef.current?.cancelPendingModeSettle();
    };
  }

  /**
   * 内部函数变量：`handleViewportResize`。
   *
   * @remarks
   * 容器尺寸变化时先同步 viewport metrics，再决定是否重测、执行 startup restore 或维持 follow-bottom。
   */
  const handleViewportResize = () => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runChatHostMeasurementRefresh({
      ...runtime,
      scrollRef,
    });
  };

  /**
   * 内部函数变量：`handlePageForeground`。
   *
   * @remarks
   * 页面重新回到前台时，沿统一门面补一轮宿主前景重测。
   */
  const handlePageForeground = () => {
    runtimeRef.current?.scheduleForegroundRefresh();
  };

  /**
   * 内部函数变量：`handleVisibilityChange`。
   *
   * @remarks
   * 文档从隐藏切回可见时触发同一条 foreground refresh 管线。
   */
  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") return;
    runtimeRef.current?.scheduleForegroundRefresh();
  };

  handleViewportResize();
  handlePageForeground();
  window.addEventListener("pageshow", handlePageForeground);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  if (typeof ResizeObserver === "undefined") {
    window.addEventListener("resize", handleViewportResize);
    return () => {
      window.removeEventListener("resize", handleViewportResize);
      window.removeEventListener("pageshow", handlePageForeground);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      resetChatViewportFrames(frameRefs);
      runtimeRef.current?.cancelPendingModeSettle();
    };
  }

  const observer = new ResizeObserver(() => {
    handleViewportResize();
  });
  observer.observe(element);
  return () => {
    observer.disconnect();
    window.removeEventListener("pageshow", handlePageForeground);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    resetChatViewportFrames(frameRefs);
    runtimeRef.current?.cancelPendingModeSettle();
  };
}
