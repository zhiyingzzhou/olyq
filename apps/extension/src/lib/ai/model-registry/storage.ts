/**
 * 说明：`storage` AI 能力模块。
 *
 * 职责：
 * - 承载 `storage` 相关的当前文件实现与模块边界；
 * - 对外暴露 `loadModelRegistry`、`normalizeModelRegistryForStorage`、`saveModelRegistry` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型注册表存储层。
 *
 * 说明：
 * - 使用统一的 storage adapter 持久化 registry；
 * - 统一负责 schema 校验与空状态兜底；
 * - 对外暴露简单、稳定的读写接口。
 */

import { MODEL_REGISTRY_STORAGE_KEY } from '../storage-keys'
import { ModelRegistryStateSchema } from './schemas'
import { createEmptyModelRegistry, dispatchModelRegistryUpdated } from './state'
import type { ModelRegistryState } from './types'
import { validateRegistryState } from './validation'
import { getStorageAdapter } from '@/lib/storage/storage-adapter'
import { logger } from '@/lib/logger'

/**
 * 从存储中读取模型注册表。
 */
export async function loadModelRegistry(): Promise<ModelRegistryState> {
  const raw = await getStorageAdapter().get([MODEL_REGISTRY_STORAGE_KEY])
  const value = raw[MODEL_REGISTRY_STORAGE_KEY]
  if (!value) return createEmptyModelRegistry()
  try {
    return ModelRegistryStateSchema.parse(value)
  } catch (error) {
    /**
     * 本轮采用彻底切换：
     * - 任何不符合当前 schema、或缺失 `baseModelKey` 的旧快照都直接视为无效；
     * - 不做迁移 shim，不尝试边读边补字段；
     * - 后续统一由 `ensureModelRegistryFresh()` / preview rebuild 重建当前快照。
     */
    logger.provider.error('model registry parse failed, using empty registry', error)
    return createEmptyModelRegistry()
  }
}

/**
 * 将任意 registry 规范化为可安全落盘的状态。
 */
export function normalizeModelRegistryForStorage(registry: ModelRegistryState): ModelRegistryState {
  const next = ModelRegistryStateSchema.parse(registry)
  const blockingIssues = validateRegistryState(next).filter((issue) => issue.level === 'error')
  if (blockingIssues.length > 0) {
    throw new Error(
      `model registry semantic validation failed: ${blockingIssues.map((issue) => `${issue.code}${issue.path ? `@${issue.path}` : ''}`).join(', ')}`,
    )
  }
  return next
}

/**
 * 保存模型注册表。
 */
export async function saveModelRegistry(registry: ModelRegistryState): Promise<void> {
  const next = normalizeModelRegistryForStorage(registry)
  await getStorageAdapter().set({ [MODEL_REGISTRY_STORAGE_KEY]: next })
  dispatchModelRegistryUpdated()
}

/**
 * 清空模型注册表。
 */
export async function clearModelRegistry(): Promise<void> {
  await getStorageAdapter().remove([MODEL_REGISTRY_STORAGE_KEY])
  dispatchModelRegistryUpdated()
}
