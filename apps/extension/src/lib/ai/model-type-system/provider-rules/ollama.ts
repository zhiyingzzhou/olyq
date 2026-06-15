/**
 * 说明：`ollama` AI 能力模块。
 *
 * 职责：
 * - 承载 `ollama` 相关的当前文件实现与模块边界；
 * - 对外暴露 `OLLAMA_MODEL_RULES` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Ollama 规则。
 *
 * 对齐来源：
 * - Ollama Library
 *
 * 说明：
 * - Ollama 官方 library 页面会给出 vision / tools / thinking / embedding 等标识；
 * - 扩展端当前没有完整拉取这些结构化标识，因此这里只保守镜像稳定模型族规则；
 * - 没有显式命中的场景继续交给共享 fallback。
 */

import type { ProviderModelRule } from '../types'
import { PROVIDER_RULE_SOURCE_URLS } from '../provider-rule-sources'
import { createRegexRule } from '../shared/rule-helpers'

/**
 * 导出常量：`OLLAMA_MODEL_RULES`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const OLLAMA_MODEL_RULES: ReadonlyArray<ProviderModelRule> = [
  createRegexRule(
    {
      id: 'ollama-embedding-family',
      providers: ['ollama'],
      priority: 200,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.ollama,
      examples: ['nomic-embed-text', 'mxbai-embed-large'],
      notes: 'Ollama embedding 家族，直接提升为 embedding 主类。',
      effects: { setPrimaryKind: 'embedding' },
    },
    /\b(?:nomic-embed|mxbai-embed|bge-|e5-|embed)(?:[\w./-]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'ollama-rerank-family',
      providers: ['ollama'],
      priority: 195,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.ollama,
      examples: ['qwen3-reranker'],
      notes: 'Ollama 重排家族，直接提升为 rerank 主类。',
      effects: { setPrimaryKind: 'rerank' },
    },
    /\b(?:rerank|re-rank|reranker)(?:[\w./-]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'ollama-vision-family',
      providers: ['ollama'],
      priority: 150,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.ollama,
      examples: ['qwen3:vision', 'gemma3', 'llava'],
      notes: 'Ollama vision 家族，补充 vision 能力。',
      effects: { addCapabilities: ['vision'] },
    },
    /\b(?:vision|llava|qwen(?:2\.5|3)?-vl|gemma3|pixtral|minicpm-v)(?:[\w./:-]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'ollama-reasoning-family',
      providers: ['ollama'],
      priority: 145,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.ollama,
      examples: ['deepseek-r1', 'qwq'],
      notes: 'Ollama thinking 家族，补充 reasoning 能力。',
      effects: { addCapabilities: ['reasoning'] },
    },
    /\b(?:deepseek-r1|qwq|thinking|reasoning|think)(?:[\w./:-]+)?\b/i,
  ),
] as const

