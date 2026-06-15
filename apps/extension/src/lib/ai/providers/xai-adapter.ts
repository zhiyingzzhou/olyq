/**
 * 说明：`xai-adapter` AI 能力模块。
 *
 * 职责：
 * - 承载 `xai-adapter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `xaiAdapter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createXai } from '@ai-sdk/xai'
import { createStaticRuntimeCapabilities, type ProviderAdapter, type ProviderOptionsContext } from './adapter-types'
import { resolveCommonParams, resolveModelTransportProtocol, resolveOpenAiBaseURL } from './provider-utils-common'
import { openAiLikeCallSettingSupport } from './policies/call-settings'
import { buildProviderReasoningRuntimeOptions } from '../provider-reasoning'
import { buildNativeWebSearchToolArgs } from '../native-web-search-params'

/**
 * xAI Provider Adapter
 *
 * 说明：
 * - 使用 AI SDK 官方 `\@ai-sdk/xai`（支持 Chat、Responses、Image）。
 * - Responses 模型用于更强的 agentic tool calling；通过模型的 `transportProtocol=openai-responses` 显式启用。
 */
export const xaiAdapter: ProviderAdapter = {
  type: 'xai',
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
    const baseURL = resolveOpenAiBaseURL(apiHost) || 'https://api.x.ai/v1'
    const provider = createXai({ apiKey, baseURL, headers, fetch: authFetch })

    const transportProtocol = resolveModelTransportProtocol(config, modelId)
    if (transportProtocol === 'openai-responses') return provider.responses(modelId)

    return provider.chat(modelId)
  },

    /**
   * 内部方法：`getCallSettingSupport`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getCallSettingSupport(ctx) {
    // xAI：不支持 OpenAI penalties 与 stop sequences（与旧逻辑保持一致）
    return openAiLikeCallSettingSupport({ modelId: ctx.modelId, disablePenalties: true, disableStop: true })
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
   * 内部方法：`createImageModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createImageModel(config, modelId) {
    const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(config)
    const baseURL = resolveOpenAiBaseURL(apiHost) || 'https://api.x.ai/v1'
    const provider = createXai({ apiKey, baseURL, headers, fetch: authFetch })
    return provider.imageModel(modelId)
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
   * 内部方法：`createNativeWebSearchTools`。
   *
   * @remarks
   * 使用 xAI Responses API 官方 server-side `web_search` provider-hosted tool。
   */
  createNativeWebSearchTools(ctx) {
    const toolName = ctx.capability.toolName
    if (!toolName) return undefined
    const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(ctx.config)
    const baseURL = resolveOpenAiBaseURL(apiHost) || 'https://api.x.ai/v1'
    const provider = createXai({ apiKey, baseURL, headers, fetch: authFetch })
    const toolArgs = buildNativeWebSearchToolArgs(ctx.capability, ctx.params.modelParams) as Parameters<typeof provider.tools.webSearch>[0]
    return {
      [toolName]: provider.tools.webSearch(toolArgs),
    }
  },
}
