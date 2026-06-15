/**
 * 说明：`web-search-orchestration.spec` 后台运行时测试。
 *
 * 职责：
 * - 固化外部联网搜索意图识别不再直接拼 `resolveModel() + temperature/maxOutputTokens`；
 * - 确认后台文本任务只消费统一 call plan 允许的参数。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildTextTaskCallPlanMock,
  executeWebSearchMock,
  generateTextMock,
} = vi.hoisted(() => ({
  buildTextTaskCallPlanMock: vi.fn(),
  executeWebSearchMock: vi.fn(),
  generateTextMock: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: generateTextMock,
}));

vi.mock('./text-task-call-plan', () => ({
  buildTextTaskCallPlan: buildTextTaskCallPlanMock,
  toGenerateTextCallSettings: (callSettings: Record<string, unknown>) => callSettings,
}));

vi.mock('@/lib/web-search/provider-registry', () => ({
  isWebSearchProviderUsable: vi.fn(() => true),
  resolveWebSearchProviderId: vi.fn(() => 'mock-search'),
}));

vi.mock('@/lib/web-search/search-service', () => ({
  executeWebSearch: executeWebSearchMock,
}));

import { maybeOrchestrateExternalWebSearch } from './web-search-orchestration';
import type { ChatPipelineContext } from './pipeline-types';

/**
 * 构造联网搜索意图识别测试上下文。
 *
 * @returns 带模型、联网搜索设置和取消信号的后台聊天 pipeline 上下文。
 */
function makeContext(): ChatPipelineContext {
  return {
    requestId: 'req-web',
    params: {
      model: 'openrouter/openai/gpt-5.4',
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 2048,
      messages: [{ role: 'user', content: '你好' }],
      webSearchProviderId: 'mock-search',
      webSearchSettings: { providerId: 'mock-search', maxResults: 5 } as never,
    },
    emit: vi.fn(),
    emitProgress: vi.fn(),
    signal: new AbortController().signal,
  } as never;
}

describe('maybeOrchestrateExternalWebSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('意图改写只使用统一文本任务 call plan 允许的参数', async () => {
    buildTextTaskCallPlanMock.mockResolvedValue({
      languageModel: { id: 'planned-model' },
      callSettings: { maxOutputTokens: 260 },
      providerOptions: { openrouter: { reasoning: { effort: 'none' } } },
    });
    generateTextMock.mockResolvedValue({
      text: '<websearch><question>not_needed</question></websearch>',
    });

    await expect(maybeOrchestrateExternalWebSearch(makeContext())).resolves.toEqual({});

    expect(buildTextTaskCallPlanMock).toHaveBeenCalledWith({
      model: 'openrouter/openai/gpt-5.4',
      temperature: 0.2,
      maxTokens: 260,
      modelParams: undefined,
      enableWebSearch: false,
    });
    expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({
      model: { id: 'planned-model' },
      maxOutputTokens: 260,
      providerOptions: { openrouter: { reasoning: { effort: 'none' } } },
    }));
    expect(generateTextMock).toHaveBeenCalledWith(expect.not.objectContaining({
      temperature: 0.2,
    }));
  });

  it('意图改写 generateText pending 期间会发送 web-search-planning progress', async () => {
    vi.useFakeTimers();
    try {
      let resolveGenerate!: (value: { text: string }) => void;
      buildTextTaskCallPlanMock.mockResolvedValue({
        languageModel: { id: 'planned-model' },
        callSettings: { maxOutputTokens: 260 },
      });
      generateTextMock.mockReturnValueOnce(new Promise((resolve) => {
        resolveGenerate = resolve;
      }));
      const ctx = makeContext();
      const progress = ctx.emitProgress as ReturnType<typeof vi.fn>;

      const run = maybeOrchestrateExternalWebSearch(ctx);
      await Promise.resolve();
      await Promise.resolve();

      expect(progress).toHaveBeenCalledWith({ type: 'chat/progress', stage: 'web-search-planning' });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(progress).toHaveBeenCalledTimes(2);

      resolveGenerate({ text: '<websearch><question>not_needed</question></websearch>' });
      await expect(run).resolves.toEqual({});
      await vi.advanceTimersByTimeAsync(10_000);
      expect(progress).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('真实搜索 executeWebSearch pending 期间会发送 web-search-execution progress', async () => {
    vi.useFakeTimers();
    try {
      let resolveSearch!: (value: Array<{ title: string; url: string; snippet: string }>) => void;
      buildTextTaskCallPlanMock.mockResolvedValue({
        languageModel: { id: 'planned-model' },
        callSettings: { maxOutputTokens: 260 },
      });
      generateTextMock.mockResolvedValue({
        text: '<websearch><question>Olyq stream watchdog best practice</question></websearch>',
      });
      executeWebSearchMock.mockReturnValueOnce(new Promise((resolve) => {
        resolveSearch = resolve;
      }));
      const ctx = makeContext();
      const progress = ctx.emitProgress as ReturnType<typeof vi.fn>;

      const run = maybeOrchestrateExternalWebSearch(ctx);

      await vi.waitFor(() => {
        expect(progress).toHaveBeenCalledWith({ type: 'chat/progress', stage: 'web-search-planning' });
      });
      await vi.waitFor(() => {
        expect(progress).toHaveBeenCalledWith({ type: 'chat/progress', stage: 'web-search-execution' });
      });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(progress).toHaveBeenCalledWith({ type: 'chat/progress', stage: 'web-search-execution' });

      resolveSearch([{ title: 'Result', url: 'https://example.com', snippet: 'Snippet' }]);
      const result = await run;
      expect(result.messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
      ]));
      const callsAfterResolve = progress.mock.calls.length;
      await vi.advanceTimersByTimeAsync(10_000);
      expect(progress).toHaveBeenCalledTimes(callsAfterResolve);
    } finally {
      vi.useRealTimers();
    }
  });
});
