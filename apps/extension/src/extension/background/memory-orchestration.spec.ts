/**
 * 说明：`memory-orchestration.spec` 后台运行时测试。
 *
 * 职责：
 * - 固化记忆后处理里的 LLM 文本任务统一走 runtime call plan；
 * - 防止重新出现后台直接 `resolveModel()` 后硬塞采样参数的旁路。
 */
import { describe, expect, it, vi } from 'vitest';

const {
  buildTextTaskCallPlanMock,
  clearCachedRelevantMemoriesMock,
  generateTextMock,
} = vi.hoisted(() => ({
  buildTextTaskCallPlanMock: vi.fn(),
  clearCachedRelevantMemoriesMock: vi.fn(),
  generateTextMock: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: generateTextMock,
}));

vi.mock('./text-task-call-plan', () => ({
  buildTextTaskCallPlan: buildTextTaskCallPlanMock,
  toGenerateTextCallSettings: (callSettings: Record<string, unknown>) => callSettings,
}));

vi.mock('./memory-tools', () => ({
  clearCachedRelevantMemories: clearCachedRelevantMemoriesMock,
  getCachedRelevantMemories: vi.fn(() => []),
}));

vi.mock('../../lib/ai/embedding-executor', () => ({
  resolveEmbeddingExecutor: vi.fn(),
}));

vi.mock('../../lib/memory', () => ({
  addMemory: vi.fn(),
  deleteMemory: vi.fn(),
  l2NormalizeEmbedding: vi.fn((value) => value),
  searchMemoriesByVector: vi.fn(),
  toUnifiedFloat32Embedding: vi.fn((value) => value),
  updateMemory: vi.fn(),
}));

import { maybeProcessConversationMemory } from './memory-orchestration';
import type { PostStreamContext } from './pipeline-types';

/**
 * 构造记忆后处理测试上下文。
 *
 * @returns 带有记忆 LLM、embedding 配置和取消信号的后台流后处理上下文。
 */
function makeContext(): PostStreamContext {
  return {
    requestId: 'req-memory',
    params: {
      model: 'openrouter/openai/gpt-5.4',
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 2048,
      messages: [{ role: 'user', content: '我喜欢黑咖啡' }],
      memory: {
        enabled: true,
        embeddingModel: 'openai/text-embedding-3-small',
        llmModel: 'openrouter/openai/gpt-5.4',
        userId: 'u1',
        topK: 5,
      },
    },
    assistantText: '记住了。',
    emit: vi.fn(),
    signal: new AbortController().signal,
  } as never;
}

describe('maybeProcessConversationMemory', () => {
  it('事实抽取只使用统一文本任务 call plan 允许的参数', async () => {
    buildTextTaskCallPlanMock.mockResolvedValue({
      languageModel: { id: 'planned-memory-model' },
      callSettings: { maxOutputTokens: 400 },
      providerOptions: { openrouter: { reasoning: { effort: 'none' } } },
    });
    generateTextMock.mockResolvedValue({ text: '{"facts":[]}' });

    await maybeProcessConversationMemory(makeContext());

    expect(buildTextTaskCallPlanMock).toHaveBeenCalledWith({
      model: 'openrouter/openai/gpt-5.4',
      temperature: 0.2,
      maxTokens: 400,
      enableWebSearch: false,
    });
    expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({
      model: { id: 'planned-memory-model' },
      maxOutputTokens: 400,
      providerOptions: { openrouter: { reasoning: { effort: 'none' } } },
    }));
    expect(generateTextMock).toHaveBeenCalledWith(expect.not.objectContaining({
      temperature: 0.2,
    }));
    expect(clearCachedRelevantMemoriesMock).toHaveBeenCalledWith('req-memory');
  });
});
