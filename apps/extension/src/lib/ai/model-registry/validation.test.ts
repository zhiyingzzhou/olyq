/**
 * 说明：`validation.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `validation.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest'

import { createEmptyModelRegistry } from './state'
import { validateRegistryState } from './validation'
import type { ModelRegistryState } from './types'

describe('model-registry validation', () => {
  it('应识别公共模型归一主键冲突', () => {
    const registry: ModelRegistryState = {
      ...createEmptyModelRegistry(),
      generatedAt: '2026-03-24T00:00:00.000Z',
      canonicalModels: {
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
          references: [],
          sourcePriority: 'seed',
          confidence: 'high',
          updatedAt: '2026-03-24T00:00:00.000Z',
        },
        'public::cohere::rerank-v3.5:free': {
          canonicalId: 'public::cohere::rerank-v3.5:free',
          baseModelKey: 'rerank-v3.5',
          scope: 'public',
          vendorSlug: 'cohere',
          modelSlug: 'rerank-v3.5',
          displayName: 'Rerank v3.5 Free',
          shortName: 'Rerank v3.5 Free',
          kind: 'rerank',
          inputModalities: ['text'],
          outputModalities: ['text'],
          features: [],
          references: [],
          sourcePriority: 'seed',
          confidence: 'high',
          updatedAt: '2026-03-24T00:00:00.000Z',
        },
      },
    }

    const issues = validateRegistryState(registry)
    expect(issues.some((issue) => issue.code === 'duplicate-public-identity')).toBe(true)
    expect(issues.some((issue) => issue.code === 'duplicate-base-model-key')).toBe(true)
  })

  it('应识别 dangling alias', () => {
    const registry: ModelRegistryState = {
      ...createEmptyModelRegistry(),
      generatedAt: '2026-03-24T00:00:00.000Z',
      aliasIndex: {
        'openai::*::foo': {
          aliasKey: 'openai::*::foo',
          rawId: 'foo',
          normalizedId: 'foo',
          providerType: 'openai',
          canonicalId: 'public::missing::foo',
          matchType: 'openrouter-id',
          confidence: 'high',
        },
      },
    }

    const issues = validateRegistryState(registry)
    expect(issues.some((issue) => issue.code === 'dangling-alias')).toBe(true)
  })

  it('baseModelKey 冲突时不允许再保留 leaf-unique alias', () => {
    const registry: ModelRegistryState = {
      ...createEmptyModelRegistry(),
      generatedAt: '2026-03-24T00:00:00.000Z',
      canonicalModels: {
        'public::vendora::shared-model': {
          canonicalId: 'public::vendora::shared-model',
          baseModelKey: 'shared-model',
          scope: 'public',
          vendorSlug: 'vendora',
          modelSlug: 'shared-model',
          displayName: 'Vendor A Shared Model',
          shortName: 'Vendor A Shared Model',
          kind: 'chat',
          inputModalities: ['text'],
          outputModalities: ['text'],
          features: [],
          references: [],
          sourcePriority: 'seed',
          confidence: 'high',
          updatedAt: '2026-03-24T00:00:00.000Z',
        },
        'public::vendorb::shared-model': {
          canonicalId: 'public::vendorb::shared-model',
          baseModelKey: 'shared-model',
          scope: 'public',
          vendorSlug: 'vendorb',
          modelSlug: 'shared-model',
          displayName: 'Vendor B Shared Model',
          shortName: 'Vendor B Shared Model',
          kind: 'chat',
          inputModalities: ['text'],
          outputModalities: ['text'],
          features: [],
          references: [],
          sourcePriority: 'seed',
          confidence: 'high',
          updatedAt: '2026-03-24T00:00:00.000Z',
        },
      },
      aliasIndex: {
        '*::*::shared-model': {
          aliasKey: '*::*::shared-model',
          rawId: 'shared-model',
          normalizedId: 'shared-model',
          canonicalId: 'public::vendora::shared-model',
          matchType: 'leaf-unique',
          confidence: 'high',
        },
      },
    }

    const issues = validateRegistryState(registry)
    expect(issues.some((issue) => issue.code === 'conflicting-base-model-leaf-alias')).toBe(true)
  })
})
