/**
 * 说明：`index` AI 能力模块。
 *
 * 职责：
 * - 承载 `index` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MODEL_REGISTRY_CONNECTORS`、`getMetadataConnectorsByProviderType` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 连接器注册表。
 */

import type { MetadataConnector } from '../types'
import { anthropicConnector } from './anthropic'
import { cohereConnector } from './cohere'
import { dashscopeConnector } from './dashscope'
import { fireworksConnector } from './fireworks'
import { geminiConnector } from './gemini'
import { groqConnector } from './groq'
import { newApiConnector } from './new-api'
import { ollamaConnector } from './ollama'
import { openaiConnector } from './openai'
import { openrouterSeedConnector } from './openrouter-seed'
import { siliconflowConnector } from './siliconflow'
import { togetherConnector } from './together'

export { openrouterSeedConnector } from './openrouter-seed'

/** 已注册的所有模型元数据连接器。 */
export const MODEL_REGISTRY_CONNECTORS: ReadonlyArray<MetadataConnector> = [
  openrouterSeedConnector,
  siliconflowConnector,
  fireworksConnector,
  togetherConnector,
  groqConnector,
  dashscopeConnector,
  geminiConnector,
  openaiConnector,
  anthropicConnector,
  cohereConnector,
  ollamaConnector,
  newApiConnector,
]

/**
 * 按 providerType 查找连接器。
 */
export function getMetadataConnectorsByProviderType(providerType?: string): MetadataConnector[] {
  if (!providerType) return []
  return MODEL_REGISTRY_CONNECTORS.filter((connector) => connector.providerTypes.includes(providerType))
}
