/**
 * 说明：`types` 持久化模块。
 *
 * 职责：
 * - 承载 `types` 相关的当前文件实现与模块边界；
 * - 对外暴露 `BackupProfile`、`PersistenceRestoreMode`、`PersistenceConflictPolicy` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/** 导出类型：`BackupProfile`。 */
export type BackupProfile = 'full' | 'lite';

/** 导出类型：`PersistenceRestoreMode`。 */
export type PersistenceRestoreMode = 'authoritative-replace';

/** 导出类型：`PersistenceConflictPolicy`。 */
export type PersistenceConflictPolicy =
  | 'authoritative-replace'
  | 'key-lww'
  | 'hlc-lww'
  | 'manual';

/** 导出类型：`PersistenceBackend`。 */
export type PersistenceBackend =
  | 'chrome-storage-local'
  | 'local-storage'
  | 'indexeddb';

/** 导出类型：`PersistenceDomainExport`。 */
export type PersistenceDomainExport = {
  data: unknown;
  itemCount: number;
  blobs?: Record<string, Blob>;
};

/** 导出类型：`PersistenceDomainSummary`。 */
export type PersistenceDomainSummary = {
  itemCount: number;
  bytes: number;
  detail?: Record<string, unknown>;
};

/** 导出类型：`PersistenceDomainDescriptor`。 */
export interface PersistenceDomainDescriptor<TData = unknown, TRollback = unknown> {
  id: string;
  backend: PersistenceBackend;
  schemaVersion: number;
  exportVersion: number;
  backupProfiles: readonly BackupProfile[];
  restoreMode: PersistenceRestoreMode;
  conflictPolicy: PersistenceConflictPolicy;
  containsSensitiveData?: boolean;
  load?: () => Promise<TData | null>;
  startupMigrate?: () => Promise<void>;
  flush?: () => Promise<void> | void;
  validate?: (value: unknown) => TData;
  export: (options: { profile: BackupProfile }) => Promise<PersistenceDomainExport>;
  captureRollback?: () => Promise<TRollback>;
  restore: (value: TData, options: { mode: PersistenceRestoreMode }) => Promise<void>;
  rollback?: (state: TRollback) => Promise<void>;
  reload?: () => Promise<void> | void;
  clear?: () => Promise<void>;
  summarize?: () => Promise<PersistenceDomainSummary>;
  migrateImported?: (value: unknown, context: { fromVersion: number }) => Promise<TData> | TData;
}

/** 导出类型：`PersistenceRegisteredDomain`。 */
export type PersistenceRegisteredDomain = Omit<
  PersistenceDomainDescriptor<unknown, unknown>,
  'validate' | 'captureRollback' | 'restore' | 'rollback' | 'migrateImported'
> & {
  validate?: (value: unknown) => unknown;
  captureRollback?: () => Promise<unknown>;
  restore: (value: unknown, options: { mode: PersistenceRestoreMode }) => Promise<void>;
  rollback?: (state: unknown) => Promise<void>;
  migrateImported?: (value: unknown, context: { fromVersion: number }) => Promise<unknown> | unknown;
};
