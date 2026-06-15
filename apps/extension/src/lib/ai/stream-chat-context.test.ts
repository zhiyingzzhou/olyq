/**
 * 说明：`stream-chat-context.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `stream-chat-context.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'

const {
  isKnownUnsupportedOpenAiResponsesStoreTargetMock,
} = vi.hoisted(() => ({
  isKnownUnsupportedOpenAiResponsesStoreTargetMock: vi.fn(async () => false),
}))

vi.mock('./openai-responses-store-capability', () => ({
  isKnownUnsupportedOpenAiResponsesStoreTarget: isKnownUnsupportedOpenAiResponsesStoreTargetMock,
}))

import type { ResolvedModelMeta } from './model-registry'
import { buildModelParamsWithProviderReasoning } from './provider-reasoning'
import { buildCallSettings, buildProviderOptions, buildRuntimeCallPlan, type StreamContext } from './stream-chat-context'
import type { ModelCallParamsBase, ProviderConfig } from './types'
import { resolveProviderContract } from './providers/provider-contracts'

/**
 * 测试辅助函数：`makeProviderConfig`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeProviderConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'test',
    name: 'Test',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://example.com/v1',
    enabled: true,
    models: [],
    ...overrides,
  }
}

/**
 * 测试辅助函数：`makeResolvedModelMeta`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeResolvedModelMeta(overrides: Partial<ResolvedModelMeta> = {}): ResolvedModelMeta {
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
    confidence: 'medium',
    ...overrides,
  }
}

/**
 * 测试辅助函数：`makeStreamContext`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeStreamContext(args: {
  providerConfig: ProviderConfig
  providerType: ProviderConfig['type']
  effectiveProviderType: ProviderConfig['type']
  providerOptionsKey: string | null
  openaiCompatibleProviderKey: string | null
  modelId?: string
  resolvedModelMeta?: ResolvedModelMeta
}): StreamContext {
  const resolvedModelMeta = args.resolvedModelMeta ?? makeResolvedModelMeta()
  return {
    providerId: args.providerConfig.id,
    modelId: args.modelId ?? 'model',
    providerConfig: args.providerConfig,
    providerType: args.providerType,
    effectiveProviderType: args.effectiveProviderType,
    providerOptionsKey: args.providerOptionsKey,
    openaiCompatibleProviderKey: args.openaiCompatibleProviderKey,
    modelConfig: undefined,
    resolvedModelMeta,
    featureKeys: new Set(resolvedModelMeta.features.map((feature) => String(feature || '').trim().toLowerCase())),
    providerContract: resolveProviderContract({
      providerId: args.providerConfig.id,
      providerType: args.providerType,
      effectiveProviderType: args.effectiveProviderType,
      transportProtocol: resolvedModelMeta.transportProtocol,
    }),
  }
}

/**
 * 测试辅助函数：`makeParams`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeParams(overrides: Partial<ModelCallParamsBase> = {}): ModelCallParamsBase {
  return {
    model: 'test/model',
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 64,
    ...overrides,
  }
}

/**
 * 为指定上下文构建一份最小 `ModelCallParamsBase`。
 *
 * @param ctx - 当前 stream context。
 * @param overrides - 需要覆盖的字段。
 * @returns 与上下文模型一致的参数对象。
 */
function makeParamsForContext(
  ctx: Pick<StreamContext, 'providerId' | 'modelId'>,
  overrides: Partial<ModelCallParamsBase> = {},
): ModelCallParamsBase {
  return makeParams({
    model: `${ctx.providerId}/${ctx.modelId}`,
    ...overrides,
  })
}

/**
 * 用 provider-aware helper 生成当前上下文对应的推理 `modelParams`。
 *
 * @param ctx - 当前 stream context。
 * @param value - 结构化推理值。
 * @returns 对应 provider/model 的原生 `modelParams`。
 */
function makeReasoningModelParams(
  ctx: Pick<StreamContext, 'providerId' | 'modelId' | 'resolvedModelMeta'>,
  value: 'off' | 'on' | 'default' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'adaptive' | 'max',
): Record<string, unknown> | undefined {
  return buildModelParamsWithProviderReasoning({
    model: `${ctx.providerId}/${ctx.modelId}`,
    transportProtocol: ctx.resolvedModelMeta.transportProtocol,
    draft: { value },
  })
}

describe('buildProviderOptions', () => {
  beforeEach(() => {
    isKnownUnsupportedOpenAiResponsesStoreTargetMock.mockReset()
    isKnownUnsupportedOpenAiResponsesStoreTargetMock.mockResolvedValue(false)
  })

  it('会把未核验 openai-compatible provider 的高阶字段全部过滤掉', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'moonshot',
        name: 'Moonshot',
        type: 'openai',
        serviceTier: 'priority',
        verbosity: 'high',
      }),
      providerType: 'openai',
      effectiveProviderType: 'openai',
      providerOptionsKey: 'moonshot',
      openaiCompatibleProviderKey: 'moonshot',
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx, {
          enableWebSearch: true,
          modelParams: {
            reasoning_effort: 'high',
          },
        }),
      ),
    ).resolves.toBeUndefined()
  })

  it('OpenRouter 只保留官方 reasoning 对象，旧 plugins 与 web_search_options 不再进入 providerOptions', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'openrouter',
        name: 'OpenRouter',
        type: 'openai',
        serviceTier: 'priority',
        verbosity: 'high',
      }),
      providerType: 'openai',
      effectiveProviderType: 'openai',
      providerOptionsKey: 'openrouter',
      openaiCompatibleProviderKey: 'openrouter',
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx, {
          enableWebSearch: true,
          modelParams: {
            service_tier: 'priority',
            plugins: [{ id: 'other', max_results: 1 }],
            reasoning: {
              effort: 'none',
              exclude: true,
            },
            web_search_options: { force: true },
          },
        }),
      ),
    ).resolves.toEqual({
      openrouter: {
        reasoning: {
          effort: 'none',
          exclude: true,
        },
      },
    })
  })

  it('OpenRouter 在没有 modelParams.reasoning 时，不会凭空构造 reasoning 对象', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'openrouter',
        name: 'OpenRouter',
        type: 'openai',
      }),
      providerType: 'openai',
      effectiveProviderType: 'openai',
      providerOptionsKey: 'openrouter',
      openaiCompatibleProviderKey: 'openrouter',
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx),
      ),
    ).resolves.toBeUndefined()
  })

  it('OpenRouter 显式 supportedParameters 会继续过滤 providerOptions 原生字段', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'openrouter',
        name: 'OpenRouter',
        type: 'openai',
      }),
      providerType: 'openai',
      effectiveProviderType: 'openai',
      providerOptionsKey: 'openrouter',
      openaiCompatibleProviderKey: 'openrouter',
      resolvedModelMeta: makeResolvedModelMeta({
        supportedParameters: ['reasoning'],
      }),
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx, {
          enableWebSearch: true,
          modelParams: {
            reasoning: { effort: 'high' },
            plugins: [{ id: 'web', max_results: 5 }],
          },
        }),
      ),
    ).resolves.toEqual({
      openrouter: {
        reasoning: { effort: 'high' },
      },
    })
  })

  it('保留 Azure OpenAI 已确认的 providerOptions', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'azure-openai',
        name: 'Azure OpenAI',
        type: 'azure-openai',
        apiHost: 'https://example-resource.openai.azure.com/openai/deployments/demo',
        apiVersion: '2025-03-01-preview',
        serviceTier: 'priority',
        verbosity: 'high',
      }),
      providerType: 'azure-openai',
      effectiveProviderType: 'azure-openai',
      providerOptionsKey: 'azure-openai',
      openaiCompatibleProviderKey: 'azure-openai',
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx, {
          enableWebSearch: true,
          modelParams: { reasoning_effort: 'high' },
        }),
      ),
    ).resolves.toEqual({
      'azure-openai': {
        service_tier: 'priority',
        textVerbosity: 'high',
        reasoningEffort: 'high',
      },
    })
  })

  it('保留官方 OpenAI Responses 已确认的 providerOptions', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'openai',
        name: 'OpenAI',
        type: 'openai-response',
        serviceTier: 'flex',
        verbosity: 'medium',
      }),
      providerType: 'openai-response',
      effectiveProviderType: 'openai-response',
      providerOptionsKey: 'openai',
      openaiCompatibleProviderKey: null,
      resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'openai-responses' }),
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx, {
          enableWebSearch: true,
          modelParams: { reasoning: { effort: 'high' } },
        }),
      ),
    ).resolves.toEqual({
      openai: {
        systemMessageMode: 'system',
        serviceTier: 'flex',
        store: false,
        textVerbosity: 'medium',
        reasoningEffort: 'high',
      },
    })
  })

  it('OpenAI Responses 注入 MCP 工具后会把 store 设为 true', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'openai',
        name: 'OpenAI',
        type: 'openai-response',
      }),
      providerType: 'openai-response',
      effectiveProviderType: 'openai-response',
      providerOptionsKey: 'openai',
      openaiCompatibleProviderKey: null,
      resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'openai-responses' }),
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx),
        undefined,
        { hasInjectedMcpTools: true },
      ),
    ).resolves.toEqual({
      openai: {
        systemMessageMode: 'system',
        store: true,
      },
    })
  })

  it('modelParams.store 不能覆盖 OpenAI Responses 自动 store 策略', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'openai',
        name: 'OpenAI',
        type: 'openai-response',
      }),
      providerType: 'openai-response',
      effectiveProviderType: 'openai-response',
      providerOptionsKey: 'openai',
      openaiCompatibleProviderKey: null,
      resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'openai-responses' }),
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx, {
          modelParams: { store: true },
        }),
        undefined,
        { hasInjectedMcpTools: false },
      ),
    ).resolves.toEqual({
      openai: {
        systemMessageMode: 'system',
        store: false,
      },
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx, {
          modelParams: { store: false },
        }),
        undefined,
        { hasInjectedMcpTools: true },
      ),
    ).resolves.toEqual({
      openai: {
        systemMessageMode: 'system',
        store: true,
      },
    })
  })

  it('new-api 路由到 OpenAI Responses 时遵循同一自动 store 策略', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'new-api',
        name: 'NewAPI',
        type: 'new-api',
      }),
      providerType: 'new-api',
      effectiveProviderType: 'openai-response',
      providerOptionsKey: 'openai',
      openaiCompatibleProviderKey: null,
      resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'openai-responses' }),
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx),
        undefined,
        { hasInjectedMcpTools: true },
      ),
    ).resolves.toEqual({
      openai: {
        systemMessageMode: 'system',
        store: true,
      },
    })
  })

  it('gateway 路由到 OpenAI Responses 时透传 openai.store', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'vercel-ai-gateway',
        name: 'Gateway',
        type: 'gateway',
      }),
      providerType: 'gateway',
      effectiveProviderType: 'gateway',
      providerOptionsKey: 'gateway',
      openaiCompatibleProviderKey: null,
      resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'openai-responses' }),
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx),
        undefined,
        { hasInjectedMcpTools: true },
      ),
    ).resolves.toEqual({
      openai: {
        store: true,
      },
    })
  })

  it('xAI Responses 即使注入 MCP 工具，也不会注入 OpenAI store', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'xai',
        name: 'xAI',
        type: 'xai',
      }),
      providerType: 'xai',
      effectiveProviderType: 'xai',
      providerOptionsKey: 'xai',
      openaiCompatibleProviderKey: null,
      resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'openai-responses' }),
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx),
        undefined,
        { hasInjectedMcpTools: true },
      ),
    ).resolves.toBeUndefined()
  })

  it('把 SiliconFlow 的统一推理档位映射为 enable_thinking', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'siliconflow',
        name: 'SiliconFlow',
        type: 'siliconflow',
      }),
      providerType: 'siliconflow',
      effectiveProviderType: 'siliconflow',
      providerOptionsKey: 'siliconflow',
      openaiCompatibleProviderKey: 'siliconflow',
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx, {
          modelParams: makeReasoningModelParams(ctx, 'on'),
        }),
      ),
    ).resolves.toEqual({
      siliconflow: {
        enable_thinking: true,
      },
    })
  })

  it('把 DeepSeek 的统一推理档位映射为 thinking 开关', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'deepseek',
        name: 'DeepSeek',
        type: 'deepseek',
      }),
      providerType: 'deepseek',
      effectiveProviderType: 'deepseek',
      providerOptionsKey: 'deepseek',
      openaiCompatibleProviderKey: null,
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx, {
          modelParams: makeReasoningModelParams(ctx, 'on'),
        }),
      ),
    ).resolves.toEqual({
      deepseek: {
        thinking: {
          type: 'enabled',
        },
      },
    })
  })

  it('保留 xAI multi-agent Responses 已确认的 medium reasoning 配置', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'xai',
        name: 'xAI',
        type: 'xai',
      }),
      providerType: 'xai',
      effectiveProviderType: 'xai',
      providerOptionsKey: 'xai',
      openaiCompatibleProviderKey: null,
      modelId: 'grok-4.20-multi-agent',
      resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'openai-responses' }),
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx, {
          modelParams: { reasoning: { effort: 'medium' } },
        }),
      ),
    ).resolves.toEqual({
      xai: {
        reasoningEffort: 'medium',
      },
    })
  })

  it('保留 xAI grok-3-mini 已识别的 high 推理档位', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'xai',
        name: 'xAI',
        type: 'xai',
      }),
      providerType: 'xai',
      effectiveProviderType: 'xai',
      providerOptionsKey: 'xai',
      openaiCompatibleProviderKey: null,
      modelId: 'grok-3-mini',
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx, {
          modelParams: { reasoning_effort: 'high' },
        }),
      ),
    ).resolves.toEqual({
      xai: {
        reasoningEffort: 'high',
      },
    })
  })

  it('不会把 xAI reasoning 参数发给当前不支持的模型族', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'xai',
        name: 'xAI',
        type: 'xai',
      }),
      providerType: 'xai',
      effectiveProviderType: 'xai',
      providerOptionsKey: 'xai',
      openaiCompatibleProviderKey: null,
      modelId: 'grok-4-fast',
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx, {
          modelParams: { reasoning_effort: 'high' },
        }),
      ),
    ).resolves.toBeUndefined()
  })

  it('把 Groq Qwen 3 的统一推理档位退化为 default', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'groq',
        name: 'Groq',
        type: 'groq',
      }),
      providerType: 'groq',
      effectiveProviderType: 'groq',
      providerOptionsKey: 'groq',
      openaiCompatibleProviderKey: null,
      modelId: 'qwen/qwen3-32b',
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx, {
          modelParams: { reasoning_effort: 'default' },
        }),
      ),
    ).resolves.toEqual({
      groq: {
        reasoningEffort: 'default',
      },
    })
  })

  it('不会把 Groq reasoning 参数发给当前不支持 reasoning 的模型', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'groq',
        name: 'Groq',
        type: 'groq',
      }),
      providerType: 'groq',
      effectiveProviderType: 'groq',
      providerOptionsKey: 'groq',
      openaiCompatibleProviderKey: null,
      modelId: 'llama-3.3-70b-versatile',
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx, {
          modelParams: { reasoning_effort: 'high' },
        }),
      ),
    ).resolves.toBeUndefined()
  })

  it('把 Ollama GPT-OSS 的统一推理档位映射为 think 等级', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'ollama',
        name: 'Ollama',
        type: 'ollama',
      }),
      providerType: 'ollama',
      effectiveProviderType: 'ollama',
      providerOptionsKey: 'ollama',
      openaiCompatibleProviderKey: 'ollama',
      modelId: 'gpt-oss:20b',
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx, {
          modelParams: makeReasoningModelParams(ctx, 'high'),
        }),
      ),
    ).resolves.toEqual({
      ollama: {
        think: 'high',
      },
    })
  })

  it('把 Ollama 其它 thinking 模型的统一推理档位映射为 think 布尔开关', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'ollama',
        name: 'Ollama',
        type: 'ollama',
      }),
      providerType: 'ollama',
      effectiveProviderType: 'ollama',
      providerOptionsKey: 'ollama',
      openaiCompatibleProviderKey: 'ollama',
      modelId: 'qwen3:14b',
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx, {
          modelParams: makeReasoningModelParams(ctx, 'on'),
        }),
      ),
    ).resolves.toEqual({
      ollama: {
        think: true,
      },
    })
  })

  it('允许通过 modelParams 向非 openai-compatible provider 透传原生 reasoning 配置', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'aws-bedrock',
        name: 'AWS Bedrock',
        type: 'aws-bedrock',
      }),
      providerType: 'aws-bedrock',
      effectiveProviderType: 'aws-bedrock',
      providerOptionsKey: 'bedrock',
      openaiCompatibleProviderKey: null,
      resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'bedrock-converse' }),
    })

    await expect(
      buildProviderOptions(
        ctx,
        makeParamsForContext(ctx, {
          modelParams: {
            reasoningConfig: {
              maxReasoningEffort: 'high',
            },
          },
        }),
      ),
    ).resolves.toEqual({
      bedrock: {
        reasoningConfig: {
          maxReasoningEffort: 'high',
        },
      },
    })
  })
})

describe('buildCallSettings', () => {
  it('OpenRouter GPT-5.4 显式 supportedParameters 会剔除 sampling/penalties/stop 并保留 max tokens 与 seed', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'openrouter',
        name: 'OpenRouter',
        type: 'openai',
      }),
      providerType: 'openai',
      effectiveProviderType: 'openai',
      providerOptionsKey: 'openrouter',
      openaiCompatibleProviderKey: 'openrouter',
      modelId: 'openai/gpt-5.4',
      resolvedModelMeta: makeResolvedModelMeta({
        supportedParameters: ['max_tokens', 'max_completion_tokens', 'reasoning', 'seed', 'tools', 'tool_choice'],
      }),
    })

    await expect(
      buildCallSettings(
        ctx,
        makeParamsForContext(ctx, {
          temperature: 0.2,
          topP: 0.8,
          maxTokens: 128,
          modelParams: {
            presence_penalty: 0.1,
            frequency_penalty: 0.2,
            seed: 42,
            stop: ['END'],
          },
        }),
      ),
    ).resolves.toEqual({
      maxOutputTokens: 128,
      seed: 42,
    })
  })

  it('OpenRouter GPT-4 显式 supportedParameters 会保留采样、penalties、seed 与 stop', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'openrouter',
        name: 'OpenRouter',
        type: 'openai',
      }),
      providerType: 'openai',
      effectiveProviderType: 'openai',
      providerOptionsKey: 'openrouter',
      openaiCompatibleProviderKey: 'openrouter',
      modelId: 'openai/gpt-4',
      resolvedModelMeta: makeResolvedModelMeta({
        supportedParameters: [
          'temperature',
          'top_p',
          'max_tokens',
          'presence_penalty',
          'frequency_penalty',
          'seed',
          'stop',
        ],
      }),
    })

    await expect(
      buildCallSettings(
        ctx,
        makeParamsForContext(ctx, {
          temperature: 0.2,
          topP: 0.8,
          maxTokens: 128,
          modelParams: {
            presence_penalty: 0.1,
            frequency_penalty: 0.2,
            seed: 42,
            stop: 'END',
          },
        }),
      ),
    ).resolves.toEqual({
      temperature: 0.2,
      topP: 0.8,
      maxOutputTokens: 128,
      presencePenalty: 0.1,
      frequencyPenalty: 0.2,
      seed: 42,
      stopSequences: ['END'],
    })
  })

  it('自定义 OpenAI-compatible 无显式 supportedParameters 时不会按 gpt 名称裁剪', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'custom-openai',
        name: 'Custom OpenAI',
        type: 'openai',
      }),
      providerType: 'openai',
      effectiveProviderType: 'openai',
      providerOptionsKey: 'custom-openai',
      openaiCompatibleProviderKey: 'custom-openai',
      modelId: 'gpt-5.4',
    })

    await expect(
      buildCallSettings(
        ctx,
        makeParamsForContext(ctx, {
          temperature: 0.2,
          topP: 0.8,
          maxTokens: 128,
          modelParams: {
            presence_penalty: 0.1,
            frequency_penalty: 0.2,
            seed: 42,
            stop: ['END'],
          },
        }),
      ),
    ).resolves.toEqual({
      temperature: 0.2,
      topP: 0.8,
      maxOutputTokens: 128,
      presencePenalty: 0.1,
      frequencyPenalty: 0.2,
      seed: 42,
      stopSequences: ['END'],
    })
  })

  it('OpenAI Responses 的 gpt-5.4 在显式 high reasoning 下不会再下发 temperature/topP', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'openai',
        name: 'OpenAI',
        type: 'openai-response',
      }),
      providerType: 'openai-response',
      effectiveProviderType: 'openai-response',
      providerOptionsKey: 'openai',
      openaiCompatibleProviderKey: null,
      modelId: 'gpt-5.4',
      resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'openai-responses' }),
    })

    await expect(
      buildCallSettings(
        ctx,
        makeParamsForContext(ctx, {
          temperature: 0.2,
          topP: 0.8,
          maxTokens: 128,
          modelParams: makeReasoningModelParams(ctx, 'high'),
        }),
      ),
    ).resolves.toEqual({
      maxOutputTokens: 128,
    })
  })

  it('OpenAI Responses 的 gpt-5.4 在未显式设置 reasoning=none 时也不会下发 temperature/topP', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'openai',
        name: 'OpenAI',
        type: 'openai-response',
      }),
      providerType: 'openai-response',
      effectiveProviderType: 'openai-response',
      providerOptionsKey: 'openai',
      openaiCompatibleProviderKey: null,
      modelId: 'gpt-5.4',
      resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'openai-responses' }),
    })

    await expect(
      buildCallSettings(
        ctx,
        makeParamsForContext(ctx, {
          temperature: 0.4,
          topP: 0.95,
          maxTokens: 96,
        }),
      ),
    ).resolves.toEqual({
      maxOutputTokens: 96,
    })
  })

  it('OpenAI Responses 的 gpt-5.4 只有在显式 reasoning=none 时才保留 temperature/topP', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'openai',
        name: 'OpenAI',
        type: 'openai-response',
      }),
      providerType: 'openai-response',
      effectiveProviderType: 'openai-response',
      providerOptionsKey: 'openai',
      openaiCompatibleProviderKey: null,
      modelId: 'gpt-5.4',
      resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'openai-responses' }),
    })

    await expect(
      buildCallSettings(
        ctx,
        makeParamsForContext(ctx, {
          temperature: 0.6,
          topP: 0.7,
          maxTokens: 192,
          modelParams: makeReasoningModelParams(ctx, 'none'),
        }),
      ),
    ).resolves.toEqual({
      temperature: 0.6,
      topP: 0.7,
      maxOutputTokens: 192,
    })
  })
})

describe('buildRuntimeCallPlan', () => {
  beforeEach(() => {
    isKnownUnsupportedOpenAiResponsesStoreTargetMock.mockReset()
    isKnownUnsupportedOpenAiResponsesStoreTargetMock.mockResolvedValue(false)
  })

  it('OpenAI Responses runtime plan 由 adapter 声明 system prompt 提升策略', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'openai',
        name: 'OpenAI',
        type: 'openai-response',
      }),
      providerType: 'openai-response',
      effectiveProviderType: 'openai-response',
      providerOptionsKey: 'openai',
      openaiCompatibleProviderKey: null,
      resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'openai-responses' }),
    })

    const plan = await buildRuntimeCallPlan(
      ctx,
      makeParamsForContext(ctx),
      undefined,
      { languageModel: {} as never },
    )

    expect(plan.requestShapePolicy).toEqual({
      systemPrompt: {
        target: 'provider-options-instructions',
        providerOptionsKey: 'openai',
        instructionsKey: 'instructions',
        systemMessageMode: 'remove',
      },
    })
  })

  it('NewAPI 路由到 OpenAI Responses 时复用同一 request shape policy', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'new-api',
        name: 'NewAPI',
        type: 'new-api',
      }),
      providerType: 'new-api',
      effectiveProviderType: 'openai-response',
      providerOptionsKey: 'openai',
      openaiCompatibleProviderKey: null,
      resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'openai-responses' }),
    })

    const plan = await buildRuntimeCallPlan(
      ctx,
      makeParamsForContext(ctx),
      undefined,
      { languageModel: {} as never },
    )

    expect(plan.requestShapePolicy?.systemPrompt?.providerOptionsKey).toBe('openai')
  })

  it('Gateway 只有显式 openai provider slug 的 Responses 模型才声明 instructions 策略', async () => {
    const openaiGatewayCtx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'vercel-ai-gateway',
        name: 'Gateway',
        type: 'gateway',
      }),
      providerType: 'gateway',
      effectiveProviderType: 'gateway',
      providerOptionsKey: 'gateway',
      openaiCompatibleProviderKey: null,
      modelId: 'openai/gpt-5.4',
      resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'openai-responses' }),
    })
    const nonOpenAiGatewayCtx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'vercel-ai-gateway',
        name: 'Gateway',
        type: 'gateway',
      }),
      providerType: 'gateway',
      effectiveProviderType: 'gateway',
      providerOptionsKey: 'gateway',
      openaiCompatibleProviderKey: null,
      modelId: 'xai/grok-4',
      resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'openai-responses' }),
    })

    await expect(
      buildRuntimeCallPlan(
        openaiGatewayCtx,
        makeParamsForContext(openaiGatewayCtx),
        undefined,
        { languageModel: {} as never },
      ),
    ).resolves.toMatchObject({
      requestShapePolicy: {
        systemPrompt: {
          providerOptionsKey: 'openai',
          instructionsKey: 'instructions',
          systemMessageMode: 'remove',
        },
      },
    })

    await expect(
      buildRuntimeCallPlan(
        nonOpenAiGatewayCtx,
        makeParamsForContext(nonOpenAiGatewayCtx),
        undefined,
        { languageModel: {} as never },
      ),
    ).resolves.not.toHaveProperty('requestShapePolicy')
  })

  it('OpenAI-compatible GPT 模型和 xAI Responses 不声明 OpenAI instructions 策略', async () => {
    const customOpenAiCtx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'custom-openai',
        name: 'Custom OpenAI Compatible',
        type: 'openai',
      }),
      providerType: 'openai',
      effectiveProviderType: 'openai',
      providerOptionsKey: 'custom-openai',
      openaiCompatibleProviderKey: 'custom-openai',
      modelId: 'gpt-5.4',
      resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'openai-chat' }),
    })
    const xaiCtx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'xai',
        name: 'xAI',
        type: 'xai',
      }),
      providerType: 'xai',
      effectiveProviderType: 'xai',
      providerOptionsKey: 'xai',
      openaiCompatibleProviderKey: null,
      modelId: 'grok-4',
      resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'openai-responses' }),
    })

    await expect(
      buildRuntimeCallPlan(
        customOpenAiCtx,
        makeParamsForContext(customOpenAiCtx),
        undefined,
        { languageModel: {} as never },
      ),
    ).resolves.not.toHaveProperty('requestShapePolicy')

    await expect(
      buildRuntimeCallPlan(
        xaiCtx,
        makeParamsForContext(xaiCtx),
        undefined,
        { languageModel: {} as never },
      ),
    ).resolves.not.toHaveProperty('requestShapePolicy')
  })

  it('只把 mcp__ 前缀工具视为 MCP 注入，并在 OpenAI Responses 上显式关闭非 MCP 场景的 store', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'openai',
        name: 'OpenAI',
        type: 'openai-response',
      }),
      providerType: 'openai-response',
      effectiveProviderType: 'openai-response',
      providerOptionsKey: 'openai',
      openaiCompatibleProviderKey: null,
      resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'openai-responses' }),
    })

    const plan = await buildRuntimeCallPlan(
      ctx,
      makeParamsForContext(ctx),
      {
        builtin__web_search: {},
        memory__save_context: {},
        other_tool: {},
      },
      { languageModel: {} as never },
    )

    expect(plan.hasInjectedMcpTools).toBe(false)
    expect(plan.openAiResponsesStoreAutoStrategyApplied).toBe(true)
    expect(plan.openAiResponsesStoreValue).toBe(false)
    expect(plan.providerOptions).toEqual({
      openai: {
        systemMessageMode: 'system',
        store: false,
      },
    })
  })

  it('命中 mcp__ 前缀工具时，会在 OpenAI Responses 上自动开启 store', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'openai',
        name: 'OpenAI',
        type: 'openai-response',
      }),
      providerType: 'openai-response',
      effectiveProviderType: 'openai-response',
      providerOptionsKey: 'openai',
      openaiCompatibleProviderKey: null,
      resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'openai-responses' }),
    })

    const plan = await buildRuntimeCallPlan(
      ctx,
      makeParamsForContext(ctx),
      {
        mcp__amap__search: {},
        builtin__web_search: {},
      },
      { languageModel: {} as never },
    )

    expect(plan.hasInjectedMcpTools).toBe(true)
    expect(plan.openAiResponsesStoreAutoStrategyApplied).toBe(true)
    expect(plan.openAiResponsesStoreKnownUnsupported).toBe(false)
    expect(plan.openAiResponsesStoreValue).toBe(true)
    expect(plan.providerOptions).toEqual({
      openai: {
        systemMessageMode: 'system',
        store: true,
      },
    })
  })

  it('显式缺少 tools 时 runtime plan 不把 MCP 工具视为可注入能力', async () => {
    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'openrouter',
        name: 'OpenRouter',
        type: 'openai',
      }),
      providerType: 'openai',
      effectiveProviderType: 'openai',
      providerOptionsKey: 'openrouter',
      openaiCompatibleProviderKey: 'openrouter',
      resolvedModelMeta: makeResolvedModelMeta({
        supportedParameters: ['max_tokens', 'reasoning'],
      }),
    })

    const plan = await buildRuntimeCallPlan(
      ctx,
      makeParamsForContext(ctx),
      {
        mcp__amap__search: {},
      },
      { languageModel: {} as never },
    )

    expect(plan.toolParameterSupport).toEqual({ tools: false, toolChoice: false })
    expect(plan.hasInjectedMcpTools).toBe(false)
  })

  it('已知当前端点不支持 OpenAI Responses store 时，会稳定关闭首步 store', async () => {
    isKnownUnsupportedOpenAiResponsesStoreTargetMock.mockResolvedValue(true)

    const ctx = makeStreamContext({
      providerConfig: makeProviderConfig({
        id: 'openai',
        name: 'OpenAI',
        type: 'openai-response',
        apiHost: 'https://gateway.example.com/v1',
      }),
      providerType: 'openai-response',
      effectiveProviderType: 'openai-response',
      providerOptionsKey: 'openai',
      openaiCompatibleProviderKey: null,
      resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'openai-responses' }),
    })

    const plan = await buildRuntimeCallPlan(
      ctx,
      makeParamsForContext(ctx),
      {
        mcp__amap__search: {},
      },
      { languageModel: {} as never },
    )

    expect(plan.hasInjectedMcpTools).toBe(true)
    expect(plan.openAiResponsesStoreAutoStrategyApplied).toBe(true)
    expect(plan.openAiResponsesStoreKnownUnsupported).toBe(true)
    expect(plan.openAiResponsesStoreValue).toBe(false)
    expect(plan.providerOptions).toEqual({
      openai: {
        systemMessageMode: 'system',
        store: false,
      },
    })
  })
})
