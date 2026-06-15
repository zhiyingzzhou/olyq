/**
 * 说明：`provider-runtime` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-runtime` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ResolveProviderRuntimeContextParams`、`ResolvedProviderRuntimeContext`、`resolveProviderRuntimeContext` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type {
  LanguageModelV3,
  RerankingModelV3,
  SpeechModelV3,
  TranscriptionModelV3,
} from '@ai-sdk/provider'
import type { EmbeddingModel, ImageModel } from 'ai'

import {
  createEmbeddingModel,
  createImageModel,
  createLanguageModel,
  createRerankModel,
  createSpeechModel,
  createTranscriptionModel,
  runModeration,
} from './provider-factory'
import { getProviderFast, loadProvidersFast } from './provider-read-fast'
import { splitModel } from './provider-model-id'
import { applyResolvedModelMetaToProviderConfig } from './provider-runtime-config'
import { getProviderNetworkHostMatchPatterns, resolveProviderNetworkBaseUrlForModel } from './provider-network-targets'
import { isLocalApiBase } from './api-host'
import { resolveModelMeta } from './model-registry/resolver'
import type { ResolvedModelMeta } from './model-registry/types'
import type { ProviderConfig } from './types'
import type { ProviderModerationResult } from './providers/adapter-types'
import { applyUserModelTypes } from './model-type-system'
import { I18nError } from '@/lib/i18n/error'
import { pickFirstApiKey, selectRotatedApiKeyForProvider } from './api-keys'

/**
 * 判断当前 provider 是否通过“非普通 apiKey”的替代鉴权配置完成认证。
 *
 * 说明：
 * - Bedrock 支持 API Key 或 IAM 两套配置；
 * - Vertex AI 使用 Service Account 或 express mode API Key；
 * - Vertex Anthropic 只能使用 Service Account；
 * - 返回值只用于“是否已配置鉴权”的前置校验，不代表网络连通性一定可用。
 */
function hasAltAuth(config: ProviderConfig): boolean {
  if (config.type === 'aws-bedrock') {
    const b = config.bedrock
    if (!b) return false
    if (b.authType === 'apiKey') return Boolean(pickFirstApiKey(b.apiKey || ''))
    if (b.authType === 'iam') {
      return Boolean(b.region && b.region.trim() && b.accessKeyId && b.accessKeyId.trim() && b.secretAccessKey && b.secretAccessKey.trim())
    }
    return false
  }

  if (config.type === 'vertexai' || config.type === 'vertex-anthropic') {
    const v = config.vertex
    if (!v) return false
    const hasServiceAccount = Boolean(
      v.authType === 'serviceAccount'
      && v.projectId?.trim()
      && v.location?.trim()
      && v.serviceAccount?.clientEmail?.trim()
      && v.serviceAccount?.privateKey?.trim(),
    )
    if (config.type === 'vertex-anthropic') return hasServiceAccount
    if (v.authType === 'apiKey') return Boolean(pickFirstApiKey(v.apiKey || ''))
    return hasServiceAccount
  }

  return false
}

/** 运行时 Provider 解析参数。 */
export interface ResolveProviderRuntimeContextParams {
  /** 完整模型标识，格式为 `providerId/modelId`。 */
  readonly model: string
  /** 可选：已提前解析好的模型元数据。 */
  readonly resolvedModelMeta?: ResolvedModelMeta
  /** 可选：覆盖默认读取到的 Provider 配置。 */
  readonly providerConfigOverride?: ProviderConfig
  /** 可选：显式覆盖 API Key 选择结果；提供时不会推进多 key 轮询游标。 */
  readonly apiKeyOverride?: string
}

/** 运行时 Provider 解析结果。 */
export interface ResolvedProviderRuntimeContext {
  /** 原始 Provider 配置。 */
  readonly config: ProviderConfig
  /** 已注入 registry 语义后的运行时 Provider 副本。 */
  readonly runtimeConfig: ProviderConfig
  /** 原始模型 ID。 */
  readonly modelId: string
  /** 最终用于调用的 API Key。 */
  readonly apiKey: string
  /** 最终用于调用的 API Host。 */
  readonly apiHost: string
  /** 已确认可用的模型元数据。 */
  readonly resolvedModelMeta: ResolvedModelMeta
}

/**
 * 解析运行时 Provider 上下文，并执行与真实调用一致的前置校验。
 *
 * 说明：
 * - 会复用 registry 真源解析 `resolvedModelMeta`；
 * - 会校验启用态、鉴权、transportProtocol 与 base URL；host access 由安装期 http/https 权限覆盖。
 * - `health-check` 与真实运行时都应复用这条链，避免出现两套前置逻辑。
 */
export async function resolveProviderRuntimeContext(
  params: ResolveProviderRuntimeContextParams,
): Promise<ResolvedProviderRuntimeContext> {
  const { providerId, modelId } = splitModel(params.model)

  const config = params.providerConfigOverride ?? await getProviderFast(providerId)
  if (!config) {
    throw new I18nError('errors.providerNotFound', { providerId })
  }
  if (!config.enabled) {
    throw new I18nError('errors.providerDisabled', { providerName: config.name })
  }

  const configuredModel = config.models?.find((item) => String(item?.id || '').trim() === modelId)
  const systemResolvedModelMeta = params.resolvedModelMeta ?? await resolveModelMeta({
    providerType: config.type,
    providerId,
    apiHost: config.apiHost,
    rawModelId: modelId,
    rawModelName: configuredModel?.name || modelId,
    transportProtocol: configuredModel?.transportProtocol,
  })
  const effectiveResolvedModelMeta = applyUserModelTypes(
    systemResolvedModelMeta,
    configuredModel?.manualModelTypes,
  )

  const apiKey = params.apiKeyOverride !== undefined
    ? pickFirstApiKey(params.apiKeyOverride)
    : await selectRotatedApiKeyForProvider(config.id, config.apiKey)
  const apiHost = String(config.apiHost || '').trim()

  const isLocal = isLocalApiBase(apiHost)
  if (!apiKey && !isLocal && !hasAltAuth(config)) {
    if (config.type === 'aws-bedrock') {
      throw new I18nError('errors.providerAuthMissingBedrock', { providerName: config.name })
    }
    if (config.type === 'vertexai' || config.type === 'vertex-anthropic') {
      throw new I18nError('errors.providerAuthMissingVertex', { providerName: config.name })
    }
    throw new I18nError('errors.providerApiKeyMissing', { providerName: config.name })
  }

  const runtimeConfig = applyResolvedModelMetaToProviderConfig(config, modelId, effectiveResolvedModelMeta)
  if (effectiveResolvedModelMeta.transportProtocol === 'unknown') {
    throw new I18nError('errors.modelTransportProtocolUnknown')
  }
  const networkBase = resolveProviderNetworkBaseUrlForModel(runtimeConfig, modelId)
  if (!networkBase) {
    throw new I18nError('errors.apiBaseUrlRequired')
  }

  const patterns = getProviderNetworkHostMatchPatterns(runtimeConfig, modelId)
  if (patterns.length === 0) {
    throw new I18nError('errors.apiBaseUrlContainsPlaceholder')
  }

  // 安装期普通 http/https host access 已覆盖 Provider API 请求；真实网络/鉴权失败由调用链返回。

  return {
    config,
    runtimeConfig,
    modelId,
    apiKey,
    apiHost,
    resolvedModelMeta: effectiveResolvedModelMeta,
  }
}

/**
 * 将 "providerId/modelId" 解析为 AI SDK LanguageModel。
 * 这是 `stream-chat.ts` 的主要入口。
 *
 * @throws 当 Provider 未找到或被禁用时抛错
 */
export async function resolveModel(model: string, resolvedModelMeta?: ResolvedModelMeta): Promise<LanguageModelV3> {
  const { runtimeConfig, modelId, apiKey, apiHost } = await resolveProviderRuntimeContext({
    model,
    resolvedModelMeta,
  })
  return await createLanguageModel({ ...runtimeConfig, apiKey, apiHost }, modelId)
}

/**
 * 将 "providerId/modelId" 解析为 AI SDK ImageModel。
 *
 * @throws 当 Provider 未找到、被禁用、未配置 Key 或不支持 image 时抛错
 */
export async function resolveImageModel(model: string, resolvedModelMeta?: ResolvedModelMeta): Promise<ImageModel> {
  const { runtimeConfig, modelId, apiKey, apiHost } = await resolveProviderRuntimeContext({
    model,
    resolvedModelMeta,
  })
  return await createImageModel({ ...runtimeConfig, apiKey, apiHost }, modelId)
}

/**
 * 将 "providerId/modelId" 解析为 AI SDK EmbeddingModel。
 *
 * 说明：
 * - 是否支持 embeddings 由 ProviderType 对应的 adapter 决定；
 * - 用于全局记忆等需要在线向量化的功能。
 *
 * @throws 当 Provider 未找到、被禁用、未配置 Key 或不支持 embeddings 时抛错
 */
export async function resolveEmbeddingModel(model: string, resolvedModelMeta?: ResolvedModelMeta): Promise<EmbeddingModel> {
  const { runtimeConfig, modelId, apiKey, apiHost } = await resolveProviderRuntimeContext({
    model,
    resolvedModelMeta,
  })
  return await createEmbeddingModel({ ...runtimeConfig, apiKey, apiHost }, modelId)
}

/**
 * 将 "providerId/modelId" 解析为 AI SDK RerankingModel。
 *
 * @throws 当 Provider 未找到、被禁用、未配置 Key 或不支持 rerank 时抛错
 */
export async function resolveRerankModel(model: string, resolvedModelMeta?: ResolvedModelMeta): Promise<RerankingModelV3> {
  const { runtimeConfig, modelId, apiKey, apiHost } = await resolveProviderRuntimeContext({
    model,
    resolvedModelMeta,
  })
  return await createRerankModel({ ...runtimeConfig, apiKey, apiHost }, modelId)
}

/**
 * 将 "providerId/modelId" 解析为 AI SDK TranscriptionModel。
 *
 * @throws 当 Provider 未找到、被禁用、未配置 Key 或不支持 transcription 时抛错
 */
export async function resolveTranscriptionModel(model: string, resolvedModelMeta?: ResolvedModelMeta): Promise<TranscriptionModelV3> {
  const { runtimeConfig, modelId, apiKey, apiHost } = await resolveProviderRuntimeContext({
    model,
    resolvedModelMeta,
  })
  return await createTranscriptionModel({ ...runtimeConfig, apiKey, apiHost }, modelId)
}

/**
 * 将 "providerId/modelId" 解析为 AI SDK SpeechModel。
 *
 * @throws 当 Provider 未找到、被禁用、未配置 Key 或不支持 speech 时抛错
 */
export async function resolveSpeechModel(model: string, resolvedModelMeta?: ResolvedModelMeta): Promise<SpeechModelV3> {
  const { runtimeConfig, modelId, apiKey, apiHost } = await resolveProviderRuntimeContext({
    model,
    resolvedModelMeta,
  })
  return await createSpeechModel({ ...runtimeConfig, apiKey, apiHost }, modelId)
}

/**
 * 使用正式 provider runtime 主干执行一次内容审核。
 */
export async function runModerationCheck(params: {
  model: string
  input: string
  resolvedModelMeta?: ResolvedModelMeta
  signal?: AbortSignal
}): Promise<ProviderModerationResult> {
  const { runtimeConfig, modelId, apiKey, apiHost } = await resolveProviderRuntimeContext({
    model: params.model,
    resolvedModelMeta: params.resolvedModelMeta,
  })
  return await runModeration({ ...runtimeConfig, apiKey, apiHost }, modelId, params.input, params.signal)
}

/** 判断解析后的模型是否属于可承担默认聊天任务的聊天主类。 */
function isChatLikeResolvedModel(meta: ResolvedModelMeta): boolean {
  return meta.kind === 'chat' || meta.kind === 'multimodal-chat' || meta.kind === 'audio-chat'
}

/**
 * 选择当前运行时默认聊天模型。
 *
 * 规则：
 * - 只在已启用 Provider 中挑选；
 * - 只接受 registry 明确解析为聊天类（chat / multimodal-chat / audio-chat）的模型；
 * - 优先当前 Provider 内标记为 `isDefault` 的聊天模型，再回退到该 Provider 的首个聊天模型；
 * - 不再把 embedding / rerank / image-generation / unknown 当作默认聊天模型。
 */
export async function getDefaultModelId(): Promise<string> {
  const all = await loadProvidersFast()
  for (const p of all) {
    if (!p.enabled || !p.models?.length) continue

    const sortedModels = [
      ...p.models.filter((model) => model.isDefault),
      ...p.models.filter((model) => !model.isDefault),
    ]

    for (const model of sortedModels) {
      const modelId = String(model?.id || '').trim()
      if (!modelId) continue
      const systemResolvedModelMeta = await resolveModelMeta({
        providerType: p.type,
        providerId: p.id,
        apiHost: p.apiHost,
        rawModelId: modelId,
        rawModelName: model.name || modelId,
      })
      const resolvedModelMeta = applyUserModelTypes(
        systemResolvedModelMeta,
        model.manualModelTypes,
      )
      if (!isChatLikeResolvedModel(resolvedModelMeta)) continue
      if (resolvedModelMeta.transportProtocol === 'unknown') continue
      return `${p.id}/${modelId}`
    }
  }
  throw new I18nError('errors.noAvailableModels')
}
