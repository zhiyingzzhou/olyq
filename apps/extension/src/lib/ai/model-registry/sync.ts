/**
 * 说明：`sync` AI 能力模块。
 *
 * 职责：
 * - 承载 `sync` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelRegistryRefreshReason`、`syncModelRegistryFromSeed`、`ensureModelRegistryFresh` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型注册表同步与重建入口。
 *
 * 说明：
 * - `ensureModelRegistryFresh` 负责按 TTL 决定是否拉取 OpenRouter；
 * - Provider 配置变化后的 preview 重建已拆到 `sync-preview.ts`；
 * - 同步失败时保留已有 registry，避免阻断 UI 与运行时。
 */

import { loadProvidersView } from '../provider-storage'
import { logger } from '@/lib/logger'
import { MODEL_REGISTRY_CONNECTORS } from './connectors'
import { buildModelRegistry } from './merge'
import { hasModelRegistryEntries } from './state'
import { saveModelRegistry } from './storage'
import { buildModelRegistryPreviewWithProviders as buildModelRegistryPreviewWithProvidersInRuntime } from './sync-preview-core'
import { loadModelRegistryFast } from './storage-lite'
import type { MetadataEvidence, ModelRegistryState } from './types'

const OPENROUTER_SYNC_TTL_MS = 24 * 60 * 60 * 1000
const OPENROUTER_SYNC_BACKOFF_MS = 30 * 60 * 1000
let syncingPromise: Promise<ModelRegistryState> | null = null
let backgroundRefreshPromise: Promise<ModelRegistryState> | null = null

/** 导出类型：`ModelRegistryRefreshReason`。 */
export type ModelRegistryRefreshReason =
  | 'onInstalled'
  | 'swIdle'
  | 'modelOptions'
  | 'modelManager'

/** 判断当前 registry 是否已经持有过一份有效的 seed 目录快照。 */
function hasSeedCatalogSnapshot(registry: ModelRegistryState): boolean {
  if (Number.isFinite(Date.parse(registry.openrouterLastSyncAt || ''))) return true
  return Array.isArray(registry.syncMeta.seedEvidences) && registry.syncMeta.seedEvidences.length > 0
}

/** 判断当前 registry 是否仍在 OpenRouter 同步 TTL 内。 */
function isRegistryFresh(registry: ModelRegistryState): boolean {
  const at = Date.parse(registry.openrouterLastSyncAt || '')
  if (!Number.isFinite(at)) return false
  return Date.now() - at < OPENROUTER_SYNC_TTL_MS
}

/** 判断同步失败后的退避窗口是否还未结束。 */
function isSyncInBackoff(registry: ModelRegistryState): boolean {
  const until = Date.parse(registry.syncMeta.openrouterBackoffUntil || '')
  if (!Number.isFinite(until)) return false
  return Date.now() < until
}

/**
 * 通过 `openrouter-seed` 连接器抓取最新 seed evidences。
 *
 * 说明：
 * - 这里只负责目录抓取和标准化，不参与 provider 本地 preview 的拼装；
 * - 若连接器不可用则返回空数组，让上层走已有 registry 或错误回退。
 */
async function fetchSeedEvidences(signal?: AbortSignal): Promise<MetadataEvidence[]> {
  const connector = MODEL_REGISTRY_CONNECTORS.find((item) => item.id === 'openrouter-seed')
  if (!connector?.listCatalog) return []
  const entries = await connector.listCatalog({ signal })
  return entries.flatMap((entry) => connector.normalizeEntry(entry, { signal }))
}

/** 基于本地快照重建 preview registry。 */
async function buildLocalPreviewRegistry(): Promise<ModelRegistryState> {
  return await buildModelRegistryPreviewWithProvidersInRuntime()
}

/**
 * 使用 OpenRouter 主目录重建 registry。
 */
export async function syncModelRegistryFromSeed(options?: {
  force?: boolean
  signal?: AbortSignal
}): Promise<ModelRegistryState> {
  if (syncingPromise && !options?.force) return syncingPromise

  syncingPromise = (async () => {
    const existing = await loadModelRegistryFast()
    const providers = await loadProvidersView()
    const attemptedAt = new Date().toISOString()

    try {
      const seedEvidences = await fetchSeedEvidences(options?.signal)
      const now = new Date().toISOString()
      const registry = buildModelRegistry({
        providers,
        seedEvidences,
        openrouterLastSyncAt: now,
        openrouterLastSyncStatus: 'success',
      })
      const nextRegistry: ModelRegistryState = {
        ...registry,
        syncMeta: {
          ...registry.syncMeta,
          openrouterLastAttemptAt: attemptedAt,
          openrouterBackoffUntil: undefined,
        },
      }
      await saveModelRegistry(nextRegistry)
      return nextRegistry
    } catch (error) {
      logger.provider.error('model registry seed sync failed', error)
      if (hasModelRegistryEntries(existing)) {
        const failedRegistry: ModelRegistryState = {
          ...existing,
          syncMeta: {
            ...existing.syncMeta,
            openrouterLastAttemptAt: attemptedAt,
            openrouterLastSyncStatus: 'error',
            openrouterLastError: error instanceof Error ? error.message : String(error),
            openrouterBackoffUntil: new Date(Date.now() + OPENROUTER_SYNC_BACKOFF_MS).toISOString(),
          },
        }
        await saveModelRegistry(failedRegistry)
        return failedRegistry
      }
      const fallback = buildModelRegistry({
        providers,
        seedEvidences: [],
        openrouterLastSyncStatus: 'error',
        openrouterLastError: error instanceof Error ? error.message : String(error),
      })
      const nextFallback: ModelRegistryState = {
        ...fallback,
        syncMeta: {
          ...fallback.syncMeta,
          openrouterLastAttemptAt: attemptedAt,
          openrouterBackoffUntil: new Date(Date.now() + OPENROUTER_SYNC_BACKOFF_MS).toISOString(),
        },
      }
      await saveModelRegistry(nextFallback)
      return nextFallback
    } finally {
      syncingPromise = null
    }
  })()

  return syncingPromise
}

/**
 * 内部函数：`logRefreshSuccess`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function logRefreshSuccess(reason: ModelRegistryRefreshReason, startedAt: number, force: boolean) {
  logger.provider.info('model registry refresh complete', { reason, force, durationMs: Date.now() - startedAt })
}

/**
 * 内部函数：`logRefreshFailure`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function logRefreshFailure(reason: ModelRegistryRefreshReason, startedAt: number, error: unknown, force: boolean) {
  logger.provider.error('model registry refresh failed', error, { reason, force, durationMs: Date.now() - startedAt })
}

/**
 * 确保模型注册表在 TTL 内有效。
 */
export async function ensureModelRegistryFresh(options?: {
  force?: boolean
  signal?: AbortSignal
}): Promise<ModelRegistryState> {
  const current = await loadModelRegistryFast()
  const hasSeedSnapshot = hasSeedCatalogSnapshot(current)
  if (
    !options?.force
    && current.schema === 2
    && hasModelRegistryEntries(current)
    && hasSeedSnapshot
    && isRegistryFresh(current)
  ) {
    return await buildLocalPreviewRegistry()
  }
  if (!options?.force && hasModelRegistryEntries(current) && hasSeedSnapshot && isSyncInBackoff(current)) {
    return await buildLocalPreviewRegistry()
  }
  return await syncModelRegistryFromSeed(options)
}

/**
 * 以单例后台任务的方式刷新模型注册表，并记录耗时。
 *
 * 说明：
 * - 用于不阻塞首屏/冷启动的后台刷新路径；
 * - 相同时间窗口内只保留一份在途任务，避免多个入口重复触发同一轮目录刷新。
 */
export function refreshModelRegistryInBackground(
  reason: ModelRegistryRefreshReason,
  options?: {
    force?: boolean
    signal?: AbortSignal
  },
): Promise<ModelRegistryState> {
  if (backgroundRefreshPromise) return backgroundRefreshPromise

  const startedAt = Date.now()
  const force = Boolean(options?.force)
  backgroundRefreshPromise = ensureModelRegistryFresh(options)
    .then((result) => {
      logRefreshSuccess(reason, startedAt, force)
      return result
    })
    .catch((error) => {
      logRefreshFailure(reason, startedAt, error, force)
      throw error
    })
    .finally(() => {
      backgroundRefreshPromise = null
    })

  return backgroundRefreshPromise
}
