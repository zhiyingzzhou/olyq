/**
 * 说明：`message-change-signal.spec` 聊天消息变更信号测试模块。
 *
 * 职责：
 * - 验证跨扩展页宿主的 topic 消息变更信号只承载轻量 payload；
 * - 守住非法 payload、重复 token 与本宿主自回环不会触发刷新。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonStorageMock } from '@/test/json-storage-mock';
import { CHAT_MESSAGES_CHANGED_SIGNAL_KEY } from './message-change-signal.schema';

vi.mock('@/lib/storage/json-storage', async () => {
  const { createJsonStorageMockModule } = await import('@/test/json-storage-mock');
  return createJsonStorageMockModule();
});

/**
 * 重新导入带全新宿主 sourceId 的消息信号模块。
 *
 * @returns 当前测试隔离后的消息信号 API。
 */
async function importSignalModule() {
  vi.resetModules();
  return await import('./message-change-signal');
}

/**
 * 触发一次受控 storage change 回流。
 *
 * @remarks
 * `subscribeTopicMessagesChanged()` 内部通过 Promise 异步读取 storage，
 * 因此这里多等待两个 microtask，让断言看到订阅回调的最终结果。
 */
async function emitStorageChange() {
  jsonStorageMock.emitStoredKeysChanged([CHAT_MESSAGES_CHANGED_SIGNAL_KEY]);
  await Promise.resolve();
  await Promise.resolve();
}

describe('message-change-signal', () => {
  beforeEach(() => {
    jsonStorageMock.reset();
  });

  it('publishTopicMessagesChanged 只写入轻量 topic 变更 payload', async () => {
    const { publishTopicMessagesChanged } = await importSignalModule();

    await publishTopicMessagesChanged(' topic-1 ');

    expect(jsonStorageMock.writeStoredJsonMock).toHaveBeenCalledWith(CHAT_MESSAGES_CHANGED_SIGNAL_KEY, {
      topicId: 'topic-1',
      token: expect.any(String),
      sourceId: expect.any(String),
      at: expect.any(Number),
    });
  });

  it('subscribeTopicMessagesChanged 忽略非法 payload、本宿主 payload 和重复 token', async () => {
    const { publishTopicMessagesChanged, subscribeTopicMessagesChanged } = await importSignalModule();
    const listener = vi.fn();
    subscribeTopicMessagesChanged(listener);

    jsonStorageMock.setStoredValue(
      CHAT_MESSAGES_CHANGED_SIGNAL_KEY,
      { topicId: 'topic-1', token: '', sourceId: 'external', at: Date.now() },
    );
    await emitStorageChange();
    expect(listener).not.toHaveBeenCalled();

    await publishTopicMessagesChanged('topic-1');
    await emitStorageChange();
    expect(listener).not.toHaveBeenCalled();

    const externalPayload = {
      topicId: 'topic-1',
      token: 'external-token-1',
      sourceId: 'external-host',
      at: Date.now(),
    };
    jsonStorageMock.setStoredValue(CHAT_MESSAGES_CHANGED_SIGNAL_KEY, externalPayload);
    await emitStorageChange();
    await emitStorageChange();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(externalPayload);
  });
});
