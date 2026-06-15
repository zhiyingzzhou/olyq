/**
 * 说明：`stream-chat-debug` AI 能力模块。
 *
 * 职责：
 * - 承载 `stream-chat-debug` 相关的当前文件实现与模块边界；
 * - 对外暴露 `isJsonValue`、`summarizeMessageContent`、`sanitizeRequestBodyValuesForDebug` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：stream-chat 调试/脱敏工具函数。
 *
 * 从 stream-chat.ts 拆分，保持接口不变。
 */

import type { JSONValue } from '@ai-sdk/provider'
import { isPlainRecord } from '@/lib/utils/type-guards'

/**
 * 判断任意值是否可安全视为 JSON 值。
 *
 * @param v - 待判断的值。
 * @returns 仅当值可被 JSON 安全表达时返回 `true`。
 */
export function isJsonValue(v: unknown): v is JSONValue {
  if (v === null) return true
  const t = typeof v
  if (t === 'string' || t === 'number' || t === 'boolean') return true
  if (Array.isArray(v)) return v.every(isJsonValue)
  if (isPlainRecord(v)) {
    for (const val of Object.values(v)) {
      if (val === undefined) continue
      if (!isJsonValue(val)) return false
    }
    return true
  }
  return false
}

/**
 * 将消息内容摘要化为轻量调试结构。
 *
 * 字符串消息只保留文本长度，多段内容则仅保留每段类型与必要的长度信息，
 * 避免把大图片对象、base64 或长文本直接打进调试日志。
 *
 * @param content - 原始消息内容。
 * @returns 适合调试输出的压缩摘要对象。
 */
export function summarizeMessageContent(content: unknown): unknown {
  if (typeof content === 'string') {
    return { type: 'text', length: content.length }
  }
  if (Array.isArray(content)) {
    const parts = content.map((p) => {
      if (!isPlainRecord(p)) return { type: typeof p }
      const t = typeof p.type === 'string' ? p.type : 'unknown'
      if (t === 'text' && typeof p.text === 'string') return { type: 'text', length: p.text.length }
      // 图片/大对象一律省略，只保留类型
      return { type: t }
    })
    return { type: 'parts', parts }
  }
  return { type: typeof content }
}

/**
 * 对请求体中的敏感或体积较大的字段做调试态脱敏/摘要化处理。
 *
 * 当前只针对 `messages` 数组做结构压缩，其余字段保持原样，方便定位模型参数问题。
 *
 * @param values - 原始请求体对象。
 * @returns 可直接用于日志序列化的调试副本。
 */
export function sanitizeRequestBodyValuesForDebug(values: unknown): unknown {
  if (!isPlainRecord(values)) return values

  const out: Record<string, unknown> = { ...values }

  if (Array.isArray(out.messages)) {
    out.messages = (out.messages as unknown[]).map((m) => {
      if (!isPlainRecord(m)) return m
      return {
        role: typeof m.role === 'string' ? m.role : undefined,
        // 仅保留内容摘要，避免日志里出现超长 prompt、图片 URL 或二进制数据。
        content: summarizeMessageContent(m.content),
      }
    })
  }

  return out
}
