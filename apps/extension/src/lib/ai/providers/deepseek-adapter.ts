/**
 * 说明：`deepseek-adapter` AI 能力模块。
 *
 * 职责：
 * - 承载 `deepseek-adapter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `deepseekAdapter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createDeepSeek } from '@ai-sdk/deepseek'
import type { LanguageModelMiddleware } from 'ai'
import {
  createStaticRuntimeCapabilities,
  type ProviderAdapter,
  type MiddlewareContext,
  type ProviderOptionsContext,
} from './adapter-types'
import { resolveCommonParams, trimSlash } from './provider-utils-common'
import { buildProviderReasoningRuntimeOptions } from '../provider-reasoning'
import { createStrictInterleaveMiddleware } from '../stream-chat-utils'
import { openAiLikeCallSettingSupport } from './policies/call-settings'

/**
 * DeepSeek Provider Adapter
 *
 * 说明：
 * - 使用 AI SDK 官方 `\@ai-sdk/deepseek`，不走 openai-compatible。
 * - DeepSeek 的 baseURL 默认不带 `/v1`；其 SDK 内部会访问 `${baseURL}/chat/completions`。
 */
export const deepseekAdapter: ProviderAdapter = {
  type: 'deepseek',
  getRuntimeCapabilities: createStaticRuntimeCapabilities(),

    /**
   * 内部方法：`createLanguageModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createLanguageModel(config, modelId) {
    const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(config)
    const baseURL = apiHost ? trimSlash(apiHost) : undefined
    const provider = createDeepSeek({ apiKey, baseURL, headers, fetch: authFetch })
    return provider.chat(modelId)
  },

    /**
   * 内部方法：`getCallSettingSupport`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getCallSettingSupport(ctx) {
    return openAiLikeCallSettingSupport({ modelId: ctx.modelId, disableSeed: true })
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
    // DeepSeek Reasoner 要求 user/assistant 严格交错，否则服务端可能返回 400
    if (ctx.modelId === 'deepseek-reasoner') return [createStrictInterleaveMiddleware()]
    return []
  },
}
