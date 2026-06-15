/**
 * 说明：`message-change-signal.schema` 聊天消息变更信号 schema 模块。
 *
 * 职责：
 * - 声明聊天消息跨宿主同步信号的 shared-storage key 与 payload；
 * - 为 Data Contract Registry 提供无副作用 normalizer；
 * - 避免 registry import 运行时订阅、storage 写入或页面 store。
 *
 * 边界：
 * - 本文件只包含 schema 与纯规整逻辑；
 * - 真实广播和订阅由 `message-change-signal.ts` 负责。
 */

/** 聊天消息变更信号 storage key；只作为跨扩展页宿主的 device-local 通知。 */
export const CHAT_MESSAGES_CHANGED_SIGNAL_KEY = 'olyq.chat.messages.changed.v1';

/** 聊天消息变更信号 payload。 */
export interface ChatMessagesChangedSignalPayload {
  /** 发生消息变更的话题 ID。 */
  topicId: string;
  /** 本次变更唯一 token，用于去重。 */
  token: string;
  /** 发送该信号的宿主实例 ID，用于忽略自回环。 */
  sourceId: string;
  /** 信号创建时间。 */
  at: number;
}

/**
 * 规整聊天消息变更信号。
 *
 * @param raw - storage 中读取到的原始 payload。
 * @returns 合法 payload；非法值返回 `null`。
 */
export function normalizeChatMessagesChangedSignal(raw: unknown): ChatMessagesChangedSignalPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const topicId = typeof record.topicId === 'string' ? record.topicId.trim() : '';
  const token = typeof record.token === 'string' ? record.token.trim() : '';
  const sourceId = typeof record.sourceId === 'string' ? record.sourceId.trim() : '';
  const at = typeof record.at === 'number' && Number.isFinite(record.at) ? record.at : 0;
  if (!topicId || !token || !sourceId || at <= 0) return null;
  return { topicId, token, sourceId, at };
}
