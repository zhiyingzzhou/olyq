/**
 * 说明：`openrouter-seed` AI 能力模块。
 *
 * 职责：
 * - 承载 `openrouter-seed` 相关的当前文件实现与模块边界；
 * - 对外暴露 `openrouterSeedConnector` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * OpenRouter 主目录连接器。
 *
 * 说明：
 * - 这是模型注册表的公共主目录；
 * - 必须使用 `output_modalities=all`，否则会漏掉 embedding、image、audio、video 模型；
 * - 该连接器只负责主目录，不负责按 Provider 详情补录。
 */

import type { ConnectorModelEntry, MetadataConnector, MetadataEvidence, ModelFeature, ModelKind, ModelModality } from '../types'
import { z } from 'zod'
import { splitVendorAndModelFromDisplayName } from '../identity'

const openRouterModelSchema = z.object({
  id: z.string(),
  canonical_slug: z.string().nullable().optional(),
  hugging_face_id: z.string().nullable().optional(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  context_length: z.number().nullable().optional(),
  created: z.number().nullable().optional(),
  pricing: z.record(z.string(), z.string()).optional(),
  architecture: z.object({
    input_modalities: z.array(z.string()).optional(),
    output_modalities: z.array(z.string()).optional(),
  }).optional(),
  supported_parameters: z.array(z.string()).optional(),
})

const openRouterResponseSchema = z.object({
  data: z.array(openRouterModelSchema),
})

/** 把 OpenRouter 返回的模态字符串数组收敛成模型类型系统使用的标准模态枚举。 */
function toModalities(raw: string[] | undefined): ModelModality[] {
  return (raw ?? [])
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item): item is ModelModality => (
      item === 'text'
      || item === 'image'
      || item === 'audio'
      || item === 'video'
      || item === 'file'
      || item === 'embeddings'
    ))
}

/**
 * 根据输入/输出模态推导模型主类。
 *
 * 说明：
 * - 这里只做 OpenRouter 目录层面能稳定判断的主类推断；
 * - 无法确定时返回 `undefined`，交给后续 provider 规则和 fallback 引擎继续补足。
 */
function deriveKind(inputModalities: ReadonlyArray<ModelModality>, outputModalities: ReadonlyArray<ModelModality>): ModelKind | undefined {
  if (outputModalities.includes('embeddings')) return 'embedding'
  if (outputModalities.includes('video')) return 'video-generation'
  if (outputModalities.includes('image') && !outputModalities.includes('text')) return 'image-generation'
  if (outputModalities.includes('audio') && outputModalities.includes('text')) return 'audio-chat'
  if (outputModalities.includes('text') && (inputModalities.includes('image') || inputModalities.includes('audio') || inputModalities.includes('file'))) {
    return 'multimodal-chat'
  }
  if (outputModalities.length === 1 && outputModalities[0] === 'text') return 'chat'
  return undefined
}

/**
 * 从模态、支持参数和定价字段中推导 feature hints。
 *
 * 说明：
 * - 这里的结果是“提示性能力”，用于 registry 基线，不等同于最终运行时强校验；
 * - 会去重，避免同一能力被多个来源重复写入。
 */
function deriveFeatureHints(
  inputModalities: ReadonlyArray<ModelModality>,
  outputModalities: ReadonlyArray<ModelModality>,
  supportedParameters: ReadonlyArray<string>,
  pricing?: Readonly<Record<string, string>>,
): ModelFeature[] {
  const features: ModelFeature[] = []
  const supported = new Set(supportedParameters.map((item) => String(item || '').trim().toLowerCase()))
  if (inputModalities.includes('image')) features.push('vision-input')
  if (inputModalities.includes('audio')) features.push('audio-input')
  if (inputModalities.includes('file')) features.push('file-input')
  if (outputModalities.includes('image')) features.push('image-output')
  if (outputModalities.includes('audio')) features.push('audio-output')
  if (supported.has('tools') || supported.has('tool_choice')) features.push('tool-call')
  if (supported.has('structured_outputs') || supported.has('response_format')) features.push('structured-output')
  if (supported.has('reasoning') || supported.has('include_reasoning') || pricing?.internal_reasoning) {
    features.push('reasoning')
  }
  if (pricing?.web_search) features.push('native-web-search')
  return Array.from(new Set(features))
}

/** 规范化上下文长度，只接受大于 0 的有限数字。 */
function normalizeContextLength(raw: number | null | undefined): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return undefined
  return raw
}

/**
 * OpenRouter 主目录连接器。
 */
export const openrouterSeedConnector: MetadataConnector = {
  id: 'openrouter-seed',
  providerTypes: [],
  capabilities: {
    publicCatalog: true,
    providerCatalog: false,
    modelDetail: false,
    upstreamRefs: true,
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
    const response = await fetch('https://openrouter.ai/api/v1/models?output_modalities=all', {
      method: 'GET',
      signal: ctx.signal,
    })
    if (!response.ok) {
      throw new Error(`openrouter models fetch failed: ${response.status} ${response.statusText}`)
    }
    const json = openRouterResponseSchema.parse(await response.json())
    return json.data.map((item) => ({
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
  normalizeEntry(entry) {
    const item = openRouterModelSchema.parse(entry.raw)
    const inputModalities = toModalities(item.architecture?.input_modalities)
    const outputModalities = toModalities(item.architecture?.output_modalities)
    const supportedParameters = (item.supported_parameters ?? []).map((value) => String(value || '').trim()).filter(Boolean)
    const displaySplit = splitVendorAndModelFromDisplayName(item.name ?? '')
    const references = [
      { system: 'openrouter', refType: 'model-id', value: item.id } as const,
      ...(item.canonical_slug ? [{ system: 'openrouter', refType: 'canonical', value: item.canonical_slug } as const] : []),
      ...(item.hugging_face_id ? [{ system: 'public-official', refType: 'upstream', value: item.hugging_face_id } as const] : []),
    ]
    return [{
      sourcePriority: 'seed',
      rawModelId: item.id,
      displayName: item.name,
      description: item.description ?? undefined,
      vendorHint: displaySplit.vendorPart,
      modelHint: displaySplit.modelPart,
      kindHint: deriveKind(inputModalities, outputModalities),
      inputModalities,
      outputModalities,
      featureHints: deriveFeatureHints(inputModalities, outputModalities, supportedParameters, item.pricing),
      contextLength: normalizeContextLength(item.context_length),
      pricing: item.pricing,
      references,
      scopeHint: 'public',
      supportedParameters,
      confidence: 'high',
      fetchedAt: new Date().toISOString(),
    } satisfies MetadataEvidence]
  },
}
