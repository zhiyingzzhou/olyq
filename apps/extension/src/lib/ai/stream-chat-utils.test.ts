/**
 * 说明：`stream-chat-utils.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `stream-chat-utils.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 单元测试：stream-chat-utils 的规则函数与中间件。
 *
 * 说明：
 * - 覆盖模型 ID 归一化、provider 类型推导、providerOptions key 选择等纯规则；
 * - 覆盖部分 middlewares 的行为（reasoning 标签、提示词后缀、兼容性处理等）。
 */

import { describe, expect, it } from 'vitest'
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3Message,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider'

import {
  normalizeModelIdForRules,
  resolveEffectiveProviderType,
  getProviderOptionsKey,
  getOpenAiCompatibleProviderKey,
  pickReasoningTagName,
  isGemini3ModelId,
  shouldAppendQwenThinkingSuffix,
  createStrictInterleaveMiddleware,
  createAppendSuffixToUserMessagesMiddleware,
  createOpenrouterReasoningRedactionMiddleware,
  estimateContentTokens,
  createAnthropicPromptCachingMiddleware,
	createSkipGeminiThoughtSignatureMiddleware,
} from './stream-chat-utils'

type TransformParamsCtx = { type: 'stream' | 'generate'; params: LanguageModelV3CallOptions; model: LanguageModelV3 }

const dummyModel = {} as unknown as LanguageModelV3

/**
 * 测试辅助函数：`makeTransformCtx`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeTransformCtx(params: LanguageModelV3CallOptions, type: TransformParamsCtx['type'] = 'generate'): TransformParamsCtx {
  return { type, params, model: dummyModel }
}

describe('stream-chat-utils', () => {
  it('normalizeModelIdForRules: trims and lowercases', () => {
    expect(normalizeModelIdForRules('  GPT-4o  ')).toBe('gpt-4o')
    expect(normalizeModelIdForRules('')).toBe('')
  })

  it('resolveEffectiveProviderType: splits new-api by transportProtocol', () => {
    expect(resolveEffectiveProviderType({ providerType: 'openai', transportProtocol: 'anthropic-messages' })).toBe('openai')
    expect(resolveEffectiveProviderType({ providerId: 'openai', providerType: 'openai', transportProtocol: 'openai-responses' })).toBe('openai-response')
    expect(resolveEffectiveProviderType({ providerType: 'new-api', transportProtocol: 'anthropic-messages' })).toBe('anthropic')
    expect(resolveEffectiveProviderType({ providerType: 'new-api', transportProtocol: 'gemini-generate-content' })).toBe('gemini')
    expect(resolveEffectiveProviderType({ providerType: 'new-api', transportProtocol: 'openai-responses' })).toBe('openai-response')
    expect(resolveEffectiveProviderType({ providerType: 'new-api', transportProtocol: 'unknown' })).toBe('openai')
  })

  it('getProviderOptionsKey: picks correct namespace', () => {
    expect(getProviderOptionsKey({ providerId: 'openai', providerType: 'openai-response', effectiveProviderType: 'openai-response' })).toBe(
      'openai',
    )
    expect(getProviderOptionsKey({ providerId: 'openai', providerType: 'openai', effectiveProviderType: 'openai' })).toBe('openai')
    expect(getProviderOptionsKey({ providerId: 'cohere', providerType: 'cohere', effectiveProviderType: 'cohere' })).toBe('cohere')
    expect(getProviderOptionsKey({ providerId: 'deepseek', providerType: 'deepseek', effectiveProviderType: 'deepseek' })).toBe('deepseek')
    expect(getProviderOptionsKey({ providerId: 'groq', providerType: 'groq', effectiveProviderType: 'groq' })).toBe('groq')
    expect(getProviderOptionsKey({ providerId: 'xai', providerType: 'xai', effectiveProviderType: 'xai' })).toBe('xai')
    expect(getProviderOptionsKey({ providerId: 'moonshot', providerType: 'openai', effectiveProviderType: 'openai' })).toBe('moonshot')
    expect(getProviderOptionsKey({ providerId: 'azure-openai', providerType: 'azure-openai', effectiveProviderType: 'azure-openai' })).toBe(
      'azure-openai',
    )
    expect(getProviderOptionsKey({ providerId: 'ollama', providerType: 'ollama', effectiveProviderType: 'ollama' })).toBe('ollama')
    expect(getProviderOptionsKey({ providerId: 'anthropic', providerType: 'anthropic', effectiveProviderType: 'anthropic' })).toBe('anthropic')
    expect(getProviderOptionsKey({ providerId: 'vertexai', providerType: 'vertexai', effectiveProviderType: 'vertexai' })).toBe('vertex')
    expect(getProviderOptionsKey({ providerId: 'google', providerType: 'gemini', effectiveProviderType: 'gemini' })).toBe('google')
    expect(getProviderOptionsKey({ providerId: 'aws-bedrock', providerType: 'aws-bedrock', effectiveProviderType: 'aws-bedrock' })).toBe('bedrock')
  })

  it('getOpenAiCompatibleProviderKey: only for openai-compatible providers', () => {
    expect(getOpenAiCompatibleProviderKey({ providerId: 'azure-openai', providerType: 'azure-openai', effectiveProviderType: 'azure-openai' })).toBe(
      'azure-openai',
    )
    expect(getOpenAiCompatibleProviderKey({ providerId: 'ollama', providerType: 'ollama', effectiveProviderType: 'ollama' })).toBe('ollama')
    expect(getOpenAiCompatibleProviderKey({ providerId: 'moonshot', providerType: 'openai', effectiveProviderType: 'openai' })).toBe('moonshot')
    expect(getOpenAiCompatibleProviderKey({ providerId: 'deepseek', providerType: 'deepseek', effectiveProviderType: 'deepseek' })).toBeNull()
    expect(getOpenAiCompatibleProviderKey({ providerId: 'groq', providerType: 'groq', effectiveProviderType: 'groq' })).toBeNull()
    expect(getOpenAiCompatibleProviderKey({ providerId: 'xai', providerType: 'xai', effectiveProviderType: 'xai' })).toBeNull()
    expect(getOpenAiCompatibleProviderKey({ providerId: 'cohere', providerType: 'cohere', effectiveProviderType: 'cohere' })).toBeNull()
    expect(getOpenAiCompatibleProviderKey({ providerId: 'openai', providerType: 'openai', effectiveProviderType: 'openai' })).toBeNull()
    expect(getOpenAiCompatibleProviderKey({ providerId: 'new-api', providerType: 'new-api', effectiveProviderType: 'openai' })).toBe('new-api')
    expect(getOpenAiCompatibleProviderKey({ providerId: 'new-api', providerType: 'new-api', effectiveProviderType: 'anthropic' })).toBeNull()
  })

  it('pickReasoningTagName: chooses tag based on model id', () => {
    expect(pickReasoningTagName('gpt-oss-120b')).toBe('reasoning')
    expect(pickReasoningTagName('gemini-3-pro')).toBe('thought')
    expect(pickReasoningTagName('seed-oss-36b')).toBe('seed:think')
    expect(pickReasoningTagName('gpt-4o')).toBe('think')
  })

  it('isGemini3ModelId: detects gemini-3', () => {
    expect(isGemini3ModelId('gemini-3-pro')).toBe(true)
    expect(isGemini3ModelId('gemini-2.0-flash')).toBe(false)
  })

  it('shouldAppendQwenThinkingSuffix: detects Qwen families and excludes instruct/thinking/coder', () => {
    expect(shouldAppendQwenThinkingSuffix('qwen3-8b')).toBe(true)
    expect(shouldAppendQwenThinkingSuffix('qwen3-instruct')).toBe(false)
    expect(shouldAppendQwenThinkingSuffix('qwen3-thinking')).toBe(false)
    expect(shouldAppendQwenThinkingSuffix('qwen3-coder')).toBe(false)
    expect(shouldAppendQwenThinkingSuffix('qwen-plus')).toBe(true)
    expect(shouldAppendQwenThinkingSuffix('qwen-plus-instruct')).toBe(false)
    expect(shouldAppendQwenThinkingSuffix('qwen3-max')).toBe(true)
  })

	  it('createStrictInterleaveMiddleware: inserts empty messages between consecutive same-role', async () => {
	    const mw = createStrictInterleaveMiddleware()
	    const params: LanguageModelV3CallOptions = {
	      prompt: [
	        { role: 'user', content: [{ type: 'text', text: 'u1' }] },
	        { role: 'user', content: [{ type: 'text', text: 'u2' }] },
	        { role: 'assistant', content: [{ type: 'text', text: 'a1' }] },
	        { role: 'assistant', content: [{ type: 'text', text: 'a2' }] },
	      ],
	    }

	    const next = await mw.transformParams!(makeTransformCtx(params))
	    const roles = (next.prompt as LanguageModelV3Message[]).map((m) => m.role)
	    expect(roles).toEqual(['user', 'assistant', 'user', 'assistant', 'user', 'assistant'])
	  })

	  it('createAppendSuffixToUserMessagesMiddleware: appends suffix to last user text part', async () => {
	    const mw = createAppendSuffixToUserMessagesMiddleware({ suffix: ' /think' })
	    const params: LanguageModelV3CallOptions = {
	      prompt: [
	        { role: 'system', content: 's' },
	        { role: 'user', content: [{ type: 'text', text: 'hello' }] },
	        { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
	      ],
	    }

	    const next = await mw.transformParams!(makeTransformCtx(params))
	    const prompt = next.prompt as LanguageModelV3Message[]
	    const parts = prompt[1]!.content as unknown as Array<{ type: 'text'; text: string }>
	    expect(parts[0]!.text).toBe('hello /think')
	  })

	  it('createAppendSuffixToUserMessagesMiddleware: does not double-append', async () => {
	    const mw = createAppendSuffixToUserMessagesMiddleware({ suffix: ' /no_think' })
	    const params: LanguageModelV3CallOptions = {
	      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello /no_think' }] }],
	    }
	    const next = await mw.transformParams!(makeTransformCtx(params))
	    const prompt = next.prompt as LanguageModelV3Message[]
	    const parts = prompt[0]!.content as unknown as Array<{ type: 'text'; text: string }>
	    expect(parts[0]!.text).toBe('hello /no_think')
	  })

	  it('createOpenrouterReasoningRedactionMiddleware: removes [REDACTED] in wrapGenerate', async () => {
	    const mw = createOpenrouterReasoningRedactionMiddleware()
	    const params: LanguageModelV3CallOptions = { prompt: [] }
		    const out = await mw.wrapGenerate!({
		      doGenerate: async (): Promise<LanguageModelV3GenerateResult> => ({
		        content: [
		          { type: 'text', text: 'hello' },
		          { type: 'reasoning', text: 'a[REDACTED]b' },
		        ],
		        finishReason: { unified: 'stop', raw: 'stop' },
		        usage: {
		          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
		          outputTokens: { total: 1, text: 1, reasoning: 0 },
		        },
		        warnings: [],
		      }),
	      doStream: async (): Promise<LanguageModelV3StreamResult> => ({
	        stream: new ReadableStream<LanguageModelV3StreamPart>({
	          	          /**
	           * 内部方法：`start`。
	           *
	           * @remarks
	           * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
	           */
	          start(controller) {
	            controller.close()
	          },
	        }),
	      }),
	      params,
	      model: dummyModel,
	    })

	    const reasoning = out.content.find((p: { type?: unknown }) => p.type === 'reasoning')
	    const reasoningText =
	      reasoning && typeof (reasoning as { text?: unknown }).text === 'string'
	        ? (reasoning as { text: string }).text
	        : undefined
	    expect(reasoningText).toBe('ab')
	  })

	  it('estimateContentTokens: counts tokens for text parts', () => {
	    expect(estimateContentTokens('hello')).toBeGreaterThan(0)
	    expect(estimateContentTokens([{ type: 'text', text: 'hello' }] as unknown as LanguageModelV3Message['content'])).toBeGreaterThan(0)
	    expect(estimateContentTokens([{ type: 'image', image: 'x' }] as unknown as LanguageModelV3Message['content'])).toBe(0)
	  })

	  it('createAnthropicPromptCachingMiddleware: marks system and last N messages', async () => {
	    const mw = createAnthropicPromptCachingMiddleware({ tokenThreshold: 1, cacheSystemMessage: true, cacheLastNMessages: 1 })
	    const params: LanguageModelV3CallOptions = {
	      prompt: [
	        { role: 'system', content: 'system message' },
	        { role: 'user', content: [{ type: 'text', text: 'hello' }] },
	      ],
	    }

	    const next = await mw.transformParams!(makeTransformCtx(params))
	    const prompt = next.prompt as unknown as Array<Record<string, unknown>>

	    const sysProviderOptions = (prompt[0]?.providerOptions ?? null) as unknown as Record<string, unknown> | null
	    const sysAnthropic = (sysProviderOptions?.anthropic ?? null) as unknown as Record<string, unknown> | null
	    const sysCache = (sysAnthropic?.cacheControl ?? null) as unknown as Record<string, unknown> | null
	    expect(sysCache?.type).toBe('ephemeral')

	    const userContent = (prompt[1]?.content ?? null) as unknown as Array<Record<string, unknown>> | null
	    const userPart0 = userContent?.[0] ?? null
	    const userProviderOptions = (userPart0?.providerOptions ?? null) as unknown as Record<string, unknown> | null
	    const userAnthropic = (userProviderOptions?.anthropic ?? null) as unknown as Record<string, unknown> | null
	    const userCache = (userAnthropic?.cacheControl ?? null) as unknown as Record<string, unknown> | null
	    expect(userCache?.type).toBe('ephemeral')
	  })

	  it('createSkipGeminiThoughtSignatureMiddleware: injects thoughtSignature marker', async () => {
	    const mw = createSkipGeminiThoughtSignatureMiddleware('google')
	    const params: LanguageModelV3CallOptions = {
      prompt: [
        {
          role: 'assistant',
          content: [
            { type: 'reasoning', text: 'r' },
            { type: 'tool-call', toolCallId: 'tc1', toolName: 't', input: { a: 1 } },
          ],
        },
	      ],
	    }

	    const next = await mw.transformParams!(makeTransformCtx(params))
	    const prompt = next.prompt as unknown as Array<Record<string, unknown>>
	    const msg0 = (prompt[0] ?? null) as unknown as { content?: unknown }
	    const parts = (msg0?.content ?? null) as unknown as Array<Record<string, unknown>> | null
	    const reasoningPart = parts?.[0] ?? null
	    const toolCallPart = parts?.[1] ?? null

	    const reasoningProviderOptions = (reasoningPart?.providerOptions ?? null) as unknown as Record<string, unknown> | null
	    const reasoningGoogle = (reasoningProviderOptions?.google ?? null) as unknown as Record<string, unknown> | null
	    const reasoningSig = reasoningGoogle?.thoughtSignature

	    const toolProviderOptions = (toolCallPart?.providerOptions ?? null) as unknown as Record<string, unknown> | null
	    const toolOpenaiCompat = (toolProviderOptions?.openaiCompatible ?? null) as unknown as Record<string, unknown> | null
	    const toolExtra = (toolOpenaiCompat?.extra_content ?? null) as unknown as Record<string, unknown> | null
	    const toolGoogle = (toolExtra?.google ?? null) as unknown as Record<string, unknown> | null
	    const toolSig = toolGoogle?.thought_signature

	    expect(reasoningSig).toBe('skip_thought_signature_validator')
	    expect(toolSig).toBe('skip_thought_signature_validator')
	  })
	})
