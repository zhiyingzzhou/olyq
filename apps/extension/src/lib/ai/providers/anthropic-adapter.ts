/**
 * 说明：`anthropic-adapter` AI 能力模块。
 *
 * 职责：
 * - 承载 `anthropic-adapter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `anthropicAdapter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Anthropic（Claude）Provider 适配器。
 *
 * 职责：
 * - 从统一的 ProviderConfig 解析鉴权/Host/Header 等公共参数；
 * - 基于 `\@ai-sdk/anthropic` 构建语言模型实例；
 * - 构建并透传 providerOptions（例如缓存/提示等 Anthropic 特性），并注入必要的 middlewares。
 */

import { createAnthropic } from '@ai-sdk/anthropic'
import type { FetchFunction } from '@ai-sdk/provider-utils'
import { isPlainRecord } from '@/lib/utils/type-guards'
import { createStaticRuntimeCapabilities, type ProviderAdapter, type ProviderOptionsContext, type MiddlewareContext } from './adapter-types'
import { buildAnthropicProviderOptions, getAnthropicCachingMiddlewares } from './provider-utils-anthropic'
import { resolveAnthropicBaseURL, resolveCommonParams } from './provider-utils-common'
import { anthropicLikeCallSettingSupport } from './policies/call-settings'
import { buildNativeWebSearchToolArgs } from '../native-web-search-params'

const ANTHROPIC_WEB_SEARCH_20260209 = 'web_search_20260209'
const ANTHROPIC_DIRECT_TOOL_CALLERS = ['direct'] as const

/**
 * 给 Anthropic `web_search_20260209` 请求体补齐官方 direct-only caller 约束。
 *
 * @remarks
 * 当前 `@ai-sdk/anthropic@3.0.70` 的 provider-defined web search tool 尚未暴露
 * `allowedCallers` 入参；但 Anthropic 官方在不支持 programmatic tool calling 的模型上
 * 要求显式发送 `allowed_callers:["direct"]`。这里在最终 fetch 边界做结构化 JSON
 * 修正，保持能力真源不再按模型族运行时试探。
 */
function ensureAnthropicWebSearchDirectCallers(body: unknown): { readonly body: unknown; readonly changed: boolean } {
  if (!isPlainRecord(body) || !Array.isArray(body.tools)) return { body, changed: false }

  let changed = false
  const tools = body.tools.map((tool) => {
    if (
      !isPlainRecord(tool)
      || tool.type !== ANTHROPIC_WEB_SEARCH_20260209
      || Array.isArray(tool.allowed_callers)
    ) {
      return tool
    }
    changed = true
    return {
      ...tool,
      allowed_callers: [...ANTHROPIC_DIRECT_TOOL_CALLERS],
    }
  })

  return changed ? { body: { ...body, tools }, changed } : { body, changed: false }
}

/**
 * 创建带 Anthropic native web search 请求体 guard 的 fetch。
 *
 * @param baseFetch - 上游鉴权 fetch；为空时使用全局 fetch。
 * @returns 可交给 Anthropic SDK 的 fetch。
 */
function createAnthropicRequestGuardFetch(baseFetch?: FetchFunction): FetchFunction {
  const fetcher = baseFetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof init?.body !== 'string') return fetcher(input, init)

    try {
      const parsed = JSON.parse(init.body) as unknown
      const patched = ensureAnthropicWebSearchDirectCallers(parsed)
      if (!patched.changed) return fetcher(input, init)
      return fetcher(input, {
        ...init,
        body: JSON.stringify(patched.body),
      })
    } catch {
      return fetcher(input, init)
    }
  }
}

/**
 * 导出常量：`anthropicAdapter`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const anthropicAdapter: ProviderAdapter = {
  type: 'anthropic',
  getRuntimeCapabilities: createStaticRuntimeCapabilities(),

    /**
   * 内部方法：`createLanguageModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createLanguageModel(config, modelId) {
    const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(config)
    const baseURL = resolveAnthropicBaseURL(apiHost)
    const provider = createAnthropic({ apiKey, baseURL, headers, fetch: createAnthropicRequestGuardFetch(authFetch) })
    return provider(modelId)
  },

    /**
   * 内部方法：`buildProviderOptions`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  buildProviderOptions(ctx: ProviderOptionsContext): Record<string, unknown> | undefined {
    return buildAnthropicProviderOptions(ctx)
  },

  /**
   * 内部方法：`createNativeWebSearchTools`。
   *
   * @remarks
   * 使用 Anthropic Messages API 官方 `web_search_20260209` provider-hosted tool。
   */
  createNativeWebSearchTools(ctx) {
    const toolName = ctx.capability.toolName
    if (!toolName) return undefined
    const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(ctx.config)
    const baseURL = resolveAnthropicBaseURL(apiHost)
    const provider = createAnthropic({ apiKey, baseURL, headers, fetch: authFetch })
    const toolArgs = buildNativeWebSearchToolArgs(ctx.capability, ctx.params.modelParams) as Parameters<typeof provider.tools.webSearch_20260209>[0]
    return {
      [toolName]: provider.tools.webSearch_20260209(toolArgs),
    }
  },

    /**
   * 内部方法：`getCallSettingSupport`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getCallSettingSupport() {
    return anthropicLikeCallSettingSupport()
  },

    /**
   * 内部方法：`pickChatExecutionMode`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  pickChatExecutionMode() {
    return 'streamText'
  },

    /**
   * 内部方法：`getMiddlewares`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getMiddlewares(ctx: MiddlewareContext) {
    return getAnthropicCachingMiddlewares(ctx)
  },
}
