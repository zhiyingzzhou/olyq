/**
 * 说明：`memory-tools` 后台工具测试。
 *
 * 职责：
 * - 固化 Memory 工具真实执行 embedding / vector search 期间的 pipeline activity；
 * - 防止记忆检索重新散落自己的 heartbeat 或被误算成模型可见输出。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatStreamParams } from '../../lib/ai/types';
import type { MemoryItem } from '../../lib/memory/types';

const {
  resolveEmbeddingExecutorMock,
  resolveRerankModelMock,
  searchMemoriesByVectorMock,
} = vi.hoisted(() => ({
  resolveEmbeddingExecutorMock: vi.fn(),
  resolveRerankModelMock: vi.fn(),
  searchMemoriesByVectorMock: vi.fn(),
}));

vi.mock('ai', () => ({
  jsonSchema: vi.fn((schema) => schema),
  rerank: vi.fn(),
  tool: vi.fn((definition) => definition),
}));

vi.mock('../../lib/ai/provider-runtime', () => ({
  resolveRerankModel: resolveRerankModelMock,
}));

vi.mock('../../lib/ai/embedding-executor', () => ({
  resolveEmbeddingExecutor: resolveEmbeddingExecutorMock,
}));

vi.mock('../../lib/memory', () => ({
  l2NormalizeEmbedding: vi.fn((value) => value),
  searchMemoriesByVector: searchMemoriesByVectorMock,
  toUnifiedFloat32Embedding: vi.fn((value) => value),
}));

import { collectMemoryToolsForChat } from './memory-tools';

/** 构造启用 Memory 的聊天参数。 */
function makeParams(): ChatStreamParams {
  return {
    model: 'provider/model',
    messages: [{ role: 'user', content: 'hello' }],
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 256,
    memory: {
      enabled: true,
      userId: 'u1',
      assistantId: 'assistant-1',
      embeddingModel: 'provider/embedding',
      llmModel: 'provider/llm',
      topK: 5,
    },
  };
}

describe('collectMemoryToolsForChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveRerankModelMock.mockResolvedValue({ id: 'rerank-model' });
    searchMemoriesByVectorMock.mockResolvedValue([
      {
        id: 'm1',
        memory: 'prefers black coffee',
        score: 0.9,
        createdAt: 1,
        updatedAt: 1,
      } satisfies MemoryItem,
    ]);
  });

  it('Memory 工具执行 pending 期间发送 memory-tool-execution progress', async () => {
    vi.useFakeTimers();
    try {
      let resolveEmbedding!: (value: number[]) => void;
      resolveEmbeddingExecutorMock.mockResolvedValue({
        execute: vi.fn(() => new Promise<number[]>((resolve) => {
          resolveEmbedding = resolve;
        })),
      });
      const emitProgress = vi.fn();
      const tools = await collectMemoryToolsForChat({
        requestId: 'req-memory-tool',
        params: makeParams(),
        signal: new AbortController().signal,
        emitProgress,
      });
      const execute = (tools?.builtin__memory_search as unknown as {
        execute: (input: unknown) => Promise<MemoryItem[]>;
      }).execute;

      const run = execute({ query: 'coffee', limit: 3 });
      expect(emitProgress).toHaveBeenCalledWith({ type: 'chat/progress', stage: 'memory-tool-execution' });

      await vi.advanceTimersByTimeAsync(10_000);
      expect(emitProgress).toHaveBeenCalledTimes(2);

      resolveEmbedding([1, 0, 0]);
      await expect(run).resolves.toEqual([
        expect.objectContaining({ id: 'm1', memory: 'prefers black coffee' }),
      ]);
      expect(searchMemoriesByVectorMock).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'u1',
        assistantId: 'assistant-1',
        limit: 3,
      }));

      await vi.advanceTimersByTimeAsync(10_000);
      expect(emitProgress).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
