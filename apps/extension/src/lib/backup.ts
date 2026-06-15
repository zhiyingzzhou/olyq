/**
 * 说明：`backup` 备份模块。
 *
 * 职责：
 * - 承载 `backup` 相关的当前文件实现与模块边界；
 * - 对外暴露 `broadcastStoreReload` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { applyInitialDisplaySettings } from './display-settings';
import { applyInitialTheme } from './theme';
import { applyStoredLanguage } from '@/i18n';
import { broadcastStoreReloadSignal } from '@/lib/storage/reload-signal';
import { exportBackupAsZip, importBackupFromZip, planRestoreFromZip } from './backup-core';

export {
  type BackupRestorePlan,
  type BackupManifest,
  type BackupArchive,
  type BackupDomainManifest,
  type BackupDomainSnapshot,
} from './backup-archive';

/**
 * 导出 ZIP 备份归档。
 *
 * 说明：
 * - 整个导出过程会串行化，避免多个导出任务同时读取快照；
 * - `profile === 'lite'` 时会省略附件二进制，只保留去引用后的业务数据。
 */
export { exportBackupAsZip };

/**
 * 从 ZIP 归档恢复备份。
 *
 * 说明：
 * - 恢复过程同样会串行化，避免与导出或另一轮导入互相覆盖；
 * - 真正的还原逻辑由 `restoreBackupSnapshot` 负责。
 */
export { importBackupFromZip };

/** 预检并生成恢复计划，但不真正修改当前数据。 */
export { planRestoreFromZip };

/**
 * 广播“持久化 store 已被外部恢复/覆盖”的事件。
 *
 * 说明：
 * - 导入备份后，UI 侧各个 store 需要重新从存储层加载；
 * - 同时会顺手重新应用语言、主题和显示设置，降低恢复后的错位感。
 */
export async function broadcastStoreReload() {
  try {
    applyStoredLanguage();
    applyInitialTheme();
    window.dispatchEvent(new Event('olyq:theme-changed'));
    applyInitialDisplaySettings();
    window.dispatchEvent(new Event('olyq:display-settings'));
  } catch {
    // 忽略：reload 广播不应因为 UI 同步失败而中断
  }
  await broadcastStoreReloadSignal();
}
