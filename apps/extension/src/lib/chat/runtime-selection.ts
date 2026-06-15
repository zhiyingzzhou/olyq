/**
 * 说明：`runtime-selection` 聊天运行时选择态模块。
 *
 * 职责：
 * - 统一规整聊天运行时的激活助手/话题快照；
 * - 根据助手树解析出当前真正应该进入的话题；
 * - 为启动快照、聊天 store 和只读启动探针提供同一套纯函数。
 *
 * 边界：
 * - 这里只处理纯数据解析，不读取 store、不访问浏览器 API；
 * - 消息加载、写回持久化与 UI 首屏策略属于上层模块职责。
 */
import { pickAssistantEntryTopic, resolveAssistantTopic } from '@/lib/chat/topic-tree-core';
import { isPlainRecord } from '@/lib/utils/type-guards';
import type { Assistant } from '@/types/assistant';

/** 聊天运行时选择态。 */
export interface RuntimeState {
  /** 当前激活助手 ID。 */
  activeAssistantId: string | null;
  /** 当前激活话题 ID。 */
  activeTopicId: string | null;
}

/**
 * 规范化共享存储中的聊天运行时选择态。
 *
 * @remarks
 * 运行时态会被 restore、import、多窗口写入和启动快照共同读取；
 * 因此这里必须把脏值收敛成稳定结构，避免上层把非法字段当成可信选择态。
 */
export function sanitizeRuntime(raw: unknown): RuntimeState {
  const record = isPlainRecord(raw) ? raw : {};
  return {
    activeAssistantId:
      typeof record.activeAssistantId === 'string' && record.activeAssistantId.trim()
        ? record.activeAssistantId.trim()
        : null,
    activeTopicId:
      typeof record.activeTopicId === 'string' && record.activeTopicId.trim()
        ? record.activeTopicId.trim()
        : null,
  };
}

/**
 * 根据运行时快照解析出当前真正应该激活的助手和话题。
 *
 * @remarks
 * 话题可能被移动到别的助手名下，也可能在删除后需要回退到新的入口话题；
 * 因此调用方不能直接相信 `activeAssistantId/activeTopicId`，必须按助手树重算一次。
 */
export function resolveRuntimeSelection(
  assistants: Assistant[],
  runtime: RuntimeState,
): { assistantId: string; topicId: string } | null {
  if (assistants.length === 0) return null;

  const activeAssistant = runtime.activeAssistantId
    ? assistants.find((assistant) => assistant.id === runtime.activeAssistantId) ?? null
    : null;

  if (activeAssistant) {
    const topicInsideAssistant = runtime.activeTopicId
      ? activeAssistant.topics.find((topic) => topic.id === runtime.activeTopicId) ?? null
      : null;
    if (topicInsideAssistant) {
      return { assistantId: activeAssistant.id, topicId: topicInsideAssistant.id };
    }
  }

  const movedTopic = resolveAssistantTopic(assistants, runtime.activeTopicId);
  if (movedTopic) {
    return { assistantId: movedTopic.assistantId, topicId: movedTopic.topic.id };
  }

  const fallbackAssistant = activeAssistant ?? assistants[0] ?? null;
  if (!fallbackAssistant || fallbackAssistant.topics.length === 0) return null;
  const fallbackTopic = pickAssistantEntryTopic(fallbackAssistant);
  if (!fallbackTopic) return null;
  return { assistantId: fallbackAssistant.id, topicId: fallbackTopic.id };
}
