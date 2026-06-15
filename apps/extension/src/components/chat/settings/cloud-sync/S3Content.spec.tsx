/**
 * 说明：`S3Content.spec` 组件模块。
 *
 * 职责：
 * - 守住 S3 设置面板“测试连接”失败时的 toast 展示契约；
 * - 防止服务端详细错误再次被 UI 吞成单条笼统提示；
 * - 守住远端备份列表选择恢复和删除指定 key 的交互契约。
 *
 * 边界：
 * - 本文件覆盖 S3 面板 UI 编排，不覆盖真实 S3 服务。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const {
  deleteObjectMock,
  getObjectBlobMock,
  listObjectsMock,
  putObjectMock,
  testConnectionMock,
  toHostMatchPatternFromUrlMock,
  useChromeStorageConfigMock,
  confirmMock,
  broadcastStoreReloadMock,
  importBackupFromZipMock,
} = vi.hoisted(() => ({
  deleteObjectMock: vi.fn(),
  getObjectBlobMock: vi.fn(),
  listObjectsMock: vi.fn(),
  putObjectMock: vi.fn(),
  testConnectionMock: vi.fn(),
  toHostMatchPatternFromUrlMock: vi.fn(),
  useChromeStorageConfigMock: vi.fn(),
  confirmMock: vi.fn(),
  broadcastStoreReloadMock: vi.fn(),
  importBackupFromZipMock: vi.fn(),
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, params?: Record<string, unknown>) => {
        if (!params || Object.keys(params).length === 0) return key;
        return `${key} ${JSON.stringify(params)}`;
      },
    }),
  };
});

vi.mock('@/hooks/useChromeStorageConfig', () => ({
  useChromeStorageConfig: useChromeStorageConfigMock,
}));

vi.mock('@/lib/backup', () => ({
  broadcastStoreReload: broadcastStoreReloadMock,
  exportBackupAsZip: vi.fn(),
  importBackupFromZip: importBackupFromZipMock,
}));

vi.mock('@/lib/s3-client', () => ({
  deleteObject: deleteObjectMock,
  getObjectBlob: getObjectBlobMock,
  listObjects: listObjectsMock,
  putObject: putObjectMock,
  testConnection: testConnectionMock,
}));

vi.mock('@/lib/extension/host-match-patterns', () => ({
  toHostMatchPatternFromUrl: toHostMatchPatternFromUrlMock,
}));

vi.mock('@/hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: confirmMock,
    ConfirmDialogPortal: () => null,
  }),
}));

import { S3_SYNC_STATUS_KEY } from '@/lib/sync/cloud-sync';
import { I18nError } from '@/lib/i18n/error';
import { useToast } from '@/hooks/useToast';
import { Toaster } from '@/components/ui/toaster';
import { S3Content } from './S3Content';

describe('S3Content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    useToast.setState({ toasts: [] });

    toHostMatchPatternFromUrlMock.mockReturnValue('https://cos.example.com/*');
    confirmMock.mockResolvedValue(true);
    getObjectBlobMock.mockResolvedValue(new Blob(['zip']));
    importBackupFromZipMock.mockResolvedValue(undefined);
    broadcastStoreReloadMock.mockResolvedValue(undefined);

    useChromeStorageConfigMock.mockImplementation((key: string) => {
      if (key === 'olyq.sync.s3.v1') {
        return [
          {
            syncInterval: 0,
            maxBackups: 0,
            backupProfile: 'full',
            endpoint: 'https://cos.example.com',
            region: 'ap-shanghai',
            bucket: 'openlist-1251530225',
            accessKeyId: 'ak',
            secretAccessKey: 'sk',
            root: 'olyq',
          },
          vi.fn(),
        ];
      }

      if (key === S3_SYNC_STATUS_KEY) {
        return [
          { lastRunAt: 0, ok: false, mode: 'sync', merged: 0 },
          vi.fn(),
        ];
      }

      throw new Error(`Unexpected storage key: ${key}`);
    });
  });

  it('测试连接失败时会以 toast 描述展示服务端详细错误，而不是只显示笼统标题', async () => {
    testConnectionMock.mockRejectedValue(
      new I18nError('errors.s3ConnectionFailedWithDetail', {
        status: 404,
        detail: 'Code=NoSuchKey; Message=The specified key does not exist.; Resource=/openlist-1251530225; RequestId=req-1; TraceId=trace-1',
      }),
    );

    render(
      <>
        <Toaster />
        <S3Content />
      </>,
    );

    expect(screen.getByText('cloudSyncPanel.snapshotBackup.title')).toBeInTheDocument();
    expect(screen.getByText('cloudSyncPanel.snapshotBackup.desc')).toBeInTheDocument();
    expect(screen.getByText('cloudSyncPanel.sync.title')).toBeInTheDocument();
    expect(screen.getByText('cloudSyncPanel.sync.desc')).toBeInTheDocument();
    expect(screen.getByText('cloudSyncPanel.s3.actions.backup')).toBeInTheDocument();
    expect(screen.getByText('cloudSyncPanel.s3.manage.title')).toBeInTheDocument();
    expect(screen.getByText('cloudSyncPanel.sync.runLabel')).toBeInTheDocument();
    expect(screen.getByText('cloudSyncPanel.sync.syncNow')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'cloudSyncPanel.sync.syncNow' })).toHaveClass('border');

    fireEvent.click(screen.getByRole('button', { name: 'cloudSyncPanel.s3.actions.testConnection' }));

    await waitFor(() => {
      expect(testConnectionMock).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText('cloudSyncPanel.s3.toast.connectionFailedTitle')).toBeInTheDocument();
    expect(
      screen.getAllByText((content) =>
        content.includes('errors.s3ConnectionFailedWithDetail')
        && content.includes('NoSuchKey')
        && content.includes('TraceId=trace-1'),
      ).some((node) => node instanceof HTMLElement && Boolean(node.closest('[data-radix-collection-item]'))),
    ).toBe(true);
  });

  it('管理 S3 备份会展示远端备份版本，恢复前确认并只下载选中的 key', async () => {
    listObjectsMock.mockResolvedValue([
      {
        key: 'olyq/olyq-sync-state.v1.json',
        lastModified: '2026-05-02T03:40:00.000Z',
        size: 1024,
      },
      {
        key: 'olyq/olyq-backup-20260502033923108.zip',
        lastModified: '2026-05-02T03:39:23.000Z',
        size: 158630,
      },
      {
        key: 'olyq/olyq-backup-20260428150145183-lite.zip',
        lastModified: '2026-04-28T15:01:45.000Z',
        size: 178120,
      },
      {
        key: 'olyq/manual-olyq-backup.zip',
        lastModified: '2026-05-02T03:41:00.000Z',
        size: 99,
      },
    ]);

    render(<S3Content />);

    fireEvent.click(screen.getByRole('button', { name: 'cloudSyncPanel.s3.manage.title' }));

    await waitFor(() => {
      expect(listObjectsMock).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'openlist-1251530225' }), 'olyq/');
    });
    expect(await screen.findByText('olyq-backup-20260502033923108.zip')).toBeInTheDocument();
    expect(screen.getByText('olyq-backup-20260428150145183-lite.zip')).toBeInTheDocument();
    expect(screen.queryByText('olyq-sync-state.v1.json')).not.toBeInTheDocument();
    expect(screen.queryByText('manual-olyq-backup.zip')).not.toBeInTheDocument();

    const restoreButtons = screen.getAllByRole('button', { name: /cloudSyncPanel\.actions\.restore/ });
    fireEvent.click(restoreButtons[0]);

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({
        title: 'cloudSyncPanel.remoteBackups.restoreConfirmTitle',
      }));
      expect(getObjectBlobMock).toHaveBeenCalledWith(expect.any(Object), 'olyq/olyq-backup-20260502033923108.zip');
      expect(importBackupFromZipMock).toHaveBeenCalledTimes(1);
      expect(broadcastStoreReloadMock).toHaveBeenCalledTimes(1);
    });
  });

  it('删除 S3 备份只删除当前行对应的 key，并同步更新列表', async () => {
    listObjectsMock.mockResolvedValue([
      {
        key: 'olyq/olyq-backup-20260502033923108.zip',
        lastModified: '2026-05-02T03:39:23.000Z',
        size: 158630,
      },
    ]);
    deleteObjectMock.mockResolvedValue(undefined);

    render(<S3Content />);

    fireEvent.click(screen.getByRole('button', { name: 'cloudSyncPanel.s3.manage.title' }));
    expect(await screen.findByText('olyq-backup-20260502033923108.zip')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));

    await waitFor(() => {
      expect(deleteObjectMock).toHaveBeenCalledWith(expect.any(Object), 'olyq/olyq-backup-20260502033923108.zip');
    });
    expect(screen.queryByText('olyq-backup-20260502033923108.zip')).not.toBeInTheDocument();
  });
});
