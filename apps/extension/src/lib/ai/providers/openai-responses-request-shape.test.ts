/**
 * 说明：`openai-responses-request-shape.test` AI 能力测试模块。
 *
 * 职责：
 * - 固化 OpenAI Responses instructions 请求形态的三事实 gating；
 * - 防止后续把策略退化成 provider 名称、模型名或 endpoint 猜测。
 */
import { describe, expect, it } from 'vitest'
import { buildOpenAiResponsesSystemPromptPolicy } from './openai-responses-request-shape'

describe('openai-responses-request-shape', () => {
  it('只有 Responses transport、openai namespace 与显式 OpenAI 上游同时成立时才声明 instructions 策略', () => {
    expect(buildOpenAiResponsesSystemPromptPolicy({
      transportProtocol: 'openai-responses',
      providerOptionNamespaces: ['gateway', 'openai'],
      modelProviderSlug: 'openai',
    })).toEqual({
      systemPrompt: {
        target: 'provider-options-instructions',
        providerOptionsKey: 'openai',
        instructionsKey: 'instructions',
        systemMessageMode: 'remove',
      },
    })
  })

  it('缺少任一显式事实时保持普通 messages 形态', () => {
    expect(buildOpenAiResponsesSystemPromptPolicy({
      transportProtocol: 'openai-chat',
      providerOptionNamespaces: ['openai'],
      modelProviderSlug: 'openai',
    })).toBeUndefined()

    expect(buildOpenAiResponsesSystemPromptPolicy({
      transportProtocol: 'openai-responses',
      providerOptionNamespaces: ['gateway'],
      modelProviderSlug: 'openai',
    })).toBeUndefined()

    expect(buildOpenAiResponsesSystemPromptPolicy({
      transportProtocol: 'openai-responses',
      providerOptionNamespaces: ['openai'],
      modelProviderSlug: 'xai',
    })).toBeUndefined()
  })
})
