/**
 * 说明：`stream-chat-utils` AI 能力模块。
 *
 * 职责：
 * - 承载 `stream-chat-utils` 相关的当前文件实现与模块边界；
 * - 对外暴露 `normalizeModelIdForRules`、`createTransformParamsMiddleware`、`stripRedacted` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { JSONValue, JSONObject, SharedV3ProviderOptions, LanguageModelV3Message } from '@ai-sdk/provider'
import type { LanguageModelMiddleware } from 'ai'
import { approximateTokenSize } from 'tokenx'
import type { ProviderType, TransportProtocol } from './types'

/**
 * 将模型 ID 归一化为规则引擎可稳定匹配的形式。
 *
 * @param modelId - 原始模型 ID，允许为空或带多余空格。
 * @returns 去空格并转为小写后的模型 ID；空值会落为 `''`。
 */
export function normalizeModelIdForRules(modelId: string): string {
  return String(modelId || '').trim().toLowerCase()
}

/**
 * 规则 R4：高阶工厂——创建只含 transformParams 的 LanguageModelMiddleware。
 * 避免每个 middleware 都重复写 specificationVersion + transformParams 样板代码。
 */
export function createTransformParamsMiddleware(
  fn: NonNullable<LanguageModelMiddleware['transformParams']>,
): LanguageModelMiddleware {
  return { specificationVersion: 'v3', transformParams: fn }
}

/**
 * 规则 R4：纯函数——移除字符串中所有 [REDACTED] 占位符。
 * 用于 OpenRouter reasoning redaction middleware。
 */
export function stripRedacted(text: string): string {
  return text.split('[REDACTED]').join('')
}

/**
 * 根据 Provider 类型和模型传输协议，推导真正落地的底层 Provider 类型。
 *
 * 主要用于 `new-api` 这种“聚合入口” Provider：
 * - UI/配置层看到的是 `new-api`；
 * - 运行时真正调用的可能是 Anthropic、Gemini 或 OpenAI 系协议。
 *
 * @param providerType - Provider 声明的逻辑类型。
 * @param transportProtocol - 模型当前绑定的底层传输协议。
 * @returns 运行时真正应该参与规则判断的 Provider 类型。
 */
export function resolveEffectiveProviderType({
  providerId,
  providerType,
  transportProtocol,
}: {
  providerId?: string
  providerType: ProviderType | undefined
  transportProtocol: TransportProtocol | undefined
}): ProviderType | undefined {
  if (!providerType) return undefined
  const pid = String(providerId || '').trim().toLowerCase()
  if (providerType === 'openai' && pid === 'openai' && transportProtocol === 'openai-responses') {
    return 'openai-response'
  }
  if (providerType !== 'new-api') return providerType

  // 适配 NewAPI：按模型 transportProtocol 分流到底层真实协议。
  if (transportProtocol === 'anthropic-messages') return 'anthropic'
  if (transportProtocol === 'gemini-generate-content') return 'gemini'
  if (transportProtocol === 'openai-responses') return 'openai-response'
  // 默认：OpenAI Chat Completions（也覆盖 image / embedding / rerank 的 OpenAI-compatible 目录场景）
  return 'openai'
}

/**
 * 计算 AI SDK `providerOptions` 需要使用的命名空间 key。
 *
 * 不同 Provider 在 AI SDK 中读取 options 的 key 并不总等于本地 `providerId`，
 * 这里统一封装映射规则，避免在调用链各处重复分支判断。
 *
 * @param providerId - 当前 Provider ID。
 * @param providerType - Provider 配置层类型。
 * @param effectiveProviderType - 结合 transport protocol 推导后的底层类型。
 * @returns 可写入 `providerOptions` 的 key；若当前 Provider 不支持则返回 `null`。
 */
export function getProviderOptionsKey({
  providerId,
  providerType,
  effectiveProviderType,
}: {
  providerId: string
  providerType: ProviderType | undefined
  effectiveProviderType: ProviderType | undefined
}): string | null {
  const pid = String(providerId || '').trim()
  if (!pid) return null

  // 优先使用 effectiveProviderType：NewAPI 会把协议“降到”真实端点
  const t = effectiveProviderType || providerType

  switch (t) {
    case 'openai-response':
      // @ai-sdk/openai：providerOptions 固定读取 openai/azure（与 provider.name 无关）
      return 'openai'
    case 'openai':
      // 对于 OpenAI 官方（id=openai）走 @ai-sdk/openai；其它平台走 openai-compatible（命名空间=providerId）
      return pid.toLowerCase() === 'openai' ? 'openai' : pid
    case 'dashscope':
    case 'siliconflow':
      // 说明：两者都使用 openai-compatible 语言模型实现（命名空间=providerId）。
      return pid
    case 'azure-openai':
    case 'ollama':
      // 说明：openai-compatible 的命名空间为 providerId
      return pid
    case 'anthropic':
    case 'vertex-anthropic':
      // 对于 Anthropic：兼容读取 canonical 'anthropic' key
      return 'anthropic'
    case 'cohere':
      return 'cohere'
    case 'deepseek':
      return 'deepseek'
    case 'gemini':
      return 'google'
    case 'groq':
      return 'groq'
    case 'vertexai':
      // @ai-sdk/google-vertex：chat providerOptionsName 为 vertex
      return 'vertex'
    case 'aws-bedrock':
      return 'bedrock'
    case 'gateway':
      return 'gateway'
    case 'mistral':
      return 'mistral'
    case 'xai':
      return 'xai'
    default:
      return null
  }
}

/**
 * 获取 OpenAI-compatible Provider 在 `providerOptions` 中对应的命名空间。
 *
 * 该函数只处理“兼容 OpenAI 协议但 key 不是官方 `openai`”的场景，
 * 供中间件或调用层在追加 headers / body 参数时复用。
 *
 * @param providerId - 当前 Provider ID。
 * @param providerType - Provider 配置层类型。
 * @param effectiveProviderType - 运行时推导出的底层协议类型。
 * @returns OpenAI-compatible 命名空间；若当前 Provider 不属于该范畴则返回 `null`。
 */
export function getOpenAiCompatibleProviderKey({
  providerId,
  providerType,
  effectiveProviderType,
}: {
  providerId: string
  providerType: ProviderType | undefined
  effectiveProviderType: ProviderType | undefined
}): string | null {
  const pid = String(providerId || '').trim()
  if (!pid) return null

  // 对于 openai-compatible：providerOptions 的命名空间等于 providerId（createOpenAICompatible({ name })）
  if (providerType === 'azure-openai' || providerType === 'ollama') return pid
  if (providerType === 'dashscope' || providerType === 'siliconflow') return pid
  if (providerType === 'openai' && pid.toLowerCase() !== 'openai') return pid
  if (providerType === 'new-api' && (effectiveProviderType === 'openai' || effectiveProviderType === undefined)) return pid
  return null
}

/**
 * 为推理内容提取逻辑选择模型最常见的 reasoning XML/tag 名称。
 *
 * @param modelIdLower - 已转小写的模型 ID。
 * @returns 当前模型族更可能使用的 reasoning 标签名。
 */
export function pickReasoningTagName(modelIdLower: string): string {
  // 仅用于 extractReasoningMiddleware：把 <think>/<thought>/<reasoning> 等标签分离为 reasoning delta。
  if (modelIdLower.includes('gpt-oss')) return 'reasoning'
  if (modelIdLower.includes('gemini')) return 'thought'
  if (modelIdLower.includes('seed-oss-36b')) return 'seed:think'
  return 'think'
}

/**
 * 判断模型 ID 是否属于 Gemini 3 系列。
 *
 * @param modelIdLower - 已转小写的模型 ID。
 * @returns `true` 表示当前模型属于 Gemini 3 系列。
 */
export function isGemini3ModelId(modelIdLower: string): boolean {
  return modelIdLower.includes('gemini-3')
}

/**
 * 判断是否需要为用户消息自动追加 Qwen 思考控制后缀。
 *
 * 当前策略只对白名单模型族启用，避免误给不支持的 instruct/coder/thinking 变体拼接指令。
 *
 * @param modelIdLower - 已转小写的模型 ID。
 * @returns `true` 表示允许追加 ` /think` 或 ` /no_think` 后缀。
 */
export function shouldAppendQwenThinkingSuffix(modelIdLower: string): boolean {
  // 目标：按当前实现“Qwen 思考控制”的覆盖面，同时避免误伤 instruct/thinking/coder 等变体。
  if (!modelIdLower) return false
  if (modelIdLower.includes('coder')) return false

  if (modelIdLower.startsWith('qwen3')) {
    // 说明：instruct/thinking 系列本身不支持通过 suffix 控制
    if (modelIdLower.includes('instruct') || modelIdLower.includes('thinking')) return false
    // 大多数 qwen3-* 推理模型可控；qwen3-max 走下方白名单（避免把未知 max 变体误判为可控）
    if (!modelIdLower.startsWith('qwen3-max')) return true
  }

  // 阿里云 Model Studio 的“深度思考”可控模型族：plus/turbo/flash 与部分 qwen3/3.5 系列
  const prefixes = ['qwen-plus', 'qwen-turbo', 'qwen-flash', 'qwen3-max', 'qwen3.5-plus', 'qwen3.5-']
  if (prefixes.some((p) => modelIdLower.startsWith(p))) {
    // 排除明确的不可控变体（与上面的 qwen3 分支一致）
    if (modelIdLower.includes('instruct') || modelIdLower.includes('thinking')) return false
    return true
  }

  return false
}

/**
 * 创建“严格 user/assistant 交替”中间件。
 *
 * 某些模型/网关要求提示词中的 user 与 assistant 必须严格交错，
 * 当连续出现相同角色时，这里会插入一条空消息占位，保持最小侵入地修复提示词结构。
 *
 * @returns 用于 AI SDK 的语言模型中间件。
 */
export function createStrictInterleaveMiddleware(): LanguageModelMiddleware {
  return createTransformParamsMiddleware(async ({ params }) => {
    if (!Array.isArray(params.prompt) || params.prompt.length === 0) return params

    const prompt = params.prompt as LanguageModelV3Message[]
    const out: LanguageModelV3Message[] = []
    let prevRole: 'user' | 'assistant' | null = null

    /**
     * 构造最小占位空消息，用于打断连续相同 role。
     *
     * @param role - 要生成的占位消息角色。
     * @returns 仅包含空文本 part 的消息对象。
     */
    const makeEmpty = (role: 'user' | 'assistant'): LanguageModelV3Message => {
      const emptyText = { type: 'text', text: '' } as const
      return role === 'user'
        ? ({ role: 'user', content: [emptyText] } as unknown as LanguageModelV3Message)
        : ({ role: 'assistant', content: [emptyText] } as unknown as LanguageModelV3Message)
    }

    for (const msg of prompt) {
      const role = msg.role
      if ((role === 'user' || role === 'assistant') && prevRole === role) {
        out.push(makeEmpty(role === 'user' ? 'assistant' : 'user'))
        prevRole = role === 'user' ? 'assistant' : 'user'
      }

      out.push(msg)
      prevRole = role === 'user' || role === 'assistant' ? role : prevRole
    }

    return { ...params, prompt: out }
  })
}

/**
 * 为所有用户消息的最后一个文本片段追加固定后缀。
 *
 * 主要用于 Qwen 等模型的“显式思考控制”开关：
 * - 若末尾已带 ` /think` 或 ` /no_think`，则保持原样；
 * - 若消息没有文本片段，则追加一个最小文本 part。
 *
 * @param suffix - 要附加的思考控制后缀。
 * @returns 用于 AI SDK 的语言模型中间件。
 */
export function createAppendSuffixToUserMessagesMiddleware({
  suffix,
}: {
  suffix: ' /think' | ' /no_think'
}): LanguageModelMiddleware {
  return createTransformParamsMiddleware(async ({ params }) => {
    if (!Array.isArray(params.prompt) || params.prompt.length === 0) return params

    const prompt = (params.prompt as LanguageModelV3Message[]).map((msg) => {
      if (msg.role !== 'user' || !Array.isArray(msg.content) || msg.content.length === 0) return msg

      const last = msg.content[msg.content.length - 1] as unknown as { type?: unknown; text?: unknown }
      if (last && last.type === 'text' && typeof last.text === 'string') {
        if (last.text.endsWith('/think') || last.text.endsWith('/no_think')) return msg
        const next = [...msg.content]
        next[next.length - 1] = { ...(last as { type: 'text'; text: string }), text: last.text + suffix } as unknown as typeof msg.content[number]
        return { ...msg, content: next } as LanguageModelV3Message
      }

      // 没有 text part：补一个（保持最小侵入）
      return { ...msg, content: [...msg.content, { type: 'text', text: suffix.trim() }] } as unknown as LanguageModelV3Message
    })

    return { ...params, prompt }
  })
}

/**
 * 创建 OpenRouter reasoning 脱敏清理中间件。
 *
 * OpenRouter 某些返回会把 reasoning 内容替换成 `[REDACTED]` 占位符，
 * 这里会在同步生成与流式生成两条链路上统一去掉该占位，避免 UI 直接展示无意义标记。
 *
 * @returns 同时包裹 `generate` 与 `stream` 的中间件。
 */
export function createOpenrouterReasoningRedactionMiddleware(): LanguageModelMiddleware {
  return {
    specificationVersion: 'v3',
    wrapGenerate: async ({ doGenerate }) => {
      const { content, ...rest } = await doGenerate()
      const next = content.map((p) => {
        if (p.type === 'reasoning' && typeof p.text === 'string' && p.text.includes('[REDACTED]')) {
          return { ...p, text: stripRedacted(p.text) }
        }
        return p
      })
      return { content: next, ...rest }
    },
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream()
      return {
        stream: stream.pipeThrough(
          new TransformStream({
                        /**
             * 内部方法：`transform`。
             *
             * @remarks
             * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
             */
            transform(chunk, controller) {
              if (chunk.type === 'reasoning-delta' && typeof chunk.delta === 'string' && chunk.delta.includes('[REDACTED]')) {
                controller.enqueue({ ...chunk, delta: stripRedacted(chunk.delta) })
                return
              }
              controller.enqueue(chunk)
            },
          }),
        ),
        ...rest,
      }
    },
  }
}

/**
 * 估算消息内容的 token 数量。
 *
 * 这里只统计纯文本内容，供 prompt caching、阈值判断等轻量逻辑复用，
 * 不追求与服务端 tokenizer 完全一致，但需要保持稳定、快速。
 *
 * @param content - AI SDK v3 message content。
 * @returns 文本内容的近似 token 数。
 */
export function estimateContentTokens(content: LanguageModelV3Message['content']): number {
  if (typeof content === 'string') return approximateTokenSize(content)
  if (!Array.isArray(content)) return 0
  let sum = 0
  for (const part of content) {
    if (part && typeof part === 'object' && (part as { type?: unknown }).type === 'text') {
      const text = (part as { text?: unknown }).text
      if (typeof text === 'string' && text) sum += approximateTokenSize(text)
    }
  }
  return sum
}

/**
 * 为 Anthropic Prompt Caching 自动补齐缓存标记中间件。
 *
 * 说明：
 * - 只在消息累计 token 达到阈值时才写入 `cacheControl`，避免小请求白白占用缓存额度；
 * - 支持分别控制是否缓存第一条长 system message，以及倒数 N 条长消息的最后一个内容片段；
 * - 该中间件只改写 `providerOptions`，不改变消息正文顺序与文本内容。
 */
export function createAnthropicPromptCachingMiddleware(settings: {
  tokenThreshold: number
  cacheSystemMessage: boolean
  cacheLastNMessages: number
}): LanguageModelMiddleware {
  const cacheProviderOptions: SharedV3ProviderOptions = { anthropic: { cacheControl: { type: 'ephemeral' } } }

  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      if (!Array.isArray(params.prompt) || params.prompt.length === 0) return params
      if (!settings.tokenThreshold || settings.tokenThreshold <= 0) return params

      const prompt = [...(params.prompt as LanguageModelV3Message[])]

      const { tokenThreshold, cacheSystemMessage, cacheLastNMessages } = settings

      // 1) system：在满足阈值时对第一条较长的 system message 打上缓存标记
      if (cacheSystemMessage) {
        for (let i = 0; i < prompt.length; i += 1) {
          const msg = prompt[i] as LanguageModelV3Message
          if (msg.role !== 'system') continue
          const tokens = estimateContentTokens(msg.content)
          if (tokens >= tokenThreshold) {
            prompt[i] = { ...msg, providerOptions: cacheProviderOptions }
            break
          }
        }
      }

      // 2) last N messages：当“到当前消息的累计 tokens”超过阈值时，从后往前给最后一个 content part 打标
      if (cacheLastNMessages > 0) {
        const cumsum: number[] = []
        let total = 0
        for (let i = 0; i < prompt.length; i += 1) {
          const msg = prompt[i] as LanguageModelV3Message
          total += estimateContentTokens(msg.content)
          cumsum.push(total)
        }

        let marked = 0
        for (let i = prompt.length - 1; i >= 0 && marked < cacheLastNMessages; i -= 1) {
          const msg = prompt[i] as LanguageModelV3Message
          if (msg.role === 'system') continue
          if (cumsum[i] < tokenThreshold) continue
          if (!Array.isArray(msg.content) || msg.content.length === 0) continue

          const nextContent = [...msg.content]
          const lastIndex = nextContent.length - 1
          nextContent[lastIndex] = { ...(nextContent[lastIndex] as object), providerOptions: cacheProviderOptions } as typeof nextContent[number]
          prompt[i] = { ...msg, content: nextContent } as LanguageModelV3Message
          marked += 1
        }
      }

      return { ...params, prompt }
    },
  }
}

/**
 * 为 Gemini/Vertex 系推理与工具链路补齐占位 thought signature。
 *
 * 说明：
 * - 某些 Gemini 兼容实现会在重放 reasoning part 或多步工具调用时丢失 `thoughtSignature`；
 * - 缺少该字段时，服务端/SDK 校验器可能拒绝后续请求，因此这里用稳定魔法值跳过校验；
 * - 仅补充 providerOptions，不会修改原始 reasoning/tool-call 内容。
 */
export function createSkipGeminiThoughtSignatureMiddleware(aiSdkKey: string): LanguageModelMiddleware {
  const MAGIC = 'skip_thought_signature_validator'
  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      if (!Array.isArray(params.prompt) || params.prompt.length === 0) return params
      if (!aiSdkKey) return params

      const prompt = (params.prompt as LanguageModelV3Message[]).map((msg) => {
        if (typeof msg.content === 'string') return msg

        const content = msg.content.map((part) => {
          if (!part || typeof part !== 'object') return part
          const p = part as unknown as { type?: unknown; providerOptions?: unknown }
          const type = typeof p.type === 'string' ? p.type : ''
          const providerOptions =
            p.providerOptions && typeof p.providerOptions === 'object' ? (p.providerOptions as SharedV3ProviderOptions) : undefined

          const hasExistingSignature = Boolean(
            providerOptions &&
              providerOptions[aiSdkKey] &&
              typeof (providerOptions[aiSdkKey] as { thoughtSignature?: unknown }).thoughtSignature === 'string',
          )
          const isReasoningPart = type === 'reasoning'
          const isToolCallPart = type === 'tool-call'

          const next = { ...(p as Record<string, unknown>) } as Record<string, unknown>

          // 场景 1/2：原生 Gemini/Vertex 需要 thoughtSignature 才能通过 validator（重放/多步工具链路会丢字段）
          if (hasExistingSignature || isReasoningPart) {
            const cur = (next.providerOptions && typeof next.providerOptions === 'object' ? next.providerOptions : {}) as SharedV3ProviderOptions
            const curProvider = (cur[aiSdkKey] && typeof cur[aiSdkKey] === 'object' ? cur[aiSdkKey] : {}) as Record<string, unknown>
            cur[aiSdkKey] = { ...curProvider, thoughtSignature: MAGIC }
            next.providerOptions = cur
          }

          // 场景 3：Google OpenAI-compatible API 的 tool-call 需要 extra_content.google.thought_signature
          if (isToolCallPart) {
            const cur = (next.providerOptions && typeof next.providerOptions === 'object' ? next.providerOptions : {}) as SharedV3ProviderOptions
            const openaiCompatible = (cur.openaiCompatible && typeof cur.openaiCompatible === 'object' ? cur.openaiCompatible : {}) as JSONObject
            openaiCompatible.extra_content = { google: { thought_signature: MAGIC } } as JSONValue
            cur.openaiCompatible = openaiCompatible
            next.providerOptions = cur
          }

          return next as unknown as typeof part
        })

        return { ...msg, content } as LanguageModelV3Message
      })

      return { ...params, prompt }
    },
  }
}
