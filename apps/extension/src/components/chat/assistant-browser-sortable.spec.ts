/**
 * 说明：`assistant-browser-sortable.spec` 组件模块。
 *
 * 职责：
 * - 覆盖助手列表拖拽纯函数的分组投影、实例 ID 唯一性与组内重排映射；
 * - 为 tag 模式的重复渲染、跨组拒绝等关键约束提供回归保护。
 *
 * 边界：
 * - 本文件只做纯函数测试，不承担 React 组件渲染与浏览器事件模拟。
 */
import { describe, expect, it } from 'vitest'

import type { Assistant } from '@/types/assistant'

import {
  ASSISTANT_LIST_GROUP_ID,
  applyAssistantSubsetOrder,
  buildAssistantRenderGroups,
  createAssistantSortableInstanceId,
  moveArrayItem,
  reorderAssistantsWithinGroup,
} from './assistant-browser-sortable'

/**
 * 测试辅助函数：`makeAssistant`。
 *
 * @remarks
 * 用于快速构造满足最小类型约束的助手实体，供当前纯函数测试复用。
 */
function makeAssistant(
  id: string,
  options?: {
    tags?: string[]
  },
): Assistant {
  const now = 1_730_000_000_000

  return {
    id,
    scenario: 'general',
    name: id,
    description: `${id}-description`,
    prompt: `${id}-prompt`,
    tags: options?.tags,
    topics: [],
    order: now,
    createdAt: now,
    updatedAt: now,
  }
}

describe('assistant-browser-sortable', () => {
  it('buildAssistantRenderGroups 会保留标签模式下的多实例渲染，并让 sortable instance id 保持唯一', () => {
    const assistants = [
      makeAssistant('assistant-1', { tags: ['写作', '效率'] }),
      makeAssistant('assistant-2', { tags: ['效率'] }),
      makeAssistant('assistant-3'),
    ]

    const groups = buildAssistantRenderGroups(assistants, '未分组')

    expect(groups.map((group) => group.tag)).toEqual(['未分组', '写作', '效率'])
    expect(groups[0]?.groupId).not.toBe(ASSISTANT_LIST_GROUP_ID)
    expect(groups[0]?.items.map((assistant) => assistant.id)).toEqual(['assistant-3'])
    expect(groups[1]?.items.map((assistant) => assistant.id)).toEqual(['assistant-1'])
    expect(groups[2]?.items.map((assistant) => assistant.id)).toEqual(['assistant-1', 'assistant-2'])

    const instanceIds = groups.flatMap((group) => (
      group.items.map((assistant) => createAssistantSortableInstanceId(group.groupId, assistant.id))
    ))
    expect(new Set(instanceIds).size).toBe(instanceIds.length)
  })

  it('moveArrayItem 和 applyAssistantSubsetOrder 会把组内顺序稳定映射回全局顺序', () => {
    expect(moveArrayItem(['assistant-1', 'assistant-2', 'assistant-3'], 2, 0)).toEqual([
      'assistant-3',
      'assistant-1',
      'assistant-2',
    ])

    expect(applyAssistantSubsetOrder(
      ['assistant-1', 'assistant-2', 'assistant-3', 'assistant-4'],
      ['assistant-4', 'assistant-1', 'assistant-3'],
    )).toEqual(['assistant-4', 'assistant-2', 'assistant-1', 'assistant-3'])
  })

  it('reorderAssistantsWithinGroup 只允许组内重排，跨组拖动直接返回 null', () => {
    expect(reorderAssistantsWithinGroup({
      assistantIds: ['assistant-1', 'assistant-2', 'assistant-3', 'assistant-4'],
      groupAssistantIds: ['assistant-1', 'assistant-3', 'assistant-4'],
      sourceGroupId: 'assistant-tag:%E6%95%88%E7%8E%87',
      initialGroupId: 'assistant-tag:%E6%95%88%E7%8E%87',
      targetGroupId: 'assistant-tag:%E6%95%88%E7%8E%87',
      fromIndex: 2,
      toIndex: 0,
    })).toEqual(['assistant-4', 'assistant-2', 'assistant-1', 'assistant-3'])

    expect(reorderAssistantsWithinGroup({
      assistantIds: ['assistant-1', 'assistant-2', 'assistant-3'],
      groupAssistantIds: ['assistant-1', 'assistant-2'],
      sourceGroupId: 'assistant-tag:%E5%86%99%E4%BD%9C',
      initialGroupId: 'assistant-tag:%E5%86%99%E4%BD%9C',
      targetGroupId: 'assistant-tag:%E5%BC%80%E5%8F%91',
      fromIndex: 0,
      toIndex: 1,
    })).toBeNull()
  })
})
