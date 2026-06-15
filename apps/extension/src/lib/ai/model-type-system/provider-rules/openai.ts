/**
 * 说明：`openai` AI 能力模块。
 *
 * 职责：
 * - 承载 `openai` 相关的当前文件实现与模块边界；
 * - 对外暴露 `OPENAI_MODEL_RULES` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * OpenAI 系列规则。
 *
 * 规则来源：
 * - OpenAI Models 文档
 * - 本仓库内部 OpenAI 家族能力规则
 *
 * 说明：
 * - 这里既覆盖 OpenAI，也覆盖 Azure OpenAI 与 OpenAI Responses；
 * - `gpt-image-*` / `sora-*` / `gpt-audio*` 这类高风险主类只在有明确模型族时才提升；
 * - 其余 reasoning / vision / tools / web search 主要作为能力补充，不去反向污染 OpenRouter 基线。
 */

import type { ProviderModelRule } from '../types'
import { PROVIDER_RULE_SOURCE_URLS } from '../provider-rule-sources'
import { createRegexRule } from '../shared/rule-helpers'

const OPENAI_PROVIDERS = ['openai', 'openai-response', 'azure-openai'] as const

/**
 * 导出常量：`OPENAI_MODEL_RULES`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const OPENAI_MODEL_RULES: ReadonlyArray<ProviderModelRule> = [
  createRegexRule(
    {
      id: 'openai-embedding-family',
      providers: OPENAI_PROVIDERS,
      priority: 200,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.openai,
      examples: ['text-embedding-3-small', 'text-embedding-3-large'],
      notes: 'OpenAI 官方 embedding 家族，直接提升为 embedding 主类。',
      effects: { setPrimaryKind: 'embedding' },
    },
    /(?:^|\/)text-embedding-(?:3-small|3-large|ada-002)(?:$|[@:-])/i,
  ),
  createRegexRule(
    {
      id: 'openai-image-family',
      providers: OPENAI_PROVIDERS,
      priority: 190,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.openai,
      examples: ['gpt-image-1', 'gpt-image-1.5', 'dall-e-3'],
      notes: 'OpenAI 官方生图模型族，直接提升为 image-generation。',
      effects: { setPrimaryKind: 'image-generation', addCapabilities: ['image_output'] },
    },
    /(?:^|\/)(?:gpt-image(?:-[\w.]+)?|dall-e(?:-[\w.]+)?)(?:$|[@:/-])/i,
  ),
  createRegexRule(
    {
      id: 'openai-sora-family',
      providers: OPENAI_PROVIDERS,
      priority: 185,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.openai,
      examples: ['sora-2-pro'],
      notes: 'OpenAI 视频生成模型族，直接提升为 video-generation。',
      effects: { setPrimaryKind: 'video-generation' },
    },
    /(?:^|\/)sora(?:-[\w.]+)?(?:$|[@:/-])/i,
  ),
  createRegexRule(
    {
      id: 'openai-audio-family',
      providers: OPENAI_PROVIDERS,
      priority: 180,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.openai,
      examples: ['gpt-audio', 'gpt-realtime'],
      notes: 'OpenAI 音频/实时模型家族，按官方模型族提升为 audio-chat，并补音频输入输出能力。',
      effects: { setPrimaryKind: 'audio-chat', addCapabilities: ['audio_input', 'audio_output'] },
    },
    /(?:^|\/)(?:gpt-audio|gpt-realtime)(?:-[\w.]+)?(?:$|[@:/-])/i,
  ),
  createRegexRule(
    {
      id: 'openai-vision-family',
      providers: OPENAI_PROVIDERS,
      priority: 120,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.openai,
      examples: ['gpt-4o', 'gpt-4.1', 'gpt-5', 'o3'],
      notes: 'OpenAI 多模态对话家族，补充 vision 能力。',
      effects: { addCapabilities: ['vision'] },
    },
    /\b(?:gpt-4o|gpt-4\.1|gpt-5|chatgpt-4o|o1|o3|o4)(?:-[\w.]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'openai-reasoning-family',
      providers: OPENAI_PROVIDERS,
      priority: 115,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.openai,
      examples: ['o3', 'o4-mini', 'gpt-5.2', 'gpt-oss-120b'],
      notes: 'OpenAI reasoning 家族，补充 reasoning 能力。',
      effects: { addCapabilities: ['reasoning'] },
    },
    /\b(?:o1|o3|o4|gpt-5(?:\.\d+)?|gpt-oss)(?:-[\w.]+)?\b/i,
  ),
  createRegexRule(
    {
      id: 'openai-tool-family',
      providers: OPENAI_PROVIDERS,
      priority: 110,
      sourceUrl: PROVIDER_RULE_SOURCE_URLS.openai,
      examples: ['gpt-4o', 'gpt-4.1', 'gpt-5'],
      notes: 'OpenAI 当前主流对话模型族可补充 function calling 能力。',
      effects: { addCapabilities: ['function_calling', 'structured_output'] },
    },
    /\b(?:gpt-4o|gpt-4\.1|gpt-5|gpt-oss|o3|o4)(?:-[\w.]+)?\b/i,
  ),
] as const
