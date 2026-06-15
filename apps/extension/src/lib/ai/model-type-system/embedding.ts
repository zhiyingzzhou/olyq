/**
 * 说明：`embedding` AI 能力模块。
 *
 * 职责：
 * - 承载 `embedding` 相关的当前文件实现与模块边界；
 * - 对外暴露 `EMBEDDING_REGEX`、`RERANK_REGEX`、`isRerankModel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Embedding / Rerank 规则。
 *
 * 规则来源：
 * - 官方模型文档
 * - 本仓库内部模型类型约定
 *
 * 维护约束：
 * - 这里只做“模型家族识别”，不直接决定最终 transport；
 * - Provider 目录若已显式声明 kind，应优先使用目录信号，本模块只作为 fallback。
 */

import type { ModelTypeDescriptor } from './types'
import { getNormalizedModelIdentity, getNormalizedModelName } from './utils'

/**
 * embedding 正则版本。
 *
 * 命中范围：
 * - OpenAI text-embedding
 * - BGE / E5 / GTE / Jina / Voyage 等主流 embedding 家族
 * - `retrieval` 也纳入当前内部规则的 embedding 粗识别
 */
export const EMBEDDING_REGEX =
  /(?:^text-|embed|bge-|e5-|llm2vec|retrieval|uae-|gte-|jina-clip|jina-embeddings|voyage-)/i

/**
 * rerank 正则版本。
 *
 * 命中范围：
 * - rerank / re-rank / re-ranking
 * - retrieval / retriever
 *
 * 说明：
 * - 当前内部逻辑中 rerank 要先于 embedding 判定，
 *   否则像 `retrieval` 这样的名字会被 embedding 误吞。
 */
export const RERANK_REGEX = /(?:rerank|re-rank|re-ranker|re-ranking|retrieval|retriever)/i

/** 是否为重排模型。 */
export function isRerankModel(descriptor: ModelTypeDescriptor): boolean {
  return RERANK_REGEX.test(getNormalizedModelIdentity(descriptor))
}

/** 是否为嵌入模型。 */
export function isEmbeddingModel(descriptor: ModelTypeDescriptor): boolean {
  if (isRerankModel(descriptor)) return false

  const providerType = String(descriptor.providerType || '').trim().toLowerCase()
  if (providerType === 'anthropic' || providerType === 'vertex-anthropic') {
    return false
  }

  const modelId = getNormalizedModelIdentity(descriptor)
  const modelName = getNormalizedModelName(descriptor)

  /**
   * Doubao 特例：
   * - 其目录里经常出现“ID 很泛、名称更像真实模型族”的情况；
   * - 因此需要在 name 上再跑一遍 embedding 正则。
   */
  if (providerType === 'doubao' || modelId.includes('doubao')) {
    return EMBEDDING_REGEX.test(modelName || modelId)
  }

  return EMBEDDING_REGEX.test(modelId)
}
