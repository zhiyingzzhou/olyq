/**
 * 说明：`AssistantBrowserContent.drag-visual.spec` 组件模块。
 *
 * 职责：
 * - 覆盖助手列表在 `dnd-kit@0.4.0` 的 overlay 语义下，只保留一份可见拖拽实体；
 * - 覆盖“常态按规模渲染，拖拽会话切全量 DOM”的新运行模型，以及 tag 模式同组重排约束。
 *
 * 边界：
 * - 本文件只验证拖拽渲染态与 provider 事件策略，不承担真实 store 持久化回归。
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Assistant } from '@/types/assistant';

import { AssistantBrowserContent } from './AssistantBrowserContent';
import {
  AssistantBrowserDragSessionContext,
  type AssistantBrowserDragSessionState,
} from './AssistantBrowserContent.drag-session';
import {
  ASSISTANT_LIST_GROUP_ID,
  createAssistantGroupId,
  createAssistantSortableInstanceId,
} from './assistant-browser-sortable';

const dndMock = vi.hoisted(() => ({
  overlaySource: null as {
    id: string;
    sortable: Record<string, unknown>;
  } | null,
  overlayProps: null as {
    dropAnimation?: {
      duration?: number;
      easing?: string;
    } | null;
  } | null,
  providerProps: null as {
    onDragStart?: (event: {
      operation: {
        source: {
          id: string;
          sortable: Record<string, unknown>;
        } | null;
      };
    }) => void;
    onDragOver?: (event: {
      cancelable: boolean;
      defaultPrevented: boolean;
      preventDefault: () => void;
      operation: {
        source: {
          id: string;
          sortable: Record<string, unknown>;
        } | null;
        target: {
          id: string;
          sortable: Record<string, unknown>;
        } | null;
      };
    }) => void;
    onDragEnd?: (event: {
      canceled: boolean;
      operation: {
        source: {
          id: string;
          sortable: {
            group: string;
            initialGroup: string;
            initialIndex: number;
            index: number;
          };
        } | null;
        target: {
          id: string;
          sortable: {
            group: string;
            initialGroup: string;
            initialIndex: number;
            index: number;
          };
        } | null;
      };
    }) => void;
  } | null,
  sortableBindings: new Map<string, {
    input: {
      transition?: {
        duration?: number;
        easing?: string;
        idle?: boolean;
      } | null;
      plugins?: unknown;
    };
    resolvedPlugins: unknown[];
    sortable: Record<string, unknown>;
    isDragging: boolean;
    isDropping: boolean;
    isDragSource: boolean;
    isDropTarget: boolean;
    handleRef: ReturnType<typeof vi.fn>;
    ref: ReturnType<typeof vi.fn>;
    sourceRef: ReturnType<typeof vi.fn>;
    targetRef: ReturnType<typeof vi.fn>;
  }>(),
}));

const { virtualWindowRef } = vi.hoisted(() => ({
  virtualWindowRef: {
    current: null as null | { startIndex: number; endIndex: number },
  },
}));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock('@tanstack/react-virtual', () => ({
  defaultRangeExtractor: ({
    startIndex,
    endIndex,
  }: {
    startIndex: number;
    endIndex: number;
  }) => Array.from({ length: Math.max(0, endIndex - startIndex + 1) }, (_, offset) => startIndex + offset),
  useVirtualizer: ({
    count,
    estimateSize,
    getItemKey,
  }: {
    count: number;
    estimateSize?: number | ((index: number) => number);
    getItemKey?: (index: number) => string | number;
  }) => {
    /** 为测试桩里的虚拟行生成稳定的估算高度。 */
    const resolveSize = (index: number) => {
      if (typeof estimateSize === 'function') return estimateSize(index);
      if (typeof estimateSize === 'number') return estimateSize;
      return 62;
    };

    let total = 0;
    const starts = Array.from({ length: count }, (_, index) => {
      const start = total;
      total += resolveSize(index);
      return start;
    });
    const windowRange = virtualWindowRef.current;
    const startIndex = count < 1 ? 0 : Math.max(0, Math.min(windowRange?.startIndex ?? 0, count - 1));
    const endIndex = count < 1
      ? -1
      : Math.max(startIndex, Math.min(windowRange?.endIndex ?? count - 1, count - 1));

    return {
      getTotalSize: () => total,
      getVirtualItems: () => (
        count < 1 || endIndex < startIndex
          ? []
          : Array.from({ length: endIndex - startIndex + 1 }, (_, offset) => {
              const index = startIndex + offset;
              return {
                index,
                key: getItemKey?.(index) ?? `row-${index}`,
                start: starts[index] ?? 0,
              };
            })
      ),
      measure: () => undefined,
      measureElement: () => undefined,
      scrollToIndex: vi.fn(),
    };
  },
}));

vi.mock('@dnd-kit/collision', () => ({
  pointerIntersection: vi.fn(),
  pointerDistance: vi.fn(),
}));

vi.mock('@dnd-kit/react', () => ({
  DragDropProvider: ({
    children,
    ...props
  }: {
    children: ReactNode;
    onDragOver?: (event: {
      cancelable: boolean;
      defaultPrevented: boolean;
      preventDefault: () => void;
      operation: {
        source: {
          id: string;
          sortable: Record<string, unknown>;
        } | null;
        target: {
          id: string;
          sortable: Record<string, unknown>;
        } | null;
      };
    }) => void;
  }) => {
    dndMock.providerProps = props;
    return <>{children}</>;
  },
  DragOverlay: ({
    children,
    dropAnimation,
  }: {
    children: ReactNode | ((source: {
      id: string;
      sortable: Record<string, unknown>;
    } | null) => ReactNode);
    dropAnimation?: {
      duration?: number;
      easing?: string;
    } | null;
  }) => (
    <div
      data-testid="mock-drag-overlay"
      ref={() => {
        dndMock.overlayProps = { dropAnimation };
      }}
    >
      {typeof children === 'function' ? children(dndMock.overlaySource) : children}
    </div>
  ),
}));

vi.mock('@dnd-kit/react/sortable', () => ({
  isSortable: (value: unknown) => Boolean(
    value
    && typeof value === 'object'
    && 'sortable' in (value as Record<string, unknown>),
  ),
  useSortable: ({
    id,
    index,
    group,
    transition,
    plugins,
  }: {
    id: string;
    index: number;
    group: string;
    transition?: {
      duration?: number;
      easing?: string;
      idle?: boolean;
    } | null;
    plugins?: unknown[] | ((defaults: unknown[]) => unknown[]);
  }) => {
    const resolvedPlugins = typeof plugins === 'function' ? plugins([]) : (plugins ?? []);
    const existing = dndMock.sortableBindings.get(id);
    if (existing) {
      existing.input = {
        ...existing.input,
        transition,
        plugins,
      };
      existing.resolvedPlugins = Array.isArray(resolvedPlugins) ? resolvedPlugins : [];
      return existing;
    }

    const next = {
      input: {
        transition,
        plugins,
      },
      resolvedPlugins: Array.isArray(resolvedPlugins) ? resolvedPlugins : [],
      sortable: {
        group,
        initialGroup: group,
        initialIndex: index,
        index,
      },
      isDragging: false,
      isDropping: false,
      isDragSource: false,
      isDropTarget: false,
      handleRef: vi.fn(),
      ref: vi.fn(),
      sourceRef: vi.fn(),
      targetRef: vi.fn(),
    };
    dndMock.sortableBindings.set(id, next);
    return next;
  },
}));

/**
 * 测试辅助函数：`makeAssistant`。
 *
 * @remarks
 * 用于为拖拽视觉测试构造满足最小渲染要求的助手实体。
 */
function makeAssistant(
  id: string,
  name: string,
  options?: {
    tags?: string[];
  },
): Assistant {
  const now = 1_730_000_000_000;
  return {
    id,
    scenario: 'general',
    name,
    description: `${name}描述`,
    prompt: `${name}提示词`,
    tags: options?.tags,
    topics: [],
    order: now,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 读取当前 DOM 中助手行的渲染顺序。
 */
function getRenderedAssistantRowOrder() {
  return screen.getAllByTestId(/assistant-row-assistant-/).map((element) => element.getAttribute('data-testid') || '');
}

/** 读取当前助手列表渲染模式。 */
function getRenderedMode() {
  return screen.getByTestId('assistant-browser-rows').getAttribute('data-render-mode');
}

/**
 * 为拖拽视觉测试提供真实可变的 drag session provider。
 */
function renderAssistantBrowserContent(content: ReactNode, options?: { initialState?: AssistantBrowserDragSessionState }) {
  /**
   * 这里保留最小可变 provider，让用例能覆盖 `idle -\> prepare -\> active` 的真实切换，
   * 而不是把状态写死在 mock 里导致视觉回归只测到静态快照。
   */
  function Harness() {
    const [state, setState] = useState<AssistantBrowserDragSessionState>(options?.initialState ?? 'idle');

    return (
      <AssistantBrowserDragSessionContext.Provider
        value={{
          state,
          active: state === 'active',
          locked: state !== 'idle',
          setState,
        }}
      >
        <div data-testid="assistant-drag-session-state">{state}</div>
        {content}
      </AssistantBrowserDragSessionContext.Provider>
    );
  }

  return render(<Harness />);
}

beforeEach(() => {
  dndMock.overlaySource = null;
  dndMock.overlayProps = null;
  dndMock.providerProps = null;
  dndMock.sortableBindings.clear();
  virtualWindowRef.current = null;
});

describe('AssistantBrowserContent drag visuals', () => {
  it('拖拽中源项会被隐藏，只保留 overlay 这一份可见拖拽实体', () => {
    const draggedInstanceId = createAssistantSortableInstanceId(ASSISTANT_LIST_GROUP_ID, 'assistant-1');
    const handleRef = vi.fn();

    dndMock.overlaySource = {
      id: draggedInstanceId,
      sortable: {
        group: ASSISTANT_LIST_GROUP_ID,
        initialGroup: ASSISTANT_LIST_GROUP_ID,
        initialIndex: 0,
        index: 0,
      },
    };
    dndMock.sortableBindings.set(draggedInstanceId, {
      input: {
        plugins: undefined,
      },
      resolvedPlugins: [],
      sortable: dndMock.overlaySource.sortable,
      isDragging: true,
      isDropping: false,
      isDragSource: true,
      isDropTarget: true,
      handleRef,
      ref: vi.fn(),
      sourceRef: vi.fn(),
      targetRef: vi.fn(),
    });

    renderAssistantBrowserContent(
      <AssistantBrowserContent
        assistants={[
          makeAssistant('assistant-1', '默认助手'),
          makeAssistant('assistant-2', '代码助手'),
        ]}
        activeAssistantId="assistant-1"
        sortType="list"
        onSelect={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onReorderAssistants={() => {}}
      />,
      { initialState: 'active' },
    );

    const row = screen.getByTestId('assistant-row-assistant-1');
    const card = screen.getByTestId('assistant-card-assistant-1');
    const overlay = screen.getByTestId('assistant-overlay-assistant-1');
    const handle = screen.getByTestId('assistant-drag-handle-assistant-1');
    const currentBadge = within(card).getByText('common.current');

    expect(row).toHaveAttribute('data-group-id', ASSISTANT_LIST_GROUP_ID);
    expect(row).toHaveAttribute('data-drop-target-state', 'idle');
    expect(card).toHaveAttribute('data-drag-visual-state', 'dragSource');
    expect(card.className).toContain('duration-200');
    expect(card.className).toContain('ease-out');
    expect(card.className).toContain('opacity-0');
    expect(overlay).toHaveAttribute('data-drag-visual-state', 'overlay');
    expect(within(overlay).getByTestId('assistant-overlay-handle-assistant-1')).toBeInTheDocument();
    expect(within(overlay).queryByLabelText('common.edit')).not.toBeInTheDocument();
    expect(within(overlay).queryByLabelText('common.delete')).not.toBeInTheDocument();
    expect(within(overlay).getByText('common.current')).toBeInTheDocument();
    expect(handle).toBeInTheDocument();
    expect(currentBadge.className).toContain('h-5');
    expect(currentBadge.className).toContain('whitespace-nowrap');
    expect(currentBadge.className).toContain('leading-none');
    expect(dndMock.overlayProps?.dropAnimation).toBeNull();

    expect(handleRef).toHaveBeenCalled();
    expect(dndMock.sortableBindings.get(draggedInstanceId)?.input.transition).toEqual({
      duration: 0,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    });
    expect(handleRef.mock.calls.at(-1)?.[0]).toBeInstanceOf(HTMLButtonElement);
  });

  it('关闭 drop 动画后不会再保留额外的 overlay 收尾状态', () => {
    const droppingInstanceId = createAssistantSortableInstanceId(ASSISTANT_LIST_GROUP_ID, 'assistant-1');

    dndMock.overlaySource = {
      id: droppingInstanceId,
      sortable: {
        group: ASSISTANT_LIST_GROUP_ID,
        initialGroup: ASSISTANT_LIST_GROUP_ID,
        initialIndex: 0,
        index: 0,
      },
    };
    dndMock.sortableBindings.set(droppingInstanceId, {
      input: {
        plugins: undefined,
      },
      resolvedPlugins: [],
      sortable: dndMock.overlaySource.sortable,
      isDragging: false,
      isDropping: true,
      isDragSource: false,
      isDropTarget: false,
      handleRef: vi.fn(),
      ref: vi.fn(),
      sourceRef: vi.fn(),
      targetRef: vi.fn(),
    });

    renderAssistantBrowserContent(
      <AssistantBrowserContent
        assistants={[
          makeAssistant('assistant-1', '默认助手'),
          makeAssistant('assistant-2', '代码助手'),
        ]}
        activeAssistantId="assistant-1"
        sortType="list"
        onSelect={() => {}}
        onReorderAssistants={() => {}}
      />,
    );

    expect(screen.getByTestId('assistant-card-assistant-1')).toHaveAttribute('data-drag-visual-state', 'dragSource');
    expect(screen.queryByTestId('assistant-overlay-assistant-1')).not.toBeInTheDocument();
  });

  it('drag handle 保留 touch-none，点击不会触发选择，也不会自行阻止默认事件', () => {
    const onSelect = vi.fn();

    renderAssistantBrowserContent(
      <AssistantBrowserContent
        assistants={[
          makeAssistant('assistant-1', '默认助手'),
          makeAssistant('assistant-2', '代码助手'),
        ]}
        activeAssistantId="assistant-1"
        sortType="list"
        onSelect={onSelect}
        onReorderAssistants={() => {}}
      />,
    );

    const handle = screen.getByTestId('assistant-drag-handle-assistant-1');
    expect(handle.className).toContain('touch-none');

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    let dispatchResult = false;
    act(() => {
      dispatchResult = handle.dispatchEvent(clickEvent);
    });
    expect(dispatchResult).toBe(true);
    expect(clickEvent.defaultPrevented).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('默认助手'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('小列表常态直接静态渲染，不进入虚拟化窗口', () => {
    virtualWindowRef.current = { startIndex: 0, endIndex: 1 };

    renderAssistantBrowserContent(
      <AssistantBrowserContent
        assistants={[
          makeAssistant('assistant-1', '默认助手'),
          makeAssistant('assistant-2', '代码助手'),
          makeAssistant('assistant-3', '研究助手'),
          makeAssistant('assistant-4', '翻译助手'),
        ]}
        activeAssistantId="assistant-1"
        sortType="list"
        onSelect={() => {}}
        onReorderAssistants={() => {}}
      />,
    );

    expect(getRenderedMode()).toBe('static');
    expect(getRenderedAssistantRowOrder()).toEqual([
      'assistant-row-assistant-1',
      'assistant-row-assistant-2',
      'assistant-row-assistant-3',
      'assistant-row-assistant-4',
    ]);
  });

  it('tag 模式下跨组 onDragOver 会被立即阻止', () => {
    const writingGroupId = createAssistantGroupId('写作');
    const codingGroupId = createAssistantGroupId('开发');

    renderAssistantBrowserContent(
      <AssistantBrowserContent
        assistants={[
          makeAssistant('assistant-1', '写作助手', { tags: ['写作'] }),
          makeAssistant('assistant-2', '代码助手', { tags: ['开发'] }),
        ]}
        activeAssistantId="assistant-1"
        sortType="tags"
        onSelect={() => {}}
        onReorderAssistants={() => {}}
      />,
    );

    const preventCrossGroup = vi.fn();
    act(() => {
      dndMock.providerProps?.onDragOver?.({
        cancelable: true,
        defaultPrevented: false,
        preventDefault: preventCrossGroup,
        operation: {
          source: {
            id: createAssistantSortableInstanceId(writingGroupId, 'assistant-1'),
            sortable: {
              group: writingGroupId,
              initialGroup: writingGroupId,
              initialIndex: 0,
              index: 0,
            },
          },
          target: {
            id: createAssistantSortableInstanceId(codingGroupId, 'assistant-2'),
            sortable: {
              group: codingGroupId,
              initialGroup: codingGroupId,
              initialIndex: 0,
              index: 0,
            },
          },
        },
      });
    });

    expect(preventCrossGroup).toHaveBeenCalledTimes(1);

    const allowSameGroup = vi.fn();
    act(() => {
      dndMock.providerProps?.onDragOver?.({
        cancelable: true,
        defaultPrevented: false,
        preventDefault: allowSameGroup,
        operation: {
          source: {
            id: createAssistantSortableInstanceId(writingGroupId, 'assistant-1'),
            sortable: {
              group: writingGroupId,
              initialGroup: writingGroupId,
              initialIndex: 0,
              index: 0,
            },
          },
          target: {
            id: createAssistantSortableInstanceId(writingGroupId, 'assistant-1'),
            sortable: {
              group: writingGroupId,
              initialGroup: writingGroupId,
              initialIndex: 0,
              index: 0,
            },
          },
        },
      });
    });

    expect(allowSameGroup).not.toHaveBeenCalled();
  });

  it('drag end 时若 source.index 未更新，会回退到 target.index 计算最终顺序', () => {
    const onReorderAssistants = vi.fn();

    renderAssistantBrowserContent(
      <AssistantBrowserContent
        assistants={[
          makeAssistant('assistant-1', '默认助手'),
          makeAssistant('assistant-2', '代码助手'),
        ]}
        activeAssistantId="assistant-1"
        sortType="list"
        onSelect={() => {}}
        onReorderAssistants={onReorderAssistants}
      />,
    );

    act(() => {
      dndMock.providerProps?.onDragEnd?.({
        canceled: false,
        operation: {
          source: {
            id: createAssistantSortableInstanceId(ASSISTANT_LIST_GROUP_ID, 'assistant-2'),
            sortable: {
              group: ASSISTANT_LIST_GROUP_ID,
              initialGroup: ASSISTANT_LIST_GROUP_ID,
              initialIndex: 1,
              index: 1,
            },
          },
          target: {
            id: createAssistantSortableInstanceId(ASSISTANT_LIST_GROUP_ID, 'assistant-1'),
            sortable: {
              group: ASSISTANT_LIST_GROUP_ID,
              initialGroup: ASSISTANT_LIST_GROUP_ID,
              initialIndex: 0,
              index: 0,
            },
          },
        },
      });
    });

    expect(onReorderAssistants).toHaveBeenCalledWith([
      'assistant-2',
      'assistant-1',
    ]);
  });

  it('drag end 时若 source.index 已投影到最终位置，会优先使用 source.index', () => {
    const onReorderAssistants = vi.fn();

    renderAssistantBrowserContent(
      <AssistantBrowserContent
        assistants={[
          makeAssistant('assistant-1', '默认助手'),
          makeAssistant('assistant-2', '代码助手'),
          makeAssistant('assistant-3', '研究助手'),
          makeAssistant('assistant-4', '翻译助手'),
        ]}
        activeAssistantId="assistant-1"
        sortType="list"
        onSelect={() => {}}
        onReorderAssistants={onReorderAssistants}
      />,
    );

    act(() => {
      dndMock.providerProps?.onDragEnd?.({
        canceled: false,
        operation: {
          source: {
            id: createAssistantSortableInstanceId(ASSISTANT_LIST_GROUP_ID, 'assistant-4'),
            sortable: {
              group: ASSISTANT_LIST_GROUP_ID,
              initialGroup: ASSISTANT_LIST_GROUP_ID,
              initialIndex: 3,
              index: 0,
            },
          },
          target: {
            id: createAssistantSortableInstanceId(ASSISTANT_LIST_GROUP_ID, 'assistant-3'),
            sortable: {
              group: ASSISTANT_LIST_GROUP_ID,
              initialGroup: ASSISTANT_LIST_GROUP_ID,
              initialIndex: 2,
              index: 2,
            },
          },
        },
      });
    });

    expect(onReorderAssistants).toHaveBeenCalledWith([
      'assistant-4',
      'assistant-1',
      'assistant-2',
      'assistant-3',
    ]);
  });

  it('drag end 时若 target 已丢失但 source.index 已投影到最终位置，仍会按 source.index 落库', () => {
    const onReorderAssistants = vi.fn();

    renderAssistantBrowserContent(
      <AssistantBrowserContent
        assistants={[
          makeAssistant('assistant-1', '默认助手'),
          makeAssistant('assistant-2', '代码助手'),
          makeAssistant('assistant-3', '研究助手'),
          makeAssistant('assistant-4', '翻译助手'),
        ]}
        activeAssistantId="assistant-1"
        sortType="list"
        onSelect={() => {}}
        onReorderAssistants={onReorderAssistants}
      />,
    );

    act(() => {
      dndMock.providerProps?.onDragEnd?.({
        canceled: false,
        operation: {
          source: {
            id: createAssistantSortableInstanceId(ASSISTANT_LIST_GROUP_ID, 'assistant-3'),
            sortable: {
              group: ASSISTANT_LIST_GROUP_ID,
              initialGroup: ASSISTANT_LIST_GROUP_ID,
              initialIndex: 2,
              index: 0,
            },
          },
          target: null,
        },
      });
    });

    expect(onReorderAssistants).toHaveBeenCalledWith([
      'assistant-3',
      'assistant-1',
      'assistant-2',
      'assistant-4',
    ]);
  });

  it('tags 视图只允许同组重排，并把组内新顺序映射回全局顺序', () => {
    const onReorderAssistants = vi.fn();
    const writingGroupId = createAssistantGroupId('写作');

    renderAssistantBrowserContent(
      <AssistantBrowserContent
        assistants={[
          makeAssistant('assistant-1', '写作助手', { tags: ['写作'] }),
          makeAssistant('assistant-2', '代码助手', { tags: ['开发'] }),
          makeAssistant('assistant-3', '审稿助手', { tags: ['写作'] }),
        ]}
        activeAssistantId="assistant-1"
        sortType="tags"
        onSelect={() => {}}
        onReorderAssistants={onReorderAssistants}
      />,
    );

    act(() => {
      dndMock.providerProps?.onDragEnd?.({
        canceled: false,
        operation: {
          source: {
            id: createAssistantSortableInstanceId(writingGroupId, 'assistant-3'),
            sortable: {
              group: writingGroupId,
              initialGroup: writingGroupId,
              initialIndex: 1,
              index: 0,
            },
          },
          target: null,
        },
      });
    });

    expect(onReorderAssistants).toHaveBeenCalledWith([
      'assistant-3',
      'assistant-2',
      'assistant-1',
    ]);
  });

  it('1000+ 助手时常态只渲染虚拟窗口内的行', () => {
    virtualWindowRef.current = { startIndex: 0, endIndex: 5 };

    renderAssistantBrowserContent(
      <AssistantBrowserContent
        assistants={Array.from({ length: 1200 }, (_, index) => makeAssistant(`assistant-${index}`, `虚拟助手 ${index}`))}
        activeAssistantId="assistant-0"
        sortType="list"
        onSelect={() => {}}
        onReorderAssistants={() => {}}
      />,
    );

    expect(getRenderedMode()).toBe('virtualized');
    expect(screen.getAllByTestId(/assistant-row-assistant-/)).toHaveLength(6);
    expect(screen.queryByText('虚拟助手 10')).not.toBeInTheDocument();
  });

  it('大列表会经历 idle -> prepare -> active -> cancel 的渲染切换', async () => {
    virtualWindowRef.current = { startIndex: 0, endIndex: 5 };

    renderAssistantBrowserContent(
      <AssistantBrowserContent
        assistants={Array.from({ length: 120 }, (_, index) => makeAssistant(`assistant-${index}`, `虚拟助手 ${index}`))}
        activeAssistantId="assistant-0"
        sortType="list"
        onSelect={() => {}}
        onReorderAssistants={() => {}}
      />,
    );

    expect(getRenderedMode()).toBe('virtualized');
    expect(screen.getAllByTestId(/assistant-row-assistant-/)).toHaveLength(6);
    expect(screen.getByTestId('assistant-drag-session-state')).toHaveTextContent('idle');

    act(() => {
      fireEvent.pointerDown(screen.getByTestId('assistant-drag-handle-assistant-5'), {
        button: 0,
        pointerType: 'mouse',
      });
    });

    await waitFor(() => {
      expect(getRenderedMode()).toBe('static');
      expect(screen.getByTestId('assistant-drag-session-state')).toHaveTextContent('prepare');
    });
    expect(screen.getAllByTestId(/assistant-row-assistant-/)).toHaveLength(120);
    expect(screen.getByText('虚拟助手 100')).toBeInTheDocument();

    act(() => {
      dndMock.providerProps?.onDragStart?.({
        operation: {
          source: {
            id: createAssistantSortableInstanceId(ASSISTANT_LIST_GROUP_ID, 'assistant-5'),
            sortable: {
              group: ASSISTANT_LIST_GROUP_ID,
              initialGroup: ASSISTANT_LIST_GROUP_ID,
              initialIndex: 5,
              index: 5,
            },
          },
        },
      });
    });

    await waitFor(() => {
      expect(getRenderedMode()).toBe('static');
      expect(screen.getByTestId('assistant-drag-session-state')).toHaveTextContent('active');
    });
    expect(screen.getAllByTestId(/assistant-row-assistant-/)).toHaveLength(120);
    expect(screen.getByText('虚拟助手 100')).toBeInTheDocument();

    act(() => {
      dndMock.providerProps?.onDragEnd?.({
        canceled: true,
        operation: {
          source: {
            id: createAssistantSortableInstanceId(ASSISTANT_LIST_GROUP_ID, 'assistant-5'),
            sortable: {
              group: ASSISTANT_LIST_GROUP_ID,
              initialGroup: ASSISTANT_LIST_GROUP_ID,
              initialIndex: 5,
              index: 5,
            },
          },
          target: null,
        },
      });
    });

    await waitFor(() => {
      expect(getRenderedMode()).toBe('virtualized');
      expect(screen.getByTestId('assistant-drag-session-state')).toHaveTextContent('idle');
    });
    expect(screen.getAllByTestId(/assistant-row-assistant-/)).toHaveLength(6);
    expect(screen.queryByText('虚拟助手 100')).not.toBeInTheDocument();
  });
});
