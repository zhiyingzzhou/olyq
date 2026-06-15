/**
 * 说明：`health-check-support` 后台运行时模块。
 *
 * 职责：
 * - 承载健康检查里的错误摘要/详情收口与文本模型辅助判断；
 * - 把 `health-check.ts` 中与主流程正交的辅助逻辑拆出来，避免热点文件继续膨胀；
 * - 供模型管理健康检查稳定复用，不扩散到聊天主链路。
 *
 * 边界：
 * - 本文件只做“健康检查 support”纯辅助，不负责 provider/runtime 主编排，也不做 UI 渲染。
 */

import { APICallError, RetryError, generateText, type ModelMessage } from 'ai'

import type { I18nText } from '../../types/i18n'
import { buildRuntimeCallPlan } from '../../lib/ai/stream-chat-context'
import { buildRuntimeTextCallArgs } from '../../lib/ai/runtime-text-call'
import { buildApiCallErrorDetail, toApiCallErrorSummaryText } from '../../lib/ai/utils/api-errors'
import { toI18nTextFromError } from '../../lib/i18n/error'
import { i18nText } from '../../lib/i18n/text'
import { isPlainRecord } from '../../lib/utils/type-guards'
import {
  parseOpenAiResponsesBodyVisibleOutput,
} from './openai-responses-sse'

/** 健康检查失败的标准化结果。 */
export interface FailedHealthCheckResult {
  /** 固定失败态，便于直接并回 key 级结果。 */
  readonly status: 'failed'
  /** 可选请求耗时。 */
  readonly latency?: number
  /** 面向 UI 行内展示的中文摘要。 */
  readonly error: I18nText
  /** 可复制的技术详情。 */
  readonly errorDetail?: string
}

/**
 * 判断某个错误是否属于中断/超时类错误。
 *
 * @param error - 任意异常对象。
 * @returns 命中 abort/aborted 语义时返回 `true`。
 */
export function isAbortLikeError(error: unknown): boolean {
  if (!error) return false
  if (typeof error === 'object') {
    const name = (error as { name?: unknown }).name
    if (name === 'AbortError') return true
  }
  const msg = error instanceof Error ? error.message : String(error)
  return /aborted|abort/i.test(msg)
}

/**
 * 把任意健康检查异常收敛成摘要版 I18nText。
 *
 * @param error - 任意异常对象。
 * @returns 适合模型管理行内展示的摘要文案。
 */
function toHealthCheckErrorText(error: unknown): I18nText {
  if (APICallError.isInstance(error)) return toApiCallErrorSummaryText(error)
  if (RetryError.isInstance(error)) {
    if (error.lastError !== undefined) {
      if (APICallError.isInstance(error.lastError)) return toApiCallErrorSummaryText(error.lastError)
      return toI18nTextFromError(error.lastError, i18nText('errors.retryStillFailed'))
    }
    return i18nText('errors.retryStillFailed')
  }
  return toI18nTextFromError(error)
}

/**
 * 对技术详情文本做轻量清洗，避免把 i18n key 或无意义对象字符串透传到 UI。
 *
 * @param raw - 待清洗的原始文本。
 * @returns 清洗后的稳定短文本；无价值时返回空串。
 */
function sanitizeHealthCheckDetailText(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const text = raw.trim().replace(/\s+/g, ' ')
  if (!text || text === '[object Object]') return ''
  if ((text.startsWith('errors.') || text.startsWith('common.')) && !text.includes(' ')) return ''
  return text.slice(0, 800)
}

/**
 * 从未知错误里提取稳定 message，不把原始对象或长 JSON 直接塞进 UI。
 *
 * @param error - 任意异常对象。
 * @returns 适合展示在技术详情里的短 message。
 */
function extractHealthCheckDetailMessage(error: unknown): string {
  if (typeof error === 'string') return sanitizeHealthCheckDetailText(error)
  if (error instanceof Error) return sanitizeHealthCheckDetailText(error.message)
  if (isPlainRecord(error)) {
    if (typeof error.message === 'string') return sanitizeHealthCheckDetailText(error.message)
    if (typeof error.error === 'string') return sanitizeHealthCheckDetailText(error.error)
    if (isPlainRecord(error.error) && typeof error.error.message === 'string') {
      return sanitizeHealthCheckDetailText(error.error.message)
    }
  }
  return ''
}

/**
 * 为健康检查构建“摘要之外”的技术详情。
 *
 * @param error - 任意异常对象。
 * @returns 可复制详情；没有稳定细节时返回 `undefined`。
 */
function toHealthCheckErrorDetail(error: unknown): string | undefined {
  if (APICallError.isInstance(error)) {
    const detail = buildApiCallErrorDetail(error)
    return detail || undefined
  }

  if (RetryError.isInstance(error) && error.lastError !== undefined) {
    const detail = toHealthCheckErrorDetail(error.lastError)
    if (detail) return detail
  }

  const parts: string[] = []
  const message = extractHealthCheckDetailMessage(error)
  if (message) parts.push(message)

  if (error instanceof Error && 'cause' in error) {
    const causeMessage = extractHealthCheckDetailMessage((error as { cause?: unknown }).cause)
    if (causeMessage && causeMessage !== message) parts.push(causeMessage)
  }

  const detail = parts.join(' · ').slice(0, 800)
  return detail || undefined
}

/**
 * 统一把检查失败收口成摘要 + 技术详情。
 *
 * @param error - 任意异常对象。
 * @param latency - 可选耗时。
 * @returns 模型管理健康检查统一消费的失败结果。
 */
export function buildFailedHealthCheckResult(error: unknown, latency?: number): FailedHealthCheckResult {
  const errText = isAbortLikeError(error)
    ? i18nText('errors.requestTimedOutOrDisconnected')
    : toHealthCheckErrorText(error)
  const errorDetail = isAbortLikeError(error) ? undefined : toHealthCheckErrorDetail(error)
  return {
    status: 'failed',
    ...(latency !== undefined ? { latency } : {}),
    error: errText,
    ...(errorDetail ? { errorDetail } : {}),
  }
}

/**
 * 构建文本健康检查共用的 AI SDK 调用参数。
 *
 * @param params - 健康检查文本调用所需的统一参数。
 * @returns `generateText` / `streamText` 共用的稳定 call args。
 */
export function buildHealthTextCallArgs(params: {
  messages: ModelMessage[]
  runtimeCallPlan: Awaited<ReturnType<typeof buildRuntimeCallPlan>>
  signal: AbortSignal
}) {
  const { messages, runtimeCallPlan, signal } = params
  return buildRuntimeTextCallArgs({
    runtimeCallPlan,
    messages,
    signal,
    defaultMaxOutputTokens: 1,
  })
}

type GenerateTextVisibleOutput = {
  readonly hasText: boolean
  readonly hasToolOutput: boolean
  readonly hasFileOutput: boolean
}

/**
 * 判断任意 file-like 结构是否已形成用户可见的文件输出。
 *
 * @param file - `GeneratedFile` 或相似的 file-like 值。
 * @returns 命中 base64/url/data 任一稳定输出时返回 `true`。
 */
function hasVisibleFileOutput(file: unknown): boolean {
  if (!isPlainRecord(file)) return false
  return (
    (typeof file.base64 === 'string' && Boolean(file.base64.trim()))
    || (typeof file.url === 'string' && Boolean(file.url.trim()))
    || file.data !== undefined
  )
}

/**
 * 归并两份可见输出摘要。
 *
 * @param left - 基础摘要。
 * @param right - 追加摘要。
 * @returns 合并后的稳定摘要。
 */
function mergeGenerateTextVisibleOutput(
  left: GenerateTextVisibleOutput,
  right: GenerateTextVisibleOutput,
): GenerateTextVisibleOutput {
  return {
    hasText: left.hasText || right.hasText,
    hasToolOutput: left.hasToolOutput || right.hasToolOutput,
    hasFileOutput: left.hasFileOutput || right.hasFileOutput,
  }
}

/**
 * 从单个 generateText content/message part 中提取可见输出摘要。
 *
 * @param part - `GenerateTextResult.content[]` 或 response message content 内的单项。
 * @returns 当前 part 是否携带最终文本、tool/file 类可见输出。
 */
function extractVisibleOutputFromGenerateTextPart(part: unknown): GenerateTextVisibleOutput {
  if (!isPlainRecord(part) || typeof part.type !== 'string') {
    return {
      hasText: false,
      hasToolOutput: false,
      hasFileOutput: false,
    }
  }

  switch (part.type) {
    case 'text':
    case 'output_text':
      return {
        hasText: typeof part.text === 'string' && Boolean(part.text.trim()),
        hasToolOutput: false,
        hasFileOutput: false,
      }
    case 'file':
      return {
        hasText: false,
        hasToolOutput: false,
        hasFileOutput: hasVisibleFileOutput(part.file) || hasVisibleFileOutput(part),
      }
    case 'tool-call':
    case 'tool-result':
    case 'tool-error':
    case 'tool-approval':
    case 'tool-approval-request':
      return {
        hasText: false,
        hasToolOutput: true,
        hasFileOutput: false,
      }
    default:
      return {
        hasText: false,
        hasToolOutput: false,
        hasFileOutput: false,
      }
  }
}

/**
 * 从 response messages 中补收 AI SDK 已经恢复出来的可见输出。
 *
 * @param messages - `GenerateTextResult.response.messages`。
 * @returns 文本、tool/file 级的可见输出摘要。
 */
function extractVisibleOutputFromResponseMessages(messages: unknown): GenerateTextVisibleOutput {
  if (!Array.isArray(messages)) {
    return {
      hasText: false,
      hasToolOutput: false,
      hasFileOutput: false,
    }
  }

  return messages.reduce<GenerateTextVisibleOutput>((acc, message) => {
    if (!isPlainRecord(message) || !Array.isArray(message.content)) return acc

    return message.content.reduce<GenerateTextVisibleOutput>((messageAcc, part) => (
      mergeGenerateTextVisibleOutput(messageAcc, extractVisibleOutputFromGenerateTextPart(part))
    ), acc)
  }, {
    hasText: false,
    hasToolOutput: false,
    hasFileOutput: false,
  })
}

/**
 * 从 `generateText()` 成功结果里恢复稳定终态可见输出。
 *
 * @param result - `generateText()` 返回结果。
 * @returns 最终文本、tool/file 输出是否已经在当前响应里出现。
 */
function extractVisibleOutputFromGenerateTextResult(
  result: Awaited<ReturnType<typeof generateText>>,
): GenerateTextVisibleOutput {
  let output: GenerateTextVisibleOutput = {
    hasText: Boolean(String(result.text || '').trim()),
    hasToolOutput: Array.isArray(result.toolCalls) && result.toolCalls.length > 0,
    hasFileOutput: Array.isArray(result.files) && result.files.some((file) => hasVisibleFileOutput(file)),
  }

  if (Array.isArray(result.content)) {
    output = result.content.reduce<GenerateTextVisibleOutput>((acc, part) => (
      mergeGenerateTextVisibleOutput(acc, extractVisibleOutputFromGenerateTextPart(part))
    ), output)
  }

  output = mergeGenerateTextVisibleOutput(output, extractVisibleOutputFromResponseMessages(result.response?.messages))

  const responseBodyOutput = parseOpenAiResponsesBodyVisibleOutput(result.response?.body)
  return mergeGenerateTextVisibleOutput(output, {
    hasText: Boolean(responseBodyOutput.finalText),
    hasToolOutput: responseBodyOutput.hasToolOutput,
    hasFileOutput: responseBodyOutput.hasFileOutput,
  })
}

/**
 * 判断 generateText 结果里是否已经出现稳定可见输出。
 *
 * @param result - `generateText()` 返回结果。
 * @returns 存在最终文本或文件输出时返回 `true`。
 */
export function hasGenerateTextVisibleOutput(result: Awaited<ReturnType<typeof generateText>>): boolean {
  const output = extractVisibleOutputFromGenerateTextResult(result)
  return output.hasText || output.hasToolOutput || output.hasFileOutput
}

/**
 * 尝试从被误包装成 APICallError 的 Responses body 中恢复可见输出。
 *
 * @param error - `generateText()` 抛出的异常。
 * @returns 是否命中 Responses body，以及该 body 中是否存在最终可见输出。
 */
export function tryRecoverOpenAiResponsesVisibleOutput(error: unknown): { matched: boolean; hasVisibleOutput: boolean } {
  if (!APICallError.isInstance(error) || error.statusCode !== 200) {
    return { matched: false, hasVisibleOutput: false }
  }

  const output = parseOpenAiResponsesBodyVisibleOutput(error.responseBody ?? error.data)
  return {
    matched: output.matched,
    hasVisibleOutput: output.hasVisibleOutput,
  }
}
