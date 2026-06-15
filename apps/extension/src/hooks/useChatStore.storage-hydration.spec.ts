/**
 * 说明：`useChatStore.storage-hydration.spec` Hook 模块。
 *
 * 职责：
 * - 承载 `useChatStore.storage-hydration.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  builtinTemplate,
  clearMessagesDbMock,
  deleteAttachmentsMock,
  deleteTopicMessagesMock,
  ensureTopicRowMock,
  getTopicMessagesMock,
  listAllTopicMessagesMock,
  loadAssistantPresetsMock,
  putTopicMessagesMock,
} = vi.hoisted(() => ({
  builtinTemplate: {
    id: '__builtin_default_role__',
    scenario: 'general' as const,
    name: '默认助手',
    prompt: 'builtin prompt',
    iconId: 'bot' as const,
  },
  clearMessagesDbMock: vi.fn(async () => undefined),
  deleteAttachmentsMock: vi.fn(async () => undefined),
  deleteTopicMessagesMock: vi.fn(async () => undefined),
  ensureTopicRowMock: vi.fn(async () => undefined),
  getTopicMessagesMock: vi.fn(async () => []),
  listAllTopicMessagesMock: vi.fn(async () => []),
  loadAssistantPresetsMock: vi.fn(),
  putTopicMessagesMock: vi.fn(async () => undefined),
}));

vi.mock('@/lib/attachments', () => ({
  deleteAttachments: deleteAttachmentsMock,
}));

vi.mock('@/lib/chat/messages-db', () => ({
  clearMessagesDb: clearMessagesDbMock,
  deleteTopicMessages: deleteTopicMessagesMock,
  ensureTopicRow: ensureTopicRowMock,
  getTopicMessages: getTopicMessagesMock,
  listAllTopicMessages: listAllTopicMessagesMock,
  putTopicMessages: putTopicMessagesMock,
}));

vi.mock('@/data/role-templates', () => ({
  buildAssistantPresetCatalogScaffold: () => ([
    { key: 'browser', title: '浏览器场景', categories: ['解读'], presets: [] },
    { key: 'general', title: '通用助手', categories: ['写作'], presets: [] },
  ]),
  buildBuiltinDefaultAssistantPreset: () => builtinTemplate,
  loadAssistantPresetCatalog: vi.fn(async () => [
    { key: 'browser', title: '浏览器场景', categories: ['解读'], presets: [] },
    { key: 'general', title: '通用助手', categories: ['写作'], presets: [] },
  ]),
  loadAssistantPresets: loadAssistantPresetsMock,
}));

vi.mock('@/lib/sync/message-mutation-recorder', () => ({
  recordDeletedMessages: vi.fn(),
  recordTopicMessagesChange: vi.fn(),
  recordTopicMessagesCleared: vi.fn(),
}));

vi.mock('@/lib/sync/sync-engine', () => ({
  recordAssistantDeletion: vi.fn(),
  recordAssistantFieldChange: vi.fn(),
  recordTopicDeletion: vi.fn(),
  recordTopicFieldChange: vi.fn(),
}));

/**
 * 测试辅助函数：`resetAssistantStoreGlobals`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function resetAssistantStoreGlobals() {
  const globalForStore = globalThis as typeof globalThis & {
    __olyqUseAssistantStoreV1__?: unknown;
    __olyqUseAssistantStoreV1Inited__?: boolean;
    __olyqUseAssistantStoreV1LangBound__?: boolean;
    __olyqUseAssistantStoreV1ReloadBound__?: boolean;
  };
  delete globalForStore.__olyqUseAssistantStoreV1__;
  delete globalForStore.__olyqUseAssistantStoreV1Inited__;
  delete globalForStore.__olyqUseAssistantStoreV1LangBound__;
  delete globalForStore.__olyqUseAssistantStoreV1ReloadBound__;
}

/**
 * 测试辅助函数：`resetChatStoreGlobals`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function resetChatStoreGlobals() {
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
}

/**
 * 测试辅助函数：`resetI18nGlobals`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function resetI18nGlobals() {
  const globalForI18n = globalThis as typeof globalThis & {
    __olyqI18nStorageBoundV1__?: boolean;
  };
  delete globalForI18n.__olyqI18nStorageBoundV1__;
}

/**
 * 测试辅助函数：`resetExtensionPageStartupGlobals`。
 *
 * @remarks
 * 用于当前测试中的启动快照环境清理，不作为运行时代码复用。
 */
function resetExtensionPageStartupGlobals() {
  const globalForStartup = globalThis as typeof globalThis & {
    __olyqExtensionPageStartupSnapshotV1__?: unknown;
    __olyqExtensionPageStartupPromiseV1__?: unknown;
  };
  delete globalForStartup.__olyqExtensionPageStartupSnapshotV1__;
  delete globalForStartup.__olyqExtensionPageStartupPromiseV1__;
}

/**
 * 测试辅助函数：`createChromeStorageMock`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createChromeStorageMock(initialState: Record<string, unknown>) {
  const state = { ...initialState };
  const listeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void>();

    /**
   * 测试辅助函数：`pickResult`。
   *
   * @remarks
   * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
   */
  const pickResult = (keys: string[] | string | Record<string, unknown> | null | undefined) => {
    if (keys == null) return { ...state };
    if (Array.isArray(keys)) {
      const out: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in state) out[key] = state[key];
      }
      return out;
    }
    if (typeof keys === 'string') {
      return keys in state ? { [keys]: state[keys] } : {};
    }
    if (typeof keys === 'object') {
      const out: Record<string, unknown> = { ...keys };
      for (const key of Object.keys(keys)) {
        if (key in state) out[key] = state[key];
      }
      return out;
    }
    return {};
  };

    /**
   * 测试辅助函数：`emitChanges`。
   *
   * @remarks
   * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
   */
  const emitChanges = (changes: Record<string, chrome.storage.StorageChange>) => {
    for (const listener of listeners) listener(changes, 'local');
  };

  const chromeMock = {
    runtime: {
      lastError: undefined,
    },
    storage: {
      local: {
        get: vi.fn((keys: string[] | string | Record<string, unknown> | null | undefined, callback: (result: Record<string, unknown>) => void) => {
          setTimeout(() => callback(pickResult(keys)), 0);
        }),
        set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
          const changes: Record<string, chrome.storage.StorageChange> = {};
          for (const [key, value] of Object.entries(items)) {
            changes[key] = { oldValue: state[key], newValue: value };
            state[key] = value;
          }
          emitChanges(changes);
          callback?.();
        }),
        remove: vi.fn((keys: string[] | string, callback?: () => void) => {
          const keyList = Array.isArray(keys) ? keys : [keys];
          const changes: Record<string, chrome.storage.StorageChange> = {};
          for (const key of keyList) {
            if (!(key in state)) continue;
            changes[key] = { oldValue: state[key], newValue: undefined };
            delete state[key];
          }
          if (Object.keys(changes).length > 0) emitChanges(changes);
          callback?.();
        }),
      },
      onChanged: {
        addListener: vi.fn((listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => {
          listeners.add(listener);
        }),
        removeListener: vi.fn((listener: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) => {
          listeners.delete(listener);
        }),
      },
    },
  };

  return { chromeMock, state };
}

describe('useChatStore storage hydration', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAssistantStoreGlobals();
    resetChatStoreGlobals();
    resetI18nGlobals();
    resetExtensionPageStartupGlobals();
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.stubGlobal('indexedDB', {});
    clearMessagesDbMock.mockClear();
    deleteAttachmentsMock.mockClear();
    deleteTopicMessagesMock.mockClear();
    ensureTopicRowMock.mockReset();
    ensureTopicRowMock.mockResolvedValue(undefined);
    getTopicMessagesMock.mockReset();
    getTopicMessagesMock.mockResolvedValue([]);
    listAllTopicMessagesMock.mockReset();
    listAllTopicMessagesMock.mockResolvedValue([]);
    loadAssistantPresetsMock.mockReset();
    loadAssistantPresetsMock.mockResolvedValue([builtinTemplate]);
    putTopicMessagesMock.mockReset();
    putTopicMessagesMock.mockResolvedValue(undefined);
  });

  it('不会在异步 hydration 前把默认话题回写覆盖已存 runtime', async () => {
    const storedRuntime = {
      activeAssistantId: 'assistant-2',
      activeTopicId: 'topic-3',
    };
    const assistants = [
      {
        id: 'assistant-1',
        scenario: 'general' as const,
        name: '写作助手',
        prompt: 'writer prompt',
        topics: [{
          id: 'topic-1',
          assistantId: 'assistant-1',
          name: '写作话题',
          pinned: false,
          createdAt: 1,
          updatedAt: 1,
          order: 1,
          isNameManuallyEdited: false,
        }],
        order: 1,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'assistant-2',
        scenario: 'general' as const,
        name: '代码助手',
        prompt: 'coder prompt',
        topics: [{
          id: 'topic-3',
          assistantId: 'assistant-2',
          name: '代码话题',
          pinned: false,
          createdAt: 2,
          updatedAt: 2,
          order: 2,
          isNameManuallyEdited: false,
        }],
        order: 2,
        createdAt: 2,
        updatedAt: 2,
      },
    ];

    const { chromeMock, state } = createChromeStorageMock({
      'olyq.legal.preset-remediation.v1': { presetSet: 'olyq-browser-v1', appliedAt: Date.now() },
      'olyq.assistants.v1': assistants,
      'olyq.chat.runtime.v1': storedRuntime,
    });
    vi.stubGlobal('chrome', chromeMock);

    const { useAssistantStore } = await import('./useAssistantStore');
    useAssistantStore.setState({
      presets: [builtinTemplate],
      assistants,
    });

    const { useChatStore } = await import('./useChatStore');

    await waitFor(() => {
      expect(useChatStore.getState().runtime).toEqual(storedRuntime);
      expect(useChatStore.getState().activeConversationKey).toBe('topic-3');
    });

    expect(state['olyq.chat.runtime.v1']).toEqual(storedRuntime);
  });

  it('命中启动快照时不会在 mount 后再次回读 runtime storage', async () => {
    const storedRuntime = {
      activeAssistantId: 'assistant-2',
      activeTopicId: 'topic-3',
    };
    const assistants = [
      {
        id: 'assistant-2',
        scenario: 'general' as const,
        name: '代码助手',
        prompt: 'coder prompt',
        topics: [{
          id: 'topic-3',
          assistantId: 'assistant-2',
          name: '代码话题',
          pinned: false,
          createdAt: 2,
          updatedAt: 2,
          order: 2,
          isNameManuallyEdited: false,
        }],
        order: 2,
        createdAt: 2,
        updatedAt: 2,
      },
    ];
    const marker = {
      presetSet: 'olyq-browser-v1',
      appliedAt: Date.now(),
    };

    const { chromeMock } = createChromeStorageMock({
      'olyq.legal.preset-remediation.v1': marker,
      'olyq.language.v1': 'zh-CN',
      'olyq.assistants.v1': assistants,
      'olyq.chat.runtime.v1': storedRuntime,
    });
    vi.stubGlobal('chrome', chromeMock);

    const startup = await import('@/lib/extension/extension-page-startup');
    startup.__extensionPageStartupTestUtils.setSnapshot({
      createdAt: Date.now(),
      entries: {
        'olyq.legal.preset-remediation.v1': { source: 'storage', value: marker },
        [startup.THEME_STORAGE_KEY]: { source: 'default' },
        [startup.DARK_THEME_COLOR_STORAGE_KEY]: { source: 'default' },
        [startup.DISPLAY_SETTINGS_STORAGE_KEY]: { source: 'default' },
        [startup.LANGUAGE_STORAGE_KEY]: { source: 'storage', value: 'zh-CN' },
        'olyq.assistants.v1': { source: 'storage', value: assistants },
        'olyq.assistant-presets.v1': { source: 'default' },
        'olyq.chat.runtime.v1': { source: 'storage', value: storedRuntime },
        [startup.CHAT_SETTINGS_STORAGE_KEY]: { source: 'default' },
      },
      activeConversation: {
        status: 'ready',
        assistantId: 'assistant-2',
        topicId: 'topic-3',
        messages: [{
          id: 'startup-assistant-message',
          askId: 'startup-ask',
          role: 'assistant',
          content: 'from startup snapshot',
          createdAt: 3,
        }],
      },
    });

    const { useAssistantStore } = await import('./useAssistantStore');
    const { useChatStore } = await import('./useChatStore');

    await waitFor(() => {
      expect(useAssistantStore.getState().assistants[0]?.id).toBe('assistant-2');
      expect(useChatStore.getState().runtime).toEqual(storedRuntime);
      expect(useChatStore.getState().activeConversationKey).toBe('topic-3');
      expect(useChatStore.getState().activeMessages).toEqual([{
        id: 'startup-assistant-message',
        askId: 'startup-ask',
        role: 'assistant',
        content: 'from startup snapshot',
        createdAt: 3,
      }]);
    });

    const getCalls = vi.mocked(chromeMock.storage.local.get).mock.calls.map(([keys]) => JSON.stringify(keys));
    expect(getCalls.some((keys) => keys.includes('olyq.chat.runtime.v1'))).toBe(false);
    expect(getTopicMessagesMock).not.toHaveBeenCalled();
  });
});
