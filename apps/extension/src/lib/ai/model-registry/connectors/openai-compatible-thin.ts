/**
 * 说明：`openai-compatible-thin` AI 能力模块。
 *
 * 职责：
 * - 承载 `openai-compatible-thin` 相关的当前文件实现与模块边界；
 * - 对外暴露 `createOpenAiCompatibleThinConnector` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * OpenAI-compatible 轻量目录连接器工厂。
 *
 * 说明：
 * - 用于大量“只暴露 /models，但不提供高质量详情”的聚合平台；
 * - 这类连接器只提供低置信度的最小 evidence，不直接强判公共模型身份；
 * - 主要价值在于补充 provider 目录、rawModelId、displayName 与协议提示。
 */

import type { ConnectorModelEntry, MetadataConnector, MetadataEvidence, TransportProtocol } from '../types'
import { fetchModelsFromApi } from '../../fetch-models'
import type { ProviderType } from '../../types'

/**
 * 根据 Provider 类型猜测默认传输协议。
 *
 * 说明：
 * - 轻量目录连接器通常只有 provider 类型，没有高质量协议证据；
 * - 这里返回的是“尽力而为”的低置信度提示，后续仍可能被更权威 evidence 覆盖。
 */
function guessTransportProtocol(providerType?: string): TransportProtocol {
  switch (providerType) {
    case 'openai-response':
      return 'openai-responses'
    case 'anthropic':
    case 'vertex-anthropic':
      return 'anthropic-messages'
    case 'gemini':
    case 'vertexai':
      return 'gemini-generate-content'
    case 'new-api':
    case 'gateway':
    case 'openai':
    case 'dashscope':
    case 'siliconflow':
    case 'deepseek':
    case 'groq':
    case 'azure-openai':
    case 'mistral':
    case 'xai':
    case 'ollama':
      return 'openai-chat'
    default:
      return 'unknown'
  }
}

/**
 * 创建轻量目录连接器。
 */
export function createOpenAiCompatibleThinConnector(id: string, providerTypes: ReadonlyArray<ProviderType>): MetadataConnector {
  return {
    id,
    providerTypes,
    capabilities: {
      publicCatalog: false,
      providerCatalog: true,
      modelDetail: false,
      upstreamRefs: false,
      kindHints: false,
      featureHints: false,
    },
        /**
     * 内部方法：`listCatalog`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    async listCatalog(ctx) {
      if (!ctx.provider) return []
      const models = await fetchModelsFromApi(
        ctx.provider,
        ctx.signal,
      )
      return models.map((item) => ({
        raw: item,
        rawModelId: item.id,
        displayName: item.name,
      }) satisfies ConnectorModelEntry)
    },
        /**
     * 内部方法：`normalizeEntry`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    normalizeEntry(entry, ctx) {
      const fetched = entry.raw as {
        readonly kindHint?: MetadataEvidence['kindHint']
        readonly inputModalities?: MetadataEvidence['inputModalities']
        readonly outputModalities?: MetadataEvidence['outputModalities']
        readonly features?: MetadataEvidence['featureHints']
        readonly transportProtocol?: TransportProtocol
        readonly importBlockedReasonKey?: string
      }
      if (fetched.importBlockedReasonKey) return []
      return [{
        sourcePriority: 'provider-official',
        providerType: ctx.provider?.type,
        providerId: ctx.provider?.id,
        rawModelId: entry.rawModelId,
        displayName: entry.displayName,
        ...(fetched.kindHint ? { kindHint: fetched.kindHint } : {}),
        ...(fetched.inputModalities ? { inputModalities: fetched.inputModalities } : {}),
        ...(fetched.outputModalities ? { outputModalities: fetched.outputModalities } : {}),
        ...(fetched.features ? { featureHints: fetched.features } : {}),
        transportHints: [fetched.transportProtocol ?? guessTransportProtocol(ctx.provider?.type)],
        scopeHint: ctx.provider?.type === 'ollama' ? 'local' : 'provider',
        confidence: 'low',
        fetchedAt: new Date().toISOString(),
      } satisfies MetadataEvidence]
    },
  }
}
