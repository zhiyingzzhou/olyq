/**
 * 说明：`LocalBackupContent.spec` 组件模块。
 *
 * 职责：
 * - 守住本地自动快照关键配置的确定性保存；
 * - 验证后台可观测状态能在设置面板里展示，避免用户只看到间隔却无法判断任务是否运行；
 * - 覆盖目录导出降级提示，确保后台非打扰权限策略对用户可解释。
 *
 * 边界：
 * - 本文件不执行真实 IndexedDB 备份、不触碰 File System Access；
 * - Service Worker alarm 与状态落盘由 `backup-scheduler.test.ts` 覆盖。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const {
  clearExportDirHandleMock,
  createLocalBackupSnapshotMock,
  deleteManagedLocalBackupMock,
  getExportDirHandleMock,
  getLocalBackupBlobMock,
  listLocalBackupsMock,
  patchConfigMock,
  readLocalBackupScheduleStatusMock,
  saveConfigMock,
  setExportDirHandleMock,
  translateMock,
  useChromeStorageConfigMock,
  writeClipboardMock,
} = vi.hoisted(() => ({
  clearExportDirHandleMock: vi.fn(),
  createLocalBackupSnapshotMock: vi.fn(),
  deleteManagedLocalBackupMock: vi.fn(),
  getExportDirHandleMock: vi.fn(),
  getLocalBackupBlobMock: vi.fn(),
  listLocalBackupsMock: vi.fn(),
  patchConfigMock: vi.fn(),
  readLocalBackupScheduleStatusMock: vi.fn(),
  saveConfigMock: vi.fn(),
  setExportDirHandleMock: vi.fn(),
  writeClipboardMock: vi.fn(),
  translateMock: vi.fn((key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      'errors.backupFormatUnsupported': '不支持的备份格式',
      'common.close': '关闭',
      'common.copied': '已复制',
      'cloudSyncPanel.localBackup.status.detail.valueLabels.backupProfile.full': '完整备份',
      'cloudSyncPanel.localBackup.status.detail.valueLabels.runtime.offscreen': '离屏文档',
      'cloudSyncPanel.localBackup.status.detail.valueLabels.phase.local_backup_snapshot': '创建本地快照',
      'cloudSyncPanel.localBackup.status.detail.valueLabels.phase.status_missing_detail': '读取旧失败状态',
      'cloudSyncPanel.localBackup.status.detail.valueLabels.taskType.local_backup_auto': '本地自动快照',
      'cloudSyncPanel.localBackup.status.detail.reasonCodes.backup_format_detail_missing': '旧失败记录缺少具体原因码；下一次自动快照会写入真实原因。',
      'cloudSyncPanel.localBackup.status.detail.reasonCodes.backup_archive_app_version_missing': '备份清单缺少应用版本。',
      'cloudSyncPanel.localBackup.status.detail.notes.reasonCodeMissingLegacy': '这是一条旧失败记录，自动任务当时只保存了泛化错误，没有保存具体原因码；下一次自动快照如果仍失败，会写入真实原因码。',
      'cloudSyncPanel.localBackup.status.detail.notes.statusMissingDetail': '这条失败状态缺少详情，是旧写入路径生成的；等待下一次自动任务刷新。',
      'cloudSyncPanel.localBackup.status.detail.copyDiagnostics': '复制诊断信息',
    };
    const translated = translations[key] ?? key;
    if (!params || Object.keys(params).length === 0) return translated;
    return `${translated} ${JSON.stringify(params)}`;
  }),
  useChromeStorageConfigMock: vi.fn(),
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: translateMock,
    }),
  };
});

vi.mock('@/hooks/useChromeStorageConfig', () => ({
  useChromeStorageConfig: useChromeStorageConfigMock,
}));

vi.mock('@/lib/local-backup', () => ({
  clearExportDirHandle: clearExportDirHandleMock,
  createLocalBackupSnapshot: createLocalBackupSnapshotMock,
  deleteManagedLocalBackup: deleteManagedLocalBackupMock,
  getExportDirHandle: getExportDirHandleMock,
  getLocalBackupBlob: getLocalBackupBlobMock,
  listLocalBackups: listLocalBackupsMock,
  setExportDirHandle: setExportDirHandleMock,
}));

vi.mock('@/lib/backup', () => ({
  broadcastStoreReload: vi.fn(),
  importBackupFromZip: vi.fn(),
}));

vi.mock('@/lib/extension/ui-actions', () => ({
  readLocalBackupScheduleStatus: readLocalBackupScheduleStatusMock,
}));

import { LocalBackupContent } from './LocalBackupContent';

describe('LocalBackupContent', () => {
  beforeAll(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeClipboardMock.mockResolvedValue(undefined) },
    });
    getExportDirHandleMock.mockResolvedValue(null);
    listLocalBackupsMock.mockResolvedValue([]);
    saveConfigMock.mockImplementation(async (next) => next);
    readLocalBackupScheduleStatusMock.mockResolvedValue({
      ok: true,
      payload: {
        config: { syncInterval: 0, maxBackups: 0, backupProfile: 'full' },
        status: null,
        alarm: null,
      },
    });
    useChromeStorageConfigMock.mockReturnValue([
      { syncInterval: 0, maxBackups: 0, backupProfile: 'full' },
      patchConfigMock,
      saveConfigMock,
    ]);
  });

  it('自动快照间隔选择后会立即写入 storage，快速卸载也不会丢保存', async () => {
    const view = render(<LocalBackupContent />);

    fireEvent.click(screen.getAllByRole('combobox')[0]);
    const options = await screen.findAllByRole('option', { name: /cloudSyncPanel\.autoSync\.minute_interval/ });
    const fiveMinuteOption = options.find((option) => option.textContent?.includes('"count":5}'));
    expect(fiveMinuteOption).toBeTruthy();
    fireEvent.click(fiveMinuteOption!);
    view.unmount();

    await waitFor(() => {
      expect(saveConfigMock).toHaveBeenCalledWith({
        syncInterval: 5,
        maxBackups: 0,
        backupProfile: 'full',
      });
    });
    expect(patchConfigMock).toHaveBeenCalledWith({
      syncInterval: 5,
      maxBackups: 0,
      backupProfile: 'full',
    });
  });

  it('展示本地自动快照最近成功、下次计划和目录导出降级状态', async () => {
    readLocalBackupScheduleStatusMock.mockResolvedValue({
      ok: true,
      payload: {
        config: { syncInterval: 5, maxBackups: 3, backupProfile: 'full' },
        status: {
          lastRunAt: 1763712000000,
          ok: true,
          mode: 'snapshot_ok/file_export_degraded',
          trimmedCount: 2,
        },
        alarm: {
          name: 'olyq/sync/local-backup',
          scheduledTime: 1763712300000,
          periodInMinutes: 5,
        },
      },
    });
    useChromeStorageConfigMock.mockReturnValue([
      { syncInterval: 5, maxBackups: 3, backupProfile: 'full' },
      patchConfigMock,
      saveConfigMock,
    ]);

    render(<LocalBackupContent />);

    await waitFor(() => expect(readLocalBackupScheduleStatusMock).toHaveBeenCalled());
    expect(await screen.findByText(/cloudSyncPanel\.localBackup\.status\.nextRunAt/)).toBeInTheDocument();
    expect(screen.getByText(/cloudSyncPanel\.localBackup\.status\.lastSuccess/)).toBeInTheDocument();
    expect(screen.getByText(/cloudSyncPanel\.localBackup\.status\.cleaned/)).toBeInTheDocument();
    expect(screen.getByText('cloudSyncPanel.localBackup.status.fileExportDegraded')).toBeInTheDocument();
    expect(screen.getByText('cloudSyncPanel.localBackup.status.fastFullBackupWarning')).toBeInTheDocument();
  });

  it('自动快照失败时提供详情入口展示后台诊断信息', async () => {
    readLocalBackupScheduleStatusMock.mockResolvedValue({
      ok: true,
      payload: {
        config: { syncInterval: 5, maxBackups: 10, backupProfile: 'full' },
        status: {
          lastRunAt: 1763712000000,
          ok: false,
          mode: 'snapshot_error',
          error: { key: 'errors.backupFormatUnsupported' },
          errorDetail: {
            at: 1763712000000,
            taskType: 'local-backup/auto',
            runtime: 'offscreen',
            phase: 'local-backup-snapshot',
            requestId: 'req-local-backup',
            errorKey: 'errors.backupFormatUnsupported',
            errorParams: {
              detail: 'backup.archive.app_version_missing',
            },
            message: 'errors.backupFormatUnsupported',
          },
        },
        alarm: {
          name: 'olyq/sync/local-backup',
          scheduledTime: 1763712300000,
          periodInMinutes: 5,
        },
      },
    });
    useChromeStorageConfigMock.mockReturnValue([
      { syncInterval: 5, maxBackups: 10, backupProfile: 'full' },
      patchConfigMock,
      saveConfigMock,
    ]);

    render(<LocalBackupContent />);

    const detailsButton = await screen.findByRole('button', {
      name: 'cloudSyncPanel.localBackup.status.detail.action',
    });
    expect(screen.getByText(/cloudSyncPanel\.localBackup\.status\.lastFailure/)).toBeInTheDocument();

    fireEvent.click(detailsButton);

    const dialog = await screen.findByTestId('local-backup-failure-detail-dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveClass('h-[min(calc(100vh-2rem),42rem)]', 'overflow-hidden');
    const scrollBody = await screen.findByTestId('local-backup-failure-detail-scroll-body');
    expect(scrollBody).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
    expect(screen.getByText('cloudSyncPanel.localBackup.status.detail.title')).toBeInTheDocument();
    expect(screen.getAllByText('不支持的备份格式').length).toBeGreaterThan(0);
    expect(screen.getAllByText('备份清单缺少应用版本。').length).toBeGreaterThan(0);
    expect(screen.getAllByText('创建本地快照').length).toBeGreaterThan(0);
    expect(screen.getAllByText('本地自动快照').length).toBeGreaterThan(0);
    expect(screen.getAllByText('req-local-backup').length).toBeGreaterThan(0);
    expect(screen.queryByText('errors.backupFormatUnsupported')).not.toBeInTheDocument();
    expect(screen.queryByText('backup.archive.app_version_missing')).not.toBeInTheDocument();
    expect(screen.queryByText('local-backup/auto')).not.toBeInTheDocument();
    expect(screen.queryByText('offscreen')).not.toBeInTheDocument();
    expect(screen.queryByText('local-backup-snapshot')).not.toBeInTheDocument();
    expect(screen.queryByText(/backup format failure detail did not include a reason code/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /复制诊断信息/ }));
    await waitFor(() => expect(writeClipboardMock).toHaveBeenCalled());
    expect(String(writeClipboardMock.mock.calls[0]?.[0])).toContain('backup.archive.app_version_missing');
  });

  it('自动快照失败详情缺失时不会继续展示 null 详情', async () => {
    readLocalBackupScheduleStatusMock.mockResolvedValue({
      ok: true,
      payload: {
        config: { syncInterval: 5, maxBackups: 10, backupProfile: 'full' },
        status: {
          lastRunAt: 1763712000000,
          ok: false,
          mode: 'snapshot_error',
          error: { key: 'errors.backupFormatUnsupported' },
        },
        alarm: {
          name: 'olyq/sync/local-backup',
          scheduledTime: 1763712300000,
          periodInMinutes: 5,
        },
      },
    });
    useChromeStorageConfigMock.mockReturnValue([
      { syncInterval: 5, maxBackups: 10, backupProfile: 'full' },
      patchConfigMock,
      saveConfigMock,
    ]);

    render(<LocalBackupContent />);

    fireEvent.click(await screen.findByRole('button', {
      name: 'cloudSyncPanel.localBackup.status.detail.action',
    }));

    expect(await screen.findByTestId('local-backup-failure-detail-dialog')).toBeInTheDocument();
    expect(screen.getAllByText('读取旧失败状态').length).toBeGreaterThan(0);
    expect(screen.queryByText('status-missing-detail')).not.toBeInTheDocument();
    expect(screen.queryByText('errors.backupFormatUnsupported')).not.toBeInTheDocument();
    expect(screen.queryByText('"errorDetail": null')).not.toBeInTheDocument();
  });
});
