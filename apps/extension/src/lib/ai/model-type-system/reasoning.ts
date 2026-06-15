/**
 * 说明：`reasoning` AI 能力模块。
 *
 * 职责：
 * - 承载 `reasoning` 相关的当前文件实现与模块边界；
 * - 对外暴露 `REASONING_REGEX`、`isDeepSeekHybridInferenceModel`、`isReasoningModel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Reasoning 规则。
 *
 * 规则来源：
 * - 官方模型文档
 * - 本仓库内部模型类型约定
 *
 * 维护约束：
 * - 本文件只负责“是否带 reasoning 特性”的判定；
 * - 不负责推理 effort 选项映射，当前实现只处理模型语义，不混入参数面板逻辑。
 */

import type { ModelTypeDescriptor } from './types'
import { isOpenAiReasoningModelId } from './openai'
import { getNormalizedModelIdentity } from './utils'
import { isEmbeddingModel, isRerankModel } from './embedding'
import { isTextToImageModel } from './vision'

/**
 * reasoning 粗识别正则。
 *
 * 说明：
 * - 这条正则负责覆盖“名称里直接带 thinking / reasoning”的模型族；
 * - OpenAI o 系列、GPT-5 family、Grok 4 fast 等更细规则由辅助函数单独处理；
 * - 反向排除 `-non-reasoning`，避免被供应商的非推理变体误判。
 */
export const REASONING_REGEX =
  /^(?!.*-non-reasoning\b)(o\d+(?:-[\w-]+)?|.*\b(?:reasoning|reasoner|thinking|think)\b.*|.*-[rR]\d+.*|.*\bqwq(?:-[\w-]+)?\b.*|.*\bhunyuan-t1(?:-[\w-]+)?\b.*|.*\bglm-zero-preview\b.*|.*\bgrok-(?:3-mini|4|4-fast)(?:-[\w-]+)?\b.*)$/i

/** DeepSeek Hybrid Inference 系列。 */
export function isDeepSeekHybridInferenceModel(descriptor: ModelTypeDescriptor): boolean {
  const modelId = getNormalizedModelIdentity(descriptor)
  return /\bdeepseek[-/].*(?:v3(?:\.1|\.2)?|r1)\b/i.test(modelId) || /\bdeepseek-(?:v3(?:\.1|\.2)?|r1)\b/i.test(modelId)
}

/** 是否带有 reasoning 特性。 */
export function isReasoningModel(descriptor: ModelTypeDescriptor): boolean {
  if (isEmbeddingModel(descriptor) || isRerankModel(descriptor) || isTextToImageModel(descriptor)) {
    return false
  }

  const modelId = getNormalizedModelIdentity(descriptor)
  return isOpenAiReasoningModelId(modelId) || REASONING_REGEX.test(modelId)
}
