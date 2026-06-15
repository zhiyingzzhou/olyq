/**
 * 说明：`provider-auth` AI 能力模块。
 *
 * 职责：
 * - 统一解析 Provider API Key 鉴权头；
 * - 统一清理普通自定义 headers，避免鉴权出现双真源；
 * - 为 AI SDK adapter、手写 fetch、模型目录拉取和专用模型实现提供同一套 header contract。
 *
 * 边界：
 * - 本模块只处理 `ProviderConfig.apiKey` 这条通用 API Key 鉴权路径；
 * - OAuth、Vertex 服务账号、AWS Bedrock IAM 等专用鉴权继续由各自 adapter 管理。
 */

import type { FetchFunction } from '@ai-sdk/provider-utils'
import { isPlainRecord } from '@/lib/utils/type-guards'
import { pickFirstApiKey } from './api-keys'
import type { ProviderApiKeyAuthConfig, ProviderConfig, ProviderType } from './types'

const HEADER_TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

/** Provider API Key 鉴权头解析结果。 */
export interface ResolvedProviderApiKeyAuth {
  /** API Key 来源是否为用户自定义鉴权配置。 */
  readonly custom: boolean
  /** 当前生效的鉴权 header 名称。 */
  readonly headerName: string
  /** 当前生效的 value 前缀；空字符串表示裸 key。 */
  readonly valuePrefix: string
}

/** Provider 请求公共参数解析结果。 */
export interface ResolvedProviderRequestParams {
  /** 归一化后的 API Host。 */
  readonly apiHost: string
  /** 调用方已经选定的单个 API Key。 */
  readonly apiKey: string
  /** 已过滤鉴权头与 Content-Type 的普通自定义 headers。 */
  readonly headers: Record<string, string>
  /** 当前生效的 API Key 鉴权描述。 */
  readonly apiKeyAuth: ResolvedProviderApiKeyAuth
  /** 当前请求应显式注入的鉴权 headers；没有 API Key 时为空。 */
  readonly authHeaders: Record<string, string>
  /** 自定义鉴权时用于覆盖 SDK 默认鉴权的 fetch；默认鉴权时为 undefined。 */
  readonly authFetch?: FetchFunction
}

/**
 * 判断字符串是否为合法 HTTP header token。
 *
 * @param value - 待校验 header 名称。
 * @returns `true` 表示可作为 header 名称使用。
 */
export function isValidHttpHeaderName(value: string): boolean {
  return HEADER_TOKEN_RE.test(String(value || '').trim())
}

/**
 * 解析 `ProviderConfig.apiKeyAuth` 存储字段。
 *
 * @param raw - 未知输入。
 * @returns 清理后的配置；无效时返回 undefined。
 */
export function sanitizeProviderApiKeyAuthConfig(raw: unknown): ProviderApiKeyAuthConfig | undefined {
  if (!isPlainRecord(raw)) return undefined
  const headerName = typeof raw.headerName === 'string' ? raw.headerName.trim() : ''
  if (!headerName || !isValidHttpHeaderName(headerName)) return undefined
  if (/^content-type$/i.test(headerName)) return undefined

  const valuePrefixRaw = typeof raw.valuePrefix === 'string' ? raw.valuePrefix.trim() : ''
  return {
    headerName,
    ...(valuePrefixRaw ? { valuePrefix: valuePrefixRaw } : {}),
  }
}

/**
 * 判断当前 provider 类型是否使用通用 `provider.apiKey` 鉴权路径。
 *
 * @param config - Provider 配置。
 * @returns `true` 表示可在 UI 中暴露 API Key 鉴权 header 设置。
 */
export function supportsProviderApiKeyAuthConfig(config: Pick<ProviderConfig, 'type' | 'authType' | 'bedrock'>): boolean {
  if (config.authType === 'oauth') return false
  if (config.type === 'aws-bedrock') return false
  if (config.type === 'vertexai' || config.type === 'vertex-anthropic') return false
  if (config.type === 'ollama') return false
  return true
}

/**
 * 返回 provider 类型默认 API Key 鉴权规则。
 *
 * @param providerType - Provider 类型。
 * @returns 默认鉴权头与前缀。
 */
export function getDefaultProviderApiKeyAuth(providerType: ProviderType): ResolvedProviderApiKeyAuth {
  switch (providerType) {
    case 'gemini':
      return { custom: false, headerName: 'x-goog-api-key', valuePrefix: '' }
    case 'anthropic':
    case 'vertex-anthropic':
      return { custom: false, headerName: 'x-api-key', valuePrefix: '' }
    case 'azure-openai':
      return { custom: false, headerName: 'api-key', valuePrefix: '' }
    default:
      return { custom: false, headerName: 'Authorization', valuePrefix: 'Bearer' }
  }
}

/**
 * 解析当前 provider 实际使用的 API Key 鉴权配置。
 *
 * @param config - Provider 配置。
 * @returns 默认或用户自定义后的鉴权配置。
 */
export function resolveProviderApiKeyAuth(
  config: Pick<ProviderConfig, 'type' | 'authType' | 'apiKeyAuth'>,
): ResolvedProviderApiKeyAuth {
  const custom = supportsProviderApiKeyAuthConfig(config)
    ? sanitizeProviderApiKeyAuthConfig(config.apiKeyAuth)
    : undefined
  if (!custom) return getDefaultProviderApiKeyAuth(config.type)
  return {
    custom: true,
    headerName: custom.headerName,
    valuePrefix: custom.valuePrefix?.trim() ?? '',
  }
}

/**
 * 根据 API Key 与鉴权配置生成请求头。
 *
 * @param apiKey - 已挑选出的单个 API Key。
 * @param auth - 当前鉴权配置。
 * @returns 可直接合并到请求里的鉴权 headers。
 */
export function buildProviderApiKeyAuthHeaders(
  apiKey: string,
  auth: ResolvedProviderApiKeyAuth,
): Record<string, string> {
  const key = pickFirstApiKey(String(apiKey || ''))
  if (!key) return {}
  const prefix = String(auth.valuePrefix || '').trim()
  const value = prefix ? `${prefix} ${key}` : key
  return { [auth.headerName]: value }
}

/**
 * 清理 Provider 普通自定义 headers。
 *
 * @param headers - 用户配置的普通 headers。
 * @param authHeaderName - 当前鉴权 header 名称；会额外过滤掉该 header。
 * @returns 可安全透传到 SDK/请求层的普通 headers。
 */
export function sanitizeProviderExtraHeaders(
  headers?: Record<string, string>,
  authHeaderName?: string,
): Record<string, string> {
  if (!headers) return {}
  const out: Record<string, string> = {}
  const blockedAuthHeader = String(authHeaderName || '').trim().toLowerCase()
  const blockedHeaderNames = new Set([
    'authorization',
    'content-type',
    'x-api-key',
    'x-goog-api-key',
    'api-key',
    'xi-api-key',
    blockedAuthHeader,
  ].filter(Boolean))
  for (const [rawKey, rawValue] of Object.entries(headers)) {
    const key = String(rawKey || '').trim()
    if (!key || !isValidHttpHeaderName(key)) continue
    if (blockedHeaderNames.has(key.toLowerCase())) continue
    if (typeof rawValue !== 'string') continue
    const value = rawValue.trim()
    if (!value) continue
    out[key] = value
  }
  return out
}

/**
 * 判断 headers 中的某个 key 是否等于指定名称（大小写不敏感）。
 *
 * @param key - 待判断 key。
 * @param target - 目标 header 名称。
 * @returns `true` 表示等价。
 */
function isHeaderName(key: string, target: string): boolean {
  return key.trim().toLowerCase() === target.trim().toLowerCase()
}

/**
 * 删除 SDK 默认注入的通用鉴权头。
 *
 * @param headers - 待清理 headers。
 */
function stripSdkAuthHeaders(headers: Headers) {
  for (const key of Array.from(headers.keys())) {
    if (
      isHeaderName(key, 'Authorization')
      || isHeaderName(key, 'x-api-key')
      || isHeaderName(key, 'x-goog-api-key')
      || isHeaderName(key, 'api-key')
      || isHeaderName(key, 'xi-api-key')
    ) {
      headers.delete(key)
    }
  }
}

/**
 * 创建自定义鉴权 fetch。
 *
 * 说明：
 * - AI SDK 多数 provider 会先生成默认鉴权头再展开 `headers`；
 * - 对官方 OpenAI 这类必须传 `apiKey` 的 SDK，不能只靠 `headers` 传自定义鉴权；
 * - 因此自定义鉴权时在最终 fetch 边界移除 SDK 默认鉴权头，并注入本模块生成的鉴权头。
 *
 * @param authHeaders - 需要最终写入请求的鉴权 headers。
 * @returns 可传给 AI SDK provider 的 fetch。
 */
export function createProviderAuthFetch(authHeaders: Record<string, string>): FetchFunction | undefined {
  if (Object.keys(authHeaders).length === 0) return undefined
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestHeaders = typeof Request !== 'undefined' && input instanceof Request
      ? input.headers
      : undefined
    const headers = new Headers(init?.headers ?? requestHeaders)
    stripSdkAuthHeaders(headers)
    for (const [key, value] of Object.entries(authHeaders)) headers.set(key, value)
    return fetch(input, { ...init, headers })
  }
}

/**
 * 解析 Provider 请求公共参数。
 *
 * @param config - Provider 配置。
 * @returns 适配器和手写 fetch 共享的请求参数。
 *
 * @remarks
 * 本函数不推进多 key 轮询。真实 Provider 调用必须在进入 adapter 前先通过
 * `selectRotatedApiKeyForProvider()` 把 `config.apiKey` 收敛为单个 key；这里保留
 * `pickFirstApiKey()` 只是为了防止直接调用 adapter 的测试或工具把多 key 字符串误下发。
 */
export function resolveProviderRequestParams(config: ProviderConfig): ResolvedProviderRequestParams {
  const apiKeyAuth = resolveProviderApiKeyAuth(config)
  const apiKey = pickFirstApiKey(String(config.apiKey || ''))
  const authHeaders = buildProviderApiKeyAuthHeaders(apiKey, apiKeyAuth)
  const authFetch = apiKeyAuth.custom ? createProviderAuthFetch(authHeaders) : undefined
  return {
    apiHost: String(config.apiHost || '').trim(),
    apiKey,
    headers: sanitizeProviderExtraHeaders(config.headers, apiKeyAuth.headerName),
    apiKeyAuth,
    authHeaders,
    ...(authFetch ? { authFetch } : {}),
  }
}
