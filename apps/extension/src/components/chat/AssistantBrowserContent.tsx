/**
 * 说明：`AssistantBrowserContent` 组件模块。
 *
 * 职责：
 * - 承载 `AssistantBrowserContent` 相关的当前文件实现与模块边界；
 * - 对外暴露 `AssistantBrowserContentProps`、`AssistantBrowserContent` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DragOverlay,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/react';
import { isSortable } from '@dnd-kit/react/sortable';
import { useTranslation } from 'react-i18next';

import type { Assistant } from '@/types/assistant';

import {
  reorderAssistantsWithinGroup,
} from './assistant-browser-sortable';
import {
  createAssistantBrowserDragSessionSnapshot,
  resolveAssistantDropIndex,
  type AssistantBrowserDragSessionSnapshot,
  type AssistantBrowserDragSessionState,
  useAssistantBrowserDragSession,
} from './AssistantBrowserContent.drag-session';
import {
  buildAssistantBrowserRenderModel,
  resolveAssistantBrowserRenderMode,
} from './AssistantBrowserContent.models';
import { AssistantBrowserRowsView } from './AssistantBrowserContent.render';
import { AssistantRowCard } from './AssistantBrowserContent.rows';
import { DndKitDragDropProvider, type DndKitDragOverlaySource } from './dnd-kit-react';
import type { AssistantsTabSortType } from './topic-sidebar/types';

/** 导出类型：`AssistantBrowserContentProps`。 */
export interface AssistantBrowserContentProps {
  assistants: Assistant[];
  activeAssistantId?: string | null;
  emptyLabel?: string;
  sortType: AssistantsTabSortType;
  onReorderAssistants?: (assistantIds: string[]) => void;
  onDelete?: (id: string) => void;
  onEdit?: (assistant: Assistant) => void;
  onSelect: (assistant: Assistant) => void;
}

/**
 * 助手标签页中的助手实例列表主体。
 */
export function AssistantBrowserContent({
  assistants,
  activeAssistantId = null,
  emptyLabel,
  sortType,
  onReorderAssistants,
  onDelete,
  onEdit,
  onSelect,
}: AssistantBrowserContentProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragCleanupFrameRef = useRef<number | null>(null);
  const { state: dragSessionState, setState: setDragSessionState } = useAssistantBrowserDragSession();
  const [collapsedTags, setCollapsedTags] = useState<Record<string, boolean>>({});
  const [dragSessionSnapshot, setDragSessionSnapshot] = useState<AssistantBrowserDragSessionSnapshot | null>(null);
  const [dragCleanupPending, setDragCleanupPending] = useState(false);

  const canReorderAssistants = Boolean(onReorderAssistants) && assistants.length > 1;
  const dragSessionLocked = dragSessionState !== 'idle' || dragCleanupPending;
  const untaggedLabel = t('assistant.untagged');
  const effectiveSortType = dragSessionSnapshot?.sortType ?? sortType;
  const effectiveCollapsedTags = dragSessionSnapshot?.collapsedTags ?? collapsedTags;
  const assistantIds = useMemo(() => assistants.map((assistant) => assistant.id), [assistants]);
  const {
    groupItemsMap,
    rows,
    sortableSnapshotMap,
  } = useMemo(() => buildAssistantBrowserRenderModel({
    assistants,
    sortType: effectiveSortType,
    collapsedTags: effectiveCollapsedTags,
    canReorderAssistants,
    untaggedLabel,
  }), [assistants, canReorderAssistants, effectiveCollapsedTags, effectiveSortType, untaggedLabel]);
  const renderMode = resolveAssistantBrowserRenderMode(rows.length, dragSessionLocked);

  const stopWatchingDragCleanup = useCallback(() => {
    const ownerWindow = scrollRef.current?.ownerDocument?.defaultView ?? window;
    const cancelFrame = typeof ownerWindow.cancelAnimationFrame === 'function'
      ? ownerWindow.cancelAnimationFrame.bind(ownerWindow)
      : ownerWindow.clearTimeout.bind(ownerWindow);
    if (dragCleanupFrameRef.current !== null) {
      cancelFrame(dragCleanupFrameRef.current);
      dragCleanupFrameRef.current = null;
    }
  }, []);

  const watchForDragCleanupCompletion = useCallback(() => {
    stopWatchingDragCleanup();
    setDragCleanupPending(true);

    const ownerDocument = scrollRef.current?.ownerDocument ?? document;
    const ownerWindow = ownerDocument.defaultView ?? window;
    const scheduleFrame = typeof ownerWindow.requestAnimationFrame === 'function'
      ? ownerWindow.requestAnimationFrame.bind(ownerWindow)
      : (callback: FrameRequestCallback) => ownerWindow.setTimeout(callback, 16);
    /**
     * 轮询 dnd-kit 自己的 dragging / dropping 标记，直到上一轮拖拽真正清场。
     *
     * 说明：
     * - 这里只收口“拖拽刚结束但内部状态尚未 idle”的短暂窗口；
     * - 一旦残留标记消失，就立刻解锁下一次拖拽和视图切换。
     */
    const check = () => {
      const dragArtifacts = ownerDocument.querySelector('[data-dnd-dropping], [data-dnd-dragging]');
      if (!dragArtifacts) {
        dragCleanupFrameRef.current = null;
        setDragCleanupPending(false);
        return;
      }

      dragCleanupFrameRef.current = scheduleFrame(check);
    };

    dragCleanupFrameRef.current = scheduleFrame(check);
  }, [stopWatchingDragCleanup]);

  const finishDragSession = useCallback(() => {
    setDragSessionSnapshot(null);
    setDragSessionState('idle');
  }, [setDragSessionState]);

  const startLockedDragSession = useCallback((nextState: Exclude<AssistantBrowserDragSessionState, 'idle'>) => {
    setDragSessionSnapshot((current) => current ?? createAssistantBrowserDragSessionSnapshot(sortType, collapsedTags));
    setDragSessionState(nextState);
  }, [collapsedTags, setDragSessionState, sortType]);

  const handlePrepareDragStart = useCallback(() => {
    if (!canReorderAssistants || dragSessionLocked) return;
    startLockedDragSession('prepare');
  }, [canReorderAssistants, dragSessionLocked, startLockedDragSession]);

  const finishReorder = useCallback(({
    sourceGroupId,
    initialGroupId,
    targetGroupId,
    fromIndex,
    toIndex,
  }: {
    sourceGroupId: string;
    initialGroupId: string;
    targetGroupId: string;
    fromIndex: number;
    toIndex: number;
  }) => {
    if (!onReorderAssistants || !canReorderAssistants) return;

    const nextAssistantIds = reorderAssistantsWithinGroup({
      assistantIds,
      groupAssistantIds: groupItemsMap.get(sourceGroupId) ?? [],
      sourceGroupId,
      initialGroupId,
      targetGroupId,
      fromIndex,
      toIndex,
    });
    if (!nextAssistantIds) return;
    onReorderAssistants(nextAssistantIds);
  }, [assistantIds, canReorderAssistants, groupItemsMap, onReorderAssistants]);
  const handleToggleTag = useCallback((tag: string) => {
    if (dragSessionLocked) return;
    setCollapsedTags((current) => ({ ...current, [tag]: !current[tag] }));
  }, [dragSessionLocked]);

  useEffect(() => {
    if (dragSessionState !== 'prepare') return;

    const ownerDocument = scrollRef.current?.ownerDocument ?? document;
    /**
     * prepare 态还没真正进入 dnd session，这里只兜底“按下后又取消”的场景，
     * 确保指针抬起、取消或窗口失焦时立即回到 idle，避免列表长期停在全量 DOM。
     */
    const clearPreparedSession = () => {
      finishDragSession();
    };

    ownerDocument.addEventListener('pointerup', clearPreparedSession);
    ownerDocument.addEventListener('pointercancel', clearPreparedSession);
    ownerDocument.defaultView?.addEventListener('blur', clearPreparedSession);

    return () => {
      ownerDocument.removeEventListener('pointerup', clearPreparedSession);
      ownerDocument.removeEventListener('pointercancel', clearPreparedSession);
      ownerDocument.defaultView?.removeEventListener('blur', clearPreparedSession);
    };
  }, [dragSessionState, finishDragSession]);

  useEffect(() => () => {
    stopWatchingDragCleanup();
  }, [stopWatchingDragCleanup]);

  const handleDragStart = useCallback(({ operation }: DragStartEvent) => {
    stopWatchingDragCleanup();
    setDragCleanupPending(false);
    if (!operation.source || !isSortable(operation.source)) {
      finishDragSession();
      return;
    }

    startLockedDragSession('active');
  }, [finishDragSession, startLockedDragSession, stopWatchingDragCleanup]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { operation } = event;
    if (!operation.source || !isSortable(operation.source)) {
      return;
    }

    const sourceSortable = operation.source.sortable;
    const initialGroupId = String(sourceSortable.initialGroup ?? sourceSortable.group ?? '');
    const targetSortable = operation.target && isSortable(operation.target)
      ? operation.target.sortable
      : null;
    const targetGroupId = String(targetSortable?.group ?? '');

    if (
      effectiveSortType === 'tags'
      && initialGroupId
      && targetGroupId
      && initialGroupId !== targetGroupId
    ) {
      /**
       * tags 视图的拖拽边界只允许停留在同组内。
       *
       * 说明：
       * - 组内 DOM 让位完全交给 `dnd-kit` 默认 sortable plugin；
       * - 当前这里只拒绝跨组移动，不会放开“跨标签组迁移”的产品语义。
       */
      event.preventDefault();
      return;
    }
  }, [effectiveSortType]);
  const dragOverHandler = effectiveSortType === 'tags'
    ? handleDragOver
    : undefined;

  const handleDragEnd = useCallback(({ canceled, operation }: DragEndEvent) => {
    finishDragSession();
    watchForDragCleanupCompletion();
    if (canceled || !operation.source || !isSortable(operation.source)) {
      return;
    }

    const sourceSortableResolved = operation.source.sortable;
    const targetSortableResolved = operation.target && isSortable(operation.target)
      ? operation.target.sortable
      : null;
    const currentGroupId = String(sourceSortableResolved.group ?? '');
    const initialGroupId = String(sourceSortableResolved.initialGroup ?? currentGroupId);
    const targetGroupId = String(targetSortableResolved?.group ?? currentGroupId);

    if (!currentGroupId || currentGroupId !== initialGroupId || currentGroupId !== targetGroupId) {
      return;
    }

    const toIndex = resolveAssistantDropIndex({
      sourceIndex: sourceSortableResolved.index,
      sourceInitialIndex: sourceSortableResolved.initialIndex,
      targetIndex: targetSortableResolved?.index,
    });
    if (toIndex === null) return;

    finishReorder({
      sourceGroupId: currentGroupId,
      initialGroupId,
      targetGroupId,
      fromIndex: sourceSortableResolved.initialIndex,
      toIndex,
    });
  }, [finishDragSession, finishReorder, watchForDragCleanupCompletion]);

  if (assistants.length < 1) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-border/70 px-4 text-center text-sm text-muted-foreground">
        {emptyLabel || t('assistant.noResults')}
      </div>
    );
  }

  return (
    <DndKitDragDropProvider onDragStart={handleDragStart} onDragOver={dragOverHandler} onDragEnd={handleDragEnd}>
      <div className="flex h-full min-h-0 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
          <AssistantBrowserRowsView
            mode={renderMode}
            rows={rows}
            activeAssistantId={activeAssistantId}
            collapsedTags={effectiveCollapsedTags}
            dragSessionLocked={dragSessionLocked}
            scrollRef={scrollRef}
            onToggleTag={handleToggleTag}
            onPrepareDragStart={handlePrepareDragStart}
            onDelete={onDelete}
            onEdit={onEdit}
            onSelect={onSelect}
          />
        </div>
      </div>

      {dragSessionState === 'active' ? (
        <DragOverlay className="pointer-events-none z-50" dropAnimation={null} tag="div">
          {(source: DndKitDragOverlaySource) => {
            if (!source || !isSortable(source)) return null;

            const snapshot = sortableSnapshotMap.get(String(source.id));
            if (!snapshot) return null;

            return (
              <AssistantRowCard
                assistant={snapshot.assistant}
                active={snapshot.assistant.id === activeAssistantId}
                canDrag={false}
                dragVisualState="overlay"
                testId={`assistant-overlay-${snapshot.assistant.id}`}
              />
            );
          }}
        </DragOverlay>
      ) : null}
    </DndKitDragDropProvider>
  );
}
