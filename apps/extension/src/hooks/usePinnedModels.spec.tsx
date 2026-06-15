/**
 * 说明：`usePinnedModels.spec` Hook 测试模块。
 *
 * 职责：
 * - 覆盖置顶模型 hook 的 storage 失败处理；
 * - 确认初始化读取和用户切换写入失败都不会产生未捕获 Promise；
 * - 保证失败时 UI 内存态仍保持可用。
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggerMocks = vi.hoisted(() => ({
  generalWarn: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    general: {
      warn: loggerMocks.generalWarn,
    },
  },
}));

type ChromeStorageMockOptions = {
  failGet?: boolean;
  failSet?: boolean;
  initialPinned?: string[];
};

/**
 * 创建置顶模型 hook 使用的 chrome.storage mock。
 *
 * @param options - 读取 / 写入失败开关与初始值。
 * @returns 模拟的 Chrome API。
 */
function createChromeStorageMock(options: ChromeStorageMockOptions): typeof chrome {
  let lastError: { message?: string } | undefined;
  const state: Record<string, unknown> = {
    'olyq.models.pinned.v1': options.initialPinned ?? [],
  };
  const listeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void>();

  return {
    runtime: {
      /** 返回当前 callback 窗口内暴露的 runtime.lastError。 */
      get lastError() {
        return lastError;
      },
    },
    storage: {
      local: {
        get: vi.fn((keys: string[], callback: (result: Record<string, unknown>) => void) => {
          if (options.failGet) {
            lastError = { message: 'storage read failed' };
            callback({});
            lastError = undefined;
            return;
          }
          const result: Record<string, unknown> = {};
          for (const key of keys) {
            if (key in state) result[key] = state[key];
          }
          callback(result);
        }),
        set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
          if (options.failSet) {
            lastError = { message: 'storage write failed' };
            callback?.();
            lastError = undefined;
            return;
          }
          const changes: Record<string, chrome.storage.StorageChange> = {};
          for (const [key, value] of Object.entries(items)) {
            changes[key] = { oldValue: state[key], newValue: value };
            state[key] = value;
          }
          for (const listener of listeners) listener(changes, 'local');
          callback?.();
        }),
        remove: vi.fn((_keys: string[], callback?: () => void) => {
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
  } as unknown as typeof chrome;
}

describe('usePinnedModels', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    loggerMocks.generalWarn.mockReset();
  });

  it('初始化读取失败时结束 loading 并记录后台 storage 诊断', async () => {
    vi.stubGlobal('chrome', createChromeStorageMock({ failGet: true }));
    const { usePinnedModels } = await import('./usePinnedModels');

    const { result } = renderHook(() => usePinnedModels());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pinnedModels).toEqual([]);
    expect(loggerMocks.generalWarn).toHaveBeenCalledWith('background storage operation failed', {
      key: 'olyq.models.pinned.v1',
      operation: 'get',
      owner: 'usePinnedModels.reload',
      error: 'I18nError: errors.chromeStorageFailedWithDetail',
    });
  });

  it('切换置顶写入失败时保留本地 UI 状态并记录诊断', async () => {
    vi.stubGlobal('chrome', createChromeStorageMock({ failSet: true, initialPinned: [] }));
    const { usePinnedModels } = await import('./usePinnedModels');

    const { result } = renderHook(() => usePinnedModels());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.togglePinnedModel('openai/gpt-4o');
    });

    expect(result.current.pinnedModels).toEqual(['openai/gpt-4o']);
    expect(loggerMocks.generalWarn).toHaveBeenCalledWith('background storage operation failed', {
      key: 'olyq.models.pinned.v1',
      operation: 'set',
      owner: 'usePinnedModels.togglePinnedModel',
      error: 'I18nError: errors.chromeStorageFailedWithDetail',
    });
  });
});
