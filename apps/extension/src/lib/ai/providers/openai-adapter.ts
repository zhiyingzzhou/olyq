/**
 * 说明：`openai-adapter` AI 能力模块。
 *
 * 职责：
 * - 承载 `openai-adapter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `openaiAdapter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * OpenAI / OpenAI-Compatible Provider 适配器。
 *
 * 说明：
 * - 对于官方 OpenAI：使用 `\@ai-sdk/openai`；
 * - 对于兼容 OpenAI 协议的网关/代理：使用 `\@ai-sdk/openai-compatible`；
 * - 负责构建 providerOptions（modalities、serviceTier、verbosity、reasoningEffort 等）
 *   以及 middlewares（reasoning 抽取/脱敏、suffix 控制等）。
 *
 * 备注：该适配器仅做协议与参数映射，不负责 Provider 配置的存储/加载。
 */

import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { extractReasoningMiddleware, type LanguageModelMiddleware } from 'ai'
import { createOpenAiCompatibleInlineImageMetadataExtractor } from '../openai-compatible/inline-images'
import { createProviderRuntimeCapabilities, type ProviderAdapter, type ProviderOptionsContext, type MiddlewareContext } from './adapter-types'
import {
  createOpenAiCompatibleRequestBodyTransformer,
  isOfficialOpenAIProvider,
  resolveCommonParams,
  resolveModelTransportProtocol,
  resolveOpenAiBaseURL,
  resolveOpenAiSystemMessageMode,
  shouldIncludeOpenAiCompatibleUsage,
} from './provider-utils-common'
import {
  createOpenAiEmbeddingModel,
  createOpenAiImageModel,
  createOpenAiSpeechModel,
  createOpenAiTranscriptionModel,
  runOpenAiModeration,
} from './provider-utils-openai'
import { openAiLikeCallSettingSupport } from './policies/call-settings'
import {
  createAppendSuffixToUserMessagesMiddleware,
  createOpenrouterReasoningRedactionMiddleware,
  normalizeModelIdForRules,
  pickReasoningTagName,
  shouldAppendQwenThinkingSuffix,
} from '../stream-chat-utils'
import { buildProviderReasoningRuntimeOptions } from '../provider-reasoning'

/**
 * 导出常量：`openaiAdapter`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const openaiAdapter: ProviderAdapter = {
  type: 'openai',
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

    if (isOfficialOpenAIProvider(config.id)) {
      const baseURL = resolveOpenAiBaseURL(apiHost)
      const provider = createOpenAI({ apiKey, baseURL, headers, name: config.id, fetch: authFetch })
      if (resolveModelTransportProtocol(config, modelId) === 'openai-responses') {
        return provider.responses(modelId)
      }
      return provider.chat(modelId)
    }

    const baseURL = resolveOpenAiBaseURL(apiHost) || 'https://api.openai.com/v1'
    const provider = createOpenAICompatible({
      name: config.id,
      apiKey,
      baseURL,
      headers,
      fetch: authFetch,
      includeUsage: shouldIncludeOpenAiCompatibleUsage(config),
      transformRequestBody: createOpenAiCompatibleRequestBodyTransformer(config),
      metadataExtractor: createOpenAiCompatibleInlineImageMetadataExtractor(config.id),
    })
    return provider(modelId)
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
      officialOpenAiChatReasoningRules: isOfficialOpenAIProvider(ctx.config.id),
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
    const { providerOptionsKey: key, openaiCompatibleProviderKey, providerId, config } = ctx
    if (!key) return undefined

    const isOfficialOpenAI = key === 'openai'
    const opts: Record<string, unknown> = {}

    if (isOfficialOpenAI) {
      opts.systemMessageMode = resolveOpenAiSystemMessageMode(config)
    }

    // 1) 内联生图（Inline image）
    if (ctx.params.enableGenerateImage) {
      if (isOfficialOpenAI) {
        opts.modalities = ['text', 'image']
      } else if (key) {
        opts.modalities = ['image', 'text']
      }
    }

    // 2) Service tier（服务等级/计费层）
    const serviceTier = config.serviceTier
    const isSupportServiceTier = config.apiOptions?.isSupportServiceTier !== false
    if (serviceTier && isSupportServiceTier) {
      if (isOfficialOpenAI) {
        if (serviceTier === 'auto' || serviceTier === 'default' || serviceTier === 'flex' || serviceTier === 'priority') {
          opts.serviceTier = serviceTier
        }
      } else if (openaiCompatibleProviderKey) {
        opts.service_tier = serviceTier
      }
    }

    // 3) Verbosity（文本冗长度）
    const verbosity = config.verbosity
    if (verbosity && config.apiOptions?.isNotSupportVerbosity !== true) {
      opts.textVerbosity = verbosity
    }

    // 4) Provider-aware reasoning
    const reasoningRuntime = buildProviderReasoningRuntimeOptions({
      model: `${providerId}/${ctx.modelId}`,
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
   * 内部方法：`getMiddlewares`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getMiddlewares(ctx: MiddlewareContext) {
    const middlewares: LanguageModelMiddleware[] = []

    // 对于 OpenRouter：移除 reasoning 的 [REDACTED] 占位（避免 UI 显示无意义内容）
    if (ctx.providerId === 'openrouter') {
      middlewares.push(createOpenrouterReasoningRedactionMiddleware())
    }

    const toolEnabled = Boolean(ctx.tools && Object.keys(ctx.tools).length > 0)

    // 对于 OVMS：有工具时自动 no_think（减少无意义推理输出）
    if (ctx.providerId === 'ovms' && toolEnabled) {
      middlewares.push(createAppendSuffixToUserMessagesMiddleware({ suffix: ' /no_think' }))
    }

    // 对于 Qwen：当 Provider 不支持 enable_thinking 时，用 suffix 控制思考开关
    const modelIdLower = normalizeModelIdForRules(ctx.modelId)
    if (
      ctx.config.type !== 'ollama' &&
      ctx.config.apiOptions?.isNotSupportEnableThinking === true &&
      shouldAppendQwenThinkingSuffix(modelIdLower)
    ) {
      const enableThinking = buildProviderReasoningRuntimeOptions({
        model: `${ctx.providerId}/${ctx.modelId}`,
        transportProtocol: ctx.transportProtocol,
        modelParams: ctx.params.modelParams,
      }).suffixThinkingEnabled
      middlewares.push(createAppendSuffixToUserMessagesMiddleware({ suffix: enableThinking ? ' /think' : ' /no_think' }))
    }

    // 对于 OpenAI：抽取 <think>/<thought>/<reasoning> 标签为 reasoning delta
    if (ctx.effectiveProviderType === 'openai') {
      middlewares.push(extractReasoningMiddleware({ tagName: pickReasoningTagName(modelIdLower) }))
    }

    return middlewares
  },
}
