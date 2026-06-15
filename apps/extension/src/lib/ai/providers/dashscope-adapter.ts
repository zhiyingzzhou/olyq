/**
 * 说明：`dashscope-adapter` AI 能力模块。
 *
 * 职责：
 * - 承载 `dashscope-adapter` 相关的当前文件实现与模块边界；
 * - 对外暴露 `dashscopeAdapter` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * DashScope（通义千问）Provider Adapter
 *
 * 目标
 * - 彻底切换：DashScope 作为独立 ProviderType（不再伪装成 openai）
 * - 业务层不写任何“平台分支”：所有差异收敛在 adapter / model 内
 *
 * 能力拆分（组合 Provider 思路）
 * - 对话/Embedding：使用 AI SDK 的 OpenAI Compatible（DashScope 的 compatible-mode）
 * - 图片：使用我们自定义的 DashScopeImageModel（官方 /api/v1 接口）
 *
 * 注意
 * - DashScope 的“图片接口”不兼容 OpenAI 的 /images/generations|edits，因此必须走专用 ImageModel。
 */

import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModelMiddleware } from 'ai'
import { extractReasoningMiddleware } from 'ai'
import { createOpenAiCompatibleInlineImageMetadataExtractor } from '../openai-compatible/inline-images'
import { DashScopeImageModel } from '../dashscope-image'
import { PLATFORM_DEFAULTS } from './platform-capabilities'
import { openAiLikeCallSettingSupport } from './policies/call-settings'
import {
  createAppendSuffixToUserMessagesMiddleware,
  normalizeModelIdForRules,
  pickReasoningTagName,
  shouldAppendQwenThinkingSuffix,
} from '../stream-chat-utils'
import { buildProviderReasoningRuntimeOptions } from '../provider-reasoning'
import { buildNativeWebSearchToolArgs } from '../native-web-search-params'
import {
  createStaticRuntimeCapabilities,
  type ProviderAdapter,
  type MiddlewareContext,
  type ProviderOptionsContext,
} from './adapter-types'
import {
  createOpenAiCompatibleRequestBodyTransformer,
  resolveCommonParams,
  resolveModelTransportProtocol,
  resolveOpenAiBaseURL,
  shouldIncludeOpenAiCompatibleUsage,
} from './provider-utils-common'

/**
 * DashScope 的 OpenAI Compatible 模式 BaseURL：
 * - 官方推荐：`https://dashscope.aliyuncs.com/compatible-mode/v1`
 * - 国际站：`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
 *
 * 约束（易踩坑）：
 * - 仅填 `https://dashscope.aliyuncs.com/v1` 通常不对（缺少 /compatible-mode）
 * - 仅填域名也不对（需要版本段与路径）
 *
 * 这里做“尽力而为”的规范化：
 * - 对官方域名：确保落到 /compatible-mode/v1
 * - 对自建网关：不强改路径，只做 OpenAI-like 端点剥离与 /v1 自动追加
 */
function resolveDashScopeCompatibleBaseURL(apiHost: string): string {
  const raw = String(apiHost || '').trim()
  if (!raw) return PLATFORM_DEFAULTS.dashscope.compatibleBaseURL

  const base = resolveOpenAiBaseURL(raw) || raw

  try {
    const u = new URL(base)
    const host = u.hostname.toLowerCase()
    const isOfficial =
      host === 'dashscope.aliyuncs.com' ||
      host.endsWith('.dashscope.aliyuncs.com') ||
      host === 'dashscope-intl.aliyuncs.com' ||
      host.endsWith('.dashscope-intl.aliyuncs.com')

    if (!isOfficial) return base

    // 官方域名：强制 /compatible-mode/v1（避免用户误填 /v1 导致 404/HTML）
    u.pathname = '/compatible-mode/v1'
    u.search = ''
    u.hash = ''
    return u.toString().replace(/\/+$/, '')
  } catch {
    return base
  }
}

/**
 * 导出常量：`dashscopeAdapter`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const dashscopeAdapter: ProviderAdapter = {
  type: 'dashscope',
  getRuntimeCapabilities: createStaticRuntimeCapabilities({
    'embedding-api': true,
    'image-api': true,
  }),

    /**
   * 内部方法：`createLanguageModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createLanguageModel(config, modelId) {
    const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(config)
    const baseURL = resolveDashScopeCompatibleBaseURL(apiHost)
    if (resolveModelTransportProtocol(config, modelId) === 'openai-responses') {
      const provider = createOpenAI({ apiKey, baseURL, headers, name: config.id, fetch: authFetch })
      return provider.responses(modelId)
    }
    const provider = createOpenAICompatible({
      name: config.id,
      apiKey,
      baseURL,
      headers,
      fetch: authFetch,
      includeUsage: shouldIncludeOpenAiCompatibleUsage(config),
      transformRequestBody: createOpenAiCompatibleRequestBodyTransformer(config),
      metadataExtractor: createOpenAiCompatibleInlineImageMetadataExtractor(config.id),
    })
    return provider(modelId)
  },

    /**
   * 内部方法：`createEmbeddingModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createEmbeddingModel(config, modelId) {
    const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(config)
    const baseURL = resolveDashScopeCompatibleBaseURL(apiHost)
    const provider = createOpenAICompatible({ name: config.id, apiKey, baseURL, headers, fetch: authFetch })
    return provider.embeddingModel(modelId)
  },

    /**
   * 内部方法：`createImageModel`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  createImageModel(config, modelId) {
    const { apiHost, authHeaders, headers } = resolveCommonParams(config)
    return new DashScopeImageModel(modelId, authHeaders, apiHost, headers)
  },

  /**
   * 内部方法：`createNativeWebSearchTools`。
   *
   * @remarks
   * DashScope OpenAI-compatible Responses 路径复用 OpenAI Responses 的 `web_search` tool 形态。
   */
  createNativeWebSearchTools(ctx) {
    const toolName = ctx.capability.toolName
    if (!toolName) return undefined
    const { apiHost, apiKey, headers, authFetch } = resolveCommonParams(ctx.config)
    const baseURL = resolveDashScopeCompatibleBaseURL(apiHost)
    const provider = createOpenAI({ apiKey, baseURL, headers, name: ctx.config.id, fetch: authFetch })
    const toolArgs = buildNativeWebSearchToolArgs(ctx.capability, ctx.params.modelParams) as Parameters<typeof provider.tools.webSearch>[0]
    return {
      [toolName]: provider.tools.webSearch(toolArgs),
    }
  },

    /**
   * 内部方法：`getCallSettingSupport`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getCallSettingSupport(ctx) {
    return openAiLikeCallSettingSupport({ modelId: ctx.modelId, qwenMtNoTempTopP: true })
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
   * 内部方法：`buildProviderOptions`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  buildProviderOptions(ctx: ProviderOptionsContext): Record<string, unknown> | undefined {
    const key = ctx.providerOptionsKey
    if (!key) return undefined

    const opts: Record<string, unknown> = {}
    const reasoningRuntime = buildProviderReasoningRuntimeOptions({
      model: `${ctx.providerId}/${ctx.modelId}`,
      transportProtocol: ctx.transportProtocol,
      modelParams: ctx.params.modelParams,
    })
    if (reasoningRuntime.providerOptions) {
      Object.assign(opts, reasoningRuntime.providerOptions)
    }

    if (Object.keys(opts).length === 0) return undefined
    return { [key]: opts }
  },

    /**
   * 内部方法：`getMiddlewares`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  getMiddlewares(ctx: MiddlewareContext): LanguageModelMiddleware[] {
    const middlewares: LanguageModelMiddleware[] = []

    // 对于 Qwen：当 Provider 不支持 enable_thinking 时，用 suffix 控制思考开关（与 openai-adapter 行为一致）
    const modelIdLower = normalizeModelIdForRules(ctx.modelId)
    if (ctx.config.apiOptions?.isNotSupportEnableThinking === true && shouldAppendQwenThinkingSuffix(modelIdLower)) {
      const enableThinking = buildProviderReasoningRuntimeOptions({
        model: `${ctx.providerId}/${ctx.modelId}`,
        transportProtocol: ctx.transportProtocol,
        modelParams: ctx.params.modelParams,
      }).suffixThinkingEnabled
      middlewares.push(
        createAppendSuffixToUserMessagesMiddleware({ suffix: enableThinking ? ' /think' : ' /no_think' }),
      )
    }

    // 抽取 <think>/<thought>/<reasoning> 标签为 reasoning delta（便于 UI 独立展示推理内容）
    middlewares.push(extractReasoningMiddleware({ tagName: pickReasoningTagName(modelIdLower) }))

    return middlewares
  },
}
