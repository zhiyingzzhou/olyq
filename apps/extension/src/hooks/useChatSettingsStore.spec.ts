/**
 * 说明：`useChatSettingsStore.spec` Hook 模块。
 *
 * 职责：
 * - 承载 `useChatSettingsStore.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '@/types/chat';
import { writeBootstrapStoredJsonMirror } from '@/lib/storage/json-storage';

const STORAGE_KEY = 'olyq.chat.settings.v1';

/**
 * 测试辅助函数：`resetChatSettingsStoreGlobals`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function resetChatSettingsStoreGlobals() {
  const globalForStore = globalThis as typeof globalThis & {
    __olyqUseChatSettingsStoreV1__?: unknown;
    __olyqUseChatSettingsStoreV1Inited__?: boolean;
  };
  delete globalForStore.__olyqUseChatSettingsStoreV1__;
  delete globalForStore.__olyqUseChatSettingsStoreV1Inited__;
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

describe('useChatSettingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    resetChatSettingsStoreGlobals();
    resetExtensionPageStartupGlobals();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('加载旧 exportMenuOptions 时会裁剪废弃渠道并立即回写', async () => {
    writeBootstrapStoredJsonMirror(
      STORAGE_KEY,
      {
        ...DEFAULT_SETTINGS,
        exportMenuOptions: {
          ...DEFAULT_SETTINGS.exportMenuOptions,
          markdown: false,
          notion: false,
          yuque: true,
          obsidian: true,
          joplin: false,
          siyuan: true,
        },
      },
    );

    const { useChatSettingsStore } = await import('./useChatSettingsStore');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useChatSettingsStore.getState().settings.exportMenuOptions).toEqual({
      ...DEFAULT_SETTINGS.exportMenuOptions,
      markdown: false,
    });

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as {
      exportMenuOptions?: Record<string, boolean>;
    };
    expect(saved.exportMenuOptions).toEqual({
      ...DEFAULT_SETTINGS.exportMenuOptions,
      markdown: false,
    });
    expect(Object.keys(saved.exportMenuOptions || {})).toEqual(Object.keys(DEFAULT_SETTINGS.exportMenuOptions || {}));
  });

  it('会为新增的生图默认配置字段补齐兜底值并规范化模型 ID', async () => {
    writeBootstrapStoredJsonMirror(
      STORAGE_KEY,
      {
        ...DEFAULT_SETTINGS,
        defaultImageModel: ' openai/gpt-image-1 ',
      },
    );

    const { useChatSettingsStore } = await import('./useChatSettingsStore');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useChatSettingsStore.getState().settings.defaultImageModel).toBe('openai/gpt-image-1');
    expect(useChatSettingsStore.getState().settings.defaultImagePromptPrefix).toBe('');

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as {
      defaultImageModel?: string;
      defaultImagePromptPrefix?: string;
    };
    expect(saved.defaultImageModel).toBe('openai/gpt-image-1');
    expect(saved.defaultImagePromptPrefix).toBe('');
  });

  it('加载旧 theme 字段时只保留当前 ChatSettings schema', async () => {
    writeBootstrapStoredJsonMirror(
      STORAGE_KEY,
      {
        ...DEFAULT_SETTINGS,
        theme: 'dark',
      },
    );

    const { useChatSettingsStore } = await import('./useChatSettingsStore');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useChatSettingsStore.getState().settings).not.toHaveProperty('theme');

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, unknown>;
    expect(saved).not.toHaveProperty('theme');
  });

  it('命中启动快照时不会在 mount 后立刻回读 storage', async () => {
    const startupSettings = {
      ...DEFAULT_SETTINGS,
      defaultImageModel: 'openai/gpt-image-1',
    };
    const { chromeMock } = createChromeStorageMock({
      [STORAGE_KEY]: startupSettings,
    });
    vi.stubGlobal('chrome', chromeMock);

    const startup = await import('@/lib/extension/extension-page-startup');
    startup.__extensionPageStartupTestUtils.setSnapshot({
      createdAt: Date.now(),
      entries: {
        'olyq.legal.preset-remediation.v1': { source: 'default' },
        [startup.THEME_STORAGE_KEY]: { source: 'default' },
        [startup.DARK_THEME_COLOR_STORAGE_KEY]: { source: 'default' },
        [startup.DISPLAY_SETTINGS_STORAGE_KEY]: { source: 'default' },
        [startup.LANGUAGE_STORAGE_KEY]: { source: 'default' },
        'olyq.assistants.v1': { source: 'default' },
        'olyq.assistant-presets.v1': { source: 'default' },
        'olyq.chat.runtime.v1': { source: 'default' },
        [startup.CHAT_SETTINGS_STORAGE_KEY]: { source: 'storage', value: startupSettings },
      },
      activeConversation: {
        status: 'none',
        assistantId: null,
        topicId: null,
        messages: [],
      },
    });

    const { useChatSettingsStore } = await import('./useChatSettingsStore');

    expect(useChatSettingsStore.getState().settings.defaultImageModel).toBe('openai/gpt-image-1');
    expect(chromeMock.storage.local.get).not.toHaveBeenCalled();
  });

  it('语言切换时会把全局默认 system prompt 重写为当前语言默认值', async () => {
    const { useChatSettingsStore } = await import('./useChatSettingsStore');
    const { setLanguage } = await import('@/i18n');

    useChatSettingsStore.getState().setSettings({
      ...useChatSettingsStore.getState().settings,
      defaultSystemPrompt: 'custom prompt until language switch',
    });

    expect(useChatSettingsStore.getState().settings.defaultSystemPrompt).toBe('custom prompt until language switch');

    setLanguage('en-US');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useChatSettingsStore.getState().settings.defaultSystemPrompt).toBe(
      'You are a helpful AI assistant. Answer clearly and concisely.',
    );
  });
});
