/**
 * 说明：`provider-network-targets.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-network-targets.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 单元测试：Provider 网络目标 host match patterns 的推导规则。
 *
 * 覆盖：
 * - 不同 provider 的 baseURL 解析；
 * - 按 model transportProtocol 分流（例如 new-api/anthropicApiHost）；
 * - 含占位符 apiHost 的降级处理（不生成网络目标）。
 */

import { describe, expect, it } from 'vitest'

import type { ProviderConfig } from './types'
import { getProviderNetworkHostMatchPatterns, resolveProviderNetworkBaseUrl, resolveProviderNetworkBaseUrlForModel } from './provider-network-targets'

describe('provider-network-targets', () => {
  it('openai/openai-response: uses apiHost origin', () => {
    const cfg: ProviderConfig = {
      id: 'openai',
      name: 'OpenAI',
      type: 'openai-response',
      apiKey: '',
      apiHost: 'https://api.openai.com/v1',
      enabled: true,
      models: [],
    }
    expect(resolveProviderNetworkBaseUrl(cfg)).toBe('https://api.openai.com/v1')
    expect(getProviderNetworkHostMatchPatterns(cfg)).toEqual(['https://api.openai.com/*'])
  })

  it('anthropic: resolves native Messages API base to /v1 before deriving network targets', () => {
    const cfg: ProviderConfig = {
      id: 'anthropic',
      name: 'Anthropic',
      type: 'anthropic',
      apiKey: 'k',
      apiHost: 'https://sub2api.h5doc.xyz/messages',
      enabled: true,
      models: [{ id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' }],
    }
    expect(resolveProviderNetworkBaseUrl(cfg)).toBe('https://sub2api.h5doc.xyz/v1')
    expect(getProviderNetworkHostMatchPatterns(cfg)).toEqual(['https://sub2api.h5doc.xyz/*'])
  })

  it('vertex: derives aiplatform host from location', () => {
    const cfg: ProviderConfig = {
      id: 'vertexai',
      name: 'Vertex AI',
      type: 'vertexai',
      apiKey: '',
      apiHost: 'https://{region}-aiplatform.googleapis.com',
      enabled: true,
      models: [],
      vertex: {
        authType: 'serviceAccount',
        projectId: 'p',
        location: 'us-central1',
        serviceAccount: { clientEmail: 'svc@example.iam.gserviceaccount.com', privateKey: 'key' },
      },
    }
    expect(resolveProviderNetworkBaseUrl(cfg)).toBe('https://us-central1-aiplatform.googleapis.com')
    expect(getProviderNetworkHostMatchPatterns(cfg)).toEqual(['https://us-central1-aiplatform.googleapis.com/*'])
  })

  it('vertex express mode: derives global aiplatform host without location', () => {
    const cfg: ProviderConfig = {
      id: 'vertexai',
      name: 'Vertex AI',
      type: 'vertexai',
      apiKey: '',
      apiHost: 'https://{region}-aiplatform.googleapis.com',
      enabled: true,
      models: [],
      vertex: { authType: 'apiKey', apiKey: 'vertex-api-key' },
    }
    expect(resolveProviderNetworkBaseUrl(cfg)).toBe('https://aiplatform.googleapis.com')
    expect(getProviderNetworkHostMatchPatterns(cfg)).toEqual(['https://aiplatform.googleapis.com/*'])
  })

  it('bedrock: derives bedrock-runtime host from region', () => {
    const cfg: ProviderConfig = {
      id: 'aws-bedrock',
      name: 'AWS Bedrock',
      type: 'aws-bedrock',
      apiKey: '',
      apiHost: 'https://bedrock-runtime.{region}.amazonaws.com',
      enabled: true,
      models: [],
      bedrock: { authType: 'iam', region: 'us-east-1', accessKeyId: 'a', secretAccessKey: 'b' },
    }
    expect(resolveProviderNetworkBaseUrl(cfg)).toBe('https://bedrock-runtime.us-east-1.amazonaws.com')
    expect(getProviderNetworkHostMatchPatterns(cfg)).toEqual(['https://bedrock-runtime.us-east-1.amazonaws.com/*'])
  })

  it('bedrock: prefers explicit apiHost override when it is already a real URL', () => {
    const cfg: ProviderConfig = {
      id: 'aws-bedrock',
      name: 'AWS Bedrock',
      type: 'aws-bedrock',
      apiKey: '',
      apiHost: 'https://bedrock-proxy.example.com/runtime',
      enabled: true,
      models: [],
      bedrock: { authType: 'iam', region: 'us-east-1', accessKeyId: 'a', secretAccessKey: 'b' },
    }
    expect(resolveProviderNetworkBaseUrl(cfg)).toBe('https://bedrock-proxy.example.com/runtime')
    expect(getProviderNetworkHostMatchPatterns(cfg)).toEqual(['https://bedrock-proxy.example.com/*'])
  })

  it('placeholder apiHost: returns empty patterns', () => {
    const cfg: ProviderConfig = {
      id: 'azure-openai',
      name: 'Azure OpenAI',
      type: 'azure-openai',
      apiKey: 'k',
      apiHost: 'https://{resource-name}.openai.azure.com/openai/deployments/{deployment}',
      apiVersion: '2025-01-01',
      enabled: true,
      models: [],
    }
    expect(getProviderNetworkHostMatchPatterns(cfg)).toEqual([])
  })

  it('new-api: anthropic endpoint uses anthropicApiHost origin', () => {
    const cfg: ProviderConfig = {
      id: 'new-api',
      name: 'NewAPI',
      type: 'new-api',
      apiKey: 'k',
      apiHost: 'https://gateway.example/v1',
      anthropicApiHost: 'https://anthropic.example/v1',
      enabled: true,
      models: [{ id: 'claude', name: 'Claude', transportProtocol: 'anthropic-messages' }],
    }

    // 不指定模型时：按默认 apiHost 生成网络目标（用于 /models 等通用能力）
    expect(resolveProviderNetworkBaseUrl(cfg)).toBe('https://gateway.example/v1')

    // 指定模型时：按 transportProtocol 分流（Anthropic → anthropicApiHost）
    expect(resolveProviderNetworkBaseUrlForModel(cfg, 'claude')).toBe('https://anthropic.example/v1')
    expect(getProviderNetworkHostMatchPatterns(cfg, 'claude')).toEqual(['https://anthropic.example/*'])
  })
})
