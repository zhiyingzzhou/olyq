/**
 * 说明：`gemini-adapter` AI 能力模块。
 *
 * 职责：
 * - 承载 `gemini-adapter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `geminiAdapter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Google Gemini Provider 适配器（Generative Language API）。
 *
 * 特性：
 * - 支持对话内联生图：通过 `responseModalities` 声明 TEXT/IMAGE 输出；
 * - 支持推理/思考：通过 `thinkingConfig` 透传（reasoningEffort/thinkingBudgetTokens）；
 * - 兼容性策略：当启用 inline image 时可降级为非流式 `generateText`（规避部分代理端点的流式不稳定）。
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createStaticRuntimeCapabilities, type ProviderAdapter, type ProviderOptionsContext, type MiddlewareContext } from './adapter-types'
import { resolveCommonParams, resolveGeminiBaseURL } from './provider-utils-common'
import { geminiLikeCallSettingSupport } from './policies/call-settings'
import { buildProviderReasoningRuntimeOptions } from '../provider-reasoning'
import {
  normalizeModelIdForRules,
  isGemini3ModelId,
  createSkipGeminiThoughtSignatureMiddleware,
} from '../stream-chat-utils'

/**
 * 导出常量：`geminiAdapter`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const geminiAdapter: ProviderAdapter = {
  type: 'gemini',
  getRuntimeCapabilities: createStaticRuntimeCapabilities({
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
    const baseURL = resolveGeminiBaseURL(apiHost) ?? 'https://generativelanguage.googleapis.com/v1beta'
    const provider = createGoogleGenerativeAI({ apiKey, baseURL, headers, fetch: authFetch })
    return provider(modelId)
  },

    /**
   * 内部方法：`createImageModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createImageModel(config, modelId) {
    const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(config)
    const baseURL = resolveGeminiBaseURL(apiHost) ?? 'https://generativelanguage.googleapis.com/v1beta'
    const provider = createGoogleGenerativeAI({ apiKey, baseURL, headers, fetch: authFetch })
    return provider.image(modelId)
  },

  /**
   * 内部方法：`createNativeWebSearchTools`。
   *
   * @remarks
   * 使用 Gemini Generate Content API 官方 Google Search grounding provider tool。
   */
  createNativeWebSearchTools(ctx) {
    const toolName = ctx.capability.toolName
    if (!toolName) return undefined
    const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(ctx.config)
    const baseURL = resolveGeminiBaseURL(apiHost) ?? 'https://generativelanguage.googleapis.com/v1beta'
    const provider = createGoogleGenerativeAI({ apiKey, baseURL, headers, fetch: authFetch })
    return {
      [toolName]: provider.tools.googleSearch({}),
    }
  },

    /**
   * 内部方法：`getCallSettingSupport`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getCallSettingSupport() {
    return geminiLikeCallSettingSupport()
  },

    /**
   * 内部方法：`pickChatExecutionMode`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  pickChatExecutionMode(ctx) {
    // 兼容性策略：当启用“对话内联生图”时，部分网关/代理的流式端点不稳定，改用非流式一次性返回。
    return ctx.wantsInlineImage ? 'generateText' : 'streamText'
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

    // 内联生图：通过 responseModalities 声明输出类型
    if (ctx.params.enableGenerateImage) {
      opts.responseModalities = ['TEXT', 'IMAGE']
    }

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
    const middlewares = []

    // 兼容 Gemini 3：跳过 thought signature 校验
    const modelIdLower = normalizeModelIdForRules(ctx.modelId)
    if (ctx.providerOptionsKey && isGemini3ModelId(modelIdLower)) {
      middlewares.push(createSkipGeminiThoughtSignatureMiddleware(ctx.providerOptionsKey))
    }

    return middlewares
  },
}
