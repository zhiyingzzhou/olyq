/**
 * 说明：`merge.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `merge.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest'

import type { ProviderConfig } from '../types'
import { buildModelRegistry, rebuildModelRegistryFromCanonicalModels } from './merge'
import { resolveModelMetaFromRegistry } from './resolver'
import { validateRegistryState } from './validation'
import type { CanonicalModelRecord, MetadataEvidence } from './types'

/**
 * 测试辅助函数：`makeSeedEvidence`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeSeedEvidence(params: {
  rawModelId: string
  modelHint: string
  references?: MetadataEvidence['references']
}): MetadataEvidence {
  return {
    sourcePriority: 'seed',
    rawModelId: params.rawModelId,
    displayName: params.modelHint,
    vendorHint: 'qwen',
    modelHint: params.modelHint,
    kindHint: 'chat',
    inputModalities: ['text'],
    outputModalities: ['text'],
    featureHints: [],
    references: params.references,
    scopeHint: 'public',
    confidence: 'high',
    fetchedAt: '2026-03-24T00:00:00.000Z',
  }
}

describe('buildModelRegistry', () => {
  it('有 hugging_face_id 时应优先以 HF 模型标识生成 canonical，并保留 OpenRouter 私有 id exact alias', () => {
    const registry = buildModelRegistry({
      providers: [],
      openrouterLastSyncAt: '2026-03-24T00:00:00.000Z',
      openrouterLastSyncStatus: 'success',
      seedEvidences: [
        {
          ...makeSeedEvidence({
            rawModelId: 'deepseek/deepseek-chat-v3.1',
            modelHint: 'deepseek-chat-v3.1',
            references: [
              { system: 'openrouter', refType: 'model-id', value: 'deepseek/deepseek-chat-v3.1' },
              { system: 'openrouter', refType: 'canonical', value: 'deepseek/deepseek-chat-v3.1' },
              { system: 'public-official', refType: 'upstream', value: 'deepseek-ai/DeepSeek-V3.1' },
            ],
          }),
          displayName: 'DeepSeek V3.1',
          vendorHint: 'deepseek',
        },
      ],
    })

    expect(registry.canonicalModels['public::deepseekai::deepseek-v3.1']).toBeDefined()
    expect(registry.canonicalModels['public::deepseek::deepseek-chat-v3.1']).toBeUndefined()
    expect(registry.canonicalModels['public::deepseekai::deepseek-v3.1']?.baseModelKey).toBe('deepseek-v3.1')
    expect(registry.aliasIndex['*::*::deepseek-ai/deepseek-v3.1']?.canonicalId).toBe('public::deepseekai::deepseek-v3.1')
    expect(registry.aliasIndex['*::*::deepseek/deepseek-chat-v3.1']?.canonicalId).toBe('public::deepseekai::deepseek-v3.1')
    expect(registry.aliasIndex['*::*::deepseek-v3.1']?.canonicalId).toBe('public::deepseekai::deepseek-v3.1')
  })

  it('无 hugging_face_id 时应回退 canonical_slug，而不是继续使用 OpenRouter 私有 id', () => {
    const registry = buildModelRegistry({
      providers: [],
      openrouterLastSyncAt: '2026-03-24T00:00:00.000Z',
      openrouterLastSyncStatus: 'success',
      seedEvidences: [
        {
          ...makeSeedEvidence({
            rawModelId: 'qwen/qwen3.5-plus-02-15',
            modelHint: 'qwen3.5-plus-02-15',
            references: [
              { system: 'openrouter', refType: 'model-id', value: 'qwen/qwen3.5-plus-02-15' },
              { system: 'openrouter', refType: 'canonical', value: 'qwen/qwen3.5-plus-20260216' },
            ],
          }),
        },
      ],
    })

    expect(registry.canonicalModels['public::qwen::qwen3.5-plus-20260216']).toBeDefined()
    expect(registry.canonicalModels['public::qwen::qwen3.5-plus-02-15']).toBeUndefined()
    expect(registry.aliasIndex['*::*::qwen/qwen3.5-plus-02-15']?.canonicalId).toBe('public::qwen::qwen3.5-plus-20260216')
    expect(registry.aliasIndex['*::*::qwen3.5-plus-20260216']?.canonicalId).toBe('public::qwen::qwen3.5-plus-20260216')
  })

  it('无 hugging_face_id 与 canonical_slug 时应回退 OpenRouter id', () => {
    const registry = buildModelRegistry({
      providers: [],
      openrouterLastSyncAt: '2026-03-24T00:00:00.000Z',
      openrouterLastSyncStatus: 'success',
      seedEvidences: [
        {
          ...makeSeedEvidence({
            rawModelId: 'google/veo-3.1',
            modelHint: 'veo-3.1',
            references: [{ system: 'openrouter', refType: 'model-id', value: 'google/veo-3.1' }],
          }),
          vendorHint: 'google',
          kindHint: 'video-generation',
          inputModalities: ['text', 'image'],
          outputModalities: ['video'],
        },
      ],
    })

    expect(registry.canonicalModels['public::google::veo-3.1']).toBeDefined()
    expect(registry.aliasIndex['*::*::google/veo-3.1']?.canonicalId).toBe('public::google::veo-3.1')
    expect(registry.aliasIndex['*::*::veo-3.1']?.canonicalId).toBe('public::google::veo-3.1')
  })

  it('公共模型叶子别名只允许唯一值生成，冲突时不得误归并', () => {
    const registry = buildModelRegistry({
      providers: [],
      seedEvidences: [
        {
          ...makeSeedEvidence({
            rawModelId: 'vendor-a/shared-model-a',
            modelHint: 'shared-model-a',
            references: [
              { system: 'openrouter', refType: 'model-id', value: 'vendor-a/shared-model-a' },
              { system: 'public-official', refType: 'upstream', value: 'vendor-a/Shared-Model' },
            ],
          }),
          displayName: 'Vendor A Shared Model',
          vendorHint: 'vendor-a',
        },
        {
          ...makeSeedEvidence({
            rawModelId: 'vendor-b/shared-model-b',
            modelHint: 'shared-model-b',
            references: [
              { system: 'openrouter', refType: 'model-id', value: 'vendor-b/shared-model-b' },
              { system: 'public-official', refType: 'upstream', value: 'vendor-b/Shared-Model' },
            ],
          }),
          displayName: 'Vendor B Shared Model',
          vendorHint: 'vendor-b',
        },
      ],
    })

    expect(registry.aliasIndex['*::*::shared-model']).toBeUndefined()
  })

  it('provider 包装前缀模型会通过 baseModelKey 归并到同一公共 canonical，而不是掉回 scoped fallback', () => {
    const registry = buildModelRegistry({
      providers: [
        {
          id: 'siliconflow',
          name: 'SiliconFlow',
          type: 'siliconflow',
          apiKey: 'test',
          apiHost: 'https://api.siliconflow.cn/v1',
          enabled: true,
          models: [{ id: 'siliconflow/deepseek-v3.2', name: 'DeepSeek V3.2' }],
        },
      ],
      seedEvidences: [
        {
          ...makeSeedEvidence({
            rawModelId: 'deepseek/deepseek-chat-v3.2',
            modelHint: 'deepseek-chat-v3.2',
            references: [
              { system: 'openrouter', refType: 'model-id', value: 'deepseek/deepseek-chat-v3.2' },
              { system: 'openrouter', refType: 'canonical', value: 'deepseek/deepseek-chat-v3.2' },
              { system: 'public-official', refType: 'upstream', value: 'deepseek-ai/DeepSeek-V3.2' },
            ],
          }),
          displayName: 'DeepSeek V3.2',
          vendorHint: 'deepseek',
        },
      ],
    })

    expect(registry.aliasIndex['*::*::deepseek-v3.2']?.canonicalId).toBe('public::deepseekai::deepseek-v3.2')
    expect(registry.providerModelMap['siliconflow::siliconflow::siliconflow/deepseek-v3.2']).toMatchObject({
      canonicalId: 'public::deepseekai::deepseek-v3.2',
      resolvedBy: 'base-model-alias',
    })
    expect(registry.providerScopedModels['provider::siliconflow::siliconflow::siliconflow/deepseek-v3.2']).toBeUndefined()
  })

  it('new-api 会优先按稳定模型族自动映射协议；无法判断时才返回 unknown', () => {
    const providers: ProviderConfig[] = [
      {
        id: 'new-api',
        name: 'New API',
        type: 'new-api',
        apiKey: '',
        apiHost: 'https://example.com/v1',
        enabled: true,
        models: [
          { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
          { id: 'totally-custom-model', name: 'Totally Custom Model' },
        ],
      },
    ]

    const registry = buildModelRegistry({
      providers,
      openrouterLastSyncAt: '2026-03-24T00:00:00.000Z',
      openrouterLastSyncStatus: 'success',
      seedEvidences: [],
    })

    expect(registry.providerModelMap['new-api::new-api::claude-sonnet-4-5']?.transportProtocol).toBe('anthropic-messages')
    expect(registry.providerModelMap['new-api::new-api::totally-custom-model']?.transportProtocol).toBe('unknown')
  })

  it('cohere 与 bedrock 的聊天模型应生成 provider-native transportProtocol', () => {
    const registry = buildModelRegistry({
      providers: [
        {
          id: 'cohere',
          name: 'Cohere',
          type: 'cohere',
          apiKey: 'test',
          apiHost: 'https://api.cohere.com/v2',
          enabled: true,
          models: [{ id: 'command-r', name: 'Command R' }],
        },
        {
          id: 'aws-bedrock',
          name: 'AWS Bedrock',
          type: 'aws-bedrock',
          apiKey: '',
          apiHost: 'https://bedrock-runtime.{region}.amazonaws.com',
          enabled: true,
          bedrock: { authType: 'iam', region: 'us-east-1', accessKeyId: 'ak', secretAccessKey: 'sk' },
          models: [{ id: 'amazon.nova-pro-v1:0', name: 'Nova Pro' }],
        },
      ],
      openrouterLastSyncAt: '2026-03-24T00:00:00.000Z',
      openrouterLastSyncStatus: 'success',
      seedEvidences: [],
    })

    expect(registry.providerModelMap['cohere::cohere::command-r']?.transportProtocol).toBe('cohere-chat')
    expect(registry.providerModelMap['aws-bedrock::aws-bedrock::amazon.nova-pro-v1:0']?.transportProtocol).toBe('bedrock-converse')
  })

  it('gateway 显式给出的协议应保留，不再被强行收敛回 openai-chat', () => {
    const registry = buildModelRegistry({
      providers: [
        {
          id: 'gateway',
          name: 'Gateway',
          type: 'gateway',
          apiKey: 'test',
          apiHost: 'https://gateway.example/v1',
          enabled: true,
          models: [{ id: 'claude-via-gateway', name: 'Claude via Gateway', transportProtocol: 'anthropic-messages' }],
        },
      ],
      openrouterLastSyncAt: '2026-03-24T00:00:00.000Z',
      openrouterLastSyncStatus: 'success',
      seedEvidences: [],
    })

    expect(registry.providerModelMap['gateway::gateway::claude-via-gateway']?.transportProtocol).toBe('anthropic-messages')
  })

  it('本地 openai-compatible provider 的 scoped 记录应标记为 local，并使用单协议 provider 的基础路由', () => {
    const registry = buildModelRegistry({
      providers: [
        {
          id: 'lmstudio',
          name: 'LM Studio',
          type: 'openai',
          apiKey: '',
          apiHost: 'http://localhost:1234/v1',
          enabled: true,
          models: [{ id: 'qwen2.5-coder', name: 'Qwen2.5 Coder' }],
        },
      ],
      openrouterLastSyncAt: '2026-03-24T00:00:00.000Z',
      openrouterLastSyncStatus: 'success',
      seedEvidences: [],
    })

    expect(registry.providerScopedModels['local::openai::lmstudio::qwen2.5-coder']?.scope).toBe('local')
    expect(registry.providerModelMap['openai::lmstudio::qwen2.5-coder']?.transportProtocol).toBe('openai-chat')
  })

  it('会在合并阶段丢弃非法 contextLength，避免上游 0 值把 registry 校验炸掉', () => {
    const registry = buildModelRegistry({
      providers: [],
      openrouterLastSyncAt: '2026-03-24T00:00:00.000Z',
      openrouterLastSyncStatus: 'success',
      seedEvidences: [{
        ...makeSeedEvidence({
          rawModelId: 'google/veo-3.1',
          modelHint: 'veo-3.1',
          references: [
            { system: 'openrouter', refType: 'model-id', value: 'google/veo-3.1' },
            { system: 'openrouter', refType: 'canonical', value: 'google/veo-3.1' },
          ],
        }),
        vendorHint: 'google',
        kindHint: 'video-generation',
        inputModalities: ['text', 'image'],
        outputModalities: ['video'],
        contextLength: 0,
      }],
    })

    expect(registry.canonicalModels['public::google::veo-3.1']?.contextLength).toBeUndefined()
    expect(validateRegistryState(registry)).toEqual([])
  })

  it('基于旧 canonical 快速重建时，仍会重新生成 alias/provider map，确保本地 preview 立即体现新规则', () => {
    const canonicalModels: Record<string, CanonicalModelRecord> = {
      'public::cohere::rerank-v3.5': {
        canonicalId: 'public::cohere::rerank-v3.5',
        baseModelKey: 'rerank-v3.5',
        scope: 'public',
        vendorSlug: 'cohere',
        modelSlug: 'rerank-v3.5',
        displayName: 'Rerank v3.5',
        shortName: 'Rerank v3.5',
        kind: 'rerank',
        inputModalities: ['text'],
        outputModalities: ['text'],
        features: [],
        references: [{ system: 'provider-official', providerType: 'cohere', providerId: 'cohere', refType: 'model-id', value: 'rerank-v3.5' }],
        sourcePriority: 'provider-official',
        confidence: 'high',
        updatedAt: '2026-03-24T00:00:00.000Z',
      },
    }

    const registry = rebuildModelRegistryFromCanonicalModels({
      canonicalModels,
      providers: [
        {
          id: 'cohere',
          name: 'Cohere',
          type: 'cohere',
          apiKey: 'test',
          apiHost: 'https://api.cohere.com/v2',
          enabled: true,
          models: [{ id: 'rerank-v3.5', name: 'Rerank v3.5' }],
        },
      ],
      openrouterLastSyncAt: '2026-03-24T00:00:00.000Z',
    })

    expect(registry.aliasIndex['cohere::cohere::rerank-v3.5']?.canonicalId).toBe('public::cohere::rerank-v3.5')
    expect(registry.providerModelMap['cohere::cohere::rerank-v3.5']?.canonicalId).toBe('public::cohere::rerank-v3.5')
    expect(validateRegistryState(registry)).toEqual([])
  })

  it('Cohere 手动录入模型在缺少官方目录 hints 时，仍会按 provider rule 兜底出稳定语义', () => {
    const registry = buildModelRegistry({
      providers: [
        {
          id: 'cohere',
          name: 'Cohere',
          type: 'cohere',
          apiKey: 'test',
          apiHost: 'https://api.cohere.com/v2',
          enabled: true,
          models: [
            { id: 'embed-english-v3.0-image', name: 'Embed English Image' },
            { id: 'rerank-v4.0-fast', name: 'Rerank Fast' },
            { id: 'command-a-vision-07-2025', name: 'Command A Vision' },
            { id: 'command-a-reasoning-08-2025', name: 'Command A Reasoning' },
          ],
        },
      ],
      openrouterLastSyncAt: '2026-03-24T00:00:00.000Z',
      openrouterLastSyncStatus: 'success',
      seedEvidences: [],
    })

    const embedResolved = resolveModelMetaFromRegistry(registry, {
      providerType: 'cohere',
      providerId: 'cohere',
      apiHost: 'https://api.cohere.com/v2',
      rawModelId: 'embed-english-v3.0-image',
      rawModelName: 'Embed English Image',
    })
    const rerankResolved = resolveModelMetaFromRegistry(registry, {
      providerType: 'cohere',
      providerId: 'cohere',
      apiHost: 'https://api.cohere.com/v2',
      rawModelId: 'rerank-v4.0-fast',
      rawModelName: 'Rerank Fast',
    })
    const visionResolved = resolveModelMetaFromRegistry(registry, {
      providerType: 'cohere',
      providerId: 'cohere',
      apiHost: 'https://api.cohere.com/v2',
      rawModelId: 'command-a-vision-07-2025',
      rawModelName: 'Command A Vision',
    })
    const reasoningResolved = resolveModelMetaFromRegistry(registry, {
      providerType: 'cohere',
      providerId: 'cohere',
      apiHost: 'https://api.cohere.com/v2',
      rawModelId: 'command-a-reasoning-08-2025',
      rawModelName: 'Command A Reasoning',
    })

    expect(registry.providerModelMap['cohere::cohere::embed-english-v3.0-image']).toMatchObject({
      transportProtocol: 'embedding-api',
    })
    expect(embedResolved).toMatchObject({
      kind: 'embedding',
      inputModalities: ['image'],
      outputModalities: ['embeddings'],
      transportProtocol: 'embedding-api',
    })
    expect(rerankResolved).toMatchObject({
      kind: 'rerank',
      inputModalities: ['text'],
      outputModalities: ['text'],
      transportProtocol: 'rerank-api',
    })
    expect(visionResolved).toMatchObject({
      kind: 'multimodal-chat',
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      transportProtocol: 'cohere-chat',
    })
    expect(reasoningResolved).toMatchObject({
      kind: 'chat',
      inputModalities: ['text'],
      outputModalities: ['text'],
      transportProtocol: 'cohere-chat',
      features: expect.arrayContaining(['reasoning', 'tool-call', 'structured-output']),
    })
  })
})
