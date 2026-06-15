/**
 * 说明：`object-gen.test` 后台运行时模块。
 *
 * 职责：
 * - 验证 `topic-title` 一次性任务优先走 `streamText().fullStream`；
 * - 验证只有模型显式不支持 text delta 时才回退 `generateText()`；
 * - 守住自动命名的 SSE-safe 背景执行契约。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  APICallErrorMock,
  buildRuntimeCallPlanMock,
  generateTextMock,
  resolveStreamContextMock,
  safePostMessageMock,
  streamTextMock,
} = vi.hoisted(() => ({
  APICallErrorMock: class APICallError extends Error {
    statusCode?: number;
    responseBody?: unknown;
    data?: unknown;

    constructor(init: { statusCode?: number; responseBody?: unknown; data?: unknown; message?: string }) {
      super(init.message ?? 'API call failed');
      this.name = 'AI_APICallError';
      this.statusCode = init.statusCode;
      this.responseBody = init.responseBody;
      this.data = init.data;
    }

    /** 对齐真实 AI SDK `APICallError.isInstance` 的最小判型入口。 */
    static isInstance(value: unknown) {
      return value instanceof this;
    }
  },
  buildRuntimeCallPlanMock: vi.fn(),
  generateTextMock: vi.fn(),
  resolveStreamContextMock: vi.fn(),
  safePostMessageMock: vi.fn(),
  streamTextMock: vi.fn(),
}));

vi.mock('ai', () => ({
  APICallError: APICallErrorMock,
  generateText: generateTextMock,
  streamText: streamTextMock,
  wrapLanguageModel: ({ model }: { model: unknown }) => model,
}));

vi.mock('../../lib/ai/stream-chat-context', () => ({
  buildRuntimeCallPlan: buildRuntimeCallPlanMock,
  resolveStreamContext: resolveStreamContextMock,
}));

vi.mock('./port-manager', () => ({
  safePostMessage: safePostMessageMock,
}));

import { generateObjectToPort, streamObjectToPort } from './object-gen';

/**
 * 构造最小化的流式上下文桩，显式控制 text delta 能力与 transport 协议。
 *
 * 说明：
 * - `topic-title` 的分流逻辑只依赖这两个字段；
 * - 测试通过这个 helper 固定上下文真相，避免每个用例重复展开无关结构。
 */
function makeStreamContext(overrides?: {
  supportedTextDelta?: boolean;
  transportProtocol?: string;
}) {
  return {
    modelConfig: { supportedTextDelta: overrides?.supportedTextDelta ?? true },
    resolvedModelMeta: { transportProtocol: overrides?.transportProtocol ?? 'openai-chat' },
  };
}

describe('object-gen topic-title', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    streamTextMock.mockReset();
    resolveStreamContextMock.mockReset();
    buildRuntimeCallPlanMock.mockReset();
    safePostMessageMock.mockReset();

    buildRuntimeCallPlanMock.mockResolvedValue({
      languageModel: { id: 'mock-language-model' },
      middlewares: [],
      callSettings: {},
      providerOptions: undefined,
    });
    safePostMessageMock.mockReturnValue(true);
  });

  it('默认优先消费 streamText().fullStream，把 SSE 成功流视为成功', async () => {
    resolveStreamContextMock.mockResolvedValue(makeStreamContext());
    streamTextMock.mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: '页面风格分析' };
      })(),
    });

    await generateObjectToPort({
      req: {
        requestId: 'req-stream',
        taskId: 'topic-title',
        model: 'openai/gpt-5.4',
        input: { sample: '用户：帮我总结这个页面' },
      },
      port: {} as chrome.runtime.Port,
      signal: new AbortController().signal,
    });

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(safePostMessageMock).toHaveBeenNthCalledWith(1, expect.any(Object), {
      type: 'object/result',
      requestId: 'req-stream',
      output: { title: '页面风格分析' },
    });
    expect(safePostMessageMock).toHaveBeenNthCalledWith(2, expect.any(Object), {
      type: 'object/done',
      requestId: 'req-stream',
    });
  });

  it('模型显式不支持 text delta 时才回退 generateText', async () => {
    resolveStreamContextMock.mockResolvedValue(makeStreamContext({ supportedTextDelta: false }));
    generateTextMock.mockResolvedValue({
      text: '自动命名成功',
    });

    await generateObjectToPort({
      req: {
        requestId: 'req-generate',
        taskId: 'topic-title',
        model: 'openai/gpt-5.4',
        input: { sample: '用户：帮我总结这个页面' },
      },
      port: {} as chrome.runtime.Port,
      signal: new AbortController().signal,
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(safePostMessageMock).toHaveBeenNthCalledWith(1, expect.any(Object), {
      type: 'object/result',
      requestId: 'req-generate',
      output: { title: '自动命名成功' },
    });
    expect(safePostMessageMock).toHaveBeenNthCalledWith(2, expect.any(Object), {
      type: 'object/done',
      requestId: 'req-generate',
    });
  });

  it('openai-responses 即使支持 text delta，也会直接走 generateText 完成态', async () => {
    resolveStreamContextMock.mockResolvedValue(makeStreamContext({
      supportedTextDelta: true,
      transportProtocol: 'openai-responses',
    }));
    generateTextMock.mockResolvedValue({
      text: 'Responses 最终标题',
    });

    await generateObjectToPort({
      req: {
        requestId: 'req-openai-responses',
        taskId: 'topic-title',
        model: 'openai/gpt-5.4',
        input: { sample: '用户：帮我总结这个页面' },
      },
      port: {} as chrome.runtime.Port,
      signal: new AbortController().signal,
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(safePostMessageMock).toHaveBeenNthCalledWith(1, expect.any(Object), {
      type: 'object/result',
      requestId: 'req-openai-responses',
      output: { title: 'Responses 最终标题' },
    });
    expect(safePostMessageMock).toHaveBeenNthCalledWith(2, expect.any(Object), {
      type: 'object/done',
      requestId: 'req-openai-responses',
    });
  });

  it('openai-responses 的 generateText 若命中 HTTP 200 + SSE body，也会恢复最终标题而不是误判失败', async () => {
    resolveStreamContextMock.mockResolvedValue(makeStreamContext({
      supportedTextDelta: true,
      transportProtocol: 'openai-responses',
    }));
    generateTextMock.mockRejectedValue(new APICallErrorMock({
      statusCode: 200,
      responseBody: [
        'event: response.created',
        'data: {"type":"response.created","response":{"id":"resp_123"}}',
        '',
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","delta":"MCP反馈"}',
        '',
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","delta":"控制台页面分析"}',
        '',
        'event: response.output_text.done',
        'data: {"type":"response.output_text.done","text":"MCP反馈控制台页面分析"}',
        '',
        'event: response.completed',
        'data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"MCP反馈控制台页面分析"}]}]}}',
      ].join('\n'),
    }));

    await generateObjectToPort({
      req: {
        requestId: 'req-openai-responses-sse-200',
        taskId: 'topic-title',
        model: 'openai/gpt-5.4',
        input: { sample: '用户：帮我分析 MCP 反馈控制台页面' },
      },
      port: {} as chrome.runtime.Port,
      signal: new AbortController().signal,
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(safePostMessageMock.mock.calls.map(([, event]) => event)).toEqual([
      {
        type: 'object/result',
        requestId: 'req-openai-responses-sse-200',
        output: { title: 'MCP反馈控制台页面分析' },
      },
      {
        type: 'object/done',
        requestId: 'req-openai-responses-sse-200',
      },
    ]);
  });

  it('openai-responses 的 generateText 若命中 HTTP 200 + JSON body，也会恢复最终标题而不是误判失败', async () => {
    resolveStreamContextMock.mockResolvedValue(makeStreamContext({
      supportedTextDelta: true,
      transportProtocol: 'openai-responses',
    }));
    generateTextMock.mockRejectedValue(new APICallErrorMock({
      statusCode: 200,
      responseBody: JSON.stringify({
        id: 'resp_02e8336d6368e0c6016a13f1b15bbc8198819987284a93bdb4',
        object: 'response',
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: '生成复刻YouTube提示词',
              },
            ],
          },
        ],
      }),
    }));

    await generateObjectToPort({
      req: {
        requestId: 'req-openai-responses-json-200',
        taskId: 'topic-title',
        model: 'openai/gpt-5.4',
        input: { sample: '用户：我要复刻youtube网站，给我ai能用的完整提示词' },
      },
      port: {} as chrome.runtime.Port,
      signal: new AbortController().signal,
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(safePostMessageMock.mock.calls.map(([, event]) => event)).toEqual([
      {
        type: 'object/result',
        requestId: 'req-openai-responses-json-200',
        output: { title: '生成复刻YouTube提示词' },
      },
      {
        type: 'object/done',
        requestId: 'req-openai-responses-json-200',
      },
    ]);
  });

  it('streamObjectToPort 在 openai-responses 下不会发送 object/partial', async () => {
    resolveStreamContextMock.mockResolvedValue(makeStreamContext({
      supportedTextDelta: true,
      transportProtocol: 'openai-responses',
    }));
    generateTextMock.mockResolvedValue({
      text: 'Responses 只发最终标题',
    });

    await streamObjectToPort({
      req: {
        requestId: 'req-stream-openai-responses',
        taskId: 'topic-title',
        model: 'openai/gpt-5.4',
        input: { sample: '用户：帮我总结这个页面' },
      },
      port: {} as chrome.runtime.Port,
      signal: new AbortController().signal,
    });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(safePostMessageMock.mock.calls.map(([, event]) => event)).toEqual([
      {
        type: 'object/result',
        requestId: 'req-stream-openai-responses',
        output: { title: 'Responses 只发最终标题' },
      },
      {
        type: 'object/done',
        requestId: 'req-stream-openai-responses',
      },
    ]);
  });
});
