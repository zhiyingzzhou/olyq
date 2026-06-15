/**
 * 说明：`provider-schemas` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-schemas` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelModalitiesSchema`、`ModelFeaturesSchema`、`UserModelTypesSchema` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：Provider 配置的校验与归一化 Zod Schema。
 *
 * 说明：
 * - 用这些 schema 替换 provider-registry.ts 中手写的 sanitize* 逻辑；
 * - 每个 schema 接受 unknown 输入，并产出与旧实现一致的归一化输出（但实现方式更集中、更易维护）。
 */

import { z } from 'zod'
import type {
  AnthropicCacheControlSettings,
  AwsBedrockConfig,
  ModelFeature,
  ModelKind,
  ModelModality,
  OpenAIVerbosity,
  ProviderApiKeyAuthConfig,
  ProviderApiOptions,
  ProviderConfig,
  ProviderModelConfig,
  ServiceTier,
  TransportProtocol,
  UserModelType,
  VertexAiConfig,
  VertexServiceAccountConfig,
} from './types'
import { isPlainRecord } from '@/lib/utils/type-guards'
import {
  sanitizeProviderApiKeyAuthConfig,
  supportsProviderApiKeyAuthConfig,
} from './provider-auth'
import { normalizeSupportedParameters } from './model-request-parameters'
import { normalizeApiKeyString, pickFirstApiKey } from './api-keys'

// ---- 常量 ----

const PROVIDER_TYPES = [
  'openai',
  'openai-response',
  'dashscope',
  'siliconflow',
  'anthropic',
  'cohere',
  'deepseek',
  'gemini',
  'groq',
  'azure-openai',
  'vertexai',
  'vertex-anthropic',
  'mistral',
  'aws-bedrock',
  'new-api',
  'gateway',
  'xai',
  'ollama',
] as const

/** 判断输入值是否为受支持的 ProviderType。 */
function isProviderType(v: unknown): v is (typeof PROVIDER_TYPES)[number] {
  return typeof v === 'string' && (PROVIDER_TYPES as readonly string[]).includes(v)
}

const TRANSPORT_PROTOCOLS: TransportProtocol[] = [
  'openai-chat',
  'openai-responses',
  'anthropic-messages',
  'gemini-generate-content',
  'cohere-chat',
  'bedrock-converse',
  'embedding-api',
  'rerank-api',
  'image-api',
  'video-api',
  'transcription-api',
  'speech-api',
  'moderation-api',
  'unknown',
]

/** 判断输入值是否为受支持的传输协议。 */
function isTransportProtocol(v: unknown): v is TransportProtocol {
  return typeof v === 'string' && TRANSPORT_PROTOCOLS.includes(v as TransportProtocol)
}

const MODEL_KINDS: ModelKind[] = [
  'chat',
  'multimodal-chat',
  'audio-chat',
  'transcription',
  'speech-generation',
  'moderation',
  'image-generation',
  'video-generation',
  'embedding',
  'rerank',
  'unknown',
]

/** 判断输入值是否为受支持的模型主类型。 */
function isModelKind(v: unknown): v is ModelKind {
  return typeof v === 'string' && MODEL_KINDS.includes(v as ModelKind)
}

const MODEL_MODALITIES: ModelModality[] = ['text', 'image', 'audio', 'video', 'file', 'embeddings']

/** 判断输入值是否为受支持的模型模态。 */
function isModelModality(v: unknown): v is ModelModality {
  return typeof v === 'string' && MODEL_MODALITIES.includes(v as ModelModality)
}

const MODEL_FEATURES: ModelFeature[] = [
  'vision-input',
  'audio-input',
  'audio-model',
  'file-input',
  'tool-call',
  'structured-output',
  'reasoning',
  'native-web-search',
  'image-output',
  'audio-output',
  'transcription',
  'moderation',
]

/** 判断输入值是否为受支持的模型附加能力。 */
function isModelFeature(v: unknown): v is ModelFeature {
  return typeof v === 'string' && MODEL_FEATURES.includes(v as ModelFeature)
}

const USER_MODEL_TYPES: UserModelType[] = [
  'text_generation',
  'image_generation',
  'vision',
  'reasoning',
  'function_calling',
  'web_search',
  'embedding',
  'rerank',
]

/** 判断输入值是否为受支持的用户模型类型。 */
function isUserModelType(v: unknown): v is UserModelType {
  return typeof v === 'string' && USER_MODEL_TYPES.includes(v as UserModelType)
}

// ---- Schema 定义 ----

/** 模型模态数组解析。 */
export const ModelModalitiesSchema = z
  .unknown()
  .transform((raw): ModelModality[] | undefined => {
    if (!Array.isArray(raw)) return undefined
    const out = raw
      .filter((x): x is ModelModality => isModelModality(x))
      .map((x) => x.trim())
      .filter(Boolean) as ModelModality[]
    return out.length > 0 ? Array.from(new Set(out)) : undefined
  })

/** 模型特性数组解析。 */
export const ModelFeaturesSchema = z
  .unknown()
  .transform((raw): ModelFeature[] | undefined => {
    if (!Array.isArray(raw)) return undefined
    const out = raw
      .filter((x): x is ModelFeature => isModelFeature(x))
      .map((x) => x.trim())
      .filter(Boolean) as ModelFeature[]
    return out.length > 0 ? Array.from(new Set(out)) : undefined
  })

/**
 * 手动模型类型数组解析。
 *
 * 说明：
 * - 这里刻意保留 `[]`，因为它与 `undefined` 的语义不同：
 *   - `undefined` = 跟随系统识别
 *   - `[]` = 用户显式清空全部可编辑类型
 * - 因此不能像其它“空数组即忽略”的 schema 那样把空数组折叠成 `undefined`。
 */
export const UserModelTypesSchema = z
  .unknown()
  .transform((raw): UserModelType[] | undefined => {
    if (raw === undefined) return undefined
    if (!Array.isArray(raw)) return undefined
    const seen = new Set<UserModelType>()
    const out: UserModelType[] = []
    for (const item of raw) {
      if (!isUserModelType(item) || seen.has(item)) continue
      seen.add(item)
      out.push(item)
    }
    return out
  })

/** 替代 sanitizeModel */
export const ProviderModelConfigSchema = z
  .unknown()
  .transform((raw): ProviderModelConfig | null => {
    if (!isPlainRecord(raw)) return null
    const id = typeof raw.id === 'string' ? raw.id.trim() : ''
    if (!id) return null
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id
    const isDefault = typeof raw.isDefault === 'boolean' ? raw.isDefault : undefined
    const group = typeof raw.group === 'string' && raw.group.trim() ? raw.group.trim() : undefined
    const transportProtocol = isTransportProtocol(raw.transportProtocol)
      ? raw.transportProtocol
      : undefined
    const kindHint = isModelKind(raw.kindHint) ? raw.kindHint : undefined
    const inputModalities = ModelModalitiesSchema.parse(raw.inputModalities)
    const outputModalities = ModelModalitiesSchema.parse(raw.outputModalities)
    const features = ModelFeaturesSchema.parse(raw.features)
    const contextLength =
      typeof raw.contextLength === 'number' && Number.isFinite(raw.contextLength) && raw.contextLength > 0
        ? raw.contextLength
        : undefined
    const supportedParameters = normalizeSupportedParameters(raw.supportedParameters)
    const isDeprecated = typeof raw.isDeprecated === 'boolean' ? raw.isDeprecated : undefined
    const manualModelTypes = UserModelTypesSchema.parse(raw.manualModelTypes)
    const supportedTextDelta =
      typeof raw.supportedTextDelta === 'boolean' ? raw.supportedTextDelta : undefined

    const base: ProviderModelConfig = { id, name }
    if (isDefault !== undefined) base.isDefault = isDefault
    if (group) base.group = group
    if (transportProtocol) base.transportProtocol = transportProtocol
    if (kindHint) base.kindHint = kindHint
    if (inputModalities) base.inputModalities = inputModalities
    if (outputModalities) base.outputModalities = outputModalities
    if (features) base.features = features
    if (contextLength !== undefined) base.contextLength = contextLength
    if (supportedParameters !== undefined) base.supportedParameters = supportedParameters
    if (isDeprecated !== undefined) base.isDeprecated = isDeprecated
    if (manualModelTypes !== undefined) base.manualModelTypes = manualModelTypes
    if (supportedTextDelta !== undefined) base.supportedTextDelta = supportedTextDelta
    return base
  })

/** 替代 sanitizeProviderApiOptions */
export const ProviderApiOptionsSchema = z
  .unknown()
  .transform((raw): ProviderApiOptions | undefined => {
    if (!isPlainRecord(raw)) return undefined
    const out: ProviderApiOptions = {}
    const keys: Array<keyof ProviderApiOptions> = [
      'isNotSupportImageInput',
      'isNotSupportFileInput',
      'isNotSupportStreamOptions',
      'isSupportDeveloperRole',
      'isSupportServiceTier',
      'isNotSupportEnableThinking',
      'isNotSupportVerbosity',
      'isNotSupportAPIVersion',
    ]
    for (const k of keys) {
      if (typeof raw[k] === 'boolean') out[k] = raw[k] as boolean
    }
    return Object.keys(out).length > 0 ? out : undefined
  })

/** 替代 sanitizeServiceTier */
export const ServiceTierSchema = z
  .unknown()
  .transform((raw): ServiceTier | undefined => {
    if (raw === undefined) return undefined
    if (typeof raw !== 'string') return undefined
    const v = raw.trim()
    if (!v) return undefined
    // 说明：OpenAI 支持 auto/default/flex/priority；Groq 支持 auto/on_demand/flex
    if (v === 'auto' || v === 'default' || v === 'flex' || v === 'priority' || v === 'on_demand')
      return v as ServiceTier
    return undefined
  })

/** 替代 sanitizeVerbosity */
export const VerbositySchema = z
  .unknown()
  .transform((raw): OpenAIVerbosity | undefined => {
    if (raw === undefined) return undefined
    if (typeof raw !== 'string') return undefined
    const v = raw.trim()
    if (v === 'low' || v === 'medium' || v === 'high') return v as OpenAIVerbosity
    return undefined
  })

/** 替代 sanitizeAnthropicCacheControl */
export const AnthropicCacheControlSchema = z
  .unknown()
  .transform((raw): AnthropicCacheControlSettings | undefined => {
    if (!isPlainRecord(raw)) return undefined
    const tokenThreshold =
      typeof raw.tokenThreshold === 'number' && Number.isFinite(raw.tokenThreshold)
        ? Math.max(0, Math.floor(raw.tokenThreshold))
        : 0
    const cacheSystemMessage =
      typeof raw.cacheSystemMessage === 'boolean' ? raw.cacheSystemMessage : true
    const cacheLastNMessages =
      typeof raw.cacheLastNMessages === 'number' && Number.isFinite(raw.cacheLastNMessages)
        ? Math.max(0, Math.floor(raw.cacheLastNMessages))
        : 0
    // 仅当用户显式配置了“非默认值”时才写入（避免把默认值写回导致噪声/迁移困难）
    if (tokenThreshold === 0 && cacheLastNMessages === 0 && cacheSystemMessage === true)
      return undefined
    return { tokenThreshold, cacheSystemMessage, cacheLastNMessages }
  })

/** 替代 sanitizeBedrockConfig */
export const BedrockConfigSchema = z
  .unknown()
  .transform((raw): AwsBedrockConfig | undefined => {
    if (!isPlainRecord(raw)) return undefined
    const authType =
      raw.authType === 'iam' || raw.authType === 'apiKey'
        ? (raw.authType as AwsBedrockConfig['authType'])
        : null
    const region = typeof raw.region === 'string' ? raw.region.trim() : ''
    if (!authType || !region) return undefined

    const accessKeyId =
      typeof raw.accessKeyId === 'string' && raw.accessKeyId.trim()
        ? raw.accessKeyId.trim()
        : undefined
    const secretAccessKey =
      typeof raw.secretAccessKey === 'string' && raw.secretAccessKey.trim()
        ? raw.secretAccessKey.trim()
        : undefined
    const sessionToken =
      typeof raw.sessionToken === 'string' && raw.sessionToken.trim()
        ? raw.sessionToken.trim()
        : undefined
    const apiKey =
      typeof raw.apiKey === 'string' && raw.apiKey.trim() ? pickFirstApiKey(raw.apiKey) : undefined

    return {
      authType,
      region,
      ...(accessKeyId ? { accessKeyId } : {}),
      ...(secretAccessKey ? { secretAccessKey } : {}),
      ...(sessionToken ? { sessionToken } : {}),
      ...(apiKey ? { apiKey } : {}),
    }
  })

/** 替代 sanitizeVertexConfig */
export const VertexConfigSchema = z
  .unknown()
  .transform((raw): VertexAiConfig | undefined => {
    if (!isPlainRecord(raw)) return undefined
    const authType =
      raw.authType === 'serviceAccount' || raw.authType === 'apiKey'
        ? raw.authType
        : undefined
    if (!authType) return undefined

    const projectId = typeof raw.projectId === 'string' ? raw.projectId.trim() : ''
    const location = typeof raw.location === 'string' ? raw.location.trim() : ''
    const serviceAccountRaw = isPlainRecord(raw.serviceAccount) ? raw.serviceAccount : undefined
    const clientEmail =
      typeof serviceAccountRaw?.clientEmail === 'string' && serviceAccountRaw.clientEmail.trim()
        ? serviceAccountRaw.clientEmail.trim()
        : ''
    const privateKey =
      typeof serviceAccountRaw?.privateKey === 'string' && serviceAccountRaw.privateKey.trim()
        ? serviceAccountRaw.privateKey.trim()
        : ''
    const privateKeyId =
      typeof serviceAccountRaw?.privateKeyId === 'string' && serviceAccountRaw.privateKeyId.trim()
        ? serviceAccountRaw.privateKeyId.trim()
        : undefined
    const serviceAccount: VertexServiceAccountConfig | undefined =
      clientEmail || privateKey || privateKeyId
        ? {
            clientEmail,
            privateKey,
            ...(privateKeyId ? { privateKeyId } : {}),
          }
        : undefined

    if (authType === 'apiKey') {
      const apiKey =
        typeof raw.apiKey === 'string' && raw.apiKey.trim() ? pickFirstApiKey(raw.apiKey) : undefined
      return {
        authType,
        ...(apiKey ? { apiKey } : {}),
      }
    }

    return {
      authType,
      ...(projectId ? { projectId } : {}),
      ...(location ? { location } : {}),
      ...(serviceAccount ? { serviceAccount } : {}),
    }
  })

/** 替代 sanitizeProvider */
export const ProviderConfigSchema = z.unknown().transform((raw): ProviderConfig | null => {
  if (!isPlainRecord(raw)) return null

  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (!id) return null

  const typeRaw = raw.type
  if (!isProviderType(typeRaw)) return null

  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id
  const apiKey = typeof raw.apiKey === 'string' ? normalizeApiKeyString(raw.apiKey) : ''
  const apiHost = typeof raw.apiHost === 'string' ? raw.apiHost : ''
  const anthropicApiHost = typeof raw.anthropicApiHost === 'string' ? raw.anthropicApiHost : ''
  const apiVersion = typeof raw.apiVersion === 'string' ? raw.apiVersion : ''
  const logo = typeof raw.logo === 'string' && raw.logo.trim() ? raw.logo.trim() : ''
  const headersRaw = raw.headers
  const headers = isPlainRecord(headersRaw)
    ? Object.fromEntries(
        Object.entries(headersRaw)
          .map(([k, v]) => [String(k).trim(), v] as const)
          .filter(([k, v]) => Boolean(k) && typeof v === 'string'),
      )
    : undefined
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : true
  const authType =
    raw.authType === 'apiKey' || raw.authType === 'oauth' ? raw.authType : undefined
  const isAuthed = typeof raw.isAuthed === 'boolean' ? raw.isAuthed : undefined
  const rateLimit =
    typeof raw.rateLimit === 'number' && Number.isFinite(raw.rateLimit) ? raw.rateLimit : undefined
  const notes = typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes : undefined
  const apiOptions = ProviderApiOptionsSchema.parse(raw.apiOptions)
  const apiKeyAuth = supportsProviderApiKeyAuthConfig({ type: typeRaw, authType })
    ? sanitizeProviderApiKeyAuthConfig(raw.apiKeyAuth) as ProviderApiKeyAuthConfig | undefined
    : undefined
  const serviceTier = ServiceTierSchema.parse(raw.serviceTier)
  const verbosity = VerbositySchema.parse(raw.verbosity)
  const anthropicCacheControl = AnthropicCacheControlSchema.parse(raw.anthropicCacheControl)
  const bedrock = BedrockConfigSchema.parse(raw.bedrock)
  const vertex = VertexConfigSchema.parse(raw.vertex)
  const modelsRaw = Array.isArray(raw.models) ? raw.models : []
  const models = modelsRaw
    .map((m) => ProviderModelConfigSchema.parse(m))
    .filter((x): x is ProviderModelConfig => x !== null)

  const base: ProviderConfig = {
    id,
    name,
    type: typeRaw,
    apiKey,
    apiHost,
    enabled,
    models,
  }

  if (anthropicApiHost.trim()) base.anthropicApiHost = anthropicApiHost.trim()
  if (apiVersion.trim()) base.apiVersion = apiVersion.trim()
  if (headers && Object.keys(headers).length > 0) base.headers = headers as Record<string, string>
  if (apiKeyAuth) base.apiKeyAuth = apiKeyAuth
  if (logo) base.logo = logo
  if (authType) base.authType = authType
  if (isAuthed !== undefined) base.isAuthed = isAuthed
  if (rateLimit !== undefined) base.rateLimit = rateLimit
  if (notes) base.notes = notes
  if (apiOptions) base.apiOptions = apiOptions
  if (serviceTier !== undefined) base.serviceTier = serviceTier
  if (verbosity !== undefined) base.verbosity = verbosity
  if (anthropicCacheControl) base.anthropicCacheControl = anthropicCacheControl
  if (bedrock) base.bedrock = bedrock
  if (vertex) base.vertex = vertex

  return base
})

// ---- 对外导出：解析函数 ----

/**
 * 将单个未知输入解析为 ProviderConfig；若非法则返回 null。
 */
export function parseProviderConfig(raw: unknown): ProviderConfig | null {
  return ProviderConfigSchema.parse(raw)
}

/**
 * 将未知输入解析为 ProviderConfig[]（过滤非法项）。
 * - 若输入不是数组或最终无有效 provider，则返回空数组。
 */
export function parseProviderConfigs(raw: unknown): ProviderConfig[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => ProviderConfigSchema.parse(item))
    .filter((x): x is ProviderConfig => x !== null)
}
