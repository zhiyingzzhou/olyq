/**
 * 说明：`resolver` AI 能力模块。
 *
 * 职责：
 * - 承载 `resolver` 相关的当前文件实现与模块边界；
 * - 对外暴露 `resolveModelMetaFromRegistry`、`resolveModelMeta` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型注册表解析入口。
 *
 * 说明：
 * - 优先读取 registry 已存在的 providerMap / aliasIndex；
 * - 未命中时直接走统一 `model-type-system` fallback；
 * - 不再回读任何历史手工维护数据，也不再输出旧的“补录”提示文案。
 */

import { resolveSystemModelType, toModelCapabilities, type OpenRouterBaseline } from '../model-type-system'
import { normalizeSupportedParameters } from '../model-request-parameters'
import { buildProviderModelMapKey, buildScopedCanonicalId, extractBaseModelKey } from './identity'
import { resolveCanonicalLookup } from './lookup'
import { loadModelRegistryFast } from './storage-lite'
import type {
  ModelScope,
  ModelRegistryState,
  ProviderModelRecord,
  ResolveModelMetaInput,
  ResolvedModelMeta,
} from './types'
import type { ResolverTrace, ResolverTraceStep } from './trace'

/** 向解析 trace 中追加一步，统一记录阶段名称、说明和可选细节。 */
function pushTrace(steps: ResolverTraceStep[], type: ResolverTraceStep['type'], message: string, detail?: unknown): void {
  steps.push({ type, message, ...(detail !== undefined ? { detail } : {}) })
}

/** 判断 `apiHost` 是否指向本地回环地址，用于推导 fallback scope。 */
function isLocalApiHost(apiHost?: string): boolean {
  const raw = String(apiHost || '').trim()
  if (!raw) return false
  try {
    const url = new URL(raw)
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  } catch {
    return false
  }
}

/**
 * 为未命中 registry 的模型推导 scoped fallback 的归属范围。
 *
 * 规则：
 * - `ollama` 一律归到 `local`
 * - 其余 provider 若 `apiHost` 指向本机回环地址，也视作本地能力
 * - 其它情况都归到普通 provider 作用域
 */
function resolveFallbackScope(providerType?: string, apiHost?: string): ModelScope {
  return providerType === 'ollama' || isLocalApiHost(apiHost) ? 'local' : 'provider'
}

/** 从可能包含显式列表的记录中读取 provider/model scoped 请求参数能力。 */
function pickSupportedParameters(
  ...items: ReadonlyArray<ReadonlyArray<string> | undefined>
): ReadonlyArray<string> | undefined {
  for (const item of items) {
    const normalized = normalizeSupportedParameters(item)
    if (normalized !== undefined) return normalized
  }
  return undefined
}

/**
 * 从 OpenRouter seed 中按 providerId + rawModelId 精确回填请求参数能力。
 *
 * 说明：
 * - `supported_parameters` 是 OpenRouter 模型作用域事实，不能扩散到其它中转站；
 * - 因此这里只在当前 providerId 明确为 `openrouter` 且 raw id 精确匹配时使用。
 */
function findOpenRouterSeedSupportedParameters(
  registry: ModelRegistryState | undefined,
  input: ResolveModelMetaInput,
): ReadonlyArray<string> | undefined {
  if (String(input.providerId || '').trim() !== 'openrouter') return undefined
  const rawModelId = String(input.rawModelId || '').trim()
  if (!rawModelId) return undefined

  for (const evidence of registry?.syncMeta.seedEvidences ?? []) {
    const matchesRawModelId = String(evidence.rawModelId || '').trim() === rawModelId
    const matchesReference = (evidence.references ?? []).some((ref) => (
      ref.system === 'openrouter'
      && ref.refType === 'model-id'
      && String(ref.value || '').trim() === rawModelId
    ))
    if (!matchesRawModelId && !matchesReference) continue
    const supportedParameters = normalizeSupportedParameters(evidence.supportedParameters)
    if (supportedParameters !== undefined) return supportedParameters
  }

  return undefined
}

/** 按运行时输入、本地 providerMap/scoped record、OpenRouter seed 的顺序解析参数能力真源。 */
function resolveSupportedParametersForResult(args: {
  registry?: ModelRegistryState
  input: ResolveModelMetaInput
  providerRecord?: Pick<ProviderModelRecord, 'supportedParameters'>
  scopedRecord?: { readonly supportedParameters?: ReadonlyArray<string> }
}): ReadonlyArray<string> | undefined {
  return pickSupportedParameters(
    args.input.supportedParameters,
    args.providerRecord?.supportedParameters,
    args.scopedRecord?.supportedParameters,
    findOpenRouterSeedSupportedParameters(args.registry, args.input),
  )
}

/**
 * 基于统一模型类型系统构造 fallback 解析结果。
 *
 * 说明：
 * - 当 registry 没有 provider-map、alias 或 provider-path 命中时，会退到这里。
 * - 该结果不会回写 registry，只作为本次运行时的即时语义推断结果。
 */
function buildResolvedFromFallback(
  input: ResolveModelMetaInput,
  registry?: ModelRegistryState,
  trace?: ResolverTrace,
): ResolvedModelMeta {
  const semantic = resolveSystemModelType({
    providerType: input.providerType,
    providerId: input.providerId,
    rawModelId: input.rawModelId,
    rawModelName: input.rawModelName,
    transportProtocol: input.transportProtocol,
    kindHint: input.kindHint,
    providerCatalogTypeHint: input.providerCatalogTypeHint,
    inputModalities: input.inputModalities,
    outputModalities: input.outputModalities,
    features: input.features,
    references: input.references,
  })
  const scope = resolveFallbackScope(input.providerType, input.apiHost)
  const canonicalId = buildScopedCanonicalId(
    scope === 'local' ? 'local' : 'provider',
    input.providerType || 'unknown',
    input.providerId || 'unknown',
    input.rawModelId || input.rawModelName || 'unknown',
  )
  const supportedParameters = resolveSupportedParametersForResult({ registry, input })
  return {
    canonicalId,
    baseModelKey: extractBaseModelKey(input.rawModelId || input.rawModelName || 'unknown'),
    scope,
    kind: semantic.kind,
    inputModalities: semantic.inputModalities,
    outputModalities: semantic.outputModalities,
    features: semantic.features,
    transportProtocol: semantic.transportProtocol,
    displayName: input.rawModelName || input.rawModelId || 'AI',
    confidence: semantic.sources.includes('openrouter-baseline') || semantic.sources.includes('provider-explicit-fallback')
      ? 'high'
      : semantic.kind === 'unknown'
        ? 'low'
        : 'medium',
    ...(supportedParameters !== undefined ? { supportedParameters } : {}),
    ...(trace ? { trace } : {}),
  }
}

/**
 * 将 providerMap 命中记录还原成最终的 `ResolvedModelMeta`。
 *
 * 说明：
 * - 若命中公共 canonical，会以 canonical 元数据为基线再叠加系统规则。
 * - 若命中 providerScopedModels，则直接复用该 scoped 记录。
 * - 两者都不存在时，说明 registry 记录已失配，最终回退到 fallback 推断。
 */
function toResolvedFromProviderMap(
  record: ProviderModelRecord,
  registry: ModelRegistryState,
  input: ResolveModelMetaInput,
  trace?: ResolverTrace,
): ResolvedModelMeta {
  const canonical = registry.canonicalModels[record.canonicalId]
  if (canonical) {
    const supportedParameters = resolveSupportedParametersForResult({
      registry,
      input,
      providerRecord: record,
    })
    const openrouterBaseline: OpenRouterBaseline = {
      kind: canonical.kind,
      inputModalities: canonical.inputModalities,
      outputModalities: canonical.outputModalities,
      capabilities: toModelCapabilities(canonical.features),
      displayName: canonical.displayName,
    }
    const semantic = resolveSystemModelType({
      providerType: input.providerType,
      providerId: input.providerId,
        rawModelId: input.rawModelId,
        rawModelName: input.rawModelName || canonical.displayName,
        transportProtocol: record.transportProtocol,
        kindHint: input.kindHint,
        providerCatalogTypeHint: input.providerCatalogTypeHint,
        inputModalities: input.inputModalities,
        outputModalities: input.outputModalities,
        features: input.features,
      references: canonical.references,
    }, { openrouterBaseline })
    return {
      canonicalId: canonical.canonicalId,
      baseModelKey: canonical.baseModelKey,
      scope: canonical.scope,
      kind: semantic.kind,
      inputModalities: semantic.inputModalities,
      outputModalities: semantic.outputModalities,
      features: semantic.features,
      transportProtocol: semantic.transportProtocol,
      displayName: canonical.displayName,
      ...(canonical.description ? { description: canonical.description } : {}),
      confidence: canonical.confidence,
      ...(supportedParameters !== undefined ? { supportedParameters } : {}),
      ...(trace ? { trace } : {}),
    }
  }

  const scoped = registry.providerScopedModels[record.canonicalId]
  if (scoped) {
    const supportedParameters = resolveSupportedParametersForResult({
      registry,
      input,
      providerRecord: record,
      scopedRecord: scoped,
    })
    return {
      canonicalId: scoped.canonicalId,
      baseModelKey: scoped.baseModelKey,
      scope: scoped.scope,
      kind: scoped.kind,
      inputModalities: scoped.inputModalities,
      outputModalities: scoped.outputModalities,
      features: scoped.features,
      transportProtocol: scoped.transportProtocol,
      displayName: scoped.displayName,
      confidence: scoped.confidence,
      ...(supportedParameters !== undefined ? { supportedParameters } : {}),
      ...(trace ? { trace } : {}),
    }
  }

  return buildResolvedFromFallback(input, registry, trace)
}

/**
 * 基于现有 registry 同步解析模型。
 */
export function resolveModelMetaFromRegistry(
  registry: ModelRegistryState,
  input: ResolveModelMetaInput,
  options?: { withTrace?: boolean },
): ResolvedModelMeta {
  const steps: ResolverTraceStep[] = []
  const withTrace = Boolean(options?.withTrace)
  pushTrace(steps, 'input', '收到模型解析输入', input)

  const providerType = String(input.providerType || '').trim()
  const providerId = String(input.providerId || '').trim()
  const rawModelId = String(input.rawModelId || '').trim()

  const providerMapKey = providerType
    ? buildProviderModelMapKey(providerType, providerId, rawModelId)
    : ''
  pushTrace(steps, 'normalize', '生成 providerMapKey', providerMapKey)

  const providerMapHit = providerMapKey ? registry.providerModelMap[providerMapKey] : undefined
  if (providerMapHit) {
    pushTrace(steps, 'provider-map-hit', '命中 providerModelMap', providerMapHit)
    if (providerMapHit.resolvedBy === 'base-model-alias') {
      pushTrace(steps, 'base-model-alias-hit', 'providerModelMap 记录显示该模型是通过基础模型键归并命中的', {
        rawModelId,
        baseModelKey: extractBaseModelKey(rawModelId),
      })
    } else if (providerMapHit.resolvedBy === 'alias-index') {
      pushTrace(steps, 'alias-hit', 'providerModelMap 记录显示该模型是通过 raw alias 命中的', {
        rawModelId,
      })
    }
    const trace = withTrace ? { steps } satisfies ResolverTrace : undefined
    return toResolvedFromProviderMap(providerMapHit, registry, input, trace)
  }

  const lookup = resolveCanonicalLookup({
    providerType,
    providerId,
    rawModelId,
    aliasIndex: registry.aliasIndex,
    canonicalModels: registry.canonicalModels,
  })
  if (lookup.matchedAlias && lookup.canonicalId) {
    pushTrace(
      steps,
      lookup.resolvedBy === 'base-model-alias' ? 'base-model-alias-hit' : 'alias-hit',
      lookup.resolvedBy === 'base-model-alias' ? '通过基础模型键命中 aliasIndex' : '命中 aliasIndex',
      {
        aliasKey: lookup.matchedAliasKey,
        alias: lookup.matchedAlias,
        baseModelKey: lookup.baseModelKey,
      },
    )
    const trace = withTrace ? { steps } satisfies ResolverTrace : undefined
    const record: ProviderModelRecord = {
      providerType,
      providerId,
      rawModelId,
      canonicalId: lookup.canonicalId,
      transportProtocol: resolveSystemModelType({
        providerType,
        providerId,
        rawModelId,
        rawModelName: input.rawModelName,
        transportProtocol: input.transportProtocol,
        kindHint: input.kindHint,
        providerCatalogTypeHint: input.providerCatalogTypeHint,
        inputModalities: input.inputModalities,
        outputModalities: input.outputModalities,
        features: input.features,
        references: input.references,
      }).transportProtocol,
      resolvedBy: lookup.resolvedBy,
    }
    return toResolvedFromProviderMap(record, registry, input, trace)
  }

  if (lookup.resolvedBy === 'provider-path' && lookup.canonicalId) {
    pushTrace(steps, 'provider-rule', 'rawModelId 通过 provider-path 回推到公共 canonical', {
      rawModelId,
      baseModelKey: lookup.baseModelKey,
      canonicalId: lookup.canonicalId,
    })
    const trace = withTrace ? { steps } satisfies ResolverTrace : undefined
    const record: ProviderModelRecord = {
      providerType,
      providerId,
      rawModelId,
      canonicalId: lookup.canonicalId,
      transportProtocol: resolveSystemModelType({
        providerType,
        providerId,
        rawModelId,
        rawModelName: input.rawModelName,
        transportProtocol: input.transportProtocol,
        kindHint: input.kindHint,
        providerCatalogTypeHint: input.providerCatalogTypeHint,
        inputModalities: input.inputModalities,
        outputModalities: input.outputModalities,
        features: input.features,
        references: input.references,
      }).transportProtocol,
      resolvedBy: 'provider-path',
    }
    return toResolvedFromProviderMap(record, registry, input, trace)
  }

  pushTrace(steps, 'scoped-fallback', '未命中 registry，改走统一自动语义分类器', {
    providerType,
    providerId,
    rawModelId,
    baseModelKey: lookup.baseModelKey,
  })
  const trace = withTrace ? { steps } satisfies ResolverTrace : undefined
  return buildResolvedFromFallback(input, registry, trace)
}

/**
 * 异步解析模型元数据。
 */
export async function resolveModelMeta(
  input: ResolveModelMetaInput,
  options?: { withTrace?: boolean },
): Promise<ResolvedModelMeta> {
  const registry = await loadModelRegistryFast()
  return resolveModelMetaFromRegistry(registry, input, options)
}
