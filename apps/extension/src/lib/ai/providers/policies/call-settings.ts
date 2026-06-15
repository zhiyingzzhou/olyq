/**
 * 说明：`call-settings` AI 能力模块。
 *
 * 职责：
 * - 承载 `call-settings` 相关的当前文件实现与模块边界；
 * - 对外暴露 `normalizeModelIdLower`、`isOpenAiReasoningLikeModelId`、`isQwenMtModelId` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Provider call settings 支持矩阵（策略层）。
 *
 * 设计目标：
 * - 把“按 modelId 推断参数支持情况”的 if/else 收敛到 providers/policies；
 * - ProviderAdapter 只负责选择合适的策略函数，编排层不再做任何 modelId 分支。
 */

import { getLowerBaseModelName } from '../../model-naming'
import type { ProviderReasoningDescriptor } from '../../provider-reasoning'
import type { TransportProtocol } from '../../types'
import type { CallSettingSupport } from '../adapter-types'

/**
 * 归一化模型 ID，用于参数支持矩阵匹配。
 *
 * @param modelId - 原始模型 ID。
 * @returns 去 provider 前缀后的基础模型名，并统一转为小写。
 */
export function normalizeModelIdLower(modelId: string): string {
  return getLowerBaseModelName(modelId, '/')
}

/**
 * 判断模型是否属于 OpenAI 风格的 reasoning/o 系列。
 *
 * @param modelIdLower - 已归一化的小写模型 ID。
 * @returns `true` 表示该模型通常不支持常规采样参数。
 */
export function isOpenAiReasoningLikeModelId(modelIdLower: string): boolean {
  // 说明：OpenAI “o 系列”通常不支持 temperature/topP 等采样参数。
  return /^o\d+/.test(modelIdLower)
}

/**
 * 判断模型是否属于 OpenAI Responses 下受推理档位约束的 GPT-5 家族。
 *
 * @param modelIdLower - 已归一化的小写模型 ID。
 * @returns `true` 表示当前模型只有在显式 `reasoning.effort = none` 时才允许常规采样参数。
 */
export function isOpenAiResponsesGpt5ReasoningModelId(modelIdLower: string): boolean {
  return /^gpt-5(?:\.\d+)?(?:-[\w.]+)?$/.test(modelIdLower)
}

/**
 * 判断当前轮是否显式把 Responses 推理档位设成 `none`。
 *
 * @param reasoning - provider-aware 推理描述。
 * @returns `true` 表示当前轮可安全恢复 `temperature/topP`。
 */
function hasExplicitResponsesReasoningNone(reasoning: ProviderReasoningDescriptor | undefined): boolean {
  return reasoning?.configured === true && reasoning.value === 'none'
}

/**
 * 判断当前轮是否应按官方 OpenAI Chat reasoning 规则禁用采样和 penalties。
 *
 * @param modelIdLower - 已归一化的小写模型 ID。
 * @param reasoning - provider-aware 推理描述。
 * @returns `true` 表示当前 reasoning 模型没有显式切到 `none`，应避免下发采样参数。
 */
function shouldDisableOfficialOpenAiChatReasoningSampling(
  modelIdLower: string,
  reasoning: ProviderReasoningDescriptor | undefined,
): boolean {
  if (!isOpenAiResponsesGpt5ReasoningModelId(modelIdLower)) return false
  return !hasExplicitResponsesReasoningNone(reasoning)
}

/**
 * 判断模型是否属于 Qwen 机器翻译系列。
 *
 * @param modelIdLower - 已归一化的小写模型 ID。
 * @returns `true` 表示当前模型通常需要禁用 temperature/topP。
 */
export function isQwenMtModelId(modelIdLower: string): boolean {
  // 说明：Qwen MT（机器翻译）常见不支持自定义 temperature/top_p。
  return modelIdLower.includes('qwen-mt')
}

/**
 * 计算 OpenAI-compatible 模型的调用参数支持矩阵。
 *
 * @param args - 模型 ID 与若干 Provider 级约束开关。
 * @returns 当前模型可安全暴露给 UI 的参数开关矩阵。
 */
export function openAiLikeCallSettingSupport(args: {
  modelId: string
  transportProtocol?: TransportProtocol
  reasoning?: ProviderReasoningDescriptor
  /** 是否禁用 presence/frequency_penalty（例如 xAI） */
  disablePenalties?: boolean
  /** 是否禁用 seed（例如 DeepSeek） */
  disableSeed?: boolean
  /** 是否禁用 stopSequences（例如 xAI） */
  disableStop?: boolean
  /** 是否对 Qwen MT 禁用 temperature/topP（DashScope/SiliconFlow 常见） */
  qwenMtNoTempTopP?: boolean
  /** 是否启用官方 OpenAI Chat reasoning 模型的采样/penalties 过滤规则。 */
  officialOpenAiChatReasoningRules?: boolean
  /** 是否禁用 OpenAI Responses SDK 已明确不支持的 seed/penalties/stop。 */
  disableOpenAiResponsesUnsupportedSettings?: boolean
}): CallSettingSupport {
  const modelIdLower = normalizeModelIdLower(args.modelId)
  const isReasoning = isOpenAiReasoningLikeModelId(modelIdLower)
  const isResponsesGpt5ReasoningModel =
    args.transportProtocol === 'openai-responses'
    && isOpenAiResponsesGpt5ReasoningModelId(modelIdLower)

  let temperature = !isReasoning
  let topP = temperature

  if (isResponsesGpt5ReasoningModel && !hasExplicitResponsesReasoningNone(args.reasoning)) {
    temperature = false
    topP = false
  }

  if (args.qwenMtNoTempTopP && isQwenMtModelId(modelIdLower)) {
    temperature = false
    topP = false
  }

  const disableOfficialChatSampling =
    args.officialOpenAiChatReasoningRules
    && args.transportProtocol !== 'openai-responses'
    && shouldDisableOfficialOpenAiChatReasoningSampling(modelIdLower, args.reasoning)

  return {
    temperature: temperature && !disableOfficialChatSampling,
    topP: topP && !disableOfficialChatSampling,
    maxTokens: true,
    topK: false,
    presencePenalty: !isReasoning && !args.disablePenalties && !disableOfficialChatSampling && !args.disableOpenAiResponsesUnsupportedSettings,
    frequencyPenalty: !isReasoning && !args.disablePenalties && !disableOfficialChatSampling && !args.disableOpenAiResponsesUnsupportedSettings,
    seed: !isReasoning && !args.disableSeed && !args.disableOpenAiResponsesUnsupportedSettings,
    stop: !args.disableStop && !args.disableOpenAiResponsesUnsupportedSettings,
  }
}

/**
 * 获取 Anthropic 风格模型的调用参数支持矩阵。
 *
 * @returns Anthropic 安全可用的参数集合。
 */
export function anthropicLikeCallSettingSupport(): CallSettingSupport {
  // Anthropic 支持 temperature/top_p/max_tokens 与 stop sequences；不支持 OpenAI 风格 penalties/seed。
  return {
    temperature: true,
    topP: true,
    maxTokens: true,
    topK: false,
    presencePenalty: false,
    frequencyPenalty: false,
    seed: false,
    stop: true,
  }
}

/**
 * 获取 Gemini / Vertex 风格模型的调用参数支持矩阵。
 *
 * @returns Gemini 安全可用的参数集合。
 */
export function geminiLikeCallSettingSupport(): CallSettingSupport {
  // Gemini/Vertex 支持 temperature/topP/maxTokens/topK 与 stop sequences；不支持 OpenAI penalties/seed。
  return {
    temperature: true,
    topP: true,
    maxTokens: true,
    topK: true,
    presencePenalty: false,
    frequencyPenalty: false,
    seed: false,
    stop: true,
  }
}

/**
 * 获取 Cohere 模型的调用参数支持矩阵。
 *
 * @returns Cohere 安全可用的参数集合。
 */
export function cohereCallSettingSupport(): CallSettingSupport {
  // Cohere v2：支持 temperature/top_p/top_k/max_tokens；不支持 OpenAI penalties/seed。
  return {
    temperature: true,
    topP: true,
    maxTokens: true,
    topK: true,
    presencePenalty: false,
    frequencyPenalty: false,
    seed: false,
    stop: true,
  }
}

/**
 * 获取 Bedrock 通用调用参数支持矩阵。
 *
 * @returns Bedrock 多模型族共享的安全参数子集。
 */
export function bedrockCallSettingSupport(): CallSettingSupport {
  // Bedrock：不同模型族参数不完全一致；这里给出“安全的通用子集”。
  return {
    temperature: true,
    topP: true,
    maxTokens: true,
    topK: false,
    presencePenalty: false,
    frequencyPenalty: false,
    seed: false,
    stop: true,
  }
}
