/**
 * 说明：`tooluse` AI 能力模块。
 *
 * 职责：
 * - 承载 `tooluse` 相关的当前文件实现与模块边界；
 * - 对外暴露 `FUNCTION_CALLING_REGEX`、`isFunctionCallingModel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Tool Use / Function Calling 规则。
 *
 * 规则来源：
 * - 官方模型文档
 * - 本仓库内部模型类型约定
 *
 * 维护约束：
 * - 这里只做 fallback 识别，官方目录若已显式给出 `tool-call` 特性，应优先使用官方字段；
 * - DeepSeek Hybrid 在不同 provider 上存在能力差异，这里保留内部同类限制逻辑。
 */

import type { ModelTypeDescriptor } from './types'
import { getNormalizedModelIdentity, getNormalizedModelName, normalizeProviderToken } from './utils'
import { isEmbeddingModel, isRerankModel } from './embedding'
import { isDeepSeekHybridInferenceModel } from './reasoning'
import { isTextToImageModel } from './vision'

const FUNCTION_CALLING_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4',
  'gpt-4.5',
  'gpt-oss(?:-[\\w-]+)',
  'gpt-5(?:-[0-9-]+)?',
  'o(1|3|4)(?:-[\\w-]+)?',
  'claude',
  'qwen',
  'qwen3',
  'hunyuan',
  'deepseek',
  'glm-4(?:-[\\w-]+)?',
  'glm-4.5(?:-[\\w-]+)?',
  'glm-4.7(?:-[\\w-]+)?',
  'glm-5(?:-[\\w-]+)?',
  'learnlm(?:-[\\w-]+)?',
  'gemini(?:-[\\w-]+)?',
  'grok-3(?:-[\\w-]+)?',
  'grok-4(?:-[\\w-]+)?',
  'doubao-seed-1[.-][68](?:-[\\w-]+)?',
  'doubao-seed-2[.-]0(?:-[\\w-]+)?',
  'doubao-seed-code(?:-[\\w-]+)?',
  'kimi-k2(?:-[\\w-]+)?',
  'ling-\\w+(?:-[\\w-]+)?',
  'ring-\\w+(?:-[\\w-]+)?',
  'minimax-m2(?:\\.\\d+)?(?:-[\\w-]+)?',
  'mimo-v2-flash',
  'mimo-v2-pro',
  'mimo-v2-omni',
] as const

const FUNCTION_CALLING_EXCLUDED_MODELS = [
  'aqa(?:-[\\w-]+)?',
  'imagen(?:-[\\w-]+)?',
  'o1-mini',
  'o1-preview',
  'aidc-ai/marco-o1',
  'gemini-1(?:\\.[\\w-]+)?',
  'qwen-mt(?:-[\\w-]+)?',
  'gpt-5-chat(?:-[\\w-]+)?',
  'glm-4\\.5v',
  'gemini-2.5-flash-image(?:-[\\w-]+)?',
  'gemini-2.0-flash-preview-image-generation',
  'gemini-3(?:\\.\\d+)?-pro-image(?:-[\\w-]+)?',
  'deepseek-v3.2-speciale',
] as const

/**
 * 复杂正则说明：
 * - 正向部分覆盖当前内部规则确认过的主要工具调用模型族；
 * - 反向部分显式排除 image / preview / mt 等已知不支持函数调用的变体；
 * - 这是 fallback 规则，命中后只增加 `tool-call` 特性，不强行覆盖官方目录结果。
 */
export const FUNCTION_CALLING_REGEX = new RegExp(
  `\\b(?!(?:${FUNCTION_CALLING_EXCLUDED_MODELS.join('|')})\\b)(?:${FUNCTION_CALLING_MODELS.join('|')})\\b`,
  'i',
)

/** 是否支持工具调用。 */
export function isFunctionCallingModel(descriptor: ModelTypeDescriptor): boolean {
  if (isEmbeddingModel(descriptor) || isRerankModel(descriptor) || isTextToImageModel(descriptor)) {
    return false
  }

  const providerToken = normalizeProviderToken(descriptor.providerType || descriptor.providerId)
  const modelId = getNormalizedModelIdentity(descriptor)
  const modelName = getNormalizedModelName(descriptor)

  if (providerToken === 'doubao' || modelId.includes('doubao')) {
    return FUNCTION_CALLING_REGEX.test(modelName || modelId) || FUNCTION_CALLING_REGEX.test(modelId)
  }

  /**
   * DeepSeek Hybrid 内部特例：
   * - DashScope / Doubao 当前不稳定支持函数调用；
   * - 其它 provider 先按“支持”处理，避免把真正可用的 hybrid 模型压成 false negative。
   */
  if (isDeepSeekHybridInferenceModel(descriptor)) {
    if (providerToken === 'dashscope' || providerToken === 'doubao') return false
    return true
  }

  return FUNCTION_CALLING_REGEX.test(modelId)
}
