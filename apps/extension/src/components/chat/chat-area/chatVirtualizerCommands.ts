/**
 * 说明：`chatVirtualizerCommands` 主聊天命令门面模块。
 *
 * 职责：
 * - 收口主聊天对外暴露的滚动命令 API；
 * - 把“怎么滚”集中在一层，避免 `useChatAreaVirtualizer.ts` 继续膨胀成命令拼装中心。
 *
 * 边界：
 * - 本文件不读写 React state；
 * - 只通过传入的 virtualizer、refs 与 command 管线执行滚动。
 */
import { useCallback, type MutableRefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";

import type { ChatRow } from "@/lib/chat/chat-utils";
import type { ChatScrollCommand } from "./chatScrollCommands";
import type { ChatProgrammaticCommandType, ChatProgrammaticSettleTarget } from "./useChatAreaScrollOwner";
import type { ChatVirtualScrollAlign } from "./chatScrollSession";

interface UseChatVirtualizerCommandsParams {
  readonly beginProgrammaticCommand: (
    type: ChatProgrammaticCommandType,
    settleTarget: ChatProgrammaticSettleTarget,
    options?: { anchorMessageId?: string | null; minimumDataRevision?: number | null },
  ) => { readonly token: number };
  readonly claimProgrammaticCommandAttempt: (token: number, options?: { dataRevision?: number | null }) => number | null;
  readonly issueScrollCommand: (command: ChatScrollCommand, options?: { cancelStartupRestore?: boolean; defer?: "microtask" | "raf"; minimumDataRevision?: number | null }) => boolean;
  readonly isMessageVisibleInViewport: (messageId: string) => boolean;
  readonly getNextBottomCommandRevision: () => number;
  readonly hasFollowBottomIntent: () => boolean;
  readonly markProgrammaticCommandReady: (token: number, attempt: number) => boolean;
  readonly messageIdToRowIndex: Map<string, number>;
  readonly rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  readonly rowsLengthRef: MutableRefObject<number>;
  readonly rowsRef: MutableRefObject<ChatRow[]>;
  readonly scheduleProgrammaticModeSettle: (token?: number, attempt?: number) => void;
  readonly scheduleScrollCommand: (run: () => void, defer?: "microtask" | "raf") => void;
}

/**
 * 导出 Hook：`useChatVirtualizerCommands`。
 *
 * @remarks
 * 把主聊天对外命令统一收束为一组稳定 API，供布局层和 controller 层消费。
 */
export function useChatVirtualizerCommands({
  beginProgrammaticCommand,
  claimProgrammaticCommandAttempt,
  getNextBottomCommandRevision,
  hasFollowBottomIntent,
  issueScrollCommand,
  isMessageVisibleInViewport,
  markProgrammaticCommandReady,
  messageIdToRowIndex,
  rowVirtualizer,
  rowsLengthRef,
  rowsRef,
  scheduleProgrammaticModeSettle,
  scheduleScrollCommand,
}: UseChatVirtualizerCommandsParams) {
  /**
   * 把主聊天滚动到最底部。
   *
   * @remarks
   * 这里只发统一 bottom command，不再由外层直接写 DOM `scrollTop`。
   */
  const scrollToBottom = useCallback((defer?: "microtask" | "raf") => {
    if (rowsLengthRef.current > 0) issueScrollCommand({ type: "bottom" }, { defer });
  }, [issueScrollCommand, rowsLengthRef]);

  /**
   * 仅在当前已经处于跟随底部时，才继续把列表滚到最新位置。
   *
   * @remarks
   * 这给“流式继续跟随”用，不适合拿来替代显式的 anchor jump。
   * 已结算的 `follow-bottom` 和尚未结算但目标是 `follow-bottom` 的 programmatic bottom command，
   * 都属于同一份“继续跟随最新”的命令意图。
   */
  const scrollToBottomIfFollowing = useCallback((defer?: "microtask" | "raf") => (
    rowsLengthRef.current > 0
    && hasFollowBottomIntent()
    && issueScrollCommand({ type: "bottom" }, { defer })
  ), [hasFollowBottomIntent, issueScrollCommand, rowsLengthRef]);

  /**
   * 把“下一次新增数据后”要执行的底部滚动先挂到 command session 上。
   *
   * @remarks
   * 这给发送完成后、终态消息回填前后的流式跟随使用，避免旧快照提前结算。
   */
  const scrollToBottomAfterNextCommit = useCallback((defer?: "microtask" | "raf") => {
    if (rowsLengthRef.current > 0) issueScrollCommand({ type: "bottom" }, {
      defer,
      minimumDataRevision: getNextBottomCommandRevision(),
    });
  }, [getNextBottomCommandRevision, issueScrollCommand, rowsLengthRef]);

  /**
   * 仅在当前仍有贴底跟随意图时，预约下一次数据提交后的底部滚动。
   *
   * @remarks
   * 历史消息重发会先改写原位置的 assistant 占位；用户正在上方阅读时不能因此抢回底部。
   */
  const scrollToBottomAfterNextCommitIfFollowing = useCallback((defer?: "microtask" | "raf") => (
    rowsLengthRef.current > 0
    && hasFollowBottomIntent()
    && issueScrollCommand({ type: "bottom" }, {
      defer,
      minimumDataRevision: getNextBottomCommandRevision(),
    })
  ), [getNextBottomCommandRevision, hasFollowBottomIntent, issueScrollCommand, rowsLengthRef]);

  /**
   * 把主聊天滚到顶部。
   *
   * @remarks
   * 这里只发统一 top command，不再由外层直接写 DOM `scrollTop = 0`。
   */
  const scrollToTop = useCallback((defer?: "microtask" | "raf") => {
    if (rowsLengthRef.current > 0) issueScrollCommand({ type: "top" }, { defer });
  }, [issueScrollCommand, rowsLengthRef]);

  /**
   * 将某个虚拟行滚到指定对齐位置。
   *
   * @remarks
   * 这是仅给内部调试/低层恢复使用的行级入口，命中 ask 锚点的业务语义仍应优先走 `jumpToMessageAnchor()`。
   */
  const scrollToRowIndex = useCallback((rowIndex: number, align: ChatVirtualScrollAlign = "auto") => {
    if (!Number.isFinite(rowIndex) || rowIndex < 0 || rowIndex >= rowsLengthRef.current) return false;
    const row = rowsRef.current[rowIndex];
    const messageId = row?.kind === "group" ? row.user.id : row?.kind === "message" || row?.kind === "divider" ? row.message.id : "";
    if (messageId) {
      return issueScrollCommand({ align, messageId, type: "message-anchor" }, { defer: "raf" });
    }
    const session = beginProgrammaticCommand("message-anchor", "detached-reading");
    scheduleScrollCommand(() => {
      const attempt = claimProgrammaticCommandAttempt(session.token);
      if (attempt == null) return;
      rowVirtualizer.scrollToIndex(rowIndex, { align });
      markProgrammaticCommandReady(session.token, attempt);
      scheduleProgrammaticModeSettle(session.token, attempt);
    }, "raf");
    return true;
  }, [
    beginProgrammaticCommand,
    claimProgrammaticCommandAttempt,
    issueScrollCommand,
    markProgrammaticCommandReady,
    rowVirtualizer,
    rowsLengthRef,
    rowsRef,
    scheduleProgrammaticModeSettle,
    scheduleScrollCommand,
  ]);

  /**
   * 显式消息跳转必须按 ask/message 锚点重新落位。
   *
   * @remarks
   * 这条语义给“上一问 / 下一问 / flow / 外部 scrollToMessage”使用。
   */
  const jumpToMessageAnchor = useCallback((messageId: string, align: ChatVirtualScrollAlign = "start") => {
    const normalizedMessageId = String(messageId || "").trim();
    if (!normalizedMessageId) return false;
    if (!messageIdToRowIndex.has(normalizedMessageId)) return false;
    return issueScrollCommand({
      align,
      messageId: normalizedMessageId,
      type: "message-anchor",
    }, { defer: "raf" });
  }, [issueScrollCommand, messageIdToRowIndex]);

  /**
   * 先判断目标消息是否已经处于可视区，再决定是否需要发起问答锚点跳转。
   *
   * @remarks
   * 这个入口只给搜索 ensure-visible 使用；已可见时允许 no-op。
   */
  const scrollToMessageRow = useCallback((messageId: string, align: ChatVirtualScrollAlign = "start") => {
    const normalizedMessageId = String(messageId || "").trim();
    if (!normalizedMessageId) return false;
    if (isMessageVisibleInViewport(normalizedMessageId)) return true;
    return jumpToMessageAnchor(normalizedMessageId, align);
  }, [isMessageVisibleInViewport, jumpToMessageAnchor]);

  /**
   * 将搜索命中的 Range 微调到当前可视区。
   *
   * @remarks
   * 搜索链路是“先命中消息，再微调 range”；这里只保留搜索专用语义，不混入问答导航。
   */
  const scrollRangeIntoView = useCallback((range: Range) => (
    issueScrollCommand({ range, type: "search-range" })
  ), [issueScrollCommand]);

  return {
    jumpToMessageAnchor,
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
