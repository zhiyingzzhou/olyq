/**
 * 说明：`radix-auto-blur.test` 组件模块。
 *
 * 职责：
 * - 承载 `radix-auto-blur.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  blurActiveElement,
  blurActiveElementOutside,
  preventRadixCloseAutoFocus,
  usePreparedRadixModalOpenState,
  useAutoBlurActiveElementOnOpen,
} from '@/components/ui/radix-auto-blur';

/**
 * 测试辅助函数：`BlurOnOpenProbe`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function BlurOnOpenProbe({ open }: { open: boolean }) {
  useAutoBlurActiveElementOnOpen(open);
  return null;
}

/**
 * 测试辅助函数：`PreparedOpenProbe`。
 *
 * @remarks
 * 用于验证“请求打开”和“实际交给 Radix 打开”被拆分后的状态流，不作为运行时代码复用。
 */
function PreparedOpenProbe({ open }: { open: boolean }) {
  const preparedOpen = usePreparedRadixModalOpenState(open);
  return <div data-testid="prepared-open">{preparedOpen ? 'open' : 'closed'}</div>;
}

describe('radix-auto-blur', () => {
  it('blurActiveElementOutside 不会 blur 容器内焦点', () => {
    render(
      <div data-testid="container">
        <button type="button">inside</button>
      </div>,
    );

    const container = screen.getByTestId('container');
    const button = screen.getByRole('button', { name: 'inside' });
    button.focus();

    blurActiveElementOutside(container);

    expect(button).toHaveFocus();
  });

  it('blurActiveElement 会清掉当前旧焦点', () => {
    render(<button type="button">outside</button>);

    const button = screen.getByRole('button', { name: 'outside' });
    button.focus();
    expect(button).toHaveFocus();

    blurActiveElement();

    expect(button).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
  });

  it('useAutoBlurActiveElementOnOpen 在打开时会先 blur 当前焦点', () => {
    const { rerender } = render(
      <>
        <button type="button">trigger</button>
        <BlurOnOpenProbe open={false} />
      </>,
    );

    const trigger = screen.getByRole('button', { name: 'trigger' });
    trigger.focus();
    expect(trigger).toHaveFocus();

    rerender(
      <>
        <button type="button">trigger</button>
        <BlurOnOpenProbe open />
      </>,
    );

    expect(trigger).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
  });

  it('useAutoBlurActiveElementOnOpen 在首次以打开态挂载时也会先 blur 当前焦点', () => {
    render(<button type="button">trigger</button>);

    const trigger = screen.getByRole('button', { name: 'trigger' });
    trigger.focus();
    expect(trigger).toHaveFocus();

    render(<BlurOnOpenProbe open />);

    expect(trigger).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
  });

  it('usePreparedRadixModalOpenState 会先清旧焦点，再放行 modal 打开', () => {
    const { rerender } = render(
      <>
        <button type="button">trigger</button>
        <PreparedOpenProbe open={false} />
      </>,
    );

    const trigger = screen.getByRole('button', { name: 'trigger' });
    trigger.focus();
    expect(trigger).toHaveFocus();
    expect(screen.getByTestId('prepared-open')).toHaveTextContent('closed');

    rerender(
      <>
        <button type="button">trigger</button>
        <PreparedOpenProbe open />
      </>,
    );

    expect(trigger).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
    expect(screen.getByTestId('prepared-open')).toHaveTextContent('open');
  });

  it('preventRadixCloseAutoFocus 会阻止默认 focus restore 并清掉当前焦点', () => {
    render(<button type="button">close target</button>);

    const button = screen.getByRole('button', { name: 'close target' });
    button.focus();
    expect(button).toHaveFocus();

    let prevented = false;
    const event = {
      defaultPrevented: false,
            /**
       * 内部方法：`preventDefault`。
       *
       * @remarks
       * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
       */
      preventDefault() {
        prevented = true;
        this.defaultPrevented = true;
      },
    };

    preventRadixCloseAutoFocus(event);

    expect(prevented).toBe(true);
    expect(button).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
  });
});
