/**
 * 说明：`memory-store` 记忆模块。
 *
 * 职责：
 * - 承载 `memory-store` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MemoryBackupRecord`、`getMemoryRecord`、`putMemoryRecord` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 全局记忆（Memory）存储 v1：IndexedDB（文本 + embedding）。
 *
 * 约束：
 * - 彻底切换：新 DB 名称，不读取旧库，不做迁移
 * - embedding 使用 Float32Array（已做 L2 normalize + 统一维度）
 */

import type { MemoryRecord } from './types';
import { requestToPromise, transactionDone } from '@/lib/utils/idb';
import { I18nError } from '@/lib/i18n/error';

/** IndexedDB 数据库名称。采用 v1 新库名，明确不与旧实现共享。 */
const DB_NAME = 'olyq-memory-v1';
/** IndexedDB schema 版本号。 */
const DB_VERSION = 1;
/** 记忆记录对象仓库名称。 */
const STORE = 'memories';

/** 按 `userId` 检索的二级索引。 */
const IDX_USER = 'by_user';
/** 按 `[userId, assistantId]` 检索的复合索引。 */
const IDX_USER_ASSISTANT = 'by_user_assistant';
/** 按创建时间排序/筛选预留的索引。 */
const IDX_CREATED_AT = 'by_createdAt';

/**
 * 备份快照里使用的可序列化记忆结构。
 *
 * 与 `MemoryRecord` 的主要差异：
 * - `embedding` 不能直接保存 `Float32Array`，因此在备份中转换成 `number[]`；
 * - 其余字段保持与存储记录一致，方便导出/恢复时无损往返。
 */
export type MemoryBackupRecord = Omit<MemoryRecord, 'embedding'> & {
  embedding: number[];
};

/** IndexedDB 连接单例 Promise，避免在同一运行时里重复 open。 */
let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * 规范化一条待写入的记忆记录。
 *
 * 这里会强制校验最小必要字段，防止把“缺主键 / 缺 userId / 空文本”写入存储层。
 */
function normalizeMemoryRecord(record: MemoryRecord): MemoryRecord {
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const userId = typeof record.userId === 'string' ? record.userId.trim() : '';
  const memory = typeof record.memory === 'string' ? record.memory.trim() : '';
  if (!id || !userId || !memory) throw new Error('memory record must include non-empty id, userId, and memory');
  return {
    ...record,
    id,
    userId,
    memory,
    ...(typeof record.assistantId === 'string' && record.assistantId.trim()
      ? { assistantId: record.assistantId.trim() }
      : {}),
  };
}

/**
 * 打开 IndexedDB 数据库并确保对象仓库/索引存在。
 *
 * 设计要点：
 * - 使用模块级单例 Promise，避免并发调用时反复打开数据库；
 * - 在 `onupgradeneeded` 中集中创建仓库与索引；
 * - 打开失败时统一包装成 i18n 错误，便于上层 toast/日志复用。
 */
function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // keyPath 直接使用业务主键 `id`，这样导入恢复时可以保持记录 ID 稳定。
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex(IDX_USER, 'userId', { unique: false });
        store.createIndex(IDX_USER_ASSISTANT, ['userId', 'assistantId'], { unique: false });
        store.createIndex(IDX_CREATED_AT, 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      const detail = typeof req.error?.message === 'string' ? req.error.message.trim() : '';
      reject(
        detail
          ? new I18nError('errors.indexedDbOpenFailedWithDetail', { detail }, { cause: req.error })
          : new I18nError('errors.indexedDbOpenFailed', undefined, { cause: req.error }),
      );
    };
  });
  return dbPromise;
}

/**
 * 把 assistantId 收敛为可用于索引查询的稳定 key。
 *
 * 当前策略很直接：
 * - 合法字符串就 trim 后返回
 * - 其余情况统一收敛为空串，表示“不按 assistant 过滤”
 */
function toAssistantKey(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return s || '';
}

/** 按主键读取单条记忆记录。 */
export async function getMemoryRecord(id: string): Promise<MemoryRecord | null> {
  const key = String(id || '').trim();
  if (!key) return null;
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).get(key) as IDBRequest<MemoryRecord | undefined>;
  const item = await requestToPromise(req);
  await transactionDone(tx);
  return item ?? null;
}

/**
 * 写入或覆盖一条记忆记录。
 *
 * 说明：
 * - 底层使用 `put`，因此同 ID 会直接覆盖旧记录；
 * - 调用前会先做记录规范化，防止脏数据进入存储层。
 */
export async function putMemoryRecord(record: MemoryRecord): Promise<void> {
  const normalized = normalizeMemoryRecord(record);
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(normalized);
  await transactionDone(tx);
}

/** 按主键删除单条记忆记录；空 ID 直接视为无操作。 */
export async function deleteMemoryRecord(id: string): Promise<void> {
  const key = String(id || '').trim();
  if (!key) return;
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(key);
  await transactionDone(tx);
}

/**
 * 列出指定用户（可选再按 assistant）名下的记忆记录。
 *
 * 实现策略：
 * - 先借助索引做“用户维度”的粗筛；
 * - 再在内存里做合法性过滤与按 `createdAt` 倒序排序；
 * - 最终再做 offset/limit 截断。
 *
 * 说明：
 * - 这里没有直接依赖 `IDX_CREATED_AT` 做组合排序，因为当前查询主语义是 user / assistant 过滤；
 * - 若后续数据量进一步增大，可再演进为游标分页或更细分索引。
 */
export async function listMemoryRecords(params: {
  userId: string;
  assistantId?: string;
  limit?: number;
  offset?: number;
}): Promise<MemoryRecord[]> {
  const userId = String(params.userId || '').trim();
  if (!userId) return [];

  const assistantKey = toAssistantKey(params.assistantId);
  const limit = typeof params.limit === 'number' && Number.isFinite(params.limit) ? Math.max(1, Math.min(10_000, Math.floor(params.limit))) : 1000;
  const offset = typeof params.offset === 'number' && Number.isFinite(params.offset) ? Math.max(0, Math.floor(params.offset)) : 0;

  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const store = tx.objectStore(STORE);
  const index = assistantKey ? store.index(IDX_USER_ASSISTANT) : store.index(IDX_USER);
  const range = assistantKey
    ? IDBKeyRange.only([userId, assistantKey])
    : IDBKeyRange.only(userId);

  const all = await requestToPromise(index.getAll(range) as IDBRequest<MemoryRecord[]>);
  await transactionDone(tx);

  const sorted = all
    .filter((x) => x && typeof x === 'object' && typeof x.id === 'string' && typeof x.memory === 'string')
    // 统一按新到旧返回，方便 UI 列表与人工管理场景直接复用。
    .sort((a, b) => b.createdAt - a.createdAt);

  return sorted.slice(offset, offset + limit);
}

/** 清空整个记忆仓库中的所有记录。 */
export async function clearAllMemories(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).clear();
  await transactionDone(tx);
}

/** 统计当前仓库中的记忆总数。 */
export async function countMemories(): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).count();
  const count = await requestToPromise(req);
  await transactionDone(tx);
  return typeof count === 'number' ? count : 0;
}

/** 把运行时存储记录转换成可导出的备份结构。 */
function toMemoryBackupRecord(record: MemoryRecord): MemoryBackupRecord {
  return {
    ...record,
    embedding: Array.from(record.embedding),
  };
}

/** 把备份结构还原为运行时使用的存储记录。 */
function fromMemoryBackupRecord(record: MemoryBackupRecord): MemoryRecord {
  return {
    ...record,
    embedding: new Float32Array(record.embedding),
  };
}

/**
 * 校验并规范化一条来自备份文件的记忆记录。
 *
 * 失败时返回 `null`，由上层统一决定是否整批拒绝导入。
 */
function normalizeMemoryBackupRecord(raw: unknown): MemoryBackupRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const userId = typeof record.userId === 'string' ? record.userId.trim() : '';
  const memory = typeof record.memory === 'string' ? record.memory : '';
  if (!id || !userId || !memory.trim() || !Array.isArray(record.embedding)) return null;

  const embedding = record.embedding
    .filter((item): item is number => typeof item === 'number' && Number.isFinite(item));

  if (embedding.length !== record.embedding.length) return null;

  return {
    id,
    userId,
    memory,
    // embedding 以普通 number[] 保留，真正回写存储时再转换回 Float32Array。
    embedding,
    ...(typeof record.assistantId === 'string' && record.assistantId.trim()
      ? { assistantId: record.assistantId.trim() }
      : {}),
    ...(record.metadata === undefined ? {} : { metadata: record.metadata as Record<string, unknown> }),
    createdAt: typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) ? record.createdAt : Date.now(),
    updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? record.updatedAt : Date.now(),
  };
}

/**
 * 导出当前仓库中的所有记忆记录。
 *
 * 导出前会再次经过 `normalizeMemoryRecord`，确保导出快照不包含异常脏记录。
 * 若个别记录损坏，则跳过该条，不影响其他合法记录导出。
 */
export async function exportAllMemoryRecords(): Promise<MemoryBackupRecord[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const records = await requestToPromise(tx.objectStore(STORE).getAll() as IDBRequest<MemoryRecord[]>);
  await transactionDone(tx);

  return records
    .map((record) => {
      try {
        return toMemoryBackupRecord(normalizeMemoryRecord(record));
      } catch {
        return null;
      }
    })
    .filter((record): record is MemoryBackupRecord => Boolean(record));
}

/**
 * 用给定备份记录“整库替换”当前记忆仓库。
 *
 * 行为语义：
 * - 输入必须是数组，且每一条都必须能通过备份校验；
 * - 只要有任意一条非法，就整批拒绝，避免部分恢复导致状态不一致；
 * - 一旦通过校验，先清空旧数据，再写入新数据。
 */
export async function replaceAllMemoryRecords(records: unknown): Promise<void> {
  if (!Array.isArray(records)) {
    throw new I18nError('errors.backupFormatUnsupported', {
      detail: 'backup.memory.records.array_required',
    });
  }
  const normalized = records
    .map((record) => normalizeMemoryBackupRecord(record))
    .filter((record): record is MemoryBackupRecord => Boolean(record));

  if (normalized.length !== records.length) {
    throw new I18nError('errors.backupFormatUnsupported', {
      detail: 'backup.memory.records.record_invalid',
    });
  }

  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  // 彻底切换语义：恢复时直接以备份内容覆盖当前全量仓库，不做增量合并。
  await requestToPromise(store.clear());
  for (const record of normalized) {
    await requestToPromise(store.put(fromMemoryBackupRecord(record)));
  }
  await transactionDone(tx);
}
