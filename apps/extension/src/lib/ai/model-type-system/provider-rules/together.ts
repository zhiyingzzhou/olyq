/**
 * 说明：`together` AI 能力模块。
 *
 * 职责：
 * - 承载 `together` 相关的当前文件实现与模块边界；
 * - 对外暴露 `TOGETHER_MODEL_RULES` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Together Serverless 规则。
 *
 * 对齐来源：
 * - Together Serverless Models 分类页
 *
 * 说明：
 * - Together 官方会直接按 Chat / Image / Vision / Video / Audio / Embedding / Rerank 分类；
 * - 扩展端当前没有把整张分类表离线缓存下来，因此这里保守镜像常见模型家族规则。
 */

import type { ProviderModelRule } from '../types'
import { PROVIDER_RULE_SOURCE_URLS } from '../provider-rule-sources'
import { createRegexRule } from '../shared/rule-helpers'

/**
 * 导出常量：`TOGETHER_MODEL_RULES`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const TOGETHER_MODEL_RULES: ReadonlyArray<ProviderModelRule> = [
  createRegexRule(
    {
      id: 'together-embedding-family',
      providers: ['together'],
      priority: 200,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.together,
      examples: ['BAAI/bge-large-en-v1.5', 'nomic-ai/nomic-embed-text-v1.5'],
      notes: 'Together Embedding 分类常见家族，直接提升为 embedding 主类。',
      effects: { setPrimaryKind: 'embedding' },
    },
    /\b(?:embed|embedding|bge-|e5-|gte-|voyage|nomic-embed|jina-embeddings)(?:[\w./-]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'together-rerank-family',
      providers: ['together'],
      priority: 195,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.together,
      examples: ['Qwen/Qwen3-Reranker-8B'],
      notes: 'Together Rerank 分类家族，直接提升为 rerank 主类。',
      effects: { setPrimaryKind: 'rerank' },
    },
    /\b(?:rerank|re-rank|reranker)(?:[\w./-]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'together-ocr-document-family',
      providers: ['together'],
      priority: 155,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.together,
      examples: ['deepseek-ai/DeepSeek-OCR-2', 'ucaslcl/GOT-OCR2_0'],
      notes: 'Together OCR / document / parsing 家族，补充 vision 能力，避免被目录里的 text-only hints 提前误杀。',
      effects: { addCapabilities: ['vision'] },
    },
    /\b(?:ocr|got-ocr|deepseek-ocr|mineru|nougat|docling|document(?:[-_/]?(?:parser|parsing|understanding|understand|ocr))?|parser|parsing)(?:[\w./-]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'together-vision-family',
      providers: ['together'],
      priority: 150,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.together,
      examples: ['Qwen/Qwen3-VL-235B-A22B', 'mistralai/Pixtral-Large-Instruct-2411'],
      notes: 'Together Vision 分类常见家族，补充 vision 能力。',
      effects: { addCapabilities: ['vision'] },
    },
    /\b(?:vl|vision|omni|pixtral|llava|minicpm-v|gemma-3)(?:[\w./-]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'together-reasoning-family',
      providers: ['together'],
      priority: 145,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.together,
      examples: ['deepseek-ai/DeepSeek-R1', 'Qwen/QwQ-32B', 'moonshotai/Kimi-K2.5-Thinking'],
      notes: 'Together 文本思考家族，补充 reasoning 能力。',
      effects: { addCapabilities: ['reasoning'] },
    },
    /\b(?:reasoner|reasoning|thinking|qwq|deepseek-r1|grok-4|magistral)(?:[\w./-]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'together-tool-family',
      providers: ['together'],
      priority: 140,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.together,
      examples: ['deepseek-ai/DeepSeek-V3.1', 'moonshotai/Kimi-K2.5', 'ZhipuAI/GLM-5'],
      notes: 'Together Chat 分类里已声明支持 tools / structured outputs 的主流文本家族。',
      effects: { addCapabilities: ['function_calling', 'structured_output'] },
    },
    /\b(?:deepseek-v3(?:\.1|\.2)?|kimi-k2(?:\.5)?|glm-5|qwen3|gpt-oss|llama-4)(?:[\w./-]+)?\b/i,
  ),
] as const
