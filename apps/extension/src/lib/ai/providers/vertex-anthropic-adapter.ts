/**
 * 说明：`vertex-anthropic-adapter` AI 能力模块。
 *
 * 职责：
 * - 承载 `vertex-anthropic-adapter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `vertexAnthropicAdapter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Vertex AI 上的 Anthropic（Claude）Provider 适配器。
 *
 * 说明：
 * - 通过 `\@ai-sdk/google-vertex/anthropic/edge` 调用 Vertex 上的 Claude；
 * - 必须使用 Service Account 鉴权，并提供 projectId/location；
 * - providerOptions 与 caching middlewares 复用 Anthropic 规则。
 */

import { createVertexAnthropic } from '@ai-sdk/google-vertex/anthropic/edge'
import { createStaticRuntimeCapabilities, type ProviderAdapter, type ProviderOptionsContext, type MiddlewareContext } from './adapter-types'
import { buildAnthropicProviderOptions, getAnthropicCachingMiddlewares } from './provider-utils-anthropic'
import { normalizeGoogleServiceAccountCredentials, resolveCommonParams, trimSlash } from './provider-utils-common'
import { I18nError } from '@/lib/i18n/error'
import { anthropicLikeCallSettingSupport } from './policies/call-settings'

/**
 * 导出常量：`vertexAnthropicAdapter`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const vertexAnthropicAdapter: ProviderAdapter = {
  type: 'vertex-anthropic',
  getRuntimeCapabilities: createStaticRuntimeCapabilities(),

    /**
   * 内部方法：`createLanguageModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createLanguageModel(config, modelId) {
    const { apiHost, headers } = resolveCommonParams(config)

    const vertex = config.vertex
    if (!vertex) throw new I18nError('errors.vertexAnthropicConfigMissing')
    if (vertex.authType !== 'serviceAccount') throw new I18nError('errors.vertexAnthropicServiceAccountRequired')

    const project = String(vertex.projectId || '').trim()
    const location = String(vertex.location || '').trim()
    if (!project || !location) throw new I18nError('errors.vertexAnthropicProjectLocationMissing')

    const googleCredentials = normalizeGoogleServiceAccountCredentials(vertex.serviceAccount)
    if (!googleCredentials) throw new I18nError('errors.vertexAnthropicCredentialsMissing')
    const apiHostTrimmed = apiHost ? trimSlash(apiHost) : ''
    const baseURL = apiHostTrimmed && !/[{}]/.test(apiHostTrimmed) ? apiHostTrimmed : undefined

    const provider = createVertexAnthropic({
      project,
      location,
      googleCredentials,
      ...(baseURL ? { baseURL } : {}),
      headers,
    })
    return provider(modelId)
  },

    /**
   * 内部方法：`buildProviderOptions`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  buildProviderOptions(ctx: ProviderOptionsContext): Record<string, unknown> | undefined {
    return buildAnthropicProviderOptions(ctx)
  },

    /**
   * 内部方法：`getCallSettingSupport`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getCallSettingSupport() {
    return anthropicLikeCallSettingSupport()
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
   * 内部方法：`getMiddlewares`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getMiddlewares(ctx: MiddlewareContext) {
    return getAnthropicCachingMiddlewares(ctx)
  },
}
