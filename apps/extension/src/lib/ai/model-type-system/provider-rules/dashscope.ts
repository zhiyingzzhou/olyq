/**
 * 说明：`dashscope` AI 能力模块。
 *
 * 职责：
 * - 承载 `dashscope` 相关的当前文件实现与模块边界；
 * - 对外暴露 `DASHSCOPE_MODEL_RULES` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * DashScope / 百炼规则。
 *
 * 规则来源：
 * - DashScope Qwen API 文档
 * - DashScope Deep Thinking 文档
 * - 本仓库内部 Qwen / VL / Thinking 规则
 */

import type { ProviderModelRule } from '../types'
import { PROVIDER_RULE_SOURCE_URLS } from '../provider-rule-sources'
import { createRegexRule } from '../shared/rule-helpers'

/**
 * 导出常量：`DASHSCOPE_MODEL_RULES`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const DASHSCOPE_MODEL_RULES: ReadonlyArray<ProviderModelRule> = [
  createRegexRule(
    {
      id: 'dashscope-embedding-family',
      providers: ['dashscope'],
      priority: 200,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.dashscopeQwen,
      examples: ['text-embedding-v3', 'bge-m3'],
      notes: '百炼内可用的 embedding 家族，直接提升为 embedding 主类。',
      effects: { setPrimaryKind: 'embedding' },
    },
    /\b(?:text-embedding|bge-|bge\/|gte-|gte\/|multimodal-embedding|embedding)(?:[\w./-]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'dashscope-rerank-family',
      providers: ['dashscope'],
      priority: 195,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.dashscopeQwen,
      examples: ['qwen3-reranker-8b', 'gte-rerank'],
      notes: '百炼重排家族，直接提升为 rerank 主类。',
      effects: { setPrimaryKind: 'rerank' },
    },
    /\b(?:rerank|re-rank|reranker|gte-rerank|qwen3-reranker)(?:[\w./-]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'dashscope-image-family',
      providers: ['dashscope'],
      priority: 180,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.dashscopeQwen,
      examples: ['qwen-image', 'qwen-image-edit'],
      notes: '百炼图像生成家族，直接提升为 image-generation。',
      effects: { setPrimaryKind: 'image-generation', addCapabilities: ['image_output'] },
    },
    /\b(?:qwen-image|wanx|seedream)(?:-[\w.]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'dashscope-vision-family',
      providers: ['dashscope'],
      priority: 150,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.dashscopeQwen,
      examples: ['qwen-vl-max', 'qwen3-vl-plus', 'qvq-max'],
      notes: '百炼视觉/Omni 家族，补充 vision 能力。',
      effects: { addCapabilities: ['vision'] },
    },
    /\b(?:qwen(?:2(?:\.5)?|3(?:\.5)?)?-vl|qwen(?:2\.5|3)?-omni|qvq|ocr|qwen-omni)(?:-[\w.]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'dashscope-reasoning-family',
      providers: ['dashscope'],
      priority: 145,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.dashscopeThinking,
      examples: ['qwq-plus', 'qvq-max', 'deepseek-r1', 'kimi-k2-thinking'],
      notes: '百炼思考模型家族，补充 reasoning 能力。',
      effects: { addCapabilities: ['reasoning'] },
    },
    /\b(?:qwq|qvq|deepseek-r1|deepseek-reasoner|qwen-deep-research|thinking|reasoner|glm-zero-preview|kimi-k2(?:\.5)?-thinking)(?:-[\w.]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'dashscope-tool-family',
      providers: ['dashscope'],
      priority: 140,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.dashscopeQwen,
      examples: ['qwen-plus', 'qwen-max', 'qwen3-max'],
      notes: '百炼主流文本模型族补充 function calling 能力。',
      effects: { addCapabilities: ['function_calling', 'structured_output'] },
    },
    /\b(?:qwen-(?:turbo|max|plus|flash)|qwen3(?:\.5)?-(?:max|plus|flash|turbo)|glm-5|kimi-k2(?:\.5)?|deepseek-v3(?:\.2)?)(?:-[\w.]+)?\b/i,
  ),
] as const
