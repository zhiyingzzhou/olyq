/**
 * 说明：`attachments` 基础能力模块。
 *
 * 职责：
 * - 承载 `attachments` 相关的当前文件实现与模块边界；
 * - 对外暴露 `AttachmentKind`、`AttachmentRecord`、`AttachmentBackupRecord` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createId } from '@/lib/utils/id';
import { requestToPromise, transactionDone } from '@/lib/utils/idb';
import { isRecord } from '@/lib/utils/type-guards';
import { I18nError } from '@/lib/i18n/error';

/** 当前支持的附件类型。 */
export type AttachmentKind = 'image' | 'file';

/** 附件库中持久化保存的完整附件记录。 */
export type AttachmentRecord = {
  /** 附件主键 ID。 */
  id: string;
  /** 附件类型。 */
  kind: AttachmentKind;
  /** 展示名或原始文件名。 */
  name: string;
  /** MIME 类型。 */
  mime: string;
  /** 字节大小。 */
  size: number;
  /** 创建时间（毫秒时间戳）。 */
  createdAt: number;
  /** 二进制文件内容。 */
  data: Blob;
};

/** 备份归档中的附件记录；当前与运行时记录结构保持一致。 */
export type AttachmentBackupRecord = AttachmentRecord;

/** 不含二进制内容的附件元信息。 */
export type AttachmentMeta = {
  /** 附件主键 ID。 */
  id: string;
  /** 附件类型。 */
  kind: AttachmentKind;
  /** 展示名或原始文件名。 */
  name: string;
  /** MIME 类型。 */
  mime: string;
  /** 字节大小。 */
  size: number;
  /** 创建时间（毫秒时间戳）。 */
  createdAt: number;
};

/** 归档文件中存放附件二进制的目录前缀。 */
export const ATTACHMENT_ARCHIVE_FILES_DIR = 'attachments/files';

/** 附件导出/备份时的数量与体积限制配置。 */
type AttachmentExportLimits = {
  /** 最多允许导出的附件数量。 */
  maxCount?: number;
  /** 单个附件允许的最大体积。 */
  maxItemBytes?: number;
  /** 所有附件允许的总体积上限。 */
  maxTotalBytes?: number;
};

/** 附件库 IndexedDB 数据库名。 */
const DB_NAME = 'olyq.attachments.v1';
/** 附件记录所在 object store 名称。 */
const STORE = 'items';
/** 当前附件库 schema 版本。 */
const DB_VERSION = 1;

/** IndexedDB 连接的惰性单例 Promise。 */
let dbPromise: Promise<IDBDatabase> | null = null;

/** 构造“附件备份格式不合法”的统一错误。 */
function createBackupFormatError(detail: string, cause?: unknown) {
  return new I18nError(
    'errors.backupFormatUnsupported',
    { detail },
    cause === undefined ? undefined : { cause },
  );
}

/**
 * 打开附件库 IndexedDB。
 *
 * 说明：
 * - 使用惰性单例缓存，避免每次读写都重复 open；
 * - 首次升级时会创建 `createdAt` 索引，供列表倒序读取使用。
 */
function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => {
      const detail = req.error?.message ? String(req.error.message) : '';
      reject(detail ? new I18nError('errors.indexedDbOpenFailedWithDetail', { detail }, { cause: req.error }) : (req.error ?? new I18nError('errors.indexedDbOpenFailed')));
    };
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
  return dbPromise;
}

/** 归一化附件类型；非法值返回 null。 */
function normalizeAttachmentKind(value: unknown): AttachmentKind | null {
  return value === 'image' || value === 'file' ? value : null;
}

/** 断言值为非负有限整数，否则抛出备份格式错误。 */
function normalizeFiniteInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || Math.floor(value) !== value) {
    throw createBackupFormatError('attachments.records.finite_non_negative_integer_required');
  }
  return value;
}

/** 断言值为非空字符串，否则抛出备份格式错误。 */
function normalizeNonEmptyString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw createBackupFormatError('attachments.records.non_empty_string_required');
  return value;
}

/**
 * 判断一个值是否具备 Blob 的最小行为。
 *
 * @remarks
 * 本地自动备份运行在 offscreen document，附件 Blob 可能跨 extension page /
 * offscreen 不同 Realm 读取；此时 `instanceof Blob` 有概率误判。这里改用
 * Web Blob 的稳定结构能力做判定，避免合法附件在自动 full 快照里被归类成
 * `errors.backupFormatUnsupported`。
 */
function isBlobLike(value: unknown): value is Blob {
  if (!isRecord(value)) return false;
  const candidate = value as {
    size?: unknown;
    type?: unknown;
    slice?: unknown;
    arrayBuffer?: unknown;
  };
  return typeof candidate.size === 'number'
    && Number.isFinite(candidate.size)
    && candidate.size >= 0
    && typeof candidate.type === 'string'
    && typeof candidate.slice === 'function'
    && typeof candidate.arrayBuffer === 'function';
}

/** 复制 Blob-like 数据为当前 Realm 可继续处理的 Blob。 */
function cloneBlobLike(value: Blob, mime: string): Blob {
  return value.slice(0, value.size, mime || value.type);
}

/** 将任意原始值规整为合法的附件元数据。 */
function normalizeAttachmentMeta(value: unknown): AttachmentMeta {
  if (!isRecord(value)) throw createBackupFormatError('attachments.records.meta_record_required');

  const kind = normalizeAttachmentKind(value.kind);
  if (!kind) throw createBackupFormatError('attachments.records.kind_invalid');

  return {
    id: normalizeNonEmptyString(value.id).trim(),
    kind,
    name: normalizeNonEmptyString(value.name),
    mime: normalizeNonEmptyString(value.mime),
    size: normalizeFiniteInteger(value.size),
    createdAt: normalizeFiniteInteger(value.createdAt),
  };
}

/** 将任意原始值规整为合法的附件完整记录。 */
function normalizeAttachmentRecord(value: unknown): AttachmentRecord {
  if (!isRecord(value)) throw createBackupFormatError('attachments.records.record_required');
  const meta = normalizeAttachmentMeta(value);
  if (!isBlobLike(value.data)) throw createBackupFormatError('attachments.records.data.blob_like_missing');
  if (value.data.size !== meta.size) throw createBackupFormatError('attachments.records.size_mismatch');

  return {
    ...meta,
    data: cloneBlobLike(value.data, meta.mime),
  };
}

/** 断言附件 ID 集合里不存在重复值。 */
function assertUniqueAttachmentIds(ids: Iterable<string>): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw createBackupFormatError('attachments.records.duplicate_id');
    seen.add(id);
  }
}

/** 校验导出附件集合是否满足数量和体积限制。 */
function validateAttachmentExportLimits(records: AttachmentRecord[], limits: AttachmentExportLimits): void {
  if (limits.maxCount && records.length > limits.maxCount) throw createBackupFormatError('attachments.records.count_limit_exceeded');

  let totalBytes = 0;
  for (const record of records) {
    if (limits.maxItemBytes && record.size > limits.maxItemBytes) throw createBackupFormatError('attachments.records.item_size_limit_exceeded');
    totalBytes += record.size;
    if (limits.maxTotalBytes && totalBytes > limits.maxTotalBytes) throw createBackupFormatError('attachments.records.total_size_limit_exceeded');
  }
}

/** 将任意原始值规整为附件记录数组，并校验主键唯一性。 */
function normalizeAttachmentRecords(value: unknown): AttachmentRecord[] {
  if (!Array.isArray(value)) throw createBackupFormatError('attachments.records.array_required');
  const records = value.map((entry) => normalizeAttachmentRecord(entry));
  assertUniqueAttachmentIds(records.map((record) => record.id));
  return records;
}

/** 克隆附件记录，同时复制 Blob，避免不同调用方共享同一 Blob 引用。 */
function cloneAttachmentRecord(record: AttachmentRecord): AttachmentRecord {
  return {
    ...record,
    data: record.data.slice(0, record.data.size, record.mime),
  };
}

/** 从完整附件记录中提取元信息。 */
export function toAttachmentMeta(record: AttachmentRecord): AttachmentMeta {
  const normalized = normalizeAttachmentRecord(record);
  return {
    id: normalized.id,
    kind: normalized.kind,
    name: normalized.name,
    mime: normalized.mime,
    size: normalized.size,
    createdAt: normalized.createdAt,
  };
}

/**
 * 生成附件备份清单。
 *
 * 说明：
 * - 清单只包含元数据，不包含二进制内容；
 * - 调用方通常会配合归档目录里的二进制文件一起使用。
 */
export function toAttachmentBackupManifest(records: AttachmentRecord[]): AttachmentMeta[] {
  const normalized = records.map((record) => normalizeAttachmentRecord(record));
  assertUniqueAttachmentIds(normalized.map((record) => record.id));
  return normalized.map((record) => toAttachmentMeta(record));
}

/** 解析附件备份清单，并校验 ID 唯一性。 */
export function parseAttachmentBackupManifest(value: unknown): AttachmentMeta[] {
  if (!Array.isArray(value)) throw createBackupFormatError('attachments.records.manifest_array_required');
  const records = value.map((entry) => normalizeAttachmentMeta(entry));
  assertUniqueAttachmentIds(records.map((record) => record.id));
  return records;
}

/** 根据附件 ID 生成归档内的二进制文件路径。 */
export function getAttachmentArchiveEntryPath(id: string): string {
  const key = normalizeNonEmptyString(id).trim();
  return `${ATTACHMENT_ARCHIVE_FILES_DIR}/${encodeURIComponent(key)}`;
}

/** 从归档内文件路径反解出附件 ID。 */
export function getAttachmentIdFromArchiveEntryPath(path: string): string | null {
  const raw = String(path || '').trim();
  const prefix = `${ATTACHMENT_ARCHIVE_FILES_DIR}/`;
  if (!raw.startsWith(prefix)) return null;
  const encodedId = raw.slice(prefix.length);
  if (!encodedId || encodedId.includes('/')) return null;
  try {
    const id = decodeURIComponent(encodedId).trim();
    return id || null;
  } catch {
    return null;
  }
}

/**
 * 写入一条图片附件记录。
 *
 * 说明：
 * - 只返回供消息/附件引用使用的轻量信息，不把 Blob 直接暴露给调用方；
 * - 附件 ID 由内部统一生成，调用方无需自带主键。
 */
export async function putImageAttachment({
  blob,
  name,
  mime,
}: {
  blob: Blob;
  name: string;
  mime: string;
}): Promise<{ id: string; type: 'image'; name: string; mime: string; size: number }> {
  const db = await openDb();
  const id = createId();
  const rec: AttachmentRecord = {
    id,
    kind: 'image',
    name: String(name || 'image'),
    mime: String(mime || 'image/*'),
    size: Number((blob as unknown as { size?: unknown }).size ?? 0) || 0,
    createdAt: Date.now(),
    data: blob,
  };

  const tx = db.transaction([STORE], 'readwrite');
  await requestToPromise(tx.objectStore(STORE).put(rec));
  await transactionDone(tx);
  return { id, type: 'image', name: rec.name, mime: rec.mime, size: rec.size };
}

/**
 * 写入一条普通文件附件记录。
 *
 * 说明：
 * - 与图片写入逻辑一致，只是 `kind` 与默认 MIME 不同；
 * - 常用于文档等非图片二进制的暂存。
 */
export async function putFileAttachment({
  blob,
  name,
  mime,
}: {
  blob: Blob;
  name: string;
  mime: string;
}): Promise<{ id: string; type: 'file'; name: string; mime: string; size: number }> {
  const db = await openDb();
  const id = createId();
  const rec: AttachmentRecord = {
    id,
    kind: 'file',
    name: String(name || 'file'),
    mime: String(mime || 'application/octet-stream'),
    size: Number((blob as unknown as { size?: unknown }).size ?? 0) || 0,
    createdAt: Date.now(),
    data: blob,
  };

  const tx = db.transaction([STORE], 'readwrite');
  await requestToPromise(tx.objectStore(STORE).put(rec));
  await transactionDone(tx);
  return { id, type: 'file', name: rec.name, mime: rec.mime, size: rec.size };
}

/** 根据附件 ID 读取原始 Blob；找不到时返回 null。 */
export async function getAttachmentBlob(id: string): Promise<Blob | null> {
  const key = String(id || '').trim();
  if (!key) return null;
  const db = await openDb();
  const tx = db.transaction([STORE], 'readonly');
  const rec = await requestToPromise(tx.objectStore(STORE).get(key) as IDBRequest<AttachmentRecord | undefined>);
  await transactionDone(tx);
  if (!rec || !isBlobLike(rec.data)) return null;
  return cloneBlobLike(rec.data, rec.mime || rec.data.type);
}

/**
 * 批量删除附件。
 *
 * 说明：
 * - 输入 ID 会先去空、去重；
 * - 空数组会直接快速返回。
 */
export async function deleteAttachments(ids: string[]) {
  const uniq = Array.from(new Set(ids.map((x) => String(x || '').trim()).filter(Boolean)));
  if (uniq.length === 0) return;
  const db = await openDb();
  const tx = db.transaction([STORE], 'readwrite');
  const store = tx.objectStore(STORE);
  for (const id of uniq) await requestToPromise(store.delete(id));
  await transactionDone(tx);
}

/** 清空整个附件库。 */
export async function clearAllAttachments() {
  const db = await openDb();
  const tx = db.transaction([STORE], 'readwrite');
  await requestToPromise(tx.objectStore(STORE).clear());
  await transactionDone(tx);
}

/**
 * 统计附件库当前条数与总字节数。
 *
 * 说明：
 * - 通过游标遍历全量记录计算，适合设置页展示而非高频实时调用。
 */
export async function getAttachmentStats(): Promise<{ count: number; totalBytes: number }> {
  const db = await openDb();
  const tx = db.transaction([STORE], 'readonly');
  const store = tx.objectStore(STORE);

  let count = 0;
  let totalBytes = 0;

  await new Promise<void>((resolve, reject) => {
    const req = store.openCursor();
    req.onerror = () => {
      const detail = req.error?.message ? String(req.error.message) : '';
      reject(detail ? new I18nError('errors.attachmentsIterateFailedWithDetail', { detail }, { cause: req.error }) : (req.error ?? new I18nError('errors.attachmentsIterateFailed')));
    };
    req.onsuccess = () => {
      const cursor = req.result as IDBCursorWithValue | null;
      if (!cursor) return resolve();
      const rec = cursor.value as AttachmentRecord;
      count += 1;
      totalBytes += Number(rec?.size || 0);
      cursor.continue();
    };
  });

  await transactionDone(tx);
  return { count, totalBytes };
}

/**
 * 读取最近创建的附件元数据列表。
 *
 * 说明：
 * - 结果按 `createdAt` 倒序返回；
 * - 默认最多返回 500 条，防止一次性拉取过多元数据。
 */
export async function listAttachmentMetas(limit = 500): Promise<AttachmentMeta[]> {
  const db = await openDb();
  const tx = db.transaction([STORE], 'readonly');
  const store = tx.objectStore(STORE);
  const idx = store.index('createdAt');

  const out: AttachmentMeta[] = [];

  await new Promise<void>((resolve, reject) => {
    const req = idx.openCursor(null, 'prev');
    req.onerror = () => {
      const detail = req.error?.message ? String(req.error.message) : '';
      reject(detail ? new I18nError('errors.attachmentsIterateFailedWithDetail', { detail }, { cause: req.error }) : (req.error ?? new I18nError('errors.attachmentsIterateFailed')));
    };
    req.onsuccess = () => {
      const cursor = req.result as IDBCursorWithValue | null;
      if (!cursor) return resolve();
      const rec = cursor.value as AttachmentRecord;
      out.push({
        id: rec.id,
        kind: rec.kind,
        name: rec.name,
        mime: rec.mime,
        size: rec.size,
        createdAt: rec.createdAt,
      });
      if (out.length >= Math.max(1, limit)) return resolve();
      cursor.continue();
    };
  });

  await transactionDone(tx);
  return out;
}

/** 读取全部附件元数据。 */
export async function listAllAttachmentMetas(): Promise<AttachmentMeta[]> {
  return await listAttachmentMetas(Number.MAX_SAFE_INTEGER);
}

/** 将 Blob 转成 data URL。 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => {
      const detail = reader.error?.message ? String(reader.error.message) : '';
      reject(detail ? new I18nError('errors.blobReadFailedWithDetail', { detail }, { cause: reader.error }) : (reader.error ?? new I18nError('errors.blobReadFailed')));
    };
    reader.readAsDataURL(blob);
  });
}

/** 将 data URL 还原为 Blob 与 MIME 类型。 */
export function dataUrlToBlob(dataUrl: string): { blob: Blob; mime: string } {
  const raw = String(dataUrl || '').trim();
  const m = /^data:([^;]+);base64,(.+)$/i.exec(raw);
  if (!m) throw new I18nError('errors.dataUrlInvalidFormat');
  const mime = m[1] || 'application/octet-stream';
  const b64 = m[2] || '';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return { blob: new Blob([bytes], { type: mime }), mime };
}

/**
 * 按给定 ID 导出附件记录。
 *
 * 说明：
 * - 若任一附件缺失，会直接按备份格式错误处理；
 * - 导出前后都会校验数量/体积限制，防止归档过大。
 */
export async function exportAttachmentsByIds(ids: string[], limits: AttachmentExportLimits = {}): Promise<AttachmentBackupRecord[]> {
  const uniq = Array.from(new Set(ids.map((x) => String(x || '').trim()).filter(Boolean)));
  if (limits.maxCount && uniq.length > limits.maxCount) throw createBackupFormatError('attachments.records.selected_count_limit_exceeded');
  if (uniq.length === 0) return [];

  const db = await openDb();
  const tx = db.transaction([STORE], 'readonly');
  const store = tx.objectStore(STORE);
  const out: AttachmentBackupRecord[] = [];

  for (const id of uniq) {
    const rec = await requestToPromise(store.get(id) as IDBRequest<AttachmentRecord | undefined>);
    if (!rec) throw createBackupFormatError('attachments.records.missing_blob_record');
    out.push(cloneAttachmentRecord(normalizeAttachmentRecord(rec)));
  }

  await transactionDone(tx);
  validateAttachmentExportLimits(out, limits);
  return out;
}

/**
 * 导出附件库中的全部附件。
 *
 * 说明：
 * - 返回值包含元信息与 Blob；
 * - 常用于完整备份归档。
 */
export async function exportAllAttachments(limits: AttachmentExportLimits = {}): Promise<AttachmentBackupRecord[]> {
  const db = await openDb();
  const tx = db.transaction([STORE], 'readonly');
  const store = tx.objectStore(STORE);
  const out: AttachmentBackupRecord[] = [];

  await new Promise<void>((resolve, reject) => {
    const req = store.openCursor();
    req.onerror = () => {
      const detail = req.error?.message ? String(req.error.message) : '';
      reject(detail ? new I18nError('errors.attachmentsIterateFailedWithDetail', { detail }, { cause: req.error }) : (req.error ?? new I18nError('errors.attachmentsIterateFailed')));
    };
    req.onsuccess = () => {
      const cursor = req.result as IDBCursorWithValue | null;
      if (!cursor) return resolve();
      out.push(cloneAttachmentRecord(normalizeAttachmentRecord(cursor.value)));
      cursor.continue();
    };
  });

  await transactionDone(tx);
  validateAttachmentExportLimits(out, limits);
  return out;
}

/**
 * 把一批附件记录增量导入到附件库中。
 *
 * 说明：
 * - 已存在相同 ID 时会被 `put` 覆盖；
 * - 不会先清库，适合追加恢复。
 */
export async function importAttachments(records: unknown): Promise<void> {
  const normalized = normalizeAttachmentRecords(records);

  const db = await openDb();
  const tx = db.transaction([STORE], 'readwrite');
  const store = tx.objectStore(STORE);

  for (const record of normalized) {
    await requestToPromise(store.put(cloneAttachmentRecord(record)));
  }

  await transactionDone(tx);
}

/**
 * 用给定附件记录整库替换当前附件库。
 *
 * 说明：
 * - 会先清空再写入；
 * - 中途写入失败时会主动 abort 当前事务，尽量避免半替换状态。
 */
export async function replaceAllAttachments(records: unknown): Promise<void> {
  const normalized = normalizeAttachmentRecords(records);

  const db = await openDb();
  const tx = db.transaction([STORE], 'readwrite');
  const store = tx.objectStore(STORE);

  try {
    await requestToPromise(store.clear());
    for (const record of normalized) {
      await requestToPromise(store.put(cloneAttachmentRecord(record)));
    }
  } catch (error) {
    try { tx.abort(); } catch { /* ignore */ }
    throw error;
  }

  await transactionDone(tx);
}
