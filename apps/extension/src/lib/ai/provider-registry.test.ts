/**
 * 说明：`provider-registry.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-registry.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MODEL_REGISTRY_STORAGE_KEY,
  PROVIDER_API_KEY_ROTATION_STATE_STORAGE_KEY,
  PROVIDERS_STORAGE_KEY,
} from './storage-keys'
import type { ProviderConfig } from './types'
import type { ResolvedModelMeta } from './model-registry/types'

const {
  storageGet,
  storageSet,
  storageOnChange,
  resolveModelMetaMock,
  getProviderNetworkHostMatchPatternsMock,
  resolveProviderNetworkBaseUrlForModelMock,
  buildModelRegistryPreviewWithProvidersMock,
  normalizeModelRegistryForStorageMock,
  dispatchModelRegistryUpdatedMock,
  reconcileModelReferencesMock,
  defaultProvidersMock,
} = vi.hoisted(() => ({
  storageGet: vi.fn(),
  storageSet: vi.fn(),
  storageOnChange: vi.fn(() => () => {}),
  resolveModelMetaMock: vi.fn(),
  getProviderNetworkHostMatchPatternsMock: vi.fn(),
  resolveProviderNetworkBaseUrlForModelMock: vi.fn(),
  buildModelRegistryPreviewWithProvidersMock: vi.fn(),
  normalizeModelRegistryForStorageMock: vi.fn(),
  dispatchModelRegistryUpdatedMock: vi.fn(),
  reconcileModelReferencesMock: vi.fn(),
  defaultProvidersMock: [] as ProviderConfig[],
}))

vi.mock('@/lib/storage/storage-adapter', () => ({
  getStorageAdapter: () => ({
    get: storageGet,
    set: storageSet,
    onChange: storageOnChange,
  }),
}))

vi.mock('./config/provider-defaults', () => ({
    /**
   * 读取器：`DEFAULT_PROVIDERS`。
   *
   * @remarks
   * 用于返回当前实例上的派生状态或只读视图，调用方应结合所属类的状态流理解它的时序语义。
   */
  get DEFAULT_PROVIDERS() {
    return defaultProvidersMock
  },
}))

vi.mock('./provider-network-targets', () => ({
  getProviderNetworkHostMatchPatterns: getProviderNetworkHostMatchPatternsMock,
  resolveProviderNetworkBaseUrlForModel: resolveProviderNetworkBaseUrlForModelMock,
}))

vi.mock('./model-registry/resolver', () => ({
  resolveModelMeta: resolveModelMetaMock,
}))

vi.mock('./model-registry/sync-preview-core', () => ({
  buildModelRegistryPreviewWithProviders: buildModelRegistryPreviewWithProvidersMock,
}))

vi.mock('./model-registry/storage', () => ({
  normalizeModelRegistryForStorage: normalizeModelRegistryForStorageMock,
}))

vi.mock('./model-registry/state', () => ({
  dispatchModelRegistryUpdated: dispatchModelRegistryUpdatedMock,
}))

vi.mock('./model-reference-reconciler', () => ({
  reconcileModelReferences: reconcileModelReferencesMock,
}))

/**
 * 测试辅助函数：`makeResolvedModelMeta`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeResolvedModelMeta(overrides: Partial<ResolvedModelMeta>): ResolvedModelMeta {
  return {
    canonicalId: 'public::test::model',
    baseModelKey: 'model',
    scope: 'public',
    kind: 'chat',
    inputModalities: ['text'],
    outputModalities: ['text'],
    features: [],
    transportProtocol: 'openai-chat',
    displayName: 'Test Model',
    confidence: 'high',
    ...overrides,
  }
}

describe('provider-registry.getDefaultModelId', () => {
  beforeEach(() => {
    vi.resetModules()
    storageGet.mockReset()
    storageSet.mockReset()
    storageOnChange.mockClear()
    resolveModelMetaMock.mockReset()
    getProviderNetworkHostMatchPatternsMock.mockReset()
    resolveProviderNetworkBaseUrlForModelMock.mockReset()
    buildModelRegistryPreviewWithProvidersMock.mockReset()
    normalizeModelRegistryForStorageMock.mockReset()
    dispatchModelRegistryUpdatedMock.mockReset()
    reconcileModelReferencesMock.mockReset()
    defaultProvidersMock.splice(0, defaultProvidersMock.length)
    getProviderNetworkHostMatchPatternsMock.mockReturnValue(['https://example.com/*'])
    resolveProviderNetworkBaseUrlForModelMock.mockReturnValue('https://example.com/v1')
    buildModelRegistryPreviewWithProvidersMock.mockResolvedValue({
      schema: 2,
      generatedAt: '2026-03-24T00:00:00.000Z',
      canonicalModels: {},
      aliasIndex: {},
      providerModelMap: {},
      providerScopedModels: {},
      syncMeta: {},
    })
    normalizeModelRegistryForStorageMock.mockImplementation((value: unknown) => value)
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        schema: 2,
        updatedAt: '2026-03-24T00:00:00.000Z',
        items: [],
      }),
    })))
  })

  it('会跳过 embedding/unknown，只返回明确的聊天类模型', async () => {
    const providers: ProviderConfig[] = [
      {
        id: 'custom',
        name: 'Custom',
        type: 'openai',
        apiKey: 'k',
        apiHost: 'https://example.com/v1',
        enabled: true,
        models: [
          { id: 'embed-model', name: 'Embed Model', isDefault: true, transportProtocol: 'embedding-api' },
          { id: 'chat-model', name: 'Chat Model', transportProtocol: 'openai-chat' },
        ],
      },
    ]
    storageGet.mockResolvedValue({ [PROVIDERS_STORAGE_KEY]: providers })
    resolveModelMetaMock.mockImplementation(async (input: { rawModelId?: string }) => {
      if (input.rawModelId === 'embed-model') {
        return makeResolvedModelMeta({
          canonicalId: 'public::test::embed-model',
          baseModelKey: 'embed-model',
          kind: 'embedding',
          inputModalities: ['text'],
          outputModalities: ['embeddings'],
          transportProtocol: 'embedding-api',
          displayName: 'Embed Model',
        })
      }
      return makeResolvedModelMeta({
        canonicalId: 'public::test::chat-model',
        baseModelKey: 'chat-model',
        kind: 'chat',
        transportProtocol: 'openai-chat',
        displayName: 'Chat Model',
      })
    })

    const { getDefaultModelId } = await import('./provider-runtime')

    await expect(getDefaultModelId()).resolves.toBe('custom/chat-model')
  }, 15_000)

  it('当没有可用聊天模型时会抛出 noAvailableModels', async () => {
    const providers: ProviderConfig[] = [
      {
        id: 'custom',
        name: 'Custom',
        type: 'openai',
        apiKey: 'k',
        apiHost: 'https://example.com/v1',
        enabled: true,
        models: [
          { id: 'embed-model', name: 'Embed Model', transportProtocol: 'embedding-api' },
          { id: 'unknown-model', name: 'Unknown Model' },
        ],
      },
    ]
    storageGet.mockResolvedValue({ [PROVIDERS_STORAGE_KEY]: providers })
    resolveModelMetaMock.mockImplementation(async (input: { rawModelId?: string }) => {
      if (input.rawModelId === 'embed-model') {
        return makeResolvedModelMeta({
          canonicalId: 'public::test::embed-model',
          baseModelKey: 'embed-model',
          kind: 'embedding',
          inputModalities: ['text'],
          outputModalities: ['embeddings'],
          transportProtocol: 'embedding-api',
          displayName: 'Embed Model',
        })
      }
      return makeResolvedModelMeta({
        canonicalId: 'provider::openai::custom::unknown-model',
        baseModelKey: 'unknown-model',
        scope: 'provider',
        kind: 'unknown',
        inputModalities: [],
        outputModalities: [],
        transportProtocol: 'unknown',
        displayName: 'Unknown Model',
        confidence: 'low',
      })
    })

    const { getDefaultModelId } = await import('./provider-runtime')

    await expect(getDefaultModelId()).rejects.toMatchObject({ message: 'errors.noAvailableModels' })
  })

  it('会保留历史默认 openai provider 的 openai-response 配置和已存 models', async () => {
    const seededSystemProviders: ProviderConfig[] = [
      {
        id: 'openai',
        name: 'OpenAI',
        type: 'openai',
        apiKey: '',
        apiHost: 'https://api.openai.com/v1',
        enabled: true,
        models: [
          { id: 'gpt-5.4', name: 'GPT-5.4', isDefault: true, transportProtocol: 'openai-chat' },
          { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini', transportProtocol: 'openai-chat' },
          { id: 'gpt-5.2', name: 'GPT-5.2', transportProtocol: 'openai-chat' },
          { id: 'gpt-5.1', name: 'GPT-5.1', transportProtocol: 'openai-chat' },
          { id: 'text-embedding-3-large', name: 'Text Embedding 3 Large', transportProtocol: 'embedding-api' },
        ],
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        type: 'anthropic',
        apiKey: '',
        apiHost: 'https://api.anthropic.com',
        enabled: false,
        models: [
          { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', isDefault: true },
          { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
          { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
        ],
      },
      {
        id: 'google',
        name: 'Gemini',
        type: 'gemini',
        apiKey: '',
        apiHost: 'https://generativelanguage.googleapis.com/v1beta',
        enabled: false,
        models: [
          { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', isDefault: true },
          { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' },
          { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite Preview' },
        ],
      },
      {
        id: 'deepseek',
        name: 'DeepSeek',
        type: 'deepseek',
        apiKey: '',
        apiHost: 'https://api.deepseek.com',
        enabled: false,
        models: [
          { id: 'deepseek-chat', name: 'DeepSeek Chat (V3.2)', isDefault: true },
          { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (V3.2 Thinking)' },
        ],
      },
      {
        id: 'groq',
        name: 'Groq',
        type: 'groq',
        apiKey: '',
        apiHost: 'https://api.groq.com/openai/v1',
        enabled: false,
        models: [
          { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', isDefault: true },
          { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B' },
          { id: 'qwen/qwen3-32b', name: 'Qwen3 32B' },
          { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B 16E' },
        ],
      },
      {
        id: 'xai',
        name: 'xAI (Grok)',
        type: 'xai',
        apiKey: '',
        apiHost: 'https://api.x.ai/v1',
        enabled: false,
        models: [
          { id: 'grok-4-1-fast-reasoning', name: 'Grok 4.1 Fast Reasoning', isDefault: true },
          { id: 'grok-4.20', name: 'Grok 4.20' },
          { id: 'grok-4', name: 'Grok 4' },
          { id: 'grok-imagine-image-pro', name: 'Grok Imagine Image Pro', transportProtocol: 'image-api' },
        ],
      },
      {
        id: 'cohere',
        name: 'Cohere',
        type: 'cohere',
        apiKey: '',
        apiHost: 'https://api.cohere.com/v2',
        enabled: false,
        models: [
          { id: 'command-a-03-2025', name: 'Command A', isDefault: true },
          { id: 'command-a-reasoning-08-2025', name: 'Command A Reasoning' },
          { id: 'command-a-vision-07-2025', name: 'Command A Vision' },
          { id: 'embed-v4.0', name: 'Embed v4.0', transportProtocol: 'embedding-api' },
          { id: 'rerank-v4.0-pro', name: 'Rerank v4.0 Pro', transportProtocol: 'rerank-api' },
        ],
      },
    ]
    defaultProvidersMock.push(...seededSystemProviders)

    const providers: ProviderConfig[] = [
      {
        id: 'openai',
        name: 'OpenAI',
        type: 'openai-response',
        apiKey: 'k',
        apiHost: 'https://proxy.example.com/v1',
        enabled: false,
        headers: { 'x-title': 'custom' },
        notes: 'keep-openai',
        models: [{ id: 'legacy-openai', name: 'Legacy OpenAI', isDefault: true, transportProtocol: 'openai-responses' }],
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        type: 'anthropic',
        apiKey: 'anthropic-key',
        apiHost: 'https://anthropic-proxy.example.com',
        enabled: true,
        headers: { 'x-trace-id': 'anthropic' },
        notes: 'keep-anthropic',
        models: [{ id: 'legacy-claude', name: 'Legacy Claude', isDefault: true }],
      },
      {
        id: 'google',
        name: 'Gemini',
        type: 'gemini',
        apiKey: 'google-key',
        apiHost: 'https://gemini-proxy.example.com/v1beta',
        enabled: true,
        headers: { 'x-goog-user-project': 'demo' },
        notes: 'keep-google',
        models: [{ id: 'legacy-gemini', name: 'Legacy Gemini', isDefault: true }],
      },
      {
        id: 'deepseek',
        name: 'DeepSeek',
        type: 'deepseek',
        apiKey: 'deepseek-key',
        apiHost: 'https://deepseek-proxy.example.com',
        enabled: true,
        headers: { 'x-client': 'deepseek' },
        notes: 'keep-deepseek',
        models: [{ id: 'legacy-deepseek', name: 'Legacy DeepSeek', isDefault: true }],
      },
      {
        id: 'groq',
        name: 'Groq',
        type: 'groq',
        apiKey: 'groq-key',
        apiHost: 'https://groq-proxy.example.com/openai/v1',
        enabled: true,
        headers: { 'x-client': 'groq' },
        notes: 'keep-groq',
        models: [{ id: 'legacy-groq', name: 'Legacy Groq', isDefault: true }],
      },
      {
        id: 'xai',
        name: 'xAI (Grok)',
        type: 'xai',
        apiKey: 'xai-key',
        apiHost: 'https://xai-proxy.example.com/v1',
        enabled: false,
        headers: { 'x-client': 'xai' },
        notes: 'keep-xai',
        models: [{ id: 'legacy-xai', name: 'Legacy xAI', isDefault: true }],
      },
      {
        id: 'cohere',
        name: 'Cohere',
        type: 'cohere',
        apiKey: 'cohere-key',
        apiHost: 'https://cohere-proxy.example.com/v2',
        enabled: true,
        headers: { 'x-client': 'cohere' },
        notes: 'keep-cohere',
        models: [{ id: 'legacy-cohere', name: 'Legacy Cohere', isDefault: true }],
      },
    ]
    storageGet.mockResolvedValue({ [PROVIDERS_STORAGE_KEY]: providers })
    const { loadProviders } = await import('./provider-registry')

    await expect(loadProviders()).resolves.toEqual(providers)
    expect(buildModelRegistryPreviewWithProvidersMock).not.toHaveBeenCalled()
    expect(storageSet).not.toHaveBeenCalled()
    expect(dispatchModelRegistryUpdatedMock).not.toHaveBeenCalled()
  })

  it('saveProviders 会先预构建 registry，再把 providers 与 registry 一起提交', async () => {
    const providers: ProviderConfig[] = [
      {
        id: 'custom',
        name: 'Custom',
        type: 'openai',
        apiKey: 'k',
        apiHost: 'https://example.com/v1',
        enabled: true,
        models: [{ id: 'chat-model', name: 'Chat Model', transportProtocol: 'openai-chat' }],
      },
    ]
    const previewRegistry = {
      schema: 2,
      generatedAt: '2026-03-24T12:00:00.000Z',
      canonicalModels: {},
      aliasIndex: {},
      providerModelMap: {},
      providerScopedModels: {},
      syncMeta: { openrouterLastSyncStatus: 'success' },
    }
    buildModelRegistryPreviewWithProvidersMock.mockResolvedValue(previewRegistry)

    const { saveProviders } = await import('./provider-registry')

    await saveProviders(providers)

    expect(buildModelRegistryPreviewWithProvidersMock).toHaveBeenCalledWith(providers)
    expect(storageSet).toHaveBeenCalledWith({
      [PROVIDERS_STORAGE_KEY]: providers,
      [MODEL_REGISTRY_STORAGE_KEY]: previewRegistry,
    })
    expect(dispatchModelRegistryUpdatedMock).toHaveBeenCalledTimes(1)
  })

  it('saveProviders 在预构建 registry 失败时不会写入半提交数据', async () => {
    const providers: ProviderConfig[] = [
      {
        id: 'custom',
        name: 'Custom',
        type: 'openai',
        apiKey: 'k',
        apiHost: 'https://example.com/v1',
        enabled: true,
        models: [{ id: 'chat-model', name: 'Chat Model', transportProtocol: 'openai-chat' }],
      },
    ]
    buildModelRegistryPreviewWithProvidersMock.mockRejectedValue(new Error('preview failed'))

    const { saveProviders } = await import('./provider-registry')

    await expect(saveProviders(providers)).rejects.toThrow('preview failed')
    expect(storageSet).not.toHaveBeenCalled()
    expect(dispatchModelRegistryUpdatedMock).not.toHaveBeenCalled()
  })
})

describe('provider-registry.resolveProviderRuntimeContext', () => {
  beforeEach(() => {
    vi.resetModules()
    storageGet.mockReset()
    storageSet.mockReset()
    storageOnChange.mockClear()
    resolveModelMetaMock.mockReset()
    getProviderNetworkHostMatchPatternsMock.mockReset()
    resolveProviderNetworkBaseUrlForModelMock.mockReset()
    defaultProvidersMock.splice(0, defaultProvidersMock.length)
    getProviderNetworkHostMatchPatternsMock.mockReturnValue(['https://example.com/*'])
    resolveProviderNetworkBaseUrlForModelMock.mockReturnValue('https://example.com/v1')
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        schema: 2,
        updatedAt: '2026-03-24T00:00:00.000Z',
        items: [],
      }),
    })))
  })

  it('会在 provider 已禁用时直接抛 providerDisabled', async () => {
    const providers: ProviderConfig[] = [
      {
        id: 'custom',
        name: 'Custom',
        type: 'openai',
        apiKey: 'k',
        apiHost: 'https://example.com/v1',
        enabled: false,
        models: [{ id: 'chat-model', name: 'Chat Model', transportProtocol: 'openai-chat' }],
      },
    ]
    storageGet.mockResolvedValue({ [PROVIDERS_STORAGE_KEY]: providers })

    const { resolveProviderRuntimeContext } = await import('./provider-runtime')

    await expect(resolveProviderRuntimeContext({
      model: 'custom/chat-model',
      resolvedModelMeta: makeResolvedModelMeta({
        canonicalId: 'public::test::chat-model',
        baseModelKey: 'chat-model',
        kind: 'chat',
        transportProtocol: 'openai-chat',
        displayName: 'Chat Model',
      }),
    })).rejects.toMatchObject({ message: 'errors.providerDisabled' })
  })

  it('安装期网页访问模型下不再把 Provider 网络目标作为前置拦截', async () => {
    const providers: ProviderConfig[] = [
      {
        id: 'custom',
        name: 'Custom',
        type: 'openai',
        apiKey: 'k',
        apiHost: 'https://example.com/v1',
        enabled: true,
        models: [{ id: 'chat-model', name: 'Chat Model', transportProtocol: 'openai-chat' }],
      },
    ]
    storageGet.mockResolvedValue({ [PROVIDERS_STORAGE_KEY]: providers })
    resolveModelMetaMock.mockResolvedValue(makeResolvedModelMeta({
      canonicalId: 'public::test::chat-model',
      baseModelKey: 'chat-model',
      kind: 'chat',
      transportProtocol: 'openai-chat',
      displayName: 'Chat Model',
    }))

    const { resolveProviderRuntimeContext } = await import('./provider-runtime')

    await expect(resolveProviderRuntimeContext({
      model: 'custom/chat-model',
      resolvedModelMeta: makeResolvedModelMeta({
        canonicalId: 'public::test::chat-model',
        baseModelKey: 'chat-model',
        kind: 'chat',
        transportProtocol: 'openai-chat',
        displayName: 'Chat Model',
      }),
    })).resolves.toMatchObject({
      modelId: 'chat-model',
      apiHost: 'https://example.com/v1',
    })
  })

  it('连续解析真实运行时会按 provider 多 key 推进轮询，显式 override 不推进游标', async () => {
    const providers: ProviderConfig[] = [
      {
        id: 'custom',
        name: 'Custom',
        type: 'openai',
        apiKey: 'first,second',
        apiHost: 'https://example.com/v1',
        enabled: true,
        models: [{ id: 'chat-model', name: 'Chat Model', transportProtocol: 'openai-chat' }],
      },
    ]
    const storageState: Record<string, unknown> = { [PROVIDERS_STORAGE_KEY]: providers }
    storageGet.mockImplementation(async (keys: string[]) => {
      const out: Record<string, unknown> = {}
      for (const key of keys) {
        if (key in storageState) out[key] = storageState[key]
      }
      return out
    })
    storageSet.mockImplementation(async (items: Record<string, unknown>) => {
      Object.assign(storageState, items)
    })

    const resolvedMeta = makeResolvedModelMeta({
      canonicalId: 'public::test::chat-model',
      baseModelKey: 'chat-model',
      kind: 'chat',
      transportProtocol: 'openai-chat',
      displayName: 'Chat Model',
    })
    const { resolveProviderRuntimeContext } = await import('./provider-runtime')

    await expect(resolveProviderRuntimeContext({
      model: 'custom/chat-model',
      resolvedModelMeta: resolvedMeta,
    })).resolves.toMatchObject({ apiKey: 'first' })
    await expect(resolveProviderRuntimeContext({
      model: 'custom/chat-model',
      resolvedModelMeta: resolvedMeta,
    })).resolves.toMatchObject({ apiKey: 'second' })
    await expect(resolveProviderRuntimeContext({
      model: 'custom/chat-model',
      resolvedModelMeta: resolvedMeta,
      apiKeyOverride: 'override',
    })).resolves.toMatchObject({ apiKey: 'override' })

    expect(storageState[PROVIDER_API_KEY_ROTATION_STATE_STORAGE_KEY]).toEqual({ custom: 1 })
  })

  it('运行时会把 URL-like API Key 视为未配置鉴权，不下发为密钥', async () => {
    const providers: ProviderConfig[] = [
      {
        id: 'custom',
        name: 'Custom',
        type: 'anthropic',
        apiKey: 'https://api.ikuncode.cc/v1/messages',
        apiHost: 'https://api.ikuncode.cc/v1',
        enabled: true,
        models: [{ id: 'claude-sonnet', name: 'Claude Sonnet', transportProtocol: 'anthropic-messages' }],
      },
    ]
    storageGet.mockResolvedValue({ [PROVIDERS_STORAGE_KEY]: providers })

    const { resolveProviderRuntimeContext } = await import('./provider-runtime')

    await expect(resolveProviderRuntimeContext({
      model: 'custom/claude-sonnet',
      resolvedModelMeta: makeResolvedModelMeta({
        canonicalId: 'public::test::claude-sonnet',
        baseModelKey: 'claude-sonnet',
        kind: 'chat',
        transportProtocol: 'anthropic-messages',
        displayName: 'Claude Sonnet',
      }),
    })).rejects.toMatchObject({ message: 'errors.providerApiKeyMissing' })
  })

  it('会把模型配置中的 manualModelTypes 覆盖应用到最终运行时语义', async () => {
    const providers: ProviderConfig[] = [
      {
        id: 'custom',
        name: 'Custom',
        type: 'openai',
        apiKey: 'k',
        apiHost: 'https://example.com/v1',
        enabled: true,
        models: [
          {
            id: 'chat-model',
            name: 'Chat Model',
            transportProtocol: 'openai-chat',
            manualModelTypes: ['vision', 'reasoning'],
          },
        ],
      },
    ]
    storageGet.mockResolvedValue({ [PROVIDERS_STORAGE_KEY]: providers })

    const { resolveProviderRuntimeContext } = await import('./provider-runtime')

    const runtime = await resolveProviderRuntimeContext({
      model: 'custom/chat-model',
      resolvedModelMeta: makeResolvedModelMeta({
        canonicalId: 'public::test::chat-model',
        baseModelKey: 'chat-model',
        kind: 'chat',
        inputModalities: ['text'],
        outputModalities: ['text'],
        transportProtocol: 'openai-chat',
        displayName: 'Chat Model',
      }),
    })

    expect(runtime.resolvedModelMeta.kind).toBe('multimodal-chat')
    expect(runtime.resolvedModelMeta.inputModalities).toEqual(['text', 'image'])
    expect(runtime.resolvedModelMeta.features).toEqual(['vision-input', 'reasoning'])
  })
})
