/**
 * 说明：`stream-chat-context.resolve-context.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `stream-chat-context.resolve-context.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProviderConfig } from './types'

const { getProviderViewMock, resolveModelMetaMock } = vi.hoisted(() => ({
  getProviderViewMock: vi.fn(),
  resolveModelMetaMock: vi.fn(),
}))

vi.mock('./provider-storage', () => ({
  getProviderView: getProviderViewMock,
}))

vi.mock('./model-registry', () => ({
  resolveModelMeta: resolveModelMetaMock,
}))

vi.mock('./provider-runtime', () => ({
  resolveModel: vi.fn(),
}))

describe('resolveStreamContext', () => {
  beforeEach(() => {
    vi.resetModules()
    getProviderViewMock.mockReset()
    resolveModelMetaMock.mockReset()
  })

  it('会命中 Anthropic 已存三方目录模型，而不是回退到默认 Claude seed', async () => {
    const anthropicProvider: ProviderConfig = {
      id: 'anthropic',
      name: 'Anthropic',
      type: 'anthropic',
      apiKey: 'proxy-key',
      apiHost: 'https://api.proxy.example.com',
      enabled: true,
      models: [
        { id: 'moonshotai/kimi-k2.5', name: 'moonshotai/kimi-k2.5' },
      ],
    }
    getProviderViewMock.mockResolvedValue(anthropicProvider)
    resolveModelMetaMock.mockResolvedValue({
      canonicalId: 'provider::anthropic::moonshotai/kimi-k2.5',
      baseModelKey: 'moonshotai/kimi-k2.5',
      scope: 'provider',
      kind: 'chat',
      inputModalities: ['text'],
      outputModalities: ['text'],
      features: [],
      transportProtocol: 'anthropic-messages',
      displayName: 'moonshotai/kimi-k2.5',
      confidence: 'high',
    })

    const { resolveStreamContext } = await import('./stream-chat-context')
    const context = await resolveStreamContext({
      model: 'anthropic/moonshotai/kimi-k2.5',
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 256,
    })

    expect(getProviderViewMock).toHaveBeenCalledWith('anthropic')
    expect(resolveModelMetaMock).toHaveBeenCalledWith({
      providerType: 'anthropic',
      providerId: 'anthropic',
      apiHost: 'https://api.proxy.example.com',
      rawModelId: 'moonshotai/kimi-k2.5',
      rawModelName: 'moonshotai/kimi-k2.5',
    })
    expect(context.providerConfig).toEqual(anthropicProvider)
    expect(context.modelId).toBe('moonshotai/kimi-k2.5')
    expect(context.modelConfig).toEqual(anthropicProvider.models?.[0])
    expect(context.resolvedModelMeta.transportProtocol).toBe('anthropic-messages')
  })
})
