/**
 * 说明：`useAssistantStore.updateAssistantConfig.test` Hook 模块。
 *
 * 职责：
 * - 承载 `useAssistantStore.updateAssistantConfig.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { useAssistantStore } from '@/hooks/useAssistantStore';
import type { Topic } from '@/types/chat';

/**
 * 测试辅助函数：`makeTopic`。
 *
 * @remarks
 * 用于当前测试中的最小话题搭建，不作为运行时代码复用。
 */
function makeTopic(id: string, assistantId: string): Topic {
  const now = Date.now();
  return {
    id,
    assistantId,
    name: id,
    pinned: false,
    createdAt: now,
    updatedAt: now,
    order: now,
    topicPrompt: undefined,
    isNameManuallyEdited: false,
  };
}

describe('useAssistantStore.updateAssistantConfig', () => {
  beforeEach(() => {
    const now = Date.now();
    useAssistantStore.setState({
      presets: [
        {
          id: '__builtin_default_role__',
          scenario: 'general' as const,
          name: '默认助手',
          prompt: 'builtin prompt',
        },
      ],
      assistants: [
        {
          id: 'assistant-1',
          scenario: 'general' as const,
          name: 'Writer',
          description: 'original description',
          prompt: 'original prompt',
          topics: [{
            ...makeTopic('topic-1', 'assistant-1'),
            model: 'siliconflow/siliconflow/deepseek-v3.2',
            temperature: 0.3,
            topP: 0.8,
            maxTokens: 4096,
            contextLength: 24,
            modelParams: { seed: 7 },
          }],
          order: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
  });

  it('更新助手配置时不会触碰 topic-owned 生成参数', () => {
    useAssistantStore.getState().updateAssistantConfig('assistant-1', {
      prompt: 'updated prompt',
    });

    const assistant = useAssistantStore.getState().getAssistant('assistant-1');
    expect(assistant).toMatchObject({
      id: 'assistant-1',
      description: 'original description',
      prompt: 'updated prompt',
    });
    expect(assistant).not.toHaveProperty('model');
    expect(assistant?.topics[0]).toMatchObject({
      model: 'siliconflow/siliconflow/deepseek-v3.2',
      temperature: 0.3,
      topP: 0.8,
      maxTokens: 4096,
      contextLength: 24,
      modelParams: { seed: 7 },
    });
  });

  it('仅更新 topic modelParams 时，不会误清空其它 topic 生成参数字段', () => {
    useAssistantStore.getState().updateTopicMeta('topic-1', {
      modelParams: { enable_thinking: true },
    });

    const assistant = useAssistantStore.getState().getAssistant('assistant-1');
    expect(assistant?.topics[0]).toMatchObject({
      model: 'siliconflow/siliconflow/deepseek-v3.2',
      temperature: 0.3,
      topP: 0.8,
      maxTokens: 4096,
      contextLength: 24,
      modelParams: { enable_thinking: true },
    });
  });

  it('topic 生成字段显式传入 undefined 时，会清空对应字段', () => {
    useAssistantStore.getState().updateTopicMeta('topic-1', {
      model: undefined,
      modelParams: undefined,
    });

    const topic = useAssistantStore.getState().getAssistant('assistant-1')?.topics[0];
    expect(topic?.model).toBeUndefined();
    expect(topic?.modelParams).toBeUndefined();
    expect(topic?.temperature).toBe(0.3);
  });

  it('允许把 assistant prompt 清空为空字符串', () => {
    useAssistantStore.getState().updateAssistantConfig('assistant-1', {
      prompt: '',
    });

    const assistant = useAssistantStore.getState().getAssistant('assistant-1');
    expect(assistant).toMatchObject({
      id: 'assistant-1',
      prompt: '',
    });
    expect(assistant).not.toHaveProperty('model');
    expect(assistant?.topics[0]?.model).toBe('siliconflow/siliconflow/deepseek-v3.2');
  });
});
