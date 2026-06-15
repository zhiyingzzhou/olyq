/**
 * 说明：`storage-engine` 持久化模块。
 *
 * 职责：
 * - 承载 `storage-engine` 相关的当前文件实现与模块边界；
 * - 对外暴露 `StorageEngineBackend`、`storageEngine` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { getStorageAdapter } from '@/lib/storage/storage-adapter';

/** 导出类型：`StorageEngineBackend`。 */
export type StorageEngineBackend = 'chrome-storage-local' | 'local-storage';

/**
 * 判断当前上下文是否可以访问 `window.localStorage`。
 *
 * @remarks
 * MV3 service worker、测试宿主和无 DOM 的上下文都可能没有 `window`；
 * 存储引擎需要先做能力探测，避免把“环境不支持”误判成真正的写入失败。
 */
function hasLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/**
 * 清洗调用方提交的键集合。
 *
 * @param keys - 原始键列表。
 * @returns 去掉空白键后的稳定数组。
 */
function assertKeys(keys: readonly string[]): string[] {
  return keys.map((key) => String(key || '').trim()).filter(Boolean);
}

/**
 * 从 `chrome.storage.local` 读取一组键。
 *
 * @remarks
 * 这里不做 schema 解析，只负责按键取值；
 * 域级别的合法性校验应继续由上层 descriptor 承担。
 */
async function readChromeStorage(keys: readonly string[]): Promise<Record<string, unknown>> {
  const keyList = assertKeys(keys);
  if (keyList.length < 1) return {};
  return await getStorageAdapter().get(keyList);
}

/**
 * 批量写入 `chrome.storage.local`。
 */
async function writeChromeStorage(items: Record<string, unknown>): Promise<void> {
  const entries = Object.entries(items).filter(([key]) => String(key || '').trim());
  if (entries.length < 1) return;
  await getStorageAdapter().set(Object.fromEntries(entries));
}

/**
 * 删除 `chrome.storage.local` 中的一组键。
 */
async function deleteChromeStorage(keys: readonly string[]): Promise<void> {
  const keyList = assertKeys(keys);
  if (keyList.length < 1) return;
  await getStorageAdapter().remove(keyList);
}

/**
 * 从 `localStorage` 读取字符串镜像。
 *
 * @remarks
 * 本项目里的 `localStorage` 只承载少量本地镜像和 bootstrap seed；
 * 因此底层引擎按字符串语义读写，不在这里偷偷做 JSON 序列化策略。
 */
function readLocalStorage(keys: readonly string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (!hasLocalStorage()) return out;
  for (const key of assertKeys(keys)) {
    try {
      const value = window.localStorage.getItem(key);
      if (value !== null) out[key] = value;
    } catch {
      out[key] = null;
    }
  }
  return out;
}

/**
 * 写入 `localStorage` 字符串快照。
 *
 * @remarks
 * 浏览器可能因为配额、隐私模式或宿主策略拒绝同步写入；
 * 这里保持 best-effort，避免镜像层异常反过来拖死真正的持久化主流程。
 */
function writeLocalStorage(items: Record<string, string | null>): void {
  if (!hasLocalStorage()) return;
  for (const [key, value] of Object.entries(items)) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) continue;
    try {
      if (value === null) window.localStorage.removeItem(normalizedKey);
      else window.localStorage.setItem(normalizedKey, value);
    } catch {
      // `localStorage` 的失败不改变“真源已写入”的事实，因此这里选择吞掉异常，由上层统一决定是否告警。
    }
  }
}

/**
 * 删除 `localStorage` 中的一组键。
 */
function deleteLocalStorage(keys: readonly string[]): void {
  if (!hasLocalStorage()) return;
  for (const key of assertKeys(keys)) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // 删除镜像失败不应阻断主流程；真正的权威删除结果仍由上层真源决定。
    }
  }
}

/**
 * 导出常量：`storageEngine`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const storageEngine = {
  /**
   * 按后端类型读取当前域拥有的键集合。
   */
  async read(backend: StorageEngineBackend, keys: readonly string[]): Promise<Record<string, unknown>> {
    if (backend === 'chrome-storage-local') return await readChromeStorage(keys);
    return readLocalStorage(keys);
  },

  /**
   * 以“增量写入”语义写入一组键值。
   */
  async write(backend: StorageEngineBackend, items: Record<string, unknown>): Promise<void> {
    if (backend === 'chrome-storage-local') {
      await writeChromeStorage(items);
      return;
    }

    const next: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(items)) {
      // `localStorage` 分支只做字符串镜像；调用方若要保留结构化语义，必须在进入引擎前自行编码。
      next[key] = value === null ? null : String(value);
    }
    writeLocalStorage(next);
  },

  /**
   * 以“权威覆盖”语义替换某个域的完整快照。
   *
   * @remarks
   * 这是 backup/restore 场景最关键的入口：
   * 只有先删除域内缺失键，再写入快照，才能保证 replace 不会退化成增量 merge。
   */
  async replace(
    backend: StorageEngineBackend,
    ownedKeys: readonly string[],
    snapshot: Record<string, unknown>,
  ): Promise<void> {
    const keys = assertKeys(ownedKeys);
    if (backend === 'chrome-storage-local') {
      // 先删后写，保证恢复语义是真正的 authoritative replace。
      const keysToRemove = keys.filter((key) => !(key in snapshot));
      await deleteChromeStorage(keysToRemove);
      await writeChromeStorage(snapshot);
      return;
    }

    const keysToRemove = keys.filter((key) => !(key in snapshot));
    deleteLocalStorage(keysToRemove);
    const next: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(snapshot)) {
      // 本地镜像分支沿用同一套 replace 语义，只是值层退化成字符串。
      next[key] = value === null ? null : String(value);
    }
    writeLocalStorage(next);
  },

  /**
   * 删除某个后端中的一组键。
   */
  async delete(backend: StorageEngineBackend, keys: readonly string[]): Promise<void> {
    if (backend === 'chrome-storage-local') {
      await deleteChromeStorage(keys);
      return;
    }
    deleteLocalStorage(keys);
  },
};
