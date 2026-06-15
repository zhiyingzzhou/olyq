/**
 * 说明：`provider-schemas.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-schemas.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest'

import { ProviderConfigSchema, ProviderModelConfigSchema } from './provider-schemas'

describe('ProviderModelConfigSchema', () => {
  it('能解析 manualModelTypes，并保留空数组语义', () => {
    const parsedWithManualModelTypes = ProviderModelConfigSchema.parse({
      id: 'gpt-4.1',
      name: 'GPT-4.1',
      manualModelTypes: ['text_generation', 'image_generation', 'vision', 'reasoning', 'vision'],
      supportedTextDelta: true,
    })

    expect(parsedWithManualModelTypes).toEqual({
      id: 'gpt-4.1',
      name: 'GPT-4.1',
      manualModelTypes: ['text_generation', 'image_generation', 'vision', 'reasoning'],
      supportedTextDelta: true,
    })

    const parsedEmptyManualModelTypes = ProviderModelConfigSchema.parse({
      id: 'gpt-4.1-mini',
      manualModelTypes: [],
    })

    expect(parsedEmptyManualModelTypes).toEqual({
      id: 'gpt-4.1-mini',
      name: 'gpt-4.1-mini',
      manualModelTypes: [],
    })
  })

  it('会彻底忽略旧的价格/归属方/描述字段', () => {
    const parsed = ProviderModelConfigSchema.parse({
      id: 'legacy-model',
      pricing: {
        inputPerMillionTokens: 1,
        outputPerMillionTokens: 2,
        currencySymbol: '$',
      },
      ownedBy: 'legacy-owner',
      description: 'legacy-description',
    })

    expect(parsed).toEqual({
      id: 'legacy-model',
      name: 'legacy-model',
    })
  })

  it('会规范化 supportedParameters 并保留 provider 原生字段名', () => {
    const parsed = ProviderModelConfigSchema.parse({
      id: 'openai/gpt-5.4',
      name: 'GPT-5.4',
      supportedParameters: [' temperature ', 'top_p', '', 'Temperature', 'max_completion_tokens'],
    })

    expect(parsed).toEqual({
      id: 'openai/gpt-5.4',
      name: 'GPT-5.4',
      supportedParameters: ['temperature', 'top_p', 'max_completion_tokens'],
    })
  })

  it('会丢弃 serviceTier / verbosity 的 legacy null 值', () => {
    const parsed = ProviderConfigSchema.parse({
      id: 'provider',
      name: 'Provider',
      type: 'openai',
      apiKey: '',
      apiHost: '',
      enabled: true,
      models: [],
      serviceTier: null,
      verbosity: null,
    })

    expect(parsed).toEqual({
      id: 'provider',
      name: 'Provider',
      type: 'openai',
      apiKey: '',
      apiHost: '',
      enabled: true,
      models: [],
    })
  })

  it('会在 schema 真源清理 provider.apiKey 与 Bedrock apiKey 里的 URL-like 污染', () => {
    const parsed = ProviderConfigSchema.parse({
      id: 'provider',
      name: 'Provider',
      type: 'openai',
      apiKey: 'https://api.example.com/v1/messages, Bearer sk-valid',
      apiHost: '',
      enabled: true,
      models: [],
    })

    expect(parsed?.apiKey).toBe('sk-valid')

    const bedrock = ProviderConfigSchema.parse({
      id: 'bedrock-provider',
      name: 'Bedrock Provider',
      type: 'aws-bedrock',
      apiKey: '',
      apiHost: '',
      enabled: true,
      models: [],
      bedrock: {
        authType: 'apiKey',
        region: 'us-east-1',
        apiKey: 'https://bedrock-runtime.us-east-1.amazonaws.com/model/foo, bedrock-valid-key',
      },
    })

    expect(bedrock?.bedrock?.apiKey).toBe('bedrock-valid-key')
  })

  it('会解析合法 apiKeyAuth，并丢弃非法 header 或 Content-Type', () => {
    const parsed = ProviderConfigSchema.parse({
      id: 'provider',
      name: 'Provider',
      type: 'openai',
      apiKey: '',
      apiHost: '',
      enabled: true,
      models: [],
      apiKeyAuth: {
        headerName: ' Authorization ',
        valuePrefix: '  ',
      },
    })

    expect(parsed?.apiKeyAuth).toEqual({ headerName: 'Authorization' })

    const invalidHeader = ProviderConfigSchema.parse({
      id: 'provider-invalid',
      name: 'Provider Invalid',
      type: 'openai',
      apiKey: '',
      apiHost: '',
      enabled: true,
      models: [],
      apiKeyAuth: {
        headerName: 'bad header',
        valuePrefix: 'Bearer',
      },
    })

    expect(invalidHeader?.apiKeyAuth).toBeUndefined()

    const contentType = ProviderConfigSchema.parse({
      id: 'provider-content-type',
      name: 'Provider Content Type',
      type: 'openai',
      apiKey: '',
      apiHost: '',
      enabled: true,
      models: [],
      apiKeyAuth: {
        headerName: 'Content-Type',
        valuePrefix: 'Bearer',
      },
    })

    expect(contentType?.apiKeyAuth).toBeUndefined()
  })

  it('会在非通用 API Key 鉴权平台上丢弃 apiKeyAuth', () => {
    const oauthProvider = ProviderConfigSchema.parse({
      id: 'oauth-provider',
      name: 'OAuth Provider',
      type: 'openai',
      authType: 'oauth',
      apiKey: '',
      apiHost: '',
      enabled: true,
      models: [],
      apiKeyAuth: { headerName: 'xi-api-key' },
    })

    const vertexProvider = ProviderConfigSchema.parse({
      id: 'vertex-provider',
      name: 'Vertex Provider',
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
        },
      },
      apiKeyAuth: { headerName: 'xi-api-key' },
    })

    const bedrockProvider = ProviderConfigSchema.parse({
      id: 'bedrock-provider',
      name: 'Bedrock Provider',
      type: 'aws-bedrock',
      apiKey: '',
      apiHost: '',
      enabled: true,
      models: [],
      bedrock: { authType: 'iam', region: 'us-east-1' },
      apiKeyAuth: { headerName: 'xi-api-key' },
    })

    expect(oauthProvider?.apiKeyAuth).toBeUndefined()
    expect(vertexProvider?.apiKeyAuth).toBeUndefined()
    expect(bedrockProvider?.apiKeyAuth).toBeUndefined()
  })

  it('会解析 Vertex Service Account 新结构，并保留 privateKeyId', () => {
    const parsed = ProviderConfigSchema.parse({
      id: 'vertex-provider',
      name: 'Vertex Provider',
      type: 'vertexai',
      apiKey: '',
      apiHost: '',
      enabled: true,
      models: [],
      vertex: {
        authType: 'serviceAccount',
        projectId: ' demo-project ',
        location: ' us-central1 ',
        serviceAccount: {
          clientEmail: ' svc@example.iam.gserviceaccount.com ',
          privateKey: '  -----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----  ',
          privateKeyId: ' key-id ',
        },
      },
    })

    expect(parsed?.vertex).toEqual({
      authType: 'serviceAccount',
      projectId: 'demo-project',
      location: 'us-central1',
      serviceAccount: {
        clientEmail: 'svc@example.iam.gserviceaccount.com',
        privateKey: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
        privateKeyId: 'key-id',
      },
    })
  })

  it('会解析 Vertex express API Key 并清理 Bearer / URL-like 输入', () => {
    const parsed = ProviderConfigSchema.parse({
      id: 'vertex-provider',
      name: 'Vertex Provider',
      type: 'vertexai',
      apiKey: '',
      apiHost: '',
      enabled: true,
      models: [],
      vertex: {
        authType: 'apiKey',
        apiKey: 'https://aiplatform.googleapis.com/v1/publishers/google, Bearer vertex-valid-key',
        projectId: 'legacy-project',
        location: 'us-central1',
        serviceAccount: {
          clientEmail: 'legacy@example.iam.gserviceaccount.com',
          privateKey: 'legacy-private-key',
        },
      },
    })

    expect(parsed?.vertex).toEqual({
      authType: 'apiKey',
      apiKey: 'vertex-valid-key',
    })
  })

  it('不会把旧 vertex.credentialsJson 解析为存储真源', () => {
    const parsed = ProviderConfigSchema.parse({
      id: 'vertex-provider',
      name: 'Vertex Provider',
      type: 'vertexai',
      apiKey: '',
      apiHost: '',
      enabled: true,
      models: [],
      vertex: {
        projectId: 'demo-project',
        location: 'us-central1',
        credentialsJson: '{"type":"service_account"}',
      },
    })

    expect(parsed?.vertex).toBeUndefined()
  })
})
