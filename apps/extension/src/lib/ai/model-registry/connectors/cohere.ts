/**
 * 说明：`cohere` AI 能力模块。
 *
 * 职责：
 * - 承载 `cohere` 相关的当前文件实现与模块边界；
 * - 对外暴露 `cohereConnector` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { fetchModelsFromApi, type FetchedModel } from '../../fetch-models'
import type { ConnectorModelEntry, MetadataConnector, MetadataEvidence } from '../types'

/** Cohere 目录连接器。 */
export const cohereConnector: MetadataConnector = {
  id: 'cohere',
  providerTypes: ['cohere'],
  capabilities: {
    publicCatalog: false,
    providerCatalog: true,
    modelDetail: false,
    upstreamRefs: false,
    kindHints: true,
    featureHints: true,
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
    const item = entry.raw as FetchedModel
    const evidence: MetadataEvidence = {
      sourcePriority: 'provider-official',
      providerType: ctx.provider?.type,
      providerId: ctx.provider?.id,
      rawModelId: item.id,
      displayName: item.name,
      ...(item.kindHint ? { kindHint: item.kindHint } : {}),
      ...(item.inputModalities?.length ? { inputModalities: item.inputModalities } : {}),
      ...(item.outputModalities?.length ? { outputModalities: item.outputModalities } : {}),
      ...(item.features?.length ? { featureHints: item.features } : {}),
      ...(item.contextLength ? { contextLength: item.contextLength } : {}),
      ...(item.transportProtocol ? { transportHints: [item.transportProtocol] } : {}),
      references: [{
        system: 'provider-official',
        providerType: ctx.provider?.type,
        providerId: ctx.provider?.id,
        refType: 'model-id',
        value: item.id,
      }],
      scopeHint: 'provider',
      confidence: 'high',
      fetchedAt: new Date().toISOString(),
    }
    return [evidence]
  },
}
