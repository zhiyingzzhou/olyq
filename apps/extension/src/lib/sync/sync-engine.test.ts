/**
 * 说明：`sync-engine.test` 同步模块。
 *
 * 职责：
 * - 承载 `sync-engine.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Assistant } from '@/types/assistant';
import type { TopicConversation } from '@/types/chat';
import type { SyncState } from './diff-merge';
import type { SyncBackend } from './sync-engine';
import { runSync } from './sync-engine';

/**
 * 测试辅助函数：`ts`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function ts(wallTime: number, logical = 0, nodeId = 'node-a') {
  return { wallTime, logical, nodeId };
}

/**
 * 测试辅助函数：`makeAssistant`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeAssistant(overrides?: Partial<Assistant>): Assistant {
  const { scenario = 'general', ...rest } = overrides ?? {};
  return {
    id: 'assistant-1',
    scenario,
    name: '默认助手',
    iconId: 'bot',
    prompt: 'prompt',
    topics: [],
    order: 10,
    createdAt: 1,
    updatedAt: 10,
    ...rest,
  };
}

/**
 * 测试辅助函数：`makeTopicConversation`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeTopicConversation(overrides?: Partial<TopicConversation>): TopicConversation {
  return {
    id: 'topic-1',
    title: '话题',
    messages: [{ id: 'm-1', role: 'user', content: 'hello', createdAt: 10 }],
    folderId: null,
    pinned: false,
    createdAt: 10,
    updatedAt: 10,
    assistantId: 'assistant-1',
    topicPrompt: 'topic prompt',
    isNameManuallyEdited: false,
    order: 10,
    ...overrides,
  };
}

describe('sync-engine assistant/topic split', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('separates assistant defaults from topic payloads during merge and writeback', async () => {
    let assistants: Assistant[] = [
      {
        id: 'assistant-1',
        scenario: 'general' as const,
        name: '写作助手',
        prompt: 'local assistant prompt',
        topics: [
          {
            id: 'topic-1',
            assistantId: 'assistant-1',
            name: '本地话题',
            createdAt: 10,
            updatedAt: 10,
            pinned: false,
            topicPrompt: 'local topic prompt',
            model: 'openai/local-model',
            isNameManuallyEdited: false,
            order: 10,
          },
        ],
        order: 10,
        createdAt: 1,
        updatedAt: 10,
      },
    ];

    let topics: TopicConversation[] = [
      {
        id: 'topic-1',
        title: '本地话题',
        messages: [
          { id: 'm-user-1', role: 'user', content: 'hello', createdAt: 10 },
        ],
        folderId: null,
        pinned: false,
        createdAt: 10,
        updatedAt: 10,
        assistantId: 'assistant-1',
        topicPrompt: 'local topic prompt',
        model: 'openai/local-model',
        isNameManuallyEdited: false,
        order: 10,
      },
    ];

    let pushedState: unknown = null;

    const backend: SyncBackend = {
      pull: vi.fn(async () => ({
        assistants: [
          {
            assistant: {
              id: 'assistant-1',
              scenario: 'general' as const,
              name: '写作助手',
              iconId: 'file-pen' as const,
              prompt: 'remote assistant prompt',
              order: 20,
              createdAt: 1,
              updatedAt: 20,
            },
            fieldTimestamps: {
              iconId: ts(20, 0, 'remote'),
              prompt: ts(20, 0, 'remote'),
              order: ts(20, 0, 'remote'),
              updatedAt: ts(20, 0, 'remote'),
            },
          },
        ],
        topics: [
          {
            topic: {
              id: 'topic-1',
              title: '远端话题',
              messages: [
                { id: 'm-user-1', role: 'user', content: 'hello', createdAt: 10 },
                { id: 'm-assistant-1', role: 'assistant', content: 'world', createdAt: 20 },
              ],
              folderId: null,
              pinned: false,
              createdAt: 10,
              updatedAt: 30,
              assistantId: 'assistant-1',
              topicPrompt: 'remote topic prompt',
              isNameManuallyEdited: true,
              order: 30,
              systemPrompt: 'legacy topic prompt should not leak',
              model: 'openai/remote-model',
            } as TopicConversation,
            fieldTimestamps: {
              title: ts(30, 0, 'remote'),
              topicPrompt: ts(30, 0, 'remote'),
              model: ts(30, 0, 'remote'),
              isNameManuallyEdited: ts(30, 0, 'remote'),
              updatedAt: ts(30, 0, 'remote'),
              order: ts(30, 0, 'remote'),
            },
            messagesTimestamp: ts(30, 1, 'remote'),
          },
        ],
        assistantTombstones: {},
        topicTombstones: {},
        topicMessagesClearedAt: {},
        messageTombstones: {},
        timestamp: ts(30, 2, 'remote'),
        nodeId: 'remote',
      })),
      push: vi.fn(async (state) => {
        pushedState = state;
      }),
    };

    await expect(runSync(backend, {
      getAssistants: () => assistants,
      getTopics: () => topics,
      setAssistants: (next) => {
        assistants = next;
      },
      setTopics: (next) => {
        topics = next;
      },
    })).resolves.toMatchObject({
      status: 'success',
    });

    expect(assistants).toHaveLength(1);
    expect(assistants[0].iconId).toBe('file-pen');
    expect(assistants[0].prompt).toBe('remote assistant prompt');
    expect(assistants[0]).not.toHaveProperty('model');
    expect(assistants[0].topics).toHaveLength(1);
    expect(assistants[0].topics[0]).toMatchObject({
      id: 'topic-1',
      name: '远端话题',
      topicPrompt: 'remote topic prompt',
      model: 'openai/remote-model',
      isNameManuallyEdited: true,
    });

    expect(topics).toHaveLength(1);
    expect(topics[0].model).toBe('openai/remote-model');
    expect(topics[0].messages.map((message) => message.id)).toEqual(['m-user-1', 'm-assistant-1']);

    expect(pushedState).toMatchObject({
      assistants: [
        {
          assistant: {
            id: 'assistant-1',
            iconId: 'file-pen',
            prompt: 'remote assistant prompt',
          },
        },
      ],
      topics: [
        {
          topic: {
            id: 'topic-1',
            title: '远端话题',
            topicPrompt: 'remote topic prompt',
            model: 'openai/remote-model',
          },
        },
      ],
    });

    const pushedTopic = (pushedState as {
      topics: Array<{ topic: Record<string, unknown> }>;
    }).topics[0].topic;
    expect(pushedTopic.systemPrompt).toBeUndefined();
    expect(pushedTopic.model).toBe('openai/remote-model');
  });

  it('uses remote assistant order as first-class sync field and rebuilds sorted assistants', async () => {
    let assistants: Assistant[] = [
      makeAssistant({ id: 'assistant-a', name: 'A', order: 10, updatedAt: 10 }),
      makeAssistant({ id: 'assistant-b', name: 'B', order: 20, updatedAt: 20 }),
    ];
    let topics: TopicConversation[] = [];

    const backend: SyncBackend = {
      pull: vi.fn(async () => ({
        assistants: [
          {
            assistant: {
              ...makeAssistant({ id: 'assistant-a', name: 'A', order: 40, updatedAt: 40 }),
              topics: undefined as never,
            },
            fieldTimestamps: {
              order: ts(40, 0, 'remote'),
              updatedAt: ts(40, 1, 'remote'),
            },
          },
          {
            assistant: {
              ...makeAssistant({ id: 'assistant-b', name: 'B', order: 20, updatedAt: 20 }),
              topics: undefined as never,
            },
            fieldTimestamps: {
              order: ts(20, 0, 'remote'),
              updatedAt: ts(20, 1, 'remote'),
            },
          },
        ],
        topics: [],
        assistantTombstones: {},
        topicTombstones: {},
        topicMessagesClearedAt: {},
        messageTombstones: {},
        timestamp: ts(40, 2, 'remote'),
        nodeId: 'remote',
      })),
      push: vi.fn(async () => undefined),
    };

    await expect(runSync(backend, {
      getAssistants: () => assistants,
      getTopics: () => topics,
      setAssistants: (next) => { assistants = next; },
      setTopics: (next) => { topics = next; },
    })).resolves.toEqual({
      status: 'success',
      merged: 0,
    });

    expect(assistants.map((assistant) => `${assistant.id}:${assistant.order}`)).toEqual([
      'assistant-a:40',
      'assistant-b:20',
    ]);
  });

  it('drops locally existing topics when remote tombstone wins', async () => {
    let assistants: Assistant[] = [
      makeAssistant({
        id: 'assistant-1',
        topics: [{
          id: 'topic-1',
          assistantId: 'assistant-1',
          name: '本地话题',
          createdAt: 10,
          updatedAt: 10,
          pinned: false,
          topicPrompt: 'topic prompt',
          isNameManuallyEdited: false,
          order: 10,
        }],
      }),
    ];
    let topics: TopicConversation[] = [makeTopicConversation()];

    const backend: SyncBackend = {
      pull: vi.fn(async () => ({
        assistants: [
          {
            assistant: {
              ...makeAssistant({ id: 'assistant-1', order: 10, updatedAt: 10 }),
              topics: undefined as never,
            },
            fieldTimestamps: {
              order: ts(10, 0, 'remote'),
              updatedAt: ts(10, 1, 'remote'),
            },
          },
        ],
        topics: [],
        assistantTombstones: {},
        topicTombstones: {
          'topic-1': ts(50, 0, 'remote'),
        },
        topicMessagesClearedAt: {},
        messageTombstones: {},
        timestamp: ts(50, 1, 'remote'),
        nodeId: 'remote',
      })),
      push: vi.fn(async () => undefined),
    };

    await expect(runSync(backend, {
      getAssistants: () => assistants,
      getTopics: () => topics,
      setAssistants: (next) => { assistants = next; },
      setTopics: (next) => { topics = next; },
    })).resolves.toEqual({
      status: 'success',
      merged: 0,
    });

    expect(topics).toEqual([]);
    expect(assistants[0]?.topics ?? []).toEqual([]);
  });

  it('push failure does not pollute local assistants or topics', async () => {
    const initialAssistants = [makeAssistant()];
    const initialTopics = [makeTopicConversation()];
    let assistants = structuredClone(initialAssistants);
    let topics = structuredClone(initialTopics);

    const backend: SyncBackend = {
      pull: vi.fn(async () => ({
        assistants: [
          {
            assistant: {
              ...makeAssistant({ prompt: 'remote prompt', order: 99, updatedAt: 99 }),
              topics: undefined as never,
            },
            fieldTimestamps: {
              prompt: ts(99, 0, 'remote'),
              order: ts(99, 1, 'remote'),
              updatedAt: ts(99, 2, 'remote'),
            },
          },
        ],
        topics: [
          {
            topic: makeTopicConversation({ title: '远端话题', updatedAt: 99, order: 99 }),
            fieldTimestamps: {
              title: ts(99, 0, 'remote'),
              updatedAt: ts(99, 1, 'remote'),
              order: ts(99, 2, 'remote'),
            },
            messagesTimestamp: ts(99, 3, 'remote'),
          },
        ],
        assistantTombstones: {},
        topicTombstones: {},
        topicMessagesClearedAt: {},
        messageTombstones: {},
        timestamp: ts(99, 4, 'remote'),
        nodeId: 'remote',
      })),
      push: vi.fn(async () => {
        throw new Error('push failed');
      }),
    };

    await expect(runSync(backend, {
      getAssistants: () => assistants,
      getTopics: () => topics,
      setAssistants: (next) => { assistants = next; },
      setTopics: (next) => { topics = next; },
    })).resolves.toEqual({
      status: 'error',
      merged: 0,
      error: 'push failed',
    });

    expect(assistants).toEqual(initialAssistants);
    expect(topics).toEqual(initialTopics);
  });

  it('initializes remote state from local snapshot when remote has no sync data', async () => {
    const assistants = [makeAssistant()];
    const topics = [makeTopicConversation()];
    let pushedState: unknown = null;
    const setAssistants = vi.fn();
    const setTopics = vi.fn();

    const backend: SyncBackend = {
      pull: vi.fn(async () => null),
      push: vi.fn(async (state) => {
        pushedState = state;
      }),
    };

    await expect(runSync(backend, {
      getAssistants: () => assistants,
      getTopics: () => topics,
      setAssistants,
      setTopics,
    })).resolves.toEqual({
      status: 'no-remote',
      merged: 0,
    });

    expect(pushedState).toMatchObject({
      assistants: [
        {
          assistant: expect.objectContaining({
            id: 'assistant-1',
            order: 10,
          }),
        },
      ],
      topics: [
        {
          topic: expect.objectContaining({
            id: 'topic-1',
            order: 10,
          }),
        },
      ],
    });
    expect(setAssistants).not.toHaveBeenCalled();
    expect(setTopics).not.toHaveBeenCalled();
  });

  it('structured sync 会合并共享配置并把远端 secret 写回 provider', async () => {
    let sharedConfig: Record<string, unknown> = {
      'olyq.providers.v1': [{
        id: 'openai',
        name: 'OpenAI',
        type: 'openai',
        apiHost: '',
        enabled: true,
        models: [],
      }],
    };
    let pushedState: unknown = null;

    const backend: SyncBackend = {
      pull: vi.fn(async (): Promise<SyncState> => ({
        schemaVersion: 1 as const,
        assistants: [],
        topics: [],
        sharedConfig,
        decryptedSecretConfig: {
          'olyq.providers.v1': {
            openai: { apiKey: 'sk-remote' },
          },
        },
        secretVault: {
          version: 1,
          algorithm: 'AES-GCM',
          kdf: 'PBKDF2-SHA256',
          iterations: 210000,
          salt: 'salt',
          iv: 'iv',
          ciphertext: 'ciphertext',
          nodeId: 'remote',
          updatedAt: ts(100, 0, 'remote'),
        },
        assistantTombstones: {},
        topicTombstones: {},
        topicMessagesClearedAt: {},
        messageTombstones: {},
        timestamp: ts(100, 1, 'remote'),
        nodeId: 'remote',
      })),
      push: vi.fn(async (state) => {
        pushedState = state;
      }),
    };

    await expect(runSync(backend, {
      getAssistants: () => [],
      getTopics: () => [],
      setAssistants: vi.fn(),
      setTopics: vi.fn(),
      getSharedConfig: () => sharedConfig,
      setSharedConfig: (next) => {
        sharedConfig = next;
      },
      getSecretConfig: () => ({}),
    })).resolves.toMatchObject({ status: 'success' });

    expect(sharedConfig['olyq.providers.v1']).toEqual([
      expect.objectContaining({
        id: 'openai',
        apiKey: 'sk-remote',
      }),
    ]);
    expect(pushedState).toMatchObject({
      pendingSecretVault: {
        snapshot: {
          'olyq.providers.v1': {
            openai: { apiKey: 'sk-remote' },
          },
        },
      },
    });
  });
});
