/**
 * 说明：`transcription` 后台运行时模块。
 *
 * 职责：
 * - 承载 `transcription` 相关的当前文件实现与模块边界；
 * - 对外暴露 `TranscriptionRequest`、`TranscriptionEvent`、`transcribeToPort` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { APICallError, RetryError, experimental_transcribe as transcribe } from 'ai'
import type { ProviderOptions } from '@ai-sdk/provider-utils'
import type { I18nText } from '../../types/i18n'
import { getAttachmentBlob } from '../../lib/attachments'
import { resolveTranscriptionModel } from '../../lib/ai/provider-runtime'
import { isJsonValue } from '../../lib/ai/stream-chat-debug'
import { formatApiCallErrorCompact, toApiCallErrorText } from '../../lib/ai/utils/api-errors'
import { I18nError, toI18nTextFromError } from '../../lib/i18n/error'
import { i18nText } from '../../lib/i18n/text'
import { isPlainRecord } from '../../lib/utils/type-guards'

/** 导出类型：`TranscriptionRequest`。 */
export type TranscriptionRequest = {
  requestId: string
  model: string
  attachmentId: string
  providerOptions?: unknown
  headers?: unknown
  maxRetries?: number
}

type TranscriptionSegment = {
  text: string
  startSecond: number
  endSecond: number
}

type TranscriptionResultEvent = {
  type: 'transcription/result'
  requestId: string
  text: string
  segments: TranscriptionSegment[]
  language?: string
  durationInSeconds?: number
}

type TranscriptionDoneEvent = {
  type: 'transcription/done'
  requestId: string
}

type TranscriptionErrorEvent = {
  type: 'transcription/error'
  requestId: string
  error: I18nText
}

/** 导出类型：`TranscriptionEvent`。 */
export type TranscriptionEvent = TranscriptionResultEvent | TranscriptionDoneEvent | TranscriptionErrorEvent

/**
 * 内部函数：`sanitizeHeaders`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function sanitizeHeaders(raw: unknown): Record<string, string> | undefined {
  if (!isPlainRecord(raw)) return undefined
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    const normalizedKey = String(key || '').trim()
    const normalizedValue = typeof value === 'string' ? value.trim() : ''
    if (!normalizedKey || !normalizedValue) continue
    out[normalizedKey] = normalizedValue
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * 内部函数：`sanitizeProviderOptions`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function sanitizeProviderOptions(raw: unknown): ProviderOptions | undefined {
  if (!isPlainRecord(raw)) return undefined
  const out: ProviderOptions = {}
  for (const [providerKey, value] of Object.entries(raw)) {
    if (!providerKey || !isPlainRecord(value) || !isJsonValue(value)) continue
    out[providerKey] = value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * 内部函数：`toTranscriptionErrorText`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function toTranscriptionErrorText(error: unknown): I18nText {
  const name = isPlainRecord(error) ? error.name : null
  if (name === 'AbortError') return i18nText('errors.cancelled')

  if (error instanceof Error && RetryError.isInstance(error)) {
    const last = error.lastError
    const detail = last instanceof Error && APICallError.isInstance(last) ? formatApiCallErrorCompact(last) : (error.message || '')
    return detail.trim()
      ? i18nText('errors.retryStillFailedWithDetail', { detail: detail.trim() })
      : i18nText('errors.retryStillFailed')
  }
  if (error instanceof Error && APICallError.isInstance(error)) {
    return toApiCallErrorText(error)
  }

  const text = toI18nTextFromError(error)
  if (text.key === 'errors.unknown') return i18nText('errors.transcriptionFailed')
  if (text.key === 'errors.unknownWithDetail') {
    const detail = typeof text.params?.detail === 'string' ? text.params.detail.trim() : ''
    return detail
      ? i18nText('errors.transcriptionFailedWithDetail', { detail })
      : i18nText('errors.transcriptionFailed')
  }
  return text
}

/**
 * 导出函数：`transcribeToPort`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function transcribeToPort({
  req,
  port,
  signal,
}: {
  req: TranscriptionRequest
  port: chrome.runtime.Port
  signal: AbortSignal
}) {
    /**
   * 内部函数变量：`post`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const post = (event: TranscriptionEvent) => port.postMessage(event)

  try {
    const attachmentId = String(req.attachmentId || '').trim()
    if (!attachmentId) throw new I18nError('errors.transcriptionAttachmentMissing')

    const blob = await getAttachmentBlob(attachmentId)
    if (!blob) throw new I18nError('errors.transcriptionAttachmentMissing')

    const model = await resolveTranscriptionModel(req.model)
    const audio = new Uint8Array(await blob.arrayBuffer())
    const result = await transcribe({
      model,
      audio,
      ...(sanitizeHeaders(req.headers) ? { headers: sanitizeHeaders(req.headers) } : {}),
      ...(sanitizeProviderOptions(req.providerOptions) ? { providerOptions: sanitizeProviderOptions(req.providerOptions) } : {}),
      ...(typeof req.maxRetries === 'number' && Number.isFinite(req.maxRetries) ? { maxRetries: req.maxRetries } : {}),
      abortSignal: signal,
    })

    const text = String(result.text || '').trim()
    if (!text) throw new I18nError('errors.transcriptionInvalidResponse')

    post({
      type: 'transcription/result',
      requestId: req.requestId,
      text,
      segments: Array.isArray(result.segments)
        ? result.segments.map((segment) => ({
            text: String(segment.text || ''),
            startSecond: Number(segment.startSecond || 0),
            endSecond: Number(segment.endSecond || 0),
          }))
        : [],
      ...(typeof result.language === 'string' && result.language.trim() ? { language: result.language.trim() } : {}),
      ...(typeof result.durationInSeconds === 'number' && Number.isFinite(result.durationInSeconds)
        ? { durationInSeconds: result.durationInSeconds }
        : {}),
    })
    post({ type: 'transcription/done', requestId: req.requestId })
  } catch (error: unknown) {
    post({ type: 'transcription/error', requestId: req.requestId, error: toTranscriptionErrorText(error) })
  }
}
