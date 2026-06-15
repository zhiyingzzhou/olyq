/**
 * 说明：`backup-scheduler-contract` 后台运行时模块。
 *
 * 职责：
 * - 承载 `backup-scheduler-contract` 相关的当前文件实现与模块边界；
 * - 对外暴露 `LOCAL_BACKUP_KEY`、`LOCAL_BACKUP_STATUS_KEY`、`LOCAL_BACKUP_ALARM` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/** 本地自动备份配置。 */
export const LOCAL_BACKUP_KEY = "olyq.sync.local-backup.v1";
/** 本地自动备份最近一次执行状态。 */
export const LOCAL_BACKUP_STATUS_KEY = "olyq.sync.local-backup.status.v1";
/** 本地自动备份 alarm 名称。 */
export const LOCAL_BACKUP_ALARM = "olyq/sync/local-backup";

/** WebDAV 自动备份配置。 */
export const WEBDAV_KEY = "olyq.sync.webdav.v1";
/** WebDAV 自动备份最近一次执行状态。 */
export const WEBDAV_STATUS_KEY = "olyq.sync.webdav.status.v1";
/** WebDAV 自动备份 alarm 名称。 */
export const WEBDAV_ALARM = "olyq/sync/webdav";

/** S3 自动备份配置。 */
export const S3_KEY = "olyq.sync.s3.v1";
/** S3 自动备份最近一次执行状态。 */
export const S3_STATUS_KEY = "olyq.sync.s3.status.v1";
/** S3 自动备份 alarm 名称。 */
export const S3_ALARM = "olyq/sync/s3";
