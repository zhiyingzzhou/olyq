/**
 * 说明：`provider-utils-anthropic` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-utils-anthropic` 相关的当前文件实现与模块边界；
 * - 对外暴露 `buildAnthropicProviderOptions`、`getAnthropicCachingMiddlewares` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Anthropic Provider 的共享辅助函数。
 *
 * 设计目标：
 * - 把 Anthropic 专属 providerOptions / middleware 逻辑从通用工具层剥离；
 * - 避免其它 Provider 因共享 utils 入口而引入无关 Anthropic 逻辑。
 */

import type { LanguageModelMiddleware } from 'ai'
import { buildProviderReasoningRuntimeOptions } from '../provider-reasoning'
import { createAnthropicPromptCachingMiddleware } from '../stream-chat-utils'
import type { MiddlewareContext, ProviderOptionsContext } from './adapter-types'

/**
 * 构建 Anthropic providerOptions。
 *
 * 说明：
 * - 这里只负责 Thinking 等需要放进 providerOptions 的扩展参数；
 * - 若上下文里没有任何 Anthropic 专属选项，则返回 `undefined`，避免发送空对象。
 */
export function buildAnthropicProviderOptions(ctx: ProviderOptionsContext): Record<string, unknown> | undefined {
  const reasoningRuntime = buildProviderReasoningRuntimeOptions({
    model: `${ctx.providerId}/${ctx.modelId}`,
    transportProtocol: ctx.transportProtocol,
    modelParams: ctx.params.modelParams,
  })
  const opts = reasoningRuntime.providerOptions

  if (!opts || Object.keys(opts).length === 0) return undefined
  return { anthropic: opts }
}

/**
 * 根据 Provider 配置收集 Anthropic 中间件列表。
 *
 * 说明：
 * - 当前只包含 prompt caching middleware；
 * - 返回数组而不是单个值，便于后续继续叠加其它 Anthropic 专属中间件。
 */
export function getAnthropicCachingMiddlewares(ctx: MiddlewareContext): LanguageModelMiddleware[] {
  const middlewares: LanguageModelMiddleware[] = []

  if (
    ctx.config.anthropicCacheControl &&
    ctx.config.anthropicCacheControl.tokenThreshold > 0
  ) {
    middlewares.push(
      createAnthropicPromptCachingMiddleware({
        tokenThreshold: ctx.config.anthropicCacheControl.tokenThreshold,
        cacheSystemMessage: ctx.config.anthropicCacheControl.cacheSystemMessage,
        cacheLastNMessages: ctx.config.anthropicCacheControl.cacheLastNMessages,
      }),
    )
  }

  return middlewares
}
