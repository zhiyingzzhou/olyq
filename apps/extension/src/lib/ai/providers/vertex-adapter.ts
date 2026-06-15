/**
 * 说明：`vertex-adapter` AI 能力模块。
 *
 * 职责：
 * - 承载 `vertex-adapter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `vertexAdapter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Google Vertex AI（Gemini on Vertex）Provider 适配器。
 *
 * 说明：
 * - Service Account 模式需要 projectId/location 与显式服务账号字段；
 * - API Key 模式对应 Vertex express mode，不要求 projectId/location；
 * - providerOptions/middlewares 与 Gemini 基本保持一致（thinkingConfig、Gemini 3 兼容等）。
 */

import { createVertex } from '@ai-sdk/google-vertex/edge'
import type { ProviderConfig } from '../types'
import { createStaticRuntimeCapabilities, type ProviderAdapter, type ProviderOptionsContext, type MiddlewareContext } from './adapter-types'
import { normalizeGoogleServiceAccountCredentials, resolveCommonParams, trimSlash } from './provider-utils-common'
import { I18nError } from '@/lib/i18n/error'
import { geminiLikeCallSettingSupport } from './policies/call-settings'
import { buildProviderReasoningRuntimeOptions } from '../provider-reasoning'
import {
  normalizeModelIdForRules,
  isGemini3ModelId,
  createSkipGeminiThoughtSignatureMiddleware,
} from '../stream-chat-utils'
import { pickFirstApiKey } from '../api-keys'

/**
 * 创建 Vertex SDK Provider 实例。
 *
 * 说明：
 * - 根据 `vertex.authType` 在 express API Key 与 Service Account 之间切换；
 * - 成功后返回可同时构建 language/embedding/image 模型的 Vertex provider。
 */
function createVertexProvider(config: ProviderConfig, apiHost: string, headers: Record<string, string>) {
  const vertex = config.vertex
  if (!vertex) throw new I18nError('errors.vertexConfigMissing')

  const apiHostTrimmed = apiHost ? trimSlash(apiHost) : ''
  const baseURL = apiHostTrimmed && !/[{}]/.test(apiHostTrimmed) ? apiHostTrimmed : undefined

  if (vertex.authType === 'apiKey') {
    const apiKey = pickFirstApiKey(vertex.apiKey || '')
    if (!apiKey) throw new I18nError('errors.vertexApiKeyMissing')
    return createVertex({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
      headers,
    })
  }

  const project = String(vertex.projectId || '').trim()
  const location = String(vertex.location || '').trim()
  if (!project || !location) throw new I18nError('errors.vertexProjectLocationMissing')

  const googleCredentials = normalizeGoogleServiceAccountCredentials(vertex.serviceAccount)
  if (!googleCredentials) throw new I18nError('errors.vertexServiceAccountMissing')

  return createVertex({
    project,
    location,
    googleCredentials,
    ...(baseURL ? { baseURL } : {}),
    headers,
  })
}

/**
 * 导出常量：`vertexAdapter`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const vertexAdapter: ProviderAdapter = {
  type: 'vertexai',
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
    const { apiHost, headers } = resolveCommonParams(config)
    const provider = createVertexProvider(config, apiHost, headers)
    return provider(modelId)
  },

    /**
   * 内部方法：`createEmbeddingModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createEmbeddingModel(config, modelId) {
    const { apiHost, headers } = resolveCommonParams(config)
    const provider = createVertexProvider(config, apiHost, headers)
    return provider.embeddingModel(modelId)
  },

    /**
   * 内部方法：`createImageModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createImageModel(config, modelId) {
    const { apiHost, headers } = resolveCommonParams(config)
    const provider = createVertexProvider(config, apiHost, headers)
    return provider.imageModel(modelId)
  },

  /**
   * 内部方法：`createNativeWebSearchTools`。
   *
   * @remarks
   * 使用 Vertex Gemini 官方 Google Search grounding provider tool。
   */
  createNativeWebSearchTools(ctx) {
    const toolName = ctx.capability.toolName
    if (!toolName) return undefined
    const { apiHost, headers } = resolveCommonParams(ctx.config)
    const provider = createVertexProvider(ctx.config, apiHost, headers)
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
    // 兼容性策略：与 Gemini 一致（inline image 时降级非流式）。
    return ctx.wantsInlineImage ? 'generateText' : 'streamText'
  },

    /**
   * 内部方法：`buildProviderOptions`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  buildProviderOptions(ctx: ProviderOptionsContext): Record<string, unknown> | undefined {
    // 与 Gemini 相同的 options 透传模式
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

    // 兼容 Vertex 上的 Gemini 3：跳过 thought signature 校验
    const modelIdLower = normalizeModelIdForRules(ctx.modelId)
    if (ctx.providerOptionsKey && isGemini3ModelId(modelIdLower)) {
      middlewares.push(createSkipGeminiThoughtSignatureMiddleware(ctx.providerOptionsKey))
    }

    return middlewares
  },
}
