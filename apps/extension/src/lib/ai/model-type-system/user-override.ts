/**
 * 说明：`user-override` AI 能力模块。
 *
 * 职责：
 * - 承载 `user-override` 相关的当前文件实现与模块边界；
 * - 对外暴露 `USER_MODEL_TYPE_ORDER`、`normalizeUserModelTypes`、`isUserModelTypeDisabled` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 用户模型类型覆盖层。
 *
 * 为什么存在：
 * - 系统识别结果负责描述“模型本身是什么”，用户覆盖层负责描述“当前用户希望把这台模型怎么使用”；
 * - 用户要求模型管理弹窗中的“模型类型”必须可以手动调整，但这种调整不能污染 registry 元数据；
 * - 因此这里专门处理 `manualModelTypes` 对最终有效语义的覆盖，并保证协议路由仍由系统独立控制。
 */

import type { ModelFeature, ModelModality, UserModelType } from '../types'
import type { ResolvedModelMeta } from '../model-registry/types'
import { uniqStrings } from './shared/normalize'

/**
 * 用户可编辑模型类型按钮顺序。
 *
 * 说明：
 * - `text_generation` 固定排在最前，表示“承担文字对话主任务的聊天模型”；
 * - `image_generation` 放在第二位，表示“承担图片生成主任务的模型”，并与其它用户模型类型互斥；
 * - `vision / web_search / reasoning / function_calling` 表示可以叠加在聊天主类之上的能力；
 * - `embedding / rerank` 是专用端点，继续放在末尾并与其它类型互斥。
 */
export const USER_MODEL_TYPE_ORDER: ReadonlyArray<UserModelType> = [
  'text_generation',
  'image_generation',
  'vision',
  'web_search',
  'reasoning',
  'function_calling',
  'rerank',
  'embedding',
] as const

const EDITABLE_FEATURES = new Set<ModelFeature>([
  'vision-input',
  'reasoning',
  'tool-call',
  'native-web-search',
])

/** 归一化用户模型类型数组。 */
export function normalizeUserModelTypes(
  raw: ReadonlyArray<UserModelType> | undefined,
): UserModelType[] | undefined {
  if (raw === undefined) return undefined
  const set = new Set<UserModelType>(raw)
  return USER_MODEL_TYPE_ORDER.filter((type) => set.has(type))
}

/** 判断某个用户模型类型按钮当前是否应禁用。 */
export function isUserModelTypeDisabled(
  type: UserModelType,
  selectedTypes: ReadonlyArray<UserModelType>,
): boolean {
  const selected = new Set(selectedTypes)
  const hasEmbedding = selected.has('embedding')
  const hasRerank = selected.has('rerank')
  const hasImageGeneration = selected.has('image_generation')

  if (type === 'embedding') return hasRerank
  if (type === 'rerank') return hasEmbedding
  if (type === 'image_generation') return hasEmbedding || hasRerank
  if (hasImageGeneration) return true
  return hasEmbedding || hasRerank
}

/** 切换用户模型类型。 */
export function toggleUserModelType(
  selectedTypes: ReadonlyArray<UserModelType>,
  targetType: UserModelType,
): UserModelType[] {
  const selected = new Set(selectedTypes)
  const next = new Set(selectedTypes)

  if (targetType === 'embedding') {
    return selected.has('embedding') ? [] : ['embedding']
  }
  if (targetType === 'rerank') {
    return selected.has('rerank') ? [] : ['rerank']
  }
  if (targetType === 'image_generation') {
    return selected.has('image_generation') ? [] : ['image_generation']
  }

  if (selected.has(targetType)) {
    next.delete(targetType)
  } else {
    next.add(targetType)
    next.delete('image_generation')
    next.delete('embedding')
    next.delete('rerank')
  }

  return normalizeUserModelTypes(Array.from(next)) ?? []
}

/**
 * 生成 embedding 专用语义。
 *
 * 说明：
 * - 当用户把模型显式指定为 embedding 时，需要强制收敛为只输入文本、只输出向量；
 * - 这样 UI 和运行时都不会再把它当成聊天模型使用。
 */
function createEmbeddingSemantic(): Pick<ResolvedModelMeta, 'kind' | 'inputModalities' | 'outputModalities' | 'features'> {
  return {
    kind: 'embedding',
    inputModalities: ['text'],
    outputModalities: ['embeddings'],
    features: [],
  }
}

/** 生成 rerank 专用语义，确保该类模型不会被 UI 误当成聊天模型来调用。 */
function createRerankSemantic(): Pick<ResolvedModelMeta, 'kind' | 'inputModalities' | 'outputModalities' | 'features'> {
  return {
    kind: 'rerank',
    inputModalities: ['text'],
    outputModalities: ['text'],
    features: [],
  }
}

/** 生成图片生成语义，用于用户显式把模型指定为 image generation 主类。 */
function createImageGenerationSemantic(): Pick<ResolvedModelMeta, 'kind' | 'inputModalities' | 'outputModalities' | 'features'> {
  return {
    kind: 'image-generation',
    inputModalities: ['text'],
    outputModalities: ['image'],
    features: ['image-output'],
  }
}

/** 对专用协议做硬保护，避免把 embedding/rerank 模型手改成 chat。 */
function getProtocolProtectedSemantic(
  transportProtocol: ResolvedModelMeta['transportProtocol'],
): Pick<ResolvedModelMeta, 'kind' | 'inputModalities' | 'outputModalities' | 'features'> | null {
  if (transportProtocol === 'embedding-api') return createEmbeddingSemantic()
  if (transportProtocol === 'rerank-api') return createRerankSemantic()
  return null
}

/** 去掉允许用户覆盖的 feature 位，避免旧识别结果残留到新的手动选择中。 */
function removeEditableFeatures(features: ReadonlyArray<ModelFeature>): ModelFeature[] {
  return uniqStrings(features.filter((feature) => !EDITABLE_FEATURES.has(feature)))
}

/**
 * 在需要保留聊天主类时补齐最基本的文本输入输出模态。
 *
 * 说明：
 * - 仅当当前 `kind` 还是 `unknown` 时强制提升为文本对话形态。
 * - 已经是明确 kind 的模型保持原判，只做模态去重。
 */
function ensureTextIoIfNeeded(
  kind: ResolvedModelMeta['kind'],
  inputModalities: ReadonlyArray<ModelModality>,
  outputModalities: ReadonlyArray<ModelModality>,
): { kind: ResolvedModelMeta['kind']; inputModalities: ModelModality[]; outputModalities: ModelModality[] } {
  if (kind !== 'unknown') {
    return {
      kind,
      inputModalities: uniqStrings(inputModalities),
      outputModalities: uniqStrings(outputModalities),
    }
  }
  return {
    kind: 'chat',
    inputModalities: ['text'],
    outputModalities: ['text'],
  }
}

/**
 * 为“文本生成”补齐聊天主类所需的文本输入/输出。
 *
 * 规则：
 * - `unknown` 可提升为 `chat`；
 * - `chat / multimodal-chat / audio-chat` 保持原聊天主类，只补齐文本模态；
 * - `image-generation / video-generation` 不允许借由 `text_generation` 被伪造成聊天模型。
 */
function applyTextGenerationSemantic(
  meta: ResolvedModelMeta,
  nextKind: ResolvedModelMeta['kind'],
  nextInputModalities: ReadonlyArray<ModelModality>,
  nextOutputModalities: ReadonlyArray<ModelModality>,
): { kind: ResolvedModelMeta['kind']; inputModalities: ModelModality[]; outputModalities: ModelModality[] } {
  if (meta.kind === 'image-generation' || meta.kind === 'video-generation') {
    return {
      kind: meta.kind,
      inputModalities: uniqStrings(nextInputModalities),
      outputModalities: uniqStrings(nextOutputModalities),
    }
  }

  if (nextKind === 'unknown') {
    return {
      kind: 'chat',
      inputModalities: uniqStrings([...nextInputModalities, 'text']),
      outputModalities: uniqStrings([...nextOutputModalities, 'text']),
    }
  }

  if (nextKind === 'chat' || nextKind === 'multimodal-chat' || nextKind === 'audio-chat') {
    return {
      kind: nextKind,
      inputModalities: uniqStrings([...nextInputModalities, 'text']),
      outputModalities: uniqStrings([...nextOutputModalities, 'text']),
    }
  }

  return {
    kind: nextKind,
    inputModalities: uniqStrings(nextInputModalities),
    outputModalities: uniqStrings(nextOutputModalities),
  }
}

/**
 * 把用户手动模型类型覆盖到系统识别结果上。
 *
 * 规则：
 * - `undefined` = 完全跟随系统；
 * - `[]` = 显式清空所有可编辑类型；
 * - 非空数组 = 完全覆盖可编辑层；
 * - `transportProtocol` 永远不受用户覆盖影响。
 */
export function applyUserModelTypes(
  meta: ResolvedModelMeta,
  manualModelTypes: ReadonlyArray<UserModelType> | undefined,
): ResolvedModelMeta {
  const normalized = normalizeUserModelTypes(manualModelTypes)
  if (normalized === undefined) return meta

  const protectedSemantic = getProtocolProtectedSemantic(meta.transportProtocol)
  if (protectedSemantic) {
    return {
      ...meta,
      ...protectedSemantic,
    }
  }

  const selected = new Set(normalized)
  if (selected.has('embedding')) {
    return { ...meta, ...createEmbeddingSemantic() }
  }
  if (selected.has('rerank')) {
    return { ...meta, ...createRerankSemantic() }
  }
  if (selected.has('image_generation')) {
    return { ...meta, ...createImageGenerationSemantic() }
  }

  let nextKind = meta.kind
  let nextInputModalities = uniqStrings(meta.inputModalities)
  let nextOutputModalities = uniqStrings(meta.outputModalities)
  const nextFeatures = new Set<ModelFeature>(removeEditableFeatures(meta.features))

  if (nextKind === 'embedding' || nextKind === 'rerank') {
    nextKind = 'unknown'
    nextInputModalities = []
    nextOutputModalities = []
  } else if (meta.features.includes('vision-input') && !selected.has('vision')) {
    nextInputModalities = nextInputModalities.filter((item) => item !== 'image')
    if (nextKind === 'multimodal-chat' && !nextInputModalities.some((item) => item !== 'text')) {
      nextKind = 'chat'
    }
  }

  if (selected.size > 0 && !selected.has('text_generation')) {
    const ensured = ensureTextIoIfNeeded(nextKind, nextInputModalities, nextOutputModalities)
    nextKind = ensured.kind
    nextInputModalities = ensured.inputModalities
    nextOutputModalities = ensured.outputModalities
  }

  if (selected.has('text_generation')) {
    const textGenerationSemantic = applyTextGenerationSemantic(
      meta,
      nextKind,
      nextInputModalities,
      nextOutputModalities,
    )
    nextKind = textGenerationSemantic.kind
    nextInputModalities = textGenerationSemantic.inputModalities
    nextOutputModalities = textGenerationSemantic.outputModalities
  }

  if (selected.has('vision')) {
    nextFeatures.add('vision-input')
    nextInputModalities = uniqStrings([...nextInputModalities, 'text', 'image'])
    nextOutputModalities = nextOutputModalities.length > 0 ? uniqStrings(nextOutputModalities) : ['text']
    if (nextKind === 'chat' || nextKind === 'unknown') nextKind = 'multimodal-chat'
  }
  if (selected.has('reasoning')) nextFeatures.add('reasoning')
  if (selected.has('function_calling')) nextFeatures.add('tool-call')
  if (selected.has('web_search')) nextFeatures.add('native-web-search')

  return {
    ...meta,
    kind: nextKind,
    inputModalities: uniqStrings(nextInputModalities),
    outputModalities: uniqStrings(nextOutputModalities),
    features: uniqStrings(Array.from(nextFeatures)),
  }
}
