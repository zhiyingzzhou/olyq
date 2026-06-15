/**
 * 说明：`context-pipeline.test` 基础能力模块。
 *
 * 职责：
 * - 承载 `context-pipeline.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('buildChatSystemContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('保持全局对话提示词、assistant、topicPrompt 与页面上下文的顺序稳定', async () => {
    const { buildChatSystemContent } = await import('./context-pipeline');

    const result = await buildChatSystemContent({
      browserContextPrompt: 'page context',
      query: 'hi',
      topic: {
        id: 'topic-1',
        title: 'Topic',
        messages: [],
        folderId: null,
        pinned: false,
        createdAt: 1,
        updatedAt: 1,
        assistantId: 'assistant-1',
        systemPrompt: 'global prompt\n\nassistant prompt',
        topicPrompt: 'topic prompt',
        model: 'openai/gpt-4.1',
        temperature: 0.7,
        topP: 1,
        maxTokens: 4096,
        contextLength: 20,
      },
    });

    expect(result.systemContent).toBe('global prompt\n\nassistant prompt\ntopic prompt\n\npage context');
  });
});
