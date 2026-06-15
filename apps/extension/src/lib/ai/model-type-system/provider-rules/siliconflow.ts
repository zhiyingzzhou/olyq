/**
 * 说明：`siliconflow` AI 能力模块。
 *
 * 职责：
 * - 承载 `siliconflow` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SILICONFLOW_MODEL_RULES` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * SiliconFlow 规则。
 *
 * 对齐来源：
 * - SiliconFlow List Models 文档
 * - 用户锁定要求：停止依赖旧 `sub_type`，改用最新官方 `type=text|image|audio|video` 分类后，
 *   文本类再由共享/provider 规则细分 embedding / rerank / reasoning / vision。
 */

import type { ProviderModelRule } from '../types'
import { PROVIDER_RULE_SOURCE_URLS } from '../provider-rule-sources'
import { createRegexRule } from '../shared/rule-helpers'

/**
 * 导出常量：`SILICONFLOW_MODEL_RULES`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const SILICONFLOW_MODEL_RULES: ReadonlyArray<ProviderModelRule> = [
  createRegexRule(
    {
      id: 'siliconflow-embedding-family',
      providers: ['siliconflow'],
      priority: 200,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.siliconflow,
      examples: ['BAAI/bge-m3', 'nomic-ai/nomic-embed-text-v1.5'],
      notes: 'SiliconFlow 文本 embedding 家族，直接提升为 embedding 主类。',
      effects: { setPrimaryKind: 'embedding' },
    },
    /\b(?:embed|embedding|bge-|e5-|gte-|voyage|nomic-embed|jina-embeddings)(?:[\w./-]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'siliconflow-rerank-family',
      providers: ['siliconflow'],
      priority: 195,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.siliconflow,
      examples: ['Qwen/Qwen3-Reranker-8B'],
      notes: 'SiliconFlow 重排家族，直接提升为 rerank 主类。',
      effects: { setPrimaryKind: 'rerank' },
    },
    /\b(?:rerank|re-rank|reranker)(?:[\w./-]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'siliconflow-ocr-document-family',
      providers: ['siliconflow'],
      priority: 155,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.siliconflow,
      examples: ['deepseek-ai/DeepSeek-OCR-2', 'stepfun-ai/Step1X-Doc'],
      notes: 'SiliconFlow OCR / document / parsing 家族，补充 vision 能力，避免 text 基础分类把模型误降成纯文本。',
      effects: { addCapabilities: ['vision'] },
    },
    /\b(?:ocr|got-ocr|deepseek-ocr|mineru|nougat|docling|document(?:[-_/]?(?:parser|parsing|understanding|understand|ocr))?|parser|parsing)(?:[\w./-]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'siliconflow-image-family',
      providers: ['siliconflow'],
      priority: 180,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.siliconflow,
      examples: ['black-forest-labs/FLUX.1-dev', 'Qwen/Qwen-Image'],
      notes: 'SiliconFlow 图像生成家族，直接提升为 image-generation。',
      effects: { setPrimaryKind: 'image-generation', addCapabilities: ['image_output'] },
    },
    /\b(?:flux|stable-diffusion|sdxl|qwen-image|imagen|seedream|wanx)(?:[\w./-]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'siliconflow-vision-family',
      providers: ['siliconflow'],
      priority: 150,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.siliconflow,
      examples: ['Qwen/Qwen3-VL-235B-A22B', 'deepseek-ai/deepseek-vl2'],
      notes: 'SiliconFlow 视觉/Omni 家族，补充 vision 能力。',
      effects: { addCapabilities: ['vision'] },
    },
    /\b(?:vl|vision|omni|pixtral|qvq|llava|minicpm-v|gemma-3)(?:[\w./-]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'siliconflow-reasoning-family',
      providers: ['siliconflow'],
      priority: 145,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.siliconflow,
      examples: ['deepseek-ai/DeepSeek-R1', 'Qwen/QwQ-32B', 'moonshotai/Kimi-K2.5-Thinking'],
      notes: 'SiliconFlow 文本思考家族，补充 reasoning 能力。',
      effects: { addCapabilities: ['reasoning'] },
    },
    /\b(?:reasoner|reasoning|thinking|qwq|deepseek-r1|r1|grok-4|magistral)(?:[\w./-]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'siliconflow-tool-family',
      providers: ['siliconflow'],
      priority: 135,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.siliconflow,
      examples: ['deepseek-ai/DeepSeek-V3.2', 'Qwen/Qwen3-32B', 'moonshotai/Kimi-K2.5'],
      notes: 'SiliconFlow 主流文本大模型族，补充 function calling 能力。',
      effects: { addCapabilities: ['function_calling', 'structured_output'] },
    },
    /\b(?:deepseek-v3(?:\.2)?|qwen3|kimi-k2(?:\.5)?|glm-5|gpt-oss|claude|gemini)(?:[\w./-]+)?\b/i,
  ),
] as const
