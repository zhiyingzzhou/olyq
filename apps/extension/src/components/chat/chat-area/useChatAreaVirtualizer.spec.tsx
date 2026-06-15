/**
 * 说明：`useChatAreaVirtualizer.spec` 组件模块。
 *
 * 职责：
 * - 覆盖聊天虚拟化门面的测量、scroll command pipeline、per-topic session 与滚动修正契约；
 * - 确保聊天主列表只保留一套虚拟滚动真源。
 *
 * 边界：
 * - 本文件不验证消息业务态；
 * - 只验证门面如何封装 TanStack Virtual v3 的动态高度、session 恢复与滚动命令。
 */
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRef, type MutableRefObject } from "react";

import { buildRows, tailSignature, visibleAssistantOutputSignature, type ChatRow } from "@/lib/chat/chat-utils";
import type { Message } from "@/types/chat";
import { estimateChatRowSize } from "./chatVirtualizerSizing";
import { useChatAnchorTailSlack } from "./chatVirtualizerTailSlack";
import { useChatVirtualizerBottomReadSync } from "./chatVirtualizerBottomReadSync";
import { useChatAreaScrollOwner } from "./useChatAreaScrollOwner";
import { useChatAreaVirtualizer } from "./useChatAreaVirtualizer";

const {
  useVirtualizerMock,
  virtualizerInstanceRef,
} = vi.hoisted(() => ({
  useVirtualizerMock: vi.fn(),
  virtualizerInstanceRef: { current: null as null | Record<string, unknown> },
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: useVirtualizerMock,
}));

/**
 * 测试辅助函数：`createMessage`。
 *
 * @remarks
 * 统一生成测试消息，减少重复样板。
 */
function createMessage(id: string, role: Message["role"], content: string, createdAt = 1, askId?: string): Message {
  return {
    id,
    role,
    content,
    createdAt,
    ...(askId ? { askId } : {}),
  };
}

/**
 * 测试辅助函数：`createRows`。
 *
 * @remarks
 * 统一通过 `buildRows` 构造聊天虚拟行，保证测试数据与运行时建模一致。
 */
function createRows(messages: Message[], isLoading = false) {
  return buildRows(messages, 0, isLoading);
}

/**
 * 测试辅助函数：`createMessageIdToRowIndex`。
 *
 * @remarks
 * 将运行时使用的消息到虚拟行索引映射复用到测试里。
 */
function createMessageIdToRowIndex(rows: ChatRow[]) {
  const map = new Map<string, number>();
  rows.forEach((row, index) => {
    if (row.kind === "message" || row.kind === "divider") {
      map.set(row.message.id, index);
      return;
    }
    if (row.kind === "group") {
      row.assistants.forEach((assistant) => map.set(assistant.id, index));
    }
  });
  return map;
}

/**
 * 测试辅助函数：`installResizeObserverHarness`。
 *
 * @remarks
 * 提供一个可手动触发的 `ResizeObserver` mock，用来模拟 sidepanel 宽度变化与首屏恢复场景。
 */
function installResizeObserverHarness() {
  type ResizeObserverCallback = ConstructorParameters<typeof ResizeObserver>[0];

  const originalWindowResizeObserver = window.ResizeObserver;
  const originalGlobalResizeObserver = globalThis.ResizeObserver;
  const callbacks = new Set<ResizeObserverCallback>();

  class ResizeObserverHarness {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      callbacks.add(callback);
    }

    /**
     * 测试桩方法：`observe`。
     *
     * @remarks
     * 当前测试只需要注册回调，不需要模拟原生 `ResizeObserver` 的目标管理细节。
     */
    observe() {}

    /**
     * 测试桩方法：`disconnect`。
     *
     * @remarks
     * 卸载时必须移除回调，避免旧实例在后续手动 trigger 时继续响应。
     */
    disconnect() {
      callbacks.delete(this.callback);
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

  return {
    /**
     * 测试辅助方法：`trigger`。
     *
     * @remarks
     * 手动投递一次伪造的 `ResizeObserverEntry`，让 hook 按运行时链路处理宽度/高度变化。
     */
    trigger(target: Element) {
      const rect = target.getBoundingClientRect();
      const entry = {
        target,
        contentRect: rect,
      } as ResizeObserverEntry;

      act(() => {
        callbacks.forEach((callback) => callback([entry], {} as ResizeObserver));
      });
    },
    /**
     * 测试辅助方法：`restore`。
     *
     * @remarks
     * 每个用例结束后恢复全局 `ResizeObserver`，避免这个测试壳 泄漏到其它测试文件。
     */
    restore() {
      Object.defineProperty(window, "ResizeObserver", {
        configurable: true,
        writable: true,
        value: originalWindowResizeObserver,
      });
      Object.defineProperty(globalThis, "ResizeObserver", {
        configurable: true,
        writable: true,
        value: originalGlobalResizeObserver,
      });
    },
  };
}

/**
 * 测试辅助函数：`installAnimationFrameQueue`。
 *
 * @remarks
 * 用可手动 flush 的 rAF 队列替代“立即执行”桩，用来验证过期 bottom command 不会在后续帧里继续落地。
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
     * 只推进当前队列里的下一帧。
     *
     * @remarks
     * bottom command 会在同一条命令会话中递归安排多轮 rAF；逐帧推进能模拟
     * “命令已开始执行，但流式数据又提交了一次”的真实竞争窗口。
     */
    flushNext(timestamp = 16) {
      const next = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
      if (!next) return false;
      const [id, callback] = next;
      callbacks.delete(id);
      callback(timestamp);
      return true;
    },
    /**
     * 逐帧冲掉当前队列里尚未执行的 rAF。
     *
     * @remarks
     * 测试里需要精确控制 command pipeline 的后续帧是否还会继续落地。
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

/**
 * 测试辅助组件：`VirtualizerHarness`。
 *
 * @remarks
 * 在真实 DOM 上挂出 `scrollRef` 与稳定的 `[data-index]` 行节点，让 hook 的 viewport/snapshot 副作用能按运行时时序执行。
 */
function VirtualizerHarness({
  controllerRef,
  messages,
  rows,
  topicId,
}: {
  controllerRef: MutableRefObject<null | {
    scrollRef: MutableRefObject<HTMLDivElement | null>;
    state: ReturnType<typeof useChatAreaVirtualizer>;
  }>;
  messages: Message[];
  rows: ChatRow[];
  topicId: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const state = useChatAreaVirtualizer({
    lastMessageId: messages.at(-1)?.id ?? null,
    lastVisibleOutputSignature: visibleAssistantOutputSignature(messages.at(-1)),
    messageCount: messages.length,
    messageIdToRowIndex: createMessageIdToRowIndex(rows),
    rows,
    scrollRef,
    tailSig: tailSignature(messages),
    topicId,
  });

  controllerRef.current = { scrollRef, state };

  return (
    <div ref={scrollRef} data-testid="chat-scroll-root">
      {rows.map((row, index) => {
        const msgId = row.kind === "group"
          ? row.user.id
          : row.kind === "message" || row.kind === "divider"
            ? row.message.id
            : undefined;
        return <div key={`${topicId ?? "no-topic"}-${index}`} data-index={index} data-msg-id={msgId} />;
      })}
    </div>
  );
}

describe("useChatAreaVirtualizer", () => {
  it("滚动 owner 在 tail slack 区域内不把 near-tail anchor 误判为严格到底", () => {
    const element = document.createElement("div") as HTMLDivElement;
    Object.defineProperties(element, {
      clientHeight: { configurable: true, value: 634 },
      scrollHeight: { configurable: true, value: 2152 },
      scrollTop: { configurable: true, value: 1346 },
    });
    const scrollRef = { current: element };

    const { result } = renderHook(() => useChatAreaScrollOwner({
      initialFollowMode: "detached-reading",
      scrollRef,
      topicId: "topic-tail-slack",
    }));

    expect(result.current.readScrollPositionState(element).strictBottom).toBe(false);
  });

  it("ambient DOM 几何同步即使读到 strict-bottom 也不会接回 follow-bottom owner", () => {
    const element = document.createElement("div") as HTMLDivElement;
    Object.defineProperties(element, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1400 },
      scrollTop: { configurable: true, value: 1000 },
    });
    const onFollowModeChange = vi.fn();

    const { result } = renderHook(() => useChatAreaScrollOwner({
      initialFollowMode: "detached-reading",
      onFollowModeChange,
      scrollRef: { current: element },
      topicId: "topic-ambient-sync",
    }));

    act(() => {
      expect(result.current.syncScrollPositionFromDom()?.strictBottom).toBe(true);
    });

    expect(result.current.scrollModeRef.current).toBe("startup-restore");
    expect(onFollowModeChange).not.toHaveBeenCalled();

    act(() => {
      result.current.syncScrollPositionFromDom({ allowFollowBottomCommit: true });
    });

    expect(result.current.scrollModeRef.current).toBe("follow-bottom");
    expect(onFollowModeChange).toHaveBeenCalledWith("follow-bottom");
  });

  it("anchor tail slack 会保留启用意图，viewport 高度后到时仍补出尾部可达空间", async () => {
    const { result, rerender } = renderHook(({ height }: { height: number | null }) => useChatAnchorTailSlack(height), {
      initialProps: { height: null as number | null },
    });

    act(() => {
      result.current.enableAnchorTailSlack();
    });
    expect(result.current.anchorTailSlackHeight).toBe(0);

    rerender({ height: 500 });

    await waitFor(() => {
      expect(result.current.anchorTailSlackHeight).toBe(308);
    });

    act(() => {
      result.current.disableAnchorTailSlack();
    });
    expect(result.current.anchorTailSlackHeight).toBe(0);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

    useVirtualizerMock.mockImplementation(({ count, onChange }: { count: number; onChange?: (instance: unknown) => void }) => {
      const instance = {
        getTotalSize: () => count * 120,
        getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: `row-${index}`, start: index * 120 })),
        measure: vi.fn(),
        measureElement: vi.fn(),
        onChange,
        scrollOffset: 0,
        scrollBy: vi.fn(),
        scrollToIndex: vi.fn(),
        scrollToOffset: vi.fn(),
        shouldAdjustScrollPositionOnItemSizeChange: undefined,
      };
      virtualizerInstanceRef.current = instance;
      return instance;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("按行类型返回保守估高", () => {
    const dividerRow = { kind: "divider", message: createMessage("divider-1", "system", "[context-divider]"), index: 0 } as ChatRow;
    const loadingRow = { kind: "loading" } as ChatRow;
    const userRow = { kind: "message", message: createMessage("user-1", "user", "hello", 1, "ask-1"), index: 1 } as ChatRow;
    const assistantRow = { kind: "message", message: createMessage("assistant-1", "assistant", "reply", 2, "ask-1"), index: 2 } as ChatRow;
    const groupRow = {
      kind: "group",
      askId: "ask-2",
      user: createMessage("user-2", "user", "compare", 3, "ask-2"),
      assistants: [
        createMessage("assistant-2a", "assistant", "a", 4, "ask-2"),
        createMessage("assistant-2b", "assistant", "b", 5, "ask-2"),
      ],
      userIndex: 3,
      startIndex: 4,
      endIndex: 5,
      isLoading: false,
    } as ChatRow;

    expect(estimateChatRowSize(dividerRow)).toBe(72);
    expect(estimateChatRowSize(loadingRow)).toBe(92);
    expect(estimateChatRowSize(userRow)).toBe(140);
    expect(estimateChatRowSize(assistantRow)).toBe(260);
    expect(estimateChatRowSize(groupRow)).toBe(420);
  });

  it("把 trailing row 的滚动修正规则收口到 follow-bottom session 里", async () => {
    const messages = [createMessage("assistant-1", "assistant", "hello")];
    const rows = createRows(messages, true);
    const scrollRoot = document.createElement("div");
    Object.defineProperty(scrollRoot, "scrollHeight", { configurable: true, get: () => 1400 });
    Object.defineProperty(scrollRoot, "clientHeight", { configurable: true, get: () => 400 });
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => 1000,
      set: () => undefined,
    });

    const { result } = renderHook(() => useChatAreaVirtualizer({
      lastMessageId: messages.at(-1)?.id ?? null,
      lastVisibleOutputSignature: visibleAssistantOutputSignature(messages.at(-1)),
      messageCount: messages.length,
      messageIdToRowIndex: createMessageIdToRowIndex(rows),
      rows,
      scrollRef: { current: scrollRoot },
      tailSig: tailSignature(messages),
      topicId: null,
    }));

    await waitFor(() => {
      expect(virtualizerInstanceRef.current?.shouldAdjustScrollPositionOnItemSizeChange).toBeTypeOf("function");
    });

    const shouldAdjust = virtualizerInstanceRef.current?.shouldAdjustScrollPositionOnItemSizeChange as
      | ((item: { index: number; start: number; end?: number; size?: number }, delta: number, instance: { scrollOffset: number | null }) => boolean)
      | undefined;

    expect(shouldAdjust?.({ index: 1, start: 760, end: 1040, size: 280 }, 80, { scrollOffset: 200 })).toBe(true);
    expect(shouldAdjust?.({ index: 0, start: 520, end: 760, size: 240 }, 80, { scrollOffset: 200 })).toBe(true);

    act(() => {
      result.current.handleWheelIntent(-12);
    });

    expect(result.current.hasFollowBottomIntent).toBe(false);
    expect(shouldAdjust?.({ index: 1, start: 760, end: 1040, size: 280 }, 80, { scrollOffset: 200 })).toBe(false);
    expect(shouldAdjust?.({ index: 0, start: 520, end: 760, size: 240 }, 80, { scrollOffset: 200 })).toBe(false);

    act(() => {
      result.current.scrollToBottom();
    });

    expect(shouldAdjust?.({ index: 1, start: 760, end: 1040, size: 280 }, 80, { scrollOffset: 200 })).toBe(true);
  });

  it("稳定内容变更即使在 strict-bottom 也会强制进入阅读态", async () => {
    const messages = [createMessage("assistant-1", "assistant", "hello")];
    const rows = createRows(messages, true);
    const scrollRoot = document.createElement("div");
    Object.defineProperty(scrollRoot, "scrollHeight", { configurable: true, get: () => 1400 });
    Object.defineProperty(scrollRoot, "clientHeight", { configurable: true, get: () => 400 });
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => 1000,
      set: () => undefined,
    });

    const { result } = renderHook(() => useChatAreaVirtualizer({
      lastMessageId: messages.at(-1)?.id ?? null,
      lastVisibleOutputSignature: visibleAssistantOutputSignature(messages.at(-1)),
      messageCount: messages.length,
      messageIdToRowIndex: createMessageIdToRowIndex(rows),
      rows,
      scrollRef: { current: scrollRoot },
      tailSig: tailSignature(messages),
      topicId: null,
    }));

    await waitFor(() => {
      expect(virtualizerInstanceRef.current?.shouldAdjustScrollPositionOnItemSizeChange).toBeTypeOf("function");
    });

    const shouldAdjust = virtualizerInstanceRef.current?.shouldAdjustScrollPositionOnItemSizeChange as
      | ((item: { index: number; start: number; end?: number; size?: number }, delta: number, instance: { scrollOffset: number | null }) => boolean)
      | undefined;

    expect(result.current.isAtBottom).toBe(true);
    expect(result.current.isStrictBottom).toBe(true);
    expect(shouldAdjust?.({ index: 1, start: 760, end: 1040, size: 280 }, 80, { scrollOffset: 200 })).toBe(true);

    act(() => {
      result.current.handleTranscriptInteraction({ forceDetached: true });
    });

    expect(result.current.hasFollowBottomIntent).toBe(false);
    expect(shouldAdjust?.({ index: 1, start: 760, end: 1040, size: 280 }, 80, { scrollOffset: 200 })).toBe(false);
  });

  it("离底阅读时只允许稳定位于阅读锚点上方的行参与尺寸修正", async () => {
    const messages = Array.from({ length: 10 }, (_, index) => createMessage(
      `assistant-${index + 1}`,
      "assistant",
      `reply-${index + 1}`,
      index + 1,
      `ask-${index + 1}`,
    ));
    const rows = createRows(messages);
    const scrollRoot = document.createElement("div");
    Object.defineProperty(scrollRoot, "scrollHeight", { configurable: true, get: () => 3200 });
    Object.defineProperty(scrollRoot, "clientHeight", { configurable: true, get: () => 400 });
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => 200,
      set: () => undefined,
    });

    const { result } = renderHook(() => useChatAreaVirtualizer({
      lastMessageId: messages.at(-1)?.id ?? null,
      lastVisibleOutputSignature: visibleAssistantOutputSignature(messages.at(-1)),
      messageCount: messages.length,
      messageIdToRowIndex: createMessageIdToRowIndex(rows),
      rows,
      scrollRef: { current: scrollRoot },
      tailSig: tailSignature(messages),
      topicId: null,
    }));

    await waitFor(() => {
      expect(virtualizerInstanceRef.current?.shouldAdjustScrollPositionOnItemSizeChange).toBeTypeOf("function");
    });

    const shouldAdjust = virtualizerInstanceRef.current?.shouldAdjustScrollPositionOnItemSizeChange as
      | ((item: { index: number; start: number; end?: number; size?: number }, delta: number, instance: { scrollOffset: number | null }) => boolean)
      | undefined;
    const virtualizerOnChange = (virtualizerInstanceRef.current as { onChange?: (instance: { getVirtualItems: () => Array<{ index: number }> }) => void } | null)?.onChange;

    act(() => {
      virtualizerOnChange?.({
        getVirtualItems: () => [{ index: 5 }],
      });
      result.current.handleWheelIntent(-12);
    });

    expect(result.current.isAtBottom).toBe(false);
    expect(shouldAdjust?.({ index: 4, start: 40, end: 150, size: 110 }, 60, { scrollOffset: 200 })).toBe(true);
    expect(shouldAdjust?.({ index: 5, start: 150, end: 280, size: 130 }, 60, { scrollOffset: 200 })).toBe(false);
    expect(shouldAdjust?.({ index: 4, start: 90, end: 177, size: 87 }, 60, { scrollOffset: 200 })).toBe(false);
    expect(shouldAdjust?.({ index: 9, start: 920, end: 1080, size: 160 }, 60, { scrollOffset: 200 })).toBe(false);
  });

  it("scrollToBottom / scrollToTop / jumpToMessageAnchor 只通过 virtualizer command 落地", () => {
    const messages = [
      createMessage("user-1", "user", "hi", 1, "ask-1"),
      createMessage("assistant-1", "assistant", "hello", 2, "ask-1"),
      createMessage("user-2", "user", "next", 3, "ask-2"),
      createMessage("assistant-2", "assistant", "world", 4, "ask-2"),
    ];
    const rows = createRows(messages);
    const scrollRef = { current: null as HTMLDivElement | null };

    const stableInstance = {
      getTotalSize: () => rows.length * 120,
      getVirtualItems: () => Array.from({ length: rows.length }, (_, index) => ({ index, key: `row-${index}`, start: index * 120 })),
      measure: vi.fn(),
      measureElement: vi.fn(),
      scrollBy: vi.fn(),
      scrollOffset: 0,
      scrollToIndex: vi.fn(),
      scrollToOffset: vi.fn(),
      shouldAdjustScrollPositionOnItemSizeChange: undefined,
    };

    useVirtualizerMock.mockImplementation(() => {
      virtualizerInstanceRef.current = stableInstance;
      return stableInstance;
    });

    const { result } = renderHook(() => useChatAreaVirtualizer({
      lastMessageId: messages.at(-1)?.id ?? null,
      lastVisibleOutputSignature: visibleAssistantOutputSignature(messages.at(-1)),
      messageCount: messages.length,
      messageIdToRowIndex: createMessageIdToRowIndex(rows),
      rows,
      scrollRef,
      tailSig: tailSignature(messages),
      topicId: null,
    }));

    act(() => {
      result.current.scrollToBottom();
      result.current.scrollToTop();
      result.current.jumpToMessageAnchor("assistant-1");
    });

    expect(stableInstance.scrollToIndex).toHaveBeenCalledWith(rows.length - 1, { align: "end" });
    expect(stableInstance.scrollToOffset).toHaveBeenCalledWith(0, { align: "start", behavior: "auto" });
    expect(stableInstance.scrollToIndex).toHaveBeenCalledWith(1, { align: "start" });
  });

  it("search ensure-visible 对已可见消息允许 no-op，但 anchor jump 仍会重新锚定", () => {
    const messages = [
      createMessage("user-1", "user", "hi", 1, "ask-1"),
      createMessage("assistant-1", "assistant", "hello", 2, "ask-1"),
      createMessage("user-2", "user", "next", 3, "ask-2"),
      createMessage("assistant-2", "assistant", "world", 4, "ask-2"),
    ];
    const rows = createRows(messages);
    const scrollRoot = document.createElement("div");
    Object.defineProperty(scrollRoot, "clientHeight", { configurable: true, get: () => 400 });
    Object.defineProperty(scrollRoot, "scrollHeight", { configurable: true, get: () => 1200 });
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => 240,
      set: () => undefined,
    });
    scrollRoot.getBoundingClientRect = () => ({
      bottom: 400,
      height: 400,
      left: 0,
      right: 300,
      top: 0,
      width: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    rows.forEach((row, index) => {
      const element = document.createElement("div");
      element.dataset.index = String(index);
      const messageId = row.kind === "group"
        ? row.user.id
        : row.kind === "message" || row.kind === "divider"
          ? row.message.id
          : undefined;
      if (messageId) {
        element.dataset.msgId = messageId;
      }
      element.getBoundingClientRect = () => {
        if (messageId === "assistant-1") {
          return {
            bottom: 200,
            height: 100,
            left: 0,
            right: 300,
            top: 100,
            width: 300,
            x: 0,
            y: 100,
            toJSON: () => ({}),
          } as DOMRect;
        }
        const top = index * 160 + 500;
        return {
          bottom: top + 120,
          height: 120,
          left: 0,
          right: 300,
          top,
          width: 300,
          x: 0,
          y: top,
          toJSON: () => ({}),
        } as DOMRect;
      };
      scrollRoot.appendChild(element);
    });

    const stableInstance = {
      getTotalSize: () => rows.length * 120,
      getVirtualItems: () => Array.from({ length: rows.length }, (_, index) => ({ index, key: `row-${index}`, start: index * 120 })),
      measure: vi.fn(),
      measureElement: vi.fn(),
      scrollBy: vi.fn(),
      scrollOffset: 240,
      scrollToIndex: vi.fn(),
      scrollToOffset: vi.fn(),
      shouldAdjustScrollPositionOnItemSizeChange: undefined,
    };

    useVirtualizerMock.mockImplementation(() => {
      virtualizerInstanceRef.current = stableInstance;
      return stableInstance;
    });

    const { result } = renderHook(() => useChatAreaVirtualizer({
      lastMessageId: messages.at(-1)?.id ?? null,
      lastVisibleOutputSignature: visibleAssistantOutputSignature(messages.at(-1)),
      messageCount: messages.length,
      messageIdToRowIndex: createMessageIdToRowIndex(rows),
      rows,
      scrollRef: { current: scrollRoot },
      tailSig: tailSignature(messages),
      topicId: null,
    }));
    stableInstance.scrollToIndex.mockClear();

    act(() => {
      expect(result.current.scrollToMessageRow("assistant-1", "start")).toBe(true);
    });
    expect(stableInstance.scrollToIndex).not.toHaveBeenCalled();

    act(() => {
      expect(result.current.jumpToMessageAnchor("assistant-1", "start")).toBe(true);
    });
    expect(stableInstance.scrollToIndex).toHaveBeenCalledWith(1, { align: "start" });
  });

  it("用户取消 bottom command 后，旧 rAF 不会继续把列表拉回到底部", () => {
    const raf = installAnimationFrameQueue();
    const messages = [
      createMessage("user-1", "user", "hi", 1, "ask-1"),
      createMessage("assistant-1", "assistant", "hello", 2, "ask-1"),
      createMessage("user-2", "user", "next", 3, "ask-2"),
      createMessage("assistant-2", "assistant", "world", 4, "ask-2"),
    ];
    const rows = createRows(messages);
    const scrollRoot = document.createElement("div");
    Object.defineProperty(scrollRoot, "scrollHeight", { configurable: true, get: () => 2200 });
    Object.defineProperty(scrollRoot, "clientHeight", { configurable: true, get: () => 400 });
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => 1800,
      set: () => undefined,
    });

    const stableInstance = {
      getTotalSize: () => rows.length * 120,
      getVirtualItems: () => Array.from({ length: rows.length }, (_, index) => ({ index, key: `row-${index}`, start: index * 120 })),
      measure: vi.fn(),
      measureElement: vi.fn(),
      scrollBy: vi.fn(),
      scrollOffset: 0,
      scrollToIndex: vi.fn(),
      scrollToOffset: vi.fn(),
      shouldAdjustScrollPositionOnItemSizeChange: undefined,
    };

    useVirtualizerMock.mockImplementation(() => {
      virtualizerInstanceRef.current = stableInstance;
      return stableInstance;
    });

    const { result } = renderHook(() => useChatAreaVirtualizer({
      lastMessageId: messages.at(-1)?.id ?? null,
      lastVisibleOutputSignature: visibleAssistantOutputSignature(messages.at(-1)),
      messageCount: messages.length,
      messageIdToRowIndex: createMessageIdToRowIndex(rows),
      rows,
      scrollRef: { current: scrollRoot },
      tailSig: tailSignature(messages),
      topicId: null,
    }));

    act(() => {
      result.current.scrollToBottom();
    });
    const scrollToIndexCallsBeforeCancel = stableInstance.scrollToIndex.mock.calls.length;
    const scrollToOffsetCallsBeforeCancel = stableInstance.scrollToOffset.mock.calls.length;

    act(() => {
      result.current.handleWheelIntent(-12);
    });
    act(() => {
      raf.flushAll();
    });

    expect(stableInstance.scrollToIndex).toHaveBeenCalledTimes(scrollToIndexCallsBeforeCancel);
    expect(stableInstance.scrollToOffset).toHaveBeenCalledTimes(scrollToOffsetCallsBeforeCancel);
  });

  it("bottom command 已执行首帧后，真实向上离底 scroll 会抢占后续贴底重试", () => {
    const raf = installAnimationFrameQueue();
    const messages = [
      createMessage("user-1", "user", "hi", 1, "ask-1"),
      createMessage("assistant-1", "assistant", "hello", 2, "ask-1"),
      createMessage("user-2", "user", "next", 3, "ask-2"),
      createMessage("assistant-2", "assistant", "world", 4, "ask-2"),
    ];
    const rows = createRows(messages);
    let currentScrollTop = 900;
    const scrollRoot = document.createElement("div");
    Object.defineProperty(scrollRoot, "scrollHeight", { configurable: true, get: () => 2200 });
    Object.defineProperty(scrollRoot, "clientHeight", { configurable: true, get: () => 400 });
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => currentScrollTop,
      set: (value: number) => {
        currentScrollTop = value;
      },
    });

    const stableInstance = {
      getTotalSize: () => rows.length * 120,
      getVirtualItems: () => Array.from({ length: rows.length }, (_, index) => ({ index, key: `row-${index}`, start: index * 120 })),
      measure: vi.fn(),
      measureElement: vi.fn(),
      scrollBy: vi.fn((delta: number) => {
        currentScrollTop += delta;
        stableInstance.scrollOffset = currentScrollTop;
      }),
      scrollOffset: currentScrollTop,
      scrollToIndex: vi.fn((index: number, options?: { align?: string }) => {
        if (options?.align === "end" && index === rows.length - 1) {
          currentScrollTop = 1800;
          stableInstance.scrollOffset = currentScrollTop;
          return;
        }
        currentScrollTop = index * 120;
        stableInstance.scrollOffset = currentScrollTop;
      }),
      scrollToOffset: vi.fn((offset: number) => {
        currentScrollTop = offset;
        stableInstance.scrollOffset = currentScrollTop;
      }),
      shouldAdjustScrollPositionOnItemSizeChange: undefined,
    };

    useVirtualizerMock.mockImplementation(() => {
      virtualizerInstanceRef.current = stableInstance;
      return stableInstance;
    });

    const { result } = renderHook(() => useChatAreaVirtualizer({
      lastMessageId: messages.at(-1)?.id ?? null,
      lastVisibleOutputSignature: visibleAssistantOutputSignature(messages.at(-1)),
      messageCount: messages.length,
      messageIdToRowIndex: createMessageIdToRowIndex(rows),
      rows,
      scrollRef: { current: scrollRoot },
      tailSig: tailSignature(messages),
      topicId: null,
    }));

    act(() => {
      result.current.scrollToBottom();
      result.current.handleScroll();
    });
    expect(result.current.hasFollowBottomIntent).toBe(true);

    currentScrollTop = 1500;
    stableInstance.scrollOffset = currentScrollTop;
    act(() => {
      result.current.handleScroll();
    });

    const scrollToIndexCallsAfterUserScroll = stableInstance.scrollToIndex.mock.calls.length;
    const scrollToOffsetCallsAfterUserScroll = stableInstance.scrollToOffset.mock.calls.length;

    expect(result.current.hasFollowBottomIntent).toBe(false);
    expect(result.current.scrollToBottomAfterNextCommitIfFollowing()).toBe(false);

    act(() => {
      raf.flushAll();
    });

    expect(stableInstance.scrollToIndex).toHaveBeenCalledTimes(scrollToIndexCallsAfterUserScroll);
    expect(stableInstance.scrollToOffset).toHaveBeenCalledTimes(scrollToOffsetCallsAfterUserScroll);
  });

  it("bottom command 期间内容变短但仍 strict-bottom 时不会误判为用户上翻", () => {
    const raf = installAnimationFrameQueue();
    const messages = [
      createMessage("user-1", "user", "hi", 1, "ask-1"),
      createMessage("assistant-1", "assistant", "hello", 2, "ask-1"),
    ];
    const rows = createRows(messages, true);
    let currentScrollHeight = 1400;
    let currentScrollTop = 1000;
    const scrollRoot = document.createElement("div");
    Object.defineProperty(scrollRoot, "scrollHeight", { configurable: true, get: () => currentScrollHeight });
    Object.defineProperty(scrollRoot, "clientHeight", { configurable: true, get: () => 400 });
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => currentScrollTop,
      set: (value: number) => {
        currentScrollTop = value;
      },
    });

    const stableInstance = {
      getTotalSize: () => rows.length * 120,
      getVirtualItems: () => Array.from({ length: rows.length }, (_, index) => ({ index, key: `row-${index}`, start: index * 120 })),
      measure: vi.fn(),
      measureElement: vi.fn(),
      scrollBy: vi.fn((delta: number) => {
        currentScrollTop += delta;
        stableInstance.scrollOffset = currentScrollTop;
      }),
      scrollOffset: currentScrollTop,
      scrollToIndex: vi.fn((index: number, options?: { align?: string }) => {
        if (options?.align === "end" && index === rows.length - 1) {
          currentScrollTop = Math.max(0, currentScrollHeight - 400);
          stableInstance.scrollOffset = currentScrollTop;
          return;
        }
        currentScrollTop = index * 120;
        stableInstance.scrollOffset = currentScrollTop;
      }),
      scrollToOffset: vi.fn((offset: number) => {
        currentScrollTop = offset;
        stableInstance.scrollOffset = currentScrollTop;
      }),
      shouldAdjustScrollPositionOnItemSizeChange: undefined,
    };

    useVirtualizerMock.mockImplementation(() => {
      virtualizerInstanceRef.current = stableInstance;
      return stableInstance;
    });

    const { result } = renderHook(() => useChatAreaVirtualizer({
      lastMessageId: messages.at(-1)?.id ?? null,
      lastVisibleOutputSignature: visibleAssistantOutputSignature(messages.at(-1)),
      messageCount: messages.length,
      messageIdToRowIndex: createMessageIdToRowIndex(rows),
      rows,
      scrollRef: { current: scrollRoot },
      tailSig: tailSignature(messages),
      topicId: null,
    }));

    act(() => {
      result.current.scrollToBottom();
      result.current.handleScroll();
    });

    currentScrollHeight = 1390;
    currentScrollTop = 990;
    stableInstance.scrollOffset = currentScrollTop;
    act(() => {
      result.current.handleScroll();
    });

    expect(result.current.hasFollowBottomIntent).toBe(true);
    expect(result.current.scrollToBottomIfFollowing()).toBe(true);

    act(() => {
      raf.flushAll();
    });

    expect(result.current.hasFollowBottomIntent).toBe(true);
  });

  it("下一次提交后的底部预约在 detached-reading 下不会抢走历史重发位置", () => {
    const messages = [
      createMessage("user-1", "user", "hi", 1, "ask-1"),
      createMessage("assistant-1", "assistant", "hello", 2, "ask-1"),
      createMessage("user-2", "user", "next", 3, "ask-2"),
      createMessage("assistant-2", "assistant", "world", 4, "ask-2"),
    ];
    const rows = createRows(messages);
    const scrollRoot = document.createElement("div");
    Object.defineProperty(scrollRoot, "scrollHeight", { configurable: true, get: () => 2200 });
    Object.defineProperty(scrollRoot, "clientHeight", { configurable: true, get: () => 400 });
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => 600,
      set: () => undefined,
    });

    const stableInstance = {
      getTotalSize: () => rows.length * 120,
      getVirtualItems: () => Array.from({ length: rows.length }, (_, index) => ({ index, key: `row-${index}`, start: index * 120 })),
      measure: vi.fn(),
      measureElement: vi.fn(),
      scrollBy: vi.fn(),
      scrollOffset: 600,
      scrollToIndex: vi.fn(),
      scrollToOffset: vi.fn(),
      shouldAdjustScrollPositionOnItemSizeChange: undefined,
    };

    useVirtualizerMock.mockImplementation(() => {
      virtualizerInstanceRef.current = stableInstance;
      return stableInstance;
    });

    const { result } = renderHook(() => useChatAreaVirtualizer({
      lastMessageId: messages.at(-1)?.id ?? null,
      lastVisibleOutputSignature: visibleAssistantOutputSignature(messages.at(-1)),
      messageCount: messages.length,
      messageIdToRowIndex: createMessageIdToRowIndex(rows),
      rows,
      scrollRef: { current: scrollRoot },
      tailSig: tailSignature(messages),
      topicId: null,
    }));

    act(() => {
      result.current.handleWheelIntent(-12);
    });
    stableInstance.scrollToIndex.mockClear();
    stableInstance.scrollToOffset.mockClear();

    act(() => {
      expect(result.current.scrollToBottomAfterNextCommitIfFollowing()).toBe(false);
    });

    expect(stableInstance.scrollToIndex).not.toHaveBeenCalled();
    expect(stableInstance.scrollToOffset).not.toHaveBeenCalled();
  });

  it("小数向上 wheel 意图在 strict-bottom 起点也会接管阅读 owner", () => {
    const messages = [
      createMessage("user-1", "user", "hi", 1, "ask-1"),
      createMessage("assistant-1", "assistant", "hello", 2, "ask-1"),
    ];
    const rows = createRows(messages, true);
    const scrollRoot = document.createElement("div");
    Object.defineProperty(scrollRoot, "scrollHeight", { configurable: true, get: () => 1400 });
    Object.defineProperty(scrollRoot, "clientHeight", { configurable: true, get: () => 400 });
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => 1000,
      set: () => undefined,
    });

    const stableInstance = {
      getTotalSize: () => rows.length * 120,
      getVirtualItems: () => Array.from({ length: rows.length }, (_, index) => ({ index, key: `row-${index}`, start: index * 120 })),
      measure: vi.fn(),
      measureElement: vi.fn(),
      scrollBy: vi.fn(),
      scrollOffset: 1000,
      scrollToIndex: vi.fn(),
      scrollToOffset: vi.fn(),
      shouldAdjustScrollPositionOnItemSizeChange: undefined,
    };

    useVirtualizerMock.mockImplementation(() => {
      virtualizerInstanceRef.current = stableInstance;
      return stableInstance;
    });

    const { result } = renderHook(() => useChatAreaVirtualizer({
      lastMessageId: messages.at(-1)?.id ?? null,
      lastVisibleOutputSignature: visibleAssistantOutputSignature(messages.at(-1)),
      messageCount: messages.length,
      messageIdToRowIndex: createMessageIdToRowIndex(rows),
      rows,
      scrollRef: { current: scrollRoot },
      tailSig: tailSignature(messages),
      topicId: null,
    }));

    act(() => {
      result.current.handleWheelIntent(-0.5);
      result.current.handleScroll();
    });
    stableInstance.scrollToIndex.mockClear();
    stableInstance.scrollToOffset.mockClear();

    expect(result.current.hasFollowBottomIntent).toBe(false);
    expect(result.current.scrollToBottomAfterNextCommitIfFollowing()).toBe(false);
    expect(stableInstance.scrollToIndex).not.toHaveBeenCalled();
    expect(stableInstance.scrollToOffset).not.toHaveBeenCalled();
  });

  it("原生 scrollbar drag start 在 strict-bottom 起点也会接管阅读 owner", () => {
    const messages = [
      createMessage("user-1", "user", "hi", 1, "ask-1"),
      createMessage("assistant-1", "assistant", "hello", 2, "ask-1"),
    ];
    const rows = createRows(messages, true);
    const scrollRoot = document.createElement("div");
    Object.defineProperty(scrollRoot, "scrollHeight", { configurable: true, get: () => 1400 });
    Object.defineProperty(scrollRoot, "clientHeight", { configurable: true, get: () => 400 });
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => 1000,
      set: () => undefined,
    });

    const stableInstance = {
      getTotalSize: () => rows.length * 120,
      getVirtualItems: () => Array.from({ length: rows.length }, (_, index) => ({ index, key: `row-${index}`, start: index * 120 })),
      measure: vi.fn(),
      measureElement: vi.fn(),
      scrollBy: vi.fn(),
      scrollOffset: 1000,
      scrollToIndex: vi.fn(),
      scrollToOffset: vi.fn(),
      shouldAdjustScrollPositionOnItemSizeChange: undefined,
    };

    useVirtualizerMock.mockImplementation(() => {
      virtualizerInstanceRef.current = stableInstance;
      return stableInstance;
    });

    const { result } = renderHook(() => useChatAreaVirtualizer({
      lastMessageId: messages.at(-1)?.id ?? null,
      lastVisibleOutputSignature: visibleAssistantOutputSignature(messages.at(-1)),
      messageCount: messages.length,
      messageIdToRowIndex: createMessageIdToRowIndex(rows),
      rows,
      scrollRef: { current: scrollRoot },
      tailSig: tailSignature(messages),
      topicId: null,
    }));

    act(() => {
      result.current.handleScrollbarDragStart();
    });
    stableInstance.scrollToIndex.mockClear();
    stableInstance.scrollToOffset.mockClear();

    expect(result.current.hasFollowBottomIntent).toBe(false);
    expect(result.current.scrollToBottomAfterNextCommitIfFollowing()).toBe(false);
    expect(stableInstance.scrollToIndex).not.toHaveBeenCalled();
    expect(stableInstance.scrollToOffset).not.toHaveBeenCalled();
  });

  it("下一次提交后的底部预约在 follow-bottom 下保持原来的贴底跟随", () => {
    const messages = [
      createMessage("user-1", "user", "hi", 1, "ask-1"),
      createMessage("assistant-1", "assistant", "hello", 2, "ask-1"),
    ];
    const rows = createRows(messages);
    const scrollRoot = document.createElement("div");
    Object.defineProperty(scrollRoot, "scrollHeight", { configurable: true, get: () => 1400 });
    Object.defineProperty(scrollRoot, "clientHeight", { configurable: true, get: () => 400 });
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => 1000,
      set: () => undefined,
    });

    const stableInstance = {
      getTotalSize: () => rows.length * 120,
      getVirtualItems: () => Array.from({ length: rows.length }, (_, index) => ({ index, key: `row-${index}`, start: index * 120 })),
      measure: vi.fn(),
      measureElement: vi.fn(),
      scrollBy: vi.fn(),
      scrollOffset: 1000,
      scrollToIndex: vi.fn(),
      scrollToOffset: vi.fn(),
      shouldAdjustScrollPositionOnItemSizeChange: undefined,
    };

    useVirtualizerMock.mockImplementation(() => {
      virtualizerInstanceRef.current = stableInstance;
      return stableInstance;
    });

    const { result } = renderHook(() => useChatAreaVirtualizer({
      lastMessageId: messages.at(-1)?.id ?? null,
      lastVisibleOutputSignature: visibleAssistantOutputSignature(messages.at(-1)),
      messageCount: messages.length,
      messageIdToRowIndex: createMessageIdToRowIndex(rows),
      rows,
      scrollRef: { current: scrollRoot },
      tailSig: tailSignature(messages),
      topicId: null,
    }));
    stableInstance.scrollToIndex.mockClear();

    act(() => {
      expect(result.current.scrollToBottomAfterNextCommitIfFollowing()).toBe(true);
    });

    expect(stableInstance.scrollToIndex).toHaveBeenCalledWith(rows.length - 1, { align: "end" });
  });

  it("follow-bottom 下尾部流式增长只会产生临时 gap，不会把 owner 误降级成 detached-reading", () => {
    const messages = [
      createMessage("user-1", "user", "hi", 1, "ask-1"),
      createMessage("assistant-1", "assistant", "hello", 2, "ask-1"),
    ];
    const rows = createRows(messages, true);
    let currentScrollHeight = 1400;
    const scrollRoot = document.createElement("div");
    Object.defineProperty(scrollRoot, "scrollHeight", {
      configurable: true,
      get: () => currentScrollHeight,
    });
    Object.defineProperty(scrollRoot, "clientHeight", { configurable: true, get: () => 400 });
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => 1000,
      set: () => undefined,
    });

    const stableInstance = {
      getTotalSize: () => rows.length * 120,
      getVirtualItems: () => Array.from({ length: rows.length }, (_, index) => ({ index, key: `row-${index}`, start: index * 120 })),
      measure: vi.fn(),
      measureElement: vi.fn(),
      scrollBy: vi.fn(),
      scrollOffset: 1000,
      scrollToIndex: vi.fn(),
      scrollToOffset: vi.fn(),
      shouldAdjustScrollPositionOnItemSizeChange: undefined,
    };

    useVirtualizerMock.mockImplementation(() => {
      virtualizerInstanceRef.current = stableInstance;
      return stableInstance;
    });

    const { result } = renderHook(() => useChatAreaVirtualizer({
      lastMessageId: messages.at(-1)?.id ?? null,
      lastVisibleOutputSignature: visibleAssistantOutputSignature(messages.at(-1)),
      messageCount: messages.length,
      messageIdToRowIndex: createMessageIdToRowIndex(rows),
      rows,
      scrollRef: { current: scrollRoot },
      tailSig: tailSignature(messages),
      topicId: null,
    }));

    currentScrollHeight = 1480;

    act(() => {
      result.current.handleScroll();
    });

    expect(result.current.viewportSnapshot).toEqual({ kind: "bottom" });
    expect(result.current.hasFollowBottomIntent).toBe(true);
    expect(result.current.isStrictBottom).toBe(false);

    act(() => {
      expect(result.current.scrollToBottomIfFollowing()).toBe(true);
    });
    expect(stableInstance.scrollToIndex).toHaveBeenCalledWith(rows.length - 1, { align: "end" });
  });

  it("bottom 命令结算后会把 session 收口到 viewportSnapshot.bottom", async () => {
    const messages = [
      createMessage("assistant-1", "assistant", "world", 1),
      createMessage("assistant-2", "assistant", "tail", 2),
    ];
    const rows = createRows(messages);
    let currentScrollTop = 240;

    const stableInstance = {
      getTotalSize: () => rows.length * 120,
      getVirtualItems: () => Array.from({ length: rows.length }, (_, index) => ({ index, key: `row-${index}`, start: index * 120 })),
      measure: vi.fn(),
      measureElement: vi.fn(),
      scrollBy: vi.fn(),
      scrollOffset: 0,
      scrollToIndex: vi.fn((index: number, options?: { align?: string }) => {
        if (options?.align === "end" && index === rows.length - 1) {
          currentScrollTop = 1000;
          stableInstance.scrollOffset = currentScrollTop;
          return;
        }
        currentScrollTop = index * 120;
        stableInstance.scrollOffset = currentScrollTop;
      }),
      scrollToOffset: vi.fn((offset: number, options?: { align?: string }) => {
        if (options?.align === "end" && offset >= 1400) {
          currentScrollTop = 1000;
          stableInstance.scrollOffset = currentScrollTop;
          return;
        }
        currentScrollTop = offset;
        stableInstance.scrollOffset = currentScrollTop;
      }),
      shouldAdjustScrollPositionOnItemSizeChange: undefined,
    };

    useVirtualizerMock.mockImplementation(() => {
      virtualizerInstanceRef.current = stableInstance;
      return stableInstance;
    });

    const controllerRef = { current: null as null | { scrollRef: MutableRefObject<HTMLDivElement | null>; state: ReturnType<typeof useChatAreaVirtualizer> } };
    const { getByTestId } = render(
      <VirtualizerHarness
        controllerRef={controllerRef}
        messages={messages}
        rows={rows}
        topicId={null}
      />,
    );

    const scrollRoot = getByTestId("chat-scroll-root");
    Object.defineProperty(scrollRoot, "scrollHeight", {
      configurable: true,
      get: () => 1400,
    });
    Object.defineProperty(scrollRoot, "clientHeight", {
      configurable: true,
      get: () => 400,
    });
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => currentScrollTop,
      set: (value: number) => {
        currentScrollTop = value;
      },
    });
    Object.defineProperty(scrollRoot, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        width: 720,
        height: 400,
        top: 0,
        left: 0,
        right: 720,
        bottom: 400,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      }),
    });
    currentScrollTop = 240;

    act(() => {
      controllerRef.current?.state.handleWheelIntent(-16);
      controllerRef.current?.state.handleScroll();
    });

    expect(controllerRef.current?.state.isStrictBottom).toBe(false);

    stableInstance.scrollToIndex.mockClear();

    act(() => {
      controllerRef.current?.state.scrollToBottom();
    });

    await waitFor(() => {
      expect(controllerRef.current?.state.viewportSnapshot).toEqual({ kind: "bottom" });
      expect(controllerRef.current?.state.isStrictBottom).toBe(true);
    });

    expect(stableInstance.scrollToIndex).toHaveBeenCalledWith(rows.length - 1, { align: "end" });
    expect(currentScrollTop).toBe(1000);
  });

  it("bottom command 执行途中尾部流式 revision 变化后仍会结算到底部", async () => {
    const frameQueue = installAnimationFrameQueue();
    const initialMessages = [createMessage("assistant-1", "assistant", "hello", 1)];
    const streamedMessages = [createMessage("assistant-1", "assistant", "hello world", 1)];
    const nextChunkMessages = [createMessage("assistant-1", "assistant", "hello world again", 1)];
    let currentMessages = initialMessages;
    let currentRows = createRows(currentMessages, true);
    let currentScrollHeight = 1800;
    let currentScrollTop = 240;

    const stableInstance = {
      getTotalSize: () => currentRows.length * 120,
      getVirtualItems: () => Array.from({ length: currentRows.length }, (_, index) => ({ index, key: `row-${index}`, start: index * 120 })),
      measure: vi.fn(),
      measureElement: vi.fn(),
      scrollBy: vi.fn((delta: number) => {
        currentScrollTop += delta;
        stableInstance.scrollOffset = currentScrollTop;
      }),
      scrollOffset: currentScrollTop,
      scrollToIndex: vi.fn((index: number, options?: { align?: string }) => {
        if (options?.align === "end" && index === currentRows.length - 1) {
          currentScrollTop = Math.max(0, currentScrollHeight - 400);
          stableInstance.scrollOffset = currentScrollTop;
          return;
        }
        currentScrollTop = index * 120;
        stableInstance.scrollOffset = currentScrollTop;
      }),
      scrollToOffset: vi.fn((offset: number) => {
        currentScrollTop = offset;
        stableInstance.scrollOffset = currentScrollTop;
      }),
      shouldAdjustScrollPositionOnItemSizeChange: undefined,
    };

    useVirtualizerMock.mockImplementation(() => {
      virtualizerInstanceRef.current = stableInstance;
      return stableInstance;
    });

    const controllerRef = { current: null as null | { scrollRef: MutableRefObject<HTMLDivElement | null>; state: ReturnType<typeof useChatAreaVirtualizer> } };
    const { getByTestId, rerender } = render(
      <VirtualizerHarness
        controllerRef={controllerRef}
        messages={currentMessages}
        rows={currentRows}
        topicId="topic-bottom-revision"
      />,
    );

    const scrollRoot = getByTestId("chat-scroll-root");
    Object.defineProperty(scrollRoot, "scrollHeight", { configurable: true, get: () => currentScrollHeight });
    Object.defineProperty(scrollRoot, "clientHeight", { configurable: true, get: () => 400 });
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => currentScrollTop,
      set: (value: number) => {
        currentScrollTop = value;
        stableInstance.scrollOffset = value;
      },
    });
    Object.defineProperty(scrollRoot, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        width: 720,
        height: 400,
        top: 0,
        left: 0,
        right: 720,
        bottom: 400,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      }),
    });

    act(() => {
      controllerRef.current?.state.handleWheelIntent(-16);
      controllerRef.current?.state.handleScroll();
    });
    expect(controllerRef.current?.state.viewportSnapshot.kind).toBe("row-anchor");

    currentMessages = streamedMessages;
    currentRows = createRows(currentMessages, true);
    currentScrollHeight = 1820;
    rerender(
      <VirtualizerHarness
        controllerRef={controllerRef}
        messages={currentMessages}
        rows={currentRows}
        topicId="topic-bottom-revision"
      />,
    );
    act(() => {
      frameQueue.flushAll();
    });

    act(() => {
      controllerRef.current?.state.scrollToBottom();
      while (stableInstance.scrollToIndex.mock.calls.length === 0) {
        expect(frameQueue.flushNext()).toBe(true);
      }
    });

    currentMessages = nextChunkMessages;
    currentRows = createRows(currentMessages, true);
    currentScrollHeight = 1880;
    rerender(
      <VirtualizerHarness
        controllerRef={controllerRef}
        messages={currentMessages}
        rows={currentRows}
        topicId="topic-bottom-revision"
      />,
    );

    act(() => {
      frameQueue.flushAll();
    });

    await waitFor(() => {
      expect(controllerRef.current?.state.viewportSnapshot).toEqual({ kind: "bottom" });
      expect(controllerRef.current?.state.readMarker).toEqual({
        lastMessageId: "assistant-1",
        lastVisibleOutputSignature: visibleAssistantOutputSignature(nextChunkMessages.at(-1)),
        messageCount: 1,
      });
    });
  });

  it("用户手动滚到底会基于真实几何刷新当前尾部已读标记", async () => {
    const initialMessages = [createMessage("assistant-1", "assistant", "hello")];
    const streamedMessages = [createMessage("assistant-1", "assistant", "hello world")];
    let currentScrollTop = 240;
    const scrollRoot = document.createElement("div");
    Object.defineProperty(scrollRoot, "scrollHeight", { configurable: true, get: () => 1800 });
    Object.defineProperty(scrollRoot, "clientHeight", { configurable: true, get: () => 400 });
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => currentScrollTop,
      set: (value: number) => {
        currentScrollTop = value;
      },
    });

    const { result, rerender } = renderHook((props: { messages: Message[] }) => {
      const rows = createRows(props.messages, true);
      return useChatAreaVirtualizer({
        lastMessageId: props.messages.at(-1)?.id ?? null,
        lastVisibleOutputSignature: visibleAssistantOutputSignature(props.messages.at(-1)),
        messageCount: props.messages.length,
        messageIdToRowIndex: createMessageIdToRowIndex(rows),
        rows,
        scrollRef: { current: scrollRoot },
        tailSig: tailSignature(props.messages),
        topicId: "topic-manual-bottom-read",
      });
    }, {
      initialProps: { messages: initialMessages },
    });

    act(() => {
      result.current.handleWheelIntent(-12);
      result.current.handleScroll();
    });
    rerender({ messages: streamedMessages });

    expect(result.current.isStrictBottom).toBe(false);
    expect(result.current.readMarker).toEqual({
      lastMessageId: "assistant-1",
      lastVisibleOutputSignature: visibleAssistantOutputSignature(initialMessages.at(-1)),
      messageCount: 1,
    });

    currentScrollTop = 1400;
    act(() => {
      result.current.handleWheelIntent(12);
      result.current.handleScroll();
    });

    await waitFor(() => {
      expect(result.current.isStrictBottom).toBe(true);
      expect(result.current.readMarker).toEqual({
        lastMessageId: "assistant-1",
        lastVisibleOutputSignature: visibleAssistantOutputSignature(streamedMessages.at(-1)),
        messageCount: 1,
      });
    });
  });

  it("detached-reading 下用户通过滚动条向下到 strict-bottom 也会恢复跟随并刷新已读", async () => {
    const initialMessages = [createMessage("assistant-1", "assistant", "hello")];
    const streamedMessages = [createMessage("assistant-1", "assistant", "hello world")];
    let currentScrollTop = 240;
    const scrollRoot = document.createElement("div");
    Object.defineProperty(scrollRoot, "scrollHeight", { configurable: true, get: () => 1800 });
    Object.defineProperty(scrollRoot, "clientHeight", { configurable: true, get: () => 400 });
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => currentScrollTop,
      set: (value: number) => {
        currentScrollTop = value;
      },
    });

    const { result, rerender } = renderHook((props: { messages: Message[] }) => {
      const rows = createRows(props.messages, true);
      return useChatAreaVirtualizer({
        lastMessageId: props.messages.at(-1)?.id ?? null,
        lastVisibleOutputSignature: visibleAssistantOutputSignature(props.messages.at(-1)),
        messageCount: props.messages.length,
        messageIdToRowIndex: createMessageIdToRowIndex(rows),
        rows,
        scrollRef: { current: scrollRoot },
        tailSig: tailSignature(props.messages),
        topicId: "topic-ambient-bottom-sync",
      });
    }, {
      initialProps: { messages: initialMessages },
    });

    act(() => {
      result.current.handleWheelIntent(-12);
      result.current.handleScroll();
    });
    rerender({ messages: streamedMessages });

    currentScrollTop = 1400;
    act(() => {
      result.current.handleScroll();
    });

    await waitFor(() => {
      expect(result.current.isStrictBottom).toBe(true);
      expect(result.current.hasFollowBottomIntent).toBe(true);
      expect(result.current.readMarker).toEqual({
        lastMessageId: "assistant-1",
        lastVisibleOutputSignature: visibleAssistantOutputSignature(streamedMessages.at(-1)),
        messageCount: 1,
      });
    });
  });

  it("detached-reading 下 bottom read sync 即使读到 strict-bottom 也不会刷新已读", () => {
    const commitSession = vi.fn();
    const syncScrollPositionFromDom = vi.fn(() => ({
      atTop: false,
      currentTop: 1400,
      distance: 0,
      nearBottom: true,
      strictBottom: true,
    }));

    const { result } = renderHook(() => useChatVirtualizerBottomReadSync({
      commitSession,
      lastMessageId: "assistant-1",
      lastVisibleOutputSignature: "assistant-1|24|",
      messageCount: 1,
      scrollModeRef: { current: "detached-reading" },
      syncScrollPositionFromDom,
    }));

    act(() => {
      expect(result.current.syncStrictBottomReadMarker()).toBe(false);
    });

    expect(syncScrollPositionFromDom).toHaveBeenCalledTimes(1);
    expect(commitSession).not.toHaveBeenCalled();
  });

  it("距离底部超过严格阈值时，动态测量不会误清当前未读尾部", () => {
    const initialMessages = [createMessage("assistant-1", "assistant", "hello")];
    const streamedMessages = [createMessage("assistant-1", "assistant", "hello with unread tail")];
    let currentScrollTop = 320;
    const scrollRoot = document.createElement("div");
    Object.defineProperty(scrollRoot, "scrollHeight", { configurable: true, get: () => 1800 });
    Object.defineProperty(scrollRoot, "clientHeight", { configurable: true, get: () => 400 });
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => currentScrollTop,
      set: (value: number) => {
        currentScrollTop = value;
      },
    });

    const { result, rerender } = renderHook((props: { messages: Message[] }) => {
      const rows = createRows(props.messages, true);
      return useChatAreaVirtualizer({
        lastMessageId: props.messages.at(-1)?.id ?? null,
        lastVisibleOutputSignature: visibleAssistantOutputSignature(props.messages.at(-1)),
        messageCount: props.messages.length,
        messageIdToRowIndex: createMessageIdToRowIndex(rows),
        rows,
        scrollRef: { current: scrollRoot },
        tailSig: tailSignature(props.messages),
        topicId: "topic-measured-not-bottom",
      });
    }, {
      initialProps: { messages: initialMessages },
    });

    act(() => {
      result.current.handleWheelIntent(-12);
      result.current.handleScroll();
    });
    rerender({ messages: streamedMessages });

    const measuredRow = document.createElement("div");
    measuredRow.dataset.index = "0";
    currentScrollTop = 1360;
    act(() => {
      result.current.measureElement(measuredRow);
    });

    expect(result.current.isStrictBottom).toBe(false);
    expect(result.current.readMarker).toEqual({
      lastMessageId: "assistant-1",
      lastVisibleOutputSignature: visibleAssistantOutputSignature(initialMessages.at(-1)),
      messageCount: 1,
    });
  });

  it("detached-reading 下虚拟行动态测量完成后会刷新 strict-bottom 几何但不清 read marker", () => {
    const frameQueue = installAnimationFrameQueue();
    const initialMessages = [createMessage("assistant-1", "assistant", "hello")];
    const streamedMessages = [createMessage("assistant-1", "assistant", "hello with measured unread tail")];
    let currentScrollHeight = 1400;
    let currentScrollTop = 1000;
    const scrollRoot = document.createElement("div");
    Object.defineProperty(scrollRoot, "scrollHeight", { configurable: true, get: () => currentScrollHeight });
    Object.defineProperty(scrollRoot, "clientHeight", { configurable: true, get: () => 400 });
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => currentScrollTop,
      set: (value: number) => {
        currentScrollTop = value;
      },
    });

    const { result, rerender } = renderHook((props: { messages: Message[] }) => {
      const rows = createRows(props.messages, true);
      return useChatAreaVirtualizer({
        lastMessageId: props.messages.at(-1)?.id ?? null,
        lastVisibleOutputSignature: visibleAssistantOutputSignature(props.messages.at(-1)),
        messageCount: props.messages.length,
        messageIdToRowIndex: createMessageIdToRowIndex(rows),
        rows,
        scrollRef: { current: scrollRoot },
        tailSig: tailSignature(props.messages),
        topicId: "topic-dynamic-measure",
      });
    }, {
      initialProps: { messages: initialMessages },
    });

    act(() => {
      frameQueue.flushAll();
    });
    act(() => {
      result.current.handleWheelIntent(-0.5);
      currentScrollTop = 999.5;
      result.current.handleScroll();
    });

    expect(result.current.hasFollowBottomIntent).toBe(false);
    expect(result.current.isStrictBottom).toBe(true);

    rerender({ messages: streamedMessages });
    currentScrollHeight = 1440;
    act(() => {
      const instance = virtualizerInstanceRef.current as {
        getVirtualItems: () => Array<{ index: number }>;
        onChange?: (instance: { getVirtualItems: () => Array<{ index: number }> }) => void;
      };
      instance.onChange?.(instance);
      frameQueue.flushAll();
    });

    expect(result.current.hasFollowBottomIntent).toBe(false);
    expect(result.current.isStrictBottom).toBe(false);
    expect(result.current.readMarker).toEqual({
      lastMessageId: "assistant-1",
      lastVisibleOutputSignature: visibleAssistantOutputSignature(initialMessages.at(-1)),
      messageCount: 1,
    });
  });

  it("per-topic readMarker 不会在切 topic 时丢失", () => {
    const topicAMessages = [
      createMessage("user-a1", "user", "A1", 1, "ask-a1"),
      createMessage("assistant-a1", "assistant", "A2", 2, "ask-a1"),
    ];
    const topicBMessages = [
      createMessage("user-b1", "user", "B1", 3, "ask-b1"),
      createMessage("assistant-b1", "assistant", "B2", 4, "ask-b1"),
    ];
    const topicARows = createRows(topicAMessages);
    const topicBRows = createRows(topicBMessages);

    const { result, rerender } = renderHook((props: {
      messages: Message[];
      rows: ChatRow[];
      topicId: string;
    }) => useChatAreaVirtualizer({
      lastMessageId: props.messages.at(-1)?.id ?? null,
      lastVisibleOutputSignature: visibleAssistantOutputSignature(props.messages.at(-1)),
      messageCount: props.messages.length,
      messageIdToRowIndex: createMessageIdToRowIndex(props.rows),
      rows: props.rows,
      scrollRef: { current: null },
      tailSig: tailSignature(props.messages),
      topicId: props.topicId,
    }), {
      initialProps: {
        messages: topicAMessages,
        rows: topicARows,
        topicId: "topic-a",
      },
    });

    act(() => {
      result.current.markRead(1, "user-a1", "");
    });

    rerender({
      messages: topicBMessages,
      rows: topicBRows,
      topicId: "topic-b",
    });
    act(() => {
      result.current.markRead(2, "assistant-b1", visibleAssistantOutputSignature(topicBMessages.at(-1)));
    });

    rerender({
      messages: topicAMessages,
      rows: topicARows,
      topicId: "topic-a",
    });

    expect(result.current.readMarker).toEqual({
      lastMessageId: "user-a1",
      lastVisibleOutputSignature: "",
      messageCount: 1,
    });
  });

  it("测量后的虚拟快照会实时透传，不会继续复用过期 totalSize 和 start", () => {
    const messages = [
      createMessage("user-1", "user", "hi", 1, "ask-1"),
      createMessage("assistant-1", "assistant", "ok", 2, "ask-1"),
      createMessage("user-2", "user", "next", 3, "ask-2"),
      createMessage("assistant-2", "assistant", "done", 4, "ask-2"),
    ];
    const rows = createRows(messages);
    const messageIdToRowIndex = createMessageIdToRowIndex(rows);
    const scrollRef = { current: null };

    let currentTotalSize = 832;
    let currentVirtualItems = [
      { index: 0, key: "row-0", start: 16 },
      { index: 1, key: "row-1", start: 156 },
      { index: 2, key: "row-2", start: 416 },
      { index: 3, key: "row-3", start: 556 },
    ];

    const stableInstance = {
      getTotalSize: () => currentTotalSize,
      getVirtualItems: () => currentVirtualItems,
      measure: vi.fn(),
      measureElement: vi.fn(),
      scrollBy: vi.fn(),
      scrollOffset: 0,
      scrollToIndex: vi.fn(),
      scrollToOffset: vi.fn(),
      shouldAdjustScrollPositionOnItemSizeChange: undefined,
    };

    useVirtualizerMock.mockImplementation(() => {
      virtualizerInstanceRef.current = stableInstance;
      return stableInstance;
    });

    const { result, rerender } = renderHook(() => useChatAreaVirtualizer({
      lastMessageId: messages.at(-1)?.id ?? null,
      lastVisibleOutputSignature: visibleAssistantOutputSignature(messages.at(-1)),
      messageCount: messages.length,
      messageIdToRowIndex,
      rows,
      scrollRef,
      tailSig: tailSignature(messages),
      topicId: "topic-1",
    }));

    expect(result.current.totalSize).toBe(832);
    expect(result.current.virtualItems.map((item) => item.start)).toEqual([16, 156, 416, 556]);

    currentTotalSize = 324;
    currentVirtualItems = [
      { index: 0, key: "row-0", start: 16 },
      { index: 1, key: "row-1", start: 84 },
      { index: 2, key: "row-2", start: 168 },
      { index: 3, key: "row-3", start: 236 },
    ];

    rerender();

    expect(result.current.totalSize).toBe(324);
    expect(result.current.virtualItems.map((item) => item.start)).toEqual([16, 84, 168, 236]);
  });

  it("在 viewport 宽度变化时只触发一次整表重测", () => {
    const resizeObserverHarness = installResizeObserverHarness();
    const measure = vi.fn();

    useVirtualizerMock.mockImplementation(({ count, onChange }: { count: number; onChange?: (instance: unknown) => void }) => {
      const instance = {
        getTotalSize: () => count * 120,
        getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: `row-${index}`, start: index * 120 })),
        measure,
        measureElement: vi.fn(),
        onChange,
        scrollOffset: 0,
        scrollBy: vi.fn(),
        scrollToIndex: vi.fn(),
        scrollToOffset: vi.fn(),
        shouldAdjustScrollPositionOnItemSizeChange: undefined,
      };
      virtualizerInstanceRef.current = instance;
      return instance;
    });

    const controllerRef = { current: null as null | { scrollRef: MutableRefObject<HTMLDivElement | null>; state: ReturnType<typeof useChatAreaVirtualizer> } };
    const messages = [createMessage("assistant-1", "assistant", "long answer")];
    const rows = createRows(messages);
    const { getByTestId, unmount } = render(
      <VirtualizerHarness
        controllerRef={controllerRef}
        messages={messages}
        rows={rows}
        topicId={null}
      />,
    );

    const scrollRoot = getByTestId("chat-scroll-root");
    Object.defineProperty(scrollRoot, "clientHeight", {
      configurable: true,
      get: () => 480,
    });

    let currentWidth = 720;
    Object.defineProperty(scrollRoot, "clientWidth", {
      configurable: true,
      get: () => currentWidth,
    });
    Object.defineProperty(scrollRoot, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        width: currentWidth,
        height: 480,
        top: 0,
        left: 0,
        right: currentWidth,
        bottom: 480,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      }),
    });

    resizeObserverHarness.trigger(scrollRoot);
    measure.mockClear();

    currentWidth = 360;
    resizeObserverHarness.trigger(scrollRoot);

    expect(measure).toHaveBeenCalledTimes(1);

    unmount();
    resizeObserverHarness.restore();
  });

  it("前台恢复且 viewport 未变时只补测已挂载行，不清空整表测量缓存", () => {
    const raf = installAnimationFrameQueue();
    const resizeObserverHarness = installResizeObserverHarness();
    const measure = vi.fn();
    const measureElement = vi.fn();
    const scrollToIndex = vi.fn();
    const scrollToOffset = vi.fn();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    useVirtualizerMock.mockImplementation(({ count, onChange }: { count: number; onChange?: (instance: unknown) => void }) => {
      const instance = {
        getTotalSize: () => count * 120,
        getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: `row-${index}`, start: index * 120 })),
        measure,
        measureElement,
        onChange,
        scrollOffset: 0,
        scrollBy: vi.fn(),
        scrollToIndex,
        scrollToOffset,
        shouldAdjustScrollPositionOnItemSizeChange: undefined,
      };
      virtualizerInstanceRef.current = instance;
      return instance;
    });

    const controllerRef = { current: null as null | { scrollRef: MutableRefObject<HTMLDivElement | null>; state: ReturnType<typeof useChatAreaVirtualizer> } };
    const messages = [
      createMessage("user-1", "user", "hello", 1, "ask-1"),
      createMessage("assistant-1", "assistant", "long answer", 2, "ask-1"),
    ];
    const rows = createRows(messages);
    const { getByTestId, unmount } = render(
      <VirtualizerHarness
        controllerRef={controllerRef}
        messages={messages}
        rows={rows}
        topicId={null}
      />,
    );

    const scrollRoot = getByTestId("chat-scroll-root");
    Object.defineProperty(scrollRoot, "clientHeight", {
      configurable: true,
      get: () => 480,
    });
    Object.defineProperty(scrollRoot, "clientWidth", {
      configurable: true,
      get: () => 720,
    });
    Object.defineProperty(scrollRoot, "scrollHeight", {
      configurable: true,
      get: () => 1200,
    });
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => 720,
      set: () => undefined,
    });
    Object.defineProperty(scrollRoot, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        width: 720,
        height: 480,
        top: 0,
        left: 0,
        right: 720,
        bottom: 480,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      }),
    });

    resizeObserverHarness.trigger(scrollRoot);
    act(() => {
      raf.flushAll();
    });
    measure.mockClear();
    measureElement.mockClear();
    scrollToIndex.mockClear();
    scrollToOffset.mockClear();

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      raf.flushAll();
    });

    expect(measure).not.toHaveBeenCalled();
    expect(measureElement).toHaveBeenCalled();
    expect(scrollToIndex).not.toHaveBeenCalled();
    expect(scrollToOffset).not.toHaveBeenCalled();

    unmount();
    resizeObserverHarness.restore();
  });

  it("detached-reading 下 viewport 变化会用当前可见 row anchor 恢复阅读线", () => {
    const raf = installAnimationFrameQueue();
    const resizeObserverHarness = installResizeObserverHarness();
    const measure = vi.fn();
    const measureElement = vi.fn();
    const scrollBy = vi.fn();
    const scrollToIndex = vi.fn();
    const scrollToOffset = vi.fn();

    useVirtualizerMock.mockImplementation(({ count, onChange }: { count: number; onChange?: (instance: unknown) => void }) => {
      const instance = {
        getTotalSize: () => count * 180,
        getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: `row-${index}`, start: index * 180 })),
        measure,
        measureElement,
        onChange,
        scrollOffset: 240,
        scrollBy,
        scrollToIndex,
        scrollToOffset,
        shouldAdjustScrollPositionOnItemSizeChange: undefined,
      };
      virtualizerInstanceRef.current = instance;
      return instance;
    });

    const controllerRef = { current: null as null | { scrollRef: MutableRefObject<HTMLDivElement | null>; state: ReturnType<typeof useChatAreaVirtualizer> } };
    const messages = Array.from({ length: 6 }, (_, index) => createMessage(
      `assistant-${index + 1}`,
      "assistant",
      `reply-${index + 1}`,
      index + 1,
      `ask-${index + 1}`,
    ));
    const rows = createRows(messages);
    const { getByTestId, unmount } = render(
      <VirtualizerHarness
        controllerRef={controllerRef}
        messages={messages}
        rows={rows}
        topicId="topic-a"
      />,
    );

    const scrollRoot = getByTestId("chat-scroll-root");
    let currentWidth = 720;
    Object.defineProperty(scrollRoot, "clientHeight", {
      configurable: true,
      get: () => 480,
    });
    Object.defineProperty(scrollRoot, "clientWidth", {
      configurable: true,
      get: () => currentWidth,
    });
    Object.defineProperty(scrollRoot, "scrollHeight", {
      configurable: true,
      get: () => 2400,
    });
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => 240,
      set: () => undefined,
    });
    Object.defineProperty(scrollRoot, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        width: currentWidth,
        height: 480,
        top: 0,
        left: 0,
        right: currentWidth,
        bottom: 480,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      }),
    });

    Array.from(scrollRoot.querySelectorAll<HTMLElement>("[data-index]")).forEach((node, index) => {
      const top = index === 0 ? -180 : 80 + ((index - 1) * 160);
      Object.defineProperty(node, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          width: currentWidth,
          height: 120,
          top,
          left: 0,
          right: currentWidth,
          bottom: top + 120,
          x: 0,
          y: top,
          toJSON: () => undefined,
        }),
      });
    });

    resizeObserverHarness.trigger(scrollRoot);
    act(() => {
      raf.flushAll();
    });
    measure.mockClear();
    measureElement.mockClear();
    scrollBy.mockClear();
    scrollToIndex.mockClear();
    scrollToOffset.mockClear();

    act(() => {
      controllerRef.current?.state.handleWheelIntent(-16);
    });

    currentWidth = 560;
    resizeObserverHarness.trigger(scrollRoot);
    act(() => {
      raf.flushAll();
    });

    expect(measure).toHaveBeenCalledTimes(1);
    expect(scrollToIndex).toHaveBeenCalledWith(1, { align: "start" });
    expect(scrollToIndex).not.toHaveBeenCalledWith(rows.length - 1, { align: "end" });
    expect(scrollToOffset).not.toHaveBeenCalledWith(expect.any(Number), expect.objectContaining({ align: "end" }));

    unmount();
    resizeObserverHarness.restore();
  });

  it("通过 onChange 维护 visibleTopRowIndex，避免再从 DOM scroll 事件反推", async () => {
    let currentVirtualItems = [{ index: 0, key: "row-0", start: 0 }];
    const messages = [createMessage("assistant-1", "assistant", "hello")];
    const rows = createRows(messages);

    useVirtualizerMock.mockImplementation(({ count, onChange }: { count: number; onChange?: (instance: unknown) => void }) => {
      const instance = {
        getTotalSize: () => count * 120,
        getVirtualItems: () => currentVirtualItems,
        measure: vi.fn(),
        measureElement: vi.fn(),
        onChange,
        scrollOffset: 0,
        scrollBy: vi.fn(),
        scrollToIndex: vi.fn(),
        scrollToOffset: vi.fn(),
        shouldAdjustScrollPositionOnItemSizeChange: undefined,
      };
      virtualizerInstanceRef.current = instance;
      return instance;
    });

    const { result } = renderHook(() => useChatAreaVirtualizer({
      lastMessageId: messages.at(-1)?.id ?? null,
      lastVisibleOutputSignature: visibleAssistantOutputSignature(messages.at(-1)),
      messageCount: messages.length,
      messageIdToRowIndex: createMessageIdToRowIndex(rows),
      rows,
      scrollRef: { current: null },
      tailSig: tailSignature(messages),
      topicId: null,
    }));

    expect(result.current.visibleTopRowIndex).toBeNull();

    act(() => {
      currentVirtualItems = [{ index: 3, key: "row-3", start: 360 }];
      const instance = virtualizerInstanceRef.current as {
        onChange?: (payload: { getVirtualItems: () => typeof currentVirtualItems }) => void;
        getVirtualItems: () => typeof currentVirtualItems;
      };
      instance.onChange?.(instance);
    });

    await waitFor(() => {
      expect(result.current.visibleTopRowIndex).toBe(3);
    });
  });
});
