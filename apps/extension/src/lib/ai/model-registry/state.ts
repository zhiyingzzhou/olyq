/**
 * 说明：`state` AI 能力模块。
 *
 * 职责：
 * - 承载 `state` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MODEL_REGISTRY_UPDATED_EVENT`、`createEmptyModelRegistry`、`hasModelRegistryEntries` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ModelRegistryState } from './types'

/** 模型注册表更新事件名。 */
export const MODEL_REGISTRY_UPDATED_EVENT = 'olyq:model-registry-updated'

/** 创建空注册表。 */
export function createEmptyModelRegistry(): ModelRegistryState {
  return {
    schema: 2,
    generatedAt: new Date(0).toISOString(),
    canonicalModels: {},
    aliasIndex: {},
    providerModelMap: {},
    providerScopedModels: {},
    syncMeta: {},
  }
}

/**
 * 判断注册表是否至少包含一条可消费记录。
 *
 * 说明：
 * - 不能只看 `canonicalModels`；
 * - provider/local scoped 模型可能只存在于 `providerScopedModels` / `providerModelMap` 中；
 * - 该判断用于决定“当前 registry 是否可作为真源继续使用”。
 */
export function hasModelRegistryEntries(registry: ModelRegistryState): boolean {
  return (
    Object.keys(registry.canonicalModels).length > 0
    || Object.keys(registry.aliasIndex).length > 0
    || Object.keys(registry.providerModelMap).length > 0
    || Object.keys(registry.providerScopedModels).length > 0
  )
}

/** 广播模型注册表已更新事件。 */
export function dispatchModelRegistryUpdated(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(MODEL_REGISTRY_UPDATED_EVENT))
}
