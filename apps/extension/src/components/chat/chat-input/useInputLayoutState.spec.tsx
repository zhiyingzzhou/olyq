/**
 * 说明：`useInputLayoutState.spec` 组件模块。
 *
 * 职责：
 * - 承载 `useInputLayoutState.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const COMPOSER_SHELL_HEIGHT_KEY = 'olyq.chat.composer-shell-height.v1';

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

  return {
    chromeMock: {
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
    } as unknown as typeof chrome,
    state,
  };
}

describe('useInputLayoutState', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('不会再从 raw localStorage 输入布局真源做兼容迁移', async () => {
    localStorage.setItem(COMPOSER_SHELL_HEIGHT_KEY, '320');
    const { chromeMock, state } = createChromeStorageMock({});
    vi.stubGlobal('chrome', chromeMock);

    const { useInputLayoutState } = await import('./useInputLayoutState');
    const { result } = renderHook(() => useInputLayoutState());

    await waitFor(() => {
      expect(result.current.composerShellHeight).toBe(124);
    });

    expect(state[COMPOSER_SHELL_HEIGHT_KEY]).toBeUndefined();
    expect(localStorage.getItem(COMPOSER_SHELL_HEIGHT_KEY)).toBe('320');
  });

  it('响应共享存储里的 composer shell 高度变化', async () => {
    const { chromeMock, state } = createChromeStorageMock({
      [COMPOSER_SHELL_HEIGHT_KEY]: 240,
    });
    vi.stubGlobal('chrome', chromeMock);

    const { useInputLayoutState } = await import('./useInputLayoutState');
    const { result } = renderHook(() => useInputLayoutState());

    await waitFor(() => {
      expect(result.current.composerShellHeight).toBe(240);
    });

    act(() => {
      chromeMock.storage.local.set({ [COMPOSER_SHELL_HEIGHT_KEY]: 360 });
    });

    await waitFor(() => {
      expect(result.current.composerShellHeight).toBe(360);
      expect(state[COMPOSER_SHELL_HEIGHT_KEY]).toBe(360);
    });
  });

  it('共享存储中的 composer shell 高度统一按紧凑范围归一化', async () => {
    const { chromeMock, state } = createChromeStorageMock({
      [COMPOSER_SHELL_HEIGHT_KEY]: 64,
    });
    vi.stubGlobal('chrome', chromeMock);

    const { useInputLayoutState } = await import('./useInputLayoutState');
    const { result } = renderHook(() => useInputLayoutState());

    await waitFor(() => {
      expect(result.current.composerShellHeight).toBe(104);
    });

    act(() => {
      chromeMock.storage.local.set({ [COMPOSER_SHELL_HEIGHT_KEY]: 800 });
    });

    await waitFor(() => {
      expect(result.current.composerShellHeight).toBe(560);
      expect(state[COMPOSER_SHELL_HEIGHT_KEY]).toBe(800);
    });
  });
});
