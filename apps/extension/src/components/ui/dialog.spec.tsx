/**
 * 说明：`dialog.spec` 组件模块。
 *
 * 职责：
 * - 守住 Dialog 受控打开时的焦点清理时序；
 * - 防止外层 modal 仍保留旧焦点时，内层 Dialog 立刻打开又重新触发 `aria-hidden` 焦点告警。
 *
 * 边界：
 * - 这里只验证 Dialog 基础设施本身，不替代具体业务弹窗的交互回归。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Dialog, DialogContent, DialogTitle } from './dialog';

/**
 * 复现“外层 Dialog 已持有焦点，再打开内层 Dialog”的最小装配。
 *
 * @param innerOpen - 当前是否打开内层 Dialog。
 * @returns 嵌套 Dialog 测试树。
 */
function NestedDialogHarness({ innerOpen }: { innerOpen: boolean }) {
  return (
    <Dialog open>
      <DialogContent>
        <DialogTitle>outer dialog</DialogTitle>
        <button type="button">打开内层</button>
        <Dialog open={innerOpen}>
          <DialogContent>
            <DialogTitle>inner dialog</DialogTitle>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

describe('Dialog', () => {
  it('受控打开内层 dialog 时会先清掉外层旧焦点', async () => {
    const { rerender } = render(<NestedDialogHarness innerOpen={false} />);

    const opener = screen.getByRole('button', { name: '打开内层' });
    opener.focus();
    expect(opener).toHaveFocus();

    rerender(<NestedDialogHarness innerOpen />);

    expect(opener).not.toHaveFocus();
    expect(await screen.findByText('inner dialog')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
