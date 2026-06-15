/**
 * 说明：`health-check.test` 后台运行时模块。
 *
 * 职责：
 * - 承载 `health-check.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  APICallErrorMock,
  RetryErrorMock,
  buildRuntimeCallPlanMock,
  createLanguageModelMock,
  getProviderViewMock,
  generateTextMock,
  streamTextMock,
  createEmbeddingExecutorMock,
  resolveProviderRuntimeContextMock,
  resolveModelMetaMock,
} = vi.hoisted(() => ({
  APICallErrorMock: class APICallError extends Error {
    statusCode?: number
    responseBody?: unknown
    data?: unknown
    url?: string
    responseHeaders?: unknown

	    constructor(init: {
      statusCode?: number
      responseBody?: unknown
      data?: unknown
      message?: string
      url?: string
      responseHeaders?: unknown
    }) {
      super(init.message ?? 'API call failed')
      this.name = 'AI_APICallError'
      this.statusCode = init.statusCode
      this.responseBody = init.responseBody
      this.data = init.data
      this.url = init.url
	      this.responseHeaders = init.responseHeaders
	    }
	
	    /**
	     * 对齐真实 AI SDK `APICallError.isInstance` 的最小判型入口。
	     *
	     * @param value - 待判断的未知值。
	     * @returns 命中当前 mock 类实例时返回 `true`。
	     */
	    static isInstance(value: unknown) {
	      return value instanceof this
	    }
	  },
  RetryErrorMock: class RetryError extends Error {
    lastError?: unknown

    constructor(init: { message?: string; lastError?: unknown }) {
      super(init.message ?? 'retry failed')
	      this.name = 'AI_RetryError'
	      this.lastError = init.lastError
	    }
	
	    /**
	     * 对齐真实 AI SDK `RetryError.isInstance` 的最小判型入口。
	     *
	     * @param value - 待判断的未知值。
	     * @returns 命中当前 mock 类实例时返回 `true`。
	     */
	    static isInstance(value: unknown) {
	      return value instanceof this
	    }
	  },
  buildRuntimeCallPlanMock: vi.fn(),
  createLanguageModelMock: vi.fn(),
  getProviderViewMock: vi.fn(),
  generateTextMock: vi.fn(),
  streamTextMock: vi.fn(),
  createEmbeddingExecutorMock: vi.fn(),
  resolveProviderRuntimeContextMock: vi.fn(),
  resolveModelMetaMock: vi.fn(),
}))

vi.mock('ai', () => ({
  APICallError: APICallErrorMock,
  RetryError: RetryErrorMock,
  embed: vi.fn(),
  generateImage: vi.fn(),
  generateText: generateTextMock,
  rerank: vi.fn(),
  streamText: streamTextMock,
  wrapLanguageModel: ({ model }: { model: unknown }) => model,
}))

vi.mock('../../lib/ai/provider-storage', () => ({
  getProviderView: getProviderViewMock,
}))

vi.mock('../../lib/ai/provider-runtime', () => ({
  resolveProviderRuntimeContext: resolveProviderRuntimeContextMock,
}))

vi.mock('../../lib/ai/provider-factory', () => ({
  createEmbeddingModel: vi.fn(),
  createImageModel: vi.fn(),
  createLanguageModel: createLanguageModelMock,
  createRerankModel: vi.fn(),
  createSpeechModel: vi.fn(),
  createTranscriptionModel: vi.fn(),
}))

vi.mock('../../lib/ai/embedding-executor', () => ({
  createEmbeddingExecutor: createEmbeddingExecutorMock,
}))

vi.mock('../../lib/ai/model-registry', () => ({
  resolveModelMeta: resolveModelMetaMock,
}))

vi.mock('../../lib/ai/stream-chat-context', () => ({
  buildRuntimeCallPlan: buildRuntimeCallPlanMock,
}))

vi.mock('../../lib/ai/stream-chat-utils', () => ({
  getOpenAiCompatibleProviderKey: vi.fn(),
  getProviderOptionsKey: vi.fn(),
	resolveEffectiveProviderType: vi.fn(() => 'openai'),
}))

/**
 * 构造最小可用的文本模型 Provider 配置。
 *
 * @param overrides - 可选覆盖项。
 * @returns 适合 health-check 文本模型测试复用的 provider 数据。
 */
function makeTextProvider(overrides?: {
  providerId?: string
  providerType?: string
  apiHost?: string
  modelId?: string
}) {
  const providerId = overrides?.providerId ?? 'openai'
  const providerType = overrides?.providerType ?? 'openai'
  const apiHost = overrides?.apiHost ?? 'https://api.example.com/v1'
  const modelId = overrides?.modelId ?? 'gpt-5.1'
  return {
    id: providerId,
    name: 'OpenAI',
    type: providerType,
    enabled: true,
    apiKey: 'k',
    apiHost,
    models: [{ id: modelId, name: modelId, supportedTextDelta: true }],
	}
}

/**
 * 为文本模型健康检查场景准备完整 runtime mock。
 *
 * @param overrides - transport、executionMode 与模型能力等覆盖项。
 */
function mockTextHealthCheckContext(overrides?: {
  providerId?: string
  providerType?: string
  apiHost?: string
  modelId?: string
  transportProtocol?: string
  supportedTextDelta?: boolean
  executionMode?: 'streamText' | 'generateText'
}) {
  const providerId = overrides?.providerId ?? 'openai'
  const providerType = overrides?.providerType ?? 'openai'
  const apiHost = overrides?.apiHost ?? 'https://api.example.com/v1'
  const modelId = overrides?.modelId ?? 'gpt-5.1'
  const transportProtocol = overrides?.transportProtocol ?? 'openai-chat'
  const supportedTextDelta = overrides?.supportedTextDelta ?? true

  getProviderViewMock.mockResolvedValue({
    ...makeTextProvider({ providerId, providerType, apiHost, modelId }),
    models: [{ id: modelId, name: modelId, supportedTextDelta }],
  })
  resolveModelMetaMock.mockResolvedValue({
    canonicalId: `provider::${providerId}::${modelId}`,
    baseModelKey: modelId,
    scope: 'provider',
    kind: 'chat',
    inputModalities: ['text'],
    outputModalities: ['text'],
    features: [],
    transportProtocol,
    displayName: modelId,
    confidence: 'high',
  })
  resolveProviderRuntimeContextMock.mockResolvedValue({
    runtimeConfig: {
      id: providerId,
      name: 'OpenAI',
      type: providerType,
      apiKey: 'k',
      apiHost,
      enabled: true,
      models: [{ id: modelId, name: modelId, supportedTextDelta }],
    },
    apiKey: 'k',
    apiHost,
    modelId,
    resolvedModelMeta: {
      kind: 'chat',
      inputModalities: ['text'],
      outputModalities: ['text'],
      transportProtocol,
      features: [],
    },
  })
  createLanguageModelMock.mockResolvedValue({ id: `mock-language-model:${modelId}` })
  buildRuntimeCallPlanMock.mockResolvedValue({
    languageModel: { id: `mock-language-model:${modelId}` },
    middlewares: [],
    callSettings: {},
    providerOptions: undefined,
    executionMode: overrides?.executionMode ?? 'streamText',
  })
}

describe('runHealthCheckToPort', () => {
  beforeEach(() => {
    buildRuntimeCallPlanMock.mockReset()
    createLanguageModelMock.mockReset()
    getProviderViewMock.mockReset()
    generateTextMock.mockReset()
    streamTextMock.mockReset()
    createEmbeddingExecutorMock.mockReset()
    resolveProviderRuntimeContextMock.mockReset()
    resolveModelMetaMock.mockReset()
  })

  it('会为不存在的 modelId 逐条发送 health/model(error)，而不是静默忽略', async () => {
    getProviderViewMock.mockResolvedValue({
      id: 'openai',
      name: 'OpenAI',
      type: 'openai',
      enabled: true,
      apiKey: 'k',
      apiHost: 'https://api.example.com/v1',
      models: [{ id: 'existing-model', name: 'Existing Model' }],
    })

    const messages: unknown[] = []
    const port = {
      postMessage: (message: unknown) => {
        messages.push(message)
      },
    } as unknown as chrome.runtime.Port

    const { runHealthCheckToPort } = await import('./health-check')

    await runHealthCheckToPort({
      requestId: 'req-missing-model',
      payload: {
        providerId: 'openai',
        modelIds: ['missing-model'],
        keyCheckMode: 'single',
        selectedKeyIndex: 0,
        isConcurrent: false,
        timeoutMs: 1_000,
      },
      port,
      signal: new AbortController().signal,
    })

    expect(messages).toEqual([
      {
        type: 'health/model',
        requestId: 'req-missing-model',
        payload: {
          modelId: 'missing-model',
          status: 'error',
          error: {
            key: 'errors.modelNotFound',
            params: { modelId: 'missing-model' },
          },
          keySummary: {
            total: 0,
            success: 0,
            failed: 0,
          },
        },
      },
      {
        type: 'health/done',
        requestId: 'req-missing-model',
      },
    ])
  })

  it('all key 健康检查会复用统一多 key 拆分，且不依赖运行时轮询游标', async () => {
    const provider = {
      ...makeTextProvider({ modelId: 'gpt-5.1' }),
      apiKey: 'Bearer first,\nsecond; first',
    }
    getProviderViewMock.mockResolvedValue(provider)
    resolveModelMetaMock.mockResolvedValue({
      canonicalId: 'provider::openai::gpt-5.1',
      baseModelKey: 'gpt-5.1',
      scope: 'provider',
      kind: 'chat',
      inputModalities: ['text'],
      outputModalities: ['text'],
      features: [],
      transportProtocol: 'openai-responses',
      displayName: 'gpt-5.1',
      confidence: 'high',
    })
    resolveProviderRuntimeContextMock.mockImplementation(async (params: { apiKeyOverride?: string }) => ({
      runtimeConfig: { ...provider, apiKey: params.apiKeyOverride ?? '' },
      apiKey: params.apiKeyOverride ?? '',
      apiHost: provider.apiHost,
      modelId: 'gpt-5.1',
      resolvedModelMeta: {
        kind: 'chat',
        inputModalities: ['text'],
        outputModalities: ['text'],
        transportProtocol: 'openai-responses',
        features: [],
      },
    }))
    createLanguageModelMock.mockResolvedValue({ id: 'mock-language-model:gpt-5.1' })
    buildRuntimeCallPlanMock.mockResolvedValue({
      languageModel: { id: 'mock-language-model:gpt-5.1' },
      middlewares: [],
      callSettings: {},
      providerOptions: undefined,
      executionMode: 'generateText',
    })
    generateTextMock.mockResolvedValue({
      text: 'ok',
      content: [],
      files: [],
      toolCalls: [],
      toolResults: [],
      response: { messages: [] },
    })

    const messages: unknown[] = []
    const port = {
      postMessage: (message: unknown) => {
        messages.push(message)
      },
    } as unknown as chrome.runtime.Port

    const { runHealthCheckToPort } = await import('./health-check')
    await runHealthCheckToPort({
      requestId: 'req-all-keys',
      payload: {
        providerId: 'openai',
        modelIds: ['gpt-5.1'],
        keyCheckMode: 'all',
        isConcurrent: false,
        timeoutMs: 1_000,
      },
      port,
      signal: new AbortController().signal,
    })

    expect(resolveProviderRuntimeContextMock).toHaveBeenCalledTimes(2)
    expect(resolveProviderRuntimeContextMock.mock.calls.map((call) => call[0].apiKeyOverride)).toEqual(['first', 'second'])
    expect(messages).toContainEqual({
      type: 'health/model',
      requestId: 'req-all-keys',
      payload: {
        modelId: 'gpt-5.1',
        status: 'ok',
        latency: expect.any(Number),
        keySummary: { total: 2, success: 2, failed: 0 },
      },
    })
  })

  it('Cohere image embedding 健康检查会使用 1x1 PNG data URL 样本', async () => {
    getProviderViewMock.mockResolvedValue({
      id: 'cohere',
      name: 'Cohere',
      type: 'cohere',
      enabled: true,
      apiKey: 'k',
      apiHost: 'https://api.cohere.com/v2',
      models: [{ id: 'embed-english-v3.0-image', name: 'Embed English Image' }],
    })
    resolveModelMetaMock.mockResolvedValue({
      canonicalId: 'provider::cohere::embed-english-v3.0-image',
      baseModelKey: 'embed-english-v3.0-image',
      scope: 'provider',
      kind: 'embedding',
      inputModalities: ['image'],
      outputModalities: ['embeddings'],
      features: [],
      transportProtocol: 'embedding-api',
      displayName: 'Embed English Image',
      confidence: 'high',
    })
    resolveProviderRuntimeContextMock.mockResolvedValue({
      runtimeConfig: {
        id: 'cohere',
        name: 'Cohere',
        type: 'cohere',
        apiKey: 'k',
        apiHost: 'https://api.cohere.com/v2',
        enabled: true,
        models: [],
      },
      apiKey: 'k',
      apiHost: 'https://api.cohere.com/v2',
      modelId: 'embed-english-v3.0-image',
      resolvedModelMeta: {
        kind: 'embedding',
        inputModalities: ['image'],
        outputModalities: ['embeddings'],
      },
    })
    const executeMock = vi.fn().mockResolvedValue([0.1, 0.2])
    createEmbeddingExecutorMock.mockReturnValue({
      execute: executeMock,
      executeMany: vi.fn(),
    })

    const messages: unknown[] = []
    const port = {
      postMessage: (message: unknown) => {
        messages.push(message)
      },
    } as unknown as chrome.runtime.Port

    const { runHealthCheckToPort } = await import('./health-check')

    await runHealthCheckToPort({
      requestId: 'req-cohere-image',
      payload: {
        providerId: 'cohere',
        modelIds: ['embed-english-v3.0-image'],
        keyCheckMode: 'single',
        selectedKeyIndex: 0,
        isConcurrent: false,
        timeoutMs: 1_000,
      },
      port,
      signal: new AbortController().signal,
    })

    expect(executeMock).toHaveBeenCalledWith([
      {
        type: 'image',
        dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
      },
    ], {
      abortSignal: expect.any(AbortSignal),
    })
    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'health/model',
        requestId: 'req-cohere-image',
        payload: expect.objectContaining({
          modelId: 'embed-english-v3.0-image',
          status: 'ok',
        }),
      }),
    ]))
  })

  it('文本 embedding 健康检查仍会使用短文本样本', async () => {
    getProviderViewMock.mockResolvedValue({
      id: 'openai',
      name: 'OpenAI',
      type: 'openai',
      enabled: true,
      apiKey: 'k',
      apiHost: 'https://api.example.com/v1',
      models: [{ id: 'text-embedding-3-small', name: 'Text Embedding 3 Small' }],
    })
    resolveModelMetaMock.mockResolvedValue({
      canonicalId: 'provider::openai::text-embedding-3-small',
      baseModelKey: 'text-embedding-3-small',
      scope: 'provider',
      kind: 'embedding',
      inputModalities: ['text'],
      outputModalities: ['embeddings'],
      features: [],
      transportProtocol: 'embedding-api',
      displayName: 'Text Embedding 3 Small',
      confidence: 'high',
    })
    resolveProviderRuntimeContextMock.mockResolvedValue({
      runtimeConfig: {
        id: 'openai',
        name: 'OpenAI',
        type: 'openai',
        apiKey: 'k',
        apiHost: 'https://api.example.com/v1',
        enabled: true,
        models: [],
      },
      apiKey: 'k',
      apiHost: 'https://api.example.com/v1',
      modelId: 'text-embedding-3-small',
      resolvedModelMeta: {
        kind: 'embedding',
        inputModalities: ['text'],
        outputModalities: ['embeddings'],
      },
    })
    const executeMock = vi.fn().mockResolvedValue([0.1, 0.2])
    createEmbeddingExecutorMock.mockReturnValue({
      execute: executeMock,
      executeMany: vi.fn(),
    })

    const port = {
      postMessage: vi.fn(),
    } as unknown as chrome.runtime.Port

    const { runHealthCheckToPort } = await import('./health-check')

    await runHealthCheckToPort({
      requestId: 'req-text-embedding',
      payload: {
        providerId: 'openai',
        modelIds: ['text-embedding-3-small'],
        keyCheckMode: 'single',
        selectedKeyIndex: 0,
        isConcurrent: false,
        timeoutMs: 1_000,
      },
      port,
      signal: new AbortController().signal,
    })

    expect(executeMock).toHaveBeenCalledWith([
      { type: 'text', text: 'hi' },
    ], {
      abortSignal: expect.any(AbortSignal),
    })
  })

  it('video-generation 健康检查会稳定阻断，不再实例化 VideoModel runtime', async () => {
    getProviderViewMock.mockResolvedValue({
      id: 'together',
      name: 'Together',
      type: 'openai',
      enabled: true,
      apiKey: 'k',
      apiHost: 'https://api.together.xyz/v1',
      models: [{ id: 'wan-2.2-t2v-fast', name: 'Wan 2.2 T2V Fast' }],
    })
    resolveModelMetaMock.mockResolvedValue({
      canonicalId: 'provider::together::wan-2.2-t2v-fast',
      baseModelKey: 'wan-2.2-t2v-fast',
      scope: 'provider',
      kind: 'video-generation',
      inputModalities: ['text'],
      outputModalities: ['video'],
      features: [],
      transportProtocol: 'video-api',
      displayName: 'Wan 2.2 T2V Fast',
      confidence: 'high',
    })
    resolveProviderRuntimeContextMock.mockResolvedValue({
      runtimeConfig: {
        id: 'together',
        name: 'Together',
        type: 'openai',
        apiKey: 'k',
        apiHost: 'https://api.together.xyz/v1',
        enabled: true,
        models: [],
      },
      apiKey: 'k',
      apiHost: 'https://api.together.xyz/v1',
      modelId: 'wan-2.2-t2v-fast',
      resolvedModelMeta: {
        kind: 'video-generation',
        inputModalities: ['text'],
        outputModalities: ['video'],
        transportProtocol: 'video-api',
      },
    })
    const messages: unknown[] = []
    const port = {
      postMessage: (message: unknown) => {
        messages.push(message)
      },
    } as unknown as chrome.runtime.Port

    const { runHealthCheckToPort } = await import('./health-check')

    await runHealthCheckToPort({
      requestId: 'req-video-preflight',
      payload: {
        providerId: 'together',
        modelIds: ['wan-2.2-t2v-fast'],
        keyCheckMode: 'single',
        selectedKeyIndex: 0,
        isConcurrent: false,
        timeoutMs: 1_000,
      },
      port,
      signal: new AbortController().signal,
    })

    expect(messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'health/model',
        requestId: 'req-video-preflight',
        payload: expect.objectContaining({
          modelId: 'wan-2.2-t2v-fast',
          status: 'error',
          error: {
            key: 'errors.providerTypeVideoGenNotSupported',
            params: { providerType: 'openai' },
          },
        }),
      }),
    ]))
  })

  it('openai-responses 文本模型健康检查会直接走 generateText，并在有最终文本时判成功', async () => {
    mockTextHealthCheckContext({
      modelId: 'gpt-5.1',
      transportProtocol: 'openai-responses',
    })
    generateTextMock.mockResolvedValue({
      text: 'health ok',
      files: [],
    })

    const messages: unknown[] = []
    const port = {
      postMessage: (message: unknown) => {
        messages.push(message)
      },
    } as unknown as chrome.runtime.Port

    const { runHealthCheckToPort } = await import('./health-check')

    await runHealthCheckToPort({
      requestId: 'req-openai-responses-ok',
      payload: {
        providerId: 'openai',
        modelIds: ['gpt-5.1'],
        keyCheckMode: 'single',
        selectedKeyIndex: 0,
        isConcurrent: false,
        timeoutMs: 1_000,
      },
      port,
      signal: new AbortController().signal,
    })

    expect(generateTextMock).toHaveBeenCalledTimes(1)
    expect(streamTextMock).not.toHaveBeenCalled()
    expect(messages).toEqual([
      {
        type: 'health/model',
        requestId: 'req-openai-responses-ok',
        payload: {
          modelId: 'gpt-5.1',
          status: 'ok',
          latency: expect.any(Number),
          keySummary: {
            total: 1,
            success: 1,
            failed: 0,
          },
        },
      },
      {
        type: 'health/done',
        requestId: 'req-openai-responses-ok',
      },
    ])
  })

  it('openai-responses 的 generateText 即使 text 为空，只要 content 里有最终文本也会判成功', async () => {
    mockTextHealthCheckContext({
      modelId: 'gpt-5.1',
      transportProtocol: 'openai-responses',
    })
    generateTextMock.mockResolvedValue({
      text: '',
      content: [{ type: 'text', text: '健康检查通过' }],
      files: [],
      toolCalls: [],
      toolResults: [],
      response: {
        messages: [],
      },
    })

    const messages: unknown[] = []
    const port = {
      postMessage: (message: unknown) => {
        messages.push(message)
      },
    } as unknown as chrome.runtime.Port

    const { runHealthCheckToPort } = await import('./health-check')

    await runHealthCheckToPort({
      requestId: 'req-openai-responses-content-ok',
      payload: {
        providerId: 'openai',
        modelIds: ['gpt-5.1'],
        keyCheckMode: 'single',
        selectedKeyIndex: 0,
        isConcurrent: false,
        timeoutMs: 1_000,
      },
      port,
      signal: new AbortController().signal,
    })

    expect(generateTextMock).toHaveBeenCalledTimes(1)
    expect(streamTextMock).not.toHaveBeenCalled()
    expect(messages).toEqual([
      {
        type: 'health/model',
        requestId: 'req-openai-responses-content-ok',
        payload: {
          modelId: 'gpt-5.1',
          status: 'ok',
          latency: expect.any(Number),
          keySummary: {
            total: 1,
            success: 1,
            failed: 0,
          },
        },
      },
      {
        type: 'health/done',
        requestId: 'req-openai-responses-content-ok',
      },
    ])
  })

  it('openai-responses 的 generateText 即使 text 为空，只要 response.body 里有最终文本也会判成功', async () => {
    mockTextHealthCheckContext({
      modelId: 'gpt-5.1',
      transportProtocol: 'openai-responses',
    })
    generateTextMock.mockResolvedValue({
      text: '',
      content: [],
      files: [],
      toolCalls: [],
      toolResults: [],
      response: {
        messages: [],
        body: {
          output: [
            {
              type: 'message',
              content: [
                { type: 'output_text', text: '健康检查通过' },
              ],
            },
          ],
        },
      },
    })

    const messages: unknown[] = []
    const port = {
      postMessage: (message: unknown) => {
        messages.push(message)
      },
    } as unknown as chrome.runtime.Port

    const { runHealthCheckToPort } = await import('./health-check')

    await runHealthCheckToPort({
      requestId: 'req-openai-responses-body-ok',
      payload: {
        providerId: 'openai',
        modelIds: ['gpt-5.1'],
        keyCheckMode: 'single',
        selectedKeyIndex: 0,
        isConcurrent: false,
        timeoutMs: 1_000,
      },
      port,
      signal: new AbortController().signal,
    })

    expect(generateTextMock).toHaveBeenCalledTimes(1)
    expect(streamTextMock).not.toHaveBeenCalled()
    expect(messages).toEqual([
      {
        type: 'health/model',
        requestId: 'req-openai-responses-body-ok',
        payload: {
          modelId: 'gpt-5.1',
          status: 'ok',
          latency: expect.any(Number),
          keySummary: {
            total: 1,
            success: 1,
            failed: 0,
          },
        },
      },
      {
        type: 'health/done',
        requestId: 'req-openai-responses-body-ok',
      },
    ])
  })

  it('openai-responses 的 generateText 若命中 HTTP 200 + SSE body，会恢复终态并判成功', async () => {
    mockTextHealthCheckContext({
      modelId: 'gpt-5.1',
      transportProtocol: 'openai-responses',
    })
    generateTextMock.mockRejectedValue(new APICallErrorMock({
      statusCode: 200,
      url: 'https://api.example.com/v1/responses',
      responseBody: [
        'event: response.created',
        'data: {"type":"response.created","response":{"id":"resp_123"}}',
        '',
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","delta":"健康"}',
        '',
        'event: response.output_text.done',
        'data: {"type":"response.output_text.done","text":"健康检查通过"}',
        '',
        'event: response.completed',
        'data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"健康检查通过"}]}]}}',
      ].join('\n'),
    }))

    const messages: unknown[] = []
    const port = {
      postMessage: (message: unknown) => {
        messages.push(message)
      },
    } as unknown as chrome.runtime.Port

    const { runHealthCheckToPort } = await import('./health-check')

    await runHealthCheckToPort({
      requestId: 'req-openai-responses-sse-ok',
      payload: {
        providerId: 'openai',
        modelIds: ['gpt-5.1'],
        keyCheckMode: 'single',
        selectedKeyIndex: 0,
        isConcurrent: false,
        timeoutMs: 1_000,
      },
      port,
      signal: new AbortController().signal,
    })

    expect(generateTextMock).toHaveBeenCalledTimes(1)
    expect(streamTextMock).not.toHaveBeenCalled()
    expect(messages).toEqual([
      {
        type: 'health/model',
        requestId: 'req-openai-responses-sse-ok',
        payload: {
          modelId: 'gpt-5.1',
          status: 'ok',
          latency: expect.any(Number),
          keySummary: {
            total: 1,
            success: 1,
            failed: 0,
          },
        },
      },
      {
        type: 'health/done',
        requestId: 'req-openai-responses-sse-ok',
      },
    ])
  })

  it('openai-responses 的 generateText 若命中 HTTP 200 + JSON body，会恢复终态并判成功', async () => {
    mockTextHealthCheckContext({
      modelId: 'gpt-5.1',
      transportProtocol: 'openai-responses',
    })
    generateTextMock.mockRejectedValue(new APICallErrorMock({
      statusCode: 200,
      url: 'https://api.example.com/v1/responses',
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
                text: '健康检查通过',
              },
            ],
          },
        ],
      }),
    }))

    const messages: unknown[] = []
    const port = {
      postMessage: (message: unknown) => {
        messages.push(message)
      },
    } as unknown as chrome.runtime.Port

    const { runHealthCheckToPort } = await import('./health-check')

    await runHealthCheckToPort({
      requestId: 'req-openai-responses-json-ok',
      payload: {
        providerId: 'openai',
        modelIds: ['gpt-5.1'],
        keyCheckMode: 'single',
        selectedKeyIndex: 0,
        isConcurrent: false,
        timeoutMs: 1_000,
      },
      port,
      signal: new AbortController().signal,
    })

    expect(generateTextMock).toHaveBeenCalledTimes(1)
    expect(streamTextMock).not.toHaveBeenCalled()
    expect(messages).toEqual([
      {
        type: 'health/model',
        requestId: 'req-openai-responses-json-ok',
        payload: {
          modelId: 'gpt-5.1',
          status: 'ok',
          latency: expect.any(Number),
          keySummary: {
            total: 1,
            success: 1,
            failed: 0,
          },
        },
      },
      {
        type: 'health/done',
        requestId: 'req-openai-responses-json-ok',
      },
    ])
  })

  it('openai-responses 的 SSE 只要出现终态正文 done 事件，即使没有 response.completed 也会判成功', async () => {
    mockTextHealthCheckContext({
      modelId: 'gpt-5.1',
      transportProtocol: 'openai-responses',
    })
    generateTextMock.mockRejectedValue(new APICallErrorMock({
      statusCode: 200,
      url: 'https://api.example.com/v1/responses',
      responseBody: [
        'event: response.created',
        'data: {"type":"response.created","response":{"id":"resp_234"}}',
        '',
        'event: response.output_item.added',
        'data: {"type":"response.output_item.added","item":{"type":"reasoning"}}',
        '',
        'event: response.output_text.done',
        'data: {"type":"response.output_text.done","text":"健康检查通过"}',
        '',
        'event: response.content_part.done',
        'data: {"type":"response.content_part.done","part":{"type":"output_text","text":"健康检查通过"}}',
      ].join('\n'),
    }))

    const messages: unknown[] = []
    const port = {
      postMessage: (message: unknown) => {
        messages.push(message)
      },
    } as unknown as chrome.runtime.Port

    const { runHealthCheckToPort } = await import('./health-check')

    await runHealthCheckToPort({
      requestId: 'req-openai-responses-sse-done-only-ok',
      payload: {
        providerId: 'openai',
        modelIds: ['gpt-5.1'],
        keyCheckMode: 'single',
        selectedKeyIndex: 0,
        isConcurrent: false,
        timeoutMs: 1_000,
      },
      port,
      signal: new AbortController().signal,
    })

    expect(generateTextMock).toHaveBeenCalledTimes(1)
    expect(streamTextMock).not.toHaveBeenCalled()
    expect(messages).toEqual([
      {
        type: 'health/model',
        requestId: 'req-openai-responses-sse-done-only-ok',
        payload: {
          modelId: 'gpt-5.1',
          status: 'ok',
          latency: expect.any(Number),
          keySummary: {
            total: 1,
            success: 1,
            failed: 0,
          },
        },
      },
      {
        type: 'health/done',
        requestId: 'req-openai-responses-sse-done-only-ok',
      },
    ])
  })

  it('openai-responses 真正 4xx 失败时，会回传中文摘要和稳定技术详情', async () => {
    mockTextHealthCheckContext({
      modelId: 'gpt-5.1',
      transportProtocol: 'openai-responses',
    })
    generateTextMock.mockRejectedValue(new APICallErrorMock({
      statusCode: 400,
      url: 'https://api.example.com/v1/responses',
      responseBody: JSON.stringify({
        error: '端点/codex未开启模型gpt-5.1',
      }),
    }))

    const messages: unknown[] = []
    const port = {
      postMessage: (message: unknown) => {
        messages.push(message)
      },
    } as unknown as chrome.runtime.Port

    const { runHealthCheckToPort } = await import('./health-check')

    await runHealthCheckToPort({
      requestId: 'req-openai-responses-400',
      payload: {
        providerId: 'openai',
        modelIds: ['gpt-5.1'],
        keyCheckMode: 'single',
        selectedKeyIndex: 0,
        isConcurrent: false,
        timeoutMs: 1_000,
      },
      port,
      signal: new AbortController().signal,
    })

    expect(messages).toEqual([
      {
        type: 'health/model',
        requestId: 'req-openai-responses-400',
        payload: {
          modelId: 'gpt-5.1',
          status: 'error',
          error: {
            key: 'errors.apiCallHttpError',
            params: { status: 400 },
          },
          errorDetail: 'HTTP 400 · https://api.example.com/v1/responses · 端点/codex未开启模型gpt-5.1',
          keySummary: {
            total: 1,
            success: 0,
            failed: 1,
          },
        },
      },
      {
        type: 'health/done',
        requestId: 'req-openai-responses-400',
      },
    ])
  })

  it('鉴权失败时会稳定归类为授权错误，不把 401 当成未知连接失败', async () => {
    mockTextHealthCheckContext({
      modelId: 'gpt-5.1',
      transportProtocol: 'openai-chat',
      executionMode: 'generateText',
    })
    generateTextMock.mockRejectedValue(new APICallErrorMock({
      statusCode: 401,
      url: 'https://api.example.com/v1/chat/completions',
      responseBody: JSON.stringify({ error: { message: 'invalid_api_key' } }),
    }))

    const messages: unknown[] = []
    const port = {
      postMessage: (message: unknown) => {
        messages.push(message)
      },
    } as unknown as chrome.runtime.Port

    const { runHealthCheckToPort } = await import('./health-check')

    await runHealthCheckToPort({
      requestId: 'req-auth-fail',
      payload: {
        providerId: 'openai',
        modelIds: ['gpt-5.1'],
        keyCheckMode: 'single',
        selectedKeyIndex: 0,
        isConcurrent: false,
        timeoutMs: 1_000,
      },
      port,
      signal: new AbortController().signal,
    })

    expect(messages).toEqual([
      {
        type: 'health/model',
        requestId: 'req-auth-fail',
        payload: {
          modelId: 'gpt-5.1',
          status: 'error',
          error: {
            key: 'errors.apiCallUnauthorizedOrForbidden',
          },
          errorDetail: 'HTTP 401 · https://api.example.com/v1/chat/completions · invalid_api_key',
          keySummary: {
            total: 1,
            success: 0,
            failed: 1,
          },
        },
      },
      {
        type: 'health/done',
        requestId: 'req-auth-fail',
      },
    ])
  })

  it('超时或中断类错误会稳定归类为请求超时/连接中断', async () => {
    mockTextHealthCheckContext({
      modelId: 'gpt-5.1',
      transportProtocol: 'openai-chat',
      executionMode: 'generateText',
    })
    generateTextMock.mockRejectedValue(new DOMException('Aborted', 'AbortError'))

    const messages: unknown[] = []
    const port = {
      postMessage: (message: unknown) => {
        messages.push(message)
      },
    } as unknown as chrome.runtime.Port

    const { runHealthCheckToPort } = await import('./health-check')

    await runHealthCheckToPort({
      requestId: 'req-timeout',
      payload: {
        providerId: 'openai',
        modelIds: ['gpt-5.1'],
        keyCheckMode: 'single',
        selectedKeyIndex: 0,
        isConcurrent: false,
        timeoutMs: 1_000,
      },
      port,
      signal: new AbortController().signal,
    })

    expect(messages).toEqual([
      {
        type: 'health/model',
        requestId: 'req-timeout',
        payload: {
          modelId: 'gpt-5.1',
          status: 'error',
          error: {
            key: 'errors.requestTimedOutOrDisconnected',
          },
          keySummary: {
            total: 1,
            success: 0,
            failed: 1,
          },
        },
      },
      {
        type: 'health/done',
        requestId: 'req-timeout',
      },
    ])
  })

  it('只有 reasoning 心跳且没有最终可见输出时，仍会判为无输出失败', async () => {
    mockTextHealthCheckContext({
      modelId: 'gpt-5.1',
      transportProtocol: 'openai-chat',
      supportedTextDelta: true,
      executionMode: 'streamText',
    })
    streamTextMock.mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'reasoning-delta', text: 'thinking...' }
      })(),
    })

    const messages: unknown[] = []
    const port = {
      postMessage: (message: unknown) => {
        messages.push(message)
      },
    } as unknown as chrome.runtime.Port

    const { runHealthCheckToPort } = await import('./health-check')

    await runHealthCheckToPort({
      requestId: 'req-stream-no-visible-output',
      payload: {
        providerId: 'openai',
        modelIds: ['gpt-5.1'],
        keyCheckMode: 'single',
        selectedKeyIndex: 0,
        isConcurrent: false,
        timeoutMs: 1_000,
      },
      port,
      signal: new AbortController().signal,
    })

    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect(messages).toEqual([
      {
        type: 'health/model',
        requestId: 'req-stream-no-visible-output',
        payload: {
          modelId: 'gpt-5.1',
          status: 'error',
          error: {
            key: 'errors.modelNoOutput',
          },
          keySummary: {
            total: 1,
            success: 0,
            failed: 1,
          },
        },
      },
      {
        type: 'health/done',
        requestId: 'req-stream-no-visible-output',
      },
    ])
  })
})
