/**
 * 说明：`chatScrollCommands` 主聊天滚动命令模块。
 *
 * 职责：
 * - 承担主聊天 viewport snapshot 捕获、可视区命中判断和统一 scroll command pipeline 的纯逻辑；
 * - 避免 `useChatAreaVirtualizer.ts` 同时承担 DOM 读取、命令执行和 React effect 编排三层职责。
 *
 * 边界：
 * - 本文件不持有 React state；
 * - 只消费由 `useChatAreaVirtualizer.ts` 注入的 refs、virtualizer 和调度函数。
 */
import type { MutableRefObject, RefObject } from "react";

import { cssEscape, type ChatRow } from "@/lib/chat/chat-utils";
import type { Virtualizer } from "@tanstack/react-virtual";
import {
  CHAT_TOP_THRESHOLD,
  SEARCH_SCROLL_BOTTOM_PADDING,
  SEARCH_SCROLL_TOP_PADDING,
  resolveChatViewportAnchor,
  type ChatScrollSession,
  type ChatViewportSnapshot,
  type ChatVirtualScrollAlign,
} from "./chatScrollSession";

/** 导出类型：主聊天允许的滚动命令。 */
export type ChatScrollCommand =
  | { readonly type: "top" }
  | { readonly type: "bottom" }
  | { readonly align: ChatVirtualScrollAlign; readonly messageId: string; readonly type: "message-anchor" }
  | { readonly snapshot: ChatViewportSnapshot; readonly type: "row-snapshot" }
  | { readonly range: Range; readonly type: "search-range" };

interface CaptureChatViewportSnapshotParams {
  readonly commitSession: (patch: Partial<ChatScrollSession>) => void;
  readonly readScrollPositionState: (element: HTMLDivElement) => {
    atTop: boolean;
    currentTop: number;
    distance: number;
    nearBottom: boolean;
    strictBottom: boolean;
  };
  readonly rowsLengthRef: MutableRefObject<number>;
  readonly rowsRef: MutableRefObject<ChatRow[]>;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly topicId: string | null;
}

interface ReadChatViewportSnapshotParams extends Omit<CaptureChatViewportSnapshotParams, "commitSession"> {
  readonly preferRowAnchor?: boolean;
}

/**
 * 读取当前聊天 viewport 的恢复快照。
 *
 * @param params - 当前 DOM、rows 与滚动位置读取能力。
 * @returns 当前 viewport 对应的恢复快照；DOM 不可用时返回 `null`。
 */
export function readChatViewportSnapshot({
  preferRowAnchor = false,
  readScrollPositionState,
  rowsLengthRef,
  rowsRef,
  scrollRef,
  topicId,
}: ReadChatViewportSnapshotParams): ChatViewportSnapshot | null {
  const element = scrollRef.current;
  if (!element) return null;

  const { atTop, strictBottom } = readScrollPositionState(element);
  if (!preferRowAnchor && strictBottom) {
    return { kind: "bottom" };
  }

  if (!preferRowAnchor && atTop) {
    return { kind: "top" };
  }

  const containerRect = element.getBoundingClientRect();
  const mountedRows = Array.from(element.querySelectorAll<HTMLElement>("[data-index]"))
    .map((node) => {
      const rawIndex = Number(node.dataset.index ?? "-1");
      if (!Number.isFinite(rawIndex) || rawIndex < 0 || rawIndex >= rowsLengthRef.current) return null;
      const rect = node.getBoundingClientRect();
      return {
        rect,
        rowIndex: rawIndex,
      };
    })
    .filter((item): item is { rect: DOMRect; rowIndex: number } => Boolean(item))
    .sort((left, right) => left.rowIndex - right.rowIndex);

  const anchorNode = mountedRows.find((item) => item.rect.bottom > containerRect.top + CHAT_TOP_THRESHOLD) ?? mountedRows[0];
  if (!anchorNode) return null;

  const anchor = resolveChatViewportAnchor(rowsRef.current[anchorNode.rowIndex], anchorNode.rowIndex, topicId);
  return {
    ...anchor,
    kind: "row-anchor",
    offset: Math.round(anchorNode.rect.top - containerRect.top),
  };
}

/**
 * 捕获当前聊天 viewport 的恢复快照并写回 session。
 *
 * @param params - 当前 DOM、rows 与 session 写入能力。
 * @returns 是否成功产出新的 viewport snapshot。
 */
export function captureChatViewportSnapshot({
  commitSession,
  readScrollPositionState,
  rowsLengthRef,
  rowsRef,
  scrollRef,
  topicId,
}: CaptureChatViewportSnapshotParams) {
  const snapshot = readChatViewportSnapshot({
    readScrollPositionState,
    rowsLengthRef,
    rowsRef,
    scrollRef,
    topicId,
  });
  if (!snapshot) return false;
  commitSession({ viewportSnapshot: snapshot });
  return true;
}

interface IsChatMessageVisibleInViewportParams {
  readonly messageId: string;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
}

/**
 * 判断某条消息是否已经位于当前可视区的稳定阅读范围内。
 *
 * @param params - 消息 ID 与滚动容器。
 * @returns 命中的消息是否已经处于可视区内。
 */
export function isChatMessageVisibleInViewport({ messageId, scrollRef }: IsChatMessageVisibleInViewportParams) {
  const element = scrollRef.current;
  if (!element) return false;

  const node = element.querySelector<HTMLElement>(`[data-msg-id="${cssEscape(messageId)}"]`);
  if (!node) return false;

  const rect = node.getBoundingClientRect();
  const containerRect = element.getBoundingClientRect();
  return (
    rect.top >= containerRect.top + SEARCH_SCROLL_TOP_PADDING
    && rect.bottom <= containerRect.bottom - SEARCH_SCROLL_BOTTOM_PADDING
  );
}

interface RunChatScrollCommandParams {
  readonly claimProgrammaticCommandAttempt: (token: number, options?: { dataRevision?: number | null }) => number | null;
  readonly command: ChatScrollCommand;
  readonly dataRevision: number | null;
  readonly getScrollBottomSlack?: () => number;
  readonly isProgrammaticCommandAttemptActive: (token: number, attempt: number) => boolean;
  readonly markProgrammaticCommandReady: (token: number, attempt: number) => boolean;
  readonly measureMountedRows: () => void;
  readonly messageIdToRowIndex: Map<string, number>;
  readonly programmaticCommandToken: number;
  readonly readScrollPositionState: (element: HTMLDivElement) => {
    atTop: boolean;
    currentTop: number;
    distance: number;
    nearBottom: boolean;
    strictBottom: boolean;
  };
  readonly resolveRestoreRowIndex: (snapshot: ChatViewportSnapshot) => number | null;
  readonly rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  readonly rowsLengthRef: MutableRefObject<number>;
  readonly scheduleProgrammaticModeSettle: (token?: number, attempt?: number) => void;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
}

/**
 * 直接执行一条主聊天滚动命令。
 *
 * @param params - 当前命令及其执行依赖。
 * @returns 命令是否真的执行了程序化滚动。
 */
export function runChatScrollCommand({
  claimProgrammaticCommandAttempt,
  command,
  dataRevision,
  getScrollBottomSlack,
  isProgrammaticCommandAttemptActive,
  markProgrammaticCommandReady,
  measureMountedRows,
  messageIdToRowIndex,
  programmaticCommandToken,
  readScrollPositionState,
  resolveRestoreRowIndex,
  rowVirtualizer,
  rowsLengthRef,
  scheduleProgrammaticModeSettle,
  scrollRef,
}: RunChatScrollCommandParams) {
  /**
   * 让动态高度聊天列表的“到底部”命令至少经历两轮“滚动、测量、再滚动”。
   *
   * 说明：
   * - TanStack Virtual 在长历史 + 动态高度场景下，第一次 `scrollToIndex(last, end)` 经常只会把尾部附近的行挂载出来；
   * - 新挂载尾部行真实高度回灌后，总高度和最后一行的起点会继续变化，单次到底部命令很容易停在“接近底部但还没到底”；
   * - 这里把 `bottom` 收口成一次 command session 内的多帧执行，而不是让调用方额外叠第二套补偿或 DOM 直写。
   */
  const runBottomCommand = () => {
    const attempt = claimProgrammaticCommandAttempt(programmaticCommandToken, { dataRevision });
    if (attempt == null) return "failed" as const;
    const MAX_BOTTOM_SYNC_PASSES = 40;
    const REQUIRED_STABLE_BOTTOM_PASSES = 12;

    /**
     * 内部函数变量：`scrollLatestBottom`。
     *
     * @remarks
     * 同一条 bottom command 内会复用多次“滚到当前真实尾部”的动作；
     * 这里集中封装，避免首轮挂载和补测后的第二轮滚动再次散落出新的分支逻辑。
     */
    const scrollLatestBottom = () => {
      const lastRowIndex = rowsLengthRef.current - 1;
      if (lastRowIndex < 0) return false;

      rowVirtualizer.scrollToIndex(lastRowIndex, { align: "end" });
      return true;
    };

    /**
     * 当最后一行已经挂载出来时，优先按真实 DOMRect 把它贴到容器底部。
     *
     * 说明：
     * - `scrollHeight` 只反映当前 total size 估算，动态高度回灌前可能仍偏小；
     * - 但只要最后一行已经进入 overscan，`DOMRect` 就是当前最接近真实列表底部的位置；
     * - 底部命令应优先围绕“最后一行真实几何”收敛，而不是继续被估算高度牵着走。
     */
    const alignMountedLastRowToBottom = () => {
      const element = scrollRef.current;
      if (!element) return false;
      const lastRowIndex = rowsLengthRef.current - 1;
      if (lastRowIndex < 0) return false;

      const lastRowNode = element.querySelector<HTMLElement>(`[data-index="${lastRowIndex}"]`);
      if (!lastRowNode) return false;

      const containerRect = element.getBoundingClientRect();
      const lastRowRect = lastRowNode.getBoundingClientRect();
      const delta = Math.round(lastRowRect.bottom - containerRect.bottom);
      if (delta > 1) {
        rowVirtualizer.scrollBy(delta, { behavior: "auto" });
      }
      return true;
    };

    /**
     * TanStack 在动态高度补测的同一时序里，内部 max offset 可能短暂落后于真实 DOM scrollHeight。
     *
     * 说明：
     * - 这时只靠 `scrollToIndex(last, end)`，列表会先到底，再被后续测量顶离真实底部；
     * - 主聊天滚动真实 owner 仍然只能是 virtualizer facade，所以这里把“按真实底部 offset 再同步一次”也继续走 `scrollToOffset`；
     * - 这样底部命令仍然只有一条滚动写入路径，不会在 helper 里重新长出 DOM 直写滚动。
     */
    const syncVirtualizerBottomOffset = () => {
      const element = scrollRef.current;
      if (!element) return null;
      const bottomSlack = Math.max(0, getScrollBottomSlack?.() ?? 0);
      const bottomOffset = Math.max(0, element.scrollHeight - element.clientHeight - bottomSlack);
      const maybeScrollToOffset = rowVirtualizer as unknown as {
        scrollToOffset?: (offset: number, options?: { align?: ChatVirtualScrollAlign; behavior?: ScrollBehavior }) => void;
      };
      if (typeof maybeScrollToOffset.scrollToOffset === "function") {
        maybeScrollToOffset.scrollToOffset(bottomOffset, { align: "start", behavior: "auto" });
      } else {
        rowVirtualizer.scrollBy(bottomOffset - element.scrollTop, { behavior: "auto" });
      }
      return {
        distance: Math.abs(bottomOffset - element.scrollTop),
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
      };
    };

    if (!scrollLatestBottom()) return "noop" as const;

    /**
     * 递归执行同一条 bottom command 的多帧收敛过程，直到真实底部稳定。
     *
     * @remarks
     * 这里只允许复用当前 command session；旧 attempt 一旦失效，后续 rAF 不得继续写入滚动。
     */
    const runBottomSyncPass = (
      remainingPasses: number,
      previousGeometry?: { scrollHeight: number; scrollTop: number } | null,
      stableBottomPassCount = 0,
    ) => {
      requestAnimationFrame(() => {
        if (!isProgrammaticCommandAttemptActive(programmaticCommandToken, attempt)) return;
        measureMountedRows();
        scrollLatestBottom();
        alignMountedLastRowToBottom();
        const geometry = syncVirtualizerBottomOffset();
        if (!geometry) return;
        const element = scrollRef.current;
        if (!element) return;
        const { strictBottom } = readScrollPositionState(element);
        const lastRowNode = element.querySelector<HTMLElement>(`[data-index="${Math.max(0, rowsLengthRef.current - 1)}"]`);
        const containerRect = element.getBoundingClientRect();
        const lastRowRect = lastRowNode?.getBoundingClientRect() ?? null;
        const isLastRowVisible = Boolean(
          lastRowRect
          && lastRowRect.bottom > containerRect.top
          && lastRowRect.top < containerRect.bottom
        );
        const previousScrollHeight = previousGeometry?.scrollHeight ?? null;
        const previousScrollTop = previousGeometry?.scrollTop ?? null;
        const currentScrollHeight = geometry.scrollHeight;
        const currentScrollTop = geometry.scrollTop;
        const sameGeometry = Boolean(
          previousGeometry
          && previousScrollHeight === currentScrollHeight
          && previousScrollTop === currentScrollTop
        );
        const nextStableBottomPassCount = strictBottom && isLastRowVisible
          ? (sameGeometry ? stableBottomPassCount + 1 : 1)
          : 0;
        if (remainingPasses <= 0 || nextStableBottomPassCount >= REQUIRED_STABLE_BOTTOM_PASSES) {
          markProgrammaticCommandReady(programmaticCommandToken, attempt);
          scheduleProgrammaticModeSettle(programmaticCommandToken, attempt);
          return;
        }
        runBottomSyncPass(
          remainingPasses - 1,
          {
            scrollHeight: currentScrollHeight,
            scrollTop: currentScrollTop,
          },
          nextStableBottomPassCount,
        );
      });
    };

    runBottomSyncPass(MAX_BOTTOM_SYNC_PASSES, null, 0);

    return "executed" as const;
  };

  if (command.type === "bottom") {
    return runBottomCommand();
  }

  if (command.type === "top") {
    const attempt = claimProgrammaticCommandAttempt(programmaticCommandToken);
    if (attempt == null) return "failed";
    const maybeScrollToOffset = rowVirtualizer as unknown as {
      scrollToOffset?: (offset: number, options?: { align?: ChatVirtualScrollAlign; behavior?: ScrollBehavior }) => void;
    };
    if (typeof maybeScrollToOffset.scrollToOffset === "function") {
      maybeScrollToOffset.scrollToOffset(0, { align: "start", behavior: "auto" });
    } else if (rowsLengthRef.current > 0) {
      rowVirtualizer.scrollToIndex(0, { align: "start" });
    } else {
      return "noop";
    }
    markProgrammaticCommandReady(programmaticCommandToken, attempt);
    scheduleProgrammaticModeSettle(programmaticCommandToken, attempt);
    return "executed";
  }

  if (command.type === "message-anchor") {
    const rowIndex = messageIdToRowIndex.get(command.messageId);
    if (typeof rowIndex !== "number") return "failed";
    const attempt = claimProgrammaticCommandAttempt(programmaticCommandToken);
    if (attempt == null) return "failed";

    /**
     * 动态高度消息锚点跳转需要经历“滚动、补测、再滚动、最后按真实 DOM 对齐”的完整闭环。
     *
     * 说明：
     * - 单次 `scrollToIndex(row, start)` 在动态高度消息上只依赖当前缓存/估高；
     * - 当前序 assistant 长回答还没被重新测量时，目标 ask 会停在很远的地方，看起来像按钮没反应；
     * - 这里把 ask 锚点跳转也收口到同一条 command pipeline 内解决，不在外层再叠第二套补偿。
     */
    const scrollLatestAnchor = () => {
      rowVirtualizer.scrollToIndex(rowIndex, { align: command.align });
    };

    /**
     * 在动态高度补测结束后，再按真实 DOM 几何把 ask 锚点对齐到目标阅读线。
     *
     * @remarks
     * `scrollToIndex()` 只保证目标行被带到附近；最终 ask 文本是否真的贴到 `start / center / end`
     * 仍要基于当前挂载节点的真实 `DOMRect` 做最后一跳。
     */
    const alignMountedMessageNode = () => {
      const element = scrollRef.current;
      if (!element) return;
      const targetNode = element.querySelector<HTMLElement>(`[data-msg-id="${cssEscape(command.messageId)}"]`);
      if (!targetNode) return;

      const containerRect = element.getBoundingClientRect();
      const targetRect = targetNode.getBoundingClientRect();

      let desiredTop = containerRect.top + SEARCH_SCROLL_TOP_PADDING;
      if (command.align === "center") {
        desiredTop = containerRect.top + (containerRect.height - targetRect.height) / 2;
      } else if (command.align === "end") {
        desiredTop = containerRect.bottom - SEARCH_SCROLL_BOTTOM_PADDING - targetRect.height;
      }

      const delta = Math.round(targetRect.top - desiredTop);
      if (Math.abs(delta) > 1) {
        const maybeScrollToOffset = rowVirtualizer as unknown as {
          scrollToOffset?: (offset: number, options?: { align?: ChatVirtualScrollAlign; behavior?: ScrollBehavior }) => void;
        };
        if (typeof maybeScrollToOffset.scrollToOffset === "function") {
          maybeScrollToOffset.scrollToOffset(element.scrollTop + delta, { align: "start", behavior: "auto" });
        } else {
          rowVirtualizer.scrollBy(delta, { behavior: "auto" });
        }
      }
    };

    scrollLatestAnchor();
    requestAnimationFrame(() => {
      if (!isProgrammaticCommandAttemptActive(programmaticCommandToken, attempt)) return;
      measureMountedRows();
      scrollLatestAnchor();
      requestAnimationFrame(() => {
        if (!isProgrammaticCommandAttemptActive(programmaticCommandToken, attempt)) return;
        measureMountedRows();
        alignMountedMessageNode();
        markProgrammaticCommandReady(programmaticCommandToken, attempt);
        scheduleProgrammaticModeSettle(programmaticCommandToken, attempt);
      });
    });
    return "executed";
  }

  if (command.type === "search-range") {
    const element = scrollRef.current;
    if (!element) return "failed";

    const rect = command.range.getBoundingClientRect();
    const containerRect = element.getBoundingClientRect();
    let delta = 0;

    if (rect.top < containerRect.top + SEARCH_SCROLL_TOP_PADDING) {
      delta = rect.top - (containerRect.top + SEARCH_SCROLL_TOP_PADDING);
    } else if (rect.bottom > containerRect.bottom - SEARCH_SCROLL_BOTTOM_PADDING) {
      delta = rect.bottom - (containerRect.bottom - SEARCH_SCROLL_BOTTOM_PADDING);
    }

    if (delta === 0) return "noop";

    const attempt = claimProgrammaticCommandAttempt(programmaticCommandToken);
    if (attempt == null) return "failed";
    rowVirtualizer.scrollBy(delta, { behavior: "auto" });
    markProgrammaticCommandReady(programmaticCommandToken, attempt);
    scheduleProgrammaticModeSettle(programmaticCommandToken, attempt);
    return "executed";
  }

  if (command.snapshot.kind === "bottom") {
    return runBottomCommand();
  }

  if (command.snapshot.kind === "top") {
    const attempt = claimProgrammaticCommandAttempt(programmaticCommandToken);
    if (attempt == null) return "failed";
    const maybeScrollToOffset = rowVirtualizer as unknown as {
      scrollToOffset?: (offset: number, options?: { align?: ChatVirtualScrollAlign; behavior?: ScrollBehavior }) => void;
    };
    if (typeof maybeScrollToOffset.scrollToOffset === "function") {
      maybeScrollToOffset.scrollToOffset(0, { align: "start", behavior: "auto" });
    } else if (rowsLengthRef.current > 0) {
      rowVirtualizer.scrollToIndex(0, { align: "start" });
    } else {
      return "noop";
    }
    markProgrammaticCommandReady(programmaticCommandToken, attempt);
    scheduleProgrammaticModeSettle(programmaticCommandToken, attempt);
    return "executed";
  }

  const restoreRowIndex = resolveRestoreRowIndex(command.snapshot);
  if (restoreRowIndex == null) {
    const attempt = claimProgrammaticCommandAttempt(programmaticCommandToken);
    if (attempt == null) return "failed";
    const fallbackIndex = Math.max(0, Math.min(rowsLengthRef.current - 1, command.snapshot.rowIndex ?? 0));
    rowVirtualizer.scrollToIndex(fallbackIndex, { align: "start" });
    markProgrammaticCommandReady(programmaticCommandToken, attempt);
    scheduleProgrammaticModeSettle(programmaticCommandToken, attempt);
    return "executed";
  }

  const attempt = claimProgrammaticCommandAttempt(programmaticCommandToken);
  if (attempt == null) return "failed";
  const restoreSnapshot = command.snapshot;
  rowVirtualizer.scrollToIndex(restoreRowIndex, { align: "start" });
  requestAnimationFrame(() => {
    const element = scrollRef.current;
    if (!element) return;
    measureMountedRows();
    const anchorNode = element.querySelector<HTMLElement>(`[data-index="${restoreRowIndex}"]`);
    if (!anchorNode) {
      markProgrammaticCommandReady(programmaticCommandToken, attempt);
      scheduleProgrammaticModeSettle(programmaticCommandToken, attempt);
      return;
    }

    const containerRect = element.getBoundingClientRect();
    const anchorRect = anchorNode.getBoundingClientRect();
    const delta = Math.round(anchorRect.top - containerRect.top - restoreSnapshot.offset);
    if (Math.abs(delta) > 1) {
      rowVirtualizer.scrollBy(delta, { behavior: "auto" });
    }
    markProgrammaticCommandReady(programmaticCommandToken, attempt);
    scheduleProgrammaticModeSettle(programmaticCommandToken, attempt);
  });
  return "executed";
}
