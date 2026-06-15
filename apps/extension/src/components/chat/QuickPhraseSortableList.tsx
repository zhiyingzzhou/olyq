/**
 * 说明：`QuickPhraseSortableList` 组件模块。
 *
 * 职责：
 * - 承载快捷短语列表的单栈拖拽排序交互；
 * - 复用助手列表当前的 `dnd-kit` handle-only 拖拽模型；
 * - 向全局管理弹窗和助手常用短语编辑器提供同一份列表视图。
 *
 * 边界：
 * - 本组件只产出新的短语展示顺序，不直接写全局 shared config 或助手 store；
 * - 不保留上移/下移按钮，也不使用原生 HTML draggable fallback。
 */
import { memo, useCallback, useMemo, useState } from 'react';
import { pointerIntersection } from '@dnd-kit/collision';
import {
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import { Edit2, GripVertical, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { SelectionPanelEmpty } from '@/components/chat/SelectionPanelShared';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { moveArrayItem } from '@/components/chat/assistant-browser-sortable';
import { resolveAssistantDropIndex } from '@/components/chat/AssistantBrowserContent.drag-session';
import { ASSISTANT_BROWSER_SORTABLE_SENSORS } from '@/components/chat/AssistantBrowserContent.sortable-plugin';
import { DndKitDragDropProvider, type DndKitDragOverlaySource } from '@/components/chat/dnd-kit-react';
import { cn } from '@/lib/utils';
import type { QuickPhrase } from '@/types/quick-phrase';

const QUICK_PHRASE_SORTABLE_GROUP_ID = 'quick-phrase-list';
const QUICK_PHRASE_SORTABLE_TYPE = 'quick-phrase-sortable';
const QUICK_PHRASE_SORTABLE_MOVE_TRANSITION = {
  duration: 0,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
};

/** 快捷短语拖拽列表属性。 */
export interface QuickPhraseSortableListProps {
  /** 当前展示的短语列表，顺序即 UI 顺序。 */
  readonly phrases: QuickPhrase[];
  /** 当前被编辑的短语 ID。 */
  readonly selectedId?: string | null;
  /** 空列表标题。 */
  readonly emptyTitle: string;
  /** 空列表说明。 */
  readonly emptyDescription?: string;
  /** 用户完成拖拽排序后的新展示顺序。 */
  readonly onReorder: (phrases: QuickPhrase[]) => void;
  /** 开始编辑短语。 */
  readonly onEdit: (phrase: QuickPhrase) => void;
  /** 请求删除短语。 */
  readonly onDelete: (phrase: QuickPhrase) => void;
  /** 操作按钮展示方式。 */
  readonly actionVisibility?: 'hover' | 'always';
}

interface QuickPhraseSortableRowProps {
  readonly phrase: QuickPhrase;
  readonly index: number;
  readonly selected: boolean;
  readonly actionVisibility: 'hover' | 'always';
  readonly dragActive: boolean;
  readonly onEdit: (phrase: QuickPhrase) => void;
  readonly onDelete: (phrase: QuickPhrase) => void;
}

interface QuickPhraseRowCardProps {
  readonly phrase: QuickPhrase;
  readonly selected: boolean;
  readonly dragVisualState?: 'idle' | 'dragSource' | 'overlay';
  readonly actionVisibility?: 'hover' | 'always';
  readonly onEdit?: (phrase: QuickPhrase) => void;
  readonly onDelete?: (phrase: QuickPhrase) => void;
  readonly handleRef?: (element: HTMLElement | null) => void;
}

/** 为快捷短语生成 dnd-kit 内部 sortable id。 */
function createQuickPhraseSortableId(phraseId: string): string {
  return `${QUICK_PHRASE_SORTABLE_GROUP_ID}::${encodeURIComponent(phraseId)}`;
}

/**
 * 快捷短语单行卡片。
 *
 * 说明：
 * - 单行 surface 对齐助手列表与话题列表，不把 handle、正文和操作拆成三块独立胶囊；
 * - 左侧 handle 是唯一拖拽入口，行主体点击只负责进入编辑态；
 * - 编辑和删除继续使用 `TooltipAction`，不回退到原生 title；助手编辑器内可切成常态可见，避免管理入口被隐藏。
 */
const QuickPhraseRowCard = memo(function QuickPhraseRowCard({
  phrase,
  selected,
  dragVisualState = 'idle',
  actionVisibility = 'hover',
  onEdit,
  onDelete,
  handleRef,
}: QuickPhraseRowCardProps) {
  const { t } = useTranslation();
  const overlay = dragVisualState === 'overlay';
  const dragSource = dragVisualState === 'dragSource';
  const interactive = !overlay;
  const surfaceClassName = selected
    ? 'border-primary/50 bg-primary/5'
    : 'border-border/70 bg-card/40 hover:border-primary/40 hover:bg-accent/40';
  const actionContainerClassName = actionVisibility === 'always'
    ? 'flex min-w-[52px] items-center justify-end gap-1 opacity-100'
    : 'pointer-events-none flex min-w-[52px] items-center justify-end gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100';
  const dragHandleClassName = cn(
    'flex h-8 w-8 touch-none items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
    selected ? 'text-primary' : 'text-muted-foreground/70',
  );
  const content = (
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-medium leading-5">{phrase.title}</div>
      <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{phrase.content}</div>
    </div>
  );

  return (
    <div
      data-testid={`quick-phrase-card-${phrase.id}`}
      data-drag-visual-state={dragVisualState}
      className={cn(
        'group flex items-stretch rounded-lg border transition-[transform,border-color,background-color,box-shadow,opacity] duration-200 ease-out',
        surfaceClassName,
        dragSource && 'opacity-0',
        overlay && 'shadow-lg',
      )}
    >
      <div className="flex items-center pl-2">
        {overlay ? (
          <span aria-hidden="true" className={cn('pointer-events-none cursor-default', dragHandleClassName)}>
            <GripVertical className="h-4 w-4" />
          </span>
        ) : (
          <TooltipAction tooltip={t('quickPhrase.dragHandle')}>
            <button
              ref={handleRef}
              type="button"
              aria-label={t('quickPhrase.dragHandle')}
              className={cn('cursor-grab active:cursor-grabbing', dragHandleClassName)}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          </TooltipAction>
        )}
      </div>

      {interactive && onEdit ? (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center px-2 py-2.5 text-left"
          onClick={() => onEdit(phrase)}
        >
          {content}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center px-2 py-2.5 text-left">
          {content}
        </div>
      )}

      {interactive && (onEdit || onDelete) ? (
        <div className="flex items-center gap-1 pr-2">
          <div data-testid={`quick-phrase-actions-${phrase.id}`} className={actionContainerClassName}>
            {onEdit ? (
              <TooltipAction tooltip={t('common.edit')}>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onEdit(phrase);
                  }}
                  aria-label={t('common.edit')}
                >
                  <Edit2 className="h-3 w-3" />
                </button>
              </TooltipAction>
            ) : null}
            {onDelete ? (
              <TooltipAction tooltip={t('common.delete')}>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onDelete(phrase);
                  }}
                  aria-label={t('common.delete')}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </TooltipAction>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
});

/**
 * 绑定 `useSortable` 的快捷短语行。
 *
 * 说明：
 * - 只允许从左侧 handle 发起拖拽；
 * - 行主体仍保留点击编辑；
 * - 排序命中和让位完全交给 dnd-kit sortable；
 * - 源行只在真实拖拽会话中隐藏，drop 收尾阶段必须立即恢复可见，避免 overlay 卸载后短暂空白。
 */
const QuickPhraseSortableRow = memo(function QuickPhraseSortableRow({
  phrase,
  index,
  selected,
  actionVisibility,
  dragActive,
  onEdit,
  onDelete,
}: QuickPhraseSortableRowProps) {
  const {
    handleRef,
    ref,
    sourceRef,
    isDragging,
    isDragSource,
  } = useSortable({
    id: createQuickPhraseSortableId(phrase.id),
    index,
    group: QUICK_PHRASE_SORTABLE_GROUP_ID,
    type: QUICK_PHRASE_SORTABLE_TYPE,
    accept: QUICK_PHRASE_SORTABLE_TYPE,
    sensors: ASSISTANT_BROWSER_SORTABLE_SENSORS,
    collisionDetector: pointerIntersection,
    transition: QUICK_PHRASE_SORTABLE_MOVE_TRANSITION,
  });
  const setRowRef = useCallback((element: HTMLDivElement | null) => {
    ref(element);
    sourceRef(element);
  }, [ref, sourceRef]);
  const isActiveDragSource = dragActive && (isDragSource || isDragging);

  return (
    <div
      ref={setRowRef}
      data-quick-phrase-id={phrase.id}
      data-index={index}
      className="rounded-lg pb-2 last:pb-0"
    >
      <QuickPhraseRowCard
        phrase={phrase}
        selected={selected}
        actionVisibility={actionVisibility}
        dragVisualState={isActiveDragSource ? 'dragSource' : 'idle'}
        onEdit={onEdit}
        onDelete={onDelete}
        handleRef={handleRef as (element: HTMLElement | null) => void}
      />
    </div>
  );
});

/**
 * 快捷短语可排序列表。
 *
 * @param props - 列表数据、空态文案、编辑删除和重排回调。
 * @returns 基于 dnd-kit 的 handle-only 排序列表。
 */
export function QuickPhraseSortableList({
  phrases,
  selectedId,
  emptyTitle,
  emptyDescription,
  onReorder,
  onEdit,
  onDelete,
  actionVisibility = 'hover',
}: QuickPhraseSortableListProps) {
  const [dragActive, setDragActive] = useState(false);
  const phraseBySortableId = useMemo(() => new Map(
    phrases.map((phrase) => [createQuickPhraseSortableId(phrase.id), phrase]),
  ), [phrases]);

  const handleDragStart = useCallback(({ operation }: DragStartEvent) => {
    if (!operation.source || !isSortable(operation.source)) return;
    setDragActive(true);
  }, []);

  const handleDragEnd = useCallback(({ canceled, operation }: DragEndEvent) => {
    setDragActive(false);
    if (canceled || !operation.source || !isSortable(operation.source)) return;

    const sourceSortable = operation.source.sortable;
    const targetSortable = operation.target && isSortable(operation.target)
      ? operation.target.sortable
      : null;
    const currentGroupId = String(sourceSortable.group ?? '');
    const initialGroupId = String(sourceSortable.initialGroup ?? currentGroupId);
    const targetGroupId = String(targetSortable?.group ?? currentGroupId);
    if (
      currentGroupId !== QUICK_PHRASE_SORTABLE_GROUP_ID
      || currentGroupId !== initialGroupId
      || currentGroupId !== targetGroupId
    ) {
      return;
    }

    const toIndex = resolveAssistantDropIndex({
      sourceIndex: sourceSortable.index,
      sourceInitialIndex: sourceSortable.initialIndex,
      targetIndex: targetSortable?.index,
    });
    if (toIndex === null) return;

    const next = moveArrayItem(phrases, sourceSortable.initialIndex, toIndex);
    if (next.map((phrase) => phrase.id).join('\u0000') === phrases.map((phrase) => phrase.id).join('\u0000')) return;
    onReorder(next);
  }, [onReorder, phrases]);

  if (phrases.length < 1) {
    return (
      <SelectionPanelEmpty
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <DndKitDragDropProvider onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div data-testid="quick-phrase-sortable-list">
        {phrases.map((phrase, index) => (
          <QuickPhraseSortableRow
            key={phrase.id}
            phrase={phrase}
            index={index}
            selected={selectedId === phrase.id}
            actionVisibility={actionVisibility}
            dragActive={dragActive}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>

      {dragActive ? (
        <DragOverlay className="pointer-events-none z-50" dropAnimation={null} tag="div">
          {(source: DndKitDragOverlaySource) => {
            if (!source || !isSortable(source)) return null;
            const phrase = phraseBySortableId.get(String(source.id));
            if (!phrase) return null;
            return (
              <QuickPhraseRowCard
                phrase={phrase}
                selected={selectedId === phrase.id}
                dragVisualState="overlay"
              />
            );
          }}
        </DragOverlay>
      ) : null}
    </DndKitDragDropProvider>
  );
}
