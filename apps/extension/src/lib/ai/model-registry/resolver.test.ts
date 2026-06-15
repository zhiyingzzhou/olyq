/**
 * 说明：`resolver.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `resolver.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest'

import type { ProviderConfig } from '../types'
import { buildModelRegistry } from './merge'
import { resolveModelMetaFromRegistry } from './resolver'
import { createEmptyModelRegistry } from './state'
import type { MetadataEvidence } from './types'

describe('model-registry resolver', () => {
  it('空注册表下的 ollama fallback 会保持 local scope，并使用单协议 provider 的基础路由', () => {
    const resolved = resolveModelMetaFromRegistry(createEmptyModelRegistry(), {
      providerType: 'ollama',
      providerId: 'default',
      rawModelId: 'qwen3:latest',
      rawModelName: 'Qwen3 Latest',
    })

    expect(resolved.scope).toBe('local')
    expect(resolved.kind).toBe('chat')
    expect(resolved.transportProtocol).toBe('openai-chat')
  })

  it('命中 providerModelMap 时会返回统一 canonical 语义', () => {
    const providers: ProviderConfig[] = [
      {
        id: 'siliconflow',
        name: 'SiliconFlow',
        type: 'siliconflow',
        apiKey: '',
        apiHost: 'https://api.siliconflow.cn/v1',
        enabled: true,
        models: [{ id: 'GLM-5', name: 'GLM-5' }],
      },
    ]

    const seedEvidences: MetadataEvidence[] = [
      {
        sourcePriority: 'seed',
        providerType: 'openrouter',
        providerId: 'openrouter',
        rawModelId: 'z-ai/glm-5',
        displayName: 'GLM-5',
        vendorHint: 'z-ai',
        modelHint: 'glm-5',
        inputModalities: ['text'],
        outputModalities: ['text'],
        references: [
          { system: 'openrouter', refType: 'model-id', value: 'z-ai/glm-5' },
          { system: 'openrouter', refType: 'canonical', value: 'z-ai/glm-5' },
        ],
        confidence: 'high',
        fetchedAt: '2026-03-24T00:00:00.000Z',
      },
    ]

    const registry = buildModelRegistry({
      providers,
      seedEvidences,
      openrouterLastSyncAt: '2026-03-24T00:00:00.000Z',
      openrouterLastSyncStatus: 'success',
    })

    const resolved = resolveModelMetaFromRegistry(registry, {
      providerType: 'siliconflow',
      providerId: 'siliconflow',
      rawModelId: 'GLM-5',
      rawModelName: 'GLM-5',
    })

    expect(resolved.canonicalId).toBe('public::zai::glm-5')
    expect(resolved.kind).toBe('chat')
    expect(resolved.scope).toBe('public')
  })

  it('provider/model scoped supportedParameters 会通过 providerModelMap 回填到解析结果', () => {
    const providers: ProviderConfig[] = [
      {
        id: 'openrouter',
        name: 'OpenRouter',
        type: 'openai',
        apiKey: '',
        apiHost: 'https://openrouter.ai/api/v1',
        enabled: true,
        models: [{
          id: 'openai/gpt-5.4',
          name: 'GPT-5.4',
          supportedParameters: ['max_tokens', 'seed', 'tools', 'tool_choice'],
        }],
      },
    ]

    const registry = buildModelRegistry({
      providers,
      seedEvidences: [
        {
          sourcePriority: 'seed',
          rawModelId: 'openai/gpt-5.4',
          displayName: 'OpenAI: GPT-5.4',
          vendorHint: 'openai',
          modelHint: 'gpt-5.4',
          kindHint: 'chat',
          inputModalities: ['text'],
          outputModalities: ['text'],
          references: [{ system: 'openrouter', refType: 'model-id', value: 'openai/gpt-5.4' }],
          confidence: 'high',
          fetchedAt: '2026-05-09T00:00:00.000Z',
        },
      ],
      openrouterLastSyncAt: '2026-05-09T00:00:00.000Z',
      openrouterLastSyncStatus: 'success',
    })

    const resolved = resolveModelMetaFromRegistry(registry, {
      providerType: 'openai',
      providerId: 'openrouter',
      rawModelId: 'openai/gpt-5.4',
      rawModelName: 'GPT-5.4',
    })

    expect(resolved.supportedParameters).toEqual(['max_tokens', 'seed', 'tools', 'tool_choice'])
  })

  it('OpenRouter seed 只会按 openrouter + rawModelId 精确回填 supportedParameters', () => {
    const registry = buildModelRegistry({
      providers: [],
      seedEvidences: [
        {
          sourcePriority: 'seed',
          rawModelId: 'openai/gpt-5.4',
          displayName: 'OpenAI: GPT-5.4',
          vendorHint: 'openai',
          modelHint: 'gpt-5.4',
          kindHint: 'chat',
          inputModalities: ['text'],
          outputModalities: ['text'],
          references: [{ system: 'openrouter', refType: 'model-id', value: 'openai/gpt-5.4' }],
          supportedParameters: ['max_tokens', 'seed'],
          confidence: 'high',
          fetchedAt: '2026-05-09T00:00:00.000Z',
        },
      ],
      openrouterLastSyncAt: '2026-05-09T00:00:00.000Z',
      openrouterLastSyncStatus: 'success',
    })

    expect(resolveModelMetaFromRegistry(registry, {
      providerType: 'openai',
      providerId: 'openrouter',
      rawModelId: 'openai/gpt-5.4',
      rawModelName: 'GPT-5.4',
    }).supportedParameters).toEqual(['max_tokens', 'seed'])

    expect(resolveModelMetaFromRegistry(registry, {
      providerType: 'openai',
      providerId: 'custom-openai',
      rawModelId: 'openai/gpt-5.4',
      rawModelName: 'GPT-5.4',
    }).supportedParameters).toBeUndefined()
  })

  it('公共模型叶子名唯一时，catalog 里的 leaf-only rawModelId 也能命中 aliasIndex', () => {
    const registry = buildModelRegistry({
      providers: [],
      seedEvidences: [
        {
          sourcePriority: 'seed',
          providerType: 'openrouter',
          providerId: 'openrouter',
          rawModelId: 'deepseek/deepseek-r1',
          displayName: 'DeepSeek R1',
          vendorHint: 'deepseek',
          modelHint: 'deepseek-r1',
          kindHint: 'chat',
          inputModalities: ['text'],
          outputModalities: ['text'],
          confidence: 'high',
          fetchedAt: '2026-03-24T00:00:00.000Z',
        },
      ],
      openrouterLastSyncAt: '2026-03-24T00:00:00.000Z',
      openrouterLastSyncStatus: 'success',
    })

    const resolved = resolveModelMetaFromRegistry(registry, {
      providerType: 'dashscope',
      providerId: 'qwen',
      rawModelId: 'deepseek-r1',
      rawModelName: 'DeepSeek R1',
    })

    expect(resolved.canonicalId).toBe('public::deepseek::deepseek-r1')
    expect(resolved.kind).toBe('chat')
    expect(resolved.transportProtocol).toBe('openai-chat')
  })

  it('会优先通过 HF leaf alias 命中公共模型，而不是被 OpenRouter 私有包装 id 带偏', () => {
    const registry = buildModelRegistry({
      providers: [],
      seedEvidences: [
        {
          sourcePriority: 'seed',
          providerType: 'openrouter',
          providerId: 'openrouter',
          rawModelId: 'deepseek/deepseek-chat-v3.1',
          displayName: 'DeepSeek V3.1',
          vendorHint: 'deepseek',
          modelHint: 'deepseek-chat-v3.1',
          kindHint: 'chat',
          inputModalities: ['text'],
          outputModalities: ['text'],
          references: [
            { system: 'openrouter', refType: 'model-id', value: 'deepseek/deepseek-chat-v3.1' },
            { system: 'openrouter', refType: 'canonical', value: 'deepseek/deepseek-chat-v3.1' },
            { system: 'public-official', refType: 'upstream', value: 'deepseek-ai/DeepSeek-V3.1' },
          ],
          confidence: 'high',
          fetchedAt: '2026-03-24T00:00:00.000Z',
        },
      ],
      openrouterLastSyncAt: '2026-03-24T00:00:00.000Z',
      openrouterLastSyncStatus: 'success',
    })

    const resolved = resolveModelMetaFromRegistry(registry, {
      providerType: 'dashscope',
      providerId: 'qwen',
      rawModelId: 'deepseek-v3.1',
      rawModelName: 'DeepSeek V3.1',
    })

    expect(resolved.canonicalId).toBe('public::deepseekai::deepseek-v3.1')
    expect(resolved.kind).toBe('chat')
    expect(resolved.transportProtocol).toBe('openai-chat')
  })

  it('provider 包装前缀模型会通过 baseModelKey 命中公共模型，并在 trace 中标明 base-model-alias-hit', () => {
    const registry = buildModelRegistry({
      providers: [],
      seedEvidences: [
        {
          sourcePriority: 'seed',
          providerType: 'openrouter',
          providerId: 'openrouter',
          rawModelId: 'deepseek/deepseek-chat-v3.2',
          displayName: 'DeepSeek V3.2',
          vendorHint: 'deepseek',
          modelHint: 'deepseek-chat-v3.2',
          kindHint: 'chat',
          inputModalities: ['text'],
          outputModalities: ['text'],
          references: [
            { system: 'openrouter', refType: 'model-id', value: 'deepseek/deepseek-chat-v3.2' },
            { system: 'openrouter', refType: 'canonical', value: 'deepseek/deepseek-chat-v3.2' },
            { system: 'public-official', refType: 'upstream', value: 'deepseek-ai/DeepSeek-V3.2' },
          ],
          confidence: 'high',
          fetchedAt: '2026-03-24T00:00:00.000Z',
        },
      ],
      openrouterLastSyncAt: '2026-03-24T00:00:00.000Z',
      openrouterLastSyncStatus: 'success',
    })

    const resolved = resolveModelMetaFromRegistry(registry, {
      providerType: 'siliconflow',
      providerId: 'siliconflow',
      rawModelId: 'siliconflow/deepseek-v3.2',
      rawModelName: 'DeepSeek V3.2',
    }, { withTrace: true })

    expect(resolved.canonicalId).toBe('public::deepseekai::deepseek-v3.2')
    expect(resolved.baseModelKey).toBe('deepseek-v3.2')
    expect(resolved.trace?.steps.some((step) => step.type === 'base-model-alias-hit')).toBe(true)
  })

  it('OpenRouter 私有 raw id 仍保留 exact alias 命中能力', () => {
    const registry = buildModelRegistry({
      providers: [],
      seedEvidences: [
        {
          sourcePriority: 'seed',
          providerType: 'openrouter',
          providerId: 'openrouter',
          rawModelId: 'deepseek/deepseek-chat-v3.1',
          displayName: 'DeepSeek V3.1',
          vendorHint: 'deepseek',
          modelHint: 'deepseek-chat-v3.1',
          kindHint: 'chat',
          inputModalities: ['text'],
          outputModalities: ['text'],
          references: [
            { system: 'openrouter', refType: 'model-id', value: 'deepseek/deepseek-chat-v3.1' },
            { system: 'openrouter', refType: 'canonical', value: 'deepseek/deepseek-chat-v3.1' },
            { system: 'public-official', refType: 'upstream', value: 'deepseek-ai/DeepSeek-V3.1' },
          ],
          confidence: 'high',
          fetchedAt: '2026-03-24T00:00:00.000Z',
        },
      ],
      openrouterLastSyncAt: '2026-03-24T00:00:00.000Z',
      openrouterLastSyncStatus: 'success',
    })

    const resolved = resolveModelMetaFromRegistry(registry, {
      providerType: 'openrouter',
      providerId: 'openrouter',
      rawModelId: 'deepseek/deepseek-chat-v3.1',
      rawModelName: 'DeepSeek V3.1',
    })

    expect(resolved.canonicalId).toBe('public::deepseekai::deepseek-v3.1')
    expect(resolved.kind).toBe('chat')
  })

  it('new-api 会优先按稳定模型族自动映射协议', () => {
    const resolved = resolveModelMetaFromRegistry(createEmptyModelRegistry(), {
      providerType: 'new-api',
      providerId: 'new-api',
      rawModelId: 'claude-sonnet-4-5',
      rawModelName: 'Claude Sonnet 4.5',
    })

    expect(resolved.kind).toBe('multimodal-chat')
    expect(resolved.inputModalities).toEqual(['text', 'image'])
    expect(resolved.features).toContain('vision-input')
    expect(resolved.transportProtocol).toBe('anthropic-messages')
    expect(resolved.scope).toBe('provider')
  })

  it('new-api 在完全无法判断模型族时才保持 unknown', () => {
    const resolved = resolveModelMetaFromRegistry(createEmptyModelRegistry(), {
      providerType: 'new-api',
      providerId: 'new-api',
      rawModelId: 'totally-custom-model',
      rawModelName: 'Totally Custom Model',
    })

    expect(resolved.kind).toBe('unknown')
    expect(resolved.transportProtocol).toBe('unknown')
    expect(resolved.scope).toBe('provider')
  })

  it('本地 openai-compatible provider 会被解析为 local scope，并采用 openai-chat 基础协议', () => {
    const resolved = resolveModelMetaFromRegistry(createEmptyModelRegistry(), {
      providerType: 'openai',
      providerId: 'lmstudio',
      apiHost: 'http://localhost:1234/v1',
      rawModelId: 'qwen2.5-coder',
      rawModelName: 'Qwen2.5 Coder',
    })

    expect(resolved.scope).toBe('local')
    expect(resolved.kind).toBe('chat')
    expect(resolved.transportProtocol).toBe('openai-chat')
  })

  it.each([
    {
      name: 'audio 官方 hint 会压住共享名称 fallback',
      rawModelId: 'cartesia/sonic-2',
      rawModelName: 'Sonic 2',
      providerCatalogTypeHint: 'audio' as const,
      expectedFeature: 'audio-model',
    },
    {
      name: 'transcribe 官方 hint 会压住共享名称 fallback',
      rawModelId: 'deepgram/flux-general-en',
      rawModelName: 'Flux General EN',
      providerCatalogTypeHint: 'transcribe' as const,
      expectedFeature: 'transcription',
    },
    {
      name: 'moderation 官方 hint 会压住共享名称 fallback',
      rawModelId: 'meta-llama/Llama-Guard-4-12B',
      rawModelName: 'Llama Guard 4 12B',
      providerCatalogTypeHint: 'moderation' as const,
      expectedFeature: 'moderation',
    },
  ])('$name', ({ rawModelId, rawModelName, providerCatalogTypeHint, expectedFeature }) => {
    const resolved = resolveModelMetaFromRegistry(createEmptyModelRegistry(), {
      providerType: 'openai',
      providerId: 'together',
      rawModelId,
      rawModelName,
      providerCatalogTypeHint,
    })

    expect(resolved.kind).toBe('unknown')
    expect(resolved.transportProtocol).toBe('unknown')
    expect(resolved.features).toContain(expectedFeature)
  })
})
