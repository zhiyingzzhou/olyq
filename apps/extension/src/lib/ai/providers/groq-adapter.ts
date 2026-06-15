/**
 * 说明：`groq-adapter` AI 能力模块。
 *
 * 职责：
 * - 承载 `groq-adapter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `groqAdapter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createGroq } from '@ai-sdk/groq'
import { createStaticRuntimeCapabilities, type ProviderAdapter, type ProviderOptionsContext } from './adapter-types'
import { resolveCommonParams, resolveOpenAiBaseURL } from './provider-utils-common'
import { openAiLikeCallSettingSupport } from './policies/call-settings'
import { buildProviderReasoningRuntimeOptions } from '../provider-reasoning'

/**
 * Groq Provider Adapter
 *
 * 说明：
 * - 使用 AI SDK 官方 `\@ai-sdk/groq`。
 * - Groq API 兼容 OpenAI Chat Completions，默认 baseURL 为 `https://api.groq.com/openai/v1`。
 */
export const groqAdapter: ProviderAdapter = {
  type: 'groq',
  getRuntimeCapabilities: createStaticRuntimeCapabilities(),

    /**
   * 内部方法：`createLanguageModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createLanguageModel(config, modelId) {
    const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(config)
    const baseURL = resolveOpenAiBaseURL(apiHost) || 'https://api.groq.com/openai/v1'
    const provider = createGroq({ apiKey, baseURL, headers, fetch: authFetch })
    return provider.languageModel(modelId)
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
    // Service tier（Groq）：auto/on_demand/flex
    const tier = ctx.config.serviceTier
    if (tier) {
      if (tier === 'auto' || tier === 'flex' || tier === 'on_demand') opts.serviceTier = tier
      // 兼容用户误用：把 OpenAI 的 default 映射到 Groq 的 on_demand
      else if (tier === 'default') opts.serviceTier = 'on_demand'
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
}
