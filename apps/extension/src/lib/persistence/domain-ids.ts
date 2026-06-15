/**
 * 说明：`domain-ids` 持久化模块。
 *
 * 职责：
 * - 承载 `domain-ids` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SHARED_STORAGE_DOMAIN_ID`、`SYNC_INTERNAL_STORAGE_DOMAIN_ID`、`LOCAL_STORAGE_DOMAIN_ID` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：持久化域 ID 与备份恢复优先级。
 *
 * 职责：
 * - 承载持久化域的稳定标识，避免 `backup-archive` 为了少量常量反向拉入整个注册表模块；
 * - 为备份恢复阶段提供固定优先级，保证 restore 顺序与物理依赖顺序一致；
 * - 保持为“无副作用的小模块”，禁止引入具体存储实现或运行时逻辑。
 */

/** 共享配置域：跨上下文共享的小型 JSON。 */
export const SHARED_STORAGE_DOMAIN_ID = 'config.shared-storage';
/** 同步内部状态域：HLC、同步状态等不参与业务备份的内部元数据。 */
export const SYNC_INTERNAL_STORAGE_DOMAIN_ID = 'sync.internal-storage';
/** 浏览器本地 `localStorage` 域：仅保留少量必须的本地字符串键。 */
export const LOCAL_STORAGE_DOMAIN_ID = 'config.local-storage';
/** Paint 工作区域：真源在共享 workspace IndexedDB。 */
export const PAINT_WORKSPACE_DOMAIN_ID = 'workspace.paint';
/** 聊天消息域：消息库与主题消息快照。 */
export const CHAT_MESSAGES_DOMAIN_ID = 'chat.messages';
/** 记忆域：memory records 与 embeddings 相关业务数据。 */
export const MEMORY_RECORDS_DOMAIN_ID = 'memory.records';
/** 附件域：二进制附件与其元数据。 */
export const ATTACHMENTS_DOMAIN_ID = 'attachments.records';
/** 本地备份缓存域：设备级运维缓存，不参与业务归档导出。 */
export const LOCAL_BACKUP_CACHE_DOMAIN_ID = 'backup.local-cache';
/** 导出目录能力域：文件系统目录句柄等 capability 数据。 */
export const EXPORT_DIR_CAPABILITY_DOMAIN_ID = 'capabilities.export-dir';

/**
 * 备份恢复优先级表。
 *
 * @remarks
 * 数字越小越早恢复。顺序原则是：
 * 1. 先恢复大对象/底层载荷；
 * 2. 再恢复引用这些载荷的业务域；
 * 3. 最后恢复配置域与本地字符串域。
 */
const BACKUP_RESTORE_PRIORITY = new Map<string, number>([
  [ATTACHMENTS_DOMAIN_ID, 1],
  [CHAT_MESSAGES_DOMAIN_ID, 2],
  [PAINT_WORKSPACE_DOMAIN_ID, 3],
  [MEMORY_RECORDS_DOMAIN_ID, 4],
  [SHARED_STORAGE_DOMAIN_ID, 5],
  [LOCAL_STORAGE_DOMAIN_ID, 6],
]);

/**
 * 读取指定持久化域的备份恢复优先级。
 *
 * @param domainId - 域注册表中的稳定 `domainId`。
 * @returns 已知域返回固定优先级；未知域统一回退到 `99`，保证它们排在尾部。
 */
export function getBackupRestorePriority(domainId: string): number {
  return BACKUP_RESTORE_PRIORITY.get(domainId) ?? 99;
}
