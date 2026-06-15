/**
 * 说明：`openai-responses-request-shape` AI 能力模块。
 *
 * 职责：
 * - 承载 OpenAI Responses 出站请求体形态策略；
 * - 只声明已由 transport、SDK providerOptions namespace 与显式上游归属共同确认的形态；
 * - 避免各 adapter 按 provider 名称、模型名或 endpoint 分散猜测。
 *
 * 边界：
 * - 本文件不读取消息内容，不拼 prompt，不构造 providerOptions 业务参数；
 * - runtime 仍由 `runtime-text-call.ts` 作为唯一执行点应用策略。
 */
import type { TransportProtocol } from '../types'
import type { ProviderRequestShapePolicy } from './adapter-types'

/** OpenAI Responses system prompt request-shape 判断所需的最小事实。 */
export interface OpenAiResponsesSystemPromptPolicyContext {
  /** 当前模型的真实 transport。 */
  readonly transportProtocol?: TransportProtocol
  /** 本轮 SDK/provider 已确认可消费的 providerOptions 命名空间。 */
  readonly providerOptionNamespaces: ReadonlyArray<string>
  /** 显式证据解析出的上游模型提供方；官方 OpenAI/NewAPI Responses 可直接传 `openai`。 */
  readonly modelProviderSlug: string | null
}

/** 稳定归一化 provider/vendor slug。 */
function normalizeSlug(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
}

/**
 * 构建 OpenAI Responses system prompt 请求体形态策略。
 *
 * @param ctx - transport、providerOptions namespace 与上游归属三类显式事实。
 * @returns 命中 OpenAI Responses 官方形态时返回策略，否则返回 `undefined`。
 */
export function buildOpenAiResponsesSystemPromptPolicy(
  ctx: OpenAiResponsesSystemPromptPolicyContext,
): ProviderRequestShapePolicy | undefined {
  if (ctx.transportProtocol !== 'openai-responses') return undefined

  const namespaces = new Set(ctx.providerOptionNamespaces.map((item) => normalizeSlug(item)).filter(Boolean))
  if (!namespaces.has('openai')) return undefined
  if (normalizeSlug(ctx.modelProviderSlug) !== 'openai') return undefined

  return {
    systemPrompt: {
      target: 'provider-options-instructions',
      providerOptionsKey: 'openai',
      instructionsKey: 'instructions',
      systemMessageMode: 'remove',
    },
  }
}
