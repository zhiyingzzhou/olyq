/**
 * 说明：`chatVirtualizerStartup.spec` 测试模块。
 *
 * 职责：
 * - 覆盖主聊天前台恢复与 startup restore 的宿主级时序约束；
 * - 防止前台恢复在显式 programmatic 导航期间又补发一条 bottom 命令抢回滚动 owner。
 *
 * 边界：
 * - 这里只验证 `chatVirtualizerStartup.ts` 的纯运行时门面；
 * - 不复测消息业务态和 TanStack Virtual 本身。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runChatHostMeasurementRefresh, scheduleChatForegroundRefresh } from "./chatVirtualizerStartup";

/**
 * 安装一个可手动 flush 的 rAF 队列。
 *
 * @remarks
 * 前台恢复是在下一帧补测后才决定是否继续贴底，这里需要精确控制那一帧何时落地。
 */
function installAnimationFrameQueue() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();

  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = nextId;
    nextId += 1;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    callbacks.delete(id);
  });

  return {
    /**
     * 冲掉当前队列内的全部 rAF 回调。
     *
     * @param timestamp - 传给回调的模拟帧时间戳。
     */
    flushAll(timestamp = 16) {
      while (callbacks.size > 0) {
        const [id, callback] = callbacks.entries().next().value as [number, FrameRequestCallback];
        callbacks.delete(id);
        callback(timestamp);
      }
    },
  };
}

describe("scheduleChatForegroundRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("前台恢复且 viewport 未变时只补测挂载行，不清空 virtualizer 缓存", () => {
    const raf = installAnimationFrameQueue();
    const scrollRoot = document.createElement("div");
    const issueScrollCommand = vi.fn();
    const measureMountedRowsOnly = vi.fn();
    const resetAndMeasureRows = vi.fn();
    const resetAndMeasureRowsWithAnchor = vi.fn(() => true);
    const tryRunStartupRestore = vi.fn();
    const syncViewportMetrics = vi.fn(() => false);

    scheduleChatForegroundRefresh({
      foregroundRefreshFrameRef: { current: null },
      issueScrollCommand,
      measureMountedRowsOnly,
      pendingStartupRestoreTopicIdRef: { current: null },
      resetAndMeasureRows,
      resetAndMeasureRowsWithAnchor,
      rowsLengthRef: { current: 24 },
      scrollRef: { current: scrollRoot },
      scrollModeRef: { current: "detached-reading" },
      syncViewportMetrics,
      topicId: "topic-a",
      tryRunStartupRestore,
    });

    raf.flushAll();

    expect(syncViewportMetrics).toHaveBeenCalledTimes(1);
    expect(measureMountedRowsOnly).toHaveBeenCalledTimes(1);
    expect(resetAndMeasureRows).not.toHaveBeenCalled();
    expect(resetAndMeasureRowsWithAnchor).not.toHaveBeenCalled();
    expect(tryRunStartupRestore).not.toHaveBeenCalled();
    expect(issueScrollCommand).not.toHaveBeenCalled();
  });

  it("连续 pageshow / visibilitychange 预约只会执行一次前台刷新", () => {
    const raf = installAnimationFrameQueue();
    const scrollRoot = document.createElement("div");
    const measureMountedRowsOnly = vi.fn();
    const syncViewportMetrics = vi.fn(() => false);
    const frameRef = { current: null as number | null };
    const sharedParams = {
      foregroundRefreshFrameRef: frameRef,
      issueScrollCommand: vi.fn(),
      measureMountedRowsOnly,
      pendingStartupRestoreTopicIdRef: { current: null },
      resetAndMeasureRows: vi.fn(),
      resetAndMeasureRowsWithAnchor: vi.fn(() => true),
      rowsLengthRef: { current: 24 },
      scrollRef: { current: scrollRoot },
      scrollModeRef: { current: "detached-reading" as const },
      syncViewportMetrics,
      topicId: "topic-a",
      tryRunStartupRestore: vi.fn(),
    };

    scheduleChatForegroundRefresh(sharedParams);
    scheduleChatForegroundRefresh(sharedParams);
    raf.flushAll();

    expect(syncViewportMetrics).toHaveBeenCalledTimes(1);
    expect(measureMountedRowsOnly).toHaveBeenCalledTimes(1);
  });

  it("detached-reading 下 viewport 变化会走锚点保护重测，不补 bottom", () => {
    const scrollRoot = document.createElement("div");
    const issueScrollCommand = vi.fn();
    const resetAndMeasureRows = vi.fn();
    const resetAndMeasureRowsWithAnchor = vi.fn(() => true);

    runChatHostMeasurementRefresh({
      issueScrollCommand,
      measureMountedRowsOnly: vi.fn(),
      pendingStartupRestoreTopicIdRef: { current: null },
      resetAndMeasureRows,
      resetAndMeasureRowsWithAnchor,
      rowsLengthRef: { current: 24 },
      scrollRef: { current: scrollRoot },
      scrollModeRef: { current: "detached-reading" },
      syncViewportMetrics: vi.fn(() => true),
      topicId: "topic-a",
      tryRunStartupRestore: vi.fn(),
    });

    expect(resetAndMeasureRowsWithAnchor).toHaveBeenCalledTimes(1);
    expect(resetAndMeasureRows).not.toHaveBeenCalled();
    expect(issueScrollCommand).not.toHaveBeenCalled();
  });

  it("follow-bottom 下 viewport 变化会重测并继续补底部命令", () => {
    const scrollRoot = document.createElement("div");
    const issueScrollCommand = vi.fn();
    const resetAndMeasureRows = vi.fn();

    runChatHostMeasurementRefresh({
      issueScrollCommand,
      measureMountedRowsOnly: vi.fn(),
      pendingStartupRestoreTopicIdRef: { current: null },
      resetAndMeasureRows,
      resetAndMeasureRowsWithAnchor: vi.fn(() => true),
      rowsLengthRef: { current: 24 },
      scrollRef: { current: scrollRoot },
      scrollModeRef: { current: "follow-bottom" },
      syncViewportMetrics: vi.fn(() => true),
      topicId: "topic-a",
      tryRunStartupRestore: vi.fn(),
    });

    expect(resetAndMeasureRows).toHaveBeenCalledTimes(1);
    expect(issueScrollCommand).toHaveBeenCalledWith({ type: "bottom" }, { defer: "raf" });
  });

  it("宿主隐藏态不会执行 UI 测量刷新", () => {
    const scrollRoot = document.createElement("div");
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    const issueScrollCommand = vi.fn();
    const measureMountedRowsOnly = vi.fn();
    const resetAndMeasureRows = vi.fn();
    const resetAndMeasureRowsWithAnchor = vi.fn(() => true);
    const syncViewportMetrics = vi.fn(() => true);

    expect(runChatHostMeasurementRefresh({
      issueScrollCommand,
      measureMountedRowsOnly,
      pendingStartupRestoreTopicIdRef: { current: null },
      resetAndMeasureRows,
      resetAndMeasureRowsWithAnchor,
      rowsLengthRef: { current: 24 },
      scrollRef: { current: scrollRoot },
      scrollModeRef: { current: "follow-bottom" },
      syncViewportMetrics,
      topicId: "topic-a",
      tryRunStartupRestore: vi.fn(),
    })).toBe(false);

    expect(syncViewportMetrics).not.toHaveBeenCalled();
    expect(measureMountedRowsOnly).not.toHaveBeenCalled();
    expect(resetAndMeasureRows).not.toHaveBeenCalled();
    expect(resetAndMeasureRowsWithAnchor).not.toHaveBeenCalled();
    expect(issueScrollCommand).not.toHaveBeenCalled();
  });

  it("pending startup restore 优先走 restore，不会并行补 bottom", () => {
    const raf = installAnimationFrameQueue();
    const scrollRoot = document.createElement("div");
    const issueScrollCommand = vi.fn();
    const resetAndMeasureRows = vi.fn();
    const tryRunStartupRestore = vi.fn();
    const syncViewportMetrics = vi.fn();

    scheduleChatForegroundRefresh({
      foregroundRefreshFrameRef: { current: null },
      issueScrollCommand,
      measureMountedRowsOnly: vi.fn(),
      pendingStartupRestoreTopicIdRef: { current: "topic-a" },
      resetAndMeasureRows,
      resetAndMeasureRowsWithAnchor: vi.fn(() => true),
      rowsLengthRef: { current: 24 },
      scrollRef: { current: scrollRoot },
      scrollModeRef: { current: "follow-bottom" },
      syncViewportMetrics,
      topicId: "topic-a",
      tryRunStartupRestore,
    });

    raf.flushAll();

    expect(syncViewportMetrics).toHaveBeenCalledTimes(1);
    expect(resetAndMeasureRows).not.toHaveBeenCalled();
    expect(tryRunStartupRestore).toHaveBeenCalledTimes(1);
    expect(issueScrollCommand).not.toHaveBeenCalled();
  });
});
