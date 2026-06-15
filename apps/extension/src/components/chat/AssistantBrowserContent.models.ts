/**
 * 说明：`AssistantBrowserContent.models` 组件模块。
 *
 * 职责：
 * - 承载助手侧栏的 canonical row model、渲染模式阈值与排序快照；
 * - 让主组件只做编排，不再混入分组投影与列表拼装细节。
 *
 * 边界：
 * - 这里只处理纯数据模型；
 * - 不直接操作 React hooks、DOM 或拖拽事件。
 */
import type { Assistant } from '@/types/assistant';

import {
  ASSISTANT_LIST_GROUP_ID,
  type AssistantRenderGroup,
  buildAssistantRenderGroups,
  createAssistantSortableInstanceId,
} from './assistant-browser-sortable';
import type { AssistantsTabSortType } from './topic-sidebar/types';

/** 常态静态渲染与虚拟化切换阈值。 */
export const ASSISTANT_BROWSER_STATIC_ROW_LIMIT = 80;
/** 标签头行估算高度。 */
export const ASSISTANT_BROWSER_TAG_HEADER_HEIGHT = 44;
/** 助手行估算高度。 */
export const ASSISTANT_BROWSER_ROW_HEIGHT = 62;

/** 助手拖拽 overlay 所需的轻量快照。 */
export interface AssistantSortableItemSnapshot {
  readonly instanceId: string;
  readonly groupId: string;
  readonly assistant: Assistant;
}

/** 助手侧栏渲染模式。 */
export type AssistantBrowserRenderMode = 'static' | 'virtualized';

/** 助手侧栏 canonical row model。 */
export type AssistantBrowserRow =
  | {
      readonly kind: 'tag-header';
      readonly key: string;
      readonly groupId: string;
      readonly tag: string;
      readonly count: number;
    }
  | {
      readonly kind: 'assistant';
      readonly key: string;
      readonly groupId: string;
      readonly assistant: Assistant;
      readonly index: number;
      readonly canDrag: boolean;
    };

/** 助手侧栏渲染模型聚合结果。 */
export interface AssistantBrowserRenderModel {
  readonly rows: readonly AssistantBrowserRow[];
  readonly groupItemsMap: ReadonlyMap<string, string[]>;
  readonly sortableSnapshotMap: ReadonlyMap<string, AssistantSortableItemSnapshot>;
}

interface BuildAssistantBrowserRenderModelInput {
  readonly assistants: readonly Assistant[];
  readonly sortType: AssistantsTabSortType;
  readonly collapsedTags: Readonly<Record<string, boolean>>;
  readonly canReorderAssistants: boolean;
  readonly untaggedLabel: string;
}

/**
 * 按当前排序模式生成助手侧栏可渲染分组。
 *
 * 说明：
 * - `list` 模式永远只产出一个固定分组；
 * - `tags` 模式沿用标签投影，把同一助手按标签重复映射到多个分组。
 */
function buildAssistantRenderGroupsForSortType({
  assistants,
  sortType,
  untaggedLabel,
}: {
  assistants: readonly Assistant[];
  sortType: AssistantsTabSortType;
  untaggedLabel: string;
}) {
  if (sortType === 'tags') {
    return buildAssistantRenderGroups(assistants, untaggedLabel);
  }

  return [{
    groupId: ASSISTANT_LIST_GROUP_ID,
    tag: ASSISTANT_LIST_GROUP_ID,
    items: [...assistants],
  }];
}

/**
 * 把 render groups 展开成当前唯一的 canonical row model。
 *
 * 说明：
 * - `tags` 模式会显式插入 tag header 行；
 * - 行内 `index` 始终是各自分组内的 sortable 索引，不和整表行号混用。
 */
function buildAssistantBrowserRows({
  renderGroups,
  sortType,
  collapsedTags,
  canReorderAssistants,
}: {
  renderGroups: readonly AssistantRenderGroup[];
  sortType: AssistantsTabSortType;
  collapsedTags: Readonly<Record<string, boolean>>;
  canReorderAssistants: boolean;
}): AssistantBrowserRow[] {
  if (sortType === 'tags') {
    return renderGroups.flatMap((group) => {
      const collapsed = Boolean(collapsedTags[group.tag]);
      const groupRows: AssistantBrowserRow[] = [{
        kind: 'tag-header',
        key: `assistant-tag-${group.groupId}`,
        groupId: group.groupId,
        tag: group.tag,
        count: group.items.length,
      }];

      if (collapsed) return groupRows;

      groupRows.push(...group.items.map((assistant, index) => ({
        kind: 'assistant' as const,
        key: createAssistantSortableInstanceId(group.groupId, assistant.id),
        groupId: group.groupId,
        assistant,
        index,
        canDrag: canReorderAssistants && group.items.length > 1,
      })));
      return groupRows;
    });
  }

  return renderGroups[0]?.items.map((assistant, index) => ({
    kind: 'assistant' as const,
    key: createAssistantSortableInstanceId(ASSISTANT_LIST_GROUP_ID, assistant.id),
    groupId: ASSISTANT_LIST_GROUP_ID,
    assistant,
    index,
    canDrag: canReorderAssistants,
  })) ?? [];
}

/**
 * 构建 overlay 和拖拽事件需要使用的助手实例快照表。
 *
 * 说明：
 * - key 使用带 group 维度的 sortable instance id；
 * - value 只保留 overlay 渲染和分组判断所需的最小数据。
 */
function buildAssistantSortableSnapshotMap(renderGroups: readonly AssistantRenderGroup[]) {
  const entries = renderGroups.flatMap((group) => group.items.map((assistant) => {
    const instanceId = createAssistantSortableInstanceId(group.groupId, assistant.id);
    return [instanceId, {
      instanceId,
      groupId: group.groupId,
      assistant,
    }] as const;
  }));
  return new Map<string, AssistantSortableItemSnapshot>(entries);
}

/**
 * 构建“分组映射到当前助手子集顺序”的映射表。
 *
 * 说明：
 * - 真正落库时仍只写全局 `assistantIds`；
 * - 这里的子集顺序只用于把组内拖拽结果映射回全局顺序。
 */
function buildAssistantGroupItemsMap(renderGroups: readonly AssistantRenderGroup[]) {
  return new Map(
    renderGroups.map((group) => [group.groupId, group.items.map((assistant) => assistant.id)] as const),
  );
}

/** 构建助手侧栏当前唯一 canonical render model。 */
export function buildAssistantBrowserRenderModel({
  assistants,
  sortType,
  collapsedTags,
  canReorderAssistants,
  untaggedLabel,
}: BuildAssistantBrowserRenderModelInput): AssistantBrowserRenderModel {
  const renderGroups = buildAssistantRenderGroupsForSortType({
    assistants,
    sortType,
    untaggedLabel,
  });

  return {
    rows: buildAssistantBrowserRows({
      renderGroups,
      sortType,
      collapsedTags,
      canReorderAssistants,
    }),
    groupItemsMap: buildAssistantGroupItemsMap(renderGroups),
    sortableSnapshotMap: buildAssistantSortableSnapshotMap(renderGroups),
  };
}

/** 根据当前行数与拖拽会话状态解析渲染策略。 */
export function resolveAssistantBrowserRenderMode(rowCount: number, dragSessionActive: boolean): AssistantBrowserRenderMode {
  return !dragSessionActive && rowCount > ASSISTANT_BROWSER_STATIC_ROW_LIMIT
    ? 'virtualized'
    : 'static';
}
