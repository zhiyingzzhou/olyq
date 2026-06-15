/**
 * 说明：`stream-chat-errors` AI 能力模块。
 *
 * 职责：
 * - 承载 `stream-chat-errors` 相关的当前文件实现与模块边界；
 * - 对外暴露 `StreamChatErrorDetails`、`sanitizeHeadersForDebug`、`formatApiCallError` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：stream-chat 错误格式化与诊断工具函数。
 *
 * 从 stream-chat.ts 拆分，保持接口不变。
 */

import { APICallError, RetryError } from 'ai'
import { toI18nTextFromError } from '@/lib/i18n/error'
import type { I18nText } from '@/types/i18n'
import type { ProviderType } from './types'
import { isPlainRecord } from '@/lib/utils/type-guards'

// 从 utils/api-errors 复用“权威实现”（避免两份实现边界不一致）
import {
  buildApiCallErrorDetail,
  extractMessageFromResponseBody,
  formatApiUrlHint,
  getRetryErrorAttempts,
  pickRequestIdFromHeaders,
  selectDiagnosticApiCallErrorFromRetryError,
} from './utils/api-errors'
export { buildApiCallErrorDetail, extractMessageFromResponseBody, formatApiUrlHint, pickRequestIdFromHeaders }

/**
 * 供调试面板或错误上报展示的标准化错误详情。
 */
export interface StreamChatErrorDetails {
  /**
   * 错误名称，通常来自 `Error.name`。
   */
  name?: string
  /**
   * 面向用户的国际化错误文案。
   */
  messageI18n?: I18nText
  /**
   * 适合直接展示给用户或日志系统的主错误文案。
   */
  message?: string
  /**
   * 截断后的堆栈文本，仅在存在时附带。
   */
  stack?: string
  /**
   * 递归序列化后的 `cause` 信息，便于追踪底层失败原因。
   */
  cause?: string
}

/**
 * 将响应头转换为适合调试输出的普通对象。
 *
 * @param headers - 原始响应头结构。
 * @returns 仅包含可安全序列化的字符串值；无法识别时返回 `undefined`。
 */
export function sanitizeHeadersForDebug(headers: unknown): Record<string, string> | undefined {
  if (!headers) return undefined

  try {
    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
      return Object.fromEntries(Array.from(headers.entries()).map(([k, v]) => [k, String(v)]))
    }
  } catch {
    // 忽略：Headers 读取失败则继续走 plain object 分支
  }

  if (isPlainRecord(headers)) {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(headers)) {
      if (typeof v === 'string') out[k] = v
      else if (typeof v === 'number') out[k] = String(v)
      else if (typeof v === 'boolean') out[k] = v ? 'true' : 'false'
    }
    return out
  }

  return undefined
}

/**
 * 将 `APICallError` 格式化为适合 toast/对话框展示的简洁错误文案。
 *
 * @param error - AI SDK 抛出的接口调用错误。
 * @returns 合并 HTTP 状态、请求路径提示、网关 request id 与常见修复建议后的文本。
 */
export function formatApiCallError(error: APICallError): string {
  return buildApiCallErrorDetail(error)
}

/**
 * 将长文本裁剪到指定长度，并追加统一的截断标记。
 *
 * @param text - 原始文本。
 * @param maxLen - 最大保留长度。
 * @returns 若未超限则原样返回，否则返回裁剪后的文本。
 */
export function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen)}…(truncated)`
}

/**
 * 统一将任意调试负载序列化为可展示文本。
 *
 * @param body - 需要输出的调试对象或原始文本。
 * @param maxLen - 本次输出允许的最大字符数。
 * @returns 适合日志与调试抽屉显示的字符串；空值则返回 `undefined`。
 */
function formatDebugText(body: unknown, maxLen: number): string | undefined {
  if (!body) return undefined
  try {
    if (typeof body === 'string') return truncateText(body, maxLen)
    return truncateText(JSON.stringify(body), maxLen)
  } catch {
    return truncateText(String(body), maxLen)
  }
}

/**
 * 生成适合常规错误详情展示的调试正文。
 *
 * @param body - 需要展示的响应体或请求体。
 * @returns 最多保留 2000 个字符的文本。
 */
export function formatDebugBody(body: unknown): string | undefined {
  return formatDebugText(body, 2000)
}

/**
 * 生成适合开发模式或问题回传的完整调试负载文本。
 *
 * @param body - 需要序列化的调试负载。
 * @returns 最多保留 20000 个字符的文本。
 */
export function formatDebugPayload(body: unknown): string | undefined {
  return formatDebugText(body, 20000)
}

/**
 * 判断响应体文本是否看起来像 HTML 文档。
 *
 * @param text - 原始响应文本。
 * @returns 若命中 HTML 常见标签特征则返回 `true`。
 */
export function looksLikeHtmlDocument(text: string): boolean {
  const s = String(text || '').trim()
  if (!s) return false
  const head = s.slice(0, 500).toLowerCase()
  return head.includes('<!doctype html') || head.includes('<html') || head.includes('<noscript')
}

/**
 * 当模型没有返回可解析输出时，根据响应体猜测更具体的排障提示。
 *
 * @param body - 原始响应体。
 * @param providerType - 当前 Provider 类型，用于拼接差异化的 Base URL 提示。
 * @returns 仅在检测到 HTML 响应时返回提示文本，否则返回 `null`。
 */
export function buildNoOutputHintFromResponseBody(
  body: unknown,
  providerType: ProviderType | undefined,
  wantsInlineImage: boolean,
): I18nText | null {
  if (typeof body !== 'string') return null
  if (!looksLikeHtmlDocument(body)) return null

  const compact = body.replace(/\s+/g, ' ').trim()
  const preview = truncateText(compact, 200)

  if (providerType === 'gemini') {
    return wantsInlineImage
      ? { key: 'errors.inlineImageNoOutputHtmlResponseGemini', params: { preview } }
      : { key: 'errors.modelNoOutputHtmlResponseGemini', params: { preview } }
  }

  return wantsInlineImage
    ? { key: 'errors.inlineImageNoOutputHtmlResponse', params: { preview } }
    : { key: 'errors.modelNoOutputHtmlResponse', params: { preview } }
}

/**
 * 将任意 `cause` 对象安全序列化为文本。
 *
 * @param cause - 可能来自原生 Error、字符串或自定义对象的错误根因。
 * @returns 截断后的序列化文本；无法得到有效内容时返回 `undefined`。
 */
export function serializeCauseForDetails(cause: unknown): string | undefined {
  if (cause === undefined || cause === null) return undefined
  if (typeof cause === 'string') return truncateText(cause, 8000)
  if (cause instanceof Error) {
    const head = `${cause.name || 'Error'}: ${cause.message || ''}`.trim()
    const stack = typeof cause.stack === 'string' ? cause.stack : ''
    const combined = stack ? `${head}\n${stack}` : head
    return truncateText(combined || String(cause), 8000)
  }
  try {
    return truncateText(JSON.stringify(cause), 8000)
  } catch {
    return truncateText(String(cause), 8000)
  }
}

/**
 * 将一次 RetryError 尝试压缩为不含 request body / API Key 的诊断行。
 *
 * @param attempt - AI SDK 记录的一次底层失败。
 * @param index - 尝试序号，0-based。
 * @returns 可放进详情弹窗 `cause` 字段的单行文本。
 */
function formatRetryAttemptForDetails(attempt: unknown, index: number): string {
  const prefix = `#${index + 1}`
  if (APICallError.isInstance(attempt)) {
    const detail = buildApiCallErrorDetail(attempt)
    const message = detail || String(attempt.message || '').trim() || 'API call failed'
    return `${prefix} ${attempt.name}: ${message}`
  }
  if (attempt instanceof Error) {
    const name = String(attempt.name || 'Error').trim()
    const message = String(attempt.message || '').trim()
    return `${prefix} ${name}${message ? `: ${message}` : ''}`
  }
  if (typeof attempt === 'string') return `${prefix} ${truncateText(attempt, 1000)}`
  return `${prefix} ${Object.prototype.toString.call(attempt)}`
}

/**
 * 将 AI SDK RetryError 的完整尝试链路压缩进现有 `cause` 文本字段。
 *
 * 说明：
 * - 只展示错误类型、HTTP 诊断摘要与短 message；
 * - 不序列化 `requestBodyValues`，避免把用户输入、附件或密钥相关内容带进 UI。
 */
function formatRetryChainForDetails(error: RetryError): string | undefined {
  const attempts = getRetryErrorAttempts(error)
  if (attempts.length === 0) return undefined
  return truncateText([
    'Retry attempts:',
    ...attempts.map((attempt, index) => formatRetryAttemptForDetails(attempt, index)),
  ].join('\n'), 8000)
}

/**
 * 将 RetryError 转成现有消息错误详情结构。
 *
 * @param err - AI SDK 重试包装错误。
 * @param messageI18n - 本次用户可见错误摘要。
 * @returns 不新增 schema 的结构化错误详情。
 */
function formatRetryErrorDetails(err: RetryError, messageI18n?: I18nText): StreamChatErrorDetails {
  const diagnosticApiError = selectDiagnosticApiCallErrorFromRetryError(err)
  const details: StreamChatErrorDetails = {}

  if (diagnosticApiError) {
    if (typeof diagnosticApiError.name === 'string' && diagnosticApiError.name.trim()) details.name = diagnosticApiError.name
    const message = buildApiCallErrorDetail(diagnosticApiError) || String(diagnosticApiError.message || '').trim()
    if (message) details.message = truncateText(message, 4000)
  } else if (err instanceof Error) {
    if (typeof err.name === 'string' && err.name.trim()) details.name = err.name
    if (typeof err.message === 'string' && err.message.trim()) details.message = truncateText(err.message, 4000)
  }

  if (messageI18n) details.messageI18n = messageI18n
  if (err instanceof Error && typeof err.stack === 'string' && err.stack.trim()) {
    details.stack = truncateText(err.stack, 20000)
  }

  const retryChain = formatRetryChainForDetails(err)
  const nativeCause = err instanceof Error
    ? serializeCauseForDetails((err as unknown as { cause?: unknown }).cause)
    : undefined
  const cause = [retryChain, nativeCause].filter((item): item is string => Boolean(item)).join('\n\n')
  if (cause) details.cause = cause

  return details
}

/**
 * 将未知错误标准化为统一的结构化详情对象。
 *
 * @param err - 任意异常值。
 * @returns 若能提取出有效信息则返回对象，否则返回 `undefined`。
 */
export function formatErrorDetails(
  err: unknown,
  options?: { messageI18n?: I18nText },
): StreamChatErrorDetails | undefined {
  if (!err) return undefined

  const messageI18n = options?.messageI18n ?? toI18nTextFromError(err)

  if (RetryError.isInstance(err)) {
    return formatRetryErrorDetails(err, messageI18n)
  }

  if (err instanceof Error) {
    const details: StreamChatErrorDetails = {}
    if (typeof err.name === 'string' && err.name.trim()) details.name = err.name
    if (messageI18n) details.messageI18n = messageI18n
    if (typeof err.message === 'string' && err.message.trim()) details.message = truncateText(err.message, 4000)
    if (typeof err.stack === 'string' && err.stack.trim()) details.stack = truncateText(err.stack, 20000)
    const cause = (err as unknown as { cause?: unknown }).cause
    const causeText = serializeCauseForDetails(cause)
    if (causeText) details.cause = causeText
    return details
  }

  const msg = String(err)
  const details: StreamChatErrorDetails = {}
  if (messageI18n) details.messageI18n = messageI18n
  if (msg.trim()) details.message = truncateText(msg, 4000)
  return Object.keys(details).length > 0 ? details : undefined
}
