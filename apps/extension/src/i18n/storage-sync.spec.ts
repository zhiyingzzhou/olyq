/**
 * 说明：`storage-sync.spec` 国际化模块。
 *
 * 职责：
 * - 承载 `storage-sync.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'olyq.language.v1';
const BOOTSTRAP_MIRROR_KEY = '__olyq.bootstrap__.olyq.language.v1';

/**
 * 测试辅助函数：`readBootstrapMirrorValue`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function readBootstrapMirrorValue(): unknown {
  const raw = localStorage.getItem(BOOTSTRAP_MIRROR_KEY);
  if (!raw) return undefined;
  const parsed = JSON.parse(raw) as { value?: unknown };
  return Object.prototype.hasOwnProperty.call(parsed, 'value') ? parsed.value : parsed;
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

describe('i18n storage sync', () => {
  beforeEach(() => {
    localStorage.clear();
    resetI18nGlobals();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('扩展环境下会用 storage adapter 覆盖 bootstrap mirror', async () => {
    localStorage.setItem(BOOTSTRAP_MIRROR_KEY, JSON.stringify('zh-CN'));
    const { chromeMock } = createChromeStorageMock({
      [STORAGE_KEY]: 'en-US',
    });
    vi.stubGlobal('chrome', chromeMock);

    const mod = await import('./index');

    expect(mod.getStoredLanguage()).toBe('zh-CN');

    await waitFor(() => {
      expect(mod.getCurrentLanguage()).toBe('en-US');
    });

    expect(readBootstrapMirrorValue()).toBe('en-US');
  });

  it('setLanguage 会写入统一存储层并立即切换语言', async () => {
    const { chromeMock, state } = createChromeStorageMock({
      [STORAGE_KEY]: 'zh-CN',
    });
    vi.stubGlobal('chrome', chromeMock);

    const mod = await import('./index');

    await waitFor(() => {
      expect(mod.getCurrentLanguage()).toBe('zh-CN');
    });

    mod.setLanguage('en-US');

    await waitFor(() => {
      expect(mod.getCurrentLanguage()).toBe('en-US');
      expect(state[STORAGE_KEY]).toBe('en-US');
    });
  });
});
