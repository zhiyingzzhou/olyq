/**
 * 说明：`rule-helpers` AI 能力模块。
 *
 * 职责：
 * - 承载 `rule-helpers` 相关的当前文件实现与模块边界；
 * - 对外暴露 `matchesProviders`、`createRule`、`createExactRule` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Provider 规则表辅助工具。
 *
 * 为什么存在：
 * - 模型类型规则最终会演进成一批结构化规则表，如果每个 provider 文件都手写样板，会非常难维护；
 * - 这里统一封装 provider 匹配、模型 ID 归一化、regex/前缀/精确值匹配这些重复动作；
 * - 规则文件只需要描述“来源、样例、命中条件、效果”，可读性会比 scattered if/else 高很多。
 */

import type { ModelTypeDescriptor, ProviderModelRule, ProviderRuleEffects } from '../types'
import { MODEL_RULES_VERIFIED_AT } from '../provider-rule-sources'
import { getNormalizedModelIdentity, normalizeProviderToken } from './normalize'

/**
 * Provider 规则元信息。
 *
 * 说明：
 * - 该结构描述规则的来源、优先级、样例和命中效果，是规则表的公共骨架；
 * - 具体匹配逻辑通过 `createRule` 系列工厂单独提供。
 */
type RuleMeta = {
  /** 规则唯一标识，用于排查命中来源。 */
  readonly id: string
  /** 规则生效的 provider 范围；为空时表示对所有 provider 生效。 */
  readonly providers: ReadonlyArray<string>
  /** 规则优先级，数值越大越优先。 */
  readonly priority: number
  /** 规则来源文档地址，便于后续追溯。 */
  readonly sourceUrl: string
  /** 与该规则对应的典型模型样例。 */
  readonly examples: ReadonlyArray<string>
  /** 维护备注，记录规则背景或限制。 */
  readonly notes: string
  /** 命中规则后要附加到模型描述符的效果集合。 */
  readonly effects: ProviderRuleEffects
}

/**
 * 统一判断当前 descriptor 是否属于指定 provider 集合。
 *
 * @param descriptor - 待判断的模型描述符。
 * @param providers - 规则声明的 provider 范围。
 * @returns 若规则未限定 provider，或命中 providerType/providerId 任一值，则返回 `true`。
 */
export function matchesProviders(
  descriptor: ModelTypeDescriptor,
  providers: ReadonlyArray<string>,
): boolean {
  if (providers.length === 0) return true
  const providerType = normalizeProviderToken(descriptor.providerType)
  const providerId = normalizeProviderToken(descriptor.providerId)
  return providers.some((item) => {
    const normalized = normalizeProviderToken(item)
    return normalized === providerType || normalized === providerId
  })
}

/**
 * 结构化规则工厂。
 *
 * @param meta - 规则元数据。
 * @param match - 规则命中函数。
 * @returns 已补齐统一 `verifiedAt` 字段的规则对象。
 */
export function createRule(
  meta: RuleMeta,
  match: ProviderModelRule['match'],
): ProviderModelRule {
  return {
    ...meta,
    verifiedAt: MODEL_RULES_VERIFIED_AT,
    match,
  }
}

/**
 * 创建精确 ID 规则。
 *
 * @param meta - 规则元数据。
 * @param values - 允许命中的标准化模型 ID 列表。
 * @returns 仅在 provider 范围匹配且模型身份完全相等时命中的规则。
 */
export function createExactRule(
  meta: RuleMeta,
  values: ReadonlyArray<string>,
): ProviderModelRule {
  const normalizedValues = new Set(values.map((item) => item.trim().toLowerCase()).filter(Boolean))
  return createRule(meta, (descriptor) => {
    if (!matchesProviders(descriptor, meta.providers)) return false
    return normalizedValues.has(getNormalizedModelIdentity(descriptor))
  })
}

/**
 * 创建前缀规则。
 *
 * @param meta - 规则元数据。
 * @param prefixes - 命中前缀集合。
 * @returns 仅在模型标准化 ID 以前缀开头时命中的规则。
 */
export function createPrefixRule(
  meta: RuleMeta,
  prefixes: ReadonlyArray<string>,
): ProviderModelRule {
  const normalizedPrefixes = prefixes.map((item) => item.trim().toLowerCase()).filter(Boolean)
  return createRule(meta, (descriptor) => {
    if (!matchesProviders(descriptor, meta.providers)) return false
    const modelId = getNormalizedModelIdentity(descriptor)
    return normalizedPrefixes.some((prefix) => modelId.startsWith(prefix))
  })
}

/**
 * 创建正则规则。
 *
 * @param meta - 规则元数据。
 * @param pattern - 用于匹配标准化模型 ID 的正则表达式。
 * @returns 满足 provider 范围且正则命中的规则。
 */
export function createRegexRule(
  meta: RuleMeta,
  pattern: RegExp,
): ProviderModelRule {
  return createRule(meta, (descriptor) => {
    if (!matchesProviders(descriptor, meta.providers)) return false
    return pattern.test(getNormalizedModelIdentity(descriptor))
  })
}

/**
 * 创建自定义谓词规则。
 *
 * @param meta - 规则元数据。
 * @param predicate - 自定义判断函数，第二个参数为预先归一化后的模型身份文本。
 * @returns 满足 provider 范围且通过自定义谓词的规则。
 */
export function createPredicateRule(
  meta: RuleMeta,
  predicate: (descriptor: ModelTypeDescriptor, modelId: string) => boolean,
): ProviderModelRule {
  return createRule(meta, (descriptor) => {
    if (!matchesProviders(descriptor, meta.providers)) return false
    return predicate(descriptor, getNormalizedModelIdentity(descriptor))
  })
}
