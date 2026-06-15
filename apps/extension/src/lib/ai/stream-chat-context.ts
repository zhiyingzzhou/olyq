/**
 * 说明：`stream-chat-context` AI 能力模块。
 *
 * 职责：
 * - 承载 `stream-chat-context` 相关的当前文件实现与模块边界；
 * - 对外暴露 `StreamContext`、`resolveStreamContext`、`buildProviderOptions` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：stream-chat 上下文解析与参数构建。
 *
 * 从 stream-chat.ts 的 streamChat() 函数中拆分出：
 * - resolveStreamContext：Provider/Model 解析
 * - buildProviderOptions：providerOptions 构建
 * - buildCallSettings：通用 call settings（temperature/topP/maxTokens 等）构建
 *
 * 保持行为不变。
 */

import type { JSONObject, SharedV3ProviderOptions, LanguageModelV3 } from '@ai-sdk/provider'
import type { LanguageModelMiddleware } from 'ai'
import { splitModel } from './provider-model-id'
import { getProviderView } from './provider-storage'
import { resolveModel } from './provider-runtime'
import type { ModelCallParamsBase, ProviderType, ProviderConfig, ProviderModelConfig } from './types'
import { getCallSettingSupport } from './model-call-settings'
import { parseCanonicalId, resolveModelMeta, type ResolvedModelMeta } from './model-registry'
import { isPlainRecord } from '@/lib/utils/type-guards'
import { hasInjectedMcpTools as hasInjectedMcpToolsInToolSet } from '@/lib/mcp/toolname'
import { isJsonValue } from './stream-chat-debug'
import { isKnownUnsupportedOpenAiResponsesStoreTarget } from './openai-responses-store-capability'
import {
  resolveProviderReasoningDescriptor,
} from './provider-reasoning'
import {
  resolveEffectiveProviderType,
  getProviderOptionsKey,
  getOpenAiCompatibleProviderKey,
} from './stream-chat-utils'
import { loadAdapter } from './providers/load-adapter'
import type {
  ChatExecutionMode,
  ProviderAdapter,
  ProviderOptionsContext,
  MiddlewareContext,
  ProviderOptionsPatch,
  ProviderRequestShapePolicy,
  RequestShapePolicyContext,
} from './providers/adapter-types'
import {
  resolveProviderContract,
  filterProviderOptionsByContract,
  providerContractAllowsOption,
  type ProviderContract,
  type ProviderContractOptionKey,
} from './providers/provider-contracts'
import { I18nError } from '@/lib/i18n/error'
import {
  filterProviderOptionsBySupportedParameters,
  resolveToolParameterSupport,
  type SupportedRequestParameters,
  type ToolParameterSupport,
} from './model-request-parameters'

/** buildProviderOptions 的运行时动态输入。 */
export interface ProviderOptionsRuntimeParams {
  /** 当前最终注入的工具集合里是否包含 MCP 工具。 */
  hasInjectedMcpTools?: boolean
  /** OpenAI Responses 自动 `store` 的最终稳定值。 */
  openAiResponsesStoreValue?: boolean
}

/**
 * 判断当前调用是否命中 OpenAI Responses 自动 `store` 策略。
 *
 * 作用范围：
 * - 官方 `openai-response`
 * - `new-api` 中最终降到 `openai-response` 的模型
 * - `gateway` 中 transportProtocol 明确为 `openai-responses` 的模型
 */
function shouldApplyOpenAiResponsesStoreAutoStrategy(
  ctx: Pick<StreamContext, 'providerType' | 'effectiveProviderType' | 'resolvedModelMeta'>,
): boolean {
  if (ctx.effectiveProviderType === 'openai-response') return true
  return ctx.providerType === 'gateway' && ctx.resolvedModelMeta.transportProtocol === 'openai-responses'
}

/** 读取当前 provider/model scoped 的显式请求参数支持列表。 */
function getRuntimeSupportedParameters(ctx: Pick<StreamContext, 'resolvedModelMeta' | 'modelConfig'>): SupportedRequestParameters | undefined {
  return ctx.resolvedModelMeta.supportedParameters ?? ctx.modelConfig?.supportedParameters
}

/** 从 canonical 或显式 `creator/model` 形态中读取上游模型提供方。 */
function resolveExplicitModelProviderSlug(ctx: Pick<StreamContext, 'modelId' | 'resolvedModelMeta'>): string | null {
  const modelId = String(ctx.modelId || '').trim().toLowerCase()
  const slashIndex = modelId.indexOf('/')
  if (slashIndex > 0) return modelId.slice(0, slashIndex)

  const parsed = parseCanonicalId(ctx.resolvedModelMeta.canonicalId)
  if (parsed?.scope === 'public' && parsed.vendorSlug) return parsed.vendorSlug

  return null
}

/** 计算本轮 SDK/provider 已确认可消费的 providerOptions 命名空间。 */
function resolveProviderOptionNamespaces(ctx: Pick<StreamContext, 'providerOptionsKey' | 'resolvedModelMeta' | 'modelId'>): ReadonlyArray<string> {
  const namespaces = new Set<string>()
  if (ctx.providerOptionsKey) namespaces.add(ctx.providerOptionsKey)
  if (
    ctx.resolvedModelMeta.transportProtocol === 'openai-responses'
    && resolveExplicitModelProviderSlug(ctx) === 'openai'
  ) {
    namespaces.add('openai')
  }
  return Array.from(namespaces)
}

/** resolveStreamContext 返回的上下文对象 */
export interface StreamContext {
  /** Provider ID（来自 `providerId/modelId` 的前半段）。 */
  providerId: string
  /** 模型 ID（来自 `providerId/modelId` 的后半段）。 */
  modelId: string
  /** Provider 配置；理论上在 resolve 成功后必定存在。 */
  providerConfig: ProviderConfig | null
  /** Provider 显式声明的类型。 */
  providerType: ProviderType | undefined
  /** 结合 registry transportProtocol 后的实际生效 Provider 类型。 */
  effectiveProviderType: ProviderType | undefined
  /** providerOptions 命名空间 key。 */
  providerOptionsKey: string | null
  /** OpenAI-compatible provider passthrough 使用的命名空间 key。 */
  openaiCompatibleProviderKey: string | null
  /** 当前模型在 ProviderConfig 中的本地配置。 */
  modelConfig: ProviderModelConfig | undefined
  /** 从 registry 解析出的模型真源元数据。 */
  resolvedModelMeta: ResolvedModelMeta
  /** 便于快速判断 capability 的特性集合。 */
  featureKeys: Set<string>
  /** 当前 provider/model 的契约真源。 */
  providerContract: ProviderContract
}

/**
 * 内部函数：`loadStreamAdapter`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function loadStreamAdapter(ctx: Pick<StreamContext, 'effectiveProviderType' | 'providerType'>): Promise<ProviderAdapter | undefined> {
  const adapterType = ctx.effectiveProviderType ?? ctx.providerType
  return adapterType ? await loadAdapter(adapterType) : undefined
}

/**
 * 解析 Provider/Model 上下文信息。
 *
 * 从 params.model 中拆分 providerId/modelId，
 * 加载 ProviderConfig 并计算 effectiveProviderType、providerOptionsKey、resolvedModelMeta 等。
 */
export async function resolveStreamContext(params: ModelCallParamsBase): Promise<StreamContext> {
  const { providerId, modelId } = splitModel(params.model)

  const providerConfig = await getProviderView(providerId)
  if (!providerConfig) {
    throw new I18nError('errors.providerNotFound', { providerId })
  }
  if (!providerConfig.enabled) {
    throw new I18nError('errors.providerDisabled', { providerName: providerConfig.name })
  }
  const providerType = providerConfig?.type
  const modelConfig = providerConfig?.models?.find((m) => m.id === modelId)
  const resolvedModelMeta = await resolveModelMeta({
    providerType,
    providerId,
    apiHost: providerConfig?.apiHost,
    rawModelId: modelId,
    rawModelName: modelConfig?.name || modelId,
    transportProtocol: modelConfig?.transportProtocol,
    supportedParameters: modelConfig?.supportedParameters,
  })
  const effectiveProviderType = resolveEffectiveProviderType({
    providerId,
    providerType,
    transportProtocol: resolvedModelMeta.transportProtocol,
  })

  const providerOptionsKey = getProviderOptionsKey({
    providerId,
    providerType,
    effectiveProviderType,
  })
  const openaiCompatibleProviderKey = getOpenAiCompatibleProviderKey({
    providerId,
    providerType,
    effectiveProviderType,
  })

  const featureKeys = new Set(
    resolvedModelMeta.features.map((feature) => String(feature || '').trim().toLowerCase()),
  )
  const providerContract = resolveProviderContract({
    providerId,
    providerType,
    effectiveProviderType,
    transportProtocol: resolvedModelMeta.transportProtocol,
  })

  return {
    providerId,
    modelId,
    providerConfig,
    providerType,
    effectiveProviderType,
    providerOptionsKey,
    openaiCompatibleProviderKey,
    modelConfig,
    resolvedModelMeta,
    featureKeys,
    providerContract,
  }
}

/**
 * 构建 providerOptions（SharedV3ProviderOptions）。
 *
 * 委托给 ProviderAdapter.buildProviderOptions() 构建 provider-specific 选项，
 * 再合并通用的 passthrough model params。
 */
export async function buildProviderOptions(
  ctx: StreamContext,
  params: ModelCallParamsBase,
  adapterOverride?: ProviderAdapter,
  runtimeParams: ProviderOptionsRuntimeParams = {},
): Promise<SharedV3ProviderOptions | undefined> {
  const {
    providerId,
    providerConfig,
    providerType,
    effectiveProviderType,
    providerOptionsKey,
    openaiCompatibleProviderKey,
    featureKeys,
    modelId,
    providerContract,
  } = ctx

  const enableGenerateImage = Boolean(params.enableGenerateImage)
  const supportsInlineImage = featureKeys.has('image-output')
  const wantsInlineImage = enableGenerateImage && supportsInlineImage

  if (enableGenerateImage && !supportsInlineImage) {
    throw new I18nError('errors.inlineImageNotSupportedByModel')
  }

  if (
    wantsInlineImage
    && !providerContractAllowsOption(providerContract, 'modalities')
    && !providerContractAllowsOption(providerContract, 'responseModalities')
  ) {
    throw new I18nError('errors.inlineImageNotSupportedByProviderType', { providerType: String(effectiveProviderType || providerType) })
  }

  // 1. 委托给 adapter 构建 provider-specific 选项
  let providerOptions: SharedV3ProviderOptions | undefined
  const adapter = adapterOverride ?? await loadStreamAdapter(ctx)
  if (adapter?.buildProviderOptions && providerConfig) {
    const reasoning = resolveProviderReasoningDescriptor({
      model: params.model,
      transportProtocol: ctx.resolvedModelMeta.transportProtocol,
      modelParams: isPlainRecord(params.modelParams) ? params.modelParams : undefined,
    })
    const adapterCtx: ProviderOptionsContext = {
      providerId,
      modelId,
      effectiveProviderType: effectiveProviderType || '',
      contract: providerContract,
      transportProtocol: ctx.resolvedModelMeta.transportProtocol,
      providerOptionsKey,
      openaiCompatibleProviderKey,
      config: providerConfig,
      params: {
        enableGenerateImage: wantsInlineImage,
        enableWebSearch: Boolean(params.enableWebSearch),
        hasInjectedMcpTools: runtimeParams.hasInjectedMcpTools,
        openAiResponsesStoreValue: runtimeParams.openAiResponsesStoreValue,
        modelParams: isPlainRecord(params.modelParams) ? params.modelParams : undefined,
        reasoning,
      },
    }
    const adapterOpts = adapter.buildProviderOptions(adapterCtx)
    if (adapterOpts) {
      providerOptions = filterProviderOptionsByContract({
        contract: providerContract,
        providerOptionsKey,
        providerOptions: adapterOpts,
      }) as SharedV3ProviderOptions | undefined
    }
  }

  // 兜底：请求了内联生图但 adapter 未处理（providerOptionsKey 为 null 等）
  if (wantsInlineImage && !providerOptions) {
    if (!providerOptionsKey) {
      throw new I18nError('errors.inlineImageNotSupportedByProviderType', { providerType: String(effectiveProviderType || providerType) })
    }
    throw new I18nError('errors.inlineImageProviderOptionsNamespaceMissing')
  }

  // 2. 通用 passthrough model params（按 provider contract + providerOptions namespace 透传）
  const rawModelParams = isPlainRecord(params.modelParams) ? params.modelParams : {}
  const modelParams: Record<string, unknown> = rawModelParams

  const mappedKeys = new Set([
    'temperature',
    'top_p',
    'max_tokens',
    'top_k',
    'presence_penalty',
    'frequency_penalty',
    'seed',
    'stop',
    'reasoning_effort',
    'reasoning',
    'thinkingConfig',
    'thinking',
    'enable_thinking',
    'thinking_budget',
    'think',
    'reasoningConfig',
    'store',
  ])
  const passthrough: JSONObject = {}
  for (const [k, v] of Object.entries(modelParams)) {
    if (mappedKeys.has(k)) continue
    if (v === undefined || v === null) continue
    if (!providerContract.allowedProviderOptions.includes(k as ProviderContractOptionKey)) continue
    if (!isJsonValue(v)) continue
    passthrough[k] = v
  }
  if (providerOptionsKey && Object.keys(passthrough).length > 0) {
    providerOptions = providerOptions ?? {}
    const cur = providerOptions[providerOptionsKey]
    const curObj: JSONObject = isPlainRecord(cur) ? (cur as JSONObject) : {}
    providerOptions[providerOptionsKey] = { ...curObj, ...passthrough }
  }

  return filterProviderOptionsBySupportedParameters(providerOptions, getRuntimeSupportedParameters(ctx))
}

/** buildCallSettings 返回的结构 */
export interface CallSettings {
  /** 温度参数。 */
  temperature?: number
  /** Top-p 参数。 */
  topP?: number
  /** 最大输出 token 数。 */
  maxOutputTokens?: number
  /** Top-k 参数。 */
  topK?: number
  /** presence penalty。 */
  presencePenalty?: number
  /** frequency penalty。 */
  frequencyPenalty?: number
  /** 采样随机种子。 */
  seed?: number
  /** 停止序列列表。 */
  stopSequences?: string[]
}

/**
 * 从 params.modelParams 和 params 中提取通用 call settings。
 *
 * 按 provider/model 的 call-setting 支持情况做“尽力而为”注入。
 */
export async function buildCallSettings(
  ctx: StreamContext,
  params: ModelCallParamsBase,
): Promise<CallSettings> {
  const { providerId, providerConfig, modelId, effectiveProviderType, providerType, resolvedModelMeta } = ctx

  const rawModelParams = isPlainRecord(params.modelParams) ? params.modelParams : {}
  const modelParams: Record<string, unknown> = rawModelParams
  const reasoning = resolveProviderReasoningDescriptor({
    model: params.model,
    transportProtocol: resolvedModelMeta.transportProtocol,
    modelParams,
  })

  /**
   * 从未知值中提取有限数字。
   *
   * 说明：
   * - 这里只接受真正的有限 number，`NaN/Infinity/字符串数字` 都会被丢弃；
   * - 用于从 `modelParams` 安全读取可映射到 call settings 的数值字段。
   */
  const pickFinite = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  const temperatureOverride = pickFinite(modelParams.temperature)
  const topPOverride = pickFinite(modelParams.top_p)
  const maxTokensOverride = pickFinite(modelParams.max_tokens)
  const topKOverride = pickFinite(modelParams.top_k)
  const presencePenalty = pickFinite(modelParams.presence_penalty)
  const frequencyPenalty = pickFinite(modelParams.frequency_penalty)
  const seedRaw = pickFinite(modelParams.seed)
  const seed = seedRaw !== undefined ? Math.floor(seedRaw) : undefined
  const stopRaw = modelParams.stop
  const stopSequences = Array.isArray(stopRaw)
    ? (stopRaw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()))
    : typeof stopRaw === 'string' && stopRaw.trim().length > 0
      ? [stopRaw.trim()]
      : undefined

  const effectiveType: ProviderType | undefined = effectiveProviderType || providerType
  const support = await getCallSettingSupport({
    providerId,
    config: providerConfig,
    modelId,
    effectiveProviderType: effectiveType,
    transportProtocol: resolvedModelMeta.transportProtocol,
    reasoning,
    supportedParameters: getRuntimeSupportedParameters(ctx),
  })

  const settings: CallSettings = {}

  if (support.temperature) settings.temperature = temperatureOverride ?? params.temperature
  if (support.topP) settings.topP = topPOverride ?? params.topP
  if (support.maxTokens) settings.maxOutputTokens = maxTokensOverride ?? params.maxTokens
  if (support.topK && topKOverride !== undefined) settings.topK = topKOverride
  if (support.presencePenalty && presencePenalty !== undefined) settings.presencePenalty = presencePenalty
  if (support.frequencyPenalty && frequencyPenalty !== undefined) settings.frequencyPenalty = frequencyPenalty
  if (support.seed && seed !== undefined) settings.seed = seed
  if (support.stop && stopSequences && stopSequences.length > 0) settings.stopSequences = stopSequences

  return settings
}

/** 统一运行时调用计划。 */
export interface RuntimeCallPlan {
  /** 当前调用上下文。 */
  readonly context: StreamContext
  /** 已按 registry 真源解析好的语言模型实例。 */
  readonly languageModel: LanguageModelV3
  /** provider-specific 选项。 */
  readonly providerOptions?: SharedV3ProviderOptions
  /** adapter 声明的请求体形态策略；runtime 只消费策略，不反向猜 provider。 */
  readonly requestShapePolicy?: ProviderRequestShapePolicy
  /** 通用 call settings。 */
  readonly callSettings: CallSettings
  /** 需要包裹到语言模型上的中间件。 */
  readonly middlewares: ReadonlyArray<LanguageModelMiddleware>
  /** 最终执行模式。 */
  readonly executionMode: ChatExecutionMode
  /** 是否请求对话内联生图。 */
  readonly wantsInlineImage: boolean
  /** 该模型是否声明支持 image-output。 */
  readonly supportsInlineImage: boolean
  /** 本轮最终注入的工具集合里是否包含 MCP 工具。 */
  readonly hasInjectedMcpTools: boolean
  /** 当前模型显式能力下允许的工具参数集合。 */
  readonly toolParameterSupport: ToolParameterSupport
  /** 是否命中 OpenAI Responses 自动 `store` 策略。 */
  readonly openAiResponsesStoreAutoStrategyApplied: boolean
  /** OpenAI Responses 自动 `store` 的最终值；未命中策略时为空。 */
  readonly openAiResponsesStoreValue?: boolean
  /** 当前 provider/model/endpoint 是否已知不支持 OpenAI Responses `store`。 */
  readonly openAiResponsesStoreKnownUnsupported: boolean
}

/** 从 adapter 收集当前 provider/transport 的请求体形态策略。 */
function buildRequestShapePolicy(
  ctx: StreamContext,
  adapter: ProviderAdapter | undefined,
): ProviderRequestShapePolicy | undefined {
  if (!adapter?.buildRequestShapePolicy || !ctx.providerConfig) return undefined
  const policyCtx: RequestShapePolicyContext = {
    providerId: ctx.providerId,
    modelId: ctx.modelId,
    effectiveProviderType: ctx.effectiveProviderType || '',
    contract: ctx.providerContract,
    transportProtocol: ctx.resolvedModelMeta.transportProtocol,
    providerOptionsKey: ctx.providerOptionsKey,
    providerOptionNamespaces: resolveProviderOptionNamespaces(ctx),
    openaiCompatibleProviderKey: ctx.openaiCompatibleProviderKey,
    modelProviderSlug: resolveExplicitModelProviderSlug(ctx),
    config: ctx.providerConfig,
  }
  return adapter.buildRequestShapePolicy(policyCtx)
}

/** 统一运行时调用计划的可选覆盖项。 */
export interface RuntimeCallPlanOverrides {
  /** 可选：外部已创建好的语言模型实例。 */
  readonly languageModel?: LanguageModelV3
  /** 可选：运行时能力层追加的 providerOptions patch。 */
  readonly providerOptionsPatch?: ProviderOptionsPatch
}

/** 把 native/search 等运行时 patch 合入 adapter 生成的 providerOptions。 */
function mergeProviderOptionsPatch(
  base: SharedV3ProviderOptions | undefined,
  patch: ProviderOptionsPatch | undefined,
): SharedV3ProviderOptions | undefined {
  if (!patch || Object.keys(patch).length === 0) return base
  const merged: SharedV3ProviderOptions = { ...(base ?? {}) }
  for (const [namespace, value] of Object.entries(patch)) {
    if (!isPlainRecord(value)) continue
    const current = merged[namespace]
    const patchValue = value as JSONObject
    merged[namespace] = {
      ...(isPlainRecord(current) ? current : {}),
      ...patchValue,
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined
}

/**
 * 构建统一运行时调用计划。
 *
 * 说明：
 * - stream-chat 与 health-check 都应复用这份计划，避免各自拼装不同的协议/中间件/执行模式；
 * - `languageModel` 始终基于 `resolvedModelMeta.transportProtocol` 创建，杜绝 ProviderConfig 成为协议真源。
 */
export async function buildRuntimeCallPlan(
  ctx: StreamContext,
  params: ModelCallParamsBase,
  tools?: Record<string, unknown>,
  overrides?: RuntimeCallPlanOverrides,
): Promise<RuntimeCallPlan> {
  const {
    providerId,
    providerConfig,
    providerType,
    effectiveProviderType,
    providerOptionsKey,
    modelId,
    resolvedModelMeta,
    featureKeys,
  } = ctx

  if (resolvedModelMeta.kind === 'unknown') {
    throw new I18nError('errors.modelSemanticsUnresolved')
  }
  if (
    resolvedModelMeta.kind !== 'chat'
    && resolvedModelMeta.kind !== 'multimodal-chat'
    && resolvedModelMeta.kind !== 'audio-chat'
  ) {
    throw new I18nError('errors.chatModelKindUnsupported', { kind: resolvedModelMeta.kind })
  }
  if (resolvedModelMeta.transportProtocol === 'unknown') {
    throw new I18nError('errors.modelTransportProtocolUnknown')
  }

  const enableGenerateImage = Boolean(params.enableGenerateImage)
  const supportsInlineImage = featureKeys.has('image-output')
  const wantsInlineImage = enableGenerateImage && supportsInlineImage
  const toolParameterSupport = resolveToolParameterSupport(getRuntimeSupportedParameters(ctx))
  const hasInjectedMcpTools = toolParameterSupport.tools && hasInjectedMcpToolsInToolSet(tools)
  const openAiResponsesStoreAutoStrategyApplied = shouldApplyOpenAiResponsesStoreAutoStrategy(ctx)
  const openAiResponsesStoreKnownUnsupported =
    openAiResponsesStoreAutoStrategyApplied && hasInjectedMcpTools
      ? await isKnownUnsupportedOpenAiResponsesStoreTarget({
          providerId,
          modelId,
          effectiveProviderType,
          transportProtocol: resolvedModelMeta.transportProtocol,
          apiHost: providerConfig?.apiHost,
        })
      : false
  const openAiResponsesStoreValue = openAiResponsesStoreAutoStrategyApplied
    ? hasInjectedMcpTools && !openAiResponsesStoreKnownUnsupported
    : undefined

  const adapter = await loadStreamAdapter(ctx)
  const languageModel = overrides?.languageModel ?? await resolveModel(params.model, resolvedModelMeta)
  const providerOptions = mergeProviderOptionsPatch(await buildProviderOptions(ctx, params, adapter, {
    hasInjectedMcpTools,
    openAiResponsesStoreValue,
  }), overrides?.providerOptionsPatch)
  const requestShapePolicy = buildRequestShapePolicy(ctx, adapter)
  const callSettings = await buildCallSettings(ctx, params)

  const middlewares: LanguageModelMiddleware[] = []
  if (adapter?.getMiddlewares && providerConfig) {
    const reasoning = resolveProviderReasoningDescriptor({
      model: params.model,
      transportProtocol: resolvedModelMeta.transportProtocol,
      modelParams: isPlainRecord(params.modelParams) ? params.modelParams : undefined,
    })
    const middlewareCtx: MiddlewareContext = {
      providerId,
      config: providerConfig,
      modelId,
      effectiveProviderType: effectiveProviderType || '',
      transportProtocol: resolvedModelMeta.transportProtocol,
      providerOptionsKey,
      tools,
      params: {
        modelParams: isPlainRecord(params.modelParams) ? params.modelParams : undefined,
        reasoning,
      },
    }
    middlewares.push(...adapter.getMiddlewares(middlewareCtx))
  }

  const execAdapterType = effectiveProviderType ?? providerType
  const fallbackExecutionMode =
    wantsInlineImage && (execAdapterType === 'gemini' || execAdapterType === 'vertexai')
      ? ('generateText' as const)
      : ('streamText' as const)
  const executionMode =
    adapter && providerConfig
      ? adapter.pickChatExecutionMode({
          providerId,
          config: providerConfig,
          modelId,
          effectiveProviderType: String(execAdapterType || ''),
          wantsInlineImage,
        })
      : fallbackExecutionMode

  return {
    context: ctx,
    languageModel,
    ...(providerOptions ? { providerOptions } : {}),
    ...(requestShapePolicy ? { requestShapePolicy } : {}),
    callSettings,
    middlewares,
    executionMode,
    wantsInlineImage,
    supportsInlineImage,
    hasInjectedMcpTools,
    toolParameterSupport,
    openAiResponsesStoreAutoStrategyApplied,
    openAiResponsesStoreKnownUnsupported,
    ...(openAiResponsesStoreValue !== undefined ? { openAiResponsesStoreValue } : {}),
  }
}
