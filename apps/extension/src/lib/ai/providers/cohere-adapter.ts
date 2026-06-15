/**
 * 说明：`cohere-adapter` AI 能力模块。
 *
 * 职责：
 * - 承载 `cohere-adapter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `cohereAdapter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createCohere } from '@ai-sdk/cohere'
import { createStaticRuntimeCapabilities, type ProviderAdapter, type ProviderOptionsContext } from './adapter-types'
import { resolveCommonParams, trimSlash } from './provider-utils-common'
import { cohereCallSettingSupport } from './policies/call-settings'
import { buildProviderReasoningRuntimeOptions } from '../provider-reasoning'

/**
 * Cohere Provider Adapter
 *
 * 说明：
 * - 使用 AI SDK 官方 `\@ai-sdk/cohere`（Chat / Embeddings / Rerank）。
 * - Cohere 的默认 baseURL 为 `https://api.cohere.com/v2`（与 OpenAI 风格不同）。
 */
export const cohereAdapter: ProviderAdapter = {
  type: 'cohere',
  getRuntimeCapabilities: createStaticRuntimeCapabilities({
    'embedding-api': true,
    'rerank-api': true,
  }),

    /**
   * 内部方法：`createLanguageModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createLanguageModel(config, modelId) {
    const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(config)
    const baseURL = apiHost ? trimSlash(apiHost) : undefined
    const provider = createCohere({ apiKey, baseURL, headers, fetch: authFetch })
    return provider.languageModel(modelId)
  },

    /**
   * 内部方法：`createEmbeddingModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createEmbeddingModel(config, modelId) {
    const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(config)
    const baseURL = apiHost ? trimSlash(apiHost) : undefined
    const provider = createCohere({ apiKey, baseURL, headers, fetch: authFetch })
    return provider.embeddingModel(modelId)
  },

    /**
   * 内部方法：`createRerankModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createRerankModel(config, modelId) {
    const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(config)
    const baseURL = apiHost ? trimSlash(apiHost) : undefined
    const provider = createCohere({ apiKey, baseURL, headers, fetch: authFetch })
    // 说明：Cohere rerank 模型 ID 有明确枚举，但“模型管理”允许用户自定义；这里按字符串透传。
    return provider.rerankingModel(modelId as never)
  },

    /**
   * 内部方法：`getCallSettingSupport`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getCallSettingSupport() {
    return cohereCallSettingSupport()
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
