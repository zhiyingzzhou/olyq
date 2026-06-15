/**
 * 说明：OpenAI Responses SSE 终态恢复工具。
 *
 * 职责：
 * - 解析 `HTTP 200 + text/event-stream` 形式的 OpenAI Responses 成功流；
 * - 提取最终可见文本，以及 tool/file 这类可见输出信号；
 * - 供自动命名与模型管理健康检查共用，避免两处各自维护一套恢复规则。
 *
 * 边界：
 * - 这里只做纯解析，不做第二次请求、不做 UI 格式化，也不承担 transport 路由决策。
 */

import { isPlainRecord } from '../../lib/utils/type-guards'

/**
 * OpenAI Responses SSE 可见输出摘要。
 *
 * 说明：
 * - `finalText` 用于 one-shot 文本恢复；
 * - `hasToolOutput` / `hasFileOutput` 用于健康检查的成功判定；
 * - `hasVisibleOutput` 是最终对外消费的布尔结论。
 */
export interface OpenAiResponsesVisibleOutput {
  /** 当前 body / payload 是否命中 Responses 语义。 */
  readonly matched: boolean
  /** 从 done/completed 事件恢复出的最终文本。 */
  readonly finalText: string
  /** 是否出现了工具调用类可见输出。 */
  readonly hasToolOutput: boolean
  /** 是否出现了文件/图片类可见输出。 */
  readonly hasFileOutput: boolean
  /** 是否存在任一最终可见输出。 */
  readonly hasVisibleOutput: boolean
}

type OpenAiResponsesPayloadOutput = {
  readonly deltaText?: string
  readonly finalText?: string
  readonly hasToolOutput: boolean
  readonly hasFileOutput: boolean
}

/**
 * 判断某个 Responses item/content type 是否属于 reasoning 类信号。
 *
 * @param type - 原始 type 字段。
 * @returns 命中 reasoning 语义时返回 `true`。
 */
function isReasoningLikeType(type: string): boolean {
  const normalized = String(type || '').trim().toLowerCase()
  return normalized.includes('reasoning')
}

/**
 * 判断某个 Responses type 是否属于工具调用类可见输出。
 *
 * @param type - 原始 type 字段。
 * @returns 命中 tool/call 语义且不是 reasoning 时返回 `true`。
 */
function isToolLikeType(type: string): boolean {
  const normalized = String(type || '').trim().toLowerCase()
  if (!normalized || isReasoningLikeType(normalized)) return false
  return normalized.includes('tool') || normalized.includes('call')
}

/**
 * 判断某个 Responses type 是否属于文件/媒体类可见输出。
 *
 * @param type - 原始 type 字段。
 * @returns 命中 file/image/audio/video 等媒体语义时返回 `true`。
 */
function isFileLikeType(type: string): boolean {
  const normalized = String(type || '').trim().toLowerCase()
  if (!normalized || normalized === 'text' || normalized === 'output_text' || isReasoningLikeType(normalized)) {
    return false
  }
  return (
    normalized.includes('file')
    || normalized.includes('image')
    || normalized.includes('audio')
    || normalized.includes('video')
  )
}

/**
 * 从 message content parts 中拼出最终可见文本。
 *
 * @param content - Responses item 的 `content` 数组。
 * @returns 过滤并拼接后的最终文本。
 */
function extractTextFromContentParts(content: unknown): string {
  if (!Array.isArray(content)) return ''

  const parts = content
    .map((part) => {
      if (!isPlainRecord(part)) return ''
      if ((part.type === 'output_text' || part.type === 'text') && typeof part.text === 'string') {
        return part.text
      }
      return ''
    })
    .filter(Boolean)

  return parts.join('').trim()
}

/**
 * 从单个 Responses output item 中提取文本和可见输出信号。
 *
 * @param item - `response.output_item.done` 或 `response.completed.output[]` 中的单项。
 * @returns 当前 item 的最终文本、tool/file 输出摘要。
 */
function extractVisibleOutputFromResponsesItem(item: unknown): OpenAiResponsesPayloadOutput {
  if (!isPlainRecord(item)) {
    return {
      hasToolOutput: false,
      hasFileOutput: false,
    }
  }

  const directText = typeof item.text === 'string' ? item.text.trim() : ''
  const contentText = extractTextFromContentParts(item.content)
  const itemType = typeof item.type === 'string' ? item.type : ''

  let hasToolOutput = isToolLikeType(itemType)
  let hasFileOutput = isFileLikeType(itemType)

  if (Array.isArray(item.content)) {
    for (const part of item.content) {
      if (!isPlainRecord(part) || typeof part.type !== 'string') continue
      if (isToolLikeType(part.type)) hasToolOutput = true
      if (isFileLikeType(part.type)) hasFileOutput = true
    }
  }

  return {
    ...(directText || contentText ? { finalText: directText || contentText } : {}),
    hasToolOutput,
    hasFileOutput,
  }
}

/**
 * 从单条 raw Responses payload 中提取最终可见输出摘要。
 *
 * @param payload - `data:` 行里的 JSON payload。
 * @returns 当前 payload 可贡献的 delta/final text 与 tool/file 信号。
 */
export function extractVisibleOutputFromResponsesPayload(payload: unknown): OpenAiResponsesPayloadOutput {
  if (!isPlainRecord(payload) || typeof payload.type !== 'string') {
    return {
      hasToolOutput: false,
      hasFileOutput: false,
    }
  }

  switch (payload.type) {
    case 'response.output_text.delta':
      return {
        ...(typeof payload.delta === 'string' && payload.delta ? { deltaText: payload.delta } : {}),
        hasToolOutput: false,
        hasFileOutput: false,
      }
    case 'response.output_text.done':
      return {
        ...(typeof payload.text === 'string' && payload.text.trim() ? { finalText: payload.text.trim() } : {}),
        hasToolOutput: false,
        hasFileOutput: false,
      }
    case 'response.content_part.done': {
      const part = payload.part
      if (!isPlainRecord(part) || typeof part.type !== 'string') {
        return {
          hasToolOutput: false,
          hasFileOutput: false,
        }
      }
      if ((part.type === 'output_text' || part.type === 'text') && typeof part.text === 'string') {
        const text = part.text.trim()
        return {
          ...(text ? { finalText: text } : {}),
          hasToolOutput: false,
          hasFileOutput: false,
        }
      }
      return {
        hasToolOutput: isToolLikeType(part.type),
        hasFileOutput: isFileLikeType(part.type),
      }
    }
    case 'response.output_item.done':
      return extractVisibleOutputFromResponsesItem(payload.item)
    case 'response.completed': {
      const response = payload.response
      if (!isPlainRecord(response) || !Array.isArray(response.output)) {
        return {
          hasToolOutput: false,
          hasFileOutput: false,
        }
      }

      const outputs = response.output.map((item) => extractVisibleOutputFromResponsesItem(item))
      const finalText = outputs
        .map((item) => item.finalText || '')
        .filter(Boolean)
        .join('')
        .trim()

      return {
        ...(finalText ? { finalText } : {}),
        hasToolOutput: outputs.some((item) => item.hasToolOutput),
        hasFileOutput: outputs.some((item) => item.hasFileOutput),
      }
    }
    default:
      return {
        hasToolOutput: false,
        hasFileOutput: false,
      }
  }
}

/**
 * 判断一段原始 body 是否长得像 OpenAI Responses SSE 成功流。
 *
 * @param raw - 原始响应体字符串。
 * @returns 命中 `data:` + `response.*` 语义时返回 `true`。
 */
export function looksLikeOpenAiResponsesSseBody(raw: string): boolean {
  const text = String(raw || '')
  return text.includes('data:') && text.includes('response.')
}

/**
 * 解析整段 OpenAI Responses SSE body，并恢复最终可见输出。
 *
 * @param raw - 原始 `text/event-stream` body。
 * @returns 最终文本、tool/file 信号和统一的可见输出判定。
 */
export function parseOpenAiResponsesSseVisibleOutput(raw: string): OpenAiResponsesVisibleOutput {
  const lines = String(raw || '').split(/\r?\n/)
  let deltaText = ''
  const finalCandidates: string[] = []
  let hasToolOutput = false
  let hasFileOutput = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue

    const jsonText = trimmed.replace(/^data:\s*/, '').trim()
    if (!jsonText || jsonText === '[DONE]') continue

    try {
      const payload = JSON.parse(jsonText) as unknown
      const extracted = extractVisibleOutputFromResponsesPayload(payload)
      if (extracted.deltaText) deltaText += extracted.deltaText
      if (extracted.finalText) finalCandidates.push(extracted.finalText)
      if (extracted.hasToolOutput) hasToolOutput = true
      if (extracted.hasFileOutput) hasFileOutput = true
    } catch {
      // SSE body 里可能夹杂非 JSON keepalive 行，这里直接跳过。
    }
  }

  const finalText = ([...finalCandidates].reverse().find((candidate) => candidate.trim()) || deltaText).trim()
  return {
    matched: true,
    finalText,
    hasToolOutput,
    hasFileOutput,
    hasVisibleOutput: Boolean(finalText) || hasToolOutput || hasFileOutput,
  }
}

/**
 * 解析 OpenAI Responses 的非 SSE body，并恢复最终可见输出。
 *
 * @param body - 原始响应体；可能是 JSON 字符串、完整 response 对象或单个 output item。
 * @returns 最终文本、tool/file 信号和统一的可见输出判定。
 */
export function parseOpenAiResponsesBodyVisibleOutput(body: unknown): OpenAiResponsesVisibleOutput {
  const empty: OpenAiResponsesVisibleOutput = {
    matched: false,
    finalText: '',
    hasToolOutput: false,
    hasFileOutput: false,
    hasVisibleOutput: false,
  }

  if (!body) return empty

  if (typeof body === 'string') {
    const text = body.trim()
    if (!text) return empty
    if (looksLikeOpenAiResponsesSseBody(text)) return parseOpenAiResponsesSseVisibleOutput(text)
    try {
      return parseOpenAiResponsesBodyVisibleOutput(JSON.parse(text) as unknown)
    } catch {
      return empty
    }
  }

  if (!isPlainRecord(body)) return empty

  const looksLikeCompletedResponse = Array.isArray(body.output)
    || typeof body.id === 'string'
    || body.object === 'response'
    || typeof body.created_at === 'number'

  const payload = Array.isArray(body.output)
    ? { type: 'response.completed', response: body }
    : Array.isArray(body.content) || typeof body.text === 'string'
      ? { type: 'response.output_item.done', item: body }
      : typeof body.type === 'string'
        ? body
        : null

  if (!payload) {
    return looksLikeCompletedResponse
      ? { ...empty, matched: true }
      : empty
  }

  const extracted = extractVisibleOutputFromResponsesPayload(payload)
  const finalText = extracted.finalText?.trim() || ''
  return {
    matched: true,
    finalText,
    hasToolOutput: extracted.hasToolOutput,
    hasFileOutput: extracted.hasFileOutput,
    hasVisibleOutput: Boolean(finalText) || extracted.hasToolOutput || extracted.hasFileOutput,
  }
}
