/**
 * 说明：`topic-generation-settings` 纯逻辑模块。
 *
 * 职责：
 * - 定义 topic-owned 生成参数草稿结构；
 * - 提供 modelParams / maxTokens 解析、reasoning 回填和保存 patch 构建；
 * - 让话题设置与发送解析共享同一套字段归属和校验语义。
 *
 * 边界：
 * - 本文件不渲染 UI、不读写 store；
 * - 只输出可合并到 `TopicConversation` / `Topic` 的当前 schema 字段。
 */
import type { ModelOption } from '@/hooks/useModelOptions';
import type { TransportProtocol } from '@/lib/ai/types';
import type { ProviderReasoningValue } from '@/lib/ai/provider-reasoning';
import { isReasoningBudgetDraftInvalid, resolveProviderReasoningDescriptor } from '@/lib/ai/provider-reasoning';
import { isPlainRecord } from '@/lib/utils/type-guards';
import type { TopicConversation } from '@/types/chat';

/** 话题生成参数可编辑字段。 */
export type TopicGenerationSettingsFields = Pick<
  TopicConversation,
  'model' | 'temperature' | 'topP' | 'maxTokens' | 'contextLength' | 'modelParams'
>;

/** 话题生成参数默认值快照。 */
export interface TopicGenerationDefaults {
  /** 默认模型。 */
  model: string;
  /** 默认温度。 */
  temperature: number;
  /** 默认 Top P。 */
  topP: number;
  /** 默认最大输出 tokens。 */
  maxTokens: number;
  /** 默认上下文条数。 */
  contextLength: number;
}

/** 话题生成参数表单草稿。 */
export interface TopicGenerationSettingsDraft {
  /** topic 级模型 override；空字符串表示继续使用全局默认模型。 */
  model: string;
  /** 温度草稿。 */
  temperature: number;
  /** Top P 草稿。 */
  topP: number;
  /** 最大输出输入框草稿。 */
  maxTokens: string;
  /** 上下文条数草稿。 */
  contextLength: number;
  /** modelParams JSON 文本草稿。 */
  modelParams: string;
  /** provider-aware 推理选中值。 */
  reasoningValue: ProviderReasoningValue;
  /** provider-aware 推理预算草稿。 */
  reasoningBudgetText: string;
  /** provider-aware 推理附加开关（当前用于 OpenRouter exclude）。 */
  reasoningExclude: boolean;
}

/** patch 构建结果。 */
interface TopicGenerationSettingsPatchResult {
  /** 是否存在非法草稿。 */
  invalid: boolean;
  /** 可写回 Topic 的字段。 */
  patch: Partial<TopicGenerationSettingsFields>;
}

/** 话题温度滑杆最小值。 */
export const TOPIC_TEMPERATURE_MIN = 0;
/** 话题温度滑杆最大值。 */
export const TOPIC_TEMPERATURE_MAX = 2;
/** 话题温度滑杆步进。 */
export const TOPIC_TEMPERATURE_STEP = 0.1;
/** 话题 Top P 滑杆最小值。 */
export const TOPIC_TOP_P_MIN = 0;
/** 话题 Top P 滑杆最大值。 */
export const TOPIC_TOP_P_MAX = 1;
/** 话题 Top P 滑杆步进。 */
export const TOPIC_TOP_P_STEP = 0.01;
/** 话题上下文条数滑杆最小值。 */
export const TOPIC_CONTEXT_LENGTH_MIN = 1;
/** 话题上下文条数滑杆最大值。 */
export const TOPIC_CONTEXT_LENGTH_MAX = 50;
/** 话题上下文条数滑杆步进。 */
export const TOPIC_CONTEXT_LENGTH_STEP = 1;

/** 将对象格式化成便于编辑的 JSON 文本。 */
export function formatModelParamsDraft(value: Record<string, unknown> | undefined): string {
  if (!value || Object.keys(value).length < 1) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

/**
 * 把 JSON 草稿解析成可写回 topic 的 `modelParams`。
 *
 * @returns `undefined` 表示清空，`null` 表示非法 JSON 或非对象结构。
 */
export function parseModelParamsDraft(raw: string): Record<string, unknown> | undefined | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return undefined;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isPlainRecord(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 解析最大输出输入框草稿。 */
export function parseMaxTokensDraft(raw: string): { value: number | undefined; invalid: boolean } {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { value: undefined, invalid: false };

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return { value: undefined, invalid: true };
  }

  return { value: parsed, invalid: false };
}

/** 读取当前模型的 transport protocol。 */
export function getTransportProtocol(
  modelMap: Map<string, ModelOption>,
  modelId: string,
): TransportProtocol | undefined {
  return modelMap.get(modelId)?.transportProtocol;
}

/** 从当前模型和 `modelParams` 派生 provider-aware 推理草稿。 */
export function buildReasoningDraftState(args: {
  model: string;
  transportProtocol?: TransportProtocol;
  modelParams?: Record<string, unknown>;
}): Pick<TopicGenerationSettingsDraft, 'reasoningValue' | 'reasoningBudgetText' | 'reasoningExclude'> {
  const descriptor = resolveProviderReasoningDescriptor(args);
  return {
    reasoningValue: descriptor?.value ?? 'off',
    reasoningBudgetText: descriptor?.budget != null ? String(descriptor.budget) : '',
    reasoningExclude: Boolean(descriptor?.exclude),
  };
}

/** 构建话题生成参数草稿初始值。 */
export function buildTopicGenerationSettingsDraft(params: {
  topic: TopicGenerationSettingsFields;
  defaults: TopicGenerationDefaults;
  transportProtocol?: TransportProtocol;
}): TopicGenerationSettingsDraft {
  const { topic, defaults, transportProtocol } = params;
  const activeModel = topic.model?.trim() || defaults.model;
  const effectiveMaxTokens = typeof topic.maxTokens === 'number' ? topic.maxTokens : defaults.maxTokens;

  return {
    model: topic.model?.trim() || '',
    temperature: typeof topic.temperature === 'number' ? topic.temperature : defaults.temperature,
    topP: typeof topic.topP === 'number' ? topic.topP : defaults.topP,
    maxTokens: String(effectiveMaxTokens),
    contextLength: typeof topic.contextLength === 'number' ? topic.contextLength : defaults.contextLength,
    modelParams: formatModelParamsDraft(topic.modelParams),
    ...buildReasoningDraftState({
      model: activeModel,
      transportProtocol,
      modelParams: topic.modelParams,
    }),
  };
}

/** 将 JSON 值递归标准化为稳定键顺序，便于语义等价比较。 */
function normalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeJsonValue(item));

  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeJsonValue((value as Record<string, unknown>)[key])]),
    );
  }

  return value;
}

/** 比较两个 `modelParams` 对象是否在 JSON 语义上等价。 */
function areModelParamsEqual(
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined,
) {
  return JSON.stringify(normalizeJsonValue(left ?? {})) === JSON.stringify(normalizeJsonValue(right ?? {}));
}

/** 从草稿构建 topic-owned 生成参数 patch。 */
export function buildTopicGenerationSettingsPatch(params: {
  draft: TopicGenerationSettingsDraft;
  topic: TopicGenerationSettingsFields;
  defaults: TopicGenerationDefaults;
}): TopicGenerationSettingsPatchResult {
  const { draft, topic, defaults } = params;
  const parsedModelParams = parseModelParamsDraft(draft.modelParams);
  const maxTokensState = parseMaxTokensDraft(draft.maxTokens);
  const invalid = parsedModelParams === null
    || maxTokensState.invalid
    || isReasoningBudgetDraftInvalid(draft.reasoningBudgetText);
  const patch: Partial<TopicGenerationSettingsFields> = {};

  if (invalid) return { invalid: true, patch };

  const nextModel = draft.model.trim() || undefined;
  if (nextModel !== (topic.model?.trim() || undefined)) patch.model = nextModel;
  if (typeof topic.temperature === 'number' || draft.temperature !== defaults.temperature) patch.temperature = draft.temperature;
  if (typeof topic.topP === 'number' || draft.topP !== defaults.topP) patch.topP = draft.topP;

  if (maxTokensState.value === undefined) {
    if (typeof topic.maxTokens === 'number') patch.maxTokens = undefined;
  } else if (typeof topic.maxTokens === 'number' || maxTokensState.value !== defaults.maxTokens) {
    patch.maxTokens = maxTokensState.value;
  }

  if (typeof topic.contextLength === 'number' || draft.contextLength !== defaults.contextLength) {
    patch.contextLength = draft.contextLength;
  }
  if (!areModelParamsEqual(parsedModelParams, topic.modelParams)) patch.modelParams = parsedModelParams;

  return { invalid: false, patch };
}
