/**
 * 说明：`model-reference-reconciler.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `model-reference-reconciler.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProviderConfig } from './types'

const { resolveModelMetaMock, loadMemoryConfigMock, saveMemoryConfigMock, chatSettingsState, assistantState, paintStoreState } = vi.hoisted(() => ({
  resolveModelMetaMock: vi.fn(),
  loadMemoryConfigMock: vi.fn(),
  saveMemoryConfigMock: vi.fn(),
  chatSettingsState: {
    settings: {
      defaultModel: 'openai/invalid-chat',
      defaultImageModel: 'openai/invalid-image-default',
      defaultTemperature: 0.7,
      defaultTopP: 1,
      defaultMaxTokens: 4096,
      defaultContextLength: 10,
      defaultSystemPrompt: '',
      defaultImagePromptPrefix: '',
      topicNamingModel: 'openai/invalid-topic',
      translateModel: 'openai/invalid-translate',
    },
    setSettings: vi.fn(),
  },
  assistantState: {
    assistants: [
      {
        id: 'assistant-1',
        topics: [{ id: 'topic-1', model: 'openai/invalid-topic-model' }],
      },
    ],
    updateTopicMeta: vi.fn(),
  },
  paintStoreState: {
    paintings: [
      { id: 'painting-1', model: 'openai/invalid-image' },
    ],
    patchPainting: vi.fn(),
  },
}))

vi.mock('./model-registry', () => ({
  resolveModelMetaFromRegistry: resolveModelMetaMock,
}))

vi.mock('@/lib/memory', () => ({
  loadMemoryConfig: loadMemoryConfigMock,
  saveMemoryConfig: saveMemoryConfigMock,
}))

vi.mock('@/hooks/useChatSettingsStore', () => ({
  useChatSettingsStore: {
    getState: () => chatSettingsState,
  },
}))

vi.mock('@/hooks/useAssistantStore', () => ({
  useAssistantStore: {
    getState: () => assistantState,
  },
}))

vi.mock('@/hooks/usePaintStore', () => ({
  usePaintStore: {
    getState: () => paintStoreState,
  },
}))

describe('reconcileModelReferences', () => {
  beforeEach(() => {
    vi.resetModules()
    resolveModelMetaMock.mockReset()
    loadMemoryConfigMock.mockReset()
    saveMemoryConfigMock.mockReset()
    chatSettingsState.setSettings.mockReset()
    assistantState.updateTopicMeta.mockReset()
    paintStoreState.patchPainting.mockReset()

    chatSettingsState.settings = {
      defaultModel: 'openai/invalid-chat',
      defaultImageModel: 'openai/invalid-image-default',
      defaultTemperature: 0.7,
      defaultTopP: 1,
      defaultMaxTokens: 4096,
      defaultContextLength: 10,
      defaultSystemPrompt: '',
      defaultImagePromptPrefix: '',
      topicNamingModel: 'openai/invalid-topic',
      translateModel: 'openai/invalid-translate',
    }
    assistantState.assistants = [{
      id: 'assistant-1',
      topics: [{ id: 'topic-1', model: 'openai/invalid-topic-model' }],
    }]
    paintStoreState.paintings = [{ id: 'painting-1', model: 'openai/invalid-image' }]
  })

  it('会把失效模型引用统一修复到当前可用候选', async () => {
    const providers: ProviderConfig[] = [
      {
        id: 'openai',
        name: 'OpenAI',
        type: 'openai',
        apiKey: 'k',
        apiHost: 'https://api.openai.com/v1',
        enabled: true,
        models: [
          { id: 'chat-model', name: 'Chat Model' },
          { id: 'image-model', name: 'Image Model' },
          { id: 'embed-model', name: 'Embed Model' },
        ],
      },
      {
        id: 'cohere',
        name: 'Cohere',
        type: 'cohere',
        apiKey: 'k',
        apiHost: 'https://api.cohere.com',
        enabled: true,
        models: [
          { id: 'rerank-model', name: 'Rerank Model' },
        ],
      },
    ]

    loadMemoryConfigMock.mockReturnValue({
      enabled: true,
      embeddingModel: 'openai/invalid-embedding',
      llmModel: 'openai/invalid-llm',
      rerankModel: 'cohere/invalid-rerank',
      topK: 5,
    })

    resolveModelMetaMock.mockImplementation((_registry: unknown, input: { rawModelId?: string }) => {
      switch (input.rawModelId) {
        case 'chat-model':
          return { kind: 'chat' }
        case 'image-model':
          return { kind: 'image-generation' }
        case 'embed-model':
          return { kind: 'embedding' }
        case 'rerank-model':
          return { kind: 'rerank' }
        default:
          return { kind: 'unknown' }
      }
    })

    const { reconcileModelReferences } = await import('./model-reference-reconciler')

    const summary = reconcileModelReferences({
      providers,
      registry: { canonicalModels: {} } as never,
    })

    expect(chatSettingsState.setSettings).toHaveBeenCalledWith(expect.objectContaining({
      defaultModel: 'openai/chat-model',
      defaultImageModel: 'openai/image-model',
      topicNamingModel: undefined,
      translateModel: undefined,
    }))
    expect(assistantState.updateTopicMeta).toHaveBeenCalledWith('topic-1', { model: 'openai/chat-model' })
    expect(saveMemoryConfigMock).toHaveBeenCalledWith(expect.objectContaining({
      embeddingModel: undefined,
      llmModel: undefined,
      rerankModel: undefined,
    }))
    expect(paintStoreState.patchPainting).toHaveBeenCalledWith('painting-1', { model: 'openai/image-model' })
    expect(summary).toEqual({
      chatSettingsPatched: 4,
      topicsPatched: 1,
      memoryPatched: 3,
      paintingsPatched: 1,
    })
  })

  it('默认对话模型会从图片模型回退到 chat，而默认生图模型保留图片模型', async () => {
    const providers: ProviderConfig[] = [
      {
        id: 'openai',
        name: 'OpenAI',
        type: 'openai',
        apiKey: 'k',
        apiHost: 'https://api.openai.com/v1',
        enabled: true,
        models: [
          { id: 'chat-model', name: 'Chat Model' },
          { id: 'image-model', name: 'Image Model' },
          { id: 'embed-model', name: 'Embed Model' },
        ],
      },
      {
        id: 'cohere',
        name: 'Cohere',
        type: 'cohere',
        apiKey: 'k',
        apiHost: 'https://api.cohere.com',
        enabled: true,
        models: [
          { id: 'rerank-model', name: 'Rerank Model' },
        ],
      },
    ]

    chatSettingsState.settings = {
      ...chatSettingsState.settings,
      defaultModel: 'openai/image-model',
      defaultImageModel: 'openai/image-model',
      topicNamingModel: 'openai/image-model',
      translateModel: 'openai/image-model',
    }
    assistantState.assistants = [{
      id: 'assistant-1',
      topics: [{ id: 'topic-1', model: 'openai/image-model' }],
    }]
    paintStoreState.paintings = [{ id: 'painting-1', model: 'openai/image-model' }]

    loadMemoryConfigMock.mockReturnValue({
      enabled: true,
      embeddingModel: 'openai/embed-model',
      llmModel: 'openai/image-model',
      rerankModel: 'cohere/rerank-model',
      topK: 5,
    })

    resolveModelMetaMock.mockImplementation((_registry: unknown, input: { rawModelId?: string }) => {
      switch (input.rawModelId) {
        case 'chat-model':
          return { kind: 'chat' }
        case 'image-model':
          return { kind: 'image-generation' }
        case 'embed-model':
          return { kind: 'embedding' }
        case 'rerank-model':
          return { kind: 'rerank' }
        default:
          return { kind: 'unknown' }
      }
    })

    const { reconcileModelReferences } = await import('./model-reference-reconciler')

    const summary = reconcileModelReferences({
      providers,
      registry: { canonicalModels: {} } as never,
    })

    expect(chatSettingsState.setSettings).toHaveBeenCalledWith(expect.objectContaining({
      defaultModel: 'openai/chat-model',
      defaultImageModel: 'openai/image-model',
      topicNamingModel: undefined,
      translateModel: undefined,
    }))
    expect(assistantState.updateTopicMeta).not.toHaveBeenCalled()
    expect(saveMemoryConfigMock).toHaveBeenCalledWith(expect.objectContaining({
      embeddingModel: 'openai/embed-model',
      llmModel: undefined,
      rerankModel: 'cohere/rerank-model',
    }))
    expect(paintStoreState.patchPainting).not.toHaveBeenCalled()
    expect(summary).toEqual({
      chatSettingsPatched: 3,
      topicsPatched: 0,
      memoryPatched: 1,
      paintingsPatched: 0,
    })
  })
})
