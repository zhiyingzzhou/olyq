/**
 * 说明：`useAssistantStore.deleteAssistant.test` Hook 模块。
 *
 * 职责：
 * - 承载 `useAssistantStore.deleteAssistant.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  getBrowserContextAssistantOverride,
  saveBrowserContextPolicyState,
  upsertBrowserContextAssistantOverride,
} from '@/lib/browser-context/policy';
import { DEFAULT_BROWSER_CONTEXT_POLICY_STATE } from '@/lib/browser-context/types';
import { DEFAULT_ASSISTANT_ID } from '@/types/assistant';
import type { Topic } from '@/types/chat';
import { useAssistantStore } from '@/hooks/useAssistantStore';
import { useChatStore } from '@/hooks/useChatStore';

/**
 * 测试辅助函数：`makeTopic`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeTopic(id: string, assistantId: string): Topic {
  const now = Date.now();
  return {
    id,
    assistantId,
    name: id,
    createdAt: now,
    updatedAt: now,
    pinned: false,
    topicPrompt: undefined,
    isNameManuallyEdited: false,
    order: now,
  };
}

describe('assistant 删除后的主聊天重收敛', () => {
  beforeEach(() => {
    saveBrowserContextPolicyState(DEFAULT_BROWSER_CONTEXT_POLICY_STATE);
    const now = Date.now();
    const defaultAssistant = {
      id: DEFAULT_ASSISTANT_ID,
      scenario: 'general' as const,
      name: 'Default',
      prompt: 'default prompt',
      topics: [makeTopic('topic-default', DEFAULT_ASSISTANT_ID)],
      order: now - 3_000,
      createdAt: now - 3_000,
      updatedAt: now - 3_000,
    };
    const a1 = {
      id: 'a1',
      scenario: 'general' as const,
      name: 'A1',
      prompt: 'p1',
      topics: [makeTopic('topic-a1', 'a1')],
      order: now - 2_000,
      createdAt: now - 2_000,
      updatedAt: now - 2_000,
    };
    const a2 = {
      id: 'a2',
      scenario: 'general' as const,
      name: 'A2',
      prompt: 'p2',
      topics: [makeTopic('topic-a2', 'a2')],
      order: now - 1_000,
      createdAt: now - 1_000,
      updatedAt: now - 1_000,
    };

    useAssistantStore.setState({
      presets: [
        {
          id: '__builtin_default_role__',
          scenario: 'general' as const,
          name: 'Default',
          prompt: 'default prompt',
        },
      ],
      assistants: [defaultAssistant, a1, a2],
    });

    useChatStore.setState({
      runtime: {
        activeAssistantId: 'a1',
        activeTopicId: 'topic-a1',
      },
      activeConversationKey: 'topic-a1',
      activeMessages: [],
      activeMessagesLoading: false,
    });

    upsertBrowserContextAssistantOverride({
      assistantId: 'a1',
      mode: 'profile',
      profileId: 'deep-page',
    });
  });

  it('删除当前助手后，会重新落到仍然有效的 assistant + topic', () => {
    useAssistantStore.getState().deleteAssistant('a1');

    const assistants = useAssistantStore.getState().assistants;
    const chat = useChatStore.getState();

    expect(assistants.some((assistant) => assistant.id === 'a1')).toBe(false);
    expect(chat.runtime.activeAssistantId).toBe('a2');
    expect(chat.runtime.activeTopicId).toBe('topic-a2');
    expect(chat.activeConversationKey).toBe('topic-a2');
    expect(getBrowserContextAssistantOverride('a1')).toBeNull();
  });

  it('删除最后一个助手实例时，会自动补一个默认助手实例', () => {
    useAssistantStore.setState({
      assistants: [
        {
          id: 'lonely',
          scenario: 'general' as const,
          name: 'Lonely',
          prompt: 'only one',
          topics: [makeTopic('topic-lonely', 'lonely')],
          order: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    });

    useChatStore.setState({
      runtime: {
        activeAssistantId: 'lonely',
        activeTopicId: 'topic-lonely',
      },
      activeConversationKey: 'topic-lonely',
      activeMessages: [],
      activeMessagesLoading: false,
    });

    useAssistantStore.getState().deleteAssistant('lonely');

    const assistants = useAssistantStore.getState().assistants;
    const chat = useChatStore.getState();

    expect(assistants).toHaveLength(1);
    expect(assistants[0]?.id).toBe(DEFAULT_ASSISTANT_ID);
    expect(assistants[0]?.topics).toHaveLength(1);
    expect(assistants[0]?.topics[0]?.assistantId).toBe(DEFAULT_ASSISTANT_ID);
    expect(chat.runtime.activeAssistantId).toBe(DEFAULT_ASSISTANT_ID);
    expect(chat.runtime.activeTopicId).toBe(assistants[0]?.topics[0]?.id);
    expect(chat.activeConversationKey).toBe(assistants[0]?.topics[0]?.id);
  });
});
