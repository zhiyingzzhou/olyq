/**
 * 说明：`json-storage` 基础能力模块。
 *
 * 职责：
 * - 承载 `json-storage` 相关的当前文件实现与模块边界；
 * - 对外暴露 `writeBootstrapStoredJsonMirror`、`removeBootstrapStoredJsonMirror`、`readBootstrapStoredJsonSeed` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { getStorageAdapter } from '@/lib/storage/storage-adapter';
import { consumeBackgroundStoragePromise } from '@/lib/storage/background-storage';
import {
  BOOTSTRAP_MIRROR_SHARED_STORAGE_KEYS,
  SHARED_STORAGE_CONTRACT_BY_KEY,
} from '@/lib/data-contracts/registry';

const BOOTSTRAP_MIRROR_PREFIX = '__olyq.bootstrap__.';
const BOOTSTRAP_MIRROR_SCHEMA_VERSION = 1;
const BOOTSTRAP_MIRROR_TTL_MS = 24 * 60 * 60 * 1000;
const BOOTSTRAP_MIRROR_ALLOWED_LOCAL_KEYS = new Set([
  'olyq.paint.workspace.v1',
]);
const BOOTSTRAP_MIRROR_SHARED_STORAGE_KEY_SET = new Set(BOOTSTRAP_MIRROR_SHARED_STORAGE_KEYS);

type BootstrapMirrorEnvelope = {
  schemaVersion: number;
  expiresAt: number;
  value: unknown;
};

/**
 * 内部函数：`hasLocalStorage`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function hasLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/**
 * 内部函数：`hasChromeStorage`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

/**
 * 内部函数：`getBootstrapMirrorKey`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function getBootstrapMirrorKey(key: string): string {
  return `${BOOTSTRAP_MIRROR_PREFIX}${key}`;
}

/**
 * 判断某个 key 是否允许写入 localStorage bootstrap mirror。
 *
 * 说明：
 * - shared-storage key 必须先登记 Data Contract Registry，且只能是非敏感、非
 *   `encrypted-secret` 的配置；
 * - IndexedDB / workspace 等非 shared-storage 冷启动快照必须显式列入本文件的
 *   非敏感 allowlist；
 * - 未登记 key 默认拒绝写入，避免把密钥或临时状态复制到 localStorage。
 */
function canWriteBootstrapMirror(key: string): boolean {
  const contract = SHARED_STORAGE_CONTRACT_BY_KEY.get(key);
  if (contract) {
    return contract.bootstrapMirror === 'allowed'
      && BOOTSTRAP_MIRROR_SHARED_STORAGE_KEY_SET.has(key)
      && !contract.sensitive
      && contract.syncPolicy !== 'encrypted-secret';
  }
  return BOOTSTRAP_MIRROR_ALLOWED_LOCAL_KEYS.has(key);
}

/**
 * 内部函数：`isBootstrapMirrorEnvelope`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function isBootstrapMirrorEnvelope(value: unknown): value is BootstrapMirrorEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.schemaVersion === 'number'
    && Number.isFinite(record.schemaVersion)
    && typeof record.expiresAt === 'number'
    && Number.isFinite(record.expiresAt)
    && 'value' in record
  );
}

/**
 * 导出函数：`writeBootstrapStoredJsonMirror`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function writeBootstrapStoredJsonMirror(key: string, value: unknown): void {
  if (!hasLocalStorage()) return;
  const storageKey = String(key || '').trim();
  if (!storageKey) return;
  if (!canWriteBootstrapMirror(storageKey)) {
    removeBootstrapMirror(storageKey);
    return;
  }
  try {
    window.localStorage.setItem(
      getBootstrapMirrorKey(storageKey),
      JSON.stringify({
        schemaVersion: BOOTSTRAP_MIRROR_SCHEMA_VERSION,
        expiresAt: Date.now() + BOOTSTRAP_MIRROR_TTL_MS,
        value,
      } satisfies BootstrapMirrorEnvelope),
    );
  } catch {
    // ignore bootstrap mirror write failures
  }
}

/**
 * 内部函数：`removeBootstrapMirror`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function removeBootstrapMirror(key: string): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(getBootstrapMirrorKey(key));
  } catch {
    // ignore bootstrap mirror cleanup failures
  }
}

/**
 * 导出函数：`removeBootstrapStoredJsonMirror`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function removeBootstrapStoredJsonMirror(key: string): void {
  removeBootstrapMirror(key);
}

/**
 * 导出函数：`readBootstrapStoredJsonSeed`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function readBootstrapStoredJsonSeed<T>(
  key: string,
  fallback: T,
  coerce?: (raw: unknown) => T,
): T {
  if (!hasLocalStorage()) return fallback;
  const storageKey = String(key || '').trim();
  if (!storageKey) return fallback;

  try {
    const raw = window.localStorage.getItem(getBootstrapMirrorKey(storageKey));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (isBootstrapMirrorEnvelope(parsed)) {
      if (
        parsed.schemaVersion !== BOOTSTRAP_MIRROR_SCHEMA_VERSION
        || parsed.expiresAt <= Date.now()
      ) {
        removeBootstrapMirror(storageKey);
        return fallback;
      }
      return coerce ? coerce(parsed.value) : (parsed.value as T);
    }
    return coerce ? coerce(parsed) : (parsed as T);
  } catch {
    return fallback;
  }
}

/**
 * 导出函数：`readStoredJson`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function readStoredJson<T>(
  key: string,
  fallback: T,
  coerce?: (raw: unknown) => T,
): Promise<T> {
  const storageKey = String(key || '').trim();
  if (!storageKey) return fallback;

  const storage = getStorageAdapter();
  if (typeof storage.get === 'function') {
    try {
      const result = await storage.get([storageKey]);
      if (storageKey in result) {
        const value = coerce ? coerce(result[storageKey]) : (result[storageKey] as T);
        return value;
      }
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * 读取共享 JSON 配置并同步维护 bootstrap mirror。
 *
 * 说明：
 * - 只允许 bootstrap owner 调用；
 * - 命中共享存储时会按 Data Contract Registry 的 mirror 策略写入或清理
 *   `localStorage` 镜像；
 * - 普通 `readStoredJson()` 永不碰 `localStorage`，避免 secret / cache 状态
 *   通过泛型读路径进入明文 bootstrap mirror。
 *
 * @param key - 共享 JSON 配置 key。
 * @param fallback - key 缺失或不可读时的回退值。
 * @param coerce - 原始值规整器。
 * @returns 规整后的值。
 */
export async function readStoredJsonWithBootstrapMirror<T>(
  key: string,
  fallback: T,
  coerce?: (raw: unknown) => T,
): Promise<T> {
  const storageKey = String(key || '').trim();
  if (!storageKey) return fallback;

  const storage = getStorageAdapter();
  if (typeof storage.get === 'function') {
    try {
      const result = await storage.get([storageKey]);
      if (storageKey in result) {
        const value = coerce ? coerce(result[storageKey]) : (result[storageKey] as T);
        writeBootstrapStoredJsonMirror(storageKey, value);
        return value;
      }
    } catch {
      return fallback;
    }
  }
  if (!hasChromeStorage()) {
    return readBootstrapStoredJsonSeed(storageKey, fallback, coerce);
  }
  return fallback;
}

/**
 * 导出函数：`writeStoredJson`。
 *
 * @remarks
 * 普通 shared-storage 写入只更新主存储，不维护 localStorage mirror；需要首帧
 * bootstrap 的模块必须显式走 `writeStoredJsonWithBootstrapMirror()`。
 */
export async function writeStoredJson(key: string, value: unknown): Promise<void> {
  const storageKey = String(key || '').trim();
  if (!storageKey) return;
  const storage = getStorageAdapter();
  if (typeof storage.set === 'function') {
    await storage.set({ [storageKey]: value });
  }
}

/**
 * 写入共享 JSON 配置并同步维护 bootstrap mirror。
 *
 * 说明：
 * - 这是 bootstrap mirror 的唯一高层写入口；
 * - mirror 写入仍会经过 Data Contract Registry allowlist，敏感、cache、未登记 key
 *   会清理既有 mirror 而不是写入；
 * - Provider API Key rotation 等可重建状态继续只走 `writeStoredJson()`。
 *
 * @param key - 共享 JSON 配置 key。
 * @param value - 待写入的 JSON 值。
 */
export async function writeStoredJsonWithBootstrapMirror(key: string, value: unknown): Promise<void> {
  const storageKey = String(key || '').trim();
  if (!storageKey) return;
  await writeStoredJson(storageKey, value);
  writeBootstrapStoredJsonMirror(storageKey, value);
}

/**
 * 在后台写入共享 JSON 配置，并显式消费持久化失败。
 *
 * 说明：
 * - 只用于 UI 已经完成内存态更新、落盘作为异步副作用的场景；
 * - 不改变 `writeStoredJson()` 的失败语义，仍允许关键流程通过 `await` 感知存储失败；
 * - 捕获失败后记录结构化诊断，避免 Chrome 把 fire-and-forget 写入抛成 `Uncaught (in promise)`。
 *
 * @param key - 共享 JSON 配置 key。
 * @param value - 待写入的值。
 * @param owner - 发起后台写入的模块名，便于定位诊断。
 */
export function writeStoredJsonInBackground(key: string, value: unknown, owner: string): void {
  consumeBackgroundStoragePromise(writeStoredJson(key, value), {
    key,
    owner,
    operation: 'write-json',
  });
}

/**
 * 在后台写入共享 JSON 配置，并同步维护 bootstrap mirror。
 *
 * @param key - 共享 JSON 配置 key。
 * @param value - 待写入的 JSON 值。
 * @param owner - 发起后台写入的模块名。
 */
export function writeStoredJsonWithBootstrapMirrorInBackground(key: string, value: unknown, owner: string): void {
  consumeBackgroundStoragePromise(writeStoredJsonWithBootstrapMirror(key, value), {
    key,
    owner,
    operation: 'write-json-with-bootstrap-mirror',
  });
}

/**
 * 导出函数：`removeStoredJson`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function removeStoredJson(key: string): Promise<void> {
  const storageKey = String(key || '').trim();
  if (!storageKey) return;
  const storage = getStorageAdapter();
  if (typeof storage.remove === 'function') {
    await storage.remove([storageKey]);
  }
  removeBootstrapMirror(storageKey);
}

/**
 * 导出函数：`subscribeStoredKeys`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function subscribeStoredKeys(
  keys: readonly string[],
  callback: (changedKeys: string[]) => void,
): () => void {
  const keySet = new Set(keys.map((key) => String(key || '').trim()).filter(Boolean));
  if (keySet.size < 1) return () => {};
  const storage = getStorageAdapter();
  if (typeof storage.onChange !== 'function') return () => {};
  return storage.onChange((changes) => {
    const changedKeys = Object.keys(changes).filter((key) => keySet.has(key));
    if (changedKeys.length > 0) callback(changedKeys);
  });
}
