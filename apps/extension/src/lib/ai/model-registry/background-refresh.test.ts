/**
 * 说明：`background-refresh.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `background-refresh.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ModelRegistryState } from './types'

vi.stubEnv('VITE_OLYQ_E2E', '0')

const refreshInRuntimeMock = vi.fn()
const buildPreviewMock = vi.fn()

/**
 * 测试辅助函数：`makeEmptyRegistry`。
 *
 * @remarks
 * 用于当前测试中的最小模型注册表搭建，不作为运行时代码复用。
 */
function makeEmptyRegistry(): ModelRegistryState {
  return {
    schema: 2,
    generatedAt: '2026-04-01T00:00:00.000Z',
    canonicalModels: {},
    aliasIndex: {},
    providerModelMap: {},
    providerScopedModels: {},
    syncMeta: {},
  }
}

vi.mock('./sync', () => ({
  refreshModelRegistryInBackground: refreshInRuntimeMock,
}))

vi.mock('./sync-preview-core', () => ({
  buildModelRegistryPreviewWithProviders: buildPreviewMock,
}))

describe('model-registry/background-refresh', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_OLYQ_E2E', '0')
    refreshInRuntimeMock.mockReset()
    buildPreviewMock.mockReset()
    refreshInRuntimeMock.mockResolvedValue(makeEmptyRegistry())
    buildPreviewMock.mockResolvedValue(makeEmptyRegistry())
  })

  it('非 E2E 模式继续走真实后台刷新链路', async () => {
    const { refreshModelRegistryInBackground } = await import('./background-refresh')

    await expect(refreshModelRegistryInBackground('modelOptions', { force: true })).resolves.toEqual(makeEmptyRegistry())

    expect(refreshInRuntimeMock).toHaveBeenCalledWith('modelOptions', { force: true })
    expect(buildPreviewMock).not.toHaveBeenCalled()
  })

  it('E2E 模式只做本地 preview 重建，不触发外网目录刷新', async () => {
    vi.stubEnv('VITE_OLYQ_E2E', '1')

    const { refreshModelRegistryInBackground } = await import('./background-refresh')

    await expect(refreshModelRegistryInBackground('onInstalled', { force: true })).resolves.toEqual(makeEmptyRegistry())

    expect(buildPreviewMock).toHaveBeenCalledTimes(1)
    expect(refreshInRuntimeMock).not.toHaveBeenCalled()
  })
})
