/**
 * 说明：`model-filters` AI 能力模块。
 *
 * 职责：
 * - 承载 `model-filters` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelLike`、`isVisionModelLike`、`isInlineImageModelLike` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型筛选工具（Browser Studio）
 *
 * 目标：定义默认筛选策略：
 * - 普通对话模型：允许聊天类 + 专用文生图；
 * - 严格语言模型：只允许聊天类；
 * - 图片输入时：仅允许 vision 模型
 *
 * 约束：
 * - 只依赖 model-registry 解析出的 kind/features
 * - 不再依赖旧模型语义链的正则推断
 */

import type { ModelFeature, ModelKind } from './model-registry'
import { supportsNativeWebSearch } from './native-web-search-capability'

/**
 * 供模型筛选器复用的最小模型语义视图。
 *
 * 说明：
 * - 只包含筛选逻辑真正依赖的 id、provider、kind 和 feature 集；
 * - 这样 UI 可以用轻量对象复用同一套过滤规则，而不用绑定完整 registry 条目。
 */
export type ModelLike = {
  /** 完整模型 ID："providerId/modelId" */
  id: string
  /** Provider 侧的原始 model id（不含 provider 前缀）。 */
  modelId?: string
  /** Provider 标识。 */
  providerId: string
  /** Provider 类型。 */
  providerType?: string
  /** 模型主类型。 */
  kind: ModelKind
  /** 模型语义特性。 */
  features: ReadonlyArray<ModelFeature>
  /** 当前模型的传输协议。 */
  transportProtocol?: string
}

/** 把模型特性数组转成 Set，便于做多次 membership 判断。 */
function featureSet(m: ModelLike): Set<ModelFeature> {
  return new Set(m.features)
}

/** 判断模型是否支持视觉输入。 */
export function isVisionModelLike(m: ModelLike): boolean {
  return featureSet(m).has('vision-input')
}

/** 判断模型是否支持在同一次聊天调用里直接产出图片。 */
export function isInlineImageModelLike(m: ModelLike): boolean {
  return featureSet(m).has('image-output')
}

/** 判断模型是否属于专用图片生成模型。 */
export function isDedicatedImageModelLike(m: ModelLike): boolean {
  return m.kind === 'image-generation'
}

/** 判断模型是否属于语音转写模型。 */
export function isTranscriptionModelLike(m: ModelLike): boolean {
  return m.kind === 'transcription'
}

/** 判断模型是否属于语音合成模型。 */
export function isSpeechModelLike(m: ModelLike): boolean {
  return m.kind === 'speech-generation'
}

/** 判断模型是否属于内容审核模型。 */
export function isModerationModelLike(m: ModelLike): boolean {
  return m.kind === 'moderation'
}

/**
 * 默认“严格语言模型”筛选。
 *
 * 说明：
 * - 这条过滤器只给“明确只能接语言模型”的场景使用，例如 Memory LLM；
 * - 这里故意不放行 `image-generation`，因为这些场景最终会走 `streamText / streamChat` 一类语言模型调用链；
 * - 若把专用生图模型放进来，会把运行时语义与 UI 入口绑错，造成真正的请求失败。
 */
export function defaultChatModelFilter(m: ModelLike): boolean {
  return m.kind === 'chat' || m.kind === 'multimodal-chat' || m.kind === 'audio-chat'
}

/**
 * 默认“普通对话模型”筛选。
 *
 * 说明：
 * - 这条过滤器统一当前扩展的普通聊天模型选择语义；
 * - 普通对话场景除了文本/多模态/音频聊天模型外，也允许直接选择专用 `image-generation` 模型；
 * - 这样聊天页、话题设置、默认聊天模型、普通助手、\@mention、多模型对比就都能选到生图模型；
 * - 但 `embedding / rerank / unknown / video-generation` 仍然保持拦截，避免错误进入对话主链。
 */
export function defaultConversationModelFilter(m: ModelLike): boolean {
  return (
    m.kind === 'chat'
    || m.kind === 'multimodal-chat'
    || m.kind === 'audio-chat'
    || m.kind === 'image-generation'
  )
}

/** 判断模型是否声明了原生联网搜索能力。 */
export function isWebSearchModelLike(m: ModelLike): boolean {
  const providerModelId = m.modelId ?? String(m.id || '').split('/').slice(1).join('/')
  return supportsNativeWebSearch({
    providerId: m.providerId,
    providerType: m.providerType,
    transportProtocol: m.transportProtocol,
    modelId: providerModelId || m.id,
    featureKeys: featureSet(m),
  })
}

/** 判断模型是否支持工具调用。 */
export function isToolCallingModelLike(m: ModelLike): boolean {
  return featureSet(m).has('tool-call')
}

/** 判断模型是否支持显式推理能力。 */
export function isReasoningModelLike(m: ModelLike): boolean {
  return featureSet(m).has('reasoning')
}
