/**
 * 说明：`provider-capabilities` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-capabilities` 相关的当前文件实现与模块边界；
 * - 对外暴露 `getProviderRuntimeCapabilities`、`supportsEmbeddingProvider`、`supportsImageProvider` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ProviderConfig, ProviderType } from './types'
import {
  EMPTY_PROVIDER_RUNTIME_CAPABILITIES,
  type ProviderRuntimeCapabilities,
  type RuntimeCapabilityProtocol,
} from './providers/adapter-types'
import { getAdapter } from './providers/load-adapter'

type ProviderCapabilityInput =
  | ProviderType
  | Pick<ProviderConfig, 'type'>
  | Pick<ProviderConfig, 'id' | 'type'>

/**
 * 内部函数：`toCapabilityConfig`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function toCapabilityConfig(config: ProviderCapabilityInput): ProviderConfig {
  if (typeof config === 'string') {
    return {
      id: '',
      name: '',
      type: config,
      enabled: false,
      apiKey: '',
      apiHost: '',
      models: [],
    }
  }

  return {
    id: '',
    name: '',
    enabled: false,
    apiKey: '',
    apiHost: '',
    models: [],
    ...config,
  }
}

/**
 * 导出函数：`getProviderRuntimeCapabilities`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function getProviderRuntimeCapabilities(config: ProviderCapabilityInput): ProviderRuntimeCapabilities {
  const resolvedConfig = toCapabilityConfig(config)
  const adapter = getAdapter(resolvedConfig.type)
  if (!adapter) return EMPTY_PROVIDER_RUNTIME_CAPABILITIES
  return adapter.getRuntimeCapabilities(resolvedConfig)
}

/**
 * 内部函数：`supportsRuntimeProtocol`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function supportsRuntimeProtocol(
  config: ProviderCapabilityInput,
  protocol: RuntimeCapabilityProtocol,
): boolean {
  return getProviderRuntimeCapabilities(config)[protocol]
}

/**
 * 导出函数：`supportsEmbeddingProvider`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function supportsEmbeddingProvider(config: ProviderCapabilityInput): boolean {
  return supportsRuntimeProtocol(config, 'embedding-api')
}

/**
 * 导出函数：`supportsImageProvider`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function supportsImageProvider(config: ProviderCapabilityInput): boolean {
  return supportsRuntimeProtocol(config, 'image-api')
}

/**
 * 导出函数：`supportsRerankProvider`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function supportsRerankProvider(config: ProviderCapabilityInput): boolean {
  return supportsRuntimeProtocol(config, 'rerank-api')
}

/**
 * 导出函数：`supportsTranscriptionProvider`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function supportsTranscriptionProvider(config: ProviderCapabilityInput): boolean {
  return supportsRuntimeProtocol(config, 'transcription-api')
}

/**
 * 导出函数：`supportsSpeechProvider`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function supportsSpeechProvider(config: ProviderCapabilityInput): boolean {
  return supportsRuntimeProtocol(config, 'speech-api')
}

/**
 * 导出函数：`supportsModerationProvider`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function supportsModerationProvider(config: ProviderCapabilityInput): boolean {
  return supportsRuntimeProtocol(config, 'moderation-api')
}
