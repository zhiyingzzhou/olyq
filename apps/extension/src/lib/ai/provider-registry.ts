/**
 * 说明：`provider-registry` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-registry` 相关的当前文件实现与模块边界；
 * - 对外暴露 `loadProviders`、`registerProviderRegistrySaveSideEffect`、`saveProviders` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：ProviderRegistry——AI Provider 配置的中心注册表。
 *
 * 使用 chrome.storage.local（固定 key：`olyq.providers.v1`）持久化 Provider 配置（见 `storage-keys.ts`）。
 *
 * 职责：
 * - 从/向 chrome.storage.local 读取与保存 Provider 配置
 * - 将用户配置与默认配置合并（升级时自动补齐新增 Provider）
 * - 将 "providerId/modelId" 解析为 AI SDK LanguageModel 实例
 * - 为 UI（ModelManagerPanel）提供更干净的调用接口
 */

import type { ProviderConfig } from './types'
import { MODEL_REGISTRY_STORAGE_KEY, PROVIDERS_STORAGE_KEY } from './storage-keys'
import { buildModelRegistryPreviewWithProviders } from './model-registry/sync-preview-core'
import { normalizeModelRegistryForStorage } from './model-registry/storage'
import { dispatchModelRegistryUpdated } from './model-registry/state'
import { loadProviderStorageSnapshot } from './provider-storage'
import { parseProviderConfigs } from './provider-schemas'
import { getStorageAdapter } from '@/lib/storage/storage-adapter'
import { logger } from '@/lib/logger'
import type { ModelRegistryState, ResolvedModelMeta } from './model-registry/types'

/**
 * 内存缓存：避免在同一页面/同一 SW 生命周期内反复读 storage。
 *
 * 副作用：
 * - 若另一个页面修改了 storage，需要显式调用 `invalidateCache()` 让本模块下次强制重载。
 */
let cachedProviders: ProviderConfig[] | null = null
// 优化 P1-3：并发锁，防止多个调用同时进入 loadProviders 导致竞态
let loadingPromise: Promise<ProviderConfig[]> | null = null
let saveSideEffect:
  | ((input: { providers: ProviderConfig[]; registry: ModelRegistryState }) => void | Promise<void>)
  | null = null

// 约束：Provider 配置可能由 UI 面板在其他页面写入；这里监听 storage 变化以自动失效缓存，避免"明明保存了 key 但仍提示未配置"。
getStorageAdapter().onChange((changes) => {
  const change = changes[PROVIDERS_STORAGE_KEY]
  if (!change) return
  // 用 newValue 直接刷新缓存；避免"自己 set 导致 onChanged 把缓存清空"这种竞态。
  const parsed = parseProviderConfigs(change.newValue)
  cachedProviders = parsed.length > 0 ? parsed : null
})

/**
 * 加载全部 Provider 配置，并与默认配置合并：
 * - 用户已存的配置优先保留
 * - 新增的默认 Provider 会在升级后自动补齐
 */
export async function loadProviders(): Promise<ProviderConfig[]> {
  // 兜底：避免 HMR/并发写入导致缓存被污染为非数组
  if (Array.isArray(cachedProviders)) return cachedProviders
  if (cachedProviders !== null) cachedProviders = null

  // 优化 P1-3：单例锁，防止并发调用时第二个调用用过期数据覆盖第一次写入结果
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    try {
      return await _loadProvidersInternal()
    } finally {
      loadingPromise = null
    }
  })()
  return loadingPromise
}

/**
 * 注册浏览器页面侧的保存后副作用。
 *
 * 说明：
 * - `provider-registry` 同时被 UI 与 Service Worker 复用，不能在这里继续保留运行时 `import()`；
 * - 页面环境需要的 `reconcileModelReferences` 改由外部显式注册，避免把 DOM/store 相关模块带进 SW；
 * - 返回值为注销函数，便于 React 生命周期内成对绑定。
 */
export function registerProviderRegistrySaveSideEffect(
  effect: ((input: { providers: ProviderConfig[]; registry: ModelRegistryState }) => void | Promise<void>) | null,
): () => void {
  saveSideEffect = effect
  return () => {
    if (saveSideEffect === effect) saveSideEffect = null
  }
}

/**
 * 真实执行 provider 列表加载、合并与首次初始化。
 *
 * 说明：
 * - 首次运行会把默认 provider 集合完整写入存储，建立后续维护基线；
 * - 非首次运行会保留用户已有配置，并补齐新版本新增的默认 provider；
 * - 若读取阶段命中了当前 canonical 规范化，也会把收口后的结果直接写回 storage；
 * - 已存在 provider 的 `models` 只认 storage 中的真实值，不再在读取阶段被默认 seed 静默重置。
 */
async function _loadProvidersInternal(): Promise<ProviderConfig[]> {
  const snapshot = await loadProviderStorageSnapshot()

  if (snapshot.isFirstRun) {
    // 首次运行：写入默认配置
    // 说明：使用 structuredClone 防止后续对缓存的修改"污染"默认配置常量。
    const nextProviders = snapshot.mergedProviders.map((provider) => structuredClone(provider))
    await saveProviders(nextProviders)
    return nextProviders
  }

  // 合并：保留用户已存配置，并补齐新增的默认 Provider。
  // 注意：默认 seed 只负责 bootstrap 与新增 provider 注入，不再覆盖已保存 provider 的模型目录。
  const nextProviders = [...snapshot.mergedProviders]

  if (snapshot.hasNewDefaults || snapshot.hasCanonicalizedProviders) await saveProviders(nextProviders)

  cachedProviders = nextProviders
  return nextProviders
}

/**
 * 保存 Provider 配置到存储，并更新内存缓存。
 */
export async function saveProviders(providers: ProviderConfig[]): Promise<void> {
  // 约束：先在内存中预构建 registry；只有成功后才把 providers + registry 一起落盘，
  // 避免“provider 已写入，但 registry/reconcile 失败”的半提交状态。
  const prev = cachedProviders
  try {
    const nextRegistry = normalizeModelRegistryForStorage(await buildModelRegistryPreviewWithProviders(providers))
    await getStorageAdapter().set({
      [PROVIDERS_STORAGE_KEY]: providers,
      [MODEL_REGISTRY_STORAGE_KEY]: nextRegistry,
    })
    cachedProviders = providers
    dispatchModelRegistryUpdated()
    if (saveSideEffect) {
      try {
        await saveSideEffect({ providers, registry: nextRegistry })
      } catch (error) {
        logger.provider.error('provider registry save side effect failed after providers persisted', error)
      }
    }
  } catch (e) {
    cachedProviders = prev
    throw e
  }
}

/**
 * 按 ID 获取单个 Provider 配置。
 */
export async function getProvider(providerId: string): Promise<ProviderConfig | null> {
  const all = await loadProviders()
  if (!Array.isArray(all)) return null

  const id = String(providerId || '').trim()
  if (!id) return null

  for (const p of all) {
    if (p && typeof p === 'object' && p.id === id) return p
  }
  return null
}

/**
 * 更新单个 Provider 配置；若不存在则创建。
 */
export async function updateProvider(updated: ProviderConfig): Promise<void> {
  // 优化 P0-3：浅拷贝，避免原地修改 cachedProviders 导致 saveProviders 失败时缓存已被污染
  const all = [...(await loadProviders())]
  const idx = all.findIndex((p) => p.id === updated.id)
  if (idx >= 0) {
    all[idx] = updated
  } else {
    all.push(updated)
  }
  await saveProviders(all)
}

/**
 * 按 ID 删除 Provider 配置。
 */
export async function removeProvider(providerId: string): Promise<void> {
  const all = await loadProviders()
  await saveProviders(all.filter((p) => p.id !== providerId))
}

/**
 * 失效内存缓存，使下次访问时强制从存储重载。
 * 用于外部上下文（例如另一个页面）写入 storage 后的同步场景。
 */
export function invalidateCache(): void {
  cachedProviders = null
}

/**
 * 拆分 "providerId/modelId"：
 * - 支持 modelId 内包含多级路径（例如 "siliconflow/deepseek-ai/DeepSeek-V3"）
 */
export function splitModel(model: string): { providerId: string; modelId: string } {
  const [providerId, ...rest] = model.split('/')
  return { providerId, modelId: rest.join('/') }
}

/**
 * 将 registry 解析出的模型语义写入运行时 ProviderConfig 副本。
 *
 * 说明：
 * - 该函数只返回“运行时副本”，不会修改持久化配置；
 * - 用于确保真正创建模型实例时，以 registry 解析出的 transportProtocol 为准。
 */
export function applyResolvedModelMetaToProviderConfig(
  config: ProviderConfig,
  modelId: string,
  resolvedModelMeta?: ResolvedModelMeta,
): ProviderConfig {
  if (!resolvedModelMeta) return config

  const nextModels = [...(config.models || [])]
  const modelIndex = nextModels.findIndex((item) => String(item?.id || '').trim() === modelId)
  const currentModel = modelIndex >= 0 ? nextModels[modelIndex] : undefined
  const nextTransportProtocol = resolvedModelMeta.transportProtocol

  const nextModel = {
    ...(currentModel ?? { id: modelId, name: resolvedModelMeta.displayName || modelId }),
    ...(nextTransportProtocol ? { transportProtocol: nextTransportProtocol } : {}),
  }

  if (modelIndex >= 0) {
    nextModels[modelIndex] = nextModel
  } else {
    nextModels.push(nextModel)
  }

  return { ...config, models: nextModels }
}
