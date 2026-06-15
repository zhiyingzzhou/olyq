/**
 * 说明：`mistral-adapter` AI 能力模块。
 *
 * 职责：
 * - 承载 `mistral-adapter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `mistralAdapter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Mistral Provider 适配器。
 *
 * 说明：
 * - 基于 `\@ai-sdk/mistral` 构建语言模型；
 * - call settings 支持按 openai-like 规则声明（与 UI 能力开关对齐）。
 */

import { createMistral } from '@ai-sdk/mistral'
import { createStaticRuntimeCapabilities, type ProviderAdapter } from './adapter-types'
import { resolveCommonParams, trimSlash } from './provider-utils-common'
import { openAiLikeCallSettingSupport } from './policies/call-settings'

/**
 * 导出常量：`mistralAdapter`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const mistralAdapter: ProviderAdapter = {
  type: 'mistral',
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
    const provider = createMistral({ apiKey, baseURL, headers, fetch: authFetch })
    return provider(modelId)
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
}
