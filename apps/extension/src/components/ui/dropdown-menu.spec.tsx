/**
 * 说明：`dropdown-menu.spec` 组件模块。
 *
 * 职责：
 * - 守住 DropdownMenu 在 blocking modal 内的 portal 容器回归；
 * - 防止设置类弹窗里的下拉菜单再次被 portal 到 modal shell 外层，导致内容不可见或命中失效。
 *
 * 边界：
 * - 这里只验证共享 DropdownMenu 基础设施，不替代具体业务表单的端到端回归。
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Dialog, DialogContent, DialogTitle } from './dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';
import { OVERLAY_MODAL_STACK_SHELL_SELECTOR } from './overlay-layers';

/**
 * 在真实 dialog shell 中挂一个最小 DropdownMenu，复现“弹窗内菜单”的 portal 场景。
 *
 * @returns DropdownMenu-in-dialog 测试装配。
 */
function DropdownMenuInDialogHarness() {
  const [selectedLabel, setSelectedLabel] = useState('未选择');

  return (
    <Dialog open>
      <DialogContent>
        <DialogTitle>dialog dropdown menu</DialogTitle>
        <div className="space-y-2">
          <p>{selectedLabel}</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button">打开头像菜单</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => setSelectedLabel('内置图标')}>内置图标</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </DialogContent>
    </Dialog>
  );
}

describe('DropdownMenu', () => {
  it('在 dialog 内展开时会挂到当前 modal shell，并保持菜单项可点击', async () => {
    const user = userEvent.setup();
    render(<DropdownMenuInDialogHarness />);

    await user.click(screen.getByRole('button', { name: '打开头像菜单' }));

    const menuItem = await screen.findByRole('menuitem', { name: '内置图标' });
    const modalShell = document.body.querySelector(OVERLAY_MODAL_STACK_SHELL_SELECTOR);

    expect(modalShell).not.toBeNull();
    expect(modalShell?.contains(menuItem)).toBe(true);

    await user.click(menuItem);

    expect(screen.getByText('内置图标')).toBeInTheDocument();
  });
});
