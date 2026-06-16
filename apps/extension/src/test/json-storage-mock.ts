/**
 * 说明：`json-storage-mock` 测试工具模块。
 *
 * 职责：
 * - 为 Vitest 中需要替换 `@/lib/storage/json-storage` 的测试提供唯一 mock owner；
 * - 统一模拟 shared JSON storage、bootstrap mirror 与 storage change 订阅；
 * - 防止各 spec 继续手写不完整的 `json-storage` 模块形状。
 *
 * 边界：
 * - 本文件只服务测试环境，不参与生产构建；
 * - mock 只表达 `json-storage` 公共 API 的调用合同，不模拟 Chrome storage 的异步事件时序。
 */
import { vi } from 'vitest';

type JsonStorageMockModule = typeof import('@/lib/storage/json-storage');
type StoredJsonCoerce<T> = (raw: unknown) => T;
type StorageSubscription = {
  keys: Set<string>;
  callback: (changedKeys: string[]) => void;
};

interface JsonStorageMockController {
  storage: Map<string, unknown>;
  bootstrapMirror: Map<string, unknown>;
  readBootstrapStoredJsonSeedMock: ReturnType<typeof vi.fn>;
  writeBootstrapStoredJsonMirrorMock: ReturnType<typeof vi.fn>;
  removeBootstrapStoredJsonMirrorMock: ReturnType<typeof vi.fn>;
  readStoredJsonMock: ReturnType<typeof vi.fn>;
  readStoredJsonWithBootstrapMirrorMock: ReturnType<typeof vi.fn>;
  writeStoredJsonMock: ReturnType<typeof vi.fn>;
  writeStoredJsonWithBootstrapMirrorMock: ReturnType<typeof vi.fn>;
  writeStoredJsonInBackgroundMock: ReturnType<typeof vi.fn>;
  writeStoredJsonWithBootstrapMirrorInBackgroundMock: ReturnType<typeof vi.fn>;
  removeStoredJsonMock: ReturnType<typeof vi.fn>;
  subscribeStoredKeysMock: ReturnType<typeof vi.fn>;
  reset: () => void;
  setStoredValue: (key: string, value: unknown) => void;
  getStoredValue: (key: string) => unknown;
  setBootstrapMirrorValue: (key: string, value: unknown) => void;
  getBootstrapMirrorValue: (key: string) => unknown;
  emitStoredKeysChanged: (keys: readonly string[]) => void;
}

const GLOBAL_KEY = '__olyqJsonStorageMockController';

/**
 * 规整测试 storage key，保持和生产 `json-storage` 一致的空 key 忽略语义。
 *
 * @param key - 原始 storage key。
 * @returns 规整后的 key。
 */
function normalizeStorageKey(key: string): string {
  return String(key || '').trim();
}

/**
 * 对 mock 读出的值执行测试传入的 coerce 回调。
 *
 * @param value - 当前 mock storage 中的原始值。
 * @param coerce - 可选规整器。
 * @returns 规整后的值。
 */
function coerceStoredValue<T>(value: unknown, coerce?: StoredJsonCoerce<T>): T {
  return coerce ? coerce(value) : (value as T);
}

/**
 * 创建全局复用的 `json-storage` mock 控制器。
 *
 * @remarks
 * 部分 spec 会调用 `vi.resetModules()` 重新导入被测模块；控制器必须挂在
 * `globalThis` 上，确保 mock factory 重新 import 本文件时仍拿到同一组 `vi.fn()`。
 *
 * @returns 可被测试文件和 mock factory 共享的控制器。
 */
function createJsonStorageMockController(): JsonStorageMockController {
  const storage = new Map<string, unknown>();
  const bootstrapMirror = new Map<string, unknown>();
  const subscriptions = new Set<StorageSubscription>();

  const readBootstrapStoredJsonSeed = <T>(
    key: string,
    fallback: T,
    coerce?: StoredJsonCoerce<T>,
  ): T => {
    const storageKey = normalizeStorageKey(key);
    if (!storageKey) return fallback;
    if (bootstrapMirror.has(storageKey)) {
      return coerceStoredValue(bootstrapMirror.get(storageKey), coerce);
    }
    if (storage.has(storageKey)) {
      return coerceStoredValue(storage.get(storageKey), coerce);
    }
    return fallback;
  };

  const writeBootstrapStoredJsonMirror = (key: string, value: unknown): void => {
    const storageKey = normalizeStorageKey(key);
    if (!storageKey) return;
    bootstrapMirror.set(storageKey, value);
  };

  const removeBootstrapStoredJsonMirror = (key: string): void => {
    const storageKey = normalizeStorageKey(key);
    if (!storageKey) return;
    bootstrapMirror.delete(storageKey);
  };

  const readStoredJson = async <T>(
    key: string,
    fallback: T,
    coerce?: StoredJsonCoerce<T>,
  ): Promise<T> => {
    const storageKey = normalizeStorageKey(key);
    if (!storageKey || !storage.has(storageKey)) return fallback;
    return coerceStoredValue(storage.get(storageKey), coerce);
  };

  const readStoredJsonWithBootstrapMirror = async <T>(
    key: string,
    fallback: T,
    coerce?: StoredJsonCoerce<T>,
  ): Promise<T> => {
    const storageKey = normalizeStorageKey(key);
    if (!storageKey) return fallback;
    if (storage.has(storageKey)) {
      const value = coerceStoredValue(storage.get(storageKey), coerce);
      bootstrapMirror.set(storageKey, value);
      return value;
    }
    if (bootstrapMirror.has(storageKey)) {
      return coerceStoredValue(bootstrapMirror.get(storageKey), coerce);
    }
    return fallback;
  };

  const writeStoredJson = async (key: string, value: unknown): Promise<void> => {
    const storageKey = normalizeStorageKey(key);
    if (!storageKey) return;
    storage.set(storageKey, value);
  };

  const writeStoredJsonWithBootstrapMirror = async (key: string, value: unknown): Promise<void> => {
    const storageKey = normalizeStorageKey(key);
    if (!storageKey) return;
    storage.set(storageKey, value);
    bootstrapMirror.set(storageKey, value);
  };

  const writeStoredJsonInBackground = (key: string, value: unknown, _owner: string): void => {
    const storageKey = normalizeStorageKey(key);
    if (!storageKey) return;
    storage.set(storageKey, value);
  };

  const writeStoredJsonWithBootstrapMirrorInBackground = (
    key: string,
    value: unknown,
    _owner: string,
  ): void => {
    const storageKey = normalizeStorageKey(key);
    if (!storageKey) return;
    storage.set(storageKey, value);
    bootstrapMirror.set(storageKey, value);
  };

  const removeStoredJson = async (key: string): Promise<void> => {
    const storageKey = normalizeStorageKey(key);
    if (!storageKey) return;
    storage.delete(storageKey);
    bootstrapMirror.delete(storageKey);
  };

  const subscribeStoredKeys = (
    keys: readonly string[],
    callback: (changedKeys: string[]) => void,
  ): (() => void) => {
    const normalizedKeys = new Set(keys.map(normalizeStorageKey).filter(Boolean));
    if (normalizedKeys.size < 1) return () => undefined;
    const subscription = { keys: normalizedKeys, callback };
    subscriptions.add(subscription);
    return () => {
      subscriptions.delete(subscription);
    };
  };

  const readBootstrapStoredJsonSeedMock = vi.fn(readBootstrapStoredJsonSeed);
  const writeBootstrapStoredJsonMirrorMock = vi.fn(writeBootstrapStoredJsonMirror);
  const removeBootstrapStoredJsonMirrorMock = vi.fn(removeBootstrapStoredJsonMirror);
  const readStoredJsonMock = vi.fn(readStoredJson);
  const readStoredJsonWithBootstrapMirrorMock = vi.fn(readStoredJsonWithBootstrapMirror);
  const writeStoredJsonMock = vi.fn(writeStoredJson);
  const writeStoredJsonWithBootstrapMirrorMock = vi.fn(writeStoredJsonWithBootstrapMirror);
  const writeStoredJsonInBackgroundMock = vi.fn(writeStoredJsonInBackground);
  const writeStoredJsonWithBootstrapMirrorInBackgroundMock = vi.fn(writeStoredJsonWithBootstrapMirrorInBackground);
  const removeStoredJsonMock = vi.fn(removeStoredJson);
  const subscribeStoredKeysMock = vi.fn(subscribeStoredKeys);

  /**
   * 重新安装默认 mock 实现。
   *
   * @remarks
   * 部分测试会调用 `vi.restoreAllMocks()`；这里确保下一轮 `reset()` 不只清理调用计数，
   * 也能恢复 storage mock 的读写行为。
   */
  const installDefaultImplementations = () => {
    readBootstrapStoredJsonSeedMock.mockImplementation(readBootstrapStoredJsonSeed);
    writeBootstrapStoredJsonMirrorMock.mockImplementation(writeBootstrapStoredJsonMirror);
    removeBootstrapStoredJsonMirrorMock.mockImplementation(removeBootstrapStoredJsonMirror);
    readStoredJsonMock.mockImplementation(readStoredJson);
    readStoredJsonWithBootstrapMirrorMock.mockImplementation(readStoredJsonWithBootstrapMirror);
    writeStoredJsonMock.mockImplementation(writeStoredJson);
    writeStoredJsonWithBootstrapMirrorMock.mockImplementation(writeStoredJsonWithBootstrapMirror);
    writeStoredJsonInBackgroundMock.mockImplementation(writeStoredJsonInBackground);
    writeStoredJsonWithBootstrapMirrorInBackgroundMock.mockImplementation(writeStoredJsonWithBootstrapMirrorInBackground);
    removeStoredJsonMock.mockImplementation(removeStoredJson);
    subscribeStoredKeysMock.mockImplementation(subscribeStoredKeys);
  };

  return {
    storage,
    bootstrapMirror,
    readBootstrapStoredJsonSeedMock,
    writeBootstrapStoredJsonMirrorMock,
    removeBootstrapStoredJsonMirrorMock,
    readStoredJsonMock,
    readStoredJsonWithBootstrapMirrorMock,
    writeStoredJsonMock,
    writeStoredJsonWithBootstrapMirrorMock,
    writeStoredJsonInBackgroundMock,
    writeStoredJsonWithBootstrapMirrorInBackgroundMock,
    removeStoredJsonMock,
    subscribeStoredKeysMock,
    reset: () => {
      storage.clear();
      bootstrapMirror.clear();
      subscriptions.clear();
      readBootstrapStoredJsonSeedMock.mockClear();
      writeBootstrapStoredJsonMirrorMock.mockClear();
      removeBootstrapStoredJsonMirrorMock.mockClear();
      readStoredJsonMock.mockClear();
      readStoredJsonWithBootstrapMirrorMock.mockClear();
      writeStoredJsonMock.mockClear();
      writeStoredJsonWithBootstrapMirrorMock.mockClear();
      writeStoredJsonInBackgroundMock.mockClear();
      writeStoredJsonWithBootstrapMirrorInBackgroundMock.mockClear();
      removeStoredJsonMock.mockClear();
      subscribeStoredKeysMock.mockClear();
      installDefaultImplementations();
    },
    setStoredValue: (key: string, value: unknown) => {
      const storageKey = normalizeStorageKey(key);
      if (!storageKey) return;
      storage.set(storageKey, value);
    },
    getStoredValue: (key: string) => storage.get(normalizeStorageKey(key)),
    setBootstrapMirrorValue: (key: string, value: unknown) => {
      const storageKey = normalizeStorageKey(key);
      if (!storageKey) return;
      bootstrapMirror.set(storageKey, value);
    },
    getBootstrapMirrorValue: (key: string) => bootstrapMirror.get(normalizeStorageKey(key)),
    emitStoredKeysChanged: (keys: readonly string[]) => {
      const normalizedChangedKeys = keys.map(normalizeStorageKey).filter(Boolean);
      for (const subscription of subscriptions) {
        const matchedKeys = normalizedChangedKeys.filter((key) => subscription.keys.has(key));
        if (matchedKeys.length > 0) subscription.callback(matchedKeys);
      }
    },
  };
}

const globalStorageMock = globalThis as typeof globalThis & {
  [GLOBAL_KEY]?: JsonStorageMockController;
};

/**
 * `json-storage` 测试 mock 的唯一控制器。
 */
export const jsonStorageMock = globalStorageMock[GLOBAL_KEY] ??= createJsonStorageMockController();

/**
 * 创建供 `vi.mock('@/lib/storage/json-storage')` 返回的完整模块形状。
 *
 * @returns 与生产 `json-storage` 公共导出保持一致的 mock 模块。
 */
export function createJsonStorageMockModule(): JsonStorageMockModule {
  return {
    readBootstrapStoredJsonSeed: <T>(
      key: string,
      fallback: T,
      coerce?: StoredJsonCoerce<T>,
    ): T => (
      jsonStorageMock.readBootstrapStoredJsonSeedMock(key, fallback, coerce) as T
    ),
    writeBootstrapStoredJsonMirror: (key: string, value: unknown): void => {
      jsonStorageMock.writeBootstrapStoredJsonMirrorMock(key, value);
    },
    removeBootstrapStoredJsonMirror: (key: string): void => {
      jsonStorageMock.removeBootstrapStoredJsonMirrorMock(key);
    },
    readStoredJson: <T>(
      key: string,
      fallback: T,
      coerce?: StoredJsonCoerce<T>,
    ): Promise<T> => (
      jsonStorageMock.readStoredJsonMock(key, fallback, coerce) as Promise<T>
    ),
    readStoredJsonWithBootstrapMirror: <T>(
      key: string,
      fallback: T,
      coerce?: StoredJsonCoerce<T>,
    ): Promise<T> => (
      jsonStorageMock.readStoredJsonWithBootstrapMirrorMock(key, fallback, coerce) as Promise<T>
    ),
    writeStoredJson: (key: string, value: unknown): Promise<void> => (
      jsonStorageMock.writeStoredJsonMock(key, value) as Promise<void>
    ),
    writeStoredJsonWithBootstrapMirror: (key: string, value: unknown): Promise<void> => (
      jsonStorageMock.writeStoredJsonWithBootstrapMirrorMock(key, value) as Promise<void>
    ),
    writeStoredJsonInBackground: (key: string, value: unknown, owner: string): void => {
      jsonStorageMock.writeStoredJsonInBackgroundMock(key, value, owner);
    },
    writeStoredJsonWithBootstrapMirrorInBackground: (key: string, value: unknown, owner: string): void => {
      jsonStorageMock.writeStoredJsonWithBootstrapMirrorInBackgroundMock(key, value, owner);
    },
    removeStoredJson: (key: string): Promise<void> => (
      jsonStorageMock.removeStoredJsonMock(key) as Promise<void>
    ),
    subscribeStoredKeys: (
      keys: readonly string[],
      callback: (changedKeys: string[]) => void,
    ): (() => void) => (
      jsonStorageMock.subscribeStoredKeysMock(keys, callback) as () => void
    ),
  };
}
