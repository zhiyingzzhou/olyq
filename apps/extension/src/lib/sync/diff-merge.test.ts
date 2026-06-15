/**
 * 说明：structured sync 合并契约测试。
 *
 * 职责：
 * - 验证 topic v1 字段级 LWW 覆盖 browser-context 模式；
 * - 验证消息冲突只依赖稳定 revision / revisionClock；
 * - 防止同步继续依赖不存在的 `updatedAt` 字段做隐式合并。
 */
import { describe, expect, it } from 'vitest';

import type { Message, TopicConversation } from '@/types/chat';
import type { SyncState, SyncableTopicState } from './diff-merge';
import { fullMerge } from './diff-merge';

/**
 * 构造测试用 HLC 时间戳。
 *
 * @param wallTime - 物理时间。
 * @param logical - 逻辑计数。
 * @param nodeId - 节点 ID。
 * @returns HLC 时间戳。
 */
function ts(wallTime: number, logical = 0, nodeId = 'node-a') {
  return { wallTime, logical, nodeId };
}

/**
 * 构造测试消息。
 *
 * @param overrides - 覆盖字段。
 * @returns 当前测试消息。
 */
function makeMessage(overrides: Partial<Message>): Message {
  return {
    id: 'message-1',
    role: 'assistant',
    content: 'base',
    createdAt: 1,
    ...overrides,
  };
}

/**
 * 构造测试话题。
 *
 * @param overrides - 覆盖字段。
 * @returns 当前测试话题。
 */
function makeTopic(overrides?: Partial<TopicConversation>): TopicConversation {
  return {
    id: 'topic-1',
    title: 'topic',
    messages: [],
    folderId: null,
    pinned: false,
    createdAt: 1,
    updatedAt: 1,
    assistantId: 'assistant-1',
    isNameManuallyEdited: false,
    order: 1,
    ...overrides,
  };
}

/**
 * 构造测试 topic 同步状态。
 *
 * @param topic - 话题正文。
 * @param wallTime - 字段级 HLC wallTime。
 * @returns 可参与合并的 topic state。
 */
function makeTopicState(topic: TopicConversation, wallTime: number): SyncableTopicState {
  return {
    topic,
    fieldTimestamps: {
      browserContextMode: ts(wallTime, 0, topic.id),
      updatedAt: ts(wallTime, 1, topic.id),
    },
    messagesTimestamp: ts(wallTime, 2, topic.id),
  };
}

/**
 * 构造测试同步状态。
 *
 * @param topicState - 唯一 topic 状态。
 * @returns 完整 SyncState。
 */
function makeState(topicState: SyncableTopicState): SyncState {
  return {
    schemaVersion: 1,
    assistants: [],
    topics: [topicState],
    assistantTombstones: {},
    topicTombstones: {},
    topicMessagesClearedAt: {},
    messageTombstones: {},
    timestamp: ts(topicState.messagesTimestamp.wallTime, 3, 'state'),
    nodeId: 'state',
  };
}

describe('diff-merge v1 contract', () => {
  it('Topic.browserContextMode 参与 topic 字段级 LWW', () => {
    const local = makeState(makeTopicState(makeTopic({
      browserContextMode: { enabled: false, fullPageEnabled: false, styleSignalsEnabled: false },
      updatedAt: 10,
    }), 10));
    const remote = makeState(makeTopicState(makeTopic({
      browserContextMode: { enabled: true, fullPageEnabled: true, styleSignalsEnabled: true },
      updatedAt: 20,
    }), 20));

    const merged = fullMerge(local, remote);

    expect(merged.topics[0]?.topic.browserContextMode).toEqual({
      enabled: true,
      fullPageEnabled: true,
      styleSignalsEnabled: true,
    });
  });

  it('同 ID 消息冲突使用 revisionClock 决定胜负', () => {
    const localMessage = makeMessage({
      content: 'local',
      revision: '000000000000a-0000-local',
      revisionClock: ts(10, 0, 'local'),
      createdAt: 1,
    });
    const remoteMessage = makeMessage({
      content: 'remote',
      revision: '0000000000014-0000-remote',
      revisionClock: ts(20, 0, 'remote'),
      createdAt: 1,
    });

    const merged = fullMerge(
      makeState(makeTopicState(makeTopic({ messages: [localMessage] }), 10)),
      makeState(makeTopicState(makeTopic({ messages: [remoteMessage] }), 20)),
    );

    expect(merged.topics[0]?.topic.messages).toHaveLength(1);
    expect(merged.topics[0]?.topic.messages[0]?.content).toBe('remote');
  });
});
