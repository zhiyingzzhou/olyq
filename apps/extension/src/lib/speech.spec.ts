/**
 * 说明：`speech.spec` 基础能力模块。
 *
 * 职责：
 * - 承载 `speech.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { generateSpeechAttachment } from './speech'

const {
  createIdMock,
  getUiPortMock,
  putFileAttachmentMock,
  postUiPortMessageMock,
  subscriberState,
} = vi.hoisted(() => ({
  createIdMock: vi.fn(() => 'speech-req-1'),
  getUiPortMock: vi.fn(() => ({ name: 'olyq:ui' })),
  putFileAttachmentMock: vi.fn(),
  postUiPortMessageMock: vi.fn((_: unknown) => true),
  subscriberState: {
    listener: null as null | ((message: unknown) => void),
  },
}))

vi.mock('@/extension/bridge/ui-port', () => ({
  getUiPort: getUiPortMock,
  onUiPortMessage: (listener: (message: unknown) => void) => {
    subscriberState.listener = listener
    return () => {
      if (subscriberState.listener === listener) subscriberState.listener = null
    }
  },
  postUiPortMessage: postUiPortMessageMock,
}))

vi.mock('@/lib/attachments', () => ({
  putFileAttachment: putFileAttachmentMock,
}))

vi.mock('@/lib/utils/id', () => ({
  createId: createIdMock,
}))

describe('generateSpeechAttachment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    subscriberState.listener = null
    putFileAttachmentMock.mockResolvedValue({
      id: 'att-speech-1',
      type: 'file',
      name: 'speech.mp3',
      mime: 'audio/mpeg',
      size: 5,
    })
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:speech-audio'),
      revokeObjectURL: vi.fn(),
    })
  })

  it('收到 speech/result 后会把音频写入附件库并返回附件引用', async () => {
    postUiPortMessageMock.mockImplementation((message: unknown) => {
      const payload = message as { type: string; requestId?: string }
      if (payload.type === 'speech/generate') {
        queueMicrotask(() => {
          subscriberState.listener?.({
            type: 'speech/result',
            requestId: 'speech-req-1',
            audioBase64: btoa('audio'),
            mime: 'audio/mpeg',
            name: 'speech.mp3',
          })
        })
      }
      return true
    })

    const result = await generateSpeechAttachment({
      model: 'openai/tts-1',
      text: 'hello world',
      voice: 'alloy',
    })

    expect(postUiPortMessageMock).toHaveBeenCalledWith({
      type: 'speech/generate',
      requestId: 'speech-req-1',
      payload: {
        model: 'openai/tts-1',
        text: 'hello world',
        voice: 'alloy',
        outputFormat: undefined,
        instructions: undefined,
        speed: undefined,
        language: undefined,
        providerOptions: undefined,
        headers: undefined,
        maxRetries: undefined,
      },
    })
    expect(putFileAttachmentMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'speech.mp3',
      mime: 'audio/mpeg',
    }))
    expect(result).toEqual({
      attachment: {
        id: 'att-speech-1',
        type: 'file',
        name: 'speech.mp3',
        mime: 'audio/mpeg',
        size: 5,
      },
      objectUrl: 'blob:speech-audio',
      mime: 'audio/mpeg',
      name: 'speech.mp3',
    })
  })

  it('abort 时会向后台发送 speech/abort 并抛出 AbortError', async () => {
    const controller = new AbortController()
    const promise = generateSpeechAttachment({
      model: 'openai/tts-1',
      text: 'hello world',
      signal: controller.signal,
    })

    controller.abort()

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(postUiPortMessageMock).toHaveBeenCalledWith({
      type: 'speech/abort',
      requestId: 'speech-req-1',
    })
  })

  it('后台返回 speech/error 时会把 i18n 错误抛回调用方', async () => {
    postUiPortMessageMock.mockImplementation((message: unknown) => {
      const payload = message as { type: string }
      if (payload.type === 'speech/generate') {
        queueMicrotask(() => {
          subscriberState.listener?.({
            type: 'speech/error',
            requestId: 'speech-req-1',
            error: {
              key: 'errors.speechGenerationFailed',
            },
          })
        })
      }
      return true
    })

    await expect(generateSpeechAttachment({
      model: 'openai/tts-1',
      text: 'hello world',
    })).rejects.toMatchObject({
      name: 'I18nError',
      i18n: { key: 'errors.speechGenerationFailed' },
    })
  })
})
