/**
 * 说明：`engine` AI 能力模块。
 *
 * 职责：
 * - 承载 `engine` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ResolveModelTypeOptions`、`resolveSystemModelType` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型类型系统统一引擎。
 *
 * 固定顺序：
 * 1. OpenRouter 公共基线
 * 2. 当前 provider 最新规则补充
 * 3. 共享名称 fallback
 * 4. 当前 provider 目录显式字段兜底
 * 5. 独立推断 transportProtocol
 *
 * 设计目标：
 * - registry 构建期与运行时解析期必须共用同一套引擎，不能再出现两套不同顺序；
 * - OpenRouter 只负责公共模型基础语义，provider 差异只在解析时补充；
 * - 高风险主类优先由官方基线/显式规则决定，名称型 fallback 只做保守补充。
 */

import type {
  ModelCapabilityKey,
  ModelTypeDescriptor,
  ModelTypeResult,
  OpenRouterBaseline,
  PartialModelTypeState,
  ProviderModelRule,
} from './types'
import {
  createExplicitProviderState,
  createOpenRouterBaselineState,
  hasExplicitProviderPrimarySignals,
} from './official-baseline'
import { inferTransportProtocol } from './protocol'
import { OPENAI_MODEL_RULES } from './provider-rules/openai'
import { ANTHROPIC_MODEL_RULES } from './provider-rules/anthropic'
import { GEMINI_MODEL_RULES } from './provider-rules/gemini'
import { DASHSCOPE_MODEL_RULES } from './provider-rules/dashscope'
import { SILICONFLOW_MODEL_RULES } from './provider-rules/siliconflow'
import { TOGETHER_MODEL_RULES } from './provider-rules/together'
import { FIREWORKS_MODEL_RULES } from './provider-rules/fireworks'
import { DEEPSEEK_MODEL_RULES } from './provider-rules/deepseek'
import { XAI_MODEL_RULES } from './provider-rules/xai'
import { MISTRAL_MODEL_RULES } from './provider-rules/mistral'
import { GROQ_MODEL_RULES } from './provider-rules/groq'
import { OLLAMA_MODEL_RULES } from './provider-rules/ollama'
import { COHERE_MODEL_RULES } from './provider-rules/cohere'
import { isEmbeddingModel, isRerankModel } from './embedding'
import { isReasoningModel } from './reasoning'
import { isFunctionCallingModel } from './tooluse'
import { isGenerateImageModel, isImageEnhancementModel, isTextToImageModel, isVisionModel } from './vision'
import { isWebSearchModel } from './websearch'
import { uniqStrings } from './shared/normalize'
import {
  createUnknownModelTypeState,
  finalizeModelTypeResult,
  hasStatePayload,
  inferStateFromTransportProtocol,
  mergeModelTypeStates,
} from './utils'

const PROVIDER_RULES: ReadonlyArray<ProviderModelRule> = [
  ...OPENAI_MODEL_RULES,
  ...ANTHROPIC_MODEL_RULES,
  ...GEMINI_MODEL_RULES,
  ...DASHSCOPE_MODEL_RULES,
  ...SILICONFLOW_MODEL_RULES,
  ...TOGETHER_MODEL_RULES,
  ...FIREWORKS_MODEL_RULES,
  ...DEEPSEEK_MODEL_RULES,
  ...XAI_MODEL_RULES,
  ...MISTRAL_MODEL_RULES,
  ...GROQ_MODEL_RULES,
  ...COHERE_MODEL_RULES,
  ...OLLAMA_MODEL_RULES,
].sort((left, right) => right.priority - left.priority)

/** 模型类型引擎的可选附加输入。 */
export interface ResolveModelTypeOptions {
  /** 可选：当前模型若已归并到公共模型，则把该公共模型的 OpenRouter 基线传入。 */
  readonly openrouterBaseline?: OpenRouterBaseline
}

/**
 * 把某条 provider 规则的 effects 应用到当前部分状态上。
 *
 * 说明：
 * - 会同时维护主类、输入/输出模态和能力集合；
 * - 这里只处理规则本身声明的变换，不负责来源标记和状态合并策略。
 */
function applyRuleEffects(
  current: PartialModelTypeState,
  effects: ProviderModelRule['effects'],
): PartialModelTypeState {
  let kind = current.kind
  let inputModalities = uniqStrings(current.inputModalities)
  let outputModalities = uniqStrings(current.outputModalities)
  const capabilities = new Set<ModelCapabilityKey>(current.capabilities ?? [])

  const setPrimaryKind = effects.setPrimaryKind
  if (setPrimaryKind) {
    kind = setPrimaryKind
    if (setPrimaryKind === 'embedding') {
      inputModalities = ['text']
      outputModalities = ['embeddings']
      capabilities.clear()
      capabilities.add('embedding')
    } else if (setPrimaryKind === 'rerank') {
      inputModalities = ['text']
      outputModalities = ['text']
      capabilities.clear()
      capabilities.add('rerank')
    } else if (setPrimaryKind === 'image-generation') {
      if (inputModalities.length === 0) inputModalities = ['text']
      outputModalities = ['image']
      capabilities.add('image_output')
    } else if (setPrimaryKind === 'video-generation') {
      if (inputModalities.length === 0) inputModalities = ['text']
      outputModalities = ['video']
    } else if (setPrimaryKind === 'audio-chat') {
      inputModalities = uniqStrings([...inputModalities, 'text', 'audio'])
      outputModalities = uniqStrings([...outputModalities, 'text', 'audio'])
      capabilities.add('audio_input')
      capabilities.add('audio_output')
    }
  }

  if (effects.setInputModalities && effects.setInputModalities.length > 0) {
    inputModalities = uniqStrings(effects.setInputModalities)
  }

  if (effects.setOutputModalities && effects.setOutputModalities.length > 0) {
    outputModalities = uniqStrings(effects.setOutputModalities)
  }

  for (const capability of effects.addCapabilities ?? []) {
    capabilities.add(capability)
    if (capability === 'vision') {
      inputModalities = uniqStrings([...inputModalities, 'text', 'image'])
      if (outputModalities.length === 0) outputModalities = ['text']
      if (!kind || kind === 'unknown' || kind === 'chat') kind = 'multimodal-chat'
    } else if (capability === 'image_output') {
      outputModalities = uniqStrings([...outputModalities, 'image'])
    } else if (capability === 'audio_input') {
      inputModalities = uniqStrings([...inputModalities, 'audio'])
    } else if (capability === 'audio_output') {
      outputModalities = uniqStrings([...outputModalities, 'audio'])
    } else if (capability === 'file_input') {
      inputModalities = uniqStrings([...inputModalities, 'file'])
    }
  }

  for (const capability of effects.excludeCapabilities ?? []) {
    capabilities.delete(capability)
  }

  return {
    kind,
    inputModalities,
    outputModalities,
    capabilities: uniqStrings(Array.from(capabilities)),
  }
}

/**
 * 依次执行当前 provider 的规则表，并把命中结果合并为一个补充状态。
 *
 * 说明：
 * - 规则表已按 priority 倒序排序；
 * - 命中多条规则时会持续累积，最终由 `mergeModelTypeStates` 统一收敛。
 */
function applyProviderRuleTables(descriptor: ModelTypeDescriptor): PartialModelTypeState {
  let state = createUnknownModelTypeState('当前 provider 规则未命中', 'unknown')

  for (const rule of PROVIDER_RULES) {
    if (!rule.match(descriptor)) continue
    const effected = applyRuleEffects(state, rule.effects)
    state = mergeModelTypeStates(state, {
      ...effected,
      sources: ['provider-rule-supplement'],
      reason: `命中 provider 规则：${rule.id}`,
    })
  }

  return state
}

/**
 * 应用跨 provider 共享的兜底识别规则。
 *
 * 说明：
 * - 只覆盖能稳定识别的 embedding / rerank / 生图 / 视觉 / 推理 / 搜索 / function calling 信号；
 * - 若完全没有稳定命中，会返回“unknown”占位状态，让更高层决定是否继续兜底。
 */
function applySharedFallbackRules(descriptor: ModelTypeDescriptor): PartialModelTypeState {
  if (isEmbeddingModel(descriptor)) {
    return {
      kind: 'embedding',
      inputModalities: ['text'],
      outputModalities: ['embeddings'],
      capabilities: ['embedding'],
      sources: ['provider-rule-supplement'],
      reason: '命中共享 embedding fallback 规则',
    }
  }

  if (isRerankModel(descriptor)) {
    return {
      kind: 'rerank',
      inputModalities: ['text'],
      outputModalities: ['text'],
      capabilities: ['rerank'],
      sources: ['provider-rule-supplement'],
      reason: '命中共享 rerank fallback 规则',
    }
  }

  if (isTextToImageModel(descriptor)) {
    return {
      kind: 'image-generation',
      inputModalities: isImageEnhancementModel(descriptor) ? ['text', 'image'] : ['text'],
      outputModalities: ['image'],
      capabilities: ['image_output'],
      sources: ['provider-rule-supplement'],
      reason: isImageEnhancementModel(descriptor)
        ? '命中共享图像增强/编辑 fallback 规则'
        : '命中共享专用生图 fallback 规则',
    }
  }

  const capabilities: ModelCapabilityKey[] = []
  let kind: PartialModelTypeState['kind'] = 'unknown'
  let inputModalities: PartialModelTypeState['inputModalities'] = []
  let outputModalities: PartialModelTypeState['outputModalities'] = []

  if (isGenerateImageModel(descriptor)) capabilities.push('image_output')
  if (isVisionModel(descriptor)) {
    kind = 'multimodal-chat'
    inputModalities = ['text', 'image']
    outputModalities = ['text']
    capabilities.push('vision')
  }
  if (isReasoningModel(descriptor)) capabilities.push('reasoning')
  if (isWebSearchModel(descriptor)) capabilities.push('web_search')
  if (isFunctionCallingModel(descriptor)) capabilities.push('function_calling')

  if ((kind === 'unknown' || !kind) && capabilities.length === 0) {
    return createUnknownModelTypeState('共享名称 fallback 未命中任何稳定规则', 'unknown')
  }

  return {
    kind,
    inputModalities,
    outputModalities,
    capabilities,
    sources: ['provider-rule-supplement'],
    reason: '命中共享名称 fallback 规则',
  }
}

/**
 * 统一系统模型类型解析入口。
 *
 * 说明：
 * - `openrouterBaseline` 只会在“该模型已经归并到公共模型”时存在；
 * - 当前 provider 的规则始终在 baseline 之上补充，不能反向覆盖更高优先级的高风险主类；
 * - provider 目录显式字段只作为 fallback / 缺口补齐，不会去污染公共 canonical 的基础真源。
 */
export function resolveSystemModelType(
  descriptor: ModelTypeDescriptor,
  options?: ResolveModelTypeOptions,
): ModelTypeResult {
  let state = createUnknownModelTypeState('模型类型引擎开始执行', 'unknown')

  const openrouterBaselineState = createOpenRouterBaselineState(options?.openrouterBaseline)
  if (hasStatePayload(openrouterBaselineState)) {
    state = mergeModelTypeStates(state, openrouterBaselineState)
  }

  const providerRuleState = applyProviderRuleTables(descriptor)
  if (hasStatePayload(providerRuleState)) {
    state = mergeModelTypeStates(state, providerRuleState)
  }

  const explicitProviderState = createExplicitProviderState(descriptor)
  if (hasStatePayload(explicitProviderState)) {
    state = mergeModelTypeStates(state, explicitProviderState)
  }

  const sharedFallbackState = applySharedFallbackRules(descriptor)
  if (!descriptor.providerCatalogTypeHint && hasStatePayload(sharedFallbackState)) {
    state = mergeModelTypeStates(
      state,
      hasExplicitProviderPrimarySignals(descriptor)
        ? {
            ...sharedFallbackState,
            kind: undefined,
            inputModalities: undefined,
            outputModalities: undefined,
            reason: `${sharedFallbackState.reason}（仅补充系统能力）`,
          }
        : sharedFallbackState,
    )
  }

  const transportProtocol = inferTransportProtocol(descriptor, state.kind)
  const protocolState = inferStateFromTransportProtocol(transportProtocol)
  /**
   * 协议层只能做“基础主类兜底”，不能反向降级已经识别出的更具体主类。
   *
   * 这里要特别区分两种状态：
   * 1. 当前 state 已经有稳定主类（例如 multimodal-chat / embedding / image-generation）
   *    这种情况下协议层只能补 transportProtocol 与缺失模态，不能把主类覆盖成 chat。
   * 2. 当前 state 只有能力、没有稳定主类（例如只识别出 function_calling / reasoning）
   *    这种情况下协议层必须允许补出基础 chat，否则会出现
   *    “features 已经有值，但 kind 仍然是 unknown”的半成品状态。
   */
  const shouldKeepResolvedKind = Boolean(state.kind && state.kind !== 'unknown')
  state = mergeModelTypeStates(
    state,
    shouldKeepResolvedKind
      ? {
          ...protocolState,
          kind: undefined,
        }
      : protocolState,
  )
  state = mergeModelTypeStates(state, {
    transportProtocol,
    reason: transportProtocol === 'unknown' ? '当前协议仍无法自动判定' : `最终协议判定为 ${transportProtocol}`,
  })

  return finalizeModelTypeResult(state)
}
