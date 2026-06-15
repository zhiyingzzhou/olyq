/**
 * 说明：`resolved-conversation.test` 基础能力模块。
 *
 * 职责：
 * - 承载 `resolved-conversation.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只覆盖运行时上下文的参数回退语义，不扩散到消息发送链路。
 */
import { describe, expect, it } from 'vitest'

import { buildResolvedConversationContext } from './resolved-conversation'
import type { Assistant } from '@/types/assistant'
import type { ChatSettings, Topic } from '@/types/chat'

/**
 * 测试辅助函数：`makeAssistant`。
 *
 * @remarks
 * 用于当前测试中的最小 assistant 场景搭建，不作为运行时代码复用。
 */
function makeAssistant(overrides: Partial<Assistant> = {}): Assistant {
  const { scenario = 'general', ...rest } = overrides
  return {
    id: 'assistant-1',
    scenario,
    name: 'Assistant',
    prompt: 'assistant prompt',
    topics: [],
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...rest,
  }
}

/**
 * 测试辅助函数：`makeTopic`。
 *
 * @remarks
 * 用于当前测试中的最小 topic 场景搭建，不作为运行时代码复用。
 */
function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: 'topic-1',
    assistantId: 'assistant-1',
    name: 'Topic',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

/**
 * 测试辅助函数：`makeSettings`。
 *
 * @remarks
 * 用于当前测试中的最小聊天设置搭建，不作为运行时代码复用。
 */
function makeSettings(overrides: Partial<ChatSettings> = {}): ChatSettings {
  return {
    defaultModel: 'openai/gpt-5.4',
    defaultTemperature: 0.7,
    defaultTopP: 0.9,
    defaultMaxTokens: 1024,
    defaultContextLength: 20,
    defaultSystemPrompt: 'sys',
    defaultImagePromptPrefix: '',
    ...overrides,
  }
}

describe('buildResolvedConversationContext', () => {
  it('不会凭空注入 provider-native reasoning 配置', () => {
    const resolved = buildResolvedConversationContext({
      assistant: makeAssistant(),
      topic: makeTopic({
        model: 'openrouter/openai/gpt-5',
      }),
      messages: [],
      settings: makeSettings(),
    })

    expect(resolved.model).toBe('openrouter/openai/gpt-5')
    expect(resolved.modelParams).toBeUndefined()
  })

  it('会保留 topic 上显式配置的 provider-native reasoning 参数', () => {
    const resolved = buildResolvedConversationContext({
      assistant: makeAssistant(),
      topic: makeTopic({
        model: 'openai/gpt-5.4',
        modelParams: { reasoning_effort: 'high' },
      }),
      messages: [],
      settings: makeSettings(),
    })

    expect(resolved.modelParams).toEqual({ reasoning_effort: 'high' })
  })

  it('topic 缺失生成参数时回落全局默认值，不读取 assistant 旧字段', () => {
    const resolved = buildResolvedConversationContext({
      assistant: {
        ...makeAssistant(),
        model: 'legacy/assistant-model',
        temperature: 1.8,
        modelParams: { legacy: true },
      } as Assistant,
      topic: makeTopic(),
      messages: [],
      settings: makeSettings({
        defaultModel: 'global/model',
        defaultTemperature: 0.2,
        defaultTopP: 0.5,
        defaultMaxTokens: 512,
        defaultContextLength: 8,
      }),
    })

    expect(resolved.model).toBe('global/model')
    expect(resolved.temperature).toBe(0.2)
    expect(resolved.topP).toBe(0.5)
    expect(resolved.maxTokens).toBe(512)
    expect(resolved.contextLength).toBe(8)
    expect(resolved.modelParams).toBeUndefined()
  })
})
