/**
 * 说明：`openai` AI 能力模块。
 *
 * 职责：
 * - 承载 `openai` 相关的当前文件实现与模块边界；
 * - 对外暴露 `isGPT5FamilyModelId`、`isGPT5SeriesModelId`、`isOpenAiOpenWeightModelId` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * OpenAI 家族辅助判断。
 *
 * 为什么存在：
 * - GPT-5 / o-series / deep research / web search 等规则需要单独聚合；
 * - 扩展端这里保留统一的“OpenAI 家族识别”职责，供 reasoning / websearch / protocol fallback 复用；
 * - 这里只保留模型语义系统真正需要的最小集合，不引入 UI 选项层逻辑。
 */

import { normalizeModelId } from './utils'

/** GPT-5 家族。 */
export function isGPT5FamilyModelId(rawModelId: string): boolean {
  return normalizeModelId(rawModelId).includes('gpt-5')
}

/** GPT-5 基础系列（不含 5.1 / 5.2 等次版本）。 */
export function isGPT5SeriesModelId(rawModelId: string): boolean {
  return /gpt-5(?!\.\d)/.test(normalizeModelId(rawModelId))
}

/** OpenAI Open Weight 模型。 */
export function isOpenAiOpenWeightModelId(rawModelId: string): boolean {
  return normalizeModelId(rawModelId).includes('gpt-oss')
}

/** OpenAI reasoning 家族。 */
export function isOpenAiReasoningModelId(rawModelId: string): boolean {
  const modelId = normalizeModelId(rawModelId)
  return (
    (modelId.includes('o1') && !(modelId.includes('o1-preview') || modelId.includes('o1-mini')))
    || modelId.includes('o3')
    || modelId.includes('o4')
    || isOpenAiOpenWeightModelId(modelId)
    || (isGPT5FamilyModelId(modelId) && !modelId.includes('chat'))
  )
}

/** OpenAI Deep Research 模型。 */
export function isOpenAiDeepResearchModelId(rawModelId: string): boolean {
  return /deep[-_]?research/i.test(normalizeModelId(rawModelId))
}

/** OpenAI 原生联网搜索模型。 */
export function isOpenAiWebSearchModelId(rawModelId: string): boolean {
  const modelId = normalizeModelId(rawModelId)
  return (
    modelId.includes('gpt-4o-search-preview')
    || modelId.includes('gpt-4o-mini-search-preview')
    || (modelId.includes('gpt-4.1') && !modelId.includes('gpt-4.1-nano'))
    || (modelId.includes('gpt-4o') && !modelId.includes('gpt-4o-image'))
    || modelId.includes('o3')
    || modelId.includes('o4')
    || (modelId.includes('gpt-5') && !modelId.includes('chat'))
  )
}
