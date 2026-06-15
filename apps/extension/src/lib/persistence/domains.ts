/**
 * 说明：持久化域注册表。
 *
 * 关键共享配置 key 示例：'olyq.dark-theme-color.v1'。
 *
 * 职责：
 * - 为每个持久化域声明统一的 `domainId`、后端类型、导出/恢复/回滚语义；
 * - 让备份、恢复、迁移、维护脚本都只依赖注册表，而不是各自散落的存储实现；
 * - 在不引入运行时副作用的前提下，把“域级边界”明确收束到一个地方。
 *
 * 边界：
 * - 本文件只做域描述与注册，不负责编排 ZIP 归档或文件系统导出；
 * - `backup.local-cache` 与 `capabilities.export-dir` 只能依赖仓储层，不能反向依赖 `local-backup.ts` 这种编排层；
 * - 域 ID 常量下沉到 `domain-ids.ts`，避免 `backup-archive.ts` 为了少量常量把整个注册模块再拉回 import 图。
 */
import {
  clearAllAttachments,
  exportAllAttachments,
  getAttachmentStats,
  replaceAllAttachments,
  type AttachmentRecord,
} from '@/lib/attachments';
import { stripAttachmentRefsFromTopicRows } from '@/lib/attachment-references';
import { normalizeBackupProfile } from '@/lib/backup-config';
import { buildBackupChatSnapshot, buildBackupMemorySnapshot } from '@/lib/backup-schema';
import {
  clearMessagesDb,
  listAllTopicMessages,
  replaceAllTopicMessages,
  type TopicMessagesRow,
} from '@/lib/chat/messages-db';
import {
  exportLocalBackupCacheEntries,
  getLocalBackupStats,
  type LocalBackupCacheEntry,
  replaceLocalBackupCache,
  clearStoredExportDirHandle,
  clearStoredLocalBackups,
  getStoredExportDirHandle,
  replaceStoredExportDirHandle,
} from '@/lib/local-backup-store';
import {
  clearAllMemories,
  countMemories,
  exportAllMemoryRecords,
  replaceAllMemoryRecords,
  type MemoryBackupRecord,
} from '@/lib/memory/memory-store';
import { registerPersistenceDomain } from './registry';
import { storageEngine } from './storage-engine';
import type { PersistenceDomainDescriptor, PersistenceDomainSummary } from './types';
import {
  buildPaintWorkspaceExportSnapshot,
  clearPersistedPaintWorkspace,
  normalizePaintWorkspaceSnapshot,
  readPersistedPaintWorkspace,
  replacePersistedPaintWorkspace,
  summarizePaintWorkspace,
  type PaintWorkspaceSnapshot,
} from '@/lib/workspaces/paint-workspace';
import {
  ATTACHMENTS_DOMAIN_ID,
  CHAT_MESSAGES_DOMAIN_ID,
  EXPORT_DIR_CAPABILITY_DOMAIN_ID,
  LOCAL_BACKUP_CACHE_DOMAIN_ID,
  LOCAL_STORAGE_DOMAIN_ID,
  MEMORY_RECORDS_DOMAIN_ID,
  PAINT_WORKSPACE_DOMAIN_ID,
  SHARED_STORAGE_DOMAIN_ID,
  SYNC_INTERNAL_STORAGE_DOMAIN_ID,
} from './domain-ids';
import { PROVIDERS_STORAGE_KEY } from '@/lib/ai/storage-keys';
import { isPlainRecord } from '@/lib/utils/type-guards';
import {
  SHARED_STORAGE_BACKUP_KEYS,
  SHARED_STORAGE_CONTRACT_BY_KEY,
  normalizeSharedStorageSnapshot,
} from '@/lib/data-contracts/registry';

export {
  ATTACHMENTS_DOMAIN_ID,
  CHAT_MESSAGES_DOMAIN_ID,
  EXPORT_DIR_CAPABILITY_DOMAIN_ID,
  LOCAL_BACKUP_CACHE_DOMAIN_ID,
  LOCAL_STORAGE_DOMAIN_ID,
  MEMORY_RECORDS_DOMAIN_ID,
  PAINT_WORKSPACE_DOMAIN_ID,
  SHARED_STORAGE_DOMAIN_ID,
  SYNC_INTERNAL_STORAGE_DOMAIN_ID,
} from './domain-ids';

/** 仅服务同步内部状态的 `chrome.storage.local` 键集合。 */
export const SYNC_INTERNAL_STORAGE_KEYS = [
  'olyq.sync.hlc.v1',
  'olyq.sync.meta.v1',
  'olyq.sync.local-backup.status.v1',
  'olyq.sync.webdav.status.v1',
  'olyq.sync.s3.status.v1',
] as const;

/** 仍允许进入备份的少量 `localStorage` 键集合。 */
export const LOCAL_STORAGE_BACKUP_KEYS = [
  'olyq.legal.preset-remediation.v1',
] as const;

const encoder = new TextEncoder();
type LocalBackupCacheSnapshot = LocalBackupCacheEntry[];

// 每个域工厂都故意返回同一组核心钩子：
// `export -> captureRollback -> restore -> rollback -> clear -> summarize`。
// 这样 backup/restore 引擎只需要消费统一 descriptor 契约，不需要为不同后端再分叉编排逻辑。

/**
 * 校验“固定键集合”结构的 JSON snapshot。
 *
 * @param value - 外部导入或导出的原始值。
 * @param allowedKeys - 当前域允许出现的键集合。
 * @param validator - 单个值的校验器。
 * @returns 通过校验的普通对象。
 * @throws 当 snapshot 结构、键集合或值语义不符合域契约时抛错。
 */
function validateRecordKeys(
  value: unknown,
  allowedKeys: readonly string[],
  validator: (entry: unknown) => boolean,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid domain snapshot');
  const record = value as Record<string, unknown>;
  const allowed = new Set(allowedKeys);
  for (const [key, entry] of Object.entries(record)) {
    if (!allowed.has(key)) throw new Error(`unexpected key in domain snapshot: ${key}`);
    if (!validator(entry)) throw new Error(`invalid snapshot entry for key: ${key}`);
  }
  return record;
}

/**
 * 统计普通 JSON record 的条目数和近似字节数。
 *
 * @remarks
 * 这里的字节数用于备份摘要与容量感知，不要求精确到存储底层实现。
 */
function summarizeJsonRecord(record: Record<string, unknown>): PersistenceDomainSummary {
  const bytes = Object.values(record).reduce<number>((sum, value) => {
    try {
      return sum + encoder.encode(JSON.stringify(value)).length;
    } catch {
      return sum;
    }
  }, 0);
  return {
    itemCount: Object.keys(record).length,
    bytes,
  };
}

const OCR_VISUAL_PROVIDER_IDS = new Set(['together', 'siliconflow', 'openai-compatible-custom']);
const OCR_OR_VISUAL_MODEL_REGEX = /\b(?:ocr|got-ocr|mineru|nougat|docling|document(?:[-_/]?(?:understanding|understand|parser|parsing|ocr))?|parser|parsing|vision|vl|omni|pixtral|llava|minicpm-v|minicpmo|internvl|qvq|qwen(?:2(?:\.5)?|3)?-vl|qwen(?:2\.5|3)?-omni|deepseek-vl|gemma-3)\b/i;
const BACKUP_PROFILE_CONFIG_STORAGE_KEYS = [
  'olyq.sync.local-backup.v1',
  'olyq.sync.s3.v1',
  'olyq.sync.webdav.v1',
] as const;

/**
 * 内部函数：`mergeUniqueStrings`。
 *
 * @remarks
 * 用于在迁移阶段拼接 hints 与 feature 列表，保持顺序稳定并保证幂等。
 */
function mergeUniqueStrings(current: unknown, incoming: readonly string[]): string[] | undefined {
  const merged = [
    ...new Set([
      ...(Array.isArray(current) ? current.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []),
      ...incoming,
    ]),
  ];
  return merged.length > 0 ? merged : undefined;
}

/**
 * 内部函数：`normalizeProviderApiOptionsMigration`。
 *
 * @remarks
 * 彻底切换到新的图片 / 文件输入开关：
 * - 旧字段不再保留双写；
 * - 只在启动迁移时做一次升级，运行时不再解析旧字段。
 */
function normalizeProviderApiOptionsMigration(raw: unknown): { nextValue: unknown; changed: boolean } {
  if (!isPlainRecord(raw)) return { nextValue: raw, changed: false };

  const hadLegacyFlag = Object.prototype.hasOwnProperty.call(raw, 'isNotSupportArrayContent');
  const legacyValue = hadLegacyFlag ? raw.isNotSupportArrayContent : undefined;
  const nextValue: Record<string, unknown> = { ...raw };

  if (hadLegacyFlag) delete nextValue.isNotSupportArrayContent;
  if (legacyValue === true) {
    nextValue.isNotSupportImageInput = true;
    nextValue.isNotSupportFileInput = true;
  }

  const changed = hadLegacyFlag
    || nextValue.isNotSupportImageInput !== raw.isNotSupportImageInput
    || nextValue.isNotSupportFileInput !== raw.isNotSupportFileInput;

  return { nextValue, changed };
}

/**
 * 内部函数：`shouldPromoteModelToMultimodalChat`。
 *
 * @remarks
 * 这层只负责把 OCR / Vision / Document / Parsing 家族从 text-only hints 里救出来，
 * 不在持久化迁移里夸大成 file/document 官方能力。
 */
function shouldPromoteModelToMultimodalChat(providerId: string, model: Record<string, unknown>): boolean {
  if (!OCR_VISUAL_PROVIDER_IDS.has(providerId)) return false;

  const kindHint = typeof model.kindHint === 'string' ? model.kindHint : '';
  if (kindHint && kindHint !== 'chat' && kindHint !== 'unknown' && kindHint !== 'multimodal-chat') return false;

  const inputModalities = Array.isArray(model.inputModalities) ? model.inputModalities : [];
  if (inputModalities.includes('image')) return false;

  const identity = `${typeof model.id === 'string' ? model.id : ''} ${typeof model.name === 'string' ? model.name : ''}`.trim().toLowerCase();
  return OCR_OR_VISUAL_MODEL_REGEX.test(identity);
}

/**
 * 内部函数：`normalizeProviderModelMigration`。
 *
 * @remarks
 * 迁移只补显式 hints，不碰 `manualModelTypes`，避免覆盖用户已有手动能力选择。
 */
function normalizeProviderModelMigration(
  providerId: string,
  raw: unknown,
): { nextValue: unknown; changed: boolean } {
  if (!isPlainRecord(raw)) return { nextValue: raw, changed: false };
  if (!shouldPromoteModelToMultimodalChat(providerId, raw)) return { nextValue: raw, changed: false };

  const nextValue: Record<string, unknown> = { ...raw };
  const nextFeatures = mergeUniqueStrings(raw.features, ['vision-input']);
  const nextInputModalities = mergeUniqueStrings(raw.inputModalities, ['text', 'image']);
  const nextOutputModalities = mergeUniqueStrings(raw.outputModalities, ['text']);

  nextValue.kindHint = 'multimodal-chat';
  if (nextInputModalities) nextValue.inputModalities = nextInputModalities;
  if (nextOutputModalities) nextValue.outputModalities = nextOutputModalities;
  if (nextFeatures) nextValue.features = nextFeatures;

  return {
    nextValue,
    changed:
      nextValue.kindHint !== raw.kindHint
      || JSON.stringify(nextValue.inputModalities) !== JSON.stringify(raw.inputModalities)
      || JSON.stringify(nextValue.outputModalities) !== JSON.stringify(raw.outputModalities)
      || JSON.stringify(nextValue.features) !== JSON.stringify(raw.features),
  };
}

/**
 * 内部函数：`normalizeProvidersStorageMigration`。
 *
 * @remarks
 * 共享配置域里只有 providers 需要做本轮强制迁移，其他 key 保持原样。
 */
function normalizeProvidersStorageMigration(raw: unknown): { nextValue: unknown; changed: boolean } {
  if (!Array.isArray(raw)) return { nextValue: raw, changed: false };

  let changed = false;
  const nextValue = raw.map((provider) => {
    if (!isPlainRecord(provider)) return provider;

    const providerId = typeof provider.id === 'string' ? provider.id.trim() : '';
    const nextProvider: Record<string, unknown> = { ...provider };
    let providerChanged = false;

    if ('apiOptions' in provider) {
      const apiOptionsMigration = normalizeProviderApiOptionsMigration(provider.apiOptions);
      if (apiOptionsMigration.changed) {
        nextProvider.apiOptions = apiOptionsMigration.nextValue;
        changed = true;
        providerChanged = true;
      }
    }

    if (Array.isArray(provider.models) && provider.models.length > 0) {
      let modelListChanged = false;
      const nextModels = provider.models.map((model) => {
        const modelMigration = normalizeProviderModelMigration(providerId, model);
        if (modelMigration.changed) modelListChanged = true;
        return modelMigration.nextValue;
      });
      if (modelListChanged) {
        nextProvider.models = nextModels;
        changed = true;
        providerChanged = true;
      }
    }

    return providerChanged ? nextProvider : provider;
  });

  return { nextValue, changed };
}

/**
 * 归一化备份配置对象里的备份档位字段。
 *
 * 说明：
 * - 当前协议只认 `backupProfile`；
 * - 旧 `skipBackupFile` 一旦进入当前存储或导出链路，就会再次制造契约漂移，因此这里直接删除。
 */
function normalizeBackupProfileConfigMigration(raw: unknown): { nextValue: unknown; changed: boolean } {
  if (!isPlainRecord(raw)) return { nextValue: raw, changed: false };

  const normalizedProfile = normalizeBackupProfile(raw.backupProfile);
  const nextValue: Record<string, unknown> = { ...raw };
  let changed = false;

  if (raw.backupProfile !== normalizedProfile) {
    nextValue.backupProfile = normalizedProfile;
    changed = true;
  }
  if ('skipBackupFile' in nextValue) {
    delete nextValue.skipBackupFile;
    changed = true;
  }

  return {
    nextValue: changed ? nextValue : raw,
    changed,
  };
}

/**
 * 归一化 shared storage 里的备份配置快照。
 *
 * 说明：
 * - 启动迁移会把当前存储写回成新契约；
 * - 导出时也会再次做一次纯内存清洗，保证新的备份包不再把旧 key 带出去。
 */
function normalizeBackupProfileConfigSnapshotMigration(
  snapshot: Record<string, unknown>,
): { nextSnapshot: Record<string, unknown>; changed: boolean } {
  let nextSnapshot = snapshot;
  let changed = false;

  for (const key of BACKUP_PROFILE_CONFIG_STORAGE_KEYS) {
    const migration = normalizeBackupProfileConfigMigration(snapshot[key]);
    if (!migration.changed) continue;
    if (!changed) nextSnapshot = { ...snapshot };
    nextSnapshot[key] = migration.nextValue;
    changed = true;
  }

  return { nextSnapshot, changed };
}

/** 创建共享配置域描述。 */
function createSharedStorageDomain(): PersistenceDomainDescriptor<Record<string, unknown>, Record<string, unknown>> {
    /**
   * 内部函数变量：`validate`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const validate = (value: unknown) => normalizeSharedStorageSnapshot(value, SHARED_STORAGE_BACKUP_KEYS);
  return {
    id: SHARED_STORAGE_DOMAIN_ID,
    backend: 'chrome-storage-local',
    schemaVersion: 1,
    exportVersion: 1,
    backupProfiles: ['full', 'lite'],
    restoreMode: 'authoritative-replace',
    conflictPolicy: 'key-lww',
    containsSensitiveData: SHARED_STORAGE_BACKUP_KEYS.some((key) => SHARED_STORAGE_CONTRACT_BY_KEY.get(key)?.sensitive),
    validate,
    /**
     * 启动迁移：
     * - 共享配置域里统一收口 `olyq.providers.v1` 的强制升级；
     * - 这里只做结构升级，不做 registry 重建或其它跨模块副作用；
     * - 若当前 snapshot 未命中迁移条件，则不会写回，避免扩大发送链之外的存储抖动。
     */
    async startupMigrate() {
      const snapshot = await storageEngine.read('chrome-storage-local', SHARED_STORAGE_BACKUP_KEYS);
      const providersMigration = normalizeProvidersStorageMigration(snapshot[PROVIDERS_STORAGE_KEY]);
      let nextSnapshot = snapshot;
      let changed = false;
      if (providersMigration.changed) {
        nextSnapshot = {
          ...nextSnapshot,
          [PROVIDERS_STORAGE_KEY]: providersMigration.nextValue,
        };
        changed = true;
      }
      const backupConfigMigration = normalizeBackupProfileConfigSnapshotMigration(nextSnapshot);
      if (backupConfigMigration.changed) {
        nextSnapshot = backupConfigMigration.nextSnapshot;
        changed = true;
      }
      if (!changed) return;
      await storageEngine.replace('chrome-storage-local', SHARED_STORAGE_BACKUP_KEYS, nextSnapshot);
    },
        /**
     * 内部方法：`export`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async export() {
      const snapshot = await storageEngine.read('chrome-storage-local', SHARED_STORAGE_BACKUP_KEYS);
      const exportSnapshot = normalizeBackupProfileConfigSnapshotMigration(snapshot).nextSnapshot;
      return {
        data: validate(exportSnapshot),
        itemCount: Object.keys(exportSnapshot).length,
      };
    },
        /**
     * 内部方法：`captureRollback`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async captureRollback() {
      return await storageEngine.read('chrome-storage-local', SHARED_STORAGE_BACKUP_KEYS);
    },
        /**
     * 内部方法：`restore`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async restore(value) {
      await storageEngine.replace('chrome-storage-local', SHARED_STORAGE_BACKUP_KEYS, validate(value));
    },
        /**
     * 内部方法：`rollback`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async rollback(state) {
      await storageEngine.replace('chrome-storage-local', SHARED_STORAGE_BACKUP_KEYS, state);
    },
        /**
     * 内部方法：`clear`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async clear() {
      await storageEngine.delete('chrome-storage-local', SHARED_STORAGE_BACKUP_KEYS);
    },
        /**
     * 内部方法：`summarize`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async summarize() {
      const snapshot = await storageEngine.read('chrome-storage-local', SHARED_STORAGE_BACKUP_KEYS);
      return summarizeJsonRecord(snapshot);
    },
  };
}

/** 创建同步内部状态域描述。 */
function createSyncInternalStorageDomain(): PersistenceDomainDescriptor<Record<string, unknown>, Record<string, unknown>> {
    /**
   * 内部函数变量：`validate`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const validate = (value: unknown) => validateRecordKeys(value, SYNC_INTERNAL_STORAGE_KEYS, () => true);
  return {
    id: SYNC_INTERNAL_STORAGE_DOMAIN_ID,
    backend: 'chrome-storage-local',
    schemaVersion: 1,
    exportVersion: 1,
    backupProfiles: [],
    restoreMode: 'authoritative-replace',
    conflictPolicy: 'manual',
    validate,
        /**
     * 内部方法：`export`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async export() {
      const snapshot = await storageEngine.read('chrome-storage-local', SYNC_INTERNAL_STORAGE_KEYS);
      return {
        data: snapshot,
        itemCount: Object.keys(snapshot).length,
      };
    },
        /**
     * 内部方法：`captureRollback`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async captureRollback() {
      return await storageEngine.read('chrome-storage-local', SYNC_INTERNAL_STORAGE_KEYS);
    },
        /**
     * 内部方法：`restore`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async restore(value) {
      await storageEngine.replace('chrome-storage-local', SYNC_INTERNAL_STORAGE_KEYS, validate(value));
    },
        /**
     * 内部方法：`rollback`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async rollback(state) {
      await storageEngine.replace('chrome-storage-local', SYNC_INTERNAL_STORAGE_KEYS, state);
    },
        /**
     * 内部方法：`clear`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async clear() {
      await storageEngine.delete('chrome-storage-local', SYNC_INTERNAL_STORAGE_KEYS);
    },
        /**
     * 内部方法：`summarize`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async summarize() {
      const snapshot = await storageEngine.read('chrome-storage-local', SYNC_INTERNAL_STORAGE_KEYS);
      return summarizeJsonRecord(snapshot);
    },
  };
}

/** 创建少量本地字符串配置域描述。 */
function createLocalStorageDomain(): PersistenceDomainDescriptor<Record<string, string | null>, Record<string, string | null>> {
    /**
   * 内部函数变量：`validate`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const validate = (value: unknown) => {
    const record = validateRecordKeys(
      value,
      LOCAL_STORAGE_BACKUP_KEYS,
      (entry) => entry === null || typeof entry === 'string',
    );
    return Object.fromEntries(
      Object.entries(record).map(([key, entry]) => [key, entry === null ? null : String(entry)]),
    ) as Record<string, string | null>;
  };

  return {
    id: LOCAL_STORAGE_DOMAIN_ID,
    backend: 'local-storage',
    schemaVersion: 1,
    exportVersion: 1,
    backupProfiles: ['full', 'lite'],
    restoreMode: 'authoritative-replace',
    conflictPolicy: 'authoritative-replace',
    validate,
        /**
     * 内部方法：`export`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async export() {
      const raw = await storageEngine.read('local-storage', LOCAL_STORAGE_BACKUP_KEYS);
      return {
        data: Object.fromEntries(
          Object.entries(raw).map(([key, value]) => [key, value === null ? null : String(value)]),
        ),
        itemCount: Object.keys(raw).length,
      };
    },
        /**
     * 内部方法：`captureRollback`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async captureRollback() {
      const raw = await storageEngine.read('local-storage', LOCAL_STORAGE_BACKUP_KEYS);
      return Object.fromEntries(
        Object.entries(raw).map(([key, value]) => [key, value === null ? null : String(value)]),
      ) as Record<string, string | null>;
    },
        /**
     * 内部方法：`restore`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async restore(value) {
      await storageEngine.replace('local-storage', LOCAL_STORAGE_BACKUP_KEYS, validate(value));
    },
        /**
     * 内部方法：`rollback`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async rollback(state) {
      await storageEngine.replace('local-storage', LOCAL_STORAGE_BACKUP_KEYS, state);
    },
        /**
     * 内部方法：`clear`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async clear() {
      await storageEngine.delete('local-storage', LOCAL_STORAGE_BACKUP_KEYS);
    },
        /**
     * 内部方法：`summarize`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async summarize() {
      const snapshot = await storageEngine.read('local-storage', LOCAL_STORAGE_BACKUP_KEYS);
      return {
        ...summarizeJsonRecord(snapshot),
        detail: { keys: Object.keys(snapshot).sort() },
      };
    },
  };
}

/** 创建 Paint 工作区域描述。 */
function createPaintWorkspaceDomain(): PersistenceDomainDescriptor<PaintWorkspaceSnapshot, PaintWorkspaceSnapshot> {
  return {
    id: PAINT_WORKSPACE_DOMAIN_ID,
    backend: 'indexeddb',
    schemaVersion: 1,
    exportVersion: 1,
    backupProfiles: ['full', 'lite'],
    restoreMode: 'authoritative-replace',
    conflictPolicy: 'manual',
    validate: normalizePaintWorkspaceSnapshot,
        /**
     * 内部方法：`export`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async export(options) {
      const snapshot = await readPersistedPaintWorkspace();
      const data = buildPaintWorkspaceExportSnapshot(snapshot, { lite: options.profile === 'lite' });
      return {
        data,
        itemCount: data.paintings.length,
      };
    },
        /**
     * 内部方法：`captureRollback`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async captureRollback() {
      return await readPersistedPaintWorkspace();
    },
        /**
     * 内部方法：`restore`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async restore(value) {
      await replacePersistedPaintWorkspace(normalizePaintWorkspaceSnapshot(value));
    },
        /**
     * 内部方法：`rollback`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async rollback(state) {
      await replacePersistedPaintWorkspace(state);
    },
        /**
     * 内部方法：`clear`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async clear() {
      await clearPersistedPaintWorkspace();
    },
        /**
     * 内部方法：`summarize`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async summarize() {
      return await summarizePaintWorkspace();
    },
  };
}

/** 创建聊天消息域描述。 */
function createChatMessagesDomain(): PersistenceDomainDescriptor<
  ReturnType<typeof buildBackupChatSnapshot>,
  TopicMessagesRow[]
> {
    /**
   * 内部函数变量：`validate`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const validate = (value: unknown) => buildBackupChatSnapshot(
    Array.isArray((value as { messages?: unknown })?.messages)
      ? ((value as { messages: TopicMessagesRow[] }).messages)
      : [],
  );
  return {
    id: CHAT_MESSAGES_DOMAIN_ID,
    backend: 'indexeddb',
    schemaVersion: 1,
    exportVersion: 1,
    backupProfiles: ['full', 'lite'],
    restoreMode: 'authoritative-replace',
    conflictPolicy: 'hlc-lww',
    validate,
        /**
     * 内部方法：`export`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async export(options) {
      const rows = await listAllTopicMessages();
      const snapshot = buildBackupChatSnapshot(
        options.profile === 'lite' ? stripAttachmentRefsFromTopicRows(rows) : rows,
      );
      return {
        data: snapshot,
        itemCount: snapshot.metadata.messageCount,
      };
    },
        /**
     * 内部方法：`captureRollback`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async captureRollback() {
      return await listAllTopicMessages();
    },
        /**
     * 内部方法：`restore`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async restore(value) {
      await replaceAllTopicMessages(validate(value).messages);
    },
        /**
     * 内部方法：`rollback`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async rollback(state) {
      await replaceAllTopicMessages(state);
    },
        /**
     * 内部方法：`clear`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async clear() {
      await clearMessagesDb();
    },
        /**
     * 内部方法：`summarize`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async summarize() {
      const rows = await listAllTopicMessages();
      return {
        itemCount: rows.reduce((sum, row) => sum + (Array.isArray(row.messages) ? row.messages.length : 0), 0),
        bytes: encoder.encode(JSON.stringify(rows)).length,
      };
    },
  };
}

/** 创建记忆记录域描述。 */
function createMemoryDomain(): PersistenceDomainDescriptor<
  ReturnType<typeof buildBackupMemorySnapshot>,
  MemoryBackupRecord[]
> {
    /**
   * 内部函数变量：`validate`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const validate = (value: unknown) => buildBackupMemorySnapshot(
    Array.isArray((value as { records?: unknown })?.records)
      ? ((value as { records: MemoryBackupRecord[] }).records)
      : [],
  );
  return {
    id: MEMORY_RECORDS_DOMAIN_ID,
    backend: 'indexeddb',
    schemaVersion: 1,
    exportVersion: 1,
    backupProfiles: ['full', 'lite'],
    restoreMode: 'authoritative-replace',
    conflictPolicy: 'manual',
    validate,
        /**
     * 内部方法：`export`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async export() {
      const records = await exportAllMemoryRecords();
      const snapshot = buildBackupMemorySnapshot(records);
      return {
        data: snapshot,
        itemCount: snapshot.metadata.count,
      };
    },
        /**
     * 内部方法：`captureRollback`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async captureRollback() {
      return await exportAllMemoryRecords();
    },
        /**
     * 内部方法：`restore`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async restore(value) {
      const snapshot = validate(value);
      await replaceAllMemoryRecords(snapshot.records);
    },
        /**
     * 内部方法：`rollback`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async rollback(state) {
      await replaceAllMemoryRecords(state);
    },
        /**
     * 内部方法：`clear`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async clear() {
      await clearAllMemories();
    },
        /**
     * 内部方法：`summarize`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async summarize() {
      const records = await exportAllMemoryRecords();
      return {
        itemCount: await countMemories().catch(() => records.length),
        bytes: encoder.encode(JSON.stringify(records)).length,
      };
    },
  };
}

/** 创建附件域描述。 */
function createAttachmentsDomain(): PersistenceDomainDescriptor<AttachmentRecord[], AttachmentRecord[]> {
    /**
   * 内部函数变量：`validate`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const validate = (value: unknown) => {
    if (!Array.isArray(value)) throw new Error('invalid attachments snapshot');
    return value as AttachmentRecord[];
  };
  return {
    id: ATTACHMENTS_DOMAIN_ID,
    backend: 'indexeddb',
    schemaVersion: 1,
    exportVersion: 1,
    backupProfiles: ['full'],
    restoreMode: 'authoritative-replace',
    conflictPolicy: 'manual',
    validate,
        /**
     * 内部方法：`export`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async export() {
      const records = await exportAllAttachments();
      return {
        data: records,
        itemCount: records.length,
      };
    },
        /**
     * 内部方法：`captureRollback`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async captureRollback() {
      return await exportAllAttachments();
    },
        /**
     * 内部方法：`restore`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async restore(value) {
      await replaceAllAttachments(validate(value));
    },
        /**
     * 内部方法：`rollback`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async rollback(state) {
      await replaceAllAttachments(state);
    },
        /**
     * 内部方法：`clear`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async clear() {
      await clearAllAttachments();
    },
        /**
     * 内部方法：`summarize`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async summarize() {
      const stats = await getAttachmentStats();
      return {
        itemCount: stats.count,
        bytes: stats.totalBytes,
      };
    },
  };
}

/** 创建本地备份缓存域描述。 */
function createLocalBackupCacheDomain(): PersistenceDomainDescriptor<
  LocalBackupCacheSnapshot,
  LocalBackupCacheSnapshot
> {
    /**
   * 内部函数变量：`validate`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const validate = (value: unknown) => {
    if (!Array.isArray(value)) throw new Error('invalid local backup cache snapshot');
    return value as LocalBackupCacheSnapshot;
  };
  return {
    id: LOCAL_BACKUP_CACHE_DOMAIN_ID,
    backend: 'indexeddb',
    schemaVersion: 1,
    exportVersion: 1,
    backupProfiles: [],
    restoreMode: 'authoritative-replace',
    conflictPolicy: 'manual',
    validate,
        /**
     * 内部方法：`export`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async export() {
      const entries = await exportLocalBackupCacheEntries();
      return {
        data: entries,
        itemCount: entries.length,
      };
    },
        /**
     * 内部方法：`captureRollback`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async captureRollback() {
      return await exportLocalBackupCacheEntries();
    },
        /**
     * 内部方法：`restore`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async restore(value) {
      await replaceLocalBackupCache(validate(value));
    },
        /**
     * 内部方法：`rollback`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async rollback(state) {
      await replaceLocalBackupCache(state);
    },
        /**
     * 内部方法：`clear`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async clear() {
      await clearStoredLocalBackups();
    },
        /**
     * 内部方法：`summarize`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async summarize() {
      const stats = await getLocalBackupStats();
      return {
        itemCount: stats.count,
        bytes: stats.totalBytes,
      };
    },
  };
}

/** 创建导出目录 capability 域描述。 */
function createExportDirCapabilityDomain(): PersistenceDomainDescriptor<FileSystemDirectoryHandle | null, FileSystemDirectoryHandle | null> {
    /**
   * 内部函数变量：`validate`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const validate = (value: unknown) => (value && typeof value === 'object' ? (value as FileSystemDirectoryHandle) : null);
  return {
    id: EXPORT_DIR_CAPABILITY_DOMAIN_ID,
    backend: 'indexeddb',
    schemaVersion: 1,
    exportVersion: 1,
    backupProfiles: [],
    restoreMode: 'authoritative-replace',
    conflictPolicy: 'manual',
    validate,
        /**
     * 内部方法：`export`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async export() {
      const handle = await getStoredExportDirHandle();
      return {
        data: handle,
        itemCount: handle ? 1 : 0,
      };
    },
        /**
     * 内部方法：`captureRollback`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async captureRollback() {
      return await getStoredExportDirHandle();
    },
        /**
     * 内部方法：`restore`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async restore(value) {
      await replaceStoredExportDirHandle(validate(value));
    },
        /**
     * 内部方法：`rollback`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async rollback(state) {
      await replaceStoredExportDirHandle(state);
    },
        /**
     * 内部方法：`clear`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async clear() {
      await clearStoredExportDirHandle();
    },
        /**
     * 内部方法：`summarize`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async summarize() {
      return {
        itemCount: (await getStoredExportDirHandle()) ? 1 : 0,
        bytes: 0,
      };
    },
  };
}

let registered = false;

/**
 * 注册所有持久化域。
 *
 * @remarks
 * 这里必须保持幂等，因为 service worker / sidepanel / offscreen 可能在不同生命周期多次触发初始化。
 */
export function ensurePersistenceDomainsRegistered(): void {
  if (registered) return;
  registered = true;
  // 注册阶段只装配 descriptor，不做真实 IO；真正的 flush/load/restore 由对应引擎在持锁时机触发。
  registerPersistenceDomain(createSharedStorageDomain());
  registerPersistenceDomain(createSyncInternalStorageDomain());
  registerPersistenceDomain(createLocalStorageDomain());
  registerPersistenceDomain(createPaintWorkspaceDomain());
  registerPersistenceDomain(createChatMessagesDomain());
  registerPersistenceDomain(createMemoryDomain());
  registerPersistenceDomain(createAttachmentsDomain());
  registerPersistenceDomain(createLocalBackupCacheDomain());
  registerPersistenceDomain(createExportDirCapabilityDomain());
}
