/**
 * 说明：`chatVirtualizerViewport.spec` 测试模块。
 *
 * 职责：
 * - 覆盖主聊天 viewport 生命周期与 scroll owner 的单真源契约；
 * - 防止 resize 链路在显式导航 / programmatic session 期间重新补 bottom 命令。
 *
 * 边界：
 * - 这里只验证 `chatVirtualizerViewport.ts` 的宿主监听编排；
 * - 不复测 TanStack Virtual 的布局细节。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mountChatViewportLifecycle } from "./chatVirtualizerViewport";

/**
 * 安装可控的 `ResizeObserver` 测试壳。
 *
 * @param onObserve - 目标开始观察后的回调。
 * @returns observer 的 observe / disconnect mock。
 */
function installResizeObserverHarness(onObserve?: (target: Element, callback: ResizeObserverCallback) => void) {
  const observe = vi.fn((target: Element) => {
    onObserve?.(target, activeCallback);
  });
  const disconnect = vi.fn();
  /**
   * 当前测试壳注册中的 observer 回调。
   *
   * @remarks
   * `observe()` 需要在构造后立即拿到这份回调，才能模拟原生 ResizeObserver 的首次投递。
   */
  let activeCallback: ResizeObserverCallback = () => undefined;

  class ResizeObserverHarness {
    constructor(private readonly callback: ResizeObserverCallback) {
      activeCallback = callback;
    }

    /**
     * 记录被观察的目标。
     *
     * @param target - 当前被观察的元素。
     */
    observe(target: Element) {
      observe(target);
    }

    /**
     * 模拟运行时卸载 observer。
     */
    disconnect() {
      disconnect();
    }
  }

  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: ResizeObserverHarness,
  });
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: ResizeObserverHarness,
  });

  return { disconnect, observe };
}

describe("mountChatViewportLifecycle", () => {
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

  it("resize 只在 owner 仍处于 follow-bottom 时才补发 bottom 命令", () => {
    const scrollRoot = document.createElement("div");
    const { disconnect, observe } = installResizeObserverHarness((target, callback) => {
      callback([{ target } as ResizeObserverEntry], {} as ResizeObserver);
    });

    const issueScrollCommand = vi.fn();
    const scheduleForegroundRefresh = vi.fn();
    const resetAndMeasureRows = vi.fn();
    const cleanup = mountChatViewportLifecycle({
      frameRefs: {
        foregroundRefreshFrameRef: { current: null },
        mountedRowsMeasureFrameRef: { current: null },
      },
      runtimeRef: {
        current: {
          cancelPendingModeSettle: vi.fn(),
          issueScrollCommand,
          measureMountedRowsOnly: vi.fn(),
          pendingStartupRestoreTopicIdRef: { current: null },
          resetAndMeasureRows,
          resetAndMeasureRowsWithAnchor: vi.fn(() => true),
          rowsLengthRef: { current: 12 },
          scheduleForegroundRefresh,
          scrollModeRef: { current: "programmatic" },
          syncViewportMetrics: vi.fn(() => true),
          topicId: "topic-a",
          tryRunStartupRestore: vi.fn(),
        },
      },
      scrollRef: { current: scrollRoot },
    });

    expect(observe).toHaveBeenCalledWith(scrollRoot);
    expect(scheduleForegroundRefresh).toHaveBeenCalledTimes(1);
    expect(resetAndMeasureRows).toHaveBeenCalledTimes(2);
    expect(issueScrollCommand).not.toHaveBeenCalled();

    cleanup();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("visibilitychange 只在 hidden 切回 visible 时进入前台刷新管线", () => {
    const scrollRoot = document.createElement("div");
    installResizeObserverHarness();
    const scheduleForegroundRefresh = vi.fn();

    const cleanup = mountChatViewportLifecycle({
      frameRefs: {
        foregroundRefreshFrameRef: { current: null },
        mountedRowsMeasureFrameRef: { current: null },
      },
      runtimeRef: {
        current: {
          cancelPendingModeSettle: vi.fn(),
          issueScrollCommand: vi.fn(),
          measureMountedRowsOnly: vi.fn(),
          pendingStartupRestoreTopicIdRef: { current: null },
          resetAndMeasureRows: vi.fn(),
          resetAndMeasureRowsWithAnchor: vi.fn(() => true),
          rowsLengthRef: { current: 12 },
          scheduleForegroundRefresh,
          scrollModeRef: { current: "detached-reading" },
          syncViewportMetrics: vi.fn(() => false),
          topicId: "topic-a",
          tryRunStartupRestore: vi.fn(),
        },
      },
      scrollRef: { current: scrollRoot },
    });

    scheduleForegroundRefresh.mockClear();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(scheduleForegroundRefresh).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(scheduleForegroundRefresh).toHaveBeenCalledTimes(1);

    cleanup();
  });
});
