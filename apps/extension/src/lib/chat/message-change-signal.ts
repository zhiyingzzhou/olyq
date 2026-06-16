/**
 * 说明：`message-change-signal` 聊天消息变更信号运行时模块。
 *
 * 职责：
 * - 在消息快照成功落盘后发布轻量 topic 级变更通知；
 * - 让其它在线扩展页宿主只在当前话题命中时重读 IndexedDB；
 * - 防止通过 runtime reload、topic meta 或打开动作间接同步消息正文。
 *
 * 边界：
 * - 信号只包含 `topicId/token/sourceId/at`，不携带消息正文；
 * - 消息正文真源仍然是 IndexedDB；
 * - 该信号是 device-local runtime 通知，不参与备份或云同步。
 */
import {
  readStoredJson,
  subscribeStoredKeys,
  writeStoredJson,
} from '@/lib/storage/json-storage';
import { createSecureId } from '@/lib/utils/secure-id';
import {
  CHAT_MESSAGES_CHANGED_SIGNAL_KEY,
  normalizeChatMessagesChangedSignal,
  type ChatMessagesChangedSignalPayload,
} from './message-change-signal.schema';

/** 当前页面宿主实例 ID，用于忽略自己写入 storage 后产生的回流事件。 */
const currentSourceId = createSecureId();

let lastSeenToken = '';

/**
 * 创建消息变更 token。
 *
 * @returns 当前宿主内唯一的轻量 token。
 */
function createSignalToken(): string {
  return createSecureId();
}

/**
 * 发布某个 topic 的消息变更信号。
 *
 * @param topicId - 已成功落盘消息快照的话题 ID。
 */
export async function publishTopicMessagesChanged(topicId: string): Promise<void> {
  const normalizedTopicId = String(topicId || '').trim();
  if (!normalizedTopicId) return;
  const payload: ChatMessagesChangedSignalPayload = {
    topicId: normalizedTopicId,
    token: createSignalToken(),
    sourceId: currentSourceId,
    at: Date.now(),
  };
  lastSeenToken = payload.token;
  await writeStoredJson(CHAT_MESSAGES_CHANGED_SIGNAL_KEY, payload);
}

/**
 * 订阅其它宿主发出的 topic 消息变更信号。
 *
 * @param listener - 收到合法、非重复且非本宿主的消息变更时触发。
 * @returns 取消订阅函数。
 */
export function subscribeTopicMessagesChanged(
  listener: (payload: ChatMessagesChangedSignalPayload) => void,
): () => void {
  return subscribeStoredKeys([CHAT_MESSAGES_CHANGED_SIGNAL_KEY], () => {
    void readStoredJson<ChatMessagesChangedSignalPayload | null>(
      CHAT_MESSAGES_CHANGED_SIGNAL_KEY,
      null,
      normalizeChatMessagesChangedSignal,
    ).then((payload) => {
      if (!payload) return;
      if (payload.sourceId === currentSourceId) return;
      if (payload.token === lastSeenToken) return;
      lastSeenToken = payload.token;
      listener(payload);
    });
  });
}
