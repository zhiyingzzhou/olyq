/**
 * 说明：`backup-core` 备份模块。
 *
 * 职责：
 * - 承载 `backup-core` 相关的当前文件实现与模块边界；
 * - 对外暴露 `exportBackupAsZip`、`importBackupFromZip`、`planRestoreFromZip` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { runSerializedBackupJob } from './backup-queue';
import {
  exportBackupArchiveWithLock,
  importBackupArchiveWithLock,
  planBackupRestore,
  type BackupRestorePlan,
} from './backup-archive';
import type { BackupProfile } from './persistence/types';

/**
 * 导出 ZIP 备份归档。
 *
 * 说明：
 * - 整个导出过程会串行化，避免多个导出任务同时读取快照；
 * - `profile === 'lite'` 时会省略附件二进制，只保留去引用后的业务数据。
 */
export async function exportBackupAsZip(profile: BackupProfile): Promise<Blob> {
  return await runSerializedBackupJob('backup:export', async () => {
    return await exportBackupArchiveWithLock(profile);
  });
}

/**
 * 从 ZIP 归档恢复备份。
 *
 * 说明：
 * - 恢复过程同样会串行化，避免与导出或另一轮导入互相覆盖；
 * - 真正的还原逻辑由 `restoreBackupSnapshot` 负责。
 */
export async function importBackupFromZip(zipBlob: Blob): Promise<void> {
  await runSerializedBackupJob('backup:import', async () => {
    await importBackupArchiveWithLock(zipBlob);
  });
}

/**
 * 导出函数：`planRestoreFromZip`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function planRestoreFromZip(zipBlob: Blob): Promise<BackupRestorePlan> {
  return await runSerializedBackupJob('backup:plan-restore', async () => {
    return await planBackupRestore(zipBlob);
  });
}
