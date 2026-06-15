/**
 * 说明：`model-request-parameters` AI 能力模块。
 *
 * 职责：
 * - 规范化 provider / model 目录返回的原生参数名；
 * - 在存在显式 `supportedParameters` 时，对通用 call settings、providerOptions 与工具参数做严格取交集；
 * - 在没有显式能力真源时保持既有 adapter / policy 行为，避免按模型名误伤中转站或自定义端点。
 *
 * 边界：
 * - 本模块只判断“是否允许下发某个请求参数”，不负责读取 storage、不创建模型实例；
 * - 字段名全部保存为平台原生名，例如 `top_p`、`reasoning`、`tool_choice`。
 */
import type { JSONValue, SharedV3ProviderOptions } from '@ai-sdk/provider'
import { isPlainRecord } from '@/lib/utils/type-guards'
import type { CallSettingSupport } from './providers/adapter-types'

/** 单模型显式支持的 provider 原生请求参数列表。 */
export type SupportedRequestParameters = ReadonlyArray<string>

/** 工具调用相关 AI SDK 顶层参数支持矩阵。 */
export interface ToolParameterSupport {
  /** 是否允许下发 `tools`。 */
  readonly tools: boolean
  /** 是否允许下发 `toolChoice` / `prepareStep.toolChoice`。 */
  readonly toolChoice: boolean
}

/** 通用 call setting 到 provider 原生参数名的映射。 */
const CALL_SETTING_PARAMETER_CANDIDATES: Readonly<Record<keyof CallSettingSupport, ReadonlyArray<string>>> = Object.freeze({
  temperature: ['temperature'],
  topP: ['top_p'],
  maxTokens: ['max_tokens', 'max_completion_tokens'],
  topK: ['top_k'],
  presencePenalty: ['presence_penalty'],
  frequencyPenalty: ['frequency_penalty'],
  seed: ['seed'],
  stop: ['stop'],
})

/** providerOptions 内部 key 到 provider 原生参数名的映射。 */
const PROVIDER_OPTION_PARAMETER_CANDIDATES: Readonly<Record<string, ReadonlyArray<string>>> = Object.freeze({
  modalities: ['modalities'],
  responseModalities: ['response_modalities', 'modalities'],
  serviceTier: ['service_tier'],
  service_tier: ['service_tier'],
  store: ['store'],
  textVerbosity: ['text_verbosity', 'verbosity'],
  reasoning: ['reasoning'],
  reasoning_effort: ['reasoning_effort', 'reasoning'],
  reasoningEffort: ['reasoning_effort', 'reasoning'],
  reasoningConfig: ['reasoning_config', 'reasoningConfig'],
  thinkingConfig: ['thinking_config', 'thinkingConfig'],
  thinking: ['thinking'],
  enable_thinking: ['enable_thinking'],
  thinking_budget: ['thinking_budget'],
  think: ['think'],
})

/** 对单个 provider 原生参数名做最小规范化。 */
function normalizeParameterName(value: unknown): string {
  return String(value || '').trim()
}

/** 构造支持参数集合；`undefined` 表示没有显式真源，空数组表示显式不支持任何普通参数。 */
function createSupportedParameterSet(
  supportedParameters: SupportedRequestParameters | undefined,
): ReadonlySet<string> | undefined {
  if (supportedParameters === undefined) return undefined
  return new Set(supportedParameters.map((item) => item.toLowerCase()))
}

/** 判断候选原生参数名中是否至少有一个被显式支持。 */
function supportsAnyParameter(
  supported: ReadonlySet<string> | undefined,
  candidates: ReadonlyArray<string>,
): boolean {
  if (!supported) return true
  return candidates.some((candidate) => supported.has(candidate.toLowerCase()))
}

/**
 * 规范化 provider / model 显式支持的请求参数列表。
 *
 * @param raw - 目录、storage 或 registry 中读取到的未知值。
 * @returns 若输入是数组，返回去重后的原生参数名列表；非数组返回 `undefined`。
 */
export function normalizeSupportedParameters(raw: unknown): SupportedRequestParameters | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const normalized = normalizeParameterName(item)
    const key = normalized.toLowerCase()
    if (!normalized || seen.has(key)) continue
    seen.add(key)
    out.push(normalized)
  }
  return out
}

/**
 * 判断某个 provider 原生请求参数是否被显式支持。
 *
 * @param supportedParameters - 当前模型显式支持的参数；`undefined` 表示未知而非不支持。
 * @param parameterName - provider 原生请求参数名。
 * @returns 没有显式真源时返回 `true`，由既有 adapter policy 继续决定。
 */
export function supportsRequestParameter(
  supportedParameters: SupportedRequestParameters | undefined,
  parameterName: string,
): boolean {
  return supportsAnyParameter(createSupportedParameterSet(supportedParameters), [parameterName])
}

/**
 * 用显式支持参数列表过滤通用 call settings 支持矩阵。
 *
 * @param support - adapter/policy 已给出的基础支持矩阵。
 * @param supportedParameters - 当前模型显式支持的 provider 原生参数列表。
 * @returns 取交集后的支持矩阵；无显式列表时原样返回。
 */
export function filterCallSettingSupportBySupportedParameters(
  support: CallSettingSupport,
  supportedParameters: SupportedRequestParameters | undefined,
): CallSettingSupport {
  const supported = createSupportedParameterSet(supportedParameters)
  if (!supported) return support
  return {
    temperature: support.temperature && supportsAnyParameter(supported, CALL_SETTING_PARAMETER_CANDIDATES.temperature),
    topP: support.topP && supportsAnyParameter(supported, CALL_SETTING_PARAMETER_CANDIDATES.topP),
    maxTokens: support.maxTokens && supportsAnyParameter(supported, CALL_SETTING_PARAMETER_CANDIDATES.maxTokens),
    topK: support.topK && supportsAnyParameter(supported, CALL_SETTING_PARAMETER_CANDIDATES.topK),
    presencePenalty: support.presencePenalty && supportsAnyParameter(supported, CALL_SETTING_PARAMETER_CANDIDATES.presencePenalty),
    frequencyPenalty: support.frequencyPenalty && supportsAnyParameter(supported, CALL_SETTING_PARAMETER_CANDIDATES.frequencyPenalty),
    seed: support.seed && supportsAnyParameter(supported, CALL_SETTING_PARAMETER_CANDIDATES.seed),
    stop: support.stop && supportsAnyParameter(supported, CALL_SETTING_PARAMETER_CANDIDATES.stop),
  }
}

/**
 * 用显式支持参数列表过滤 providerOptions。
 *
 * @param providerOptions - adapter + passthrough 生成的 providerOptions。
 * @param supportedParameters - 当前模型显式支持的 provider 原生参数列表。
 * @returns 没有显式列表时原样返回；过滤后为空则返回 `undefined`。
 */
export function filterProviderOptionsBySupportedParameters(
  providerOptions: SharedV3ProviderOptions | undefined,
  supportedParameters: SupportedRequestParameters | undefined,
): SharedV3ProviderOptions | undefined {
  const supported = createSupportedParameterSet(supportedParameters)
  if (!supported || !providerOptions) return providerOptions

  const filtered: SharedV3ProviderOptions = {}
  for (const [namespace, value] of Object.entries(providerOptions)) {
    if (!isPlainRecord(value)) continue
    const namespaceOut: Record<string, JSONValue> = {}
    for (const [optionKey, optionValue] of Object.entries(value)) {
      if (optionValue === undefined) continue
      const candidates = PROVIDER_OPTION_PARAMETER_CANDIDATES[optionKey]
      if (!candidates) continue
      if (!supportsAnyParameter(supported, candidates)) continue
      namespaceOut[optionKey] = optionValue as JSONValue
    }
    if (Object.keys(namespaceOut).length > 0) {
      filtered[namespace] = namespaceOut
    }
  }

  return Object.keys(filtered).length > 0 ? filtered : undefined
}

/**
 * 解析工具调用相关顶层参数支持情况。
 *
 * @param supportedParameters - 当前模型显式支持的 provider 原生参数列表。
 * @returns 无显式列表时保持开放；有显式列表时分别检查 `tools` 与 `tool_choice`。
 */
export function resolveToolParameterSupport(
  supportedParameters: SupportedRequestParameters | undefined,
): ToolParameterSupport {
  const supported = createSupportedParameterSet(supportedParameters)
  if (!supported) return { tools: true, toolChoice: true }
  return {
    tools: supportsAnyParameter(supported, ['tools']),
    toolChoice: supportsAnyParameter(supported, ['tool_choice']),
  }
}
