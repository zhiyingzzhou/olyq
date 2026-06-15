/**
 * 说明：`useChatAreaSendActions.spec` 组件模块。
 *
 * 职责：
 * - 承载 `useChatAreaSendActions.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Message, MessageAttachment, ResolvedConversationContext } from '@/types/chat'
import { useChatAreaSendActions } from './useChatAreaSendActions'
import {
  DEFAULT_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS,
  FULL_PAGE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS,
  STYLE_CAPTURE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS,
} from './browser-context-send-budget'

const {
  buildChatSystemContentMock,
  runStreamChatMock,
  toastMock,
  transcribeAttachmentMock,
  getChatSettingsStateMock,
  getAttachmentBlobMock,
  blobToDataUrlMock,
  getProviderViewMock,
  resolveModelMetaMock,
  applyUserModelTypesMock,
  resolveProviderContractMock,
  resolveBrowserContextEffectiveStateMock,
  resolveBrowserContextForSendMock,
  buildPageStyleVisionAttachmentsFromFramesMock,
  supportsPageStyleVisionInputMock,
  splitModelMock,
  collectInputImagesFromAttachmentsMock,
  generateImageReplyAttachmentsMock,
  runAutoRenameMock,
} = vi.hoisted(() => ({
  buildChatSystemContentMock: vi.fn(),
  runStreamChatMock: vi.fn(),
  toastMock: vi.fn(),
  transcribeAttachmentMock: vi.fn(),
  getChatSettingsStateMock: vi.fn(),
  getAttachmentBlobMock: vi.fn(),
  blobToDataUrlMock: vi.fn(),
  getProviderViewMock: vi.fn(),
  resolveModelMetaMock: vi.fn(),
  applyUserModelTypesMock: vi.fn(),
  resolveProviderContractMock: vi.fn(),
  resolveBrowserContextEffectiveStateMock: vi.fn(),
  resolveBrowserContextForSendMock: vi.fn(),
  buildPageStyleVisionAttachmentsFromFramesMock: vi.fn(),
  supportsPageStyleVisionInputMock: vi.fn(),
  splitModelMock: vi.fn(),
  collectInputImagesFromAttachmentsMock: vi.fn(),
  generateImageReplyAttachmentsMock: vi.fn(),
  runAutoRenameMock: vi.fn(),
}))

vi.mock('@/lib/chat/context-pipeline', () => ({
  buildChatSystemContent: buildChatSystemContentMock,
}))

vi.mock('@/lib/chat/chat-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/chat/chat-utils')>('@/lib/chat/chat-utils')
  return {
    ...actual,
  }
})

vi.mock('@/lib/chat/run-stream-chat', () => ({
  runStreamChat: runStreamChatMock,
}))

vi.mock('@/hooks/useToast', () => ({
  toast: toastMock,
}))

vi.mock('@/lib/transcription', () => ({
  transcribeAttachment: transcribeAttachmentMock,
}))

vi.mock('@/lib/attachments', () => ({
  getAttachmentBlob: getAttachmentBlobMock,
  blobToDataUrl: blobToDataUrlMock,
}))

vi.mock('@/lib/ai/provider-storage', () => ({
  getProviderView: getProviderViewMock,
}))

vi.mock('@/lib/ai/model-registry/resolver', () => ({
  resolveModelMeta: resolveModelMetaMock,
}))

vi.mock('@/lib/ai/model-type-system', () => ({
  applyUserModelTypes: applyUserModelTypesMock,
}))

vi.mock('@/lib/ai/providers/provider-contracts', () => ({
  resolveProviderContract: resolveProviderContractMock,
}))

vi.mock('@/lib/ai/provider-model-id', () => ({
  splitModel: splitModelMock,
}))

vi.mock('@/lib/browser-context', () => ({
  resolveBrowserContextEffectiveState: resolveBrowserContextEffectiveStateMock,
  resolveBrowserContextForSend: resolveBrowserContextForSendMock,
}))

vi.mock('@/hooks/useChatSettingsStore', () => ({
  useChatSettingsStore: {
    getState: getChatSettingsStateMock,
  },
}))

vi.mock('./page-style-input', () => ({
  buildPageStyleVisionAttachmentsFromFrames: buildPageStyleVisionAttachmentsFromFramesMock,
  supportsPageStyleVisionInput: supportsPageStyleVisionInputMock,
}))

vi.mock('./shared', () => ({
  collectInputImagesFromAttachments: collectInputImagesFromAttachmentsMock,
  generateImageReplyAttachments: generateImageReplyAttachmentsMock,
  runAutoRename: runAutoRenameMock,
}))

/**
 * 测试辅助函数：`createDeferred`。
 *
 * @remarks
 * 用于显式卡住某个异步目标，验证“第二个目标已经启动时，第一个目标仍未完成”的并发时序。
 */
function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })
  return { promise, resolve, reject }
}

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
    model: 'provider/model',
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
 * 测试辅助函数：`createPageStyleEffectiveState`。
 *
 * @remarks
 * 统一生成页面风格输入的 `effectiveState` mock，避免测试继续回退到旧的 `conversationMode` 返回协议。
 */
function createPageStyleEffectiveState(overrides?: {
  effective?: boolean
  fullPageEnabled?: boolean
  styleSignalsEnabled?: boolean
}) {
  return {
    effective: overrides?.effective ?? true,
    conversationMode: {
      enabled: overrides?.effective ?? true,
      fullPageEnabled: overrides?.fullPageEnabled ?? false,
      styleSignalsEnabled: overrides?.styleSignalsEnabled ?? true,
    },
  }
}

/**
 * 测试辅助函数：`createT`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createT() {
  return ((key: string, params?: Record<string, unknown>) => {
    if (key === 'common.tip') return '提示'
    if (key === 'common.error') return '错误'
    if (key === 'chat.transcriptionPreparing') return '正在转写音频附件…'
    if (key === 'chat.transcriptionModelMissingTitle') return '未配置转写模型'
    if (key === 'chat.transcriptionModelMissingDesc') return '检测到音频附件，但当前还没有配置默认转写模型。'
    if (key === 'chat.transcriptionAttachmentLabel') return `语音转写：${params?.name ?? ''}`
    if (key === 'chat.generationCancelled') return '已取消生成'
    if (key === 'common.cancelled') return '已取消'
    if (key === 'errors.unknownWithDetail') return String(params?.detail || '')
    if (key === 'elementContext.kind.text') return '文本'
    if (key === 'elementContext.summary.text') return `文本 · ${params?.tag ?? ''} · 约 ${params?.count ?? ''} 字`
    if (key === 'elementContext.markdown.heading') return `页面元素引用：${params?.title ?? ''}`
    if (key === 'elementContext.markdown.source') return `来源：${params?.source ?? ''}`
    return key
  }) as never
}

/**
 * 测试辅助函数：`createAudioAttachment`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createAudioAttachment(): MessageAttachment {
  return {
    type: 'file',
    id: 'audio-1',
    name: 'meeting.mp3',
    mime: 'audio/mpeg',
    size: 1024,
  }
}

/**
 * 测试辅助函数：`createFileAttachment`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createFileAttachment(overrides: Partial<Extract<MessageAttachment, { type: 'file' }>> = {}): MessageAttachment {
  return {
    type: 'file',
    id: 'file-1',
    name: 'report.pdf',
    mime: 'application/pdf',
    size: 2048,
    ...overrides,
  }
}

/**
 * 测试辅助函数：`installOutboundRasterMocks`。
 *
 * @remarks
 * jsdom 不会真实解码图片或绘制 Canvas；这里固定栅格化能力，让发送链路可以验证 SVG 出站会被转成 PNG。
 */
function installOutboundRasterMocks() {
  const originalCreateObjectUrl = URL.createObjectURL
  const originalRevokeObjectUrl = URL.revokeObjectURL
  const originalGetContext = HTMLCanvasElement.prototype.getContext
  const originalToBlob = HTMLCanvasElement.prototype.toBlob
  const originalImage = globalThis.Image

  URL.createObjectURL = vi.fn(() => 'blob:outbound-image') as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as unknown as typeof HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.toBlob = vi.fn((callback: BlobCallback) => {
    callback(new Blob(['png'], { type: 'image/png' }))
  }) as unknown as typeof HTMLCanvasElement.prototype.toBlob

  class MockImage {
    onload: ((event: Event) => void) | null = null
    onerror: ((event: Event) => void) | null = null
    naturalWidth = 64
    naturalHeight = 64
    width = 64
    height = 64

    /**
     * 模拟浏览器图片加载完成事件。
     */
    set src(_value: string) {
      queueMicrotask(() => this.onload?.(new Event('load')))
    }
  }
  vi.stubGlobal('Image', MockImage)

  return () => {
    URL.createObjectURL = originalCreateObjectUrl
    URL.revokeObjectURL = originalRevokeObjectUrl
    HTMLCanvasElement.prototype.getContext = originalGetContext
    HTMLCanvasElement.prototype.toBlob = originalToBlob
    vi.stubGlobal('Image', originalImage)
  }
}

describe('useChatAreaSendActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    buildChatSystemContentMock.mockResolvedValue({ systemContent: 'sys' })
    runStreamChatMock.mockResolvedValue(undefined)
    transcribeAttachmentMock.mockResolvedValue({
      text: '这是转写结果',
      segments: [],
    })
    getChatSettingsStateMock.mockReturnValue({
      settings: {
        defaultTranscriptionModel: 'together/openai-whisper-large-v3',
      },
    })
    getAttachmentBlobMock.mockResolvedValue(null)
    blobToDataUrlMock.mockResolvedValue('')
    supportsPageStyleVisionInputMock.mockImplementation((model: unknown) => {
      const record = model && typeof model === 'object' ? model as { kind?: unknown; inputModalities?: unknown; features?: unknown } : {}
      const kind = String(record.kind || '').trim()
      const inputModalities = Array.isArray(record.inputModalities) ? record.inputModalities.map((item) => String(item || '').trim()) : []
      const features = Array.isArray(record.features) ? record.features.map((item) => String(item || '').trim()) : []
      return kind === 'multimodal-chat' || inputModalities.includes('image') || features.includes('vision-input')
    })
    getProviderViewMock.mockResolvedValue({
      id: 'provider',
      name: 'Provider',
      type: 'openai',
      apiHost: 'https://example.com/v1',
      models: [{ id: 'model', name: 'model' }],
    })
    resolveModelMetaMock.mockResolvedValue({
      canonicalId: 'provider::openai::provider::model',
      baseModelKey: 'model',
      scope: 'provider',
      kind: 'chat',
      inputModalities: ['text'],
      outputModalities: ['text'],
      features: [],
      transportProtocol: 'openai-chat',
      displayName: 'model',
      confidence: 'medium',
    })
    applyUserModelTypesMock.mockImplementation((meta: unknown) => meta)
    resolveProviderContractMock.mockReturnValue({
      providerId: 'provider',
      transportFamily: 'openai-chat',
      inputPolicies: { image: 'supported', file: 'unsupported' },
      allowedProviderOptions: [],
      supportsResponses: false,
      supportsChatCompletions: true,
    })
    resolveBrowserContextEffectiveStateMock.mockReturnValue(createPageStyleEffectiveState())
    resolveBrowserContextForSendMock.mockResolvedValue({
      browserContext: { prompt: 'page context' },
      captureFrames: [],
      captureWarning: null,
      styleCapture: null,
      degraded: false,
      status: 'ready',
    })
    buildPageStyleVisionAttachmentsFromFramesMock.mockImplementation((frames: Array<{ dataUrl: string; name: string; mime: string }>) => (
      frames.map((frame) => ({
        type: 'image',
        url: frame.dataUrl,
        name: frame.name,
        mime: frame.mime,
      }))
    ))
    collectInputImagesFromAttachmentsMock.mockResolvedValue([])
    generateImageReplyAttachmentsMock.mockResolvedValue([])
    runAutoRenameMock.mockResolvedValue('')
    splitModelMock.mockImplementation((model: string) => {
      const [providerId = '', ...rest] = String(model || '').split('/')
      return {
        providerId,
        modelId: rest.join('/'),
      }
    })
  })

  it('发送音频附件时会先转写，再把转写文本并入统一聊天主链', async () => {
    const attachment = createAudioAttachment()
    const latestMessagesRef = { current: [] as Message[] }
    const setIsLoading = vi.fn()
    const scrollToBottom = vi.fn()
    const onUpdateMessages = vi.fn((_: string, messages: Message[]) => {
      latestMessagesRef.current = messages
    })

    const { result } = renderHook(() => useChatAreaSendActions({
      abortControllersRef: { current: new Map() },
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map(),
      onUpdateMessages,
      scrollToBottom,
      setIsLoading,
      t: createT(),
      topic: createTopic(),
    }))

    await act(async () => {
      await result.current.sendMessage({
        text: '请帮我总结这段录音',
        attachments: [attachment],
      })
    })

    expect(transcribeAttachmentMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'together/openai-whisper-large-v3',
      attachmentId: 'audio-1',
    }))
    expect(toastMock).toHaveBeenCalledWith({
      title: '提示',
      description: '正在转写音频附件…',
    })
    expect(onUpdateMessages).toHaveBeenCalledTimes(1)

    const sentMessages = onUpdateMessages.mock.calls[0]?.[1] as Message[]
    expect(sentMessages).toHaveLength(1)
    expect(sentMessages[0]).toEqual(expect.objectContaining({
      role: 'user',
      attachments: [attachment],
    }))
    expect(sentMessages[0]?.content).toContain('请帮我总结这段录音')
    expect(sentMessages[0]?.content).toContain('[语音转写：meeting.mp3]')
    expect(sentMessages[0]?.content).toContain('这是转写结果')

    expect(runStreamChatMock).toHaveBeenCalledTimes(1)
    const runArgs = runStreamChatMock.mock.calls[0]?.[0] as { apiMsgs: Array<{ role: string; content: string }> }
    expect(runArgs.apiMsgs).toEqual([
      { role: 'system', content: 'sys' },
      {
        role: 'user',
        content: '请帮我总结这段录音\n\n[语音转写：meeting.mp3]\n这是转写结果',
      },
    ])
    expect(runArgs.apiMsgs[1]?.content).not.toContain('[文件：meeting.mp3')
    expect(scrollToBottom).toHaveBeenCalledTimes(1)
    expect(setIsLoading).toHaveBeenNthCalledWith(1, true)
    expect(setIsLoading).toHaveBeenLastCalledWith(false)
  })

  it('发送新消息时会把 latest intent 接到首个 assistant commit', async () => {
    const latestMessagesRef = { current: [] as Message[] }
    const setIsLoading = vi.fn()
    const scrollToBottom = vi.fn()
    const scrollToBottomIfFollowing = vi.fn(() => true)
    const scrollToBottomAfterNextCommit = vi.fn()
    const onUpdateMessages = vi.fn((_: string, messages: Message[]) => {
      latestMessagesRef.current = messages
    })

    const { result } = renderHook(() => useChatAreaSendActions({
      abortControllersRef: { current: new Map() },
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map(),
      onUpdateMessages,
      scrollToBottom,
      scrollToBottomIfFollowing,
      scrollToBottomAfterNextCommit,
      setIsLoading,
      t: createT(),
      topic: createTopic(),
    }))

    runStreamChatMock.mockImplementation(async (options: { onInitialAssistantSnapshotCommitted?: () => void }) => {
      options.onInitialAssistantSnapshotCommitted?.()
    })

    await act(async () => {
      await result.current.sendMessage({
        text: '新消息滚动',
      })
    })

    expect(scrollToBottomAfterNextCommit).toHaveBeenCalledTimes(1)
    expect(scrollToBottomIfFollowing).toHaveBeenCalledTimes(1)
    expect(scrollToBottom).not.toHaveBeenCalled()
  })

  it('普通多模型发送仍使用无条件 latest intent，不接入历史重发原位 tracking', async () => {
    const latestMessagesRef = { current: [] as Message[] }
    const scrollToBottomAfterNextCommit = vi.fn()
    const onUpdateMessages = vi.fn((_: string, messages: Message[]) => {
      latestMessagesRef.current = messages
    })

    const { result } = renderHook(() => useChatAreaSendActions({
      abortControllersRef: { current: new Map() },
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map(),
      onUpdateMessages,
      scrollToBottom: vi.fn(),
      scrollToBottomAfterNextCommit,
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(),
    }))

    await act(async () => {
      await result.current.sendMessage({
        text: '普通多模型',
        mentionModels: ['provider/model-a', 'provider/model-b'],
      })
    })

    expect(scrollToBottomAfterNextCommit).toHaveBeenCalledTimes(1)
    expect(runStreamChatMock).toHaveBeenCalledTimes(2)
  })

  it('元素引用隐藏上下文只进入模型输入，不污染用户消息正文', async () => {
    const latestMessagesRef = { current: [] as Message[] }
    const onUpdateMessages = vi.fn((_: string, messages: Message[]) => {
      latestMessagesRef.current = messages
    })

    const { result } = renderHook(() => useChatAreaSendActions({
      abortControllersRef: { current: new Map() },
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map(),
      onUpdateMessages,
      scrollToBottom: vi.fn(),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(),
    }))

    await act(async () => {
      await result.current.sendMessage({
        text: '请总结这个模块',
        contextReferences: [{
          id: 'ctx-1',
          kind: 'element',
          element: {
            kind: 'text',
            tagName: 'P',
            text: '页面结构上下文',
            charCount: 8,
          },
          source: { title: 'Example' },
          attachmentIds: [],
        }],
      })
    })

    const sentMessages = onUpdateMessages.mock.calls[0]?.[1] as Message[]
    expect(sentMessages[0]).toEqual(expect.objectContaining({
      role: 'user',
      content: '请总结这个模块',
      contextReferences: [{
        id: 'ctx-1',
        kind: 'element',
        element: {
          kind: 'text',
          tagName: 'P',
          text: '页面结构上下文',
          charCount: 8,
        },
        source: { title: 'Example' },
        attachmentIds: [],
      }],
    }))

    const runArgs = runStreamChatMock.mock.calls[0]?.[0] as { apiMsgs: Array<{ role: string; content: string }> }
    expect(runArgs.apiMsgs).toEqual([
      { role: 'system', content: 'sys' },
      {
        role: 'user',
        content: '请总结这个模块\n\n### 页面元素引用：文本 · p\n文本 · p · 约 8 字\n来源：Example\n\n页面结构上下文',
      },
    ])
  })

  it('图片附件发送前会把 SVG 栅格化为 PNG，不再把 image/svg+xml 送进模型请求', async () => {
    const restoreRasterMocks = installOutboundRasterMocks()
    try {
      const attachment: MessageAttachment = {
        type: 'image',
        id: 'svg-1',
        name: 'webpack.svg',
        mime: 'image/svg+xml',
        size: 128,
      }
      getAttachmentBlobMock.mockResolvedValue(new Blob([
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64"/></svg>',
      ], { type: 'image/svg+xml' }))
      blobToDataUrlMock.mockResolvedValue('data:image/png;base64,converted')

      const latestMessagesRef = { current: [] as Message[] }
      const onUpdateMessages = vi.fn((_: string, messages: Message[]) => {
        latestMessagesRef.current = messages
      })

      const { result } = renderHook(() => useChatAreaSendActions({
        abortControllersRef: { current: new Map() },
        isLoading: false,
        latestMessagesRef,
        modelMap: new Map(),
        onUpdateMessages,
        scrollToBottom: vi.fn(),
        setIsLoading: vi.fn(),
        t: createT(),
        topic: createTopic(),
      }))

      await act(async () => {
        await result.current.sendMessage({
          text: '图片有哪些内容',
          attachments: [attachment],
        })
      })

      const runArgs = runStreamChatMock.mock.calls[0]?.[0] as { apiMsgs: Array<{ role: string; attachments?: Array<Record<string, unknown>> }> }
      const userApiMessage = runArgs.apiMsgs.find((message) => message.role === 'user')
      expect(userApiMessage?.attachments).toEqual([
        expect.objectContaining({
          type: 'image',
          url: 'data:image/png;base64,converted',
          name: 'webpack.png',
          mime: 'image/png',
          size: 3,
        }),
      ])
      expect(JSON.stringify(userApiMessage)).not.toContain('image/svg+xml')
    } finally {
      restoreRasterMocks()
    }
  })

  it('普通发送会使用默认 browser-context 发送前预算', async () => {
    const latestMessagesRef = { current: [] as Message[] }

    const { result } = renderHook(() => useChatAreaSendActions({
      abortControllersRef: { current: new Map() },
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map(),
      onUpdateMessages: vi.fn((_: string, messages: Message[]) => {
        latestMessagesRef.current = messages
      }),
      scrollToBottom: vi.fn(),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(),
    }))

    await act(async () => {
      await result.current.sendMessage({
        text: '普通上下文',
      })
    })

    expect(resolveBrowserContextForSendMock).toHaveBeenCalledWith(expect.objectContaining({
      requireReadableDom: true,
      budgetMs: DEFAULT_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS,
    }))
  })

  it('全文模式发送会放宽 browser-context 发送前预算', async () => {
    const latestMessagesRef = { current: [] as Message[] }
    resolveBrowserContextEffectiveStateMock.mockReturnValue(createPageStyleEffectiveState({
      fullPageEnabled: true,
    }))

    const { result } = renderHook(() => useChatAreaSendActions({
      abortControllersRef: { current: new Map() },
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map(),
      onUpdateMessages: vi.fn((_: string, messages: Message[]) => {
        latestMessagesRef.current = messages
      }),
      scrollToBottom: vi.fn(),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(),
    }))

    await act(async () => {
      await result.current.sendMessage({
        text: '读取全文',
      })
    })

    expect(resolveBrowserContextForSendMock).toHaveBeenCalledWith(expect.objectContaining({
      requireReadableDom: true,
      budgetMs: FULL_PAGE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS,
    }))
  })

  it('未配置默认转写模型时会阻断音频附件发送', async () => {
    getChatSettingsStateMock.mockReturnValue({
      settings: {
        defaultTranscriptionModel: undefined,
      },
    })

    const latestMessagesRef = { current: [] as Message[] }
    const onUpdateMessages = vi.fn()

    const { result } = renderHook(() => useChatAreaSendActions({
      abortControllersRef: { current: new Map() },
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map(),
      onUpdateMessages,
      scrollToBottom: vi.fn(),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(),
    }))

    await act(async () => {
      await result.current.sendMessage({
        text: '',
        attachments: [createAudioAttachment()],
      })
    })

    expect(transcribeAttachmentMock).not.toHaveBeenCalled()
    expect(runStreamChatMock).not.toHaveBeenCalled()
    expect(onUpdateMessages).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith({
      title: '未配置转写模型',
      description: '检测到音频附件，但当前还没有配置默认转写模型。',
      variant: 'destructive',
    })
  })

  it('OpenAI Responses + PDF 会保留 native file，而不是把 PDF 描述拼进 prompt', async () => {
    const pdfAttachment = createFileAttachment()
    getAttachmentBlobMock.mockResolvedValue(new Blob(['%PDF-1.7'], { type: 'application/pdf' }))
    blobToDataUrlMock.mockResolvedValue('data:application/pdf;base64,JVBERi0xLjc=')
    resolveModelMetaMock.mockResolvedValue({
      canonicalId: 'provider::openai::provider::model',
      baseModelKey: 'model',
      scope: 'provider',
      kind: 'multimodal-chat',
      inputModalities: ['text', 'file'],
      outputModalities: ['text'],
      features: ['file-input'],
      transportProtocol: 'openai-responses',
      displayName: 'model',
      confidence: 'high',
    })
    resolveProviderContractMock.mockReturnValue({
      providerId: 'provider',
      transportFamily: 'openai-responses',
      inputPolicies: { image: 'supported', file: 'supported' },
      allowedProviderOptions: [],
      supportsResponses: true,
      supportsChatCompletions: false,
    })

    const { result } = renderHook(() => useChatAreaSendActions({
      abortControllersRef: { current: new Map() },
      isLoading: false,
      latestMessagesRef: { current: [] as Message[] },
      modelMap: new Map(),
      onUpdateMessages: vi.fn(),
      scrollToBottom: vi.fn(),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(),
    }))

    const apiMessages = await result.current.buildApiMessages({
      modelId: 'provider/model',
      systemContent: 'sys',
      contextMessages: [{
        id: 'user-1',
        role: 'user',
        content: '请总结这个 PDF',
        attachments: [pdfAttachment],
        createdAt: 1,
      }],
      signal: new AbortController().signal,
    })

    expect(apiMessages).toEqual([
      { role: 'system', content: 'sys' },
      {
        role: 'user',
        content: '请总结这个 PDF',
        attachments: [{
          type: 'file',
          dataUrl: 'data:application/pdf;base64,JVBERi0xLjc=',
          mime: 'application/pdf',
          name: 'report.pdf',
          size: 2048,
        }],
      },
    ])
  })

  it('Together OCR + PDF 不走 native file，而是回退为现有文件描述文本', async () => {
    const pdfAttachment = createFileAttachment({ id: 'file-ocr', name: 'ocr.pdf' })
    getProviderViewMock.mockResolvedValue({
      id: 'together',
      name: 'Together',
      type: 'openai',
      apiHost: 'https://api.together.xyz/v1',
      models: [{ id: 'deepseek-ai/deepseek-ocr-2', name: 'DeepSeek OCR 2' }],
    })
    getAttachmentBlobMock.mockResolvedValue(new Blob(['%PDF-1.7'], { type: 'application/pdf' }))
    resolveModelMetaMock.mockResolvedValue({
      canonicalId: 'provider::openai::together::deepseek-ai/deepseek-ocr-2',
      baseModelKey: 'deepseek-ai/deepseek-ocr-2',
      scope: 'provider',
      kind: 'multimodal-chat',
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      features: ['vision-input'],
      transportProtocol: 'openai-chat',
      displayName: 'DeepSeek OCR 2',
      confidence: 'medium',
    })
    resolveProviderContractMock.mockReturnValue({
      providerId: 'together',
      transportFamily: 'openai-chat',
      inputPolicies: { image: 'supported', file: 'supported' },
      allowedProviderOptions: [],
      supportsResponses: false,
      supportsChatCompletions: true,
    })

    const { result } = renderHook(() => useChatAreaSendActions({
      abortControllersRef: { current: new Map() },
      isLoading: false,
      latestMessagesRef: { current: [] as Message[] },
      modelMap: new Map(),
      onUpdateMessages: vi.fn(),
      scrollToBottom: vi.fn(),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: { ...createTopic(), model: 'together/deepseek-ai/deepseek-ocr-2' },
    }))

    const apiMessages = await result.current.buildApiMessages({
      modelId: 'together/deepseek-ai/deepseek-ocr-2',
      systemContent: 'sys',
      contextMessages: [{
        id: 'user-ocr',
        role: 'user',
        content: '读一下这个 PDF',
        attachments: [pdfAttachment],
        createdAt: 1,
      }],
      signal: new AbortController().signal,
    })

    expect(apiMessages).toEqual([
      { role: 'system', content: 'sys' },
      {
        role: 'user',
        content: '读一下这个 PDF\n\n[文件：ocr.pdf，类型：application/pdf，大小：2048 bytes]',
      },
    ])
  })

  it('风格模式命中视觉模型时，会把页面截图作为临时附件附加到当前用户消息', async () => {
    const latestMessagesRef = { current: [] as Message[] }
    const setBrowserContextPreflightPhase = vi.fn()
    const onUpdateMessages = vi.fn((_: string, messages: Message[]) => {
      latestMessagesRef.current = messages
    })
    resolveBrowserContextForSendMock.mockResolvedValue({
      browserContext: { prompt: 'page context' },
      captureFrames: [{
        name: 'page-style-01.png',
        mime: 'image/png',
        dataUrl: 'data:image/png;base64,style-shot',
        scrollY: 120,
      }],
      captureWarning: null,
      styleCapture: {
        requested: true,
        frameCount: 1,
        target: 'vision-input',
        warningCode: null,
      },
      degraded: false,
      status: 'ready',
    })

    const { result } = renderHook(() => useChatAreaSendActions({
      abortControllersRef: { current: new Map() },
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map([['provider/model', {
        kind: 'multimodal-chat',
        inputModalities: ['text', 'image'],
        features: ['vision-input'],
      }]]),
      onUpdateMessages,
      scrollToBottom: vi.fn(),
      setBrowserContextPreflightPhase,
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(),
    }))

    await act(async () => {
      await result.current.sendMessage({
        text: '分析这个网页的设计风格',
      })
    })

    expect(resolveBrowserContextForSendMock).toHaveBeenCalledWith(expect.objectContaining({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      requireCaptures: true,
      budgetMs: STYLE_CAPTURE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS,
    }))
    expect(setBrowserContextPreflightPhase).toHaveBeenNthCalledWith(1, 'style-capture')
    expect(setBrowserContextPreflightPhase).toHaveBeenLastCalledWith(null)
    expect(runStreamChatMock).toHaveBeenCalledTimes(1)
    expect(runStreamChatMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      apiMsgs: expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          attachments: expect.arrayContaining([
            expect.objectContaining({
              type: 'image',
              url: 'data:image/png;base64,style-shot',
            }),
          ]),
        }),
      ]),
    }))
  })

  it('风格截图 preflight 失败时会清理采集提示', async () => {
    const latestMessagesRef = { current: [] as Message[] }
    const setBrowserContextPreflightPhase = vi.fn()
    resolveBrowserContextForSendMock.mockRejectedValue(new Error('preflight failed'))

    const { result } = renderHook(() => useChatAreaSendActions({
      abortControllersRef: { current: new Map() },
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map([['provider/model', {
        kind: 'multimodal-chat',
        inputModalities: ['text', 'image'],
        features: ['vision-input'],
      }]]),
      onUpdateMessages: vi.fn((_: string, messages: Message[]) => {
        latestMessagesRef.current = messages
      }),
      scrollToBottom: vi.fn(),
      setBrowserContextPreflightPhase,
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(),
    }))

    await act(async () => {
      await result.current.sendMessage({
        text: '采集失败',
      })
    })

    expect(runStreamChatMock).not.toHaveBeenCalled()
    expect(setBrowserContextPreflightPhase.mock.calls).toEqual([
      ['style-capture'],
      [null],
    ])
  })

  it('即使页面风格输入错误返回了附件，只要当前轮次风格模式未开启，也不会把截图塞进请求', async () => {
    const latestMessagesRef = { current: [] as Message[] }
    const onUpdateMessages = vi.fn((_: string, messages: Message[]) => {
      latestMessagesRef.current = messages
    })
    resolveBrowserContextEffectiveStateMock.mockReturnValue(createPageStyleEffectiveState({
      effective: false,
      styleSignalsEnabled: false,
    }))
    resolveBrowserContextForSendMock.mockResolvedValue({
      browserContext: { prompt: 'page context' },
      captureFrames: [{
        name: 'page-style-01.png',
        mime: 'image/png',
        dataUrl: 'data:image/png;base64,style-shot',
        scrollY: 120,
      }],
      captureWarning: null,
      styleCapture: null,
      degraded: false,
      status: 'ready',
    })

    const { result } = renderHook(() => useChatAreaSendActions({
      abortControllersRef: { current: new Map() },
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map([['provider/model', {
        kind: 'multimodal-chat',
        inputModalities: ['text', 'image'],
        features: ['vision-input'],
      }]]),
      onUpdateMessages,
      scrollToBottom: vi.fn(),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(),
    }))

    await act(async () => {
      await result.current.sendMessage({
        text: '不要附图',
      })
    })

    expect(runStreamChatMock).toHaveBeenCalledTimes(1)
    const userApiMessage = (runStreamChatMock.mock.calls[0]?.[0] as { apiMsgs?: Array<Record<string, unknown>> })?.apiMsgs
      ?.find((message) => message.role === 'user')
    expect(userApiMessage).toBeDefined()
    expect(userApiMessage).not.toHaveProperty('attachments')
  })

  it('普通多模型发送会并发启动多个文本目标，而不是等前一个完成后再发下一个', async () => {
    const latestMessagesRef = { current: [] as Message[] }
    const onUpdateMessages = vi.fn((_: string, messages: Message[]) => {
      latestMessagesRef.current = messages
    })
    const firstStream = createDeferred<void>()
    const launchOrder: string[] = []

    runStreamChatMock.mockImplementation(({ modelId }: { modelId: string }) => {
      launchOrder.push(modelId)
      if (modelId === 'provider/model-a') return firstStream.promise
      return Promise.resolve(undefined)
    })

    const { result } = renderHook(() => useChatAreaSendActions({
      abortControllersRef: { current: new Map() },
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map(),
      onUpdateMessages,
      scrollToBottom: vi.fn(),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(),
    }))

    await act(async () => {
      const task = result.current.sendMessage({
        text: '并发测试',
        mentionModels: ['provider/model-a', 'provider/model-b'],
      })
      await waitFor(() => {
        expect(runStreamChatMock).toHaveBeenCalledTimes(2)
      })
      expect(launchOrder).toEqual(['provider/model-a', 'provider/model-b'])
      firstStream.resolve()
      await task
    })
  })

  it('全文模式多模型发送会沿用全文 browser-context 发送前预算', async () => {
    const latestMessagesRef = { current: [] as Message[] }
    resolveBrowserContextEffectiveStateMock.mockReturnValue(createPageStyleEffectiveState({
      fullPageEnabled: true,
      styleSignalsEnabled: false,
    }))

    const { result } = renderHook(() => useChatAreaSendActions({
      abortControllersRef: { current: new Map() },
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map(),
      onUpdateMessages: vi.fn((_: string, messages: Message[]) => {
        latestMessagesRef.current = messages
      }),
      scrollToBottom: vi.fn(),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(),
    }))

    await act(async () => {
      await result.current.sendMessage({
        text: '多模型读取全文',
        mentionModels: ['provider/model-a', 'provider/model-b'],
      })
    })

    expect(resolveBrowserContextForSendMock).toHaveBeenCalledTimes(1)
    expect(resolveBrowserContextForSendMock).toHaveBeenCalledWith(expect.objectContaining({
      requireReadableDom: true,
      budgetMs: FULL_PAGE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS,
    }))
  })

  it('多模型风格截图发送会使用截图预算并只显示一次采集提示', async () => {
    const latestMessagesRef = { current: [] as Message[] }
    const setBrowserContextPreflightPhase = vi.fn()
    const onUpdateMessages = vi.fn((_: string, messages: Message[]) => {
      latestMessagesRef.current = messages
    })
    resolveBrowserContextEffectiveStateMock.mockReturnValue(createPageStyleEffectiveState({
      fullPageEnabled: true,
      styleSignalsEnabled: true,
    }))
    resolveBrowserContextForSendMock.mockResolvedValue({
      browserContext: { prompt: 'page context' },
      captureFrames: [],
      captureWarning: null,
      styleCapture: {
        requested: true,
        frameCount: 0,
        target: 'vision-input',
        warningCode: null,
      },
      degraded: false,
      status: 'ready',
    })

    const { result } = renderHook(() => useChatAreaSendActions({
      abortControllersRef: { current: new Map() },
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map([
        ['provider/model-a', {
          kind: 'multimodal-chat',
          inputModalities: ['text', 'image'],
          features: ['vision-input'],
        }],
        ['provider/model-b', {
          kind: 'chat',
          inputModalities: ['text'],
          features: [],
        }],
      ]),
      onUpdateMessages,
      scrollToBottom: vi.fn(),
      setBrowserContextPreflightPhase,
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(),
    }))

    await act(async () => {
      await result.current.sendMessage({
        text: '多模型风格截图',
        mentionModels: ['provider/model-a', 'provider/model-b'],
      })
    })

    expect(resolveBrowserContextForSendMock).toHaveBeenCalledTimes(1)
    expect(resolveBrowserContextForSendMock).toHaveBeenCalledWith(expect.objectContaining({
      requireCaptures: true,
      budgetMs: STYLE_CAPTURE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS,
    }))
    expect(setBrowserContextPreflightPhase.mock.calls).toEqual([
      ['style-capture'],
      [null],
    ])
  })

  it('普通多模型发送只会给视觉目标透传页面截图，不会把截图带给纯文本目标', async () => {
    const latestMessagesRef = { current: [] as Message[] }
    const onUpdateMessages = vi.fn((_: string, messages: Message[]) => {
      latestMessagesRef.current = messages
    })
    resolveBrowserContextForSendMock.mockResolvedValue({
      browserContext: { prompt: 'page context' },
      captureFrames: [{
        name: 'page-style-01.png',
        mime: 'image/png',
        dataUrl: 'data:image/png;base64,vision-shot',
        scrollY: 80,
      }],
      captureWarning: null,
      styleCapture: {
        requested: true,
        frameCount: 1,
        target: 'vision-input',
        warningCode: null,
      },
      degraded: false,
      status: 'ready',
    })

    const { result } = renderHook(() => useChatAreaSendActions({
      abortControllersRef: { current: new Map() },
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map([
        ['provider/model-a', {
          kind: 'multimodal-chat',
          inputModalities: ['text', 'image'],
          features: ['vision-input'],
        }],
        ['provider/model-b', {
          kind: 'chat',
          inputModalities: ['text'],
          features: [],
        }],
      ]),
      onUpdateMessages,
      scrollToBottom: vi.fn(),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(),
    }))

    await act(async () => {
      await result.current.sendMessage({
        text: '多模型风格比较',
        mentionModels: ['provider/model-a', 'provider/model-b'],
      })
    })

    expect(runStreamChatMock).toHaveBeenCalledTimes(2)
    const visionCall = runStreamChatMock.mock.calls.find(([payload]) => payload.modelId === 'provider/model-a')?.[0]
    const textCall = runStreamChatMock.mock.calls.find(([payload]) => payload.modelId === 'provider/model-b')?.[0]
    const visionUserMessage = (visionCall as { apiMsgs?: Array<Record<string, unknown>> })?.apiMsgs
      ?.find((message) => message.role === 'user')
    const textUserMessage = (textCall as { apiMsgs?: Array<Record<string, unknown>> })?.apiMsgs
      ?.find((message) => message.role === 'user')

    expect(visionCall).toEqual(expect.objectContaining({
      apiMsgs: expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          attachments: expect.arrayContaining([
            expect.objectContaining({
              type: 'image',
              url: 'data:image/png;base64,vision-shot',
            }),
          ]),
        }),
      ]),
    }))
    expect(visionUserMessage).toBeDefined()
    expect(visionUserMessage).toHaveProperty('attachments')
    expect(textUserMessage).toBeDefined()
    expect(textUserMessage).not.toHaveProperty('attachments')
  })

  it('普通多模型发送在文本模型和 dedicated image model 混合时会并发启动两条链路', async () => {
    const latestMessagesRef = { current: [] as Message[] }
    const onUpdateMessages = vi.fn((_: string, messages: Message[]) => {
      latestMessagesRef.current = messages
    })
    const textStream = createDeferred<void>()
    const imageTask = createDeferred<MessageAttachment[]>()

    collectInputImagesFromAttachmentsMock.mockResolvedValue(['data:image/png;base64,input'])
    runStreamChatMock.mockImplementation(({ modelId }: { modelId: string }) => (
      modelId === 'provider/text-model'
        ? textStream.promise
        : Promise.resolve(undefined)
    ))
    generateImageReplyAttachmentsMock.mockImplementation(() => imageTask.promise)

    const { result } = renderHook(() => useChatAreaSendActions({
      abortControllersRef: { current: new Map() },
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map([
        ['provider/image-model', {
          id: 'provider/image-model',
          providerId: 'provider',
          kind: 'image-generation',
          features: [],
        }],
      ]),
      onUpdateMessages,
      scrollToBottom: vi.fn(),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(),
    }))

    await act(async () => {
      const task = result.current.sendMessage({
        text: '画一个海报',
        mentionModels: ['provider/text-model', 'provider/image-model'],
      })
      await waitFor(() => {
        expect(runStreamChatMock).toHaveBeenCalledTimes(1)
        expect(generateImageReplyAttachmentsMock).toHaveBeenCalledTimes(1)
      })
      textStream.resolve()
      imageTask.resolve([{
        type: 'image',
        id: 'generated-image',
        name: 'poster.png',
        mime: 'image/png',
        size: 1024,
      }])
      await task
    })

    const finalMessages = latestMessagesRef.current
    expect(finalMessages.map((message) => message.role)).toEqual(['user', 'assistant', 'assistant'])
    expect(finalMessages[1]).toEqual(expect.objectContaining({
      modelId: 'provider/text-model',
    }))
    expect(finalMessages[2]).toEqual(expect.objectContaining({
      modelId: 'provider/image-model',
      attachments: [expect.objectContaining({ id: 'generated-image' })],
      renderHint: 'image',
      status: 'success',
    }))
  })

  it('compare 发送链路会复用共享并发执行器并保留 compare 级流式参数', async () => {
    const latestMessagesRef = { current: [] as Message[] }
    const scrollToBottomAfterNextCommit = vi.fn()
    const onUpdateMessages = vi.fn((_: string, messages: Message[]) => {
      latestMessagesRef.current = messages
    })

    const { result } = renderHook(() => useChatAreaSendActions({
      abortControllersRef: { current: new Map() },
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map(),
      onUpdateMessages,
      scrollToBottom: vi.fn(),
      scrollToBottomAfterNextCommit,
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(),
    }))

    await act(async () => {
      await result.current.sendCompare('请比较这两个模型', ['provider/model-a', 'provider/model-b'])
    })

    expect(runStreamChatMock).toHaveBeenCalledTimes(2)
    expect(scrollToBottomAfterNextCommit).toHaveBeenCalledTimes(1)
    expect(runStreamChatMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      developerSource: 'chat-compare',
      modelId: 'provider/model-a',
      useAssistantRuntimeFeatures: false,
    }))
    expect(runStreamChatMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      developerSource: 'chat-compare',
      modelId: 'provider/model-b',
      useAssistantRuntimeFeatures: false,
    }))
  })
})
