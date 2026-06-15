/**
 * 说明：`cohere` AI 能力模块。
 *
 * 职责：
 * - 承载 `cohere` 相关的当前文件实现与模块边界；
 * - 对外暴露 `COHERE_MODEL_RULES` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Cohere 规则。
 *
 * 对齐来源：
 * - Cohere Models Overview
 *
 * 说明：
 * - Cohere 的首选真源是官方目录 `endpoints/features`；
 * - 这里只保留“用户手动录入模型 ID、目录 hints 缺失时”的保守兜底规则。
 */

import type { ProviderModelRule } from '../types'
import { PROVIDER_RULE_SOURCE_URLS } from '../provider-rule-sources'
import { createRegexRule } from '../shared/rule-helpers'

/**
 * 导出常量：`COHERE_MODEL_RULES`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const COHERE_MODEL_RULES: ReadonlyArray<ProviderModelRule> = [
  createRegexRule(
    {
      id: 'cohere-image-embedding-family',
      providers: ['cohere'],
      priority: 205,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.cohere,
      examples: ['embed-english-v3.0-image'],
      notes: 'Cohere image embedding 家族，提升为 image embedding 主类。',
      effects: {
        setPrimaryKind: 'embedding',
        setInputModalities: ['image'],
        setOutputModalities: ['embeddings'],
      },
    },
    /\bembed(?:-[\w.]+)*-image\b/i,
  ),
  createRegexRule(
    {
      id: 'cohere-embedding-family',
      providers: ['cohere'],
      priority: 200,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.cohere,
      examples: ['embed-english-v3.0', 'embed-english-v3.0-image'],
      notes: 'Cohere embed 家族，直接提升为 embedding 主类。',
      effects: {
        setPrimaryKind: 'embedding',
        setInputModalities: ['text'],
        setOutputModalities: ['embeddings'],
      },
    },
    /\bembed(?:-[\w.]+)?(?:-image)?\b/i,
  ),
  createRegexRule(
    {
      id: 'cohere-rerank-family',
      providers: ['cohere'],
      priority: 195,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.cohere,
      examples: ['rerank-v4.0-fast', 'rerank-v3.5'],
      notes: 'Cohere rerank 家族，直接提升为 rerank 主类。',
      effects: { setPrimaryKind: 'rerank' },
    },
    /\brerank(?:-[\w.]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'cohere-vision-family',
      providers: ['cohere'],
      priority: 150,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.cohere,
      examples: ['command-a-vision-07-2025', 'c4ai-aya-vision-8b'],
      notes: 'Cohere vision 家族补充 vision 能力。',
      effects: { addCapabilities: ['vision'] },
    },
    /\b(?:vision|aya-vision)(?:-[\w.]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'cohere-reasoning-family',
      providers: ['cohere'],
      priority: 145,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.cohere,
      examples: ['command-a-reasoning-08-2025'],
      notes: 'Cohere reasoning 家族补充 reasoning 能力。',
      effects: { addCapabilities: ['reasoning'] },
    },
    /\breasoning(?:-[\w.]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'cohere-tool-family',
      providers: ['cohere'],
      priority: 140,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.cohere,
      examples: ['command-r-08-2024', 'command-a-reasoning-08-2025'],
      notes: 'Cohere 主流 chat 家族补充 function calling 与 structured output 能力。',
      effects: { addCapabilities: ['function_calling', 'structured_output'] },
    },
    /\b(?:command|aya)(?:-[\w.]+)?\b/i,
  ),
] as const
