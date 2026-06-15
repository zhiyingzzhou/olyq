/**
 * 说明：`provider-utils-common` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-utils-common` 相关的当前文件实现与模块边界；
 * - 对外暴露 `OpenAiCompatibleRequestBody`、`OpenAiCompatibleRequestBodyTransformer`、`sanitizeCustomHeaders` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Provider adapters 共享的轻量工具函数。
 *
 * 设计目标：
 * - 仅保留不依赖具体 AI SDK 实现的公共逻辑；
 * - 避免非 OpenAI 系 Provider 因共享工具文件而意外引入 OpenAI SDK 代码。
 */

import { isPlainRecord } from '@/lib/utils/type-guards'
import { OPENROUTER_NATIVE_WEB_SEARCH_SENTINEL } from '../native-web-search-constants'
import {
  normalizeAnthropicApiBase,
  normalizeGoogleGenerativeAiApiBase,
  normalizeOpenAiLikeApiBase,
} from '../api-host'
import { resolveProviderRequestParams, sanitizeProviderExtraHeaders, type ResolvedProviderRequestParams } from '../provider-auth'
import type { ProviderConfig, TransportProtocol, VertexServiceAccountConfig } from '../types'

/**
 * 过滤后的 Provider 通用请求参数。
 *
 * 说明：
 * - 该结构只保留所有适配器都会用到的最小公共集；
 * - `headers` 已经过滤掉鉴权和内容类型头，避免与 SDK 内建逻辑冲突。
 */
type ResolvedProviderCommonParams = {
  /** 归一化后的 API Host。空字符串表示由底层 SDK 使用默认地址。 */
  apiHost: string
  /** 经轮换策略处理后的 API Key。 */
  apiKey: string
  /** 已过滤敏感头和非法键名后的自定义请求头。 */
  headers: Record<string, string>
  /** 当前请求应显式注入的鉴权 headers；默认 SDK 路径可能不需要直接使用。 */
  authHeaders: Record<string, string>
  /** 自定义鉴权时覆盖 SDK 默认鉴权的 fetch。 */
  authFetch?: ResolvedProviderRequestParams['authFetch']
  /** 当前生效的 API Key 鉴权描述。 */
  apiKeyAuth: ResolvedProviderRequestParams['apiKeyAuth']
}

/**
 * 解析后的 Google 服务账号凭据。
 *
 * 说明：
 * - 仅抽取 provider adapter 真正会使用的核心字段；
 * - 原始 JSON 中的其它字段不会继续向下游透传。
 */
type ParsedGoogleCredentials = {
  /** Service Account 邮箱，用于构建 JWT `iss`。 */
  clientEmail: string
  /** 规范化换行后的私钥内容。 */
  privateKey: string
  /** 私钥 ID，可用于部分签名调试与头部补充。 */
  privateKeyId?: string
}

/**
 * OpenAI-compatible 请求体的最小读写视图。
 *
 * 说明：
 * - 这里只声明变换器真正会读取/返回的公共结构；
 * - 其余字段保持为 `unknown`，避免把 Provider 私有请求体误收窄成 `any`。
 */
export type OpenAiCompatibleRequestBody = Record<string, unknown> & {
  /** OpenAI-compatible 消息数组；是否存在由调用方决定。 */
  messages?: unknown[]
}

/** OpenAI-compatible 请求体变换器。 */
export type OpenAiCompatibleRequestBodyTransformer = (
  args: OpenAiCompatibleRequestBody,
) => OpenAiCompatibleRequestBody

/**
 * 清洗用户填写的自定义请求头。
 *
 * 说明：
 * - 过滤空键名与非字符串值；
 * - 显式拦截常见鉴权头、`content-type` 与当前解析出的鉴权头，避免覆盖 SDK 或统一 helper 生成的鉴权。
 */
export function sanitizeCustomHeaders(headers?: Record<string, string>): Record<string, string> {
  return sanitizeProviderExtraHeaders(headers, 'Authorization')
}

/**
 * 删除 URL 末尾的冗余斜杠。
 *
 * 说明：
 * - Provider 配置经常出现手填 `https://host/`、`https://host////` 等情况；
 * - 统一收口后，后续 baseURL 归一化逻辑更容易拼接版本段。
 */
export function trimSlash(url: string): string {
  return String(url || '').trim().replace(/\/+$/, '')
}

/**
 * 判断当前 Provider 是否就是官方 OpenAI Provider。
 *
 * 说明：
 * - 官方 OpenAI 与“OpenAI 兼容平台”共用很多调用参数；
 * - 但 embedding/image 创建时需要分别走 `createOpenAI` 和 `createOpenAICompatible`。
 */
export function isOfficialOpenAIProvider(providerId: string): boolean {
  return String(providerId || '').trim().toLowerCase() === 'openai'
}

/**
 * 归一化 OpenAI 类 API 的 baseURL。
 *
 * 说明：
 * - 输入可以是 host、base path 或已经带 `/v1` 的完整地址；
 * - 统一交由 `normalizeOpenAiLikeApiBase` 生成适配 AI SDK 的最终值。
 */
export function resolveOpenAiBaseURL(apiHost: string): string | undefined {
  const base = trimSlash(apiHost)
  if (!base) return undefined
  return normalizeOpenAiLikeApiBase(base, 'v1') || undefined
}

/**
 * 归一化 Anthropic Messages API 的 baseURL。
 *
 * 说明：
 * - Anthropic provider 的 `apiHost` 只认 native Messages API base；
 * - 用户误填 `/messages` 或 `/models` 时，这里会回退到统一 base；
 * - 返回 `undefined` 时由调用方继续使用 SDK 默认地址。
 */
export function resolveAnthropicBaseURL(apiHost: string): string | undefined {
  const base = trimSlash(apiHost)
  if (!base) return undefined
  return normalizeAnthropicApiBase(base, 'v1') || undefined
}

/**
 * 归一化 Gemini / Google Generative AI 的 baseURL。
 *
 * 说明：
 * - 扩展端统一按 `v1beta` 路径组织 Gemini 请求；
 * - 返回 `undefined` 时由调用方继续使用 SDK 默认地址。
 */
export function resolveGeminiBaseURL(apiHost: string): string | undefined {
  const base = trimSlash(apiHost)
  if (!base) return undefined
  return normalizeGoogleGenerativeAiApiBase(base, 'v1beta') || undefined
}

/**
 * 读取 Provider 模型配置中声明的传输协议。
 *
 * 说明：
 * - 该函数只读取模型配置，不做语义推断；
 * - New API / Gateway / xAI 等多协议 Provider 都通过该字段分流；
 * - 未声明时返回 undefined，由调用方再决定默认协议。
 */
export function resolveModelTransportProtocol(
  config: ProviderConfig,
  modelId: string,
): TransportProtocol | undefined {
  const target = String(modelId || '').trim()
  if (!target) return undefined
  const m = (config.models || []).find((x) => String(x?.id || '').trim() === target)
  return m?.transportProtocol
}

/**
 * 读取 New API 模型配置中声明的传输协议。
 *
 * 说明：
 * - 仅对 `type === 'new-api'` 的 Provider 有意义；
 * - 用于把同一网关下的模型分流到 OpenAI / Responses / Anthropic / Gemini 等不同协议。
 */
export function resolveNewApiTransportProtocol(
  config: ProviderConfig,
  modelId: string,
): TransportProtocol | undefined {
  if (config.type !== 'new-api') return undefined
  return resolveModelTransportProtocol(config, modelId)
}

/**
 * Vertex Service Account 的最小读取视图。
 *
 * 说明：
 * - 这里只接收当前 schema 真源里的显式字段；
 * - 不再解析旧 `credentialsJson`，避免重新引入服务账号 JSON 双真源。
 */
export function normalizeGoogleServiceAccountCredentials(
  serviceAccount?: VertexServiceAccountConfig,
): ParsedGoogleCredentials | undefined {
  const clientEmail = typeof serviceAccount?.clientEmail === 'string' ? serviceAccount.clientEmail.trim() : ''
  const privateKeyRaw = typeof serviceAccount?.privateKey === 'string' ? serviceAccount.privateKey : ''
  const privateKeyId =
    typeof serviceAccount?.privateKeyId === 'string' && serviceAccount.privateKeyId.trim()
      ? serviceAccount.privateKeyId.trim()
      : undefined
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n').trim()
  if (!clientEmail || !privateKey) return undefined
  return { clientEmail, privateKey, ...(privateKeyId ? { privateKeyId } : {}) }
}

/**
 * 解析所有 provider adapters 共享的通用参数（apiHost/apiKey/headers/authFetch）。
 */
export function resolveCommonParams(config: ProviderConfig): ResolvedProviderCommonParams {
  return resolveProviderRequestParams(config)
}

/**
 * 判断 OpenAI-compatible 聊天请求是否应注入 `stream_options.include_usage`。
 *
 * 说明：
 * - AI SDK 通过 provider 级 `includeUsage` 开关控制该字段；
 * - 当网关明确不支持 `stream_options / usage` 时，必须彻底关闭。
 */
export function shouldIncludeOpenAiCompatibleUsage(config: ProviderConfig): boolean {
  return config.apiOptions?.isNotSupportStreamOptions !== true
}

/**
 * 生成 OpenAI-compatible 请求体变换器。
 *
 * 说明：
 * - 目前只负责把 system message 改写成 developer role；
 * - 仅在用户显式开启“支持 developer role”时生效，避免误伤未知兼容网关。
 */
export function createOpenAiCompatibleRequestBodyTransformer(
  config: ProviderConfig,
): OpenAiCompatibleRequestBodyTransformer | undefined {
  const shouldTransformDeveloperRole = config.apiOptions?.isSupportDeveloperRole === true
  const shouldTransformOpenRouterNativeSearch = String(config.id || '').trim().toLowerCase() === 'openrouter'
  if (!shouldTransformDeveloperRole && !shouldTransformOpenRouterNativeSearch) return undefined

  return (args: OpenAiCompatibleRequestBody) => {
    let nextArgs: OpenAiCompatibleRequestBody = args

    if (shouldTransformOpenRouterNativeSearch && args[OPENROUTER_NATIVE_WEB_SEARCH_SENTINEL]) {
      const { [OPENROUTER_NATIVE_WEB_SEARCH_SENTINEL]: _removed, ...rest } = args
      const existingTools = Array.isArray(rest.tools) ? rest.tools : []
      const serverTool = isPlainRecord(args[OPENROUTER_NATIVE_WEB_SEARCH_SENTINEL])
        ? {
          type: 'openrouter:web_search',
          parameters: args[OPENROUTER_NATIVE_WEB_SEARCH_SENTINEL],
        }
        : { type: 'openrouter:web_search' }
      nextArgs = {
        ...rest,
        tools: [
          ...existingTools,
          serverTool,
        ],
      }
    }

    if (!shouldTransformDeveloperRole || !Array.isArray(nextArgs.messages) || nextArgs.messages.length === 0) return nextArgs

    let changed = false
    const messages = nextArgs.messages.map((message) => {
      if (!isPlainRecord(message) || message.role !== 'system') return message
      changed = true
      return { ...message, role: 'developer' }
    })

    return changed ? { ...nextArgs, messages } : nextArgs
  }
}

/**
 * 解析官方 OpenAI 的 system message mode。
 *
 * 说明：
 * - 开启 `isSupportDeveloperRole` 后，强制使用 developer role；
 * - 否则显式退回 system，避免 SDK 依据模型白名单自动切到 developer。
 */
export function resolveOpenAiSystemMessageMode(config: ProviderConfig): 'system' | 'developer' {
  return config.apiOptions?.isSupportDeveloperRole === true ? 'developer' : 'system'
}
