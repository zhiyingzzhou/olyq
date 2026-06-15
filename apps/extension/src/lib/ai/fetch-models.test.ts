/**
 * 说明：`fetch-models.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `fetch-models.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchModelsFromApi } from './fetch-models'
import type { ProviderConfig } from './types'

/** 构造最小 ProviderConfig，保持 fetch-models 用例只关注目录解析差异。 */
function makeProvider(overrides: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: overrides.id ?? 'openai',
    name: overrides.name ?? 'OpenAI',
    type: overrides.type ?? 'openai',
    apiKey: overrides.apiKey ?? '',
    apiHost: overrides.apiHost ?? '',
    enabled: true,
    models: [],
    ...overrides,
  }
}

/**
 * 测试辅助函数：`mockJsonResponse`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function mockJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('fetchModelsFromApi', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('模型目录拉取会按 provider 多 key 参与调用前轮询', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => mockJsonResponse({
      data: [{ id: 'gpt-4o', name: 'GPT-4o' }],
    }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = makeProvider({
      id: 'fetch-rotate',
      name: 'Example',
      type: 'openai',
      apiHost: 'https://api.example.com/v1',
      apiKey: 'Bearer first-key, second-key',
    })

    const models = await fetchModelsFromApi(provider)
    const rotatedModels = await fetchModelsFromApi(provider)

    expect(models).toEqual([{ id: 'gpt-4o', name: 'GPT-4o', group: 'Example' }])
    expect(rotatedModels).toEqual([{ id: 'gpt-4o', name: 'GPT-4o', group: 'Example' }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const calls = fetchMock.mock.calls as Array<[RequestInfo | URL, RequestInit | undefined]>
    const firstCall = calls[0]
    const secondCall = calls[1]
    expect(firstCall).toBeDefined()
    expect(firstCall && typeof firstCall[1] === 'object' ? (firstCall[1] as RequestInit).headers : undefined).toMatchObject({
      Authorization: 'Bearer first-key',
    })
    expect(secondCall && typeof secondCall[1] === 'object' ? (secondCall[1] as RequestInit).headers : undefined).toMatchObject({
      Authorization: 'Bearer second-key',
    })
  })

  it('会保存 OpenRouter /models 返回的 supported_parameters 原生字段列表', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => mockJsonResponse({
      data: [
        {
          id: 'openai/gpt-5.4',
          name: 'OpenAI: GPT-5.4',
          supported_parameters: ['max_tokens', 'temperature', '', 'max_tokens', 'tool_choice'],
        },
      ],
    }))
    vi.stubGlobal('fetch', fetchMock)

    const models = await fetchModelsFromApi(
      makeProvider({
        id: 'openrouter',
        name: 'OpenRouter',
        type: 'openai',
        apiHost: 'https://openrouter.ai/api/v1',
        apiKey: 'sk-or',
      }),
      undefined,
      { force: true },
    )

    expect(models).toEqual([{
      id: 'openai/gpt-5.4',
      name: 'OpenAI: GPT-5.4',
      group: 'openai',
      supportedParameters: ['max_tokens', 'temperature', 'tool_choice'],
    }])
  })

  it('缓存 key 应包含 headers 与鉴权指纹，headers 或鉴权变化后应重新拉取', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => mockJsonResponse({
      data: [{ id: 'gpt-5.4', name: 'GPT-5.4' }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchModelsFromApi(
      makeProvider({
        id: 'openai-cache',
        name: 'Cache Example',
        type: 'openai',
        apiHost: 'https://cache.example.com/v1',
        apiKey: 'sk-cache',
        headers: { 'X-Test': 'a' },
      }),
    )
    await fetchModelsFromApi(
      makeProvider({
        id: 'openai-cache',
        name: 'Cache Example',
        type: 'openai',
        apiHost: 'https://cache.example.com/v1',
        apiKey: 'sk-cache',
        headers: { 'X-Test': 'a' },
      }),
    )
    await fetchModelsFromApi(
      makeProvider({
        id: 'openai-cache',
        name: 'Cache Example',
        type: 'openai',
        apiHost: 'https://cache.example.com/v1',
        apiKey: 'sk-cache',
        headers: { 'X-Test': 'b' },
      }),
    )
    await fetchModelsFromApi(
      makeProvider({
        id: 'openai-cache',
        name: 'Cache Example',
        type: 'openai',
        apiHost: 'https://cache.example.com/v1',
        apiKey: 'sk-cache',
        headers: { 'X-Test': 'b' },
        apiKeyAuth: { headerName: 'xi-api-key' },
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('Anthropic 会把 base URL 统一规范到 /v1/models，并按官方 header 发送 API Key', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://sub2api.h5doc.xyz/v1/models')
      expect(init?.headers).toMatchObject({
        'x-api-key': 'proxy-key',
        'anthropic-version': '2023-06-01',
      })
      return mockJsonResponse({
        data: [{ id: 'claude-sonnet-4-5-20250929' }],
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const models = await fetchModelsFromApi(
      makeProvider({
        id: 'anthropic',
        name: 'Anthropic',
        type: 'anthropic',
        apiHost: 'https://sub2api.h5doc.xyz',
        apiKey: 'proxy-key',
      }),
      undefined,
      { force: true },
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(models).toEqual([{
      id: 'claude-sonnet-4-5-20250929',
      name: 'claude-sonnet-4-5-20250929',
      group: 'Anthropic',
    }])
  })

  it('URL-like API Key 被过滤后，非本地模型目录拉取走未配置鉴权错误通道', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).not.toMatchObject({
        'x-api-key': 'https://api.ikuncode.cc/v1/messages',
      })
      expect(new Headers(init?.headers).get('x-api-key')).toBeNull()
      return mockJsonResponse({
        data: [{ id: 'claude-sonnet-4-5-20250929' }],
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchModelsFromApi(
      makeProvider({
        id: 'anthropic-url-key',
        name: 'Anthropic',
        type: 'anthropic',
        apiHost: 'https://api.ikuncode.cc/v1',
        apiKey: 'https://api.ikuncode.cc/v1/messages',
      }),
      undefined,
      { force: true },
    )).rejects.toMatchObject({ message: 'errors.providerApiKeyMissing' })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('本地模型目录拉取仍允许不配置 API Key', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBeNull()
      return mockJsonResponse({
        data: [{ id: 'local-model', name: 'Local Model' }],
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const models = await fetchModelsFromApi(
      makeProvider({
        id: 'lmstudio',
        name: 'LM Studio',
        type: 'openai',
        apiHost: 'http://localhost:1234/v1',
        apiKey: '',
      }),
      undefined,
      { force: true },
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(models).toEqual([{ id: 'local-model', name: 'Local Model', group: 'LM Studio' }])
  })

  it('SiliconFlow 会按官方 type 分批拉目录，并把细分语义交给统一模型类型引擎', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.includes('type=text')) {
        return mockJsonResponse({
          data: [
            { id: 'Qwen/Qwen3-32B', name: 'Qwen3 32B' },
            { id: 'BAAI/bge-m3', name: 'BAAI bge-m3' },
            { id: 'BAAI/bge-reranker-v2-m3', name: 'BAAI Reranker' },
          ],
        })
      }
      if (url.includes('type=image')) {
        return mockJsonResponse({ data: [{ id: 'black-forest-labs/FLUX.1-schnell', name: 'FLUX Schnell' }] })
      }
      if (url.includes('type=audio') || url.includes('type=video')) {
        return mockJsonResponse({ data: [] })
      }
      return mockJsonResponse({ data: [] })
    })
    vi.stubGlobal('fetch', fetchMock)

    const models = await fetchModelsFromApi(
      makeProvider({
        id: 'siliconflow',
        name: 'SiliconFlow',
        type: 'siliconflow',
        apiHost: 'https://api.siliconflow.cn/v1',
        apiKey: 'sk-silicon',
      }),
    )

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(models).toEqual([
      {
        id: 'BAAI/bge-m3',
        name: 'BAAI bge-m3',
        group: 'BAAI',
      },
      {
        id: 'BAAI/bge-reranker-v2-m3',
        name: 'BAAI Reranker',
        group: 'BAAI',
      },
      {
        id: 'black-forest-labs/FLUX.1-schnell',
        name: 'FLUX Schnell',
        group: 'black-forest-labs',
        transportProtocol: 'image-api',
        kindHint: 'image-generation',
        inputModalities: ['text'],
        outputModalities: ['image'],
        features: ['image-output'],
      },
      { id: 'Qwen/Qwen3-32B', name: 'Qwen3 32B', group: 'Qwen' },
    ])
  })

  it('Cohere 会按 models[] + next_page_token 拉平分页目录，并映射官方 endpoints/features 语义', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      const pageToken = url.searchParams.get('page_token')

      if (!pageToken) {
        return mockJsonResponse({
          models: [
            {
              name: 'command-a-vision-07-2025',
              endpoints: ['chat'],
            },
            {
              name: 'embed-english-v3.0-image',
              endpoints: ['embed_image'],
              context_length: 0,
              is_deprecated: true,
            },
          ],
          next_page_token: 'page-2',
        })
      }

      expect(pageToken).toBe('page-2')
      return mockJsonResponse({
        models: [
          {
            name: 'command-a-reasoning-08-2025',
            endpoints: ['chat', 'summarize'],
            features: ['reasoning', 'tools', 'json_schema'],
            context_length: 128000,
          },
          {
            name: 'command-a-vision-07-2025',
            endpoints: ['chat'],
            features: ['vision', 'strict_tools'],
            context_length: 256000,
          },
          {
            name: 'rerank-v4.0-fast',
            endpoints: ['rerank'],
            context_length: 4096,
          },
        ],
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const models = await fetchModelsFromApi(
      makeProvider({
        id: 'cohere',
        name: 'Cohere',
        type: 'cohere',
        apiHost: 'https://api.cohere.com/v2',
        apiKey: 'cohere-test-key',
      }),
      undefined,
      { force: true },
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(models.map((item) => item.id)).toEqual([
      'command-a-reasoning-08-2025',
      'command-a-vision-07-2025',
      'embed-english-v3.0-image',
      'rerank-v4.0-fast',
    ])

    expect(models.find((item) => item.id === 'command-a-reasoning-08-2025')).toEqual({
      id: 'command-a-reasoning-08-2025',
      name: 'command-a-reasoning-08-2025',
      group: 'Cohere',
      transportProtocol: 'cohere-chat',
      kindHint: 'chat',
      inputModalities: ['text'],
      outputModalities: ['text'],
      features: ['reasoning', 'tool-call', 'structured-output'],
      contextLength: 128000,
    })
    expect(models.find((item) => item.id === 'command-a-vision-07-2025')).toEqual({
      id: 'command-a-vision-07-2025',
      name: 'command-a-vision-07-2025',
      group: 'Cohere',
      transportProtocol: 'cohere-chat',
      kindHint: 'multimodal-chat',
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      features: ['vision-input', 'tool-call'],
      contextLength: 256000,
    })
    expect(models.find((item) => item.id === 'embed-english-v3.0-image')).toEqual({
      id: 'embed-english-v3.0-image',
      name: 'embed-english-v3.0-image',
      group: 'Cohere',
      transportProtocol: 'embedding-api',
      kindHint: 'embedding',
      inputModalities: ['image'],
      outputModalities: ['embeddings'],
      isDeprecated: true,
    })
    expect(models.find((item) => item.id === 'embed-english-v3.0-image')?.contextLength).toBeUndefined()
    expect(models.find((item) => item.id === 'rerank-v4.0-fast')).toEqual({
      id: 'rerank-v4.0-fast',
      name: 'rerank-v4.0-fast',
      group: 'Cohere',
      transportProtocol: 'rerank-api',
      kindHint: 'rerank',
      inputModalities: ['text'],
      outputModalities: ['text'],
      contextLength: 4096,
    })
  })

  it('Together 会按安全分类解析顶层数组目录，并只放开可运行的 serverless speech 模型', async () => {
    const fetchMock = vi.fn(async () => mockJsonResponse([
      { id: 'zai-org/GLM-5', display_name: 'GLM-5-FP4', type: 'chat', context_length: 202752 },
      { id: 'black-forest-labs/FLUX.1-schnell', display_name: 'FLUX Schnell', type: 'image', context_length: 8192 },
      { id: 'BAAI/bge-large-en-v1.5', display_name: 'BGE Large EN v1.5', type: 'embedding', context_length: 4096 },
      { id: 'Qwen/Qwen3-Reranker-8B', display_name: 'Qwen3 Reranker 8B', type: 'rerank', context_length: 32768 },
      { id: 'cartesia/sonic-2', display_name: 'Sonic 2', type: 'audio', context_length: 0 },
      { id: 'voice-labs/voice-1', display_name: 'Voice 1', type: 'audio', context_length: 0 },
      { id: 'openai/whisper-large-v3', display_name: 'Whisper Large V3', type: 'transcribe', context_length: 0 },
      { id: 'rime-labs/rime-arcana-v2', display_name: 'Rime Labs Arcana v2', type: 'audio', context_length: 0 },
      { id: 'wavespeed-ai/wan-2.2-t2v-fast', display_name: 'Wan 2.2 T2V Fast', type: 'video', context_length: 65536 },
      { id: 'meta-llama/Llama-Guard-4-12B', display_name: 'Llama Guard 4 12B', type: 'moderation' },
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const models = await fetchModelsFromApi(
      makeProvider({
        id: 'together',
        name: 'Together AI',
        type: 'openai',
        apiHost: 'https://api.together.xyz/v1',
        apiKey: 'sk-together',
      }),
      undefined,
      { force: true },
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(models).toEqual([
      {
        id: 'BAAI/bge-large-en-v1.5',
        name: 'BGE Large EN v1.5',
        group: 'BAAI',
        transportProtocol: 'embedding-api',
        kindHint: 'embedding',
        inputModalities: ['text'],
        outputModalities: ['embeddings'],
        contextLength: 4096,
      },
      {
        id: 'black-forest-labs/FLUX.1-schnell',
        name: 'FLUX Schnell',
        group: 'black-forest-labs',
        transportProtocol: 'image-api',
        kindHint: 'image-generation',
        inputModalities: ['text'],
        outputModalities: ['image'],
        features: ['image-output'],
        contextLength: 8192,
      },
      {
        id: 'cartesia/sonic-2',
        name: 'Sonic 2',
        group: 'cartesia',
        transportProtocol: 'speech-api',
        kindHint: 'speech-generation',
        inputModalities: ['text'],
        outputModalities: ['audio'],
        features: ['audio-output'],
      },
      {
        id: 'meta-llama/Llama-Guard-4-12B',
        name: 'Llama Guard 4 12B',
        group: 'meta-llama',
        providerCatalogTypeHint: 'moderation',
        importBlockedReasonKey: 'modelManagerPanel.manageDialog.importBlockedProviderCatalogTypeUnsupported',
        importBlockedReasonParams: { type: 'moderation' },
      },
      {
        id: 'openai/whisper-large-v3',
        name: 'Whisper Large V3',
        group: 'openai',
        transportProtocol: 'transcription-api',
        kindHint: 'transcription',
        inputModalities: ['audio', 'file'],
        outputModalities: ['text'],
        features: ['transcription'],
      },
      {
        id: 'Qwen/Qwen3-Reranker-8B',
        name: 'Qwen3 Reranker 8B',
        group: 'Qwen',
        transportProtocol: 'rerank-api',
        kindHint: 'rerank',
        inputModalities: ['text'],
        outputModalities: ['text'],
        contextLength: 32768,
      },
      {
        id: 'rime-labs/rime-arcana-v2',
        name: 'Rime Labs Arcana v2',
        group: 'rime-labs',
        providerCatalogTypeHint: 'audio',
        importBlockedReasonKey: 'modelManagerPanel.manageDialog.importBlockedTogetherDedicatedSpeechEndpointRequired',
      },
      {
        id: 'voice-labs/voice-1',
        name: 'Voice 1',
        group: 'voice-labs',
        providerCatalogTypeHint: 'audio',
        importBlockedReasonKey: 'modelManagerPanel.manageDialog.importBlockedProviderCatalogTypeUnsupported',
        importBlockedReasonParams: { type: 'audio' },
      },
      {
        id: 'wavespeed-ai/wan-2.2-t2v-fast',
        name: 'Wan 2.2 T2V Fast',
        group: 'wavespeed-ai',
        transportProtocol: 'video-api',
        kindHint: 'video-generation',
        inputModalities: ['text'],
        outputModalities: ['video'],
        contextLength: 65536,
      },
      {
        id: 'zai-org/GLM-5',
        name: 'GLM-5-FP4',
        group: 'zai-org',
        transportProtocol: 'openai-chat',
        kindHint: 'chat',
        inputModalities: ['text'],
        outputModalities: ['text'],
        contextLength: 202752,
      },
    ])
  })

  it('缓存 key 应包含 providerId，避免 Together 专用解析结果串到其他 OpenAI 兼容平台', async () => {
    const fetchMock = vi.fn(async () => mockJsonResponse([
      { id: 'zai-org/GLM-5', display_name: 'GLM-5-FP4', type: 'chat' },
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const togetherModels = await fetchModelsFromApi(
      makeProvider({
        id: 'together',
        name: 'Shared',
        type: 'openai',
        apiHost: 'https://shared.example.com/v1',
        apiKey: 'sk-shared',
      }),
      undefined,
      { force: false },
    )
    const togetherModelsCached = await fetchModelsFromApi(
      makeProvider({
        id: 'together',
        name: 'Shared',
        type: 'openai',
        apiHost: 'https://shared.example.com/v1',
        apiKey: 'sk-shared',
      }),
      undefined,
      { force: false },
    )
    const genericOpenAiModels = await fetchModelsFromApi(
      makeProvider({
        id: 'openai-compatible-custom',
        name: 'Shared',
        type: 'openai',
        apiHost: 'https://shared.example.com/v1',
        apiKey: 'sk-shared',
      }),
      undefined,
      { force: false },
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(togetherModels).toEqual(togetherModelsCached)
    expect(togetherModels).toEqual([
      {
        id: 'zai-org/GLM-5',
        name: 'GLM-5-FP4',
        group: 'zai-org',
        transportProtocol: 'openai-chat',
        kindHint: 'chat',
        inputModalities: ['text'],
        outputModalities: ['text'],
      },
    ])
    expect(genericOpenAiModels).toEqual([])
  })
})
