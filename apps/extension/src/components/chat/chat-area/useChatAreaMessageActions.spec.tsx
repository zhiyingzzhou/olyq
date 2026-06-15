/**
 * 说明：`useChatAreaMessageActions.spec` 组件模块。
 *
 * 职责：
 * - 承载 `useChatAreaMessageActions.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Message, ResolvedConversationContext } from '@/types/chat'
import { useChatAreaMessageActions } from './useChatAreaMessageActions'

const {
  clearTopicMessagesMock,
  generateSpeechAttachmentMock,
  getChatStoreStateMock,
  getChatSettingsStateMock,
  toastMock,
} = vi.hoisted(() => ({
  clearTopicMessagesMock: vi.fn(),
  generateSpeechAttachmentMock: vi.fn(),
  getChatStoreStateMock: vi.fn(),
  getChatSettingsStateMock: vi.fn(),
  toastMock: vi.fn(),
}))

vi.mock('@/lib/speech', () => ({
  generateSpeechAttachment: generateSpeechAttachmentMock,
}))

vi.mock('@/hooks/useChatSettingsStore', () => ({
  useChatSettingsStore: {
    getState: getChatSettingsStateMock,
  },
}))

vi.mock('@/hooks/useChatStore', () => ({
  useChatStore: {
    getState: getChatStoreStateMock,
  },
}))

vi.mock('@/hooks/useToast', () => ({
  toast: toastMock,
}))

/**
 * 测试辅助函数：`createTopic`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createTopic(messages: Message[] = []): ResolvedConversationContext {
  return {
    id: 'topic-1',
    title: 'Topic',
    messages,
    folderId: null,
    pinned: false,
    createdAt: 1,
    updatedAt: 1,
    assistantId: 'assistant-1',
    topicPrompt: '',
    isNameManuallyEdited: false,
    order: 1,
    systemPrompt: '',
    model: 'openai/gpt-4.1',
    temperature: 0.7,
    topP: 1,
    maxTokens: 512,
    contextLength: 20,
    modelParams: {},
    mcpSelection: { mode: 'auto', manualServerIds: [] },
    enableGenerateImage: false,
    enableWebSearch: false,
  }
}

/**
 * 测试辅助函数：`createT`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createT() {
  return ((key: string) => {
    if (key === 'common.tip') return '提示'
    if (key === 'common.success') return '成功'
    if (key === 'common.error') return '错误'
    if (key === 'chat.speechGenerating') return '正在生成朗读音频…'
    if (key === 'chat.speechAdded') return '朗读音频已添加到当前消息。'
    if (key === 'chat.speechModelMissingTitle') return '未配置朗读模型'
    if (key === 'chat.speechModelMissingDesc') return '当前还没有配置默认朗读模型。'
    if (key === 'chat.speechContentMissingTitle') return '当前消息不可朗读'
    if (key === 'chat.speechContentMissingDesc') return '当前 assistant 消息没有可用于语音合成的文本内容。'
    if (key === 'chat.speechPlaybackFailed') return '自动播放失败'
    return key
  }) as never
}

/**
 * 测试辅助函数：`createAssistantMessage`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createAssistantMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '这是一条 assistant 回复',
    createdAt: 1,
    ...overrides,
  }
}

describe('useChatAreaMessageActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getChatSettingsStateMock.mockReturnValue({
      settings: {
        defaultSpeechModel: 'openai/tts-1-hd',
        defaultSpeechVoice: 'alloy',
      },
    })
    generateSpeechAttachmentMock.mockResolvedValue({
      attachment: {
        type: 'file',
        id: 'speech-att-1',
        name: 'speech.mp3',
        mime: 'audio/mpeg',
        size: 5,
      },
      objectUrl: 'blob:speech-audio',
      mime: 'audio/mpeg',
      name: 'speech.mp3',
    })
    getChatStoreStateMock.mockReturnValue({
      clearTopicMessages: clearTopicMessagesMock,
    })
    vi.stubGlobal('Audio', vi.fn(function AudioMock() {
      return {
      addEventListener: vi.fn(),
      play: vi.fn(() => Promise.resolve()),
      }
    }))
    vi.stubGlobal('URL', {
      revokeObjectURL: vi.fn(),
    })
  })

  it('朗读 assistant 消息时会生成音频并把文件附件追加回当前消息', async () => {
    const latestMessagesRef: { current: Message[] } = {
      current: [createAssistantMessage()],
    }
    const onUpdateMessages = vi.fn((_: string, messages: Message[]) => {
      latestMessagesRef.current = messages
    })

    const { result } = renderHook(() => useChatAreaMessageActions({
      abortControllersRef: { current: new Map() },
      cleanupUnusedAttachments: vi.fn(),
      confirm: vi.fn(async () => true),
      discardTranslationTaskByReqId: vi.fn(),
      inputWrapRef: { current: null },
      isLoading: false,
      latestMessagesRef,
      onUpdateMessages,
      setExpandedThinkingIds: vi.fn(),
      scrollToBottom: vi.fn(),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(latestMessagesRef.current),
    }))

    await act(async () => {
      await result.current.speakMessage('assistant-1')
    })

    expect(generateSpeechAttachmentMock).toHaveBeenCalledWith({
      model: 'openai/tts-1-hd',
      text: '这是一条 assistant 回复',
      voice: 'alloy',
      signal: expect.any(AbortSignal),
    })
    expect(onUpdateMessages).toHaveBeenCalledTimes(1)
    expect(latestMessagesRef.current[0]?.attachments).toEqual([{
      type: 'file',
      id: 'speech-att-1',
      name: 'speech.mp3',
      mime: 'audio/mpeg',
      size: 5,
    }])
    expect(toastMock).toHaveBeenCalledWith({ title: '提示', description: '正在生成朗读音频…' })
    expect(toastMock).toHaveBeenCalledWith({ title: '成功', description: '朗读音频已添加到当前消息。' })
  })

  it('未配置默认朗读模型时会阻断朗读动作', async () => {
    getChatSettingsStateMock.mockReturnValue({
      settings: {
        defaultSpeechModel: undefined,
        defaultSpeechVoice: undefined,
      },
    })

    const { result } = renderHook(() => useChatAreaMessageActions({
      abortControllersRef: { current: new Map() },
      cleanupUnusedAttachments: vi.fn(),
      confirm: vi.fn(async () => true),
      discardTranslationTaskByReqId: vi.fn(),
      inputWrapRef: { current: null },
      isLoading: false,
      latestMessagesRef: {
        current: [createAssistantMessage()],
      },
      onUpdateMessages: vi.fn(),
      setExpandedThinkingIds: vi.fn(),
      scrollToBottom: vi.fn(),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(),
    }))

    await act(async () => {
      await result.current.speakMessage('assistant-1')
    })

    expect(generateSpeechAttachmentMock).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith({
      title: '未配置朗读模型',
      description: '当前还没有配置默认朗读模型。',
      variant: 'destructive',
    })
  })

  it('空会话点击清除上下文时应无任何反应', () => {
    const onUpdateMessages = vi.fn()
    const scrollToBottom = vi.fn()

    const { result } = renderHook(() => useChatAreaMessageActions({
      abortControllersRef: { current: new Map() },
      cleanupUnusedAttachments: vi.fn(),
      confirm: vi.fn(async () => true),
      discardTranslationTaskByReqId: vi.fn(),
      inputWrapRef: { current: null },
      isLoading: false,
      latestMessagesRef: { current: [] },
      onUpdateMessages,
      setExpandedThinkingIds: vi.fn(),
      scrollToBottom,
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(),
    }))

    act(() => {
      result.current.toggleNewContext()
    })

    expect(onUpdateMessages).not.toHaveBeenCalled()
    expect(scrollToBottom).not.toHaveBeenCalled()
  })

  it('清空当前话题消息时会传入完整 destructive 确认文案', async () => {
    const confirm = vi.fn(async () => false)
    const onUpdateMessages = vi.fn()
    const latestMessagesRef: { current: Message[] } = {
      current: [
        { id: 'user-1', role: 'user', content: 'hello', createdAt: 1 },
      ],
    }

    const { result } = renderHook(() => useChatAreaMessageActions({
      abortControllersRef: { current: new Map() },
      cleanupUnusedAttachments: vi.fn(),
      confirm,
      discardTranslationTaskByReqId: vi.fn(),
      inputWrapRef: { current: null },
      isLoading: false,
      latestMessagesRef,
      onUpdateMessages,
      setExpandedThinkingIds: vi.fn(),
      scrollToBottom: vi.fn(),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(latestMessagesRef.current),
    }))

    await act(async () => {
      await result.current.clearMessages()
    })

    expect(confirm).toHaveBeenCalledWith({
      title: 'chat.clearMessages',
      description: 'chat.clearMessagesConfirmDesc',
      confirmLabel: 'common.clear',
      cancelLabel: 'common.cancel',
      variant: 'destructive',
    })
    expect(onUpdateMessages).not.toHaveBeenCalled()
    expect(clearTopicMessagesMock).not.toHaveBeenCalled()
  })

  it('确认清空当前话题消息时会走统一 clearTopicMessages 语义', async () => {
    const confirm = vi.fn(async () => true)
    const onUpdateMessages = vi.fn()
    const latestMessagesRef: { current: Message[] } = {
      current: [
        { id: 'user-1', role: 'user', content: 'hello', createdAt: 1 },
      ],
    }

    const { result } = renderHook(() => useChatAreaMessageActions({
      abortControllersRef: { current: new Map() },
      cleanupUnusedAttachments: vi.fn(),
      confirm,
      discardTranslationTaskByReqId: vi.fn(),
      inputWrapRef: { current: null },
      isLoading: false,
      latestMessagesRef,
      onUpdateMessages,
      setExpandedThinkingIds: vi.fn(),
      scrollToBottom: vi.fn(),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(latestMessagesRef.current),
    }))

    await act(async () => {
      await result.current.clearMessages()
    })

    expect(clearTopicMessagesMock).toHaveBeenCalledWith('topic-1')
    expect(onUpdateMessages).not.toHaveBeenCalled()
  })
})
