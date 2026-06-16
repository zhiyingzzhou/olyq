/**
 * 说明：`policies` 数据契约类型模块。
 *
 * 职责：
 * - 定义 Data Contract Registry v1 的公共类型与策略枚举；
 * - 固定当前公开数据契约版本为 `1`；
 * - 为 shared-storage、IndexedDB、备份和云同步提供统一的策略词表。
 *
 * 边界：
 * - 本文件只声明类型和版本常量；
 * - 不登记具体 key，也不执行 schema 规整；
 * - 当前开发期只维护 v1，不提供 v2 或 legacy 分支。
 */

/** 当前数据契约公开版本。 */
export const DATA_CONTRACT_VERSION = 1 as const;

/** 参与数据契约登记的存储位置。 */
export type DataContractStorage = 'chrome-storage-local' | 'local-storage' | 'indexeddb';

/** 当前 key 在普通备份中的处理策略。 */
export type DataContractExportPolicy = 'included' | 'excluded';

/** 当前 key 在 structured cloud sync 中的处理策略。 */
export type DataContractSyncPolicy = 'included' | 'encrypted-secret' | 'device-local' | 'cache';

/** 当前 key 是否允许复制到 localStorage bootstrap mirror。 */
export type DataContractBootstrapMirrorPolicy = 'allowed' | 'blocked';

/** 当前 key 的合并语义。 */
export type DataContractConflictPolicy = 'field-lww' | 'key-lww' | 'replace' | 'append-merge' | 'cache';

/** 当前 key 的清理语义。 */
export type DataContractCleanupPolicy = 'authoritative-replace' | 'delete-on-clear' | 'rebuildable-cache';

/** 单个轻量 JSON 存储 key 的 `v1` 契约描述。 */
export interface DataContractDescriptor<T = unknown> {
  /** 当前存储 key。 */
  readonly key: string;
  /** 该 key 所属模块或业务域。 */
  readonly owner: string;
  /** 存储位置。 */
  readonly storage: DataContractStorage;
  /** schema 版本；当前统一为 1。 */
  readonly schemaVersion: typeof DATA_CONTRACT_VERSION;
  /** 普通备份策略。 */
  readonly exportPolicy: DataContractExportPolicy;
  /** structured cloud sync 策略。 */
  readonly syncPolicy: DataContractSyncPolicy;
  /** 是否包含敏感字段。 */
  readonly sensitive: boolean;
  /** 是否允许作为扩展页冷启动镜像写入 localStorage。 */
  readonly bootstrapMirror: DataContractBootstrapMirrorPolicy;
  /** 冲突合并策略。 */
  readonly conflictPolicy: DataContractConflictPolicy;
  /** 清理策略。 */
  readonly cleanupPolicy: DataContractCleanupPolicy;
  /** 把任意输入收敛为当前 `v1` schema。 */
  readonly normalize: (value: unknown) => T;
}
