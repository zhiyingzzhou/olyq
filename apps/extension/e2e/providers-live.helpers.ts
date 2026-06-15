/**
 * 说明：`providers-live.helpers` 源码模块。
 *
 * 职责：
 * - 承载 `providers-live.helpers` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ProviderLiveKind`、`ProviderLiveExtraModelSpec`、`ProviderLiveSpec` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { Page } from '@playwright/test'

import { PROVIDERS_STORAGE_KEY, MODEL_REGISTRY_STORAGE_KEY } from '../src/lib/ai/storage-keys'
import { buildProviderModelMapKey, buildScopedCanonicalId } from '../src/lib/ai/model-registry/identity'
import { getProviderNetworkHostMatchPatterns } from '../src/lib/ai/provider-network-targets'
import { parseProviderConfig } from '../src/lib/ai/provider-schemas'
import { resolveEffectiveProviderType } from '../src/lib/ai/stream-chat-utils'
import type { ModelScope, ResolveConfidence } from '../src/lib/ai/model-registry/types'
import type { I18nText } from '../src/types/i18n'
import type {
  AwsBedrockConfig,
  ModelKind,
  ProviderConfig,
  TransportProtocol,
  VertexAiConfig,
} from '../src/lib/ai/types'
import {
  DEFAULT_PROVIDER_LIVE_SMOKE_PROVIDER_IDS,
  PROVIDER_LIVE_SUPPORTED_PROVIDER_IDS,
} from '../src/lib/ai/provider-certification'

/** Live E2E 中约定的模型用途类型。 */
export type ProviderLiveKind = 'chat' | 'embedding' | 'image' | 'rerank'

/** 额外模型声明。主要用于 `new-api` 这类单 provider 多协议场景。 */
export interface ProviderLiveExtraModelSpec {
  /** 原始模型 ID。 */
  readonly id: string
  /** 该模型期望命中的协议。 */
  readonly transportProtocol?: TransportProtocol
  /** 该模型期望命中的用途类型。 */
  readonly expectedKind?: ProviderLiveKind
}

/** 真实 provider Live E2E 的单 provider 配置。 */
export interface ProviderLiveSpec {
  /** Provider 唯一 ID。 */
  readonly providerId: string
  /** Provider 类型。 */
  readonly providerType: ProviderConfig['type']
  /** Provider 展示名。 */
  readonly providerName: string
  /** API Key。 */
  readonly apiKey?: string
  /** API Host。 */
  readonly apiHost?: string
  /** API 版本。 */
  readonly apiVersion?: string
  /** Anthropic 专用备用 Host。 */
  readonly anthropicApiHost?: string
  /** 自定义请求头。 */
  readonly headers?: Record<string, string>
  /** 主模型集合。 */
  readonly models: Partial<Record<ProviderLiveKind, string>>
  /** 额外模型集合。 */
  readonly extraModels?: ReadonlyArray<ProviderLiveExtraModelSpec>
  /** Bedrock 特殊配置。 */
  readonly bedrock?: AwsBedrockConfig
  /** Vertex 特殊配置。 */
  readonly vertex?: VertexAiConfig
}

/** 期望参与 live 校验的单个模型。 */
export interface ProviderLiveExpectedModel {
  /** 场景标签。 */
  readonly label: string
  /** 原始模型 ID。 */
  readonly rawModelId: string
  /** 期望主类型。 */
  readonly expectedKind: ProviderLiveKind
  /** 期望协议。 */
  readonly expectedTransportProtocol?: TransportProtocol
}

/** 从 registry 中采集到的单模型解析结果。 */
export interface ProviderLiveResolvedModel {
  /** 场景标签。 */
  readonly label: string
  /** 原始模型 ID。 */
  readonly rawModelId: string
  /** 期望主类型。 */
  readonly expectedKind: ProviderLiveKind
  /** 期望协议。 */
  readonly expectedTransportProtocol?: TransportProtocol
  /** provider map 键。 */
  readonly providerMapKey: string
  /** 命中的 canonicalId。 */
  readonly canonicalId?: string
  /** 模型作用域。 */
  readonly scope?: ModelScope
  /** 实际模型主类型。 */
  readonly kind?: ModelKind
  /** 实际协议。 */
  readonly transportProtocol?: TransportProtocol
  /** 有效 provider 类型。 */
  readonly effectiveProviderType?: string
  /** 展示名。 */
  readonly displayName?: string
  /** 可信度。 */
  readonly confidence?: ResolveConfidence
  /** 命中来源。 */
  readonly source: 'provider-map' | 'scoped' | 'missing'
}

/** 当前 provider 的 live 预检快照。 */
export interface ProviderLiveSnapshot {
  /** Provider ID。 */
  readonly providerId: string
  /** Provider 类型。 */
  readonly providerType: ProviderConfig['type']
  /** 当前 provider 真实配置。 */
  readonly provider: ProviderConfig
  /** 期望校验的模型集合。 */
  readonly expectedModels: ReadonlyArray<ProviderLiveExpectedModel>
  /** 从 registry 中采集到的解析结果。 */
  readonly resolvedModels: ReadonlyArray<ProviderLiveResolvedModel>
  /** 本 provider 需要访问的网络目标 match pattern。 */
  readonly requiredHostPatterns: ReadonlyArray<string>
  /** registry 生成时间。 */
  readonly registryGeneratedAt: string
}

/**
 * 测试辅助函数：`normalizeEnvName`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function normalizeEnvName(providerId: string): string {
  return providerId.toUpperCase().replace(/-/g, '_')
}

/**
 * 测试辅助函数：`splitCsv`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function splitCsv(raw: string | undefined): string[] {
  return String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * 测试辅助函数：`readJsonEnv`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function readJsonEnv(name: string): Record<string, string> | undefined {
  const raw = process.env[name]
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error(`${name} 必须是 JSON object`)
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, String(value)]),
    )
  } catch (error) {
    throw new Error(
      `[providers-live] ${name} 不是合法的 JSON object: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}

/**
 * 导出函数：`getRequestedProviderIds`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function getRequestedProviderIds(): string[] {
  const requested = splitCsv(process.env.OLYQ_E2E_PROVIDER_IDS)
  if (requested.length === 0) return [...DEFAULT_PROVIDER_LIVE_SMOKE_PROVIDER_IDS]
  if (requested.includes('all')) return [...PROVIDER_LIVE_SUPPORTED_PROVIDER_IDS]
  return requested
}

/**
 * 导出函数：`shouldRequireProviderLive`。
 *
 * @remarks
 * 发布认证场景可以把缺失凭证、缺失模型或错误 endpoint 从 skip 升级为失败；
 * 日常本地回归仍允许没有团队密钥时跳过 live smoke。
 */
export function shouldRequireProviderLive(): boolean {
  return /^(1|true|yes)$/i.test(String(process.env.OLYQ_E2E_REQUIRE_LIVE || '').trim())
}

/**
 * 测试辅助函数：`readBedrockConfig`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function readBedrockConfig(): AwsBedrockConfig | undefined {
  const authTypeRaw = String(process.env.OLYQ_E2E_AWS_BEDROCK_AUTH_TYPE || '').trim()
  const region = String(process.env.OLYQ_E2E_AWS_BEDROCK_REGION || '').trim()
  const authType = authTypeRaw === 'apiKey' || authTypeRaw === 'iam' ? authTypeRaw : ''
  if (!authType || !region) return undefined

  const apiKey = String(process.env.OLYQ_E2E_AWS_BEDROCK_API_KEY || '').trim()
  const accessKeyId = String(process.env.OLYQ_E2E_AWS_BEDROCK_ACCESS_KEY_ID || '').trim()
  const secretAccessKey = String(process.env.OLYQ_E2E_AWS_BEDROCK_SECRET_ACCESS_KEY || '').trim()
  const sessionToken = String(process.env.OLYQ_E2E_AWS_BEDROCK_SESSION_TOKEN || '').trim()

  return {
    authType,
    region,
    ...(apiKey ? { apiKey } : {}),
    ...(accessKeyId ? { accessKeyId } : {}),
    ...(secretAccessKey ? { secretAccessKey } : {}),
    ...(sessionToken ? { sessionToken } : {}),
  }
}

/**
 * 测试辅助函数：`readVertexConfig`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function readVertexConfig(prefix: string, options: { readonly forceServiceAccount?: boolean } = {}): VertexAiConfig | undefined {
  const authTypeRaw = String(process.env[`${prefix}_AUTH_TYPE`] || '').trim()
  const apiKey = String(process.env[`${prefix}_API_KEY`] || '').trim()
  const projectId = String(process.env[`${prefix}_PROJECT_ID`] || '').trim()
  const location = String(process.env[`${prefix}_LOCATION`] || '').trim()
  const clientEmail = String(process.env[`${prefix}_CLIENT_EMAIL`] || '').trim()
  const privateKey = String(process.env[`${prefix}_PRIVATE_KEY`] || '').trim()
  const privateKeyId = String(process.env[`${prefix}_PRIVATE_KEY_ID`] || '').trim()

  if (!options.forceServiceAccount && authTypeRaw === 'apiKey') {
    return apiKey ? { authType: 'apiKey', apiKey } : undefined
  }

  if (!projectId || !location || !clientEmail || !privateKey) return undefined
  return {
    authType: 'serviceAccount',
    projectId,
    location,
    serviceAccount: {
      clientEmail,
      privateKey,
      ...(privateKeyId ? { privateKeyId } : {}),
    },
  }
}

/**
 * 测试辅助函数：`readCommonSpec`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function readCommonSpec(
  providerId: string,
  providerType: ProviderConfig['type'],
  providerName: string,
): ProviderLiveSpec {
  const envBase = `OLYQ_E2E_${normalizeEnvName(providerId)}`
  return {
    providerId,
    providerType,
    providerName,
    apiKey: process.env[`${envBase}_API_KEY`] || undefined,
    apiHost: process.env[`${envBase}_API_HOST`] || undefined,
    apiVersion: process.env[`${envBase}_API_VERSION`] || undefined,
    headers: readJsonEnv(`${envBase}_HEADERS_JSON`),
    models: {
      chat: process.env[`${envBase}_MODEL_CHAT`] || undefined,
      embedding: process.env[`${envBase}_MODEL_EMBEDDING`] || undefined,
      image: process.env[`${envBase}_MODEL_IMAGE`] || undefined,
      rerank: process.env[`${envBase}_MODEL_RERANK`] || undefined,
    },
  }
}

/**
 * 导出函数：`buildProviderLiveSpec`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function buildProviderLiveSpec(providerId: string): ProviderLiveSpec | null {
  if (providerId === 'openai') return readCommonSpec('openai', 'openai-response', 'OpenAI')
  if (providerId === 'anthropic') return readCommonSpec('anthropic', 'anthropic', 'Anthropic')
  if (providerId === 'google') return readCommonSpec('google', 'gemini', 'Gemini')
  if (providerId === 'deepseek') return readCommonSpec('deepseek', 'deepseek', 'DeepSeek')
  if (providerId === 'mistral') return readCommonSpec('mistral', 'mistral', 'Mistral')
  if (providerId === 'groq') return readCommonSpec('groq', 'groq', 'Groq')
  if (providerId === 'xai') return readCommonSpec('xai', 'xai', 'xAI')
  if (providerId === 'cohere') return readCommonSpec('cohere', 'cohere', 'Cohere')
  if (providerId === 'moonshot') return readCommonSpec('moonshot', 'openai', 'Moonshot')
  if (providerId === 'qwen') return readCommonSpec('qwen', 'dashscope', 'Qwen')
  if (providerId === 'siliconflow') return readCommonSpec('siliconflow', 'siliconflow', 'SiliconFlow')
  if (providerId === 'zhipu') return readCommonSpec('zhipu', 'openai', 'Zhipu')
  if (providerId === 'together') return readCommonSpec('together', 'openai', 'Together')
  if (providerId === 'perplexity') return readCommonSpec('perplexity', 'openai', 'Perplexity')
  if (providerId === 'fireworks') return readCommonSpec('fireworks', 'openai', 'Fireworks')
  if (providerId === 'minimax') return readCommonSpec('minimax', 'openai', 'MiniMax')
  if (providerId === 'baichuan') return readCommonSpec('baichuan', 'openai', 'Baichuan')
  if (providerId === 'openrouter') return readCommonSpec('openrouter', 'openai', 'OpenRouter')
  if (providerId === 'vercel-ai-gateway') return readCommonSpec('vercel-ai-gateway', 'gateway', 'Vercel AI Gateway')
  if (providerId === 'azure-openai') return readCommonSpec('azure-openai', 'azure-openai', 'Azure OpenAI')
  if (providerId === 'aws-bedrock') {
    const spec = readCommonSpec('aws-bedrock', 'aws-bedrock', 'AWS Bedrock')
    return {
      ...spec,
      bedrock: readBedrockConfig(),
    }
  }
  if (providerId === 'vertexai') {
    const spec = readCommonSpec('vertexai', 'vertexai', 'Vertex AI')
    return {
      ...spec,
      vertex: readVertexConfig('OLYQ_E2E_VERTEX'),
    }
  }
  if (providerId === 'vertex-anthropic') {
    const spec = readCommonSpec('vertex-anthropic', 'vertex-anthropic', 'Vertex Anthropic')
    return {
      ...spec,
      vertex: readVertexConfig('OLYQ_E2E_VERTEX', { forceServiceAccount: true }),
    }
  }
  if (providerId === 'openai-compatible-custom') return readCommonSpec('openai-compatible-custom', 'openai', 'OpenAI Compatible Custom')
  if (providerId === 'ollama') return readCommonSpec('ollama', 'ollama', 'Ollama')
  if (providerId === 'lmstudio') return readCommonSpec('lmstudio', 'openai', 'LM Studio')
  if (providerId === 'new-api') {
    const spec = readCommonSpec('new-api', 'new-api', 'New API')
    const anthropicApiHost = String(process.env.OLYQ_E2E_NEW_API_ANTHROPIC_API_HOST || '').trim()
    const extraModels: ProviderLiveExtraModelSpec[] = [
      ...(process.env.OLYQ_E2E_NEW_API_MODEL_ANTHROPIC
        ? [{
            id: process.env.OLYQ_E2E_NEW_API_MODEL_ANTHROPIC,
            transportProtocol: 'anthropic-messages' as const,
            expectedKind: 'chat' as const,
          }]
        : []),
      ...(process.env.OLYQ_E2E_NEW_API_MODEL_GEMINI
        ? [{
            id: process.env.OLYQ_E2E_NEW_API_MODEL_GEMINI,
            transportProtocol: 'gemini-generate-content' as const,
            expectedKind: 'chat' as const,
          }]
        : []),
      ...(process.env.OLYQ_E2E_NEW_API_MODEL_RESPONSES
        ? [{
            id: process.env.OLYQ_E2E_NEW_API_MODEL_RESPONSES,
            transportProtocol: 'openai-responses' as const,
            expectedKind: 'chat' as const,
          }]
        : []),
    ]
    return {
      ...spec,
      ...(extraModels.length > 0 ? { extraModels } : {}),
      ...(anthropicApiHost ? { anthropicApiHost } : {}),
    }
  }
  return null
}

/**
 * 导出函数：`getProviderLiveSkipReason`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function getProviderLiveSkipReason(spec: ProviderLiveSpec): string | null {
  if (!spec.models.chat && !spec.models.embedding && !spec.models.image && !spec.models.rerank && (!spec.extraModels || spec.extraModels.length === 0)) {
    return '未配置任何 OLYQ_E2E_*_MODEL_* 环境变量'
  }

  if (spec.providerId === 'ollama' || spec.providerId === 'lmstudio') {
    return spec.apiHost ? null : '本地 provider 缺少 API_HOST'
  }

  if (spec.providerId === 'aws-bedrock') {
    if (!spec.bedrock?.region) return 'AWS Bedrock 缺少 REGION'
    if (spec.bedrock.authType === 'apiKey') {
      return spec.bedrock.apiKey ? null : 'AWS Bedrock 缺少 API_KEY'
    }
    return spec.bedrock.accessKeyId && spec.bedrock.secretAccessKey ? null : 'AWS Bedrock 缺少 IAM 凭证'
  }

  if (spec.providerId === 'vertexai' || spec.providerId === 'vertex-anthropic') {
    if (spec.vertex?.authType === 'apiKey') return spec.vertex.apiKey ? null : 'Vertex 缺少 API_KEY'
    return spec.vertex?.authType === 'serviceAccount'
      && spec.vertex.projectId
      && spec.vertex.location
      && spec.vertex.serviceAccount?.clientEmail
      && spec.vertex.serviceAccount.privateKey
      ? null
      : 'Vertex 缺少 PROJECT_ID / LOCATION / CLIENT_EMAIL / PRIVATE_KEY'
  }

  if (requiresExplicitLiveApiHost(spec) && !spec.apiHost) return '缺少 API_HOST'
  if (spec.providerId === 'azure-openai' && !String(spec.apiVersion || '').trim()) return 'Azure OpenAI 缺少 API_VERSION'
  if (spec.providerId === 'new-api') {
    const hasOpenAiCompatibleModel = Boolean(spec.models.chat)
    const hasAnthropicMessagesModel = (spec.extraModels ?? []).some((item) => item.transportProtocol === 'anthropic-messages')
    if (!hasOpenAiCompatibleModel || !hasAnthropicMessagesModel) {
      return 'NewAPI live smoke 需要同时配置 OpenAI-compatible chat 模型和 Anthropic Messages 模型'
    }
  }
  if (!spec.apiKey) {
    return '缺少 API_KEY'
  }
  return null
}

/**
 * 判断 live smoke 是否必须显式配置 API_HOST。
 *
 * @remarks
 * 官方 SDK 已内置默认 endpoint 的 provider 可以省略 API_HOST；OpenAI-compatible
 * 三方平台、自建网关、本地服务和 Azure deployment endpoint 必须显式给出目标地址，
 * 避免 live smoke 在缺配置时误打到 OpenAI 官方默认地址。
 */
function requiresExplicitLiveApiHost(spec: ProviderLiveSpec): boolean {
  return [
    'azure-openai',
    'new-api',
    'openai-compatible-custom',
    'ollama',
    'lmstudio',
    'moonshot',
    'zhipu',
    'together',
    'perplexity',
    'fireworks',
    'minimax',
    'baichuan',
    'openrouter',
  ].includes(spec.providerId)
}

/**
 * 测试辅助函数：`buildProviderLiveModels`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function buildProviderLiveModels(spec: ProviderLiveSpec): ProviderConfig['models'] {
  return [
    ...(spec.models.chat ? [{ id: spec.models.chat, name: spec.models.chat, group: 'Chat' }] : []),
    ...(spec.models.embedding ? [{ id: spec.models.embedding, name: spec.models.embedding, group: 'Embedding', transportProtocol: 'embedding-api' as const }] : []),
    ...(spec.models.image ? [{ id: spec.models.image, name: spec.models.image, group: 'Image', transportProtocol: 'image-api' as const }] : []),
    ...(spec.models.rerank ? [{ id: spec.models.rerank, name: spec.models.rerank, group: 'Rerank', transportProtocol: 'rerank-api' as const }] : []),
    ...((spec.extraModels ?? []).map((item) => ({
      id: item.id,
      name: item.id,
      group: 'Extra',
      ...(item.transportProtocol ? { transportProtocol: item.transportProtocol } : {}),
    }))),
  ]
}

/**
 * 导出函数：`listExpectedModels`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function listExpectedModels(spec: ProviderLiveSpec): ReadonlyArray<ProviderLiveExpectedModel> {
  return [
    ...(spec.models.chat ? [{ label: 'chat', rawModelId: spec.models.chat, expectedKind: 'chat' as const }] : []),
    ...(spec.models.embedding ? [{ label: 'embedding', rawModelId: spec.models.embedding, expectedKind: 'embedding' as const, expectedTransportProtocol: 'embedding-api' as const }] : []),
    ...(spec.models.image ? [{ label: 'image', rawModelId: spec.models.image, expectedKind: 'image' as const, expectedTransportProtocol: 'image-api' as const }] : []),
    ...(spec.models.rerank ? [{ label: 'rerank', rawModelId: spec.models.rerank, expectedKind: 'rerank' as const, expectedTransportProtocol: 'rerank-api' as const }] : []),
    ...((spec.extraModels ?? []).map((item, index) => ({
      label: `extra-${index + 1}`,
      rawModelId: item.id,
      expectedKind: item.expectedKind ?? 'chat',
      ...(item.transportProtocol ? { expectedTransportProtocol: item.transportProtocol } : {}),
    }))),
  ]
}

/**
 * 测试辅助函数：`buildProviderConfigFromSpec`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function buildProviderConfigFromSpec(spec: ProviderLiveSpec): ProviderConfig {
  const provider = parseProviderConfig({
    id: spec.providerId,
    name: spec.providerName,
    type: spec.providerType,
    apiKey: spec.apiKey ?? '',
    apiHost: spec.apiHost ?? '',
    ...(spec.apiVersion ? { apiVersion: spec.apiVersion } : {}),
    enabled: true,
    models: buildProviderLiveModels(spec),
    ...(spec.headers ? { headers: spec.headers } : {}),
    ...(spec.anthropicApiHost ? { anthropicApiHost: spec.anthropicApiHost } : {}),
    ...(spec.bedrock ? { bedrock: spec.bedrock } : {}),
    ...(spec.vertex ? { vertex: spec.vertex } : {}),
  })
  if (!provider) {
    throw new Error(`无法从 live spec 构建 provider config: ${spec.providerId}`)
  }
  return provider
}

/**
 * 测试辅助函数：`resolveExpectedKindMatch`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function resolveExpectedKindMatch(expectedKind: ProviderLiveKind, actualKind: ModelKind | undefined): boolean {
  if (!actualKind) return false
  if (expectedKind === 'chat') return actualKind === 'chat' || actualKind === 'multimodal-chat' || actualKind === 'audio-chat'
  if (expectedKind === 'embedding') return actualKind === 'embedding'
  if (expectedKind === 'image') return actualKind === 'image-generation'
  if (expectedKind === 'rerank') return actualKind === 'rerank'
  return false
}

/**
 * 测试辅助函数：`readRegistrySnapshot`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
async function readRegistrySnapshot(page: Page, timeoutMs = 10000): Promise<Record<string, unknown> | null> {
  return await page.evaluate(
    async ({ storageKey, timeoutMs }) => {
      const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome
      const storage = chromeApi?.storage?.local
      if (!storage?.get) return null

            /**
       * 测试辅助函数：`readOnce`。
       *
       * @remarks
       * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
       */
      const readOnce = async () =>
        await new Promise<Record<string, unknown> | null>((resolve) => {
          storage.get([storageKey], (value) => {
            const registry = value?.[storageKey]
            resolve(registry && typeof registry === 'object' ? registry as Record<string, unknown> : null)
          })
        })

      const startedAt = Date.now()
      let lastSeen: Record<string, unknown> | null = null

      while (Date.now() - startedAt <= timeoutMs) {
        lastSeen = await readOnce()
        if (lastSeen && typeof lastSeen.generatedAt === 'string' && lastSeen.generatedAt !== new Date(0).toISOString()) {
          return lastSeen
        }
        await new Promise((resolve) => window.setTimeout(resolve, 250))
      }

      return lastSeen
    },
    {
      storageKey: MODEL_REGISTRY_STORAGE_KEY,
      timeoutMs,
    },
  )
}

/**
 * 测试辅助函数：`collectRequiredHostPatterns`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function collectRequiredHostPatterns(provider: ProviderConfig, expectedModels: ReadonlyArray<ProviderLiveExpectedModel>): string[] {
  const patterns = new Set<string>()
  for (const model of expectedModels) {
    for (const pattern of getProviderNetworkHostMatchPatterns(provider, model.rawModelId)) {
      patterns.add(pattern)
    }
  }
  return Array.from(patterns)
}

/**
 * 导出函数：`collectProviderLiveSnapshot`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function collectProviderLiveSnapshot(page: Page, spec: ProviderLiveSpec): Promise<ProviderLiveSnapshot> {
  const provider = buildProviderConfigFromSpec(spec)
  const expectedModels = listExpectedModels(spec)
  const registry = await readRegistrySnapshot(page)
  const providerModelMap = (registry?.providerModelMap ?? {}) as Record<string, Record<string, unknown>>
  const canonicalModels = (registry?.canonicalModels ?? {}) as Record<string, Record<string, unknown>>
  const scopedModels = (registry?.providerScopedModels ?? {}) as Record<string, Record<string, unknown>>

  const resolvedModels: ProviderLiveResolvedModel[] = expectedModels.map((item) => {
    const providerMapKey = buildProviderModelMapKey(spec.providerType, spec.providerId, item.rawModelId)
    const providerMapHit = providerModelMap[providerMapKey]
    const providerScope: ModelScope = spec.providerType === 'ollama' ? 'local' : 'provider'
    const fallbackScopedId = buildScopedCanonicalId(
      providerScope === 'local' ? 'local' : 'provider',
      spec.providerType,
      spec.providerId,
      item.rawModelId,
    )
    const scopedHit = scopedModels[fallbackScopedId]
    const canonicalId = String(providerMapHit?.canonicalId || scopedHit?.canonicalId || '').trim()
    const canonical = canonicalId ? canonicalModels[canonicalId] : undefined
    const scoped = canonicalId ? scopedModels[canonicalId] : scopedHit
    const source = providerMapHit ? 'provider-map' : scoped ? 'scoped' : 'missing'
    const resolvedTransportProtocol = String(providerMapHit?.transportProtocol || scoped?.transportProtocol || '').trim() as TransportProtocol | ''
    const resolvedKind = String(canonical?.kind || scoped?.kind || '').trim() as ModelKind | ''

    return {
      label: item.label,
      rawModelId: item.rawModelId,
      expectedKind: item.expectedKind,
      ...(item.expectedTransportProtocol ? { expectedTransportProtocol: item.expectedTransportProtocol } : {}),
      providerMapKey,
      ...(canonicalId ? { canonicalId } : {}),
      ...(String(canonical?.scope || scoped?.scope || '').trim() ? { scope: String(canonical?.scope || scoped?.scope).trim() as ModelScope } : {}),
      ...(resolvedKind ? { kind: resolvedKind } : {}),
      ...(resolvedTransportProtocol ? { transportProtocol: resolvedTransportProtocol } : {}),
      ...(resolvedTransportProtocol
        ? {
            effectiveProviderType: resolveEffectiveProviderType({
              providerType: spec.providerType,
              transportProtocol: resolvedTransportProtocol,
            }),
          }
        : {}),
      ...(String(canonical?.displayName || scoped?.displayName || '').trim() ? { displayName: String(canonical?.displayName || scoped?.displayName).trim() } : {}),
      ...(String(canonical?.confidence || scoped?.confidence || '').trim() ? { confidence: String(canonical?.confidence || scoped?.confidence).trim() as ResolveConfidence } : {}),
      source,
    }
  })

  for (const model of resolvedModels) {
    if (model.kind && !resolveExpectedKindMatch(model.expectedKind, model.kind)) {
      throw new Error(
        `[providers-live] ${spec.providerId}/${model.rawModelId} 期望 ${model.expectedKind}，实际为 ${model.kind}`,
      )
    }
    if (model.expectedTransportProtocol && model.transportProtocol && model.expectedTransportProtocol !== model.transportProtocol) {
      throw new Error(
        `[providers-live] ${spec.providerId}/${model.rawModelId} 期望协议 ${model.expectedTransportProtocol}，实际为 ${model.transportProtocol}`,
      )
    }
  }

  return {
    providerId: spec.providerId,
    providerType: spec.providerType,
    provider,
    expectedModels,
    resolvedModels,
    requiredHostPatterns: collectRequiredHostPatterns(provider, expectedModels),
    registryGeneratedAt: typeof registry?.generatedAt === 'string' ? registry.generatedAt : new Date(0).toISOString(),
  }
}

/**
 * 导出函数：`seedLiveProvider`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function seedLiveProvider(page: Page, spec: ProviderLiveSpec): Promise<void> {
  const provider = buildProviderConfigFromSpec(spec)

  await page.evaluate(
    async ({ storageKey, provider }) => {
      const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome
      const storage = chromeApi?.storage?.local
      if (!storage?.set) throw new Error('chrome.storage.local 不可用')
      await new Promise<void>((resolve) => storage.set({ [storageKey]: [provider] }, () => resolve()))
    },
    {
      storageKey: PROVIDERS_STORAGE_KEY,
      provider,
    },
  )
}

/**
 * 导出函数：`readSeededProvider`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function readSeededProvider(page: Page, providerId: string): Promise<ProviderConfig | null> {
  const provider = await page.evaluate(
    async ({ storageKey, providerId: targetProviderId }) => {
      const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome
      const storage = chromeApi?.storage?.local
      if (!storage?.get) return null
      return await new Promise<Record<string, unknown> | null>((resolve) => {
        storage.get([storageKey], (value) => {
          const providers = Array.isArray(value?.[storageKey]) ? value[storageKey] as Array<Record<string, unknown>> : []
          resolve(providers.find((provider) => provider.id === targetProviderId) ?? null)
        })
      })
    },
    {
      storageKey: PROVIDERS_STORAGE_KEY,
      providerId,
    },
  )
  return provider ? parseProviderConfig(provider) : null
}

/** Live E2E 的 provider 网络访问覆盖结果。 */
export interface ProviderLiveNetworkAccessResult {
  /** 本次检查的网络目标 match pattern 列表。 */
  readonly patterns: ReadonlyArray<string>
  /** 执行状态。 */
  readonly status: 'covered' | 'not-required' | 'missing' | 'unavailable'
  /** 是否由安装期 manifest 网站访问声明覆盖。 */
  readonly coveredByInstallTimeWebAccess: boolean
  /** 当前 manifest 中声明的网站访问模式。 */
  readonly declaredHostPatterns: ReadonlyArray<string>
  /** 失败原因。 */
  readonly error?: string
}

/** health-check 单模型结果。 */
export interface ProviderLiveHealthModelResult {
  /** 原始模型 ID。 */
  readonly modelId: string
  /** 健康检查状态。 */
  readonly status: 'ok' | 'partial' | 'error'
  /** 延迟毫秒。 */
  readonly latency?: number
  /** 错误信息。 */
  readonly error?: I18nText
  /** 多 key 聚合统计。 */
  readonly keySummary?: {
    /** 检测的 key 总数。 */
    readonly total: number
    /** 成功 key 数。 */
    readonly success: number
    /** 失败 key 数。 */
    readonly failed: number
  }
}

/** health-check 整体执行结果。 */
export interface ProviderLiveHealthRunResult {
  /** 请求 ID。 */
  readonly requestId: string
  /** 执行状态。 */
  readonly status: 'ok' | 'error' | 'timeout'
  /** 总耗时毫秒。 */
  readonly durationMs: number
  /** 单模型结果集合。 */
  readonly modelResults: ReadonlyArray<ProviderLiveHealthModelResult>
  /** 终态错误。 */
  readonly terminalError?: I18nText | string
}

/** chat live 调试事件。 */
export interface ProviderLiveChatDebugEvent {
  /** 调试事件种类。 */
  readonly kind: string
  /** 调试负载。 */
  readonly payload?: unknown
}

/** chat live 执行结果。 */
export interface ProviderLiveChatRunResult {
  /** 原始模型 ID。 */
  readonly modelId: string
  /** 请求 ID。 */
  readonly requestId: string
  /** 执行状态。 */
  readonly status: 'ok' | 'error' | 'timeout'
  /** 总耗时毫秒。 */
  readonly durationMs: number
  /** 文本增量次数。 */
  readonly deltaCount: number
  /** reasoning 增量次数。 */
  readonly reasoningCount: number
  /** 工具调用次数。 */
  readonly toolCallCount: number
  /** 文件事件次数。 */
  readonly fileCount: number
  /** 最终聚合文本。 */
  readonly assistantText: string
  /** 用量信息。 */
  readonly usage?: {
    /** 输入 tokens。 */
    readonly inputTokens?: number
    /** 输出 tokens。 */
    readonly outputTokens?: number
  }
  /** 错误信息。 */
  readonly error?: I18nText | string
  /** 结构化错误详情。 */
  readonly details?: Record<string, string>
  /** 调试事件。 */
  readonly debugEvents: ReadonlyArray<ProviderLiveChatDebugEvent>
}

/** embedding live 执行结果。 */
export interface ProviderLiveEmbeddingRunResult {
  /** 原始模型 ID。 */
  readonly modelId: string
  /** 请求 ID。 */
  readonly requestId: string
  /** 执行状态。 */
  readonly status: 'ok' | 'error' | 'timeout'
  /** 总耗时毫秒。 */
  readonly durationMs: number
  /** 向量维度。 */
  readonly vectorLength: number
  /** 预览采样。 */
  readonly vectorPreview: ReadonlyArray<number>
  /** 错误信息。 */
  readonly error?: I18nText | string
}

/** image live 执行结果。 */
export interface ProviderLiveImageRunResult {
  /** 原始模型 ID。 */
  readonly modelId: string
  /** 请求 ID。 */
  readonly requestId: string
  /** 执行状态。 */
  readonly status: 'ok' | 'error' | 'timeout'
  /** 总耗时毫秒。 */
  readonly durationMs: number
  /** 图片数量。 */
  readonly imageCount: number
  /** 图片类型列表。 */
  readonly imageKinds: ReadonlyArray<string>
  /** 第一张 URL 预览。 */
  readonly firstUrl?: string
  /** 改写后的提示词。 */
  readonly revisedPrompt?: string
  /** 错误信息。 */
  readonly error?: I18nText | string
}

/**
 * 判断安装期网站访问声明是否覆盖指定网络目标。
 *
 * @param declaredHostPatterns - manifest 中的 host pattern。
 * @param requiredPatterns - provider 运行需要访问的网络目标。
 * @returns 所有目标都被覆盖时返回 `true`。
 */
function areNetworkTargetsCoveredByManifest(
  declaredHostPatterns: ReadonlyArray<string>,
  requiredPatterns: ReadonlyArray<string>,
): boolean {
  if (requiredPatterns.length === 0) return true
  if (declaredHostPatterns.includes('<all_urls>')) return true
  const coversHttp = declaredHostPatterns.includes('http://*/*')
  const coversHttps = declaredHostPatterns.includes('https://*/*')
  return requiredPatterns.every((pattern) => {
    if (pattern.startsWith('http://')) return coversHttp || declaredHostPatterns.includes(pattern)
    if (pattern.startsWith('https://')) return coversHttps || declaredHostPatterns.includes(pattern)
    return declaredHostPatterns.includes(pattern)
  })
}

/** 确认当前 provider 真实运行所需的网络目标已被安装期 manifest 覆盖。 */
export async function assertProviderNetworkAccessCovered(
  page: Page,
  patterns: ReadonlyArray<string>,
): Promise<ProviderLiveNetworkAccessResult> {
  const normalizedPatterns = Array.from(
    new Set(patterns.map((pattern) => String(pattern || '').trim()).filter(Boolean)),
  )
  const declaredHostPatterns = await page.evaluate(() => {
    const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome
    const manifest = chromeApi?.runtime?.getManifest?.() as { host_permissions?: unknown } | undefined
    return Array.isArray(manifest?.host_permissions)
      ? manifest.host_permissions.map((pattern) => String(pattern || '').trim()).filter(Boolean)
      : []
  })
  if (normalizedPatterns.length === 0) {
    return {
      patterns: [],
      status: 'not-required',
      coveredByInstallTimeWebAccess: true,
      declaredHostPatterns,
    }
  }
  if (declaredHostPatterns.length === 0) {
    return {
      patterns: normalizedPatterns,
      status: 'unavailable',
      coveredByInstallTimeWebAccess: false,
      declaredHostPatterns,
      error: 'manifest host_permissions unavailable',
    }
  }
  const covered = areNetworkTargetsCoveredByManifest(declaredHostPatterns, normalizedPatterns)
  return {
    patterns: normalizedPatterns,
    status: covered ? 'covered' : 'missing',
    coveredByInstallTimeWebAccess: covered,
    declaredHostPatterns,
    ...(covered ? {} : { error: 'provider network target is not covered by install-time website access' }),
  }
}

/** 运行真实的 provider health-check。 */
export async function runProviderHealthCheck(
  page: Page,
  spec: ProviderLiveSpec,
  timeoutMs = 120_000,
): Promise<ProviderLiveHealthRunResult> {
  const modelIds = listExpectedModels(spec).map((item) => item.rawModelId)
  return await page.evaluate(
    async ({ providerId, modelIds, timeoutMs }) => {
      const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome
      const runtime = chromeApi?.runtime
      const requestId = `providers-live-health-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const startedAt = Date.now()

      if (!runtime?.connect) {
        return {
          requestId,
          status: 'error',
          durationMs: 0,
          modelResults: [],
          terminalError: 'chrome.runtime.connect 不可用',
        } satisfies ProviderLiveHealthRunResult
      }

      return await new Promise<ProviderLiveHealthRunResult>((resolve) => {
        const port = runtime.connect({ name: 'olyq:ui' })
        const modelResults = new Map<string, ProviderLiveHealthModelResult>()
        let finished = false

                /**
         * 测试辅助函数：`finish`。
         *
         * @remarks
         * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
         */
        const finish = (
          status: ProviderLiveHealthRunResult['status'],
          terminalError?: ProviderLiveHealthRunResult['terminalError'],
        ) => {
          if (finished) return
          finished = true
          window.clearTimeout(timer)
          try {
            port.disconnect()
          } catch {
            // ignore
          }
          resolve({
            requestId,
            status,
            durationMs: Date.now() - startedAt,
            modelResults: Array.from(modelResults.values()),
            ...(terminalError ? { terminalError } : {}),
          })
        }

        const timer = window.setTimeout(() => {
          finish('timeout', 'health/check 超时')
        }, timeoutMs)

        port.onMessage.addListener((rawMessage) => {
          const message =
            rawMessage && typeof rawMessage === 'object'
              ? (rawMessage as Record<string, unknown>)
              : null
          if (!message || message.requestId !== requestId) return

          if (message.type === 'health/model') {
            const payload =
              message.payload && typeof message.payload === 'object'
                ? (message.payload as Record<string, unknown>)
                : {}
            const modelId = String(payload.modelId || '').trim()
            if (!modelId) return
            const keySummary =
              payload.keySummary && typeof payload.keySummary === 'object'
                ? (payload.keySummary as Record<string, unknown>)
                : null
            modelResults.set(modelId, {
              modelId,
              status:
                payload.status === 'ok' || payload.status === 'partial'
                  ? (payload.status as 'ok' | 'partial')
                  : 'error',
              ...(typeof payload.latency === 'number' && Number.isFinite(payload.latency)
                ? { latency: payload.latency }
                : {}),
              ...(payload.error ? { error: payload.error as I18nText } : {}),
              ...(keySummary
                ? {
                    keySummary: {
                      total: Number(keySummary.total || 0),
                      success: Number(keySummary.success || 0),
                      failed: Number(keySummary.failed || 0),
                    },
                  }
                : {}),
            })
            return
          }

          if (message.type === 'health/error') {
            finish('error', (message.error as I18nText | undefined) ?? 'health/check 失败')
            return
          }

          if (message.type === 'health/done') {
            const missingModelIds = modelIds.filter((modelId) => !modelResults.has(modelId))
            if (missingModelIds.length > 0) {
              finish('error', `health/model 未覆盖全部请求模型: ${missingModelIds.join(', ')}`)
              return
            }
            finish('ok')
          }
        })

        try {
          port.postMessage({
            type: 'health/check',
            requestId,
            payload: {
              providerId,
              modelIds,
              keyCheckMode: 'single',
              selectedKeyIndex: 0,
              isConcurrent: false,
              timeoutMs: Math.max(5_000, Math.min(timeoutMs, 30_000)),
            },
          })
        } catch (error) {
          finish('error', error instanceof Error ? error.message : String(error))
        }
      })
    },
    {
      providerId: spec.providerId,
      modelIds,
      timeoutMs,
    },
  )
}

/** 运行真实的 chat 请求。 */
export async function runProviderChatLive(
  page: Page,
  spec: ProviderLiveSpec,
  rawModelId: string,
  timeoutMs = 120_000,
): Promise<ProviderLiveChatRunResult> {
  return await page.evaluate(
    async ({ providerId, rawModelId, timeoutMs }) => {
      const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome
      const runtime = chromeApi?.runtime
      const requestId = `providers-live-chat-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const startedAt = Date.now()

      if (!runtime?.connect) {
        return {
          modelId: rawModelId,
          requestId,
          status: 'error',
          durationMs: 0,
          deltaCount: 0,
          reasoningCount: 0,
          toolCallCount: 0,
          fileCount: 0,
          assistantText: '',
          debugEvents: [],
          error: 'chrome.runtime.connect 不可用',
        } satisfies ProviderLiveChatRunResult
      }

      return await new Promise<ProviderLiveChatRunResult>((resolve) => {
        const port = runtime.connect({ name: 'olyq:ui' })
        let finished = false
        let assistantText = ''
        let deltaCount = 0
        let reasoningCount = 0
        let toolCallCount = 0
        let fileCount = 0
        let usage: ProviderLiveChatRunResult['usage']
        const debugEvents: ProviderLiveChatDebugEvent[] = []

                /**
         * 测试辅助函数：`finish`。
         *
         * @remarks
         * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
         */
        const finish = (
          status: ProviderLiveChatRunResult['status'],
          extra?: Partial<ProviderLiveChatRunResult>,
        ) => {
          if (finished) return
          finished = true
          window.clearTimeout(timer)
          try {
            port.disconnect()
          } catch {
            // ignore
          }
          resolve({
            modelId: rawModelId,
            requestId,
            status,
            durationMs: Date.now() - startedAt,
            deltaCount,
            reasoningCount,
            toolCallCount,
            fileCount,
            assistantText,
            ...(usage ? { usage } : {}),
            debugEvents,
            ...extra,
          })
        }

        const timer = window.setTimeout(() => {
          finish('timeout', { error: 'chat/stream-v1 超时' })
        }, timeoutMs)

        port.onMessage.addListener((rawMessage) => {
          const message =
            rawMessage && typeof rawMessage === 'object'
              ? (rawMessage as Record<string, unknown>)
              : null
          if (!message || message.requestId !== requestId) return

          if (message.type === 'chat/delta') {
            const delta = typeof message.delta === 'string' ? message.delta : ''
            if (delta) {
              assistantText += delta
              deltaCount += 1
            }
            return
          }

          if (message.type === 'chat/reasoning') {
            const delta = typeof message.delta === 'string' ? message.delta : ''
            if (delta) {
              assistantText += delta
              reasoningCount += 1
            }
            return
          }

          if (message.type === 'chat/tool-call') {
            toolCallCount += 1
            return
          }

          if (message.type === 'chat/file' || message.type === 'chat/file-url') {
            fileCount += 1
            return
          }

          if (message.type === 'chat/debug') {
            if (debugEvents.length < 24) {
              debugEvents.push({
                kind: typeof message.kind === 'string' ? message.kind : 'unknown',
                ...(Object.prototype.hasOwnProperty.call(message, 'payload')
                  ? { payload: message.payload }
                  : {}),
              })
            }
            return
          }

          if (message.type === 'chat/error') {
            const details =
              message.details && typeof message.details === 'object'
                ? Object.fromEntries(
                    Object.entries(message.details as Record<string, unknown>).filter(
                      ([, value]) => typeof value === 'string' && value.trim(),
                    ).map(([key, value]) => [key, String(value)]),
                  )
                : undefined
            finish('error', {
              error: (message.error as I18nText | undefined) ?? 'chat/stream-v1 失败',
              ...(details && Object.keys(details).length > 0 ? { details } : {}),
            })
            return
          }

          if (message.type === 'chat/done') {
            const payload =
              message.usage && typeof message.usage === 'object'
                ? (message.usage as Record<string, unknown>)
                : null
            usage = payload
              ? {
                  ...(typeof payload.inputTokens === 'number' ? { inputTokens: payload.inputTokens } : {}),
                  ...(typeof payload.outputTokens === 'number' ? { outputTokens: payload.outputTokens } : {}),
                }
              : undefined
            finish('ok')
          }
        })

        try {
          port.postMessage({
            type: 'chat/stream-v1',
            requestId,
            payload: {
              model: `${providerId}/${rawModelId}`,
              messages: [
                {
                  role: 'user',
                  content: 'Reply with the single token OK.',
                },
              ],
              temperature: 0,
              topP: 1,
              maxTokens: 32,
              topicKind: 'topic',
              debug: true,
            },
          })
        } catch (error) {
          finish('error', { error: error instanceof Error ? error.message : String(error) })
        }
      })
    },
    {
      providerId: spec.providerId,
      rawModelId,
      timeoutMs,
    },
  )
}

/** 运行真实的 embedding 请求。 */
export async function runProviderEmbeddingLive(
  page: Page,
  spec: ProviderLiveSpec,
  rawModelId: string,
  timeoutMs = 120_000,
): Promise<ProviderLiveEmbeddingRunResult> {
  return await page.evaluate(
    async ({ providerId, rawModelId, timeoutMs }) => {
      const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome
      const runtime = chromeApi?.runtime
      const requestId = `providers-live-embedding-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const startedAt = Date.now()

      if (!runtime?.connect) {
        return {
          modelId: rawModelId,
          requestId,
          status: 'error',
          durationMs: 0,
          vectorLength: 0,
          vectorPreview: [],
          error: 'chrome.runtime.connect 不可用',
        } satisfies ProviderLiveEmbeddingRunResult
      }

      return await new Promise<ProviderLiveEmbeddingRunResult>((resolve) => {
        const port = runtime.connect({ name: 'olyq:ui' })
        let finished = false

                /**
         * 测试辅助函数：`finish`。
         *
         * @remarks
         * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
         */
        const finish = (
          status: ProviderLiveEmbeddingRunResult['status'],
          extra?: Partial<ProviderLiveEmbeddingRunResult>,
        ) => {
          if (finished) return
          finished = true
          window.clearTimeout(timer)
          try {
            port.disconnect()
          } catch {
            // ignore
          }
          resolve({
            modelId: rawModelId,
            requestId,
            status,
            durationMs: Date.now() - startedAt,
            vectorLength: 0,
            vectorPreview: [],
            ...extra,
          })
        }

        const timer = window.setTimeout(() => {
          finish('timeout', { error: 'embedding/generate 超时' })
        }, timeoutMs)

        port.onMessage.addListener((rawMessage) => {
          const message =
            rawMessage && typeof rawMessage === 'object'
              ? (rawMessage as Record<string, unknown>)
              : null
          if (!message || message.requestId !== requestId) return

          if (message.type === 'embedding/result') {
            const vector = Array.isArray(message.vector)
              ? message.vector.map((value) => Number(value)).filter((value) => Number.isFinite(value))
              : []
            finish('ok', {
              vectorLength: vector.length,
              vectorPreview: vector.slice(0, 8),
            })
            return
          }

          if (message.type === 'embedding/error') {
            finish('error', {
              error: (message.error as I18nText | undefined) ?? 'embedding/generate 失败',
            })
          }
        })

        try {
          port.postMessage({
            type: 'embedding/generate',
            requestId,
            payload: {
              input: 'hello world from providers live e2e',
              options: {
                model: `${providerId}/${rawModelId}`,
                normalize: true,
              },
            },
          })
        } catch (error) {
          finish('error', { error: error instanceof Error ? error.message : String(error) })
        }
      })
    },
    {
      providerId: spec.providerId,
      rawModelId,
      timeoutMs,
    },
  )
}

/** 运行真实的 image 请求。 */
export async function runProviderImageLive(
  page: Page,
  spec: ProviderLiveSpec,
  rawModelId: string,
  timeoutMs = 120_000,
): Promise<ProviderLiveImageRunResult> {
  return await page.evaluate(
    async ({ providerId, rawModelId, timeoutMs }) => {
      const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome
      const runtime = chromeApi?.runtime
      const requestId = `providers-live-image-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const startedAt = Date.now()

      if (!runtime?.connect) {
        return {
          modelId: rawModelId,
          requestId,
          status: 'error',
          durationMs: 0,
          imageCount: 0,
          imageKinds: [],
          error: 'chrome.runtime.connect 不可用',
        } satisfies ProviderLiveImageRunResult
      }

      return await new Promise<ProviderLiveImageRunResult>((resolve) => {
        const port = runtime.connect({ name: 'olyq:ui' })
        let finished = false
        const imageKinds: string[] = []
        let imageCount = 0
        let firstUrl = ''
        let revisedPrompt = ''

                /**
         * 测试辅助函数：`finish`。
         *
         * @remarks
         * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
         */
        const finish = (
          status: ProviderLiveImageRunResult['status'],
          extra?: Partial<ProviderLiveImageRunResult>,
        ) => {
          if (finished) return
          finished = true
          window.clearTimeout(timer)
          try {
            port.disconnect()
          } catch {
            // ignore
          }
          resolve({
            modelId: rawModelId,
            requestId,
            status,
            durationMs: Date.now() - startedAt,
            imageCount,
            imageKinds,
            ...(firstUrl ? { firstUrl } : {}),
            ...(revisedPrompt ? { revisedPrompt } : {}),
            ...extra,
          })
        }

        const timer = window.setTimeout(() => {
          finish('timeout', { error: 'image/generate 超时' })
        }, timeoutMs)

        port.onMessage.addListener((rawMessage) => {
          const message =
            rawMessage && typeof rawMessage === 'object'
              ? (rawMessage as Record<string, unknown>)
              : null
          if (!message || message.requestId !== requestId) return

          if (message.type === 'image/result') {
            const images = Array.isArray(message.images)
              ? message.images.filter(
                  (item): item is Record<string, unknown> =>
                    Boolean(item) && typeof item === 'object',
                )
              : []
            imageCount += images.length
            for (const image of images) {
              const kind = typeof image.kind === 'string' ? image.kind : 'unknown'
              imageKinds.push(kind)
              if (!firstUrl && kind === 'url' && typeof image.url === 'string') {
                firstUrl = image.url
              }
            }
            if (!revisedPrompt && typeof message.revisedPrompt === 'string') {
              revisedPrompt = message.revisedPrompt
            }
            return
          }

          if (message.type === 'image/error') {
            finish('error', {
              error: (message.error as I18nText | undefined) ?? 'image/generate 失败',
            })
            return
          }

          if (message.type === 'image/done') {
            finish('ok')
          }
        })

        try {
          port.postMessage({
            type: 'image/generate',
            requestId,
            payload: {
              model: `${providerId}/${rawModelId}`,
              prompt: 'A simple red circle on a white background.',
              n: 1,
            },
          })
        } catch (error) {
          finish('error', { error: error instanceof Error ? error.message : String(error) })
        }
      })
    },
    {
      providerId: spec.providerId,
      rawModelId,
      timeoutMs,
    },
  )
}
