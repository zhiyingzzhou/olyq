/**
 * 说明：`provider-auth.test` AI 能力模块。
 *
 * 职责：
 * - 固定 Provider API Key 鉴权 helper 的默认映射、自定义覆盖与 header 清洗规则；
 * - 防止普通自定义 headers 重新成为鉴权双真源。
 *
 * 边界：
 * - 本测试只覆盖通用 `provider.apiKey` 路径；
 * - OAuth、Vertex 服务账号、Bedrock IAM 等专用鉴权由各自 adapter 测试负责。
 */
import { describe, expect, it, vi } from 'vitest'

import {
  buildProviderApiKeyAuthHeaders,
  createProviderAuthFetch,
  resolveProviderApiKeyAuth,
  resolveProviderRequestParams,
  sanitizeProviderApiKeyAuthConfig,
  sanitizeProviderExtraHeaders,
} from './provider-auth'
import type { ProviderConfig } from './types'

/** 构造最小 ProviderConfig，便于鉴权 helper 用例聚焦输入差异。 */
function makeProvider(overrides: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: overrides.id ?? 'provider',
    name: overrides.name ?? 'Provider',
    type: overrides.type ?? 'openai',
    apiKey: overrides.apiKey ?? 'sk-test',
    apiHost: overrides.apiHost ?? 'https://api.example.com/v1',
    enabled: overrides.enabled ?? true,
    models: overrides.models ?? [],
    ...overrides,
  }
}

describe('provider-auth', () => {
  it('按 provider 类型解析默认 API Key 鉴权头', () => {
    expect(resolveProviderApiKeyAuth(makeProvider({ type: 'openai' }))).toEqual({
      custom: false,
      headerName: 'Authorization',
      valuePrefix: 'Bearer',
    })
    expect(resolveProviderApiKeyAuth(makeProvider({ type: 'anthropic' }))).toEqual({
      custom: false,
      headerName: 'x-api-key',
      valuePrefix: '',
    })
    expect(resolveProviderApiKeyAuth(makeProvider({ type: 'gemini' }))).toEqual({
      custom: false,
      headerName: 'x-goog-api-key',
      valuePrefix: '',
    })
    expect(resolveProviderApiKeyAuth(makeProvider({ type: 'azure-openai' }))).toEqual({
      custom: false,
      headerName: 'api-key',
      valuePrefix: '',
    })
  })

  it('支持自定义 header 与裸 key，并清理非法配置', () => {
    const custom = resolveProviderApiKeyAuth(makeProvider({
      apiKeyAuth: { headerName: 'xi-api-key', valuePrefix: '' },
    }))

    expect(custom).toEqual({
      custom: true,
      headerName: 'xi-api-key',
      valuePrefix: '',
    })
    expect(buildProviderApiKeyAuthHeaders('sk-eleven', custom)).toEqual({
      'xi-api-key': 'sk-eleven',
    })
    expect(sanitizeProviderApiKeyAuthConfig({ headerName: 'bad header', valuePrefix: 'Bearer' })).toBeUndefined()
    expect(sanitizeProviderApiKeyAuthConfig({ headerName: 'Content-Type', valuePrefix: 'Bearer' })).toBeUndefined()
  })

  it('非通用 API Key 鉴权平台不会启用自定义 apiKeyAuth', () => {
    expect(resolveProviderApiKeyAuth(makeProvider({
      type: 'openai',
      authType: 'oauth',
      apiKeyAuth: { headerName: 'xi-api-key' },
    }))).toEqual({
      custom: false,
      headerName: 'Authorization',
      valuePrefix: 'Bearer',
    })
    expect(resolveProviderRequestParams(makeProvider({
      type: 'ollama',
      apiKey: 'ollama-key',
      apiKeyAuth: { headerName: 'xi-api-key' },
    })).authHeaders).toEqual({
      Authorization: 'Bearer ollama-key',
    })
  })

  it('普通 headers 会过滤 Content-Type 与当前/常见鉴权头', () => {
    expect(sanitizeProviderExtraHeaders({
      Authorization: 'Bearer wrong',
      'x-api-key': 'wrong',
      'x-goog-api-key': 'wrong',
      'api-key': 'wrong',
      'xi-api-key': 'wrong',
      'Content-Type': 'application/json',
      'X-Title': 'Olyq',
      Empty: '',
    }, 'xi-api-key')).toEqual({
      'X-Title': 'Olyq',
    })
  })

  it('统一请求参数解析不推进多 key 轮询，只消费调用方已选 key', () => {
    const first = resolveProviderRequestParams(makeProvider({
      apiKey: 'first,second',
    }))
    const second = resolveProviderRequestParams(makeProvider({
      apiKey: 'second',
    }))

    expect(first.authHeaders).toEqual({ Authorization: 'Bearer first' })
    expect(second.authHeaders).toEqual({ Authorization: 'Bearer second' })
  })

  it('URL-like API Key 不会生成任何平台的鉴权头', () => {
    const pollutedKey = 'https://api.ikuncode.cc/v1/messages'
    const cases: Array<{ type: ProviderConfig['type']; expectedHeader: string }> = [
      { type: 'openai', expectedHeader: 'Authorization' },
      { type: 'openai-response', expectedHeader: 'Authorization' },
      { type: 'gateway', expectedHeader: 'Authorization' },
      { type: 'anthropic', expectedHeader: 'x-api-key' },
      { type: 'gemini', expectedHeader: 'x-goog-api-key' },
      { type: 'azure-openai', expectedHeader: 'api-key' },
    ]

    for (const item of cases) {
      const params = resolveProviderRequestParams(makeProvider({
        type: item.type,
        apiKey: pollutedKey,
      }))
      expect(params.apiKey, item.type).toBe('')
      expect(params.authHeaders, item.type).toEqual({})
      expect(params.authHeaders[item.expectedHeader]).toBeUndefined()
    }

    expect(buildProviderApiKeyAuthHeaders(pollutedKey, {
      custom: false,
      headerName: 'Authorization',
      valuePrefix: 'Bearer',
    })).toEqual({})
  })

  it('自定义鉴权 fetch 会移除 SDK 默认鉴权头并写入自定义头', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const authFetch = createProviderAuthFetch({ 'xi-api-key': 'sk-eleven' })
    await authFetch?.('https://api.example.com/v1/models', {
      headers: {
        Authorization: 'Bearer sdk',
        'x-api-key': 'sdk',
        'x-goog-api-key': 'sdk',
        'api-key': 'sdk',
        'Content-Type': 'application/json',
      },
    })

    const calls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit | undefined]>
    const init = calls[0]?.[1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.get('authorization')).toBeNull()
    expect(headers.get('x-api-key')).toBeNull()
    expect(headers.get('x-goog-api-key')).toBeNull()
    expect(headers.get('api-key')).toBeNull()
    expect(headers.get('xi-api-key')).toBe('sk-eleven')
    expect(headers.get('content-type')).toBe('application/json')

    vi.unstubAllGlobals()
  })
})
