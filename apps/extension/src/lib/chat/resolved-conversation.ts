/**
 * 说明：`resolved-conversation` 基础能力模块。
 *
 * 职责：
 * - 承载 `resolved-conversation` 相关的当前文件实现与模块边界；
 * - 对外暴露 `buildTopicConversation`、`toTopicSummary`、`resolveTopicEffectiveModel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { Assistant } from '@/types/assistant';
import type {
  ChatSettings,
  Message,
  ResolvedConversationContext,
  TopicConversation,
  TopicSummary,
} from '@/types/chat';

interface TopicLike {
  id: string;
  assistantId: string;
  name: string;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
  order?: number;
  topicPrompt?: string;
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  contextLength?: number;
  modelParams?: Record<string, unknown>;
  browserContextMode?: TopicConversation['browserContextMode'];
  isNameManuallyEdited?: boolean;
}

type DefaultModelSettings = Pick<ChatSettings, 'defaultModel'>;

/**
 * 内部函数：`appendPromptPart`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function appendPromptPart(base: string, part: string) {
  const normalizedBase = String(base || '').trim();
  const normalizedPart = String(part || '').trim();
  if (!normalizedPart) return normalizedBase;
  if (!normalizedBase) return normalizedPart;
  return `${normalizedBase}\n\n${normalizedPart}`;
}

/** 将 Topic 元数据投影成不含助手默认配置的话题快照。 */
export function buildTopicConversation(
  topic: TopicLike,
  messages: Message[],
): TopicConversation {
  return {
    id: topic.id,
    title: topic.name,
    messages: Array.isArray(messages) ? messages : [],
    folderId: null,
    pinned: Boolean(topic.pinned),
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    assistantId: topic.assistantId,
    topicPrompt: topic.topicPrompt,
    model: typeof topic.model === 'string' ? topic.model.trim() || undefined : undefined,
    temperature: typeof topic.temperature === 'number' && Number.isFinite(topic.temperature) ? topic.temperature : undefined,
    topP: typeof topic.topP === 'number' && Number.isFinite(topic.topP) ? topic.topP : undefined,
    maxTokens: typeof topic.maxTokens === 'number' && Number.isFinite(topic.maxTokens) ? topic.maxTokens : undefined,
    contextLength: typeof topic.contextLength === 'number' && Number.isFinite(topic.contextLength) ? topic.contextLength : undefined,
    modelParams: topic.modelParams,
    browserContextMode: topic.browserContextMode,
    isNameManuallyEdited: topic.isNameManuallyEdited,
    order: topic.order,
  };
}

/** 将 Topic 元数据规整为列表渲染使用的轻量摘要。 */
export function toTopicSummary(topic: TopicLike): TopicSummary {
  return {
    id: topic.id,
    title: topic.name,
    folderId: null,
    pinned: Boolean(topic.pinned),
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    assistantId: topic.assistantId,
    order: topic.order,
    topicPrompt: topic.topicPrompt,
    model: typeof topic.model === 'string' ? topic.model.trim() || undefined : undefined,
    temperature: typeof topic.temperature === 'number' && Number.isFinite(topic.temperature) ? topic.temperature : undefined,
    topP: typeof topic.topP === 'number' && Number.isFinite(topic.topP) ? topic.topP : undefined,
    maxTokens: typeof topic.maxTokens === 'number' && Number.isFinite(topic.maxTokens) ? topic.maxTokens : undefined,
    contextLength: typeof topic.contextLength === 'number' && Number.isFinite(topic.contextLength) ? topic.contextLength : undefined,
    modelParams: topic.modelParams,
    browserContextMode: topic.browserContextMode,
    isNameManuallyEdited: topic.isNameManuallyEdited,
  };
}

/** 解析话题最终生效的聊天模型。 */
export function resolveTopicEffectiveModel(
  topic: Pick<TopicConversation, 'model'> | TopicLike | null | undefined,
  settings: DefaultModelSettings,
): string {
  return String(topic?.model || '').trim() || settings.defaultModel;
}

/** 将助手默认配置与话题元数据解析为聊天运行时上下文。 */
export function buildResolvedConversationContext({
  assistant,
  topic,
  messages,
  settings,
}: {
  assistant: Assistant;
  topic: TopicLike;
  messages: Message[];
  settings: Pick<
    ChatSettings,
    | 'defaultSystemPrompt'
    | 'defaultModel'
    | 'defaultTemperature'
    | 'defaultTopP'
    | 'defaultMaxTokens'
    | 'defaultContextLength'
  >;
}): ResolvedConversationContext {
  const topicConversation = buildTopicConversation(topic, messages);
  const effectiveModel = resolveTopicEffectiveModel(topicConversation, settings);

  return {
    ...topicConversation,
    systemPrompt: appendPromptPart(settings.defaultSystemPrompt, assistant.prompt || ''),
    model: effectiveModel,
    temperature: typeof topicConversation.temperature === 'number' ? topicConversation.temperature : settings.defaultTemperature,
    topP: typeof topicConversation.topP === 'number' ? topicConversation.topP : settings.defaultTopP,
    maxTokens: typeof topicConversation.maxTokens === 'number' ? topicConversation.maxTokens : settings.defaultMaxTokens,
    modelParams: topicConversation.modelParams,
    contextLength: typeof topicConversation.contextLength === 'number' ? topicConversation.contextLength : settings.defaultContextLength,
    mcpSelection: assistant.mcpSelection,
    enableWebSearch: assistant.enableWebSearch,
    enableGenerateImage: assistant.enableGenerateImage,
  };
}
