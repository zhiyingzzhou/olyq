/**
 * 说明：`siliconflow-adapter` AI 能力模块。
 *
 * 职责：
 * - 承载 `siliconflow-adapter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `siliconflowAdapter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * SiliconFlow（硅基流动）Provider Adapter
 *
 * 目标
 * - 彻底切换：SiliconFlow 作为独立 ProviderType（不再混在 openai-compatible 的“猜平台”分支里）
 * - 对话/Embedding 继续复用 AI SDK 的 OpenAI Compatible
 * - 图片生成/编辑使用专用 SiliconFlowImageModel（强制走 /images/generations JSON）
 *
 * 背景
 * - SiliconFlow 图片接口虽然“长得像 OpenAI”，但编辑/图生图并不走 /images/edits（multipart）
 * - 若直接使用 `\@ai-sdk/openai-compatible` 的 ImageModel，在检测到 files 时会自动切换到 /images/edits，导致 404
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModelMiddleware } from 'ai'
import { extractReasoningMiddleware } from 'ai'
import { createOpenAiCompatibleInlineImageMetadataExtractor } from '../openai-compatible/inline-images'
import { SiliconFlowImageModel } from '../siliconflow-image'
import { PLATFORM_DEFAULTS } from './platform-capabilities'
import { openAiLikeCallSettingSupport } from './policies/call-settings'
import {
  createAppendSuffixToUserMessagesMiddleware,
  normalizeModelIdForRules,
  pickReasoningTagName,
  shouldAppendQwenThinkingSuffix,
} from '../stream-chat-utils'
import { buildProviderReasoningRuntimeOptions } from '../provider-reasoning'
import {
  createStaticRuntimeCapabilities,
  type ProviderAdapter,
  type MiddlewareContext,
  type ProviderOptionsContext,
} from './adapter-types'
import {
  createOpenAiCompatibleRequestBodyTransformer,
  resolveCommonParams,
  resolveOpenAiBaseURL,
  shouldIncludeOpenAiCompatibleUsage,
} from './provider-utils-common'

/**
 * 导出常量：`siliconflowAdapter`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const siliconflowAdapter: ProviderAdapter = {
  type: 'siliconflow',
  getRuntimeCapabilities: createStaticRuntimeCapabilities({
    'embedding-api': true,
    'image-api': true,
  }),

    /**
   * 内部方法：`createLanguageModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createLanguageModel(config, modelId) {
    const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(config)
    const baseURL = resolveOpenAiBaseURL(apiHost) || PLATFORM_DEFAULTS.siliconflow.baseURL
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
    const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(config)
    const baseURL = resolveOpenAiBaseURL(apiHost) || PLATFORM_DEFAULTS.siliconflow.baseURL
    const provider = createOpenAICompatible({ name: config.id, apiKey, baseURL, headers, fetch: authFetch })
    return provider.embeddingModel(modelId)
  },

    /**
   * 内部方法：`createImageModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createImageModel(config, modelId) {
    const { apiHost, headers, authHeaders } = resolveCommonParams(config)
    const baseURL = resolveOpenAiBaseURL(apiHost) || PLATFORM_DEFAULTS.siliconflow.baseURL
    return new SiliconFlowImageModel(modelId, authHeaders, baseURL, headers, config.id)
  },

    /**
   * 内部方法：`getCallSettingSupport`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getCallSettingSupport(ctx) {
    return openAiLikeCallSettingSupport({ modelId: ctx.modelId, qwenMtNoTempTopP: true })
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
    const key = ctx.providerOptionsKey
    if (!key) return undefined

    const opts: Record<string, unknown> = {}
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
   * 内部方法：`getMiddlewares`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getMiddlewares(ctx: MiddlewareContext): LanguageModelMiddleware[] {
    const middlewares: LanguageModelMiddleware[] = []

    // SiliconFlow 也托管 Qwen 系列模型：当 Provider 不支持 enable_thinking 时，用 suffix 控制思考开关。
    const modelIdLower = normalizeModelIdForRules(ctx.modelId)
    if (ctx.config.apiOptions?.isNotSupportEnableThinking === true && shouldAppendQwenThinkingSuffix(modelIdLower)) {
      const enableThinking = buildProviderReasoningRuntimeOptions({
        model: `${ctx.providerId}/${ctx.modelId}`,
        transportProtocol: ctx.transportProtocol,
        modelParams: ctx.params.modelParams,
      }).suffixThinkingEnabled
      middlewares.push(
        createAppendSuffixToUserMessagesMiddleware({ suffix: enableThinking ? ' /think' : ' /no_think' }),
      )
    }

    // 抽取 <think>/<thought>/<reasoning> 标签为 reasoning delta（便于 UI 独立展示推理内容）
    middlewares.push(extractReasoningMiddleware({ tagName: pickReasoningTagName(modelIdLower) }))

    return middlewares
  },
}
