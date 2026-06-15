/**
 * 说明：`types` AI 能力模块。
 *
 * 职责：
 * - 承载 `types` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelCapabilityKey`、`ModelTypeSource`、`ModelTypeDescriptor` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型类型系统核心类型。
 *
 * 为什么存在：
 * - 这一层是扩展端“模型类型”单一真源的纯函数协议；
 * - 它把 OpenRouter 公共基线、各平台官方规则、用户手动模型类型覆盖收束到同一套输入输出；
 * - 它与 React、storage、路由完全解耦，便于 registry、运行时、模型管理面板与测试复用。
 */

import type {
  ModelFeature,
  ModelKind,
  ModelModality,
  ProviderCatalogTypeHint,
  TransportProtocol,
  UserModelType,
} from '../types'
import type { ExternalRef } from '../model-registry/types'

/**
 * 模型能力键。
 *
 * 说明：
 * - 这是系统内部用于表达“模型除了主类之外还带哪些能力”的统一集合；
 * - 用户可编辑的 8 类模型类型是它的子集；
 * - `structured_output`、`image_output` 等属于系统只读能力，不对用户暴露成手工开关。
 */
export type ModelCapabilityKey =
  | UserModelType
  | 'audio_model'
  | 'transcription'
  | 'moderation'
  | 'structured_output'
  | 'image_output'
  | 'audio_input'
  | 'audio_output'
  | 'file_input'

/**
 * 当前模型类型结果来自哪一层。
 *
 * 说明：
 * - 一个最终结果通常会叠加多层来源，因此在 `ModelTypeResult.sources` 中可能同时出现多个值；
 * - 这些来源标记主要用于调试、解释和回溯，不直接参与 UI 网络目标判断。
 */
export type ModelTypeSource =
  | 'openrouter-baseline'
  | 'provider-rule-supplement'
  | 'provider-explicit-fallback'
  | 'transport-protocol'
  | 'user-model-type-override'
  | 'unknown'

/** 规则引擎输入。 */
export interface ModelTypeDescriptor {
  /** Provider 类型。 */
  readonly providerType?: string
  /** Provider 实例 ID。 */
  readonly providerId?: string
  /** 原始模型 ID。 */
  readonly rawModelId: string
  /** 可选：原始显示名。 */
  readonly rawModelName?: string
  /** 可选：显式协议提示。 */
  readonly transportProtocol?: TransportProtocol
  /** 可选：目录显式主类提示。 */
  readonly kindHint?: ModelKind
  /** 可选：目录显式 unsupported 类型提示。 */
  readonly providerCatalogTypeHint?: ProviderCatalogTypeHint
  /** 可选：目录显式输入模态。 */
  readonly inputModalities?: ReadonlyArray<ModelModality>
  /** 可选：目录显式输出模态。 */
  readonly outputModalities?: ReadonlyArray<ModelModality>
  /** 可选：目录显式能力提示。 */
  readonly features?: ReadonlyArray<ModelFeature>
  /** 可选：外部引用。 */
  readonly references?: ReadonlyArray<ExternalRef>
}

/** OpenRouter 公共模型基线。 */
export interface OpenRouterBaseline {
  /** OpenRouter 公共模型主类。 */
  readonly kind: ModelKind
  /** OpenRouter 公共模型输入模态。 */
  readonly inputModalities: ReadonlyArray<ModelModality>
  /** OpenRouter 公共模型输出模态。 */
  readonly outputModalities: ReadonlyArray<ModelModality>
  /** OpenRouter 公共模型系统能力。 */
  readonly capabilities: ReadonlyArray<ModelCapabilityKey>
  /** OpenRouter 公共模型显示名。 */
  readonly displayName?: string
}

/** 规则效果。 */
export interface ProviderRuleEffects {
  /** 设置更具体的主类。 */
  readonly setPrimaryKind?: ModelKind
  /** 显式覆盖输入模态。 */
  readonly setInputModalities?: ReadonlyArray<ModelModality>
  /** 显式覆盖输出模态。 */
  readonly setOutputModalities?: ReadonlyArray<ModelModality>
  /** 增加能力。 */
  readonly addCapabilities?: ReadonlyArray<ModelCapabilityKey>
  /** 排除能力。 */
  readonly excludeCapabilities?: ReadonlyArray<ModelCapabilityKey>
}

/** 单条平台模型规则。 */
export interface ProviderModelRule {
  /** 规则 ID。 */
  readonly id: string
  /** 该规则适用的平台。 */
  readonly providers: ReadonlyArray<string>
  /** 命中优先级，数字越大越先执行。 */
  readonly priority: number
  /** 官方来源链接。 */
  readonly sourceUrl: string
  /** 当前规则核对日期。 */
  readonly verifiedAt: '2026-03-25'
  /** 代表性模型示例。 */
  readonly examples: ReadonlyArray<string>
  /** 规则说明。 */
  readonly notes: string
  /** 是否命中。 */
  readonly match: (descriptor: ModelTypeDescriptor) => boolean
  /** 命中后施加的效果。 */
  readonly effects: ProviderRuleEffects
}

/**
 * 中间阶段的可变结果。
 *
 * 说明：
 * - 这是类型推导流水线内部逐步累积的状态快照；
 * - 字段都允许缺省，表示该阶段尚未对对应维度做出有效判断。
 */
export interface PartialModelTypeState {
  /** 当前阶段推导出的主类。 */
  readonly kind?: ModelKind
  /** 当前阶段累计出的系统能力。 */
  readonly capabilities?: ReadonlyArray<ModelCapabilityKey>
  /** 当前阶段推导出的输入模态。 */
  readonly inputModalities?: ReadonlyArray<ModelModality>
  /** 当前阶段推导出的输出模态。 */
  readonly outputModalities?: ReadonlyArray<ModelModality>
  /** 当前阶段推导出的协议。 */
  readonly transportProtocol?: TransportProtocol
  /** 当前阶段已记录的来源层列表。 */
  readonly sources?: ReadonlyArray<ModelTypeSource>
  /** 面向维护者的阶段性解释。 */
  readonly reason?: string
}

/** 对外完整模型类型结果。 */
export interface ModelTypeResult {
  /** 最终主类。 */
  readonly kind: ModelKind
  /** 最终输入模态。 */
  readonly inputModalities: ReadonlyArray<ModelModality>
  /** 最终输出模态。 */
  readonly outputModalities: ReadonlyArray<ModelModality>
  /** 内部系统能力键。 */
  readonly capabilities: ReadonlyArray<ModelCapabilityKey>
  /** 为兼容现有运行时链路保留的内部能力字段。 */
  readonly features: ReadonlyArray<ModelFeature>
  /** 最终路由协议。 */
  readonly transportProtocol: TransportProtocol
  /** 该结果由哪些层共同组成。 */
  readonly sources: ReadonlyArray<ModelTypeSource>
  /** 面向维护者的原因说明。 */
  readonly reason: string
}
