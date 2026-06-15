/**
 * 说明：`chatVirtualizerSizing` 主聊天虚拟行尺寸策略模块。
 *
 * 职责：
 * - 收口主聊天虚拟列表的估高策略与尺寸变化滚动修正规则；
 * - 保持 `useChatAreaVirtualizer` 只负责装配，而不是继续内联纯规则判断。
 *
 * 边界：
 * - 本文件不依赖 React hook；
 * - 不直接读写 DOM、session 或 TanStack Virtual 实例。
 */
import type { VirtualItem } from "@tanstack/react-virtual";

import type { ChatRow } from "@/lib/chat/chat-utils";
import type { ChatFollowMode } from "./useChatAreaScrollOwner";

/** detached-reading 时，位于视口顶部附近的行不允许触发滚动修正。 */
export const CHAT_DETACHED_READING_TOP_GUARD_PX = 24;

/**
 * 估算单条聊天虚拟行的保守高度。
 *
 * 说明：
 * - 动态高度虚拟列表应优先“估高而不是估低”，避免首轮把后续行过早压上来；
 * - assistant 和 group 行内容最不稳定，因此给更保守的初值；
 * - 真正高度仍以 `measureElement` 的实时测量为准。
 */
export function estimateChatRowSize(row: ChatRow | undefined) {
  if (!row) return 140;
  if (row.kind === "divider") return 72;
  if (row.kind === "loading") return 92;
  if (row.kind === "group") return 420;
  if (row.message.role === "assistant") return 260;
  return 140;
}

/**
 * 决定虚拟列表是否应该因为测量到的尺寸变化主动修正 `scrollTop`。
 *
 * 说明：
 * - 贴底时允许尾部行继续跟随，避免流式回复把底部留出空洞；
 * - 用户开始上翻阅读后，只允许“完全位于当前视口上方”的已测行做锚点保持；
 * - 当前视口内、视口后方和尾部行的尺寸变化都不再允许反向拖动用户的阅读位置。
 */
export function shouldAdjustChatScrollPositionOnItemSizeChange(
  item: VirtualItem,
  scrollMode: ChatFollowMode,
  rowsLength: number,
  scrollOffset: number | null,
  options?: {
    readonly detachedReadingAnchorRowIndex?: number | null;
    readonly detachedReadingTopGuardPx?: number;
  },
) {
  const resolvedScrollOffset = scrollOffset ?? 0;
  const itemEnd = item.end ?? (item.start + item.size);
  const isTrailingRow = item.index >= Math.max(0, rowsLength - 2);
  if (scrollMode === "follow-bottom") {
    /**
     * 主聊天贴底时，尾部活跃段至少包含“真实尾消息 + 可选 loading row”两行。
     *
     * 说明：
     * - 流式生成期间最后一行常常只是 loading stub，真正持续增高的是倒数第二行 assistant/group；
     * - 如果这里只把“最后一行”当作 tail，点击底部 banner 后 loading row 能跟随，真实回复行却会把用户重新顶离底部；
     * - 因此 follow-bottom 的尺寸修正必须覆盖尾部活跃段，而不是狭义的最后一行。
     */
    return isTrailingRow;
  }

  if (isTrailingRow) return false;
  const anchorRowIndex = options?.detachedReadingAnchorRowIndex ?? null;
  if (typeof anchorRowIndex !== "number") return false;
  if (item.index >= anchorRowIndex) return false;

  const topGuardPx = Math.max(0, Math.floor(options?.detachedReadingTopGuardPx ?? CHAT_DETACHED_READING_TOP_GUARD_PX));
  return itemEnd <= (resolvedScrollOffset - topGuardPx);
}
