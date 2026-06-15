/**
 * 说明：`assistant-message-visual-state` 组件模块。
 *
 * 职责：
 * - 承载 assistant 消息可视状态判定，统一 preparing / replacement pending 语义；
 * - 对外暴露 `getAssistantMessageVisualState`、`hasRetainedAssistantOutput` 等能力，供消息气泡与分组卡片复用；
 *
 * 边界：
 * - 本文件只处理 assistant 消息的视图态派生，不介入持久化 schema 或动作编排。
 */
import type { Message } from '@/types/chat';
import { getMessageReasoningText, hasMessageToolCalls } from '@/lib/chat/message-trace';

/** assistant 可视状态。 */
export interface AssistantMessageVisualState {
  hasRetainedOutput: boolean;
  isBusyAssistant: boolean;
  isPreparingReply: boolean;
  isReplacementPending: boolean;
  shouldUseFullWidthLane: boolean;
}

/** 判定 assistant 是否仍保留上一版可见输出。 */
export function hasRetainedAssistantOutput(message: Message): boolean {
  return Boolean(String(message.content || '').trim())
    || Boolean(getMessageReasoningText(message).trim())
    || hasMessageToolCalls(message)
    || (message.attachments?.length ?? 0) > 0
    || (message.webSearchResults?.length ?? 0) > 0
    || Boolean(message.webSearchError)
    || (message.translations?.length ?? 0) > 0;
}

/** 统一 assistant 消息 preparing / replacement pending 的视图态。 */
export function getAssistantMessageVisualState(message: Message): AssistantMessageVisualState {
  if (message.role !== 'assistant') {
    return {
      hasRetainedOutput: false,
      isBusyAssistant: false,
      isPreparingReply: false,
      isReplacementPending: false,
      shouldUseFullWidthLane: false,
    };
  }

  const hasRetainedOutput = hasRetainedAssistantOutput(message);
  const isPreparing = message.status === 'preparing';
  const isReplacementPending = isPreparing && hasRetainedOutput;
  const shouldUseFullWidthLane = !hasRetainedOutput && (
    message.status === 'pending'
    || message.status === 'preparing'
    || message.status === 'processing'
    || Boolean(message.error)
  );

  return {
    hasRetainedOutput,
    isBusyAssistant: message.status === 'pending' || message.status === 'preparing' || message.status === 'processing',
    isPreparingReply: isPreparing && !isReplacementPending,
    isReplacementPending,
    shouldUseFullWidthLane,
  };
}
