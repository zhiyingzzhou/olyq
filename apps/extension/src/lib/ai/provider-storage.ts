/**
 * 说明：`provider-storage` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-storage` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ProviderStorageSnapshot`、`loadProviderStorageSnapshot`、`loadProvidersView` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ProviderConfig } from './types'
import { DEFAULT_PROVIDERS } from './config/provider-defaults'
import { PROVIDERS_STORAGE_KEY } from './storage-keys'
import { parseProviderConfigs } from './provider-schemas'
import { readStoredJson } from '@/lib/storage/json-storage'

/** Provider 存储快照。 */
export interface ProviderStorageSnapshot {
  /** storage 中原始解析出的 provider 列表。 */
  readonly storedProviders: ReadonlyArray<ProviderConfig>
  /** 合并默认 provider 后的最终视图；已存在 provider 的 models 始终尊重 storage 真值。 */
  readonly mergedProviders: ReadonlyArray<ProviderConfig>
  /** 当前是否为首次运行。 */
  readonly isFirstRun: boolean
  /** 是否补进了新增默认 provider。 */
  readonly hasNewDefaults: boolean
  /** 当前启动是否执行了 provider 结构收口；彻底切换后固定为 false。 */
  readonly hasCanonicalizedProviders: boolean
}

/**
 * 对 storage 中的 provider 列表做当前版本收口。
 *
 * 说明：
 * - 当前版本采用“彻底切换”，不在读取层继续改写 `openai-response` 或 `openai-responses`；
 * - transportProtocol 由模型 registry/runtime 解析，读取 provider storage 时只做 schema 解析。
 */
function canonicalizeStoredProviders(
  providers: ReadonlyArray<ProviderConfig>,
): { providers: ReadonlyArray<ProviderConfig>; changed: boolean } {
  return {
    providers,
    changed: false,
  }
}

/** 从 storage 读取并合并默认 provider，但不执行写回与 registry 重建。 */
export async function loadProviderStorageSnapshot(): Promise<ProviderStorageSnapshot> {
  const parsedStoredProviders = await readStoredJson<ReadonlyArray<ProviderConfig>>(
    PROVIDERS_STORAGE_KEY,
    [],
    parseProviderConfigs,
  )
  const { providers: storedProviders, changed: hasCanonicalizedProviders } =
    canonicalizeStoredProviders(parsedStoredProviders)

  if (storedProviders.length === 0) {
    return {
      storedProviders: [],
      mergedProviders: structuredClone(DEFAULT_PROVIDERS),
      isFirstRun: true,
      hasNewDefaults: false,
      hasCanonicalizedProviders: false,
    }
  }

  const storedIds = new Set(storedProviders.map((provider) => provider.id))
  const newDefaults = DEFAULT_PROVIDERS
    .filter((provider) => !storedIds.has(provider.id))
    .map((provider) => structuredClone(provider))

  return {
    storedProviders,
    mergedProviders: newDefaults.length > 0 ? [...storedProviders, ...newDefaults] : storedProviders,
    isFirstRun: false,
    hasNewDefaults: newDefaults.length > 0,
    hasCanonicalizedProviders,
  }
}

/** 读取当前 provider 最终视图。 */
export async function loadProvidersView(): Promise<ReadonlyArray<ProviderConfig>> {
  return (await loadProviderStorageSnapshot()).mergedProviders
}

/** 从最终 provider 视图中按 ID 读取单个 provider。 */
export async function getProviderView(providerId: string): Promise<ProviderConfig | null> {
  const id = String(providerId || '').trim()
  if (!id) return null

  const providers = await loadProvidersView()
  for (const provider of providers) {
    if (provider?.id === id) return provider
  }
  return null
}
