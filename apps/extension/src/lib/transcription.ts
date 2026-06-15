/**
 * 说明：`transcription` 基础能力模块。
 *
 * 职责：
 * - 承载 `transcription` 相关的当前文件实现与模块边界；
 * - 对外暴露 `TranscriptionResult`、`transcribeAttachment` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { getUiPort, onUiPortMessage, postUiPortMessage } from '@/extension/bridge/ui-port'
import { createId } from '@/lib/utils/id'
import { I18nError } from '@/lib/i18n/error'
import { isI18nText } from '@/lib/i18n/text'

/** 导出类型：`TranscriptionResult`。 */
export type TranscriptionResult = {
  text: string
  segments: Array<{
    text: string
    startSecond: number
    endSecond: number
  }>
  language?: string
  durationInSeconds?: number
}

type TranscribeAttachmentParams = {
  model: string
  attachmentId: string
  providerOptions?: unknown
  headers?: unknown
  maxRetries?: number
  signal?: AbortSignal
  timeoutMs?: number
}

/**
 * 导出函数：`transcribeAttachment`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function transcribeAttachment({
  model,
  attachmentId,
  providerOptions,
  headers,
  maxRetries,
  signal,
  timeoutMs = 120_000,
}: TranscribeAttachmentParams): Promise<TranscriptionResult> {
  const port = getUiPort()
  if (!port) throw new I18nError('errors.extensionPortUnavailable')

  const requestId = createId()

  return await new Promise<TranscriptionResult>((resolve, reject) => {
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
      postUiPortMessage({ type: 'transcription/abort', requestId })
      cleanup(new DOMException('Aborted', 'AbortError'))
    }

    const timer = window.setTimeout(() => {
      cleanup(new I18nError('errors.requestTimedOutOrDisconnected'))
    }, Math.max(5_000, Math.floor(timeoutMs)))

    const off = onUiPortMessage((message) => {
      const msg = message as {
        type?: unknown
        requestId?: unknown
        text?: unknown
        segments?: unknown
        language?: unknown
        durationInSeconds?: unknown
        error?: unknown
      } | null
      if (!msg || msg.requestId !== requestId || typeof msg.type !== 'string') return

      if (msg.type === 'transcription/result') {
        cleanup()
        resolve({
          text: typeof msg.text === 'string' ? msg.text : '',
          segments: Array.isArray(msg.segments)
            ? msg.segments
              .filter((segment): segment is { text?: unknown; startSecond?: unknown; endSecond?: unknown } => Boolean(segment && typeof segment === 'object'))
              .map((segment) => ({
                text: typeof segment.text === 'string' ? segment.text : '',
                startSecond: typeof segment.startSecond === 'number' ? segment.startSecond : 0,
                endSecond: typeof segment.endSecond === 'number' ? segment.endSecond : 0,
              }))
            : [],
          ...(typeof msg.language === 'string' && msg.language.trim() ? { language: msg.language.trim() } : {}),
          ...(typeof msg.durationInSeconds === 'number' && Number.isFinite(msg.durationInSeconds)
            ? { durationInSeconds: msg.durationInSeconds }
            : {}),
        })
        return
      }

      if (msg.type === 'transcription/error') {
        if (isI18nText(msg.error)) {
          cleanup(new I18nError(msg.error.key, msg.error.params, { cause: msg.error }))
          return
        }
        cleanup(new I18nError('errors.transcriptionFailed', undefined, { cause: msg.error }))
      }
    })

    if (signal) signal.addEventListener('abort', onAbort, { once: true })

    const ok = postUiPortMessage({
      type: 'transcription/generate',
      requestId,
      payload: {
        model,
        attachmentId,
        providerOptions,
        headers,
        maxRetries,
      },
    })
    if (!ok) cleanup(new I18nError('errors.transcriptionRequestSendFailed'))
  })
}
