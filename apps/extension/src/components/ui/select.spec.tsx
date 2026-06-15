/**
 * 说明：`select.spec` 组件模块。
 *
 * 职责：
 * - 守住 Select 在 blocking modal 内的 portal 容器回归；
 * - 防止下拉内容再次被 portal 到 modal shell 外层，导致列表命中失效。
 *
 * 边界：
 * - 这里只验证共享 Select 基础设施，不替代具体业务表单的端到端回归。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { Dialog, DialogContent, DialogTitle } from './dialog';
import { OVERLAY_MODAL_STACK_SHELL_SELECTOR } from './overlay-layers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

const originalScrollIntoView = Element.prototype.scrollIntoView;

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

/**
 * 在真实 dialog shell 中挂一个最小 Select，复现“弹窗内选择器”的 portal 场景。
 *
 * @returns Select-in-dialog 测试装配。
 */
function SelectInDialogHarness() {
  return (
    <Dialog open>
      <DialogContent>
        <DialogTitle>dialog select</DialogTitle>
        <Select defaultValue="wrench">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="wrench">工具</SelectItem>
            <SelectItem value="sparkles">灵感</SelectItem>
          </SelectContent>
        </Select>
      </DialogContent>
    </Dialog>
  );
}

describe('Select', () => {
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

  it('在 dialog 内展开时会挂到当前 modal shell，并保持选项可点击', async () => {
    render(<SelectInDialogHarness />);

    fireEvent.click(screen.getByRole('combobox'));

    const listbox = await screen.findByRole('listbox');
    const modalShell = document.body.querySelector(OVERLAY_MODAL_STACK_SHELL_SELECTOR);

    expect(modalShell).not.toBeNull();
    expect(modalShell?.contains(listbox)).toBe(true);

    fireEvent.click(await screen.findByRole('option', { name: '灵感' }));

    expect(screen.getByRole('combobox')).toHaveTextContent('灵感');
  });
});
