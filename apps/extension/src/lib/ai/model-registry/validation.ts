/**
 * 说明：`validation` AI 能力模块。
 *
 * 职责：
 * - 承载 `validation` 相关的当前文件实现与模块边界；
 * - 对外暴露 `RegistryValidationIssueLevel`、`RegistryValidationIssue`、`RegistryImpactSummary` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型注册表校验工具。
 *
 * 说明：
 * - 只校验“当前 registry 快照是否自洽”；
 * - 历史手工维护链路已彻底删除，因此这里不再包含任何相关规则；
 * - 返回结构化 issue，供存储层与测试统一消费。
 */

import { normalizeModelSlug, parseCanonicalId } from './identity'
import type { ModelRegistryState } from './types'

/** 注册表校验问题等级。`error` 会破坏一致性，`warning` 表示存在高风险歧义。 */
export type RegistryValidationIssueLevel = 'error' | 'warning'

/** 单条 registry 校验问题。 */
export interface RegistryValidationIssue {
  /** 问题等级，用于决定日志和测试断言策略。 */
  readonly level: RegistryValidationIssueLevel
  /** 稳定问题编码，供测试或 UI 做分类展示。 */
  readonly code: string
  /** 面向开发者的可读说明。 */
  readonly message: string
  /** 可选：指向 registry 快照中的具体路径。 */
  readonly path?: string
}

/** 重建前后 registry 规模变化摘要。 */
export interface RegistryImpactSummary {
  /** canonical 模型数量变化。 */
  readonly canonicalDelta: number
  /** alias 数量变化。 */
  readonly aliasDelta: number
  /** providerModelMap 数量变化。 */
  readonly providerMapDelta: number
  /** provider/local scoped 模型数量变化。 */
  readonly scopedDelta: number
  /** `unknown` 模型数量变化。 */
  readonly unknownDelta: number
}

/**
 * 向问题列表中追加一条结构化 issue。
 *
 * 说明：
 * - 统一封装后，所有校验分支都能稳定生成相同形状的数据；
 * - `path` 为空时不会强行写入 undefined 字段，避免日志噪音。
 */
function pushIssue(
  issues: RegistryValidationIssue[],
  level: RegistryValidationIssueLevel,
  code: string,
  message: string,
  path?: string,
): void {
  issues.push({ level, code, message, ...(path ? { path } : {}) })
}

/**
 * 统计 registry 中被归类为 `unknown` 的模型数量。
 *
 * 说明：
 * - 同时统计公共 canonical 与 provider scoped 两类模型；
 * - 该指标常用于评估目录同步或语义判定规则是否退化。
 */
function countUnknownModels(registry: ModelRegistryState): number {
  return (
    Object.values(registry.canonicalModels).filter((item) => item.kind === 'unknown').length
    + Object.values(registry.providerScopedModels).filter((item) => item.kind === 'unknown').length
  )
}

/** 校验完整 registry 快照。 */
export function validateRegistryState(registry: ModelRegistryState): ReadonlyArray<RegistryValidationIssue> {
  const issues: RegistryValidationIssue[] = []
  const publicIdentityMap = new Map<string, string>()
  const publicBaseModelKeyMap = new Map<string, string[]>()

  for (const [canonicalId, model] of Object.entries(registry.canonicalModels)) {
    // 公共 canonical 的 vendor/model 组合必须唯一，否则 alias 与 provider map 会出现二义性。
    if (model.scope !== 'public') continue
    const identityKey = `${model.vendorSlug}::${model.modelSlug}`
    const existingCanonicalId = publicIdentityMap.get(identityKey)
    if (existingCanonicalId && existingCanonicalId !== canonicalId) {
      pushIssue(
        issues,
        'error',
        'duplicate-public-identity',
        `registry 公共模型归一主键冲突：${identityKey} 同时指向 ${existingCanonicalId} 与 ${canonicalId}`,
        `canonicalModels.${canonicalId}`,
      )
    } else {
      publicIdentityMap.set(identityKey, canonicalId)
    }

    const currentBaseOwners = publicBaseModelKeyMap.get(model.baseModelKey) ?? []
    currentBaseOwners.push(canonicalId)
    publicBaseModelKeyMap.set(model.baseModelKey, currentBaseOwners)
  }

  const conflictingBaseModelKeys = new Set<string>()
  for (const [baseModelKey, canonicalIds] of publicBaseModelKeyMap.entries()) {
    // baseModelKey 冲突不会立刻破坏 registry，但会让 leaf alias 失去唯一性，所以降级为 warning。
    if (canonicalIds.length <= 1) continue
    conflictingBaseModelKeys.add(baseModelKey)
    pushIssue(
      issues,
      'warning',
      'duplicate-base-model-key',
      `多个公共 canonical 共用了相同的 baseModelKey：${baseModelKey} -> ${canonicalIds.join(', ')}`,
      `canonicalModels.${canonicalIds[0]}`,
    )
  }

  for (const [aliasKey, alias] of Object.entries(registry.aliasIndex)) {
    const targetExists = Boolean(registry.canonicalModels[alias.canonicalId] || registry.providerScopedModels[alias.canonicalId])
    if (!targetExists) {
      pushIssue(
        issues,
        'error',
        'dangling-alias',
        `alias 指向不存在的 canonicalId：${alias.canonicalId}`,
        `aliasIndex.${aliasKey}`,
      )
    }

    if (alias.matchType === 'leaf-unique' && conflictingBaseModelKeys.has(alias.normalizedId)) {
      pushIssue(
        issues,
        'error',
        'conflicting-base-model-leaf-alias',
        `冲突的 baseModelKey 不允许继续生成 leaf alias：${alias.normalizedId}`,
        `aliasIndex.${aliasKey}`,
      )
    }
  }

  for (const [providerMapKey, record] of Object.entries(registry.providerModelMap)) {
    const targetExists = Boolean(registry.canonicalModels[record.canonicalId] || registry.providerScopedModels[record.canonicalId])
    if (!targetExists) {
      pushIssue(
        issues,
        'error',
        'dangling-provider-map',
        `providerModelMap 指向不存在的 canonicalId：${record.canonicalId}`,
        `providerModelMap.${providerMapKey}`,
      )
    }
  }

  for (const [scopedId, scoped] of Object.entries(registry.providerScopedModels)) {
    const parsed = parseCanonicalId(scoped.canonicalId)
    if (!parsed) {
      pushIssue(
        issues,
        'error',
        'invalid-scoped-canonical-id',
        `scoped model canonicalId 无法解析：${scoped.canonicalId}`,
        `providerScopedModels.${scopedId}`,
      )
    }
  }

  return issues
}

/** 计算重建前后的影响摘要。 */
export function summarizeRegistryImpact(before: ModelRegistryState, after: ModelRegistryState): RegistryImpactSummary {
  return {
    canonicalDelta: Object.keys(after.canonicalModels).length - Object.keys(before.canonicalModels).length,
    aliasDelta: Object.keys(after.aliasIndex).length - Object.keys(before.aliasIndex).length,
    providerMapDelta: Object.keys(after.providerModelMap).length - Object.keys(before.providerModelMap).length,
    scopedDelta: Object.keys(after.providerScopedModels).length - Object.keys(before.providerScopedModels).length,
    unknownDelta: countUnknownModels(after) - countUnknownModels(before),
  }
}

/**
 * 将影响摘要格式化为单行文案。
 *
 * 说明：
 * - 主要用于日志、toast 和调试面板；
 * - 每个字段都显式带正负号，方便快速看出本次重建是扩容还是收缩。
 */
export function formatRegistryImpactSummary(summary: RegistryImpactSummary): string {
  return [
    `canonical ${summary.canonicalDelta >= 0 ? '+' : ''}${summary.canonicalDelta}`,
    `alias ${summary.aliasDelta >= 0 ? '+' : ''}${summary.aliasDelta}`,
    `providerMap ${summary.providerMapDelta >= 0 ? '+' : ''}${summary.providerMapDelta}`,
    `scoped ${summary.scopedDelta >= 0 ? '+' : ''}${summary.scopedDelta}`,
    `unknown ${summary.unknownDelta >= 0 ? '+' : ''}${summary.unknownDelta}`,
  ].join(' | ')
}

/**
 * 返回可用于搜索和展示的归一化显示键。
 *
 * 说明：
 * - 当前直接复用 `normalizeModelSlug`，保证与 alias 匹配规则一致；
 * - 单独抽函数是为了让 UI/测试不直接依赖底层 identity 工具。
 */
export function toNormalizedDisplayKey(value: string): string {
  return normalizeModelSlug(value)
}
