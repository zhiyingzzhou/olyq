/**
 * 说明：`provider-contracts.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-contracts.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest'

import { DEFAULT_PROVIDERS } from '../config/provider-defaults'
import { resolveProviderContract, type ProviderContractOptionKey } from './provider-contracts'

const EXPECTED_PROVIDER_MATRIX: Record<
  string,
  {
    inputPolicies: {
      image: 'supported' | 'unsupported' | 'unverified'
      file: 'supported' | 'unsupported' | 'unverified'
    }
    allowedProviderOptions: ProviderContractOptionKey[]
  }
> = {
  openai: {
    inputPolicies: { image: 'supported', file: 'supported' },
    allowedProviderOptions: ['systemMessageMode', 'modalities', 'serviceTier', 'store', 'textVerbosity', 'reasoning'],
  },
  anthropic: {
    inputPolicies: { image: 'supported', file: 'supported' },
    allowedProviderOptions: ['thinking'],
  },
  google: {
    inputPolicies: { image: 'supported', file: 'supported' },
    allowedProviderOptions: ['responseModalities', 'thinkingConfig'],
  },
  deepseek: {
    inputPolicies: { image: 'unverified', file: 'unverified' },
    allowedProviderOptions: ['thinking'],
  },
  mistral: {
    inputPolicies: { image: 'supported', file: 'unverified' },
    allowedProviderOptions: [],
  },
  groq: {
    inputPolicies: { image: 'supported', file: 'unverified' },
    allowedProviderOptions: ['serviceTier', 'reasoning_effort'],
  },
  xai: {
    inputPolicies: { image: 'supported', file: 'unverified' },
    allowedProviderOptions: ['reasoning_effort'],
  },
  cohere: {
    inputPolicies: { image: 'supported', file: 'unsupported' },
    allowedProviderOptions: ['thinking'],
  },
  moonshot: {
    inputPolicies: { image: 'unverified', file: 'unverified' },
    allowedProviderOptions: [],
  },
  qwen: {
    inputPolicies: { image: 'supported', file: 'supported' },
    allowedProviderOptions: ['enable_thinking', 'thinking_budget'],
  },
  siliconflow: {
    inputPolicies: { image: 'supported', file: 'supported' },
    allowedProviderOptions: ['enable_thinking', 'thinking_budget'],
  },
  zhipu: {
    inputPolicies: { image: 'unverified', file: 'unverified' },
    allowedProviderOptions: [],
  },
  together: {
    inputPolicies: { image: 'supported', file: 'supported' },
    allowedProviderOptions: [],
  },
  perplexity: {
    inputPolicies: { image: 'supported', file: 'unverified' },
    allowedProviderOptions: [],
  },
  fireworks: {
    inputPolicies: { image: 'supported', file: 'unverified' },
    allowedProviderOptions: [],
  },
  minimax: {
    inputPolicies: { image: 'unverified', file: 'unverified' },
    allowedProviderOptions: [],
  },
  baichuan: {
    inputPolicies: { image: 'unverified', file: 'unverified' },
    allowedProviderOptions: [],
  },
  openrouter: {
    inputPolicies: { image: 'supported', file: 'supported' },
    allowedProviderOptions: ['reasoning'],
  },
  'vercel-ai-gateway': {
    inputPolicies: { image: 'supported', file: 'supported' },
    allowedProviderOptions: [],
  },
  'azure-openai': {
    inputPolicies: { image: 'supported', file: 'supported' },
    allowedProviderOptions: ['modalities', 'service_tier', 'textVerbosity', 'reasoning_effort'],
  },
  'aws-bedrock': {
    inputPolicies: { image: 'supported', file: 'supported' },
    allowedProviderOptions: ['reasoningConfig'],
  },
  vertexai: {
    inputPolicies: { image: 'supported', file: 'supported' },
    allowedProviderOptions: ['responseModalities', 'thinkingConfig'],
  },
  'vertex-anthropic': {
    inputPolicies: { image: 'supported', file: 'supported' },
    allowedProviderOptions: ['thinking'],
  },
  'new-api': {
    inputPolicies: { image: 'unverified', file: 'unsupported' },
    allowedProviderOptions: [],
  },
  'openai-compatible-custom': {
    inputPolicies: { image: 'unverified', file: 'unsupported' },
    allowedProviderOptions: [],
  },
  ollama: {
    inputPolicies: { image: 'supported', file: 'unverified' },
    allowedProviderOptions: ['think'],
  },
  lmstudio: {
    inputPolicies: { image: 'supported', file: 'unverified' },
    allowedProviderOptions: [],
  },
}

describe('provider-contracts', () => {
  it('覆盖全部内置 provider ID，并为每个 provider 固定图片策略和允许注入项', () => {
    const providerIds = DEFAULT_PROVIDERS.map((provider) => provider.id)
    expect(Object.keys(EXPECTED_PROVIDER_MATRIX).sort()).toEqual(providerIds.sort())

    for (const provider of DEFAULT_PROVIDERS) {
      const contract = resolveProviderContract({
        providerId: provider.id,
        providerType: provider.type,
      })
      const expected = EXPECTED_PROVIDER_MATRIX[provider.id]
      expect(contract.providerId).toBe(provider.id)
      expect(contract.inputPolicies).toEqual(expected.inputPolicies)
      expect(contract.allowedProviderOptions).toEqual(expected.allowedProviderOptions)
    }
  })

  it('按动态 transport 分流 new-api / openai / xai 契约', () => {
    expect(
      resolveProviderContract({
        providerId: 'new-api',
        providerType: 'new-api',
        effectiveProviderType: 'openai-response',
        transportProtocol: 'openai-responses',
      }),
    ).toMatchObject({
      transportFamily: 'openai-responses',
      inputPolicies: { image: 'supported', file: 'unsupported' },
      allowedProviderOptions: ['systemMessageMode', 'modalities', 'serviceTier', 'store', 'textVerbosity', 'reasoning'],
      supportsResponses: true,
      supportsChatCompletions: false,
    })

    expect(
      resolveProviderContract({
        providerId: 'new-api',
        providerType: 'new-api',
        effectiveProviderType: 'anthropic',
        transportProtocol: 'anthropic-messages',
      }),
    ).toMatchObject({
      transportFamily: 'anthropic-messages',
      inputPolicies: { image: 'supported', file: 'unsupported' },
      allowedProviderOptions: ['thinking'],
    })

    expect(
      resolveProviderContract({
        providerId: 'new-api',
        providerType: 'new-api',
        effectiveProviderType: 'gemini',
        transportProtocol: 'gemini-generate-content',
      }),
    ).toMatchObject({
      transportFamily: 'gemini-generate-content',
      inputPolicies: { image: 'supported', file: 'unsupported' },
      allowedProviderOptions: ['responseModalities', 'thinkingConfig'],
    })

    expect(
      resolveProviderContract({
        providerId: 'new-api',
        providerType: 'new-api',
        transportProtocol: 'unknown',
      }),
    ).toMatchObject({
      transportFamily: 'proxy',
      inputPolicies: { image: 'unverified', file: 'unsupported' },
      allowedProviderOptions: [],
    })

    expect(
      resolveProviderContract({
        providerId: 'openai',
        providerType: 'openai',
        effectiveProviderType: 'openai',
        transportProtocol: 'openai-chat',
      }),
    ).toMatchObject({
      transportFamily: 'openai-chat',
      allowedProviderOptions: ['systemMessageMode', 'serviceTier', 'textVerbosity', 'reasoning_effort'],
      supportsResponses: false,
      supportsChatCompletions: true,
    })

    expect(
      resolveProviderContract({
        providerId: 'xai',
        providerType: 'xai',
        effectiveProviderType: 'xai',
        transportProtocol: 'openai-responses',
      }),
    ).toMatchObject({
      transportFamily: 'openai-responses',
      allowedProviderOptions: ['reasoning'],
      supportsResponses: true,
      supportsChatCompletions: false,
    })

    expect(
      resolveProviderContract({
        providerId: 'azure-openai',
        providerType: 'azure-openai',
        effectiveProviderType: 'azure-openai',
        transportProtocol: 'openai-responses',
      }),
    ).toMatchObject({
      transportFamily: 'azure-openai',
      allowedProviderOptions: ['modalities', 'service_tier', 'textVerbosity', 'reasoning_effort'],
      supportsResponses: false,
      supportsChatCompletions: true,
    })
  })
})
