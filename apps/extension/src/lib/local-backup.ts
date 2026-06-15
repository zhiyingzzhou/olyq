/**
 * 说明：`local-backup` 基础能力模块。
 *
 * 职责：
 * - 承载 `local-backup` 相关的当前文件实现与模块边界；
 * - 对外暴露 `LocalBackupFileExportStatus`、`LocalBackupSnapshotResult`、`deleteManagedLocalBackup` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { exportBackupArchiveBlob } from '@/lib/backup-archive';
import { buildTimestampedBackupFileName, isLiteBackupProfile } from '@/lib/backup-config';
import { withPersistenceOperationLock } from '@/lib/persistence/operation-coordinator';
import type { BackupProfile } from '@/lib/persistence/types';
import {
  clearStoredExportDirHandle,
  clearStoredLocalBackups,
  deleteStoredLocalBackup,
  exportLocalBackupCacheEntries,
  getLocalBackupStats,
  getStoredExportDirHandle,
  getStoredLocalBackupBlob,
  listLocalBackupContentIds,
  listStoredLocalBackups,
  putStoredLocalBackup,
  replaceLocalBackupCache,
  replaceStoredExportDirHandle,
  setStoredExportDirHandle,
  type LocalBackupCacheEntry,
  type LocalBackupMeta,
  type LocalBackupStats,
} from '@/lib/local-backup-store';
import {
  exportBackupBlobToDirectory,
  removeBackupFileFromDirectory,
  type ExportDirPermissionMode,
} from '@/lib/local-backup-file';

/**
 * 说明：本地备份编排层。
 *
 * 职责：
 * - 基于当前注册域导出 ZIP 归档，并把结果写入本地备份缓存；
 * - 在“缓存快照写入”和“文件系统导出”之间做统一编排；
 * - 把目录权限失败、文件删除失败等能力异常归一为 `ok / degraded / skipped` 语义。
 *
 * 边界：
 * - 物理数据读写由 `local-backup-store.ts` 负责；
 * - 本文件只保留备份编排与文件降级逻辑；
 * - 通过重新导出仓储 API，兼容现有 UI/注册域调用口径，同时避免仓储层重新反向依赖归档层。
 */

export type {
  ExportDirPermissionMode,
  LocalBackupCacheEntry,
  LocalBackupMeta,
  LocalBackupStats,
};

/**
 * 文件系统导出的最终状态。
 *
 * @remarks
 * - `skipped`：未配置目录句柄，或当前流程无需尝试文件写入；
 * - `ok`：缓存写入成功，且目录写入/删除也成功；
 * - `degraded`：缓存写入成功，但文件系统侧发生权限或 IO 降级。
 */
export type LocalBackupFileExportStatus = 'skipped' | 'ok' | 'degraded';

/** 一次本地备份快照任务的最终结果。 */
export type LocalBackupSnapshotResult = {
  meta: LocalBackupMeta;
  fileExportStatus: LocalBackupFileExportStatus;
  trimmedCount: number;
};

export {
  clearStoredLocalBackups as clearLocalBackups,
  exportLocalBackupCacheEntries,
  getLocalBackupStats,
  getStoredExportDirHandle as getExportDirHandle,
  getStoredLocalBackupBlob as getLocalBackupBlob,
  listStoredLocalBackups as listLocalBackups,
  replaceLocalBackupCache,
  replaceStoredExportDirHandle as replaceExportDirHandle,
  setStoredExportDirHandle as setExportDirHandle,
};

/**
 * 删除一条受管本地备份。
 *
 * @param meta - 要删除的本地备份元数据。
 * @param options - 可选目录句柄与权限模式。
 * @returns 删除缓存后，文件系统侧的最终降级状态。
 */
export async function deleteManagedLocalBackup(
  meta: Pick<LocalBackupMeta, 'id' | 'fileName'>,
  options?: {
    dirHandle?: FileSystemDirectoryHandle | null;
    permissionMode?: ExportDirPermissionMode;
  },
): Promise<{ fileExportStatus: LocalBackupFileExportStatus }> {
  await deleteStoredLocalBackup(meta.id);
  const dirHandle = options?.dirHandle !== undefined ? options.dirHandle : await getStoredExportDirHandle().catch(() => null);
  if (!dirHandle) return { fileExportStatus: 'skipped' };

  try {
    const removed = await removeBackupFileFromDirectory(dirHandle, meta.fileName, {
      permissionMode: options?.permissionMode ?? 'request',
    });
    return { fileExportStatus: removed ? 'ok' : 'degraded' };
  } catch {
    return { fileExportStatus: 'degraded' };
  }
}

/**
 * 裁剪超出上限的历史本地备份。
 *
 * @param options - 裁剪上限与文件导出上下文。
 * @returns 被移除的备份列表，以及本轮文件系统侧的总体降级状态。
 */
export async function trimLocalBackups(
  options: {
    maxBackups: number;
    dirHandle?: FileSystemDirectoryHandle | null;
    permissionMode?: ExportDirPermissionMode;
  },
): Promise<{ removed: LocalBackupMeta[]; fileExportStatus: LocalBackupFileExportStatus }> {
  const maxBackups = Math.max(0, Math.floor(options.maxBackups || 0));
  if (maxBackups <= 0) return { removed: [], fileExportStatus: 'skipped' };

  const all = await listStoredLocalBackups(10_000);
  const toDelete = all.slice(maxBackups);
  if (toDelete.length < 1) return { removed: [], fileExportStatus: 'skipped' };

  let fileExportStatus: LocalBackupFileExportStatus = options.dirHandle ? 'ok' : 'skipped';
  for (const meta of toDelete) {
    const result = await deleteManagedLocalBackup(meta, {
      dirHandle: options.dirHandle,
      permissionMode: options.permissionMode,
    });
    if (result.fileExportStatus === 'degraded') fileExportStatus = 'degraded';
  }

  return {
    removed: toDelete,
    fileExportStatus,
  };
}

/**
 * 创建一份新的本地备份快照。
 *
 * @param options - 本轮快照配置。
 * @returns 缓存写入结果、文件导出状态，以及因上限裁剪掉的旧备份数量。
 *
 * @remarks
 * 该函数始终以“缓存成功”为主结果。
 * 即使目录句柄权限失效或文件导出失败，只要 IDB 快照落盘成功，本轮仍会返回 `degraded` 而不是整体失败。
 */
export async function createLocalBackupSnapshot(options: {
  profile: BackupProfile;
  maxBackups: number;
  permissionMode: ExportDirPermissionMode;
}): Promise<LocalBackupSnapshotResult> {
  return await withPersistenceOperationLock('local-backup:snapshot', async () => {
    const dirHandle = await getStoredExportDirHandle().catch(() => null);
    const blob = await exportBackupArchiveBlob(options.profile);
    const fileName = buildTimestampedBackupFileName({ profile: options.profile });
    const meta = await putStoredLocalBackup({ blob, fileName, lite: isLiteBackupProfile(options.profile) });

    let fileExportStatus: LocalBackupFileExportStatus = dirHandle ? 'ok' : 'skipped';
    if (dirHandle) {
      try {
        const exported = await exportBackupBlobToDirectory(dirHandle, fileName, blob, {
          permissionMode: options.permissionMode,
        });
        fileExportStatus = exported ? 'ok' : 'degraded';
      } catch {
        fileExportStatus = 'degraded';
      }
    }

    const trimResult = await trimLocalBackups({
      maxBackups: options.maxBackups,
      dirHandle,
      permissionMode: options.permissionMode,
    });
    if (trimResult.fileExportStatus === 'degraded') fileExportStatus = 'degraded';

    return {
      meta,
      fileExportStatus,
      trimmedCount: trimResult.removed.length,
    };
  });
}

/**
 * 汇总本地备份缓存规模。
 *
 * @returns 同时结合元数据条目数与 content store 实际 blob 数量的统计结果。
 */
export async function summarizeLocalBackupCache(): Promise<{ itemCount: number; bytes: number }> {
  const stats = await getLocalBackupStats();
  const contentIds = await listLocalBackupContentIds();
  return {
    itemCount: Math.max(stats.count, contentIds.length),
    bytes: stats.totalBytes,
  };
}

/**
 * 清空本地备份的导出目录 capability。
 *
 * @remarks
 * 该导出保留是为了兼容少数仍依赖旧名称的调用方；真实实现已经下沉到仓储层。
 */
export async function clearExportDirHandle(): Promise<void> {
  await clearStoredExportDirHandle();
}
