/**
 * 说明：`TopicPanelContainer` 页面模块。
 *
 * 职责：
 * - 承载 `TopicPanelContainer` 相关的当前文件实现与模块边界；
 * - 对外暴露 `TopicPanelContainerProps`、`TopicPanelContainer` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useMemo } from 'react';
import { shallow } from 'zustand/shallow';

import { TopicPanel } from '@/components/chat/TopicPanel';
import { useAssistantStore } from '@/hooks/useAssistantStore';
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore';
import { useChatStore } from '@/hooks/useChatStore';
import { buildTopicConversation } from '@/lib/chat/resolved-conversation';
import { resolveAssistantTopic } from '@/lib/chat/topic-tree';
import type { TopicConversation } from '@/types/chat';

/** TopicPanelContainer 组件入参：受控开关与关闭回调 */
export interface TopicPanelContainerProps {
  /** 关闭弹窗回调 */
  onClose: () => void;
  /** 打开模型管理。 */
  onOpenModelManager?: () => void;
}

/**
 * 当前激活话题的设置面板容器。
 *
 * 说明：
 * - 负责把当前 topic 投影成 `TopicPanel` 需要的轻量对象；
 * - 这里只处理“当前话题元数据编辑”，不会负责消息列表或话题切换逻辑。
 */
export function TopicPanelContainer({ onClose, onOpenModelManager }: TopicPanelContainerProps) {
  const activeConversationKey = useChatStore((state) => state.activeConversationKey);
  const assistants = useAssistantStore((state) => state.assistants);
  const updateTopicMeta = useAssistantStore((state) => state.updateTopicMeta);
  const generationDefaults = useChatSettingsStore((state) => ({
    model: state.settings.defaultModel,
    temperature: state.settings.defaultTemperature,
    topP: state.settings.defaultTopP,
    maxTokens: state.settings.defaultMaxTokens,
    contextLength: state.settings.defaultContextLength,
  }), shallow);

  const resolvedConversation = useMemo(
    () => resolveAssistantTopic(assistants, activeConversationKey),
    [activeConversationKey, assistants],
  );

  const topicConfig = useMemo<TopicConversation | null>(() => {
    if (!activeConversationKey || !resolvedConversation) return null;
    return buildTopicConversation(resolvedConversation.topic, []);
  }, [activeConversationKey, resolvedConversation]);

  if (!topicConfig || !resolvedConversation) return null;

  return (
    <TopicPanel
      topic={topicConfig}
      generationDefaults={generationDefaults}
      onSaveTopic={(config) => updateTopicMeta(topicConfig.id, config)}
      onClose={onClose}
      onOpenModelManager={onOpenModelManager}
      externalWebSearchActive={Boolean(resolvedConversation.assistant.webSearchProviderId)}
    />
  );
}
