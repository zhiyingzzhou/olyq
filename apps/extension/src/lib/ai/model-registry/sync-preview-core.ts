/**
 * 说明：`sync-preview-core` AI 能力模块。
 *
 * 职责：
 * - 承载 `sync-preview-core` 相关的当前文件实现与模块边界；
 * - 对外暴露 `buildModelRegistryPreviewWithProviders` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型注册表 preview 重建核心实现。
 *
 * 为什么新增这个文件：
 * - `sync-preview.ts` 的职责已经被固定为“页面环境按需懒加载入口”；
 * - 但 Service Worker 没有 `document`，一旦走到 Vite 为动态导入注入的 preload helper，
 *   就会因为 helper 内部访问 DOM 而直接抛出 `document is not defined`；
 * - 因此这里把“纯本地重建 registry”的核心逻辑抽到一个完全不依赖动态导入的模块里，
 *   让页面环境和 Service Worker 都复用同一份实现。
 *
 * 职责边界：
 * - 只负责“基于当前 storage + providers 本地重建 registry”；
 * - 不负责 TTL / freshness / backoff 判断；
 * - 不负责任何按需拆包策略；
 * - 后续如果还要新增 Worker / Offscreen 等无 DOM 运行环境，都应该直接复用本文件。
 */

import { loadProvidersView } from '../provider-storage'
import { buildModelRegistry, rebuildModelRegistryFromCanonicalModels } from './merge'
import { createEmptyModelRegistry, hasModelRegistryEntries } from './state'
import { loadModelRegistryFast } from './storage-lite'
import type { ModelRegistryState } from './types'

/**
 * 基于当前 providers 本地重建 registry preview。
 *
 * 规则：
 * - 若 storage 中已有 seed 快照，则优先回放 seed 快照，确保最新 merge / resolver 规则立刻生效；
 * - 若没有 seed 快照但已有 canonical models，则退回 canonical-based rebuild；
 * - 整个过程不访问网络，因此适合 UI 即时预览、保存前重建，以及 Service Worker 的 warmup 回放。
 */
export async function buildModelRegistryPreviewWithProviders(
  providers?: ReadonlyArray<Awaited<ReturnType<typeof loadProvidersView>>[number]>,
): Promise<ModelRegistryState> {
  const current = await loadModelRegistryFast()
  const nextProviders = providers ? [...providers] : [...(await loadProvidersView())]

  const base = hasModelRegistryEntries(current) ? current : createEmptyModelRegistry()
  const seedEvidences = base.syncMeta.seedEvidences
  const rebuilt = Array.isArray(seedEvidences)
    ? buildModelRegistry({
        providers: nextProviders,
        seedEvidences,
        openrouterLastSyncAt: base.openrouterLastSyncAt,
        openrouterLastSyncStatus: base.syncMeta.openrouterLastSyncStatus,
        openrouterLastError: base.syncMeta.openrouterLastError,
      })
    : rebuildModelRegistryFromCanonicalModels({
        canonicalModels: base.canonicalModels,
        providers: nextProviders,
        openrouterLastSyncAt: base.openrouterLastSyncAt,
        syncMeta: base.syncMeta,
      })
  const nextRegistry: ModelRegistryState = {
    ...rebuilt,
    syncMeta: {
      ...rebuilt.syncMeta,
      openrouterLastAttemptAt: base.syncMeta.openrouterLastAttemptAt,
      openrouterBackoffUntil: base.syncMeta.openrouterBackoffUntil,
      seedEvidences: seedEvidences ?? rebuilt.syncMeta.seedEvidences,
    },
  }
  return nextRegistry
}
