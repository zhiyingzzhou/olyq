/**
 * 说明：备份归档编解码与恢复执行。
 *
 * 职责：
 * - 基于持久化域注册表构建 ZIP 归档；
 * - 解析归档、校验哈希、升级导入数据 schema，并生成恢复计划；
 * - 按固定 restore 顺序执行“权威覆盖式”恢复，并在失败时回滚。
 *
 * 边界：
 * - 本文件只关心归档协议与域级 restore 流水线，不负责本地文件目录权限编排；
 * - 这里不能通过 dynamic import 规避循环依赖，因为 service worker 运行时有静态 import guard；
 * - 域 ID 与 restore priority 只从 `domain-ids.ts` 读取，避免再次把 `domains.ts` 拉进静态环。
 */
import JSZip from 'jszip';
import { type AttachmentRecord } from '@/lib/attachments';
import { getStorageAdapter } from '@/lib/storage/storage-adapter';
import { flushRegisteredPendingWrites } from '@/lib/storage/pending-write-flushers';
import { BACKUP_LIMITS, BACKUP_MIME_TYPE, BACKUP_VERSION } from './backup-config';
import { createBackupFormatError, normalizeBackupFormatError } from './backup-schema';
import {
  ATTACHMENTS_DOMAIN_ID,
  getBackupRestorePriority,
} from './persistence/domain-ids';
import { ensurePersistenceDomainsRegistered } from './persistence/domains';
import { withPersistenceOperationLock } from './persistence/operation-coordinator';
import { upgradeImportedDomainData } from './persistence/schema-migration-engine';
import { persistenceDomainRegistry } from './persistence/registry';
import type { BackupProfile, PersistenceConflictPolicy, PersistenceRegisteredDomain, PersistenceRestoreMode } from './persistence/types';

const MANIFEST_PATH = 'manifest.json';
const DEGRADED_RESTORE_KEY = 'olyq.system.degraded-restore.v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** 单个域写入 `manifest.json` 的元信息。 */
export type BackupDomainManifest = {
  domainId: string;
  backend: string;
  schemaVersion: number;
  exportVersion: number;
  conflictPolicy: PersistenceConflictPolicy;
  itemCount: number;
  bytes: number;
  containsSensitiveData: boolean;
  hash: string;
  dataPath: string;
  blobPaths: string[];
};

/** 整个 ZIP 归档的总清单。 */
export type BackupManifest = {
  version: typeof BACKUP_VERSION;
  exportedAt: number;
  lite: boolean;
  appVersion: string;
  domains: BackupDomainManifest[];
};

/** 内存中的单域快照，含注册域描述与具体数据。 */
export type BackupDomainSnapshot = {
  manifest: BackupDomainManifest;
  descriptor: PersistenceRegisteredDomain;
  data: unknown;
};

/** 已解析的归档对象。 */
export type BackupArchive = {
  manifest: BackupManifest;
  domains: BackupDomainSnapshot[];
};

/** 恢复前生成的执行计划。 */
export type BackupRestorePlan = {
  mode: PersistenceRestoreMode;
  manifest: BackupManifest;
  domains: BackupDomainSnapshot[];
  warnings: string[];
};

/** 域级归档编码结果。 */
type EncodedDomainArchive = {
  dataJson: string;
  blobEntries: Array<{ path: string; blob: Blob }>;
  itemCount: number;
};

/**
 * 读取构建期注入的当前应用版本。
 *
 * @returns 写入归档 manifest 的当前应用版本。
 * @throws 当构建配置没有注入版本信息时抛出格式错误。
 *
 * @remarks
 * 备份 ZIP manifest 属于归档协议元数据，必须在 sidepanel、offscreen、
 * Service Worker 和测试环境里保持同一个构建期真源。这里禁止读取
 * 运行时 manifest API，避免自动快照在受限运行时里因为扩展 API
 * 能力差异生成不完整归档。
 */
function readBackupAppVersion(): string {
  const buildConfig = typeof __OLYQ_BUILD_CONFIG__ === 'object' ? __OLYQ_BUILD_CONFIG__ : null;
  const appVersion = String(buildConfig?.appVersion || '').trim();
  if (!appVersion) throw createBackupFormatError({ detail: 'backup.archive.app_version_missing' });
  return appVersion;
}

/** 计算单个域的 JSON 数据路径。 */
function getDomainDataPath(domainId: string): string {
  return `domains/${domainId}/data.json`;
}

/**
 * 计算单个域内 blob 条目的路径。
 *
 * @remarks
 * 这里显式拒绝 `..` 之类的路径逃逸，避免 ZIP 条目把恢复范围带出域目录。
 */
function getDomainBlobPath(domainId: string, relativePath: string): string {
  const cleanRelativePath = String(relativePath || '').trim().replace(/^\/+/, '');
  if (!cleanRelativePath || cleanRelativePath.includes('..')) {
    throw createBackupFormatError({ detail: 'backup.archive.domain_blob_path_invalid', domainId, path: relativePath });
  }
  return `domains/${domainId}/${cleanRelativePath}`;
}

/** 列出 ZIP 内所有文件路径，并保持稳定排序。 */
function listArchiveFiles(zip: JSZip): string[] {
  return Object.values(zip.files)
    .filter((file) => !file.dir)
    .map((file) => file.name)
    .sort();
}

/** 读取 JSZip 暴露的未压缩大小提示。 */
function getZipObjectSizeHint(file: JSZip.JSZipObject): number | null {
  const internal = (file as unknown as { _data?: { uncompressedSize?: unknown } })._data;
  return typeof internal?.uncompressedSize === 'number' && Number.isFinite(internal.uncompressedSize)
    ? internal.uncompressedSize
    : null;
}

/**
 * 安全读取 ZIP 条目的字节内容。
 *
 * @param file - ZIP 条目对象。
 * @param maxBytes - 单条允许的最大字节数。
 * @returns 条目的完整字节数组。
 * @throws 当条目大小超限时抛出格式错误。
 */
async function readZipBytes(file: JSZip.JSZipObject, maxBytes: number, detail: string): Promise<Uint8Array> {
  const sizeHint = getZipObjectSizeHint(file);
  if (sizeHint !== null && sizeHint > maxBytes) {
    throw createBackupFormatError({ detail, path: file.name });
  }
  const bytes = await file.async('uint8array');
  if (bytes.byteLength > maxBytes) throw createBackupFormatError({ detail, path: file.name });
  return bytes;
}

/**
 * 读取并解析 ZIP 内的 JSON 条目。
 *
 * @param zip - 已加载的归档对象。
 * @param path - 条目路径。
 */
async function readJsonEntry(zip: JSZip, path: string): Promise<unknown> {
  const file = zip.file(path);
  if (!file || file.dir) throw createBackupFormatError({ detail: 'backup.archive.json_entry_missing', path });
  const bytes = await readZipBytes(file, BACKUP_LIMITS.maxArchiveBytes, 'backup.archive.json_entry_size_exceeded');
  try {
    return JSON.parse(decoder.decode(bytes)) as unknown;
  } catch (error) {
    throw createBackupFormatError({ detail: 'backup.archive.json_entry_invalid_json', path }, error);
  }
}

/** 断言值为普通对象记录。 */
function assertPlainRecord(value: unknown, detail: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw createBackupFormatError({ detail });
  return value as Record<string, unknown>;
}

/** 解析单域 manifest 条目。 */
function parseDomainManifest(value: unknown): BackupDomainManifest {
  const record = assertPlainRecord(value, 'backup.archive.domain_manifest.record_required');
  const domainId = String(record.domainId || '').trim();
  if (!domainId) throw createBackupFormatError({ detail: 'backup.archive.domain_manifest.domain_id_missing' });
  const hash = String(record.hash || '').trim();
  const dataPath = String(record.dataPath || '').trim();
  const blobPaths = Array.isArray(record.blobPaths)
    ? record.blobPaths.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];
  if (!hash || !dataPath) {
    throw createBackupFormatError({ detail: 'backup.archive.domain_manifest.hash_or_data_path_missing', domainId });
  }
  const itemCount = Number(record.itemCount);
  const bytes = Number(record.bytes);
  const schemaVersion = Number(record.schemaVersion);
  const exportVersion = Number(record.exportVersion);
  if (
    !Number.isFinite(itemCount)
    || !Number.isFinite(bytes)
    || !Number.isFinite(schemaVersion)
    || !Number.isFinite(exportVersion)
  ) {
    throw createBackupFormatError({ detail: 'backup.archive.domain_manifest.numeric_fields_invalid', domainId });
  }
  return {
    domainId,
    backend: String(record.backend || '').trim(),
    schemaVersion: Math.floor(schemaVersion),
    exportVersion: Math.floor(exportVersion),
    conflictPolicy: String(record.conflictPolicy || 'authoritative-replace') as PersistenceConflictPolicy,
    itemCount: Math.floor(itemCount),
    bytes: Math.floor(bytes),
    containsSensitiveData: Boolean(record.containsSensitiveData),
    hash,
    dataPath,
    blobPaths,
  };
}

/** 解析整个归档 manifest。 */
function parseManifest(value: unknown): BackupManifest {
  const record = assertPlainRecord(value, 'backup.archive.manifest.record_required');
  const version = Number(record.version);
  if (version !== BACKUP_VERSION) throw createBackupFormatError({ detail: 'backup.archive.manifest.version_unsupported' });
  if (!Array.isArray(record.domains)) throw createBackupFormatError({ detail: 'backup.archive.manifest.domains_array_required' });
  return {
    version: BACKUP_VERSION,
    exportedAt: Number(record.exportedAt),
    lite: Boolean(record.lite),
    appVersion: String(record.appVersion || '').trim(),
    domains: record.domains.map((entry) => parseDomainManifest(entry)),
  };
}

/**
 * 计算一组内容片段的 SHA-256。
 *
 * @remarks
 * 归档 hash 只覆盖“逻辑域数据 + 逻辑 blob 内容”，不覆盖 ZIP 层压缩细节，
 * 这样在重新编码校验时可以获得稳定结果。
 */
async function sha256Hex(parts: Array<string | Uint8Array | Blob>): Promise<string> {
  let totalBytes = 0;
  const buffers: Uint8Array[] = [];

  for (const part of parts) {
    let bytes: Uint8Array;
    if (typeof part === 'string') bytes = encoder.encode(part);
    else if (part instanceof Blob) {
      const buffer = typeof part.arrayBuffer === 'function'
        ? await part.arrayBuffer()
        : await new Response(part).arrayBuffer();
      bytes = new Uint8Array(buffer);
    }
    else bytes = part;
    totalBytes += bytes.byteLength;
    buffers.push(bytes);
  }

  const joined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const bytes of buffers) {
    joined.set(bytes, offset);
    offset += bytes.byteLength;
  }

  const digest = await crypto.subtle.digest('SHA-256', joined);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * 把域快照编码成归档内部结构。
 *
 * @remarks
 * 附件域需要把元数据和 blob 正文拆开；其他域统一写入 `data.json`。
 */
async function encodeDomainArchive(domainId: string, data: unknown): Promise<EncodedDomainArchive> {
  if (domainId === ATTACHMENTS_DOMAIN_ID) {
    const records = Array.isArray(data) ? (data as AttachmentRecord[]) : [];
    const manifest = records.map(({ data: blob, ...meta }) => ({ ...meta, size: blob.size }));
    return {
      dataJson: JSON.stringify(manifest),
      blobEntries: records.map((record) => ({
        path: getDomainBlobPath(domainId, `files/${encodeURIComponent(record.id)}`),
        blob: record.data.slice(0, record.data.size, record.mime),
      })),
      itemCount: records.length,
    };
  }

  const json = JSON.stringify(data);
  return {
    dataJson: json,
    blobEntries: [],
    itemCount: Array.isArray(data) ? data.length : (data && typeof data === 'object' ? Object.keys(data as Record<string, unknown>).length : 1),
  };
}

/**
 * 从归档中解码单个域的数据。
 *
 * @remarks
 * 附件域会重新把 blob 路径映射回 `AttachmentRecord`；其他域直接返回 JSON 数据。
 */
async function decodeDomainArchive(
  zip: JSZip,
  manifest: BackupDomainManifest,
): Promise<unknown> {
  const data = await readJsonEntry(zip, manifest.dataPath);
  if (manifest.domainId !== ATTACHMENTS_DOMAIN_ID) return data;

  if (!Array.isArray(data)) {
    throw createBackupFormatError({ detail: 'backup.archive.attachments.manifest_array_required', domainId: manifest.domainId });
  }
  const blobMap = new Map<string, Blob>();
  for (const path of manifest.blobPaths) {
    const file = zip.file(path);
    if (!file || file.dir) {
      throw createBackupFormatError({ detail: 'backup.archive.attachments.blob_entry_missing', domainId: manifest.domainId, path });
    }
    const bytes = await readZipBytes(file, BACKUP_LIMITS.maxArchiveBytes, 'backup.archive.attachments.blob_entry_size_exceeded');
    const segments = path.split('/');
    const encodedId = segments[segments.length - 1] || '';
    const id = decodeURIComponent(encodedId);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    blobMap.set(id, new Blob([copy]));
  }

  return data.map((entry) => {
    const record = assertPlainRecord(entry, 'backup.archive.attachments.record_required');
    const id = String(record.id || '').trim();
    const blob = blobMap.get(id);
    if (!blob) {
      throw createBackupFormatError({ detail: 'backup.archive.attachments.blob_missing_for_record', domainId: manifest.domainId });
    }
    const mime = String(record.mime || '').trim();
    return {
      ...record,
      id,
      kind: String(record.kind || '').trim() as AttachmentRecord['kind'],
      name: String(record.name || '').trim(),
      mime,
      size: Number(record.size),
      createdAt: Number(record.createdAt),
      data: blob.slice(0, blob.size, mime || blob.type),
    } satisfies AttachmentRecord;
  });
}

/** 构建单个域写入 manifest 的描述。 */
async function buildDomainManifest(
  descriptor: PersistenceRegisteredDomain,
  domainId: string,
  dataJson: string,
  blobEntries: Array<{ path: string; blob: Blob }>,
  itemCount: number,
): Promise<BackupDomainManifest> {
  const hash = await sha256Hex([dataJson, ...blobEntries.map((entry) => entry.blob)]);
  const blobBytes = blobEntries.reduce((sum, entry) => sum + entry.blob.size, 0);
  return {
    domainId,
    backend: descriptor.backend,
    schemaVersion: descriptor.schemaVersion,
    exportVersion: descriptor.exportVersion,
    conflictPolicy: descriptor.conflictPolicy,
    itemCount,
    bytes: encoder.encode(dataJson).byteLength + blobBytes,
    containsSensitiveData: Boolean(descriptor.containsSensitiveData),
    hash,
    dataPath: getDomainDataPath(domainId),
    blobPaths: blobEntries.map((entry) => entry.path),
  };
}

/**
 * 把归档对象序列化为 ZIP Blob。
 *
 * @throws 当归档大小非法时抛出格式错误。
 */
async function serializeArchive(archive: BackupArchive): Promise<Blob> {
  const zip = new JSZip();
  zip.file(MANIFEST_PATH, JSON.stringify(archive.manifest));

  for (const domain of archive.domains) {
    const encoded = await encodeDomainArchive(domain.manifest.domainId, domain.data);
    zip.file(domain.manifest.dataPath, encoded.dataJson);
    for (const blobEntry of encoded.blobEntries) {
      zip.file(blobEntry.path, blobEntry.blob);
    }
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: BACKUP_MIME_TYPE,
    streamFiles: true,
  });

  if (blob.size <= 0 || blob.size > BACKUP_LIMITS.maxArchiveBytes) {
    throw createBackupFormatError({ detail: 'backup.archive.serialized_archive_size_invalid' });
  }
  return blob;
}

/** 在域级导出阶段失败时补充域 ID 与阶段原因码。 */
async function runDomainExportStage<T>(
  descriptor: PersistenceRegisteredDomain,
  stage: string,
  action: () => Promise<T> | T,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw createBackupFormatError({
      detail: `backup.archive.export.domain.${stage}_failed`,
      domainId: descriptor.id,
      stage,
    }, error);
  }
}

/**
 * 基于注册域导出内存归档对象。
 *
 * @param options - 导出档位与可选显式域集合。
 * @returns 已通过域校验的归档快照。
 *
 * @remarks
 * 常规导出从注册表枚举域；测试或特殊调用可以通过 `explicitDomains` 传入固定数据。
 */
async function createArchiveFromDomains(options: {
  profile: BackupProfile;
  explicitDomains?: Array<{ descriptor: PersistenceRegisteredDomain; data: unknown }>;
  lite: boolean;
}): Promise<BackupArchive> {
  ensurePersistenceDomainsRegistered();
  const domainSnapshots: BackupDomainSnapshot[] = [];
  const descriptors = options.explicitDomains
    ? options.explicitDomains.map((entry) => ({ descriptor: entry.descriptor, data: entry.data }))
    : [];

  if (descriptors.length < 1) {
    for (const descriptor of persistenceDomainRegistry.listByPolicy({ backupProfile: options.profile })) {
      if (typeof descriptor.flush === 'function') {
        await runDomainExportStage(descriptor, 'flush', () => descriptor.flush?.());
      }
      const exported = await runDomainExportStage(descriptor, 'export', () => descriptor.export({ profile: options.profile }));
      const validated = await runDomainExportStage(descriptor, 'validate', () => (
        typeof descriptor.validate === 'function'
          ? descriptor.validate(exported.data)
          : exported.data
      ));
      descriptors.push({ descriptor, data: validated });
    }
  }

  for (const { descriptor, data } of descriptors) {
    const encoded = await runDomainExportStage(descriptor, 'encode', () => encodeDomainArchive(descriptor.id, data));
    const manifest = await runDomainExportStage(
      descriptor,
      'manifest',
      () => buildDomainManifest(descriptor, descriptor.id, encoded.dataJson, encoded.blobEntries, encoded.itemCount),
    );
    domainSnapshots.push({ descriptor, manifest, data });
  }

  return {
    manifest: {
      version: BACKUP_VERSION,
      exportedAt: Date.now(),
      lite: options.lite,
      appVersion: readBackupAppVersion(),
      domains: domainSnapshots.map((domain) => domain.manifest),
    },
    domains: domainSnapshots,
  };
}

/**
 * 解析 ZIP 归档并还原为内存快照。
 *
 * @remarks
 * 解析时会同时做三件事：
 * - 校验 manifest 与文件路径集合是否完全匹配；
 * - 按域声明执行 schema upgrade + validate；
 * - 重新编码并校验域 hash，拒绝被篡改或损坏的条目。
 */
async function parseArchive(zipBlob: Blob): Promise<BackupArchive> {
  if (!(zipBlob instanceof Blob) || zipBlob.size <= 0 || zipBlob.size > BACKUP_LIMITS.maxArchiveBytes) {
    throw createBackupFormatError({ detail: 'backup.archive.input_blob_invalid' });
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBlob);
  } catch (error) {
    throw createBackupFormatError({ detail: 'backup.archive.zip_load_failed' }, error);
  }

  const archiveFiles = listArchiveFiles(zip);
  if (!archiveFiles.includes(MANIFEST_PATH)) throw createBackupFormatError({ detail: 'backup.archive.manifest_file_missing' });

  const manifestRaw = await readJsonEntry(zip, MANIFEST_PATH);
  ensurePersistenceDomainsRegistered();
  const manifest = parseManifest(manifestRaw);
  const expectedPaths = new Set<string>([MANIFEST_PATH]);
  const domains: BackupDomainSnapshot[] = [];

  try {
    for (const entry of manifest.domains) {
      expectedPaths.add(entry.dataPath);
      for (const blobPath of entry.blobPaths) expectedPaths.add(blobPath);

      const descriptor = persistenceDomainRegistry.get(entry.domainId);
      if (!descriptor) {
        throw createBackupFormatError({ detail: 'backup.archive.domain_descriptor_missing', domainId: entry.domainId });
      }

      const decodedData = await decodeDomainArchive(zip, entry);
      const migrated = await upgradeImportedDomainData(entry.domainId, decodedData, { fromVersion: entry.schemaVersion });
      const validated = typeof descriptor.validate === 'function' ? descriptor.validate(migrated) : migrated;

      const encoded = await encodeDomainArchive(entry.domainId, validated);
      const actualHash = await sha256Hex([encoded.dataJson, ...encoded.blobEntries.map((blobEntry) => blobEntry.blob)]);
      if (actualHash !== entry.hash) {
        throw createBackupFormatError({ detail: 'backup.archive.domain_hash_mismatch', domainId: entry.domainId });
      }

      domains.push({
        manifest: entry,
        descriptor,
        data: validated,
      });
    }

    if (archiveFiles.length !== expectedPaths.size) {
      throw createBackupFormatError({ detail: 'backup.archive.file_count_mismatch' });
    }
    for (const filePath of archiveFiles) {
      if (!expectedPaths.has(filePath)) {
        throw createBackupFormatError({ detail: 'backup.archive.unexpected_file', path: filePath });
      }
    }
  } catch (error) {
    throw normalizeBackupFormatError(error, { detail: 'backup.archive.parse_failed' });
  }

  return { manifest, domains };
}

/**
 * 计算恢复执行顺序。
 *
 * @remarks
 * 恢复顺序固定为“底层载荷优先，配置域靠后”。优先级定义集中在 `domain-ids.ts`，
 * 这样 `backup-archive.ts` 不必为了常量反向依赖整个 `domains.ts`。
 */
function getRestoreOrder(domains: BackupDomainSnapshot[]): BackupDomainSnapshot[] {
  return [...domains].sort(
    (left, right) => getBackupRestorePriority(left.manifest.domainId) - getBackupRestorePriority(right.manifest.domainId),
  );
}

/**
 * 记录或清除 degraded restore 标记。
 *
 * @remarks
 * 只有在“恢复失败且回滚再失败”时才写入标记，表示当前设备可能处于半恢复风险态，
 * 供后续 UI 或诊断流程显式提示，而不是静默留下不一致状态。
 */
async function setDegradedRestoreMarker(payload: Record<string, unknown> | null): Promise<void> {
  if (payload) {
    await getStorageAdapter().set({ [DEGRADED_RESTORE_KEY]: payload });
    return;
  }
  await getStorageAdapter().remove([DEGRADED_RESTORE_KEY]);
}

/**
 * 导出备份归档 Blob。
 *
 * @param profile - 归档档位，决定是否包含 lite 裁剪语义。
 * @returns 可直接下载、缓存或进一步写入本地目录的 ZIP Blob。
 */
export async function exportBackupArchiveBlob(profile: BackupProfile): Promise<Blob> {
  ensurePersistenceDomainsRegistered();
  await flushRegisteredPendingWrites();
  const archive = await createArchiveFromDomains({
    profile,
    lite: profile === 'lite',
  });
  return await serializeArchive(archive);
}

/**
 * 解析导入文件并生成恢复计划。
 *
 * @param zipBlob - 用户提供的 ZIP 归档。
 * @returns 当前版本下的“权威覆盖式”恢复计划。
 */
export async function planBackupRestore(zipBlob: Blob): Promise<BackupRestorePlan> {
  ensurePersistenceDomainsRegistered();
  const archive = await parseArchive(zipBlob);

  return {
    mode: 'authoritative-replace',
    manifest: archive.manifest,
    domains: getRestoreOrder(archive.domains),
    warnings: [],
  };
}

/**
 * 应用恢复计划。
 *
 * @param plan - 由 `planBackupRestore()` 生成的恢复计划。
 *
 * @remarks
 * 当前语义固定为“显式导入即权威覆盖”。
 * 如果任何域恢复失败，会按成功顺序逆序回滚；若回滚再失败，则写入 degraded restore 标记。
 */
export async function applyBackupRestorePlan(plan: BackupRestorePlan): Promise<void> {
  ensurePersistenceDomainsRegistered();
  const applied: Array<{ domain: BackupDomainSnapshot; rollback: unknown }> = [];

  try {
    for (const domain of plan.domains) {
      const rollback = typeof domain.descriptor.captureRollback === 'function'
        ? await domain.descriptor.captureRollback()
        : null;
      await domain.descriptor.restore(domain.data, { mode: plan.mode });
      applied.push({ domain, rollback });
    }
    await setDegradedRestoreMarker(null).catch(() => undefined);
  } catch (error) {
    let rollbackError: unknown = null;
    for (const entry of [...applied].reverse()) {
      if (typeof entry.domain.descriptor.rollback !== 'function') continue;
      try {
        await entry.domain.descriptor.rollback(entry.rollback);
      } catch (currentError) {
        rollbackError = currentError;
        break;
      }
    }

    if (rollbackError) {
      await setDegradedRestoreMarker({
        at: Date.now(),
        sourceVersion: plan.manifest.version,
        error: String((error as Error)?.message || error || 'restore failed'),
        rollbackError: String((rollbackError as Error)?.message || rollbackError || 'rollback failed'),
      }).catch(() => undefined);
    }

    throw error;
  }
}

/**
 * 在全局持久化锁保护下导出归档。
 *
 * @remarks
 * 这样可以避免与 restore / migration / sync 等高风险写操作并发交错。
 */
export async function exportBackupArchiveWithLock(profile: BackupProfile): Promise<Blob> {
  return await withPersistenceOperationLock(`backup:export:${profile}`, async () => {
    return await exportBackupArchiveBlob(profile);
  });
}

/** 在全局持久化锁保护下执行导入与恢复。 */
export async function importBackupArchiveWithLock(zipBlob: Blob): Promise<void> {
  await withPersistenceOperationLock('backup:import', async () => {
    const plan = await planBackupRestore(zipBlob);
    await applyBackupRestorePlan(plan);
  });
}
