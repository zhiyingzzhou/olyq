/**
 * 说明：`provider-runtime-config` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-runtime-config` 相关的当前文件实现与模块边界；
 * - 对外暴露 `applyResolvedModelMetaToProviderConfig` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ProviderConfig } from './types'
import type { ResolvedModelMeta } from './model-registry/types'

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
