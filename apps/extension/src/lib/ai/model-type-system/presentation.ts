/**
 * 说明：`presentation` AI 能力模块。
 *
 * 职责：
 * - 承载 `presentation` 相关的当前文件实现与模块边界；
 * - 对外暴露 `PrimaryKindKey`、`SystemSemanticBadgeKey`、`DisplayModelBadgeKey` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型类型系统展示层工具。
 *
 * 为什么存在：
 * - 扩展端现在必须严格区分“主类”“用户可见模型类型”和“系统内部语义”三层；
 * - 主类层固定为当前 `ModelKind` 对应的 8 大类，用于详情展示与后续主类筛选；
 * - 用户可见层现在固定为 8 类模型类型：
 *   `text_generation / image_generation / vision / reasoning / function_calling / web_search / embedding / rerank`
 * - 系统内部仍然保留 `kind + capabilities/features`，用于只读展示、调试与运行时解释；
 * - 本文件的职责就是把这三层分别投影出来，避免 UI 再把不同层级的概念混在一起。
 */

import type { ModelFeature, ModelKind, UserModelType } from '../types'
import type { ModelCapabilityKey } from './types'
import { toModelCapabilities } from './utils'
import { uniqStrings } from './shared/normalize'
import { USER_MODEL_TYPE_ORDER } from './user-override'

/**
 * 主类键。
 *
 * 说明：
 * - 主类层直接对齐系统内部 `ModelKind`；
 * - 它表达“一台模型最主要是什么”，后续主类筛选、详情展示都统一基于这层完成。
 */
export type PrimaryKindKey = ModelKind

/**
 * 系统语义 badge 键。
 *
 * 说明：
 * - 这是一组“只允许系统层使用”的展示键；
 * - 它可以包含 `image-generation`、`audio-chat`、`structured_output` 这类不应出现在用户模型类型里的值；
 * - 调用方必须明确把它放在“系统识别主类/系统识别能力”语境里，禁止再直接当成“模型类型”透给用户。
 */
export type SystemSemanticBadgeKey = ModelKind | ModelCapabilityKey

/**
 * 列表行右侧 badge 的展示键。
 *
 * 说明：
 * - 行内展示既要承接用户模型类型，也要在必要时回补系统主类；
 * - 因此这里单独定义一层“显示专用键”，避免把系统语义和用户类型直接混为同一个概念。
 */
export type DisplayModelBadgeKey = UserModelType | SystemSemanticBadgeKey

/**
 * 主类展示顺序。
 *
 * 说明：
 * - 这里固定为当前扩展端的 8 大主类；
 * - 后续若要做主类筛选，直接复用这一顺序，不再由 UI 自己临时排序。
 */
export const PRIMARY_KIND_ORDER: ReadonlyArray<PrimaryKindKey> = [
  'chat',
  'multimodal-chat',
  'audio-chat',
  'transcription',
  'speech-generation',
  'moderation',
  'image-generation',
  'video-generation',
  'embedding',
  'rerank',
  'unknown',
] as const

/**
 * 系统语义 badge 展示顺序。
 *
 * 说明：
 * - 前半段是系统主类；
 * - 后半段是系统能力；
 * - `unknown` 永远放最后，便于维护者快速看出当前模型仍未识别完成。
 */
export const SYSTEM_SEMANTIC_BADGE_ORDER: ReadonlyArray<SystemSemanticBadgeKey> = [
  'chat',
  'multimodal-chat',
  'audio-chat',
  'transcription',
  'speech-generation',
  'moderation',
  'image-generation',
  'video-generation',
  'embedding',
  'rerank',
  'vision',
  'reasoning',
  'function_calling',
  'web_search',
  'audio_model',
  'structured_output',
  'image_output',
  'audio_input',
  'audio_output',
  'file_input',
  'unknown',
] as const

/**
 * 将内部语义键归一化到 UI 图标/文案 token。
 *
 * 为什么需要：
 * - UI 历史上同时存在 `function_calling` / `tool-call`、`web_search` / `native-web-search` 这类双命名；
 * - 图标、颜色和 i18n 统一吃一套展示 token 才不会再出现“图标没了，只剩 raw value”。
 *
 * 约束：
 * - 这里只做显示映射，不参与任何运行时语义、协议路由和 registry 解析。
 */
export function toPresentationToken(key: SystemSemanticBadgeKey | UserModelType | string): string {
  switch (String(key || '').trim().toLowerCase()) {
    case 'text_generation':
      return 'chat'
    case 'image_generation':
      return 'image-generation'
    case 'function_calling':
      return 'tool-call'
    case 'web_search':
      return 'native-web-search'
    case 'structured_output':
      return 'structured-output'
    case 'image_output':
      return 'image-output'
    case 'audio_input':
      return 'audio-input'
    case 'audio_output':
      return 'audio-output'
    case 'audio_model':
      return 'audio-model'
    case 'file_input':
      return 'file-input'
    default:
      return String(key || '').trim().toLowerCase()
  }
}

/** 供展示层函数消费的最小语义输入视图。 */
type CapabilityLike = {
  /** 系统识别出的模型主类。 */
  readonly kind: ModelKind
  /** provider / registry 层保存的原始 feature 集合。 */
  readonly features?: ReadonlyArray<ModelFeature>
  /** 已投影成能力键的能力集合，可与 `features` 互相补充。 */
  readonly capabilities?: ReadonlyArray<ModelCapabilityKey>
}

/** 提取模型当前主类。 */
export function derivePrimaryKindKey(meta: CapabilityLike): PrimaryKindKey {
  return meta.kind
}

/**
 * 构造主类 badge 列表。
 *
 * 说明：
 * - 当前主类层只有一个值，但这里仍返回数组；
 * - 这样详情弹窗、后续主类筛选 chips、只读元数据都能复用同一渲染路径。
 */
export function derivePrimaryKindBadgeKeys(meta: CapabilityLike): PrimaryKindKey[] {
  return [derivePrimaryKindKey(meta)]
}

/**
 * 从系统主类与能力反推出“用户可见的 8 类模型类型”。
 *
 * 说明：
 * - 这里的结果专门给模型选择器筛选、模型管理左侧手动类型区、列表 badge 这些“用户层”入口使用；
 * - `text_generation` 统一表示 chat / multimodal-chat / audio-chat 这三类可承担文字对话主任务的模型；
 * - `image_generation` 直接对应系统主类 `image-generation`，让图片生成进入统一的用户模型类型与筛选体系；
 * - `video-generation`、`structured_output` 等系统语义仍不会进入这里；
 * - 这样用户看到的“模型类型”永远只有一套，避免再次出现双枚举心智负担。
 */
export function deriveSystemModelTypes(meta: CapabilityLike): UserModelType[] {
  if (meta.kind === 'chat' || meta.kind === 'multimodal-chat' || meta.kind === 'audio-chat') {
    const capabilitySet = new Set<ModelCapabilityKey>([
      ...(meta.capabilities ?? []),
      ...toModelCapabilities(meta.features),
    ])
    const selected = new Set<UserModelType>(['text_generation'])

    if (capabilitySet.has('vision') || meta.kind === 'multimodal-chat') selected.add('vision')
    if (capabilitySet.has('reasoning')) selected.add('reasoning')
    if (capabilitySet.has('function_calling')) selected.add('function_calling')
    if (capabilitySet.has('web_search')) selected.add('web_search')

    return USER_MODEL_TYPE_ORDER.filter((type) => selected.has(type))
  }
  if (meta.kind === 'image-generation') return ['image_generation']
  if (meta.kind === 'embedding') return ['embedding']
  if (meta.kind === 'rerank') return ['rerank']
  return []
}

/**
 * 构造系统语义 badge 列表。
 *
 * 说明：
 * - 这组结果只给“系统识别主类/系统识别能力”之类的只读区域使用；
 * - 它会保留 `image-generation`、`audio-chat` 等高阶主类，方便维护者核对系统识别是否正确；
 * - 但它不会再额外把 8 类用户模型类型混进来，避免与用户层展示混层。
 */
export function getSystemSemanticBadgeKeys(meta: CapabilityLike): SystemSemanticBadgeKey[] {
  const capabilityKeys = uniqStrings<ModelCapabilityKey>([
    ...(meta.capabilities ?? []),
    ...toModelCapabilities(meta.features),
  ])
  const out = new Set<SystemSemanticBadgeKey>()

  out.add(meta.kind)
  for (const item of capabilityKeys) out.add(item)

  return SYSTEM_SEMANTIC_BADGE_ORDER.filter((item) => out.has(item))
}

const DISPLAY_FALLBACK_PRIMARY_KINDS = new Set<SystemSemanticBadgeKey>([
  'video-generation',
  'transcription',
  'speech-generation',
  'moderation',
])

const DISPLAY_FALLBACK_SYSTEM_SEMANTICS = new Set<SystemSemanticBadgeKey>([
  'audio_model',
  'transcription',
  'moderation',
])

/**
 * 构造列表行右侧实际显示的 badge。
 *
 * 规则：
 * - 先显示用户模型类型；
 * - 若当前模型没有任何用户模型类型，再按需回补系统主类；
 * - 当前只对 `video-generation` 做回补；`image-generation` 已经正式进入用户模型类型体系，不再依赖兜底。
 */
export function deriveDisplayModelBadgeKeys(meta: CapabilityLike): DisplayModelBadgeKey[] {
  const userModelTypes = deriveSystemModelTypes(meta)
  if (userModelTypes.length > 0) return userModelTypes
  if (DISPLAY_FALLBACK_PRIMARY_KINDS.has(meta.kind)) return [meta.kind]
  const systemSemanticKeys = getSystemSemanticBadgeKeys(meta).filter((item) => DISPLAY_FALLBACK_SYSTEM_SEMANTICS.has(item))
  if (systemSemanticKeys.length > 0) return systemSemanticKeys
  return []
}

/** 对系统语义 badge 做稳定排序。 */
export function sortSystemSemanticBadgeKeys(
  keys: ReadonlyArray<SystemSemanticBadgeKey>,
): SystemSemanticBadgeKey[] {
  const rank = new Map(SYSTEM_SEMANTIC_BADGE_ORDER.map((item, index) => [item, index] as const))
  return [...uniqStrings(keys)].sort((left, right) => {
    const leftRank = rank.get(left)
    const rightRank = rank.get(right)
    if (typeof leftRank === 'number' && typeof rightRank === 'number') return leftRank - rightRank
    if (typeof leftRank === 'number') return -1
    if (typeof rightRank === 'number') return 1
    return left.localeCompare(right)
  })
}

/**
 * 面向 UI 的系统识别摘要。
 *
 * 说明：
 * - `primaryKind` 直接用于“系统识别主类”；
 * - `modelTypes` 是系统自动推导出的 8 类用户模型类型，可用于“跟随系统识别”的说明；
 * - `systemCapabilities` 表示系统识别到的能力集合，专供只读区展示。
 */
export function getSystemCapabilitySummary(meta: CapabilityLike): {
  readonly primaryKind: PrimaryKindKey
  readonly modelTypes: ReadonlyArray<UserModelType>
  readonly systemCapabilities: ReadonlyArray<ModelCapabilityKey>
} {
  const modelTypes = deriveSystemModelTypes(meta)
  const capabilityKeys = uniqStrings<ModelCapabilityKey>([
    ...(meta.capabilities ?? []),
    ...toModelCapabilities(meta.features),
  ])
  return {
    primaryKind: meta.kind,
    modelTypes,
    systemCapabilities: capabilityKeys,
  }
}
