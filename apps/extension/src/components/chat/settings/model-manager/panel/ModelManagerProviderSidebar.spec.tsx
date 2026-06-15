/**
 * 说明：`ModelManagerProviderSidebar.spec` 组件模块。
 *
 * 职责：
 * - 承载 `ModelManagerProviderSidebar.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ModelManagerProviderSidebar } from './ModelManagerProviderSidebar';
import type { ModelManagerPanelController } from './useModelManagerPanelController';

vi.mock('@/components/ui/ProviderIcon', () => ({
  ProviderIcon: ({ providerId }: { providerId: string }) => <span data-testid={`provider-icon-${providerId}`}>{providerId}</span>,
}));

const originalScrollIntoView = Element.prototype.scrollIntoView;

const dndMock = vi.hoisted(() => ({
  providerProps: null as null | {
    onDragStart?: (event: {
      operation: {
        source: { id: string; sortable: Record<string, unknown> } | null;
      };
    }) => void;
    onDragEnd?: (event: {
      canceled?: boolean;
      operation: {
        source: { id: string; sortable: Record<string, unknown> } | null;
        target?: { id: string; sortable: Record<string, unknown> } | null;
      };
    }) => void;
  },
  sortableOptions: new Map<string, {
    disabled?: boolean;
    group?: string;
    index?: number;
  }>(),
  sortableStates: new Map<string, {
    isDragging?: boolean;
    isDragSource?: boolean;
  }>(),
}));

vi.mock('@dnd-kit/collision', () => ({
  pointerIntersection: vi.fn(),
}));

vi.mock('@dnd-kit/react', () => ({
  DragDropProvider: ({
    children,
    ...props
  }: {
    children: ReactNode;
    onDragStart?: unknown;
    onDragEnd?: unknown;
  }) => {
    dndMock.providerProps = props as typeof dndMock.providerProps;
    return <>{children}</>;
  },
  DragOverlay: () => null,
}));

vi.mock('@dnd-kit/react/sortable', () => ({
  isSortable: (entry: unknown) => Boolean(entry && typeof entry === 'object' && 'sortable' in entry),
  useSortable: ({ id, disabled, group, index }: { id: string; disabled?: boolean; group: string; index: number }) => {
    dndMock.sortableOptions.set(id, { disabled, group, index });
    const state = dndMock.sortableStates.get(id) ?? {};
    return {
      handleRef: vi.fn(),
      ref: vi.fn(),
      sourceRef: vi.fn(),
      isDragging: Boolean(state.isDragging),
      isDragSource: Boolean(state.isDragSource),
    };
  },
}));

/**
 * 测试辅助函数：`createController`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createController(overrides: {
  readonly providerSearch?: string;
  readonly selectedId?: string;
} = {}) {
  const openAddProvider = vi.fn();
  const reorderProviders = vi.fn();
  const setProviderSearch = vi.fn();
  const setSelectedId = vi.fn();
  const providers = [
    {
      id: 'openai',
      name: 'OpenAI',
      type: 'openai',
      enabled: true,
      apiKey: '',
      apiHost: 'https://api.openai.com/v1',
      models: [],
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      type: 'anthropic',
      enabled: false,
      apiKey: '',
      apiHost: 'https://api.anthropic.com/v1',
      models: [],
    },
  ];

  const controller = {
    providerDialog: {
      openAddProvider,
    },
    providersState: {
      filteredProviders: providers,
      getProviderDisplayName: (provider: { name: string }) => provider.name,
      providerSearch: overrides.providerSearch ?? '',
      providers,
      reorderProviders,
      selectedId: overrides.selectedId ?? 'openai',
      setProviderSearch,
      setSelectedId,
    },
    t: (key: string) => {
      if (key === 'modelManagerPanel.providerSearchPlaceholder') return '搜索模型平台...';
      if (key === 'modelManagerPanel.actions.add') return '添加';
      if (key === 'modelManagerPanel.provider.on') return '已启用';
      if (key === 'modelManagerPanel.provider.off') return '已关闭';
      if (key === 'modelManagerPanel.provider.dragHandle') return '拖拽调整模型平台顺序';
      if (key === 'modelManagerPanel.provider.dragDisabledInSearch') return '搜索时不能调整顺序';
      return key;
    },
  } as unknown as ModelManagerPanelController;

  return { controller, openAddProvider, reorderProviders, setProviderSearch, setSelectedId };
}

describe('ModelManagerProviderSidebar', () => {
  beforeAll(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
  });

  afterAll(() => {
    if (originalScrollIntoView) {
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
        writable: true,
      });
      return;
    }
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  beforeEach(() => {
    dndMock.providerProps = null;
    dndMock.sortableOptions.clear();
    dndMock.sortableStates.clear();
  });

  it('渲染统一纵向滚动容器，并保持搜索、添加和 provider 切换可用', () => {
    const { controller, openAddProvider, setProviderSearch, setSelectedId } = createController();

    render(<ModelManagerProviderSidebar controller={controller} />);

    expect(screen.getByTestId('model-manager-provider-nav').className).toContain('w-48');
    expect(screen.getByTestId('model-manager-provider-nav').className).toContain('model-manager-provider-nav');
    expect(screen.getByTestId('model-manager-provider-nav').className).toContain('min-w-0');
    expect(screen.getByTestId('model-manager-provider-nav').className).toContain('min-h-0');
    expect(screen.getByTestId('model-manager-provider-scroll')).toHaveAttribute('data-scrollbars', 'vertical');
    expect(screen.getByTestId('model-manager-provider-openai')).toBeInTheDocument();
    expect(screen.getByTestId('model-manager-provider-anthropic')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /添加/ })[0]?.className).toContain('model-manager-provider-add-compact');

    fireEvent.change(screen.getByPlaceholderText('搜索模型平台...'), { target: { value: 'Anth' } });
    expect(setProviderSearch).toHaveBeenCalledWith('Anth');

    fireEvent.click(screen.getByTestId('model-manager-provider-anthropic'));
    expect(setSelectedId).toHaveBeenCalledWith('anthropic');

    fireEvent.click(screen.getAllByRole('button', { name: /添加/ })[0]!);
    expect(openAddProvider).toHaveBeenCalled();
  });

  it('渲染窄宽 compact provider Select，并按 providers 原顺序切换平台', async () => {
    const { controller, openAddProvider, setSelectedId } = createController({ selectedId: 'anthropic' });

    render(<ModelManagerProviderSidebar controller={controller} />);

    expect(screen.getByTestId('model-manager-provider-compact-select-value')).toHaveTextContent('Anthropic');
    expect(screen.getByTestId('model-manager-provider-compact-select-value')).toHaveTextContent('已关闭');

    fireEvent.click(screen.getByTestId('model-manager-provider-compact-select'));
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining('OpenAI'),
      expect.stringContaining('Anthropic'),
    ]);

    fireEvent.click(await screen.findByTestId('model-manager-provider-compact-option-openai'));
    expect(setSelectedId).toHaveBeenCalledWith('openai');

    fireEvent.click(screen.getAllByRole('button', { name: /添加/ })[0]!);
    expect(openAddProvider).toHaveBeenCalled();
  });

  it('正常列表态显示拖拽 handle，拖拽结束后提交 provider 顺序且不丢失选中项', () => {
    const { controller, reorderProviders, setSelectedId } = createController({ selectedId: 'anthropic' });

    render(<ModelManagerProviderSidebar controller={controller} />);

    const handle = screen.getByTestId('model-manager-provider-drag-handle-openai');
    expect(handle).toBeInTheDocument();
    expect(screen.getByTestId('model-manager-provider-drag-handle-anthropic')).toBeInTheDocument();
    expect(handle.className).toContain('opacity-0');
    expect(handle.className).toContain('group-hover:opacity-100');
    expect(handle.className).toContain('group-focus-within:opacity-100');

    const row = screen.getByTestId('model-manager-provider-openai');
    const rowTestIds = Array.from(row.querySelectorAll('[data-testid]')).map((element) => element.getAttribute('data-testid'));
    expect(rowTestIds.indexOf('model-manager-provider-drag-handle-openai')).toBeLessThan(rowTestIds.indexOf('provider-icon-openai'));
    expect(row.className).toContain('relative');
    expect(row.className).toContain('gap-1.5');
    expect(row.className).toContain('pl-1');
    expect(row.className).toContain('pr-1');
    expect(handle.className).not.toContain('absolute');
    expect(handle.className).not.toContain('left-0');
    expect(handle.className).toContain('w-2');
    expect(handle.className).toContain('-ml-0.5');
    expect(handle.className).toContain('mr-0');
    expect(handle.className).not.toContain('mr-1');

    const iconSlot = screen.getByTestId('provider-icon-openai').parentElement;
    expect(iconSlot?.className).toContain('h-8');
    expect(iconSlot?.className).toContain('w-6');
    expect(row.querySelector('.truncate')).toBeInTheDocument();

    dndMock.providerProps?.onDragEnd?.({
      operation: {
        source: {
          id: 'model-manager-provider-list::openai',
          sortable: {
            group: 'model-manager-provider-list',
            initialGroup: 'model-manager-provider-list',
          },
        },
        target: {
          id: 'model-manager-provider-list::anthropic',
          sortable: {
            group: 'model-manager-provider-list',
          },
        },
      },
    });

    expect(reorderProviders).toHaveBeenCalledWith('openai', 'anthropic');
    expect(setSelectedId).not.toHaveBeenCalled();
    expect(screen.getByTestId('model-manager-provider-anthropic').className).toContain('bg-accent');
  });

  it('只在真实 active 拖拽会话中隐藏源行，drop 残留状态不会造成空白', () => {
    dndMock.sortableStates.set('model-manager-provider-list::openai', {
      isDragSource: true,
    });
    const { controller } = createController();

    render(<ModelManagerProviderSidebar controller={controller} />);
    expect(screen.getByTestId('model-manager-provider-card-openai')).toHaveAttribute('data-drag-visual-state', 'idle');
    expect(screen.getByTestId('model-manager-provider-card-openai')).not.toHaveClass('opacity-0');

    act(() => {
      dndMock.providerProps?.onDragStart?.({
        operation: {
          source: {
            id: 'model-manager-provider-list::openai',
            sortable: {
              group: 'model-manager-provider-list',
            },
          },
        },
      });
    });

    expect(screen.getByTestId('model-manager-provider-card-openai')).toHaveAttribute('data-drag-visual-state', 'dragSource');
    expect(screen.getByTestId('model-manager-provider-card-openai')).toHaveClass('opacity-0');
  });

  it('搜索态禁用拖拽排序，避免在过滤结果里改全量数组', () => {
    const { controller, reorderProviders } = createController({ providerSearch: 'open' });

    render(<ModelManagerProviderSidebar controller={controller} />);

    expect(screen.queryByTestId('model-manager-provider-drag-handle-openai')).not.toBeInTheDocument();
    expect(dndMock.sortableOptions.get('model-manager-provider-list::openai')?.disabled).toBe(true);

    dndMock.providerProps?.onDragEnd?.({
      operation: {
        source: {
          id: 'model-manager-provider-list::openai',
          sortable: {
            group: 'model-manager-provider-list',
            initialGroup: 'model-manager-provider-list',
          },
        },
        target: {
          id: 'model-manager-provider-list::anthropic',
          sortable: {
            group: 'model-manager-provider-list',
          },
        },
      },
    });

    expect(reorderProviders).not.toHaveBeenCalled();
  });
});
