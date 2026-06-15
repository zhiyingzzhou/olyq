/**
 * 说明：`tooltip.spec` 组件模块。
 *
 * 职责：
 * - 守住 Tooltip 在 blocking modal 内的 portal 容器回归；
 * - 防止弹窗内 tooltip 再次 portal 到 modal shell 外层后被层级压住。
 *
 * 边界：
 * - 这里只验证共享 Tooltip 基础设施，不替代具体业务弹窗的交互回归。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Dialog, DialogContent, DialogTitle } from './dialog';
import { OVERLAY_MODAL_STACK_SHELL_SELECTOR } from './overlay-layers';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

/**
 * 在真实 dialog shell 中挂一个最小 Tooltip，复现“弹窗内 icon hover / focus 提示”的 portal 场景。
 */
function TooltipInDialogHarness() {
  return (
    <TooltipProvider delayDuration={0}>
      <Dialog open>
        <DialogContent>
          <DialogTitle>dialog tooltip</DialogTitle>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button">打开说明</button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">当前模型类型说明</p>
            </TooltipContent>
          </Tooltip>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

describe('Tooltip', () => {
  it('在 dialog 内打开时会挂到当前 modal shell，而不是回到 body 根层', async () => {
    render(<TooltipInDialogHarness />);

    fireEvent.focus(screen.getByRole('button', { name: '打开说明' }));

    const tooltip = await screen.findByRole('tooltip');
    const modalShell = document.body.querySelector(OVERLAY_MODAL_STACK_SHELL_SELECTOR);

    expect(tooltip).toHaveTextContent('当前模型类型说明');
    expect(modalShell).not.toBeNull();
    expect(modalShell?.contains(tooltip)).toBe(true);
  });
});
