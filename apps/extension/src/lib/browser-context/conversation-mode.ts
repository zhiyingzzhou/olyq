/**
 * 说明：`conversation-mode` 浏览器上下文会话模式模块。
 *
 * 职责：
 * - 以 topic 持久化元数据作为浏览器上下文模式的唯一真源；
 * - 在 topic 未显式写入时，按 assistant `scenario` 提供稳定默认值；
 * - 为状态条、collector 和发送链路统一返回同一份生效模式。
 *
 * 边界：
 * - 本模块不维护 runtime-only Map；
 * - 不直接写入 topic，写操作由上层显式调用 `useAssistantStore.updateTopicMeta()`；
 * - 这里只负责解析与规整，不负责 UI 交互。
 */
import { useAssistantStore } from '@/hooks/useAssistantStore';
import { resolveAssistantTopic } from '@/lib/chat/topic-tree';
import { normalizeAssistantScenario } from '@/types/assistant';
import type { Topic } from '@/types/chat';
import type { BrowserContextConversationMode } from './types';
import {
  cloneBrowserContextConversationMode,
  getDefaultBrowserContextConversationModeForScenario,
  normalizeBrowserContextConversationMode,
} from './types';

/**
 * 解析指定话题当前真正生效的浏览器上下文模式。
 *
 * 规则：
 * - topic 显式写了 `browserContextMode` 时，只认 topic；
 * - topic 没写时，按所属 assistant 的 `scenario` 给默认值；
 * - assistant/topic 任一缺失时，保守回落到 `general` 默认值。
 *
 * @param conversationKey - 目标话题 ID。
 * @returns 归一化后的模式。
 */
export function getBrowserContextConversationMode(conversationKey?: string | null): BrowserContextConversationMode {
  const normalizedKey = String(conversationKey || '').trim();
  if (!normalizedKey) {
    return getDefaultBrowserContextConversationModeForScenario('general');
  }

  const assistants = useAssistantStore.getState().assistants;
  const resolved = resolveAssistantTopic(assistants, normalizedKey);
  if (!resolved) {
    return getDefaultBrowserContextConversationModeForScenario('general');
  }

  return resolveBrowserContextConversationModeForTopic({
    topic: resolved.topic,
    assistantScenario: resolved.assistant.scenario,
  });
}

/**
 * 解析某个 topic 在指定 assistant 场景下的生效浏览器上下文模式。
 *
 * @param args - 话题元数据与助手场景。
 * @returns 最终模式。
 */
export function resolveBrowserContextConversationModeForTopic(args: {
  topic: Pick<Topic, 'browserContextMode'> | null | undefined;
  assistantScenario: unknown;
}): BrowserContextConversationMode {
  const scenario = normalizeAssistantScenario(args.assistantScenario);
  const fallback = getDefaultBrowserContextConversationModeForScenario(scenario);
  if (!args.topic?.browserContextMode) {
    return cloneBrowserContextConversationMode(fallback);
  }
  return normalizeBrowserContextConversationMode(args.topic.browserContextMode, fallback);
}
