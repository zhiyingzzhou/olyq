/**
 * 说明：`anthropic` AI 能力模块。
 *
 * 职责：
 * - 承载 `anthropic` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ANTHROPIC_MODEL_RULES` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Anthropic Claude 规则。
 *
 * 规则来源：
 * - Anthropic Models Overview
 * - 本仓库内部 Claude 能力规则
 */

import type { ProviderModelRule } from '../types'
import { PROVIDER_RULE_SOURCE_URLS } from '../provider-rule-sources'
import { createRegexRule } from '../shared/rule-helpers'

const ANTHROPIC_PROVIDERS = ['anthropic', 'vertex-anthropic'] as const

/**
 * 导出常量：`ANTHROPIC_MODEL_RULES`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const ANTHROPIC_MODEL_RULES: ReadonlyArray<ProviderModelRule> = [
  createRegexRule(
    {
      id: 'anthropic-vision-family',
      providers: ANTHROPIC_PROVIDERS,
      priority: 140,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.anthropic,
      examples: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'],
      notes: 'Claude 当前主流多模态家族，补充 vision 能力。',
      effects: { addCapabilities: ['vision'] },
    },
    /\b(?:claude-(?:haiku|sonnet|opus)-4|claude-3(?:\.|-)(?:5|7)-(?:haiku|sonnet))(?:-[\w.]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'anthropic-reasoning-family',
      providers: ANTHROPIC_PROVIDERS,
      priority: 130,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.anthropic,
      examples: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'],
      notes: 'Claude 4.5/4.6 主线家族补充 reasoning 能力。',
      effects: { addCapabilities: ['reasoning'] },
    },
    /\b(?:claude-3(?:\.|-)7-sonnet|claude-(?:haiku|sonnet|opus)-4)(?:-[\w.]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'anthropic-tool-family',
      providers: ANTHROPIC_PROVIDERS,
      priority: 125,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.anthropic,
      examples: ['claude-sonnet-4', 'claude-haiku-4'],
      notes: 'Claude 3.5+/4 系列可补充 function calling 与 structured output 能力。',
      effects: { addCapabilities: ['function_calling', 'structured_output'] },
    },
    /\b(?:claude-(?:haiku|sonnet|opus)-4|claude-3(?:\.|-)(?:5|7)-(?:haiku|sonnet))(?:-[\w.]+)?\b/i,
  ),
] as const
