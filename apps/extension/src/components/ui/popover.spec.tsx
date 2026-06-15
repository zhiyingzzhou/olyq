/**
 * 说明：`popover.spec` 组件模块。
 *
 * 职责：
 * - 守住 Popover 在 blocking modal 内的 portal 容器回归；
 * - 防止设置类弹窗里的可交互 popover 再次 portal 到 modal shell 外层。
 *
 * 边界：
 * - 这里只验证共享 Popover 基础设施，不替代具体业务表单的端到端回归。
 */
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Dialog, DialogContent, DialogTitle } from './dialog';
import { OVERLAY_MODAL_STACK_SHELL_SELECTOR } from './overlay-layers';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

/**
 * 在真实 dialog shell 中挂一个最小 Popover，复现“设置弹窗内浮层”的 portal 场景。
 *
 * @returns Popover-in-dialog 测试装配。
 */
function PopoverInDialogHarness() {
  const [selectedLabel, setSelectedLabel] = useState('未选择');

  return (
    <Dialog open>
      <DialogContent>
        <DialogTitle>dialog popover</DialogTitle>
        <div className="space-y-2">
          <p>{selectedLabel}</p>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button">打开语言列表</button>
            </PopoverTrigger>
            <PopoverContent className="w-56">
              <div
                data-testid="popover-scroll-region"
                className="max-h-24 space-y-2 overflow-y-auto"
                style={{ overflowY: 'auto' }}
              >
                {Array.from({ length: 8 }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setSelectedLabel(index === 7 ? 'Русский' : `占位 ${index}`)}
                  >
                    {index === 7 ? '选择俄语' : `占位按钮 ${index}`}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </DialogContent>
    </Dialog>
  );
}

describe('Popover', () => {
  it('在 dialog 内展开时会挂到当前 modal shell，并保持内容可点击', async () => {
    render(<PopoverInDialogHarness />);

    fireEvent.click(screen.getByRole('button', { name: '打开语言列表' }));

    const contentButton = await screen.findByRole('button', { name: '选择俄语' });
    const modalShell = document.body.querySelector(OVERLAY_MODAL_STACK_SHELL_SELECTOR);
    const scrollRegion = screen.getByTestId('popover-scroll-region');

    Object.defineProperties(scrollRegion, {
      clientHeight: { configurable: true, value: 96 },
      scrollHeight: { configurable: true, value: 320 },
      scrollTop: { configurable: true, value: 0, writable: true },
    });

    expect(modalShell).not.toBeNull();
    expect(modalShell?.contains(contentButton)).toBe(true);

    const wheelEvent = createEvent.wheel(scrollRegion, { cancelable: true, deltaY: 48 });
    fireEvent(scrollRegion, wheelEvent);

    expect(wheelEvent.defaultPrevented).toBe(false);

    fireEvent.click(contentButton);

    expect(screen.getByText('Русский')).toBeInTheDocument();
  });
});
