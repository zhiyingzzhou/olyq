/**
 * 说明：`gemini` AI 能力模块。
 *
 * 职责：
 * - 承载 `gemini` 相关的当前文件实现与模块边界；
 * - 对外暴露 `GEMINI_MODEL_RULES` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Gemini 规则。
 *
 * 规则来源：
 * - Gemini Models 文档
 * - 本仓库内部 Gemini 能力规则
 */

import type { ProviderModelRule } from '../types'
import { PROVIDER_RULE_SOURCE_URLS } from '../provider-rule-sources'
import { createRegexRule } from '../shared/rule-helpers'

const GEMINI_PROVIDERS = ['gemini', 'vertexai'] as const

/**
 * 导出常量：`GEMINI_MODEL_RULES`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const GEMINI_MODEL_RULES: ReadonlyArray<ProviderModelRule> = [
  createRegexRule(
    {
      id: 'gemini-embedding-family',
      providers: GEMINI_PROVIDERS,
      priority: 200,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.gemini,
      examples: ['text-embedding-004', 'embedding-001'],
      notes: 'Gemini / Google 官方 embedding 家族，直接提升为 embedding 主类。',
      effects: { setPrimaryKind: 'embedding' },
    },
    /\b(?:text-embedding-\d+|embedding-\d+)(?:-[\w.]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'gemini-image-family',
      providers: GEMINI_PROVIDERS,
      priority: 180,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.gemini,
      examples: ['gemini-2.5-flash-image', 'gemini-3-pro-image'],
      notes: 'Gemini 官方图像生成家族，直接提升为 image-generation。',
      effects: { setPrimaryKind: 'image-generation', addCapabilities: ['image_output'] },
    },
    /\b(?:gemini-2\.5-flash-image|gemini-2\.0-flash-preview-image-generation|gemini-3(?:\.\d+)?-pro-image)(?:-[\w.]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'gemini-vision-family',
      providers: GEMINI_PROVIDERS,
      priority: 140,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.gemini,
      examples: ['gemini-2.5-pro', 'gemini-3.1-pro', 'gemini-2.0-flash-lite'],
      notes: 'Gemini 对话模型家族默认补充 vision 能力。',
      effects: { addCapabilities: ['vision'] },
    },
    /\b(?:gemini|learnlm)(?:-[\w.]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'gemini-thinking-family',
      providers: GEMINI_PROVIDERS,
      priority: 135,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.gemini,
      examples: ['gemini-2.5-pro', 'gemini-3-pro', 'gemini-3.1-pro'],
      notes: 'Gemini 2.5/3/3.1 thinking 家族，补充 reasoning 能力。',
      effects: { addCapabilities: ['reasoning'] },
    },
    /\b(?:gemini-(?:2\.5|3(?:\.1)?)-(?:flash|pro)|gemini-flash-latest|gemini-pro-latest|gemini-flash-lite-latest)(?:-[\w.]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'gemini-tools-family',
      providers: GEMINI_PROVIDERS,
      priority: 130,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.gemini,
      examples: ['gemini-2.5-pro', 'gemini-3-pro'],
      notes: 'Gemini 对话模型家族补充 function calling 与 structured output 能力。',
      effects: { addCapabilities: ['function_calling', 'structured_output'] },
    },
    /\b(?:gemini|learnlm)(?:-[\w.]+)?\b/i,
  ),
] as const
