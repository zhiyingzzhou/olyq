/**
 * 说明：`useModelOptions.test` Hook 模块。
 *
 * 职责：
 * - 承载 `useModelOptions.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildModelOptions, useModelOptions } from './useModelOptions'
import type { ProviderConfig } from '@/lib/ai/types'

const {
  loadProvidersMock,
  refreshModelRegistryInBackgroundMock,
  loadModelRegistryFastMock,
  buildModelRegistryPreviewWithProvidersMock,
  resolveModelMetaFromRegistryMock,
  reconcileModelReferencesMock,
  storageOnChangeMock,
  defaultProvidersMock,
  consoleErrorMock,
  consoleWarnMock,
} = vi.hoisted(() => ({
  loadProvidersMock: vi.fn(),
  refreshModelRegistryInBackgroundMock: vi.fn(),
  loadModelRegistryFastMock: vi.fn(),
  buildModelRegistryPreviewWithProvidersMock: vi.fn(),
  resolveModelMetaFromRegistryMock: vi.fn(),
  reconcileModelReferencesMock: vi.fn(),
  storageOnChangeMock: vi.fn(() => () => {}),
  defaultProvidersMock: [] as ProviderConfig[],
  consoleErrorMock: vi.fn(),
  consoleWarnMock: vi.fn(),
}))

vi.mock('@/lib/ai/provider-registry', () => ({
  loadProviders: loadProvidersMock,
}))

vi.mock('@/lib/ai/provider-storage', () => ({
  loadProvidersView: loadProvidersMock,
}))

vi.mock('@/lib/ai/config/provider-defaults', () => ({
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

vi.mock('@/lib/storage/storage-adapter', () => ({
  getStorageAdapter: () => ({
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    onChange: storageOnChangeMock,
  }),
}))

vi.mock('@/lib/ai/model-reference-reconciler', () => ({
  reconcileModelReferences: reconcileModelReferencesMock,
}))

vi.mock('@/lib/ai/model-registry/sync-preview', () => ({
  buildModelRegistryPreviewWithProviders: buildModelRegistryPreviewWithProvidersMock,
}))

vi.mock('@/lib/ai/model-registry/background-refresh', () => ({
  refreshModelRegistryInBackground: refreshModelRegistryInBackgroundMock,
}))

vi.mock('@/lib/ai/model-registry', () => ({
  createEmptyModelRegistry: () => ({
    schema: 2,
    generatedAt: new Date(0).toISOString(),
    canonicalModels: {},
    aliasIndex: {},
    providerModelMap: {},
    providerScopedModels: {},
    syncMeta: {},
  }),
  hasModelRegistryEntries: (registry: {
    canonicalModels?: Record<string, unknown>
    aliasIndex?: Record<string, unknown>
    providerModelMap?: Record<string, unknown>
    providerScopedModels?: Record<string, unknown>
  }) => (
    Object.keys(registry.canonicalModels ?? {}).length > 0
    || Object.keys(registry.aliasIndex ?? {}).length > 0
    || Object.keys(registry.providerModelMap ?? {}).length > 0
    || Object.keys(registry.providerScopedModels ?? {}).length > 0
  ),
  loadModelRegistryFast: loadModelRegistryFastMock,
  MODEL_REGISTRY_UPDATED_EVENT: 'olyq:model-registry-updated',
  resolveModelMetaFromRegistry: resolveModelMetaFromRegistryMock,
}))

/**
 * 测试辅助函数：`makeRegistry`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeRegistry() {
  return {
    schema: 2 as const,
    generatedAt: '2026-03-24T00:00:00.000Z',
    canonicalModels: {},
    aliasIndex: {},
    providerModelMap: {},
    providerScopedModels: {},
    syncMeta: {},
  }
}

/**
 * 测试辅助函数：`makeResolvedModelMeta`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeResolvedModelMeta() {
  return {
    canonicalId: 'public::test::model',
    baseModelKey: 'model',
    scope: 'public' as const,
    kind: 'chat' as const,
    inputModalities: ['text'] as const,
    outputModalities: ['text'] as const,
    features: [] as const,
    transportProtocol: 'openai-chat' as const,
    confidence: 'high' as const,
    displayName: 'Test Model',
  }
}

/**
 * 重置 `useModelOptions` 的全局单例资源，避免上一个 Hook 用例把快照串到下一个场景。
 */
function resetModelOptionsResource() {
  const globalWithResource = globalThis as {
    __olyqModelOptionsResourceV1__?: {
      snapshot: { providers: ProviderConfig[]; models: ReturnType<typeof buildModelOptions> }
      listeners: Set<() => void>
      reloadPromise: Promise<void> | null
      reloadQueued: boolean
      started: boolean
      unsubscribeStorage: (() => void) | null
      unsubscribeWindow: (() => void) | null
    }
  }
  const resource = globalWithResource.__olyqModelOptionsResourceV1__
  if (!resource) return
  resource.snapshot = { providers: [], models: [] }
  resource.listeners = new Set()
  resource.reloadPromise = null
  resource.reloadQueued = false
  resource.started = false
  resource.unsubscribeStorage = null
  resource.unsubscribeWindow = null
}

describe('buildModelOptions', () => {
  beforeEach(() => {
    loadProvidersMock.mockReset()
    refreshModelRegistryInBackgroundMock.mockReset()
    loadModelRegistryFastMock.mockReset()
    buildModelRegistryPreviewWithProvidersMock.mockReset()
    resolveModelMetaFromRegistryMock.mockReset()
    reconcileModelReferencesMock.mockReset()
    storageOnChangeMock.mockClear()
    defaultProvidersMock.splice(0, defaultProvidersMock.length)
    resolveModelMetaFromRegistryMock.mockReturnValue(makeResolvedModelMeta())
    refreshModelRegistryInBackgroundMock.mockResolvedValue(makeRegistry())
    loadModelRegistryFastMock.mockResolvedValue(makeRegistry())
    buildModelRegistryPreviewWithProvidersMock.mockResolvedValue(makeRegistry())
    consoleErrorMock.mockReset()
    consoleWarnMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(consoleErrorMock)
    vi.spyOn(console, 'warn').mockImplementation(consoleWarnMock)
    resetModelOptionsResource()
  })

  afterEach(() => {
    resetModelOptionsResource()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('应跳过同一 provider 下重复的 model.id，避免静默覆盖', () => {
    const providers: ProviderConfig[] = [
      {
        id: 'duplicate-provider',
        name: 'Duplicate Provider',
        type: 'openai',
        enabled: true,
        apiKey: '',
        apiHost: 'https://api.example.com/v1',
        models: [
          { id: 'gpt-4.1', name: 'GPT-4.1 A' },
          { id: 'gpt-4.1', name: 'GPT-4.1 B' },
        ],
      },
    ]

    const options = buildModelOptions(providers, makeRegistry())

    expect(options).toHaveLength(1)
    expect(options[0]?.id).toBe('duplicate-provider/gpt-4.1')
    expect(consoleWarnMock).toHaveBeenCalledWith(
      '[provider]',
      'duplicate provider model id skipped',
      { providerType: 'openai' },
    )
  })

  it('会把 manualModelTypes 覆盖应用到最终模型选项语义', () => {
    const providers: ProviderConfig[] = [
      {
        id: 'custom',
        name: 'Custom Provider',
        type: 'openai',
        enabled: true,
        apiKey: '',
        apiHost: 'https://api.example.com/v1',
        models: [
          {
            id: 'chat-model',
            name: 'Chat Model',
            manualModelTypes: ['vision', 'reasoning'],
          },
        ],
      },
    ]

    resolveModelMetaFromRegistryMock.mockReturnValue(makeResolvedModelMeta())

    const options = buildModelOptions(providers, makeRegistry())

    expect(options).toHaveLength(1)
    expect(options[0]?.kind).toBe('multimodal-chat')
    expect(options[0]?.primaryKindKey).toBe('multimodal-chat')
    expect(options[0]?.inputModalities).toEqual(['text', 'image'])
    expect(options[0]?.features).toEqual(['vision-input', 'reasoning'])
  })

  it('会把主类键一并带入模型选项，供后续主类筛选复用', () => {
    const providers: ProviderConfig[] = [
      {
        id: 'image-provider',
        name: 'Image Provider',
        type: 'openai',
        enabled: true,
        apiKey: '',
        apiHost: 'https://api.example.com/v1',
        models: [
          {
            id: 'image-model',
            name: 'Image Model',
          },
        ],
      },
    ]

    resolveModelMetaFromRegistryMock.mockReturnValue({
      ...makeResolvedModelMeta(),
      kind: 'image-generation',
      outputModalities: ['image'],
      features: ['image-output'],
      transportProtocol: 'image-api',
    })

    const options = buildModelOptions(providers, makeRegistry())

    expect(options).toHaveLength(1)
    expect(options[0]?.kind).toBe('image-generation')
    expect(options[0]?.primaryKindKey).toBe('image-generation')
  })

  it('同一家族模型会按版本数字升序排序，并让基础款排在同版本变体前面', () => {
    const providers: ProviderConfig[] = [
      {
        id: 'openai',
        name: 'OpenAI',
        type: 'openai',
        enabled: true,
        apiKey: '',
        apiHost: 'https://api.openai.com/v1',
        models: [
          { id: 'gpt-5.4', name: 'GPT-5.4' },
          { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini' },
          { id: 'gpt-5.2', name: 'GPT-5.2' },
          { id: 'gpt-5.1', name: 'GPT-5.1' },
          { id: 'text-embedding-3-large', name: 'Text Embedding 3 Large' },
        ],
      },
    ]

    resolveModelMetaFromRegistryMock.mockImplementation((_registry, input: { rawModelId: string }) => {
      const rawModelId = String(input.rawModelId || '')
      const baseModelKey = rawModelId.split('/').pop()?.trim().toLowerCase() || 'unknown'
      return {
        ...makeResolvedModelMeta(),
        canonicalId: `public::openai::${baseModelKey}`,
        baseModelKey,
        displayName: rawModelId,
      }
    })

    const options = buildModelOptions(providers, makeRegistry())

    expect(options.map((model) => model.id)).toEqual([
      'openai/gpt-5.1',
      'openai/gpt-5.2',
      'openai/gpt-5.4',
      'openai/gpt-5.4-mini',
      'openai/text-embedding-3-large',
    ])
  })

  it('Provider 分组顺序应跟随存储数组顺序，而不是按 provider id 字母排序', () => {
    const providers: ProviderConfig[] = [
      {
        id: 'zeta',
        name: 'Zeta Provider',
        type: 'openai',
        enabled: true,
        apiKey: '',
        apiHost: 'https://zeta.example.com/v1',
        models: [{ id: 'zeta-model', name: 'Zeta Model' }],
      },
      {
        id: 'alpha',
        name: 'Alpha Provider',
        type: 'openai',
        enabled: true,
        apiKey: '',
        apiHost: 'https://alpha.example.com/v1',
        models: [{ id: 'alpha-model', name: 'Alpha Model' }],
      },
    ]

    const options = buildModelOptions(providers, makeRegistry())

    expect(options.map((model) => model.id)).toEqual([
      'zeta/zeta-model',
      'alpha/alpha-model',
    ])
  })

  it('会按数字位数比较同一家族版本，避免把 120b 排到 20b 前面', () => {
    const providers: ProviderConfig[] = [
      {
        id: 'groq',
        name: 'Groq',
        type: 'groq',
        enabled: true,
        apiKey: '',
        apiHost: 'https://api.groq.com/openai/v1',
        models: [
          { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B' },
          { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B' },
        ],
      },
    ]

    resolveModelMetaFromRegistryMock.mockImplementation((_registry, input: { rawModelId: string }) => {
      const rawModelId = String(input.rawModelId || '')
      const baseModelKey = rawModelId.split('/').pop()?.trim().toLowerCase() || 'unknown'
      return {
        ...makeResolvedModelMeta(),
        canonicalId: `public::openai::${baseModelKey}`,
        baseModelKey,
        displayName: rawModelId,
      }
    })

    const options = buildModelOptions(providers, makeRegistry())

    expect(options.map((model) => model.id)).toEqual([
      'groq/openai/gpt-oss-20b',
      'groq/openai/gpt-oss-120b',
    ])
  })

  it('不同子家族不会因为版本数字相近被错误串排', () => {
    const providers: ProviderConfig[] = [
      {
        id: 'anthropic',
        name: 'Anthropic',
        type: 'anthropic',
        enabled: true,
        apiKey: '',
        apiHost: 'https://api.anthropic.com',
        models: [
          { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
          { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
          { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
        ],
      },
    ]

    const options = buildModelOptions(providers, makeRegistry())

    expect(options.map((model) => model.id)).toEqual([
      'anthropic/claude-opus-4-6',
      'anthropic/claude-sonnet-4-6',
      'anthropic/claude-haiku-4-5',
    ])
  })

  it.each([
    ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-V3.1-Terminus', 'deepseek-ai/DeepSeek-V3.2'],
    ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-V3.2', 'deepseek-ai/DeepSeek-V3.1-Terminus'],
    ['deepseek-ai/DeepSeek-V3.1-Terminus', 'deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-V3.2'],
  ])('会稳定排序 DeepSeek V3 基础款与子版本，避免在 %j 顺序下出现重复或丢失', (...rawModelIds: string[]) => {
    const providers: ProviderConfig[] = [
      {
        id: 'siliconflow',
        name: 'SiliconFlow',
        type: 'siliconflow',
        enabled: true,
        apiKey: '',
        apiHost: 'https://api.siliconflow.cn/v1',
        models: rawModelIds.map((id) => ({ id, name: id.split('/').pop() || id })),
      },
    ]

    resolveModelMetaFromRegistryMock.mockImplementation((_registry, input: { rawModelId: string }) => {
      const rawModelId = String(input.rawModelId || '')
      const baseModelKey = rawModelId.split('/').pop()?.trim().toLowerCase() || 'unknown'
      return {
        ...makeResolvedModelMeta(),
        canonicalId: `public::deepseekai::${baseModelKey}`,
        baseModelKey,
        displayName: rawModelId.split('/').pop() || rawModelId,
      }
    })

    const options = buildModelOptions(providers, makeRegistry())

    expect(options.map((model) => model.id)).toEqual([
      'siliconflow/deepseek-ai/DeepSeek-V3',
      'siliconflow/deepseek-ai/DeepSeek-V3.1-Terminus',
      'siliconflow/deepseek-ai/DeepSeek-V3.2',
    ])
  })

  it('会保留已存 Anthropic 三方目录模型，不会回退成默认 Claude seed', async () => {
    const providers: ProviderConfig[] = [
      {
        id: 'anthropic',
        name: 'Anthropic',
        type: 'anthropic',
        enabled: true,
        apiKey: 'k',
        apiHost: 'https://api.proxy.example.com',
        models: [
          { id: 'moonshotai/kimi-k2.5', name: 'moonshotai/kimi-k2.5' },
          { id: 'deepseek-ai/deepseek-v3.2', name: 'deepseek-ai/deepseek-v3.2' },
        ],
      },
    ]

    loadProvidersMock.mockResolvedValue(providers)
    vi.stubGlobal('chrome', { storage: { local: {} } })
    resolveModelMetaFromRegistryMock.mockImplementation((_registry, input: { rawModelId: string; rawModelName?: string }) => {
      const rawModelId = String(input.rawModelId || '')
      return {
        ...makeResolvedModelMeta(),
        canonicalId: `provider::anthropic::${rawModelId}`,
        baseModelKey: rawModelId.toLowerCase(),
        displayName: String(input.rawModelName || rawModelId),
        transportProtocol: 'anthropic-messages',
      }
    })

    const { result } = renderHook(() => useModelOptions())

    await waitFor(() => {
      expect(result.current.models).toHaveLength(2)
    })

    expect(result.current.models.map((model) => model.id)).toEqual([
      'anthropic/moonshotai/kimi-k2.5',
      'anthropic/deepseek-ai/deepseek-v3.2',
    ])
    expect(result.current.models.every((model) => model.transportProtocol === 'anthropic-messages')).toBe(true)
  })

  it('扩展运行时 loadProviders 失败时不应回退到 DEFAULT_PROVIDERS 假数据', async () => {
    defaultProvidersMock.push({
      id: 'preview',
      name: 'Preview Provider',
      type: 'openai',
      enabled: true,
      apiKey: '',
      apiHost: 'https://preview.example.com/v1',
      models: [{ id: 'preview-model', name: 'Preview Model' }],
    })
    loadProvidersMock.mockRejectedValue(new Error('boom'))
    vi.stubGlobal('chrome', { storage: { local: {} } })

    const { result } = renderHook(() => useModelOptions())

    await waitFor(() => {
      expect(loadProvidersMock).toHaveBeenCalledTimes(1)
    })

    expect(result.current.providers).toEqual([])
    expect(result.current.models).toEqual([])
  })

  it('非扩展预览环境 loadProviders 失败时允许回退到 DEFAULT_PROVIDERS', async () => {
    defaultProvidersMock.push({
      id: 'preview',
      name: 'Preview Provider',
      type: 'openai',
      enabled: true,
      apiKey: '',
      apiHost: 'https://preview.example.com/v1',
      models: [{ id: 'preview-model', name: 'Preview Model' }],
    })
    loadProvidersMock.mockRejectedValue(new Error('boom'))
    vi.stubGlobal('chrome', undefined)

    const { result } = renderHook(() => useModelOptions())

    await waitFor(() => {
      expect(loadProvidersMock).toHaveBeenCalledTimes(1)
    })

    expect(result.current.providers).toHaveLength(1)
    expect(result.current.providers[0]?.id).toBe('preview')
    expect(result.current.models[0]?.id).toBe('preview/preview-model')
  })

  it('registry 加载失败时仍应保留已成功读取的 provider 列表', async () => {
    const providers: ProviderConfig[] = [
      {
        id: 'runtime',
        name: 'Runtime Provider',
        type: 'openai',
        enabled: true,
        apiKey: 'k',
        apiHost: 'https://runtime.example.com/v1',
        models: [{ id: 'chat-model', name: 'Chat Model' }],
      },
    ]
    loadProvidersMock.mockResolvedValue(providers)
    refreshModelRegistryInBackgroundMock.mockRejectedValue(new Error('seed failed'))
    loadModelRegistryFastMock.mockResolvedValue(makeRegistry())
    vi.stubGlobal('chrome', { storage: { local: {} } })

    const { result } = renderHook(() => useModelOptions())

    await waitFor(() => {
      expect(result.current.providers).toHaveLength(1)
    })

    expect(result.current.providers[0]?.id).toBe('runtime')
    expect(result.current.models[0]?.id).toBe('runtime/chat-model')
    expect(reconcileModelReferencesMock).toHaveBeenCalledWith(expect.objectContaining({
      providers,
      registry: expect.objectContaining({
        schema: 2,
        canonicalModels: {},
        aliasIndex: {},
        providerModelMap: {},
        providerScopedModels: {},
      }),
    }))
  })

  it('seed/storage registry 都为空时应回退到 preview registry', async () => {
    const providers: ProviderConfig[] = [
      {
        id: 'runtime',
        name: 'Runtime Provider',
        type: 'openai',
        enabled: true,
        apiKey: 'k',
        apiHost: 'https://runtime.example.com/v1',
        models: [{ id: 'chat-model', name: 'Chat Model' }],
      },
    ]
    const previewRegistry = {
      ...makeRegistry(),
      providerModelMap: {
        'openai::runtime::chat-model': {
          providerType: 'openai',
          providerId: 'runtime',
          rawModelId: 'chat-model',
          canonicalId: 'provider::openai::runtime::chat-model',
          transportProtocol: 'openai-chat',
          resolvedBy: 'scoped-fallback',
        },
      },
    }

    loadProvidersMock.mockResolvedValue(providers)
    refreshModelRegistryInBackgroundMock.mockResolvedValue(makeRegistry())
    loadModelRegistryFastMock.mockResolvedValue(makeRegistry())
    buildModelRegistryPreviewWithProvidersMock.mockResolvedValue(previewRegistry)
    vi.stubGlobal('chrome', { storage: { local: {} } })

    const { result } = renderHook(() => useModelOptions())

    await waitFor(() => {
      expect(buildModelRegistryPreviewWithProvidersMock).toHaveBeenCalledWith(providers)
    })

    expect(result.current.models[0]?.id).toBe('runtime/chat-model')
    expect(result.current.models[0]?.baseModelKey).toBe('model')
    expect(result.current.models[0]?.versionSortKey).toBe('model')
    expect(reconcileModelReferencesMock).toHaveBeenCalledWith(expect.objectContaining({
      providers,
      registry: previewRegistry,
    }))
  })
})
