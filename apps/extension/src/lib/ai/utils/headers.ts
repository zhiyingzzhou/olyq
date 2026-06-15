/**
 * 说明：`headers` AI 能力模块。
 *
 * 职责：
 * - 承载 `headers` 相关的当前文件实现与模块边界；
 * - 对外暴露 `sanitizeProviderHeaders` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：Provider headers 工具（Browser Studio）
 *
 * 目标：
 * - 统一清理用户配置的自定义 headers（用于 Provider 请求直通），避免重复实现；
 * - 禁止覆盖鉴权与 content-type（由 SDK/运行时负责）。
 */

/**
 * 清理 Provider 自定义 headers：
 * - key/value 去首尾空格
 * - 过滤常见鉴权头 / Content-Type（大小写不敏感）
 * - 过滤空 key / 非 string value
 */
export function sanitizeProviderHeaders(headers?: Record<string, string>): Record<string, string> {
  if (!headers) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    const key = String(k || '').trim()
    if (!key) continue
    if (/^(authorization|content-type|x-api-key|x-goog-api-key|api-key|xi-api-key)$/i.test(key)) continue
    if (typeof v !== 'string') continue
    const value = v.trim()
    if (!value) continue
    out[key] = value
  }
  return out
}
