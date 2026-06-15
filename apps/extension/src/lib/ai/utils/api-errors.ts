/**
 * 说明：`api-errors` AI 能力模块。
 *
 * 职责：
 * - 承载 `api-errors` 相关的当前文件实现与模块边界；
 * - 对外暴露 `extractMessageFromResponseBody`、`formatApiUrlHint`、`pickRequestIdFromHeaders` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：AI SDK API 错误与响应内容解析工具（Browser Studio）
 *
 * 目标：
 * - stream-chat.ts / background/image.ts 等多处都会做”从 responseBody 提取 message”；
 * - 将这类纯函数集中封装，避免重复代码与不一致的边界处理。
 */

import { APICallError, RetryError } from 'ai'
import { toI18nTextFromError } from '@/lib/i18n/error'
import { i18nText } from '@/lib/i18n/text'
import type { I18nText } from '@/types/i18n'
import { isPlainRecord } from '@/lib/utils/type-guards'

const RESPONSE_BODY_DIAGNOSTIC_SCORE = 100
const HTTP_STATUS_DIAGNOSTIC_SCORE = 10
const REQUEST_ID_DIAGNOSTIC_SCORE = 5
const URL_DIAGNOSTIC_SCORE = 3
const API_ERROR_BASE_DIAGNOSTIC_SCORE = 1

const ERROR_MESSAGE_FIELD_KEYS = ['message', 'msg', 'detail'] as const
const ERROR_DIAGNOSTIC_FIELD_KEYS = ['code', 'type'] as const

/**
 * 从对象里读取通用错误文本字段。
 *
 * @param record - 已确认是普通对象的响应体片段。
 * @param keys - 候选字段名，只表达通用错误结构，不表达具体 provider 或错误码值。
 * @returns 首个非空字符串字段。
 */
function pickStringField(record: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/**
 * 将非空 JSON 结构压缩成可诊断文本。
 *
 * @param value - 响应体或其中的错误对象片段。
 * @returns 非空对象/数组的紧凑 JSON；空对象、空数组或不可序列化值返回空字符串。
 */
function stringifyNonEmptyJson(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return ''
  } else if (isPlainRecord(value)) {
    if (Object.keys(value).length === 0) return ''
  } else {
    return ''
  }

  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

/**
 * 从 API 响应体中尽力提取可展示的错误消息。
 *
 * 说明：
 * - 兼容纯文本、JSON 字符串、常见 `{ error: { message } }` / `{ message }` 结构；
 * - 若没有 human-readable message，也保留 `code/type/detail` 或非空 JSON 作为诊断线索；
 * - 不匹配 provider 名称、模型名、HTTP 状态值或具体业务错误码值。
 * - 返回空字符串表示没有提取到合适文案，调用方可继续使用其它兜底消息。
 */
export function extractMessageFromResponseBody(body: unknown): string {
  if (!body) return ''

  if (typeof body === 'string') {
    const text = body.trim()
    if (!text) return ''
    try {
      const json = JSON.parse(text) as unknown
      return extractMessageFromResponseBody(json) || text
    } catch {
      return text
    }
  }

  if (isPlainRecord(body)) {
    // 例如 OpenAI 常见格式：{ error: { message: “...” } }
    const err = body.error
    if (typeof err === 'string' && err.trim()) return err.trim()
    if (isPlainRecord(err)) {
      const errorMessage = pickStringField(err, ERROR_MESSAGE_FIELD_KEYS)
      if (errorMessage) return errorMessage
      const errorDiagnostic = pickStringField(err, ERROR_DIAGNOSTIC_FIELD_KEYS)
      if (errorDiagnostic) return stringifyNonEmptyJson(err) || errorDiagnostic
      const nestedDiagnostic = stringifyNonEmptyJson(err)
      if (nestedDiagnostic) return nestedDiagnostic
    }
    // 其他 Provider：{ message } / { msg } / { detail } / { code } / { type }
    const bodyMessage = pickStringField(body, ERROR_MESSAGE_FIELD_KEYS)
    if (bodyMessage) return bodyMessage
    const bodyDiagnostic = pickStringField(body, ERROR_DIAGNOSTIC_FIELD_KEYS)
    if (bodyDiagnostic) return stringifyNonEmptyJson(body) || bodyDiagnostic
    // 最后兜底：尽量把对象压成字符串
    return stringifyNonEmptyJson(body)
  }

  if (Array.isArray(body)) return stringifyNonEmptyJson(body)

  return ''
}

/**
 * 将 URL 收敛成可展示的提示（origin + pathname），避免把 query（可能包含 key）带进 UI。
 */
export function formatApiUrlHint(url: string): string {
  const raw = String(url || '').trim()
  if (!raw) return ''
  try {
    const u = new URL(raw)
    return `${u.origin}${u.pathname}`
  } catch {
    // 某些 SDK / 中转只会给相对路径或非标准 URL；仍然按同一规则去掉 query/hash，
    // 避免把 API key、token 或临时签名参数带入 UI 详情和日志。
    const queryIndex = raw.search(/[?#]/)
    return queryIndex >= 0 ? raw.slice(0, queryIndex) : raw
  }
}

/**
 * 从响应头中提取最有价值的请求追踪 ID。
 *
 * @param headers - 原始响应头对象，可能是 `Headers`、普通对象或其他未知结构。
 * @returns 若命中常见网关头则返回其值，否则返回空字符串。
 */
export function pickRequestIdFromHeaders(headers: unknown): string {
  if (!headers) return ''
  const h: Record<string, string> = {}
  try {
    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
      for (const [k, v] of headers.entries()) h[k.toLowerCase()] = String(v)
    } else if (isPlainRecord(headers)) {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof v === 'string') h[k.toLowerCase()] = v
        else if (typeof v === 'number') h[k.toLowerCase()] = String(v)
      }
    }
  } catch {
    // 忽略：headers 解析失败不影响主流程
  }

  return (
    h['x-request-id']
    || h['x-oneapi-request-id']
    || h['request-id']
    || h['cf-ray']
    || ''
  ).trim()
}

/**
 * 判断错误消息是否只是对 URL/status 的重复包装。
 *
 * @param message - 待判断的原始错误消息。
 * @param urlHint - 已收敛过的 URL 提示。
 * @returns `true` 表示消息大概率只是 SDK 的重复包装，可不再展示。
 */
function isRedundantApiErrorMessage(message: string, urlHint: string): boolean {
  const normalized = message.trim().toLowerCase()
  if (!normalized) return true
  if (normalized === 'api call failed') return true
  if (urlHint && normalized === `api call failed: ${urlHint.toLowerCase()}`) return true
  return false
}

/**
 * 读取 `RetryError` 中记录的真实尝试链路。
 *
 * 说明：
 * - AI SDK 的 `RetryError.lastError` 只代表最后一次失败；
 * - 在浏览器扩展网络边界里，最后一次失败可能只是 `Failed to fetch`，而更早的
 *   `errors[]` 才包含 HTTP 状态码与 provider 响应体；
 * - 这里把 `errors[]` 与 `lastError` 收敛成单一只读列表，供错误文案和详情弹窗复用。
 */
export function getRetryErrorAttempts(error: RetryError): readonly unknown[] {
  const rawErrors = (error as unknown as { errors?: unknown }).errors
  const attempts = Array.isArray(rawErrors) ? [...rawErrors] : []
  const lastError = (error as unknown as { lastError?: unknown }).lastError
  if (lastError !== undefined && !attempts.includes(lastError)) attempts.push(lastError)
  return attempts
}

/**
 * 判断 API 错误是否带有可读 provider 响应内容。
 *
 * @param error - 待评分的 AI SDK API 错误。
 * @returns `true` 表示响应体或 data 字段里能提取出稳定诊断文本。
 */
function hasApiCallDiagnosticResponseContent(error: APICallError): boolean {
  return Boolean(
    extractMessageFromResponseBody(error.responseBody)
    || extractMessageFromResponseBody(error.data),
  )
}

/**
 * 为 `RetryError` 中的候选 `APICallError` 计算诊断价值。
 *
 * @param error - 待评分的 API 错误。
 * @returns 数值越大越适合作为用户可见错误来源。
 */
function getApiCallErrorDiagnosticScore(error: APICallError): number {
  let score = API_ERROR_BASE_DIAGNOSTIC_SCORE
  if (hasApiCallDiagnosticResponseContent(error)) score += RESPONSE_BODY_DIAGNOSTIC_SCORE
  if (typeof error.statusCode === 'number') score += HTTP_STATUS_DIAGNOSTIC_SCORE
  if (pickRequestIdFromHeaders(error.responseHeaders)) score += REQUEST_ID_DIAGNOSTIC_SCORE
  if (typeof error.url === 'string' && error.url.trim()) score += URL_DIAGNOSTIC_SCORE
  return score
}

/**
 * 从 `RetryError` 尝试链路中选择最有诊断价值的 `APICallError`。
 *
 * 规则：
 * - 优先选择带 provider 响应体 / data 诊断内容的 API 错误；
 * - 其次选择带 HTTP status、request id 或 URL 的 API 错误；
 * - 同分时保留更靠后的尝试，避免旧错误覆盖最新 provider 诊断。
 */
export function selectDiagnosticApiCallErrorFromRetryError(error: RetryError): APICallError | null {
  let selected: { error: APICallError; score: number; index: number } | null = null
  const attempts = getRetryErrorAttempts(error)

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index]
    if (!APICallError.isInstance(attempt)) continue
    const score = getApiCallErrorDiagnosticScore(attempt)
    if (!selected || score > selected.score || (score === selected.score && index > selected.index)) {
      selected = { error: attempt, score, index }
    }
  }

  return selected?.error ?? null
}

/**
 * 从未知错误里提取适合放入网络/API Base URL 错误的短诊断文本。
 *
 * @param error - RetryError 的最后一次失败或任意兜底错误。
 * @returns 短文本；没有有效内容则返回空字符串。
 */
function getUnknownErrorDiagnosticMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === 'string') return error.message.trim()
  if (typeof error === 'string' && error.trim()) return error.trim()
  if (isPlainRecord(error)) {
    const message = pickStringField(error, ERROR_MESSAGE_FIELD_KEYS)
    if (message) return message
    const diagnostic = extractMessageFromResponseBody(error)
    if (diagnostic) return diagnostic
  }
  return ''
}

/**
 * 为没有结构化 `APICallError` 的 RetryError 构造网络/API Base URL 类错误。
 *
 * 说明：
 * - AI SDK 的 retry 包装本身仍属于 provider/API 请求边界；
 * - 当链路里没有任何 HTTP 响应体、状态或 header 线索时，不伪造上游业务错误，
 *   只展示网络或 API Base URL 方向的用户可操作提示。
 */
function toRetryErrorNetworkOrApiBaseText(error: RetryError): I18nText {
  const attempts = getRetryErrorAttempts(error)
  const lastAttempt = attempts[attempts.length - 1]
  const detail = getUnknownErrorDiagnosticMessage(lastAttempt) || getUnknownErrorDiagnosticMessage(error)
  return detail
    ? i18nText('errors.apiCallNetworkOrApiBaseWithDetail', { detail })
    : i18nText('errors.apiCallNetworkOrApiBase')
}

/**
 * 从 APICallError 中提取稳定的诊断细节文本。
 *
 * 说明：
 * - 该文本会作为技术详情出现在用户侧错误文案或诊断面板中，因此只拼接“稳定且有价值”的字段；
 * - 不再塞入内部占位 token，避免泄漏未国际化的实现细节。
 */
export function buildApiCallErrorDetail(error: APICallError): string {
  const status = typeof error.statusCode === 'number' ? error.statusCode : null
  const url = typeof error.url === 'string' ? error.url : ''
  const bodyMsg = extractMessageFromResponseBody(error.responseBody) || extractMessageFromResponseBody(error.data)
  const hintUrl = formatApiUrlHint(url)
  const reqId = pickRequestIdFromHeaders(error.responseHeaders)
  const errorMessage = typeof error.message === 'string' ? error.message.trim() : ''

  const parts: string[] = []
  if (status) parts.push(`HTTP ${status}`)
  if (hintUrl) parts.push(hintUrl)
  if (reqId) parts.push(`request_id=${reqId}`)
  if (bodyMsg) parts.push(bodyMsg)
  else if (!isRedundantApiErrorMessage(errorMessage, hintUrl)) parts.push(errorMessage)

  return parts.join(' · ').slice(0, 800)
}

/**
 * 将 APICallError 归一为“摘要版”国际化文案，不内联技术详情。
 *
 * 说明：
 * - 用于“摘要 + 技术详情”分栏展示的场景；
 * - 具体诊断串由 `buildApiCallErrorDetail()` 单独提供，避免把 HTTP/URL/body 直接塞进摘要。
 */
export function toApiCallErrorSummaryText(error: APICallError): I18nText {
  const status = typeof error.statusCode === 'number' ? error.statusCode : null
  const url = typeof error.url === 'string' ? error.url : ''

  if (status === null) {
    return i18nText('errors.apiCallNetworkOrApiBase')
  }

  if (status === 401 || status === 403) {
    return i18nText('errors.apiCallUnauthorizedOrForbidden')
  }

  if (status === 429) {
    return i18nText('errors.apiCallRateLimitOrQuota')
  }

  if (status === 404 && url.includes('/responses')) {
    return i18nText('errors.apiCallResponsesEndpointUnsupported')
  }

  if (status === 404 && url.includes('/chat/completions')) {
    if (!url.includes('/v1/')) {
      return i18nText('errors.apiCallMissingV1Path')
    }
    return i18nText('errors.apiCallChatCompletionsEndpointUnsupported')
  }

  if (status) {
    return i18nText('errors.apiCallHttpError', { status })
  }

  return i18nText('errors.apiCallFailed')
}

/**
 * 将 APICallError 归一为最终给用户展示的国际化文案。
 *
 * 说明：
 * - 主文案优先走稳定的错误类别（鉴权、限流、端点不支持、网络/Base URL 等）；
 * - 技术细节通过 `detail` 参数附带，便于用户在详情弹窗里继续排障。
 */
export function toApiCallErrorText(error: APICallError): I18nText {
  const status = typeof error.statusCode === 'number' ? error.statusCode : null
  const url = typeof error.url === 'string' ? error.url : ''
  const detail = buildApiCallErrorDetail(error)
  const hasDetail = Boolean(detail)

  if (status === null) {
    return hasDetail
      ? i18nText('errors.apiCallNetworkOrApiBaseWithDetail', { detail })
      : i18nText('errors.apiCallNetworkOrApiBase')
  }

  if ((status === 401 || status === 403) && hasDetail) {
    return i18nText('errors.apiCallUnauthorizedOrForbiddenWithDetail', { detail })
  }
  if (status === 401 || status === 403) {
    return i18nText('errors.apiCallUnauthorizedOrForbidden')
  }

  if (status === 429 && hasDetail) {
    return i18nText('errors.apiCallRateLimitOrQuotaWithDetail', { detail })
  }
  if (status === 429) {
    return i18nText('errors.apiCallRateLimitOrQuota')
  }

  if (status === 404 && url.includes('/responses')) {
    return hasDetail
      ? i18nText('errors.apiCallResponsesEndpointUnsupportedWithDetail', { detail })
      : i18nText('errors.apiCallResponsesEndpointUnsupported')
  }

  if (status === 404 && url.includes('/chat/completions')) {
    if (!url.includes('/v1/')) {
      return hasDetail
        ? i18nText('errors.apiCallMissingV1PathWithDetail', { detail })
        : i18nText('errors.apiCallMissingV1Path')
    }
    return hasDetail
      ? i18nText('errors.apiCallChatCompletionsEndpointUnsupportedWithDetail', { detail })
      : i18nText('errors.apiCallChatCompletionsEndpointUnsupported')
  }

  if (status && hasDetail) {
    return i18nText('errors.apiCallHttpErrorWithDetail', { status, detail })
  }
  if (status) {
    return i18nText('errors.apiCallHttpError', { status })
  }

  return hasDetail
    ? i18nText('errors.apiCallFailedWithDetail', { detail })
    : i18nText('errors.apiCallFailed')
}

/**
 * 将 AI SDK 抛出的未知错误统一归一成用户可读文案。
 *
 * 说明：
 * - `APICallError` 直接走稳定的 API 错误分类与详情提取；
 * - `RetryError` 优先读取最有诊断价值的 `APICallError`，避免把“Failed to fetch”
 *   这类重试包装尾因覆盖真实 provider 响应体；
 * - 其余情况回退到通用 `toI18nTextFromError`，并保留 plain object error/message 细节。
 */
export function toUserFacingAiErrorText(error: unknown, fallback?: I18nText): I18nText {
  if (APICallError.isInstance(error)) return toApiCallErrorText(error)

  if (RetryError.isInstance(error)) {
    const apiError = selectDiagnosticApiCallErrorFromRetryError(error)
    if (apiError) return toApiCallErrorText(apiError)
    return toRetryErrorNetworkOrApiBaseText(error)
  }

  return toI18nTextFromError(error, fallback)
}

/**
 * 面向图片生成/健康检查等模块的“紧凑版” APICallError 格式化。
 * - 使用 ' · ' 分隔
 * - 不包含诊断提示（诊断提示由 stream-chat-errors.ts 负责）
 */
export function formatApiCallErrorCompact(error: APICallError): string {
  return buildApiCallErrorDetail(error)
}
