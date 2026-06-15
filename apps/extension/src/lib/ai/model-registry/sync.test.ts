/**
 * 说明：`sync.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `sync.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ConnectorModelEntry,
  MetadataEvidence,
  ModelRegistryState,
} from './types'

const {
  loadProvidersViewMock,
  buildModelRegistryMock,
  rebuildModelRegistryFromCanonicalModelsMock,
  loadModelRegistryMock,
  saveModelRegistryMock,
  listCatalogMock,
  normalizeEntryMock,
} = vi.hoisted(() => ({
  loadProvidersViewMock: vi.fn(),
  buildModelRegistryMock: vi.fn(),
  rebuildModelRegistryFromCanonicalModelsMock: vi.fn(),
  loadModelRegistryMock: vi.fn(),
  saveModelRegistryMock: vi.fn(),
  listCatalogMock: vi.fn(),
  normalizeEntryMock: vi.fn(),
}))

/**
 * 测试辅助函数：`makeEmptyRegistry`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeEmptyRegistry(): ModelRegistryState {
  return {
    schema: 2,
    generatedAt: '2026-03-25T00:00:00.000Z',
    canonicalModels: {},
    aliasIndex: {},
    providerModelMap: {},
    providerScopedModels: {},
    syncMeta: {},
  }
}

/**
 * 测试辅助函数：`hasModelRegistryEntries`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function hasModelRegistryEntries(registry: ModelRegistryState): boolean {
  return (
    Object.keys(registry.canonicalModels).length > 0
    || Object.keys(registry.aliasIndex).length > 0
    || Object.keys(registry.providerModelMap).length > 0
    || Object.keys(registry.providerScopedModels).length > 0
  )
}

const seedEvidence: MetadataEvidence = {
  sourcePriority: 'seed',
  rawModelId: 'z-ai/glm-5',
  displayName: 'GLM-5',
  vendorHint: 'z-ai',
  modelHint: 'glm-5',
  kindHint: 'chat',
  inputModalities: ['text'],
  outputModalities: ['text'],
  featureHints: [],
  references: [
    { system: 'openrouter', refType: 'model-id', value: 'z-ai/glm-5' },
    { system: 'openrouter', refType: 'canonical', value: 'z-ai/glm-5' },
  ],
  scopeHint: 'public',
  confidence: 'high',
  fetchedAt: '2026-03-25T00:00:00.000Z',
}

vi.mock('../provider-storage', () => ({
  loadProvidersView: loadProvidersViewMock,
}))

vi.mock('./merge', () => ({
  buildModelRegistry: buildModelRegistryMock,
  rebuildModelRegistryFromCanonicalModels: rebuildModelRegistryFromCanonicalModelsMock,
}))

vi.mock('./state', () => ({
  createEmptyModelRegistry: makeEmptyRegistry,
  hasModelRegistryEntries,
}))

vi.mock('./storage-lite', () => ({
  loadModelRegistryFast: loadModelRegistryMock,
}))

vi.mock('./storage', () => ({
  loadModelRegistry: loadModelRegistryMock,
  saveModelRegistry: saveModelRegistryMock,
}))

vi.mock('./connectors', () => ({
  MODEL_REGISTRY_CONNECTORS: [{
    id: 'openrouter-seed',
    providerTypes: [],
    capabilities: {
      publicCatalog: true,
      providerCatalog: false,
      modelDetail: false,
      upstreamRefs: true,
      kindHints: true,
      featureHints: true,
    },
    listCatalog: listCatalogMock,
    normalizeEntry: normalizeEntryMock,
  }],
}))

import { ensureModelRegistryFresh } from './sync'

describe('model-registry/sync', () => {
  beforeEach(() => {
    loadProvidersViewMock.mockReset()
    buildModelRegistryMock.mockReset()
    rebuildModelRegistryFromCanonicalModelsMock.mockReset()
    loadModelRegistryMock.mockReset()
    saveModelRegistryMock.mockReset()
    listCatalogMock.mockReset()
    normalizeEntryMock.mockReset()

    loadProvidersViewMock.mockResolvedValue([])
    listCatalogMock.mockResolvedValue([{ raw: { id: 'z-ai/glm-5' }, rawModelId: 'z-ai/glm-5', displayName: 'GLM-5' } satisfies ConnectorModelEntry])
    normalizeEntryMock.mockReturnValue([seedEvidence])
    buildModelRegistryMock.mockImplementation((params: {
      readonly seedEvidences: ReadonlyArray<MetadataEvidence>
      readonly openrouterLastSyncAt?: string
      readonly openrouterLastSyncStatus?: 'success' | 'error'
      readonly openrouterLastError?: string
    }) => ({
      ...makeEmptyRegistry(),
      generatedAt: '2026-03-25T00:00:01.000Z',
      openrouterLastSyncAt: params.openrouterLastSyncAt,
      canonicalModels: params.seedEvidences.length > 0 ? {
        'public::zai::glm-5': {
          canonicalId: 'public::zai::glm-5',
          baseModelKey: 'glm-5',
          scope: 'public',
          vendorSlug: 'zai',
          modelSlug: 'glm-5',
          displayName: 'GLM-5',
          shortName: 'GLM-5',
          kind: 'chat',
          inputModalities: ['text'],
          outputModalities: ['text'],
          features: [],
          references: seedEvidence.references ?? [],
          sourcePriority: 'seed',
          confidence: 'high',
          updatedAt: '2026-03-25T00:00:01.000Z',
        },
      } : {},
      syncMeta: {
        openrouterLastSyncStatus: params.openrouterLastSyncStatus,
        openrouterLastError: params.openrouterLastError,
        seedEvidences: [...params.seedEvidences],
      },
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('本地只有 preview/backoff 但没有 seed 快照时，必须立即重新拉取 OpenRouter', async () => {
    loadModelRegistryMock.mockResolvedValue({
      ...makeEmptyRegistry(),
      providerModelMap: {
        'openai::runtime::chat-model': {
          providerType: 'openai',
          providerId: 'runtime',
          rawModelId: 'chat-model',
          canonicalId: 'provider::openai::runtime::chat-model',
          transportProtocol: 'openai-chat',
          resolvedBy: 'provider-map',
        },
      },
      syncMeta: {
        openrouterLastSyncStatus: 'error',
        openrouterBackoffUntil: '2099-01-01T00:00:00.000Z',
      },
    })

    const next = await ensureModelRegistryFresh()

    expect(listCatalogMock).toHaveBeenCalledTimes(1)
    expect(buildModelRegistryMock).toHaveBeenCalledTimes(1)
    expect(next.openrouterLastSyncAt).toBeTruthy()
    expect(next.syncMeta.seedEvidences).toHaveLength(1)
  })

  it('已有有效 seed 快照且仍在 TTL/backoff 内时，不应重复拉取 OpenRouter，但会用当前逻辑本地重建 preview', async () => {
    const current: ModelRegistryState = {
      ...makeEmptyRegistry(),
      generatedAt: '2026-03-25T00:00:02.000Z',
      openrouterLastSyncAt: '2099-01-01T00:00:00.000Z',
      canonicalModels: {
        'public::zai::glm-5': {
          canonicalId: 'public::zai::glm-5',
          baseModelKey: 'glm-5',
          scope: 'public',
          vendorSlug: 'zai',
          modelSlug: 'glm-5',
          displayName: 'GLM-5',
          shortName: 'GLM-5',
          kind: 'chat',
          inputModalities: ['text'],
          outputModalities: ['text'],
          features: [],
          references: seedEvidence.references ?? [],
          sourcePriority: 'seed',
          confidence: 'high',
          updatedAt: '2026-03-25T00:00:02.000Z',
        },
      },
      syncMeta: {
        openrouterLastSyncStatus: 'success',
        openrouterBackoffUntil: '2099-01-01T00:00:00.000Z',
        seedEvidences: [seedEvidence],
      },
    }
    loadModelRegistryMock.mockResolvedValue(current)

    const next = await ensureModelRegistryFresh()

    expect(listCatalogMock).not.toHaveBeenCalled()
    expect(buildModelRegistryMock).toHaveBeenCalledTimes(1)
    expect(next.openrouterLastSyncAt).toBe(current.openrouterLastSyncAt)
    expect(next.syncMeta.seedEvidences).toEqual([seedEvidence])
  })

  it('无 document 环境下也必须走本地 preview 重建，而不是触发页面侧动态导入链', async () => {
    const current: ModelRegistryState = {
      ...makeEmptyRegistry(),
      generatedAt: '2026-03-25T00:00:03.000Z',
      openrouterLastSyncAt: '2099-01-01T00:00:00.000Z',
      canonicalModels: {
        'public::zai::glm-5': {
          canonicalId: 'public::zai::glm-5',
          baseModelKey: 'glm-5',
          scope: 'public',
          vendorSlug: 'zai',
          modelSlug: 'glm-5',
          displayName: 'GLM-5',
          shortName: 'GLM-5',
          kind: 'chat',
          inputModalities: ['text'],
          outputModalities: ['text'],
          features: [],
          references: seedEvidence.references ?? [],
          sourcePriority: 'seed',
          confidence: 'high',
          updatedAt: '2026-03-25T00:00:03.000Z',
        },
      },
      syncMeta: {
        openrouterLastSyncStatus: 'success',
        seedEvidences: [seedEvidence],
      },
    }
    loadModelRegistryMock.mockResolvedValue(current)
    vi.stubGlobal('document', undefined)

    const next = await ensureModelRegistryFresh()

    expect(listCatalogMock).not.toHaveBeenCalled()
    expect(buildModelRegistryMock).toHaveBeenCalledTimes(1)
    expect(next.openrouterLastSyncAt).toBe(current.openrouterLastSyncAt)
    expect(next.syncMeta.seedEvidences).toEqual([seedEvidence])
  })
})
