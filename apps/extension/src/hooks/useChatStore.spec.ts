/**
 * 说明：`useChatStore.spec` Hook 模块。
 *
 * 职责：
 * - 承载 `useChatStore.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssistantPreset } from '@/types/assistant';
import i18n from '@/i18n';
import { buildResolvedConversationContext } from '@/lib/chat/resolved-conversation';
import { ensureTopicRow, getTopicMessages, putTopicMessages } from '@/lib/chat/messages-db';

const chatMessageSignalMocks = vi.hoisted(() => ({
  ...(() => {
    const globalForStore = globalThis as typeof globalThis & {
      __olyqFlushPendingWritesV4__?: unknown;
      __olyqUseChatStoreV4__?: unknown;
      __olyqUseChatStoreV4Inited__?: boolean;
      __olyqUseChatStoreV4UnloadBound__?: boolean;
      __olyqUseChatStoreV4ReloadBound__?: boolean;
    };
    delete globalForStore.__olyqFlushPendingWritesV4__;
    delete globalForStore.__olyqUseChatStoreV4__;
    delete globalForStore.__olyqUseChatStoreV4Inited__;
    delete globalForStore.__olyqUseChatStoreV4UnloadBound__;
    delete globalForStore.__olyqUseChatStoreV4ReloadBound__;
    return {};
  })(),
  publishTopicMessagesChangedMock: vi.fn(async () => undefined),
  subscribedTopicMessagesChanged: null as null | ((payload: {
    topicId: string;
    token: string;
    sourceId: string;
    at: number;
  }) => void),
}));

vi.mock('@/lib/attachments', () => ({
  deleteAttachments: vi.fn(async () => undefined),
}));

vi.mock('@/lib/chat/messages-db', () => ({
  clearMessagesDb: vi.fn(async () => undefined),
  deleteTopicMessages: vi.fn(async () => undefined),
  ensureTopicRow: vi.fn(async () => undefined),
  getTopicMessages: vi.fn(async () => []),
  listAllTopicMessages: vi.fn(async () => []),
  putTopicMessages: vi.fn(async () => undefined),
}));

vi.mock('@/lib/chat/message-change-signal', () => ({
  publishTopicMessagesChanged: chatMessageSignalMocks.publishTopicMessagesChangedMock,
  subscribeTopicMessagesChanged: vi.fn((listener: NonNullable<typeof chatMessageSignalMocks.subscribedTopicMessagesChanged>) => {
    chatMessageSignalMocks.subscribedTopicMessagesChanged = listener;
    return vi.fn();
  }),
}));

vi.mock('@/data/role-templates', () => {
  const builtinTemplate: AssistantPreset = {
    id: '__builtin_default_role__',
    scenario: 'general',
    name: '默认角色',
    prompt: 'default prompt',
    iconId: 'bot' as const,
  };

  return {
    buildAssistantPresetCatalogScaffold: () => ([
      { key: 'browser', title: '浏览器场景', categories: ['解读'], presets: [] },
      { key: 'general', title: '通用助手', categories: ['写作'], presets: [] },
    ]),
    buildBuiltinDefaultAssistantPreset: () => builtinTemplate,
    loadAssistantPresetCatalog: vi.fn(async () => [
      { key: 'browser', title: '浏览器场景', categories: ['解读'], presets: [] },
      { key: 'general', title: '通用助手', categories: ['写作'], presets: [] },
    ]),
    loadAssistantPresets: vi.fn(async () => [builtinTemplate]),
  };
});

import { useAssistantStore } from '@/hooks/useAssistantStore';
import { flushChatStorePendingWrites, useChatStore } from '@/hooks/useChatStore';

describe('useChatStore assistant selection', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('indexedDB', {});
    vi.mocked(ensureTopicRow).mockReset();
    vi.mocked(ensureTopicRow).mockResolvedValue(undefined);
    vi.mocked(getTopicMessages).mockReset();
    vi.mocked(getTopicMessages).mockResolvedValue([]);
    vi.mocked(putTopicMessages).mockReset();
    vi.mocked(putTopicMessages).mockResolvedValue(undefined);
    chatMessageSignalMocks.publishTopicMessagesChangedMock.mockClear();

    useAssistantStore.setState({
      presets: [
        {
          id: '__builtin_default_role__',
          scenario: 'general' as const,
          name: '默认角色',
          prompt: 'default prompt',
          iconId: 'bot',
        },
      ],
      assistants: [
        {
          id: 'assistant-1',
          scenario: 'general' as const,
          name: '写作助手',
          prompt: 'writer prompt',
          topics: [
            {
              id: 'topic-1',
              assistantId: 'assistant-1',
              name: '最新话题',
              pinned: false,
              createdAt: 10,
              updatedAt: 10,
              order: 10,
              isNameManuallyEdited: false,
            },
            {
              id: 'topic-2',
              assistantId: 'assistant-1',
              name: '旧话题',
              pinned: true,
              createdAt: 9,
              updatedAt: 20,
              order: 20,
              isNameManuallyEdited: false,
            },
          ],
          order: 1,
          createdAt: 1,
          updatedAt: 20,
        },
        {
          id: 'assistant-2',
          scenario: 'general' as const,
          name: '代码助手',
          prompt: 'coder prompt',
          topics: [
            {
              id: 'topic-3',
              assistantId: 'assistant-2',
              name: '代码话题',
              pinned: false,
              createdAt: 8,
              updatedAt: 8,
              order: 8,
              isNameManuallyEdited: false,
            },
          ],
          order: 2,
          createdAt: 2,
          updatedAt: 8,
        },
      ],
    });

    useChatStore.setState({
      runtime: {
        activeAssistantId: 'assistant-1',
        activeTopicId: 'topic-2',
      },
      activeConversationKey: 'topic-2',
      activeMessages: [],
      activeMessagesLoading: false,
      activeConversationState: 'ready',
      autoRenameState: {},
    });
  });

  afterEach(() => {
    try {
      vi.runOnlyPendingTimers();
    } catch {
      // ignore when the test did not switch to fake timers
    }
    vi.useRealTimers();
  });

  it('切换助手实例时总是落到该助手 topics[0]', () => {
    useChatStore.getState().setActiveAssistant('assistant-1');

    expect(useChatStore.getState().runtime).toEqual({
      activeAssistantId: 'assistant-1',
      activeTopicId: 'topic-1',
    });
    expect(useChatStore.getState().activeConversationKey).toBe('topic-1');
  });

  it('运行时回落也使用助手原始数组首个话题', () => {
    useChatStore.setState({
      runtime: {
        activeAssistantId: 'assistant-1',
        activeTopicId: 'missing-topic',
      },
      activeConversationKey: 'missing-topic',
      activeMessages: [],
      activeMessagesLoading: false,
      activeConversationState: 'ready',
      autoRenameState: {},
    });

    useChatStore.getState().reconcileWithAssistants();

    expect(useChatStore.getState().runtime).toEqual({
      activeAssistantId: 'assistant-1',
      activeTopicId: 'topic-1',
    });
    expect(useChatStore.getState().activeConversationKey).toBe('topic-1');
  });

  it('修改 topicPrompt 只影响当前 topic，不会回写 assistant 默认 prompt', () => {
    useAssistantStore.getState().updateTopicMeta('topic-2', { topicPrompt: 'topic-2 prompt' });

    const assistant = useAssistantStore.getState().getAssistant('assistant-1');
    expect(assistant?.prompt).toBe('writer prompt');
    expect(assistant?.topics.find((topic) => topic.id === 'topic-1')?.topicPrompt).toBeUndefined();
    expect(assistant?.topics.find((topic) => topic.id === 'topic-2')?.topicPrompt).toBe('topic-2 prompt');
  });

  it('修改 assistant prompt 与单个 topic model 后，只让对应 topic 的派生模型生效', () => {
    useAssistantStore.getState().updateAssistantConfig('assistant-1', {
      prompt: 'new assistant prompt',
    });
    useAssistantStore.getState().updateTopicMeta('topic-1', {
      model: 'openai/gpt-5.4',
    });

    const assistant = useAssistantStore.getState().getAssistant('assistant-1');
    const settings = {
      defaultSystemPrompt: 'global prompt',
      defaultModel: 'global/model',
      defaultTemperature: 0.7,
      defaultTopP: 1,
      defaultMaxTokens: 4096,
      defaultContextLength: 20,
      reasoningEffort: 'medium' as const,
    };

    const topic1 = assistant?.topics.find((topic) => topic.id === 'topic-1');
    const topic2 = assistant?.topics.find((topic) => topic.id === 'topic-2');
    expect(topic1).toBeTruthy();
    expect(topic2).toBeTruthy();

    const resolved1 = buildResolvedConversationContext({
      assistant: assistant!,
      topic: topic1!,
      messages: [],
      settings,
    });
    const resolved2 = buildResolvedConversationContext({
      assistant: assistant!,
      topic: topic2!,
      messages: [],
      settings,
    });

    expect(resolved1.systemPrompt).toBe('global prompt\n\nnew assistant prompt');
    expect(resolved2.systemPrompt).toBe('global prompt\n\nnew assistant prompt');
    expect(resolved1.model).toBe('openai/gpt-5.4');
    expect(resolved2.model).toBe('global/model');
  });

  it('移动 topic 后，setActiveTopic 会反查并同步所属 assistant', () => {
    useAssistantStore.getState().moveTopicToAssistant('topic-2', 'assistant-2');

    useChatStore.getState().setActiveTopic('topic-2');

    expect(useChatStore.getState().runtime).toEqual({
      activeAssistantId: 'assistant-2',
      activeTopicId: 'topic-2',
    });
    expect(useChatStore.getState().activeConversationKey).toBe('topic-2');
  });

  it('重复选择当前 topic 时不会重新加载消息并清空未落盘内容', () => {
    const getTopicMessagesMock = vi.mocked(getTopicMessages);
    getTopicMessagesMock.mockClear();

    useChatStore.setState({
      runtime: {
        activeAssistantId: 'assistant-1',
        activeTopicId: 'topic-2',
      },
      activeConversationKey: 'topic-2',
      activeMessages: [{
        id: 'message-user-1',
        role: 'user',
        content: 'still in memory',
        createdAt: 1,
        attachments: [],
      }],
      activeMessagesLoading: false,
      activeConversationState: 'ready',
      autoRenameState: {},
    });

    useChatStore.getState().setActiveTopic('topic-2');

    expect(useChatStore.getState().activeConversationKey).toBe('topic-2');
    expect(useChatStore.getState().activeMessages).toEqual([{
      id: 'message-user-1',
      role: 'user',
      content: 'still in memory',
      createdAt: 1,
      attachments: [],
    }]);
    expect(getTopicMessagesMock).not.toHaveBeenCalled();
  });

  it('重复选择仍在 resolving 的当前 topic 会重新拉取消息，避免停在 loading 壳', async () => {
    const getTopicMessagesMock = vi.mocked(getTopicMessages);
    getTopicMessagesMock.mockClear();
    getTopicMessagesMock.mockResolvedValueOnce([{
      id: 'message-after-resume',
      role: 'assistant',
      content: 'loaded after resolving retry',
      createdAt: 2,
      status: 'success',
    }]);

    useChatStore.setState({
      runtime: {
        activeAssistantId: 'assistant-1',
        activeTopicId: 'topic-2',
      },
      activeConversationKey: 'topic-2',
      activeMessages: [],
      activeMessagesLoading: true,
      activeConversationState: 'resolving',
      autoRenameState: {},
    });

    useChatStore.getState().setActiveTopic('topic-2');

    await vi.waitFor(() => {
      expect(getTopicMessagesMock).toHaveBeenCalledWith('topic-2');
      expect(useChatStore.getState().activeConversationState).toBe('ready');
    });
    expect(useChatStore.getState().activeMessagesLoading).toBe(false);
    expect(useChatStore.getState().activeMessages).toEqual([{
      id: 'message-after-resume',
      role: 'assistant',
      content: 'loaded after resolving retry',
      createdAt: 2,
      status: 'success',
    }]);
  });

  it('切换到新 topic 时会同步进入 resolving/loading，避免首拍误渲染欢迎态', () => {
    const getTopicMessagesMock = vi.mocked(getTopicMessages);
    getTopicMessagesMock.mockImplementation(async () => {
      await Promise.resolve();
      return [];
    });

    useChatStore.getState().setActiveTopic('topic-3');

    expect(useChatStore.getState().activeConversationKey).toBe('topic-3');
    expect(useChatStore.getState().activeMessagesLoading).toBe(true);
    expect(useChatStore.getState().activeConversationState).toBe('resolving');
    expect(useChatStore.getState().activeMessages).toEqual([]);
  });

  it('激活本地新建空 topic 会立即进入 ready 空消息态', async () => {
    const ensureTopicRowMock = vi.mocked(ensureTopicRow);
    const getTopicMessagesMock = vi.mocked(getTopicMessages);
    ensureTopicRowMock.mockClear();
    getTopicMessagesMock.mockClear();

    useChatStore.getState().activateLocalEmptyTopic('topic-3');

    expect(useChatStore.getState().runtime).toEqual({
      activeAssistantId: 'assistant-2',
      activeTopicId: 'topic-3',
    });
    expect(useChatStore.getState().activeConversationKey).toBe('topic-3');
    expect(useChatStore.getState().activeMessages).toEqual([]);
    expect(useChatStore.getState().activeMessagesLoading).toBe(false);
    expect(useChatStore.getState().activeConversationState).toBe('ready');
    expect(getTopicMessagesMock).not.toHaveBeenCalled();

    await flushChatStorePendingWrites();
    expect(ensureTopicRowMock).toHaveBeenCalledWith('topic-3');
  });

  it('可在流式增量写回时跳过 topic updatedAt 触碰', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-08T00:00:00Z'));

    const before = useAssistantStore.getState().getAssistant('assistant-1')?.topics.find((topic) => topic.id === 'topic-2')?.updatedAt;
    expect(before).toBe(20);

    useChatStore.getState().setMessagesForActiveConversation([{
      id: 'assistant-1-message',
      role: 'assistant',
      content: 'stream delta',
      createdAt: 1,
    }], { touchTopicMeta: false });

    const after = useAssistantStore.getState().getAssistant('assistant-1')?.topics.find((topic) => topic.id === 'topic-2')?.updatedAt;
    expect(after).toBe(before);
  });

  it('默认消息写回仍会刷新 topic updatedAt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-08T00:00:01Z'));

    useChatStore.getState().setMessagesForActiveConversation([{
      id: 'assistant-2-message',
      role: 'assistant',
      content: 'final content',
      createdAt: 2,
    }]);

    const updatedAt = useAssistantStore.getState().getAssistant('assistant-1')?.topics.find((topic) => topic.id === 'topic-2')?.updatedAt;
    expect(updatedAt).toBe(Date.now());
  });

  it('消息快照必须在 IndexedDB 写入完成后才发布跨宿主消息信号', async () => {
    vi.useFakeTimers();
    const putTopicMessagesMock = vi.mocked(putTopicMessages);
    let resolvePut!: () => void;
    putTopicMessagesMock.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolvePut = resolve;
    }));

    const nextMessages = [{
      id: 'message-delayed',
      role: 'user' as const,
      content: 'delayed write',
      createdAt: 1,
    }];
    useChatStore.getState().setMessagesForActiveConversation(nextMessages);

    const flushPromise = flushChatStorePendingWrites();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();

    expect(putTopicMessagesMock).toHaveBeenCalledWith('topic-2', nextMessages);
    expect(chatMessageSignalMocks.publishTopicMessagesChangedMock).not.toHaveBeenCalled();

    resolvePut();
    await flushPromise;

    expect(chatMessageSignalMocks.publishTopicMessagesChangedMock).toHaveBeenCalledWith('topic-2');
  });

  it('当前 active topic 收到外部消息信号后会重读 IndexedDB 且保持 ready 态', async () => {
    const getTopicMessagesMock = vi.mocked(getTopicMessages);
    await vi.waitFor(() => {
      expect(chatMessageSignalMocks.subscribedTopicMessagesChanged).toBeTypeOf('function');
    });
    await Promise.resolve();
    useChatStore.setState({
      runtime: {
        activeAssistantId: 'assistant-1',
        activeTopicId: 'topic-2',
      },
      activeConversationKey: 'topic-2',
      activeMessages: [{
        id: 'message-before',
        role: 'user',
        content: 'before sync',
        createdAt: 1,
      }],
      activeMessagesLoading: false,
      activeConversationState: 'ready',
    });
    getTopicMessagesMock.mockClear();
    let resolveMessages!: (messages: Awaited<ReturnType<typeof getTopicMessages>>) => void;
    getTopicMessagesMock.mockReturnValueOnce(new Promise((resolve) => {
      resolveMessages = resolve;
    }));

    chatMessageSignalMocks.subscribedTopicMessagesChanged?.({
      topicId: 'topic-2',
      token: 'external-token-1',
      sourceId: 'external-host',
      at: Date.now(),
    });

    await vi.waitFor(() => {
      expect(getTopicMessagesMock).toHaveBeenCalledWith('topic-2');
    });
    expect(useChatStore.getState().activeConversationState).toBe('ready');

    resolveMessages([{
      id: 'message-after',
      role: 'assistant',
      content: 'after sync',
      createdAt: 2,
      status: 'success',
    }]);

    await vi.waitFor(() => {
      expect(useChatStore.getState().activeMessages).toEqual([{
        id: 'message-after',
        role: 'assistant',
        content: 'after sync',
        createdAt: 2,
        status: 'success',
      }]);
    });
    expect(useChatStore.getState().activeConversationState).toBe('ready');
    expect(useChatStore.getState().activeMessagesLoading).toBe(false);
  });

  it('非当前 topic 的外部消息信号不会刷新当前消息', async () => {
    const getTopicMessagesMock = vi.mocked(getTopicMessages);
    await vi.waitFor(() => {
      expect(chatMessageSignalMocks.subscribedTopicMessagesChanged).toBeTypeOf('function');
    });
    getTopicMessagesMock.mockClear();

    chatMessageSignalMocks.subscribedTopicMessagesChanged?.({
      topicId: 'topic-other',
      token: 'external-token-other',
      sourceId: 'external-host',
      at: Date.now(),
    });
    await Promise.resolve();

    expect(getTopicMessagesMock).not.toHaveBeenCalled();
  });

  it('clearTopicMessages 落盘后会发布同 topic 消息信号并重置话题标题', async () => {
    useChatStore.getState().clearTopicMessages('topic-2');

    await flushChatStorePendingWrites();

    expect(putTopicMessages).toHaveBeenCalledWith('topic-2', []);
    expect(chatMessageSignalMocks.publishTopicMessagesChangedMock).toHaveBeenCalledWith('topic-2');
    const topic = useAssistantStore.getState().getAssistant('assistant-1')?.topics.find((item) => item.id === 'topic-2');
    expect(topic?.name).toBe(i18n.t('chat.defaultTopicTitle'));
    expect(topic?.isNameManuallyEdited).toBe(false);
  });
});
