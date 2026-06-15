/**
 * 说明：`model-call-settings` AI 能力模块。
 *
 * 职责：
 * - 承载 `model-call-settings` 相关的当前文件实现与模块边界；
 * - 对外暴露 `getCallSettingSupport` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 通用 call settings 支持判断（Browser Studio）
 *
 * 目标：
 * - 编排层不做任何基于 modelId 的 if/else；
 * - 由各 ProviderAdapter 提供权威的支持矩阵（UI 与运行时共用）。
 */

import type { ProviderConfig, ProviderType, TransportProtocol } from './types'
import type { CallSettingSupport } from './providers/adapter-types'
import type { ProviderReasoningDescriptor } from './provider-reasoning'
import { loadAdapter } from './providers/load-adapter'
import {
  filterCallSettingSupportBySupportedParameters,
  type SupportedRequestParameters,
} from './model-request-parameters'

/**
 * 当 Provider/Adapter 未就绪时的兜底矩阵（尽量“少注入参数”，避免误传导致 4xx）。
 */
const UNKNOWN_SUPPORT: CallSettingSupport = {
  temperature: false,
  topP: false,
  maxTokens: false,
  topK: false,
  presencePenalty: false,
  frequencyPenalty: false,
  seed: false,
  stop: true,
}

/**
 * 获取指定 Provider + 模型组合下允许注入的 call settings 支持矩阵。
 *
 * 说明：
 * - 优先委托给对应 ProviderAdapter 返回权威能力声明；
 * - 当配置不完整、模型为空或 adapter 不存在时，回退到保守的 `UNKNOWN_SUPPORT`，避免误传参数。
 */
export async function getCallSettingSupport(args: {
  /** providerId（例如 "openai" / "siliconflow"） */
  providerId: string
  /** Provider 配置（UI 可从 useModelOptions.providers 获取；运行时来自 provider-registry） */
  config: ProviderConfig | null | undefined
  /** 原始 modelId（不含 provider 前缀） */
  modelId: string
  /** 生效的 ProviderType（NewAPI 等场景可显式传入“真实端点类型”） */
  effectiveProviderType?: ProviderType | undefined
  /** 当前模型的 transport protocol。 */
  transportProtocol?: TransportProtocol
  /** 当前轮的 provider-aware 推理描述。 */
  reasoning?: ProviderReasoningDescriptor
  /** 当前模型显式声明支持的 provider 原生请求参数。 */
  supportedParameters?: SupportedRequestParameters
}): Promise<CallSettingSupport> {
  const config = args.config
  const modelId = String(args.modelId || '').trim()
  if (!config || !modelId) {
    return filterCallSettingSupportBySupportedParameters(UNKNOWN_SUPPORT, args.supportedParameters)
  }

  const adapterType = String(args.effectiveProviderType || config.type || '').trim()
  if (!adapterType) {
    return filterCallSettingSupportBySupportedParameters(UNKNOWN_SUPPORT, args.supportedParameters)
  }

  const adapter = await loadAdapter(adapterType)
  if (!adapter) {
    return filterCallSettingSupportBySupportedParameters(UNKNOWN_SUPPORT, args.supportedParameters)
  }

  const support = adapter.getCallSettingSupport({
    providerId: String(args.providerId || '').trim(),
    config,
    modelId,
    effectiveProviderType: adapterType,
    transportProtocol: args.transportProtocol,
    reasoning: args.reasoning,
    supportedParameters: args.supportedParameters,
  })
  return filterCallSettingSupportBySupportedParameters(support, args.supportedParameters)
}
