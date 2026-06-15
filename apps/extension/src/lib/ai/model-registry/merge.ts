/**
 * 说明：`merge` AI 能力模块。
 *
 * 职责：
 * - 承载 `merge` 相关的当前文件实现与模块边界；
 * - 对外暴露 `rebuildModelRegistryFromCanonicalModels`、`buildModelRegistry` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型注册表合并引擎。
 *
 * 设计说明：
 * - 只接收“官方目录证据 + 当前 Provider 配置”；
 * - 不再接收任何手工维护 manifest，也不再保留历史双真源；
 * - 公共模型身份由 `hugging_face_id -\> canonical_slug -\> openrouter id` 固定优先级决定；
 * - provider/local scoped 模型语义统一走 `model-type-system` 纯函数引擎。
 */

import type { ProviderConfig, ProviderModelConfig } from '../types'
import {
  deriveKindFromModalities,
  resolveSystemModelType,
  toModelCapabilities,
  type OpenRouterBaseline,
} from '../model-type-system'
import {
  buildAliasKey,
  buildProviderModelMapKey,
  buildPublicCanonicalId,
  buildScopedCanonicalId,
  extractBaseModelKey,
  normalizeModelSlug,
  normalizeVendorSlug,
  splitVendorAndModelFromPath,
} from './identity'
import { resolveCanonicalLookup } from './lookup'
import type {
  AliasMatchType,
  AliasRecord,
  CanonicalModelRecord,
  ExternalRef,
  MetadataEvidence,
  ModelRegistryState,
  ModelScope,
  ProviderModelRecord,
  ProviderScopedModelRecord,
} from './types'
import { mergeFeatureHints, mergeModalities, pickHighestConfidence, pickHighestSourcePriority, sortEvidences } from './evidence'
import { normalizeSupportedParameters } from '../model-request-parameters'

/**
 * 构建完整模型注册表所需的输入。
 *
 * 说明：
 * - 真源只包含“官方目录证据 + 当前 Provider 配置”；
 * - 同步元信息单独透传，便于 registry 快照记录最近一次 OpenRouter 同步状态。
 */
type BuildRegistryParams = {
  /** 当前 Provider 配置列表。 */
  readonly providers: ReadonlyArray<ProviderConfig>
  /** OpenRouter 主目录 seed evidence。 */
  readonly seedEvidences: ReadonlyArray<MetadataEvidence>
  /** OpenRouter 最近一次同步时间。 */
  readonly openrouterLastSyncAt?: string
  /** 最近一次同步状态。 */
  readonly openrouterLastSyncStatus?: 'success' | 'error'
  /** 最近一次同步错误。 */
  readonly openrouterLastError?: string
}

/**
 * 生成适合 UI 展示的短名称。
 *
 * 说明：
 * - 当前策略非常保守：为空时回退为 `AI`，超长时仅截断；
 * - 不在这里做复杂品牌化处理，避免把展示策略和 registry 身份规则耦合。
 */
function humanizeShortName(raw: string): string {
  const text = String(raw || '').trim()
  if (!text) return 'AI'
  return text.length > 32 ? text.slice(0, 32) : text
}

/** 对字符串数组去重并过滤空值。 */
function uniqStrings<T extends string>(items: ReadonlyArray<T>): T[] {
  return Array.from(new Set(items.filter(Boolean))) as T[]
}

/**
 * 对外部引用数组做值级去重。
 *
 * 说明：
 * - `ExternalRef` 是对象结构，直接用 Set 无法按值比较；
 * - 这里通过 JSON 序列化做轻量去重，足以满足 registry 构建阶段的离线使用场景。
 */
function uniqRefs(items: ReadonlyArray<ExternalRef>): ExternalRef[] {
  return uniqStrings(items.map((item) => JSON.stringify(item))).map((item) => JSON.parse(item) as ExternalRef)
}

/** 规范化上下文长度，只保留有限且大于 0 的数值。 */
function normalizeContextLength(raw: number | undefined): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return undefined
  return raw
}

/**
 * 清洗单条 metadata evidence。
 *
 * 说明：
 * - 目前只处理 `contextLength` 的非法值；
 * - 之所以在构建入口统一清洗，是为了避免下游各处重复判断。
 */
function sanitizeMetadataEvidence(evidence: MetadataEvidence): MetadataEvidence {
  const normalizedContextLength = normalizeContextLength(evidence.contextLength)
  const normalizedSupportedParameters = normalizeSupportedParameters(evidence.supportedParameters)
  if (
    normalizedContextLength === evidence.contextLength
    && normalizedSupportedParameters === evidence.supportedParameters
  ) {
    return evidence
  }
  const {
    contextLength: _discardedContextLength,
    supportedParameters: _discardedSupportedParameters,
    ...rest
  } = evidence
  return {
    ...rest,
    ...(normalizedContextLength !== undefined ? { contextLength: normalizedContextLength } : {}),
    ...(normalizedSupportedParameters !== undefined ? { supportedParameters: normalizedSupportedParameters } : {}),
  }
}

/**
 * 判断 Provider 解析出的 scoped 模型是否应视为“本地模型”。
 *
 * 说明：
 * - Ollama 天然属于本地；
 * - 其它 Provider 只要 apiHost 指向 localhost / 127.0.0.1 / [::1]，也按本地处理。
 */
function isLocalProviderScope(provider: ProviderConfig): boolean {
  if (provider.type === 'ollama') return true
  const apiHost = String(provider.apiHost || '').trim()
  if (!apiHost) return false
  try {
    const url = new URL(apiHost)
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  } catch {
    return false
  }
}

/**
 * 选择公共身份主锚点。
 *
 * 固定优先级：
 * 1. Hugging Face 上游标识
 * 2. OpenRouter canonical slug
 * 3. OpenRouter id
 */
function pickPreferredPublicIdentityValue(evidence: MetadataEvidence): string {
  const references = evidence.references ?? []
  const huggingFaceId = references.find((item) => item.system === 'public-official' && item.refType === 'upstream')?.value
  if (typeof huggingFaceId === 'string' && huggingFaceId.trim()) return huggingFaceId

  const canonicalSlug = references.find((item) => item.system === 'openrouter' && item.refType === 'canonical')?.value
  if (typeof canonicalSlug === 'string' && canonicalSlug.trim()) return canonicalSlug

  const openrouterId = references.find((item) => item.system === 'openrouter' && item.refType === 'model-id')?.value
  if (typeof openrouterId === 'string' && openrouterId.trim()) return openrouterId

  return String(evidence.rawModelId || '').trim()
}

/**
 * 从单条 evidence 中推断公共 canonical 身份。
 *
 * 说明：
 * - 该步骤会把来源不一致的原始 ID 归一成稳定的 vendor/model slug；
 * - 若无法得到可用的 model slug，则返回 `null`，表示这条 evidence 暂时不能参与公共聚合。
 */
function inferPublicIdentity(
  evidence: MetadataEvidence,
): { canonicalId: string; vendorSlug: string; modelSlug: string; baseModelKey: string } | null {
  const identityValue = pickPreferredPublicIdentityValue(evidence)
  if (!identityValue) return null

  const fromPath = splitVendorAndModelFromPath(identityValue)
  const vendorSlug = normalizeVendorSlug(fromPath.vendorPart || evidence.vendorHint || 'unknown')
  const modelSlug = normalizeModelSlug(fromPath.modelPart || evidence.modelHint || identityValue)
  const baseModelKey = extractBaseModelKey(identityValue)
  if (!modelSlug) return null

  return {
    canonicalId: buildPublicCanonicalId(vendorSlug, modelSlug),
    vendorSlug,
    modelSlug,
    baseModelKey,
  }
}

/**
 * 根据引用来源推断 alias 匹配类型。
 *
 * 说明：
 * - 该值会参与 alias 冲突时的优先级比较；
 * - 不同来源的 exact alias 语义不同，因此需要在构建阶段就固定分类。
 */
function resolveAliasMatchType(ref: ExternalRef): AliasMatchType {
  if (ref.system === 'public-official' && ref.refType === 'upstream') return 'hugging-face-id'
  if (ref.system === 'openrouter' && ref.refType === 'canonical') return 'openrouter-canonical-slug'
  if (ref.system === 'openrouter' && ref.refType === 'model-id') return 'openrouter-id'
  if (ref.system === 'provider-official' && ref.refType === 'model-id') return 'provider-official-id'
  return 'upstream-ref'
}

/**
 * 将 seed evidences 聚合为公共 canonical 模型表。
 *
 * 说明：
 * - 先按推断出的公共身份分组，再把同组 evidence 合并成单条 canonical record；
 * - 模态、特性、上下文长度、价格等字段都遵循“多源证据合并”策略。
 */
function buildCanonicalModels(seedEvidences: ReadonlyArray<MetadataEvidence>): Record<string, CanonicalModelRecord> {
  const groups = new Map<string, MetadataEvidence[]>()
  for (const evidence of seedEvidences) {
    const identity = inferPublicIdentity(evidence)
    if (!identity) continue
    const current = groups.get(identity.canonicalId) ?? []
    current.push(evidence)
    groups.set(identity.canonicalId, current)
  }

  const out: Record<string, CanonicalModelRecord> = {}
  for (const [canonicalId, evidences] of groups.entries()) {
    const sorted = sortEvidences(evidences)
    const first = sorted[0]
    if (!first) continue
    const identity = inferPublicIdentity(first)
    if (!identity) continue

    const inputModalities = mergeModalities(sorted, 'inputModalities')
    const outputModalities = mergeModalities(sorted, 'outputModalities')
    const features = mergeFeatureHints(sorted)
    const displayName = first.displayName || `${identity.vendorSlug}:${identity.modelSlug}`
    const openrouterBaseline: OpenRouterBaseline = {
      kind: deriveKindFromModalities(inputModalities, outputModalities, first.kindHint),
      inputModalities,
      outputModalities,
      capabilities: toModelCapabilities(features),
      displayName,
    }

    // 公共 canonical 的语义识别优先参考 OpenRouter 基线，再结合显式 evidence 修正。
    const semantic = resolveSystemModelType({
      providerType: first.providerType,
      providerId: first.providerId,
      rawModelId: pickPreferredPublicIdentityValue(first),
      rawModelName: first.displayName,
      kindHint: first.kindHint,
      inputModalities,
      outputModalities,
      features,
      references: first.references,
      transportProtocol: first.transportHints?.find((item) => item && item !== 'unknown'),
    }, { openrouterBaseline })
    const description = sorted.find((item) => item.description)?.description
    const contextLength = sorted
      .map((item) => normalizeContextLength(item.contextLength))
      .find((item) => typeof item === 'number')
    const pricing = sorted.find((item) => item.pricing)?.pricing
    const references = uniqRefs(sorted.flatMap((item) => item.references ?? []))

    out[canonicalId] = {
      canonicalId,
      baseModelKey: identity.baseModelKey,
      scope: 'public',
      vendorSlug: identity.vendorSlug,
      modelSlug: identity.modelSlug,
      displayName,
      shortName: humanizeShortName(displayName),
      ...(description ? { description } : {}),
      kind: semantic.kind,
      inputModalities: semantic.inputModalities,
      outputModalities: semantic.outputModalities,
      features: semantic.features,
      ...(contextLength !== undefined ? { contextLength } : {}),
      ...(pricing ? { pricing } : {}),
      references,
      sourcePriority: pickHighestSourcePriority(sorted),
      confidence: pickHighestConfidence(sorted),
      updatedAt: new Date().toISOString(),
    }
  }

  return out
}

/**
 * 基于 canonical 模型构建 alias 索引。
 *
 * 说明：
 * - exact alias 会记录来源并在冲突时按可信度/标准化程度择优；
 * - leaf alias 仅在全局唯一时生成，避免把不同模型错误并到一起。
 */
function buildAliasIndex(canonicalModels: Record<string, CanonicalModelRecord>): Record<string, AliasRecord> {
  const out: Record<string, AliasRecord> = {}

  /** 尝试写入一条 alias 记录，并在同键冲突时按 matchType 优先级择优保留。 */
  const put = (record: AliasRecord) => {
    const existing = out[record.aliasKey]
    if (!existing) {
      out[record.aliasKey] = record
      return
    }

    /**
     * exact alias 冲突时，保持“更标准的公共身份优先”：
     * - Hugging Face exact alias 优先级最高；
     * - canonical slug 次之；
     * - OpenRouter id 最后；
     * - 其它 exact/upstream 只在不冲突时写入。
     */
    const rank: Record<AliasMatchType, number> = {
      'hugging-face-id': 5,
      'openrouter-canonical-slug': 4,
      'openrouter-id': 3,
      'provider-official-id': 2,
      'upstream-ref': 1,
      'leaf-unique': 0,
    }
    if (rank[record.matchType] > rank[existing.matchType]) {
      out[record.aliasKey] = record
    }
  }

  for (const model of Object.values(canonicalModels)) {
    put({
      aliasKey: buildAliasKey(model.canonicalId),
      rawId: model.canonicalId,
      normalizedId: normalizeModelSlug(model.canonicalId),
      canonicalId: model.canonicalId,
      matchType: 'upstream-ref',
      confidence: model.confidence,
    })

    for (const ref of model.references) {
      put({
        aliasKey: buildAliasKey(ref.value, ref.providerType, ref.providerId),
        rawId: ref.value,
        normalizedId: normalizeModelSlug(ref.value),
        ...(ref.providerType ? { providerType: ref.providerType } : {}),
        ...(ref.providerId ? { providerId: ref.providerId } : {}),
        displayName: model.displayName,
        canonicalId: model.canonicalId,
        matchType: resolveAliasMatchType(ref),
        confidence: model.confidence,
      })
    }
  }

  /**
   * 叶子 alias 只基于 `baseModelKey` 生成：
   * - 有 HF 时取 HF leaf；
   * - 否则取 canonical_slug leaf；
   * - 再否则退回 OpenRouter id leaf；
   * - 只有全局唯一时才写入，避免 leaf-only 误归并。
   */
  const leafGroups = new Map<string, CanonicalModelRecord[]>()
  for (const model of Object.values(canonicalModels)) {
    if (model.scope !== 'public') continue
    const leaf = normalizeModelSlug(model.baseModelKey)
    if (!leaf) continue
    const current = leafGroups.get(leaf) ?? []
    current.push(model)
    leafGroups.set(leaf, current)
  }

  for (const [leaf, models] of leafGroups.entries()) {
    if (models.length !== 1) continue
    const model = models[0]
    if (!model) continue
    put({
      aliasKey: buildAliasKey(leaf),
      rawId: leaf,
      normalizedId: normalizeModelSlug(leaf),
      displayName: model.displayName,
      canonicalId: model.canonicalId,
      matchType: 'leaf-unique',
      confidence: model.confidence,
    })
  }

  return out
}

/**
 * 为无法归并到公共 canonical 的模型构建 scoped record。
 *
 * 说明：
 * - scope 会区分 `local` 与 `provider`，便于 UI 和后续策略识别“本地私有模型”；
 * - 语义能力仍然走统一的 `resolveSystemModelType`，避免 scoped 模型完全失去能力信息。
 */
function buildScopedRecord(
  provider: ProviderConfig,
  model: ProviderModelConfig,
  canonicalId: string,
): ProviderScopedModelRecord {
  const scope: Exclude<ModelScope, 'public'> = isLocalProviderScope(provider) ? 'local' : 'provider'
  const semantic = resolveSystemModelType({
    providerType: provider.type,
    providerId: provider.id,
    rawModelId: model.id,
    rawModelName: model.name,
    transportProtocol: model.transportProtocol,
    kindHint: model.kindHint,
    inputModalities: model.inputModalities,
    outputModalities: model.outputModalities,
    features: model.features,
  })

  return {
    scopedId: buildScopedCanonicalId(scope, provider.type, provider.id, model.id),
    scope,
    providerType: provider.type,
    providerId: provider.id,
    rawModelId: model.id,
    canonicalId,
    baseModelKey: extractBaseModelKey(model.id),
    displayName: model.name || model.id,
    kind: semantic.kind,
    inputModalities: semantic.inputModalities,
    outputModalities: semantic.outputModalities,
    features: semantic.features,
    transportProtocol: semantic.transportProtocol,
    ...(model.supportedParameters !== undefined ? { supportedParameters: model.supportedParameters } : {}),
    confidence: semantic.sources.includes('openrouter-baseline') || semantic.sources.includes('provider-explicit-fallback')
      ? 'high'
      : semantic.kind === 'unknown'
        ? 'low'
        : 'medium',
    updatedAt: new Date().toISOString(),
  }
}

/**
 * 为当前 Provider 列表构建 providerModelMap 与 scoped 模型表。
 *
 * 说明：
 * - 能命中公共 canonical 的模型直接映射过去；
 * - 命中失败时退回 scoped canonical，保证每个 provider/model 都有稳定落点。
 */
function buildProviderMaps(
  providers: ReadonlyArray<ProviderConfig>,
  canonicalModels: Record<string, CanonicalModelRecord>,
  aliasIndex: Record<string, AliasRecord>,
): {
  providerModelMap: Record<string, ProviderModelRecord>
  providerScopedModels: Record<string, ProviderScopedModelRecord>
} {
  const providerModelMap: Record<string, ProviderModelRecord> = {}
  const providerScopedModels: Record<string, ProviderScopedModelRecord> = {}

  /** 写入 providerModelMap，记录某个 provider 原始模型键最终映射到的 canonical。 */
  const putProviderMap = (key: string, record: ProviderModelRecord) => {
    providerModelMap[key] = record
  }

  /** 写入 provider scoped 模型表，用于保存无法归并到公共 canonical 的私有模型。 */
  const putScopedModel = (key: string, record: ProviderScopedModelRecord) => {
    providerScopedModels[key] = record
  }

  for (const provider of providers) {
    for (const model of provider.models ?? []) {
      const semantic = resolveSystemModelType({
        providerType: provider.type,
        providerId: provider.id,
        rawModelId: model.id,
        rawModelName: model.name,
        transportProtocol: model.transportProtocol,
        kindHint: model.kindHint,
        inputModalities: model.inputModalities,
        outputModalities: model.outputModalities,
        features: model.features,
      })
      const resolved = resolveCanonicalLookup({
        providerType: provider.type,
        providerId: provider.id,
        rawModelId: model.id,
        aliasIndex,
        canonicalModels,
      })
      const providerMapKey = buildProviderModelMapKey(provider.type, provider.id, model.id)

      if (resolved.canonicalId) {
        putProviderMap(providerMapKey, {
          providerType: provider.type,
          providerId: provider.id,
          rawModelId: model.id,
          canonicalId: resolved.canonicalId,
          transportProtocol: semantic.transportProtocol,
          ...(model.supportedParameters !== undefined ? { supportedParameters: model.supportedParameters } : {}),
          resolvedBy: resolved.resolvedBy,
        })
        continue
      }

      const scope: Exclude<ModelScope, 'public'> = isLocalProviderScope(provider) ? 'local' : 'provider'
      const scopedCanonicalId = buildScopedCanonicalId(scope, provider.type, provider.id, model.id)
      putProviderMap(providerMapKey, {
        providerType: provider.type,
        providerId: provider.id,
        rawModelId: model.id,
        canonicalId: scopedCanonicalId,
        transportProtocol: semantic.transportProtocol,
        ...(model.supportedParameters !== undefined ? { supportedParameters: model.supportedParameters } : {}),
        resolvedBy: 'scoped-fallback',
      })
      putScopedModel(scopedCanonicalId, buildScopedRecord(provider, model, scopedCanonicalId))
    }
  }

  return { providerModelMap, providerScopedModels }
}

/**
 * 基于现有 canonicalModels 重新构建 registry。
 *
 * 说明：
 * - 用于 Provider 配置变化后的本地 preview rebuild；
 * - 不会重新请求 OpenRouter，但会立即重放新的 alias / classifier 规则。
 */
export function rebuildModelRegistryFromCanonicalModels(params: {
  readonly canonicalModels: Record<string, CanonicalModelRecord>
  readonly providers: ReadonlyArray<ProviderConfig>
  readonly openrouterLastSyncAt?: string
  readonly syncMeta?: ModelRegistryState['syncMeta']
}): ModelRegistryState {
  const aliasIndex = buildAliasIndex(params.canonicalModels)
  const { providerModelMap, providerScopedModels } = buildProviderMaps(
    params.providers,
    params.canonicalModels,
    aliasIndex,
  )

  return {
    schema: 2,
    generatedAt: new Date().toISOString(),
    ...(params.openrouterLastSyncAt ? { openrouterLastSyncAt: params.openrouterLastSyncAt } : {}),
    canonicalModels: params.canonicalModels,
    aliasIndex,
    providerModelMap,
    providerScopedModels,
    syncMeta: {
      ...(params.syncMeta ?? {}),
      ...(params.openrouterLastSyncAt ? { openrouterLastSyncAt: params.openrouterLastSyncAt } : {}),
      lastRebuildAt: new Date().toISOString(),
      lastRebuildSummary: `canonical=${Object.keys(params.canonicalModels).length}, alias=${Object.keys(aliasIndex).length}, providerMap=${Object.keys(providerModelMap).length}, scoped=${Object.keys(providerScopedModels).length}`,
    },
  }
}

/**
 * 由 seed evidence 与当前 Provider 配置构建完整 registry。
 */
export function buildModelRegistry(params: BuildRegistryParams): ModelRegistryState {
  const seedEvidences = params.seedEvidences.map((item) => sanitizeMetadataEvidence(item))
  const canonicalModels = buildCanonicalModels(seedEvidences)
  return rebuildModelRegistryFromCanonicalModels({
    canonicalModels,
    providers: params.providers,
    openrouterLastSyncAt: params.openrouterLastSyncAt,
    syncMeta: {
      seedEvidences,
      ...(params.openrouterLastSyncAt ? { openrouterLastSyncAt: params.openrouterLastSyncAt } : {}),
      ...(params.openrouterLastSyncStatus ? { openrouterLastSyncStatus: params.openrouterLastSyncStatus } : {}),
      ...(params.openrouterLastError ? { openrouterLastError: params.openrouterLastError } : {}),
    },
  })
}
