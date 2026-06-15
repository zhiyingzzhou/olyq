/**
 * 说明：`scroll-area.spec` 组件模块。
 *
 * 职责：
 * - 承载 `scroll-area.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createEvent, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScrollArea } from './scroll-area';

/**
 * 测试辅助函数：`defineScrollableViewport`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function defineScrollableViewport(viewport: HTMLElement, options: {
  scrollWidth: number;
  clientWidth: number;
}) {
  let scrollLeft = 0;
  Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: options.scrollWidth });
  Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: options.clientWidth });
  Object.defineProperty(viewport, 'scrollLeft', {
    configurable: true,
    get: () => scrollLeft,
    set: (value: number) => {
      scrollLeft = value;
    },
  });
  return {
    getScrollLeft: () => scrollLeft,
  };
}

describe('ScrollArea', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(16);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('双向滚动模式会透传 viewportClassName，并使用原生 overflow 容器', () => {
    const { container } = render(
      <ScrollArea
        scrollbars="both"
        scrollbarVisibility="always"
        className="h-40 w-40"
        viewportClassName="custom-viewport"
      >
        <div style={{ width: 320, height: 320 }}>overflow-content</div>
      </ScrollArea>,
    );

    const root = container.querySelector('[data-slot="scroll-area"]');
    const viewport = container.querySelector('[data-slot="scroll-area-viewport"]');

    expect(root).toHaveAttribute('data-scrollbars', 'both');
    expect(root).toHaveAttribute('data-scrollbar-visibility', 'always');
    expect(root).toHaveAttribute('data-wheel-behavior', 'native');
    expect(viewport?.className).toContain('custom-viewport');
    expect(viewport?.className).toContain('overflow-auto');
    expect(container.querySelector('[data-slot="scroll-area-scrollbar"]')).toBeNull();
  });

  it('默认使用纵向 hover 契约', () => {
    const { container } = render(
      <ScrollArea className="h-32 w-32">
        <div style={{ height: 240 }}>vertical-only</div>
      </ScrollArea>,
    );

    const root = container.querySelector('[data-slot="scroll-area"]');

    expect(root).toHaveAttribute('data-scrollbars', 'vertical');
    expect(root).toHaveAttribute('data-scrollbar-visibility', 'hover');
    expect(root).toHaveAttribute('data-wheel-behavior', 'native');
    expect(container.querySelector('[data-slot="scroll-area-viewport"]')?.className).toContain('overflow-y-auto');
    expect(container.querySelector('[data-slot="scroll-area-viewport"]')?.className).toContain('overflow-x-hidden');
  });

  it('horizontal wheelBehavior 会把滚轮 deltaY 转成横向滚动位移', () => {
    const { container } = render(
      <ScrollArea scrollbars="horizontal" wheelBehavior="horizontal" className="h-32 w-32">
        <div style={{ width: 320, height: 80 }}>horizontal-overflow</div>
      </ScrollArea>,
    );

    const viewport = container.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement;
    const { getScrollLeft } = defineScrollableViewport(viewport, {
      scrollWidth: 320,
      clientWidth: 120,
    });

    const event = createEvent.wheel(viewport, { deltaY: 48, cancelable: true });
    fireEvent(viewport, event);

    expect(getScrollLeft()).toBe(48);
    expect(event.defaultPrevented).toBe(true);
  });

  it('horizontal wheelBehavior 在 trackpad deltaX 手势下也会消费横向位移', () => {
    const { container } = render(
      <ScrollArea scrollbars="horizontal" wheelBehavior="horizontal" className="h-32 w-32">
        <div style={{ width: 320, height: 80 }}>horizontal-overflow</div>
      </ScrollArea>,
    );

    const viewport = container.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement;
    const { getScrollLeft } = defineScrollableViewport(viewport, {
      scrollWidth: 320,
      clientWidth: 120,
    });

    const event = createEvent.wheel(viewport, { deltaX: 36, deltaY: 12, cancelable: true });
    fireEvent(viewport, event);

    expect(getScrollLeft()).toBe(36);
    expect(event.defaultPrevented).toBe(true);
  });

  it('没有横向 overflow 时不会拦截 wheel', () => {
    const { container } = render(
      <ScrollArea scrollbars="horizontal" wheelBehavior="horizontal" className="h-32 w-32">
        <div style={{ width: 120, height: 80 }}>no-overflow</div>
      </ScrollArea>,
    );

    const viewport = container.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement;
    const { getScrollLeft } = defineScrollableViewport(viewport, {
      scrollWidth: 120,
      clientWidth: 120,
    });

    const event = createEvent.wheel(viewport, { deltaY: 48, cancelable: true });
    fireEvent(viewport, event);

    expect(getScrollLeft()).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it('内部纵向可滚动容器存在时，外层横向 scroll area 不会抢 deltaY', () => {
    const { container } = render(
      <ScrollArea scrollbars="horizontal" wheelBehavior="horizontal" className="h-32 w-32">
        <div style={{ width: 320, height: 120 }}>
          <div
            data-testid="nested-scrollable"
            style={{ maxHeight: 60, overflowY: 'auto' }}
          >
            <div style={{ height: 200 }}>nested overflow</div>
          </div>
        </div>
      </ScrollArea>,
    );

    const viewport = container.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement;
    const nested = container.querySelector('[data-testid="nested-scrollable"]') as HTMLElement;
    const { getScrollLeft } = defineScrollableViewport(viewport, {
      scrollWidth: 320,
      clientWidth: 120,
    });
    Object.defineProperty(nested, 'scrollHeight', { configurable: true, value: 200 });
    Object.defineProperty(nested, 'clientHeight', { configurable: true, value: 60 });

    const event = createEvent.wheel(nested, { deltaY: 48, cancelable: true });
    fireEvent(nested, event);

    expect(getScrollLeft()).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it('native wheelBehavior 不会劫持滚轮事件', () => {
    const { container } = render(
      <ScrollArea scrollbars="horizontal" className="h-32 w-32">
        <div style={{ width: 320, height: 80 }}>horizontal-overflow</div>
      </ScrollArea>,
    );

    const viewport = container.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement;
    const { getScrollLeft } = defineScrollableViewport(viewport, {
      scrollWidth: 320,
      clientWidth: 120,
    });

    const event = createEvent.wheel(viewport, { deltaY: 48, cancelable: true });
    fireEvent(viewport, event);

    expect(getScrollLeft()).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });
});
