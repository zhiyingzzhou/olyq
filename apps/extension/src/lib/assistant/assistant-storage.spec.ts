/**
 * 说明：`assistant-storage.spec` 测试模块。
 *
 * 职责：
 * - 覆盖助手清洗对 `regularPhrases` 当前结构的保留；
 * - 验证旧 `name` 快捷短语字段不会被助手配置兼容读取；
 * - 防止助手级常用短语在启动、恢复或同步读取时丢失。
 */
import { describe, expect, it } from 'vitest';

import { sanitizeAssistant } from './assistant-storage';

describe('assistant-storage regularPhrases', () => {
  it('清洗助手时保留合法 regularPhrases 并丢弃旧 name 字段', () => {
    const assistant = sanitizeAssistant({
      id: 'assistant-1',
      scenario: 'browser',
      name: '助手',
      prompt: 'system prompt',
      regularPhrases: [
        { id: 'legacy', name: 'legacy title', content: 'legacy content', createdAt: 1, updatedAt: 1, order: 3 },
        { id: 'valid-low', title: 'Low', content: 'low content', createdAt: 1, updatedAt: 1, order: 1 },
        { id: 'valid-high', title: 'High', content: 'high content', createdAt: 1, updatedAt: 2, order: 2 },
      ],
      topics: [],
      order: 1,
      createdAt: 1,
      updatedAt: 1,
    }, { fallbackToDefaultTopics: false });

    expect(assistant?.regularPhrases).toEqual([
      {
        id: 'valid-high',
        title: 'High',
        content: 'high content',
        createdAt: 1,
        updatedAt: 2,
        order: 2,
      },
      {
        id: 'valid-low',
        title: 'Low',
        content: 'low content',
        createdAt: 1,
        updatedAt: 1,
        order: 1,
      },
    ]);
  });
});

describe('assistant-storage generation field ownership', () => {
  it('清洗助手时丢弃 assistant 生成字段，并保留 topic 生成字段', () => {
    const assistant = sanitizeAssistant({
      id: 'assistant-1',
      scenario: 'general',
      name: '助手',
      prompt: 'system prompt',
      model: 'legacy/assistant-model',
      temperature: 1.2,
      topP: 0.8,
      maxTokens: 8192,
      contextLength: 32,
      modelParams: { legacy: true },
      topics: [{
        id: 'topic-1',
        assistantId: 'assistant-1',
        name: '话题',
        prompt: 'legacy topic prompt',
        topicPrompt: 'current topic prompt',
        model: 'openai/gpt-5.4',
        temperature: 0.3,
        topP: 0.6,
        maxTokens: 2048,
        contextLength: 12,
        modelParams: { seed: 7 },
        createdAt: 1,
        updatedAt: 1,
        order: 1,
      }],
      order: 1,
      createdAt: 1,
      updatedAt: 1,
    }, { fallbackToDefaultTopics: false });

    expect(assistant).not.toHaveProperty('model');
    expect(assistant).not.toHaveProperty('temperature');
    expect(assistant).not.toHaveProperty('topP');
    expect(assistant).not.toHaveProperty('maxTokens');
    expect(assistant).not.toHaveProperty('contextLength');
    expect(assistant).not.toHaveProperty('modelParams');
    expect(assistant?.topics[0]).toMatchObject({
      topicPrompt: 'current topic prompt',
      model: 'openai/gpt-5.4',
      temperature: 0.3,
      topP: 0.6,
      maxTokens: 2048,
      contextLength: 12,
      modelParams: { seed: 7 },
    });
  });

  it('不会把旧 topic.prompt 兼容读取成 topicPrompt', () => {
    const assistant = sanitizeAssistant({
      id: 'assistant-1',
      scenario: 'general',
      name: '助手',
      prompt: 'system prompt',
      topics: [{
        id: 'topic-1',
        assistantId: 'assistant-1',
        name: '话题',
        prompt: 'legacy topic prompt',
        createdAt: 1,
        updatedAt: 1,
        order: 1,
      }],
      order: 1,
      createdAt: 1,
      updatedAt: 1,
    }, { fallbackToDefaultTopics: false });

    expect(assistant?.topics[0]?.topicPrompt).toBeUndefined();
  });
});
