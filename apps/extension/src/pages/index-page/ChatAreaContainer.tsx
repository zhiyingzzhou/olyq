/**
 * 说明：`ChatAreaContainer` 页面模块。
 *
 * 职责：
 * - 承载 `ChatAreaContainer` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ChatAreaContainerProps`、`ChatAreaContainer` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { forwardRef, useCallback, useMemo } from 'react';
import { shallow } from 'zustand/shallow';

import { ChatArea, type ChatAreaHandle } from '@/components/chat/ChatArea';
import { useAssistantStore } from '@/hooks/useAssistantStore';
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore';
import { useChatStore } from '@/hooks/useChatStore';
import {
  buildResolvedConversationContext,
} from '@/lib/chat/resolved-conversation';
import { resolveAssistantTopic } from '@/lib/chat/topic-tree';
import type { ResolvedConversationContext } from '@/types/chat';

/** ChatAreaContainer 组件入参：只传递 UI 回调，数据从 store 订阅 */
export interface ChatAreaContainerProps {
  /** 透传：打开提示词面板 */
  onOpenPrompts: () => void;
  /** 透传：打开模型管理（扩展设置 → 模型管理） */
  onOpenModelManager?: () => void;
  /** 透传：打开联网搜索设置（扩展设置 → 联网搜索） */
  onOpenWebSearchSettings?: () => void;
  /** 透传：打开当前话题设置中的模型内置搜索参数 */
  onOpenNativeWebSearchSettings?: () => void;
  /** 透传：打开 MCP 设置（扩展设置 → MCP） */
  onOpenMcpSettings?: () => void;
  /** 透传：打开全局记忆设置（扩展设置 → 全局记忆） */
  onOpenMemorySettings?: () => void;
}

/**
 * ChatArea 的容器层。
 *
 * 负责把运行时 store 中当前激活的 topic
 * 归一化为 `ChatArea` 可消费的 `ResolvedConversationContext` 结构，
 * 并把模型切换等动作透传回 store。
 */
export const ChatAreaContainer = forwardRef<ChatAreaHandle, ChatAreaContainerProps>(function ChatAreaContainer(
  { onOpenPrompts, onOpenModelManager, onOpenWebSearchSettings, onOpenNativeWebSearchSettings, onOpenMcpSettings, onOpenMemorySettings }: ChatAreaContainerProps,
  ref,
) {
  const { activeConversationKey, activeMessages, activeMessagesLoading, activeConversationState } = useChatStore((state) => ({
    activeConversationKey: state.activeConversationKey,
    activeMessages: state.activeMessages,
    activeMessagesLoading: state.activeMessagesLoading,
    activeConversationState: state.activeConversationState,
  }), shallow);
  const assistants = useAssistantStore((state) => state.assistants);
  const updateTopicMeta = useAssistantStore((state) => state.updateTopicMeta);
  const updateTopicMessages = useChatStore((state) => state.updateTopicMessages);
  const chatSettings = useChatSettingsStore((state) => state.settings);

  const resolvedConversation = useMemo(
    () => resolveAssistantTopic(assistants, activeConversationKey),
    [activeConversationKey, assistants],
  );

  const topicConversation = useMemo<ResolvedConversationContext | null>(() => {
    if (!activeConversationKey || !resolvedConversation) return null;
    const { topic, assistant } = resolvedConversation;
    return buildResolvedConversationContext({
      assistant,
      topic,
      messages: activeMessages,
      settings: chatSettings,
    });
  }, [
    activeConversationKey,
    activeMessages,
    chatSettings,
    resolvedConversation,
  ]);

  const activeTopicId = topicConversation?.id ?? null;
  const conversationState: 'empty' | 'loading' | 'ready' = useMemo(() => {
    if (activeConversationState === 'none') return 'empty';
    if (activeConversationState === 'resolving') return 'loading';
    return topicConversation ? 'ready' : 'loading';
  }, [activeConversationState, topicConversation]);

  /**
   * 切换当前话题模型。
   *
   * @param modelId - 用户在模型选择器里选中的模型 ID。
   */
  const handleModelSwitch = useCallback((modelId: string) => {
    if (!topicConversation?.id) return;
    updateTopicMeta(topicConversation.id, { model: modelId });
  }, [topicConversation, updateTopicMeta]);

  return (
    <ChatArea
      ref={ref}
      topic={topicConversation}
      conversationState={conversationState}
      messagesLoading={activeMessagesLoading}
      onUpdateMessages={updateTopicMessages}
      onOpenPrompts={onOpenPrompts}
      onModelSwitch={activeTopicId ? handleModelSwitch : undefined}
      onOpenModelManager={onOpenModelManager}
      onOpenWebSearchSettings={onOpenWebSearchSettings}
      onOpenNativeWebSearchSettings={onOpenNativeWebSearchSettings}
      onOpenMcpSettings={onOpenMcpSettings}
      onOpenMemorySettings={onOpenMemorySettings}
    />
  );
});
