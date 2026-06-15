/**
 * 说明：`load-adapter` AI 能力模块。
 *
 * 职责：
 * - 承载 `load-adapter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `getAdapter`、`loadAdapter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ProviderAdapter } from './adapter-types'
import { anthropicAdapter } from './anthropic-adapter'
import { azureOpenaiAdapter } from './azure-openai-adapter'
import { bedrockAdapter } from './bedrock-adapter'
import { cohereAdapter } from './cohere-adapter'
import { dashscopeAdapter } from './dashscope-adapter'
import { deepseekAdapter } from './deepseek-adapter'
import { gatewayAdapter } from './gateway-adapter'
import { geminiAdapter } from './gemini-adapter'
import { groqAdapter } from './groq-adapter'
import { mistralAdapter } from './mistral-adapter'
import { newApiAdapter } from './new-api-adapter'
import { ollamaAdapter } from './ollama-adapter'
import { openaiAdapter } from './openai-adapter'
import { openaiResponseAdapter } from './openai-response-adapter'
import { siliconflowAdapter } from './siliconflow-adapter'
import { vertexAdapter } from './vertex-adapter'
import { vertexAnthropicAdapter } from './vertex-anthropic-adapter'
import { xaiAdapter } from './xai-adapter'

const adaptersByType: Record<string, ProviderAdapter> = {
  openai: openaiAdapter,
  'openai-response': openaiResponseAdapter,
  'azure-openai': azureOpenaiAdapter,
  anthropic: anthropicAdapter,
  cohere: cohereAdapter,
  deepseek: deepseekAdapter,
  gemini: geminiAdapter,
  groq: groqAdapter,
  mistral: mistralAdapter,
  gateway: gatewayAdapter,
  'new-api': newApiAdapter,
  'aws-bedrock': bedrockAdapter,
  vertexai: vertexAdapter,
  'vertex-anthropic': vertexAnthropicAdapter,
  ollama: ollamaAdapter,
  xai: xaiAdapter,
  dashscope: dashscopeAdapter,
  siliconflow: siliconflowAdapter,
}

/** 同步读取已注册的 provider adapter。 */
export function getAdapter(type: string): ProviderAdapter | undefined {
  const normalizedType = String(type || '').trim()
  if (!normalizedType) return undefined
  return adaptersByType[normalizedType]
}

/** 兼容现有 async 调用方的 adapter 读取入口。 */
export async function loadAdapter(type: string): Promise<ProviderAdapter | undefined> {
  return getAdapter(type)
}
