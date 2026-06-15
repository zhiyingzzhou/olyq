/**
 * 说明：`cohere.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `cohere.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest'

import { cohereConnector } from './cohere'

describe('cohereConnector.normalizeEntry', () => {
  it('会产出 provider-official 高置信度证据，并保留官方目录语义提示', () => {
    const [evidence] = cohereConnector.normalizeEntry({
      raw: {
        id: 'embed-english-v3.0-image',
        name: 'embed-english-v3.0-image',
        group: 'Cohere',
        transportProtocol: 'embedding-api',
        kindHint: 'embedding',
        inputModalities: ['image'],
        outputModalities: ['embeddings'],
        contextLength: 2048,
        isDeprecated: true,
      },
      rawModelId: 'embed-english-v3.0-image',
      displayName: 'embed-english-v3.0-image',
    }, {
      provider: {
        id: 'cohere',
        name: 'Cohere',
        type: 'cohere',
        apiKey: 'test',
        apiHost: 'https://api.cohere.com/v2',
        enabled: true,
        models: [],
      },
    })

    expect(evidence).toMatchObject({
      sourcePriority: 'provider-official',
      providerType: 'cohere',
      providerId: 'cohere',
      rawModelId: 'embed-english-v3.0-image',
      displayName: 'embed-english-v3.0-image',
      kindHint: 'embedding',
      inputModalities: ['image'],
      outputModalities: ['embeddings'],
      contextLength: 2048,
      transportHints: ['embedding-api'],
      scopeHint: 'provider',
      confidence: 'high',
    })
    expect(evidence?.references).toEqual([
      {
        system: 'provider-official',
        providerType: 'cohere',
        providerId: 'cohere',
        refType: 'model-id',
        value: 'embed-english-v3.0-image',
      },
    ])
  })
})
