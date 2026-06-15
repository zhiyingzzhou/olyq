/**
 * 说明：`adapter-types` AI 能力模块。
 *
 * 职责：
 * - 承载 `adapter-types` 相关的当前文件实现与模块边界；
 * - 对外暴露 `CallSettingSupport`、`CallSettingSupportContext`、`ChatExecutionMode` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type {
  LanguageModelV3,
  RerankingModelV3,
  SpeechModelV3,
  TranscriptionModelV3,
} from '@ai-sdk/provider'
import type { EmbeddingModel, ImageModel, LanguageModelMiddleware, ToolSet } from 'ai'
import type { ProviderConfig, TransportProtocol } from '../types'
import type { ProviderReasoningDescriptor } from '../provider-reasoning'
import type { ProviderContract } from './provider-contracts'
import type { SupportedRequestParameters } from '../model-request-parameters'
import type { NativeWebSearchCapability } from '../native-web-search-capability'

/**
 * 通用 call settings 支持矩阵（UI + 运行时共用）。
 *
 * 约束：
 * - 该结构只描述“是否支持”，不负责把用户输入映射成实际参数；
 * - 具体支持情况由各 ProviderAdapter 决定（避免编排层出现 modelId 的 if/else）。
 */
export type CallSettingSupport = {
  /** 是否支持 temperature。 */
  temperature: boolean
  /** 是否支持 topP。 */
  topP: boolean
  /** 是否支持 maxTokens。 */
  maxTokens: boolean
  /** 是否支持 topK。 */
  topK: boolean
  /** 是否支持 presencePenalty。 */
  presencePenalty: boolean
  /** 是否支持 frequencyPenalty。 */
  frequencyPenalty: boolean
  /** 是否支持 seed。 */
  seed: boolean
  /** 是否支持 stop。 */
  stop: boolean
}

/**
 * 传递给 ProviderAdapter.getCallSettingSupport() 的上下文。
 *
 * 说明：
 * - 与 ProviderOptionsContext/MiddlewareContext 类似：把 adapter 需要的信息一次性带齐；
 * - 避免 adapter 反向 import 编排层模块，形成隐式耦合。
 */
export interface CallSettingSupportContext {
  /** providerId（例如 "openai" / "siliconflow"） */
  providerId: string
  /** Provider 配置（含 apiOptions 等能力开关） */
  config: ProviderConfig
  /** 原始 modelId（不含 provider 前缀） */
  modelId: string
  /** 生效的 ProviderType（NewAPI 会“降级”为真实端点类型） */
  effectiveProviderType: string
  /** 当前模型的 transport protocol。 */
  transportProtocol?: TransportProtocol
  /** 当前轮的 provider-aware 推理描述。 */
  reasoning?: ProviderReasoningDescriptor
  /** 当前模型显式声明支持的 provider 原生请求参数。 */
  supportedParameters?: SupportedRequestParameters
}

/**
 * Chat 执行模式：
 * - streamText：流式增量（SSE/stream）
 * - generateText：非流式一次性返回（适用于部分网关/平台的兼容性降级）
 */
export type ChatExecutionMode = 'streamText' | 'generateText'

/**
 * 传递给 ProviderAdapter.pickChatExecutionMode() 的上下文。
 */
export interface ChatExecutionModeContext {
  /** Provider 内部 ID。 */
  providerId: string
  /** Provider 完整配置。 */
  config: ProviderConfig
  /** 去掉 provider 前缀后的原始 modelId。 */
  modelId: string
  /** 最终生效的 ProviderType。 */
  effectiveProviderType: string
  /** 本轮是否启用“对话内联生图”（image-inline） */
  wantsInlineImage: boolean
}

/**
 * 传递给 ProviderAdapter.buildProviderOptions() 的上下文。
 *
 * 说明：
 * - 包含 adapter 构建 providerOptions 所需的全部信息；
 * - adapter 不应“回头”去读取中心编排函数的局部变量，避免隐式耦合与难以测试。
 */
export interface ProviderOptionsContext {
  /** Provider 内部 ID。 */
  providerId: string
  /** 原始 modelId（不含 provider 前缀）。 */
  modelId: string
  /** 当前实际生效的 ProviderType。 */
  effectiveProviderType: string
  /** 当前 provider/model 对应的契约。 */
  contract: ProviderContract
  /** 当前模型的 transport protocol。 */
  transportProtocol?: TransportProtocol
  /** providerOptions 中使用的主键名。 */
  providerOptionsKey: string | null
  /** OpenAI 兼容 providerOptions 使用的辅助键名。 */
  openaiCompatibleProviderKey: string | null
  /** Provider 完整配置。 */
  config: ProviderConfig
  /** 本轮构建 providerOptions 时需要消费的高层参数集合。 */
  params: {
    /** 是否启用图片生成。 */
    enableGenerateImage?: boolean
    /** 是否启用联网搜索。 */
    enableWebSearch?: boolean
    /** 当前最终注入的工具集合里是否包含 MCP 工具（`mcp__*`）。 */
    hasInjectedMcpTools?: boolean
    /** OpenAI Responses 自动 `store` 的最终稳定值。 */
    openAiResponsesStoreValue?: boolean
    /** 模型附加参数。 */
    modelParams?: Record<string, unknown>
    /** provider-aware 推理描述。 */
    reasoning?: ProviderReasoningDescriptor
  }
}

/**
 * Provider request shape 策略上下文。
 *
 * 说明：
 * - 该上下文只允许 adapter 根据 provider / transport / SDK 命名空间声明“请求体如何摆放”；
 * - 不携带消息内容，避免 adapter 参与 prompt 构造，也避免运行时再按模型名猜测平台能力。
 */
export interface RequestShapePolicyContext {
  /** Provider 内部 ID。 */
  providerId: string
  /** 原始 modelId（不含 provider 前缀）。 */
  modelId: string
  /** 当前实际生效的 ProviderType。 */
  effectiveProviderType: string
  /** 当前 provider/model 对应的契约。 */
  contract: ProviderContract
  /** 当前模型的 transport protocol。 */
  transportProtocol?: TransportProtocol
  /** providerOptions 中使用的主键名。 */
  providerOptionsKey: string | null
  /** 本轮 SDK/provider 已确认可消费的 providerOptions 命名空间。 */
  providerOptionNamespaces: ReadonlyArray<string>
  /** OpenAI 兼容 providerOptions 使用的辅助键名。 */
  openaiCompatibleProviderKey: string | null
  /** 显式证据解析出的上游模型提供方；为空表示不能安全判定。 */
  modelProviderSlug: string | null
  /** Provider 完整配置。 */
  config: ProviderConfig
}

/** system prompt 在 AI SDK 调用参数里的摆放策略。 */
export interface RuntimeSystemPromptShapePolicy {
  /** 当前只支持把 system message 提升到 providerOptions 命名空间里的 instructions 字段。 */
  readonly target: 'provider-options-instructions'
  /** 要写入的 providerOptions 命名空间，例如官方 OpenAI Responses 的 `openai`。 */
  readonly providerOptionsKey: string
  /** instructions 字段名；默认 `instructions`，保留显式字段便于后续非 OpenAI provider 承接。 */
  readonly instructionsKey: string
  /** 提升后是否要求 SDK 移除原 system message；当前 Responses 场景固定为 `remove`。 */
  readonly systemMessageMode: 'remove'
}

/**
 * 运行时请求体形态策略。
 *
 * 说明：
 * - 这是 adapter 输出给通用 runtime 的稳定契约；
 * - runtime 只按这里声明的策略改写 messages/providerOptions，不再解析 provider/model/transport。
 */
export interface ProviderRequestShapePolicy {
  /** system prompt 的出站摆放策略；为空表示保持 AI SDK 默认 message 形态。 */
  readonly systemPrompt?: RuntimeSystemPromptShapePolicy
}

/**
 * 传递给 ProviderAdapter.getMiddlewares() 的上下文。
 */
export interface MiddlewareContext {
  /** Provider 内部 ID。 */
  providerId: string
  /** Provider 完整配置。 */
  config: ProviderConfig
  /** 去掉 provider 前缀后的原始 modelId。 */
  modelId: string
  /** 当前实际生效的 ProviderType。 */
  effectiveProviderType: string
  /** 当前模型的 transport protocol。 */
  transportProtocol?: TransportProtocol
  /** providerOptions 中使用的主键名。 */
  providerOptionsKey: string | null
  /** 可选：本轮可用工具集合。 */
  tools?: Record<string, unknown>
  /** 本轮构建中间件时需要读取的动态参数集合。 */
  params: {
    /** 模型附加参数。 */
    modelParams?: Record<string, unknown>
    /** provider-aware 推理描述。 */
    reasoning?: ProviderReasoningDescriptor
  }
}

/** providerOptions 运行时 patch。 */
export type ProviderOptionsPatch = Record<string, Record<string, unknown>>

/**
 * Provider 创建模型内置联网搜索工具时需要的最小上下文。
 *
 * 说明：
 * - 能力判定已由 `native-web-search` 注册表完成；
 * - adapter 这里只负责使用本 provider 官方 SDK 创建 provider-hosted tool；
 * - 不允许在这里再按模型名猜测能力。
 */
export interface NativeWebSearchToolContext {
  /** Provider 内部 ID。 */
  readonly providerId: string
  /** 原始 modelId（不含 provider 前缀）。 */
  readonly modelId: string
  /** Provider 完整配置。 */
  readonly config: ProviderConfig
  /** 当前模型的传输协议。 */
  readonly transportProtocol?: TransportProtocol
  /** 已解析的 native web search 能力结论。 */
  readonly capability: NativeWebSearchCapability
  /** 当前请求参数中与 provider 工具创建相关的动态值。 */
  readonly params: {
    /** 模型附加参数。 */
    readonly modelParams?: Record<string, unknown>
  }
}

/**
 * 运行时能力协议键。
 *
 * 说明：
 * - 这里只关心“是否已经接入稳定 runtime”的非聊天专用协议；
 * - 聊天主链仍由 language model 创建能力与 transportProtocol 自身控制，不在这里重复表达。
 */
export type RuntimeCapabilityProtocol = Extract<
  TransportProtocol,
  'embedding-api'
  | 'image-api'
  | 'video-api'
  | 'rerank-api'
  | 'transcription-api'
  | 'speech-api'
  | 'moderation-api'
>

/**
 * Provider 运行时能力声明。
 *
 * 说明：
 * - 统一给 UI、模型管理、工作台页面做可用性判定；
 * - 返回的是“当前 adapter + 当前 provider 配置”下，扩展端是否已有稳定 runtime 落点。
 */
export type ProviderRuntimeCapabilities = Readonly<Record<RuntimeCapabilityProtocol, boolean>>

/** 默认的空运行时能力声明。 */
export const EMPTY_PROVIDER_RUNTIME_CAPABILITIES: ProviderRuntimeCapabilities = Object.freeze({
  'embedding-api': false,
  'image-api': false,
  'video-api': false,
  'rerank-api': false,
  'transcription-api': false,
  'speech-api': false,
  'moderation-api': false,
})

/** 导出类型：`ProviderModerationResult`。 */
export interface ProviderModerationResult {
  readonly blocked: boolean
  readonly categories?: ReadonlyArray<string>
  readonly reason?: string
  readonly raw?: unknown
}

/** 创建标准化的运行时能力声明对象。 */
export function createProviderRuntimeCapabilities(
  partial?: Partial<ProviderRuntimeCapabilities>,
): ProviderRuntimeCapabilities {
  return {
    ...EMPTY_PROVIDER_RUNTIME_CAPABILITIES,
    ...(partial ?? {}),
  }
}

/**
 * Provider 适配器统一接口。
 *
 * 说明：
 * - 每个 Provider 通过该接口向编排层暴露模型创建、参数支持矩阵、执行模式和中间件；
 * - 编排层只依赖这个抽象，不直接写 Provider-specific 的分支逻辑。
 */
export interface ProviderAdapter {
  /** 当前适配器负责的 ProviderType。 */
  readonly type: string
  /** 声明当前 Provider 在扩展端已接入的稳定 runtime 能力。 */
  getRuntimeCapabilities(config: ProviderConfig): ProviderRuntimeCapabilities
  /** 创建聊天/文本模型实例。 */
  createLanguageModel(config: ProviderConfig, modelId: string): LanguageModelV3
  /** 可选：创建 embedding 模型实例。 */
  createEmbeddingModel?(config: ProviderConfig, modelId: string): EmbeddingModel
  /** 可选：创建图片模型实例。 */
  createImageModel?(config: ProviderConfig, modelId: string): ImageModel
  /** 可选：创建 rerank 模型实例。 */
  createRerankModel?(config: ProviderConfig, modelId: string): RerankingModelV3
  /** 可选：创建转写模型实例。 */
  createTranscriptionModel?(config: ProviderConfig, modelId: string): TranscriptionModelV3
  /** 可选：创建语音合成模型实例。 */
  createSpeechModel?(config: ProviderConfig, modelId: string): SpeechModelV3
  /** 可选：直接执行一次内容审核。 */
  moderate?(config: ProviderConfig, modelId: string, input: string, signal?: AbortSignal): Promise<ProviderModerationResult>

  /**
   * 返回该 Provider + model 下的 call settings 支持矩阵。
   *
   * 设计目标：
   * - 让 UI（参数面板）与运行时（stream-chat）共享同一套“是否可用”的判断；
   * - 把所有 modelId 相关 if/else 收敛到 adapter/policy，编排层保持纯粹。
   */
  getCallSettingSupport(ctx: CallSettingSupportContext): CallSettingSupport

  /**
   * 选择本轮 Chat 的执行模式（流式/非流式）。
   *
   * 说明：
   * - 这是“平台兼容性”层面的策略（例如 Gemini inline image 在不少网关上流式不稳定）；
   * - 编排层不再写 providerType 的 if/else，只做“调用 adapter 决策 + 执行”。
   */
  pickChatExecutionMode(ctx: ChatExecutionModeContext): ChatExecutionMode

  /** 构建 provider-specific 的 providerOptions；返回 undefined 表示使用默认值。 */
  buildProviderOptions?(ctx: ProviderOptionsContext): Record<string, unknown> | undefined

  /**
   * 构建本 provider/transport 的请求体形态策略。
   *
   * 说明：
   * - 只声明 SDK/平台已经确认支持的请求形态，例如 OpenAI Responses 的顶层 `instructions`；
   * - 返回 undefined 表示让 AI SDK 按普通 messages/providerOptions 处理。
   */
  buildRequestShapePolicy?(ctx: RequestShapePolicyContext): ProviderRequestShapePolicy | undefined

  /** 返回 provider-specific 的中间件；无中间件时返回空数组。 */
  getMiddlewares?(ctx: MiddlewareContext): LanguageModelMiddleware[]
  /**
   * 创建 provider-hosted 的模型内置联网搜索工具。
   *
   * 说明：
   * - 仅用于官方 SDK 已提供 provider-defined tool factory 的平台；
   * - OpenRouter 这类 raw server tool 不走这里，而由 request transformer 注入请求体；
   * - 返回的工具名必须稳定，避免与外部搜索 `builtin__web_search` 混用同一 trace 真源。
   */
  createNativeWebSearchTools?(ctx: NativeWebSearchToolContext): ToolSet | undefined
}

/** 为“静态能力矩阵”的 adapter 生成统一能力声明函数。 */
export function createStaticRuntimeCapabilities(
  partial?: Partial<ProviderRuntimeCapabilities>,
): ProviderAdapter['getRuntimeCapabilities'] {
  const capabilities = createProviderRuntimeCapabilities(partial)
  return () => capabilities
}
