/**
 * 说明：`ollama-adapter` AI 能力模块。
 *
 * 职责：
 * - 承载 `ollama-adapter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ollamaAdapter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Ollama Provider 适配器（openai-compatible）。
 *
 * 说明：
 * - 默认连接本地 `http://localhost:11434/v1`；
 * - 复用 openai-compatible 协议以统一 chat/embedding/image 调用；
 * - call settings 支持按 openai-like 规则声明。
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOpenAiCompatibleInlineImageMetadataExtractor } from '../openai-compatible/inline-images'
import { createStaticRuntimeCapabilities, type ProviderAdapter, type ProviderOptionsContext } from './adapter-types'
import {
  createOpenAiCompatibleRequestBodyTransformer,
  resolveCommonParams,
  resolveOpenAiBaseURL,
  shouldIncludeOpenAiCompatibleUsage,
} from './provider-utils-common'
import { openAiLikeCallSettingSupport } from './policies/call-settings'
import { buildProviderReasoningRuntimeOptions } from '../provider-reasoning'

/**
 * 导出常量：`ollamaAdapter`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const ollamaAdapter: ProviderAdapter = {
  type: 'ollama',
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
    const baseURL = resolveOpenAiBaseURL(apiHost) || 'http://localhost:11434/v1'
    const provider = createOpenAICompatible({
      name: config.id,
      apiKey: apiKey || 'ollama',
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
    const baseURL = resolveOpenAiBaseURL(apiHost) || 'http://localhost:11434/v1'
    const provider = createOpenAICompatible({ name: config.id, apiKey: apiKey || 'ollama', baseURL, headers, fetch: authFetch })
    return provider.embeddingModel(modelId)
  },

    /**
   * 内部方法：`createImageModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createImageModel(config, modelId) {
    const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(config)
    const baseURL = resolveOpenAiBaseURL(apiHost) || 'http://localhost:11434/v1'
    const provider = createOpenAICompatible({ name: config.id, apiKey: apiKey?.trim() ? apiKey : undefined, baseURL, headers, fetch: authFetch })
    return provider.imageModel(modelId)
  },

    /**
   * 内部方法：`getCallSettingSupport`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getCallSettingSupport(ctx) {
    return openAiLikeCallSettingSupport({ modelId: ctx.modelId })
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
}
