/**
 * 说明：模型视觉输入的出站图片格式真源。
 *
 * 职责：
 * - 只定义 Olyq 发给模型侧视觉输入时允许通过的 MIME；
 * - 供 UI 出站规范化与后台聊天线协议校验共享；
 * - 不依赖 DOM、Canvas、IndexedDB 或扩展 API，避免把浏览器 UI 能力带进 Service Worker。
 */

/** 模型视觉输入出站允许直接透传的 MIME 集合。 */
export const OUTBOUND_MODEL_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

/** 模型视觉输入出站允许直接透传的 MIME 类型。 */
export type OutboundModelImageMime = typeof OUTBOUND_MODEL_IMAGE_MIME_TYPES[number];

const OUTBOUND_MODEL_IMAGE_MIME_SET = new Set<string>(OUTBOUND_MODEL_IMAGE_MIME_TYPES);

/**
 * 规范化图片 MIME。
 *
 * @remarks
 * 只保留主类型，去掉 `;charset=utf-8` 这类参数，方便 data URL、Blob 与附件元信息共享判断。
 */
export function normalizeImageMimeType(value: unknown): string {
  return String(value || '').split(';')[0]?.trim().toLowerCase() || '';
}

/**
 * 判断 MIME 是否允许作为模型视觉输入直接出站。
 *
 * @remarks
 * SVG、GIF 与其它未知 `image/*` 不在这里放行；它们必须先在 UI 侧栅格化为 PNG。
 */
export function isOutboundModelImageMime(value: unknown): value is OutboundModelImageMime {
  return OUTBOUND_MODEL_IMAGE_MIME_SET.has(normalizeImageMimeType(value));
}

