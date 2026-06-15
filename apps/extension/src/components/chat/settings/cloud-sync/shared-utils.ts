/**
 * 说明：`shared-utils` 组件模块。
 *
 * 职责：
 * - 承载 `shared-utils` 相关的当前文件实现与模块边界；
 * - 对外暴露 `BACKUP_FILE_ACCEPT`、`buildBackupFileName`、`normalizeBackupDownloadName` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 云同步设置面板的通用工具函数（不导出 React 组件，避免触发 react-refresh/only-export-components）。
 */

import {
  BACKUP_EXTENSION,
  BACKUP_MIME_TYPE,
  DEFAULT_BACKUP_FILENAME,
  buildTimestampedBackupFileName,
  normalizeBackupFileName,
} from '@/lib/backup-config';
import { downloadBlob } from '@/lib/export/download';
import type { BackupProfile } from '@/lib/persistence/types';
export {
  inferBackupProfileFromName,
  isBackupArchiveKey,
  sortRemoteBackupVersions,
  type RemoteBackupVersion,
} from '@/lib/remote-backup-versions';

/**
 * 备份文件选择框 accept 字符串。
 */
export const BACKUP_FILE_ACCEPT = `${BACKUP_MIME_TYPE},.${BACKUP_EXTENSION}`;

/**
 * 构建带时间戳的备份文件名。
 *
 * @param profile - 当前备份档位。
 * @param date - 可选时间对象，便于测试或复用固定时间。
 * @returns 符合备份命名规范的文件名。
 */
export function buildBackupFileName(profile: BackupProfile, date = new Date()) {
  return buildTimestampedBackupFileName({ profile, date });
}

/**
 * 规范化备份下载文件名。
 *
 * @param input - 原始文件名输入。
 * @param fallback - 输入无效时使用的兜底文件名。
 * @returns 符合备份归档命名规范的文件名。
 */
export function normalizeBackupDownloadName(input: string, fallback = DEFAULT_BACKUP_FILENAME) {
  return normalizeBackupFileName(input, fallback);
}

/**
 * 下载备份 Blob。
 *
 * @param blob - 备份文件内容。
 * @param fileName - 建议文件名。
 * @returns 下载任务触发完成后返回。
 */
export async function downloadBackupBlob(blob: Blob, fileName = DEFAULT_BACKUP_FILENAME) {
  await downloadBlob(blob, normalizeBackupDownloadName(fileName));
}

/**
 * 将字节大小格式化为人类可读文本。
 *
 * @param bytes - 原始字节数。
 * @returns 适合列表展示的大小文本。
 */
export function formatFileSize(bytes: number): string {
  const b = Math.max(0, Number(bytes || 0));
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
