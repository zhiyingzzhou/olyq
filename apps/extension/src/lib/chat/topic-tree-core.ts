/**
 * 说明：`topic-tree-core` 基础能力模块。
 *
 * 职责：
 * - 承载 `topic-tree-core` 相关的当前文件实现与模块边界；
 * - 对外暴露 `DEFAULT_TOPIC_TITLE_FALLBACK`、`normalizeTopicNameWithFallback`、`createTopicRecordWithFallback` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createId } from '@/lib/utils/id';
import type { BrowserContextConversationMode } from '@/lib/browser-context/types';
import type { Assistant } from '@/types/assistant';
import type { Topic } from '@/types/chat';

/**
 * 导出常量：`DEFAULT_TOPIC_TITLE_FALLBACK`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const DEFAULT_TOPIC_TITLE_FALLBACK = 'New Chat';

/**
 * 导出函数：`normalizeTopicNameWithFallback`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function normalizeTopicNameWithFallback(name: unknown, fallbackTitle = DEFAULT_TOPIC_TITLE_FALLBACK): string {
  const normalized = typeof name === 'string' ? name.trim() : '';
  return normalized || fallbackTitle;
}

/**
 * 导出函数：`createTopicRecordWithFallback`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function createTopicRecordWithFallback({
  assistantId,
  name,
  id,
  createdAt,
  updatedAt,
  pinned,
  topicPrompt,
  model,
  temperature,
  topP,
  maxTokens,
  contextLength,
  modelParams,
  browserContextMode,
  isNameManuallyEdited,
  order,
  fallbackTitle,
}: {
  assistantId: string;
  name?: unknown;
  id?: string;
  createdAt?: number;
  updatedAt?: number;
  pinned?: boolean;
  topicPrompt?: string;
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  contextLength?: number;
  modelParams?: Record<string, unknown>;
  browserContextMode?: BrowserContextConversationMode;
  isNameManuallyEdited?: boolean;
  order?: number;
  fallbackTitle?: string;
}): Topic {
  const now = typeof createdAt === 'number' && Number.isFinite(createdAt) ? createdAt : Date.now();
  return {
    id: typeof id === 'string' && id.trim() ? id.trim() : createId(),
    assistantId: String(assistantId || '').trim(),
    name: normalizeTopicNameWithFallback(name, fallbackTitle),
    createdAt: now,
    updatedAt: typeof updatedAt === 'number' && Number.isFinite(updatedAt) ? updatedAt : now,
    pinned: Boolean(pinned),
    topicPrompt: typeof topicPrompt === 'string' ? topicPrompt : undefined,
    model: typeof model === 'string' ? model.trim() || undefined : undefined,
    temperature: typeof temperature === 'number' && Number.isFinite(temperature) ? temperature : undefined,
    topP: typeof topP === 'number' && Number.isFinite(topP) ? topP : undefined,
    maxTokens: typeof maxTokens === 'number' && Number.isFinite(maxTokens) ? maxTokens : undefined,
    contextLength: typeof contextLength === 'number' && Number.isFinite(contextLength) ? contextLength : undefined,
    modelParams,
    browserContextMode: browserContextMode ? { ...browserContextMode } : undefined,
    isNameManuallyEdited: Boolean(isNameManuallyEdited),
    order: typeof order === 'number' && Number.isFinite(order) ? order : now,
  };
}

/**
 * 导出函数：`getAssistantOrderValue`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function getAssistantOrderValue(assistant: Pick<Assistant, 'order' | 'createdAt'>): number {
  return typeof assistant.order === 'number' && Number.isFinite(assistant.order)
    ? assistant.order
    : assistant.createdAt;
}

/**
 * 导出函数：`sortAssistants`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function sortAssistants(assistants: Assistant[]): Assistant[] {
  return [...assistants].sort((a, b) => {
    const delta = getAssistantOrderValue(b) - getAssistantOrderValue(a);
    if (delta !== 0) return delta;
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return b.createdAt - a.createdAt;
  });
}

/**
 * 导出函数：`pickAssistantEntryTopic`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function pickAssistantEntryTopic(assistant: Assistant | null | undefined): Topic | null {
  if (!assistant || !Array.isArray(assistant.topics) || assistant.topics.length < 1) return null;
  return assistant.topics[0] ?? null;
}

/** 导出类型：`ResolvedAssistantTopic`。 */
export interface ResolvedAssistantTopic {
  assistantId: string;
  assistant: Assistant;
  topic: Topic;
}

/**
 * 导出函数：`resolveAssistantTopic`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function resolveAssistantTopic(
  assistants: Assistant[],
  topicId: string | null | undefined,
): ResolvedAssistantTopic | null {
  const normalizedTopicId = String(topicId || '').trim();
  if (!normalizedTopicId) return null;

  for (const assistant of assistants) {
    const topic = assistant.topics.find((item) => item.id === normalizedTopicId);
    if (topic) {
      return {
        assistantId: assistant.id,
        assistant,
        topic,
      };
    }
  }

  return null;
}

/**
 * 导出函数：`getAssistantTopics`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function getAssistantTopics(assistants: Assistant[], assistantId: string | null | undefined): Topic[] {
  const normalizedAssistantId = String(assistantId || '').trim();
  if (!normalizedAssistantId) return [];
  return assistants.find((assistant) => assistant.id === normalizedAssistantId)?.topics ?? [];
}
