/**
 * 说明：`provider-storage.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-storage.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PROVIDERS_STORAGE_KEY } from './storage-keys'
import type { ProviderConfig } from './types'

const { storageGet, defaultProvidersMock } = vi.hoisted(() => ({
  storageGet: vi.fn(),
  defaultProvidersMock: [] as ProviderConfig[],
}))

vi.mock('@/lib/storage/storage-adapter', () => ({
  getStorageAdapter: () => ({
    get: storageGet,
  }),
}))

vi.mock('./config/provider-defaults', () => ({
  /**
   * 读取器：`DEFAULT_PROVIDERS`。
   *
   * @remarks
   * 用于让测试按场景注入当前默认 provider seed 快照，模拟首次 bootstrap 与缺失默认 provider 补入时的读取结果。
   */
  get DEFAULT_PROVIDERS() {
    return defaultProvidersMock
  },
}))

describe('provider-storage', () => {
  beforeEach(() => {
    vi.resetModules()
    storageGet.mockReset()
    defaultProvidersMock.splice(0, defaultProvidersMock.length)
  })

  it('首次运行仍会回退到默认 provider seed 作为 bootstrap 基线', async () => {
    const defaultProviders: ProviderConfig[] = [
      {
        id: 'openai',
        name: 'OpenAI',
        type: 'openai',
        apiKey: '',
        apiHost: 'https://api.openai.com/v1',
        enabled: true,
        models: [{ id: 'gpt-5.4', name: 'GPT-5.4', isDefault: true }],
      },
    ]
    defaultProvidersMock.push(...defaultProviders)
    storageGet.mockResolvedValue({ [PROVIDERS_STORAGE_KEY]: undefined })

    const { loadProviderStorageSnapshot } = await import('./provider-storage')

    await expect(loadProviderStorageSnapshot()).resolves.toEqual({
      storedProviders: [],
      mergedProviders: defaultProviders,
      isFirstRun: true,
      hasNewDefaults: false,
      hasCanonicalizedProviders: false,
    })
  })

  it('已存在 provider 时会保留 storage 中的 models，并只补入缺失默认 provider', async () => {
    const anthropicSeed: ProviderConfig = {
      id: 'anthropic',
      name: 'Anthropic',
      type: 'anthropic',
      apiKey: '',
      apiHost: 'https://api.anthropic.com',
      enabled: false,
      models: [
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', isDefault: true },
        { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
      ],
    }
    const openAiSeed: ProviderConfig = {
      id: 'openai',
      name: 'OpenAI',
      type: 'openai',
      apiKey: '',
      apiHost: 'https://api.openai.com/v1',
      enabled: true,
      models: [{ id: 'gpt-5.4', name: 'GPT-5.4', isDefault: true }],
    }
    const storedAnthropic: ProviderConfig = {
      id: 'anthropic',
      name: 'Anthropic',
      type: 'anthropic',
      apiKey: 'proxy-key',
      apiHost: 'https://api.proxy.example.com',
      enabled: true,
      models: [
        { id: 'moonshotai/kimi-k2.5', name: 'moonshotai/kimi-k2.5' },
        { id: 'deepseek-ai/deepseek-v3.2', name: 'deepseek-ai/deepseek-v3.2' },
      ],
    }
    defaultProvidersMock.push(anthropicSeed, openAiSeed)
    storageGet.mockResolvedValue({ [PROVIDERS_STORAGE_KEY]: [storedAnthropic] })

    const { getProviderView, loadProviderStorageSnapshot, loadProvidersView } = await import('./provider-storage')
    const snapshot = await loadProviderStorageSnapshot()

    expect(snapshot.isFirstRun).toBe(false)
    expect(snapshot.hasNewDefaults).toBe(true)
    expect(snapshot.hasCanonicalizedProviders).toBe(false)
    expect(snapshot.storedProviders).toEqual([storedAnthropic])
    expect(snapshot.mergedProviders).toEqual([storedAnthropic, openAiSeed])
    expect(snapshot.mergedProviders[0]?.models).toEqual(storedAnthropic.models)
    expect(snapshot.mergedProviders[1]).not.toBe(openAiSeed)
    await expect(loadProvidersView()).resolves.toEqual([storedAnthropic, openAiSeed])
    await expect(getProviderView('anthropic')).resolves.toEqual(storedAnthropic)
  })

  it('会保留历史默认 openai provider 的 openai-response 存量，不在读取层改回 Chat', async () => {
    const legacyOpenAiProvider: ProviderConfig = {
      id: 'openai',
      name: 'OpenAI',
      type: 'openai-response',
      apiKey: 'legacy-key',
      apiHost: 'https://api.openai.com/v1',
      enabled: true,
      models: [
        { id: 'gpt-5.4', name: 'GPT-5.4', isDefault: true, transportProtocol: 'openai-responses' },
        { id: 'text-embedding-3-large', name: 'Text Embedding 3 Large', transportProtocol: 'embedding-api' },
      ],
    }
    storageGet.mockResolvedValue({ [PROVIDERS_STORAGE_KEY]: [legacyOpenAiProvider] })

    const { getProviderView, loadProviderStorageSnapshot, loadProvidersView } = await import('./provider-storage')
    const snapshot = await loadProviderStorageSnapshot()

    expect(snapshot.isFirstRun).toBe(false)
    expect(snapshot.hasNewDefaults).toBe(false)
    expect(snapshot.hasCanonicalizedProviders).toBe(false)
    expect(snapshot.storedProviders).toEqual([legacyOpenAiProvider])
    expect(snapshot.mergedProviders).toEqual([legacyOpenAiProvider])
    await expect(loadProvidersView()).resolves.toEqual([legacyOpenAiProvider])
    await expect(getProviderView('openai')).resolves.toEqual(legacyOpenAiProvider)
  })
})
