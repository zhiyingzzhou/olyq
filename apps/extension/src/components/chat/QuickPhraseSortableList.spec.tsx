/**
 * 说明：`QuickPhraseSortableList.spec` 组件测试模块。
 *
 * 职责：
 * - 固定快捷短语拖拽行在 active / drop 收尾阶段的可见性；
 * - 防止 dnd-kit 的 dropping/source 残留状态把真实行继续置为透明，造成放手后列表短暂空白。
 *
 * 边界：
 * - 本测试只验证快捷短语列表行视觉状态，不承担真实浏览器指针拖拽 e2e。
 */
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import type { QuickPhrase } from '@/types/quick-phrase';
import { QuickPhraseSortableList } from './QuickPhraseSortableList';

const dndMock = vi.hoisted(() => ({
  providerProps: null as null | {
    onDragStart?: (event: {
      operation: {
        source: {
          id: string;
          sortable: Record<string, unknown>;
        } | null;
      };
    }) => void;
  },
  sortableStates: new Map<string, {
    isDragging?: boolean;
    isDropping?: boolean;
    isDragSource?: boolean;
  }>(),
}));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock('@dnd-kit/collision', () => ({
  pointerIntersection: vi.fn(),
}));

vi.mock('@dnd-kit/react', () => ({
  DragDropProvider: ({
    children,
    ...props
  }: {
    children: ReactNode;
    onDragStart?: (event: {
      operation: {
        source: {
          id: string;
          sortable: Record<string, unknown>;
        } | null;
      };
    }) => void;
  }) => {
    dndMock.providerProps = props;
    return <>{children}</>;
  },
  DragOverlay: () => null,
}));

vi.mock('@dnd-kit/react/sortable', () => ({
  isSortable: (entry: unknown) => Boolean(entry && typeof entry === 'object' && 'sortable' in entry),
  useSortable: ({ id, index, group }: { id: string; index: number; group: string }) => {
    const state = dndMock.sortableStates.get(id) ?? {};
    return {
      handleRef: vi.fn(),
      ref: vi.fn(),
      sourceRef: vi.fn(),
      isDragging: Boolean(state.isDragging),
      isDropping: Boolean(state.isDropping),
      isDragSource: Boolean(state.isDragSource),
      sortable: {
        group,
        initialGroup: group,
        initialIndex: index,
        index,
      },
    };
  },
}));

const phrases: QuickPhrase[] = [
  {
    id: 'phrase-1',
    title: 'First',
    content: 'first content',
    createdAt: 1,
    updatedAt: 1,
    order: 2,
  },
  {
    id: 'phrase-2',
    title: 'Second',
    content: 'second content',
    createdAt: 1,
    updatedAt: 1,
    order: 1,
  },
];

/** 渲染带 Tooltip 上下文的快捷短语拖拽列表，供拖拽视觉状态用例复用。 */
function renderList() {
  return render(
    <TooltipProvider>
      <QuickPhraseSortableList
        phrases={phrases}
        emptyTitle="empty"
        onReorder={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    </TooltipProvider>,
  );
}

describe('QuickPhraseSortableList', () => {
  beforeEach(() => {
    dndMock.providerProps = null;
    dndMock.sortableStates.clear();
  });

  it('拖拽会话 active 时隐藏真实源行，避免 overlay 和原行重影', () => {
    dndMock.sortableStates.set('quick-phrase-list::phrase-1', { isDragSource: true });
    renderList();

    act(() => {
      dndMock.providerProps?.onDragStart?.({
        operation: {
          source: {
            id: 'quick-phrase-list::phrase-1',
            sortable: { group: 'quick-phrase-list' },
          },
        },
      });
    });

    expect(screen.getByTestId('quick-phrase-card-phrase-1')).toHaveAttribute('data-drag-visual-state', 'dragSource');
    expect(screen.getByTestId('quick-phrase-card-phrase-1')).toHaveClass('opacity-0');
  });

  it('drop 收尾残留状态不再隐藏真实行，避免放手后短暂空白', () => {
    dndMock.sortableStates.set('quick-phrase-list::phrase-1', {
      isDragSource: true,
      isDropping: true,
    });
    renderList();

    expect(screen.getByTestId('quick-phrase-card-phrase-1')).toHaveAttribute('data-drag-visual-state', 'idle');
    expect(screen.getByTestId('quick-phrase-card-phrase-1')).not.toHaveClass('opacity-0');
  });
});
