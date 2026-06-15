/**
 * 说明：`backup-scheduler.test` 后台运行时模块。
 *
 * 职责：
 * - 守住 WebDAV/S3 自动多设备同步的 alarm 调度边界；
 * - 确保 offscreen 云同步失败会沉淀到状态真源，而不是只暴露在隐藏页面控制台。
 *
 * 边界：
 * - 这里只验证后台调度与状态写回；
 * - 不覆盖 WebDAV/S3 真实网络请求，远端同步细节由 `cloud-sync.test.ts` 承担。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  callOffscreenMock,
  chromeAlarmsClearMock,
  chromeAlarmsCreateMock,
  chromeAlarmsGetMock,
  createLocalBackupSnapshotMock,
  ensureOffscreenDocumentMock,
  storageGetMock,
  storageSetMock,
  waitForOffscreenPortMock,
} = vi.hoisted(() => ({
  callOffscreenMock: vi.fn(),
  chromeAlarmsClearMock: vi.fn(),
  chromeAlarmsCreateMock: vi.fn(),
  chromeAlarmsGetMock: vi.fn(),
  createLocalBackupSnapshotMock: vi.fn(),
  ensureOffscreenDocumentMock: vi.fn(async () => undefined),
  storageGetMock: vi.fn(),
  storageSetMock: vi.fn(async () => undefined),
  waitForOffscreenPortMock: vi.fn(async () => ({ name: 'olyq:offscreen' })),
}));

vi.mock('../../lib/storage/storage-adapter', () => ({
  getStorageAdapter: () => ({
    get: storageGetMock,
    set: storageSetMock,
    remove: vi.fn(async () => undefined),
    onChange: vi.fn(() => () => undefined),
  }),
}));

vi.mock('@/lib/storage/storage-adapter', () => ({
  getStorageAdapter: () => ({
    get: storageGetMock,
    set: storageSetMock,
    remove: vi.fn(async () => undefined),
    onChange: vi.fn(() => () => undefined),
  }),
}));

vi.mock('./offscreen-manager', () => ({
  ensureOffscreenDocument: ensureOffscreenDocumentMock,
  waitForOffscreenPort: waitForOffscreenPortMock,
  callOffscreen: callOffscreenMock,
}));

vi.mock('../../lib/local-backup', () => ({
  createLocalBackupSnapshot: createLocalBackupSnapshotMock,
}));

import {
  applyLocalBackupSchedule,
  applyCloudBackupSchedules,
  readLocalBackupScheduleStatus,
  runLocalBackupAuto,
  runWebDavAuto,
} from './backup-scheduler';
import {
  LOCAL_BACKUP_ALARM,
  LOCAL_BACKUP_KEY,
  LOCAL_BACKUP_STATUS_KEY,
  S3_ALARM,
  S3_KEY,
  WEBDAV_ALARM,
  WEBDAV_KEY,
  WEBDAV_STATUS_KEY,
} from './backup-scheduler-contract';

/**
 * 测试用：安装最小 Chrome extension API。
 */
function installChromeMock(options?: { offscreen?: boolean }): void {
  vi.stubGlobal('chrome', {
    alarms: {
      create: chromeAlarmsCreateMock,
      clear: chromeAlarmsClearMock,
      get: chromeAlarmsGetMock,
    },
    runtime: {
      lastError: null,
    },
    ...(options?.offscreen === false
      ? {}
      : {
        offscreen: {
          createDocument: vi.fn(),
          hasDocument: vi.fn(),
        },
      }),
  });
}

/**
 * 测试用：按 storage key 返回对应配置。
 */
function mockStorageConfigs(configs: Record<string, unknown>): void {
  storageGetMock.mockImplementation(async (keys: string[]) => {
    const out: Record<string, unknown> = {};
    for (const key of keys) out[key] = configs[key];
    return out;
  });
}

describe('backup-scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    installChromeMock();
    mockStorageConfigs({});
    callOffscreenMock.mockResolvedValue({ ok: true });
    chromeAlarmsGetMock.mockImplementation((_name: string, callback: (alarm?: chrome.alarms.Alarm) => void) => callback(undefined));
    createLocalBackupSnapshotMock.mockResolvedValue({
      fileExportStatus: 'ok',
      trimmedCount: 0,
    });
  });

  it('本地自动快照 interval=5 会创建显式延迟和周期 alarm', async () => {
    mockStorageConfigs({
      [LOCAL_BACKUP_KEY]: { syncInterval: 5, maxBackups: 3, backupProfile: 'lite' },
    });

    await applyLocalBackupSchedule();

    expect(chromeAlarmsCreateMock).toHaveBeenCalledWith(LOCAL_BACKUP_ALARM, {
      delayInMinutes: 5,
      periodInMinutes: 5,
      persistAcrossSessions: true,
    });
    expect(chromeAlarmsClearMock).not.toHaveBeenCalledWith(LOCAL_BACKUP_ALARM);
  });

  it('本地自动快照启动恢复遇到同周期有效 alarm 时不会重置下一次执行时间', async () => {
    mockStorageConfigs({
      [LOCAL_BACKUP_KEY]: { syncInterval: 5, maxBackups: 3, backupProfile: 'lite' },
    });
    chromeAlarmsGetMock.mockImplementation((_name: string, callback: (alarm?: chrome.alarms.Alarm) => void) => callback({
      name: LOCAL_BACKUP_ALARM,
      scheduledTime: Date.now() + 60_000,
      periodInMinutes: 5,
    }));

    await applyLocalBackupSchedule();

    expect(chromeAlarmsGetMock).toHaveBeenCalledWith(LOCAL_BACKUP_ALARM, expect.any(Function));
    expect(chromeAlarmsCreateMock).not.toHaveBeenCalledWith(LOCAL_BACKUP_ALARM, expect.anything());
  });

  it('本地自动快照配置变更会强制重排同名 alarm', async () => {
    mockStorageConfigs({
      [LOCAL_BACKUP_KEY]: { syncInterval: 5, maxBackups: 3, backupProfile: 'lite' },
    });
    chromeAlarmsGetMock.mockImplementation((_name: string, callback: (alarm?: chrome.alarms.Alarm) => void) => callback({
      name: LOCAL_BACKUP_ALARM,
      scheduledTime: Date.now() + 60_000,
      periodInMinutes: 5,
    }));

    await applyLocalBackupSchedule({ mode: 'reschedule' });

    expect(chromeAlarmsGetMock).not.toHaveBeenCalled();
    expect(chromeAlarmsCreateMock).toHaveBeenCalledWith(LOCAL_BACKUP_ALARM, {
      delayInMinutes: 5,
      periodInMinutes: 5,
      persistAcrossSessions: true,
    });
  });

  it('本地自动快照 interval=0 会清理 alarm', async () => {
    mockStorageConfigs({
      [LOCAL_BACKUP_KEY]: { syncInterval: 0, maxBackups: 3, backupProfile: 'lite' },
    });

    await applyLocalBackupSchedule();

    expect(chromeAlarmsClearMock).toHaveBeenCalledWith(LOCAL_BACKUP_ALARM);
    expect(chromeAlarmsCreateMock).not.toHaveBeenCalledWith(LOCAL_BACKUP_ALARM, expect.anything());
  });

  it('本地自动快照计划查询会返回配置、最近状态和当前 alarm', async () => {
    mockStorageConfigs({
      [LOCAL_BACKUP_KEY]: { syncInterval: 5, maxBackups: 3, backupProfile: 'lite' },
      [LOCAL_BACKUP_STATUS_KEY]: {
        lastRunAt: 1763712000000,
        ok: true,
        mode: 'snapshot_ok/file_export_degraded',
        trimmedCount: 2,
      },
    });
    chromeAlarmsGetMock.mockImplementation((_name: string, callback: (alarm?: chrome.alarms.Alarm) => void) => callback({
      name: LOCAL_BACKUP_ALARM,
      scheduledTime: 1763712300000,
      periodInMinutes: 5,
    }));

    const payload = await readLocalBackupScheduleStatus();

    expect(payload).toEqual({
      config: { syncInterval: 5, maxBackups: 3, backupProfile: 'lite' },
      status: {
        lastRunAt: 1763712000000,
        ok: true,
        mode: 'snapshot_ok/file_export_degraded',
        trimmedCount: 2,
      },
      alarm: {
        name: LOCAL_BACKUP_ALARM,
        scheduledTime: 1763712300000,
        periodInMinutes: 5,
      },
    });
  });

  it('本地自动快照计划查询会返回最近失败详情', async () => {
    mockStorageConfigs({
      [LOCAL_BACKUP_KEY]: { syncInterval: 5, maxBackups: 3, backupProfile: 'full' },
      [LOCAL_BACKUP_STATUS_KEY]: {
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
          message: 'errors.backupFormatUnsupported',
        },
      },
    });

    const payload = await readLocalBackupScheduleStatus();

    expect(payload.status).toEqual(expect.objectContaining({
      ok: false,
      mode: 'snapshot_error',
      error: { key: 'errors.backupFormatUnsupported' },
      errorDetail: expect.objectContaining({
        taskType: 'local-backup/auto',
        runtime: 'offscreen',
        phase: 'local-backup-snapshot',
        requestId: 'req-local-backup',
        errorKey: 'errors.backupFormatUnsupported',
        errorParams: expect.objectContaining({
          detail: 'backup.format.detail_missing',
        }),
      }),
    }));
  });

  it('本地自动快照计划查询会把空原因码规整为可诊断占位原因', async () => {
    mockStorageConfigs({
      [LOCAL_BACKUP_KEY]: { syncInterval: 5, maxBackups: 3, backupProfile: 'full' },
      [LOCAL_BACKUP_STATUS_KEY]: {
        lastRunAt: 1763712000000,
        ok: false,
        mode: 'snapshot_error',
        error: { key: 'errors.backupFormatUnsupported' },
        errorDetail: {
          at: 1763712000000,
          taskType: 'local-backup/auto',
          runtime: 'offscreen',
          phase: 'local-backup-snapshot',
          errorKey: 'errors.backupFormatUnsupported',
          errorParams: { detail: '' },
        },
      },
    });

    const payload = await readLocalBackupScheduleStatus();

    expect(payload.status?.errorDetail?.errorParams).toEqual(expect.objectContaining({
      detail: 'backup.format.detail_missing',
    }));
  });

  it('本地自动快照计划查询会为缺少详情的失败状态补诊断说明', async () => {
    mockStorageConfigs({
      [LOCAL_BACKUP_KEY]: { syncInterval: 5, maxBackups: 10, backupProfile: 'full' },
      [LOCAL_BACKUP_STATUS_KEY]: {
        lastRunAt: 1763712000000,
        ok: false,
        mode: 'snapshot_error',
        error: { key: 'errors.backupFormatUnsupported' },
      },
    });

    const payload = await readLocalBackupScheduleStatus();

    expect(payload.status).toEqual(expect.objectContaining({
      ok: false,
      mode: 'snapshot_error',
      errorDetail: expect.objectContaining({
        taskType: 'local-backup/auto',
        runtime: 'offscreen',
        phase: 'status-missing-detail',
        errorKey: 'errors.backupFormatUnsupported',
        note: expect.stringContaining('did not include errorDetail'),
      }),
    }));
  });

  it('offscreen 本地自动快照失败会写入本地状态真源', async () => {
    callOffscreenMock.mockResolvedValue({
      ok: false,
      error: { key: 'errors.operationTimeout' },
    });

    await runLocalBackupAuto();

    expect(storageSetMock).toHaveBeenCalledWith({
      [LOCAL_BACKUP_STATUS_KEY]: expect.objectContaining({
        ok: false,
        mode: 'snapshot_error',
        error: { key: 'errors.operationTimeout' },
        errorDetail: expect.objectContaining({
          taskType: 'local-backup/auto',
          runtime: 'offscreen',
          phase: 'offscreen-result',
          errorKey: 'errors.operationTimeout',
        }),
      }),
    });
  });

  it('offscreen 返回裸备份格式错误时会补稳定原因码', async () => {
    callOffscreenMock.mockResolvedValue({
      ok: false,
      error: { key: 'errors.backupFormatUnsupported' },
    });

    await runLocalBackupAuto();

    expect(storageSetMock).toHaveBeenCalledWith({
      [LOCAL_BACKUP_STATUS_KEY]: expect.objectContaining({
        ok: false,
        mode: 'snapshot_error',
        errorDetail: expect.objectContaining({
          errorKey: 'errors.backupFormatUnsupported',
          errorParams: expect.objectContaining({
            detail: 'backup.format.detail_missing',
          }),
        }),
      }),
    });
  });

  it('无 offscreen fallback 下目录权限降级仍会创建 IndexedDB 快照并记录降级状态', async () => {
    installChromeMock({ offscreen: false });
    mockStorageConfigs({
      [LOCAL_BACKUP_KEY]: { syncInterval: 5, maxBackups: 3, backupProfile: 'lite' },
    });
    createLocalBackupSnapshotMock.mockResolvedValue({
      fileExportStatus: 'degraded',
      trimmedCount: 1,
    });

    await runLocalBackupAuto();

    expect(createLocalBackupSnapshotMock).toHaveBeenCalledWith({
      profile: 'lite',
      maxBackups: 3,
      permissionMode: 'query',
    });
    expect(storageSetMock).toHaveBeenCalledWith({
      [LOCAL_BACKUP_STATUS_KEY]: expect.objectContaining({
        ok: true,
        mode: 'snapshot_ok/file_export_degraded',
        trimmedCount: 1,
      }),
    });
  });

  it('WebDAV 自动同步 interval 已开启但 URL 未配置时必须清理 alarm', async () => {
    mockStorageConfigs({
      [WEBDAV_KEY]: { syncInterval: 15, url: '' },
      [S3_KEY]: { syncInterval: 0 },
    });

    await applyCloudBackupSchedules();

    expect(chromeAlarmsClearMock).toHaveBeenCalledWith(WEBDAV_ALARM);
    expect(chromeAlarmsCreateMock).not.toHaveBeenCalledWith(
      WEBDAV_ALARM,
      expect.anything(),
    );
  });

  it('云端自动同步只在 provider 最小配置完整时创建对应 alarm', async () => {
    mockStorageConfigs({
      [WEBDAV_KEY]: { syncInterval: 30, url: 'https://dav.example.com/webdav' },
      [S3_KEY]: {
        syncInterval: 60,
        endpoint: 'https://s3.example.com',
        bucket: 'olyq',
        accessKeyId: 'ak',
        secretAccessKey: '',
      },
    });

    await applyCloudBackupSchedules();

    expect(chromeAlarmsCreateMock).toHaveBeenCalledWith(WEBDAV_ALARM, { periodInMinutes: 30 });
    expect(chromeAlarmsClearMock).toHaveBeenCalledWith(S3_ALARM);
  });

  it('offscreen WebDAV 自动同步失败会写入多设备同步状态真源', async () => {
    callOffscreenMock.mockResolvedValue({
      ok: false,
      error: { key: 'errors.webdavNotConfigured' },
    });

    await runWebDavAuto();

    expect(ensureOffscreenDocumentMock).toHaveBeenCalledTimes(1);
    expect(waitForOffscreenPortMock).toHaveBeenCalledTimes(1);
    expect(storageSetMock).toHaveBeenCalledWith({
      [WEBDAV_STATUS_KEY]: expect.objectContaining({
        ok: false,
        mode: 'sync',
        error: { key: 'errors.webdavNotConfigured' },
      }),
    });
  });
});
