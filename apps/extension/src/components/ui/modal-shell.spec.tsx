/**
 * 说明：`modal-shell.spec` 组件模块。
 *
 * 职责：
 * - 守住阻塞式 modal 采用统一 shell 层级的回归约束；
 * - 防止再次出现“后开的弹窗内容在最上面，但遮罩还卡在旧弹窗内容下方”的分裂层级。
 *
 * 边界：
 * - 本文件只验证共享 dialog shell 的 DOM 结构契约，不替代浏览器里的真实视觉回归。
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from './alert-dialog';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import {
  OVERLAY_MODAL_BACKDROP_LAYER_CLASS,
  OVERLAY_MODAL_CONTENT_LAYER_CLASS,
  OVERLAY_MODAL_STACK_SHELL_CLASS,
} from './overlay-layers';

describe('modal shell stacking', () => {
  it('每个 dialog 都把遮罩和内容包在同一个 modal shell 中', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>outer dialog</DialogTitle>
          <Dialog open>
            <DialogContent>
              <DialogTitle>inner dialog</DialogTitle>
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>,
    );

    const shells = Array.from(document.body.querySelectorAll('[data-olyq-overlay-shell="modal"]'));
    expect(shells).toHaveLength(2);

    shells.forEach((shell) => {
      expect(shell).toHaveClass(...OVERLAY_MODAL_STACK_SHELL_CLASS.split(' '));
      const backdrop = shell.querySelector('[data-olyq-overlay-part="backdrop"]');
      const content = shell.querySelector('[data-olyq-overlay-part="content"]');
      expect(backdrop).not.toBeNull();
      expect(content).not.toBeNull();
      expect(backdrop).toHaveClass(...OVERLAY_MODAL_BACKDROP_LAYER_CLASS.split(' '));
      expect(content).toHaveClass(...OVERLAY_MODAL_CONTENT_LAYER_CLASS.split(' '));
    });
  });

  it('共享居中弹窗默认保留窄屏左右安全边距', () => {
    render(
      <>
        <Dialog open>
          <DialogContent>
            <DialogTitle>dialog content</DialogTitle>
          </DialogContent>
        </Dialog>
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogTitle>alert dialog content</AlertDialogTitle>
            <AlertDialogDescription>alert dialog description</AlertDialogDescription>
          </AlertDialogContent>
        </AlertDialog>
      </>,
    );

    const contents = Array.from(document.body.querySelectorAll('[data-olyq-overlay-part="content"]'));
    expect(contents).toHaveLength(2);
    contents.forEach((content) => {
      expect(content).toHaveClass('w-[calc(100vw-1.5rem)]');
    });
  });
});
