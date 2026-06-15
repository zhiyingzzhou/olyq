/**
 * 说明：`websearch` AI 能力模块。
 *
 * 职责：
 * - 承载 `websearch` 相关的当前文件实现与模块边界；
 * - 对外暴露 `isWebSearchModel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Web Search 规则。
 *
 * 维护约束：
 * - 模型类型系统不再单独维护搜索模型名正则；
 * - 内置联网搜索只认 `native-web-search-capability` 三态矩阵；
 * - 未核验 transport / provider 组合不能靠模型名猜成可联网。
 */

import { supportsNativeWebSearch } from '../native-web-search-capability'
import type { ModelFeature } from '../types'
import type { ModelTypeDescriptor } from './types'
import { getNormalizedModelIdentity } from './utils'
import { isEmbeddingModel, isRerankModel } from './embedding'
import { isTextToImageModel } from './vision'

/** 是否支持原生联网搜索。 */
export function isWebSearchModel(descriptor: ModelTypeDescriptor): boolean {
  if (isEmbeddingModel(descriptor) || isRerankModel(descriptor) || isTextToImageModel(descriptor)) {
    return false
  }

  const modelId = getNormalizedModelIdentity(descriptor)
  return supportsNativeWebSearch({
    providerId: descriptor.providerId,
    providerType: descriptor.providerType,
    transportProtocol: descriptor.transportProtocol,
    modelId,
    featureKeys: descriptor.features as ReadonlyArray<ModelFeature> | undefined,
  })
}
