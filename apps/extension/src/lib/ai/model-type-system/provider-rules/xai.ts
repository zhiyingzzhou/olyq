/**
 * 说明：`xai` AI 能力模块。
 *
 * 职责：
 * - 承载 `xai` 相关的当前文件实现与模块边界；
 * - 对外暴露 `XAI_MODEL_RULES` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * xAI Grok 规则。
 *
 * 对齐来源：
 * - xAI Models 文档
 */

import type { ProviderModelRule } from '../types'
import { PROVIDER_RULE_SOURCE_URLS } from '../provider-rule-sources'
import { createRegexRule } from '../shared/rule-helpers'

/**
 * 导出常量：`XAI_MODEL_RULES`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const XAI_MODEL_RULES: ReadonlyArray<ProviderModelRule> = [
  createRegexRule(
    {
      id: 'xai-grok-vision-family',
      providers: ['xai'],
      priority: 155,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.xai,
      examples: ['grok-4', 'grok-vision-beta'],
      notes: 'xAI Grok 视觉家族，补充 vision 能力。',
      effects: { addCapabilities: ['vision'] },
    },
    /\b(?:grok-vision-beta|grok-4|grok-3)(?:-[\w.]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'xai-grok-reasoning-family',
      providers: ['xai'],
      priority: 150,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.xai,
      examples: ['grok-4', 'grok-4-fast'],
      notes: 'xAI Grok 4 reasoning 家族，补充 reasoning 能力。',
      effects: { addCapabilities: ['reasoning'] },
    },
    /\b(?:grok-(?:3-mini|4|4-fast))(?:-[\w.]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'xai-grok-tools-family',
      providers: ['xai'],
      priority: 145,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.xai,
      examples: ['grok-4', 'grok-4-fast'],
      notes: 'xAI Grok 主力模型族补充 function calling 能力；内置联网搜索由 native web search 三态矩阵判定。',
      effects: { addCapabilities: ['function_calling'] },
    },
    /\b(?:grok-3|grok-4)(?:-[\w.]+)?\b/i,
  ),
] as const
