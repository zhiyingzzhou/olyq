/**
 * 说明：`speech` 基础能力模块。
 *
 * 职责：
 * - 承载 `speech` 相关的当前文件实现与模块边界；
 * - 对外暴露 `GeneratedSpeechAttachmentResult`、`generateSpeechAttachment` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { getUiPort, onUiPortMessage, postUiPortMessage } from '@/extension/bridge/ui-port'
import { putFileAttachment } from '@/lib/attachments'
import { I18nError } from '@/lib/i18n/error'
import { isI18nText } from '@/lib/i18n/text'
import { createId } from '@/lib/utils/id'
import type { MessageAttachment } from '@/types/chat'

type GenerateSpeechAudioParams = {
  model: string
  text: string
  voice?: string
  outputFormat?: string
  instructions?: string
  speed?: number
  language?: string
  providerOptions?: unknown
  headers?: unknown
  maxRetries?: number
  signal?: AbortSignal
  timeoutMs?: number
}

/** 导出类型：`GeneratedSpeechAttachmentResult`。 */
export type GeneratedSpeechAttachmentResult = {
  attachment: Extract<MessageAttachment, { type: 'file' }>
  objectUrl: string
  mime: string
  name: string
}

/**
 * 内部函数：`base64ToBlob`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function base64ToBlob(base64: string, mime: string): Blob {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

/**
 * 导出函数：`generateSpeechAttachment`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function generateSpeechAttachment({
  model,
  text,
  voice,
  outputFormat,
  instructions,
  speed,
  language,
  providerOptions,
  headers,
  maxRetries,
  signal,
  timeoutMs = 120_000,
}: GenerateSpeechAudioParams): Promise<GeneratedSpeechAttachmentResult> {
  const port = getUiPort()
  if (!port) throw new I18nError('errors.extensionPortUnavailable')

  const requestId = createId()

  return await new Promise<GeneratedSpeechAttachmentResult>((resolve, reject) => {
    let done = false

        /**
     * 内部函数变量：`cleanup`。
     *
     * @remarks
     * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
     */
    const cleanup = (error?: unknown) => {
      if (done) return
      done = true
      off()
      window.clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
      if (error) reject(error)
    }

        /**
     * 内部函数变量：`onAbort`。
     *
     * @remarks
     * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
     */
    const onAbort = () => {
      postUiPortMessage({ type: 'speech/abort', requestId })
      cleanup(new DOMException('Aborted', 'AbortError'))
    }

    const timer = window.setTimeout(() => {
      cleanup(new I18nError('errors.requestTimedOutOrDisconnected'))
    }, Math.max(5_000, Math.floor(timeoutMs)))

    const off = onUiPortMessage((message) => {
      const msg = message as {
        type?: unknown
        requestId?: unknown
        audioBase64?: unknown
        mime?: unknown
        name?: unknown
        error?: unknown
      } | null
      if (!msg || msg.requestId !== requestId || typeof msg.type !== 'string') return

      if (msg.type === 'speech/result') {
        void (async () => {
          try {
            const audioBase64 = typeof msg.audioBase64 === 'string' ? msg.audioBase64.trim() : ''
            const mime = typeof msg.mime === 'string' && msg.mime.trim() ? msg.mime.trim() : 'audio/mpeg'
            const name = typeof msg.name === 'string' && msg.name.trim() ? msg.name.trim() : 'speech.mp3'
            if (!audioBase64) throw new I18nError('errors.speechGenerationInvalidResponse')

            const blob = base64ToBlob(audioBase64, mime)
            const attachment = await putFileAttachment({ blob, name, mime })
            cleanup()
            resolve({
              attachment,
              objectUrl: URL.createObjectURL(blob),
              mime,
              name,
            })
          } catch (error: unknown) {
            cleanup(error)
          }
        })()
        return
      }

      if (msg.type === 'speech/error') {
        if (isI18nText(msg.error)) {
          cleanup(new I18nError(msg.error.key, msg.error.params, { cause: msg.error }))
          return
        }
        cleanup(new I18nError('errors.speechGenerationFailed', undefined, { cause: msg.error }))
      }
    })

    if (signal) signal.addEventListener('abort', onAbort, { once: true })

    const ok = postUiPortMessage({
      type: 'speech/generate',
      requestId,
      payload: {
        model,
        text,
        voice,
        outputFormat,
        instructions,
        speed,
        language,
        providerOptions,
        headers,
        maxRetries,
      },
    })
    if (!ok) cleanup(new I18nError('errors.speechRequestSendFailed'))
  })
}
