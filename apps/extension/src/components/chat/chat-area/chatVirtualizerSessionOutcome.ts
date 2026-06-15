/**
 * 说明：`chatVirtualizerSessionOutcome` 主聊天程序化滚动结算模块。
 *
 * 职责：
 * - 收口 programmatic command 结算后的 session 写回；
 * - 保持 `useChatAreaVirtualizer` 只负责装配回调，而不是继续内联 outcome 分支。
 *
 * 边界：
 * - 本文件只处理 session patch 与 viewport snapshot 捕获时机；
 * - 不直接访问 DOM、virtualizer 或 React state。
 */
import type { ChatProgrammaticCommandOutcome } from "./useChatAreaScrollOwner";
import type { ChatScrollSession } from "./chatScrollSession";

interface ApplyChatProgrammaticCommandOutcomeParams {
  readonly captureViewportSnapshotForMessageAnchor: (messageId: string) => boolean;
  readonly captureViewportSnapshot: () => void;
  readonly commitSession: (patch: Partial<ChatScrollSession>) => void;
  readonly outcome: ChatProgrammaticCommandOutcome;
}

/**
 * 把 programmatic command 的最终结算结果写回主聊天 session。
 *
 * @param params - 当前命令 outcome、session 提交能力与 viewport snapshot 捕获能力。
 */
export function applyChatProgrammaticCommandOutcome({
  captureViewportSnapshotForMessageAnchor,
  captureViewportSnapshot,
  commitSession,
  outcome,
}: ApplyChatProgrammaticCommandOutcomeParams) {
  if (outcome.settleTarget === "follow-bottom") {
    commitSession({
      followMode: "follow-bottom",
      viewportSnapshot: { kind: "bottom" },
    });
    return;
  }

  commitSession({ followMode: "detached-reading" });
  if (outcome.type === "message-anchor" && outcome.anchorMessageId) {
    if (captureViewportSnapshotForMessageAnchor(outcome.anchorMessageId)) return;
  }
  captureViewportSnapshot();
}
