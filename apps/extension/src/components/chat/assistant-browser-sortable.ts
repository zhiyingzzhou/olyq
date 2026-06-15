/**
 * 说明：`assistant-browser-sortable` 组件模块。
 *
 * 职责：
 * - 承载助手列表拖拽所需的纯函数、辅助类型与分组投影逻辑；
 * - 对外暴露 sortable group / instance id、组内重排映射等公开能力，供助手标签页与测试复用；
 *
 * 边界：
 * - 本文件只处理助手列表拖拽的数据投影与顺序计算，不直接承载 React 渲染或 store 写入副作用。
 */
import type { Assistant } from '@/types/assistant';

/** 助手列表模式下的固定分组 ID。 */
export const ASSISTANT_LIST_GROUP_ID = 'assistant-list';

/** 助手标签页里单个可渲染分组的结构。 */
export interface AssistantRenderGroup {
  /** 当前分组的稳定 ID，用于拖拽分组边界判断。 */
  readonly groupId: string;
  /** 当前分组的展示标签。 */
  readonly tag: string;
  /** 当前分组里的助手实例，顺序与全局助手顺序保持一致。 */
  readonly items: Assistant[];
}

/**
 * 为标签分组生成稳定的拖拽 group ID。
 *
 * 说明：
 * - 标签文案允许重复出现特殊字符，因此这里不直接把原始标签串联到 sortable id；
 * - 使用 URL 编码后，可避免 `::` 等分隔符与业务文案互相污染。
 */
export function createAssistantGroupId(tag: string): string {
  const normalizedTag = String(tag || '').trim();
  return normalizedTag
    ? `assistant-tag:${encodeURIComponent(normalizedTag)}`
    : ASSISTANT_LIST_GROUP_ID;
}

/**
 * 为单个“助手渲染实例”生成稳定 sortable id。
 *
 * 说明：
 * - 标签模式下同一助手可能在多个分组里重复渲染，因此 sortable id 必须带 group 维度；
 * - 这里仍只把 assistantId 当作持久化真源，instance id 仅用于渲染层拖拽。
 */
export function createAssistantSortableInstanceId(groupId: string, assistantId: string): string {
  const normalizedGroupId = String(groupId || '').trim() || ASSISTANT_LIST_GROUP_ID;
  const normalizedAssistantId = String(assistantId || '').trim();
  return `${encodeURIComponent(normalizedGroupId)}::${encodeURIComponent(normalizedAssistantId)}`;
}

/**
 * 按标签把助手列表投影成可渲染分组。
 *
 * 说明：
 * - 保持当前产品语义：一个助手带多个标签时，会在多个标签分组中重复出现；
 * - 每个分组里的助手顺序始终跟随全局助手顺序，避免分组视图和真源顺序脱节。
 */
export function buildAssistantRenderGroups(
  assistants: readonly Assistant[],
  untaggedLabel: string,
): AssistantRenderGroup[] {
  const groups = new Map<string, Assistant[]>();
  const tagOrder: string[] = [];
  let hasUntagged = false;

  for (const assistant of assistants) {
    const tags = assistant.tags && assistant.tags.length > 0 ? assistant.tags : [untaggedLabel];
    if (tags.includes(untaggedLabel)) hasUntagged = true;

    for (const tag of tags) {
      if (!groups.has(tag)) {
        groups.set(tag, []);
        if (tag !== untaggedLabel) tagOrder.push(tag);
      }
      groups.get(tag)?.push(assistant);
    }
  }

  const orderedTags = hasUntagged ? [untaggedLabel, ...tagOrder] : tagOrder;
  return orderedTags
    .map((tag) => ({
      groupId: createAssistantGroupId(tag),
      tag,
      items: groups.get(tag) ?? [],
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * 按索引移动数组中的单个元素。
 *
 * 说明：
 * - 这是拖拽结束后的纯函数重排步骤；
 * - 若索引越界或目标位置不变，则原样返回浅拷贝，避免调用方额外防御。
 */
export function moveArrayItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  const sourceIndex = Number.isFinite(fromIndex) ? Math.trunc(fromIndex) : -1;
  const targetIndex = Number.isFinite(toIndex) ? Math.trunc(toIndex) : -1;
  const next = [...items];
  if (
    sourceIndex < 0
    || targetIndex < 0
    || sourceIndex >= next.length
    || targetIndex >= next.length
    || sourceIndex === targetIndex
  ) {
    return next;
  }

  const [moved] = next.splice(sourceIndex, 1);
  if (moved === undefined) return next;
  next.splice(targetIndex, 0, moved);
  return next;
}

/**
 * 将某个分组内的助手新顺序映射回全局助手顺序。
 *
 * 说明：
 * - 只重排出现在 `orderedAssistantIds` 里的子集；
 * - 未出现在该子集里的助手保持原位，确保底层仍只有一份全局顺序真源。
 */
export function applyAssistantSubsetOrder(
  assistantIds: readonly string[],
  orderedAssistantIds: readonly string[],
): string[] {
  const normalizedOrderedIds = orderedAssistantIds.map((item) => String(item || '').trim()).filter(Boolean);
  const idSet = new Set(normalizedOrderedIds);
  if (normalizedOrderedIds.length < 1) return [...assistantIds];

  let cursor = 0;
  return assistantIds.map((assistantId) => {
    if (!idSet.has(assistantId)) return assistantId;
    const replacement = normalizedOrderedIds[cursor] ?? assistantId;
    cursor += 1;
    return replacement;
  });
}

/** 助手列表拖拽落库所需的纯函数输入。 */
export interface AssistantGroupReorderInput {
  /** 当前全局助手顺序真源。 */
  readonly assistantIds: readonly string[];
  /** 当前拖拽分组对应的助手子集顺序。 */
  readonly groupAssistantIds: readonly string[];
  /** 拖拽结束时 source 所在分组。 */
  readonly sourceGroupId: string;
  /** 拖拽开始时 source 所在分组。 */
  readonly initialGroupId: string;
  /** 拖拽结束时 target 所在分组。 */
  readonly targetGroupId: string;
  /** 拖拽开始时 source 在组内的索引。 */
  readonly fromIndex: number;
  /** 拖拽结束时 source 在组内的新索引。 */
  readonly toIndex: number;
}

/**
 * 根据 sortable operation 结果计算新的全局助手顺序。
 *
 * 说明：
 * - 只接受“同组内”的排序提交，跨组拖拽直接返回 `null`；
 * - 组内排序只改动该组子集，其他助手保持原位；
 * - 返回 `null` 表示无需写入 store。
 */
export function reorderAssistantsWithinGroup({
  assistantIds,
  groupAssistantIds,
  sourceGroupId,
  initialGroupId,
  targetGroupId,
  fromIndex,
  toIndex,
}: AssistantGroupReorderInput): string[] | null {
  const currentGroupId = String(sourceGroupId || '').trim()
  const startGroupId = String(initialGroupId || '').trim()
  const dropGroupId = String(targetGroupId || '').trim()

  if (!currentGroupId || currentGroupId !== startGroupId || currentGroupId !== dropGroupId) {
    return null
  }

  if (groupAssistantIds.length < 2) return null

  const nextGroupAssistantIds = moveArrayItem(groupAssistantIds, fromIndex, toIndex)
  const currentSerialized = groupAssistantIds.join('\u0000')
  const nextSerialized = nextGroupAssistantIds.join('\u0000')
  if (!nextSerialized || nextSerialized === currentSerialized) return null

  const nextAssistantIds = applyAssistantSubsetOrder(assistantIds, nextGroupAssistantIds)
  return nextAssistantIds.join('\u0000') === assistantIds.join('\u0000')
    ? null
    : nextAssistantIds
}
