/**
 * 说明：`useConfirmDialog.spec` 组件测试模块。
 *
 * 职责：
 * - 锁定共享危险确认弹窗的统一视觉结构；
 * - 防止删除、清空、恢复和重生成确认重新分叉成散落样式。
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useConfirmDialog } from './useConfirmDialog';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

afterEach(() => {
  document.body.removeAttribute('data-confirm-result');
});

/** 测试用确认弹窗宿主。 */
function ConfirmDialogHarness() {
  const { confirm, ConfirmDialogPortal } = useConfirmDialog();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          void confirm({
            title: '删除供应商',
            description: '确定要删除供应商 "BigModel" 吗？此操作无法撤销。',
            confirmLabel: '删除',
            cancelLabel: '取消',
            variant: 'destructive',
          }).then((ok) => {
            document.body.setAttribute('data-confirm-result', String(ok));
          });
        }}
      >
        open destructive confirm
      </button>
      <ConfirmDialogPortal />
    </>
  );
}

describe('useConfirmDialog', () => {
  it('destructive 确认使用统一警示图标、标题、说明和右侧按钮布局', async () => {
    render(<ConfirmDialogHarness />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'open destructive confirm' }));
    });

    expect(screen.getByRole('alertdialog')).toHaveClass('w-[min(400px,calc(100vw-1.5rem))]', 'rounded-lg', 'p-0', 'shadow-lg');
    expect(screen.getByTestId('confirm-dialog-warning-icon')).toHaveClass('bg-destructive/10', 'text-destructive');
    expect(screen.getByRole('heading', { name: '删除供应商' })).toHaveClass('text-lg', 'font-semibold');
    expect(screen.getByText('确定要删除供应商 "BigModel" 吗？此操作无法撤销。')).toHaveClass('text-sm', 'text-muted-foreground');
    expect(screen.getByRole('button', { name: '取消' })).toHaveClass('border', 'min-w-20');
    expect(screen.getByRole('button', { name: '删除' })).toHaveClass('bg-destructive', 'min-w-20');
  });

  it('destructive 确认打开后默认聚焦取消按钮，取消和确认分别返回 false / true', async () => {
    render(<ConfirmDialogHarness />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'open destructive confirm' }));
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '取消' })).toHaveFocus();
    });

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => {
      expect(document.body).toHaveAttribute('data-confirm-result', 'false');
    });

    document.body.removeAttribute('data-confirm-result');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'open destructive confirm' }));
    });
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    await waitFor(() => {
      expect(document.body).toHaveAttribute('data-confirm-result', 'true');
    });
  });

  it('按 Esc 关闭 destructive 确认时返回 false', async () => {
    const user = userEvent.setup();
    render(<ConfirmDialogHarness />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'open destructive confirm' }));
    });
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(document.body).toHaveAttribute('data-confirm-result', 'false');
    });
  });
});
