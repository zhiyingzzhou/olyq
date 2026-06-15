/**
 * 说明：`provider-reasoning` AI 能力模块。
 *
 * 职责：
 * - 统一维护 provider-aware 推理配置的判型、回填、写回与运行时映射；
 * - 把“输入区按钮 / 助手编辑器表单 / 发送链路 / 当前 schema 清理”收敛到同一套真相源；
 * - 保证当前话题的 `modelParams` 成为推理控制真源，不再依赖顶层 `reasoningEffort`。
 *
 * 边界：
 * - 本文件只处理推理配置本身，不负责模型列表、store 副作用或 i18n 渲染；
 * - 所有 provider-specific 细节都以 `model + transportProtocol + modelParams` 为输入，
 *   不从 UI 组件或 adapter 内部偷偷读取其它状态。
 */
import type { TransportProtocol } from '@/lib/ai/types'
import { splitModel } from '@/lib/ai/provider-model-id'
import { isJsonValue } from '@/lib/ai/stream-chat-debug'
import { normalizeModelIdForRules } from '@/lib/ai/stream-chat-utils'
import { isGemini3ModelId } from '@/lib/ai/providers/policies/gemini'
import {
  buildModelParamsWithOpenRouterReasoning,
  type OpenRouterReasoningMenuValue,
  resolveOpenRouterReasoningState,
} from '@/lib/ai/openrouter-reasoning'
import { isPlainRecord } from '@/lib/utils/type-guards'

/** Provider-aware 推理控制大类。 */
export type ProviderReasoningKind = 'none' | 'boolean' | 'levels' | 'budget' | 'hybrid'

/** UI 与结构化表单共享的推理选择值。 */
export type ProviderReasoningValue =
  | 'off'
  | 'on'
  | 'default'
  | 'none'
  | 'adaptive'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

/** 输入区和设置弹窗共享的单选项。 */
export interface ProviderReasoningOption {
  /** 当前选项的稳定值。 */
  readonly value: ProviderReasoningValue
  /** 当前选项的 i18n key。 */
  readonly labelKey: string
}

/** 供 UI 和 runtime 共享的 provider-aware 推理描述。 */
export interface ProviderReasoningDescriptor {
  /** 当前模型的推理控制类型。 */
  readonly kind: ProviderReasoningKind
  /** 当前推理配置是否来自显式 `modelParams`。 */
  readonly configured: boolean
  /** 输入区/表单当前应显示的值。 */
  readonly value: ProviderReasoningValue
  /** 当前模型允许的离散选项。 */
  readonly options: ReadonlyArray<ProviderReasoningOption>
  /** 可选：预算值。 */
  readonly budget?: number
  /** 可选：OpenRouter 的 `exclude` 开关。 */
  readonly exclude?: boolean
  /** 可选：预算输入框的文案 key。 */
  readonly budgetLabelKey?: string
  /** 可选：预算输入框说明 key。 */
  readonly budgetDescriptionKey?: string
  /** 可选：额外帮助文案。 */
  readonly helperTextKeys?: ReadonlyArray<string>
  /** 可选：额外布尔开关文案。 */
  readonly excludeLabelKey?: string
  /** 可选：额外布尔开关说明。 */
  readonly excludeDescriptionKey?: string
}

/** 结构化表单保存时的推理草稿。 */
export interface ProviderReasoningDraft {
  /** 当前选中的离散值。 */
  readonly value: ProviderReasoningValue
  /** 可选：预算输入文本。 */
  readonly budgetText?: string
  /** 可选：OpenRouter exclude。 */
  readonly exclude?: boolean
}

/** 运行时 adapter 需要的推理配置片段。 */
export interface ProviderReasoningRuntimeOptions {
  /** 供 adapter 合并到 providerOptions 的片段。 */
  readonly providerOptions?: Record<string, unknown>
  /** Qwen `/think` / `/no_think` suffix 所需的开关。 */
  readonly suffixThinkingEnabled: boolean
}

type ReasoningProfileId =
  | 'none'
  | 'openrouter'
  | 'openai-chat'
  | 'openai-responses'
  | 'azure-chat'
  | 'azure-responses'
  | 'groq-qwen3'
  | 'groq-gpt-oss'
  | 'xai-chat-grok3-mini'
  | 'xai-responses'
  | 'gemini3'
  | 'gemini-budget'
  | 'deepseek'
  | 'dashscope'
  | 'siliconflow'
  | 'ollama-gpt-oss'
  | 'ollama-boolean'
  | 'anthropic'
  | 'cohere'
  | 'bedrock'

type ReasoningProfile = {
  readonly id: ReasoningProfileId
  readonly kind: ProviderReasoningKind
  readonly options: ReadonlyArray<ProviderReasoningOption>
  readonly budgetLabelKey?: string
  readonly budgetDescriptionKey?: string
  readonly helperTextKeys?: ReadonlyArray<string>
  readonly excludeLabelKey?: string
  readonly excludeDescriptionKey?: string
}

const OFF_OPTION = { value: 'off', labelKey: 'chat.reasoningOff' } as const
const ON_OPTION = { value: 'on', labelKey: 'chat.reasoningOn' } as const
const DEFAULT_OPTION = { value: 'default', labelKey: 'chat.reasoningDefault' } as const
const NONE_OPTION = { value: 'none', labelKey: 'chat.reasoningNone' } as const
const ADAPTIVE_OPTION = { value: 'adaptive', labelKey: 'chat.reasoningAdaptive' } as const
const MINIMAL_OPTION = { value: 'minimal', labelKey: 'chat.reasoningMinimal' } as const
const LOW_OPTION = { value: 'low', labelKey: 'chat.reasoningLow' } as const
const MEDIUM_OPTION = { value: 'medium', labelKey: 'chat.reasoningMedium' } as const
const HIGH_OPTION = { value: 'high', labelKey: 'chat.reasoningHigh' } as const
const XHIGH_OPTION = { value: 'xhigh', labelKey: 'chat.reasoningXHigh' } as const
const MAX_OPTION = { value: 'max', labelKey: 'chat.reasoningMax' } as const

const GENERIC_BUDGET_LABEL_KEY = 'topicSettings.reasoningBudget'
const GENERIC_BUDGET_DESCRIPTION_KEY = 'topicSettings.reasoningBudgetDescription'
const OPENROUTER_MENU_VALUE_SET = new Set<OpenRouterReasoningMenuValue>([
  'off',
  'low',
  'medium',
  'high',
  'xhigh',
  'minimal',
  'none',
])

/**
 * 解析预算输入框文本。
 *
 * @param raw - 用户输入的预算草稿。
 * @returns 合法时返回正整数，否则返回 `undefined`。
 */
export function parseReasoningBudgetDraft(raw: string | undefined): number | undefined {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined
}

/**
 * 判断预算输入框是否非法。
 *
 * @param raw - 当前预算草稿文本。
 * @returns `true` 表示非空但不是正整数。
 */
export function isReasoningBudgetDraftInvalid(raw: string | undefined): boolean {
  const trimmed = String(raw || '').trim()
  return trimmed.length > 0 && parseReasoningBudgetDraft(trimmed) === undefined
}

/**
 * 把任意值规整为普通对象副本。
 *
 * @param value - 原始对象。
 * @returns 可安全修改的浅拷贝。
 */
function clonePlainRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? { ...(value as Record<string, unknown>) } : {}
}

/**
 * 读取模型参数中的正整数预算。
 *
 * @param value - 任意输入值。
 * @returns 合法时返回正整数。
 */
function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : undefined
}

/**
 * 按 provider/model-family 解析当前模型使用的推理配置档案。
 *
 * @param args - 模型与 transport 信息。
 * @returns 当前模型的推理控制档案。
 */
function resolveReasoningProfile(args: {
  model: string
  transportProtocol?: TransportProtocol
}): ReasoningProfile {
  const { providerId, modelId } = splitModel(args.model)
  const modelIdLower = normalizeModelIdForRules(modelId)
  const transportProtocol = args.transportProtocol

  if (providerId === 'openrouter') {
    return {
      id: 'openrouter',
      kind: 'hybrid',
      options: [OFF_OPTION, LOW_OPTION, MEDIUM_OPTION, HIGH_OPTION, XHIGH_OPTION, MINIMAL_OPTION, NONE_OPTION],
      budgetLabelKey: 'topicSettings.openrouterReasoningMaxTokens',
      budgetDescriptionKey: 'topicSettings.openrouterReasoningMaxTokensDescription',
      helperTextKeys: [
        'topicSettings.openrouterReasoningOffDescription',
        'topicSettings.openrouterReasoningNoneDescription',
      ],
      excludeLabelKey: 'topicSettings.openrouterReasoningExclude',
      excludeDescriptionKey: 'topicSettings.openrouterReasoningExcludeDescription',
    }
  }

  if (providerId === 'openai') {
    return {
      id: transportProtocol === 'openai-responses' ? 'openai-responses' : 'openai-chat',
      kind: 'levels',
      options: [OFF_OPTION, NONE_OPTION, MINIMAL_OPTION, LOW_OPTION, MEDIUM_OPTION, HIGH_OPTION, XHIGH_OPTION],
    }
  }

  if (providerId === 'azure-openai') {
    return {
      // 当前 Azure adapter 仍走 openai-compatible Chat runtime；官方 Responses 能力未接入前，
      // 这里不把 `transportProtocol=openai-responses` 扩成 Olyq 已支持的 Responses 请求形态。
      id: 'azure-chat',
      kind: 'levels',
      options: [OFF_OPTION, NONE_OPTION, MINIMAL_OPTION, LOW_OPTION, MEDIUM_OPTION, HIGH_OPTION, XHIGH_OPTION],
    }
  }

  if (providerId === 'groq') {
    if (modelIdLower.includes('gpt-oss')) {
      return {
        id: 'groq-gpt-oss',
        kind: 'levels',
        options: [OFF_OPTION, LOW_OPTION, MEDIUM_OPTION, HIGH_OPTION],
      }
    }
    if (modelIdLower.includes('qwen3')) {
      return {
        id: 'groq-qwen3',
        kind: 'levels',
        options: [OFF_OPTION, NONE_OPTION, DEFAULT_OPTION],
      }
    }
    return { id: 'none', kind: 'none', options: [] }
  }

  if (providerId === 'xai') {
    if (transportProtocol === 'openai-responses' && modelIdLower.includes('multi-agent')) {
      return {
        id: 'xai-responses',
        kind: 'levels',
        options: [OFF_OPTION, LOW_OPTION, MEDIUM_OPTION, HIGH_OPTION],
      }
    }
    if (modelIdLower.includes('grok-3-mini')) {
      return {
        id: 'xai-chat-grok3-mini',
        kind: 'levels',
        options: [OFF_OPTION, LOW_OPTION, HIGH_OPTION],
      }
    }
    return { id: 'none', kind: 'none', options: [] }
  }

  if (providerId === 'gemini' || providerId === 'vertexai') {
    if (isGemini3ModelId(modelIdLower)) {
      return {
        id: 'gemini3',
        kind: 'hybrid',
        options: [OFF_OPTION, MINIMAL_OPTION, LOW_OPTION, MEDIUM_OPTION, HIGH_OPTION],
        budgetLabelKey: GENERIC_BUDGET_LABEL_KEY,
        budgetDescriptionKey: GENERIC_BUDGET_DESCRIPTION_KEY,
      }
    }
    return {
      id: 'gemini-budget',
      kind: 'budget',
      options: [OFF_OPTION, ON_OPTION],
      budgetLabelKey: GENERIC_BUDGET_LABEL_KEY,
      budgetDescriptionKey: GENERIC_BUDGET_DESCRIPTION_KEY,
    }
  }

  if (providerId === 'deepseek') {
    return {
      id: 'deepseek',
      kind: 'boolean',
      options: [OFF_OPTION, ON_OPTION],
    }
  }

  if (providerId === 'dashscope') {
    return {
      id: 'dashscope',
      kind: 'budget',
      options: [OFF_OPTION, ON_OPTION],
      budgetLabelKey: GENERIC_BUDGET_LABEL_KEY,
      budgetDescriptionKey: GENERIC_BUDGET_DESCRIPTION_KEY,
    }
  }

  if (providerId === 'siliconflow') {
    return {
      id: 'siliconflow',
      kind: 'budget',
      options: [OFF_OPTION, ON_OPTION],
      budgetLabelKey: GENERIC_BUDGET_LABEL_KEY,
      budgetDescriptionKey: GENERIC_BUDGET_DESCRIPTION_KEY,
    }
  }

  if (providerId === 'ollama') {
    if (modelIdLower.includes('gpt-oss')) {
      return {
        id: 'ollama-gpt-oss',
        kind: 'levels',
        options: [OFF_OPTION, LOW_OPTION, MEDIUM_OPTION, HIGH_OPTION],
      }
    }
    return {
      id: 'ollama-boolean',
      kind: 'boolean',
      options: [OFF_OPTION, ON_OPTION],
    }
  }

  if (providerId === 'anthropic' || providerId === 'vertex-anthropic') {
    return {
      id: 'anthropic',
      kind: 'budget',
      options: [OFF_OPTION, ON_OPTION],
      budgetLabelKey: GENERIC_BUDGET_LABEL_KEY,
      budgetDescriptionKey: GENERIC_BUDGET_DESCRIPTION_KEY,
    }
  }

  if (providerId === 'cohere') {
    return {
      id: 'cohere',
      kind: 'budget',
      options: [OFF_OPTION, ON_OPTION],
      budgetLabelKey: GENERIC_BUDGET_LABEL_KEY,
      budgetDescriptionKey: GENERIC_BUDGET_DESCRIPTION_KEY,
    }
  }

  if (providerId === 'aws-bedrock') {
    return {
      id: 'bedrock',
      kind: 'hybrid',
      options: [OFF_OPTION, ADAPTIVE_OPTION, LOW_OPTION, MEDIUM_OPTION, HIGH_OPTION, MAX_OPTION],
      budgetLabelKey: GENERIC_BUDGET_LABEL_KEY,
      budgetDescriptionKey: GENERIC_BUDGET_DESCRIPTION_KEY,
    }
  }

  return { id: 'none', kind: 'none', options: [] }
}

/**
 * 过滤并保留对象中的未知 JSON 字段。
 *
 * @param raw - 原始对象。
 * @param knownKeys - 已知字段集合。
 * @returns 仅包含未知 JSON 字段的新对象。
 */
function preserveUnknownJsonFields(
  raw: unknown,
  knownKeys: ReadonlyArray<string>,
): Record<string, unknown> {
  if (!isPlainRecord(raw)) return {}
  const next: Record<string, unknown> = {}
  const knownKeySet = new Set(knownKeys)
  for (const [key, value] of Object.entries(raw)) {
    if (knownKeySet.has(key) || !isJsonValue(value)) continue
    next[key] = value
  }
  return next
}

/**
 * 统一把模型参数清理成“无空对象”的稳定形态。
 *
 * @param modelParams - 待清理对象。
 * @returns 清理后的对象；若为空则返回 `undefined`。
 */
function finalizeModelParams(modelParams: Record<string, unknown>): Record<string, unknown> | undefined {
  const cleaned = Object.fromEntries(
    Object.entries(modelParams).filter(([, value]) => value !== undefined),
  )
  return Object.keys(cleaned).length > 0 ? cleaned : undefined
}

/**
 * 读取 OpenAI / Azure / xAI / Groq 等平台的 level 型配置。
 *
 * @param modelParams - 当前模型参数。
 * @returns 当前 level 及是否显式配置。
 */
function readLevelSetting(
  modelParams: Record<string, unknown> | undefined,
  key: 'reasoning_effort',
): { configured: boolean; value: ProviderReasoningValue } {
  const raw = modelParams?.[key]
  if (typeof raw !== 'string' || !raw.trim()) return { configured: false, value: 'off' }
  const value = raw.trim().toLowerCase() as ProviderReasoningValue
  if (
    value === 'none'
    || value === 'minimal'
    || value === 'low'
    || value === 'medium'
    || value === 'high'
    || value === 'xhigh'
    || value === 'default'
  ) {
    return { configured: true, value }
  }
  return { configured: false, value: 'off' }
}

/**
 * 读取 Responses 风格的 `reasoning` 对象。
 *
 * @param modelParams - 当前模型参数。
 * @returns 当前 level 及是否显式配置。
 */
function readReasoningObjectLevel(
  modelParams: Record<string, unknown> | undefined,
): { configured: boolean; value: ProviderReasoningValue } {
  const raw = modelParams?.reasoning
  if (!isPlainRecord(raw)) return { configured: false, value: 'off' }
  const effort = typeof raw.effort === 'string' ? raw.effort.trim().toLowerCase() : ''
  if (
    effort === 'none'
    || effort === 'minimal'
    || effort === 'low'
    || effort === 'medium'
    || effort === 'high'
    || effort === 'xhigh'
  ) {
    return { configured: true, value: effort as ProviderReasoningValue }
  }
  return { configured: true, value: 'medium' }
}

/**
 * 解析 provider-aware 推理描述。
 *
 * @param args - 模型、transport 与 `modelParams`。
 * @returns 供 UI / runtime 共用的推理描述；不支持时返回 `undefined`。
 */
export function resolveProviderReasoningDescriptor(args: {
  model: string
  transportProtocol?: TransportProtocol
  modelParams?: Record<string, unknown>
}): ProviderReasoningDescriptor | undefined {
  const profile = resolveReasoningProfile(args)
  const modelParams = isPlainRecord(args.modelParams) ? args.modelParams : undefined

  if (profile.kind === 'none') return undefined

  switch (profile.id) {
    case 'openrouter': {
      const rawReasoning = modelParams?.reasoning
      const configured = isPlainRecord(rawReasoning)
      const state = resolveOpenRouterReasoningState({ modelParams })
      return {
        kind: profile.kind,
        configured,
        value: state.effort,
        options: profile.options,
        budget: state.maxTokens,
        exclude: state.exclude,
        budgetLabelKey: profile.budgetLabelKey,
        budgetDescriptionKey: profile.budgetDescriptionKey,
        helperTextKeys: profile.helperTextKeys,
        excludeLabelKey: profile.excludeLabelKey,
        excludeDescriptionKey: profile.excludeDescriptionKey,
      }
    }
    case 'openai-chat':
    case 'azure-chat':
    case 'groq-qwen3':
    case 'groq-gpt-oss':
    case 'xai-chat-grok3-mini': {
      const state = readLevelSetting(modelParams, 'reasoning_effort')
      return {
        kind: profile.kind,
        configured: state.configured,
        value: state.value,
        options: profile.options,
      }
    }
    case 'openai-responses':
    case 'azure-responses':
    case 'xai-responses': {
      const state = readReasoningObjectLevel(modelParams)
      return {
        kind: profile.kind,
        configured: state.configured,
        value: state.value,
        options: profile.options,
      }
    }
    case 'gemini3':
    case 'gemini-budget': {
      const thinkingConfig = modelParams?.thinkingConfig
      const configured = isPlainRecord(thinkingConfig)
      if (!configured) {
        return {
          kind: profile.kind,
          configured: false,
          value: 'off',
          options: profile.options,
          budgetLabelKey: profile.budgetLabelKey,
          budgetDescriptionKey: profile.budgetDescriptionKey,
        }
      }
      const budget = readPositiveInteger((thinkingConfig as Record<string, unknown>).thinkingBudget)
      const levelRaw = typeof (thinkingConfig as Record<string, unknown>).thinkingLevel === 'string'
        ? (thinkingConfig as Record<string, unknown>).thinkingLevel
        : ''
      const value =
        profile.id === 'gemini3'
          ? (
              levelRaw === 'minimal'
              || levelRaw === 'low'
              || levelRaw === 'medium'
              || levelRaw === 'high'
                ? levelRaw as ProviderReasoningValue
                : budget === 0
                  ? 'off'
                  : 'medium'
            )
          : budget === 0
            ? 'off'
            : 'on'

      return {
        kind: profile.kind,
        configured: true,
        value,
        options: profile.options,
        ...(budget !== undefined ? { budget } : {}),
        budgetLabelKey: profile.budgetLabelKey,
        budgetDescriptionKey: profile.budgetDescriptionKey,
      }
    }
    case 'deepseek': {
      const thinking = modelParams?.thinking
      if (!isPlainRecord(thinking)) {
        return {
          kind: profile.kind,
          configured: false,
          value: 'off',
          options: profile.options,
        }
      }
      const type = typeof thinking.type === 'string' ? thinking.type : ''
      return {
        kind: profile.kind,
        configured: true,
        value: type === 'enabled' ? 'on' : 'off',
        options: profile.options,
      }
    }
    case 'dashscope':
    case 'siliconflow': {
      const hasEnableThinking = typeof modelParams?.enable_thinking === 'boolean'
      const budget = readPositiveInteger(modelParams?.thinking_budget)
      const configured = hasEnableThinking || budget !== undefined
      return {
        kind: profile.kind,
        configured,
        value: modelParams?.enable_thinking === true || budget !== undefined ? 'on' : 'off',
        options: profile.options,
        ...(budget !== undefined ? { budget } : {}),
        budgetLabelKey: profile.budgetLabelKey,
        budgetDescriptionKey: profile.budgetDescriptionKey,
      }
    }
    case 'ollama-gpt-oss': {
      const raw = modelParams?.think
      const value =
        raw === 'low' || raw === 'medium' || raw === 'high'
          ? raw
          : 'off'
      return {
        kind: profile.kind,
        configured: typeof raw === 'string',
        value,
        options: profile.options,
      }
    }
    case 'ollama-boolean': {
      const raw = modelParams?.think
      return {
        kind: profile.kind,
        configured: typeof raw === 'boolean',
        value: raw === true ? 'on' : 'off',
        options: profile.options,
      }
    }
    case 'anthropic': {
      const thinking = modelParams?.thinking
      if (!isPlainRecord(thinking)) {
        return {
          kind: profile.kind,
          configured: false,
          value: 'off',
          options: profile.options,
          budgetLabelKey: profile.budgetLabelKey,
          budgetDescriptionKey: profile.budgetDescriptionKey,
        }
      }
      const type = typeof thinking.type === 'string' ? thinking.type : ''
      const budget = readPositiveInteger(thinking.budgetTokens)
      return {
        kind: profile.kind,
        configured: true,
        value: type === 'enabled' || type === 'adaptive' ? 'on' : 'off',
        options: profile.options,
        ...(budget !== undefined ? { budget } : {}),
        budgetLabelKey: profile.budgetLabelKey,
        budgetDescriptionKey: profile.budgetDescriptionKey,
      }
    }
    case 'cohere': {
      const thinking = modelParams?.thinking
      if (!isPlainRecord(thinking)) {
        return {
          kind: profile.kind,
          configured: false,
          value: 'off',
          options: profile.options,
          budgetLabelKey: profile.budgetLabelKey,
          budgetDescriptionKey: profile.budgetDescriptionKey,
        }
      }
      const type = typeof thinking.type === 'string' ? thinking.type : ''
      const budget = readPositiveInteger(thinking.tokenBudget)
      return {
        kind: profile.kind,
        configured: true,
        value: type === 'enabled' ? 'on' : 'off',
        options: profile.options,
        ...(budget !== undefined ? { budget } : {}),
        budgetLabelKey: profile.budgetLabelKey,
        budgetDescriptionKey: profile.budgetDescriptionKey,
      }
    }
    case 'bedrock': {
      const reasoningConfig = modelParams?.reasoningConfig
      if (!isPlainRecord(reasoningConfig)) {
        return {
          kind: profile.kind,
          configured: false,
          value: 'off',
          options: profile.options,
          budgetLabelKey: profile.budgetLabelKey,
          budgetDescriptionKey: profile.budgetDescriptionKey,
        }
      }
      const type = typeof reasoningConfig.type === 'string' ? reasoningConfig.type : ''
      const effort = typeof reasoningConfig.maxReasoningEffort === 'string'
        ? reasoningConfig.maxReasoningEffort
        : ''
      const budget = readPositiveInteger(reasoningConfig.budgetTokens)
      const value =
        type === 'adaptive'
          ? 'adaptive'
          : effort === 'low' || effort === 'medium' || effort === 'high' || effort === 'max'
            ? effort as ProviderReasoningValue
            : type === 'disabled'
              ? 'off'
              : 'medium'

      return {
        kind: profile.kind,
        configured: true,
        value,
        options: profile.options,
        ...(budget !== undefined ? { budget } : {}),
        budgetLabelKey: profile.budgetLabelKey,
        budgetDescriptionKey: profile.budgetDescriptionKey,
      }
    }
    default:
      return undefined
  }
}

/**
 * 按 provider-aware 草稿写回当前话题的 `modelParams`。
 *
 * @param args - 当前模型、transport 与草稿值。
 * @returns 新的 `modelParams`；若整对象为空则返回 `undefined`。
 */
export function buildModelParamsWithProviderReasoning(args: {
  model: string
  transportProtocol?: TransportProtocol
  modelParams?: Record<string, unknown>
  draft: ProviderReasoningDraft
}): Record<string, unknown> | undefined {
  const profile = resolveReasoningProfile(args)
  const nextModelParams = clonePlainRecord(args.modelParams)
  const budget = parseReasoningBudgetDraft(args.draft.budgetText)

  switch (profile.id) {
    case 'openrouter':
      if (!OPENROUTER_MENU_VALUE_SET.has(args.draft.value as OpenRouterReasoningMenuValue)) {
        return finalizeModelParams(nextModelParams)
      }
      return buildModelParamsWithOpenRouterReasoning({
        modelParams: nextModelParams,
        effort: args.draft.value as OpenRouterReasoningMenuValue,
        exclude: args.draft.exclude,
        maxTokens: budget,
      })
    case 'openai-chat':
    case 'azure-chat':
    case 'groq-qwen3':
    case 'groq-gpt-oss':
    case 'xai-chat-grok3-mini': {
      if (args.draft.value === 'off') {
        delete nextModelParams.reasoning_effort
      } else {
        nextModelParams.reasoning_effort = args.draft.value
      }
      return finalizeModelParams(nextModelParams)
    }
    case 'openai-responses':
    case 'azure-responses':
    case 'xai-responses': {
      if (args.draft.value === 'off') {
        delete nextModelParams.reasoning
        return finalizeModelParams(nextModelParams)
      }
      const current = preserveUnknownJsonFields(nextModelParams.reasoning, ['effort'])
      current.effort = args.draft.value
      nextModelParams.reasoning = current
      return finalizeModelParams(nextModelParams)
    }
    case 'gemini3':
    case 'gemini-budget': {
      const current = preserveUnknownJsonFields(nextModelParams.thinkingConfig, ['thinkingBudget', 'thinkingLevel', 'includeThoughts'])
      if (args.draft.value === 'off') {
        current.thinkingBudget = 0
        delete current.thinkingLevel
      } else {
        delete current.thinkingBudget
        if (budget !== undefined) current.thinkingBudget = budget
        if (profile.id === 'gemini3' && args.draft.value !== 'on') {
          current.thinkingLevel = args.draft.value
        } else {
          delete current.thinkingLevel
        }
      }
      nextModelParams.thinkingConfig = current
      return finalizeModelParams(nextModelParams)
    }
    case 'deepseek': {
      const current = preserveUnknownJsonFields(nextModelParams.thinking, ['type'])
      current.type = args.draft.value === 'on' ? 'enabled' : 'disabled'
      nextModelParams.thinking = current
      return finalizeModelParams(nextModelParams)
    }
    case 'dashscope':
    case 'siliconflow': {
      nextModelParams.enable_thinking = args.draft.value === 'on'
      if (budget !== undefined) {
        nextModelParams.thinking_budget = budget
      } else {
        delete nextModelParams.thinking_budget
      }
      return finalizeModelParams(nextModelParams)
    }
    case 'ollama-gpt-oss': {
      if (args.draft.value === 'off') {
        nextModelParams.think = false
      } else {
        nextModelParams.think = args.draft.value
      }
      return finalizeModelParams(nextModelParams)
    }
    case 'ollama-boolean': {
      nextModelParams.think = args.draft.value === 'on'
      return finalizeModelParams(nextModelParams)
    }
    case 'anthropic': {
      const current = preserveUnknownJsonFields(nextModelParams.thinking, ['type', 'budgetTokens'])
      current.type = args.draft.value === 'on' ? 'enabled' : 'disabled'
      if (budget !== undefined) current.budgetTokens = Math.max(1024, budget)
      else delete current.budgetTokens
      nextModelParams.thinking = current
      return finalizeModelParams(nextModelParams)
    }
    case 'cohere': {
      const current = preserveUnknownJsonFields(nextModelParams.thinking, ['type', 'tokenBudget'])
      current.type = args.draft.value === 'on' ? 'enabled' : 'disabled'
      if (budget !== undefined) current.tokenBudget = Math.max(256, budget)
      else delete current.tokenBudget
      nextModelParams.thinking = current
      return finalizeModelParams(nextModelParams)
    }
    case 'bedrock': {
      const current = preserveUnknownJsonFields(nextModelParams.reasoningConfig, ['type', 'budgetTokens', 'maxReasoningEffort'])
      if (args.draft.value === 'off') {
        current.type = 'disabled'
        delete current.maxReasoningEffort
      } else if (args.draft.value === 'adaptive') {
        current.type = 'adaptive'
        delete current.maxReasoningEffort
      } else {
        current.type = 'enabled'
        current.maxReasoningEffort = args.draft.value
      }
      if (budget !== undefined) current.budgetTokens = budget
      else delete current.budgetTokens
      nextModelParams.reasoningConfig = current
      return finalizeModelParams(nextModelParams)
    }
    default:
      return finalizeModelParams(nextModelParams)
  }
}

/**
 * 根据 provider-native `modelParams` 生成 runtime adapter 所需的 reasoning 片段。
 *
 * @param args - 模型、transport 与 `modelParams`。
 * @returns providerOptions 片段与 suffix 开关。
 */
export function buildProviderReasoningRuntimeOptions(args: {
  model: string
  transportProtocol?: TransportProtocol
  modelParams?: Record<string, unknown>
}): ProviderReasoningRuntimeOptions {
  const descriptor = resolveProviderReasoningDescriptor(args)
  const modelParams = isPlainRecord(args.modelParams) ? args.modelParams : undefined
  if (!descriptor) {
    return { suffixThinkingEnabled: false }
  }

  const suffixThinkingEnabled = descriptor.value !== 'off'
  if (!descriptor.configured) {
    return { suffixThinkingEnabled }
  }

  switch (resolveReasoningProfile(args).id) {
    case 'openrouter': {
      if (isPlainRecord(modelParams?.reasoning)) {
        return {
          providerOptions: {
            reasoning: clonePlainRecord(modelParams?.reasoning),
          },
          suffixThinkingEnabled,
        }
      }
      return { suffixThinkingEnabled }
    }
    case 'openai-chat':
    case 'azure-chat':
    case 'groq-qwen3':
    case 'groq-gpt-oss':
    case 'xai-chat-grok3-mini':
      return {
        providerOptions: typeof modelParams?.reasoning_effort === 'string'
          ? { reasoningEffort: modelParams.reasoning_effort }
          : undefined,
        suffixThinkingEnabled,
      }
    case 'openai-responses':
    case 'azure-responses':
    case 'xai-responses': {
      const effort = isPlainRecord(modelParams?.reasoning) && typeof modelParams.reasoning.effort === 'string'
        ? modelParams.reasoning.effort
        : undefined
      return {
        providerOptions: effort ? { reasoningEffort: effort } : undefined,
        suffixThinkingEnabled,
      }
    }
    case 'gemini3':
    case 'gemini-budget': {
      const current = clonePlainRecord(modelParams?.thinkingConfig)
      if (Object.keys(current).length < 1) {
        return { suffixThinkingEnabled }
      }
      current.includeThoughts = true
      return {
        providerOptions: { thinkingConfig: current },
        suffixThinkingEnabled,
      }
    }
    case 'deepseek':
      return {
        providerOptions: isPlainRecord(modelParams?.thinking)
          ? { thinking: clonePlainRecord(modelParams?.thinking) }
          : undefined,
        suffixThinkingEnabled,
      }
    case 'dashscope':
    case 'siliconflow': {
      const next: Record<string, unknown> = {}
      if (typeof modelParams?.enable_thinking === 'boolean') next.enable_thinking = modelParams.enable_thinking
      if (typeof modelParams?.thinking_budget === 'number') next.thinking_budget = modelParams.thinking_budget
      return {
        providerOptions: Object.keys(next).length > 0 ? next : undefined,
        suffixThinkingEnabled,
      }
    }
    case 'ollama-gpt-oss':
    case 'ollama-boolean':
      return {
        providerOptions: 'think' in (modelParams ?? {}) ? { think: modelParams?.think } : undefined,
        suffixThinkingEnabled,
      }
    case 'anthropic':
      return {
        providerOptions: isPlainRecord(modelParams?.thinking)
          ? { thinking: clonePlainRecord(modelParams?.thinking) }
          : undefined,
        suffixThinkingEnabled,
      }
    case 'cohere':
      return {
        providerOptions: isPlainRecord(modelParams?.thinking)
          ? { thinking: clonePlainRecord(modelParams?.thinking) }
          : undefined,
        suffixThinkingEnabled,
      }
    case 'bedrock':
      return {
        providerOptions: isPlainRecord(modelParams?.reasoningConfig)
          ? { reasoningConfig: clonePlainRecord(modelParams?.reasoningConfig) }
          : undefined,
        suffixThinkingEnabled,
      }
    default:
      return { suffixThinkingEnabled }
  }
}
