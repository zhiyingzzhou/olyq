/**
 * 说明：`screenshot-ocr.test` 后台截图 OCR 模型调用测试。
 *
 * 职责：
 * - 验证 OCR 复用统一 provider runtime plan；
 * - 锁住 `ocrModel` / 默认对话模型继承语义；
 * - 确保 OCR 请求必须走 vision-input 校验并禁用 AI SDK 隐式重试。
 */
import { APICallError, RetryError } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { I18nError } from '@/lib/i18n/error';
import type { ProviderContract } from '@/lib/ai/providers/provider-contracts';
import { DEFAULT_SETTINGS, type ChatSettings } from '@/types/chat';
import type { ScreenshotEditorActionPayload } from '@/plugins/page-tools/screenshot-capture/contracts';
import { extractTextFromScreenshot } from './screenshot-ocr';

const payload: ScreenshotEditorActionPayload = {
  action: 'ocr',
  image: {
    dataUrl: 'data:image/png;base64,QUJD',
    mime: 'image/png',
    name: 'shot.png',
  },
  source: { url: 'https://example.com', title: 'Example' },
  rect: { x: 1, y: 2, width: 3, height: 4 },
};

const jpegPayload: ScreenshotEditorActionPayload = {
  ...payload,
  image: {
    dataUrl: 'data:image/jpeg;base64,SkZJRg==',
    mime: 'image/jpeg',
    name: 'shot.jpg',
  },
};

const providerContract: ProviderContract = {
  providerId: 'openai',
  transportFamily: 'openai-chat',
  inputPolicies: { image: 'supported', file: 'supported' },
  allowedProviderOptions: [],
  supportsResponses: false,
  supportsChatCompletions: true,
};

/** 构造当前聊天设置，保留默认配置字段完整性。 */
function makeSettings(partial: Partial<ChatSettings>): ChatSettings {
  return { ...DEFAULT_SETTINGS, ...partial };
}

/** 构造 OCR 测试用 stream context。 */
function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    providerId: 'openai',
    modelId: 'gpt-5.4-vision',
    providerConfig: { id: 'openai', name: 'OpenAI', enabled: true },
    providerContract,
    resolvedModelMeta: {
      kind: 'multimodal-chat',
      inputModalities: ['image'],
      features: ['vision-input'],
      transportProtocol: 'openai-chat',
    },
    featureKeys: new Set(['vision-input']),
    ...overrides,
  } as never;
}

/** 构造 OCR 测试用 runtime call plan。 */
function makeRuntimeCallPlan(overrides: Record<string, unknown> = {}) {
  return {
    languageModel: {},
    callSettings: {},
    middlewares: [],
    executionMode: 'streamText',
    wantsInlineImage: false,
    ...overrides,
  };
}

/** 构造 AI SDK API 错误，覆盖 OCR 错误保真路径。 */
function makeApiCallError(overrides?: Partial<ConstructorParameters<typeof APICallError>[0]>) {
  return new APICallError({
    message: 'API call failed',
    url: 'https://api.example.com/v1/chat/completions',
    requestBodyValues: {},
    ...overrides,
  });
}

/** 构造符合 OCR 内部结构化输出契约的模型文本。 */
function makeOcrOutput(text: string): string {
  return JSON.stringify({ text });
}

describe('extractTextFromScreenshot', () => {
  it('优先使用 OCR 模型并通过统一 runtime plan 调用 streamText', async () => {
    const readSettings = vi.fn(async () => makeSettings({
      defaultModel: 'openai/gpt-5.4',
      ocrModel: 'openai/gpt-5.4-vision',
      defaultTopP: 0.8,
      defaultMaxTokens: 1234,
    }));
    const resolveContext = vi.fn(async () => makeContext());
    const languageModel = { modelId: 'mock-language-model' };
    const buildPlan = vi.fn(async () => makeRuntimeCallPlan({
      languageModel,
      providerOptions: { openai: { serviceTier: 'auto' } },
      callSettings: { temperature: 0, topP: 0.8, maxOutputTokens: 1234 },
    }));
    const generateText = vi.fn(async () => {
      throw new Error('generateText should not be called');
    });
    const streamText = vi.fn((_args: unknown) => ({ text: Promise.resolve(`  ${makeOcrOutput('first\r\nsecond')}  `) }));

    const result = await extractTextFromScreenshot(payload, {
      readSettings,
      resolveContext,
      buildPlan: buildPlan as never,
      generateText: generateText as never,
      streamText: streamText as never,
    });

    expect(result).toEqual({ text: 'first\nsecond' });
    expect(resolveContext).toHaveBeenCalledWith(expect.objectContaining({
      model: 'openai/gpt-5.4-vision',
      temperature: 0,
      topP: 0.8,
      maxTokens: 1234,
    }));
    expect(buildPlan).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      model: 'openai/gpt-5.4-vision',
    }));
    expect(generateText).not.toHaveBeenCalled();
    expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
      model: languageModel,
      providerOptions: { openai: { serviceTier: 'auto' } },
      temperature: 0,
      topP: 0.8,
      maxOutputTokens: 1234,
      maxRetries: 0,
      messages: [
        expect.objectContaining({
          role: 'user',
          content: expect.arrayContaining([
            expect.objectContaining({ type: 'text' }),
            expect.objectContaining({ type: 'image', image: 'QUJD', mediaType: 'image/png' }),
          ]),
        }),
      ],
    }));
    const call = streamText.mock.calls[0]?.[0] as {
      messages: Array<{ content: Array<{ type: string; text?: string }> }>;
    };
    const prompt = call.messages[0]?.content.find((part) => part.type === 'text')?.text ?? '';
    expect(prompt).toContain('{"text":"..."}');
    expect(prompt).toMatch(/不要添加解释|do not add explanations/i);
    expect(prompt).toMatch(/Markdown/i);
  });

  it('默认流式链路不会触发要求 stream=true 的非流式 400', async () => {
    const generateText = vi.fn(async () => {
      throw makeApiCallError({
        statusCode: 400,
        responseBody: JSON.stringify({ error: { message: 'Stream must be set to true' } }),
      });
    });
    const streamText = vi.fn(() => ({ text: Promise.resolve(makeOcrOutput('stream ok')) }));

    const result = await extractTextFromScreenshot(payload, {
      readSettings: async () => makeSettings({ defaultModel: 'openai/gpt-5.4-vision' }),
      resolveContext: async () => makeContext(),
      buildPlan: (async () => makeRuntimeCallPlan()) as never,
      generateText: generateText as never,
      streamText: streamText as never,
    });

    expect(result).toEqual({ text: 'stream ok' });
    expect(streamText).toHaveBeenCalledTimes(1);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('runtime plan 明确要求 generateText 时才走非流式路径', async () => {
    const generateText = vi.fn(async () => ({ text: makeOcrOutput('generate ok') }));
    const streamText = vi.fn(() => ({ text: Promise.resolve(makeOcrOutput('stream should not run')) }));

    const result = await extractTextFromScreenshot(payload, {
      readSettings: async () => makeSettings({ defaultModel: 'openai/gpt-5.4-vision' }),
      resolveContext: async () => makeContext(),
      buildPlan: (async () => makeRuntimeCallPlan({ executionMode: 'generateText' })) as never,
      generateText: generateText as never,
      streamText: streamText as never,
    });

    expect(result).toEqual({ text: 'generate ok' });
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(streamText).not.toHaveBeenCalled();
  });

  it('模型声明不支持 text-delta 时复用聊天 no text-delta generateText fallback', async () => {
    const generateText = vi.fn(async () => ({ text: makeOcrOutput('no delta ok') }));
    const streamText = vi.fn(() => ({ text: Promise.resolve(makeOcrOutput('stream should not run')) }));

    const result = await extractTextFromScreenshot(payload, {
      readSettings: async () => makeSettings({ defaultModel: 'openai/gpt-5.4-vision' }),
      resolveContext: async () => makeContext({
        modelConfig: { supportedTextDelta: false },
      }),
      buildPlan: (async () => makeRuntimeCallPlan({ executionMode: 'streamText', wantsInlineImage: false })) as never,
      generateText: generateText as never,
      streamText: streamText as never,
    });

    expect(result).toEqual({ text: 'no delta ok' });
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(streamText).not.toHaveBeenCalled();
  });

  it('OCR 只展示结构化 JSON 的 text 字段并保留截图原文 Markdown 字符', async () => {
    const streamText = vi.fn(() => ({ text: Promise.resolve(makeOcrOutput('**smart-subscription**')) }));

    const result = await extractTextFromScreenshot(payload, {
      readSettings: async () => makeSettings({ defaultModel: 'openai/gpt-5.4-vision' }),
      resolveContext: async () => makeContext(),
      buildPlan: (async () => makeRuntimeCallPlan()) as never,
      streamText: streamText as never,
    });

    expect(result).toEqual({ text: '**smart-subscription**' });
  });

  it('OCR JSON text 字段会保留多行结构并归一化 CRLF', async () => {
    const streamText = vi.fn(() => ({ text: Promise.resolve(makeOcrOutput('first\r\nsecond')) }));

    const result = await extractTextFromScreenshot(payload, {
      readSettings: async () => makeSettings({ defaultModel: 'openai/gpt-5.4-vision' }),
      resolveContext: async () => makeContext(),
      buildPlan: (async () => makeRuntimeCallPlan()) as never,
      streamText: streamText as never,
    });

    expect(result).toEqual({ text: 'first\nsecond' });
  });

  it.each([
    ['提取结果如下：\nsmart-subscription'],
    ['```json\n{"text":"smart-subscription"}\n```'],
    ['not json'],
    ['{"text":42}'],
    ['["smart-subscription"]'],
  ])('OCR 模型输出非严格 JSON text 契约时返回稳定格式错误：%s', async (modelText) => {
    await expect(extractTextFromScreenshot(payload, {
      readSettings: async () => makeSettings({ defaultModel: 'openai/gpt-5.4-vision' }),
      resolveContext: async () => makeContext(),
      buildPlan: (async () => makeRuntimeCallPlan()) as never,
      streamText: (() => ({ text: Promise.resolve(modelText) })) as never,
    })).rejects.toMatchObject({
      i18n: { key: 'errors.screenshotOcrOutputInvalid' },
    } satisfies Partial<I18nError>);
  });

  it('未配置 OCR 模型时继承默认对话模型', async () => {
    const resolveContext = vi.fn(async () => makeContext());
    const buildPlan = vi.fn(async () => makeRuntimeCallPlan());
    const streamText = vi.fn(() => ({ text: Promise.resolve(makeOcrOutput('text')) }));

    await extractTextFromScreenshot(payload, {
      readSettings: async () => makeSettings({ defaultModel: 'openai/gpt-5.4-vision', ocrModel: undefined }),
      resolveContext,
      buildPlan: buildPlan as never,
      streamText: streamText as never,
    });

    expect(resolveContext).toHaveBeenCalledWith(expect.objectContaining({
      model: 'openai/gpt-5.4-vision',
    }));
  });

  it('OCR JPEG 图片会按 AI SDK 多模态 ImagePart 直接提交，不走聊天附件双轨', async () => {
    const streamText = vi.fn(() => ({ text: Promise.resolve(makeOcrOutput('jpeg text')) }));

    await extractTextFromScreenshot(jpegPayload, {
      readSettings: async () => makeSettings({ defaultModel: 'openai/gpt-5.4-vision' }),
      resolveContext: async () => makeContext(),
      buildPlan: (async () => makeRuntimeCallPlan()) as never,
      streamText: streamText as never,
    });

    expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        expect.objectContaining({
          role: 'user',
          content: [
            expect.objectContaining({ type: 'text' }),
            { type: 'image', image: 'SkZJRg==', mediaType: 'image/jpeg' },
          ],
        }),
      ],
    }));
  });

  it('data URL MIME 与 payload MIME 不一致时返回 OCR 图片格式错误', async () => {
    await expect(extractTextFromScreenshot({
      ...payload,
      image: {
        dataUrl: 'data:image/jpeg;base64,SkZJRg==',
        mime: 'image/png',
        name: 'bad.png',
      },
    }, {
      readSettings: async () => makeSettings({ defaultModel: 'openai/gpt-5.4-vision' }),
      resolveContext: async () => makeContext(),
      buildPlan: (async () => makeRuntimeCallPlan()) as never,
      generateText: (async () => ({ text: makeOcrOutput('should not run') })) as never,
      streamText: (() => ({ text: Promise.resolve(makeOcrOutput('should not run')) })) as never,
    })).rejects.toMatchObject({
      i18n: { key: 'errors.screenshotOcrImageInvalid' },
    } satisfies Partial<I18nError>);
  });

  it('非视觉模型会返回稳定 OCR 模型配置错误且不调用模型接口', async () => {
    const generateText = vi.fn(async () => ({ text: makeOcrOutput('should not run') }));
    const streamText = vi.fn(() => ({ text: Promise.resolve(makeOcrOutput('should not run')) }));

    await expect(extractTextFromScreenshot(payload, {
      readSettings: async () => makeSettings({ defaultModel: 'openai/gpt-5.4' }),
      resolveContext: async () => makeContext({
        resolvedModelMeta: {
          kind: 'chat',
          inputModalities: [],
          features: [],
          transportProtocol: 'openai-chat',
        },
        featureKeys: new Set(),
      }),
      buildPlan: (async () => makeRuntimeCallPlan()) as never,
      generateText: generateText as never,
      streamText: streamText as never,
    })).rejects.toMatchObject({
      i18n: { key: 'errors.screenshotOcrModelNotVision' },
    } satisfies Partial<I18nError>);
    expect(generateText).not.toHaveBeenCalled();
    expect(streamText).not.toHaveBeenCalled();
  });

  it('provider APICallError 会保留 HTTP 与响应体诊断，而不是包成通用 OCR 失败', async () => {
    await expect(extractTextFromScreenshot(payload, {
      readSettings: async () => makeSettings({ defaultModel: 'openai/gpt-5.4-vision' }),
      resolveContext: async () => makeContext(),
      buildPlan: (async () => makeRuntimeCallPlan()) as never,
      streamText: (() => {
        throw makeApiCallError({
          statusCode: 429,
          responseBody: JSON.stringify({ error: { message: 'insufficient_quota' } }),
        });
      }) as never,
    })).rejects.toMatchObject({
      i18n: {
        key: 'errors.apiCallRateLimitOrQuotaWithDetail',
        params: {
          detail: 'HTTP 429 · https://api.example.com/v1/chat/completions · insufficient_quota',
        },
      },
    } satisfies Partial<I18nError>);
  });

  it('RetryError 会选择真实 APICallError 响应体，不被 Failed to fetch 覆盖', async () => {
    const apiError = makeApiCallError({
      statusCode: 503,
      responseHeaders: { 'x-request-id': 'req_503' },
      responseBody: JSON.stringify({ error: { message: '模型渠道暂不可用' } }),
    });

    await expect(extractTextFromScreenshot(payload, {
      readSettings: async () => makeSettings({ defaultModel: 'openai/gpt-5.4-vision' }),
      resolveContext: async () => makeContext(),
      buildPlan: (async () => makeRuntimeCallPlan()) as never,
      streamText: (() => {
        throw new RetryError({
          message: 'Failed after 2 attempts. Last error: Failed to fetch',
          reason: 'errorNotRetryable',
          errors: [apiError, new TypeError('Failed to fetch')],
        });
      }) as never,
    })).rejects.toMatchObject({
      i18n: {
        key: 'errors.apiCallHttpErrorWithDetail',
        params: {
          status: 503,
          detail: 'HTTP 503 · https://api.example.com/v1/chat/completions · request_id=req_503 · 模型渠道暂不可用',
        },
      },
    } satisfies Partial<I18nError>);
  });
});
