/**
 * 说明：`json-storage.spec` 基础能力模块。
 *
 * 职责：
 * - 承载 `json-storage.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
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
            callback(pickResult(keys));
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

describe('json-storage bootstrap mirror', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    vi.unstubAllGlobals();
    loggerMocks.generalWarn.mockReset();
  });

  it('writeStoredJson 会写入带 schema 和 TTL 的 bootstrap mirror', async () => {
    const { chromeMock } = createChromeStorageMock({});
    vi.stubGlobal('chrome', chromeMock);

    const { writeStoredJson } = await import('./json-storage');
    await writeStoredJson('olyq.demo.v1', { enabled: true });

    const raw = JSON.parse(localStorage.getItem('__olyq.bootstrap__.olyq.demo.v1') || 'null') as {
      schemaVersion: number;
      expiresAt: number;
      value: { enabled: boolean };
    } | null;

    expect(raw).not.toBeNull();
    expect(raw?.schemaVersion).toBe(1);
    expect(raw?.value).toEqual({ enabled: true });
    expect(raw?.expiresAt).toBeGreaterThan(Date.now());
  });

  it('readBootstrapStoredJsonSeed 会忽略过期 mirror 并清理脏缓存', async () => {
    localStorage.setItem('__olyq.bootstrap__.olyq.demo.v1', JSON.stringify({
      schemaVersion: 1,
      expiresAt: Date.now() - 1_000,
      value: 'stale',
    }));

    const { readBootstrapStoredJsonSeed } = await import('./json-storage');
    expect(readBootstrapStoredJsonSeed('olyq.demo.v1', 'fallback')).toBe('fallback');
    expect(localStorage.getItem('__olyq.bootstrap__.olyq.demo.v1')).toBeNull();
  });

  it('readStoredJson 不会再从 raw localStorage 真源回灌共享存储', async () => {
    localStorage.setItem('olyq.demo.v1', JSON.stringify('legacy-source'));
    const { chromeMock, state } = createChromeStorageMock({});
    vi.stubGlobal('chrome', chromeMock);

    const { readStoredJson } = await import('./json-storage');
    const value = await readStoredJson('olyq.demo.v1', 'fallback');

    expect(value).toBe('fallback');
    expect(state).not.toHaveProperty('olyq.demo.v1');
    expect(localStorage.getItem('olyq.demo.v1')).toBe(JSON.stringify('legacy-source'));
  });

  it('writeStoredJsonInBackground 会消费 chrome.storage 写入失败，避免未捕获 Promise', async () => {
    const { chromeMock } = createChromeStorageMock({});
    const mutableChromeMock = chromeMock as unknown as {
      runtime: { lastError?: { message?: string } };
      storage: { local: { set: ReturnType<typeof vi.fn> } };
    };
    mutableChromeMock.storage.local.set = vi.fn((_items: Record<string, unknown>, callback?: () => void) => {
      mutableChromeMock.runtime.lastError = { message: 'Extension context invalidated.' };
      callback?.();
      mutableChromeMock.runtime.lastError = undefined;
    });
    vi.stubGlobal('chrome', chromeMock);

    const { writeStoredJsonInBackground } = await import('./json-storage');
    writeStoredJsonInBackground('olyq.demo.v1', { enabled: true }, 'json-storage.spec');

    await Promise.resolve();
    await Promise.resolve();

    expect(loggerMocks.generalWarn).toHaveBeenCalledWith('background storage operation failed', {
      key: 'olyq.demo.v1',
      owner: 'json-storage.spec',
      operation: 'write-json',
      error: 'I18nError: errors.chromeStorageFailedWithDetail',
    });
  });
});
