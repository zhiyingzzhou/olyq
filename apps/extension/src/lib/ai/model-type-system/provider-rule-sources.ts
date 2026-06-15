/**
 * 说明：`provider-rule-sources` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-rule-sources` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MODEL_RULES_VERIFIED_AT`、`PROVIDER_RULE_SOURCE_URLS` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 模型类型规则来源矩阵。
 *
 * 为什么存在：
 * - 用户明确要求“平台规则必须绑定官方文档来源”，因此这里把所有 provider 规则的来源统一收口；
 * - 规则文件本身只关心“匹配什么模型、施加什么效果”，不再在每个文件里重复写 URL 常量；
 * - `docs/MODEL_TYPE_RULES.md` 也会直接复用这份矩阵，保证代码与文档不会各写各的。
 */

/**
 * 本轮规则核对日期。
 *
 * 说明：
 * - 这是用户锁定的核对基线日期；
 * - 后续维护者更新规则时，应同步更新 provider 规则文件、测试样例与维护文档。
 */
export const MODEL_RULES_VERIFIED_AT = '2026-03-25' as const

/** 各平台官方模型规则来源。 */
export const PROVIDER_RULE_SOURCE_URLS = {
  openrouter: 'https://openrouter.ai/docs/overview/models',
  openai: 'https://developers.openai.com/api/docs/models',
  anthropic: 'https://platform.claude.com/docs/en/about-claude/models/overview',
  cohere: 'https://docs.cohere.com/v2/docs/models',
  gemini: 'https://ai.google.dev/gemini-api/docs/models',
  together: 'https://docs.together.ai/docs/serverless-models',
  fireworks: 'https://docs.fireworks.ai/faq-new/models-inference/how-to-check-if-a-model-is-available-on-serverless',
  siliconflow: 'https://docs.siliconflow.com/en/api-reference/models/get-model-list',
  dashscopeQwen: 'https://help.aliyun.com/zh/model-studio/qwen-api-via-dashscope',
  dashscopeThinking: 'https://help.aliyun.com/zh/model-studio/deep-thinking',
  deepseek: 'https://api-docs.deepseek.com/quick_start/pricing/',
  xai: 'https://docs.x.ai/developers/models',
  mistral: 'https://docs.mistral.ai/getting-started/models',
  groqModels: 'https://console.groq.com/docs/models',
  groqToolUse: 'https://console.groq.com/docs/tool-use/overview',
  groqReasoning: 'https://console.groq.com/docs/reasoning',
  ollama: 'https://ollama.com/library',
} as const
