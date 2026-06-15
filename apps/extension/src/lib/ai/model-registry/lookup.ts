/**
 * 说明：`lookup` AI 能力模块。
 *
 * 职责：
 * - 承载 `lookup` 相关的当前文件实现与模块边界；
 * - 对外暴露 `CanonicalLookupParams`、`CanonicalLookupResult`、`inferPublicCanonicalIdFromRawModelId` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * registry 公共身份命中链路。
 *
 * 为什么单独抽这个文件：
 * - `merge.ts` 在构建 providerModelMap 时需要决定某个 provider 模型最终指向哪个 canonical；
 * - `resolver.ts` 在运行时解析时也需要用完全相同的顺序命中 alias / path fallback；
 * - 之前两边各维护一套顺序，已经出现过“构建时能归并、运行时却掉回 scoped-fallback”的分叉。
 *
 * 因此这里把“raw alias -\> baseModelKey alias -\> provider-path -\> scoped-fallback”
 * 提炼成单一纯函数，构建期和运行期都必须复用它。
 */

import {
  buildAliasKey,
  buildPublicCanonicalId,
  extractBaseModelKey,
  splitVendorAndModelFromPath,
} from './identity'
import type {
  AliasRecord,
  CanonicalModelRecord,
  ProviderResolveSource,
} from './types'

/** alias 候选来源：来自原始模型 ID，还是来自归一后的基础模型键。 */
type AliasCandidateSource = 'raw' | 'base-model'

/** 单条 alias 查询候选，用于记录最终参与命中的键和值来源。 */
interface AliasLookupCandidate {
  /** 当前尝试的 alias 键。 */
  readonly aliasKey: string
  /** 当前 alias 来自原始 rawId 还是基础模型键。 */
  readonly source: AliasCandidateSource
}

/** canonical 查询所需的上下文参数。 */
export interface CanonicalLookupParams {
  /** provider 类型。 */
  readonly providerType: string
  /** provider 实例 ID。 */
  readonly providerId: string
  /** provider 返回的原始模型 ID。 */
  readonly rawModelId: string
  /** 已构建好的 alias 索引。 */
  readonly aliasIndex: Record<string, AliasRecord>
  /** 已构建好的公共 canonical 表。 */
  readonly canonicalModels: Record<string, CanonicalModelRecord>
}

/** canonical 查询结果，描述最终命中位置及调试辅助信息。 */
export interface CanonicalLookupResult {
  /** 最终命中的 canonicalId；未命中时为 null。 */
  readonly canonicalId: string | null
  /** 命中来源。 */
  readonly resolvedBy: Exclude<ProviderResolveSource, 'provider-map'>
  /** 当前 rawId 归一后得到的基础模型身份键。 */
  readonly baseModelKey: string
  /** 若命中了 alias，则回传命中的 alias 记录，便于 trace/debug。 */
  readonly matchedAlias?: AliasRecord
  /** 若命中了 alias，则回传实际命中的 aliasKey。 */
  readonly matchedAliasKey?: string
}

/**
 * 向 alias 候选列表中追加一个待查询项。
 *
 * 说明：
 * - 这里会复用 `buildAliasKey` 统一拼接 provider-specific / provider-generic / global 三层键。
 * - `seen` 用于去重，避免同一个 rawId 与 baseModelKey 生成出重复候选后重复命中。
 */
function pushAliasCandidate(
  out: AliasLookupCandidate[],
  seen: Set<string>,
  rawId: string,
  source: AliasCandidateSource,
  providerType?: string,
  providerId?: string,
): void {
  const aliasKey = buildAliasKey(rawId, providerType, providerId)
  if (seen.has(aliasKey)) return
  seen.add(aliasKey)
  out.push({ aliasKey, source })
}

/**
 * 生成 canonical 命中候选顺序。
 *
 * 固定顺序：
 * 1. raw id 的 provider-specific alias
 * 2. raw id 的 provider-generic alias
 * 3. raw id 的 global alias
 * 4. baseModelKey 的 provider-specific alias
 * 5. baseModelKey 的 provider-generic alias
 * 6. baseModelKey 的 global alias
 */
function buildAliasLookupCandidates(params: {
  readonly providerType: string
  readonly providerId: string
  readonly rawModelId: string
  readonly baseModelKey: string
}): ReadonlyArray<AliasLookupCandidate> {
  const out: AliasLookupCandidate[] = []
  const seen = new Set<string>()
  const rawModelId = String(params.rawModelId || '').trim()
  const baseModelKey = String(params.baseModelKey || '').trim()

  if (rawModelId) {
    pushAliasCandidate(out, seen, rawModelId, 'raw', params.providerType, params.providerId)
    pushAliasCandidate(out, seen, rawModelId, 'raw', params.providerType)
    pushAliasCandidate(out, seen, rawModelId, 'raw')
  }

  if (baseModelKey) {
    pushAliasCandidate(out, seen, baseModelKey, 'base-model', params.providerType, params.providerId)
    pushAliasCandidate(out, seen, baseModelKey, 'base-model', params.providerType)
    pushAliasCandidate(out, seen, baseModelKey, 'base-model')
  }

  return out
}

/**
 * 当 alias 全部未命中时，尝试根据 `vendor/model` 原始路径直接回推公共 canonical。
 *
 * 说明：
 * - 这是非常保守的最后一步；
 * - 只有 rawId 明确形如 `vendor/model`，且 registry 内确实已有该 canonical 时才命中；
 * - 不会凭空创建 public canonical，更不会根据 provider 前缀胡乱猜测。
 */
export function inferPublicCanonicalIdFromRawModelId(
  rawModelId: string,
  canonicalModels: Record<string, CanonicalModelRecord>,
): string | null {
  const { vendorPart, modelPart } = splitVendorAndModelFromPath(rawModelId)
  if (!vendorPart || !modelPart) return null
  const candidate = buildPublicCanonicalId(vendorPart, extractBaseModelKey(modelPart))
  return canonicalModels[candidate] ? candidate : null
}

/**
 * 统一 canonical 命中入口。
 *
 * 注意：
 * - 这里不会返回 `provider-map`，因为 `provider-map` 是构建完成后的缓存命中层；
 * - 这里表达的是“如果只看 alias 与 path fallback，本次应该命中到哪一个 canonical”。
 */
export function resolveCanonicalLookup(params: CanonicalLookupParams): CanonicalLookupResult {
  const rawModelId = String(params.rawModelId || '').trim()
  const baseModelKey = extractBaseModelKey(rawModelId)

  for (const candidate of buildAliasLookupCandidates({
    providerType: params.providerType,
    providerId: params.providerId,
    rawModelId,
    baseModelKey,
  })) {
    const alias = params.aliasIndex[candidate.aliasKey]
    if (!alias) continue
    return {
      canonicalId: alias.canonicalId,
      resolvedBy: candidate.source === 'base-model' ? 'base-model-alias' : 'alias-index',
      baseModelKey,
      matchedAlias: alias,
      matchedAliasKey: candidate.aliasKey,
    }
  }

  const byPath = inferPublicCanonicalIdFromRawModelId(rawModelId, params.canonicalModels)
  if (byPath) {
    return {
      canonicalId: byPath,
      resolvedBy: 'provider-path',
      baseModelKey,
    }
  }

  return {
    canonicalId: null,
    resolvedBy: 'scoped-fallback',
    baseModelKey,
  }
}
