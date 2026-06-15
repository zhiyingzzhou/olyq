/**
 * 说明：`embedding-executor.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `embedding-executor.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProviderConfig } from './types'
import type { ResolvedProviderRuntimeContext } from './provider-runtime'
import type { ResolvedModelMeta } from './model-registry'

const { embedManyMock, createEmbeddingModelMock } = vi.hoisted(() => ({
  embedManyMock: vi.fn(),
  createEmbeddingModelMock: vi.fn(),
}))

vi.mock('ai', () => ({
  embedMany: embedManyMock,
}))

vi.mock('./provider-factory', () => ({
  createEmbeddingModel: createEmbeddingModelMock,
}))

/**
 * 测试辅助函数：`createResolvedModelMeta`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createResolvedModelMeta(overrides: Partial<ResolvedModelMeta>): ResolvedModelMeta {
  return {
    canonicalId: 'provider::test::model',
    baseModelKey: 'test-model',
    scope: 'provider',
    kind: 'embedding',
    inputModalities: ['text'],
    outputModalities: ['embeddings'],
    features: [],
    transportProtocol: 'embedding-api',
    displayName: 'Test Model',
    confidence: 'high',
    ...overrides,
  }
}

/**
 * 测试辅助函数：`createProviderConfig`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createProviderConfig(type: ProviderConfig['type']): ProviderConfig {
  return {
    id: `${type}-provider`,
    name: `${type} Provider`,
    type,
    apiKey: 'test-key',
    apiHost: type === 'cohere' ? 'https://api.cohere.com/v2' : 'https://api.example.com/v1',
    enabled: true,
    models: [],
  }
}

/**
 * 测试辅助函数：`createRuntimeContext`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createRuntimeContext(
  type: ProviderConfig['type'],
  metaOverrides: Partial<ResolvedModelMeta>,
): ResolvedProviderRuntimeContext {
  const config = createProviderConfig(type)
  return {
    config,
    runtimeConfig: config,
    modelId: metaOverrides.displayName ?? 'test-model',
    apiKey: config.apiKey,
    apiHost: config.apiHost,
    resolvedModelMeta: createResolvedModelMeta(metaOverrides),
  }
}

describe('embedding-executor', () => {
  beforeEach(() => {
    embedManyMock.mockReset()
    createEmbeddingModelMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('非 Cohere 文本 embedding 会走 AI SDK，并把多段文本折叠成单条 logical input', async () => {
    const model = { provider: 'mock-embedding-model' }
    createEmbeddingModelMock.mockResolvedValue(model)
    embedManyMock.mockResolvedValue({ embeddings: [[0.1, 0.2, 0.3]] })

    const { createEmbeddingExecutor } = await import('./embedding-executor')
    const executor = createEmbeddingExecutor(createRuntimeContext('openai', {
      inputModalities: ['text'],
      outputModalities: ['embeddings'],
    }))

    const vector = await executor.execute([
      { type: 'text', text: 'hello' },
      { type: 'text', text: 'world' },
    ])

    expect(createEmbeddingModelMock).toHaveBeenCalledTimes(1)
    expect(embedManyMock).toHaveBeenCalledWith({
      model,
      values: ['hello\n\nworld'],
      abortSignal: undefined,
    })
    expect(vector).toEqual([0.1, 0.2, 0.3])
  })

  it('Cohere 图片 embedding 会直连 provider-native /embed，而不会回落到 AI SDK 文本路径', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST')
      expect(String(init?.body || '')).toContain('"images":["data:image/png;base64,AAA="]')
      expect(String(init?.body || '')).toContain('"input_type":"image"')
      expect(String(init?.body || '')).toContain('"embedding_types":["float"]')
      return new Response(JSON.stringify({
        embeddings: { float: [[0.9, 0.8]] },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { createEmbeddingExecutor } = await import('./embedding-executor')
    const executor = createEmbeddingExecutor(createRuntimeContext('cohere', {
      inputModalities: ['image'],
      outputModalities: ['embeddings'],
    }))

    const vector = await executor.execute([
      { type: 'image', dataUrl: 'data:image/png;base64,AAA=' },
    ])

    expect(embedManyMock).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(vector).toEqual([0.9, 0.8])
  })

  it('会拒绝混合 text/image 的单条 embedding 输入', async () => {
    const { createEmbeddingExecutor } = await import('./embedding-executor')
    const executor = createEmbeddingExecutor(createRuntimeContext('cohere', {
      inputModalities: ['text', 'image'],
      outputModalities: ['embeddings'],
    }))

    await expect(executor.execute([
      { type: 'text', text: 'hello' },
      { type: 'image', dataUrl: 'data:image/png;base64,AAA=' },
    ])).rejects.toMatchObject({
      name: 'I18nError',
      message: 'errors.embeddingMixedItemsNotSupported',
    })
  })
})
