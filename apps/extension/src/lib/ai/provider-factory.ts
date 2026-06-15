/**
 * 说明：`provider-factory` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-factory` 相关的当前文件实现与模块边界；
 * - 对外暴露 `createLanguageModel`、`createEmbeddingModel`、`createImageModel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：Provider 工厂——根据 ProviderConfig 创建 AI SDK 的模型实例。
 *
 * 说明：
 * - 本模块把创建逻辑委托给 provider adapter registry。
 * - 每种 provider type 由各自的 adapter 负责（见 ./providers/），并在 import 时自注册。
 *
 * 设计约束：对外暴露的创建函数签名保持稳定，便于上层以统一方式调用。
 */

import type {
  LanguageModelV3,
  RerankingModelV3,
  SpeechModelV3,
  TranscriptionModelV3,
} from '@ai-sdk/provider'
import type { EmbeddingModel, ImageModel } from 'ai'
import type { ProviderConfig } from './types'
import { loadAdapter } from './providers/load-adapter'
import type { ProviderModerationResult } from './providers/adapter-types'
import { I18nError } from '@/lib/i18n/error'

/**
 * 根据 ProviderConfig + modelId 创建 AI SDK LanguageModel 实例。
 */
export async function createLanguageModel(config: ProviderConfig, modelId: string): Promise<LanguageModelV3> {
  const adapter = await loadAdapter(config.type)
  if (!adapter) {
    throw new I18nError('errors.providerTypeUnsupported', { providerType: String((config as { type?: unknown }).type) })
  }
  return adapter.createLanguageModel(config, modelId)
}

/**
 * 根据 ProviderConfig + modelId 创建 AI SDK EmbeddingModel 实例。
 */
export async function createEmbeddingModel(config: ProviderConfig, modelId: string): Promise<EmbeddingModel> {
  const adapter = await loadAdapter(config.type)
  if (!adapter || !adapter.createEmbeddingModel) {
    throw new I18nError('errors.providerTypeEmbeddingNotSupported', { providerType: String(config.type) })
  }
  return adapter.createEmbeddingModel(config, modelId)
}

/**
 * 根据 ProviderConfig + modelId 创建 AI SDK ImageModel 实例。
 */
export async function createImageModel(config: ProviderConfig, modelId: string): Promise<ImageModel> {
  const adapter = await loadAdapter(config.type)
  if (!adapter || !adapter.createImageModel) {
    throw new I18nError('errors.providerTypeImageGenNotSupported', { providerType: String(config.type) })
  }
  return adapter.createImageModel(config, modelId)
}

/**
 * 根据 ProviderConfig + modelId 创建 AI SDK RerankingModel 实例。
 */
export async function createRerankModel(config: ProviderConfig, modelId: string): Promise<RerankingModelV3> {
  const adapter = await loadAdapter(config.type)
  if (!adapter || !adapter.createRerankModel) {
    throw new I18nError('errors.providerTypeRerankNotSupported', { providerType: String(config.type) })
  }
  return adapter.createRerankModel(config, modelId)
}

/**
 * 根据 ProviderConfig + modelId 创建 AI SDK TranscriptionModel 实例。
 */
export async function createTranscriptionModel(config: ProviderConfig, modelId: string): Promise<TranscriptionModelV3> {
  const adapter = await loadAdapter(config.type)
  if (!adapter || !adapter.createTranscriptionModel) {
    throw new I18nError('errors.providerTypeTranscriptionNotSupported', { providerType: String(config.type) })
  }
  return adapter.createTranscriptionModel(config, modelId)
}

/**
 * 根据 ProviderConfig + modelId 创建 AI SDK SpeechModel 实例。
 */
export async function createSpeechModel(config: ProviderConfig, modelId: string): Promise<SpeechModelV3> {
  const adapter = await loadAdapter(config.type)
  if (!adapter || !adapter.createSpeechModel) {
    throw new I18nError('errors.providerTypeSpeechNotSupported', { providerType: String(config.type) })
  }
  return adapter.createSpeechModel(config, modelId)
}

/**
 * 根据 ProviderConfig + modelId 执行一次内容审核。
 */
export async function runModeration(config: ProviderConfig, modelId: string, input: string, signal?: AbortSignal): Promise<ProviderModerationResult> {
  const adapter = await loadAdapter(config.type)
  if (!adapter || !adapter.moderate) {
    throw new I18nError('errors.providerTypeModerationNotSupported', { providerType: String(config.type) })
  }
  return await adapter.moderate(config, modelId, input, signal)
}
