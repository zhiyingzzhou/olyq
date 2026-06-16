/**
 * 说明：`dashscope-image` AI 能力模块。
 *
 * 职责：
 * - 承载 `dashscope-image` 相关的当前文件实现与模块边界；
 * - 对外暴露 `extractDashScopeMultimodalOutputImageUrls`、`DashScopeImageModel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：DashScope 图像生成/编辑（ImageModelV3）。
 *
 * 本模块刻意把 DashScope 的“官方接口差异”封装在一个 ImageModel 内，供 AI SDK 的 `generateImage()` 直接调用。
 * 上层（聊天页/绘画页）只需要依赖 AI SDK，不需要关心：
 * - 哪个模型走同步接口、哪个走异步任务接口
 * - 输入图片是 URL 还是 base64（data URL）
 * - 输出是临时 URL 还是可直接落库的 base64
 *
 * 支持的模型族（按官方推荐）：
 * - 千问（Qwen-Image）：同步接口（推荐）：
 *     POST /api/v1/services/aigc/multimodal-generation/generation
 *   说明：`qwen-image-edit*` 为编辑模型，需要输入图片（否则常见报错：url error）。
 *
 * - 万相（Wan / Wanx）：异步任务接口：
 *     POST /api/v1/services/aigc/text2image/image-synthesis   （提交任务）
 *     GET  `/api/v1/tasks/{task_id}`                         （轮询结果）
 */

import type { ImageModelV3, ImageModelV3CallOptions } from '@ai-sdk/provider'
import type { ImageModelV3File } from '@ai-sdk/provider'
import { I18nError } from '@/lib/i18n/error'
import { downloadUrlToBase64, resolveDownloadHostMatchPatterns, uint8ToBase64 } from './image-download'

const DASHSCOPE_CN = 'https://dashscope.aliyuncs.com'
const DASHSCOPE_INTL = 'https://dashscope-intl.aliyuncs.com'

/**
 * 判断模型是否属于 Qwen 图像模型族。
 *
 * @param modelId - 模型 ID。
 * @returns `true` 表示当前模型走 Qwen 图像接口。
 */
function isQwenImageModel(modelId: string): boolean {
  return /^qwen-image/i.test(modelId)
}

/**
 * 判断模型是否为“仅支持编辑”的 Qwen 图像模型。
 *
 * @param modelId - 模型 ID。
 * @returns `true` 表示调用时必须提供输入图片。
 */
function isQwenEditOnlyModel(modelId: string): boolean {
  // 编辑专用模型（需要 files）
  return /^qwen-image-edit/i.test(modelId)
}

/**
 * 判断 Qwen 图像模型是否支持一次请求返回多张图片。
 *
 * @param modelId - 模型 ID。
 * @returns `true` 表示可以把 AI SDK 当前批次的 `n` 原样传给 DashScope。
 */
function supportsQwenMultiImagePerCall(modelId: string): boolean {
  const id = String(modelId || '').trim()
  return /^qwen-image-2\.0/i.test(id) || /^qwen-image-edit-(?:max|plus)\b/i.test(id)
}

/**
 * 判断模型是否属于 Wan/Wanx 文生图模型族。
 *
 * @param modelId - 模型 ID。
 * @returns `true` 表示当前模型走异步 Wanx 文生图接口。
 */
function isWanTextToImageModel(modelId: string): boolean {
  // 兼容：wan2.6-t2i / wanx2.0-t2i / wanx2.1-t2i 等
  return /^wanx?/i.test(modelId) || /^wan\d/i.test(modelId)
}

/** 尺寸格式：AI SDK 使用 "1024x1024"，Wanx 原生 API 使用 "1024*1024" */
function toWanxSize(size: `${number}x${number}` | undefined): string | undefined {
  return size ? size.replace('x', '*') : undefined
}

/** Qwen 固定尺寸（官方文档允许的 5 种）；用于 aspectRatio → size 的兜底映射。 */
const QWEN_FIXED_SIZES_BY_RATIO: Record<string, string> = {
  '16:9': '1664*928',
  '9:16': '928*1664',
  '1:1': '1328*1328',
  '4:3': '1472*1104',
  '3:4': '1104*1472',
}

/**
 * 将 AI SDK 的尺寸/宽高比参数映射为 Qwen 接口使用的 `宽*高` 格式。
 *
 * @param size - AI SDK 传入的固定尺寸。
 * @param aspectRatio - AI SDK 传入的宽高比。
 * @returns Qwen 接口可接受的尺寸字符串。
 */
function toQwenSize(size: `${number}x${number}` | undefined, aspectRatio: `${number}:${number}` | undefined): string | undefined {
  if (size) return size.replace('x', '*')
  if (!aspectRatio) return undefined
  return QWEN_FIXED_SIZES_BY_RATIO[String(aspectRatio)] || undefined
}

/**
 * 下载远端图片 URL 并转成 base64。
 *
 * @param url - 图片 URL。
 * @returns base64 编码字符串。
 */
async function urlToBase64(url: string): Promise<string> {
  const b64 = await downloadUrlToBase64(url)
  if (!b64) throw new I18nError('errors.imageDownloadFailed', { status: 0 })
  return b64
}

/**
 * 把 AI SDK 图像文件输入转换为 DashScope `image` 字段接受的值。
 *
 * @param f - AI SDK 图像文件对象。
 * @returns 可直接写入 DashScope 请求体的 URL 或 data URL。
 */
function fileToDashScopeImageValue(f: ImageModelV3File): string {
  if (f.type === 'url') return f.url
  // DashScope 支持 data URL（base64）作为 image 字段的值
  const mediaType = String(f.mediaType || 'image/png')
  const raw = f.data
  const bytes = typeof raw === 'string' ? raw : uint8ToBase64(raw)
  return `data:${mediaType};base64,${bytes}`
}

/**
 * 合并请求头，并过滤掉用户自定义的鉴权头。
 *
 * @param base - 基础请求头。
 * @param extra - 用户额外传入的 headers。
 * @returns 合并后的 headers。
 */
function mergeHeaders(base: Record<string, string>, extra?: Record<string, string | undefined>): Record<string, string> {
  if (!extra) return base
  const out: Record<string, string> = { ...base }
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
 * 根据配置推导最终要请求的 DashScope 基础地址。
 *
 * @param baseUrl - 用户自定义 base URL。
 * @returns 归一化后的 DashScope base URL。
 */
function pickDashScopeBaseUrl(baseUrl?: string): string {
  const raw = String(baseUrl || '').trim()
  if (!raw) return DASHSCOPE_CN
  try {
    const u = new URL(raw)
    if (u.hostname === 'dashscope-intl.aliyuncs.com') return DASHSCOPE_INTL
    if (u.hostname === 'dashscope.aliyuncs.com') return DASHSCOPE_CN
  } catch {
    // ignore
  }
  return raw
}

/**
 * 从 DashScope 多模态同步响应中提取输出图片 URL 列表。
 *
 * @param json - DashScope 原始响应 JSON。
 * @returns 去重后的图片 URL 列表。
 */
export function extractDashScopeMultimodalOutputImageUrls(json: unknown): string[] {
  if (!json || typeof json !== 'object') return []
  const root = json as Record<string, unknown>
  const output = root.output
  if (!output || typeof output !== 'object') return []
  const choices = (output as Record<string, unknown>).choices
  if (!Array.isArray(choices)) return []

  const urls: string[] = []
  for (const ch of choices) {
    if (!ch || typeof ch !== 'object') continue
    const message = (ch as Record<string, unknown>).message
    if (!message || typeof message !== 'object') continue
    const content = (message as Record<string, unknown>).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const rec = part as Record<string, unknown>
      const img = rec.image
      if (typeof img === 'string' && img.trim()) urls.push(img.trim())
      else if (img && typeof img === 'object') {
        const u = (img as Record<string, unknown>).url
        if (typeof u === 'string' && u.trim()) urls.push(u.trim())
      }
      // 兼容：少数 SDK/网关可能把字段命名为 url / image_url
      const u2 = rec.url
      if (typeof u2 === 'string' && u2.trim()) urls.push(u2.trim())
      const u3 = rec.image_url
      if (typeof u3 === 'string' && u3.trim()) urls.push(u3.trim())
    }
  }
  return Array.from(new Set(urls))
}

/**
 * 导出类：`DashScopeImageModel`。
 *
 * @remarks
 * 封装当前模块对外暴露的类级能力，具体行为和生命周期语义以实现为准。
 */
export class DashScopeImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3' as const
  readonly provider = 'dashscope'
  // AI SDK 会基于 maxImagesPerCall 进行拆分/并发；Qwen 2.0 / Edit max|plus 单次最多 6 张，其它 Qwen 固定单图。
  readonly maxImagesPerCall = ({ modelId }: { modelId: string }) => (isQwenImageModel(modelId) ? (supportsQwenMultiImagePerCall(modelId) ? 6 : 1) : 4)

  constructor(
    readonly modelId: string,
    private readonly authHeaders: Record<string, string>,
    private readonly baseUrl?: string,
    private readonly defaultHeaders: Record<string, string> = {},
  ) {}

    /**
   * 内部方法：`doGenerate`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  async doGenerate(options: ImageModelV3CallOptions): Promise<{
    images: Array<string> | Array<Uint8Array>
    warnings: []
    response: { timestamp: Date; modelId: string; headers: Record<string, string> | undefined }
  }> {
    const base = pickDashScopeBaseUrl(this.baseUrl)

    const images =
      isQwenImageModel(this.modelId) ? await this.generateQwenMultimodal(options, base)
      : isWanTextToImageModel(this.modelId) ? await this.generateWanxAsync(options, base)
      : (() => { throw new I18nError('errors.dashscopeModelNotSupportedForImage', { modelId: this.modelId }) })()

    return {
      images,
      warnings: [],
      response: { timestamp: new Date(), modelId: this.modelId, headers: undefined },
    }
  }

  /**
   * Qwen-Image：同步接口（推荐）
   * - 文生图：仅传 text
   * - 编辑/图生图：传入 image + text（qwen-image-edit* 必须带 image）
   */
  private async generateQwenMultimodal(options: ImageModelV3CallOptions, base: string): Promise<string[]> {
    const { prompt, n, size, aspectRatio, seed, files, headers, abortSignal } = options

    if (isQwenEditOnlyModel(this.modelId) && (!files || files.length === 0)) {
      // 说明：这类模型缺图会返回 “url error”；这里提前失败，给到更可读的错误。
      throw new I18nError('errors.inputImageRequiredForEditModel')
    }

    const content: Array<Record<string, unknown>> = []
    for (const f of files ?? []) {
      content.push({ image: fileToDashScopeImageValue(f) })
    }
    if (typeof prompt === 'string' && prompt.trim()) {
      content.push({ text: prompt.trim() })
    }
    if (content.length === 0) throw new I18nError('errors.promptRequired')

    const qwenSize = toQwenSize(size, aspectRatio)
    const parameters: Record<string, unknown> = {
      // Qwen 目前固定为 1；若上层请求 n>1，AI SDK 会拆分为多次调用（maxImagesPerCall=1）。
      n,
      ...(qwenSize ? { size: qwenSize } : {}),
      ...(typeof seed === 'number' && Number.isFinite(seed) ? { seed: Math.floor(seed) } : {}),
    }

    const body = {
      model: this.modelId,
      input: { messages: [{ role: 'user', content }] },
      parameters,
    }

    const submitResp = await fetch(`${base}/api/v1/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      headers: mergeHeaders(
        {
          ...this.defaultHeaders,
          ...this.authHeaders,
          'Content-Type': 'application/json',
        },
        headers,
      ),
      body: JSON.stringify(body),
      signal: abortSignal,
    })
    if (!submitResp.ok) {
      const errText = await submitResp.text().catch(() => '')
      const detail = (errText || submitResp.statusText || '').slice(0, 200)
      throw new I18nError('errors.dashscopeSubmitFailedWithDetail', { status: submitResp.status, detail })
    }
    const submitJson = (await submitResp.json()) as unknown
    const urls = extractDashScopeMultimodalOutputImageUrls(submitJson)
    if (urls.length === 0) {
      throw new I18nError('errors.imageGenerationFailedWithDetail', { detail: JSON.stringify(submitJson).slice(0, 200) })
    }
    // 注意：DashScope 常返回“临时图片 URL”（可能位于 OSS/CDN 域名）。
    // 安装期 host access 已覆盖普通 http/https；这里仅解析诊断用 patterns 后直接下载转 base64。
    await resolveDownloadHostMatchPatterns(urls, { causeKind: 'image-url-download' })
    return Promise.all(urls.map(urlToBase64))
  }

  /** Wan/Wanx：异步文生图 API（提交任务 + 轮询） */
  private async generateWanxAsync(options: ImageModelV3CallOptions, base: string): Promise<string[]> {
    const { prompt, n = 1, size, headers, abortSignal } = options
    const nativeSize = toWanxSize(size)

    const body = {
      model: this.modelId,
      input: { prompt },
      parameters: { n, ...(nativeSize ? { size: nativeSize } : {}) },
    }

    const submitResp = await fetch(`${base}/api/v1/services/aigc/text2image/image-synthesis`, {
      method: 'POST',
      headers: mergeHeaders(
        {
          ...this.defaultHeaders,
          ...this.authHeaders,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
        },
        headers,
      ),
      body: JSON.stringify(body),
      signal: abortSignal,
    })
    if (!submitResp.ok) {
      const errText = await submitResp.text().catch(() => '')
      const detail = (errText || submitResp.statusText || '').slice(0, 200)
      throw new I18nError('errors.dashscopeSubmitFailedWithDetail', { status: submitResp.status, detail })
    }

    const submitJson = (await submitResp.json()) as { output?: { task_id?: string } }
    const taskId = submitJson.output?.task_id
    if (!taskId) {
      throw new I18nError('errors.dashscopeTaskIdMissingWithDetail', { detail: JSON.stringify(submitJson).slice(0, 200) })
    }

    // 每 2 秒轮询一次，最多 60 次（约 2 分钟超时）
    for (let i = 0; i < 60; i++) {
      if (abortSignal?.aborted) throw new DOMException('Aborted', 'AbortError')
      await new Promise<void>((r) => setTimeout(r, 2000))
      const pollResp = await fetch(`${base}/api/v1/tasks/${taskId}`, {
        headers: mergeHeaders({ ...this.defaultHeaders, ...this.authHeaders }, headers),
        signal: abortSignal,
      })
      if (!pollResp.ok) continue
      const pollJson = (await pollResp.json()) as {
        output?: { task_status?: string; results?: { url?: string }[]; error_message?: string }
      }
      const status = pollJson.output?.task_status
      if (status === 'SUCCEEDED') {
        const urls = (pollJson.output?.results ?? []).map((r) => r.url ?? '').filter(Boolean)
        await resolveDownloadHostMatchPatterns(urls, { causeKind: 'image-url-download' })
        return Promise.all(urls.map(urlToBase64))
      }
      if (status !== 'PENDING' && status !== 'RUNNING') {
        throw new I18nError('errors.dashscopeTaskFailedWithDetail', { status: status || 'UNKNOWN', detail: String(pollJson.output?.error_message ?? '').slice(0, 200) })
      }
    }
    throw new I18nError('errors.dashscopeGenerationTimedOut')
  }
}
