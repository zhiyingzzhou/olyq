/**
 * 说明：`useAssistantStore.remediation.spec` Hook 模块。
 *
 * 职责：
 * - 承载 `useAssistantStore.remediation.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ASSISTANT_ID } from '@/types/assistant';

const {
  builtinTemplate,
  clearMessagesDbMock,
  loadAssistantPresetsMock,
} = vi.hoisted(() => ({
  builtinTemplate: {
    id: '__builtin_default_role__',
    name: '默认助手',
    prompt: 'builtin prompt',
    iconId: 'bot' as const,
  },
  clearMessagesDbMock: vi.fn(async () => undefined),
  loadAssistantPresetsMock: vi.fn(),
}));

vi.mock('@/lib/chat/messages-db', () => ({
  clearMessagesDb: clearMessagesDbMock,
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
 * 用于当前测试中的 storage spy 搭建，不作为运行时代码复用。
 */
function createChromeStorageMock(initialState: Record<string, unknown>) {
  const state = { ...initialState };
  const listeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void>();

  return {
    chromeMock: {
      runtime: {
        lastError: undefined,
      },
      storage: {
        local: {
          get: vi.fn((keys: string[] | string | Record<string, unknown> | null | undefined, callback: (result: Record<string, unknown>) => void) => {
            if (keys == null) {
              callback({ ...state });
              return;
            }
            if (Array.isArray(keys)) {
              const out: Record<string, unknown> = {};
              for (const key of keys) {
                if (key in state) out[key] = state[key];
              }
              callback(out);
              return;
            }
            if (typeof keys === 'string') {
              callback(keys in state ? { [keys]: state[keys] } : {});
              return;
            }
            const out: Record<string, unknown> = { ...keys };
            for (const key of Object.keys(keys || {})) {
              if (key in state) out[key] = state[key];
            }
            callback(out);
          }),
          set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
            const changes: Record<string, chrome.storage.StorageChange> = {};
            for (const [key, value] of Object.entries(items)) {
              changes[key] = { oldValue: state[key], newValue: value };
              state[key] = value;
            }
            for (const listener of listeners) listener(changes, 'local');
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
            if (Object.keys(changes).length > 0) {
              for (const listener of listeners) listener(changes, 'local');
            }
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
    } as unknown as typeof chrome,
  };
}

/**
 * 测试辅助函数：`createStoredAssistant`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createStoredAssistant(id: string) {
  return [{
    id,
    name: 'Legacy Assistant',
    prompt: 'legacy prompt',
    topics: [{
      id: `${id}-topic`,
      assistantId: id,
      name: 'Legacy Topic',
      pinned: false,
      createdAt: 1,
      updatedAt: 1,
      order: 1,
      isNameManuallyEdited: false,
    }],
    createdAt: 1,
    updatedAt: 1,
  }];
}

describe('useAssistantStore legal remediation', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAssistantStoreGlobals();
    resetExtensionPageStartupGlobals();
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.stubGlobal('chrome', undefined);
    vi.stubGlobal('indexedDB', undefined);
    clearMessagesDbMock.mockClear();
    loadAssistantPresetsMock.mockReset();
    loadAssistantPresetsMock.mockResolvedValue([builtinTemplate]);
  });

  it('整改标记缺失时会原地清空旧助手树并重建默认助手', async () => {
    localStorage.setItem('olyq.assistants.v1', JSON.stringify(createStoredAssistant('legacy-assistant')));

    const { useAssistantStore } = await import('./useAssistantStore');

    await waitFor(() => {
      const marker = JSON.parse(localStorage.getItem('olyq.legal.preset-remediation.v1') || 'null') as {
        presetSet?: string;
      };
      expect(marker.presetSet).toBe('olyq-browser-v1');
      expect(useAssistantStore.getState().assistants).toHaveLength(1);
      expect(useAssistantStore.getState().assistants[0]?.id).toBe(DEFAULT_ASSISTANT_ID);
    });

    expect(localStorage.getItem('olyq.assistants.v1') ?? '').not.toContain('legacy-assistant');
    expect(clearMessagesDbMock).not.toHaveBeenCalled();
  });

  it('整改标记存在时不会重复清空助手树', async () => {
    localStorage.setItem('olyq.legal.preset-remediation.v1', JSON.stringify({
      presetSet: 'olyq-browser-v1',
      appliedAt: 1,
    }));
    localStorage.setItem('olyq.assistants.v1', JSON.stringify(createStoredAssistant('assistant-keep')));

    const { useAssistantStore } = await import('./useAssistantStore');

    await waitFor(() => {
      expect(useAssistantStore.getState().assistants[0]?.id).toBe('assistant-keep');
    });

    expect(JSON.parse(localStorage.getItem('olyq.assistants.v1') || '[]')[0]?.id).toBe('assistant-keep');
    expect(clearMessagesDbMock).not.toHaveBeenCalled();
  });

  it('命中启动快照时不会在 mount 后立刻回读 storage', async () => {
    const assistants = createStoredAssistant('assistant-snapshot');
    const marker = {
      presetSet: 'olyq-browser-v1',
      appliedAt: Date.now(),
    };
    const { chromeMock } = createChromeStorageMock({
      'olyq.legal.preset-remediation.v1': marker,
      'olyq.language.v1': 'zh-CN',
      'olyq.assistants.v1': assistants,
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
        'olyq.chat.runtime.v1': { source: 'default' },
        [startup.CHAT_SETTINGS_STORAGE_KEY]: { source: 'default' },
      },
      activeConversation: {
        status: 'none',
        assistantId: null,
        topicId: null,
        messages: [],
      },
    });

    const { useAssistantStore } = await import('./useAssistantStore');

    await waitFor(() => {
      expect(useAssistantStore.getState().assistants[0]?.id).toBe('assistant-snapshot');
    });

    const getCalls = vi.mocked(chromeMock.storage.local.get).mock.calls.map(([keys]) => JSON.stringify(keys));
    expect(getCalls.some((keys) => keys.includes('olyq.assistants.v1'))).toBe(false);
  });
});
