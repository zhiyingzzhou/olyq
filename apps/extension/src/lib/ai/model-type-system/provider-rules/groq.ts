/**
 * 说明：`groq` AI 能力模块。
 *
 * 职责：
 * - 承载 `groq` 相关的当前文件实现与模块边界；
 * - 对外暴露 `GROQ_MODEL_RULES` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Groq 规则。
 *
 * 对齐来源：
 * - Groq Models
 * - Groq Tool Use Overview
 * - Groq Reasoning
 */

import type { ProviderModelRule } from '../types'
import { PROVIDER_RULE_SOURCE_URLS } from '../provider-rule-sources'
import { createRegexRule } from '../shared/rule-helpers'

/**
 * 导出常量：`GROQ_MODEL_RULES`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const GROQ_MODEL_RULES: ReadonlyArray<ProviderModelRule> = [
  createRegexRule(
    {
      id: 'groq-reasoning-family',
      providers: ['groq'],
      priority: 150,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.groqReasoning,
      examples: ['qwen/qwen3-32b', 'openai/gpt-oss-120b'],
      notes: 'Groq reasoning 文档中的主流思考家族，补充 reasoning 能力。',
      effects: { addCapabilities: ['reasoning'] },
    },
    /\b(?:qwen3|gpt-oss|deepseek-r1|reasoning|think)(?:[\w./-]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'groq-tool-family',
      providers: ['groq'],
      priority: 145,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.groqToolUse,
      examples: ['groq/compound', 'qwen/qwen3-32b'],
      notes: 'Groq tool use 文档覆盖的主流聊天模型族，补充 function calling 能力。',
      effects: { addCapabilities: ['function_calling', 'structured_output'] },
    },
    /\b(?:compound|qwen3|gpt-oss|llama-4|gemma-2|gemma-3)(?:[\w./-]+)?\b/i,
  ),
] as const

