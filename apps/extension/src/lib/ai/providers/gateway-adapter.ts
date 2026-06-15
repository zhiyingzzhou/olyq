/**
 * 说明：`gateway-adapter` AI 能力模块。
 *
 * 职责：
 * - 承载 `gateway-adapter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `gatewayAdapter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * AI Gateway Provider 适配器（\@ai-sdk/gateway）。
 *
 * 职责：
 * - 解析公共参数（host/key/headers）后创建 Gateway client；
 * - 构建 language/embedding/image 模型；
 * - 声明 openai-like 的 call settings 支持（用于 UI/调用侧能力开关）。
 */

import { createGateway } from '@ai-sdk/gateway'
import { createStaticRuntimeCapabilities, type ProviderAdapter, type ProviderOptionsContext } from './adapter-types'
import { resolveCommonParams, trimSlash } from './provider-utils-common'
import { openAiLikeCallSettingSupport } from './policies/call-settings'
import { buildOpenAiResponsesSystemPromptPolicy } from './openai-responses-request-shape'

/**
 * 根据 Provider 配置创建 Gateway SDK 实例。
 *
 * 说明：
 * - 这里只处理公共参数解析与 baseURL 归一化；
 * - 具体 language/embedding/image 模型由返回的 provider 再按 modelId 创建。
 */
function createGatewayProvider(config: Parameters<ProviderAdapter['createLanguageModel']>[0]) {
  const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(config)
  const baseURL = apiHost ? trimSlash(apiHost) : undefined
  return createGateway({ apiKey, baseURL, headers, fetch: authFetch })
}

/**
 * 导出常量：`gatewayAdapter`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const gatewayAdapter: ProviderAdapter = {
  type: 'gateway',
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
    return createGatewayProvider(config)(modelId)
  },

    /**
   * 内部方法：`createEmbeddingModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createEmbeddingModel(config, modelId) {
    return createGatewayProvider(config).embeddingModel(modelId)
  },

    /**
   * 内部方法：`createImageModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createImageModel(config, modelId) {
    return createGatewayProvider(config).imageModel(modelId)
  },

    /**
   * 内部方法：`getCallSettingSupport`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getCallSettingSupport(ctx) {
    return openAiLikeCallSettingSupport({
      modelId: ctx.modelId,
      transportProtocol: ctx.transportProtocol,
      reasoning: ctx.reasoning,
    })
  },

  /**
   * 内部方法：`buildProviderOptions`。
   *
   * @remarks
   * Gateway 本身不消费 `store`，但当底层模型明确走 OpenAI Responses 时，
   * 需要把该开关透传给网关后端继续路由。
   */
  buildProviderOptions(ctx: ProviderOptionsContext): Record<string, unknown> | undefined {
    if (ctx.transportProtocol !== 'openai-responses') return undefined
    return {
      openai: {
        store:
          typeof ctx.params.openAiResponsesStoreValue === 'boolean'
            ? ctx.params.openAiResponsesStoreValue
            : Boolean(ctx.params.hasInjectedMcpTools),
      },
    }
  },

  /**
   * 内部方法：`buildRequestShapePolicy`。
   *
   * @remarks
   * AI Gateway 只在模型 ID 明确声明 `openai/...` provider slug 且 transport 为
   * OpenAI Responses 时，才透传 OpenAI `instructions` 形态；其它 Gateway 路由保持
   * unverified，不按 GPT 模型名或 endpoint 猜测底层 provider。
   */
  buildRequestShapePolicy(ctx) {
    return buildOpenAiResponsesSystemPromptPolicy({
      transportProtocol: ctx.transportProtocol,
      providerOptionNamespaces: ctx.providerOptionNamespaces,
      modelProviderSlug: ctx.modelProviderSlug,
    })
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
