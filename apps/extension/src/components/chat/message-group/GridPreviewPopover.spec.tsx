/**
 * 说明：`GridPreviewPopover.spec` 测试模块。
 *
 * 职责：
 * - 验证多模型 `grid` 预览浮层的 hover 时序和嵌套浮层保护逻辑；
 * - 防止 compare 预览再次回退成“打开二级菜单就把外层浮层关掉”的旧问题。
 *
 * 边界：
 * - 本文件只覆盖 `GridPreviewPopover` 壳体交互，不测试 `ModelCard` 的业务操作细节。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GridPreviewPopover } from './GridPreviewPopover';

vi.mock('@/components/ui/popover', async () => {
  const React = await vi.importActual<typeof import('react')>('react');

  interface PopoverContextValue {
    readonly open: boolean;
  }

  interface MockPopoverContentProps extends React.ComponentPropsWithoutRef<'div'> {
    readonly collisionPadding?: number;
    readonly sideOffset?: number;
    readonly onOpenAutoFocus?: (event: Event) => void;
    readonly onCloseAutoFocus?: (event: Event) => void;
    readonly onInteractOutside?: (event: Event & { target: EventTarget | null }) => void;
  }

  const PopoverContext = React.createContext<PopoverContextValue>({ open: false });

  /**
   * 测试替身：`Popover`。
   *
   * @remarks
   * 只负责把受控 `open` 透传给 mock context，不复现 Radix 的定位和 dismiss 细节。
   */
  const Popover = ({
    children,
    open = false,
  }: {
    children: React.ReactNode;
    open?: boolean;
  }) => (
    <PopoverContext.Provider value={{ open }}>
      {children}
    </PopoverContext.Provider>
  );

  /**
   * 测试替身：`PopoverTrigger`。
   *
   * @remarks
   * 直接原样渲染 trigger，确保 `GridPreviewPopover` 自己的 hover 事件能落到真实 DOM 上。
   */
  const PopoverTrigger = ({ children }: { children: React.ReactNode }) => <>{children}</>;

  /**
   * 测试替身：`PopoverContent`。
   *
   * @remarks
   * 仅在 mock context 标记为打开时渲染内容，并主动丢弃 Radix 专属 props，避免污染 DOM。
   */
  const PopoverContent = React.forwardRef<
    HTMLDivElement,
    MockPopoverContentProps
  >(({
    children,
    collisionPadding: _collisionPadding,
    sideOffset: _sideOffset,
    onOpenAutoFocus: _onOpenAutoFocus,
    onCloseAutoFocus: _onCloseAutoFocus,
    onInteractOutside: _onInteractOutside,
    ...props
  }, ref) => {
    const context = React.useContext(PopoverContext);
    if (!context.open) return null;
    return (
      <div ref={ref} data-testid="grid-preview-popover-content" {...props}>
        {children}
      </div>
    );
  });
  PopoverContent.displayName = 'MockPopoverContent';

  return { Popover, PopoverTrigger, PopoverContent };
});

describe('GridPreviewPopover', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('hover 模式下在 trigger 与内容区之间移动时保持打开，离开后再延迟关闭', () => {
    render(
      <GridPreviewPopover
        triggerMode="hover"
        trigger={<span>trigger</span>}
        renderContent={() => <div>preview content</div>}
      />,
    );

    const triggerWrapper = screen.getByText('trigger').parentElement;
    expect(triggerWrapper).not.toBeNull();

    fireEvent.pointerEnter(triggerWrapper!);
    expect(screen.getByText('preview content')).toBeInTheDocument();

    const content = screen.getByTestId('grid-preview-popover-content');
    fireEvent.pointerEnter(content);
    fireEvent.pointerLeave(triggerWrapper!);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByText('preview content')).toBeInTheDocument();

    fireEvent.pointerLeave(content);
    act(() => {
      vi.advanceTimersByTime(121);
    });
    expect(screen.queryByText('preview content')).not.toBeInTheDocument();
  });

  it('嵌套浮层打开时不会误关外层预览，关闭嵌套浮层后才允许收起', () => {
    render(
      <GridPreviewPopover
        triggerMode="hover"
        trigger={<span>trigger</span>}
        renderContent={({ onNestedOverlayOpenChange }) => (
          <div>
            <button type="button" onClick={() => onNestedOverlayOpenChange(true)}>
              open nested
            </button>
            <button type="button" onClick={() => onNestedOverlayOpenChange(false)}>
              close nested
            </button>
          </div>
        )}
      />,
    );

    const triggerWrapper = screen.getByText('trigger').parentElement;
    expect(triggerWrapper).not.toBeNull();

    fireEvent.pointerEnter(triggerWrapper!);
    const content = screen.getByTestId('grid-preview-popover-content');
    fireEvent.pointerEnter(content);
    fireEvent.click(screen.getByRole('button', { name: 'open nested' }));

    fireEvent.pointerLeave(triggerWrapper!);
    fireEvent.pointerLeave(content);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole('button', { name: 'close nested' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'close nested' }));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('button', { name: 'close nested' })).not.toBeInTheDocument();
  });
});
