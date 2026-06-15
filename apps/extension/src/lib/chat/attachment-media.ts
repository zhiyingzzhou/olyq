/**
 * 说明：`attachment-media` 基础能力模块。
 *
 * 职责：
 * - 承载 `attachment-media` 相关的当前文件实现与模块边界；
 * - 对外暴露 `isLikelyTextAttachment`、`isLikelyAudioAttachment` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
const TEXT_ATTACHMENT_EXTENSION_REGEX = /\.(md|txt|json|csv|log|yaml|yml)$/i
const AUDIO_ATTACHMENT_EXTENSION_REGEX = /\.(mp3|wav|m4a|aac|webm|ogg|oga|flac|mpga|mpeg)$/i

/**
 * 导出函数：`isLikelyTextAttachment`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function isLikelyTextAttachment(name: string, mime: string): boolean {
  const normalizedMime = String(mime || '').toLowerCase()
  if (normalizedMime.startsWith('text/')) return true
  if (normalizedMime === 'application/json' || normalizedMime === 'application/xml') return true
  return TEXT_ATTACHMENT_EXTENSION_REGEX.test(String(name || '').toLowerCase())
}

/**
 * 导出函数：`isLikelyAudioAttachment`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function isLikelyAudioAttachment(name: string, mime: string): boolean {
  const normalizedMime = String(mime || '').toLowerCase()
  if (normalizedMime.startsWith('audio/')) return true
  return AUDIO_ATTACHMENT_EXTENSION_REGEX.test(String(name || '').toLowerCase())
}
