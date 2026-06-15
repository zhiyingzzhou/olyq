/**
 * 说明：`provider-read-fast` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-read-fast` 相关的当前文件实现与模块边界；
 * - 对外暴露 `loadProvidersFast`、`getProviderFast` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ProviderConfig } from './types'
import { PROVIDERS_STORAGE_KEY } from './storage-keys'
import { loadProvidersView } from './provider-storage'
import { getStorageAdapter } from '@/lib/storage/storage-adapter'

let cachedProviders: ProviderConfig[] | null = null
let loadingPromise: Promise<ProviderConfig[]> | null = null

getStorageAdapter().onChange((changes) => {
  if (!changes[PROVIDERS_STORAGE_KEY]) return
  cachedProviders = null
})

/** 轻量读取 providers 视图，仅用于运行时热路径与网络目标判断。 */
export async function loadProvidersFast(): Promise<ProviderConfig[]> {
  if (Array.isArray(cachedProviders)) return cachedProviders
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    try {
      const next = [...await loadProvidersView()]
      cachedProviders = next
      return next
    } finally {
      loadingPromise = null
    }
  })()

  return await loadingPromise
}

/** 从轻量 provider 视图中查找单个 provider。 */
export async function getProviderFast(providerId: string): Promise<ProviderConfig | null> {
  const normalizedProviderId = String(providerId || '').trim()
  if (!normalizedProviderId) return null

  const providers = await loadProvidersFast()
  return providers.find((provider) => provider.id === normalizedProviderId) ?? null
}
