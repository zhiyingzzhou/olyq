/**
 * 说明：`LocalBackupContent` 组件模块。
 *
 * 职责：
 * - 承载 `LocalBackupContent` 相关的当前文件实现与模块边界；
 * - 对外暴露 `LocalBackupContent` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useChromeStorageConfig } from '@/hooks/useChromeStorageConfig';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { TooltipAction } from '@/components/ui/tooltip-action';
import {
  FolderArchive,
  FolderOpen,
  Loader2,
  Save,
  Trash2,
} from 'lucide-react';
import { toast } from '@/hooks/useToast';
import { importBackupFromZip, broadcastStoreReload } from '@/lib/backup';
import {
  DEFAULT_BACKUP_PROFILE,
  isLiteBackupProfile,
  normalizeBackupProfile,
} from '@/lib/backup-config';
import {
  clearExportDirHandle,
  createLocalBackupSnapshot,
  deleteManagedLocalBackup,
  getExportDirHandle,
  getLocalBackupBlob,
  listLocalBackups,
  setExportDirHandle,
  type LocalBackupMeta,
} from '@/lib/local-backup';
import { normalizeSyncIntervalMinutes, normalizeMaxBackups } from '@/lib/sync/normalize';
import { useTranslation } from 'react-i18next';
import { isI18nError } from '@/lib/i18n/error';
import { isI18nText } from '@/lib/i18n/text';
import { formatI18nText } from '@/lib/i18n/format';
import { SettingsCard, SettingsRow, SettingsSection, SyncIntervalSelect, MaxBackupsSelect } from './shared';
import {
  readLocalBackupScheduleStatus,
  type LocalBackupScheduleSnapshotPayload,
} from '@/lib/extension/ui-actions';
import type { BackupProfile } from '@/lib/persistence/types';
import { LocalBackupStatusPanel } from './LocalBackupStatusPanel';
import { LocalBackupManagerDialog } from './LocalBackupManagerDialog';

const LOCAL_BACKUP_CONFIG_KEY = 'olyq.sync.local-backup.v1';

type LocalBackupConfig = {
  syncInterval: number;
  maxBackups: number;
  backupProfile: BackupProfile;
};

/**
 * 本地备份内容面板。
 *
 * 负责：
 * - 生成 ZIP 备份并存入 IndexedDB；
 * - 可选导出到用户选定目录；
 * - 管理、下载、删除和恢复已有本地备份。
 */
export function LocalBackupContent() {
  const { t } = useTranslation();
  // 说明：本模块内既有“直接 throw new Error(t(...))”的本地化错误，也可能捕获到 I18nError（后台透传）。
  // 因此这里采用“优先展示可读 message，其次渲染 I18nText”的策略，避免出现 errors.xxx 这类 key 泄漏。
  /**
   * 把任意备份相关异常格式化成最终展示给用户的文案。
   *
   * 说明：
   * - 优先消费 `I18nText / I18nError`，确保透传错误继续走统一国际化；
   * - 兜底时才回落到原始 `Error.message` 或通用错误文案。
   */
  const formatErrorMessage = useCallback((e: unknown) => {
    if (isI18nText(e)) return formatI18nText(t, e);
    if (isI18nError(e)) return formatI18nText(t, e.i18n);
    if (e instanceof Error) return e.message || e.name || t('common.error');
    const s = String(e ?? '').trim();
    return s || t('common.error');
  }, [t]);

  const [config, patchConfig, saveConfig] = useChromeStorageConfig<LocalBackupConfig>(
    LOCAL_BACKUP_CONFIG_KEY,
    { syncInterval: 0, maxBackups: 0, backupProfile: DEFAULT_BACKUP_PROFILE },
    (r) => ({
      syncInterval: normalizeSyncIntervalMinutes(r.syncInterval),
      maxBackups: normalizeMaxBackups(r.maxBackups),
      backupProfile: normalizeBackupProfile(r.backupProfile),
    }),
    { persistMode: 'manual' },
  );
  const { syncInterval, maxBackups, backupProfile } = config;
  const liteBackupEnabled = isLiteBackupProfile(backupProfile);
  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Firefox 等环境通常不支持 File System Access API，因此这里把目录选择能力显式探测出来，
  // 用于禁用 UI 按钮并给出更明确的提示（避免用户反复点击只看到 toast）。
  const canPickExportDir = typeof (globalThis as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

  /** 当前已选导出目录句柄。 */
  const [exportDir, setExportDir] = useState<FileSystemDirectoryHandle | null>(null);
  /** 当前导出目录名称，仅用于 UI 展示。 */
  const [exportDirName, setExportDirName] = useState<string>('');
  /** 后台返回的自动快照计划与最近状态。 */
  const [schedule, setSchedule] = useState<LocalBackupScheduleSnapshotPayload | null>(null);
  /** 当前是否正在读取后台计划状态。 */
  const [scheduleLoading, setScheduleLoading] = useState(false);
  /** 最近一次计划状态读取失败文案。 */
  const [scheduleError, setScheduleError] = useState('');
  /** 当前是否正在把关键配置确定性写入 storage。 */
  const [configSaving, setConfigSaving] = useState(false);
  /** 最近一次配置成功落盘时间。 */
  const [configSavedAt, setConfigSavedAt] = useState<number | null>(null);
  /** 组件挂载状态；关键保存允许卸载后继续落盘，但不再回写卸载组件的 UI 状态。 */
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** 当前是否正在执行“立即备份”。 */
  const [backing, setBacking] = useState(false);
  /** 备份管理弹窗是否打开。 */
  const [manageOpen, setManageOpen] = useState(false);
  /** 备份列表是否正在加载。 */
  const [listLoading, setListLoading] = useState(false);
  /** 当前备份元数据列表。 */
  const [items, setItems] = useState<LocalBackupMeta[]>([]);
  /** 当前正在恢复的备份 ID。 */
  const [restoring, setRestoring] = useState<string | null>(null);
  /** 当前正在删除的备份 ID。 */
  const [deleting, setDeleting] = useState<string | null>(null);
  /** 当前正在下载的备份 ID。 */
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getExportDirHandle()
      .then((handle) => {
        if (!alive) return;
        setExportDir(handle);
        setExportDirName(handle?.name || '');
      })
      .catch(() => {
        if (!alive) return;
        setExportDir(null);
        setExportDirName('');
      });
    return () => { alive = false; };
  }, []);

  /** 把时间戳格式化成适合备份列表展示的本地时间文本。 */
  const formatDate = (ts: number) => {
    try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
  };

  /**
   * 读取 Service Worker 聚合后的本地自动快照计划。
   *
   * 说明：UI 不直接访问 `chrome.alarms`；后台只会补建缺失的 schedule，
   * 不会因为设置页刷新而重置已有 alarm 的下次执行时间。
   */
  const refreshSchedule = useCallback(async (options?: { silent?: boolean }) => {
    setScheduleLoading(true);
    try {
      const response = await readLocalBackupScheduleStatus();
      if (!mountedRef.current) return;
      if (!response.ok) {
        const message = response.error
          ? formatErrorMessage(response.error)
          : t('cloudSyncPanel.localBackup.status.queryFailed');
        setScheduleError(message);
        if (!options?.silent) toast.error(message);
        return;
      }
      setSchedule(response.payload);
      setScheduleError('');
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      const message = formatErrorMessage(e);
      setScheduleError(message);
      if (!options?.silent) toast.error(message);
    } finally {
      if (mountedRef.current) setScheduleLoading(false);
    }
  }, [formatErrorMessage, t]);

  useEffect(() => {
    void refreshSchedule({ silent: true });
  }, [refreshSchedule]);

  /**
   * 确定性保存本地自动快照配置。
   *
   * 说明：自动快照周期、保留数和备份档位会影响后台定时任务，不能再依赖
   * 组件卸载时可能被清理的防抖 timer；这里先更新 UI 内存态，再等待 storage 落盘。
   */
  const persistConfigPatch = useCallback(async (patch: Partial<LocalBackupConfig>) => {
    const previous = configRef.current;
    const next: LocalBackupConfig = {
      syncInterval: normalizeSyncIntervalMinutes(patch.syncInterval ?? previous.syncInterval),
      maxBackups: normalizeMaxBackups(patch.maxBackups ?? previous.maxBackups),
      backupProfile: normalizeBackupProfile(patch.backupProfile ?? previous.backupProfile),
    };

    configRef.current = next;
    patchConfig(next);
    setConfigSaving(true);
    try {
      await saveConfig(next);
      if (!mountedRef.current) return;
      setConfigSavedAt(Date.now());
      await refreshSchedule({ silent: true });
    } catch (e: unknown) {
      configRef.current = previous;
      if (mountedRef.current) {
        patchConfig(previous);
        toast.error(formatErrorMessage(e));
      }
    } finally {
      if (mountedRef.current) setConfigSaving(false);
    }
  }, [formatErrorMessage, patchConfig, refreshSchedule, saveConfig]);

  /** 刷新本地备份列表。 */
  const loadList = async () => {
    setListLoading(true);
    try {
      const next = await listLocalBackups(200);
      setItems(next);
    } catch (e: unknown) {
      toast.error(formatErrorMessage(e));
    } finally {
      setListLoading(false);
    }
  };

  /** 选择导出目录。 */
  const handlePickDir = async () => {
    const picker = (globalThis as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
    if (!picker) {
      toast.error(t('cloudSyncPanel.localBackup.toast.dirPickerUnsupported'));
      return;
    }
    try {
      const handle = await picker();
      await setExportDirHandle(handle);
      setExportDir(handle);
      setExportDirName(handle?.name || '');
      toast.success(t('cloudSyncPanel.localBackup.toast.dirSelected', { name: handle?.name || '' }));
      await refreshSchedule({ silent: true });
    } catch (e: unknown) {
      if (e instanceof Error && /abort/i.test(e.message)) return;
      toast.error(formatErrorMessage(e));
    }
  };

  /** 由用户手势重新请求当前导出目录的写权限。 */
  const handleAuthorizeDir = async () => {
    if (!exportDir) {
      await handlePickDir();
      return;
    }
    const permissionHandle = exportDir as FileSystemDirectoryHandle & {
      requestPermission?: (options?: { mode?: 'readwrite' }) => Promise<PermissionState>;
    };
    if (typeof permissionHandle.requestPermission !== 'function') {
      await handlePickDir();
      return;
    }
    try {
      const state = await permissionHandle.requestPermission({ mode: 'readwrite' });
      if (state === 'granted') {
        toast.success(t('cloudSyncPanel.localBackup.toast.dirAuthorized'));
      } else {
        toast.error(t('cloudSyncPanel.localBackup.toast.dirPermissionDenied'));
      }
      await refreshSchedule({ silent: true });
    } catch (e: unknown) {
      toast.error(formatErrorMessage(e));
    }
  };

  /** 清空当前导出目录配置。 */
  const handleClearDir = async () => {
    try {
      await clearExportDirHandle();
      setExportDir(null);
      setExportDirName('');
      toast.success(t('cloudSyncPanel.localBackup.toast.dirCleared'));
      await refreshSchedule({ silent: true });
    } catch (e: unknown) {
      toast.error(formatErrorMessage(e));
    }
  };

  /**
   * 立即执行一次本地备份。
   *
   * 会先落到 IndexedDB，再按用户配置决定是否额外写入文件系统目录。
   */
  const handleBackupNow = async () => {
    setBacking(true);
    try {
      const result = await createLocalBackupSnapshot({
        profile: backupProfile,
        maxBackups,
        permissionMode: 'request',
      });
      if (result.trimmedCount > 0) {
        toast.info(t('cloudSyncPanel.localBackup.toast.cleaned', { count: result.trimmedCount }));
      }
      if (result.fileExportStatus === 'degraded') {
        toast.error(t('cloudSyncPanel.localBackup.toast.exportFailed', {
          error: t('cloudSyncPanel.localBackup.toast.dirPermissionDenied'),
        }));
      }
      toast.success(t('cloudSyncPanel.localBackup.toast.backedUp'));
      await refreshSchedule({ silent: true });
      if (manageOpen) await loadList();
    } catch (e: unknown) {
      toast.error(formatErrorMessage(e));
    } finally {
      setBacking(false);
    }
  };

  /** 打开备份管理弹窗并刷新列表。 */
  const handleManage = async () => {
    setManageOpen(true);
    await Promise.all([loadList(), refreshSchedule({ silent: true })]);
  };

  /** 管理弹窗从任何入口打开时都刷新列表与状态。 */
  const handleManageOpenChange = (open: boolean) => {
    setManageOpen(open);
    if (open) {
      void loadList();
      void refreshSchedule({ silent: true });
    }
  };

  /**
   * 从指定本地备份恢复数据。
   *
   * @param meta - 备份元数据。
   */
  const handleRestore = async (meta: LocalBackupMeta) => {
    setRestoring(meta.id);
    try {
      const blob = await getLocalBackupBlob(meta.id);
      if (!blob) throw new Error(t('cloudSyncPanel.localBackup.toast.backupMissing'));
      await importBackupFromZip(blob);
      broadcastStoreReload();
      toast.success(t('cloudSyncPanel.localBackup.toast.restored'));
    } catch (e: unknown) {
      toast.error(formatErrorMessage(e));
    } finally {
      setRestoring(null);
    }
  };

  /**
   * 下载指定备份文件到本地磁盘。
   *
   * @param meta - 备份元数据。
   */
  const handleDownload = async (meta: LocalBackupMeta) => {
    setDownloading(meta.id);
    try {
      const blob = await getLocalBackupBlob(meta.id);
      if (!blob) throw new Error(t('cloudSyncPanel.localBackup.toast.backupMissing'));

      // 创建下载链接并触发下载
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = meta.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast.error(formatErrorMessage(e));
    } finally {
      setDownloading(null);
    }
  };

  /**
   * 删除指定备份。
   *
   * @param meta - 备份元数据。
   */
  const handleDelete = async (meta: LocalBackupMeta) => {
    setDeleting(meta.id);
    try {
      const result = await deleteManagedLocalBackup(meta, {
        dirHandle: exportDir,
        permissionMode: 'request',
      });
      setItems((prev) => prev.filter((x) => x.id !== meta.id));
      if (result.fileExportStatus === 'degraded') {
        toast.info(t('cloudSyncPanel.localBackup.toast.exportFailed', {
          error: t('cloudSyncPanel.localBackup.toast.dirPermissionDenied'),
        }));
      }
      toast.success(t('cloudSyncPanel.localBackup.toast.deleted'));
      await refreshSchedule({ silent: true });
    } catch (e: unknown) {
      toast.error(formatErrorMessage(e));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <SettingsCard title={t('cloudSyncPanel.localBackup.title')}>
        <SettingsSection>
          <SettingsRow
            label={t('cloudSyncPanel.localBackup.dir')}
            description={canPickExportDir ? t('cloudSyncPanel.localBackup.dirDesc') : t('cloudSyncPanel.localBackup.dirDescUnsupported')}
          >
            <div className="settings-responsive-actions flex min-w-0 flex-wrap justify-end gap-2">
              <Input value={exportDirName} placeholder={t('cloudSyncPanel.localBackup.dirPlaceholder')} className="h-8 w-44 min-w-0 flex-1 text-sm" readOnly />
              <TooltipAction tooltip={canPickExportDir ? t('cloudSyncPanel.localBackup.browse') : t('cloudSyncPanel.localBackup.toast.dirPickerUnsupported')}>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0 whitespace-nowrap"
                  onClick={() => void handlePickDir()}
                  disabled={!canPickExportDir}
                >
                  <FolderOpen className="h-3.5 w-3.5" /> {t('cloudSyncPanel.localBackup.browse')}
                </Button>
              </TooltipAction>
              <Button variant="outline" size="sm" className="gap-1.5 shrink-0 whitespace-nowrap" onClick={() => void handleClearDir()} disabled={!exportDir}>
                <Trash2 className="h-3.5 w-3.5" /> {t('cloudSyncPanel.localBackup.clear')}
              </Button>
            </div>
          </SettingsRow>
          <SettingsRow label={t('cloudSyncPanel.dataDir.backupRestore')}>
            <div className="settings-responsive-actions flex min-w-0 flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 whitespace-nowrap" onClick={() => void handleBackupNow()} disabled={backing}>
                {backing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} {t('cloudSyncPanel.actions.backup')}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 whitespace-nowrap" onClick={() => void handleManage()}>
                <FolderArchive className="h-3.5 w-3.5" /> {t('cloudSyncPanel.actions.manage')}
              </Button>
            </div>
          </SettingsRow>
          <SettingsRow label={t('cloudSyncPanel.snapshotBackup.autoTitle')}>
            <SyncIntervalSelect value={syncInterval} onChange={(v) => void persistConfigPatch({ syncInterval: v })} />
          </SettingsRow>
          <SettingsRow label={t('cloudSyncPanel.maxBackups.title')}>
            <MaxBackupsSelect value={maxBackups} onChange={(v) => void persistConfigPatch({ maxBackups: v })} />
          </SettingsRow>
          <SettingsRow label={t('cloudSyncPanel.liteBackup.title')} description={t('cloudSyncPanel.liteBackup.desc')}>
            <Switch checked={liteBackupEnabled} onCheckedChange={(checked) => void persistConfigPatch({ backupProfile: checked ? 'lite' : 'full' })} />
          </SettingsRow>
          <LocalBackupStatusPanel
            canPickExportDir={canPickExportDir}
            configSavedAt={configSavedAt}
            configSaving={configSaving}
            formatDate={formatDate}
            formatErrorMessage={formatErrorMessage}
            liteBackupEnabled={liteBackupEnabled}
            onAuthorizeDir={() => void handleAuthorizeDir()}
            schedule={schedule}
            scheduleError={scheduleError}
            scheduleLoading={scheduleLoading}
            syncInterval={syncInterval}
          />
        </SettingsSection>
      </SettingsCard>

      <LocalBackupManagerDialog
        deleting={deleting}
        downloading={downloading}
        formatDate={formatDate}
        items={items}
        listLoading={listLoading}
        onDelete={(meta) => void handleDelete(meta)}
        onDownload={(meta) => void handleDownload(meta)}
        onOpenChange={handleManageOpenChange}
        onRefresh={() => void loadList()}
        onRestore={(meta) => void handleRestore(meta)}
        open={manageOpen}
        restoring={restoring}
      />
    </>
  );
}
