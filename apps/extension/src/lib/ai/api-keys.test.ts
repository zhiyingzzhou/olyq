/**
 * 说明：`api-keys.test` AI 能力模块。
 *
 * 职责：
 * - 固定 Provider API Key 多 key 解析与 Cherry 式调用前轮询语义；
 * - 防止真实 API Key 被复制到轮询状态，只允许保存 provider 级下标。
 *
 * 边界：
 * - 本测试不触发真实网络请求；
 * - 轮询状态使用 storage adapter mock，模拟 `chrome.storage.local` 的 cache key 行为。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PROVIDER_API_KEY_ROTATION_STATE_STORAGE_KEY } from './storage-keys'
import {
  normalizeApiKeyString,
  normalizeProviderApiKeyRotationState,
  parseApiKeyInput,
  pickFirstApiKey,
  selectRotatedApiKeyForProvider,
  splitApiKeys,
} from './api-keys'

const {
  storageGet,
  storageSet,
  storageState,
} = vi.hoisted(() => ({
  storageGet: vi.fn(),
  storageSet: vi.fn(),
  storageState: {} as Record<string, unknown>,
}))

vi.mock('@/lib/storage/storage-adapter', () => ({
  getStorageAdapter: () => ({
    get: storageGet,
    set: storageSet,
    remove: vi.fn(),
    onChange: vi.fn(() => () => {}),
  }),
}))

describe('api-keys', () => {
  beforeEach(() => {
    for (const key of Object.keys(storageState)) delete storageState[key]
    storageGet.mockReset()
    storageSet.mockReset()
    storageGet.mockImplementation(async (keys: string[]) => {
      const out: Record<string, unknown> = {}
      for (const key of keys) {
        if (key in storageState) out[key] = storageState[key]
      }
      return out
    })
    storageSet.mockImplementation(async (items: Record<string, unknown>) => {
      Object.assign(storageState, items)
    })
  })

  it('拆分并清理逗号/换行/分号分隔的 API Key', () => {
    expect(splitApiKeys(' Bearer first,\n"second"; third ; ;')).toEqual(['first', 'second', 'third'])
    expect(splitApiKeys('"Bearer quoted", Bearer "wrapped"')).toEqual(['quoted', 'wrapped'])
    expect(splitApiKeys('Bearer first,\nsecond; first')).toEqual(['first', 'second'])
    expect(normalizeApiKeyString('first, second\nfirst')).toBe('first,second')
    expect(pickFirstApiKey(' Bearer first, second')).toBe('first')
  })

  it('拒绝 URL-like 片段但保留合法 key，不按厂商格式猜测', () => {
    expect(parseApiKeyInput('https://api.ikuncode.cc/v1/messages\nsk-valid;//api.example.com/v1')).toEqual({
      keys: ['sk-valid'],
      rejected: ['https://api.ikuncode.cc/v1/messages', '//api.example.com/v1'],
    })
    expect(parseApiKeyInput('Bearer https://api.example.com/v1, api.example.com/v1/models, localhost:11434')).toEqual({
      keys: [],
      rejected: ['https://api.example.com/v1', 'api.example.com/v1/models', 'localhost:11434'],
    })
    expect(splitApiKeys('https://api.ikuncode.cc/v1/messages')).toEqual([])
    expect(normalizeApiKeyString('https://api.ikuncode.cc/v1/messages, sk-live')).toBe('sk-live')
    expect(pickFirstApiKey('https://api.ikuncode.cc/v1/messages')).toBe('')
  })

  it('按 provider 持久化下标轮询，首轮返回第一条，后续循环', async () => {
    await expect(selectRotatedApiKeyForProvider('openai', 'first,second')).resolves.toBe('first')
    await expect(selectRotatedApiKeyForProvider('openai', 'first,second')).resolves.toBe('second')
    await expect(selectRotatedApiKeyForProvider('openai', 'first,second')).resolves.toBe('first')

    expect(storageState[PROVIDER_API_KEY_ROTATION_STATE_STORAGE_KEY]).toEqual({ openai: 0 })
    expect(JSON.stringify(storageState[PROVIDER_API_KEY_ROTATION_STATE_STORAGE_KEY])).not.toContain('first')
    expect(JSON.stringify(storageState[PROVIDER_API_KEY_ROTATION_STATE_STORAGE_KEY])).not.toContain('second')
  })

  it('key 数量变化导致旧下标越界时会从第一条重新开始', async () => {
    storageState[PROVIDER_API_KEY_ROTATION_STATE_STORAGE_KEY] = { openai: 5 }

    await expect(selectRotatedApiKeyForProvider('openai', 'next-a,next-b')).resolves.toBe('next-a')
    expect(storageState[PROVIDER_API_KEY_ROTATION_STATE_STORAGE_KEY]).toEqual({ openai: 0 })
  })

  it('URL-like 输入不会进入轮询状态', async () => {
    await expect(selectRotatedApiKeyForProvider('anthropic', 'https://api.ikuncode.cc/v1/messages')).resolves.toBe('')
    expect(storageSet).not.toHaveBeenCalled()
    expect(storageState[PROVIDER_API_KEY_ROTATION_STATE_STORAGE_KEY]).toBeUndefined()
  })

  it('归一化轮询状态时只保留非负整数下标', () => {
    expect(normalizeProviderApiKeyRotationState({
      openai: 1.9,
      '': 2,
      bad: -1,
      text: '1',
      nan: Number.NaN,
    })).toEqual({ openai: 1 })
  })
})
