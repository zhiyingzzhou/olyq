/**
 * 说明：`inline-images` AI 能力模块。
 *
 * 职责：
 * - 承载 `inline-images` 相关的当前文件实现与模块边界；
 * - 对外暴露 `createOpenAiCompatibleInlineImageMetadataExtractor`、`parseDataUrlImage`、`extractInlineImageFilesFromProviderMetadata` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：OpenAI-compatible（/chat/completions）“对话生图”适配层（Browser Studio）
 *
 * 背景 / 现状
 * - Vercel AI SDK 对 Google Gemini（\@ai-sdk/google）与 OpenAI Responses（\@ai-sdk/openai）支持 file parts；
 *   我们可以在 `streamText().fullStream` 里直接收到 `part.type === 'file'`。
 * - 但很多 OpenAI-compatible 网关（例如 OpenRouter 的 image models / Gemini image preview）
 *   会把图片放在 `choices[].message.images[]` 或流式 `choices[].delta.images[]` 字段里：
 *   - 这不是 OpenAI 官方 Chat Completions 标准字段；
 *   - 因此 AI SDK 的 OpenAI-compatible provider 不会把它转成 `file` part。
 *
 * 目标
 * - 不在业务层手写 SSE 解析；
 * - 仍以 AI SDK 为主，通过 OpenAI-compatible provider 提供的 `metadataExtractor` 钩子
 *   从“已解析的 chunk/response”中提取图片 URL，并在 stream-chat.ts 中统一转成 `chat/file` 事件。
 *
 * 约束
 * - 本模块只做“图片 URL 的提取 + data URL 转 base64”；
 * - 不做“远端 URL 下载”之类的隐式行为（避免权限/跨域/带宽问题），若未来需要可在此扩展为可插拔策略。
 */

import type { MetadataExtractor } from '@ai-sdk/openai-compatible'
import type { SharedV3ProviderMetadata } from '@ai-sdk/provider'
import { isPlainRecord } from '@/lib/utils/type-guards'
import { I18nError } from '@/lib/i18n/error'

/** Provider metadata 中保存的单张图片 URL 项。 */
type ImageUrlItem = {
  /** 原始图片 URL，当前主要是 `data:` URL。 */
  url: string
}

/**
 * 将未知值安全转换为字符串。
 *
 * @param v - 任意输入值。
 * @returns 字符串值；非字符串输入返回空串。
 */
function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * 从 OpenRouter / OpenAI-compatible 非标准图片项中提取 URL。
 *
 * @param it - 单个图片项，可能是字符串或对象。
 * @returns 提取到的 URL；失败时返回空串。
 */
function extractUrlFromOpenRouterImageItem(it: unknown): string {
  if (typeof it === 'string') return it
  if (!isPlainRecord(it)) return ''

  // 非标准：{ url: "data:image/png;base64,..." }
  if (typeof it.url === 'string') return it.url

  // 例如 OpenRouter 标准（snake_case）：{ type: "image_url", image_url: { url: "data:..." } }
  const imageUrlSnake = it.image_url
  if (typeof imageUrlSnake === 'string') return imageUrlSnake
  if (isPlainRecord(imageUrlSnake) && typeof imageUrlSnake.url === 'string') return imageUrlSnake.url

  // 部分 SDK 可能做 camelCase：{ imageUrl: { url: "data:..." } }
  const imageUrlCamel = it.imageUrl
  if (typeof imageUrlCamel === 'string') return imageUrlCamel
  if (isPlainRecord(imageUrlCamel) && typeof imageUrlCamel.url === 'string') return imageUrlCamel.url

  return ''
}

/**
 * 向结果数组中追加 URL，并做去重与空值过滤。
 *
 * @param list - 结果数组。
 * @param seen - 已出现过的 URL 集合。
 * @param url - 候选 URL。
 */
function uniqPush(list: string[], seen: Set<string>, url: string) {
  const u = url.trim()
  if (!u) return
  if (seen.has(u)) return
  seen.add(u)
  list.push(u)
}

/**
 * 从 `images` 字段中提取所有图片 URL。
 *
 * @param imagesField - 原始 `images` 字段。
 * @param out - 结果数组。
 * @param seen - 去重集合。
 */
function collectImageUrlsFromMaybeImagesField(imagesField: unknown, out: string[], seen: Set<string>) {
  if (!Array.isArray(imagesField)) return
  for (const it of imagesField) {
    const url = extractUrlFromOpenRouterImageItem(it)
    if (url) uniqPush(out, seen, url)
  }
}

/**
 * 从多段 `content` 输出中提取图片 URL。
 *
 * @param content - 原始 content 数组。
 * @param out - 结果数组。
 * @param seen - 去重集合。
 */
function collectImageUrlsFromContentParts(content: unknown, out: string[], seen: Set<string>) {
  // 部分网关可能把输出也做成“多段内容”（类似 OpenAI 的 input 多模态格式）
  if (!Array.isArray(content)) return
  for (const part of content) {
    if (!isPlainRecord(part)) continue
    const type = asString(part.type).toLowerCase()
    if (type === 'image_url') {
      const url = isPlainRecord(part.image_url) ? asString(part.image_url.url) : ''
      if (url) uniqPush(out, seen, url)
      continue
    }
    if (type === 'image') {
      // 兼容潜在的 { type: "image", url: "..." } 形式（非标准）
      const url = asString((part as { url?: unknown }).url)
      if (url) uniqPush(out, seen, url)
    }
  }
}

/**
 * 从 OpenAI-compatible 原始响应体中提取所有内联图片 URL。
 *
 * 同时兼容：
 * - 流式 `choices[].delta.images/content`
 * - 最终响应 `choices[].message.images/content`
 *
 * @param body - 已解析的响应体。
 * @param out - 结果数组。
 * @param seen - 去重集合。
 */
function collectImageUrlsFromOpenAiCompatibleBody(body: unknown, out: string[], seen: Set<string>) {
  if (!isPlainRecord(body)) return
  const choices = (body as { choices?: unknown }).choices
  if (!Array.isArray(choices)) return

  for (const choice of choices) {
    if (!isPlainRecord(choice)) continue

    // 流式分片示例：{ choices: [ { delta: { images: [...] } } ] }
    const delta = (choice as { delta?: unknown }).delta
    if (isPlainRecord(delta)) {
      collectImageUrlsFromMaybeImagesField((delta as { images?: unknown }).images, out, seen)
      collectImageUrlsFromContentParts((delta as { content?: unknown }).content, out, seen)
    }

    // 最终响应示例：{ choices: [ { message: { images: [...] } } ] }
    const message = (choice as { message?: unknown }).message
    if (isPlainRecord(message)) {
      collectImageUrlsFromMaybeImagesField((message as { images?: unknown }).images, out, seen)
      collectImageUrlsFromContentParts((message as { content?: unknown }).content, out, seen)
    }
  }
}

/**
 * 给 OpenAI-compatible provider 注入的 metadataExtractor。
 *
 * 说明：
 * - provider 会把 extractor 的结果 merge 到 `providerMetadata`；
 * - 我们把图片挂在 `{[providerKey]: { images: [{url}] }}` 下，便于 stream-chat.ts 统一读取。
 */
export function createOpenAiCompatibleInlineImageMetadataExtractor(providerKey: string): MetadataExtractor {
  const key = String(providerKey || '').trim()
  if (!key) {
    throw new I18nError('errors.providerKeyMissing')
  }

  /**
   * 把图片 URL 列表打包成 AI SDK 约定的 provider metadata 结构。
   *
   * @param urls - 已提取到的图片 URL 列表。
   * @returns 供 AI SDK 合并的 metadata；无图片时返回 `undefined`。
   */
  const toMetadata = (urls: string[]): SharedV3ProviderMetadata | undefined => {
    if (urls.length === 0) return undefined
    const images: ImageUrlItem[] = urls.map((url) => ({ url }))
    return { [key]: { images } } as SharedV3ProviderMetadata
  }

  return {
        /**
     * 内部方法：`extractMetadata`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async extractMetadata({ parsedBody }) {
      const urls: string[] = []
      const seen = new Set<string>()
      collectImageUrlsFromOpenAiCompatibleBody(parsedBody, urls, seen)
      return toMetadata(urls)
    },

        /**
     * 内部方法：`createStreamExtractor`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    createStreamExtractor() {
      const urls: string[] = []
      const seen = new Set<string>()

      return {
                /**
         * 内部方法：`processChunk`。
         *
         * @remarks
         * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
         */
        processChunk(parsedChunk) {
          collectImageUrlsFromOpenAiCompatibleBody(parsedChunk, urls, seen)
        },
                /**
         * 内部方法：`buildMetadata`。
         *
         * @remarks
         * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
         */
        buildMetadata() {
          return toMetadata(urls)
        },
      }
    },
  }
}

/**
 * 解析单个 `data:` 图片 URL。
 *
 * @param url - 原始 URL。
 * @returns 解析出的媒体类型与 base64 数据；不是合法 data URL 时返回 `null`。
 */
export function parseDataUrlImage(url: string): { mediaType: string; base64: string } | null {
  const raw = String(url || '').trim()
  if (!raw.startsWith('data:')) return null

  // 格式：data:<mime>;base64,<payload>
  const m = raw.match(/^data:([^;,]+);base64,(.*)$/i)
  if (!m) return null
  const mediaType = String(m[1] || '').trim()
  const base64 = String(m[2] || '').trim()
  if (!mediaType || !base64) return null
  return { mediaType, base64 }
}

/**
 * 从 providerMetadata 中提取内联图片（data URL）并转换为包含 `base64` 与 `mediaType` 的对象。
 *
 * 注意：
 * - 这里不 fetch 远端 URL；只支持 data URL（这是 OpenRouter 当前的主流返回形式）。
 * - 若未来需要支持远端 URL，建议在本模块引入显式的策略开关与权限声明，而不是静默下载。
 */
export function extractInlineImageFilesFromProviderMetadata(
  providerMetadata: unknown,
  providerKey: string,
): Array<{ mediaType: string; base64: string }> {
  const urls = extractInlineImageUrlsFromProviderMetadata(providerMetadata, providerKey)
  if (urls.length === 0) return []

  const out: Array<{ mediaType: string; base64: string }> = []
  for (const url of urls) {
    const parsed = parseDataUrlImage(url)
    if (!parsed) continue
    if (!parsed.mediaType.toLowerCase().startsWith('image/')) continue
    out.push(parsed)
  }
  return out
}

/**
 * 从 provider metadata 中恢复内联图片 URL 列表。
 *
 * @param providerMetadata - AI SDK 回传的 provider metadata。
 * @param providerKey - 当前 OpenAI-compatible Provider 的 metadata 命名空间。
 * @returns 去重后的图片 URL 列表。
 */
export function extractInlineImageUrlsFromProviderMetadata(providerMetadata: unknown, providerKey: string): string[] {
  const key = String(providerKey || '').trim()
  if (!key) return []
  if (!isPlainRecord(providerMetadata)) return []

  const bucket = providerMetadata[key]
  if (!isPlainRecord(bucket)) return []

  const imagesField = (bucket as { images?: unknown }).images
  if (!Array.isArray(imagesField)) return []

  const out: string[] = []
  const seen = new Set<string>()
  for (const it of imagesField) {
    const url = extractUrlFromOpenRouterImageItem(it)
    if (!url) continue
    uniqPush(out, seen, url)
  }
  return out
}
