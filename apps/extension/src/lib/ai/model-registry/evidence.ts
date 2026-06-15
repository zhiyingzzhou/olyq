/**
 * 说明：`evidence` AI 能力模块。
 *
 * 职责：
 * - 承载 `evidence` 相关的当前文件实现与模块边界；
 * - 对外暴露 `sortEvidences`、`pickHighestSourcePriority`、`pickHighestConfidence` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 元数据证据辅助函数。
 *
 * 说明：
 * - 负责做证据级别的基础合并与排序；
 * - 不负责生成最终 registry；
 * - 这些工具会被连接器、merge engine 与本地 preview rebuild 共同使用。
 */

import type {
  MetadataEvidence,
  ModelFeature,
  ModelModality,
  ResolveConfidence,
  SourcePriority,
} from './types'

const sourcePriorityRank: Record<SourcePriority, number> = {
  'provider-official': 3,
  'public-official': 2,
  seed: 1,
}

const confidenceRank: Record<ResolveConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
}

/**
 * 对证据按来源优先级与可信度做稳定排序。
 */
export function sortEvidences(evidences: ReadonlyArray<MetadataEvidence>): MetadataEvidence[] {
  return [...evidences].sort((a, b) => {
    const sourceDiff = sourcePriorityRank[b.sourcePriority] - sourcePriorityRank[a.sourcePriority]
    if (sourceDiff !== 0) return sourceDiff
    return confidenceRank[b.confidence] - confidenceRank[a.confidence]
  })
}

/**
 * 获取证据集合中的最高来源优先级。
 */
export function pickHighestSourcePriority(evidences: ReadonlyArray<MetadataEvidence>): SourcePriority {
  return sortEvidences(evidences)[0]?.sourcePriority ?? 'seed'
}

/**
 * 获取证据集合中的最高可信度。
 */
export function pickHighestConfidence(evidences: ReadonlyArray<MetadataEvidence>): ResolveConfidence {
  return sortEvidences(evidences)[0]?.confidence ?? 'low'
}

/**
 * 对字符串数组做去重并保留首次出现顺序。
 *
 * 说明：
 * - 证据合并时顺序代表来源合并后的稳定输出，不应被无序 Set 打乱；
 * - 该工具只服务于模态、特性等字符串枚举合并。
 */
function uniqStrings<T extends string>(values: ReadonlyArray<T>): T[] {
  return Array.from(new Set(values.filter(Boolean))) as T[]
}

/**
 * 合并模态列表。
 */
export function mergeModalities(
  evidences: ReadonlyArray<MetadataEvidence>,
  key: 'inputModalities' | 'outputModalities',
): ReadonlyArray<ModelModality> {
  const values = evidences.flatMap((item) => item[key] ?? [])
  return uniqStrings(values)
}

/**
 * 合并特性列表。
 */
export function mergeFeatureHints(evidences: ReadonlyArray<MetadataEvidence>): ReadonlyArray<ModelFeature> {
  return uniqStrings(evidences.flatMap((item) => item.featureHints ?? []))
}
