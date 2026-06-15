/**
 * 说明：`openai-compatibility-adapters.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `openai-compatibility-adapters.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createOpenAICompatibleMock, createOpenAIMock } = vi.hoisted(() => ({
  createOpenAICompatibleMock: vi.fn(),
  createOpenAIMock: vi.fn(),
}))

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: createOpenAICompatibleMock,
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: createOpenAIMock,
}))

import { azureOpenaiAdapter } from './azure-openai-adapter'
import { openaiAdapter } from './openai-adapter'
import { openaiResponseAdapter } from './openai-response-adapter'
import { resolveProviderContract } from './provider-contracts'
import type { OpenAiCompatibleRequestBodyTransformer } from './provider-utils-common'
import { OPENROUTER_NATIVE_WEB_SEARCH_SENTINEL } from '../native-web-search-constants'
import type { ProviderConfig } from '../types'
import type { CallSettingSupportContext } from './adapter-types'

/**
 * 测试辅助函数：`makeProviderConfig`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeProviderConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'provider',
    name: 'Provider',
    type: 'openai',
    apiKey: 'test-key',
    apiHost: 'https://example.com/v1',
    enabled: true,
    models: [],
    ...overrides,
  }
}

/**
 * 测试辅助函数：`makeProviderOptionsContext`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeProviderOptionsContext(config: ProviderConfig) {
  return {
    providerId: config.id,
    modelId: 'gpt-4.1',
    effectiveProviderType: config.type,
    contract: resolveProviderContract({
      providerId: config.id,
      providerType: config.type,
      effectiveProviderType: config.type,
      transportProtocol: config.type === 'openai-response' ? 'openai-responses' : 'openai-chat',
    }),
    providerOptionsKey: config.id === 'openai' || config.type === 'openai-response' ? 'openai' : config.id,
    openaiCompatibleProviderKey: config.type === 'openai' && config.id === 'openai' ? null : config.id,
    config,
    params: {
      enableGenerateImage: false,
      enableWebSearch: false,
      hasInjectedMcpTools: false,
      reasoningEffort: undefined,
      thinkingBudgetTokens: undefined,
    },
  }
}

/**
 * 测试辅助函数：`makeCallSettingSupportContext`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeCallSettingSupportContext(
  config: ProviderConfig,
  overrides: Partial<CallSettingSupportContext> = {},
): CallSettingSupportContext {
  return {
    providerId: config.id,
    config,
    modelId: 'gpt-5.4',
    effectiveProviderType: config.type,
    transportProtocol: config.type === 'openai-response' ? 'openai-responses' : 'openai-chat',
    ...overrides,
  }
}

describe('OpenAI compatibility adapters', () => {
  beforeEach(() => {
    createOpenAICompatibleMock.mockReset()
    createOpenAIMock.mockReset()

    createOpenAICompatibleMock.mockImplementation((options) => {
      const provider = vi.fn((modelId: string) => ({ modelId, options }))
      return Object.assign(provider, {
        embeddingModel: vi.fn((modelId: string) => ({ modelId, options, kind: 'embedding' })),
        imageModel: vi.fn((modelId: string) => ({ modelId, options, kind: 'image' })),
      })
    })

    createOpenAIMock.mockImplementation((options) => ({
      chat: vi.fn((modelId: string) => ({ modelId, options, kind: 'chat' })),
      responses: vi.fn((modelId: string) => ({ modelId, options, kind: 'responses' })),
      embedding: vi.fn((modelId: string) => ({ modelId, options, kind: 'embedding' })),
      image: vi.fn((modelId: string) => ({ modelId, options, kind: 'image' })),
    }))
  })

  it('OpenAI-compatible chat provider 会把 stream_options 与 developer role 真正接到 provider 创建参数', () => {
    const config = makeProviderConfig({
      id: 'custom-openai',
      type: 'openai',
      apiOptions: {
        isNotSupportStreamOptions: true,
        isSupportDeveloperRole: true,
      },
    })

    openaiAdapter.createLanguageModel(config, 'gpt-4.1')

    expect(createOpenAICompatibleMock).toHaveBeenCalledTimes(1)
    const options = createOpenAICompatibleMock.mock.calls[0][0] as {
      includeUsage?: boolean
      transformRequestBody?: OpenAiCompatibleRequestBodyTransformer
    }

    expect(options.includeUsage).toBe(false)
    expect(typeof options.transformRequestBody).toBe('function')
    expect(
      options.transformRequestBody?.({
        messages: [
          { role: 'system', content: 'system prompt' },
          { role: 'user', content: 'hello' },
        ],
      }),
    ).toEqual({
      messages: [
        { role: 'developer', content: 'system prompt' },
        { role: 'user', content: 'hello' },
      ],
    })
  })

  it('OpenRouter request transformer 会把 native search 哨兵改写为官方 openrouter:web_search server tool', () => {
    const config = makeProviderConfig({
      id: 'openrouter',
      name: 'OpenRouter',
      type: 'openai',
      apiHost: 'https://openrouter.ai/api/v1',
    })

    openaiAdapter.createLanguageModel(config, 'openai/gpt-5.4')

    expect(createOpenAICompatibleMock).toHaveBeenCalledTimes(1)
    const options = createOpenAICompatibleMock.mock.calls[0][0] as {
      transformRequestBody?: OpenAiCompatibleRequestBodyTransformer
    }

    expect(options.transformRequestBody?.({
      model: 'openai/gpt-5.4',
      messages: [],
      tools: [{ type: 'function', function: { name: 'mcp__x', parameters: {} } }],
      [OPENROUTER_NATIVE_WEB_SEARCH_SENTINEL]: {
        engine: 'exa',
        max_results: 10,
        allowed_domains: ['example.com'],
      },
    })).toEqual({
      model: 'openai/gpt-5.4',
      messages: [],
      tools: [
        { type: 'function', function: { name: 'mcp__x', parameters: {} } },
        {
          type: 'openrouter:web_search',
          parameters: {
            engine: 'exa',
            max_results: 10,
            allowed_domains: ['example.com'],
          },
        },
      ],
    })
  })

  it('官方 OpenAI providerOptions 会显式切换 systemMessageMode，避免 SDK 自动猜测', () => {
    const enabledConfig = makeProviderConfig({
      id: 'openai',
      type: 'openai',
      serviceTier: 'priority',
      verbosity: 'high',
      apiOptions: {
        isSupportDeveloperRole: true,
        isNotSupportVerbosity: true,
      },
    })

    expect(openaiAdapter.buildProviderOptions?.(makeProviderOptionsContext(enabledConfig))).toEqual({
      openai: {
        systemMessageMode: 'developer',
        serviceTier: 'priority',
      },
    })

    const disabledConfig = makeProviderConfig({
      id: 'openai',
      type: 'openai',
      apiOptions: { isSupportDeveloperRole: false },
    })

    expect(openaiAdapter.buildProviderOptions?.(makeProviderOptionsContext(disabledConfig))).toEqual({
      openai: {
        systemMessageMode: 'system',
      },
    })
  })

  it('OpenAI Responses providerOptions 同样会遵循 developer role 开关', () => {
    const config = makeProviderConfig({
      id: 'openai-responses',
      type: 'openai-response',
      serviceTier: 'flex',
      verbosity: 'medium',
      apiOptions: { isSupportDeveloperRole: false },
    })

    expect(openaiResponseAdapter.buildProviderOptions?.(makeProviderOptionsContext(config))).toEqual({
      openai: {
        systemMessageMode: 'system',
        serviceTier: 'flex',
        store: false,
        textVerbosity: 'medium',
      },
    })
  })

  it('OpenAI Responses 的 gpt-5.4 只有显式 reasoning=none 才允许 temperature/topP', () => {
    const config = makeProviderConfig({
      id: 'openai',
      type: 'openai-response',
    })

    expect(
      openaiResponseAdapter.getCallSettingSupport(
        makeCallSettingSupportContext(config, {
          reasoning: {
            kind: 'levels',
            configured: false,
            value: 'off',
            options: [],
          },
        }),
      ),
    ).toMatchObject({
      temperature: false,
      topP: false,
      maxTokens: true,
      presencePenalty: false,
      frequencyPenalty: false,
      seed: false,
      stop: false,
    })

    expect(
      openaiResponseAdapter.getCallSettingSupport(
        makeCallSettingSupportContext(config, {
          reasoning: {
            kind: 'levels',
            configured: true,
            value: 'none',
            options: [],
          },
        }),
      ),
    ).toMatchObject({
      temperature: true,
      topP: true,
      maxTokens: true,
      presencePenalty: false,
      frequencyPenalty: false,
      seed: false,
      stop: false,
    })
  })

  it('官方 OpenAI Chat GPT-5 reasoning 非 none 时会裁剪采样与 penalties', () => {
    const config = makeProviderConfig({
      id: 'openai',
      type: 'openai',
    })

    expect(
      openaiAdapter.getCallSettingSupport(
        makeCallSettingSupportContext(config, {
          reasoning: {
            kind: 'levels',
            configured: true,
            value: 'high',
            options: [],
          },
        }),
      ),
    ).toMatchObject({
      temperature: false,
      topP: false,
      presencePenalty: false,
      frequencyPenalty: false,
      seed: true,
      stop: true,
    })
  })

  it('官方 OpenAI Chat GPT-5 reasoning=none 时恢复采样参数', () => {
    const config = makeProviderConfig({
      id: 'openai',
      type: 'openai',
    })

    expect(
      openaiAdapter.getCallSettingSupport(
        makeCallSettingSupportContext(config, {
          reasoning: {
            kind: 'levels',
            configured: true,
            value: 'none',
            options: [],
          },
        }),
      ),
    ).toMatchObject({
      temperature: true,
      topP: true,
      presencePenalty: true,
      frequencyPenalty: true,
    })
  })

  it('自定义 OpenAI-compatible GPT-5 名称不会套用官方 OpenAI Chat reasoning 裁剪', () => {
    const config = makeProviderConfig({
      id: 'custom-openai',
      type: 'openai',
    })

    expect(
      openaiAdapter.getCallSettingSupport(
        makeCallSettingSupportContext(config, {
          reasoning: {
            kind: 'levels',
            configured: true,
            value: 'high',
            options: [],
          },
        }),
      ),
    ).toMatchObject({
      temperature: true,
      topP: true,
      presencePenalty: true,
      frequencyPenalty: true,
    })
  })

  it('Azure OpenAI 在关闭 api-version 后不再强制要求版本号，也会关闭 include_usage', () => {
    const config = makeProviderConfig({
      id: 'azure-test',
      type: 'azure-openai',
      apiHost: 'https://example-resource.openai.azure.com/openai/v1',
      apiVersion: '',
      apiOptions: {
        isNotSupportAPIVersion: true,
        isNotSupportStreamOptions: true,
        isSupportDeveloperRole: true,
      },
    })

    azureOpenaiAdapter.createLanguageModel(config, 'gpt-4.1')

    expect(createOpenAICompatibleMock).toHaveBeenCalledTimes(1)
    const options = createOpenAICompatibleMock.mock.calls[0][0] as {
      queryParams?: Record<string, string>
      includeUsage?: boolean
      transformRequestBody?: OpenAiCompatibleRequestBodyTransformer
    }

    expect(options.queryParams).toBeUndefined()
    expect(options.includeUsage).toBe(false)
    expect(
      options.transformRequestBody?.({
        messages: [{ role: 'system', content: 'azure system prompt' }],
      }),
    ).toEqual({
      messages: [{ role: 'developer', content: 'azure system prompt' }],
    })
  })

  it('Azure OpenAI 在未关闭 api-version 时仍然强制要求版本号', () => {
    const config = makeProviderConfig({
      id: 'azure-test',
      type: 'azure-openai',
      apiHost: 'https://example-resource.openai.azure.com/openai/deployments/demo',
      apiVersion: '',
    })

    expect(() => azureOpenaiAdapter.createLanguageModel(config, 'gpt-4.1')).toThrow(
      'errors.azureOpenAiApiVersionRequired',
    )
  })
})
