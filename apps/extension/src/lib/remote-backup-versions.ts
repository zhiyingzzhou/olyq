/**
 * 说明：远端备份版本基础模型。
 *
 * 职责：
 * - 定义 WebDAV / S3 共用的远端 ZIP 快照条目结构；
 * - 提供备份文件名判定、档位推导和稳定排序；
 * - 避免底层网络 helper 反向依赖 React 设置页组件。
 */
import { isBackupArchiveName } from '@/lib/backup-config';
import type { BackupProfile } from '@/lib/persistence/types';

/** 远端 ZIP 备份版本的统一展示和恢复模型。 */
export interface RemoteBackupVersion {
  /** 用户可见文件名。 */
  name: string;
  /** 后端内部定位符；S3 为 object key，WebDAV 为绝对 URL。 */
  key: string;
  /** 可选绝对 URL，WebDAV 恢复和纯文本 reveal 使用。 */
  url?: string;
  /** 最近修改时间戳；缺失或无法解析时为 `0`。 */
  lastModified: number;
  /** 文件大小，单位字节。 */
  size: number;
  /** 备份档位；当前只从文件名推导 full/lite。 */
  profile?: BackupProfile;
}

/**
 * 判断某个对象键或路径是否指向 Olyq 备份归档文件。
 *
 * @param value - 可能是文件名，也可能是包含路径的对象键。
 * @returns 命中备份归档命名规则时返回 `true`。
 */
export function isBackupArchiveKey(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const fileName = raw.split('/').pop() || raw;
  return isBackupArchiveName(fileName);
}

/**
 * 从备份文件名推导备份档位。
 *
 * @param name - 备份文件名。
 * @returns 命名带 `-lite.zip` 时返回 `lite`，其它 Olyq 备份默认视为 `full`。
 */
export function inferBackupProfileFromName(name: string): BackupProfile {
  return String(name || '').trim().toLowerCase().endsWith('-lite.zip') ? 'lite' : 'full';
}

/**
 * 按“最近修改时间优先、同时间按文件名倒序”排序远端备份版本。
 *
 * @param items - 待排序列表。
 * @returns 新数组，不修改入参。
 */
export function sortRemoteBackupVersions(items: RemoteBackupVersion[]): RemoteBackupVersion[] {
  return [...items].sort((a, b) => {
    const byTime = (b.lastModified || 0) - (a.lastModified || 0);
    if (byTime !== 0) return byTime;
    return b.name.localeCompare(a.name);
  });
}
