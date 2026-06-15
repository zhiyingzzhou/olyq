/**
 * 说明：`AssistantBrowserContent.drag-session` 组件模块。
 *
 * 职责：
 * - 承载助手侧栏拖拽会话锁与最终落位索引解析；
 * - 让 `AssistantBrowserContent` 主文件只保留事件编排，不扩散上下文细节。
 *
 * 边界：
 * - 这里只处理拖拽会话快照与排序索引决策；
 * - 组内即时 DOM 让位已经完全交给 dnd-kit sortable 默认插件；
 * - 不负责行模型生成、DOM 渲染或 store 写入。
 */
import { createContext, useContext } from 'react';

import type { AssistantsTabSortType } from './topic-sidebar/types';

/** 助手拖拽会话阶段。 */
export type AssistantBrowserDragSessionState = 'idle' | 'prepare' | 'active';

/** 助手拖拽会话期间冻结的视图快照。 */
export interface AssistantBrowserDragSessionSnapshot {
  readonly sortType: AssistantsTabSortType;
  readonly collapsedTags: Record<string, boolean>;
}

/** 助手拖拽会话上下文。 */
export interface AssistantBrowserDragSessionContextValue {
  readonly state: AssistantBrowserDragSessionState;
  readonly active: boolean;
  readonly locked: boolean;
  readonly setState: (state: AssistantBrowserDragSessionState) => void;
}

const DEFAULT_ASSISTANT_BROWSER_DRAG_SESSION_CONTEXT: AssistantBrowserDragSessionContextValue = {
  state: 'idle',
  active: false,
  locked: false,
  setState: () => undefined,
};

/** 助手拖拽会话上下文。 */
export const AssistantBrowserDragSessionContext = createContext<AssistantBrowserDragSessionContextValue>(
  DEFAULT_ASSISTANT_BROWSER_DRAG_SESSION_CONTEXT,
);

/** 读取当前助手拖拽会话上下文。 */
export function useAssistantBrowserDragSession() {
  return useContext(AssistantBrowserDragSessionContext);
}

/** 创建当前拖拽会话需要冻结的视图快照。 */
export function createAssistantBrowserDragSessionSnapshot(
  sortType: AssistantsTabSortType,
  collapsedTags: Readonly<Record<string, boolean>>,
): AssistantBrowserDragSessionSnapshot {
  return {
    sortType,
    collapsedTags: { ...collapsedTags },
  };
}

/**
 * 归一化拖拽结束时读到的目标索引。
 *
 * 说明：
 * - sortable index 只接受非负整数；
 * - 其它值统一视为“当前没有有效索引”。
 */
function normalizeDropIndex(index: number | null | undefined) {
  return Number.isInteger(index) && (index as number) >= 0
    ? index as number
    : null;
}

/**
 * 解析 drag end 时最终应该写回 store 的目标索引。
 *
 * 说明：
 * - 优先相信 `source.sortable.index`，因为拖拽会话已切到全量真实 DOM，由 sortable 自己管理让位；
 * - 如果 `source.index` 仍停留在起点，再回退到 `target.index`；
 * - 两者都无法表达有效重排时，返回 `null`，表示无需写入。
 */
export function resolveAssistantDropIndex({
  sourceIndex,
  sourceInitialIndex,
  targetIndex,
}: {
  sourceIndex: number;
  sourceInitialIndex: number;
  targetIndex?: number | null;
}) {
  const resolvedSourceIndex = normalizeDropIndex(sourceIndex);
  if (resolvedSourceIndex !== null && resolvedSourceIndex !== sourceInitialIndex) {
    return resolvedSourceIndex;
  }

  const resolvedTargetIndex = normalizeDropIndex(targetIndex);
  if (resolvedTargetIndex !== null && resolvedTargetIndex !== sourceInitialIndex) {
    return resolvedTargetIndex;
  }

  return null;
}
