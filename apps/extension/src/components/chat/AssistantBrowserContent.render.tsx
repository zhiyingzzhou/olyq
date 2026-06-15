/**
 * 说明：`AssistantBrowserContent.render` 组件模块。
 *
 * 职责：
 * - 承载助手侧栏按渲染策略输出静态列表或虚拟列表的视图层；
 * - 保证“常态按规模渲染，拖拽会话切全量真实 DOM”的语义统一落地。
 *
 * 边界：
 * - 这里只负责 DOM 输出；
 * - 不拥有拖拽事件、store 写入或全局顺序真源。
 */
import type { CSSProperties, RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown } from 'lucide-react';

import type { Assistant } from '@/types/assistant';

import {
  ASSISTANT_BROWSER_ROW_HEIGHT,
  ASSISTANT_BROWSER_TAG_HEADER_HEIGHT,
  type AssistantBrowserRenderMode,
  type AssistantBrowserRow,
} from './AssistantBrowserContent.models';
import { SortableAssistantRow } from './AssistantBrowserContent.rows';

interface AssistantBrowserRowsViewProps {
  readonly mode: AssistantBrowserRenderMode;
  readonly rows: readonly AssistantBrowserRow[];
  readonly activeAssistantId?: string | null;
  readonly collapsedTags: Readonly<Record<string, boolean>>;
  readonly dragSessionLocked: boolean;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly onToggleTag: (tag: string) => void;
  readonly onPrepareDragStart: () => void;
  readonly onDelete?: (id: string) => void;
  readonly onEdit?: (assistant: Assistant) => void;
  readonly onSelect: (assistant: Assistant) => void;
}

interface AssistantBrowserRowRendererProps {
  readonly row: AssistantBrowserRow;
  readonly rowIndex: number;
  readonly rowStyle?: CSSProperties;
  readonly activeAssistantId?: string | null;
  readonly collapsedTags: Readonly<Record<string, boolean>>;
  readonly dragSessionLocked: boolean;
  readonly onToggleTag: (tag: string) => void;
  readonly onPrepareDragStart: () => void;
  readonly onDelete?: (id: string) => void;
  readonly onEdit?: (assistant: Assistant) => void;
  readonly onSelect: (assistant: Assistant) => void;
}

/**
 * 标签视图里的分组头行。
 *
 * 说明：
 * - 拖拽会话期间这里会被冻结，避免切换展开态导致 row model 改写；
 * - 仅负责展示和折叠交互，不参与 sortable 命中。
 */
function AssistantBrowserTagHeaderRow({
  row,
  rowStyle,
  collapsedTags,
  dragSessionLocked,
  onToggleTag,
}: Omit<AssistantBrowserRowRendererProps, 'activeAssistantId' | 'onDelete' | 'onEdit' | 'onPrepareDragStart' | 'onSelect'> & {
  readonly row: Extract<AssistantBrowserRow, { kind: 'tag-header' }>;
}) {
  return (
    <div className="pb-2" style={rowStyle}>
      <button
        type="button"
        aria-disabled={dragSessionLocked}
        data-testid={`assistant-tag-header-${row.groupId}`}
        data-drag-session-locked={dragSessionLocked ? 'true' : 'false'}
        onClick={() => {
          if (dragSessionLocked) return;
          onToggleTag(row.tag);
        }}
        className="flex w-full items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${collapsedTags[row.tag] ? '-rotate-90' : ''}`} />
        <span className="truncate">{row.tag}</span>
        <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {row.count}
        </span>
      </button>
    </div>
  );
}

/**
 * 把 canonical row model 映射成具体 DOM。
 *
 * 说明：
 * - tag header 和 assistant row 在这里分流；
 * - 统一保证静态列表和虚拟列表渲染的是同一份 row model。
 */
function AssistantBrowserRowRenderer({
  row,
  rowIndex,
  rowStyle,
  activeAssistantId,
  collapsedTags,
  dragSessionLocked,
  onToggleTag,
  onPrepareDragStart,
  onDelete,
  onEdit,
  onSelect,
}: AssistantBrowserRowRendererProps) {
  if (row.kind === 'tag-header') {
    return (
      <AssistantBrowserTagHeaderRow
        row={row}
        rowIndex={rowIndex}
        rowStyle={rowStyle}
        collapsedTags={collapsedTags}
        dragSessionLocked={dragSessionLocked}
        onToggleTag={onToggleTag}
      />
    );
  }

  return (
    <SortableAssistantRow
      assistant={row.assistant}
      active={row.assistant.id === activeAssistantId}
      canDrag={row.canDrag}
      groupId={row.groupId}
      index={row.index}
      rowIndex={rowIndex}
      rowStyle={rowStyle}
      onPrepareDragStart={onPrepareDragStart}
      onDelete={onDelete}
      onEdit={onEdit}
      onSelect={onSelect}
    />
  );
}

/**
 * 静态模式下输出完整真实 DOM 列表。
 *
 * 说明：
 * - 小列表常态直接走这里；
 * - 拖拽会话期间也会切回这里，保证 sortable 拿到全量真实 DOM。
 */
function AssistantBrowserStaticRows({
  rows,
  activeAssistantId,
  collapsedTags,
  dragSessionLocked,
  onToggleTag,
  onPrepareDragStart,
  onDelete,
  onEdit,
  onSelect,
}: Omit<AssistantBrowserRowsViewProps, 'mode' | 'scrollRef'>) {
  return (
    <div data-testid="assistant-browser-rows" data-render-mode="static">
      {rows.map((row, index) => (
        <AssistantBrowserRowRenderer
          key={row.key}
          row={row}
          rowIndex={index}
          activeAssistantId={activeAssistantId}
          collapsedTags={collapsedTags}
          dragSessionLocked={dragSessionLocked}
          onToggleTag={onToggleTag}
          onPrepareDragStart={onPrepareDragStart}
          onDelete={onDelete}
          onEdit={onEdit}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

/**
 * 大列表常态的虚拟窗口渲染器。
 *
 * 说明：
 * - 只在非拖拽会话且行数超过阈值时启用；
 * - 这里不参与拖拽 target 投影，只负责窗口化输出当前可见行。
 */
function AssistantBrowserVirtualizedRows({
  rows,
  activeAssistantId,
  collapsedTags,
  dragSessionLocked,
  scrollRef,
  onToggleTag,
  onPrepareDragStart,
  onDelete,
  onEdit,
  onSelect,
}: Omit<AssistantBrowserRowsViewProps, 'mode'>) {
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => rows[index]?.kind === 'tag-header'
      ? ASSISTANT_BROWSER_TAG_HEADER_HEIGHT
      : ASSISTANT_BROWSER_ROW_HEIGHT,
    overscan: 10,
    getItemKey: (index) => rows[index]?.key ?? index,
    initialRect: {
      width: 0,
      height: 640,
    },
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  return (
    <div data-testid="assistant-browser-rows" data-render-mode="virtualized">
      <div className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
        {virtualRows.map((virtualItem) => {
          const row = rows[virtualItem.index];
          if (!row) return null;

          return (
            <AssistantBrowserRowRenderer
              key={virtualItem.key}
              row={row}
              rowIndex={virtualItem.index}
              rowStyle={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
              activeAssistantId={activeAssistantId}
              collapsedTags={collapsedTags}
              dragSessionLocked={dragSessionLocked}
              onToggleTag={onToggleTag}
              onPrepareDragStart={onPrepareDragStart}
              onDelete={onDelete}
              onEdit={onEdit}
              onSelect={onSelect}
            />
          );
        })}
      </div>
    </div>
  );
}

/** 按当前渲染策略输出助手侧栏行列表。 */
export function AssistantBrowserRowsView(props: AssistantBrowserRowsViewProps) {
  return props.mode === 'virtualized'
    ? <AssistantBrowserVirtualizedRows {...props} />
    : <AssistantBrowserStaticRows {...props} />;
}
