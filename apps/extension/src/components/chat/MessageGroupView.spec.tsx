/**
 * 说明：`MessageGroupView.spec` 组件模块。
 *
 * 职责：
 * - 承载 `MessageGroupView.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useState, type CSSProperties, type ComponentProps, type ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageGroupView } from './MessageGroupView';
import type { Message } from '@/types/chat';

/**
 * 测试辅助函数：`tMock`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
const tMock = (key: string) => key;
const { popoverContentSpy } = vi.hoisted(() => ({
  popoverContentSpy: vi.fn(),
}));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: tMock, i18n: { language: 'zh-CN' } }),
  };
});

vi.mock('@/hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(async () => true),
    ConfirmDialogPortal: () => null,
  }),
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({
    children,
    className,
    style,
    collisionPadding,
    sideOffset,
  }: {
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
    collisionPadding?: number;
    sideOffset?: number;
  }) => {
    popoverContentSpy({ className, style, collisionPadding, sideOffset });
    return (
      <div
        data-testid="popover-content"
        data-class-name={className ?? ''}
        data-collision-padding={String(collisionPadding ?? '')}
        data-side-offset={String(sideOffset ?? '')}
        style={style}
      >
        {children}
      </div>
    );
  },
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  SelectValue: () => <span>select-value</span>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/slider', () => ({
  Slider: () => <div>slider</div>,
}));

vi.mock('./MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    content === '__interactive_link__'
      ? <a href="#interactive">interactive-link</a>
      : <div>{content}</div>
  ),
}));

vi.mock('./ThinkingBlock', () => ({
  ThinkingBlock: () => <div>thinking</div>,
}));

vi.mock('./WebSearchResultsBlock', () => ({
  WebSearchResultsBlock: () => <div>search-results</div>,
}));

vi.mock('./ToolCallBlock', () => ({
  ToolCallBlock: () => <div>tool-call</div>,
}));

vi.mock('./MessageOutline', () => ({
  MessageOutline: () => null,
}));

vi.mock('./MessageErrorNotice', () => ({
  MessageErrorNotice: () => null,
}));

vi.mock('./MessageTranslationsBlock', () => ({
  MessageTranslationsBlock: () => null,
}));

vi.mock('@/components/chat/ModelPickerDialog', () => ({
  ModelPickerDialog: () => null,
}));

vi.mock('@/components/ui/ProviderIcon', () => ({
  ProviderIcon: () => null,
}));

vi.mock('./PreviewableImage', () => ({
  PreviewableImage: () => null,
}));

const assistants: Message[] = [
  {
    id: 'assistant-1',
    askId: 'ask-1',
    role: 'assistant',
    modelId: 'deepseek/model-a',
    content: 'first answer',
    createdAt: 1,
  },
  {
    id: 'assistant-2',
    askId: 'ask-1',
    role: 'assistant',
    modelId: 'deepseek/model-b',
    content: 'second answer',
    createdAt: 2,
  },
];

/**
 * 测试辅助函数：`renderMessageGroupView`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
async function renderMessageGroupView(
  initialPrefs: NonNullable<Message['groupPrefs']>,
  options?: {
    availableHeight?: number;
    multiSelectMode?: boolean;
    presentation?: ComponentProps<typeof MessageGroupView>['presentation'];
    selectedIds?: ReadonlySet<string>;
    onToggleSelect?: (id: string) => void;
    onOpenFullscreen?: () => void;
    onCloseFullscreen?: () => void;
    customAssistants?: Message[];
  },
) {
  const onUpdatePrefs = vi.fn();
  const onToggleSelect = options?.onToggleSelect ?? vi.fn();
  const multiSelectMode = options?.multiSelectMode ?? false;
  const selectedIds = options?.selectedIds ?? new Set<string>();
  const viewAssistants = options?.customAssistants ?? assistants;

    /**
   * 测试辅助函数：`Harness`。
   *
   * @remarks
   * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
   */
  function Harness() {
    const [prefs, setPrefs] = useState<NonNullable<Message['groupPrefs']>>(initialPrefs);

    return (
      <MessageGroupView
        askId="ask-1"
        availableHeight={options?.availableHeight}
        presentation={options?.presentation}
        assistants={viewAssistants}
        prefs={prefs}
        isLoading={false}
        getModelLabel={(id) => id}
        onUpdatePrefs={(patch) => {
          onUpdatePrefs(patch);
          setPrefs((current) => ({ ...current, ...patch }));
        }}
        onOpenFullscreen={options?.onOpenFullscreen}
        onCloseFullscreen={options?.onCloseFullscreen}
        onDeleteGroup={() => {}}
        onRetryFailedAll={() => {}}
        onToggleUseful={() => {}}
        multiSelectMode={multiSelectMode}
        selectedIds={selectedIds}
        onToggleSelect={onToggleSelect}
      />
    );
  }

  await act(async () => {
    render(<Harness />);
  });

  return { onUpdatePrefs, onToggleSelect };
}

/**
 * 测试辅助函数：`buildMessageGroupViewProps`。
 *
 * @remarks
 * 为固定高度横向面板等直接渲染场景提供一套最小可用的 MessageGroupView 入参，
 * 让单个用例只覆盖自己关心的差异字段，减少重复样板。
 */
function buildMessageGroupViewProps(
  overrides?: Partial<ComponentProps<typeof MessageGroupView>>,
): ComponentProps<typeof MessageGroupView> {
  return {
    askId: 'ask-1',
    availableHeight: 640,
    assistants,
    prefs: {
      style: 'horizontal',
      foldDisplayMode: 'compact',
      foldSelectedModelId: 'assistant-1',
      gridColumns: 2,
      gridPopoverTrigger: 'hover',
    },
    isLoading: false,
    getModelLabel: (id) => id,
    onUpdatePrefs: () => undefined,
    onDeleteGroup: () => undefined,
    onRetryFailedAll: () => undefined,
    onToggleUseful: () => undefined,
    multiSelectMode: false,
    selectedIds: new Set<string>(),
    onToggleSelect: () => undefined,
    ...overrides,
  };
}

/**
 * 测试辅助函数：`installResizeObserverHarness`。
 *
 * @remarks
 * 为 compare 联动滚动场景提供可手动触发的 `ResizeObserver` mock，
 * 用来模拟流式回答导致的正文区持续增高，而不依赖 jsdom 的真实布局系统。
 */
function installResizeObserverHarness() {
  type ResizeObserverCallback = ConstructorParameters<typeof ResizeObserver>[0];
  interface ObserverRecord {
    readonly callback: ResizeObserverCallback;
    readonly instance: ResizeObserver;
    readonly targets: Set<Element>;
  }

  const originalWindowResizeObserver = window.ResizeObserver;
  const originalGlobalResizeObserver = globalThis.ResizeObserver;
  const records = new Set<ObserverRecord>();

  class ResizeObserverHarness {
    private readonly record: ObserverRecord;

    constructor(callback: ResizeObserverCallback) {
      this.record = {
        callback,
        instance: this as unknown as ResizeObserver,
        targets: new Set<Element>(),
      };
      records.add(this.record);
    }

    observe = (target: Element) => {
      this.record.targets.add(target);
    };

    unobserve = (target: Element) => {
      this.record.targets.delete(target);
    };

    disconnect = () => {
      this.record.targets.clear();
      records.delete(this.record);
    };
  }

  Object.defineProperty(window, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverHarness,
  });
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverHarness,
  });

  return {
    /**
     * 测试辅助方法：`restore`。
     *
     * @remarks
     * 把全局 `ResizeObserver` 恢复回测试基线实现，
     * 避免当前用例的手动 observer mock 泄露到后续其它组件测试。
     */
    restore() {
      Object.defineProperty(window, 'ResizeObserver', {
        configurable: true,
        writable: true,
        value: originalWindowResizeObserver,
      });
      Object.defineProperty(globalThis, 'ResizeObserver', {
        configurable: true,
        writable: true,
        value: originalGlobalResizeObserver,
      });
    },
    /**
     * 测试辅助方法：`trigger`。
     *
     * @remarks
     * 主动向观察中的 target 分发一次尺寸变化回调，
     * 并额外等待下一帧，让 compare 联动里基于 `requestAnimationFrame` 合并的重算真正落地。
     */
    async trigger(...targets: Element[]) {
      for (const record of records) {
        const entries = targets
          .filter((target) => record.targets.has(target))
          .map((target) => ({
            target,
            contentRect: {
              x: 0,
              y: 0,
              top: 0,
              left: 0,
              bottom: (target as HTMLElement).clientHeight,
              right: (target as HTMLElement).clientWidth,
              width: (target as HTMLElement).clientWidth,
              height: (target as HTMLElement).clientHeight,
              toJSON: () => ({}),
            },
          })) as ResizeObserverEntry[];

        if (!entries.length) continue;
        record.callback(entries, record.instance);
      }

      await Promise.resolve();
      await new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => resolve());
          return;
        }
        window.setTimeout(resolve, 0);
      });
    },
  };
}

/**
 * 测试辅助函数：`expectGridPreviewOverlayProps`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function expectGridPreviewOverlayProps(
  props: {
    className?: string;
    collisionPadding?: number;
    sideOffset?: number;
    style?: CSSProperties;
  },
) {
  expect(props.collisionPadding).toBe(12);
  expect(props.sideOffset).toBe(8);
  expect(props.className).toContain('overflow-auto');
  expect(props.className).toContain('overscroll-contain');
  expect(props.className).toContain('p-2');
  expect(props.className).toContain('max-h-[min(var(--grid-preview-available-height),calc(100vh-24px))]');
  expect(props.className).toContain('max-w-[min(var(--grid-preview-available-width),calc(100vw-24px))]');
  expect(props.className).toContain('sm:max-w-[min(var(--grid-preview-available-width),60vw)]');
  expect(props.style).toEqual(
    expect.objectContaining({
      '--grid-preview-available-height': 'var(--radix-popover-content-available-height)',
      '--grid-preview-available-width': 'var(--radix-popover-content-available-width)',
    }),
  );
}

/**
 * 测试辅助函数：`findGridPreviewOverlayCall`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function findGridPreviewOverlayCall(
  calls: unknown[][],
) {
  return calls
    .map((call) => call[0] as {
      className?: string;
      collisionPadding?: number;
      sideOffset?: number;
      style?: CSSProperties;
    } | undefined)
    .find((props) => props?.className?.includes('max-h-[min(var(--grid-preview-available-height),calc(100vh-24px))]'));
}

beforeEach(() => {
  popoverContentSpy.mockClear();
});

describe('MessageGroupView layout switcher', () => {
  it('把全屏入口放在布局动作组里，点击时不会触发 prefs 持久化', async () => {
    const onOpenFullscreen = vi.fn();
    const { onUpdatePrefs } = await renderMessageGroupView({
      style: 'fold',
      foldDisplayMode: 'compact',
      foldSelectedModelId: 'assistant-1',
      gridColumns: 2,
      gridPopoverTrigger: 'hover',
    }, {
      onOpenFullscreen,
    });

    fireEvent.click(screen.getByRole('button', { name: 'group.openFullscreen' }));

    expect(onOpenFullscreen).toHaveBeenCalledTimes(1);
    expect(onUpdatePrefs).not.toHaveBeenCalled();
  });

  it('高亮当前布局模式，并在切到 grid 后立即同步选中态和网格设置入口', async () => {
    const initialPrefs: NonNullable<Message['groupPrefs']> = {
      style: 'fold',
      foldDisplayMode: 'compact',
      foldSelectedModelId: 'assistant-1',
      gridColumns: 2,
      gridPopoverTrigger: 'hover',
    };
    const { onUpdatePrefs } = await renderMessageGroupView(initialPrefs);

    const foldButton = screen.getByRole('radio', { name: 'group.layoutFold' });
    const gridButton = screen.getByRole('radio', { name: 'group.layoutGrid' });

    expect(foldButton).toHaveAttribute('data-state', 'on');
    expect(foldButton).toHaveAttribute('data-selected', 'true');
    expect(foldButton.className).toContain('!bg-foreground');
    expect(foldButton.className).toContain('!text-background');
    expect(foldButton.className).toContain('rounded-xl');
    expect(gridButton).toHaveAttribute('data-state', 'off');
    expect(gridButton).toHaveAttribute('data-selected', 'false');
    expect(screen.queryByText('group.gridSettings')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(gridButton);
    });

    expect(onUpdatePrefs).toHaveBeenCalledWith({ style: 'grid' });
    expect(gridButton).toHaveAttribute('data-state', 'on');
    expect(gridButton).toHaveAttribute('data-selected', 'true');
    expect(gridButton.className).toContain('!bg-foreground');
    expect(gridButton.className).toContain('!text-background');
    expect(foldButton).toHaveAttribute('data-state', 'off');
    expect(foldButton).toHaveAttribute('data-selected', 'false');
    expect(screen.getByText('group.gridSettings')).toBeInTheDocument();
  });

  it('grid 悬停预览也统一走 popover 可用视口的尺寸约束', async () => {
    await renderMessageGroupView({
      style: 'grid',
      foldDisplayMode: 'compact',
      foldSelectedModelId: 'assistant-1',
      gridColumns: 2,
      gridPopoverTrigger: 'hover',
    });

    expect(popoverContentSpy).toHaveBeenCalled();
    const firstCall = findGridPreviewOverlayCall(popoverContentSpy.mock.calls);
    expect(firstCall).toBeDefined();
    expectGridPreviewOverlayProps(firstCall!);
  });

  it('grid 点击预览使用基于 popover 可用视口的尺寸约束', async () => {
    await renderMessageGroupView({
      style: 'grid',
      foldDisplayMode: 'compact',
      foldSelectedModelId: 'assistant-1',
      gridColumns: 2,
      gridPopoverTrigger: 'click',
    });

    expect(popoverContentSpy).toHaveBeenCalled();
    const firstCall = findGridPreviewOverlayCall(popoverContentSpy.mock.calls);
    expect(firstCall).toBeDefined();
    expectGridPreviewOverlayProps(firstCall!);
  });

  it('多选模式下保留 grid 布局且不再渲染预览浮层', async () => {
    await renderMessageGroupView({
      style: 'grid',
      foldDisplayMode: 'compact',
      foldSelectedModelId: 'assistant-1',
      gridColumns: 2,
      gridPopoverTrigger: 'hover',
    }, {
      multiSelectMode: true,
      selectedIds: new Set(['assistant-1']),
    });

    expect(findGridPreviewOverlayCall(popoverContentSpy.mock.calls)).toBeUndefined();
    expect(document.querySelector('[data-msg-id="assistant-1"]')).toBeInTheDocument();
    expect(document.querySelector('[data-msg-id="assistant-2"]')).toBeInTheDocument();
    expect(screen.queryByText('group.deleteGroup')).not.toBeInTheDocument();
    expect(screen.getByText('group.gridSettings')).toBeInTheDocument();
  });

  it('多选模式下点击整张卡片或 checkbox 都只切换一次', async () => {
    const { onToggleSelect } = await renderMessageGroupView({
      style: 'grid',
      foldDisplayMode: 'compact',
      foldSelectedModelId: 'assistant-1',
      gridColumns: 2,
      gridPopoverTrigger: 'hover',
    }, {
      multiSelectMode: true,
      onToggleSelect: vi.fn(),
    });

    const firstCard = document.querySelector<HTMLElement>('[data-msg-id="assistant-1"]');
    expect(firstCard).not.toBeNull();

    fireEvent.click(firstCard!);
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).toHaveBeenLastCalledWith('assistant-1');

    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(onToggleSelect).toHaveBeenCalledTimes(2);
    expect(onToggleSelect).toHaveBeenLastCalledWith('assistant-1');
  });

  it('多选模式下点击卡片内交互元素不会误触选择', async () => {
    const { onToggleSelect } = await renderMessageGroupView({
      style: 'vertical',
      foldDisplayMode: 'compact',
      foldSelectedModelId: 'assistant-1',
      gridColumns: 2,
      gridPopoverTrigger: 'hover',
    }, {
      multiSelectMode: true,
      onToggleSelect: vi.fn(),
      customAssistants: [
        {
          ...assistants[0]!,
          content: '__interactive_link__',
        },
        assistants[1]!,
      ],
    });

    fireEvent.click(screen.getByText('interactive-link'));

    expect(onToggleSelect).not.toHaveBeenCalled();
  });

  it('horizontal 模式使用固定高度比较面板，长内容只撑开卡片内部滚动区', async () => {
    const longAssistants = assistants.map((message, index) => ({
      ...message,
      content: `${message.content}\n${'long content '.repeat(index === 0 ? 40 : 60)}`,
    }));
    const veryLongAssistants = longAssistants.map((message) => ({
      ...message,
      content: `${message.content}\n${'stream delta '.repeat(120)}`,
    }));

    let rerender!: ReturnType<typeof render>['rerender'];
    await act(async () => {
      const rendered = render(
        <MessageGroupView
          {...buildMessageGroupViewProps({
            assistants: longAssistants,
          })}
        />,
      );
      rerender = rendered.rerender;
      await Promise.resolve();
    });

    const panel = screen.getByTestId('message-group-horizontal-panel');
    expect(panel).toHaveAttribute('data-panel-height', '552');
    expect((panel as HTMLElement).style.height).toBe('552px');
    expect(panel.className).not.toContain('rounded-xl');
    expect(panel.className).not.toContain('border');
    expect(panel.className).not.toContain('bg-background');
    const layoutBody = screen.getByTestId('message-group-layout-body');
    expect(Array.from(layoutBody.classList)).not.toContain('p-2');
    expect(Array.from(layoutBody.classList)).not.toContain('p-3');
    const rail = screen.getByTestId('message-group-horizontal-rail');
    expect(rail.className).toContain('box-border');
    expect(Array.from(rail.classList)).not.toContain('p-2');
    expect(Array.from(rail.classList)).toContain('pt-2');
    expect(Array.from(rail.classList)).toContain('pr-2');
    expect(Array.from(rail.classList)).toContain('h-[calc(100%-0.5rem)]');

    const bodies = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="message-group-horizontal-column"] [data-search-scope="true"]'),
    );
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(body.className).toContain('overflow-y-auto');
      expect(body.className).toContain('flex-1');
    }

    const columns = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="message-group-horizontal-column"]'),
    );
    expect(columns).toHaveLength(2);
    for (const column of columns) {
      expect(column.className).toContain('min-h-0');
    }

    const cards = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="message-group-horizontal-column"] [data-msg-id]'),
    );
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.className).toContain('min-h-0');
    }

    await act(async () => {
      rerender(
        <MessageGroupView
          {...buildMessageGroupViewProps({
            assistants: veryLongAssistants,
          })}
        />,
      );
      await Promise.resolve();
    });

    expect(screen.getByTestId('message-group-horizontal-panel')).toHaveAttribute('data-panel-height', '552');
  });

  it('inline / fullscreen 的 horizontal 列宽都使用 clamp 约束，优先横向滚动而不是压坏卡片', async () => {
    let rerender!: ReturnType<typeof render>['rerender'];
    await act(async () => {
      const rendered = render(
        <MessageGroupView
          {...buildMessageGroupViewProps()}
        />,
      );
      rerender = rendered.rerender;
      await Promise.resolve();
    });

    const inlineColumn = screen.getAllByTestId('message-group-horizontal-column')[0]!;
    expect(inlineColumn.className).toContain('w-[clamp(18rem,46vw,32rem)]');
    expect(inlineColumn.className).toContain('min-w-[18rem]');
    expect(inlineColumn.className).toContain('max-w-[32rem]');

    await act(async () => {
      rerender(
        <MessageGroupView
          {...buildMessageGroupViewProps({
            presentation: 'fullscreen',
            onCloseFullscreen: () => undefined,
          })}
        />,
      );
      await Promise.resolve();
    });

    const fullscreenColumns = screen.getAllByTestId('message-group-horizontal-column');
    const fullscreenColumn = fullscreenColumns.at(-1)!;
    expect(fullscreenColumn.className).toContain('w-[clamp(20rem,48vw,40rem)]');
    expect(fullscreenColumn.className).toContain('min-w-[20rem]');
    expect(fullscreenColumn.className).toContain('max-w-[40rem]');
  });

  it('fold 模式会给正文壳体补齐 min-w-0，避免 tab strip 和正文互相挤压', async () => {
    await renderMessageGroupView({
      style: 'fold',
      foldDisplayMode: 'compact',
      foldSelectedModelId: 'assistant-1',
      gridColumns: 2,
      gridPopoverTrigger: 'hover',
    });

    expect(screen.getByTestId('message-group-layout-body').className).toContain('min-w-0');
    expect(
      document.querySelector<HTMLElement>('[data-msg-id="assistant-1"] [data-search-scope="true"]')?.className,
    ).toContain('min-w-0');
  });

  it('grid 在 inline 窄宽度下会降低当前渲染列数，但不会改写已存偏好', async () => {
    const resizeObserverHarness = installResizeObserverHarness();

    try {
      const { onUpdatePrefs } = await renderMessageGroupView({
        style: 'grid',
        foldDisplayMode: 'compact',
        foldSelectedModelId: 'assistant-1',
        gridColumns: 4,
        gridPopoverTrigger: 'hover',
      });

      const layoutBody = screen.getByTestId('message-group-layout-body');
      Object.defineProperty(layoutBody, 'clientWidth', {
        configurable: true,
        value: 620,
      });

      await act(async () => {
        await resizeObserverHarness.trigger(layoutBody);
      });

      expect(screen.getByTestId('message-group-grid').className).toContain('grid-cols-2');
      expect(onUpdatePrefs).not.toHaveBeenCalled();
    } finally {
      resizeObserverHarness.restore();
    }
  });

  it('fullscreen 承载模式会切到工作区壳体，horizontal 高度取 dialog 可用高度', async () => {
    await act(async () => {
      render(
        <MessageGroupView
          {...buildMessageGroupViewProps({
            availableHeight: 900,
            presentation: 'fullscreen',
            onCloseFullscreen: () => undefined,
          })}
        />,
      );
      await Promise.resolve();
    });

    expect(screen.getByTestId('message-group-fullscreen-shell')).toBeInTheDocument();
    expect(screen.queryByTestId('message-group-inline-shell')).not.toBeInTheDocument();
    expect(screen.getByTestId('message-group-horizontal-panel')).toHaveAttribute('data-panel-height', '812');
    expect(screen.queryByRole('button', { name: 'group.closeFullscreen' })).toBeInTheDocument();
  });

  it('fullscreen fold 模式由分组 body 承接纵向滚动', async () => {
    await renderMessageGroupView({
      style: 'fold',
      foldDisplayMode: 'compact',
      foldSelectedModelId: 'assistant-1',
      gridColumns: 2,
      gridPopoverTrigger: 'hover',
    }, {
      presentation: 'fullscreen',
      availableHeight: 900,
      onCloseFullscreen: () => undefined,
    });

    const body = screen.getByTestId('message-group-layout-body');
    expect(body.className).toContain('overflow-y-auto');
    expect(body.className).toContain('[overflow-anchor:none]');
    expect(document.querySelector('[data-msg-id="assistant-1"]')).toBeInTheDocument();
  });

  it('fullscreen vertical 模式由同一个分组 body 承接纵向滚动', async () => {
    await renderMessageGroupView({
      style: 'vertical',
      foldDisplayMode: 'compact',
      foldSelectedModelId: 'assistant-1',
      gridColumns: 2,
      gridPopoverTrigger: 'hover',
    }, {
      presentation: 'fullscreen',
      availableHeight: 900,
      onCloseFullscreen: () => undefined,
    });

    const body = screen.getByTestId('message-group-layout-body');
    expect(body.className).toContain('overflow-y-auto');
    expect(body.className).toContain('overscroll-y-contain');
    expect(document.querySelector('[data-msg-id="assistant-1"]')).toBeInTheDocument();
    expect(document.querySelector('[data-msg-id="assistant-2"]')).toBeInTheDocument();
  });

  it('fullscreen horizontal 模式不把外层 body 变成纵向滚动 owner', async () => {
    await act(async () => {
      render(
        <MessageGroupView
          {...buildMessageGroupViewProps({
            availableHeight: 900,
            presentation: 'fullscreen',
            onCloseFullscreen: () => undefined,
          })}
        />,
      );
      await Promise.resolve();
    });

    expect(screen.getByTestId('message-group-layout-body').className).not.toContain('overflow-y-auto');
    const bodies = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="message-group-horizontal-column"] [data-search-scope="true"]'),
    );
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(body.className).toContain('overflow-y-auto');
    }
  });

  it('全屏入口按钮不再带额外边框壳体', async () => {
    const onOpenFullscreen = vi.fn();
    await renderMessageGroupView({
      style: 'fold',
      foldDisplayMode: 'compact',
      foldSelectedModelId: 'assistant-1',
      gridColumns: 2,
      gridPopoverTrigger: 'hover',
    }, {
      onOpenFullscreen,
    });

    const fullscreenButton = screen.getByRole('button', { name: 'group.openFullscreen' });
    expect(fullscreenButton.className).toContain('border-0');
    expect(fullscreenButton.className).toContain('bg-transparent');
    expect(fullscreenButton.className).toContain('shadow-none');
  });

  it('horizontal 模式正文滚动区显式禁用 scroll anchoring', async () => {
    await act(async () => {
      render(
        <MessageGroupView
          {...buildMessageGroupViewProps()}
        />,
      );
      await Promise.resolve();
    });

    const bodies = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="message-group-horizontal-column"] [data-search-scope="true"]'),
    );
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(body.className).toContain('[overflow-anchor:none]');
    }
  });

  it('horizontal 模式滚动任意一列时，其它列会按对应阅读进度联动', async () => {
    await act(async () => {
      render(
        <MessageGroupView
          {...buildMessageGroupViewProps()}
        />,
      );
      await Promise.resolve();
    });

    const bodies = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="message-group-horizontal-column"] [data-search-scope="true"]'),
    );
    expect(bodies).toHaveLength(2);

    const [firstBody, secondBody] = bodies;
    Object.defineProperty(firstBody, 'clientHeight', { configurable: true, value: 200 });
    Object.defineProperty(firstBody, 'scrollHeight', { configurable: true, value: 1200 });
    Object.defineProperty(secondBody, 'clientHeight', { configurable: true, value: 200 });
    Object.defineProperty(secondBody, 'scrollHeight', { configurable: true, value: 260 });

    await act(async () => {
      firstBody.scrollTop = 180;
      fireEvent.scroll(firstBody);
      await Promise.resolve();
    });
    expect(secondBody.scrollTop).toBeCloseTo(10.8, 1);

    await act(async () => {
      firstBody.scrollTop = 130;
      fireEvent.scroll(firstBody);
      await Promise.resolve();
    });
    expect(secondBody.scrollTop).toBeCloseTo(7.8, 1);

    await act(async () => {
      secondBody.scrollTop = 40;
      fireEvent.scroll(secondBody);
      await Promise.resolve();
    });
    expect(firstBody.scrollTop).toBeCloseTo(666.67, 1);
  });

  it('horizontal 模式在流式重渲染后仍保持滚动联动', async () => {
    const streamedAssistants = assistants.map((message, index) => ({
      ...message,
      content: `${message.content}\n${'stream chunk '.repeat(index === 0 ? 40 : 18)}`,
    }));

    let rerender!: ReturnType<typeof render>['rerender'];
    await act(async () => {
      const rendered = render(
        <MessageGroupView
          {...buildMessageGroupViewProps()}
        />,
      );
      rerender = rendered.rerender;
      await Promise.resolve();
    });

    await act(async () => {
      rerender(
        <MessageGroupView
          {...buildMessageGroupViewProps({
            assistants: streamedAssistants,
            isLoading: true,
          })}
        />,
      );
      await Promise.resolve();
    });

    const bodies = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="message-group-horizontal-column"] [data-search-scope="true"]'),
    );
    expect(bodies).toHaveLength(2);

    const [firstBody, secondBody] = bodies;
    Object.defineProperty(firstBody, 'clientHeight', { configurable: true, value: 220 });
    Object.defineProperty(firstBody, 'scrollHeight', { configurable: true, value: 1320 });
    Object.defineProperty(secondBody, 'clientHeight', { configurable: true, value: 220 });
    Object.defineProperty(secondBody, 'scrollHeight', { configurable: true, value: 760 });

    await act(async () => {
      firstBody.scrollTop = 330;
      fireEvent.scroll(firstBody);
      await Promise.resolve();
    });

    expect(secondBody.scrollTop).toBeCloseTo(162, 1);
  });

  it('horizontal 模式在流式增高期间会继续按 active source 阅读进度重算其它列', async () => {
    const resizeObserverHarness = installResizeObserverHarness();

    try {
      await act(async () => {
        render(
          <MessageGroupView
            {...buildMessageGroupViewProps({
              isLoading: true,
            })}
          />,
        );
        await Promise.resolve();
      });

      const bodies = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid="message-group-horizontal-column"] [data-search-scope="true"]'),
      );
      expect(bodies).toHaveLength(2);

      const [firstBody, secondBody] = bodies;
      Object.defineProperty(firstBody, 'clientHeight', { configurable: true, value: 200 });
      Object.defineProperty(firstBody, 'scrollHeight', { configurable: true, value: 1200 });
      Object.defineProperty(secondBody, 'clientHeight', { configurable: true, value: 200 });
      Object.defineProperty(secondBody, 'scrollHeight', { configurable: true, value: 600 });

      await act(async () => {
        firstBody.scrollTop = 300;
        fireEvent.scroll(firstBody);
        await Promise.resolve();
      });
      expect(secondBody.scrollTop).toBeCloseTo(120, 1);

      Object.defineProperty(firstBody, 'scrollHeight', { configurable: true, value: 1800 });
      Object.defineProperty(secondBody, 'scrollHeight', { configurable: true, value: 1000 });

      await act(async () => {
        await resizeObserverHarness.trigger(firstBody, secondBody);
      });
      expect(secondBody.scrollTop).toBeCloseTo(150, 1);

      Object.defineProperty(secondBody, 'scrollHeight', { configurable: true, value: 1400 });

      await act(async () => {
        await resizeObserverHarness.trigger(secondBody);
      });
      expect(secondBody.scrollTop).toBeCloseTo(225, 1);
    } finally {
      resizeObserverHarness.restore();
    }
  });
});
