/**
 * 说明：`deepseek` AI 能力模块。
 *
 * 职责：
 * - 承载 `deepseek` 相关的当前文件实现与模块边界；
 * - 对外暴露 `DEEPSEEK_MODEL_RULES` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * DeepSeek 官方规则。
 *
 * 对齐来源：
 * - DeepSeek Models & Pricing 文档
 */

import type { ProviderModelRule } from '../types'
import { PROVIDER_RULE_SOURCE_URLS } from '../provider-rule-sources'
import { createRegexRule } from '../shared/rule-helpers'

/**
 * 导出常量：`DEEPSEEK_MODEL_RULES`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const DEEPSEEK_MODEL_RULES: ReadonlyArray<ProviderModelRule> = [
  createRegexRule(
    {
      id: 'deepseek-reasoner-family',
      providers: ['deepseek'],
      priority: 160,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.deepseek,
      examples: ['deepseek-reasoner', 'deepseek-r1'],
      notes: 'DeepSeek 官方 reasoning 家族，补充 reasoning 能力。',
      effects: { addCapabilities: ['reasoning'] },
    },
    /\b(?:deepseek-reasoner|deepseek-r1)(?:-[\w.]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'deepseek-chat-family',
      providers: ['deepseek'],
      priority: 150,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.deepseek,
      examples: ['deepseek-chat', 'deepseek-v3.2'],
      notes: 'DeepSeek 官方 chat 家族，补充 function calling 与 structured output 能力。',
      effects: { addCapabilities: ['function_calling', 'structured_output'] },
    },
    /\b(?:deepseek-chat|deepseek-v3(?:\.1|\.2)?)(?:-[\w.]+)?\b/i,
  ),
] as const

