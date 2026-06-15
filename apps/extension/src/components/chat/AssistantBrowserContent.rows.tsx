/**
 * 说明：`AssistantBrowserContent.rows` 组件模块。
 *
 * 职责：
 * - 承载助手侧栏单行卡片与 sortable 行装配；
 * - 让 `AssistantBrowserContent` 主文件专注在数据模型、虚拟窗口和拖拽编排；
 * - 保持拖拽 handle 和行内操作的 DOM 契约不变。
 *
 * 边界：
 * - 这里只处理单行渲染与 `useSortable` 接线；
 * - 不拥有助手列表排序真源，也不处理窗口化或跨行命中策略。
 */
import { memo, useCallback } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { pointerIntersection } from '@dnd-kit/collision';
import { useSortable } from '@dnd-kit/react/sortable';
import { Edit2, GripVertical, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { Assistant } from '@/types/assistant';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { createAssistantSortableInstanceId } from './assistant-browser-sortable';
import { AssistantIcon } from './AssistantIcon';
import {
  ASSISTANT_BROWSER_SORTABLE_SENSORS,
} from './AssistantBrowserContent.sortable-plugin';

const ASSISTANT_SORTABLE_TYPE = 'assistant-sortable';
const ASSISTANT_SORTABLE_MOVE_TRANSITION = {
  duration: 0,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
};

interface AssistantRowCardProps {
  assistant: Assistant;
  active: boolean;
  canDrag: boolean;
  dragVisualState?: 'idle' | 'dragSource' | 'overlay';
  onDelete?: (id: string) => void;
  onEdit?: (assistant: Assistant) => void;
  onSelect?: (assistant: Assistant) => void;
  handleRef?: (element: HTMLElement | null) => void;
  onPrepareDragStart?: () => void;
  testId?: string;
}

/**
 * 助手行卡片视图。
 *
 * 说明：
 * - 视图层只负责布局和交互热点拆分；
 * - 拖拽状态与排序逻辑由上层 `useSortable`/`DragDropProvider` 管理。
 */
export const AssistantRowCard = memo(function AssistantRowCard({
  assistant,
  active,
  canDrag,
  dragVisualState = 'idle',
  onDelete,
  onEdit,
  onSelect,
  handleRef,
  onPrepareDragStart,
  testId,
}: AssistantRowCardProps) {
  const { t } = useTranslation();
  const overlay = dragVisualState === 'overlay';
  const dragSource = dragVisualState === 'dragSource';
  const interactive = !overlay;
  const description = assistant.description || `${assistant.topics.length} ${t('topic.tab')}`;
  const surfaceClassName = active
    ? 'border-primary/50 bg-primary/5'
    : 'border-border/70 bg-card/40 hover:border-primary/40 hover:bg-accent/40';
  const dragSourceClassName = dragSource ? 'opacity-0' : '';
  const iconClassName = 'bg-muted text-base';
  const titleClassName = 'truncate text-sm font-medium';
  const descriptionClassName = 'truncate text-xs text-muted-foreground';
  const currentBadgeClassName = 'inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full bg-primary/10 px-1.5 text-[10px] font-medium leading-none text-primary';
  const dragHandleClassName = 'flex h-8 w-8 touch-none cursor-grab items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';
  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const pointerButton = typeof event.button === 'number' ? event.button : 0;
    if (pointerButton !== 0 && event.pointerType !== 'touch') return;
    onPrepareDragStart?.();
  }, [onPrepareDragStart]);

  return (
    <div
      data-testid={testId}
      data-drag-visual-state={dragVisualState}
      className={`group flex items-stretch rounded-xl border transition-[transform,border-color,background-color,box-shadow,opacity] duration-200 ease-out ${surfaceClassName} ${dragSourceClassName}`}
    >
      <button
        type="button"
        onClick={interactive && onSelect ? () => onSelect(assistant) : undefined}
        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
      >
        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-[background-color,color,box-shadow] ${iconClassName}`}>
          <AssistantIcon iconId={assistant.iconId} size={16} iconClassName="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={titleClassName}>{assistant.name}</span>
            {active ? <span className={currentBadgeClassName}>{t('common.current')}</span> : null}
          </div>
          <div className={descriptionClassName}>{description}</div>
        </div>
      </button>

      <div className="flex items-center gap-1 pr-2">
        {interactive && (onEdit || onDelete) ? (
          <div className="pointer-events-none flex min-w-[52px] items-center justify-end gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
            {onEdit ? (
              <TooltipAction tooltip={t('common.edit')}>
                <button
                  type="button"
                  aria-label={t('common.edit')}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onEdit(assistant);
                  }}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Edit2 className="h-3 w-3" />
                </button>
              </TooltipAction>
            ) : null}
            {onDelete ? (
              <TooltipAction tooltip={t('common.delete')}>
                <button
                  type="button"
                  aria-label={t('common.delete')}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onDelete(assistant.id);
                  }}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </TooltipAction>
            ) : null}
          </div>
        ) : null}

        {overlay ? (
          <span aria-hidden="true" data-testid={`assistant-overlay-handle-${assistant.id}`} className={`pointer-events-none ${dragHandleClassName}`}>
            <GripVertical className="h-4 w-4 flex-shrink-0" />
          </span>
        ) : canDrag ? (
          <TooltipAction tooltip={t('assistant.dragHandle')}>
            <button
              ref={handleRef}
              type="button"
              aria-label={t('assistant.dragHandle')}
              data-testid={`assistant-drag-handle-${assistant.id}`}
              onPointerDown={handlePointerDown}
              className={dragHandleClassName}
            >
              <GripVertical className="h-4 w-4 flex-shrink-0" />
            </button>
          </TooltipAction>
        ) : null}
      </div>
    </div>
  );
});

interface SortableAssistantRowProps {
  assistant: Assistant;
  active: boolean;
  canDrag: boolean;
  groupId: string;
  index: number;
  rowIndex: number;
  rowStyle?: CSSProperties;
  onPrepareDragStart: () => void;
  onDelete?: (id: string) => void;
  onEdit?: (assistant: Assistant) => void;
  onSelect: (assistant: Assistant) => void;
}

/**
 * 绑定 `useSortable` 的助手行。
 *
 * 说明：
 * - 只允许从 handle 发起拖拽；
 * - 行主体仍保持“点击即选择助手”的原有语义；
 * - 不再在这里并行维护任何原生 drag fallback。
 */
export const SortableAssistantRow = memo(function SortableAssistantRow({
  assistant,
  active,
  canDrag,
  groupId,
  index,
  rowIndex,
  rowStyle,
  onPrepareDragStart,
  onDelete,
  onEdit,
  onSelect,
}: SortableAssistantRowProps) {
  const {
    handleRef,
    ref,
    sourceRef,
    isDragging,
    isDropping,
    isDragSource,
    isDropTarget,
  } = useSortable({
    id: createAssistantSortableInstanceId(groupId, assistant.id),
    index,
    group: groupId,
    type: ASSISTANT_SORTABLE_TYPE,
    accept: ASSISTANT_SORTABLE_TYPE,
    disabled: !canDrag,
    /**
     * 助手拖拽这轮彻底切成 `dnd-kit@0.4.0` 的单实体排序。
     *
     * 原因：
     * - 可见拖拽实体只允许保留 `DragOverlay` 这一份，避免 `Feedback` 与 overlay 叠层造成真实浏览器里的重影和串层；
     * - 组内命中完全交给 sortable 默认几何，不再叠加第二套 DOM hit-test 补偿；
     * - prepare 态只负责把列表切成全量真实 DOM，行本身不再改写 target 或命中结果。
     */
    sensors: ASSISTANT_BROWSER_SORTABLE_SENSORS,
    collisionDetector: pointerIntersection,
    transition: ASSISTANT_SORTABLE_MOVE_TRANSITION,
  });
  const setRowRef = useCallback((element: HTMLDivElement | null) => {
    ref(element);
    sourceRef(element);
  }, [ref, sourceRef]);

  return (
    <div
      ref={setRowRef}
      data-index={rowIndex}
      data-testid={`assistant-row-${assistant.id}`}
      data-assistant-id={assistant.id}
      data-group-id={groupId}
      data-drop-target-state={isDropTarget && !isDragSource ? 'active' : 'idle'}
      className="rounded-xl pb-2"
      style={rowStyle}
    >
      <AssistantRowCard
        assistant={assistant}
        active={active}
        canDrag={canDrag}
        dragVisualState={isDragSource || isDragging || isDropping ? 'dragSource' : 'idle'}
        onDelete={onDelete}
        onEdit={onEdit}
        onSelect={onSelect}
        handleRef={handleRef as (element: HTMLElement | null) => void}
        onPrepareDragStart={onPrepareDragStart}
        testId={`assistant-card-${assistant.id}`}
      />
    </div>
  );
});
