/**
 * 说明：`display-settings.spec` 基础能力模块。
 *
 * 职责：
 * - 承载 `display-settings.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'olyq.display-settings.v1';

const {
  storageState,
  storageListeners,
  storageGet,
  storageSet,
  storageRemove,
  storageOnChange,
  startupStorageBackedKeys,
  startupValues,
  startupHasStorageValue,
  startupReadValue,
} = vi.hoisted(() => ({
  storageState: new Map<string, unknown>(),
  storageListeners: new Set<(changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => void>(),
  storageGet: vi.fn(),
  storageSet: vi.fn(),
  storageRemove: vi.fn(),
  storageOnChange: vi.fn(),
  startupStorageBackedKeys: new Set<string>(),
  startupValues: new Map<string, unknown>(),
  startupHasStorageValue: vi.fn(),
  startupReadValue: vi.fn(),
}));

vi.mock('@/lib/extension/extension-page-startup', () => ({
  DISPLAY_SETTINGS_STORAGE_KEY: STORAGE_KEY,
  hasExtensionPageStartupStorageValue: startupHasStorageValue,
  readExtensionPageStartupValue: startupReadValue,
}));

vi.mock('@/lib/storage/storage-adapter', () => ({
  getStorageAdapter: () => ({
    get: storageGet,
    set: storageSet,
    remove: storageRemove,
    onChange: storageOnChange,
  }),
}));

/**
 * 测试辅助函数：`cloneValue`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function cloneValue<T>(value: T): T {
  return value == null ? value : structuredClone(value);
}

/**
 * 测试辅助函数：`setStoredValue`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function setStoredValue(key: string, value: unknown): void {
  storageState.set(key, cloneValue(value));
}

/**
 * 测试辅助函数：`makeDisplaySettings`。
 *
 * @remarks
 * 生成当前 `olyq.display-settings.v1` 的完整对象，避免新增字段时测试 fixture 变成隐式旧结构。
 */
function makeDisplaySettings(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sidebarPosition: 'left',
    sidebarCollapsed: false,
    sidebarTab: 'topics',
    clickAssistantToShowTopic: true,
    assistantsTabSortType: 'list',
    pinTopicsToTop: false,
    extensionSettingsOpenMode: 'dialog',
    ...overrides,
  };
}

describe('display-settings', () => {
  beforeEach(() => {
    vi.resetModules();
    cleanup();
    storageState.clear();
    storageListeners.clear();
    storageGet.mockReset();
    storageSet.mockReset();
    storageRemove.mockReset();
    storageOnChange.mockReset();
    startupStorageBackedKeys.clear();
    startupValues.clear();
    startupHasStorageValue.mockReset();
    startupReadValue.mockReset();
    localStorage.clear();

    startupHasStorageValue.mockImplementation((key: string) => startupStorageBackedKeys.has(key));
    startupReadValue.mockImplementation((key: string, fallback: unknown, coerce?: (raw: unknown) => unknown) => {
      if (!startupValues.has(key)) return fallback;
      const raw = cloneValue(startupValues.get(key));
      return coerce ? coerce(raw) : raw;
    });

    storageGet.mockImplementation(async (keys: string[]) => {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (storageState.has(key)) result[key] = cloneValue(storageState.get(key));
      }
      return result;
    });

    storageSet.mockImplementation(async (items: Record<string, unknown>) => {
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const [key, value] of Object.entries(items)) {
        const oldValue = storageState.has(key) ? cloneValue(storageState.get(key)) : undefined;
        const newValue = cloneValue(value);
        storageState.set(key, newValue);
        changes[key] = { oldValue, newValue };
      }
      for (const listener of storageListeners) listener(changes);
    });

    storageRemove.mockImplementation(async (keys: string[]) => {
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const key of keys) {
        if (!storageState.has(key)) continue;
        changes[key] = {
          oldValue: cloneValue(storageState.get(key)),
          newValue: undefined,
        };
        storageState.delete(key);
      }
      if (Object.keys(changes).length > 0) {
        for (const listener of storageListeners) listener(changes);
      }
    });

    storageOnChange.mockImplementation((callback: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => void) => {
      storageListeners.add(callback);
      return () => {
        storageListeners.delete(callback);
      };
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('hydrates cache from storage adapter and ignores raw localStorage seeds', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(makeDisplaySettings({ extensionSettingsOpenMode: 'workspace' })));
    setStoredValue(STORAGE_KEY, makeDisplaySettings({
      sidebarPosition: 'right',
      sidebarCollapsed: true,
      sidebarTab: 'assistants',
      clickAssistantToShowTopic: false,
      assistantsTabSortType: 'tags',
      pinTopicsToTop: true,
      extensionSettingsOpenMode: 'workspace',
    }));

    const displaySettings = await import('./display-settings');
    displaySettings.applyInitialDisplaySettings();

    await waitFor(() => {
      expect(displaySettings.loadDisplaySettings()).toEqual(makeDisplaySettings({
        sidebarPosition: 'right',
        sidebarCollapsed: true,
        sidebarTab: 'assistants',
        clickAssistantToShowTopic: false,
        assistantsTabSortType: 'tags',
        pinTopicsToTop: true,
        extensionSettingsOpenMode: 'workspace',
      }));
    });

    expect(document.documentElement.hasAttribute('data-glass')).toBe(false);
  });

  it('ignores malformed startup snapshots and refreshes display settings from storage', async () => {
    startupStorageBackedKeys.add(STORAGE_KEY);
    startupValues.set(STORAGE_KEY, { sidebarPosition: 'right' });
    setStoredValue(STORAGE_KEY, makeDisplaySettings({
      sidebarPosition: 'right',
      sidebarCollapsed: true,
      sidebarTab: 'assistants',
      clickAssistantToShowTopic: false,
      assistantsTabSortType: 'tags',
      pinTopicsToTop: true,
      extensionSettingsOpenMode: 'workspace',
    }));

    const displaySettings = await import('./display-settings');
    displaySettings.applyInitialDisplaySettings();

    await waitFor(() => {
      expect(displaySettings.loadDisplaySettings()).toEqual(makeDisplaySettings({
        sidebarPosition: 'right',
        sidebarCollapsed: true,
        sidebarTab: 'assistants',
        clickAssistantToShowTopic: false,
        assistantsTabSortType: 'tags',
        pinTopicsToTop: true,
        extensionSettingsOpenMode: 'workspace',
      }));
    });

    expect(document.documentElement.hasAttribute('data-glass')).toBe(false);
    expect(storageGet).toHaveBeenCalledWith([STORAGE_KEY]);
  });

  it('trusts valid startup snapshots and skips redundant display-settings refresh', async () => {
    startupStorageBackedKeys.add(STORAGE_KEY);
    startupValues.set(STORAGE_KEY, makeDisplaySettings({
      sidebarPosition: 'right',
      sidebarCollapsed: true,
      sidebarTab: 'assistants',
      clickAssistantToShowTopic: false,
      assistantsTabSortType: 'tags',
      pinTopicsToTop: true,
      extensionSettingsOpenMode: 'workspace',
    }));

    const displaySettings = await import('./display-settings');
    displaySettings.applyInitialDisplaySettings();

    expect(displaySettings.loadDisplaySettings()).toEqual(makeDisplaySettings({
      sidebarPosition: 'right',
      sidebarCollapsed: true,
      sidebarTab: 'assistants',
      clickAssistantToShowTopic: false,
      assistantsTabSortType: 'tags',
      pinTopicsToTop: true,
      extensionSettingsOpenMode: 'workspace',
    }));
    expect(document.documentElement.hasAttribute('data-glass')).toBe(false);
    expect(storageGet).not.toHaveBeenCalled();
  });

  it('updates cache synchronously before async persistence completes', async () => {
    const displaySettings = await import('./display-settings');

    const next = displaySettings.updateDisplaySettings({
      sidebarTab: 'assistants',
      sidebarCollapsed: false,
      clickAssistantToShowTopic: true,
      extensionSettingsOpenMode: 'workspace',
    });

    expect(next.sidebarTab).toBe('assistants');
    expect(next.extensionSettingsOpenMode).toBe('workspace');
    expect(displaySettings.loadDisplaySettings().sidebarTab).toBe('assistants');

    await waitFor(() => {
      expect(storageState.get(STORAGE_KEY)).toEqual(expect.objectContaining({
        sidebarTab: 'assistants',
        sidebarCollapsed: false,
        clickAssistantToShowTopic: true,
        extensionSettingsOpenMode: 'workspace',
      }));
    });
  });

  it('normalizes the extension settings open mode without changing the display-settings key', async () => {
    setStoredValue(STORAGE_KEY, makeDisplaySettings({ extensionSettingsOpenMode: 'invalid-mode' }));

    const displaySettings = await import('./display-settings');
    displaySettings.applyInitialDisplaySettings();

    await waitFor(() => {
      expect(displaySettings.loadDisplaySettings().extensionSettingsOpenMode).toBe('dialog');
    });

    displaySettings.updateDisplaySettings({ extensionSettingsOpenMode: 'workspace' });

    await waitFor(() => {
      expect(storageState.get(STORAGE_KEY)).toEqual(expect.objectContaining({
        extensionSettingsOpenMode: 'workspace',
      }));
    });
  });

  it('does not write a root glass attribute when display settings change', async () => {
    const displaySettings = await import('./display-settings');

    displaySettings.applyInitialDisplaySettings();
    expect(document.documentElement.hasAttribute('data-glass')).toBe(false);

    displaySettings.updateDisplaySettings({ sidebarCollapsed: true });

    expect(document.documentElement.hasAttribute('data-glass')).toBe(false);
  });

  it('subscription callbacks read the refreshed cache and do not bounce back to topics', async () => {
    const displaySettings = await import('./display-settings');
    const seenTabs: string[] = [];
    const unsubscribe = displaySettings.subscribeDisplaySettingsChange(() => {
      seenTabs.push(displaySettings.loadDisplaySettings().sidebarTab);
    });

    displaySettings.updateDisplaySettings({ sidebarTab: 'assistants' });

    await waitFor(() => {
      expect(seenTabs.length).toBeGreaterThan(0);
    });

    expect(seenTabs).not.toContain('topics');
    expect(seenTabs.at(-1)).toBe('assistants');
    unsubscribe();
  });

  it('keeps assistant tab selected across top-tab and choose-assistant entrypoints', async () => {
    const displaySettings = await import('./display-settings');

        /**
     * 测试辅助函数：`SidebarTabHarness`。
     *
     * @remarks
     * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
     */
    function SidebarTabHarness({
      display,
    }: {
      display: typeof import('./display-settings');
    }) {
      const [tab, setTab] = useState(() => display.loadDisplaySettings().sidebarTab);

      useEffect(() => display.subscribeDisplaySettingsChange(() => {
        setTab(display.loadDisplaySettings().sidebarTab);
      }), [display]);

            /**
       * 测试辅助函数：`focusAssistantTab`。
       *
       * @remarks
       * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
       */
      const focusAssistantTab = () => {
        setTab('assistants');
        display.updateDisplaySettings({
          sidebarCollapsed: false,
          sidebarTab: 'assistants',
        });
      };

      return (
        <div>
          <button type="button" onClick={focusAssistantTab}>顶部助手</button>
          <button type="button" onClick={focusAssistantTab}>选择助手</button>
          <div data-testid="sidebar-tab">{tab}</div>
        </div>
      );
    }

    render(<SidebarTabHarness display={displaySettings} />);

    expect(screen.getByTestId('sidebar-tab')).toHaveTextContent('topics');

    fireEvent.click(screen.getByRole('button', { name: '顶部助手' }));
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-tab')).toHaveTextContent('assistants');
    });

    fireEvent.click(screen.getByRole('button', { name: '选择助手' }));
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-tab')).toHaveTextContent('assistants');
    });
  });
});
