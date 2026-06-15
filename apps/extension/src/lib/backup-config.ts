/**
 * 说明：`backup-config` 备份模块。
 *
 * 职责：
 * - 承载 `backup-config` 相关的当前文件实现与模块边界；
 * - 对外暴露 `BACKUP_VERSION`、`BACKUP_EXTENSION`、`BACKUP_MIME_TYPE` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { BackupProfile } from './persistence/types';
import { isPlainRecord } from '@/lib/utils/type-guards';

/** 备份格式版本号。用于导出与导入时的 schema 校验。 */
export const BACKUP_VERSION = 1;

/** 备份归档文件扩展名。 */
export const BACKUP_EXTENSION = 'zip';
/** 备份归档文件 MIME 类型。 */
export const BACKUP_MIME_TYPE = 'application/zip';
/** 备份文件基础名。 */
export const BACKUP_FILE_BASENAME = 'olyq-backup';
/** 默认备份文件名。 */
export const DEFAULT_BACKUP_FILENAME = `${BACKUP_FILE_BASENAME}.${BACKUP_EXTENSION}`;
/** 默认备份档位。 */
export const DEFAULT_BACKUP_PROFILE: BackupProfile = 'full';

/**
 * 备份归档内部的固定文件路径。
 *
 * 说明：
 * - 这些路径是 ZIP 包内的逻辑布局；
 * - 导出和导入都依赖它们定位各类快照文件。
 */
export const BACKUP_ENTRY_PATHS = {
  manifest: 'manifest.json',
  configLocalStorage: 'config/localStorage.json',
  configChromeStorage: 'config/chromeStorage.json',
  chatMessages: 'chat/messages.json',
  memoryRecords: 'memory/records.json',
  attachmentsManifest: 'attachments/manifest.json',
} as const;

/** 参与备份的存储键统一前缀。 */
export const BACKUP_STORAGE_KEY_PREFIX = 'olyq';

/**
 * 备份时需要排除的存储键集合。
 *
 * 说明：
 * - 主要排除临时调试数据、审计日志、OAuth 瞬态状态以及同步内部元数据；
 * - 这些内容要么可重建，要么不适合进入可迁移备份。
 */
const BACKUP_EXCLUDED_STORAGE_KEYS = new Set<string>([
  'olyq.ai.debug',
  'olyq.chat.topics.v1',
  'olyq.lobe-icons.v1',
  'olyq.mcp.audit.v1',
  'olyq.sync.hlc.v1',
  'olyq.sync.meta.v1',
]);

/** ZIP 包和快照数据量的硬限制。 */
export const BACKUP_LIMITS = {
  maxArchiveBytes: 512 * 1024 * 1024,
  maxZipEntries: 100_000,
  maxChatMessages: 50_000,
} as const;

/** 归档内各类 JSON 文件大小限制。 */
export const BACKUP_JSON_LIMITS = {
  manifestBytes: 32 * 1024,
  configBytes: 16 * 1024 * 1024,
  chatBytes: 16 * 1024 * 1024,
  memoryBytes: 16 * 1024 * 1024,
  attachmentsManifestBytes: 2 * 1024 * 1024,
} as const;

/**
 * 判断某个存储键是否应被纳入备份。
 *
 * @param key - 原始存储键
 * @returns 命中备份白名单前缀且未被排除时返回 true
 */
export function isBackupStorageKey(key: string): boolean {
  const normalized = String(key || '').trim();
  if (!normalized.startsWith(BACKUP_STORAGE_KEY_PREFIX)) return false;
  if (BACKUP_EXCLUDED_STORAGE_KEYS.has(normalized)) return false;
  if (normalized.startsWith('olyq.sync.') && normalized.endsWith('.status.v1')) return false;
  return true;
}

/** 将数字补齐为两位字符串。 */
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 将数字补齐为三位字符串。 */
function pad3(value: number): string {
  return String(value).padStart(3, '0');
}

/**
 * 归一化备份文件名。
 *
 * @param input - 用户输入的文件名
 * @param fallback - 为空时使用的兜底文件名
 * @returns 带合法扩展名的文件名
 */
export function normalizeBackupFileName(input: string, fallback = DEFAULT_BACKUP_FILENAME): string {
  const raw = String(input || '').trim();
  if (!raw) return fallback;
  return raw.toLowerCase().endsWith(`.${BACKUP_EXTENSION}`) ? raw : `${raw}.${BACKUP_EXTENSION}`;
}

/**
 * 归一化备份档位。
 *
 * @param value - 任意外部输入
 * @returns 仅接受当前协议定义的 `full | lite`
 */
export function normalizeBackupProfile(value: unknown): BackupProfile {
  return value === 'lite' ? 'lite' : DEFAULT_BACKUP_PROFILE;
}

/** 云端备份/同步表单配置的轻量快照。 */
export type BackupProfileConfigSnapshot = Record<string, unknown>;

/**
 * 规整 WebDAV / S3 / 本地备份配置快照。
 *
 * @remarks
 * 这些 key 当前服务设置页表单和后台任务，字段集合由 UI 面板拥有；
 * 数据契约层只保证它们仍是普通 JSON 对象，避免把非法类型或循环值带入备份/同步。
 */
export function normalizeBackupProfileConfigSnapshot(value: unknown): BackupProfileConfigSnapshot {
  return isPlainRecord(value) ? { ...value } : {};
}

/**
 * 判断当前备份档位是否为精简备份。
 *
 * @param profile - 当前备份档位
 * @returns 当档位为 `lite` 时返回 true
 */
export function isLiteBackupProfile(profile: BackupProfile): boolean {
  return profile === 'lite';
}

/**
 * 构造带时间戳的备份文件名。
 *
 * @param profile - 当前备份档位
 * @param date - 可选：用于测试或自定义导出的时间
 * @returns 形如 `olyq-backup-20260326...zip` 的文件名
 */
export function buildTimestampedBackupFileName({
  profile,
  date = new Date(),
}: {
  profile: BackupProfile;
  date?: Date;
}): string {
  const stamp = [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds()),
    pad3(date.getMilliseconds()),
  ].join('');

  return `${BACKUP_FILE_BASENAME}-${stamp}${isLiteBackupProfile(profile) ? '-lite' : ''}.${BACKUP_EXTENSION}`;
}

/**
 * 判断文件名是否为当前 Olyq 时间戳 ZIP 快照。
 *
 * @param value - 文件名
 * @returns 命中 `olyq-backup-YYYYMMDDHHmmssSSS[-lite].zip` 时返回 true
 */
export function isBackupArchiveName(value: string): boolean {
  const raw = String(value || '').trim().toLowerCase();
  return new RegExp(`^${BACKUP_FILE_BASENAME}-\\d{17}(?:-lite)?\\.${BACKUP_EXTENSION}$`).test(raw);
}

/**
 * 判断路径是否指向备份归档文件。
 *
 * @param path - 任意路径或文件名
 * @returns 只基于扩展名判断是否为备份文件
 */
export function isBackupFilePath(path: string): boolean {
  return String(path || '').trim().toLowerCase().endsWith(`.${BACKUP_EXTENSION}`);
}
