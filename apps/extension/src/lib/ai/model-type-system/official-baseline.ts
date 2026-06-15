/**
 * 说明：`official-baseline` AI 能力模块。
 *
 * 职责：
 * - 承载 `official-baseline` 相关的当前文件实现与模块边界；
 * - 对外暴露 `createOpenRouterBaselineState`、`hasExplicitProviderSignals`、`hasExplicitProviderPrimarySignals` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 官方基础语义层。
 *
 * 为什么存在：
 * - 用户要求把 OpenRouter 公共目录作为“公共模型基础真源”；
 * - 同时当前 provider 目录里的显式字段（kindHint / modalities / features）也需要有独立入口，
 *   但它们只能作为 fallback 或补充，不能和 OpenRouter 基线混成一层；
 * - 这里把两类“官方字段”统一转换成 `PartialModelTypeState`，供 `engine.ts` 按固定顺序组合。
 */

import type { OpenRouterBaseline, PartialModelTypeState, ModelTypeDescriptor } from './types'
import { uniqStrings } from './shared/normalize'
import {
  createUnknownModelTypeState,
  deriveCapabilityHintsFromModalities,
  deriveKindFromModalities,
  toModelCapabilities,
} from './utils'

/**
 * 内部函数：`getUnsupportedCatalogTypeCapability`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function getUnsupportedCatalogTypeCapability(
  hint: ModelTypeDescriptor['providerCatalogTypeHint'],
): PartialModelTypeState['capabilities'] {
  switch (hint) {
    case 'audio':
      return ['audio_model']
    case 'transcribe':
      return ['transcription']
    case 'moderation':
      return ['moderation']
    default:
      return []
  }
}

/** 将 OpenRouter 公共基线转成内部状态。 */
export function createOpenRouterBaselineState(
  baseline: OpenRouterBaseline | undefined,
): PartialModelTypeState {
  if (!baseline) {
    return createUnknownModelTypeState('当前模型没有可复用的 OpenRouter 公共基线', 'unknown')
  }

  return {
    kind: baseline.kind,
    inputModalities: uniqStrings(baseline.inputModalities),
    outputModalities: uniqStrings(baseline.outputModalities),
    capabilities: uniqStrings([
      ...baseline.capabilities,
      ...deriveCapabilityHintsFromModalities(baseline.inputModalities, baseline.outputModalities),
    ]),
    sources: ['openrouter-baseline'],
    reason: `命中 OpenRouter 公共模型基线${baseline.displayName ? `：${baseline.displayName}` : ''}`,
  }
}

/** 当前 provider 目录显式字段是否携带了可用语义。 */
export function hasExplicitProviderSignals(descriptor: ModelTypeDescriptor): boolean {
  return Boolean(
    descriptor.providerCatalogTypeHint
    || descriptor.kindHint
    || (descriptor.inputModalities && descriptor.inputModalities.length > 0)
    || (descriptor.outputModalities && descriptor.outputModalities.length > 0)
    || (descriptor.features && descriptor.features.length > 0),
  )
}

/** 当前 provider 目录是否已经给出了主类级显式信号。 */
export function hasExplicitProviderPrimarySignals(descriptor: ModelTypeDescriptor): boolean {
  return Boolean(
    descriptor.providerCatalogTypeHint
    || descriptor.kindHint
    || (descriptor.inputModalities && descriptor.inputModalities.length > 0)
    || (descriptor.outputModalities && descriptor.outputModalities.length > 0)
  )
}

/** 把 provider 目录显式字段转成 fallback 状态。 */
export function createExplicitProviderState(
  descriptor: ModelTypeDescriptor,
): PartialModelTypeState {
  if (!hasExplicitProviderSignals(descriptor)) {
    return createUnknownModelTypeState('当前 provider 目录没有显式能力字段', 'unknown')
  }

  if (descriptor.providerCatalogTypeHint) {
    return {
      kind: 'unknown',
      inputModalities: [],
      outputModalities: [],
      capabilities: getUnsupportedCatalogTypeCapability(descriptor.providerCatalogTypeHint),
      sources: ['provider-explicit-fallback'],
      reason: `命中当前 provider 目录的 unsupported 官方类型：${descriptor.providerCatalogTypeHint}`,
    }
  }

  const inputModalities = uniqStrings(descriptor.inputModalities)
  const outputModalities = uniqStrings(descriptor.outputModalities)
  const capabilities = uniqStrings([
    ...toModelCapabilities(descriptor.features),
    ...deriveCapabilityHintsFromModalities(inputModalities, outputModalities),
  ])

  return {
    kind: deriveKindFromModalities(inputModalities, outputModalities, descriptor.kindHint),
    inputModalities,
    outputModalities,
    capabilities,
    sources: ['provider-explicit-fallback'],
    reason: '命中当前 provider 目录的显式能力字段',
  }
}
