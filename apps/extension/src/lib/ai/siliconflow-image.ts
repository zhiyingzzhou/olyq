/**
 * 说明：`siliconflow-image` AI 能力模块。
 *
 * 职责：
 * - 承载 `siliconflow-image` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SiliconFlowImageModel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：SiliconFlow 图片生成/编辑（ImageModelV3）。
 *
 * 背景
 * - SiliconFlow 的图片接口“形似 OpenAI”，但存在关键差异：
 *   - 文生图：`POST /v1/images/generations`（JSON）
 *   - 图生图/编辑：官方仍使用 `POST /v1/images/generations`（JSON），而不是 OpenAI 的 `/images/edits`（multipart/form-data）
 *
 * 问题
 * - Vercel AI SDK 的 `\@ai-sdk/openai-compatible` 在检测到输入图片（files）时会自动切换到
 *   `/images/edits` + form-data，导致 SiliconFlow 返回 404。
 *
 * 目标
 * - 仍然通过 AI SDK 的 `generateImage()` 驱动业务层；
 * - 把 SiliconFlow 的端点与字段差异收敛在一个 ImageModel 内；
 * - 保持可扩展：允许通过 providerOptions 透传 SiliconFlow 的扩展参数（steps、guidance_scale 等）。
 */

import type { ImageModelV3, ImageModelV3CallOptions, ImageModelV3File, SharedV3Warning } from '@ai-sdk/provider'
import { createJsonResponseHandler, createStatusCodeErrorResponseHandler, postJsonToApi } from '@ai-sdk/provider-utils'
import { z } from 'zod/v4'
import { isPlainRecord } from '@/lib/utils/type-guards'
import { I18nError } from '@/lib/i18n/error'
import { downloadUrlToBase64, resolveDownloadHostMatchPatterns, uint8ToBase64 } from './image-download'
import { extractOpenAiLikeImageUrls } from './openai-compatible/image-urls'

/**
 * 合并默认请求头与调用方额外 headers。
 *
 * @param base - 模型内部强制要求的基础请求头。
 * @param extra - 调用方额外传入的 headers。
 * @returns 过滤掉调用方鉴权头后的最终请求头。
 */
function mergeHeaders(base: Record<string, string | undefined>, extra?: Record<string, string | undefined>) {
  if (!extra) return base
  const out: Record<string, string | undefined> = { ...base }
  const blocked = new Set([
    'authorization',
    'x-api-key',
    'x-goog-api-key',
    'api-key',
    'xi-api-key',
    ...Object.keys(base).map((key) => key.trim().toLowerCase()),
  ])
  for (const [kRaw, vRaw] of Object.entries(extra)) {
    const k = String(kRaw || '').trim()
    const v = typeof vRaw === 'string' ? vRaw.trim() : ''
    if (!k || !v) continue
    // 约束：鉴权头必须由 provider-auth 统一控制，避免用户误填导致 401/签名泄漏。
    if (blocked.has(k.toLowerCase())) continue
    out[k] = v
  }
  return out
}

/**
 * 把 snake_case / kebab-case Provider key 转成 camelCase。
 *
 * @param str - 原始 key。
 * @returns camelCase 形式的 key。
 */
function toCamelCase(str: string): string {
  return str.replace(/[_-]([a-z])/g, (_, c: string) => c.toUpperCase())
}

/**
 * 把 AI SDK 图像文件输入转换为 SiliconFlow 请求体可接受的 image 值。
 *
 * @param file - AI SDK 图像文件对象。
 * @returns URL 或 data URL 字符串。
 */
function fileToSiliconFlowImageValue(file: ImageModelV3File): string {
  if (file.type === 'url') return file.url

  const mediaType = String(file.mediaType || 'image/png')
  const raw = file.data

  // AI SDK 通常会传 Uint8Array；这里兼容少数实现传 base64 字符串。
  const base64 =
    typeof raw === 'string' ? raw
    : raw instanceof Uint8Array ? uint8ToBase64(raw)
    : uint8ToBase64(new Uint8Array(raw))

  return `data:${mediaType};base64,${base64}`
}

/**
 * 从 OpenAI-like 图像响应中提取 `b64_json` 输出。
 *
 * @param json - 原始响应体。
 * @returns 去重后的 base64 图像数组。
 */
function extractOpenAiLikeB64Json(json: unknown): string[] {
  if (!isPlainRecord(json)) return []
  const buckets = [json.data, json.images]
  const out: string[] = []
  for (const v of buckets) {
    if (!Array.isArray(v)) continue
    for (const it of v) {
      if (!isPlainRecord(it)) continue
      const b64 = it.b64_json
      if (typeof b64 === 'string' && b64.trim()) out.push(b64.trim())
    }
  }
  return Array.from(new Set(out))
}

/**
 * 判断模型是否属于 Qwen 图片编辑模型。
 *
 * @param modelId - 模型 ID。
 * @returns `true` 表示必须传入输入图片。
 */
function isQwenImageEditModel(modelId: string): boolean {
  return /^qwen\/qwen-image-edit\b/i.test(String(modelId || '').trim())
}

/**
 * 返回当前 Qwen 图片编辑模型支持的最大输入图片数。
 *
 * @param modelId - 模型 ID。
 * @returns 可接受的最大输入图片数量。
 */
function qwenEditInputImageLimit(modelId: string): number {
  const id = String(modelId || '').trim()
  // 官方文档：Qwen/Qwen-Image-Edit-2509 支持 image/image2/image3；旧版 Qwen/Qwen-Image-Edit 仅支持 image
  if (/^qwen\/qwen-image-edit-2509$/i.test(id)) return 3
  if (/^qwen\/qwen-image-edit$/i.test(id)) return 1
  return 1
}

/**
 * 判断模型是否支持 `image_size` 参数。
 *
 * @param modelId - 模型 ID。
 * @returns `true` 表示可安全透传 size/image_size。
 */
function supportsImageSize(modelId: string): boolean {
  // 官方文档：Qwen Image Edit 系列不支持 image_size
  if (isQwenImageEditModel(modelId)) return false
  return true
}

/**
 * 判断模型是否支持批量生成数量参数。
 *
 * @param modelId - 模型 ID。
 * @returns `true` 表示可以安全传递 `batch_size`。
 */
function supportsBatchSize(modelId: string): boolean {
  // 官方文档：batch_size 仅适用于 Kwai-Kolors/Kolors
  return /^kwai-kolors\/kolors\b/i.test(String(modelId || '').trim())
}

// 说明：这里仅需要“能解析为 JSON”的返回体；后续会自行做字段提取与兜底，因此用 unknown 收敛即可。
const siliconFlowUnknownJsonSchema = z.unknown()

/**
 * 导出类：`SiliconFlowImageModel`。
 *
 * @remarks
 * 封装当前模块对外暴露的类级能力，具体行为和生命周期语义以实现为准。
 */
export class SiliconFlowImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3' as const

  /**
   * 说明：
   * - provider 字段用于 providerOptions 命名空间（AI SDK 约定：providerOptions 的外层 key）。
   * - 这里沿用 OpenAI/OpenAI-Compatible 的惯例：`${providerId}.image`。
   */
  readonly provider: string

  // 官方文档只把 `batch_size` 归属到 Kwai-Kolors/Kolors；其它模型单次只声明稳定 1 张，交给 AI SDK 按 n 拆批。
  readonly maxImagesPerCall = ({ modelId }: { modelId: string }) => (supportsBatchSize(modelId) ? 4 : 1)

  private readonly providerOptionsKey: string

  constructor(
    readonly modelId: string,
    private readonly authHeaders: Record<string, string>,
    private readonly baseUrl: string,
    private readonly defaultHeaders: Record<string, string>,
    providerId: string,
  ) {
    const pid = String(providerId || '').trim() || 'siliconflow'
    this.provider = `${pid}.image`
    this.providerOptionsKey = pid
  }

    /**
   * 内部方法：`getArgs`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  private getArgs(providerOptions: ImageModelV3CallOptions['providerOptions']): Record<string, unknown> {
    const key = this.providerOptionsKey
    return {
      ...(isPlainRecord(providerOptions?.[key]) ? providerOptions[key] : {}),
      ...(isPlainRecord(providerOptions?.[toCamelCase(key)]) ? providerOptions[toCamelCase(key)] : {}),
    }
  }

    /**
   * 内部方法：`doGenerate`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  async doGenerate(options: Parameters<ImageModelV3['doGenerate']>[0]): Promise<Awaited<ReturnType<ImageModelV3['doGenerate']>>> {
    const { prompt, n, size, aspectRatio, seed, files, mask, providerOptions, headers, abortSignal } = options

    const warnings: SharedV3Warning[] = []

    // 约束：Qwen Image Edit 系列为“编辑专用模型”，必须提供输入图片（否则常见 4xx/参数错误）。
    if (isQwenImageEditModel(this.modelId) && (!files || files.length === 0)) {
      throw new I18nError('errors.inputImageRequiredForEditModel')
    }

    if (aspectRatio != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'aspectRatio',
        details: 'SiliconFlow 当前不支持 aspectRatio；请使用 size（或留空使用默认尺寸）。',
      })
    }

    if (mask != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'mask',
        details: 'SiliconFlow /images/generations 暂不支持 mask（inpainting）；已忽略。',
      })
    }

    const args = this.getArgs(providerOptions)

    const supportsBatchGeneration = supportsBatchSize(this.modelId)
    const body: Record<string, unknown> = {
      model: this.modelId,
      // 兼容：部分图像操作可能允许空 prompt；若 SiliconFlow 侧强校验，会返回 4xx，交由上层展示即可。
      ...(typeof prompt === 'string' ? { prompt } : {}),
      ...(supportsBatchGeneration ? { n, batch_size: n } : {}),
      // 兼容 OpenAI-like：即便部分模型忽略该字段，也不会影响 url 输出；若生效则可减少一次下载。
      response_format: 'b64_json',
      ...(typeof seed === 'number' && Number.isFinite(seed) ? { seed: Math.floor(seed) } : {}),
      ...args,
    }

    // 尺寸：SiliconFlow 多数模型使用 image_size；但 Qwen Edit 系列不支持该字段（官方文档）。
    if (size && supportsImageSize(this.modelId)) {
      body.image_size = size
    } else if (size && !supportsImageSize(this.modelId)) {
      warnings.push({
        type: 'unsupported',
        feature: 'size',
        details: '当前模型不支持 size/image_size；已忽略该参数。',
      })
    }

    // 输入图片（编辑/图生图）：官方仍走 /images/generations，并通过 image/image2/image3 传入。
    if (files && files.length > 0) {
      const limit = isQwenImageEditModel(this.modelId) ? qwenEditInputImageLimit(this.modelId) : 1
      const used = files.slice(0, limit).map(fileToSiliconFlowImageValue)
      body.image = used[0]
      if (limit >= 2 && used[1]) body.image2 = used[1]
      if (limit >= 3 && used[2]) body.image3 = used[2]

      if (files.length > limit) {
        warnings.push({
          type: 'unsupported',
          feature: 'files',
          details: `当前模型最多支持 ${limit} 张输入图片；已忽略多余图片（共 ${files.length} 张）。`,
        })
      }
    }

    // 注意：this.baseUrl 通常包含 `/v1`；这里必须做“字符串拼接”，避免 new URL('/path', base) 覆盖掉 /v1。
    const url = `${String(this.baseUrl || '').replace(/\/+$/, '')}/images/generations`

    const { value: json, responseHeaders } = await postJsonToApi({
      url,
      headers: mergeHeaders(
        {
          ...this.defaultHeaders,
          ...this.authHeaders,
        },
        headers,
      ),
      body,
      failedResponseHandler: createStatusCodeErrorResponseHandler(),
      successfulResponseHandler: createJsonResponseHandler(siliconFlowUnknownJsonSchema),
      abortSignal,
    })

    // 1) 若返回 b64_json，直接使用
    const b64s = extractOpenAiLikeB64Json(json)
    if (b64s.length > 0) {
      return {
        images: b64s,
        warnings,
        response: { timestamp: new Date(), modelId: this.modelId, headers: responseHeaders },
      }
    }

    // 2) 常见：返回 url（data/images），需要下载转 base64
    const urls = extractOpenAiLikeImageUrls(json)
    if (urls.length === 0) {
      const detail = (() => {
        try {
          return JSON.stringify(json).slice(0, 200)
        } catch {
          return ''
        }
      })()
      throw new I18nError('errors.imageGenerationFailedWithDetail', { detail: detail || 'Invalid response' })
    }

    // 与 DashScope 同理：图片 URL 可能在第三方 OSS/CDN 域名；安装期 host access 已覆盖普通 http/https。
    await resolveDownloadHostMatchPatterns(urls, { causeKind: 'image-url-download' })

    const downloaded = await Promise.all(urls.map((u) => downloadUrlToBase64(u)))
    const ok = downloaded.filter(Boolean)
    if (ok.length === 0) {
      throw new I18nError('errors.imageDownloadFailedGeneric')
    }

    return {
      images: ok,
      warnings,
      response: { timestamp: new Date(), modelId: this.modelId, headers: responseHeaders },
    }
  }
}
