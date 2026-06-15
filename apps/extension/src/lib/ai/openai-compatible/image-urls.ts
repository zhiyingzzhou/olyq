/**
 * 说明：`image-urls` AI 能力模块。
 *
 * 职责：
 * - 承载 `image-urls` 相关的当前文件实现与模块边界；
 * - 对外暴露 `extractOpenAiLikeImageUrls` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { isPlainRecord } from '@/lib/utils/type-guards'

/**
 * 从未知字段中尽力提取图片 URL 字符串列表。
 *
 * 说明：
 * - 兼容 OpenAI-like 平台返回 `[{ url }]`、`["https://..."]` 等不同结构；
 * - 这里只负责提取 HTTP URL，不做下载、去重之外的后处理。
 */
function collectUrlStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const it of v) {
    // 兼容：少数 OpenAI-like 平台直接返回 string url 列表
    if (typeof it === 'string' && it.trim().startsWith('http')) {
      out.push(it.trim())
      continue
    }
    if (!isPlainRecord(it)) continue
    const url = it.url
    if (typeof url === 'string' && url.trim()) out.push(url.trim())
  }
  return out
}

/**
 * 从 OpenAI-like 图片生成响应中提取 URL 列表（兼容 `data` / `images` 两种常见字段）。
 *
 * 说明：
 * - 多数平台遵循 OpenAI 的 `{ data: [{ url }] }` 结构；
 * - 也有平台会返回 `{ images: [{ url }] }`，甚至直接返回 `["https://..."]` 列表；
 * - 本函数只负责“尽力提取 URL”，不做下载/转码。
 */
export function extractOpenAiLikeImageUrls(json: unknown): string[] {
  if (!isPlainRecord(json)) return []
  const urls = [
    ...collectUrlStrings(json.data),
    ...collectUrlStrings(json.images),
  ]
  return Array.from(new Set(urls))
}
