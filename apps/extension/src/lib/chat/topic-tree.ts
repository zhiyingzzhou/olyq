/**
 * 说明：`topic-tree` 基础能力模块。
 *
 * 职责：
 * - 承载 `topic-tree` 相关的当前文件实现与模块边界；
 * - 对外暴露 `normalizeTopicName`、`createTopicRecord` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import i18n from '@/i18n';
import type { BrowserContextConversationMode } from '@/lib/browser-context/types';
import {
  createTopicRecordWithFallback,
  DEFAULT_TOPIC_TITLE_FALLBACK,
  normalizeTopicNameWithFallback,
} from '@/lib/chat/topic-tree-core';
import type { Topic } from '@/types/chat';

export {
  getAssistantOrderValue,
  getAssistantTopics,
  pickAssistantEntryTopic,
  resolveAssistantTopic,
  sortAssistants,
} from '@/lib/chat/topic-tree-core';

/** 归一化话题标题；为空时回退到当前语言下的默认标题。 */
export function normalizeTopicName(name: unknown): string {
  return normalizeTopicNameWithFallback(name, i18n.t('chat.defaultTopicTitle') || DEFAULT_TOPIC_TITLE_FALLBACK);
}

/** 创建一条标准 Topic 记录。 */
export function createTopicRecord({
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
}): Topic {
  return createTopicRecordWithFallback({
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
    fallbackTitle: i18n.t('chat.defaultTopicTitle') || DEFAULT_TOPIC_TITLE_FALLBACK,
  });
}
