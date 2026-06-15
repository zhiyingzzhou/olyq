/**
 * 说明：`stream-chat.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `stream-chat.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 单元测试：streamChat 的编排与事件输出。
 *
 * 覆盖：
 * - 输入约束校验（例如 provider 不支持 array content/multimodal）；
 * - Gemini inline image 的执行模式选择（generateText vs streamText）；
 * - 事件序列（chat/file、chat/error、chat/done 等）的稳定性。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APICallError, RetryError } from 'ai'

const {
  rememberUnsupportedOpenAiResponsesStoreTargetMock,
} = vi.hoisted(() => ({
  rememberUnsupportedOpenAiResponsesStoreTargetMock: vi.fn(async () => undefined),
}))

vi.mock('./openai-responses-store-capability', () => ({
  rememberUnsupportedOpenAiResponsesStoreTarget: rememberUnsupportedOpenAiResponsesStoreTargetMock,
}))

import { streamChat, type StreamChatDeps, type StreamChatEvent } from './stream-chat'
import type { ChatStreamParams, ProviderConfig } from './types'
import type { ResolvedModelMeta } from './model-registry'
import { resolveProviderContract } from './providers/provider-contracts'
import { OPENROUTER_NATIVE_WEB_SEARCH_SENTINEL } from './native-web-search-constants'

type StreamChatTestDeps = Partial<StreamChatDeps>

/**
 * 测试辅助函数：`makeParams`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeParams(overrides?: Partial<ChatStreamParams>): ChatStreamParams {
  return {
    model: 'test/m',
    messages: [],
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 64,
    ...overrides,
  }
}

/**
 * 测试辅助函数：`makeProviderConfig`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeProviderConfig(overrides?: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: 'test',
    name: 'test',
    type: 'openai',
    apiKey: '',
    apiHost: '',
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
function makeResolvedModelMeta(overrides?: Partial<ResolvedModelMeta>): ResolvedModelMeta {
  return {
    canonicalId: 'public::test::m',
    baseModelKey: 'm',
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
 * 测试辅助函数：`makeProviderContract`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeProviderContract(args?: {
  providerId?: string
  providerType?: ProviderConfig['type']
  effectiveProviderType?: ProviderConfig['type']
  transportProtocol?: ResolvedModelMeta['transportProtocol']
}) {
  return resolveProviderContract({
    providerId: args?.providerId ?? 'test',
    providerType: args?.providerType,
    effectiveProviderType: args?.effectiveProviderType,
    transportProtocol: args?.transportProtocol,
  })
}

/**
 * 测试辅助函数：`makeRuntimeCallPlan`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeRuntimeCallPlan(overrides?: Partial<Awaited<ReturnType<NonNullable<StreamChatDeps['buildRuntimeCallPlan']>>>>) {
  return {
    context: {} as never,
    languageModel: {} as never,
    providerOptions: undefined,
    callSettings: {},
    middlewares: [],
    executionMode: 'streamText' as const,
    wantsInlineImage: false,
    supportsInlineImage: false,
    hasInjectedMcpTools: false,
    toolParameterSupport: { tools: true, toolChoice: true },
    openAiResponsesStoreAutoStrategyApplied: false,
    openAiResponsesStoreKnownUnsupported: false,
    openAiResponsesStoreValue: undefined,
    ...overrides,
  }
}

/**
 * 测试辅助函数：`makeAbortError`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeAbortError(message = 'The operation was aborted.') {
  return Object.assign(new Error(message), { name: 'AbortError' })
}

describe('streamChat', () => {
  beforeEach(() => {
    rememberUnsupportedOpenAiResponsesStoreTargetMock.mockReset()
    rememberUnsupportedOpenAiResponsesStoreTargetMock.mockResolvedValue(undefined)
  })

  it('主聊天 streamText 请求会禁用 AI SDK 隐式重试', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()
    const streamTextMock = vi.fn((callArgs: Record<string, unknown>) => ({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'ok' }
        yield {
          type: 'finish-step',
          response: {},
          usage: { inputTokens: 1, outputTokens: 1 },
          finishReason: 'stop',
          rawFinishReason: 'stop',
          providerMetadata: {},
        }
      })(),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      steps: Promise.resolve([]),
      callArgs,
    }))

    await streamChat({
      requestId: 'r-no-ai-sdk-retry-stream',
      params: makeParams({ messages: [{ role: 'user', content: 'hello' }] }),
      onEvent: (event) => events.push(event),
      signal: controller.signal,
      deps: {
        resolveStreamContext: async () => ({
          providerId: 'openai',
          modelId: 'm',
          providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI', type: 'openai' }),
          providerType: 'openai',
          effectiveProviderType: 'openai',
          providerOptionsKey: 'openai',
          openaiCompatibleProviderKey: null,
          modelConfig: undefined,
          resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'], transportProtocol: 'openai-chat' }),
          featureKeys: new Set<string>(),
          providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
        }),
        buildRuntimeCallPlan: async () => makeRuntimeCallPlan(),
        streamText: streamTextMock as unknown as StreamChatDeps['streamText'],
        generateText: async () => {
          throw new Error('generateText should not be called')
        },
      },
    })

    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect(streamTextMock.mock.calls[0]?.[0]).toMatchObject({
      maxRetries: 0,
      experimental_transform: expect.any(Function),
    })
    expect(events.map((event) => event.type)).toEqual(['chat/delta', 'chat/done'])
  })

  it('OpenRouter 模型内置联网搜索在 runtime plan 前注入 raw server tool providerOptions patch', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()
    const buildRuntimeCallPlanMock = vi.fn(async () => makeRuntimeCallPlan())
    const streamTextMock = vi.fn(() => ({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'ok' }
        yield {
          type: 'finish-step',
          response: {},
          usage: { inputTokens: 1, outputTokens: 1 },
          finishReason: 'stop',
          rawFinishReason: 'stop',
          providerMetadata: {},
        }
      })(),
      steps: Promise.resolve([]),
    }))

    await streamChat({
      requestId: 'r-openrouter-native-search',
      params: makeParams({
        model: 'openrouter/openai/gpt-5.4',
        enableWebSearch: true,
        messages: [{ role: 'user', content: 'latest news' }],
      }),
      onEvent: (event) => events.push(event),
      signal: controller.signal,
      deps: {
        resolveStreamContext: async () => ({
          providerId: 'openrouter',
          modelId: 'openai/gpt-5.4',
          providerConfig: makeProviderConfig({ id: 'openrouter', name: 'OpenRouter', type: 'openai' }),
          providerType: 'openai',
          effectiveProviderType: 'openai',
          providerOptionsKey: 'openrouter',
          openaiCompatibleProviderKey: 'openrouter',
          modelConfig: undefined,
          resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'], transportProtocol: 'openai-chat' }),
          featureKeys: new Set<string>(),
          providerContract: makeProviderContract({ providerId: 'openrouter', providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
        }),
        buildRuntimeCallPlan: buildRuntimeCallPlanMock as unknown as StreamChatDeps['buildRuntimeCallPlan'],
        streamText: streamTextMock as unknown as StreamChatDeps['streamText'],
        generateText: async () => {
          throw new Error('generateText should not be called')
        },
      },
    })

    expect(buildRuntimeCallPlanMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ enableWebSearch: true }),
      undefined,
      {
        providerOptionsPatch: {
          openrouter: {
            [OPENROUTER_NATIVE_WEB_SEARCH_SENTINEL]: true,
          },
        },
      },
    )
    expect(events.map((event) => event.type)).toEqual(['chat/delta', 'chat/done'])
  })

  it('AI SDK source stream part 会转成 chat/source 事件', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()

    await streamChat({
      requestId: 'r-source-part',
      params: makeParams({ messages: [{ role: 'user', content: 'cite source' }] }),
      onEvent: (event) => events.push(event),
      signal: controller.signal,
      deps: {
        resolveStreamContext: async () => ({
          providerId: 'perplexity',
          modelId: 'sonar-pro',
          providerConfig: makeProviderConfig({ id: 'perplexity', name: 'Perplexity', type: 'openai' }),
          providerType: 'openai',
          effectiveProviderType: 'openai',
          providerOptionsKey: 'perplexity',
          openaiCompatibleProviderKey: 'perplexity',
          modelConfig: undefined,
          resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'openai-chat' }),
          featureKeys: new Set(['native-web-search']),
          providerContract: makeProviderContract({ providerId: 'perplexity', providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
        }),
        buildRuntimeCallPlan: async () => makeRuntimeCallPlan(),
        streamText: (() => ({
          fullStream: (async function* () {
            yield { type: 'source', sourceType: 'url', id: 's1', url: 'https://example.com/a', title: 'Example' }
            yield { type: 'text-delta', text: 'answer' }
            yield {
              type: 'finish-step',
              response: {},
              usage: { inputTokens: 1, outputTokens: 1 },
              finishReason: 'stop',
              rawFinishReason: 'stop',
              providerMetadata: {},
            }
          })(),
          steps: Promise.resolve([]),
        })) as unknown as StreamChatDeps['streamText'],
        generateText: async () => {
          throw new Error('generateText should not be called')
        },
      },
    })

    expect(events).toContainEqual({
      type: 'chat/source',
      requestId: 'r-source-part',
      source: {
        title: 'Example',
        url: 'https://example.com/a',
        snippet: '',
      },
    })
    expect(events.map((event) => event.type)).toEqual(['chat/source', 'chat/delta', 'chat/done'])
  })

  it('主聊天 generateText 执行模式会禁用 AI SDK 隐式重试', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()
    const generateTextMock = vi.fn(async (_callArgs: Record<string, unknown>) =>
      ({
        text: 'ok',
        reasoningText: '',
        files: [],
        usage: { inputTokens: 1, outputTokens: 1 },
        request: { body: {} },
        response: { id: 'id', modelId: 'm', timestamp: 't', headers: {}, body: '{}' },
        finishReason: 'stop',
        rawFinishReason: 'stop',
        warnings: [],
        providerMetadata: {},
      }) as never,
    )

    await streamChat({
      requestId: 'r-no-ai-sdk-retry-generate-mode',
      params: makeParams({ messages: [{ role: 'user', content: 'hello' }] }),
      onEvent: (event) => events.push(event),
      signal: controller.signal,
      deps: {
        resolveStreamContext: async () => ({
          providerId: 'google',
          modelId: 'gemini-image',
          providerConfig: makeProviderConfig({ id: 'google', name: 'Google', type: 'gemini' }),
          providerType: 'gemini',
          effectiveProviderType: 'gemini',
          providerOptionsKey: 'google',
          openaiCompatibleProviderKey: null,
          modelConfig: undefined,
          resolvedModelMeta: makeResolvedModelMeta({
            kind: 'multimodal-chat',
            inputModalities: ['text'],
            outputModalities: ['text', 'image'],
            features: ['image-output'],
            transportProtocol: 'gemini-generate-content',
          }),
          featureKeys: new Set(['image-output']),
          providerContract: makeProviderContract({ providerId: 'google', providerType: 'gemini', effectiveProviderType: 'gemini', transportProtocol: 'gemini-generate-content' }),
        }),
        buildRuntimeCallPlan: async () => makeRuntimeCallPlan({
          executionMode: 'generateText',
          wantsInlineImage: true,
          supportsInlineImage: true,
        }),
        streamText: () => {
          throw new Error('streamText should not be called')
        },
        generateText: generateTextMock as unknown as StreamChatDeps['generateText'],
      },
    })

    expect(generateTextMock).toHaveBeenCalledTimes(1)
    expect(generateTextMock.mock.calls[0]?.[0]).toMatchObject({ maxRetries: 0 })
    expect(events.map((event) => event.type)).toEqual(['chat/delta', 'chat/done'])
  })

  it('主聊天 no text-delta generateText fallback 会禁用 AI SDK 隐式重试', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()
    const generateTextMock = vi.fn(async (_callArgs: Record<string, unknown>) =>
      ({
        text: 'fallback ok',
        reasoningText: '',
        files: [],
        usage: { inputTokens: 1, outputTokens: 1 },
        request: { body: {} },
        response: { id: 'id', modelId: 'm', timestamp: 't', headers: {}, body: '{}' },
        finishReason: 'stop',
        rawFinishReason: 'stop',
        warnings: [],
        providerMetadata: {},
      }) as never,
    )

    await streamChat({
      requestId: 'r-no-ai-sdk-retry-no-text-delta',
      params: makeParams({ messages: [{ role: 'user', content: 'hello' }] }),
      onEvent: (event) => events.push(event),
      signal: controller.signal,
      deps: {
        resolveStreamContext: async () => ({
          providerId: 'openai',
          modelId: 'm',
          providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI', type: 'openai' }),
          providerType: 'openai',
          effectiveProviderType: 'openai',
          providerOptionsKey: 'openai',
          openaiCompatibleProviderKey: null,
          modelConfig: { id: 'm', name: 'm', supportedTextDelta: false },
          resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'], transportProtocol: 'openai-chat' }),
          featureKeys: new Set<string>(),
          providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
        }),
        buildRuntimeCallPlan: async () => makeRuntimeCallPlan(),
        streamText: () => {
          throw new Error('streamText should not be called')
        },
        generateText: generateTextMock as unknown as StreamChatDeps['generateText'],
      },
    })

    expect(generateTextMock).toHaveBeenCalledTimes(1)
    expect(generateTextMock.mock.calls[0]?.[0]).toMatchObject({ maxRetries: 0 })
    expect(events.map((event) => event.type)).toEqual(['chat/delta', 'chat/done'])
  })

  it('debug 日志会带出 MCP 注入与 OpenAI Responses 自动 store 决策', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const controller = new AbortController()

    try {
      await streamChat({
        requestId: 'r-debug-store',
        params: makeParams({
          debug: true,
          messages: [{ role: 'user', content: 'hello' }],
        }),
        tools: { mcp__amap__search: {} } as never,
        onEvent: () => undefined,
        signal: controller.signal,
        deps: {
          resolveStreamContext: async () => ({
            providerId: 'openai',
            modelId: 'm',
            providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI', type: 'openai-response' }),
            providerType: 'openai-response',
            effectiveProviderType: 'openai-response',
            providerOptionsKey: 'openai',
            openaiCompatibleProviderKey: null,
            modelConfig: undefined,
            resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'], transportProtocol: 'openai-responses' }),
            featureKeys: new Set<string>(),
            providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai-response', effectiveProviderType: 'openai-response', transportProtocol: 'openai-responses' }),
          }),
          buildRuntimeCallPlan: async () => makeRuntimeCallPlan({
            hasInjectedMcpTools: true,
            openAiResponsesStoreAutoStrategyApplied: true,
            openAiResponsesStoreValue: true,
            providerOptions: {
              openai: {
                store: true,
              },
            } as never,
          }),
          streamText: (() => {
            throw new Error('streamText boom')
          }) as StreamChatDeps['streamText'],
          generateText: async () => {
            throw new Error('generateText should not be called')
          },
        },
      })

      expect(debugSpy).toHaveBeenCalledWith(
        '[chat]',
        'streamChat resolved',
        expect.objectContaining({
          hasInjectedMcpTools: true,
          openAiResponsesStoreAutoStrategyApplied: true,
          openAiResponsesStoreValue: true,
        }),
      )
    } finally {
      debugSpy.mockRestore()
    }
  })

  it('会把 OpenAI Responses 的非正文进度事件转成 chat/progress，而不是等到正文后才算流已开始', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()

    await streamChat({
      requestId: 'r-progress',
      params: makeParams({
        messages: [{ role: 'user', content: 'hello' }],
      }),
      onEvent: (event) => events.push(event),
      signal: controller.signal,
      deps: {
        resolveStreamContext: async () => ({
          providerId: 'openai',
          modelId: 'gpt-5.4',
          providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI', type: 'openai-response' }),
          providerType: 'openai-response',
          effectiveProviderType: 'openai-response',
          providerOptionsKey: 'openai',
          openaiCompatibleProviderKey: null,
          modelConfig: undefined,
          resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'], transportProtocol: 'openai-responses' }),
          featureKeys: new Set<string>(),
          providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai-response', effectiveProviderType: 'openai-response', transportProtocol: 'openai-responses' }),
        }),
        buildRuntimeCallPlan: async () => makeRuntimeCallPlan(),
        streamText: (() => ({
          fullStream: (async function* () {
            yield {
              type: 'reasoning-start',
              id: 'rs_1:0',
            }
            yield {
              type: 'text-delta',
              text: 'ok',
            }
            yield {
              type: 'finish-step',
              response: {},
              usage: { inputTokens: 1, outputTokens: 1 },
              finishReason: 'stop',
              rawFinishReason: 'stop',
              providerMetadata: {},
            }
          })(),
          usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
          steps: Promise.resolve([]),
        })) as unknown as StreamChatDeps['streamText'],
        generateText: async () => {
          throw new Error('generateText should not be called')
        },
      },
    })

    expect(events.map((event) => event.type)).toEqual([
      'chat/progress',
      'chat/delta',
      'chat/done',
    ])
    expect(events[0]).toMatchObject({
      type: 'chat/progress',
      stage: 'reasoning-start',
    })
  })

  it('OpenAI Responses 流式请求即使未开启 debug，也会内部启用 raw chunks', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()
    let receivedIncludeRawChunks: unknown

    await streamChat({
      requestId: 'r-openai-responses-raw-default',
      params: makeParams({
        messages: [{ role: 'user', content: 'hello' }],
      }),
      onEvent: event => events.push(event),
      signal: controller.signal,
      deps: {
        resolveStreamContext: async () => ({
          providerId: 'openai',
          modelId: 'gpt-5.4',
          providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI', type: 'openai-response' }),
          providerType: 'openai-response',
          effectiveProviderType: 'openai-response',
          providerOptionsKey: 'openai',
          openaiCompatibleProviderKey: null,
          modelConfig: undefined,
          resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'], transportProtocol: 'openai-responses' }),
          featureKeys: new Set<string>(),
          providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai-response', effectiveProviderType: 'openai-response', transportProtocol: 'openai-responses' }),
        }),
        buildRuntimeCallPlan: async () => makeRuntimeCallPlan(),
        streamText: ((callArgs: Record<string, unknown>) => {
          receivedIncludeRawChunks = callArgs.includeRawChunks
          return {
            fullStream: (async function* () {
              yield { type: 'text-delta', text: 'ok' }
              yield {
                type: 'finish-step',
                response: {},
                usage: { inputTokens: 1, outputTokens: 1 },
                finishReason: 'stop',
                rawFinishReason: 'stop',
                providerMetadata: {},
              }
            })(),
            usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
            steps: Promise.resolve([]),
          }
        }) as unknown as StreamChatDeps['streamText'],
        generateText: async () => {
          throw new Error('generateText should not be called')
        },
      },
    })

    expect(receivedIncludeRawChunks).toBe(true)
    expect(events.map(event => event.type)).toEqual([
      'chat/delta',
      'chat/done',
    ])
  })

  it('OpenAI-compatible Chat 流式请求会内部启用 raw chunks，并把 reasoning_content 转成 chat/progress', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()
    let receivedIncludeRawChunks: unknown

    await streamChat({
      requestId: 'r-openai-chat-reasoning-raw',
      params: makeParams({
        messages: [{ role: 'user', content: 'hello' }],
      }),
      onEvent: event => events.push(event),
      signal: controller.signal,
      deps: {
        resolveStreamContext: async () => ({
          providerId: 'deepseek',
          modelId: 'deepseek-reasoner',
          providerConfig: makeProviderConfig({ id: 'deepseek', name: 'DeepSeek', type: 'deepseek' }),
          providerType: 'deepseek',
          effectiveProviderType: 'deepseek',
          providerOptionsKey: 'deepseek',
          openaiCompatibleProviderKey: 'deepseek',
          modelConfig: undefined,
          resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'], transportProtocol: 'openai-chat' }),
          featureKeys: new Set<string>(['reasoning']),
          providerContract: makeProviderContract({ providerId: 'deepseek', providerType: 'deepseek', effectiveProviderType: 'deepseek', transportProtocol: 'openai-chat' }),
        }),
        buildRuntimeCallPlan: async () => makeRuntimeCallPlan(),
        streamText: ((callArgs: Record<string, unknown>) => {
          receivedIncludeRawChunks = callArgs.includeRawChunks
          return {
            fullStream: (async function* () {
              yield {
                type: 'raw',
                rawValue: {
                  choices: [
                    {
                      delta: {
                        reasoning_content: 'thinking...',
                      },
                    },
                  ],
                },
              }
              yield { type: 'text-delta', text: 'ok' }
              yield {
                type: 'finish-step',
                response: {},
                usage: { inputTokens: 1, outputTokens: 1 },
                finishReason: 'stop',
                rawFinishReason: 'stop',
                providerMetadata: {},
              }
            })(),
            usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
            steps: Promise.resolve([]),
          }
        }) as unknown as StreamChatDeps['streamText'],
        generateText: async () => {
          throw new Error('generateText should not be called')
        },
      },
    })

    expect(receivedIncludeRawChunks).toBe(true)
    expect(events.map(event => event.type)).toEqual([
      'chat/progress',
      'chat/delta',
      'chat/done',
    ])
    expect(events[0]).toMatchObject({
      type: 'chat/progress',
      stage: 'response-in-progress',
    })
    expect(events.some(event => event.type === 'chat/reasoning' || event.type === 'chat/debug')).toBe(false)
  })

  it('OpenAI-compatible Chat 只有 raw reasoning_details 没有正文时，会收口成 no-output 而不是超时断连', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()

    await streamChat({
      requestId: 'r-openai-chat-reasoning-details-only',
      params: makeParams({
        messages: [{ role: 'user', content: 'hello' }],
      }),
      onEvent: event => events.push(event),
      signal: controller.signal,
      deps: {
        resolveStreamContext: async () => ({
          providerId: 'openrouter',
          modelId: 'deepseek/deepseek-r1',
          providerConfig: makeProviderConfig({ id: 'openrouter', name: 'OpenRouter', type: 'openai' }),
          providerType: 'openai',
          effectiveProviderType: 'openai',
          providerOptionsKey: 'openai',
          openaiCompatibleProviderKey: 'openrouter',
          modelConfig: undefined,
          resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'], transportProtocol: 'openai-chat' }),
          featureKeys: new Set<string>(['reasoning']),
          providerContract: makeProviderContract({ providerId: 'openrouter', providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
        }),
        buildRuntimeCallPlan: async () => makeRuntimeCallPlan(),
        streamText: (() => ({
          fullStream: (async function* () {
            yield {
              type: 'raw',
              rawValue: {
                choices: [
                  {
                    delta: {
                      reasoning_details: [
                        { type: 'reasoning.text', text: 'thinking...' },
                      ],
                    },
                  },
                ],
              },
            }
            yield {
              type: 'finish-step',
              response: {},
              usage: { inputTokens: 1, outputTokens: 0 },
              finishReason: 'stop',
              rawFinishReason: 'stop',
              providerMetadata: {},
            }
          })(),
          usage: Promise.resolve({ inputTokens: 1, outputTokens: 0 }),
          steps: Promise.resolve([]),
        })) as unknown as StreamChatDeps['streamText'],
        generateText: async () => {
          throw new Error('generateText should not be called')
        },
      },
    })

    expect(events.map(event => event.type)).toEqual([
      'chat/progress',
      'chat/error',
      'chat/done',
    ])
    expect(events[0]).toMatchObject({
      type: 'chat/progress',
      stage: 'response-in-progress',
    })
    expect(events.some(event => event.type === 'chat/delta' || event.type === 'chat/reasoning')).toBe(false)
    expect(
      ((events[1] as Extract<StreamChatEvent, { type: 'chat/error' }>).error as { key?: unknown } | undefined)?.key,
    ).not.toBe('errors.requestTimedOutOrDisconnected')
  })

  it('会把 step 首块启动信号转成 chat/progress，避免等到正文后才承认流已开始', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()

    await streamChat({
      requestId: 'r-stream-start',
      params: makeParams({
        messages: [{ role: 'user', content: 'hello' }],
      }),
      onEvent: event => events.push(event),
      signal: controller.signal,
      deps: {
        resolveStreamContext: async () => ({
          providerId: 'openai',
          modelId: 'gpt-5.4',
          providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI', type: 'openai-response' }),
          providerType: 'openai-response',
          effectiveProviderType: 'openai-response',
          providerOptionsKey: 'openai',
          openaiCompatibleProviderKey: null,
          modelConfig: undefined,
          resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'], transportProtocol: 'openai-responses' }),
          featureKeys: new Set<string>(),
          providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai-response', effectiveProviderType: 'openai-response', transportProtocol: 'openai-responses' }),
        }),
        buildRuntimeCallPlan: async () => makeRuntimeCallPlan(),
        streamText: (() => ({
          fullStream: (async function* () {
            yield {
              type: 'start-step',
              request: { body: {} },
              warnings: [],
            }
            yield {
              type: 'text-delta',
              text: 'ok',
            }
            yield {
              type: 'finish-step',
              response: {},
              usage: { inputTokens: 1, outputTokens: 1 },
              finishReason: 'stop',
              rawFinishReason: 'stop',
              providerMetadata: {},
            }
          })(),
          usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
          steps: Promise.resolve([]),
        })) as unknown as StreamChatDeps['streamText'],
        generateText: async () => {
          throw new Error('generateText should not be called')
        },
      },
    })

    expect(events.map(event => event.type)).toEqual([
      'chat/progress',
      'chat/delta',
      'chat/done',
    ])
    expect(events[0]).toMatchObject({
      type: 'chat/progress',
      stage: 'stream-start',
    })
  })

  it('会把 OpenAI Responses 的 raw response.created 转成 chat/progress，用于承认流已开始', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()

    await streamChat({
      requestId: 'r-response-created',
      params: makeParams({
        messages: [{ role: 'user', content: 'hello' }],
      }),
      onEvent: event => events.push(event),
      signal: controller.signal,
      deps: {
        resolveStreamContext: async () => ({
          providerId: 'openai',
          modelId: 'gpt-5.4',
          providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI', type: 'openai-response' }),
          providerType: 'openai-response',
          effectiveProviderType: 'openai-response',
          providerOptionsKey: 'openai',
          openaiCompatibleProviderKey: null,
          modelConfig: undefined,
          resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'], transportProtocol: 'openai-responses' }),
          featureKeys: new Set<string>(),
          providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai-response', effectiveProviderType: 'openai-response', transportProtocol: 'openai-responses' }),
        }),
        buildRuntimeCallPlan: async () => makeRuntimeCallPlan(),
        streamText: (() => ({
          fullStream: (async function* () {
            yield {
              type: 'raw',
              rawValue: {
                type: 'response.created',
                response: { id: 'resp_1' },
              },
            }
            yield {
              type: 'text-delta',
              text: 'ok',
            }
            yield {
              type: 'finish-step',
              response: {},
              usage: { inputTokens: 1, outputTokens: 1 },
              finishReason: 'stop',
              rawFinishReason: 'stop',
              providerMetadata: {},
            }
          })(),
          usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
          steps: Promise.resolve([]),
        })) as unknown as StreamChatDeps['streamText'],
        generateText: async () => {
          throw new Error('generateText should not be called')
        },
      },
    })

    expect(events.map(event => event.type)).toEqual([
      'chat/progress',
      'chat/delta',
      'chat/done',
    ])
    expect(events[0]).toMatchObject({
      type: 'chat/progress',
      stage: 'stream-start',
    })
  })

  it('会把 OpenAI Responses 的 raw response.in_progress 转成 chat/progress，用于续命长思考阶段', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()

    await streamChat({
      requestId: 'r-response-in-progress',
      params: makeParams({
        messages: [{ role: 'user', content: 'hello' }],
      }),
      onEvent: event => events.push(event),
      signal: controller.signal,
      deps: {
        resolveStreamContext: async () => ({
          providerId: 'openai',
          modelId: 'gpt-5.4',
          providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI', type: 'openai-response' }),
          providerType: 'openai-response',
          effectiveProviderType: 'openai-response',
          providerOptionsKey: 'openai',
          openaiCompatibleProviderKey: null,
          modelConfig: undefined,
          resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'], transportProtocol: 'openai-responses' }),
          featureKeys: new Set<string>(),
          providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai-response', effectiveProviderType: 'openai-response', transportProtocol: 'openai-responses' }),
        }),
        buildRuntimeCallPlan: async () => makeRuntimeCallPlan(),
        streamText: (() => ({
          fullStream: (async function* () {
            yield {
              type: 'start-step',
              request: { body: {} },
              warnings: [],
            }
            yield {
              type: 'raw',
              rawValue: {
                type: 'response.in_progress',
              },
            }
            yield {
              type: 'text-delta',
              text: 'ok',
            }
            yield {
              type: 'finish-step',
              response: {},
              usage: { inputTokens: 1, outputTokens: 1 },
              finishReason: 'stop',
              rawFinishReason: 'stop',
              providerMetadata: {},
            }
          })(),
          usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
          steps: Promise.resolve([]),
        })) as unknown as StreamChatDeps['streamText'],
        generateText: async () => {
          throw new Error('generateText should not be called')
        },
      },
    })

    expect(events.map(event => event.type)).toEqual([
      'chat/progress',
      'chat/progress',
      'chat/delta',
      'chat/done',
    ])
    expect(events[1]).toMatchObject({
      type: 'chat/progress',
      stage: 'response-in-progress',
    })
  })

  it('会把 OpenAI Responses 的 raw response.output_item.added(reasoning) 转成 chat/progress，用于续命长思考阶段', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()

    await streamChat({
      requestId: 'r-output-item-added',
      params: makeParams({
        messages: [{ role: 'user', content: 'hello' }],
      }),
      onEvent: event => events.push(event),
      signal: controller.signal,
      deps: {
        resolveStreamContext: async () => ({
          providerId: 'openai',
          modelId: 'gpt-5.4',
          providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI', type: 'openai-response' }),
          providerType: 'openai-response',
          effectiveProviderType: 'openai-response',
          providerOptionsKey: 'openai',
          openaiCompatibleProviderKey: null,
          modelConfig: undefined,
          resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'], transportProtocol: 'openai-responses' }),
          featureKeys: new Set<string>(),
          providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai-response', effectiveProviderType: 'openai-response', transportProtocol: 'openai-responses' }),
        }),
        buildRuntimeCallPlan: async () => makeRuntimeCallPlan(),
        streamText: (() => ({
          fullStream: (async function* () {
            yield {
              type: 'raw',
              rawValue: {
                type: 'response.output_item.added',
                item: { type: 'reasoning' },
              },
            }
            yield {
              type: 'text-delta',
              text: 'ok',
            }
            yield {
              type: 'finish-step',
              response: {},
              usage: { inputTokens: 1, outputTokens: 1 },
              finishReason: 'stop',
              rawFinishReason: 'stop',
              providerMetadata: {},
            }
          })(),
          usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
          steps: Promise.resolve([]),
        })) as unknown as StreamChatDeps['streamText'],
        generateText: async () => {
          throw new Error('generateText should not be called')
        },
      },
    })

    expect(events.map(event => event.type)).toEqual([
      'chat/progress',
      'chat/delta',
      'chat/done',
    ])
    expect(events[0]).toMatchObject({
      type: 'chat/progress',
      stage: 'response-in-progress',
    })
  })

  it('会把 OpenAI Responses 的 raw keepalive 转成 chat/progress，用于续命长思考阶段', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()

    await streamChat({
      requestId: 'r-keepalive',
      params: makeParams({
        messages: [{ role: 'user', content: 'hello' }],
      }),
      onEvent: event => events.push(event),
      signal: controller.signal,
      deps: {
        resolveStreamContext: async () => ({
          providerId: 'openai',
          modelId: 'gpt-5.4',
          providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI', type: 'openai-response' }),
          providerType: 'openai-response',
          effectiveProviderType: 'openai-response',
          providerOptionsKey: 'openai',
          openaiCompatibleProviderKey: null,
          modelConfig: undefined,
          resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'], transportProtocol: 'openai-responses' }),
          featureKeys: new Set<string>(),
          providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai-response', effectiveProviderType: 'openai-response', transportProtocol: 'openai-responses' }),
        }),
        buildRuntimeCallPlan: async () => makeRuntimeCallPlan(),
        streamText: (() => ({
          fullStream: (async function* () {
            yield {
              type: 'raw',
              rawValue: {
                type: 'keepalive',
              },
            }
            yield {
              type: 'text-delta',
              text: 'ok',
            }
            yield {
              type: 'finish-step',
              response: {},
              usage: { inputTokens: 1, outputTokens: 1 },
              finishReason: 'stop',
              rawFinishReason: 'stop',
              providerMetadata: {},
            }
          })(),
          usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
          steps: Promise.resolve([]),
        })) as unknown as StreamChatDeps['streamText'],
        generateText: async () => {
          throw new Error('generateText should not be called')
        },
      },
    })

    expect(events.map(event => event.type)).toEqual([
      'chat/progress',
      'chat/delta',
      'chat/done',
    ])
    expect(events[0]).toMatchObject({
      type: 'chat/progress',
      stage: 'response-in-progress',
    })
  })

  it('只有 raw heartbeat 没有正文时，会收口成 no-output，而不是误报超时断连', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()

    await streamChat({
      requestId: 'r-raw-heartbeat-only',
      params: makeParams({
        messages: [{ role: 'user', content: 'hello' }],
      }),
      onEvent: event => events.push(event),
      signal: controller.signal,
      deps: {
        resolveStreamContext: async () => ({
          providerId: 'openai',
          modelId: 'gpt-5.4',
          providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI', type: 'openai-response' }),
          providerType: 'openai-response',
          effectiveProviderType: 'openai-response',
          providerOptionsKey: 'openai',
          openaiCompatibleProviderKey: null,
          modelConfig: undefined,
          resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'], transportProtocol: 'openai-responses' }),
          featureKeys: new Set<string>(),
          providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai-response', effectiveProviderType: 'openai-response', transportProtocol: 'openai-responses' }),
        }),
        buildRuntimeCallPlan: async () => makeRuntimeCallPlan(),
        streamText: (() => ({
          fullStream: (async function* () {
            yield {
              type: 'raw',
              rawValue: {
                type: 'response.created',
                response: { id: 'resp_heartbeat' },
              },
            }
            yield {
              type: 'raw',
              rawValue: {
                type: 'response.output_item.added',
                item: { type: 'reasoning' },
              },
            }
            yield {
              type: 'raw',
              rawValue: {
                type: 'keepalive',
              },
            }
            yield {
              type: 'finish-step',
              response: {},
              usage: { inputTokens: 1, outputTokens: 0 },
              finishReason: 'stop',
              rawFinishReason: 'stop',
              providerMetadata: {},
            }
          })(),
          usage: Promise.resolve({ inputTokens: 1, outputTokens: 0 }),
          steps: Promise.resolve([]),
        })) as unknown as StreamChatDeps['streamText'],
        generateText: async () => {
          throw new Error('generateText should not be called')
        },
      },
    })

    expect(events.map(event => event.type)).toEqual([
      'chat/progress',
      'chat/progress',
      'chat/progress',
      'chat/error',
      'chat/done',
    ])
    expect(events.slice(0, 3)).toMatchObject([
      { type: 'chat/progress', stage: 'stream-start' },
      { type: 'chat/progress', stage: 'response-in-progress' },
      { type: 'chat/progress', stage: 'response-in-progress' },
    ])
    expect(events.some(event => event.type === 'chat/delta' || event.type === 'chat/reasoning')).toBe(false)
    expect(
      ((events[3] as Extract<StreamChatEvent, { type: 'chat/error' }>).error as { key?: unknown } | undefined)?.key,
    ).not.toBe('errors.requestTimedOutOrDisconnected')
  })

  it('当上游首步实际返回 store=false 时，会在后续 OpenAI Responses step 退回非持久化续跑', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()
    const stepConfigs: Array<Record<string, unknown> | undefined> = []
    let firstStepProviderOptions: unknown
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const baseModel = {
      specificationVersion: 'v3' as const,
      provider: 'openai',
      modelId: 'gpt-5.4',
      supportedUrls: { '*/*': [/.*/] },
      doGenerate: async () => {
        throw new Error('doGenerate should not be called')
      },
      doStream: async (_options: Record<string, unknown>) => {
        return {
          stream: new ReadableStream({
            /**
             * 模拟 OpenAI Responses 首步原始流：
             *
             * 说明：
             * - 先吐出 `response.created.store=false`，触发 probe middleware 记录真实 store；
             * - 再以 `finish` 收尾，模拟“首步走完但服务端并未持久化”的场景。
             */
            start(streamController) {
              streamController.enqueue({
                type: 'raw',
                rawValue: {
                  type: 'response.created',
                  response: {
                    store: false,
                  },
                },
              })
              streamController.enqueue({
                type: 'finish',
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                finishReason: 'tool-calls',
                providerMetadata: {},
              })
              streamController.close()
            },
          }),
        }
      },
    }

    const streamTextMock = vi.fn((callArgs: Record<string, unknown>) => {
      const prepareStep = callArgs.prepareStep as
        | ((args: {
            stepNumber: number
            steps: ReadonlyArray<unknown>
            messages: ReadonlyArray<unknown>
            model: unknown
            experimental_context: unknown
          }) => Promise<Record<string, unknown> | undefined> | Record<string, unknown> | undefined)
        | undefined

      firstStepProviderOptions = callArgs.providerOptions

      return {
        fullStream: (async function* () {
          stepConfigs.push(
            await prepareStep?.({
              stepNumber: 0,
              steps: [],
              messages: [],
              model: callArgs.model,
              experimental_context: undefined,
            }),
          )

          const wrappedModel = callArgs.model as typeof baseModel
          const firstStepResult = await wrappedModel.doStream({
            prompt: [],
            providerOptions: callArgs.providerOptions,
            includeRawChunks: callArgs.includeRawChunks,
          } as never)

          const reader = firstStepResult.stream.getReader()
          while (true) {
            const { done } = await reader.read()
            if (done) break
          }

          stepConfigs.push(
            await prepareStep?.({
              stepNumber: 1,
              steps: [{}],
              messages: [],
              model: callArgs.model,
              experimental_context: undefined,
            }),
          )

          yield { type: 'text-delta', text: 'ok' }
          yield {
            type: 'finish-step',
            response: {},
            usage: { inputTokens: 1, outputTokens: 1 },
            finishReason: 'stop',
            rawFinishReason: 'stop',
            providerMetadata: {},
          }
        })(),
        usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
        steps: Promise.resolve([]),
      } as never
    })

    await streamChat({
      requestId: 'r-store-fallback',
      params: makeParams({
        messages: [{ role: 'user', content: 'hello' }],
      }),
      tools: { mcp__amap__search: {} } as never,
      onEvent: (event) => events.push(event),
      signal: controller.signal,
      deps: {
        resolveStreamContext: async () => ({
          providerId: 'openai',
          modelId: 'gpt-5.4',
          providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI', type: 'openai-response' }),
          providerType: 'openai-response',
          effectiveProviderType: 'openai-response',
          providerOptionsKey: 'openai',
          openaiCompatibleProviderKey: null,
          modelConfig: undefined,
          resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'], transportProtocol: 'openai-responses' }),
          featureKeys: new Set<string>(),
          providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai-response', effectiveProviderType: 'openai-response', transportProtocol: 'openai-responses' }),
        }),
        buildRuntimeCallPlan: async () => makeRuntimeCallPlan({
          languageModel: baseModel as never,
          hasInjectedMcpTools: true,
          openAiResponsesStoreAutoStrategyApplied: true,
          openAiResponsesStoreValue: true,
          providerOptions: {
            openai: {
              store: true,
            },
          } as never,
        }),
        streamText: streamTextMock as unknown as StreamChatDeps['streamText'],
        generateText: async () => {
          throw new Error('generateText should not be called')
        },
      },
    })
    try {
      expect(firstStepProviderOptions).toEqual({
        openai: {
          store: true,
        },
      })
      expect(stepConfigs[0]).toBeUndefined()
      expect(stepConfigs[1]).toEqual({
        providerOptions: {
          openai: {
            store: false,
          },
        },
      })
      expect(warnSpy).toHaveBeenCalledWith(
        '[chat]',
        'streamChat observed OpenAI Responses store mismatch',
        expect.objectContaining({
          requestId: 'r-store-fallback',
          intendedStore: true,
          observedStore: false,
        }),
      )
      expect(warnSpy).toHaveBeenCalledWith(
        '[chat]',
        'streamChat disabled OpenAI Responses store for follow-up steps',
        expect.objectContaining({
          requestId: 'r-store-fallback',
          fallbackStepNumber: 1,
        }),
      )
      expect(rememberUnsupportedOpenAiResponsesStoreTargetMock).toHaveBeenCalledWith({
        providerId: 'openai',
        modelId: 'gpt-5.4',
        effectiveProviderType: 'openai-response',
        transportProtocol: 'openai-responses',
        apiHost: '',
      })
      expect(events.map((event) => event.type)).toEqual(['chat/delta', 'chat/done'])
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('auto MCP router can force the selected MCP tool on the first model step', async () => {
    const controller = new AbortController()
    const events: StreamChatEvent[] = []
    const stepConfigs: Array<Record<string, unknown> | undefined> = []
    const streamTextMock = vi.fn((callArgs: Record<string, unknown>) => {
      const prepareStep = callArgs.prepareStep as
        | ((args: { stepNumber: number }) => Promise<Record<string, unknown> | undefined> | Record<string, unknown> | undefined)
        | undefined

      return {
        fullStream: (async function* () {
          stepConfigs.push(await prepareStep?.({ stepNumber: 0 }))
          stepConfigs.push(await prepareStep?.({ stepNumber: 1 }))
          yield {
            type: 'tool-call',
            toolCallId: 'tc-amap',
            toolName: 'mcp__amap_maps_streamableHTTP__search',
            input: { keywords: '国华金融' },
          }
          yield {
            type: 'tool-result',
            toolCallId: 'tc-amap',
            toolName: 'mcp__amap_maps_streamableHTTP__search',
            output: { location: '121.0,31.0' },
          }
          yield { type: 'text-delta', text: '坐标是 121.0,31.0' }
          yield {
            type: 'finish-step',
            response: {},
            usage: { inputTokens: 1, outputTokens: 1 },
            finishReason: 'stop',
            rawFinishReason: 'stop',
            providerMetadata: {},
          }
        })(),
        usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
        steps: Promise.resolve([]),
      } as never
    })

    await streamChat({
      requestId: 'r-force-mcp-tool',
      params: makeParams({
        messages: [{ role: 'user', content: '国华金融中的坐标' }],
        topicKind: 'topic',
        forcedFirstToolName: 'mcp__amap_maps_streamableHTTP__search',
      }),
      tools: { mcp__amap_maps_streamableHTTP__search: {} } as never,
      onEvent: (event) => events.push(event),
      signal: controller.signal,
      deps: {
        resolveStreamContext: async () => ({
          providerId: 'test',
          modelId: 'm',
          providerConfig: makeProviderConfig(),
          providerType: 'openai',
          effectiveProviderType: 'openai',
          providerOptionsKey: 'openai',
          openaiCompatibleProviderKey: null,
          modelConfig: undefined,
          resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'] }),
          featureKeys: new Set<string>(),
          providerContract: makeProviderContract({ providerType: 'openai', effectiveProviderType: 'openai' }),
        }),
        buildRuntimeCallPlan: async () => makeRuntimeCallPlan({ hasInjectedMcpTools: true }),
        streamText: streamTextMock as unknown as StreamChatDeps['streamText'],
        generateText: async () => {
          throw new Error('generateText should not be called')
        },
      },
    })

    expect(stepConfigs[0]).toEqual({
      toolChoice: {
        type: 'tool',
        toolName: 'mcp__amap_maps_streamableHTTP__search',
      },
    })
    expect(stepConfigs[1]).toEqual({ toolChoice: 'auto' })
    expect(events.map((event) => event.type)).toEqual(['chat/tool-call', 'chat/tool-result', 'chat/delta', 'chat/done'])
  })

  it('emits chat/error when forced MCP tool is ignored and normal text appears first', async () => {
    const controller = new AbortController()
    const events: StreamChatEvent[] = []
    const streamTextMock = vi.fn(() => ({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: '这句话有歧义' }
      })(),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      steps: Promise.resolve([]),
    }) as never)

    await streamChat({
      requestId: 'r-force-mcp-tool-ignored',
      params: makeParams({
        messages: [{ role: 'user', content: '国华金融中的坐标' }],
        topicKind: 'topic',
        forcedFirstToolName: 'mcp__amap_maps_streamableHTTP__search',
      }),
      tools: { mcp__amap_maps_streamableHTTP__search: {} } as never,
      onEvent: (event) => events.push(event),
      signal: controller.signal,
      deps: {
        resolveStreamContext: async () => ({
          providerId: 'test',
          modelId: 'm',
          providerConfig: makeProviderConfig(),
          providerType: 'openai',
          effectiveProviderType: 'openai',
          providerOptionsKey: 'openai',
          openaiCompatibleProviderKey: null,
          modelConfig: undefined,
          resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'] }),
          featureKeys: new Set<string>(),
          providerContract: makeProviderContract({ providerType: 'openai', effectiveProviderType: 'openai' }),
        }),
        buildRuntimeCallPlan: async () => makeRuntimeCallPlan({ hasInjectedMcpTools: true }),
        streamText: streamTextMock as unknown as StreamChatDeps['streamText'],
        generateText: async () => {
          throw new Error('generateText should not be called')
        },
      },
    })

    expect(events.map((event) => event.type)).toEqual(['chat/error', 'chat/done'])
    expect(events[0]).toMatchObject({
      type: 'chat/error',
      error: {
        key: 'errors.mcpForcedToolCallMissing',
        params: {
          tool: 'mcp__amap_maps_streamableHTTP__search',
          kind: 'text-delta',
        },
      },
    })
  })

  it('emits chat/error when forced MCP tool is missing before stream end', async () => {
    const controller = new AbortController()
    const events: StreamChatEvent[] = []
    const streamTextMock = vi.fn(() => ({
      fullStream: (async function* () {
        yield {
          type: 'finish-step',
          response: {},
          usage: { inputTokens: 1, outputTokens: 1 },
          finishReason: 'stop',
          rawFinishReason: 'stop',
          providerMetadata: {},
        }
      })(),
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      steps: Promise.resolve([]),
    }) as never)

    await streamChat({
      requestId: 'r-force-mcp-tool-missing',
      params: makeParams({
        messages: [{ role: 'user', content: '国华金融中的坐标' }],
        topicKind: 'topic',
        forcedFirstToolName: 'mcp__amap_maps_streamableHTTP__search',
      }),
      tools: { mcp__amap_maps_streamableHTTP__search: {} } as never,
      onEvent: (event) => events.push(event),
      signal: controller.signal,
      deps: {
        resolveStreamContext: async () => ({
          providerId: 'test',
          modelId: 'm',
          providerConfig: makeProviderConfig(),
          providerType: 'openai',
          effectiveProviderType: 'openai',
          providerOptionsKey: 'openai',
          openaiCompatibleProviderKey: null,
          modelConfig: undefined,
          resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'] }),
          featureKeys: new Set<string>(),
          providerContract: makeProviderContract({ providerType: 'openai', effectiveProviderType: 'openai' }),
        }),
        buildRuntimeCallPlan: async () => makeRuntimeCallPlan({ hasInjectedMcpTools: true }),
        streamText: streamTextMock as unknown as StreamChatDeps['streamText'],
        generateText: async () => {
          throw new Error('generateText should not be called')
        },
      },
    })

    expect(events.map((event) => event.type)).toEqual(['chat/error', 'chat/done'])
    expect(events[0]).toMatchObject({
      type: 'chat/error',
      error: {
        key: 'errors.mcpForcedToolCallMissing',
        params: {
          tool: 'mcp__amap_maps_streamableHTTP__search',
          kind: 'stream-end',
        },
      },
    })
  })

  it('emits chat/error when forced MCP tool is not injected into tools', async () => {
    const controller = new AbortController()
    const events: StreamChatEvent[] = []
    const streamTextMock = vi.fn(() => {
      throw new Error('streamText should not be called')
    })

    await streamChat({
      requestId: 'r-force-mcp-tool-not-injected',
      params: makeParams({
        messages: [{ role: 'user', content: '国华金融中的坐标' }],
        topicKind: 'topic',
        forcedFirstToolName: 'mcp__amap_maps_streamableHTTP__search',
      }),
      tools: { mcp__other__search: {} } as never,
      onEvent: (event) => events.push(event),
      signal: controller.signal,
      deps: {
        resolveStreamContext: async () => ({
          providerId: 'test',
          modelId: 'm',
          providerConfig: makeProviderConfig(),
          providerType: 'openai',
          effectiveProviderType: 'openai',
          providerOptionsKey: 'openai',
          openaiCompatibleProviderKey: null,
          modelConfig: undefined,
          resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'] }),
          featureKeys: new Set<string>(),
          providerContract: makeProviderContract({ providerType: 'openai', effectiveProviderType: 'openai' }),
        }),
        buildRuntimeCallPlan: async () => makeRuntimeCallPlan({ hasInjectedMcpTools: true }),
        streamText: streamTextMock as unknown as StreamChatDeps['streamText'],
        generateText: async () => {
          throw new Error('generateText should not be called')
        },
      },
    })

    expect(streamTextMock).not.toHaveBeenCalled()
    expect(events.map((event) => event.type)).toEqual(['chat/error', 'chat/done'])
    expect(events[0]).toMatchObject({
      type: 'chat/error',
      error: {
        key: 'errors.mcpForcedToolUnavailable',
        params: { tool: 'mcp__amap_maps_streamableHTTP__search' },
      },
    })
  })

  it('emits chat/error when provider explicitly forbids image input', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()

    const deps: StreamChatTestDeps = {
      resolveStreamContext: async () => ({
        providerId: 'openai',
        modelId: 'm',
        providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI', apiOptions: { isNotSupportImageInput: true } }),
        providerType: 'openai',
        effectiveProviderType: 'openai',
        providerOptionsKey: 'openai',
        openaiCompatibleProviderKey: null,
        modelConfig: undefined,
        resolvedModelMeta: makeResolvedModelMeta({ kind: 'multimodal-chat', inputModalities: ['text', 'image'] }),
        featureKeys: new Set(['vision-input']),
        providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
      }),
      buildRuntimeCallPlan: async () => makeRuntimeCallPlan(),
      streamText: () => {
        throw new Error('streamText should not be called')
      },
      generateText: async () => {
        throw new Error('generateText should not be called')
      },
    }

    const params = makeParams({
      messages: [
        { role: 'user', content: 'hi', attachments: [{ type: 'image', url: 'data:image/png;base64,AA==' }] },
      ],
    })

    await streamChat({
      requestId: 'r1',
      params,
      onEvent: (e) => events.push(e),
      signal: controller.signal,
      deps,
    })

    expect(events[0]?.type).toBe('chat/error')
    expect((events[0] as unknown as { error?: { key?: unknown } })?.error?.key).toBe('errors.imageInputNotSupportedByProvider')
    expect(
      (events[0] as unknown as { details?: { messageI18n?: { key?: unknown } } })?.details?.messageI18n?.key,
    ).toBe('errors.imageInputNotSupportedByProvider')
    expect(events[events.length - 1]?.type).toBe('chat/done')
  })

  it('会在进入 SDK 前拒绝未核验 provider 的图片聊天', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()
    let providerCalled = false

    const deps: StreamChatTestDeps = {
      resolveStreamContext: async () => ({
        providerId: 'moonshot',
        modelId: 'm',
        providerConfig: makeProviderConfig({ id: 'moonshot', name: 'Moonshot', type: 'openai' }),
        providerType: 'openai',
        effectiveProviderType: 'openai',
        providerOptionsKey: 'moonshot',
        openaiCompatibleProviderKey: 'moonshot',
        modelConfig: undefined,
        resolvedModelMeta: makeResolvedModelMeta({ kind: 'multimodal-chat', inputModalities: ['text', 'image'] }),
        featureKeys: new Set(['vision-input']),
        providerContract: makeProviderContract({ providerId: 'moonshot', providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
      }),
      buildRuntimeCallPlan: async () => makeRuntimeCallPlan(),
      streamText: (() => {
        providerCalled = true
        throw new Error('streamText should not be called')
      }) as StreamChatDeps['streamText'],
      generateText: async () => {
        providerCalled = true
        throw new Error('generateText should not be called')
      },
    }

    await streamChat({
      requestId: 'r-unverified',
      params: makeParams({
        messages: [{ role: 'user', content: 'look', attachments: [{ type: 'image', url: 'data:image/png;base64,AA==', mime: 'image/png' }] }],
      }),
      onEvent: (event) => events.push(event),
      signal: controller.signal,
      deps,
    })

    expect(providerCalled).toBe(false)
    expect(events[0]?.type).toBe('chat/error')
    expect((events[0] as unknown as { error?: { key?: unknown } })?.error?.key).toBe('errors.imageInputNotVerifiedByProvider')
    expect(events[events.length - 1]?.type).toBe('chat/done')
  })

  it('会在 new-api transport 未知时提前拒绝图片聊天', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()
    let providerCalled = false

    const deps: StreamChatTestDeps = {
      resolveStreamContext: async () => ({
        providerId: 'new-api',
        modelId: 'm',
        providerConfig: makeProviderConfig({ id: 'new-api', name: 'NewAPI', type: 'new-api' }),
        providerType: 'new-api',
        effectiveProviderType: 'openai',
        providerOptionsKey: 'new-api',
        openaiCompatibleProviderKey: 'new-api',
        modelConfig: undefined,
        resolvedModelMeta: makeResolvedModelMeta({ kind: 'multimodal-chat', inputModalities: ['text', 'image'], transportProtocol: 'unknown' }),
        featureKeys: new Set(['vision-input']),
        providerContract: makeProviderContract({ providerId: 'new-api', providerType: 'new-api', effectiveProviderType: 'openai', transportProtocol: 'unknown' }),
      }),
      buildRuntimeCallPlan: async () => makeRuntimeCallPlan(),
      streamText: (() => {
        providerCalled = true
        throw new Error('streamText should not be called')
      }) as StreamChatDeps['streamText'],
      generateText: async () => {
        providerCalled = true
        throw new Error('generateText should not be called')
      },
    }

    await streamChat({
      requestId: 'r-new-api-unknown',
      params: makeParams({
        messages: [{ role: 'user', content: 'look', attachments: [{ type: 'image', url: 'data:image/png;base64,AA==', mime: 'image/png' }] }],
      }),
      onEvent: (event) => events.push(event),
      signal: controller.signal,
      deps,
    })

    expect(providerCalled).toBe(false)
    expect(events[0]?.type).toBe('chat/error')
    expect((events[0] as unknown as { error?: { key?: unknown } })?.error?.key).toBe('errors.imageInputTransportProtocolUnknown')
    expect(events[events.length - 1]?.type).toBe('chat/done')
  })

  it('会把 APICallError 映射成稳定的国际化错误 key，而不是技术 token', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()

    const deps: StreamChatTestDeps = {
      resolveStreamContext: async () => ({
        providerId: 'openai',
        modelId: 'm',
        providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI', type: 'openai' }),
        providerType: 'openai',
        effectiveProviderType: 'openai',
        providerOptionsKey: 'openai',
        openaiCompatibleProviderKey: null,
        modelConfig: undefined,
        resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'], transportProtocol: 'openai-chat' }),
        featureKeys: new Set<string>(),
        providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
      }),
      buildRuntimeCallPlan: async () => makeRuntimeCallPlan(),
      streamText: (() => {
        throw new APICallError({
          message: 'Not Found',
          url: 'https://api.example.com/chat/completions',
          requestBodyValues: {},
          statusCode: 404,
          responseBody: JSON.stringify({ message: 'Not Found' }),
        })
      }) as StreamChatDeps['streamText'],
      generateText: async () => {
        throw new Error('generateText should not be called')
      },
    }

    await streamChat({
      requestId: 'r-api-call',
      params: makeParams({ messages: [{ role: 'user', content: 'hello' }] }),
      onEvent: (event) => events.push(event),
      signal: controller.signal,
      deps,
    })

    expect(events[0]?.type).toBe('chat/error')
    expect((events[0] as unknown as { error?: { key?: unknown } })?.error?.key).toBe('errors.apiCallMissingV1PathWithDetail')
    expect((events[0] as unknown as { details?: { messageI18n?: { key?: unknown } } })?.details?.messageI18n?.key).toBe(
      'errors.apiCallMissingV1PathWithDetail',
    )
    expect((events[events.length - 1] as { type?: unknown })?.type).toBe('chat/done')
  })

  it('会从 RetryError 尝试链路中展示真实 API 响应并保留脱敏 retry chain', async () => {
    /**
     * 测试辅助函数：`makeRetryError`。
     *
     * @remarks
     * 构造“前一次有 HTTP 响应体，最后一次只有浏览器网络错误”的通用 retry 链路。
     */
    const makeRetryError = () => {
      const apiError = new APICallError({
        message: 'API call failed',
        url: 'https://api.example.com/v1/chat/completions?api_key=should_not_leak',
        requestBodyValues: {
          prompt: 'user prompt must not leak',
          apiKey: 'sk-test-should-not-leak',
        },
        statusCode: 503,
        responseHeaders: { 'x-request-id': 'req_retry_chain' },
        responseBody: JSON.stringify({
          error: {
            code: 'upstream_model_unavailable',
            message: '模型渠道暂不可用',
          },
        }),
      })
      return new RetryError({
        message: 'Failed after 2 attempts. Last error: Failed to fetch',
        reason: 'errorNotRetryable',
        errors: [apiError, new TypeError('Failed to fetch')],
      })
    }
    /**
     * 测试辅助函数：`makeDeps`。
     *
     * @remarks
     * 分别覆盖 streamText 同步抛错与 fullStream error part 两个 AI SDK 错误入口。
     */
    const makeDeps = (mode: 'throw' | 'stream-error'): StreamChatTestDeps => ({
      resolveStreamContext: async () => ({
        providerId: 'openai',
        modelId: 'm',
        providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI', type: 'openai' }),
        providerType: 'openai',
        effectiveProviderType: 'openai',
        providerOptionsKey: 'openai',
        openaiCompatibleProviderKey: null,
        modelConfig: undefined,
        resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'], transportProtocol: 'openai-chat' }),
        featureKeys: new Set<string>(),
        providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
      }),
      buildRuntimeCallPlan: async () => makeRuntimeCallPlan(),
      streamText: (() => {
        const retryError = makeRetryError()
        if (mode === 'throw') throw retryError
        return {
          fullStream: (async function* () {
            yield {
              type: 'error',
              error: retryError,
            }
          })(),
          usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
          steps: Promise.resolve([]),
        }
      }) as unknown as StreamChatDeps['streamText'],
      generateText: async () => {
        throw new Error('generateText should not be called')
      },
    })
    /**
     * 测试辅助函数：`runScenario`。
     *
     * @remarks
     * 执行一次聊天流并返回完整事件序列，便于对两条错误入口复用同一组断言。
     */
    const runScenario = async (mode: 'throw' | 'stream-error') => {
      const events: StreamChatEvent[] = []
      await streamChat({
        requestId: `r-retry-chain-${mode}`,
        params: makeParams({ messages: [{ role: 'user', content: 'hello' }] }),
        onEvent: (event) => events.push(event),
        signal: new AbortController().signal,
        deps: makeDeps(mode),
      })
      return events
    }

    for (const mode of ['throw', 'stream-error'] as const) {
      const events = await runScenario(mode)
      const errorEvent = events[0] as Extract<StreamChatEvent, { type: 'chat/error' }>

      expect(events.map((event) => event.type)).toEqual(['chat/error', 'chat/done'])
      expect(errorEvent.error).toEqual({
        key: 'errors.apiCallHttpErrorWithDetail',
        params: {
          status: 503,
          detail: 'HTTP 503 · https://api.example.com/v1/chat/completions · request_id=req_retry_chain · 模型渠道暂不可用',
        },
      })
      expect(errorEvent.details?.messageI18n).toEqual(errorEvent.error)
      expect(errorEvent.details?.message).toBe(
        'HTTP 503 · https://api.example.com/v1/chat/completions · request_id=req_retry_chain · 模型渠道暂不可用',
      )
      expect(errorEvent.details?.cause).toContain('Retry attempts:')
      expect(errorEvent.details?.cause).toContain('#1 AI_APICallError: HTTP 503')
      expect(errorEvent.details?.cause).toContain('#2 TypeError: Failed to fetch')
      expect(errorEvent.details?.cause).not.toContain('user prompt must not leak')
      expect(errorEvent.details?.cause).not.toContain('sk-test-should-not-leak')
      expect(errorEvent.details?.cause).not.toContain('api_key=should_not_leak')
    }
  })

  it('已处理的 APICallError 与 RetryError 不会写入 console.error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    /**
     * 测试辅助函数：`makeDeps`。
     *
     * @remarks
     * 为本用例构造会抛出指定错误的最小 streamChat 依赖，便于分别覆盖 APICallError 与 RetryError。
     */
    const makeDeps = (error: unknown): StreamChatTestDeps => ({
      resolveStreamContext: async () => ({
        providerId: 'openai',
        modelId: 'm',
        providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI', type: 'openai' }),
        providerType: 'openai',
        effectiveProviderType: 'openai',
        providerOptionsKey: 'openai',
        openaiCompatibleProviderKey: null,
        modelConfig: undefined,
        resolvedModelMeta: makeResolvedModelMeta({ kind: 'chat', inputModalities: ['text'], transportProtocol: 'openai-chat' }),
        featureKeys: new Set<string>(),
        providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
      }),
      buildRuntimeCallPlan: async () => makeRuntimeCallPlan(),
      streamText: (() => {
        throw error
      }) as StreamChatDeps['streamText'],
      generateText: async () => {
        throw new Error('generateText should not be called')
      },
    })
    const apiError = new APICallError({
      message: 'Service temporarily unavailable',
      url: 'https://api.example.com/v1/chat/completions',
      requestBodyValues: {},
      statusCode: 503,
      responseBody: JSON.stringify({ message: 'Service temporarily unavailable' }),
    })
    const retryError = new RetryError({
      message: 'Failed after 3 attempts',
      reason: 'maxRetriesExceeded',
      errors: [apiError],
    })
    const events: StreamChatEvent[] = []

    try {
      await streamChat({
        requestId: 'r-api-call-no-console-error',
        params: makeParams({ messages: [{ role: 'user', content: 'hello' }] }),
        onEvent: (event) => events.push(event),
        signal: new AbortController().signal,
        deps: makeDeps(apiError),
      })
      await streamChat({
        requestId: 'r-retry-api-call-no-console-error',
        params: makeParams({ messages: [{ role: 'user', content: 'hello again' }] }),
        onEvent: (event) => events.push(event),
        signal: new AbortController().signal,
        deps: makeDeps(retryError),
      })
      expect(events.map((event) => event.type)).toEqual(['chat/error', 'chat/done', 'chat/error', 'chat/done'])
      expect(errorSpy).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })

  it('uses generateText for gemini inline image and emits chat/file + chat/done', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()

    const deps: StreamChatTestDeps = {
      resolveStreamContext: async () => ({
        providerId: 'google',
        modelId: 'gemini-image',
        providerConfig: makeProviderConfig({ type: 'gemini' }),
        providerType: 'gemini',
        effectiveProviderType: 'gemini',
        providerOptionsKey: 'google',
        openaiCompatibleProviderKey: null,
        modelConfig: undefined,
        resolvedModelMeta: makeResolvedModelMeta({
          kind: 'multimodal-chat',
          inputModalities: ['text'],
          outputModalities: ['text', 'image'],
          features: ['image-output'],
          transportProtocol: 'gemini-generate-content',
        }),
        featureKeys: new Set(['image-output']),
        providerContract: makeProviderContract({ providerId: 'google', providerType: 'gemini', effectiveProviderType: 'gemini', transportProtocol: 'gemini-generate-content' }),
      }),
      buildRuntimeCallPlan: async () => makeRuntimeCallPlan({
        providerOptions: { google: { modalities: ['image', 'text'] } } as never,
        callSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 64 },
        executionMode: 'generateText',
        wantsInlineImage: true,
        supportsInlineImage: true,
      }),
      streamText: () => {
        throw new Error('streamText should not be called')
      },
      generateText: async () =>
        ({
          text: '',
          reasoningText: '',
          files: [{ base64: 'AAAA', mediaType: 'image/png' }],
          usage: { inputTokens: 1, outputTokens: 2 },
          request: { body: { test: true } },
          response: { id: 'id', modelId: 'gemini-image', timestamp: 't', headers: {}, body: '{}' },
          finishReason: 'stop',
          rawFinishReason: 'stop',
          warnings: [],
          providerMetadata: {},
        }) as never,
    }

    const params = makeParams({
      enableGenerateImage: true,
      messages: [{ role: 'user', content: 'draw a cat' }],
    })

    await streamChat({
      requestId: 'r2',
      params,
      onEvent: (e) => events.push(e),
      signal: controller.signal,
      deps,
    })

    expect(events.map((e) => e.type)).toEqual(['chat/file', 'chat/done'])
    const done = events[1] as { usage?: { inputTokens?: number; outputTokens?: number } }
    expect(done.usage?.inputTokens).toBe(1)
    expect(done.usage?.outputTokens).toBe(2)
  })

  it('blocks generateText normal text when MCP auto routing requires a first tool call', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()

    const deps: StreamChatTestDeps = {
      resolveStreamContext: async () => ({
        providerId: 'test',
        modelId: 'm',
        providerConfig: makeProviderConfig(),
        providerType: 'openai',
        effectiveProviderType: 'openai',
        providerOptionsKey: 'openai',
        openaiCompatibleProviderKey: null,
        modelConfig: undefined,
        resolvedModelMeta: makeResolvedModelMeta(),
        featureKeys: new Set<string>(),
        providerContract: makeProviderContract({ providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
      }),
      buildRuntimeCallPlan: async () => makeRuntimeCallPlan({
        executionMode: 'generateText',
        hasInjectedMcpTools: true,
      }),
      streamText: () => {
        throw new Error('streamText should not be called')
      },
      generateText: async () =>
        ({
          text: '上海“国华金融中心”的公开资料可能对应多个相近名称的楼宇。',
          reasoningText: '',
          files: [],
          usage: { inputTokens: 1, outputTokens: 2 },
          request: { body: { tool_choice: { type: 'function', function: { name: 'mcp__amap__search' } } } },
          response: { id: 'id', modelId: 'm', timestamp: 't', headers: {}, body: '{}' },
          finishReason: 'stop',
          rawFinishReason: 'stop',
          warnings: [],
          providerMetadata: {},
        }) as never,
    }

    await streamChat({
      requestId: 'r-generate-mcp-missing-tool',
      params: makeParams({
        topicKind: 'topic',
        forcedFirstToolName: 'mcp__amap__search',
        messages: [{ role: 'user', content: '查询上海国华金融中心的地址坐标' }],
      }),
      tools: { mcp__amap__search: {} } as never,
      onEvent: (event) => events.push(event),
      signal: controller.signal,
      deps,
    })

    expect(events.some((event) => event.type === 'chat/delta')).toBe(false)
    expect(events).toContainEqual(expect.objectContaining({
      type: 'chat/error',
      error: expect.objectContaining({ key: 'errors.mcpForcedToolCallMissing' }),
    }))
    expect(events[events.length - 1]).toEqual(expect.objectContaining({ type: 'chat/done' }))
  })

  it('streams delta/tool events and finishes with chat/done', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()

    const deps: StreamChatTestDeps = {
      resolveStreamContext: async () => ({
        providerId: 'test',
        modelId: 'm',
        providerConfig: makeProviderConfig(),
        providerType: 'openai',
        effectiveProviderType: 'openai',
        providerOptionsKey: 'test',
        openaiCompatibleProviderKey: null,
        modelConfig: undefined,
        resolvedModelMeta: makeResolvedModelMeta(),
        featureKeys: new Set(),
        providerContract: makeProviderContract({ providerId: 'test', providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
      }),
      buildRuntimeCallPlan: async () => makeRuntimeCallPlan({
        callSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 16 },
      }),
      generateText: async () => {
        throw new Error('generateText should not be called')
      },
      streamText: () =>
        ({
          fullStream: (async function* () {
            yield { type: 'text-delta', text: 'hi' }
            yield { type: 'tool-call', toolCallId: 'tc1', toolName: 't', input: { a: 1 } }
            yield { type: 'tool-result', toolCallId: 'tc1', toolName: 't', output: { ok: true } }
            yield { type: 'finish-step', response: {}, usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'stop', rawFinishReason: 'stop', providerMetadata: {} }
          })(),
          usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
          steps: Promise.resolve([]),
        }) as never,
    }

    const params = makeParams({ messages: [{ role: 'user', content: 'hello' }] })

    await streamChat({
      requestId: 'r3',
      params,
      onEvent: (e) => events.push(e),
      signal: controller.signal,
      deps,
    })

    expect(events.map((e) => e.type)).toEqual(['chat/delta', 'chat/tool-call', 'chat/tool-result', 'chat/done'])
  })

  it('把 data URL 图片附件转换成 AI SDK 可消费的 base64 image part', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()
    let receivedMessages: unknown

    const deps: StreamChatTestDeps = {
      resolveStreamContext: async () => ({
        providerId: 'openai',
        modelId: 'm',
        providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI' }),
        providerType: 'openai',
        effectiveProviderType: 'openai',
        providerOptionsKey: 'openai',
        openaiCompatibleProviderKey: null,
        modelConfig: undefined,
        resolvedModelMeta: makeResolvedModelMeta({ kind: 'multimodal-chat', inputModalities: ['text', 'image'] }),
        featureKeys: new Set(['vision-input']),
        providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
      }),
      buildRuntimeCallPlan: async () => makeRuntimeCallPlan({
        callSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 16 },
      }),
      generateText: async () => {
        throw new Error('generateText should not be called')
      },
      streamText: ((args: { messages?: unknown }) => {
        receivedMessages = args.messages
        return {
          fullStream: (async function* () {
            yield { type: 'finish-step', response: {}, usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'stop', rawFinishReason: 'stop', providerMetadata: {} }
          })(),
          usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
          steps: Promise.resolve([]),
        } as never
      }) as StreamChatDeps['streamText'],
    }

    await streamChat({
      requestId: 'r4',
      params: makeParams({
        messages: [{ role: 'user', content: 'look', attachments: [{ type: 'image', url: 'data:image/png;base64,AA==', mime: 'image/png' }] }],
      }),
      onEvent: (e) => events.push(e),
      signal: controller.signal,
      deps,
    })

    expect((receivedMessages as Array<{ content: unknown }>)[0]?.content).toEqual([
      { type: 'text', text: 'look' },
      { type: 'image', image: 'AA==', mediaType: 'image/png' },
    ])
    expect(events[events.length - 1]?.type).toBe('chat/done')
  })

  it('把 http(s) 图片附件转换成 AI SDK URL image part', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()
    let receivedMessages: unknown

    const deps: StreamChatTestDeps = {
      resolveStreamContext: async () => ({
        providerId: 'openai',
        modelId: 'm',
        providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI' }),
        providerType: 'openai',
        effectiveProviderType: 'openai',
        providerOptionsKey: 'openai',
        openaiCompatibleProviderKey: null,
        modelConfig: undefined,
        resolvedModelMeta: makeResolvedModelMeta({ kind: 'multimodal-chat', inputModalities: ['text', 'image'] }),
        featureKeys: new Set(['vision-input']),
        providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
      }),
      buildRuntimeCallPlan: async () => makeRuntimeCallPlan({
        callSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 16 },
      }),
      generateText: async () => {
        throw new Error('generateText should not be called')
      },
      streamText: ((args: { messages?: unknown }) => {
        receivedMessages = args.messages
        return {
          fullStream: (async function* () {
            yield { type: 'finish-step', response: {}, usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'stop', rawFinishReason: 'stop', providerMetadata: {} }
          })(),
          usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
          steps: Promise.resolve([]),
        } as never
      }) as StreamChatDeps['streamText'],
    }

    await streamChat({
      requestId: 'r4-http',
      params: makeParams({
        messages: [{ role: 'user', content: 'look', attachments: [{ type: 'image', url: 'https://example.com/a.png', mime: 'image/png' }] }],
      }),
      onEvent: (e) => events.push(e),
      signal: controller.signal,
      deps,
    })

    const firstContent = (receivedMessages as Array<{ content: Array<{ type: string; image?: unknown; mediaType?: unknown; text?: unknown }> }>)[0]?.content
    expect(firstContent?.[0]).toEqual({ type: 'text', text: 'look' })
    expect(firstContent?.[1]?.type).toBe('image')
    expect(firstContent?.[1]?.image).toBeInstanceOf(URL)
    expect((firstContent?.[1]?.image as URL | undefined)?.toString()).toBe('https://example.com/a.png')
    expect(firstContent?.[1]?.mediaType).toBe('image/png')
    expect(events[events.length - 1]?.type).toBe('chat/done')
  })

  it('把 PDF 文件附件转换成 AI SDK 可消费的 file part', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()
    let receivedMessages: unknown

    const deps: StreamChatTestDeps = {
      resolveStreamContext: async () => ({
        providerId: 'openai',
        modelId: 'm',
        providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI' }),
        providerType: 'openai',
        effectiveProviderType: 'openai',
        providerOptionsKey: 'openai',
        openaiCompatibleProviderKey: null,
        modelConfig: undefined,
        resolvedModelMeta: makeResolvedModelMeta({ kind: 'multimodal-chat', inputModalities: ['text', 'file'], features: ['file-input'], transportProtocol: 'openai-chat' }),
        featureKeys: new Set(['file-input']),
        providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
      }),
      buildRuntimeCallPlan: async () => makeRuntimeCallPlan({
        callSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 16 },
      }),
      generateText: async () => {
        throw new Error('generateText should not be called')
      },
      streamText: ((args: { messages?: unknown }) => {
        receivedMessages = args.messages
        return {
          fullStream: (async function* () {
            yield { type: 'finish-step', response: {}, usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'stop', rawFinishReason: 'stop', providerMetadata: {} }
          })(),
          usage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
          steps: Promise.resolve([]),
        } as never
      }) as StreamChatDeps['streamText'],
    }

    await streamChat({
      requestId: 'r4-file',
      params: makeParams({
        messages: [{ role: 'user', content: 'read this pdf', attachments: [{ type: 'file', dataUrl: 'data:application/pdf;base64,JVBERi0xLjc=', mime: 'application/pdf', name: 'report.pdf' }] }],
      }),
      onEvent: (e) => events.push(e),
      signal: controller.signal,
      deps,
    })

    expect((receivedMessages as Array<{ content: unknown }>)[0]?.content).toEqual([
      { type: 'text', text: 'read this pdf' },
      { type: 'file', data: 'JVBERi0xLjc=', mediaType: 'application/pdf', filename: 'report.pdf' },
    ])
    expect(events[events.length - 1]?.type).toBe('chat/done')
  })

  it('文件附件的 transport 未知时会在进入 SDK 前拒绝原生文件输入', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()
    let providerCalled = false

    const deps: StreamChatTestDeps = {
      resolveStreamContext: async () => ({
        providerId: 'new-api',
        modelId: 'm',
        providerConfig: makeProviderConfig({ id: 'new-api', name: 'NewAPI', type: 'new-api' }),
        providerType: 'new-api',
        effectiveProviderType: 'openai',
        providerOptionsKey: 'new-api',
        openaiCompatibleProviderKey: 'new-api',
        modelConfig: undefined,
        resolvedModelMeta: makeResolvedModelMeta({ kind: 'multimodal-chat', inputModalities: ['text', 'file'], features: ['file-input'], transportProtocol: 'unknown' }),
        featureKeys: new Set(['file-input']),
        providerContract: makeProviderContract({ providerId: 'new-api', providerType: 'new-api', effectiveProviderType: 'openai', transportProtocol: 'unknown' }),
      }),
      buildRuntimeCallPlan: async () => makeRuntimeCallPlan(),
      streamText: (() => {
        providerCalled = true
        throw new Error('streamText should not be called')
      }) as StreamChatDeps['streamText'],
      generateText: async () => {
        providerCalled = true
        throw new Error('generateText should not be called')
      },
    }

    await streamChat({
      requestId: 'r-file-unknown',
      params: makeParams({
        messages: [{ role: 'user', content: 'read', attachments: [{ type: 'file', dataUrl: 'data:application/pdf;base64,JVBERi0xLjc=', mime: 'application/pdf', name: 'report.pdf' }] }],
      }),
      onEvent: (event) => events.push(event),
      signal: controller.signal,
      deps,
    })

    expect(providerCalled).toBe(false)
    expect(events[0]?.type).toBe('chat/error')
    expect((events[0] as unknown as { error?: { key?: unknown } })?.error?.key).toBe('errors.fileInputTransportProtocolUnknown')
    expect(events[events.length - 1]?.type).toBe('chat/done')
  })

  it('图片附件缺少 url 时会 fail-fast，不会进入 provider 调用', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()
    let providerCalled = false

    const deps: StreamChatTestDeps = {
      resolveStreamContext: async () => ({
        providerId: 'openai',
        modelId: 'm',
        providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI' }),
        providerType: 'openai',
        effectiveProviderType: 'openai',
        providerOptionsKey: 'openai',
        openaiCompatibleProviderKey: null,
        modelConfig: undefined,
        resolvedModelMeta: makeResolvedModelMeta({ kind: 'multimodal-chat', inputModalities: ['text', 'image'] }),
        featureKeys: new Set(['vision-input']),
        providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
      }),
      buildRuntimeCallPlan: async () => makeRuntimeCallPlan({
        callSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 16 },
      }),
      generateText: async () => {
        providerCalled = true
        throw new Error('generateText should not be called')
      },
      streamText: (() => {
        providerCalled = true
        throw new Error('streamText should not be called')
      }) as StreamChatDeps['streamText'],
    }

    await streamChat({
      requestId: 'r5',
      params: makeParams({
        messages: [{ role: 'user', content: 'look', attachments: [{ type: 'image', url: '   ', mime: 'image/png' }] }],
      }),
      onEvent: (e) => events.push(e),
      signal: controller.signal,
      deps,
    })

    expect(providerCalled).toBe(false)
    expect(events[0]?.type).toBe('chat/error')
    expect((events[0] as unknown as { error?: { key?: unknown } })?.error?.key).toBe('errors.imageUrlEmpty')
    expect(events[events.length - 1]?.type).toBe('chat/done')
  })

  it('图片附件使用不支持的 URL scheme 时会 fail-fast，不会进入 provider 调用', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()
    let providerCalled = false

    const deps: StreamChatTestDeps = {
      resolveStreamContext: async () => ({
        providerId: 'openai',
        modelId: 'm',
        providerConfig: makeProviderConfig({ id: 'openai', name: 'OpenAI' }),
        providerType: 'openai',
        effectiveProviderType: 'openai',
        providerOptionsKey: 'openai',
        openaiCompatibleProviderKey: null,
        modelConfig: undefined,
        resolvedModelMeta: makeResolvedModelMeta({ kind: 'multimodal-chat', inputModalities: ['text', 'image'] }),
        featureKeys: new Set(['vision-input']),
        providerContract: makeProviderContract({ providerId: 'openai', providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
      }),
      buildRuntimeCallPlan: async () => makeRuntimeCallPlan({
        callSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 16 },
      }),
      generateText: async () => {
        providerCalled = true
        throw new Error('generateText should not be called')
      },
      streamText: (() => {
        providerCalled = true
        throw new Error('streamText should not be called')
      }) as StreamChatDeps['streamText'],
    }

    await streamChat({
      requestId: 'r5-invalid-scheme',
      params: makeParams({
        messages: [{ role: 'user', content: 'look', attachments: [{ type: 'image', url: 'blob:https://example.com/a.png', mime: 'image/png' }] }],
      }),
      onEvent: (e) => events.push(e),
      signal: controller.signal,
      deps,
    })

    expect(providerCalled).toBe(false)
    expect(events[0]?.type).toBe('chat/error')
    expect((events[0] as unknown as { error?: { key?: unknown } })?.error?.key).toBe('errors.imageUrlUnsupportedScheme')
    expect(events[events.length - 1]?.type).toBe('chat/done')
  })

  it('emits chat/file-url when openai-compatible metadata contains remote image urls', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()

    const deps: StreamChatTestDeps = {
      resolveStreamContext: async () => ({
        providerId: 'test',
        modelId: 'm',
        providerConfig: makeProviderConfig({ type: 'openai' }),
        providerType: 'openai',
        effectiveProviderType: 'openai',
        providerOptionsKey: 'test',
        openaiCompatibleProviderKey: 'test',
        modelConfig: undefined,
        resolvedModelMeta: makeResolvedModelMeta({
          kind: 'multimodal-chat',
          outputModalities: ['text', 'image'],
          features: ['image-output'],
        }),
        featureKeys: new Set(['image-output']),
        providerContract: makeProviderContract({ providerId: 'test', providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
      }),
      buildRuntimeCallPlan: async () => makeRuntimeCallPlan({
        providerOptions: {} as never,
        callSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 16 },
        wantsInlineImage: true,
        supportsInlineImage: true,
      }),
      generateText: async () => {
        throw new Error('generateText should not be called')
      },
      streamText: () =>
        ({
          fullStream: (async function* () {
            yield {
              type: 'finish-step',
              response: {},
              usage: { inputTokens: 1, outputTokens: 0 },
              finishReason: 'stop',
              rawFinishReason: 'stop',
              providerMetadata: { test: { images: [{ url: 'https://example.com/a.png' }] } },
            }
          })(),
          usage: Promise.resolve({ inputTokens: 1, outputTokens: 0 }),
          steps: Promise.resolve([]),
        }) as never,
    }

    const params = makeParams({
      enableGenerateImage: true,
      messages: [{ role: 'user', content: 'draw' }],
    })

    await streamChat({
      requestId: 'r5',
      params,
      onEvent: (e) => events.push(e),
      signal: controller.signal,
      deps,
    })

    expect(events.map((e) => e.type)).toEqual(['chat/file-url', 'chat/done'])
    const fileUrl = events[0] as unknown as { url?: unknown }
    expect(fileUrl.url).toBe('https://example.com/a.png')
  })

  it('ignores late aborts after the stream already completed with assistant output', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()
    let rejectUsage: ((reason?: unknown) => void) | undefined

    const deps: StreamChatTestDeps = {
      resolveStreamContext: async () => ({
        providerId: 'test',
        modelId: 'm',
        providerConfig: makeProviderConfig(),
        providerType: 'openai',
        effectiveProviderType: 'openai',
        providerOptionsKey: 'test',
        openaiCompatibleProviderKey: null,
        modelConfig: undefined,
        resolvedModelMeta: makeResolvedModelMeta(),
        featureKeys: new Set(),
        providerContract: makeProviderContract({ providerId: 'test', providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
      }),
      buildRuntimeCallPlan: async () => makeRuntimeCallPlan({
        callSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 16 },
      }),
      generateText: async () => {
        throw new Error('generateText should not be called')
      },
      streamText: () => {
        const usage = new Promise<{ inputTokens: number; outputTokens: number }>((_, reject) => {
          rejectUsage = reject
        })

        return {
          fullStream: (async function* () {
            yield { type: 'text-delta', text: 'finished reply' }
            yield {
              type: 'finish-step',
              response: {},
              usage: { inputTokens: 1, outputTokens: 1 },
              finishReason: 'stop',
              rawFinishReason: 'stop',
              providerMetadata: {},
            }
            controller.abort()
            rejectUsage?.(makeAbortError())
          })(),
          usage,
          steps: Promise.resolve([]),
        } as never
      },
    }

    await streamChat({
      requestId: 'r-late-abort',
      params: makeParams({ messages: [{ role: 'user', content: 'hello' }] }),
      onEvent: (event) => events.push(event),
      signal: controller.signal,
      deps,
    })

    expect(events.map((event) => event.type)).toEqual(['chat/delta', 'chat/done'])
  })

  it('已经看到 finish-step 后，即使 usage 在尾部抛出 AbortError，也不会把成功回答覆盖成超时', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()

    const deps: StreamChatTestDeps = {
      resolveStreamContext: async () => ({
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-5',
        providerConfig: makeProviderConfig({ type: 'anthropic' }),
        providerType: 'anthropic',
        effectiveProviderType: 'anthropic',
        providerOptionsKey: 'test',
        openaiCompatibleProviderKey: null,
        modelConfig: undefined,
        resolvedModelMeta: makeResolvedModelMeta({ transportProtocol: 'anthropic-messages' }),
        featureKeys: new Set(),
        providerContract: makeProviderContract({
          providerId: 'anthropic',
          providerType: 'anthropic',
          effectiveProviderType: 'anthropic',
          transportProtocol: 'anthropic-messages',
        }),
      }),
      buildRuntimeCallPlan: async () => makeRuntimeCallPlan({
        callSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 16 },
      }),
      generateText: async () => {
        throw new Error('generateText should not be called')
      },
      streamText: () =>
        ({
          fullStream: (async function* () {
            yield { type: 'text-delta', text: 'finished reply' }
            yield {
              type: 'finish-step',
              response: {},
              usage: { inputTokens: 4, outputTokens: 2 },
              finishReason: 'stop',
              rawFinishReason: 'end_turn',
              providerMetadata: {},
            }
          })(),
          usage: Promise.reject(makeAbortError()),
          steps: Promise.resolve([]),
        }) as never,
    }

    await streamChat({
      requestId: 'r-anthropic-late-usage-abort',
      params: makeParams({ messages: [{ role: 'user', content: 'hello' }] }),
      onEvent: (event) => events.push(event),
      signal: controller.signal,
      deps,
    })

    expect(events).toEqual([
      { type: 'chat/delta', requestId: 'r-anthropic-late-usage-abort', delta: 'finished reply' },
      { type: 'chat/done', requestId: 'r-anthropic-late-usage-abort', usage: { inputTokens: 4, outputTokens: 2 } },
    ])
  })

  it('converts stream part error into chat/error + chat/done', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()

    const deps: StreamChatTestDeps = {
      resolveStreamContext: async () => ({
        providerId: 'test',
        modelId: 'm',
        providerConfig: makeProviderConfig(),
        providerType: 'openai',
        effectiveProviderType: 'openai',
        providerOptionsKey: 'test',
        openaiCompatibleProviderKey: null,
        modelConfig: undefined,
        resolvedModelMeta: makeResolvedModelMeta(),
        featureKeys: new Set(),
        providerContract: makeProviderContract({ providerId: 'test', providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
      }),
      buildRuntimeCallPlan: async () => makeRuntimeCallPlan({
        callSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 16 },
      }),
      generateText: async () => {
        throw new Error('generateText should not be called')
      },
      streamText: () =>
        ({
          fullStream: (async function* () {
            yield { type: 'error', error: new Error('boom') }
          })(),
          usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
          steps: Promise.resolve([]),
        }) as never,
    }

    const params = makeParams({ messages: [{ role: 'user', content: 'hello' }] })

    await streamChat({
      requestId: 'r4',
      params,
      onEvent: (e) => events.push(e),
      signal: controller.signal,
      deps,
    })

    expect(events.map((e) => e.type)).toEqual(['chat/error', 'chat/done'])
    const err = (events[0] as unknown as { error?: { key?: unknown; params?: { detail?: unknown } } })?.error
    expect(err?.key).toBe('errors.unknownWithDetail')
    expect(err?.params?.detail).toBe('boom')
  })

  it('ignores late abort stream-part errors after assistant output is already visible', async () => {
    const events: StreamChatEvent[] = []
    const controller = new AbortController()

    const deps: StreamChatTestDeps = {
      resolveStreamContext: async () => ({
        providerId: 'test',
        modelId: 'm',
        providerConfig: makeProviderConfig(),
        providerType: 'openai',
        effectiveProviderType: 'openai',
        providerOptionsKey: 'test',
        openaiCompatibleProviderKey: null,
        modelConfig: undefined,
        resolvedModelMeta: makeResolvedModelMeta(),
        featureKeys: new Set(),
        providerContract: makeProviderContract({ providerId: 'test', providerType: 'openai', effectiveProviderType: 'openai', transportProtocol: 'openai-chat' }),
      }),
      buildRuntimeCallPlan: async () => makeRuntimeCallPlan({
        callSettings: { temperature: 0.7, topP: 0.9, maxOutputTokens: 16 },
      }),
      generateText: async () => {
        throw new Error('generateText should not be called')
      },
      streamText: () =>
        ({
          fullStream: (async function* () {
            yield { type: 'text-delta', text: 'finished reply' }
            controller.abort()
            yield { type: 'error', error: makeAbortError() }
          })(),
          usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
          steps: Promise.resolve([]),
        }) as never,
    }

    await streamChat({
      requestId: 'r4-late-part-abort',
      params: makeParams({ messages: [{ role: 'user', content: 'hello' }] }),
      onEvent: (e) => events.push(e),
      signal: controller.signal,
      deps,
    })

    expect(events.map((e) => e.type)).toEqual(['chat/delta', 'chat/done'])
  })
})
