/**
 * 说明：`registry` 数据契约模块。
 *
 * 职责：
 * - 声明浏览器扩展当前 `v1` 持久化数据契约；
 * - 为备份、恢复、云同步和测试 guard 提供同一份 key/schema/policy 真源；
 * - 把敏感字段从普通配置中显式标记出来，避免云同步远端出现明文凭据。
 *
 * 边界：
 * - 本模块只处理轻量 JSON 配置和同步契约，不直接读写 storage；
 * - IndexedDB 大对象仍由各自仓储模块负责导出/恢复；
 * - 当前开发期只认当前 `v1` 结构，不提供旧结构兼容解析。
 */
import { normalizeBrowserContextSettings } from '@/lib/browser-context/settings-schema';
import {
  CHAT_MESSAGES_CHANGED_SIGNAL_KEY,
  normalizeChatMessagesChangedSignal,
} from '@/lib/chat/message-change-signal.schema';
import { sanitizeRuntime } from '@/lib/chat/runtime-selection';
import {
  OFFSCREEN_UNLOAD_CONFIG_KEY,
  normalizeOffscreenUnloadConfig,
} from '@/lib/extension/offscreen-unload-config';
import { PAGE_TOOLS_SETTINGS_KEY, normalizePageToolsSettings } from '@/lib/extension/page-tools-schema';
import {
  SW_KEEPALIVE_CONFIG_KEY,
  normalizeSwKeepAliveConfig,
} from '@/lib/extension/sw-keepalive-config';
import { normalizeProvidersForSharedConfig } from '@/lib/ai/provider-secrets';
import { normalizeProviderApiKeyRotationState } from '@/lib/ai/api-key-rotation-schema';
import {
  MODEL_REGISTRY_LOCK_STORAGE_KEY,
  MODEL_REGISTRY_STORAGE_KEY,
  MODEL_REGISTRY_SYNC_META_STORAGE_KEY,
  PROVIDER_API_KEY_ROTATION_STATE_STORAGE_KEY,
  PROVIDERS_STORAGE_KEY,
} from '@/lib/ai/storage-keys';
import { normalizeQuickPhrases } from '@/lib/quick-phrases/phrase-normalize';
import { isPlainRecord } from '@/lib/utils/type-guards';
import { normalizeTheme } from '@/lib/theme-schema';
import { coerceDisplaySettings } from '@/lib/display-settings-schema';
import { WEB_SEARCH_SETTINGS_STORAGE_KEY, normalizeWebSearchSettings } from '@/lib/web-search/settings-schema';
import { normalizeBrowserContextPolicyState } from '@/lib/browser-context/policy-schema';
import { normalizeMemoryConfig } from '@/lib/memory/memory-settings-schema';
import {
  normalizeMcpServersForStorage,
  normalizeMcpSettingsConfig,
} from '@/lib/mcp/storage-schema';
import { MCP_SERVERS_STORAGE_KEY } from '@/lib/mcp/constants';
import {
  assertJsonSerializable,
  normalizeBackupProfileConfig,
  normalizeBoolean,
  normalizeChatSettings,
  normalizeDarkThemeColor,
  normalizeJsonRecord,
  normalizeMentionedModelsDraft,
  normalizeNullableString,
  normalizeNumber,
  normalizePromptTemplates,
  normalizeStringArray,
} from './normalizers';
import { sanitizeAssistants } from '@/lib/assistant/assistant-storage';
import { sanitizeStoredAssistantPresets } from '@/lib/assistant/preset-storage';
import { DATA_CONTRACT_VERSION } from './policies';
import type { DataContractDescriptor, DataContractStorage } from './policies';
export {
  DATA_CONTRACT_VERSION,
  type DataContractCleanupPolicy,
  type DataContractBootstrapMirrorPolicy,
  type DataContractConflictPolicy,
  type DataContractDescriptor,
  type DataContractExportPolicy,
  type DataContractStorage,
  type DataContractSyncPolicy,
} from './policies';

/**
 * 创建 shared-storage 数据契约描述。
 *
 * @param descriptor - 不含固定版本和默认 storage 的契约描述。
 * @returns 已补齐 v1 版本和 JSON 序列化校验的描述。
 */
function createDescriptor<T>(
  descriptor: Omit<DataContractDescriptor<T>, 'schemaVersion' | 'storage' | 'bootstrapMirror'> & {
    readonly storage?: DataContractStorage;
    readonly bootstrapMirror?: DataContractDescriptor<T>['bootstrapMirror'];
  },
): DataContractDescriptor<T> {
  return {
    storage: 'chrome-storage-local',
    schemaVersion: DATA_CONTRACT_VERSION,
    bootstrapMirror: 'blocked',
    ...descriptor,
    normalize: (value: unknown) => assertJsonSerializable(descriptor.normalize(value)) as T,
  };
}

/** `chrome.storage.local` 共享配置 key 的当前 `v1` 契约。 */
export const SHARED_STORAGE_CONTRACTS = [
  createDescriptor({
    key: 'olyq.assistants.v1',
    owner: 'assistant',
    exportPolicy: 'included',
    syncPolicy: 'included',
    sensitive: false,
    bootstrapMirror: 'allowed',
    conflictPolicy: 'field-lww',
    cleanupPolicy: 'authoritative-replace',
    normalize: (value) => sanitizeAssistants(value, { sort: true, fallbackToDefaultTopics: false }),
  }),
  createDescriptor({
    key: 'olyq.assistant-presets.v1',
    owner: 'assistant-presets',
    exportPolicy: 'included',
    syncPolicy: 'included',
    sensitive: false,
    bootstrapMirror: 'allowed',
    conflictPolicy: 'key-lww',
    cleanupPolicy: 'authoritative-replace',
    normalize: sanitizeStoredAssistantPresets,
  }),
  createDescriptor({
    key: 'olyq.browser-context.policy.v1',
    owner: 'browser-context',
    exportPolicy: 'included',
    syncPolicy: 'included',
    sensitive: false,
    bootstrapMirror: 'allowed',
    conflictPolicy: 'key-lww',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeBrowserContextPolicyState,
  }),
  createDescriptor({
    key: 'olyq.browser-context.settings.v1',
    owner: 'browser-context',
    exportPolicy: 'included',
    syncPolicy: 'included',
    sensitive: false,
    bootstrapMirror: 'allowed',
    conflictPolicy: 'key-lww',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeBrowserContextSettings,
  }),
  createDescriptor({
    key: 'olyq.chat.prompts.v1',
    owner: 'chat-prompts',
    exportPolicy: 'included',
    syncPolicy: 'included',
    sensitive: false,
    bootstrapMirror: 'allowed',
    conflictPolicy: 'key-lww',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizePromptTemplates,
  }),
  createDescriptor({
    key: 'olyq.chat-mentioned-models.v1',
    owner: 'chat-input',
    exportPolicy: 'included',
    syncPolicy: 'included',
    sensitive: false,
    bootstrapMirror: 'allowed',
    conflictPolicy: 'key-lww',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeMentionedModelsDraft,
  }),
  createDescriptor({
    key: 'olyq.chat.runtime.v1',
    owner: 'chat-runtime',
    exportPolicy: 'included',
    syncPolicy: 'device-local',
    sensitive: false,
    bootstrapMirror: 'allowed',
    conflictPolicy: 'replace',
    cleanupPolicy: 'authoritative-replace',
    normalize: sanitizeRuntime,
  }),
  createDescriptor({
    key: CHAT_MESSAGES_CHANGED_SIGNAL_KEY,
    owner: 'chat-messages-signal',
    exportPolicy: 'excluded',
    syncPolicy: 'device-local',
    sensitive: false,
    conflictPolicy: 'replace',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeChatMessagesChangedSignal,
  }),
  createDescriptor({
    key: 'olyq.chat.settings.v1',
    owner: 'chat-settings',
    exportPolicy: 'included',
    syncPolicy: 'included',
    sensitive: false,
    bootstrapMirror: 'allowed',
    conflictPolicy: 'key-lww',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeChatSettings,
  }),
  createDescriptor({
    key: 'olyq.chat.composer-shell-height.v1',
    owner: 'chat-input',
    exportPolicy: 'included',
    syncPolicy: 'device-local',
    sensitive: false,
    bootstrapMirror: 'allowed',
    conflictPolicy: 'replace',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeNumber,
  }),
  createDescriptor({
    key: 'olyq.content-script.enabled.v1',
    owner: 'content-script',
    exportPolicy: 'included',
    syncPolicy: 'device-local',
    sensitive: false,
    conflictPolicy: 'replace',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeBoolean,
  }),
  createDescriptor({
    key: 'olyq.display-settings.v1',
    owner: 'display-settings',
    exportPolicy: 'included',
    syncPolicy: 'included',
    sensitive: false,
    bootstrapMirror: 'allowed',
    conflictPolicy: 'key-lww',
    cleanupPolicy: 'authoritative-replace',
    normalize: coerceDisplaySettings,
  }),
  createDescriptor({
    key: 'olyq.dark-theme-color.v1',
    owner: 'theme',
    exportPolicy: 'included',
    syncPolicy: 'included',
    sensitive: false,
    bootstrapMirror: 'allowed',
    conflictPolicy: 'key-lww',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeDarkThemeColor,
  }),
  createDescriptor({
    key: 'olyq.language.v1',
    owner: 'i18n',
    exportPolicy: 'included',
    syncPolicy: 'included',
    sensitive: false,
    bootstrapMirror: 'allowed',
    conflictPolicy: 'key-lww',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeNullableString,
  }),
  createDescriptor({
    key: 'olyq.mcp.settings.v1',
    owner: 'mcp',
    exportPolicy: 'included',
    syncPolicy: 'included',
    sensitive: false,
    conflictPolicy: 'key-lww',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeMcpSettingsConfig,
  }),
  createDescriptor({
    key: MCP_SERVERS_STORAGE_KEY,
    owner: 'mcp',
    exportPolicy: 'included',
    syncPolicy: 'encrypted-secret',
    sensitive: true,
    conflictPolicy: 'key-lww',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeMcpServersForStorage,
  }),
  createDescriptor({
    key: 'olyq.memory.config.v1',
    owner: 'memory',
    exportPolicy: 'included',
    syncPolicy: 'included',
    sensitive: false,
    bootstrapMirror: 'allowed',
    conflictPolicy: 'key-lww',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeMemoryConfig,
  }),
  createDescriptor({
    key: MODEL_REGISTRY_STORAGE_KEY,
    owner: 'model-registry',
    exportPolicy: 'included',
    syncPolicy: 'cache',
    sensitive: false,
    conflictPolicy: 'cache',
    cleanupPolicy: 'rebuildable-cache',
    normalize: normalizeJsonRecord,
  }),
  createDescriptor({
    key: MODEL_REGISTRY_SYNC_META_STORAGE_KEY,
    owner: 'model-registry',
    exportPolicy: 'included',
    syncPolicy: 'cache',
    sensitive: false,
    conflictPolicy: 'cache',
    cleanupPolicy: 'rebuildable-cache',
    normalize: normalizeJsonRecord,
  }),
  createDescriptor({
    key: MODEL_REGISTRY_LOCK_STORAGE_KEY,
    owner: 'model-registry',
    exportPolicy: 'excluded',
    syncPolicy: 'cache',
    sensitive: false,
    conflictPolicy: 'cache',
    cleanupPolicy: 'rebuildable-cache',
    normalize: normalizeJsonRecord,
  }),
  createDescriptor({
    key: PROVIDER_API_KEY_ROTATION_STATE_STORAGE_KEY,
    owner: 'providers',
    exportPolicy: 'excluded',
    syncPolicy: 'cache',
    sensitive: false,
    conflictPolicy: 'cache',
    cleanupPolicy: 'rebuildable-cache',
    normalize: normalizeProviderApiKeyRotationState,
  }),
  createDescriptor({
    key: 'olyq.openai-responses-store-capability.v1',
    owner: 'ai-capability',
    exportPolicy: 'included',
    syncPolicy: 'included',
    sensitive: false,
    conflictPolicy: 'key-lww',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeJsonRecord,
  }),
  createDescriptor({
    key: 'olyq.models.pinned.v1',
    owner: 'models',
    exportPolicy: 'included',
    syncPolicy: 'included',
    sensitive: false,
    conflictPolicy: 'key-lww',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeStringArray,
  }),
  createDescriptor({
    key: PAGE_TOOLS_SETTINGS_KEY,
    owner: 'page-tools',
    exportPolicy: 'included',
    syncPolicy: 'included',
    sensitive: false,
    bootstrapMirror: 'allowed',
    conflictPolicy: 'key-lww',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizePageToolsSettings,
  }),
  createDescriptor({
    key: OFFSCREEN_UNLOAD_CONFIG_KEY,
    owner: 'performance',
    exportPolicy: 'included',
    syncPolicy: 'device-local',
    sensitive: false,
    conflictPolicy: 'replace',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeOffscreenUnloadConfig,
  }),
  createDescriptor({
    key: PROVIDERS_STORAGE_KEY,
    owner: 'providers',
    exportPolicy: 'included',
    syncPolicy: 'encrypted-secret',
    sensitive: true,
    conflictPolicy: 'key-lww',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeProvidersForSharedConfig,
  }),
  createDescriptor({
    key: 'olyq.quick-phrases.v1',
    owner: 'quick-phrases',
    exportPolicy: 'included',
    syncPolicy: 'included',
    sensitive: false,
    bootstrapMirror: 'allowed',
    conflictPolicy: 'key-lww',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeQuickPhrases,
  }),
  createDescriptor({
    key: SW_KEEPALIVE_CONFIG_KEY,
    owner: 'service-worker',
    exportPolicy: 'included',
    syncPolicy: 'device-local',
    sensitive: false,
    conflictPolicy: 'replace',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeSwKeepAliveConfig,
  }),
  createDescriptor({
    key: 'olyq.sync.local-backup.v1',
    owner: 'backup',
    exportPolicy: 'included',
    syncPolicy: 'device-local',
    sensitive: false,
    conflictPolicy: 'replace',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeBackupProfileConfig,
  }),
  createDescriptor({
    key: 'olyq.sync.s3.v1',
    owner: 'sync',
    exportPolicy: 'included',
    syncPolicy: 'device-local',
    sensitive: true,
    conflictPolicy: 'replace',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeBackupProfileConfig,
  }),
  createDescriptor({
    key: 'olyq.sync.webdav.v1',
    owner: 'sync',
    exportPolicy: 'included',
    syncPolicy: 'device-local',
    sensitive: true,
    conflictPolicy: 'replace',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeBackupProfileConfig,
  }),
  createDescriptor({
    key: 'olyq.theme.v1',
    owner: 'theme',
    exportPolicy: 'included',
    syncPolicy: 'included',
    sensitive: false,
    bootstrapMirror: 'allowed',
    conflictPolicy: 'key-lww',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeTheme,
  }),
  createDescriptor({
    key: WEB_SEARCH_SETTINGS_STORAGE_KEY,
    owner: 'web-search',
    exportPolicy: 'included',
    syncPolicy: 'encrypted-secret',
    sensitive: true,
    conflictPolicy: 'key-lww',
    cleanupPolicy: 'authoritative-replace',
    normalize: normalizeWebSearchSettings,
  }),
] as const satisfies readonly DataContractDescriptor[];

/** shared-storage 里允许进入普通业务备份域的 key。 */
export const SHARED_STORAGE_BACKUP_KEYS = SHARED_STORAGE_CONTRACTS
  .filter((contract) => contract.exportPolicy === 'included')
  .map((contract) => contract.key);

/**
 * 允许复制到 localStorage bootstrap mirror 的 shared-storage key。
 *
 * @remarks
 * 这里是 bootstrap mirror 的唯一 registry 真源。只有首帧确实需要同步种子的
 * 非敏感小型配置才能进入该集合；可重建 cache、device signal、secret 和未登记 key
 * 都必须保持 blocked。
 */
export const BOOTSTRAP_MIRROR_SHARED_STORAGE_KEYS = SHARED_STORAGE_CONTRACTS
  .filter((contract) => contract.bootstrapMirror === 'allowed')
  .map((contract) => contract.key);

/** structured cloud sync 会明文同步的共享配置 key。 */
export const CLOUD_SYNC_SHARED_CONFIG_KEYS = SHARED_STORAGE_CONTRACTS
  .filter((contract) => contract.syncPolicy === 'included')
  .map((contract) => contract.key);

/**
 * structured cloud sync 的明文配置 key。
 *
 * @remarks
 * `olyq.providers.v1` 的非敏感部分会进入明文配置包；它的凭据字段单独进入
 * `secretVault`。因此这里不同于单纯 `syncPolicy === included` 的 key 集合。
 */
export const CLOUD_SYNC_PLAIN_CONFIG_KEYS = Array.from(new Set([
  ...CLOUD_SYNC_SHARED_CONFIG_KEYS,
  PROVIDERS_STORAGE_KEY,
  WEB_SEARCH_SETTINGS_STORAGE_KEY,
  MCP_SERVERS_STORAGE_KEY,
]));

/** structured cloud sync 会进入加密 secret 包的共享配置 key。 */
export const CLOUD_SYNC_SECRET_CONFIG_KEYS = SHARED_STORAGE_CONTRACTS
  .filter((contract) => contract.syncPolicy === 'encrypted-secret')
  .map((contract) => contract.key);

/** 以 key 为索引的 shared-storage 契约表。 */
export const SHARED_STORAGE_CONTRACT_BY_KEY = new Map(
  SHARED_STORAGE_CONTRACTS.map((contract) => [contract.key, contract]),
);

/**
 * 校验并规整 shared-storage 快照。
 *
 * @param value - 外部导入、备份或同步得到的 raw snapshot。
 * @param keys - 当前域允许的 key 集合。
 * @returns 只包含允许 key 且符合当前 `v1` schema 的快照。
 */
export function normalizeSharedStorageSnapshot(
  value: unknown,
  keys: readonly string[] = SHARED_STORAGE_BACKUP_KEYS,
): Record<string, unknown> {
  if (!isPlainRecord(value)) throw new Error('invalid shared storage snapshot');
  const allowed = new Set(keys);
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!allowed.has(key)) throw new Error(`unexpected shared storage key: ${key}`);
    const contract = SHARED_STORAGE_CONTRACT_BY_KEY.get(key);
    if (!contract) throw new Error(`missing shared storage contract: ${key}`);
    out[key] = contract.normalize(entry);
  }
  return out;
}

export {
  buildCloudSyncPlainConfigSnapshot,
  buildCloudSyncSecretConfigSnapshot,
} from './cloud-sync';
export { INDEXEDDB_DATA_CONTRACTS } from './indexeddb';
