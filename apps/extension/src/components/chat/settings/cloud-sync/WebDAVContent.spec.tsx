/**
 * 说明：`WebDAVContent.spec` 组件模块。
 *
 * 职责：
 * - 守住 WebDAV 面板里的“多设备同步 / 备份与恢复”分组命名；
 * - 防止同步和备份再次回退成两套混杂表述；
 * - 守住 WebDAV 恢复必须先列远端版本、再由用户选择版本恢复的交互契约。
 *
 * 边界：
 * - 本文件只覆盖设置页交互与请求编排，不覆盖真实 WebDAV 服务。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const {
  broadcastStoreReloadMock,
  exportBackupAsZipMock,
  importBackupFromZipMock,
  toHostMatchPatternFromUrlMock,
  useChromeStorageConfigMock,
  confirmMock,
} = vi.hoisted(() => ({
  broadcastStoreReloadMock: vi.fn(),
  exportBackupAsZipMock: vi.fn(),
  importBackupFromZipMock: vi.fn(),
  toHostMatchPatternFromUrlMock: vi.fn(),
  useChromeStorageConfigMock: vi.fn(),
  confirmMock: vi.fn(),
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
  exportBackupAsZip: exportBackupAsZipMock,
  importBackupFromZip: importBackupFromZipMock,
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

vi.mock('./RemoteBackupVersionsDialog', () => ({
  RemoteBackupVersionsDialog: ({
    open,
    items,
    loading,
    onRestore,
  }: {
    open: boolean;
    items: Array<{ key: string; name: string }>;
    loading: boolean;
    onRestore: (item: { key: string; name: string }) => void;
  }) => {
    if (!open) return null;

    return (
      <div role="dialog" aria-label="remote backup versions">
        {loading ? <span>common.loading</span> : null}
        {!loading && items.length === 0 ? <span>cloudSyncPanel.remoteBackups.empty</span> : null}
        {items.map((item) => (
          <div key={item.key}>
            <span>{item.name}</span>
            <button type="button" onClick={() => onRestore(item)}>
              cloudSyncPanel.actions.restore
            </button>
          </div>
        ))}
      </div>
    );
  },
}));

import { WEBDAV_SYNC_STATUS_KEY } from '@/lib/sync/cloud-sync';
import { WebDAVContent } from './WebDAVContent';

describe('WebDAVContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    toHostMatchPatternFromUrlMock.mockReturnValue('https://dav.example.com/*');
    confirmMock.mockResolvedValue(true);
    importBackupFromZipMock.mockResolvedValue(undefined);
    broadcastStoreReloadMock.mockResolvedValue(undefined);

    useChromeStorageConfigMock.mockImplementation((key: string) => {
      if (key === 'olyq.sync.webdav.v1') {
        return [
          {
            syncInterval: 0,
            maxBackups: 3,
            backupProfile: 'lite',
            disableStream: false,
            url: 'https://dav.example.com/webdav',
            username: 'tester',
            password: 'secret',
            path: '/olyq',
          },
          vi.fn(),
        ];
      }

      if (key === WEBDAV_SYNC_STATUS_KEY) {
        return [
          { lastRunAt: 0, ok: false, mode: 'sync', merged: 0 },
          vi.fn(),
        ];
      }

      throw new Error(`Unexpected storage key: ${key}`);
    });
  });

  it('面板只保留一个主备份入口，并把同步降级为多设备辅助能力', () => {
    render(<WebDAVContent />);

    expect(screen.getByText('cloudSyncPanel.snapshotBackup.title')).toBeInTheDocument();
    expect(screen.getByText('cloudSyncPanel.snapshotBackup.desc')).toBeInTheDocument();
    expect(screen.getByText('cloudSyncPanel.sync.title')).toBeInTheDocument();
    expect(screen.getByText('cloudSyncPanel.sync.desc')).toBeInTheDocument();
    expect(screen.getByText('cloudSyncPanel.webdav.actions.backup')).toBeInTheDocument();
    expect(screen.getByText('cloudSyncPanel.webdav.actions.restore')).toBeInTheDocument();
    expect(screen.getByText('cloudSyncPanel.autoSync.title')).toBeInTheDocument();
    expect(screen.getByText('cloudSyncPanel.sync.runLabel')).toBeInTheDocument();
    expect(screen.getByText('cloudSyncPanel.sync.syncNow')).toBeInTheDocument();
    expect(screen.getAllByText('cloudSyncPanel.snapshotBackup.title')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /cloudSyncPanel\.webdav\.actions\.backup/ })).toHaveClass('border');
    expect(screen.getByRole('button', { name: /cloudSyncPanel\.sync\.syncNow/ })).toHaveClass('border');
  });

  it('状态同步会展示独立 JSON 目标文件，不复用快照 ZIP 目标', () => {
    render(<WebDAVContent />);

    expect(screen.getByText('cloudSyncPanel.sync.fileLabel')).toBeInTheDocument();
    expect(screen.getByText('https://dav.example.com/webdav/olyq/olyq-sync-state.v1.json')).toBeInTheDocument();
    expect(screen.getByText('https://dav.example.com/webdav/olyq/')).toBeInTheDocument();
  });

  it('WebDAV 路径固定作为目录真源，即使用户填入 zip 字符串也不会当成直连文件', () => {
    useChromeStorageConfigMock.mockImplementation((key: string) => {
      if (key === 'olyq.sync.webdav.v1') {
        return [
          {
            syncInterval: 0,
            maxBackups: 3,
            backupProfile: 'lite',
            disableStream: false,
            url: 'https://dav.example.com/webdav',
            username: 'tester',
            password: 'secret',
            path: '/exports/manual.zip',
          },
          vi.fn(),
        ];
      }

      if (key === WEBDAV_SYNC_STATUS_KEY) {
        return [
          { lastRunAt: 0, ok: false, mode: 'sync', merged: 0 },
          vi.fn(),
        ];
      }

      throw new Error(`Unexpected storage key: ${key}`);
    });

    render(<WebDAVContent />);

    expect(screen.getByText('https://dav.example.com/webdav/exports/manual.zip/')).toBeInTheDocument();
    expect(screen.getByText('https://dav.example.com/webdav/exports/manual.zip/olyq-sync-state.v1.json')).toBeInTheDocument();
  });

  it('从 WebDAV 恢复会先列远端备份版本，并排除同步状态 JSON', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PROPFIND') {
        return new Response(`<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/webdav/olyq/</d:href>
  </d:response>
  <d:response>
    <d:href>/webdav/olyq/olyq-sync-state.v1.json</d:href>
    <d:propstat><d:prop><d:getlastmodified>Tue, 28 Apr 2026 15:02:00 GMT</d:getlastmodified><d:getcontentlength>114114</d:getcontentlength></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/webdav/olyq/olyq-backup-20260502033923108.zip</d:href>
    <d:propstat><d:prop><d:getlastmodified>Sat, 02 May 2026 03:39:23 GMT</d:getlastmodified><d:getcontentlength>158630</d:getcontentlength></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/webdav/olyq/notes.txt</d:href>
    <d:propstat><d:prop><d:getlastmodified>Sat, 02 May 2026 03:40:00 GMT</d:getlastmodified><d:getcontentlength>12</d:getcontentlength></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/webdav/olyq/manual-olyq-backup.zip</d:href>
    <d:propstat><d:prop><d:getlastmodified>Sat, 02 May 2026 03:41:00 GMT</d:getlastmodified><d:getcontentlength>12</d:getcontentlength></d:prop></d:propstat>
  </d:response>
</d:multistatus>`, { status: 207 });
      }

      if (init?.method === 'GET') {
        return new Response(new Blob(['zip']));
      }

      throw new Error(`Unexpected fetch: ${String(input)} ${init?.method || 'GET'}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WebDAVContent />);

    await user.click(screen.getByRole('button', { name: /cloudSyncPanel\.webdav\.actions\.restore/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://dav.example.com/webdav/olyq/',
        expect.objectContaining({
          method: 'PROPFIND',
          headers: expect.objectContaining({ Depth: '1' }),
        }),
      );
    });
    expect(await screen.findByText('olyq-backup-20260502033923108.zip')).toBeInTheDocument();
    expect(screen.queryByText('olyq-sync-state.v1.json')).not.toBeInTheDocument();
    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument();
    expect(screen.queryByText('manual-olyq-backup.zip')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'cloudSyncPanel.actions.restore' }));

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({
        title: 'cloudSyncPanel.remoteBackups.restoreConfirmTitle',
      }));
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://dav.example.com/webdav/olyq/olyq-backup-20260502033923108.zip',
        expect.objectContaining({ method: 'GET' }),
      );
    });
    await waitFor(() => {
      expect(importBackupFromZipMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(broadcastStoreReloadMock).toHaveBeenCalledTimes(1);
    });
  });

  it('WebDAV 目录为空时不会自动 GET 旧 lastBackupUrl 或其它版本', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('PROPFIND');
      return new Response('<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" />', { status: 207 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<WebDAVContent />);

    await user.click(screen.getByRole('button', { name: /cloudSyncPanel\.webdav\.actions\.restore/ }));

    expect(await screen.findByText('cloudSyncPanel.remoteBackups.empty')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(importBackupFromZipMock).not.toHaveBeenCalled();
    expect(broadcastStoreReloadMock).not.toHaveBeenCalled();
  });
});
