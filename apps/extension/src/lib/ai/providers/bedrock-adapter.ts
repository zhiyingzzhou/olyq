/**
 * 说明：`bedrock-adapter` AI 能力模块。
 *
 * 职责：
 * - 承载 `bedrock-adapter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `bedrockAdapter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * AWS Bedrock Provider 适配器。
 *
 * 说明：
 * - 支持 `apiKey` 与 `iam` 两种鉴权方式；
 * - `region` 必填；
 * - apiHost 若包含 `{region}` 等占位符会被忽略（交由 SDK 按 region 推导官方端点）；
 * - 同时提供 language/embedding/image 三类模型入口。
 */

import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'
import type { ProviderConfig } from '../types'
import { buildProviderReasoningRuntimeOptions } from '../provider-reasoning'
import { createStaticRuntimeCapabilities, type ProviderAdapter, type ProviderOptionsContext } from './adapter-types'
import { resolveCommonParams, trimSlash } from './provider-utils-common'
import { I18nError } from '@/lib/i18n/error'
import { bedrockCallSettingSupport } from './policies/call-settings'
import { pickFirstApiKey } from '../api-keys'

/**
 * 创建 Bedrock SDK Provider 实例。
 *
 * 说明：
 * - 会根据 `authType` 在 API Key 与 IAM 凭据两条路径之间切换；
 * - 同时负责忽略模板化 `apiHost`，让 SDK 按 region 推导官方端点。
 */
function createBedrockProvider(config: ProviderConfig, apiHost: string, headers: Record<string, string>) {
  const bedrock = config.bedrock
  if (!bedrock) throw new I18nError('errors.bedrockConfigMissing')

  const region = String(bedrock.region || '').trim()
  if (!region) throw new I18nError('errors.bedrockRegionMissing')

  // 说明：默认配置里 apiHost 可能包含占位符（如 "https://bedrock-runtime.{region}.amazonaws.com"）。
  // 这类值无法作为真实 baseURL 使用；应忽略并让 SDK 按 region 推导官方端点。
  const apiHostTrimmed = apiHost ? trimSlash(apiHost) : ''
  const baseURL = apiHostTrimmed && !/[{}]/.test(apiHostTrimmed) ? apiHostTrimmed : undefined

  const bedrockApiKey = pickFirstApiKey(bedrock.apiKey || '')

  if (bedrock.authType === 'apiKey' && !bedrockApiKey) {
    throw new I18nError('errors.bedrockApiKeyMissing')
  }
  if (bedrock.authType === 'iam') {
    const accessKeyId = bedrock.accessKeyId?.trim()
    const secretAccessKey = bedrock.secretAccessKey?.trim()
    if (!accessKeyId || !secretAccessKey) {
      throw new I18nError('errors.bedrockIamCredentialsMissing')
    }
  }

  return bedrock.authType === 'apiKey'
    ? createAmazonBedrock({
        apiKey: bedrockApiKey || undefined,
        region,
        ...(baseURL ? { baseURL } : {}),
        headers,
      })
    : createAmazonBedrock({
        accessKeyId: bedrock.accessKeyId?.trim() || undefined,
        secretAccessKey: bedrock.secretAccessKey?.trim() || undefined,
        sessionToken: bedrock.sessionToken?.trim() || undefined,
        region,
        ...(baseURL ? { baseURL } : {}),
        headers,
      })
}

/**
 * 导出常量：`bedrockAdapter`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const bedrockAdapter: ProviderAdapter = {
  type: 'aws-bedrock',
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
    const provider = createBedrockProvider(config, apiHost, headers)
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
    const provider = createBedrockProvider(config, apiHost, headers)
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
    const provider = createBedrockProvider(config, apiHost, headers)
    return provider.imageModel(modelId)
  },

    /**
   * 内部方法：`getCallSettingSupport`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getCallSettingSupport() {
    return bedrockCallSettingSupport()
  },

  /**
   * 内部方法：`buildProviderOptions`。
   *
   * @remarks
   * 把 provider-native `modelParams.reasoningConfig` 挂到 Bedrock 对应命名空间，
   * 避免聊天主链和健康检查链路在 Bedrock 上出现参数缺失。
   */
  buildProviderOptions(ctx: ProviderOptionsContext): Record<string, unknown> | undefined {
    const key = ctx.providerOptionsKey
    if (!key) return undefined

    const reasoningRuntime = buildProviderReasoningRuntimeOptions({
      model: `${ctx.providerId}/${ctx.modelId}`,
      transportProtocol: ctx.transportProtocol,
      modelParams: ctx.params.modelParams,
    })

    if (!reasoningRuntime.providerOptions) return undefined
    return { [key]: reasoningRuntime.providerOptions }
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
