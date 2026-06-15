/**
 * 说明：`fetch-models` AI 能力模块。
 *
 * 职责：
 * - 承载 `fetch-models` 相关的当前文件实现与模块边界；
 * - 对外暴露 `FetchedModel`、`fetchModelsFromApi` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型拉取服务：从 provider 的 /models 端点获取全量模型目录。
 *
 * 约束：
 * - OpenAI 风格 Provider：GET `${base}/models`（Authorization: Bearer）
 * - Google Gemini（Generative Language API；生成式语言 API）：GET `${base}/models`（x-goog-api-key）
 */

import type {
  ModelFeature,
  ModelKind,
  ModelModality,
  ProviderCatalogTypeHint,
  ProviderConfig,
  TransportProtocol,
} from './types'
import { isLocalApiBase, resolveProviderApiBase } from './api-host'
import { isPlainRecord } from '@/lib/utils/type-guards'
import { I18nError } from '@/lib/i18n/error'
import { resolveProviderRequestParams } from './provider-auth'
import { selectRotatedApiKeyForProvider } from './api-keys'

/**
 * 统一后的模型目录项。
 *
 * 该结构是 `/models` 拉取层输出给模型管理页与注册表解析层的标准契约。
 */
export interface FetchedModel {
  /** 发送给 Provider 的原始模型 ID。 */
  id: string
  /** UI 展示名称。 */
  name: string
  /** UI 分组名。 */
  group: string
  /** 目录阶段已明确识别出的传输协议。 */
  transportProtocol?: TransportProtocol
  /** 官方目录已明确返回、但当前扩展端尚未接入稳定协议的类型提示。 */
  providerCatalogTypeHint?: ProviderCatalogTypeHint
  /** 官方目录明确给出的模型主类型。 */
  kindHint?: ModelKind
  /** 官方目录明确给出的输入模态。 */
  inputModalities?: ReadonlyArray<ModelModality>
  /** 官方目录明确给出的输出模态。 */
  outputModalities?: ReadonlyArray<ModelModality>
  /** 官方目录明确给出的特性。 */
  features?: ReadonlyArray<ModelFeature>
  /** 官方目录明确给出的上下文长度。 */
  contextLength?: number
  /** 官方目录明确给出的 provider 原生请求参数支持列表。 */
  supportedParameters?: ReadonlyArray<string>
  /** 官方目录明确给出的废弃状态。 */
  isDeprecated?: boolean
  /** 目录存在，但当前不允许导入的原因文案 key。 */
  importBlockedReasonKey?: string
  /** 导入阻断文案参数。 */
  importBlockedReasonParams?: Readonly<Record<string, string>>
}

/** 从 model id 推断分组名 */
function inferGroup(modelId: string, providerName: string): string {
  const idx = modelId.lastIndexOf('/')
  if (idx > 0) return modelId.slice(0, idx)
  return providerName
}

/**
 * 内部函数：`toPositiveContextLength`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function toPositiveContextLength(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : undefined
}

/**
 * 解析 provider 目录中的请求参数支持列表。
 *
 * 说明：
 * - OpenRouter `/models` 使用 `supported_parameters`；
 * - 这里只保留原生字段名并去重，不把它们提升成公共模型能力。
 */
function parseSupportedParameters(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const value = typeof item === 'string' ? item.trim() : ''
    const key = value.toLowerCase()
    if (!value || seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

const MODEL_KIND_SPECIFICITY: Record<ModelKind, number> = {
  unknown: 0,
  chat: 1,
  'multimodal-chat': 2,
  'audio-chat': 2,
  transcription: 3,
  'speech-generation': 3,
  moderation: 3,
  embedding: 3,
  rerank: 3,
  'image-generation': 3,
  'video-generation': 3,
}

/**
 * 内部函数：`mergeModalities`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function mergeModalities(
  current?: ReadonlyArray<ModelModality>,
  incoming?: ReadonlyArray<ModelModality>,
): ReadonlyArray<ModelModality> | undefined {
  const merged = Array.from(new Set([...(current ?? []), ...(incoming ?? [])])) as ModelModality[]
  return merged.length > 0 ? merged : undefined
}

/**
 * 内部函数：`mergeFeatures`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function mergeFeatures(
  current?: ReadonlyArray<ModelFeature>,
  incoming?: ReadonlyArray<ModelFeature>,
): ReadonlyArray<ModelFeature> | undefined {
  const merged = Array.from(new Set([...(current ?? []), ...(incoming ?? [])])) as ModelFeature[]
  return merged.length > 0 ? merged : undefined
}

/**
 * 内部函数：`pickMoreSpecificKind`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function pickMoreSpecificKind(current?: ModelKind, incoming?: ModelKind): ModelKind | undefined {
  if (!current) return incoming
  if (!incoming) return current
  return MODEL_KIND_SPECIFICITY[incoming] > MODEL_KIND_SPECIFICITY[current] ? incoming : current
}

/**
 * 内部函数：`normalizeKindHintByModalities`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function normalizeKindHintByModalities(
  kindHint: ModelKind | undefined,
  inputModalities?: ReadonlyArray<ModelModality>,
  outputModalities?: ReadonlyArray<ModelModality>,
): ModelKind | undefined {
  if (
    kindHint === 'chat'
    && outputModalities?.includes('text')
    && (inputModalities?.includes('image') || inputModalities?.includes('audio') || inputModalities?.includes('file'))
  ) {
    return 'multimodal-chat'
  }
  return kindHint
}

/**
 * 内部函数：`createFetchedModelBase`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function createFetchedModelBase(
  id: string,
  name: string,
  providerName: string,
): Pick<FetchedModel, 'id' | 'name' | 'group'> {
  return {
    id,
    name,
    group: inferGroup(id, providerName),
  }
}

type TogetherCatalogSemanticPlan =
  Pick<FetchedModel, 'transportProtocol' | 'providerCatalogTypeHint' | 'kindHint' | 'inputModalities' | 'outputModalities' | 'features'>
  & Pick<FetchedModel, 'importBlockedReasonKey' | 'importBlockedReasonParams'>

type TogetherAudioCatalogCategory = 'serverless-speech' | 'dedicated-speech' | 'unknown-audio'

const TOGETHER_SERVERLESS_SPEECH_MODEL_IDS = new Set([
  'canopylabs/orpheus-3b-0.1-ft',
  'hexgrad/kokoro-82m',
  'cartesia/sonic',
  'cartesia/sonic-2',
  'cartesia/sonic-3',
])

const TOGETHER_DEDICATED_SPEECH_MODEL_IDS = new Set([
  'deepgram/deepgram-aura-2',
  'rime-labs/rime-arcana-v2',
  'rime-labs/rime-arcana-v3',
  'rime-labs/rime-arcana-v3-turbo',
  'rime-labs/rime-mist-v2',
  'rime-labs/rime-mist-v3',
  'minimax/speech-2.6-turbo',
])

const TOGETHER_OCR_OR_VISUAL_MODEL_REGEX = /\b(?:ocr|got-ocr|deepseek-ocr|mineru|nougat|docling|document(?:[-_/]?(?:parser|parsing|understanding|understand|ocr))?|parser|parsing|vision|vl|omni|pixtral|llava|minicpm-v|minicpmo|internvl|qvq|qwen(?:2(?:\.5)?|3)?-vl|qwen(?:2\.5|3)?-omni|deepseek-vl|gemma-3)\b/i

/**
 * 内部函数：`normalizeTogetherCatalogModelId`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function normalizeTogetherCatalogModelId(modelId: string): string {
  return String(modelId || '').trim().toLowerCase()
}

/**
 * 内部函数：`isTogetherOcrOrVisualModel`。
 *
 * @remarks
 * Together 目录里的 `type=chat` 是粗分类，OCR / Vision 家族不能在拉取层直接压成 text-only，
 * 否则后续 provider 规则即使命中，也会在某些路径上被显式 hints 降级。
 */
function isTogetherOcrOrVisualModel(modelId: string): boolean {
  return TOGETHER_OCR_OR_VISUAL_MODEL_REGEX.test(normalizeTogetherCatalogModelId(modelId))
}

/**
 * 内部函数：`classifyTogetherAudioModel`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function classifyTogetherAudioModel(modelId: string): TogetherAudioCatalogCategory {
  const normalizedModelId = normalizeTogetherCatalogModelId(modelId)
  if (TOGETHER_SERVERLESS_SPEECH_MODEL_IDS.has(normalizedModelId)) return 'serverless-speech'
  if (TOGETHER_DEDICATED_SPEECH_MODEL_IDS.has(normalizedModelId)) return 'dedicated-speech'
  return 'unknown-audio'
}

/**
 * 内部函数：`deriveTogetherSemanticPlan`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function deriveTogetherSemanticPlan(type: string, modelId: string): TogetherCatalogSemanticPlan {
  const normalizedType = String(type || '').trim().toLowerCase()
  switch (normalizedType) {
    case 'chat':
    case 'language':
    case 'code':
      if (isTogetherOcrOrVisualModel(modelId)) {
        return {
          transportProtocol: 'openai-chat',
        }
      }
      return {
        transportProtocol: 'openai-chat',
        kindHint: 'chat',
        inputModalities: ['text'],
        outputModalities: ['text'],
      }
    case 'image':
      return {
        transportProtocol: 'image-api',
        kindHint: 'image-generation',
        inputModalities: ['text'],
        outputModalities: ['image'],
        features: ['image-output'],
      }
    case 'embedding':
      return {
        transportProtocol: 'embedding-api',
        kindHint: 'embedding',
        inputModalities: ['text'],
        outputModalities: ['embeddings'],
      }
    case 'rerank':
      return {
        transportProtocol: 'rerank-api',
        kindHint: 'rerank',
        inputModalities: ['text'],
        outputModalities: ['text'],
      }
    case 'video':
      return {
        transportProtocol: 'video-api',
        kindHint: 'video-generation',
        inputModalities: ['text'],
        outputModalities: ['video'],
      }
    case 'transcribe':
      return {
        transportProtocol: 'transcription-api',
        kindHint: 'transcription',
        inputModalities: ['audio', 'file'],
        outputModalities: ['text'],
        features: ['transcription'],
      }
    case 'audio': {
      const audioCategory = classifyTogetherAudioModel(modelId)
      if (audioCategory === 'serverless-speech') {
        return {
          transportProtocol: 'speech-api',
          kindHint: 'speech-generation',
          inputModalities: ['text'],
          outputModalities: ['audio'],
          features: ['audio-output'],
        }
      }
      if (audioCategory === 'dedicated-speech') {
        return {
          providerCatalogTypeHint: 'audio',
          importBlockedReasonKey: 'modelManagerPanel.manageDialog.importBlockedTogetherDedicatedSpeechEndpointRequired',
        }
      }
      return {
        providerCatalogTypeHint: 'audio',
        importBlockedReasonKey: 'modelManagerPanel.manageDialog.importBlockedProviderCatalogTypeUnsupported',
        importBlockedReasonParams: { type: 'audio' },
      }
    }
    case 'moderation':
      return {
        providerCatalogTypeHint: normalizedType as ProviderCatalogTypeHint,
        importBlockedReasonKey: 'modelManagerPanel.manageDialog.importBlockedProviderCatalogTypeUnsupported',
        importBlockedReasonParams: { type: normalizedType },
      }
    default:
      return {
        importBlockedReasonKey: 'modelManagerPanel.manageDialog.importBlockedProviderCatalogTypeUnsupported',
        importBlockedReasonParams: { type: normalizedType || 'unknown' },
      }
  }
}

/**
 * 内部函数：`parseTogetherCatalog`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function parseTogetherCatalog(
  json: unknown,
  providerName: string,
): FetchedModel[] {
  const rawModels = Array.isArray(json) ? json : []

  return rawModels
    .map((item) => (isPlainRecord(item) ? item : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => {
      const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : ''
      if (!id) return null
      const name = typeof item.display_name === 'string' && item.display_name.trim()
        ? item.display_name.trim()
        : typeof item.name === 'string' && item.name.trim()
          ? item.name.trim()
          : id
      const semanticPlan = deriveTogetherSemanticPlan(typeof item.type === 'string' ? item.type : '', id)
      const contextLength = toPositiveContextLength(item.context_length)
      const supportedParameters = parseSupportedParameters(item.supported_parameters)

      return {
        ...createFetchedModelBase(id, name, providerName),
        ...(semanticPlan.transportProtocol ? { transportProtocol: semanticPlan.transportProtocol } : {}),
        ...(semanticPlan.providerCatalogTypeHint ? { providerCatalogTypeHint: semanticPlan.providerCatalogTypeHint } : {}),
        ...(semanticPlan.kindHint ? { kindHint: semanticPlan.kindHint } : {}),
        ...(semanticPlan.inputModalities ? { inputModalities: semanticPlan.inputModalities } : {}),
        ...(semanticPlan.outputModalities ? { outputModalities: semanticPlan.outputModalities } : {}),
        ...(semanticPlan.features ? { features: semanticPlan.features } : {}),
        ...(semanticPlan.importBlockedReasonKey ? { importBlockedReasonKey: semanticPlan.importBlockedReasonKey } : {}),
        ...(semanticPlan.importBlockedReasonParams ? { importBlockedReasonParams: semanticPlan.importBlockedReasonParams } : {}),
        ...(contextLength ? { contextLength } : {}),
        ...(supportedParameters !== undefined ? { supportedParameters } : {}),
      } satisfies FetchedModel
    })
    .filter(Boolean) as FetchedModel[]
}

const FETCH_TIMEOUT = 15_000
const MODEL_CACHE_TTL = 10 * 60_000

/**
 * 拉取模型目录时可选的行为控制项。
 */
type FetchModelsOptions = {
  /** 强制跳过缓存（用于"刷新"按钮等场景） */
  force?: boolean
  /** 自定义缓存 TTL（毫秒） */
  cacheTtlMs?: number
}

const cache = new Map<string, { at: number; models: FetchedModel[] }>()

type FetchModelsParseContext = {
  readonly providerId: string
  readonly providerName: string
  readonly providerType: ProviderConfig['type']
}

/** SiliconFlow 目录基础类型抓取计划。 */
type SiliconFlowCatalogPlan = {
  /**
   * 官方 `type` 查询参数。
   *
   * 说明：
   * - 这里彻底切到 SiliconFlow 当前官方文档里的基础分类：`text | image | audio | video`；
   * - 不再由目录抓取层维护旧 `sub_type` 细分判断，细分语义统一交给模型类型系统。
   */
  readonly type: 'text' | 'image' | 'audio' | 'video'
  /** 当前基础类型可直接映射的传输协议。 */
  readonly transportProtocol?: TransportProtocol
  /** 当前基础类型可直接映射的 kind。 */
  readonly kindHint?: ModelKind
  /** 当前基础类型可直接映射的输入模态。 */
  readonly inputModalities?: ReadonlyArray<ModelModality>
  /** 当前基础类型可直接映射的输出模态。 */
  readonly outputModalities?: ReadonlyArray<ModelModality>
  /** 当前基础类型可直接映射的特性。 */
  readonly features?: ReadonlyArray<ModelFeature>
}

const SILICONFLOW_CATALOG_PLANS: ReadonlyArray<SiliconFlowCatalogPlan> = [
  {
    type: 'text',
    /**
     * `type=text` 只是官方的粗分类，不能在抓取层继续偷猜成 chat / embedding / rerank。
     *
     * 这里故意不写 kindHint / modalities：
     * - embedding / rerank 会交给 provider 规则与共享 fallback 再细分；
     * - 普通文本模型则由协议层兜底到 openai-chat；
     * - 这样可以避免目录抓取层和模型类型引擎同时维护两套细分规则。
     */
  },
  {
    type: 'image',
    transportProtocol: 'image-api',
    kindHint: 'image-generation',
    inputModalities: ['text'],
    outputModalities: ['image'],
    features: ['image-output'],
  },
  {
    type: 'audio',
    /**
     * `type=audio` 只能说明这是音频家族目录，无法仅凭这一层安全地区分 STT / TTS / audio-chat。
     *
     * 因此这里不直接落 kindHint，也不抢占协议；
     * 后续若 SiliconFlow 官方目录稳定暴露更细字段，再交给模型类型系统的显式 provider 信号层。
     */
  },
  {
    type: 'video',
    kindHint: 'video-generation',
    inputModalities: ['text'],
    outputModalities: ['video'],
  },
]

/**
 * 把对象稳定序列化为 JSON 字符串。
 *
 * 用于缓存 key 计算，避免对象键顺序不同导致缓存误失效。
 *
 * @param value - 任意待序列化值。
 * @returns 稳定排序后的 JSON 字符串。
 */
function stableJson(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value)
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
  return JSON.stringify(Object.fromEntries(entries))
}

/**
 * 为缓存 key 生成短哈希指纹。
 *
 * @param value - 原始字符串。
 * @returns 固定长度十六进制哈希串。
 */
function fingerprint(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * 根据统一鉴权 helper 的解析结果构造 `/models` 请求头。
 *
 * @param providerType - 当前 Provider 类型。
 * @param sanitizedHeaders - 已清洗的普通自定义 headers。
 * @param authHeaders - 当前 provider 生效的 API Key 鉴权 headers。
 * @returns 可直接用于请求目录接口的 headers。
 */
function buildRequestHeaders(
  providerType: ProviderConfig['type'],
  sanitizedHeaders: Record<string, string>,
  authHeaders: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...sanitizedHeaders,
    ...authHeaders,
  }
  if (providerType === 'anthropic' || providerType === 'vertex-anthropic') {
    if (!headers['anthropic-version']) headers['anthropic-version'] = '2023-06-01'
  }
  return headers
}

/**
 * 拉取模型目录 JSON，并把 HTTP 失败统一转成 i18n 错误。
 *
 * @param url - 目录接口地址。
 * @param headers - 请求头。
 * @param signal - 中断信号。
 * @returns 解析后的 JSON 数据。
 */
async function fetchCatalogJson(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<unknown> {
  const res = await fetch(url, {
    method: 'GET',
    headers,
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const detail = String(text || res.statusText || '').trim().slice(0, 200)
    throw new I18nError('errors.fetchModelsFailedWithDetail', { status: res.status, detail })
  }

  return await res.json() as unknown
}

/**
 * 把不同 Provider `/models` 响应解析为统一的 `FetchedModel[]`。
 *
 * @param json - 原始 JSON 响应。
 * @param context - Provider 解析上下文。
 * @param semanticPlan - 可选：由调用方额外提供的语义提示。
 * @returns 解析后的模型目录列表。
 */
function parseFetchedModelsFromJson(
  json: unknown,
  context: FetchModelsParseContext,
  semanticPlan?: Pick<FetchedModel, 'transportProtocol' | 'kindHint' | 'inputModalities' | 'outputModalities' | 'features'>,
): FetchedModel[] {
  if (context.providerId === 'together') {
    return parseTogetherCatalog(json, context.providerName)
  }

  const rawModels =
    context.providerType === 'gemini'
      ? (isPlainRecord(json) && Array.isArray((json as { models?: unknown }).models) ? (json as { models: unknown[] }).models : [])
      : context.providerType === 'anthropic' || context.providerType === 'vertex-anthropic'
        ? (isPlainRecord(json) && Array.isArray((json as { data?: unknown }).data) ? (json as { data: unknown[] }).data : [])
        : (isPlainRecord(json) && Array.isArray((json as { data?: unknown }).data) ? (json as { data: unknown[] }).data : [])

  return rawModels
    .map((m) => (isPlainRecord(m) ? m : null))
    .filter((m): m is Record<string, unknown> => Boolean(m))
    .map((m) => {
      const id = (() => {
        if (context.providerType === 'gemini') {
          const name = typeof (m as { name?: unknown }).name === 'string' ? String((m as { name?: unknown }).name) : ''
          const last = name.split('/').pop() || ''
          return last.trim()
        }
        if (context.providerType === 'anthropic' || context.providerType === 'vertex-anthropic') {
          const mid = typeof (m as { id?: unknown }).id === 'string' ? String((m as { id?: unknown }).id) : ''
          return mid.trim()
        }
        return typeof m.id === 'string' && m.id.trim() ? m.id.trim() : ''
      })()
      if (!id) return null
      const name = (() => {
        if (context.providerType === 'gemini') {
          const display = typeof (m as { displayName?: unknown }).displayName === 'string' ? String((m as { displayName?: unknown }).displayName) : ''
          return display.trim() || id
        }
        if (context.providerType === 'anthropic' || context.providerType === 'vertex-anthropic') {
          const display = typeof (m as { display_name?: unknown }).display_name === 'string' ? String((m as { display_name?: unknown }).display_name) : ''
          return display.trim() || id
        }
        return typeof m.name === 'string' && m.name.trim() ? m.name.trim() : id
      })()
      const contextLength = toPositiveContextLength(m.context_length)
      const supportedParameters = parseSupportedParameters(m.supported_parameters)

      return {
        ...createFetchedModelBase(id, name, context.providerName),
        ...(semanticPlan?.transportProtocol ? { transportProtocol: semanticPlan.transportProtocol } : {}),
        ...(semanticPlan?.kindHint ? { kindHint: semanticPlan.kindHint } : {}),
        ...(semanticPlan?.inputModalities ? { inputModalities: semanticPlan.inputModalities } : {}),
        ...(semanticPlan?.outputModalities ? { outputModalities: semanticPlan.outputModalities } : {}),
        ...(semanticPlan?.features ? { features: semanticPlan.features } : {}),
        ...(contextLength ? { contextLength } : {}),
        ...(supportedParameters !== undefined ? { supportedParameters } : {}),
      } satisfies FetchedModel
    })
    .filter(Boolean) as FetchedModel[]
}

type CohereCatalogModel = {
  readonly name: string
  readonly endpoints?: ReadonlyArray<string> | null
  readonly features?: ReadonlyArray<string> | null
  readonly context_length?: number | null
  readonly is_deprecated?: boolean
}

/**
 * 内部函数：`mapCohereFeatureHints`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function mapCohereFeatureHints(features: ReadonlyArray<string> | null | undefined): ModelFeature[] | undefined {
  const mapped = Array.from(new Set(
    (features ?? []).flatMap((feature) => {
      switch (String(feature || '').trim().toLowerCase()) {
        case 'vision':
          return ['vision-input'] satisfies ModelFeature[]
        case 'reasoning':
          return ['reasoning'] satisfies ModelFeature[]
        case 'tools':
        case 'strict_tools':
          return ['tool-call'] satisfies ModelFeature[]
        case 'json_mode':
        case 'json_schema':
          return ['structured-output'] satisfies ModelFeature[]
        default:
          return []
      }
    }),
  ))
  return mapped.length > 0 ? mapped : undefined
}

/**
 * 内部函数：`deriveCohereSemanticPlan`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function deriveCohereSemanticPlan(model: CohereCatalogModel): Pick<
  FetchedModel,
  'transportProtocol' | 'kindHint' | 'inputModalities' | 'outputModalities' | 'features'
> {
  const endpoints = Array.from(new Set((model.endpoints ?? []).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)))
  const featureHints = mapCohereFeatureHints(model.features)
  const hasEmbed = endpoints.includes('embed')
  const hasEmbedImage = endpoints.includes('embed_image')
  const hasRerank = endpoints.includes('rerank')
  const hasChatLike = endpoints.some((item) => item === 'chat' || item === 'generate' || item === 'summarize')

  if ((hasEmbed || hasEmbedImage) && !hasRerank && !hasChatLike) {
    const inputModalities: ModelModality[] = []
    if (hasEmbed) inputModalities.push('text')
    if (hasEmbedImage) inputModalities.push('image')

    return {
      transportProtocol: 'embedding-api',
      kindHint: 'embedding',
      inputModalities,
      outputModalities: ['embeddings'],
      ...(featureHints?.length ? { features: featureHints } : {}),
    }
  }

  if (hasRerank && !hasEmbed && !hasEmbedImage && !hasChatLike) {
    return {
      transportProtocol: 'rerank-api',
      kindHint: 'rerank',
      inputModalities: ['text'],
      outputModalities: ['text'],
      ...(featureHints?.length ? { features: featureHints } : {}),
    }
  }

  const supportsVision = featureHints?.includes('vision-input') ?? false
  return {
    transportProtocol: 'cohere-chat',
    kindHint: supportsVision ? 'multimodal-chat' : 'chat',
    inputModalities: supportsVision ? ['text', 'image'] : ['text'],
    outputModalities: ['text'],
    ...(featureHints?.length ? { features: featureHints } : {}),
  }
}

/**
 * 内部函数：`parseCohereCatalogPage`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function parseCohereCatalogPage(
  json: unknown,
  providerName: string,
): { models: FetchedModel[]; nextPageToken?: string } {
  const models = isPlainRecord(json) && Array.isArray((json as { models?: unknown }).models)
    ? (json as { models: unknown[] }).models
    : []
  const nextPageToken = isPlainRecord(json) && typeof (json as { next_page_token?: unknown }).next_page_token === 'string'
    ? String((json as { next_page_token: string }).next_page_token).trim()
    : ''

  return {
    models: models
      .map((item) => (isPlainRecord(item) ? item as CohereCatalogModel : null))
      .filter((item): item is CohereCatalogModel => Boolean(item && typeof item.name === 'string' && item.name.trim()))
      .map((item) => ({
        id: item.name.trim(),
        name: item.name.trim(),
        group: inferGroup(item.name.trim(), providerName),
        ...deriveCohereSemanticPlan(item),
        ...(toPositiveContextLength(item.context_length) ? { contextLength: toPositiveContextLength(item.context_length) } : {}),
        ...(typeof item.is_deprecated === 'boolean' ? { isDeprecated: item.is_deprecated } : {}),
      })),
    ...(nextPageToken ? { nextPageToken } : {}),
  }
}

/**
 * 合并两批模型目录结果。
 *
 * 若同一模型在不同批次里出现，会优先保留已有的“更具体”语义信息，
 * 只在缺失字段上用新结果补齐。
 *
 * @param current - 当前累计结果。
 * @param incoming - 新拉取的一批模型。
 * @returns 合并后的模型列表。
 */
function mergeFetchedModels(
  current: ReadonlyArray<FetchedModel>,
  incoming: ReadonlyArray<FetchedModel>,
): FetchedModel[] {
  const merged = new Map<string, FetchedModel>()
  for (const item of current) {
    merged.set(item.id, item)
  }
  for (const item of incoming) {
    const existing = merged.get(item.id)
    if (!existing) {
      merged.set(item.id, item)
      continue
    }

    const inputModalities = mergeModalities(existing.inputModalities, item.inputModalities)
    const outputModalities = mergeModalities(existing.outputModalities, item.outputModalities)
    const features = mergeFeatures(existing.features, item.features)
    const kindHint = normalizeKindHintByModalities(
      pickMoreSpecificKind(existing.kindHint, item.kindHint),
      inputModalities,
      outputModalities,
    )

    merged.set(item.id, {
      ...existing,
      ...(existing.name === existing.id && item.name !== item.id ? { name: item.name } : {}),
      ...(existing.group === existing.name && item.group !== existing.group ? { group: item.group } : {}),
      ...(existing.transportProtocol ? {} : item.transportProtocol ? { transportProtocol: item.transportProtocol } : {}),
      ...(kindHint ? { kindHint } : {}),
      ...(inputModalities ? { inputModalities } : {}),
      ...(outputModalities ? { outputModalities } : {}),
      ...(features ? { features } : {}),
      ...((existing.contextLength ?? 0) >= (item.contextLength ?? 0)
        ? existing.contextLength
          ? { contextLength: existing.contextLength }
          : {}
        : item.contextLength
          ? { contextLength: item.contextLength }
          : {}),
      ...(existing.isDeprecated ? {} : item.isDeprecated !== undefined ? { isDeprecated: item.isDeprecated } : {}),
      ...(existing.importBlockedReasonKey
        ? {}
        : item.importBlockedReasonKey
          ? {
              importBlockedReasonKey: item.importBlockedReasonKey,
              ...(item.importBlockedReasonParams ? { importBlockedReasonParams: item.importBlockedReasonParams } : {}),
            }
          : {}),
    })
  }
  return Array.from(merged.values())
}

/**
 * 内部函数：`fetchCohereCatalog`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function fetchCohereCatalog(
  base: string,
  headers: Record<string, string>,
  providerName: string,
  signal: AbortSignal,
): Promise<FetchedModel[]> {
  let nextPageToken: string | undefined
  let merged: FetchedModel[] = []

  do {
    const url = new URL(`${base}/models`)
    if (nextPageToken) url.searchParams.set('page_token', nextPageToken)
    const page = parseCohereCatalogPage(await fetchCatalogJson(url.toString(), headers, signal), providerName)
    merged = mergeFetchedModels(merged, page.models)
    nextPageToken = page.nextPageToken
  } while (nextPageToken)

  return merged
}

/**
 * 拉取 SiliconFlow 的多类型目录并合并成统一模型列表。
 *
 * SiliconFlow 需要按基础 `type` 分批请求目录，因此这里会并行发起多次请求，
 * 再依据预定义语义计划补上 transport/kind/modality 等提示字段。
 *
 * @param base - 归一化后的 API base。
 * @param headers - 请求头。
 * @param providerName - Provider 展示名。
 * @param signal - 中断信号。
 * @returns 合并后的模型目录。
 */
async function fetchSiliconFlowCatalog(
  base: string,
  headers: Record<string, string>,
  providerId: string,
  providerName: string,
  signal: AbortSignal,
): Promise<FetchedModel[]> {
  const requests = SILICONFLOW_CATALOG_PLANS.map(async (plan) => {
    const url = new URL(`${base}/models`)
    url.searchParams.set('type', plan.type)
    const json = await fetchCatalogJson(url.toString(), headers, signal)
    return parseFetchedModelsFromJson(json, {
      providerId,
      providerName,
      providerType: 'siliconflow',
    }, {
      transportProtocol: plan.transportProtocol,
      kindHint: plan.kindHint,
      inputModalities: plan.inputModalities,
      outputModalities: plan.outputModalities,
      features: plan.features,
    })
  })

  const batches = await Promise.all(requests)
  return batches.reduce<FetchedModel[]>((acc, batch) => mergeFetchedModels(acc, batch), [])
}

/**
 * 调用 provider 的 /models 端点获取全量模型列表。
 *
 * @param provider - Provider 配置对象；目录拉取与运行时共用同一套鉴权/headers 解析。
 * @param signal - 可选：取消信号
 * @param options - 可选：缓存/强制刷新参数
 */
export async function fetchModelsFromApi(
  provider: ProviderConfig,
  signal?: AbortSignal,
  options?: FetchModelsOptions,
): Promise<FetchedModel[]> {
  const { apiHost, apiKey, authHeaders, headers: sanitizedHeaders } = resolveProviderRequestParams({ ...provider, apiKey: await selectRotatedApiKeyForProvider(provider.id, provider.apiKey) })
  const { name: providerName, type: providerType } = provider
  const base = resolveProviderApiBase(providerType, apiHost)
  if (!base) throw new I18nError('errors.apiBaseUrlRequired')
  if (!apiKey && !isLocalApiBase(base)) throw new I18nError('errors.providerApiKeyMissing', { providerName })

  const normalizedProviderId = String(provider.id || '').trim()
  const cacheKey = `${providerType}::${normalizedProviderId}::${base}::${providerName}::${fingerprint(apiKey)}::${fingerprint(stableJson(sanitizedHeaders))}::${fingerprint(stableJson(authHeaders))}`
  const ttl = typeof options?.cacheTtlMs === 'number' && options.cacheTtlMs >= 0 ? options.cacheTtlMs : MODEL_CACHE_TTL
  if (!options?.force && ttl > 0) {
    const hit = cache.get(cacheKey)
    if (hit && Date.now() - hit.at < ttl) return hit.models
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  // 合并外部 signal
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true })

  try {
    const headers = buildRequestHeaders(providerType, sanitizedHeaders, authHeaders)
    const models = providerType === 'siliconflow'
      ? await fetchSiliconFlowCatalog(base, headers, normalizedProviderId, providerName, controller.signal)
      : providerType === 'cohere'
        ? await fetchCohereCatalog(base, headers, providerName, controller.signal)
        : parseFetchedModelsFromJson(
          await fetchCatalogJson(`${base}/models`, headers, controller.signal),
          {
            providerId: normalizedProviderId,
            providerName,
            providerType,
          },
        )

    models.sort((a, b) => a.id.localeCompare(b.id))
    cache.set(cacheKey, { at: Date.now(), models })
    return models
  } finally {
    clearTimeout(timer)
  }
}
