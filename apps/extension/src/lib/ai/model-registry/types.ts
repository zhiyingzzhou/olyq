/**
 * 说明：`types` AI 能力模块。
 *
 * 职责：
 * - 承载 `types` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelScope`、`ResolveConfidence`、`SourcePriority` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型注册表核心类型定义。
 *
 * 设计原则：
 * - registry 只保留“官方目录证据 + 自动分类结果 + provider 映射”的单一真源；
 * - 不再保留任何历史手工维护链路相关结构；
 * - 语义枚举统一复用 `src/lib/ai/types.ts`，避免 Provider 配置、注册表、运行时三处各自维护一套字符串。
 */

import type {
  ModelFeature,
  ModelKind,
  ModelModality,
  ProviderCatalogTypeHint,
  ProviderConfig,
  TransportProtocol,
} from '../types'

/**
 * 统一把底层 AI 语义枚举从 registry 层再导出一遍。
 *
 * 说明：
 * - `model-registry` 已经成为扩展端模型语义的主入口，许多上层模块会直接从这里取类型；
 * - 如果这里只 `import` 不 `export`，编辑器和 `tsc -p tsconfig.app.json` 会把这些类型视为“仅本文件私有”，
 *   从而导致 `openrouter-seed.ts`、`merge.ts` 等文件出现 “declares locally, but it is not exported”；
 * - 这里直接重导出，避免调用方在 `../types` 和 `./types` 两套入口之间来回切换。
 */
export type { ModelFeature, ModelKind, ModelModality, ProviderCatalogTypeHint, TransportProtocol } from '../types'

/** 模型作用域。 */
export type ModelScope =
  /** 可跨聚合平台复用、可被多个 Provider 归并到同一身份的公共模型。 */
  | 'public'
  /** 某个平台或某个账号范围内的私有/上传/派生模型。 */
  | 'provider'
  /** 本地部署或本机服务暴露的本地模型。 */
  | 'local'

/** 注册表记录可信度。 */
export type ResolveConfidence =
  /** 来自官方目录显式能力字段或高度稳定的主源。 */
  | 'high'
  /** 来自协议推断或较稳定的目录/命名规则。 */
  | 'medium'
  /** 仅能做弱推断，或者最终仍为 unknown。 */
  | 'low'

/** 模型记录来源优先级。 */
export type SourcePriority =
  /** 来自 Provider 官方目录。 */
  | 'provider-official'
  /** 来自公共官方目录。 */
  | 'public-official'
  /** 来自主目录种子源。 */
  | 'seed'

/** 模型别名命中方式。 */
export type AliasMatchType =
  /** 命中了 Hugging Face 上游模型标识。 */
  | 'hugging-face-id'
  /** 命中了 OpenRouter canonical slug。 */
  | 'openrouter-canonical-slug'
  /** 命中了 OpenRouter 原始模型 ID。 */
  | 'openrouter-id'
  /** 命中了外部上游引用。 */
  | 'upstream-ref'
  /** 命中了 Provider 官方模型 ID。 */
  | 'provider-official-id'
  /** 命中了全局唯一叶子别名。 */
  | 'leaf-unique'

/** Provider 模型映射来源。 */
export type ProviderResolveSource =
  /** 命中了已缓存的平台模型映射。 */
  | 'provider-map'
  /** 命中了 alias 索引。 */
  | 'alias-index'
  /** 未命中 raw alias，而是通过基础模型键命中 alias。 */
  | 'base-model-alias'
  /** 通过原始路径直接推导出公共 canonical。 */
  | 'provider-path'
  /** 未命中公共身份，退化为 provider/local scoped 模型。 */
  | 'scoped-fallback'

/** 外部引用系统类型。 */
export type ExternalRefSystem =
  | 'openrouter'
  | 'provider-official'
  | 'public-official'

/** 外部引用类型。 */
export type ExternalRefType =
  | 'canonical'
  | 'alias'
  | 'upstream'
  | 'model-id'
  | 'model-url'
  | 'base-model'
  | 'custom-upload'

/** 外部引用记录。 */
export interface ExternalRef {
  /** 引用所属系统。 */
  readonly system: ExternalRefSystem
  /** 可选：来源平台类型。 */
  readonly providerType?: string
  /** 可选：来源平台实例 ID。 */
  readonly providerId?: string
  /** 引用值的语义类型。 */
  readonly refType: ExternalRefType
  /** 实际引用值。 */
  readonly value: string
}

/** 模型血缘信息。 */
export interface ModelLineage {
  /** 可选：基础公共模型 ID。 */
  readonly baseCanonicalId?: string
  /** 可选：派生来源原始模型 ID。 */
  readonly derivedFromRawId?: string
  /** 是否为派生模型。 */
  readonly isDerived: boolean
  /** 是否为平台私有或用户自定义模型。 */
  readonly isCustom?: boolean
}

/** 公共模型的统一记录。 */
export interface CanonicalModelRecord {
  /** 跨运行时唯一模型 ID。 */
  readonly canonicalId: string
  /** 去掉平台包装前缀后的基础模型身份键。 */
  readonly baseModelKey: string
  /** 模型作用域。公共模型恒为 `public`。 */
  readonly scope: ModelScope
  /** 归一化后的厂商标识。 */
  readonly vendorSlug: string
  /** 归一化后的模型主标识。 */
  readonly modelSlug: string
  /** UI 展示名称。 */
  readonly displayName: string
  /** 紧凑 UI 用短名称。 */
  readonly shortName: string
  /** 可选：模型描述。 */
  readonly description?: string
  /** 模型主类型。 */
  readonly kind: ModelKind
  /** 输入模态列表。 */
  readonly inputModalities: ReadonlyArray<ModelModality>
  /** 输出模态列表。 */
  readonly outputModalities: ReadonlyArray<ModelModality>
  /** 附加特性列表。 */
  readonly features: ReadonlyArray<ModelFeature>
  /** 上下文长度。 */
  readonly contextLength?: number
  /** 上游定价原样保留。 */
  readonly pricing?: Readonly<Record<string, string>>
  /** 可选：血缘信息。 */
  readonly lineage?: ModelLineage
  /** 外部引用列表。 */
  readonly references: ReadonlyArray<ExternalRef>
  /** 当前记录的最终来源优先级。 */
  readonly sourcePriority: SourcePriority
  /** 当前记录可信度。 */
  readonly confidence: ResolveConfidence
  /** 上游创建时间。 */
  readonly createdAt?: string
  /** 最近更新时间。 */
  readonly updatedAt: string
}

/** 别名索引记录。 */
export interface AliasRecord {
  /** 别名索引键。 */
  readonly aliasKey: string
  /** 原始模型标识。 */
  readonly rawId: string
  /** 归一化后的索引值。 */
  readonly normalizedId: string
  /** 可选：限定平台类型。 */
  readonly providerType?: string
  /** 可选：限定平台实例 ID。 */
  readonly providerId?: string
  /** 可选：原始显示名。 */
  readonly displayName?: string
  /** 命中的 canonicalId。 */
  readonly canonicalId: string
  /** 命中方式。 */
  readonly matchType: AliasMatchType
  /** 命中可信度。 */
  readonly confidence: ResolveConfidence
}

/** 运行时 provider + rawModelId 到 canonicalId 的快速映射。 */
export interface ProviderModelRecord {
  /** 平台类型。 */
  readonly providerType: string
  /** 平台实例 ID。 */
  readonly providerId: string
  /** 平台原始模型 ID。 */
  readonly rawModelId: string
  /** 命中的 canonicalId。 */
  readonly canonicalId: string
  /** 该模型最终采用的传输协议。 */
  readonly transportProtocol: TransportProtocol
  /** provider/model scoped 的原生请求参数支持列表。 */
  readonly supportedParameters?: ReadonlyArray<string>
  /** 本次映射来源。 */
  readonly resolvedBy: ProviderResolveSource
}

/** provider/local 范围内的模型记录。 */
export interface ProviderScopedModelRecord {
  /** scoped 模型唯一主键。 */
  readonly scopedId: string
  /** 真实作用域。 */
  readonly scope: Exclude<ModelScope, 'public'>
  /** 平台类型。 */
  readonly providerType: string
  /** 平台实例 ID。 */
  readonly providerId: string
  /** 原始模型 ID。 */
  readonly rawModelId: string
  /** 最终 canonicalId。 */
  readonly canonicalId: string
  /** 去掉平台包装前缀后的基础模型身份键。 */
  readonly baseModelKey: string
  /** 展示名。 */
  readonly displayName: string
  /** 模型主类型。 */
  readonly kind: ModelKind
  /** 输入模态列表。 */
  readonly inputModalities: ReadonlyArray<ModelModality>
  /** 输出模态列表。 */
  readonly outputModalities: ReadonlyArray<ModelModality>
  /** 特性列表。 */
  readonly features: ReadonlyArray<ModelFeature>
  /** 可选：血缘信息。 */
  readonly lineage?: ModelLineage
  /** 传输协议。 */
  readonly transportProtocol: TransportProtocol
  /** provider/model scoped 的原生请求参数支持列表。 */
  readonly supportedParameters?: ReadonlyArray<string>
  /** 可信度。 */
  readonly confidence: ResolveConfidence
  /** 更新时间。 */
  readonly updatedAt: string
}

/** 单个连接器的能力声明。 */
export interface ConnectorCapabilities {
  /** 是否支持拉取公共目录。 */
  readonly publicCatalog: boolean
  /** 是否支持拉取平台目录。 */
  readonly providerCatalog: boolean
  /** 是否支持获取单模型详情。 */
  readonly modelDetail: boolean
  /** 是否能提供上游引用。 */
  readonly upstreamRefs: boolean
  /** 是否能提供 kind 提示。 */
  readonly kindHints: boolean
  /** 是否能提供 feature 提示。 */
  readonly featureHints: boolean
}

/** 连接器上下文。 */
export interface ConnectorContext {
  /** 平台配置。公共种子源可为空。 */
  readonly provider?: ProviderConfig
  /** 可选：取消信号。 */
  readonly signal?: AbortSignal
}

/** 连接器返回的原始目录条目。 */
export interface ConnectorModelEntry {
  /** 原始条目负载。 */
  readonly raw: unknown
  /** 原始模型 ID。 */
  readonly rawModelId: string
  /** 可选：显示名称。 */
  readonly displayName?: string
}

/** 统一元数据证据结构。 */
export interface MetadataEvidence {
  /** 证据来源优先级。 */
  readonly sourcePriority: SourcePriority
  /** 可选：来源平台类型。 */
  readonly providerType?: string
  /** 可选：来源平台实例 ID。 */
  readonly providerId?: string
  /** 可选：来源原始模型 ID。 */
  readonly rawModelId?: string
  /** 可选：显示名称。 */
  readonly displayName?: string
  /** 可选：描述。 */
  readonly description?: string
  /** 可选：厂商提示。 */
  readonly vendorHint?: string
  /** 可选：模型提示。 */
  readonly modelHint?: string
  /** 可选：官方显式 kind 提示。 */
  readonly kindHint?: ModelKind
  /** 可选：官方显式输入模态。 */
  readonly inputModalities?: ReadonlyArray<ModelModality>
  /** 可选：官方显式输出模态。 */
  readonly outputModalities?: ReadonlyArray<ModelModality>
  /** 可选：官方显式特性提示。 */
  readonly featureHints?: ReadonlyArray<ModelFeature>
  /** 可选：上下文长度。 */
  readonly contextLength?: number
  /** 可选：价格信息。 */
  readonly pricing?: Readonly<Record<string, string>>
  /** 可选：外部引用列表。 */
  readonly references?: ReadonlyArray<ExternalRef>
  /** 可选：范围提示。 */
  readonly scopeHint?: ModelScope
  /** 可选：是否偏向自定义/私有模型。 */
  readonly customModelHint?: boolean
  /** 可选：协议提示。 */
  readonly transportHints?: ReadonlyArray<TransportProtocol>
  /** 可选：provider/model scoped 的原生请求参数支持列表。 */
  readonly supportedParameters?: ReadonlyArray<string>
  /** 证据可信度。 */
  readonly confidence: ResolveConfidence
  /** 采集时间。 */
  readonly fetchedAt: string
}

/** 元数据连接器。 */
export interface MetadataConnector {
  /** 连接器唯一 ID。 */
  readonly id: string
  /** 支持的平台类型列表。 */
  readonly providerTypes: ReadonlyArray<string>
  /** 能力声明。 */
  readonly capabilities: ConnectorCapabilities
  /** 获取目录。 */
  listCatalog?(ctx: ConnectorContext): Promise<ReadonlyArray<ConnectorModelEntry>>
  /** 获取单模型详情。 */
  getModelDetail?(ctx: ConnectorContext, rawModelId: string): Promise<ConnectorModelEntry | null>
  /** 归一化连接器条目。 */
  normalizeEntry(entry: ConnectorModelEntry, ctx: ConnectorContext): ReadonlyArray<MetadataEvidence>
}

/** 注册表同步元信息。 */
export interface RegistrySyncMeta {
  /** 最近一次尝试同步 OpenRouter 的时间。 */
  readonly openrouterLastAttemptAt?: string
  /** 最近一次成功同步 OpenRouter 主目录的时间。 */
  readonly openrouterLastSyncAt?: string
  /** 最近一次同步状态。 */
  readonly openrouterLastSyncStatus?: 'success' | 'error'
  /** 最近一次同步错误。 */
  readonly openrouterLastError?: string
  /** 同步失败后的退避截止时间。 */
  readonly openrouterBackoffUntil?: string
  /** 最近一次成功同步时保存的 seed evidence 快照。 */
  readonly seedEvidences?: ReadonlyArray<MetadataEvidence>
  /** 最近一次注册表重建时间。 */
  readonly lastRebuildAt?: string
  /** 最近一次重建摘要。 */
  readonly lastRebuildSummary?: string
}

/** canonicalId 解析结果。 */
export interface ParsedCanonicalId {
  /** 原始 canonicalId。 */
  readonly canonicalId: string
  /** 解析出的作用域。 */
  readonly scope: ModelScope
  /** public 作用域下的厂商标识。 */
  readonly vendorSlug?: string
  /** public 作用域下的模型标识。 */
  readonly modelSlug?: string
  /** provider/local 作用域下的平台类型。 */
  readonly providerTypeSlug?: string
  /** provider/local 作用域下的平台实例标识。 */
  readonly providerIdSlug?: string
  /** provider/local 作用域下的平台模型标识。 */
  readonly scopedModelSlug?: string
}

/** 模型注册表完整状态。 */
export interface ModelRegistryState {
  /** 注册表结构版本。 */
  readonly schema: 2
  /** 本次生成时间。 */
  readonly generatedAt: string
  /** OpenRouter 最近一次成功同步时间。 */
  readonly openrouterLastSyncAt?: string
  /** 公共模型表。 */
  readonly canonicalModels: Record<string, CanonicalModelRecord>
  /** alias 索引表。 */
  readonly aliasIndex: Record<string, AliasRecord>
  /** provider 模型映射表。 */
  readonly providerModelMap: Record<string, ProviderModelRecord>
  /** provider/local scoped 模型表。 */
  readonly providerScopedModels: Record<string, ProviderScopedModelRecord>
  /** 同步元信息。 */
  readonly syncMeta: RegistrySyncMeta
}

/** 单次运行时解析的输入。 */
export interface ResolveModelMetaInput {
  /** 平台类型。 */
  readonly providerType?: string
  /** 平台实例 ID。 */
  readonly providerId: string
  /** 可选：平台 API Host，用于区分 local/provider。 */
  readonly apiHost?: string
  /** 原始模型 ID。 */
  readonly rawModelId: string
  /** 可选：原始显示名。 */
  readonly rawModelName?: string
  /** 可选：当前模型配置里已保存的协议提示。 */
  readonly transportProtocol?: TransportProtocol
  /** 可选：当前模型配置里已保存的官方 kind hint。 */
  readonly kindHint?: ModelKind
  /** 可选：当前 provider 官方目录返回的 unsupported 类型提示。 */
  readonly providerCatalogTypeHint?: ProviderCatalogTypeHint
  /** 可选：当前模型配置里已保存的官方输入模态。 */
  readonly inputModalities?: ReadonlyArray<ModelModality>
  /** 可选：当前模型配置里已保存的官方输出模态。 */
  readonly outputModalities?: ReadonlyArray<ModelModality>
  /** 可选：当前模型配置里已保存的官方特性提示。 */
  readonly features?: ReadonlyArray<ModelFeature>
  /** 可选：外部引用。 */
  readonly references?: ReadonlyArray<ExternalRef>
  /** 可选：当前模型配置里已保存的 provider 原生请求参数支持列表。 */
  readonly supportedParameters?: ReadonlyArray<string>
}

/** 单次运行时解析结果。 */
export interface ResolvedModelMeta {
  /** 最终 canonicalId。 */
  readonly canonicalId: string
  /** 去掉平台包装前缀后的基础模型身份键。 */
  readonly baseModelKey: string
  /** 模型作用域。 */
  readonly scope: ModelScope
  /** 模型主类型。 */
  readonly kind: ModelKind
  /** 输入模态列表。 */
  readonly inputModalities: ReadonlyArray<ModelModality>
  /** 输出模态列表。 */
  readonly outputModalities: ReadonlyArray<ModelModality>
  /** 特性列表。 */
  readonly features: ReadonlyArray<ModelFeature>
  /** 传输协议。 */
  readonly transportProtocol: TransportProtocol
  /** 展示名。 */
  readonly displayName: string
  /** 可选：描述。 */
  readonly description?: string
  /** 解析可信度。 */
  readonly confidence: ResolveConfidence
  /** 可选：provider/model scoped 的原生请求参数支持列表。 */
  readonly supportedParameters?: ReadonlyArray<string>
  /** 可选：解析跟踪信息。 */
  readonly trace?: import('./trace').ResolverTrace
}
