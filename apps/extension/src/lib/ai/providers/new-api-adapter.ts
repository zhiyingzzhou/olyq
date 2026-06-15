/**
 * 说明：`new-api-adapter` AI 能力模块。
 *
 * 职责：
 * - 承载 `new-api-adapter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `newApiAdapter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * New API 聚合端点适配器。
 *
 * 说明：
 * - 这是一个“多协议网关”适配器：会根据配置/模型选择 OpenAI Chat Completions、
 *   OpenAI Responses、Anthropic 或 Gemini 的不同端点；
 * - embedding 与 image-generation 走 OpenAI/OpenAI-compatible 路径；
 * - call settings 支持会随 transportProtocol 切换（用于能力开关与参数映射）。
 */

import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAiCompatibleInlineImageMetadataExtractor } from '../openai-compatible/inline-images'
import { createStaticRuntimeCapabilities, type ProviderAdapter } from './adapter-types'
import {
  resolveCommonParams,
  resolveGeminiBaseURL,
  resolveNewApiTransportProtocol,
  resolveOpenAiBaseURL,
  trimSlash,
} from './provider-utils-common'
import { createOpenAiImageModel } from './provider-utils-openai'
import { I18nError } from '@/lib/i18n/error'
import { anthropicLikeCallSettingSupport, geminiLikeCallSettingSupport, openAiLikeCallSettingSupport } from './policies/call-settings'
import { buildOpenAiResponsesSystemPromptPolicy } from './openai-responses-request-shape'

/**
 * 导出常量：`newApiAdapter`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const newApiAdapter: ProviderAdapter = {
  type: 'new-api',
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
    const transportProtocol = resolveNewApiTransportProtocol(config, modelId)

    // 默认端点：OpenAI Chat Completions（含 image-generation）
    if (
      !transportProtocol ||
      transportProtocol === 'openai-chat' ||
      transportProtocol === 'image-api' ||
      transportProtocol === 'embedding-api' ||
      transportProtocol === 'rerank-api'
    ) {
      const baseURL = resolveOpenAiBaseURL(apiHost) || 'https://api.openai.com/v1'
      const provider = createOpenAICompatible({
        name: config.id,
        apiKey,
        baseURL,
        headers,
        fetch: authFetch,
        metadataExtractor: createOpenAiCompatibleInlineImageMetadataExtractor(config.id),
      })
      return provider(modelId)
    }

    if (transportProtocol === 'openai-responses') {
      const baseURL = resolveOpenAiBaseURL(apiHost)
      const provider = createOpenAI({ apiKey, baseURL, headers, name: config.id, fetch: authFetch })
      return provider.responses(modelId)
    }

    if (transportProtocol === 'anthropic-messages') {
      const baseURL = (config.anthropicApiHost || apiHost) ? trimSlash(config.anthropicApiHost || apiHost) : undefined
      const provider = createAnthropic({ apiKey, baseURL, headers, fetch: authFetch })
      return provider(modelId)
    }

    if (transportProtocol === 'gemini-generate-content') {
      const baseURL = resolveGeminiBaseURL(apiHost) ?? 'https://generativelanguage.googleapis.com/v1beta'
      const provider = createGoogleGenerativeAI({ apiKey, baseURL, headers, fetch: authFetch })
      return provider(modelId)
    }

    throw new I18nError('errors.newApiTransportProtocolUnsupported', { transportProtocol: String(transportProtocol) })
  },

    /**
   * 内部方法：`createEmbeddingModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createEmbeddingModel(config, modelId) {
    const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(config)
    const baseURL = resolveOpenAiBaseURL(apiHost) || 'https://api.openai.com/v1'
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
    return createOpenAiImageModel(config, modelId)
  },

    /**
   * 内部方法：`getCallSettingSupport`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getCallSettingSupport(ctx) {
    const transportProtocol = resolveNewApiTransportProtocol(ctx.config, ctx.modelId)
    if (transportProtocol === 'anthropic-messages') return anthropicLikeCallSettingSupport()
    if (transportProtocol === 'gemini-generate-content') return geminiLikeCallSettingSupport()
    // 默认：OpenAI / OpenAI Responses / image-generation
    return openAiLikeCallSettingSupport({ modelId: ctx.modelId })
  },

    /**
   * 内部方法：`pickChatExecutionMode`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  pickChatExecutionMode(ctx) {
    const transportProtocol = resolveNewApiTransportProtocol(ctx.config, ctx.modelId)
    if (transportProtocol === 'gemini-generate-content' && ctx.wantsInlineImage) return 'generateText'
    return 'streamText'
  },

  /**
   * 内部方法：`buildRequestShapePolicy`。
   *
   * @remarks
   * NewAPI 只有在模型协议明确切到 OpenAI Responses、并且运行时实际走
   * `@ai-sdk/openai.responses()` 的 `openai` namespace 时，才声明 OpenAI instructions 形态。
   */
  buildRequestShapePolicy(ctx) {
    return buildOpenAiResponsesSystemPromptPolicy({
      transportProtocol: ctx.transportProtocol,
      providerOptionNamespaces: ctx.providerOptionNamespaces,
      modelProviderSlug: ctx.effectiveProviderType === 'openai-response' ? 'openai' : ctx.modelProviderSlug,
    })
  },
}
