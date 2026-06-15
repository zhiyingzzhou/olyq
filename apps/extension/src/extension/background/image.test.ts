/**
 * 说明：图片生成后台运行时测试。
 *
 * 职责：
 * - 验证 Service Worker 出站参数统一由图片能力真源构建；
 * - 防止 `quality`、`seed`、`maxImagesPerCall` 重新回到 provider 字符串猜测或无差别透传。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  APICallErrorMock,
  RetryErrorMock,
  createImageModelMock,
  generateImageMock,
  resolveProviderRuntimeContextMock,
} = vi.hoisted(() => ({
  APICallErrorMock: class APICallError extends Error {
    statusCode?: number
    responseBody?: unknown
    data?: unknown

    constructor(init: { statusCode?: number; responseBody?: unknown; data?: unknown; message?: string }) {
      super(init.message ?? 'API call failed')
      this.statusCode = init.statusCode
      this.responseBody = init.responseBody
      this.data = init.data
    }

    /** 判断是否为当前 mock 的 API 调用错误实例。 */
    static isInstance(value: unknown) {
      return value instanceof this
    }
  },
  RetryErrorMock: class RetryError extends Error {
    lastError?: unknown

    constructor(init: { message?: string; lastError?: unknown }) {
      super(init.message ?? 'retry failed')
      this.lastError = init.lastError
    }

    /** 判断是否为当前 mock 的重试错误实例。 */
    static isInstance(value: unknown) {
      return value instanceof this
    }
  },
  createImageModelMock: vi.fn(),
  generateImageMock: vi.fn(),
  resolveProviderRuntimeContextMock: vi.fn(),
}))

vi.mock('ai', () => ({
  APICallError: APICallErrorMock,
  RetryError: RetryErrorMock,
  generateImage: generateImageMock,
}))

vi.mock('../../lib/ai/provider-runtime', () => ({
  resolveProviderRuntimeContext: resolveProviderRuntimeContextMock,
}))

vi.mock('../../lib/ai/provider-factory', () => ({
  createImageModel: createImageModelMock,
}))

vi.mock('../../lib/ai/image-download', () => ({
  downloadUrlToBase64: vi.fn(),
  resolveDownloadHostMatchPatterns: vi.fn(),
}))

/** 构造测试端口。 */
function makePort() {
  return {
    postMessage: vi.fn(),
  } as unknown as chrome.runtime.Port & { postMessage: ReturnType<typeof vi.fn> }
}

/** 构造运行时上下文 mock。 */
function mockRuntimeContext(params: {
  readonly providerType: string
  readonly providerId: string
  readonly modelId: string
  readonly baseModelKey?: string
  readonly canonicalId?: string
}) {
  resolveProviderRuntimeContextMock.mockResolvedValueOnce({
    runtimeConfig: {
      id: params.providerId,
      type: params.providerType,
      apiKey: 'selected-key',
      apiHost: 'https://api.example.com/v1',
    },
    apiKey: 'selected-key',
    apiHost: 'https://api.example.com/v1',
    modelId: params.modelId,
    resolvedModelMeta: {
      baseModelKey: params.baseModelKey ?? params.modelId,
      canonicalId: params.canonicalId ?? `provider::${params.providerType}::${params.providerId}::${params.modelId}`,
    },
  })
}

describe('generateImagesToPort', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createImageModelMock.mockResolvedValue({ provider: 'mock.image' })
    generateImageMock.mockResolvedValue({
      images: [{ base64: 'aW1n', mediaType: 'image/png' }],
      providerMetadata: {},
    })
  })

  it('Gemini 总张数 2 会下发 maxImagesPerCall=1，交给 AI SDK 拆成两次单图调用且不透传 seed', async () => {
    mockRuntimeContext({
      providerType: 'gemini',
      providerId: 'google',
      modelId: 'gemini-2.5-flash-image',
    })
    const { generateImagesToPort } = await import('./image')
    const port = makePort()

    await generateImagesToPort({
      req: {
        requestId: 'img-1',
        model: 'google/gemini-2.5-flash-image',
        prompt: 'cover',
        n: 2,
        aspectRatio: '1:1',
        seed: 7,
        quality: 'high',
      },
      port,
      signal: new AbortController().signal,
    })

    expect(generateImageMock).toHaveBeenCalledWith(expect.objectContaining({
      n: 2,
      maxImagesPerCall: 1,
      aspectRatio: '1:1',
    }))
    expect(resolveProviderRuntimeContextMock).toHaveBeenCalledTimes(1)
    expect(createImageModelMock).toHaveBeenCalledTimes(1)
    expect(createImageModelMock).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'selected-key',
      apiHost: 'https://api.example.com/v1',
    }), 'gemini-2.5-flash-image')
    expect(generateImageMock.mock.calls[0]?.[0]).not.toHaveProperty('seed')
    expect(generateImageMock.mock.calls[0]?.[0]).not.toHaveProperty('providerOptions')
    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/done', requestId: 'img-1' }))
  })

  it('OpenAI-compatible 未验证 provider 不下发普通 size/quality/seed', async () => {
    mockRuntimeContext({
      providerType: 'openai',
      providerId: 'openrouter',
      modelId: 'openai/gpt-image-1',
    })
    const { generateImagesToPort } = await import('./image')

    await generateImagesToPort({
      req: {
        requestId: 'img-openrouter',
        model: 'openrouter/openai/gpt-image-1',
        prompt: 'cover',
        n: 2,
        size: '1024x1024',
        quality: 'high',
        seed: 123,
        providerOptions: { openrouter: { negative_prompt: 'low quality' } },
      },
      port: makePort(),
      signal: new AbortController().signal,
    })

    expect(generateImageMock).toHaveBeenCalledWith(expect.objectContaining({
      n: 2,
      maxImagesPerCall: 1,
      providerOptions: { openrouter: { negative_prompt: 'low quality' } },
    }))
    const call = generateImageMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(call.size).toBeUndefined()
    expect(call.seed).toBeUndefined()
  })

  it('xAI quality 只进入 xai providerOptions namespace', async () => {
    mockRuntimeContext({
      providerType: 'xai',
      providerId: 'xai',
      modelId: 'grok-imagine-image-pro',
    })
    const { generateImagesToPort } = await import('./image')

    await generateImagesToPort({
      req: {
        requestId: 'img-xai',
        model: 'xai/grok-imagine-image-pro',
        prompt: 'cover',
        n: 3,
        aspectRatio: '16:9',
        quality: 'high',
        seed: 8,
      },
      port: makePort(),
      signal: new AbortController().signal,
    })

    expect(generateImageMock).toHaveBeenCalledWith(expect.objectContaining({
      maxImagesPerCall: 3,
      aspectRatio: '16:9',
      providerOptions: { xai: { quality: 'high' } },
    }))
    expect(generateImageMock.mock.calls[0]?.[0]).not.toHaveProperty('seed')
  })
})
