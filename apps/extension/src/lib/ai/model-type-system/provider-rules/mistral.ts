/**
 * 说明：`mistral` AI 能力模块。
 *
 * 职责：
 * - 承载 `mistral` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MISTRAL_MODEL_RULES` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Mistral 规则。
 *
 * 对齐来源：
 * - Mistral Models Overview
 */

import type { ProviderModelRule } from '../types'
import { PROVIDER_RULE_SOURCE_URLS } from '../provider-rule-sources'
import { createRegexRule } from '../shared/rule-helpers'

/**
 * 导出常量：`MISTRAL_MODEL_RULES`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const MISTRAL_MODEL_RULES: ReadonlyArray<ProviderModelRule> = [
  createRegexRule(
    {
      id: 'mistral-embedding-family',
      providers: ['mistral'],
      priority: 200,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.mistral,
      examples: ['codestral-embed', 'mistral-embed'],
      notes: 'Mistral embedding 家族，直接提升为 embedding 主类。',
      effects: { setPrimaryKind: 'embedding' },
    },
    /\b(?:codestral-embed|mistral-embed|embed)(?:-[\w.]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'mistral-vision-family',
      providers: ['mistral'],
      priority: 150,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.mistral,
      examples: ['pixtral-large', 'pixtral-12b'],
      notes: 'Pixtral 家族补充 vision 能力。',
      effects: { addCapabilities: ['vision'] },
    },
    /\b(?:pixtral)(?:-[\w.]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'mistral-reasoning-family',
      providers: ['mistral'],
      priority: 145,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.mistral,
      examples: ['magistral-medium'],
      notes: 'Magistral 家族补充 reasoning 能力。',
      effects: { addCapabilities: ['reasoning'] },
    },
    /\b(?:magistral)(?:-[\w.]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'mistral-tool-family',
      providers: ['mistral'],
      priority: 140,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.mistral,
      examples: ['mistral-medium-3.1', 'mistral-small-3.2'],
      notes: 'Mistral 当前主流文本模型族补充 function calling 与 structured output 能力。',
      effects: { addCapabilities: ['function_calling', 'structured_output'] },
    },
    /\b(?:mistral-(?:large|medium|small)|ministral|codestral)(?:-[\w.]+)?\b/i,
  ),
] as const

