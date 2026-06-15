/**
 * 说明：`local-backup-store` 基础能力模块。
 *
 * 职责：
 * - 承载 `local-backup-store` 相关的当前文件实现与模块边界；
 * - 对外暴露 `LocalBackupMeta`、`LocalBackupCacheEntry`、`LocalBackupStats` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createId } from '@/lib/utils/id';
import { requestToPromise, transactionDone } from '@/lib/utils/idb';
import { openManagedIndexedDb } from '@/lib/persistence/indexeddb-engine';

/**
 * 说明：本地备份仓储层。
 *
 * 职责：
 * - 独占 `olyq.local-backup.v1` 这套 IndexedDB 的物理结构；
 * - 提供 `localBackupCache` 与 `exportDir` capability 的纯数据读写能力；
 * - 不参与 ZIP 备份编排、文件导出、后台调度或 UI 语义，避免把仓储层重新耦回上层流程。
 *
 * 边界：
 * - 这里禁止依赖 `backup-archive` / `backup-core` / background / offscreen / 组件层；
 * - 所有返回值都保持“数据对象”语义，不封装业务上的成功/降级状态判断。
 */

/** 单条本地备份缓存的元数据。 */
export type LocalBackupMeta = {
  id: string;
  fileName: string;
  createdAt: number;
  lite: boolean;
  bytes: number;
};

/** 本地备份缓存导入导出时使用的完整条目。 */
export type LocalBackupCacheEntry = {
  meta: LocalBackupMeta;
  blob: Blob;
};

/** 本地备份缓存总体统计信息。 */
export type LocalBackupStats = {
  count: number;
  totalBytes: number;
};

/** `meta` store 的持久化记录结构。 */
type LocalBackupContent = {
  id: string;
  blob: Blob;
};

/** `kv` store 的持久化记录结构。 */
type KvRecord = {
  key: 'exportDir';
  value: FileSystemDirectoryHandle;
};

const DB_NAME = 'olyq.local-backup.v1';
const DB_VERSION = 1;
const STORE_META = 'meta';
const STORE_CONTENT = 'content';
const STORE_KV = 'kv';

/**
 * 打开本地备份专用数据库。
 *
 * @remarks
 * 物理隔离的目的是避免大 blob 与主业务库混放，降低 restore/trim/clear 对业务库的影响面。
 */
async function openLocalBackupDb(): Promise<IDBDatabase> {
  return await openManagedIndexedDb({
    name: DB_NAME,
    version: DB_VERSION,
        /**
     * 内部方法：`upgrade`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_META)) {
        const store = db.createObjectStore(STORE_META, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CONTENT)) {
        db.createObjectStore(STORE_CONTENT, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_KV)) {
        db.createObjectStore(STORE_KV, { keyPath: 'key' });
      }
    },
  });
}

/**
 * 列出 content store 中的所有键。
 *
 * @returns 当前缓存中已持久化的 blob 主键列表。
 */
export async function listLocalBackupContentIds(): Promise<string[]> {
  const db = await openLocalBackupDb();
  const tx = db.transaction([STORE_CONTENT], 'readonly');
  const ids = await requestToPromise(tx.objectStore(STORE_CONTENT).getAllKeys() as IDBRequest<IDBValidKey[]>);
  await transactionDone(tx);
  return ids.map((entry) => String(entry || '').trim()).filter(Boolean);
}

/**
 * 读取本地备份元数据列表。
 *
 * @param limit - 返回条数上限，按 `createdAt desc` 排序。
 * @returns 只包含元数据，不包含大 blob 本体。
 */
export async function listStoredLocalBackups(limit = 50): Promise<LocalBackupMeta[]> {
  const db = await openLocalBackupDb();
  const tx = db.transaction([STORE_META], 'readonly');
  const store = tx.objectStore(STORE_META);
  const idx = store.index('createdAt');
  const out: LocalBackupMeta[] = [];

  await new Promise<void>((resolve, reject) => {
    const req = idx.openCursor(null, 'prev');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const cursor = req.result as IDBCursorWithValue | null;
      if (!cursor) return resolve();
      out.push(cursor.value as LocalBackupMeta);
      if (out.length >= Math.max(1, limit)) return resolve();
      cursor.continue();
    };
  });

  await transactionDone(tx);
  return out;
}

/**
 * 读取单条本地备份的 blob。
 *
 * @param id - 备份 ID。
 * @returns 找到则返回 blob；不存在返回 `null`。
 */
export async function getStoredLocalBackupBlob(id: string): Promise<Blob | null> {
  const key = String(id || '').trim();
  if (!key) return null;
  const db = await openLocalBackupDb();
  const tx = db.transaction([STORE_CONTENT], 'readonly');
  const rec = await requestToPromise(tx.objectStore(STORE_CONTENT).get(key) as IDBRequest<LocalBackupContent | undefined>);
  await transactionDone(tx);
  return rec?.blob ?? null;
}

/**
 * 导出完整本地备份缓存。
 *
 * @remarks
 * 该函数用于注册域 `backup.local-cache` 的备份/恢复，不参与用户业务数据归档。
 */
export async function exportLocalBackupCacheEntries(): Promise<LocalBackupCacheEntry[]> {
  const metas = await listStoredLocalBackups(10_000);
  const entries = await Promise.all(metas.map(async (meta) => ({
    meta,
    blob: await getStoredLocalBackupBlob(meta.id),
  })));

  return entries
    .filter((entry): entry is { meta: LocalBackupMeta; blob: Blob } => entry.blob instanceof Blob)
    .map((entry) => ({ meta: entry.meta, blob: entry.blob }));
}

/**
 * 统计本地备份缓存体积。
 *
 * @returns 条目数与元数据累计字节数。
 */
export async function getLocalBackupStats(): Promise<LocalBackupStats> {
  const metas = await listStoredLocalBackups(10_000);
  return {
    count: metas.length,
    totalBytes: metas.reduce((sum, entry) => sum + Math.max(0, Number(entry.bytes) || 0), 0),
  };
}

/**
 * 写入一条新的本地备份缓存。
 *
 * @param options - 新备份的 blob 与元数据来源。
 * @returns 已写入的元数据快照。
 */
export async function putStoredLocalBackup(options: {
  blob: Blob;
  fileName: string;
  lite: boolean;
}): Promise<LocalBackupMeta> {
  const id = createId();
  const createdAt = Date.now();
  const bytes = options.blob.size;
  const meta: LocalBackupMeta = { id, fileName: options.fileName, createdAt, lite: options.lite, bytes };
  const content: LocalBackupContent = { id, blob: options.blob };

  const db = await openLocalBackupDb();
  const tx = db.transaction([STORE_META, STORE_CONTENT], 'readwrite');
  tx.objectStore(STORE_META).put(meta);
  tx.objectStore(STORE_CONTENT).put(content);
  await transactionDone(tx);
  return meta;
}

/**
 * 用外部快照整体替换本地备份缓存。
 *
 * @param entries - 新的完整缓存快照。
 */
export async function replaceLocalBackupCache(entries: readonly LocalBackupCacheEntry[]): Promise<void> {
  const db = await openLocalBackupDb();
  const tx = db.transaction([STORE_META, STORE_CONTENT], 'readwrite');
  tx.objectStore(STORE_META).clear();
  tx.objectStore(STORE_CONTENT).clear();
  for (const entry of entries) {
    tx.objectStore(STORE_META).put(entry.meta);
    tx.objectStore(STORE_CONTENT).put({ id: entry.meta.id, blob: entry.blob } satisfies LocalBackupContent);
  }
  await transactionDone(tx);
}

/**
 * 删除单条本地备份缓存。
 *
 * @param id - 备份 ID。
 */
export async function deleteStoredLocalBackup(id: string): Promise<void> {
  const key = String(id || '').trim();
  if (!key) return;
  const db = await openLocalBackupDb();
  const tx = db.transaction([STORE_META, STORE_CONTENT], 'readwrite');
  tx.objectStore(STORE_META).delete(key);
  tx.objectStore(STORE_CONTENT).delete(key);
  await transactionDone(tx);
}

/**
 * 清空整份本地备份缓存。
 */
export async function clearStoredLocalBackups(): Promise<void> {
  const db = await openLocalBackupDb();
  const tx = db.transaction([STORE_META, STORE_CONTENT], 'readwrite');
  tx.objectStore(STORE_META).clear();
  tx.objectStore(STORE_CONTENT).clear();
  await transactionDone(tx);
}

/**
 * 读取导出目录句柄。
 *
 * @returns 目录 capability；若不存在或不可用则返回 `null`。
 */
export async function getStoredExportDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openLocalBackupDb();
  const tx = db.transaction([STORE_KV], 'readonly');
  const rec = await requestToPromise(tx.objectStore(STORE_KV).get('exportDir') as IDBRequest<KvRecord | undefined>);
  await transactionDone(tx);
  const handle = rec?.value;
  return handle && typeof handle === 'object' ? handle : null;
}

/**
 * 写入导出目录句柄。
 *
 * @param handle - 用户已授权的目录句柄。
 */
export async function setStoredExportDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openLocalBackupDb();
  const tx = db.transaction([STORE_KV], 'readwrite');
  tx.objectStore(STORE_KV).put({ key: 'exportDir', value: handle } satisfies KvRecord);
  await transactionDone(tx);
}

/**
 * 删除导出目录句柄。
 */
export async function clearStoredExportDirHandle(): Promise<void> {
  const db = await openLocalBackupDb();
  const tx = db.transaction([STORE_KV], 'readwrite');
  tx.objectStore(STORE_KV).delete('exportDir');
  await transactionDone(tx);
}

/**
 * 用整体替换语义更新导出目录 capability。
 *
 * @param handle - 新句柄；传 `null` 表示删除现有能力。
 */
export async function replaceStoredExportDirHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  if (handle) {
    await setStoredExportDirHandle(handle);
    return;
  }
  await clearStoredExportDirHandle();
}
