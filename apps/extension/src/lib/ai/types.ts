/**
 * 说明：`types` AI 能力模块。
 *
 * 职责：
 * - 承载 `types` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ProviderType`、`TransportProtocol`、`ModelKind` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：Olyq 的模型/Provider 类型定义。
 *
 * 说明：
 * - Provider 配置存储在 chrome.storage.local（`olyq.providers.v1`）。
 * - “Provider 类型”用于决定协议/实现（OpenAI / Anthropic / Gemini / Gateway / NewAPI 等）。
 * - 模型类型与能力统一由 model-registry 决定；
 * - Provider 配置只保存协议、鉴权与平台自定义模型目录，不再保存旧能力覆盖字段。
 */

import type { WebSearchSettings } from '@/lib/web-search/types'
import type { ChatMemoryParams } from '@/lib/memory/types'
import type { ChatStreamWireAttachment, ChatStreamWireMessage } from '@/lib/chat-stream-protocol'
import type { McpServerSelection } from '@/lib/mcp/selection'

/**
 * 说明：Provider 类型（与当前概念对齐）。
 *
 * 注意：
 * - 这不是“Provider ID”（provider.id），只是协议/实现类别；
 * - 大量 OpenAI 兼容平台（DeepSeek/Groq/Together/Fireworks/…）在这里都属于 `openai`。
 */
export type ProviderType =
  | 'openai'
  | 'openai-response'
  /**
   * DashScope（通义千问）：
   * - 对话/Embedding：走 OpenAI Compatible（/compatible-mode/v1）
   * - 图片：走 DashScope 官方 /api/v1 接口（不兼容 OpenAI 的 /images/*）
   */
  | 'dashscope'
  /**
   * SiliconFlow（硅基流动）：
   * - 对话/Embedding：OpenAI Compatible（/v1/chat/completions 等）
   * - 图片：官方仍使用 /v1/images/generations（JSON），不使用 OpenAI 的 /images/edits（multipart）
   */
  | 'siliconflow'
  | 'anthropic'
  | 'cohere'
  | 'deepseek'
  | 'gemini'
  | 'groq'
  | 'azure-openai'
  | 'vertexai'
  | 'vertex-anthropic'
  | 'mistral'
  | 'aws-bedrock'
  | 'new-api'
  | 'gateway'
  | 'xai'
  | 'ollama'

/**
 * 模型传输协议。
 *
 * 说明：
 * - 只用于决定某个模型该走哪种底层协议；
 * - 不再承担模型语义判断职责；
 * - 主要用于 NewAPI / 网关等“同一 Provider 下多协议并存”的场景。
 */
export type TransportProtocol =
  | 'openai-chat'
  | 'openai-responses'
  | 'anthropic-messages'
  | 'gemini-generate-content'
  | 'cohere-chat'
  | 'bedrock-converse'
  | 'embedding-api'
  | 'rerank-api'
  | 'image-api'
  | 'video-api'
  | 'transcription-api'
  | 'speech-api'
  | 'moderation-api'
  | 'unknown'

/**
 * 模型主类型。
 *
 * 说明：
 * - 这是“模型语义系统”对外暴露的统一能力分类；
 * - Provider 配置中的语义 hints 与 registry/runtime 解析结果共用同一套枚举，
 *   这样批量导入目录、注册表重建、运行时调用三条链路不会再出现各写各的字符串。
 */
export type ModelKind =
  | 'chat'
  | 'multimodal-chat'
  | 'audio-chat'
  | 'transcription'
  | 'speech-generation'
  | 'moderation'
  | 'image-generation'
  | 'video-generation'
  | 'embedding'
  | 'rerank'
  | 'unknown'

/**
 * 模型输入/输出模态。
 *
 * 说明：
 * - 只表达“模型能收什么、产什么”，不表达调用协议；
 * - 这组字段主要用于 UI 能力展示、运行时路由前校验，以及统一目录与运行时的语义表达。
 */
export type ModelModality =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'file'
  | 'embeddings'

/**
 * 模型附加能力键。
 *
 * 说明：
 * - 这里表达的是系统内部能力维度，不是面向用户的“标签”概念；
 * - 这些键只描述语义能力，不承担协议路由职责；
 * - 协议路由始终由 `transportProtocol` 单独表达。
 */
export type ModelFeature =
  | 'vision-input'
  | 'audio-input'
  | 'audio-model'
  | 'file-input'
  | 'tool-call'
  | 'structured-output'
  | 'reasoning'
  | 'native-web-search'
  | 'image-output'
  | 'audio-output'
  | 'transcription'
  | 'moderation'

/** Provider 官方目录返回、但当前运行时尚未接入稳定协议的类型提示。 */
export type ProviderCatalogTypeHint =
  | 'audio'
  | 'transcribe'
  | 'moderation'

/**
 * 用户可手动编辑的模型类型。
 *
 * 说明：
 * - 这里直接对齐扩展端当前对外暴露的 8 类“可编辑模型类型”；
 * - `text_generation` 表示“可承担文字对话主任务的聊天模型”，覆盖 chat / multimodal-chat / audio-chat；
 * - `image_generation` 表示“图片生成主任务模型”，与 `image-generation` 主类形成一一对应的用户层投影；
 * - 它们不是完整系统主类集合，而是用户在模型管理弹窗里可以手动调整的模型类型；
 * - 高风险主类（例如 `video-generation`、`audio-chat`）仍然只允许系统识别，不允许手工伪造。
 */
export type UserModelType =
  | 'text_generation'
  | 'image_generation'
  | 'vision'
  | 'reasoning'
  | 'function_calling'
  | 'web_search'
  | 'embedding'
  | 'rerank'

/** Provider API 兼容性开关（用于约束请求形态与参数透传）。 */
export type ProviderApiOptions = {
  /** 是否显式禁用图片输入。 */
  isNotSupportImageInput?: boolean
  /** 是否显式禁用文件输入。 */
  isNotSupportFileInput?: boolean
  /** 是否不支持 `stream_options` 等 OpenAI 流式扩展参数。 */
  isNotSupportStreamOptions?: boolean
  /** 是否支持 developer role（OpenAI） */
  isSupportDeveloperRole?: boolean
  /** 是否支持 service_tier（OpenAI/Groq） */
  isSupportServiceTier?: boolean
  /** 是否支持 enable_thinking（OpenAI） */
  isNotSupportEnableThinking?: boolean
  /** 是否支持 verbosity（OpenAI Responses） */
  isNotSupportVerbosity?: boolean
  /** 是否不支持 APIVersion（Azure/OpenAI 网关类） */
  isNotSupportAPIVersion?: boolean
}

/** OpenAI/Groq 的服务层级设置（沿用当前语义；不同平台会做能力检查/降级）。 */
export type OpenAIServiceTier = 'auto' | 'default' | 'flex' | 'priority' | undefined
/** Groq 的服务层级设置。 */
export type GroqServiceTier = 'auto' | 'on_demand' | 'flex' | undefined
/** 对外统一暴露的 service tier 联合类型。 */
export type ServiceTier = OpenAIServiceTier | GroqServiceTier

/** OpenAI Responses 的 verbosity（低/中/高；undefined=不传）。 */
export type OpenAIVerbosity = 'low' | 'medium' | 'high' | undefined

/** Anthropic prompt caching 设置（按当前实现字段含义）。 */
export type AnthropicCacheControlSettings = {
  /** 触发 prompt caching 的 token 阈值。 */
  tokenThreshold: number
  /** 是否对 system message 也打 cache control 标记。 */
  cacheSystemMessage: boolean
  /** 需要缓存的最近历史消息条数。 */
  cacheLastNMessages: number
}

/** AWS Bedrock 鉴权方式常量表。 */
export const AwsBedrockAuthTypes = {
  iam: 'iam',
  apiKey: 'apiKey',
} as const

/** AWS Bedrock 可选鉴权方式。 */
export type AwsBedrockAuthType = keyof typeof AwsBedrockAuthTypes

/** AWS Bedrock 运行时配置。 */
export interface AwsBedrockConfig {
  /** 鉴权方式：IAM（AK/SK）或 AWS Bedrock API Key。 */
  authType: AwsBedrockAuthType
  /** AWS region（例如 us-east-1） */
  region: string
  /** IAM 鉴权（Access Key/Secret Key） */
  accessKeyId?: string
  /** IAM 鉴权对应的 Secret Access Key。 */
  secretAccessKey?: string
  /** 可选：临时凭证的 session token（STS） */
  sessionToken?: string
  /** AWS Bedrock API Key；SDK 会按 Bearer token 发送。 */
  apiKey?: string
}

/** 聊天消息结构（与 UI → SW 线协议共享定义）。 */
export type ChatMessage = ChatStreamWireMessage

/** 聊天消息附件结构（图片 / 文件统一走线协议联合类型）。 */
export type ChatMessageAttachment = ChatStreamWireAttachment

/** Vertex AI 鉴权方式常量表。 */
export const VertexAiAuthTypes = {
  serviceAccount: 'serviceAccount',
  apiKey: 'apiKey',
} as const

/** Vertex AI 可选鉴权方式。 */
export type VertexAiAuthType = (typeof VertexAiAuthTypes)[keyof typeof VertexAiAuthTypes]

/** Vertex AI Service Account 鉴权字段。 */
export interface VertexServiceAccountConfig {
  /** Service Account 邮箱，对应 Google 凭据里的 client_email。 */
  clientEmail: string
  /** Service Account PEM 私钥，可包含转义换行。 */
  privateKey: string
  /** 可选私钥 ID，对应 Google 凭据里的 private_key_id。 */
  privateKeyId?: string
}

/** Vertex AI 运行时配置。 */
export interface VertexAiConfig {
  /** 鉴权方式：Service Account 或 Vertex express mode API Key。 */
  authType: VertexAiAuthType
  /** Service Account 模式使用的 GCP 项目，例如 my-gcp-project。 */
  projectId?: string
  /** Service Account 模式使用的 Vertex 区域，例如 us-central1。 */
  location?: string
  /** Service Account 模式使用的最小凭据字段。 */
  serviceAccount?: VertexServiceAccountConfig
  /** Vertex express mode API Key；不要求 projectId/location。 */
  apiKey?: string
}

/** Provider API Key 鉴权头配置。 */
export interface ProviderApiKeyAuthConfig {
  /** 用于承载 API Key 的 HTTP header 名称，例如 Authorization / x-api-key / api-key。 */
  headerName: string
  /** 可选 value 前缀，例如 Bearer；为空时直接发送原始 API Key。 */
  valuePrefix?: string
}

/**
 * 用于实例化 Provider 的运行时配置（按 Provider 存储在 chrome.storage.local）。
 */
export interface ProviderConfig {
  /** Provider 内部 ID（例如 "openai" / "deepseek" / "siliconflow"） */
  id: string
  /** UI 展示名称 */
  name: string
  /** Provider 类型（协议/实现类别） */
  type: ProviderType
  /** API 密钥（不需要时可为空，例如本地 Ollama） */
  apiKey: string
  /** API Host/Base URL（为空则使用 SDK 默认值；对 NewAPI/网关可指向自建域名） */
  apiHost: string
  /** Anthropic Messages 协议专属 API Host（可选；主要用于 NewAPI 把 Claude 类模型分流到独立 upstream） */
  anthropicApiHost?: string
  /** API Version（主要用于 Azure OpenAI 等需要 api-version 的端点） */
  apiVersion?: string
  /**
   * 自定义请求头（额外注入到 SDK 请求中）。
   *
   * 说明：
   * - 用于按当前实现"自定义请求头"能力（例如 OpenRouter 的 HTTP-Referer / X-Title）。
   * - 不承担 API Key 鉴权；鉴权头由 `apiKeyAuth` 和 provider 默认规则统一生成。
   * - 不允许在此覆盖 Authorization、Content-Type 或常见 API Key 鉴权头（SDK/统一鉴权 helper 会设置默认值）。
   */
  headers?: Record<string, string>
  /**
   * API Key 鉴权 header 配置。
   *
   * 说明：
   * - 缺省时按 provider 类型使用官方/当前适配器默认鉴权头。
   * - 仅用于 `provider.apiKey` 这条通用 API Key 路径；OAuth、Vertex 服务账号、Bedrock IAM 等专用鉴权不读取该字段。
   */
  apiKeyAuth?: ProviderApiKeyAuthConfig
  /**
   * 说明：Provider 自定义图标：
   * - data URL（用户上传）
   * - 或 `lobe-icon:{id}:{0|1}` 引用（见 provider-icons.ts）
   *
   * 说明：
   * - 仅影响 UI 展示；不参与任何请求逻辑
   * - 必须保留扩展端现有的 icon 逻辑（\@lobehub/icons CDN）
   */
  logo?: string
  /** 是否启用该 Provider */
  enabled: boolean
  /** 该 Provider 下可用的模型列表 */
  models: ProviderModelConfig[]
  /** 鉴权方式（用于 UI 与 OAuth 登录流程） */
  authType?: 'apiKey' | 'oauth'
  /** OAuth 是否已完成授权（仅用于 UI 提示；实际可用性仍以 apiKey/token 是否存在为准） */
  isAuthed?: boolean
  /** 可选：Provider 速率限制（用于并发/健康检查节流等场景） */
  rateLimit?: number
  /** Provider 备注（Markdown/纯文本均可；仅本地存储） */
  notes?: string
  /** Provider API 兼容性开关 */
  apiOptions?: ProviderApiOptions
  /** Service tier（OpenAI/Groq 等；可选） */
  serviceTier?: ServiceTier
  /** OpenAI Responses verbosity（可选） */
  verbosity?: OpenAIVerbosity
  /** Anthropic prompt caching 设置（可选） */
  anthropicCacheControl?: AnthropicCacheControlSettings
  /** AWS Bedrock 专用配置（可选） */
  bedrock?: AwsBedrockConfig
  /** Vertex AI 专用配置（可选） */
  vertex?: VertexAiConfig
}

/**
 * Provider 侧保存的单个模型配置。
 *
 * 说明：
 * - 该结构是“本地 provider 配置 + 官方目录提示 + 用户手动覆盖”的承载层；
 * - 它不直接等同于最终运行时语义，真正生效的类型能力仍需结合 registry 解析。
 */
export interface ProviderModelConfig {
  /** 发送给 API 的模型 ID（例如 "gpt-4o" / "claude-sonnet-4-20250514"） */
  id: string
  /** UI 展示名称 */
  name: string
  /** 是否为该 Provider 的默认模型 */
  isDefault?: boolean
  /** 分组名（用于 UI 分组展示，默认为 provider name） */
  group?: string
  /** 传输协议（用于 NewAPI/网关按模型分流） */
  transportProtocol?: TransportProtocol
  /**
   * 目录侧明确给出的模型主类型提示。
   *
   * 说明：
   * - 该字段只由系统自动写入，例如 OpenRouter 模态、SiliconFlow `type` 以及后续其它官方目录显式能力字段；
   * - UI 不允许手填，避免再次出现“手工覆盖自动语义”的双真源问题。
   */
  kindHint?: ModelKind
  /**
   * 目录侧明确给出的输入模态提示。
   *
   * 说明：
   * - 仅用于保存官方目录显式信号；
   * - 当系统无法从目录拿到该字段时，不会把名称推断结果反写进配置，避免把推断结果伪装成官方事实。
   */
  inputModalities?: ReadonlyArray<ModelModality>
  /** 目录侧明确给出的输出模态提示。 */
  outputModalities?: ReadonlyArray<ModelModality>
  /** 目录侧明确给出的附加特性提示。 */
  features?: ReadonlyArray<ModelFeature>
  /** 目录侧明确给出的上下文长度。 */
  contextLength?: number
  /**
   * 目录侧明确给出的请求参数支持列表。
   *
   * 说明：
   * - 字段值必须保留 provider 原生参数名，例如 `top_p`、`reasoning`、`tool_choice`；
   * - 该列表是 provider/model scoped 能力事实，只用于运行时过滤，不会上升为公共 canonical 模型能力。
   */
  supportedParameters?: ReadonlyArray<string>
  /** 目录侧明确给出的废弃状态。 */
  isDeprecated?: boolean
  /**
   * 用户手动选择的模型类型覆盖。
   *
   * 说明：
   * - `undefined` 表示完全跟随系统识别；
   * - `[]` 表示用户明确清空全部可编辑模型类型；
   * - 非空数组表示用户显式覆盖；
   * - 它只是一层本地覆盖，不会反写 registry 真源。
   */
  manualModelTypes?: ReadonlyArray<UserModelType>
  /** 是否支持 text delta（可选；用于流式兼容性提示） */
  supportedTextDelta?: boolean
}

/**
 * 模型调用参数（与 UI/后台的“任务型调用”复用）。
 *
 * 说明：
 * - Chat/Structured Output/其它后台任务都需要：model + 基础采样参数 + modelParams；
 * - 额外能力（web-search / provider-native reasoning / inline image）也在这里统一收敛；
 * - 具体场景（例如 chat）可以在此基础上扩展更多字段（messages/tools/memory 等）。
 */
export interface ModelCallParamsBase {
  /** 完整模型标识："providerId/modelId" */
  model: string
  /** 采样温度（可选：由具体任务提供默认值） */
  temperature?: number
  /** Top-p 采样（可选） */
  topP?: number
  /** 最大输出 tokens（可选） */
  maxTokens?: number
  /** 模型参数（用于 providerOptions 透传与部分 call settings 映射） */
  modelParams?: Record<string, unknown>
  /** 是否启用图片生成（Gemini image 等内联生图模型） */
  enableGenerateImage?: boolean
  /** 是否启用联网搜索（支持 web search 的模型专用） */
  enableWebSearch?: boolean
}

/**
 * 聊天流式请求参数。
 *
 * 说明：
 * - 在 `ModelCallParamsBase` 基础上补齐消息列表、MCP、联网搜索与记忆相关字段；
 * - 是聊天 UI、后台 Service Worker 和调试链路共享的统一请求契约。
 */
export interface ChatStreamParams extends ModelCallParamsBase {
  /** 对话消息列表 */
  messages: ChatMessage[]
  /** 采样温度（chat 必填） */
  temperature: number
  /** Top-p 采样（chat 必填） */
  topP: number
  /** 最大输出 tokens（chat 必填） */
  maxTokens: number
  /** 是否开启调试透传（会产生 chat/debug 事件） */
  debug?: boolean
  /** 当前话题的 MCP 服务选择模型。 */
  mcpSelection?: McpServerSelection
  /**
   * 内部字段：MCP 自动路由在后台工具注入阶段留下的状态真源。
   *
   * 说明：
   * - 只用于同一次 `chat/stream-v1` 请求内的后台链路判定与 debug 透出；
   * - 不能持久化，也不能作为 UI 配置真源；
   * - auto 命中后如果这里显示需要 MCP，但最终没有工具进入请求，端口层必须阻断普通聊天。
   */
  mcpAutoRouterState?: {
    /** 自动路由是否已经执行。 */
    evaluated: boolean
    /** 自动路由是否判定本轮需要 MCP。 */
    needsMcp: boolean
    /** router 原始候选 serverIds，经 schema 和启用列表归一化后保留。 */
    serverIds: string[]
    /** 与当前启用服务取交集后，本轮实际准备列工具的 serverIds。 */
    selectedServerIds: string[]
    /** MCP 工具列表阶段最终生成的函数名。 */
    injectedToolNames: string[]
    /** 自动路由要求首步必须调用的工具名。 */
    forcedFirstToolName?: string
    /** router 输出的意图类型。 */
    intent?: string
    /** router 输出或归一化后的原因。 */
    reason?: string
  }
  /** 内部字段：自动路由命中后，要求模型首步必须调用的 MCP 工具名。 */
  forcedFirstToolName?: string
  /** 话题请求类型：主聊天固定为 topic；内部调用可不传。 */
  topicKind?: 'topic'
  /** 外部联网搜索 Provider ID（按当前实现 assistant.webSearchProviderId） */
  webSearchProviderId?: string
  /** 外部联网搜索全局设置（API 密钥、maxResults 等） */
  webSearchSettings?: WebSearchSettings

  /** 全局记忆（按当前实现：全局开关 + 助手开关 + 工具化检索 + 自动写入） */
  memory?: ChatMemoryParams
}
