/**
 * 说明：`useActiveConversationModel` 页面模块。
 *
 * 职责：
 * - 承载 `useActiveConversationModel` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useActiveConversationModel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useMemo } from 'react';
import { shallow } from 'zustand/shallow';

import { useAssistantStore } from '@/hooks/useAssistantStore';
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore';
import { useChatStore } from '@/hooks/useChatStore';
import { resolveTopicEffectiveModel } from '@/lib/chat/resolved-conversation';
import { resolveAssistantTopic } from '@/lib/chat/topic-tree';

/**
 * 导出 Hook：`useActiveConversationModel`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useActiveConversationModel() {
  const { activeConversationKey, activeConversationState } = useChatStore((state) => ({
    activeConversationKey: state.activeConversationKey,
    activeConversationState: state.activeConversationState,
  }), shallow);
  const assistants = useAssistantStore((state) => state.assistants);
  const chatSettings = useChatSettingsStore((state) => state.settings);

  const resolvedConversation = useMemo(
    () => resolveAssistantTopic(assistants, activeConversationKey),
    [activeConversationKey, assistants],
  );

  return useMemo(() => {
    if (!resolvedConversation) {
      return {
        activeLoadedTopicId: null,
        activeModel: chatSettings.defaultModel,
        hasLoadedMessages: activeConversationState === 'ready',
        hasResolvedTopic: activeConversationState !== 'none',
      };
    }
    const hasLoadedMessages = activeConversationState === 'ready';
    return {
      activeLoadedTopicId: hasLoadedMessages ? activeConversationKey : null,
      activeModel: resolveTopicEffectiveModel(resolvedConversation.topic, chatSettings),
      hasLoadedMessages,
      hasResolvedTopic: true,
    };
  }, [activeConversationKey, activeConversationState, chatSettings, resolvedConversation]);
}
