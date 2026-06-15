/**
 * 说明：`FilesDialog.preview.spec` 组件模块。
 *
 * 职责：
 * - 承载 `FilesDialog.preview.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OVERLAY_MODAL_PREVIEW_SHELL_CLASS,
  OVERLAY_MODAL_STACK_SHELL_SELECTOR,
} from '@/components/ui/overlay-layers';

const { listAttachmentMetas, getAttachmentBlob } = vi.hoisted(() => ({
  listAttachmentMetas: vi.fn(async () => ([
    {
      id: 'img-1',
      kind: 'image' as const,
      name: 'demo.png',
      mime: 'image/png',
      size: 1234,
      createdAt: 1710000000000,
    },
  ])),
  getAttachmentBlob: vi.fn(async () => new Blob(['demo'], { type: 'image/png' })),
}));

// 关键：保持 t 引用稳定，避免因为依赖变更导致组件 effect 无限重跑（渲染死循环）。
const t = vi.hoisted(() => (key: string) => key);

vi.mock('react-i18next', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t }),
  };
});

vi.mock('@/hooks/useToast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/lib/attachments', () => ({
  listAttachmentMetas,
  getAttachmentBlob,
  deleteAttachments: vi.fn(),
}));

vi.mock('@/lib/local-backup', () => ({
  listLocalBackups: vi.fn(async () => []),
  getLocalBackupBlob: vi.fn(),
  deleteManagedLocalBackup: vi.fn(),
}));

vi.mock('@/lib/backup', () => ({
  broadcastStoreReload: vi.fn(),
  importBackupFromZip: vi.fn(),
}));

import { FilesDialog } from './FilesDialog';

describe('FilesDialog preview overlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:preview-image') as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
    globalThis.ResizeObserver = class ResizeObserver {
            /**
       * 内部方法：`observe`。
       *
       * @remarks
       * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
       */
      observe() {}
            /**
       * 内部方法：`unobserve`。
       *
       * @remarks
       * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
       */
      unobserve() {}
            /**
       * 内部方法：`disconnect`。
       *
       * @remarks
       * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
       */
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  it('点击预览遮罩时，不应把底层文件管理弹窗一起关闭', async () => {
    const onClose = vi.fn();
    const { getByRole, getByTestId, queryByTestId } = render(<FilesDialog open onClose={onClose} />);

    await waitFor(() => {
      expect(listAttachmentMetas).toHaveBeenCalled();
      expect(getByRole('button', { name: 'files.preview' })).toBeInTheDocument();
    });

    fireEvent.click(getByRole('button', { name: 'files.preview' }));

    const overlay = await waitFor(() => getByTestId('media-preview-overlay'));
    expect(overlay).toHaveClass(...OVERLAY_MODAL_PREVIEW_SHELL_CLASS.split(' '));
    expect(overlay).toBe(document.body.querySelector('[data-media-preview-root="true"]'));
    expect(overlay.matches(OVERLAY_MODAL_STACK_SHELL_SELECTOR)).toBe(true);
    fireEvent.pointerDown(overlay);
    fireEvent.click(overlay);

    await waitFor(() => expect(queryByTestId('media-preview-overlay')).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(getByRole('dialog', { name: 'files.title' })).toBeInTheDocument();
  });

  it('点击预览底部工具栏时，不应关闭文件管理弹窗', async () => {
    const onClose = vi.fn();
    const { getByRole, getByTestId } = render(<FilesDialog open onClose={onClose} />);

    await waitFor(() => {
      expect(listAttachmentMetas).toHaveBeenCalled();
      expect(getByRole('button', { name: 'files.preview' })).toBeInTheDocument();
    });

    fireEvent.click(getByRole('button', { name: 'files.preview' }));
    await waitFor(() => expect(getByTestId('media-preview-overlay')).toBeInTheDocument());

    const zoomInButton = getByRole('button', { name: 'markdown.viewer.zoomIn' });
    fireEvent.pointerDown(zoomInButton);
    fireEvent.click(zoomInButton);

    expect(onClose).not.toHaveBeenCalled();
    expect(getByRole('dialog', { name: 'files.title' })).toBeInTheDocument();
    expect(getByTestId('media-preview-overlay')).toBeInTheDocument();
  });

  it('文件管理关闭后，应重置预览状态，重新打开时不应残留旧预览', async () => {
    const onClose = vi.fn();
    const { getByRole, getByTestId, queryByTestId, rerender } = render(<FilesDialog open onClose={onClose} />);

    await waitFor(() => {
      expect(listAttachmentMetas).toHaveBeenCalled();
      expect(getByRole('button', { name: 'files.preview' })).toBeInTheDocument();
    });

    fireEvent.click(getByRole('button', { name: 'files.preview' }));
    await waitFor(() => expect(getByTestId('media-preview-overlay')).toBeInTheDocument());

    rerender(<FilesDialog open={false} onClose={onClose} />);
    await waitFor(() => expect(queryByTestId('media-preview-overlay')).not.toBeInTheDocument());

    rerender(<FilesDialog open onClose={onClose} />);
    await waitFor(() => expect(getByRole('dialog', { name: 'files.title' })).toBeInTheDocument());
    expect(queryByTestId('media-preview-overlay')).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-image');
  });
});
