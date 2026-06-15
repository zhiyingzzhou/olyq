/**
 * 说明：`vertex-bedrock-adapters.test` AI 能力模块。
 *
 * 职责：
 * - 覆盖 Bedrock / Vertex 专用鉴权配置到 AI SDK provider settings 的映射；
 * - 防止 UI 与存储字段完成切换后，运行时仍读取旧字段或通用 API Key。
 *
 * 边界：
 * - 本测试只断言 adapter 层传给 SDK factory 的参数；
 * - 不发真实网络请求，也不验证上游 provider 的服务端行为。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProviderConfig } from '../types'
import { bedrockAdapter } from './bedrock-adapter'
import { vertexAdapter } from './vertex-adapter'
import { vertexAnthropicAdapter } from './vertex-anthropic-adapter'

const { createAmazonBedrockMock, createVertexMock, createVertexAnthropicMock } = vi.hoisted(() => {
  /** 构造 AI SDK factory mock 返回的最小 provider 函数。 */
  const buildProvider = () => {
    const provider = vi.fn((modelId: string) => ({ kind: 'language', modelId }))
    Object.assign(provider, {
      embeddingModel: vi.fn((modelId: string) => ({ kind: 'embedding', modelId })),
      imageModel: vi.fn((modelId: string) => ({ kind: 'image', modelId })),
    })
    return provider
  }

  return {
    createAmazonBedrockMock: vi.fn(() => buildProvider()),
    createVertexMock: vi.fn(() => buildProvider()),
    createVertexAnthropicMock: vi.fn(() => buildProvider()),
  }
})

vi.mock('@ai-sdk/amazon-bedrock', () => ({
  createAmazonBedrock: createAmazonBedrockMock,
}))

vi.mock('@ai-sdk/google-vertex/edge', () => ({
  createVertex: createVertexMock,
}))

vi.mock('@ai-sdk/google-vertex/anthropic/edge', () => ({
  createVertexAnthropic: createVertexAnthropicMock,
}))

/** 构造最小可运行 Provider 配置。 */
function provider(overrides: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: 'provider',
    name: 'Provider',
    type: 'openai',
    apiKey: '',
    apiHost: '',
    enabled: true,
    models: [],
    ...overrides,
  }
}

describe('Bedrock / Vertex adapter auth mapping', () => {
  beforeEach(() => {
    createAmazonBedrockMock.mockClear()
    createVertexMock.mockClear()
    createVertexAnthropicMock.mockClear()
  })

  it('Bedrock IAM 会把 sessionToken 传给 createAmazonBedrock', () => {
    bedrockAdapter.createLanguageModel(provider({
      type: 'aws-bedrock',
      bedrock: {
        authType: 'iam',
        region: 'us-east-1',
        accessKeyId: 'ak',
        secretAccessKey: 'sk',
        sessionToken: 'sts-token',
      },
    }), 'anthropic.claude')

    expect(createAmazonBedrockMock).toHaveBeenCalledWith(expect.objectContaining({
      region: 'us-east-1',
      accessKeyId: 'ak',
      secretAccessKey: 'sk',
      sessionToken: 'sts-token',
    }))
  })

  it('Bedrock API Key 会传入官方 Bearer token 字段', () => {
    bedrockAdapter.createLanguageModel(provider({
      type: 'aws-bedrock',
      apiHost: 'https://bedrock-proxy.example.com/runtime',
      bedrock: {
        authType: 'apiKey',
        region: 'us-east-1',
        apiKey: 'Bearer bedrock-key',
      },
    }), 'amazon.nova')

    expect(createAmazonBedrockMock).toHaveBeenCalledWith(expect.objectContaining({
      region: 'us-east-1',
      apiKey: 'bedrock-key',
      baseURL: 'https://bedrock-proxy.example.com/runtime',
    }))
  })

  it('Vertex Service Account 会传 project/location/googleCredentials', () => {
    vertexAdapter.createLanguageModel(provider({
      type: 'vertexai',
      apiHost: 'https://vertex-proxy.example.com/v1beta1/projects/demo/locations/us-central1/publishers/google',
      vertex: {
        authType: 'serviceAccount',
        projectId: 'demo-project',
        location: 'us-central1',
        serviceAccount: {
          clientEmail: 'svc@example.iam.gserviceaccount.com',
          privateKey: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
          privateKeyId: 'key-id',
        },
      },
    }), 'gemini-2.5-pro')

    expect(createVertexMock).toHaveBeenCalledWith(expect.objectContaining({
      project: 'demo-project',
      location: 'us-central1',
      baseURL: 'https://vertex-proxy.example.com/v1beta1/projects/demo/locations/us-central1/publishers/google',
      googleCredentials: {
        clientEmail: 'svc@example.iam.gserviceaccount.com',
        privateKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
        privateKeyId: 'key-id',
      },
    }))
  })

  it('Vertex express API Key 不要求 project/location，也不读取 provider.apiKey', () => {
    vertexAdapter.createLanguageModel(provider({
      type: 'vertexai',
      apiKey: 'generic-provider-key',
      apiHost: 'https://{region}-aiplatform.googleapis.com',
      vertex: {
        authType: 'apiKey',
        apiKey: 'Bearer vertex-express-key',
      },
    }), 'gemini-2.5-flash')

    expect(createVertexMock).toHaveBeenCalledWith({
      apiKey: 'vertex-express-key',
      headers: {},
    })
  })

  it('Vertex Anthropic 固定要求 Service Account，并映射到 createVertexAnthropic', () => {
    vertexAnthropicAdapter.createLanguageModel(provider({
      type: 'vertex-anthropic',
      vertex: {
        authType: 'serviceAccount',
        projectId: 'demo-project',
        location: 'us-central1',
        serviceAccount: {
          clientEmail: 'svc@example.iam.gserviceaccount.com',
          privateKey: 'private-key',
        },
      },
    }), 'claude-sonnet-4')

    expect(createVertexAnthropicMock).toHaveBeenCalledWith(expect.objectContaining({
      project: 'demo-project',
      location: 'us-central1',
      googleCredentials: {
        clientEmail: 'svc@example.iam.gserviceaccount.com',
        privateKey: 'private-key',
      },
    }))
  })

  it('Vertex Anthropic 禁止 API Key 模式', () => {
    expect(() => vertexAnthropicAdapter.createLanguageModel(provider({
      type: 'vertex-anthropic',
      vertex: {
        authType: 'apiKey',
        apiKey: 'vertex-key',
      },
    }), 'claude-sonnet-4')).toThrow('errors.vertexAnthropicServiceAccountRequired')
  })
})
