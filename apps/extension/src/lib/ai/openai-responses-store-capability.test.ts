/**
 * 说明：`openai-responses-store-capability.test` AI 能力模块测试。
 *
 * 职责：
 * - 守住 OpenAI Responses `store` 稳定能力缓存的 key 归一化与持久化合同；
 * - 验证“首轮确认不支持后，后续同一目标直接稳定关闭 `store`”所依赖的读写语义；
 * - 避免运行时稳定策略只靠上层集成间接覆盖。
 *
 * 边界：
 * - 本文件只验证 capability 模块自身，不覆盖上层 `stream-chat-context` / `stream-chat` 编排。
 * - 存储层全部使用受控 mock，不跨到真实 `chrome.storage` 或 bootstrap mirror 细节。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonStorageMock } from '@/test/json-storage-mock'

vi.mock('@/lib/storage/json-storage', async () => {
  const { createJsonStorageMockModule } = await import('@/test/json-storage-mock')
  return createJsonStorageMockModule()
})

describe('openai-responses-store-capability', () => {
  beforeEach(() => {
    jsonStorageMock.reset()
  })

  it('会把空 host 与尾斜杠 host 归一化到同一稳定 key', async () => {
    const { buildOpenAiResponsesStoreCapabilityKey } = await import('./openai-responses-store-capability')

    expect(buildOpenAiResponsesStoreCapabilityKey({
      providerId: 'openai',
      modelId: 'gpt-5.4',
      effectiveProviderType: 'openai-response',
      transportProtocol: 'openai-responses',
    })).toBe(buildOpenAiResponsesStoreCapabilityKey({
      providerId: 'openai',
      modelId: 'gpt-5.4',
      effectiveProviderType: 'openai-response',
      transportProtocol: 'openai-responses',
      apiHost: '',
    }))

    expect(buildOpenAiResponsesStoreCapabilityKey({
      providerId: 'openai',
      modelId: 'gpt-5.4',
      effectiveProviderType: 'openai-response',
      transportProtocol: 'openai-responses',
      apiHost: 'https://gateway.example.com/v1',
    })).toBe(buildOpenAiResponsesStoreCapabilityKey({
      providerId: 'openai',
      modelId: 'gpt-5.4',
      effectiveProviderType: 'openai-response',
      transportProtocol: 'openai-responses',
      apiHost: 'https://gateway.example.com/v1/',
    }))
  })

  it('首次记住不支持目标后，会把同一目标识别成已知不支持', async () => {
    const {
      isKnownUnsupportedOpenAiResponsesStoreTarget,
      rememberUnsupportedOpenAiResponsesStoreTarget,
    } = await import('./openai-responses-store-capability')

    const ctx = {
      providerId: 'openai',
      modelId: 'gpt-5.4',
      effectiveProviderType: 'openai-response',
      transportProtocol: 'openai-responses',
      apiHost: 'https://gateway.example.com/v1/',
    }

    await expect(isKnownUnsupportedOpenAiResponsesStoreTarget(ctx)).resolves.toBe(false)
    await rememberUnsupportedOpenAiResponsesStoreTarget(ctx)
    await expect(isKnownUnsupportedOpenAiResponsesStoreTarget({
      ...ctx,
      apiHost: 'https://gateway.example.com/v1',
    })).resolves.toBe(true)
  })

  it('重复记住同一目标时不会重复写入', async () => {
    const { rememberUnsupportedOpenAiResponsesStoreTarget } = await import('./openai-responses-store-capability')

    const ctx = {
      providerId: 'openai',
      modelId: 'gpt-5.4',
      effectiveProviderType: 'openai-response',
      transportProtocol: 'openai-responses',
      apiHost: 'https://gateway.example.com/v1',
    }

    await rememberUnsupportedOpenAiResponsesStoreTarget(ctx)
    await rememberUnsupportedOpenAiResponsesStoreTarget({
      ...ctx,
      apiHost: 'https://gateway.example.com/v1/',
    })

    expect(jsonStorageMock.writeStoredJsonMock).toHaveBeenCalledTimes(1)
  })
})
