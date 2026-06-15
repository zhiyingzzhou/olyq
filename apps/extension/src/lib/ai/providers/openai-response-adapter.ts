/**
 * 说明：`openai-response-adapter` AI 能力模块。
 *
 * 职责：
 * - 承载 `openai-response-adapter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `openaiResponseAdapter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * OpenAI Responses API Provider 适配器。
 *
 * 说明：
 * - 使用 `\@ai-sdk/openai` 的 `responses()` 路径；
 * - providerOptionsKey 固定按官方 OpenAI 行为透传；
 * - 支持 reasoning 抽取与常见 call settings（与 openai-like 能力开关对齐）。
 */

import { createOpenAI } from '@ai-sdk/openai'
import { extractReasoningMiddleware } from 'ai'
import { createProviderRuntimeCapabilities, type ProviderAdapter, type ProviderOptionsContext, type MiddlewareContext } from './adapter-types'
import {
  resolveCommonParams,
  resolveOpenAiBaseURL,
  resolveOpenAiSystemMessageMode,
} from './provider-utils-common'
import {
  createOpenAiEmbeddingModel,
  createOpenAiImageModel,
  createOpenAiSpeechModel,
  createOpenAiTranscriptionModel,
  runOpenAiModeration,
} from './provider-utils-openai'
import { openAiLikeCallSettingSupport } from './policies/call-settings'
import { buildProviderReasoningRuntimeOptions } from '../provider-reasoning'
import { normalizeModelIdForRules, pickReasoningTagName } from '../stream-chat-utils'
import { buildNativeWebSearchToolArgs } from '../native-web-search-params'
import { buildOpenAiResponsesSystemPromptPolicy } from './openai-responses-request-shape'

/**
 * 导出常量：`openaiResponseAdapter`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const openaiResponseAdapter: ProviderAdapter = {
  type: 'openai-response',
    /**
   * 内部方法：`getRuntimeCapabilities`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getRuntimeCapabilities(config) {
    const providerId = String(config.id || '').trim().toLowerCase()
    return createProviderRuntimeCapabilities({
      'embedding-api': true,
      'image-api': true,
      'transcription-api': providerId === 'openai' || providerId === 'together',
      'speech-api': providerId === 'openai' || providerId === 'together',
      'moderation-api': providerId === 'openai',
    })
  },

    /**
   * 内部方法：`createLanguageModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createLanguageModel(config, modelId) {
    const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(config)
    const baseURL = resolveOpenAiBaseURL(apiHost)
    const provider = createOpenAI({ apiKey, baseURL, headers, name: config.id, fetch: authFetch })
    return provider.responses(modelId)
  },

    /**
   * 内部方法：`createEmbeddingModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createEmbeddingModel(config, modelId) {
    return createOpenAiEmbeddingModel(config, modelId)
  },

    /**
   * 内部方法：`createImageModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createImageModel(config, modelId) {
    return createOpenAiImageModel(config, modelId)
  },

    /**
   * 内部方法：`createTranscriptionModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createTranscriptionModel(config, modelId) {
    return createOpenAiTranscriptionModel(config, modelId)
  },

    /**
   * 内部方法：`createSpeechModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createSpeechModel(config, modelId) {
    return createOpenAiSpeechModel(config, modelId)
  },

    /**
   * 内部方法：`moderate`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  async moderate(config, modelId, input, signal) {
    return await runOpenAiModeration(config, modelId, input, signal)
  },

    /**
   * 内部方法：`getCallSettingSupport`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getCallSettingSupport(ctx) {
    return openAiLikeCallSettingSupport({
      modelId: ctx.modelId,
      transportProtocol: ctx.transportProtocol,
      reasoning: ctx.reasoning,
      disableOpenAiResponsesUnsupportedSettings: true,
    })
  },

    /**
   * 内部方法：`pickChatExecutionMode`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  pickChatExecutionMode() {
    return 'streamText'
  },

    /**
   * 内部方法：`buildProviderOptions`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  buildProviderOptions(ctx: ProviderOptionsContext): Record<string, unknown> | undefined {
    // 说明：openai-response 的 providerOptionsKey 固定为 'openai'，行为与官方 OpenAI 一致
    const key = ctx.providerOptionsKey
    if (!key) return undefined

    const opts: Record<string, unknown> = {}

    opts.systemMessageMode = resolveOpenAiSystemMessageMode(ctx.config)
    opts.store =
      typeof ctx.params.openAiResponsesStoreValue === 'boolean'
        ? ctx.params.openAiResponsesStoreValue
        : Boolean(ctx.params.hasInjectedMcpTools)

    // 1) 内联生图（Inline image）
    if (ctx.params.enableGenerateImage) {
      opts.modalities = ['text', 'image']
    }

    // 2) Service tier（官方 OpenAI 原生字段为 camelCase）
    const serviceTier = ctx.config.serviceTier
    const isSupportServiceTier = ctx.config.apiOptions?.isSupportServiceTier !== false
    if (serviceTier && isSupportServiceTier) {
      if (serviceTier === 'auto' || serviceTier === 'default' || serviceTier === 'flex' || serviceTier === 'priority') {
        opts.serviceTier = serviceTier
      }
    }

    // 3) Verbosity（文本冗长度）
    const verbosity = ctx.config.verbosity
    if (verbosity && ctx.config.apiOptions?.isNotSupportVerbosity !== true) {
      opts.textVerbosity = verbosity
    }

    // 4) Provider-aware reasoning
    const reasoningRuntime = buildProviderReasoningRuntimeOptions({
      model: `${ctx.providerId}/${ctx.modelId}`,
      transportProtocol: ctx.transportProtocol,
      modelParams: ctx.params.modelParams,
    })
    if (reasoningRuntime.providerOptions) {
      Object.assign(opts, reasoningRuntime.providerOptions)
    }

    if (Object.keys(opts).length === 0) return undefined
    return { [key]: opts }
  },

  /**
   * 内部方法：`buildRequestShapePolicy`。
   *
   * @remarks
   * 官方 OpenAI Responses SDK 支持顶层 `instructions`；system prompt 在这里声明为
   * adapter-owned 请求形态，而不是由通用 runtime 根据 provider 名称自行猜测。
   */
  buildRequestShapePolicy(ctx) {
    return buildOpenAiResponsesSystemPromptPolicy({
      transportProtocol: ctx.transportProtocol,
      providerOptionNamespaces: ctx.providerOptionNamespaces,
      modelProviderSlug: 'openai',
    })
  },

  /**
   * 内部方法：`createNativeWebSearchTools`。
   *
   * @remarks
   * 通过 OpenAI Responses 官方 provider-hosted `web_search` tool 创建模型内置联网搜索工具。
   */
  createNativeWebSearchTools(ctx) {
    const toolName = ctx.capability.toolName
    if (!toolName) return undefined
    const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(ctx.config)
    const baseURL = resolveOpenAiBaseURL(apiHost)
    const provider = createOpenAI({ apiKey, baseURL, headers, name: ctx.config.id, fetch: authFetch })
    const toolArgs = buildNativeWebSearchToolArgs(ctx.capability, ctx.params.modelParams) as Parameters<typeof provider.tools.webSearch>[0]
    return {
      [toolName]: provider.tools.webSearch(toolArgs),
    }
  },

    /**
   * 内部方法：`getMiddlewares`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getMiddlewares(ctx: MiddlewareContext) {
    // 说明：openai-response 类型始终使用 extractReasoningMiddleware
    if (ctx.effectiveProviderType === 'openai-response') {
      return [extractReasoningMiddleware({ tagName: pickReasoningTagName(normalizeModelIdForRules(ctx.modelId)) })]
    }
    return []
  },
}
