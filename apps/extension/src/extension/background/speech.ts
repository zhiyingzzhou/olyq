/**
 * 说明：`speech` 后台运行时模块。
 *
 * 职责：
 * - 承载 `speech` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SpeechRequest`、`SpeechEvent`、`speakToPort` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { APICallError, RetryError, experimental_generateSpeech as generateSpeech } from 'ai'
import type { ProviderOptions } from '@ai-sdk/provider-utils'
import type { I18nText } from '../../types/i18n'
import { resolveSpeechModel } from '../../lib/ai/provider-runtime'
import { isJsonValue } from '../../lib/ai/stream-chat-debug'
import { formatApiCallErrorCompact, toApiCallErrorText } from '../../lib/ai/utils/api-errors'
import { I18nError, toI18nTextFromError } from '../../lib/i18n/error'
import { i18nText } from '../../lib/i18n/text'
import { isPlainRecord } from '../../lib/utils/type-guards'

/** 导出类型：`SpeechRequest`。 */
export type SpeechRequest = {
  requestId: string
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
}

type SpeechResultEvent = {
  type: 'speech/result'
  requestId: string
  audioBase64: string
  mime: string
  name: string
}

type SpeechDoneEvent = {
  type: 'speech/done'
  requestId: string
}

type SpeechErrorEvent = {
  type: 'speech/error'
  requestId: string
  error: I18nText
}

/** 导出类型：`SpeechEvent`。 */
export type SpeechEvent = SpeechResultEvent | SpeechDoneEvent | SpeechErrorEvent

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
 * 内部函数：`pickSpeechExtension`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function pickSpeechExtension(mime: string, outputFormat?: string): string {
  const normalizedOutputFormat = String(outputFormat || '').trim().toLowerCase()
  if (normalizedOutputFormat) return normalizedOutputFormat

  const lower = String(mime || '').trim().toLowerCase()
  if (lower === 'audio/mpeg') return 'mp3'
  if (lower.startsWith('audio/')) return lower.slice('audio/'.length) || 'mp3'
  return 'mp3'
}

/**
 * 内部函数：`toSpeechErrorText`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function toSpeechErrorText(error: unknown): I18nText {
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
  if (text.key === 'errors.unknown') return i18nText('errors.speechGenerationFailed')
  if (text.key === 'errors.unknownWithDetail') {
    const detail = typeof text.params?.detail === 'string' ? text.params.detail.trim() : ''
    return detail
      ? i18nText('errors.speechGenerationFailedWithDetail', { detail })
      : i18nText('errors.speechGenerationFailed')
  }
  return text
}

/**
 * 导出函数：`speakToPort`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function speakToPort({
  req,
  port,
  signal,
}: {
  req: SpeechRequest
  port: chrome.runtime.Port
  signal: AbortSignal
}) {
    /**
   * 内部函数变量：`post`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const post = (event: SpeechEvent) => port.postMessage(event)

  try {
    const text = String(req.text || '').trim()
    if (!text) throw new I18nError('errors.speechTextRequired')

    const model = await resolveSpeechModel(req.model)
    const result = await generateSpeech({
      model,
      text,
      ...(typeof req.voice === 'string' && req.voice.trim() ? { voice: req.voice.trim() } : {}),
      ...(typeof req.outputFormat === 'string' && req.outputFormat.trim() ? { outputFormat: req.outputFormat.trim() } : {}),
      ...(typeof req.instructions === 'string' && req.instructions.trim() ? { instructions: req.instructions.trim() } : {}),
      ...(typeof req.speed === 'number' && Number.isFinite(req.speed) ? { speed: req.speed } : {}),
      ...(typeof req.language === 'string' && req.language.trim() ? { language: req.language.trim() } : {}),
      ...(sanitizeHeaders(req.headers) ? { headers: sanitizeHeaders(req.headers) } : {}),
      ...(sanitizeProviderOptions(req.providerOptions) ? { providerOptions: sanitizeProviderOptions(req.providerOptions) } : {}),
      ...(typeof req.maxRetries === 'number' && Number.isFinite(req.maxRetries) ? { maxRetries: req.maxRetries } : {}),
      abortSignal: signal,
    })

    const audioBase64 = String(result.audio.base64 || '').trim()
    const mime = String(result.audio.mediaType || '').trim() || 'audio/mpeg'
    if (!audioBase64) throw new I18nError('errors.speechGenerationInvalidResponse')

    post({
      type: 'speech/result',
      requestId: req.requestId,
      audioBase64,
      mime,
      name: `speech.${pickSpeechExtension(mime, req.outputFormat)}`,
    })
    post({ type: 'speech/done', requestId: req.requestId })
  } catch (error: unknown) {
    post({ type: 'speech/error', requestId: req.requestId, error: toSpeechErrorText(error) })
  }
}
