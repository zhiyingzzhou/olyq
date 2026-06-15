/**
 * 说明：`utils` AI 能力模块。
 *
 * 职责：
 * - 承载 `utils` 相关的当前文件实现与模块边界；
 * - 对外暴露 `isProtectedPrimaryKind`、`toModelFeatures`、`toModelCapabilities` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型类型系统公共工具。
 *
 * 为什么存在：
 * - 这里承接旧 `model-semantics/utils.ts` 的公共职责，但术语收口为“模型类型系统”；
 * - 统一处理 capabilities/features/modalities 之间的映射，避免规则层和展示层各写一套；
 * - 后续若要扩展公共规则，只需要在这里补公共转换，不必侵入 UI 或 resolver。
 */

import type {
  ModelFeature,
  ModelKind,
  ModelModality,
  TransportProtocol,
} from '../types'
import type {
  ModelCapabilityKey,
  ModelTypeDescriptor,
  ModelTypeResult,
  ModelTypeSource,
  PartialModelTypeState,
} from './types'
import { CAPABILITY_TO_FEATURE, FEATURE_TO_CAPABILITY } from './shared/capabilities'
import {
  getNormalizedModelIdentity,
  getNormalizedModelName,
  normalizeModelId,
  normalizeModelText,
  normalizeProviderToken,
  uniqStrings,
} from './shared/normalize'

export {
  uniqStrings,
  normalizeModelText,
  normalizeModelId,
  normalizeProviderToken,
  getNormalizedModelIdentity,
  getNormalizedModelName,
}

/** 高风险主类集合。 */
const PROTECTED_PRIMARY_KINDS = new Set<ModelKind>([
  'audio-chat',
  'transcription',
  'speech-generation',
  'moderation',
  'video-generation',
  'image-generation',
  'embedding',
  'rerank',
])

/** 是否为高风险主类。 */
export function isProtectedPrimaryKind(kind: ModelKind | undefined): boolean {
  return Boolean(kind && PROTECTED_PRIMARY_KINDS.has(kind))
}

/** 内部能力键转 feature。 */
export function toModelFeatures(capabilities: ReadonlyArray<ModelCapabilityKey>): ModelFeature[] {
  return uniqStrings(
    capabilities
      .map((capability) => CAPABILITY_TO_FEATURE[capability])
      .filter((value): value is ModelFeature => Boolean(value)),
  )
}

/** feature 转内部能力键。 */
export function toModelCapabilities(features: ReadonlyArray<ModelFeature> | undefined): ModelCapabilityKey[] {
  return uniqStrings(
    (features ?? [])
      .map((feature) => FEATURE_TO_CAPABILITY[feature])
      .filter((value): value is ModelCapabilityKey => Boolean(value)),
  )
}

/** 从模态补出只读系统能力。 */
export function deriveCapabilityHintsFromModalities(
  inputModalities: ReadonlyArray<ModelModality>,
  outputModalities: ReadonlyArray<ModelModality>,
): ModelCapabilityKey[] {
  const capabilities: ModelCapabilityKey[] = []
  if (inputModalities.includes('image')) capabilities.push('vision')
  if (inputModalities.includes('audio')) capabilities.push('audio_input')
  if (inputModalities.includes('file')) capabilities.push('file_input')
  if (outputModalities.includes('image')) capabilities.push('image_output')
  if (outputModalities.includes('audio')) capabilities.push('audio_output')
  return uniqStrings(capabilities)
}

/** 从模态推导主类。 */
export function deriveKindFromModalities(
  inputModalities: ReadonlyArray<ModelModality>,
  outputModalities: ReadonlyArray<ModelModality>,
  explicitKind?: ModelKind,
): ModelKind {
  if (explicitKind && explicitKind !== 'unknown') return explicitKind
  if (outputModalities.includes('embeddings')) return 'embedding'
  if (outputModalities.includes('video')) return 'video-generation'
  if (outputModalities.includes('image') && !outputModalities.includes('text')) return 'image-generation'
  if (outputModalities.includes('audio') && !outputModalities.includes('text')) return 'speech-generation'
  if (
    outputModalities.includes('text')
    && !inputModalities.includes('text')
    && !inputModalities.includes('image')
    && (inputModalities.includes('audio') || inputModalities.includes('file'))
  ) {
    return 'transcription'
  }
  if (outputModalities.includes('audio') && outputModalities.includes('text')) return 'audio-chat'
  if (
    outputModalities.includes('text')
    && (inputModalities.includes('image') || inputModalities.includes('audio') || inputModalities.includes('file'))
  ) {
    return 'multimodal-chat'
  }
  if (outputModalities.includes('text')) return 'chat'
  return explicitKind ?? 'unknown'
}

/** 是否至少带有一条目录显式语义。 */
export function hasExplicitDirectorySignals(descriptor: ModelTypeDescriptor): boolean {
  return Boolean(
    descriptor.kindHint
    || (descriptor.inputModalities && descriptor.inputModalities.length > 0)
    || (descriptor.outputModalities && descriptor.outputModalities.length > 0)
    || (descriptor.features && descriptor.features.length > 0),
  )
}

/** 将 partial 结果收敛成完整结果。 */
export function finalizeModelTypeResult(state: PartialModelTypeState): ModelTypeResult {
  const kind = state.kind ?? 'unknown'
  const inputModalities = uniqStrings(state.inputModalities)
  const outputModalities = uniqStrings(state.outputModalities)
  const capabilities = uniqStrings(state.capabilities)
  return {
    kind,
    inputModalities,
    outputModalities,
    capabilities,
    features: toModelFeatures(capabilities),
    transportProtocol: state.transportProtocol ?? 'unknown',
    sources: uniqStrings(state.sources) as ModelTypeSource[],
    reason: String(state.reason || '').trim(),
  }
}

/** 合并 partial 结果。 */
export function mergeModelTypeStates(
  base: PartialModelTypeState,
  incoming: PartialModelTypeState,
): PartialModelTypeState {
  const baseKind = base.kind
  const incomingKind = incoming.kind
  const keepBaseKind =
    baseKind
    && baseKind !== 'unknown'
    && (!incomingKind || incomingKind === 'unknown' || isProtectedPrimaryKind(baseKind))

  return {
    kind: keepBaseKind ? baseKind : incomingKind ?? baseKind,
    inputModalities:
      base.inputModalities && base.inputModalities.length > 0
        ? uniqStrings(base.inputModalities)
        : uniqStrings(incoming.inputModalities),
    outputModalities:
      base.outputModalities && base.outputModalities.length > 0
        ? uniqStrings(base.outputModalities)
        : uniqStrings(incoming.outputModalities),
    capabilities: uniqStrings([...(base.capabilities ?? []), ...(incoming.capabilities ?? [])]),
    transportProtocol:
      base.transportProtocol && base.transportProtocol !== 'unknown'
        ? base.transportProtocol
        : incoming.transportProtocol,
    sources: uniqStrings([...(base.sources ?? []), ...(incoming.sources ?? [])]) as ModelTypeSource[],
    reason: [base.reason, incoming.reason].filter(Boolean).join('；'),
  }
}

/** 将协议映射成基础主类。 */
export function inferStateFromTransportProtocol(transportProtocol: TransportProtocol): PartialModelTypeState {
  switch (transportProtocol) {
    case 'embedding-api':
      return {
        kind: 'embedding',
        inputModalities: ['text'],
        outputModalities: ['embeddings'],
        capabilities: ['embedding'],
        transportProtocol,
        sources: ['transport-protocol'],
        reason: '根据 embedding-api 协议推导为嵌入模型',
      }
    case 'rerank-api':
      return {
        kind: 'rerank',
        inputModalities: ['text'],
        outputModalities: ['text'],
        capabilities: ['rerank'],
        transportProtocol,
        sources: ['transport-protocol'],
        reason: '根据 rerank-api 协议推导为重排模型',
      }
    case 'image-api':
      return {
        kind: 'image-generation',
        inputModalities: ['text'],
        outputModalities: ['image'],
        capabilities: ['image_output'],
        transportProtocol,
        sources: ['transport-protocol'],
        reason: '根据 image-api 协议推导为图像生成模型',
      }
    case 'video-api':
      return {
        kind: 'video-generation',
        inputModalities: ['text'],
        outputModalities: ['video'],
        capabilities: [],
        transportProtocol,
        sources: ['transport-protocol'],
        reason: '根据 video-api 协议推导为视频生成模型',
      }
    case 'transcription-api':
      return {
        kind: 'transcription',
        inputModalities: ['audio', 'file'],
        outputModalities: ['text'],
        capabilities: ['transcription'],
        transportProtocol,
        sources: ['transport-protocol'],
        reason: '根据 transcription-api 协议推导为语音转写模型',
      }
    case 'speech-api':
      return {
        kind: 'speech-generation',
        inputModalities: ['text'],
        outputModalities: ['audio'],
        capabilities: ['audio_output'],
        transportProtocol,
        sources: ['transport-protocol'],
        reason: '根据 speech-api 协议推导为语音合成模型',
      }
    case 'moderation-api':
      return {
        kind: 'moderation',
        inputModalities: ['text'],
        outputModalities: ['text'],
        capabilities: ['moderation'],
        transportProtocol,
        sources: ['transport-protocol'],
        reason: '根据 moderation-api 协议推导为内容审核模型',
      }
    case 'gemini-generate-content':
    case 'openai-chat':
    case 'openai-responses':
    case 'anthropic-messages':
    case 'cohere-chat':
    case 'bedrock-converse':
      return {
        kind: 'chat',
        inputModalities: ['text'],
        outputModalities: ['text'],
        capabilities: [],
        transportProtocol,
        sources: ['transport-protocol'],
        reason: `根据 ${transportProtocol} 协议推导为基础对话模型`,
      }
    default:
      return {
        kind: 'unknown',
        inputModalities: [],
        outputModalities: [],
        capabilities: [],
        transportProtocol: 'unknown',
        sources: ['unknown'],
        reason: '当前没有可直接使用的协议语义',
      }
  }
}

/** 统一构造 unknown 结果。 */
export function createUnknownModelTypeState(reason: string, source: ModelTypeSource = 'unknown'): PartialModelTypeState {
  return {
    kind: 'unknown',
    inputModalities: [],
    outputModalities: [],
    capabilities: [],
    transportProtocol: 'unknown',
    sources: [source],
    reason,
  }
}

/** 判断是否有有效载荷。 */
export function hasStatePayload(state: PartialModelTypeState): boolean {
  return Boolean(
    (state.kind && state.kind !== 'unknown')
    || (state.inputModalities && state.inputModalities.length > 0)
    || (state.outputModalities && state.outputModalities.length > 0)
    || (state.capabilities && state.capabilities.length > 0),
  )
}
