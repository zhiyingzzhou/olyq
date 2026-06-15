/**
 * 说明：`azure-openai-adapter` AI 能力模块。
 *
 * 职责：
 * - 承载 `azure-openai-adapter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `azureOpenaiAdapter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Azure OpenAI Provider 适配器（openai-compatible）。
 *
 * 说明：
 * - Azure OpenAI 使用 resource endpoint + `api-version` 查询参数；
 * - 鉴权通过 `api-key` header（而不是 Bearer token）；
 * - 参数透传遵循 openai-compatible 的 snake_case 约定；
 * - 需要时注入 reasoning 抽取 middleware（将 \<think\>/\<reasoning\> 标签映射到 reasoning delta）。
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { extractReasoningMiddleware } from 'ai'
import { createOpenAiCompatibleInlineImageMetadataExtractor } from '../openai-compatible/inline-images'
import { createStaticRuntimeCapabilities, type ProviderAdapter, type ProviderOptionsContext, type MiddlewareContext } from './adapter-types'
import {
  createOpenAiCompatibleRequestBodyTransformer,
  resolveCommonParams,
  shouldIncludeOpenAiCompatibleUsage,
  trimSlash,
} from './provider-utils-common'
import { openAiLikeCallSettingSupport } from './policies/call-settings'
import { buildProviderReasoningRuntimeOptions } from '../provider-reasoning'
import { normalizeModelIdForRules, pickReasoningTagName } from '../stream-chat-utils'
import { I18nError } from '@/lib/i18n/error'
import type { ProviderConfig } from '../types'

/**
 * 内部函数：`resolveAzureQueryParams`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function resolveAzureQueryParams(config: ProviderConfig): Record<string, string> | undefined {
  if (config.apiOptions?.isNotSupportAPIVersion === true) return undefined

  const apiVersion = String(config.apiVersion || '').trim()
  if (!apiVersion) throw new I18nError('errors.azureOpenAiApiVersionRequired')
  return { 'api-version': apiVersion }
}

/**
 * 导出常量：`azureOpenaiAdapter`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const azureOpenaiAdapter: ProviderAdapter = {
  type: 'azure-openai',
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
    const { apiHost, headers, authHeaders, authFetch } = resolveCommonParams(config)
    const baseURL = trimSlash(apiHost)
    if (!baseURL) throw new I18nError('errors.azureOpenAiApiHostRequired')

    const provider = createOpenAICompatible({
      name: config.id,
      apiKey: undefined,
      baseURL,
      queryParams: resolveAzureQueryParams(config),
      headers: { ...headers, ...authHeaders },
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
    const { apiHost, headers, authHeaders, authFetch } = resolveCommonParams(config)
    const baseURL = trimSlash(apiHost)
    const provider = createOpenAICompatible({
      name: config.id,
      apiKey: undefined,
      baseURL,
      queryParams: resolveAzureQueryParams(config),
      headers: { ...headers, ...authHeaders },
      fetch: authFetch,
    })
    return provider.embeddingModel(modelId)
  },

    /**
   * 内部方法：`createImageModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createImageModel(config, modelId) {
    const { apiHost, headers, authHeaders, authFetch } = resolveCommonParams(config)
    const baseURL = trimSlash(apiHost)
    const provider = createOpenAICompatible({
      name: config.id,
      apiKey: undefined,
      baseURL,
      queryParams: resolveAzureQueryParams(config),
      headers: { ...headers, ...authHeaders },
      fetch: authFetch,
    })
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
    // 对于 Azure OpenAI：走 openai-compatible 的参数透传模式（snake_case）
    const { providerOptionsKey: key, openaiCompatibleProviderKey, config } = ctx
    if (!key) return undefined

    const opts: Record<string, unknown> = {}

    // 1) 内联生图（openai-compatible）
    if (ctx.params.enableGenerateImage) {
      opts.modalities = ['image', 'text']
    }

    // 2) Service tier（openai-compatible 使用 snake_case）
    const serviceTier = config.serviceTier
    const isSupportServiceTier = config.apiOptions?.isSupportServiceTier !== false
    if (serviceTier && isSupportServiceTier && openaiCompatibleProviderKey) {
      opts.service_tier = serviceTier
    }

    // 3) Verbosity（文本冗长度）
    const verbosity = config.verbosity
    if (verbosity && config.apiOptions?.isNotSupportVerbosity !== true) {
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
   * 内部方法：`getMiddlewares`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getMiddlewares(ctx: MiddlewareContext) {
    // 对于 Azure OpenAI：extractReasoningMiddleware
    if (ctx.effectiveProviderType === 'azure-openai') {
      return [extractReasoningMiddleware({ tagName: pickReasoningTagName(normalizeModelIdForRules(ctx.modelId)) })]
    }
    return []
  },
}
