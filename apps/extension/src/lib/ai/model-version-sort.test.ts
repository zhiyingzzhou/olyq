/**
 * 说明：`model-version-sort.test` AI 能力模块。
 *
 * 职责：
 * - 覆盖共享版本排序 helper 的关键回归，尤其是 `v` 前缀版本族；
 * - 防止基础款模型在同族重排时被错误替换成后续子版本。
 *
 * 边界：
 * - 这里只验证纯排序语义，不覆盖具体 UI 组件渲染。
 */
import { describe, expect, it } from 'vitest'

import { compareModelsByVersionSemantics, deriveVersionSortKey, sortModelsByVersionSemantics } from './model-version-sort'

type DeepSeekSortableItem = {
  readonly id: string
  readonly baseModelKey: string
}

/**
 * 为版本排序测试批量构造 DeepSeek 条目。
 *
 * @param ids - 原始模型 ID 列表。
 * @returns 带 `baseModelKey` 的测试项。
 */
function createDeepSeekItems(ids: ReadonlyArray<string>): DeepSeekSortableItem[] {
  return ids.map((id) => ({
    id,
    baseModelKey: id.split('/').pop()?.trim().toLowerCase() ?? '',
  }))
}

describe('model-version-sort', () => {
  it('优先使用派生后的 baseModelKey 作为共享排序 identity', () => {
    expect(deriveVersionSortKey({
      modelId: 'deepseek-ai/DeepSeek-V3.2',
      baseModelKey: 'deepseek-v3.2',
    })).toBe('deepseek-v3.2')

    expect(deriveVersionSortKey({
      modelId: 'deepseek-ai/DeepSeek-V3',
      baseModelKey: '',
    })).toBe('deepseek-v3')
  })

  it('会把 DeepSeek V3 基础款识别成可比较版本，并排在 V3.1 Terminus 与 V3.2 前面', () => {
    expect(compareModelsByVersionSemantics(
      { modelId: 'deepseek-ai/DeepSeek-V3', baseModelKey: 'deepseek-v3' },
      { modelId: 'deepseek-ai/DeepSeek-V3.1-Terminus', baseModelKey: 'deepseek-v3.1-terminus' },
    )).toBeLessThan(0)

    expect(compareModelsByVersionSemantics(
      { modelId: 'deepseek-ai/DeepSeek-V3.1-Terminus', baseModelKey: 'deepseek-v3.1-terminus' },
      { modelId: 'deepseek-ai/DeepSeek-V3.2', baseModelKey: 'deepseek-v3.2' },
    )).toBeLessThan(0)
  })

  it.each([
    ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-V3.1-Terminus', 'deepseek-ai/DeepSeek-V3.2'],
    ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-V3.2', 'deepseek-ai/DeepSeek-V3.1-Terminus'],
    ['deepseek-ai/DeepSeek-V3.1-Terminus', 'deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-V3.2'],
  ])('不会在 %j 顺序下丢项或重复基础款', (...inputIds: string[]) => {
    const items = createDeepSeekItems(inputIds)
    const sorted = sortModelsByVersionSemantics(items, (item) => ({
      modelId: item.id,
      baseModelKey: item.baseModelKey,
    }))

    expect(sorted.map((item) => item.id)).toEqual([
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-V3.1-Terminus',
      'deepseek-ai/DeepSeek-V3.2',
    ])
  })

  it('不可比较条目保持原顺序，不参与可比较家族的替换回填', () => {
    const items = [
      { id: 'deepseek-ai/DeepSeek-V3.2', baseModelKey: 'deepseek-v3.2' },
      { id: 'deepseek-ai/DeepSeek-Latest', baseModelKey: 'deepseek-latest' },
      { id: 'deepseek-ai/DeepSeek-V3', baseModelKey: 'deepseek-v3' },
    ] satisfies DeepSeekSortableItem[]

    const sorted = sortModelsByVersionSemantics(items, (item) => ({
      modelId: item.id,
      baseModelKey: item.baseModelKey,
    }))

    expect(sorted.map((item) => item.id)).toEqual([
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-Latest',
      'deepseek-ai/DeepSeek-V3.2',
    ])
  })
})
