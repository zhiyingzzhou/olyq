/**
 * 说明：`chatVirtualizerRowVirtualizer` 主聊天行虚拟化装配模块。
 *
 * 职责：
 * - 集中创建 TanStack Virtual 行实例；
 * - 绑定主聊天动态高度修正策略与顶部可见行索引回调；
 * - 让 `useChatAreaVirtualizer.ts` 保持滚动 owner 门面，而不是继续承载底层 virtualizer options。
 *
 * 边界：
 * - 本文件不写 read marker、不管理 topic session，也不发滚动命令；
 * - 它只负责行虚拟化实例本身的配置。
 */
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";

import type { ChatRow } from "@/lib/chat/chat-utils";
import {
  CHAT_SCROLL_CONTENT_PADDING,
  SEARCH_SCROLL_BOTTOM_PADDING,
  SEARCH_SCROLL_TOP_PADDING,
  getChatRowKey,
} from "./chatScrollSession";
import {
  CHAT_DETACHED_READING_TOP_GUARD_PX,
  estimateChatRowSize,
  shouldAdjustChatScrollPositionOnItemSizeChange,
} from "./chatVirtualizerSizing";
import type {
  ChatFollowMode,
  ChatProgrammaticCommandSession,
  ChatScrollMode,
} from "./useChatAreaScrollOwner";

interface UseChatVirtualizerRowVirtualizerParams {
  readonly activeProgrammaticCommandRef: MutableRefObject<ChatProgrammaticCommandSession | null>;
  readonly detachedReadingAnchorRowIndexRef: MutableRefObject<number | null>;
  readonly getScrollElement: () => HTMLDivElement | null;
  readonly rows: ChatRow[];
  readonly rowsLengthRef: MutableRefObject<number>;
  readonly scrollModeRef: MutableRefObject<ChatScrollMode>;
  readonly scrollToFn: (offset: number, options: { adjustments?: number; behavior?: ScrollBehavior }, instance: unknown) => void;
  readonly onVirtualizerChange?: () => void;
  readonly setVisibleTopRowIndex: Dispatch<SetStateAction<number | null>>;
  readonly topicId: string | null;
}

/**
 * 导出 Hook：`useChatVirtualizerRowVirtualizer`。
 *
 * @param params - 当前 rows、滚动 owner refs 与可见行索引 setter。
 * @returns 配置好的 TanStack Virtual 行实例。
 */
export function useChatVirtualizerRowVirtualizer({
  activeProgrammaticCommandRef,
  detachedReadingAnchorRowIndexRef,
  getScrollElement,
  rows,
  rowsLengthRef,
  scrollModeRef,
  scrollToFn,
  onVirtualizerChange,
  setVisibleTopRowIndex,
  topicId,
}: UseChatVirtualizerRowVirtualizerParams) {
  const shouldAdjustScrollPositionOnItemSizeChange = useCallback((
    item: VirtualItem,
    _delta: number,
    instance: { scrollOffset: number | null },
  ) => {
    const activeCommand = activeProgrammaticCommandRef.current;
    const effectiveScrollMode: ChatFollowMode = (
      scrollModeRef.current === "follow-bottom"
      || activeCommand?.settleTarget === "follow-bottom"
    )
      ? "follow-bottom"
      : "detached-reading";
    return shouldAdjustChatScrollPositionOnItemSizeChange(
      item,
      effectiveScrollMode,
      rowsLengthRef.current,
      instance.scrollOffset,
      {
        detachedReadingAnchorRowIndex: detachedReadingAnchorRowIndexRef.current,
        detachedReadingTopGuardPx: CHAT_DETACHED_READING_TOP_GUARD_PX,
      },
    );
  }, [activeProgrammaticCommandRef, detachedReadingAnchorRowIndexRef, rowsLengthRef, scrollModeRef]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: (index) => estimateChatRowSize(rows[index]),
    getItemKey: (index) => getChatRowKey(rows[index], index, topicId),
    getScrollElement,
    onChange: (instance) => {
      const nextTopRowIndex = instance.getVirtualItems()[0]?.index ?? null;
      setVisibleTopRowIndex((current) => (current === nextTopRowIndex ? current : nextTopRowIndex));
      onVirtualizerChange?.();
    },
    overscan: 10,
    paddingEnd: CHAT_SCROLL_CONTENT_PADDING,
    paddingStart: CHAT_SCROLL_CONTENT_PADDING,
    scrollPaddingEnd: SEARCH_SCROLL_BOTTOM_PADDING,
    scrollPaddingStart: SEARCH_SCROLL_TOP_PADDING,
    scrollToFn,
  });

  rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = shouldAdjustScrollPositionOnItemSizeChange;
  return rowVirtualizer;
}
