/**
 * 说明：`storage-keys` AI 能力模块。
 *
 * 职责：
 * - 承载 `storage-keys` 相关的当前文件实现与模块边界；
 * - 对外暴露 `PROVIDERS_STORAGE_KEY`、`MODEL_REGISTRY_STORAGE_KEY`、`MODEL_REGISTRY_SYNC_META_STORAGE_KEY` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：AI 相关持久化 key（chrome.storage.local）
 *
 * 说明：
 * - 统一管理 key，避免 UI / Service Worker 各写一份导致不一致
 *
 * 规则（强约束）：
 * - 本文件中的 key 统一使用 `v1`
 * - 不再区分多套内部版本 key，统一以当前结构为准
 */

/** Provider 配置（模型管理面板） */
export const PROVIDERS_STORAGE_KEY = 'olyq.providers.v1';

/** 模型注册表快照。 */
export const MODEL_REGISTRY_STORAGE_KEY = 'olyq.modelRegistry';

/** 模型注册表同步元信息。 */
export const MODEL_REGISTRY_SYNC_META_STORAGE_KEY = 'olyq.modelRegistrySyncMeta';

/** 模型注册表并发锁。 */
export const MODEL_REGISTRY_LOCK_STORAGE_KEY = 'olyq.modelRegistryLocks';

/** Provider API Key 轮询游标缓存，只保存 providerId -\> lastIndex。 */
export const PROVIDER_API_KEY_ROTATION_STATE_STORAGE_KEY = 'olyq.provider-api-key-rotation.v1';

/**
 * 置顶模型列表（用于"选择模型"弹窗的置顶分组）。
 * - 存储为 string[]：每项为完整模型 ID（"providerId/modelId"）
 * - 仅影响 UI 展示顺序，不改变任何模型配置/能力
 */
export const PINNED_MODELS_STORAGE_KEY = 'olyq.models.pinned.v1';

/** \@lobehub/icons 可用图标列表缓存 */
export const LOBE_ICONS_CACHE_KEY = 'olyq.lobe-icons.v1';
