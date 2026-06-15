/**
 * 说明：`provider-utils-openai` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-utils-openai` 相关的当前文件实现与模块边界；
 * - 对外暴露 `createOpenAiEmbeddingModel`、`createOpenAiImageModel`、`createOpenAiTranscriptionModel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * OpenAI / OpenAI-compatible Provider 的重型辅助函数。
 *
 * 设计目标：
 * - 将依赖 `\@ai-sdk/openai` / `\@ai-sdk/openai-compatible` 的逻辑从公共工具层拆出；
 * - 让非 OpenAI 系 Provider 的运行时 chunk 不再被这些 SDK 连带放大。
 */

import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { FetchFunction } from '@ai-sdk/provider-utils'
import type { EmbeddingModel, ImageModel } from 'ai'
import type { SpeechModelV3, TranscriptionModelV3 } from '@ai-sdk/provider'
import { isPlainRecord } from '@/lib/utils/type-guards'
import { extractOpenAiLikeImageUrls } from '../openai-compatible/image-urls'
import { downloadUrlToBase64 } from '../image-download'
import type { ProviderConfig } from '../types'
import { extractMessageFromResponseBody } from '../utils/api-errors'
import { I18nError } from '@/lib/i18n/error'
import {
  isOfficialOpenAIProvider,
  resolveCommonParams,
  resolveOpenAiBaseURL,
} from './provider-utils-common'

/**
 * 创建 OpenAI 或 OpenAI 兼容 Provider 的 embedding 模型实例。
 *
 * 说明：
 * - 官方 OpenAI 走 `createOpenAI`，以保留 SDK 对官方接口的最佳支持；
 * - 其它平台一律走 `createOpenAICompatible`，并在缺省时回退到官方 `/v1` 地址。
 */
export function createOpenAiEmbeddingModel(config: ProviderConfig, modelId: string): EmbeddingModel {
  const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(config)

  if (isOfficialOpenAIProvider(config.id)) {
    const baseURL = resolveOpenAiBaseURL(apiHost)
    const provider = createOpenAI({ apiKey, baseURL, headers, fetch: authFetch })
    return provider.embedding(modelId)
  }

  const baseURL = resolveOpenAiBaseURL(apiHost) || 'https://api.openai.com/v1'
  const provider = createOpenAICompatible({ name: config.id, apiKey, baseURL, headers, fetch: authFetch })
  return provider.embeddingModel(modelId)
}

/**
 * 为 OpenAI 兼容图片接口创建一个“URL 结果兜底转 base64”的 fetch 包装器。
 *
 * 说明：
 * - 有些类 OpenAI 平台忽略 `response_format=b64_json`，只返回图片 URL；
 * - AI SDK 的 image schema 又严格要求 `b64_json`，所以这里在响应层做一次尽力修复；
 * - 若下载 URL 失败，则返回原始响应，由上层继续走 URL fallback。
 */
function createOpenAiCompatibleImageFetchWithUrlFallback(baseFetch?: FetchFunction): FetchFunction {
  /**
   * 原始 fetch 透传入口。
   *
   * 说明：
   * - 单独保留一层别名，便于在后续包装逻辑里明确区分“原始响应”和“修补后的响应”；
   * - 当前不注入额外 header 或重试策略，只保持与浏览器原生 fetch 一致。
   */
  const effectiveFetch: FetchFunction = baseFetch ?? ((...args) => fetch(...args))

  return async (input, init) => {
    const res = await effectiveFetch(input as RequestInfo | URL, init)
    if (!res.ok) return res

    const url = typeof input === 'string'
      ? input
      : (input instanceof URL ? input.toString() : (input as Request).url)
    if (!/\/images\/(?:generations|edits)\b/.test(url)) return res

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) return res

    let json: unknown
    try {
      json = await res.clone().json()
    } catch {
      return res
    }

    // 兼容：部分“类 OpenAI”平台忽略 response_format=b64_json，返回 url 列表；
    // 这里把 url 下载为 base64，并改写为 { data: [{ b64_json }] } 以满足 AI SDK 的严格 schema。
    if (
      isPlainRecord(json) &&
      Array.isArray(json.data) &&
      json.data.every((it) => isPlainRecord(it) && typeof it.b64_json === 'string')
    ) {
      return res
    }

    const urls = extractOpenAiLikeImageUrls(json)
    if (urls.length === 0) return res

    // 注意：URL 可能指向第三方 OSS/CDN 域名；安装期 host access 已覆盖普通 http/https。
    // 这里“尽力而为”：能下载就改写为 b64_json；否则返回原响应，让上层走 url fallback。
    let b64s: string[]
    try {
      b64s = await Promise.all(urls.map(async (u) => await downloadUrlToBase64(u)))
    } catch {
      return res
    }
    const ok = b64s.filter(Boolean)
    if (ok.length === 0) return res

    const patched = { ...(isPlainRecord(json) ? json : {}), data: ok.map((b64) => ({ b64_json: b64 })) }
    const body = JSON.stringify(patched)

    const headers = new Headers(res.headers)
    headers.set('content-type', 'application/json')
    return new Response(body, { status: res.status, statusText: res.statusText, headers })
  }
}

/**
 * 创建 OpenAI 或 OpenAI 兼容 Provider 的图片模型实例。
 *
 * 说明：
 * - 官方 OpenAI 直接使用原生 image model；
 * - OpenAI 兼容平台会挂上 URL-\>base64 的 fetch fallback，提升非标准实现的兼容率。
 */
export function createOpenAiImageModel(config: ProviderConfig, modelId: string): ImageModel {
  const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(config)

  if (isOfficialOpenAIProvider(config.id)) {
    const baseURL = resolveOpenAiBaseURL(apiHost)
    const provider = createOpenAI({ apiKey, baseURL, headers, fetch: authFetch })
    return provider.image(modelId)
  }

  const baseURL = resolveOpenAiBaseURL(apiHost) || 'https://api.openai.com/v1'
  const provider = createOpenAICompatible({
    name: config.id,
    apiKey,
    baseURL,
    headers,
    fetch: createOpenAiCompatibleImageFetchWithUrlFallback(authFetch),
  })
  return provider.imageModel(modelId)
}

/**
 * 内部函数：`supportsOpenAiAudioEndpoints`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function supportsOpenAiAudioEndpoints(config: ProviderConfig): boolean {
  const providerId = String(config.id || '').trim().toLowerCase()
  return providerId === 'openai' || providerId === 'together'
}

/**
 * 内部函数：`createOpenAiAudioProvider`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function createOpenAiAudioProvider(config: ProviderConfig, capability: 'transcription' | 'speech') {
  if (!supportsOpenAiAudioEndpoints(config)) {
    throw new I18nError(
      capability === 'transcription' ? 'errors.providerTypeTranscriptionNotSupported' : 'errors.providerTypeSpeechNotSupported',
      { providerType: String(config.type) },
    )
  }

  const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(config)
  const baseURL = resolveOpenAiBaseURL(apiHost) || 'https://api.openai.com/v1'
  return createOpenAI({ apiKey, baseURL, headers, name: config.id, fetch: authFetch })
}

/**
 * 导出函数：`createOpenAiTranscriptionModel`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function createOpenAiTranscriptionModel(config: ProviderConfig, modelId: string): TranscriptionModelV3 {
  return createOpenAiAudioProvider(config, 'transcription').transcription(modelId)
}

/**
 * 导出函数：`createOpenAiSpeechModel`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function createOpenAiSpeechModel(config: ProviderConfig, modelId: string): SpeechModelV3 {
  return createOpenAiAudioProvider(config, 'speech').speech(modelId)
}

/**
 * 内部函数：`parseJsonResponse`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

/**
 * 导出函数：`runOpenAiModeration`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function runOpenAiModeration(
  config: ProviderConfig,
  modelId: string,
  input: string,
  signal?: AbortSignal,
): Promise<{
  blocked: boolean
  categories?: ReadonlyArray<string>
  reason?: string
  raw?: unknown
}> {
  if (!isOfficialOpenAIProvider(config.id)) {
    throw new I18nError('errors.providerTypeModerationNotSupported', { providerType: String(config.type) })
  }

  const { apiHost, headers, authHeaders } = resolveCommonParams(config)
  const baseURL = resolveOpenAiBaseURL(apiHost) || 'https://api.openai.com/v1'
  const response = await fetch(`${baseURL}/moderations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...authHeaders,
    },
    body: JSON.stringify({ model: modelId, input }),
    signal,
  })
  const body = await parseJsonResponse(response)
  if (!response.ok) {
    const detail = extractMessageFromResponseBody(body)
    throw detail
      ? new I18nError('errors.apiCallHttpErrorWithDetail', { status: response.status, detail })
      : new I18nError('errors.apiCallHttpError', { status: response.status })
  }
  if (!isPlainRecord(body) || !Array.isArray(body.results) || !isPlainRecord(body.results[0])) {
    throw new I18nError('errors.moderationInvalidResponse')
  }

  const first = body.results[0]
  const flagged = Boolean(first.flagged)
  const categories = isPlainRecord(first.categories)
    ? Object.entries(first.categories)
      .filter((entry) => entry[1] === true)
      .map((entry) => entry[0])
    : []

  return {
    blocked: flagged,
    ...(categories.length > 0 ? { categories } : {}),
    ...(flagged && categories.length > 0 ? { reason: categories.join(', ') } : {}),
    raw: body,
  }
}
