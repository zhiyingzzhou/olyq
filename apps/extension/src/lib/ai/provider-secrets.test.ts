/**
 * 说明：`provider-secrets.test` AI 能力模块。
 *
 * 职责：
 * - 覆盖 Provider 云同步 secret 拆分与合并的敏感字段边界；
 * - 确保 Vertex 新鉴权结构不会把 express API Key 或 Service Account privateKey 写入远端明文。
 *
 * 边界：
 * - 本测试只验证 provider 配置结构处理，不触发真实同步、加密或网络请求。
 */
import { describe, expect, it } from 'vitest'

import { mergeProviderSecrets, splitProviderSecrets } from './provider-secrets'
import type { ProviderConfig } from './types'

describe('provider-secrets', () => {
  it('会把 Vertex Service Account privateKey 拆入 secret，并保留非敏感字段在明文配置', () => {
    const providers: ProviderConfig[] = [{
      id: 'vertexai',
      name: 'Vertex AI',
      type: 'vertexai',
      apiKey: '',
      apiHost: '',
      enabled: true,
      models: [],
      vertex: {
        authType: 'serviceAccount',
        projectId: 'demo-project',
        location: 'us-central1',
        serviceAccount: {
          clientEmail: 'svc@example.iam.gserviceaccount.com',
          privateKey: 'private-key',
          privateKeyId: 'key-id',
        },
      },
    }]

    const split = splitProviderSecrets(providers)

    expect(split.publicProviders[0]?.vertex).toEqual({
      authType: 'serviceAccount',
      projectId: 'demo-project',
      location: 'us-central1',
      serviceAccount: {
        clientEmail: 'svc@example.iam.gserviceaccount.com',
        privateKeyId: 'key-id',
      },
    })
    expect(split.secretsByProviderId.vertexai?.vertex).toEqual({
      serviceAccount: { privateKey: 'private-key' },
    })

    expect(mergeProviderSecrets(split.publicProviders, split.secretsByProviderId)[0]?.vertex).toEqual({
      authType: 'serviceAccount',
      projectId: 'demo-project',
      location: 'us-central1',
      serviceAccount: {
        clientEmail: 'svc@example.iam.gserviceaccount.com',
        privateKey: 'private-key',
        privateKeyId: 'key-id',
      },
    })
  })

  it('会把 Vertex express API Key 拆入 secret，明文只保留 authType', () => {
    const providers: ProviderConfig[] = [{
      id: 'vertexai',
      name: 'Vertex AI',
      type: 'vertexai',
      apiKey: '',
      apiHost: '',
      enabled: true,
      models: [],
      vertex: {
        authType: 'apiKey',
        apiKey: 'vertex-api-key',
      },
    }]

    const split = splitProviderSecrets(providers)

    expect(split.publicProviders[0]?.vertex).toEqual({ authType: 'apiKey' })
    expect(split.secretsByProviderId.vertexai?.vertex).toEqual({ apiKey: 'vertex-api-key' })
    expect(mergeProviderSecrets(split.publicProviders, split.secretsByProviderId)[0]?.vertex).toEqual({
      authType: 'apiKey',
      apiKey: 'vertex-api-key',
    })
  })
})
