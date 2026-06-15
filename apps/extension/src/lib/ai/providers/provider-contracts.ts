/**
 * 说明：`provider-contracts` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-contracts` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ProviderTransportFamily`、`ProviderInputPolicy`、`ProviderContract` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ProviderType, TransportProtocol } from '../types'
import { isPlainRecord } from '@/lib/utils/type-guards'

/** 导出类型：`ProviderTransportFamily`。 */
export type ProviderTransportFamily =
  | 'openai-chat'
  | 'openai-responses'
  | 'openai-compatible'
  | 'azure-openai'
  | 'anthropic-messages'
  | 'gemini-generate-content'
  | 'cohere-chat'
  | 'bedrock-converse'
  | 'gateway'
  | 'proxy'

/** 导出类型：`ProviderInputModality`。 */
export type ProviderInputModality = 'image' | 'file'

/** 导出类型：`ProviderInputPolicy`。 */
export type ProviderInputPolicy = 'supported' | 'unsupported' | 'unverified'

/** 导出类型：`ProviderInputPolicies`。 */
export type ProviderInputPolicies = Readonly<Record<ProviderInputModality, ProviderInputPolicy>>

/** 导出类型：`ProviderContractOptionKey`。 */
export type ProviderContractOptionKey =
  | 'systemMessageMode'
  | 'modalities'
  | 'serviceTier'
  | 'service_tier'
  | 'store'
  | 'textVerbosity'
  | 'reasoning'
  | 'reasoning_effort'
  | 'reasoningConfig'
  | 'responseModalities'
  | 'thinkingConfig'
  | 'thinking'
  | 'enable_thinking'
  | 'thinking_budget'
  | 'think'

/** 导出类型：`ProviderContract`。 */
export interface ProviderContract {
  readonly providerId: string
  readonly transportFamily: ProviderTransportFamily
  readonly inputPolicies: ProviderInputPolicies
  readonly allowedProviderOptions: ReadonlyArray<ProviderContractOptionKey>
  readonly supportsResponses: boolean
  readonly supportsChatCompletions: boolean
}

type ProviderContractOverrides = Partial<Omit<ProviderContract, 'providerId'>>

const NO_PROVIDER_OPTIONS: ReadonlyArray<ProviderContractOptionKey> = Object.freeze([])
const OPENAI_CHAT_OPTIONS = Object.freeze([
  'systemMessageMode',
  'serviceTier',
  'textVerbosity',
  'reasoning_effort',
] satisfies ProviderContractOptionKey[])
const OPENAI_RESPONSES_OPTIONS = Object.freeze([
  'systemMessageMode',
  'modalities',
  'serviceTier',
  'store',
  'textVerbosity',
  'reasoning',
] satisfies ProviderContractOptionKey[])
const AZURE_OPENAI_OPTIONS = Object.freeze([
  'modalities',
  'service_tier',
  'textVerbosity',
  'reasoning_effort',
] satisfies ProviderContractOptionKey[])
const GROQ_OPTIONS = Object.freeze(['serviceTier', 'reasoning_effort'] satisfies ProviderContractOptionKey[])
const XAI_CHAT_OPTIONS = Object.freeze(['reasoning_effort'] satisfies ProviderContractOptionKey[])
const XAI_RESPONSES_OPTIONS = Object.freeze(['reasoning'] satisfies ProviderContractOptionKey[])
const GEMINI_OPTIONS = Object.freeze(['responseModalities', 'thinkingConfig'] satisfies ProviderContractOptionKey[])
const ANTHROPIC_OPTIONS = Object.freeze(['thinking'] satisfies ProviderContractOptionKey[])
const DEEPSEEK_OPTIONS = Object.freeze(['thinking'] satisfies ProviderContractOptionKey[])
const DASHSCOPE_OPTIONS = Object.freeze(['enable_thinking', 'thinking_budget'] satisfies ProviderContractOptionKey[])
const BEDROCK_OPTIONS = Object.freeze(['reasoningConfig'] satisfies ProviderContractOptionKey[])
const OLLAMA_OPTIONS = Object.freeze(['think'] satisfies ProviderContractOptionKey[])
const OPENROUTER_OPTIONS = Object.freeze(['reasoning'] satisfies ProviderContractOptionKey[])

/**
 * 内部函数：`createInputPolicies`。
 *
 * @remarks
 * 用于收束 Provider 输入模态策略的默认值，避免各处重复写字面量对象。
 */
function createInputPolicies(
  overrides?: Partial<ProviderInputPolicies>,
): ProviderInputPolicies {
  return {
    image: 'unverified',
    file: 'unverified',
    ...(overrides ?? {}),
  }
}

/**
 * 内部函数：`createBaseContract`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出和副作用边界需结合同文件上下文理解。
 */
function createBaseContract(providerId: string, overrides: ProviderContractOverrides): ProviderContract {
  return {
    providerId,
    transportFamily: 'openai-compatible',
    inputPolicies: createInputPolicies(),
    allowedProviderOptions: NO_PROVIDER_OPTIONS,
    supportsResponses: false,
    supportsChatCompletions: true,
    ...overrides,
  }
}

const BASE_PROVIDER_CONTRACTS: Readonly<Record<string, ProviderContract>> = Object.freeze({
  openai: createBaseContract('openai', {
    transportFamily: 'openai-responses',
    inputPolicies: createInputPolicies({ image: 'supported', file: 'supported' }),
    allowedProviderOptions: OPENAI_RESPONSES_OPTIONS,
    supportsResponses: true,
    supportsChatCompletions: true,
  }),
  anthropic: createBaseContract('anthropic', {
    transportFamily: 'anthropic-messages',
    inputPolicies: createInputPolicies({ image: 'supported', file: 'supported' }),
    allowedProviderOptions: ANTHROPIC_OPTIONS,
    supportsResponses: false,
    supportsChatCompletions: false,
  }),
  google: createBaseContract('google', {
    transportFamily: 'gemini-generate-content',
    inputPolicies: createInputPolicies({ image: 'supported', file: 'supported' }),
    allowedProviderOptions: GEMINI_OPTIONS,
    supportsResponses: false,
    supportsChatCompletions: false,
  }),
  deepseek: createBaseContract('deepseek', {
    transportFamily: 'openai-chat',
    inputPolicies: createInputPolicies({ image: 'unverified', file: 'unverified' }),
    allowedProviderOptions: DEEPSEEK_OPTIONS,
    supportsResponses: false,
    supportsChatCompletions: true,
  }),
  mistral: createBaseContract('mistral', {
    transportFamily: 'openai-compatible',
    inputPolicies: createInputPolicies({ image: 'supported', file: 'unverified' }),
  }),
  groq: createBaseContract('groq', {
    transportFamily: 'openai-compatible',
    inputPolicies: createInputPolicies({ image: 'supported', file: 'unverified' }),
    allowedProviderOptions: GROQ_OPTIONS,
  }),
  xai: createBaseContract('xai', {
    transportFamily: 'openai-chat',
    inputPolicies: createInputPolicies({ image: 'supported', file: 'unverified' }),
    allowedProviderOptions: XAI_CHAT_OPTIONS,
    supportsResponses: true,
    supportsChatCompletions: true,
  }),
  cohere: createBaseContract('cohere', {
    transportFamily: 'cohere-chat',
    inputPolicies: createInputPolicies({ image: 'supported', file: 'unsupported' }),
    allowedProviderOptions: Object.freeze(['thinking'] satisfies ProviderContractOptionKey[]),
    supportsResponses: false,
    supportsChatCompletions: false,
  }),
  moonshot: createBaseContract('moonshot', {
    transportFamily: 'openai-compatible',
    inputPolicies: createInputPolicies({ image: 'unverified', file: 'unverified' }),
  }),
  qwen: createBaseContract('qwen', {
    transportFamily: 'openai-compatible',
    inputPolicies: createInputPolicies({ image: 'supported', file: 'supported' }),
    allowedProviderOptions: DASHSCOPE_OPTIONS,
  }),
  siliconflow: createBaseContract('siliconflow', {
    transportFamily: 'openai-compatible',
    inputPolicies: createInputPolicies({ image: 'supported', file: 'supported' }),
    allowedProviderOptions: DASHSCOPE_OPTIONS,
  }),
  zhipu: createBaseContract('zhipu', {
    transportFamily: 'openai-compatible',
    inputPolicies: createInputPolicies({ image: 'unverified', file: 'unverified' }),
  }),
  together: createBaseContract('together', {
    transportFamily: 'openai-compatible',
    inputPolicies: createInputPolicies({ image: 'supported', file: 'supported' }),
  }),
  perplexity: createBaseContract('perplexity', {
    transportFamily: 'openai-compatible',
    inputPolicies: createInputPolicies({ image: 'supported', file: 'unverified' }),
  }),
  fireworks: createBaseContract('fireworks', {
    transportFamily: 'openai-compatible',
    inputPolicies: createInputPolicies({ image: 'supported', file: 'unverified' }),
  }),
  minimax: createBaseContract('minimax', {
    transportFamily: 'openai-compatible',
    inputPolicies: createInputPolicies({ image: 'unverified', file: 'unverified' }),
  }),
  baichuan: createBaseContract('baichuan', {
    transportFamily: 'openai-compatible',
    inputPolicies: createInputPolicies({ image: 'unverified', file: 'unverified' }),
  }),
  openrouter: createBaseContract('openrouter', {
    transportFamily: 'openai-compatible',
    inputPolicies: createInputPolicies({ image: 'supported', file: 'supported' }),
    allowedProviderOptions: OPENROUTER_OPTIONS,
  }),
  'vercel-ai-gateway': createBaseContract('vercel-ai-gateway', {
    transportFamily: 'gateway',
    inputPolicies: createInputPolicies({ image: 'supported', file: 'supported' }),
    supportsResponses: true,
    supportsChatCompletions: true,
  }),
  'azure-openai': createBaseContract('azure-openai', {
    transportFamily: 'azure-openai',
    inputPolicies: createInputPolicies({ image: 'supported', file: 'supported' }),
    allowedProviderOptions: AZURE_OPENAI_OPTIONS,
    supportsResponses: false,
    supportsChatCompletions: true,
  }),
  'aws-bedrock': createBaseContract('aws-bedrock', {
    transportFamily: 'bedrock-converse',
    inputPolicies: createInputPolicies({ image: 'supported', file: 'supported' }),
    allowedProviderOptions: BEDROCK_OPTIONS,
    supportsResponses: false,
    supportsChatCompletions: false,
  }),
  vertexai: createBaseContract('vertexai', {
    transportFamily: 'gemini-generate-content',
    inputPolicies: createInputPolicies({ image: 'supported', file: 'supported' }),
    allowedProviderOptions: GEMINI_OPTIONS,
    supportsResponses: false,
    supportsChatCompletions: false,
  }),
  'vertex-anthropic': createBaseContract('vertex-anthropic', {
    transportFamily: 'anthropic-messages',
    inputPolicies: createInputPolicies({ image: 'supported', file: 'supported' }),
    allowedProviderOptions: ANTHROPIC_OPTIONS,
    supportsResponses: false,
    supportsChatCompletions: false,
  }),
  'new-api': createBaseContract('new-api', {
    transportFamily: 'proxy',
    inputPolicies: createInputPolicies({ image: 'unverified', file: 'unsupported' }),
    supportsResponses: true,
    supportsChatCompletions: true,
  }),
  'openai-compatible-custom': createBaseContract('openai-compatible-custom', {
    transportFamily: 'openai-compatible',
    inputPolicies: createInputPolicies({ image: 'unverified', file: 'unsupported' }),
  }),
  ollama: createBaseContract('ollama', {
    transportFamily: 'openai-compatible',
    inputPolicies: createInputPolicies({ image: 'supported', file: 'unverified' }),
    allowedProviderOptions: OLLAMA_OPTIONS,
  }),
  lmstudio: createBaseContract('lmstudio', {
    transportFamily: 'openai-compatible',
    inputPolicies: createInputPolicies({ image: 'supported', file: 'unverified' }),
  }),
})

/**
 * 内部函数：`resolveDynamicTransportFamily`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出和副作用边界需结合同文件上下文理解。
 */
function resolveDynamicTransportFamily(
  effectiveProviderType: ProviderType | undefined,
  transportProtocol: TransportProtocol | undefined,
): ProviderTransportFamily | undefined {
  if (transportProtocol === 'anthropic-messages') return 'anthropic-messages'
  if (transportProtocol === 'gemini-generate-content') return 'gemini-generate-content'
  if (transportProtocol === 'openai-responses') return 'openai-responses'
  if (transportProtocol === 'openai-chat') return 'openai-chat'
  if (effectiveProviderType === 'azure-openai') return 'azure-openai'
  if (effectiveProviderType === 'anthropic' || effectiveProviderType === 'vertex-anthropic') return 'anthropic-messages'
  if (effectiveProviderType === 'gemini' || effectiveProviderType === 'vertexai') return 'gemini-generate-content'
  if (effectiveProviderType === 'cohere') return 'cohere-chat'
  if (effectiveProviderType === 'aws-bedrock') return 'bedrock-converse'
  if (effectiveProviderType === 'gateway') return 'gateway'
  return undefined
}

/**
 * 内部函数：`createDerivedContract`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出和副作用边界需结合同文件上下文理解。
 */
function createDerivedContract(base: ProviderContract, overrides: ProviderContractOverrides): ProviderContract {
  return {
    ...base,
    ...overrides,
  }
}

/**
 * 判断 providerOptions 命名空间中的键是否与 contract 真源匹配。
 *
 * 说明：
 * - contract 记录官方原生字段名；
 * - AI SDK 少数 providerOptions 仍要求内部别名（例如 `reasoningEffort`）；
 * - 这里统一做别名映射，避免 contract 再退回内部抽象名。
 */
function isAllowedProviderOptionKey(
  optionKey: string,
  allowedKeys: ReadonlyArray<ProviderContractOptionKey>,
): boolean {
  if (allowedKeys.includes(optionKey as ProviderContractOptionKey)) return true

  if (optionKey === 'reasoningEffort') {
    return allowedKeys.includes('reasoning_effort') || allowedKeys.includes('reasoning')
  }

  return false
}

/**
 * 导出函数：`resolveProviderContract`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function resolveProviderContract(args: {
  providerId: string
  providerType?: ProviderType
  effectiveProviderType?: ProviderType
  transportProtocol?: TransportProtocol
}): ProviderContract {
  const providerId = String(args.providerId || '').trim()
  const base = BASE_PROVIDER_CONTRACTS[providerId] ?? createBaseContract(providerId || 'unknown', {
    inputPolicies: createInputPolicies({ image: 'unverified', file: 'unsupported' }),
  })
  const effectiveProviderType = args.effectiveProviderType ?? args.providerType
  const transportProtocol = args.transportProtocol

  if (providerId === 'new-api') {
    if (!transportProtocol || transportProtocol === 'unknown') {
      return createDerivedContract(base, {
        transportFamily: 'proxy',
        inputPolicies: createInputPolicies({ image: 'unverified', file: 'unsupported' }),
        allowedProviderOptions: NO_PROVIDER_OPTIONS,
      })
    }

    if (transportProtocol === 'anthropic-messages') {
      return createDerivedContract(base, {
        transportFamily: 'anthropic-messages',
        inputPolicies: createInputPolicies({ image: 'supported', file: 'unsupported' }),
        allowedProviderOptions: ANTHROPIC_OPTIONS,
        supportsResponses: false,
        supportsChatCompletions: false,
      })
    }

    if (transportProtocol === 'gemini-generate-content') {
      return createDerivedContract(base, {
        transportFamily: 'gemini-generate-content',
        inputPolicies: createInputPolicies({ image: 'supported', file: 'unsupported' }),
        allowedProviderOptions: GEMINI_OPTIONS,
        supportsResponses: false,
        supportsChatCompletions: false,
      })
    }

    if (transportProtocol === 'openai-responses') {
      return createDerivedContract(base, {
        transportFamily: 'openai-responses',
        inputPolicies: createInputPolicies({ image: 'supported', file: 'unsupported' }),
        allowedProviderOptions: OPENAI_RESPONSES_OPTIONS,
        supportsResponses: true,
        supportsChatCompletions: false,
      })
    }

    return createDerivedContract(base, {
      transportFamily: 'openai-chat',
      inputPolicies: createInputPolicies({ image: 'supported', file: 'unsupported' }),
      allowedProviderOptions: OPENAI_CHAT_OPTIONS,
      supportsResponses: false,
      supportsChatCompletions: true,
    })
  }

  if (providerId === 'openai') {
    const transportFamily = resolveDynamicTransportFamily(effectiveProviderType, transportProtocol)
    if (transportFamily === 'openai-chat') {
      return createDerivedContract(base, {
        transportFamily,
        inputPolicies: createInputPolicies({ image: 'supported', file: 'supported' }),
        allowedProviderOptions: OPENAI_CHAT_OPTIONS,
        supportsResponses: false,
        supportsChatCompletions: true,
      })
    }

    return createDerivedContract(base, {
      transportFamily: transportFamily ?? base.transportFamily,
      inputPolicies: createInputPolicies({ image: 'supported', file: 'supported' }),
      allowedProviderOptions: OPENAI_RESPONSES_OPTIONS,
      supportsResponses: true,
      supportsChatCompletions: transportFamily === 'openai-responses' ? false : true,
    })
  }

  if (providerId === 'xai') {
    if (transportProtocol === 'openai-responses') {
      return createDerivedContract(base, {
        transportFamily: 'openai-responses',
        inputPolicies: createInputPolicies({ image: 'supported', file: 'unverified' }),
        allowedProviderOptions: XAI_RESPONSES_OPTIONS,
        supportsResponses: true,
        supportsChatCompletions: false,
      })
    }

    return createDerivedContract(base, {
      transportFamily: 'openai-chat',
      inputPolicies: createInputPolicies({ image: 'supported', file: 'unverified' }),
      allowedProviderOptions: XAI_CHAT_OPTIONS,
      supportsResponses: false,
      supportsChatCompletions: true,
    })
  }

  if (providerId === 'azure-openai') {
    return createDerivedContract(base, {
      transportFamily: 'azure-openai',
      inputPolicies: createInputPolicies({ image: 'supported', file: 'supported' }),
      allowedProviderOptions: AZURE_OPENAI_OPTIONS,
      supportsResponses: false,
      supportsChatCompletions: true,
    })
  }

  const transportFamily = resolveDynamicTransportFamily(effectiveProviderType, transportProtocol)
  if (!transportFamily) return base
  return createDerivedContract(base, { transportFamily })
}

/**
 * 导出函数：`getAllProviderContracts`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function getAllProviderContracts(): ReadonlyArray<ProviderContract> {
  return Object.values(BASE_PROVIDER_CONTRACTS)
}

/**
 * 导出函数：`providerContractAllowsOption`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function providerContractAllowsOption(contract: ProviderContract, key: ProviderContractOptionKey): boolean {
  return contract.allowedProviderOptions.includes(key)
}

/**
 * 导出函数：`filterProviderOptionsByContract`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function filterProviderOptionsByContract(args: {
  contract: ProviderContract
  providerOptionsKey: string | null
  providerOptions: Record<string, unknown> | undefined
}): Record<string, unknown> | undefined {
  const { contract, providerOptionsKey, providerOptions } = args
  if (!providerOptions || !providerOptionsKey) return providerOptions

  const namespace = providerOptions[providerOptionsKey]
  if (!isPlainRecord(namespace)) return providerOptions

  const filteredEntries = Object.entries(namespace).filter(([key, value]) => {
    if (!isAllowedProviderOptionKey(key, contract.allowedProviderOptions)) return false
    return value !== undefined
  })
  if (filteredEntries.length === 0) return undefined

  return {
    [providerOptionsKey]: Object.fromEntries(filteredEntries),
  }
}
