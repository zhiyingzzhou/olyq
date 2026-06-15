/**
 * 说明：`openrouter-reasoning` AI 能力模块。
 *
 * 职责：
 * - 统一收敛 OpenRouter `reasoning` 对象的解析、回填、写回与请求映射；
 * - 为输入区与话题设置弹窗提供同一套 provider-aware 推理状态模型；
 * - 为发送链路提供官方 `reasoning` 对象的兜底构建逻辑。
 *
 * 边界：
 * - 本文件只处理 OpenRouter 专属 reasoning 语义，不参与其它 Provider 的推理参数映射；
 * - 不负责持久化写入 assistant store，调用方只传入当前 `modelParams` 快照并接收新对象。
 */
import { splitModel } from '@/lib/ai/provider-model-id'
import { isJsonValue } from '@/lib/ai/stream-chat-debug'
import { isPlainRecord } from '@/lib/utils/type-guards'

/** OpenRouter 官方 `reasoning.effort` 可接受值。 */
export const OPENROUTER_REASONING_EFFORTS = [
  'low',
  'medium',
  'high',
  'xhigh',
  'minimal',
  'none',
] as const

/** OpenRouter 输入区与表单使用的 reasoning 菜单值。 */
export const OPENROUTER_REASONING_MENU_VALUES = [
  'off',
  ...OPENROUTER_REASONING_EFFORTS,
] as const

/** OpenRouter 官方 `reasoning.effort` 类型。 */
export type OpenRouterReasoningEffort = (typeof OPENROUTER_REASONING_EFFORTS)[number]

/** OpenRouter UI 中使用的 reasoning 选择值。 */
export type OpenRouterReasoningMenuValue = (typeof OPENROUTER_REASONING_MENU_VALUES)[number]

/** 通用推理强度类型。 */
export type GenericReasoningEffort = 'low' | 'medium' | 'high'

/** OpenRouter reasoning 表单/输入区使用的轻量视图状态。 */
export interface OpenRouterReasoningState {
  /** 当前 UI 应展示的 effort 值。 */
  readonly effort: OpenRouterReasoningMenuValue
  /** 是否排除 reasoning token。 */
  readonly exclude: boolean
  /** reasoning 最大预算；为空表示移除。 */
  readonly maxTokens?: number
}

const OPENROUTER_REASONING_KNOWN_KEYS = new Set(['enabled', 'effort', 'exclude', 'max_tokens'])

/**
 * 判断当前模型是否属于 OpenRouter provider。
 *
 * @param model - 当前模型 ID（`providerId/modelId`）。
 * @returns 若 providerId 为 `openrouter` 则返回 `true`。
 */
export function isOpenRouterModel(model: string | undefined): boolean {
  return splitModel(String(model || '')).providerId === 'openrouter'
}

/**
 * 判断值是否为 OpenRouter 官方支持的 effort。
 *
 * @param value - 待判断值。
 * @returns 仅当值属于官方 effort 枚举时返回 `true`。
 */
export function isOpenRouterReasoningEffort(value: unknown): value is OpenRouterReasoningEffort {
  return typeof value === 'string'
    && (OPENROUTER_REASONING_EFFORTS as readonly string[]).includes(value)
}

/**
 * 将任意值规整为正整数 budget。
 *
 * @param value - 原始值。
 * @returns 合法时返回正整数，否则返回 `undefined`。
 */
function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : undefined
}

/**
 * 规范化 OpenRouter reasoning 对象。
 *
 * @remarks
 * - 已知字段会按官方约束校验；
 * - 未知字段只要仍是 JSON 值就会保留，避免破坏手写的高级配置；
 * - 非对象或完全不可用的输入会被丢弃。
 *
 * @param raw - 原始 `modelParams.reasoning` 值。
 * @returns 规范化后的 reasoning 对象；若无法安全使用则返回 `undefined`。
 */
function normalizeOpenRouterReasoning(
  raw: unknown,
): Record<string, unknown> | undefined {
  if (!isPlainRecord(raw)) return undefined

  const next: Record<string, unknown> = {}
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : undefined
  const exclude = typeof raw.exclude === 'boolean' ? raw.exclude : undefined
  const effort = isOpenRouterReasoningEffort(raw.effort) ? raw.effort : undefined
  const maxTokens = readPositiveInteger(raw.max_tokens)

  if (enabled !== undefined) next.enabled = enabled
  if (exclude !== undefined) next.exclude = exclude
  if (effort !== undefined) next.effort = effort
  if (maxTokens !== undefined) next.max_tokens = maxTokens

  for (const [key, value] of Object.entries(raw)) {
    if (OPENROUTER_REASONING_KNOWN_KEYS.has(key)) continue
    if (!isJsonValue(value)) continue
    next[key] = value
  }

  return Object.keys(next).length > 0 ? next : undefined
}

/**
 * 从 `modelParams.reasoning` 解析 OpenRouter UI 状态。
 *
 * @remarks
 * - `enabled: false` 优先视为 `off`；
 * - 没有显式 `effort` 但有 `enabled: true`、`max_tokens` 或其它 reasoning 字段时，视为 `medium`；
 * - 只有在完全不存在 OpenRouter reasoning 对象时，才会回退到通用 `reasoningEffort`。
 *
 * @param args - 模型参数与可选的通用推理强度回退值。
 * @returns 供输入区或表单直接消费的轻量状态。
 */
export function resolveOpenRouterReasoningState(args: {
  modelParams?: Record<string, unknown>
  fallbackReasoningEffort?: GenericReasoningEffort
}): OpenRouterReasoningState {
  const reasoning = normalizeOpenRouterReasoning(args.modelParams?.reasoning)
  if (!reasoning) {
    return {
      effort: args.fallbackReasoningEffort ?? 'off',
      exclude: false,
    }
  }

  const enabled = reasoning.enabled
  const effort = isOpenRouterReasoningEffort(reasoning.effort) ? reasoning.effort : undefined
  const maxTokens = readPositiveInteger(reasoning.max_tokens)
  const exclude = reasoning.exclude === true

  if (enabled === false) {
    return { effort: 'off', exclude, ...(maxTokens !== undefined ? { maxTokens } : {}) }
  }

  if (effort) {
    return { effort, exclude, ...(maxTokens !== undefined ? { maxTokens } : {}) }
  }

  return {
    effort: 'medium',
    exclude,
    ...(maxTokens !== undefined ? { maxTokens } : {}),
  }
}

/**
 * 把 OpenRouter reasoning UI 状态写回到当前话题的 `modelParams`。
 *
 * @remarks
 * - `off` 会移除整支 `modelParams.reasoning`；
 * - 其它 effort 会只重写已知字段，并保留 reasoning 对象中的未知 JSON 字段；
 * - 同级其它 `modelParams` 字段始终保持不变。
 *
 * @param args - 当前 modelParams 与新的 reasoning 状态。
 * @returns 新的 `modelParams`；若已无任何字段则返回 `undefined`。
 */
export function buildModelParamsWithOpenRouterReasoning(args: {
  modelParams?: Record<string, unknown>
  effort: OpenRouterReasoningMenuValue
  exclude?: boolean
  maxTokens?: number
}): Record<string, unknown> | undefined {
  const nextModelParams = isPlainRecord(args.modelParams) ? { ...args.modelParams } : {}
  if (args.effort === 'off') {
    delete nextModelParams.reasoning
    return Object.keys(nextModelParams).length > 0 ? nextModelParams : undefined
  }

  const currentReasoning = normalizeOpenRouterReasoning(nextModelParams.reasoning)
  const nextReasoning: Record<string, unknown> = {}
  if (currentReasoning) {
    for (const [key, value] of Object.entries(currentReasoning)) {
      if (OPENROUTER_REASONING_KNOWN_KEYS.has(key)) continue
      nextReasoning[key] = value
    }
  }

  nextReasoning.effort = args.effort
  if (args.exclude === true) nextReasoning.exclude = true
  const maxTokens = readPositiveInteger(args.maxTokens)
  if (maxTokens !== undefined) nextReasoning.max_tokens = maxTokens

  nextModelParams.reasoning = nextReasoning
  return nextModelParams
}

/**
 * 为 OpenRouter 构建最终要发送的 providerOptions.reasoning。
 *
 * @remarks
 * 优先级固定为：
 * 1. 合法的当前话题 `modelParams.reasoning`
 * 2. 通用 `reasoningEffort`
 *
 * @param args - 当前 `modelParams` 与通用推理强度。
 * @returns 可直接放入 OpenRouter providerOptions 的 `reasoning` 对象。
 */
export function resolveOpenRouterReasoningProviderOption(args: {
  modelParams?: Record<string, unknown>
  reasoningEffort?: GenericReasoningEffort
}): Record<string, unknown> | undefined {
  const reasoning = normalizeOpenRouterReasoning(args.modelParams?.reasoning)
  if (reasoning) {
    return reasoning
  }

  if (args.reasoningEffort) {
    return { effort: args.reasoningEffort }
  }

  return undefined
}
