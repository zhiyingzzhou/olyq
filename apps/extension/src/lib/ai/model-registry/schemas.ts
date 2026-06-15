/**
 * 说明：`schemas` AI 能力模块。
 *
 * 职责：
 * - 承载 `schemas` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ExternalRefSchema`、`MetadataEvidenceSchema`、`ModelLineageSchema` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型注册表 Zod Schema。
 *
 * 说明：
 * - 这里只保留 registry snapshot 与 runtime evidence 的结构校验；
 * - 历史手工维护链路对应的 schema 已彻底删除；
 * - 任何落盘前数据都必须先通过这里，再进入 `normalizeModelRegistryForStorage()`。
 */

import { z } from 'zod'
import { parseCanonicalId } from './identity'

/** 模型作用域枚举。 */
const modelScopeSchema = z.enum(['public', 'provider', 'local'])
/** 模型主类型枚举。 */
const modelKindSchema = z.enum([
  'chat',
  'multimodal-chat',
  'audio-chat',
  'transcription',
  'speech-generation',
  'moderation',
  'image-generation',
  'video-generation',
  'embedding',
  'rerank',
  'unknown',
])
/** 输入/输出模态枚举。 */
const modelModalitySchema = z.enum(['text', 'image', 'audio', 'video', 'file', 'embeddings'])
/** 模型语义特性枚举。 */
const modelFeatureSchema = z.enum([
  'vision-input',
  'audio-input',
  'audio-model',
  'file-input',
  'tool-call',
  'structured-output',
  'reasoning',
  'native-web-search',
  'image-output',
  'audio-output',
  'transcription',
  'moderation',
])
/** 运行时传输协议枚举。 */
const transportProtocolSchema = z.enum([
  'openai-chat',
  'openai-responses',
  'anthropic-messages',
  'gemini-generate-content',
  'cohere-chat',
  'bedrock-converse',
  'embedding-api',
  'rerank-api',
  'image-api',
  'video-api',
  'transcription-api',
  'speech-api',
  'moderation-api',
  'unknown',
])
/** 解析可信度枚举。 */
const resolveConfidenceSchema = z.enum(['high', 'medium', 'low'])
/** 证据来源优先级枚举。 */
const sourcePrioritySchema = z.enum(['provider-official', 'public-official', 'seed'])
/** 别名命中方式枚举。 */
const aliasMatchTypeSchema = z.enum([
  'hugging-face-id',
  'openrouter-canonical-slug',
  'openrouter-id',
  'upstream-ref',
  'provider-official-id',
  'leaf-unique',
])
/** Provider 解析来源枚举。 */
const providerResolveSourceSchema = z.enum(['provider-map', 'alias-index', 'base-model-alias', 'provider-path', 'scoped-fallback'])
/** 外部引用系统枚举。 */
const externalRefSystemSchema = z.enum(['openrouter', 'provider-official', 'public-official'])
/** 外部引用类型枚举。 */
const externalRefTypeSchema = z.enum(['canonical', 'alias', 'upstream', 'model-id', 'model-url', 'base-model', 'custom-upload'])

/**
 * 兼容旧坏快照里的 `contextLength: 0` / 负数 / NaN。
 *
 * 说明：
 * - 这不是保留旧链路，而是为了让已经写进 storage 的坏 seed 快照能够被当前新链路本地清洗并重新落盘；
 * - 若这里直接 parse 失败，`loadModelRegistry()` 会把整个 registry 视为空表，随后反复触发重新同步，形成用户看到的死循环请求。
 */
const positiveNumberOrUndefinedSchema = z.preprocess((value) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return value
}, z.number().finite().positive().optional())

/** provider/model scoped 的原生请求参数支持列表。 */
const supportedParametersSchema = z.array(z.string().trim().min(1)).transform((items) => {
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}).optional()

/**
 * 外部引用结构。
 *
 * 说明：
 * - 用于把 canonical 模型和 OpenRouter、Provider 官方目录、公共官方来源之间建立可追溯链接；
 * - `providerType` / `providerId` 只在引用确实来自某个平台实例时才出现。
 */
export const ExternalRefSchema = z.object({
  system: externalRefSystemSchema,
  providerType: z.string().trim().min(1).optional(),
  providerId: z.string().trim().min(1).optional(),
  refType: externalRefTypeSchema,
  value: z.string().trim().min(1),
})

/**
 * 元数据证据结构。
 *
 * 说明：
 * - 这是 registry 重建时参与合并的最小证据单元；
 * - 允许只带部分字段，因为不同连接器拿到的信息完整度并不一致。
 */
export const MetadataEvidenceSchema = z.object({
  sourcePriority: sourcePrioritySchema,
  providerType: z.string().trim().min(1).optional(),
  providerId: z.string().trim().min(1).optional(),
  rawModelId: z.string().trim().min(1).optional(),
  displayName: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  vendorHint: z.string().trim().min(1).optional(),
  modelHint: z.string().trim().min(1).optional(),
  kindHint: modelKindSchema.optional(),
  inputModalities: z.array(modelModalitySchema).optional(),
  outputModalities: z.array(modelModalitySchema).optional(),
  featureHints: z.array(modelFeatureSchema).optional(),
  contextLength: positiveNumberOrUndefinedSchema,
  pricing: z.record(z.string(), z.string()).optional(),
  references: z.array(ExternalRefSchema).optional(),
  scopeHint: modelScopeSchema.optional(),
  customModelHint: z.boolean().optional(),
  transportHints: z.array(transportProtocolSchema).optional(),
  supportedParameters: supportedParametersSchema,
  confidence: resolveConfidenceSchema,
  fetchedAt: z.string().trim().min(1),
})

/** 模型血缘结构。 */
export const ModelLineageSchema = z.object({
  baseCanonicalId: z.string().trim().min(1).optional(),
  derivedFromRawId: z.string().trim().min(1).optional(),
  isDerived: z.boolean(),
  isCustom: z.boolean().optional(),
})

/**
 * 公共 canonical 模型记录结构。
 *
 * 说明：
 * - 这是 registry 中可跨 Provider 复用的主记录；
 * - `canonicalId` 必须满足当前 public/provider/local 规范主键格式。
 */
export const CanonicalModelRecordSchema = z.object({
  canonicalId: z.string().trim().min(1).refine((value) => parseCanonicalId(value) !== null, {
    message: 'canonicalId 必须是 public/provider/local 规范主键',
  }),
  baseModelKey: z.string().trim().min(1),
  scope: modelScopeSchema,
  vendorSlug: z.string().trim().min(1),
  modelSlug: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  shortName: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  kind: modelKindSchema,
  inputModalities: z.array(modelModalitySchema),
  outputModalities: z.array(modelModalitySchema),
  features: z.array(modelFeatureSchema),
  contextLength: positiveNumberOrUndefinedSchema,
  pricing: z.record(z.string(), z.string()).optional(),
  lineage: ModelLineageSchema.optional(),
  references: z.array(ExternalRefSchema),
  sourcePriority: sourcePrioritySchema,
  confidence: resolveConfidenceSchema,
  createdAt: z.string().trim().min(1).optional(),
  updatedAt: z.string().trim().min(1),
})

/** 别名索引记录结构。 */
export const AliasRecordSchema = z.object({
  aliasKey: z.string().trim().min(1),
  rawId: z.string().trim().min(1),
  normalizedId: z.string().trim().min(1),
  providerType: z.string().trim().min(1).optional(),
  providerId: z.string().trim().min(1).optional(),
  displayName: z.string().trim().min(1).optional(),
  canonicalId: z.string().trim().min(1),
  matchType: aliasMatchTypeSchema,
  confidence: resolveConfidenceSchema,
})

/** Provider 原始模型到 canonical 的快速映射结构。 */
export const ProviderModelRecordSchema = z.object({
  providerType: z.string().trim().min(1),
  providerId: z.string().trim().min(1),
  rawModelId: z.string().trim().min(1),
  canonicalId: z.string().trim().min(1),
  transportProtocol: transportProtocolSchema,
  supportedParameters: supportedParametersSchema,
  resolvedBy: providerResolveSourceSchema,
})

/** provider/local 作用域模型记录结构。 */
export const ProviderScopedModelRecordSchema = z.object({
  scopedId: z.string().trim().min(1),
  scope: z.enum(['provider', 'local']),
  providerType: z.string().trim().min(1),
  providerId: z.string().trim().min(1),
  rawModelId: z.string().trim().min(1),
  canonicalId: z.string().trim().min(1),
  baseModelKey: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  kind: modelKindSchema,
  inputModalities: z.array(modelModalitySchema),
  outputModalities: z.array(modelModalitySchema),
  features: z.array(modelFeatureSchema),
  lineage: ModelLineageSchema.optional(),
  transportProtocol: transportProtocolSchema,
  supportedParameters: supportedParametersSchema,
  confidence: resolveConfidenceSchema,
  updatedAt: z.string().trim().min(1),
})

/** 注册表同步元信息结构。 */
export const RegistrySyncMetaSchema = z.object({
  openrouterLastAttemptAt: z.string().trim().min(1).optional(),
  openrouterLastSyncAt: z.string().trim().min(1).optional(),
  openrouterLastSyncStatus: z.enum(['success', 'error']).optional(),
  openrouterLastError: z.string().trim().min(1).optional(),
  openrouterBackoffUntil: z.string().trim().min(1).optional(),
  seedEvidences: z.array(MetadataEvidenceSchema).optional(),
  lastRebuildAt: z.string().trim().min(1).optional(),
  lastRebuildSummary: z.string().trim().min(1).optional(),
})

/** 整体模型注册表快照结构。 */
export const ModelRegistryStateSchema = z.object({
  schema: z.literal(2),
  generatedAt: z.string().trim().min(1),
  openrouterLastSyncAt: z.string().trim().min(1).optional(),
  canonicalModels: z.record(z.string(), CanonicalModelRecordSchema),
  aliasIndex: z.record(z.string(), AliasRecordSchema),
  providerModelMap: z.record(z.string(), ProviderModelRecordSchema),
  providerScopedModels: z.record(z.string(), ProviderScopedModelRecordSchema),
  syncMeta: RegistrySyncMetaSchema,
})
