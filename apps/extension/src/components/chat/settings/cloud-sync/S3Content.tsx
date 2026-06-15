/**
 * 说明：`S3Content` 组件模块。
 *
 * 职责：
 * - 承载 `S3Content` 相关的当前文件实现与模块边界；
 * - 对外暴露 `S3Content` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useMemo, useState } from 'react';
import { useChromeStorageConfig } from '@/hooks/useChromeStorageConfig';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Save, FolderArchive, Info, Wifi } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/hooks/useToast';
import { exportBackupAsZip, importBackupFromZip, broadcastStoreReload } from '@/lib/backup';
import {
  BACKUP_MIME_TYPE,
  DEFAULT_BACKUP_PROFILE,
  isLiteBackupProfile,
  normalizeBackupProfile,
} from '@/lib/backup-config';
import { putObject, listObjects, deleteObject, getObjectBlob, testConnection, type S3Config, type S3Object } from '@/lib/s3-client';
import { normalizeSyncIntervalMinutes, normalizeMaxBackups } from '@/lib/sync/normalize';
import {
  formatSyncRunError,
  runS3StructuredSync,
  S3_SYNC_STATUS_KEY,
  type SyncRunStatusRecord,
  type SyncRunStatus,
} from '@/lib/sync/cloud-sync';
import { useTranslation } from 'react-i18next';
import { toI18nTextFromError } from '@/lib/i18n/error';
import { formatI18nText } from '@/lib/i18n/format';
import { toHostMatchPatternFromUrl } from '@/lib/extension/host-match-patterns';
import { SettingsRow, SettingsSection, SyncIntervalSelect, MaxBackupsSelect, PasswordInput, SyncNowButton } from './shared';
import {
  buildBackupFileName,
  inferBackupProfileFromName,
  isBackupArchiveKey,
  sortRemoteBackupVersions,
  type RemoteBackupVersion,
} from './shared-utils';
import { RemoteBackupVersionsDialog } from './RemoteBackupVersionsDialog';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

/**
 * S3 云同步面板。
 *
 * 负责：
 * - 维护 S3 连接配置与自动同步参数；
 * - 校验自填 Endpoint、执行连接测试、手动备份、恢复和删除；
 * - 管理远端备份列表及“最大备份数”清理策略。
 */
export function S3Content() {
  const { t } = useTranslation();
  /**
   * 统一错误出口：S3 面板里的失败提示必须保留详细描述，不再只显示笼统标题。
   *
   * @param e - 任意捕获到的异常。
   * @param title - toast 标题；默认使用通用错误标题。
   */
  const toastError = (e: unknown, title = t('common.error')) => toast({
    title,
    description: formatI18nText(t, toI18nTextFromError(e)),
    variant: 'destructive',
  });
  const [showSecret, setShowSecret] = useState(false);

  const [config, patchConfig] = useChromeStorageConfig(
    'olyq.sync.s3.v1',
    { syncInterval: 0, maxBackups: 0, backupProfile: DEFAULT_BACKUP_PROFILE, endpoint: '', region: 'us-east-1', bucket: '', accessKeyId: '', secretAccessKey: '', root: 'olyq' },
    (r) => ({
      syncInterval: normalizeSyncIntervalMinutes(r.syncInterval),
      maxBackups: normalizeMaxBackups(r.maxBackups),
      backupProfile: normalizeBackupProfile(r.backupProfile),
      ...(typeof r.endpoint === 'string' ? { endpoint: r.endpoint } : {}),
      ...(typeof r.region === 'string' ? { region: r.region } : {}),
      ...(typeof r.bucket === 'string' ? { bucket: r.bucket } : {}),
      ...(typeof r.accessKeyId === 'string' ? { accessKeyId: r.accessKeyId } : {}),
      ...(typeof r.secretAccessKey === 'string' ? { secretAccessKey: r.secretAccessKey } : {}),
      ...(typeof r.root === 'string' ? { root: r.root } : {}),
    }),
  );
  const { syncInterval, maxBackups, backupProfile, endpoint, region, bucket, accessKeyId, secretAccessKey, root } = config;
  const liteBackupEnabled = isLiteBackupProfile(backupProfile);

  const [backing, setBacking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [backupList, setBackupList] = useState<RemoteBackupVersion[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { confirm, ConfirmDialogPortal } = useConfirmDialog();
  const [syncStatus] = useChromeStorageConfig<SyncRunStatusRecord>(
    S3_SYNC_STATUS_KEY,
    { lastRunAt: 0, ok: false, mode: 'sync', merged: 0 },
    (raw) => ({
      ...(typeof raw.lastRunAt === 'number' ? { lastRunAt: raw.lastRunAt } : {}),
      ...(typeof raw.ok === 'boolean' ? { ok: raw.ok } : {}),
      ...(raw.mode === 'sync' ? { mode: raw.mode } : {}),
      ...(typeof raw.merged === 'number' ? { merged: raw.merged } : {}),
      ...(typeof raw.lastSyncedAt === 'number' ? { lastSyncedAt: raw.lastSyncedAt } : {}),
      ...(raw.status === 'success' || raw.status === 'no-remote' || raw.status === 'error' ? { status: raw.status } : {}),
      ...(raw.error && typeof raw.error === 'object' ? { error: raw.error as SyncRunStatus['error'] } : {}),
    }),
  );

  const canConnect = Boolean(endpoint.trim() && bucket.trim() && accessKeyId.trim() && secretAccessKey.trim());

  /**
   * S3 Endpoint 为用户自填 URL；当前安装期 host access 已覆盖普通 http/https。
   * 这里只做 URL 形态校验，真实连通性、鉴权和 CORS 失败由 S3 client 链路返回。
   */
  const validateS3EndpointUrl = async (): Promise<boolean> => {
    const pat = toHostMatchPatternFromUrl(endpoint);
    if (!pat) {
      toast.error(t('errors.invalidUrl', { url: endpoint }));
      return false;
    }
    return true;
  };

  const s3Config = useMemo<S3Config | null>(() => {
    if (!canConnect) return null;
    return {
      endpoint: endpoint.replace(/\/+$/, ''),
      region: region || 'us-east-1',
      bucket,
      accessKeyId,
      secretAccessKey,
      root,
    };
  }, [endpoint, region, bucket, accessKeyId, secretAccessKey, root, canConnect]);

  const prefix = useMemo(() => {
    const d = (root || '').replace(/(^\/+)|(\/+$)/g, '');
    return d ? `${d}/` : '';
  }, [root]);

  /**
   * 生成当前备份文件应写入 S3 的对象 key。
   *
   * @returns 带根目录前缀的备份对象 key。
   */
  const makeBackupKey = () => {
    return `${prefix}${buildBackupFileName(backupProfile)}`;
  };

  /**
   * 把 S3 对象列表收敛成远端备份版本展示模型。
   *
   * @param objects - S3 ListObjectsV2 返回的对象元数据。
   * @returns 只包含 Olyq ZIP 备份的倒序版本列表。
   */
  const toRemoteBackupVersions = (objects: S3Object[]): RemoteBackupVersion[] => {
    return sortRemoteBackupVersions(
      objects
        .filter((object) => isBackupArchiveKey(object.key))
        .map((object) => {
          const name = object.key.split('/').pop() || object.key;
          const lastModified = Date.parse(object.lastModified);
          return {
            name,
            key: object.key,
            lastModified: Number.isFinite(lastModified) ? lastModified : 0,
            size: object.size,
            profile: inferBackupProfileFromName(name),
          };
        }),
    );
  };

  /**
   * 执行一次手动备份。
   *
   * 流程：
   * 1. 校验 S3 Endpoint；
   * 2. 导出本地备份 ZIP 并上传；
   * 3. 若配置了最大备份数，则按时间倒序清理超出的旧备份。
   */
  const handleBackup = async () => {
    if (!s3Config) return;
    const ok = await validateS3EndpointUrl();
    if (!ok) return;

    setBacking(true);
    try {
      const zipBlob = await exportBackupAsZip(backupProfile);
      const key = makeBackupKey();
      const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());
      await putObject(s3Config, key, zipBytes, BACKUP_MIME_TYPE);
      toast.success(t('cloudSyncPanel.s3.toast.backedUp'));

      // 限制最大备份数
      if (maxBackups > 0) {
        const allObjects = await listObjects(s3Config, prefix);
        const backups = toRemoteBackupVersions(allObjects);
        const toDelete = backups.slice(maxBackups);
        for (const obj of toDelete) {
          await deleteObject(s3Config, obj.key);
        }
        if (toDelete.length > 0) {
          toast.info(t('cloudSyncPanel.s3.toast.cleaned', { count: toDelete.length }));
        }
      }
    } catch (e: unknown) {
      toastError(e);
    } finally {
      setBacking(false);
    }
  };

  /**
   * 拉取远端备份列表并同步到管理弹窗。
   *
   * 只保留命名符合备份归档规则的对象，并按最近修改时间倒序展示。
   */
  const loadBackupList = async () => {
    if (!s3Config) return;
    setListLoading(true);
    try {
      const ok = await validateS3EndpointUrl();
      if (!ok) return;
      const allObjects = await listObjects(s3Config, prefix);
      setBackupList(toRemoteBackupVersions(allObjects));
    } catch (e: unknown) {
      toastError(e);
    } finally {
      setListLoading(false);
    }
  };

  /**
   * 打开备份管理弹窗并立即刷新远端备份列表。
   */
  const handleManage = async () => {
    setShowManage(true);
    await loadBackupList();
  };

  /**
   * 从 S3 下载指定备份并覆盖恢复到本地存储。
   *
   * 恢复完成后会主动广播 store reload，让已打开页面重新读取最新数据。
   *
   * @param obj - 目标备份对象。
   */
  const handleRestore = async (obj: RemoteBackupVersion) => {
    if (!s3Config) return;
    const okToRestore = await confirm({
      title: t('cloudSyncPanel.remoteBackups.restoreConfirmTitle'),
      description: t('cloudSyncPanel.remoteBackups.restoreConfirmDesc', { name: obj.name }),
      confirmLabel: t('cloudSyncPanel.actions.restore'),
      cancelLabel: t('common.cancel'),
      variant: 'destructive',
    });
    if (!okToRestore) return;
    const ok = await validateS3EndpointUrl();
    if (!ok) return;
    setRestoring(obj.key);
    try {
      const zipBlob = await getObjectBlob(s3Config, obj.key);
      await importBackupFromZip(zipBlob);
      broadcastStoreReload();
      toast.success(t('cloudSyncPanel.s3.toast.restored'));
    } catch (e: unknown) {
      toastError(e);
    } finally {
      setRestoring(null);
    }
  };

  /**
   * 删除指定远端备份，并同步更新当前列表。
   *
   * @param obj - 待删除的备份对象。
   */
  const handleDeleteBackup = async (obj: RemoteBackupVersion) => {
    if (!s3Config) return;
    const ok = await validateS3EndpointUrl();
    if (!ok) return;
    setDeleting(obj.key);
    try {
      await deleteObject(s3Config, obj.key);
      setBackupList(prev => prev.filter(o => o.key !== obj.key));
      toast.success(t('cloudSyncPanel.s3.toast.deleted'));
    } catch (e: unknown) {
      toastError(e);
    } finally {
      setDeleting(null);
    }
  };

  /**
   * 测试当前 S3 配置是否可连通。
   *
   * 说明：
   * - 不会修改远端任何对象，只做连通性校验；
   * - 失败时统一走 toast 错误出口，便于用户就地修正配置。
   */
  const handleTestConnection = async () => {
    if (!s3Config) return;
    try {
      const okPerm = await validateS3EndpointUrl();
      if (!okPerm) return;
      await testConnection(s3Config);
      toast.success(t('cloudSyncPanel.s3.toast.connectionOk'));
    } catch (e: unknown) {
      toastError(e, t('cloudSyncPanel.s3.toast.connectionFailedTitle'));
    }
  };

  const syncStatusText = syncStatus.lastSyncedAt
    ? t('cloudSyncPanel.sync.lastSuccess', {
        time: new Date(syncStatus.lastSyncedAt).toLocaleString(),
        merged: syncStatus.merged ?? 0,
      })
    : syncStatus.lastRunAt && syncStatus.ok === false
      ? t('cloudSyncPanel.sync.lastFailure', {
          time: new Date(syncStatus.lastRunAt).toLocaleString(),
        })
      : t('cloudSyncPanel.sync.never');

    /**
   * 内部函数变量：`handleSyncNow`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const handleSyncNow = async () => {
    if (!s3Config) return;
    try {
      const ok = await validateS3EndpointUrl();
      if (!ok) return;
      setSyncing(true);
      const result = await runS3StructuredSync();
      toast.success(t('cloudSyncPanel.sync.toast.synced', { merged: result.merged }));
    } catch (error) {
      toast.error(formatSyncRunError(error, t));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-foreground">{t('cloudSyncPanel.s3.title')}</h3>
            <Info className="h-4 w-4 text-muted-foreground/60" />
          </div>
          <p className="text-sm text-muted-foreground/80">{t('cloudSyncPanel.s3.description')}</p>
        </div>

        <div className="rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm">
          <div className="p-4 space-y-4">
            <SettingsSection>
              <SettingsRow label={t('cloudSyncPanel.s3.fields.apiUrl')}>
                <Input value={endpoint} onChange={e => patchConfig({ endpoint: e.target.value })} placeholder={t('cloudSyncPanel.s3.fields.apiUrlPlaceholder')} className="h-8 text-sm w-56" />
              </SettingsRow>
              <SettingsRow label={t('cloudSyncPanel.s3.fields.region')}>
                <Input value={region} onChange={e => patchConfig({ region: e.target.value })} placeholder={t('cloudSyncPanel.s3.fields.regionPlaceholder')} className="h-8 text-sm w-56" />
              </SettingsRow>
              <SettingsRow label={t('cloudSyncPanel.s3.fields.bucket')}>
                <Input value={bucket} onChange={e => patchConfig({ bucket: e.target.value })} placeholder={t('cloudSyncPanel.s3.fields.bucketPlaceholder')} className="h-8 text-sm w-56" />
              </SettingsRow>
              <SettingsRow label={t('cloudSyncPanel.s3.fields.accessKeyId')}>
                <Input value={accessKeyId} onChange={e => patchConfig({ accessKeyId: e.target.value })} placeholder={t('cloudSyncPanel.s3.fields.accessKeyIdPlaceholder')} className="h-8 text-sm w-56" />
              </SettingsRow>
              <SettingsRow label={t('cloudSyncPanel.s3.fields.secretAccessKey')}>
                <PasswordInput
                  value={secretAccessKey}
                  onChange={(v) => patchConfig({ secretAccessKey: v })}
                  placeholder={t('cloudSyncPanel.s3.fields.secretAccessKeyPlaceholder')}
                  show={showSecret}
                  onToggle={() => setShowSecret(!showSecret)}
                />
              </SettingsRow>
              <SettingsRow label={t('cloudSyncPanel.s3.fields.backupDir')}>
                <Input value={root} onChange={e => patchConfig({ root: e.target.value })} placeholder={t('cloudSyncPanel.s3.fields.backupDirPlaceholder')} className="h-8 text-sm w-56" />
              </SettingsRow>
              <SettingsRow label={t('cloudSyncPanel.s3.actions.connectionTest')}>
                <Button variant="outline" size="sm" className="gap-1.5 whitespace-nowrap" disabled={!canConnect} onClick={() => void handleTestConnection()}>
                  <Wifi className="h-3.5 w-3.5" /> {t('cloudSyncPanel.s3.actions.testConnection')}
                </Button>
              </SettingsRow>
            </SettingsSection>

            <SettingsSection
              title={t('cloudSyncPanel.snapshotBackup.title')}
              description={t('cloudSyncPanel.snapshotBackup.desc')}
            >
              <SettingsRow label={t('cloudSyncPanel.dataDir.backupRestore')}>
                <div className="settings-responsive-actions flex min-w-0 flex-wrap justify-end gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 whitespace-nowrap" disabled={!canConnect || backing} onClick={() => void handleBackup()}>
                    {backing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} {t('cloudSyncPanel.s3.actions.backup')}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 whitespace-nowrap" disabled={!canConnect} onClick={() => void handleManage()}>
                    <FolderArchive className="h-3.5 w-3.5" /> {t('cloudSyncPanel.s3.manage.title')}
                  </Button>
                </div>
              </SettingsRow>
              <SettingsRow label={t('cloudSyncPanel.maxBackups.title')}>
                <MaxBackupsSelect value={maxBackups} onChange={(v) => patchConfig({ maxBackups: v })} />
              </SettingsRow>
              <SettingsRow label={t('cloudSyncPanel.liteBackup.title')} description={t('cloudSyncPanel.liteBackup.desc')}>
                <Switch checked={liteBackupEnabled} onCheckedChange={(checked) => patchConfig({ backupProfile: checked ? 'lite' : 'full' })} />
              </SettingsRow>
            </SettingsSection>

            <SettingsSection
              title={t('cloudSyncPanel.sync.title')}
              description={t('cloudSyncPanel.sync.desc')}
            >
              <SettingsRow label={t('cloudSyncPanel.autoSync.title')}>
                <SyncIntervalSelect
                  value={syncInterval}
                  onChange={(v) => {
                    void (async () => {
                      const next = normalizeSyncIntervalMinutes(v);
                      if (next > 0) {
                        const ok = await validateS3EndpointUrl();
                        if (!ok) {
                          patchConfig({ syncInterval: 0 });
                          return;
                        }
                      }
                      patchConfig({ syncInterval: next });
                    })();
                  }}
                />
              </SettingsRow>
              <SettingsRow label={t('cloudSyncPanel.sync.runLabel')} description={syncStatusText}>
                <SyncNowButton syncing={syncing} disabled={!canConnect} onClick={() => void handleSyncNow()}>
                  {t('cloudSyncPanel.sync.syncNow')}
                </SyncNowButton>
              </SettingsRow>
            </SettingsSection>
          </div>
        </div>
      </div>

      <RemoteBackupVersionsDialog
        open={showManage}
        onOpenChange={setShowManage}
        title={t('cloudSyncPanel.s3.manage.title')}
        description={t('cloudSyncPanel.s3.manage.description')}
        items={backupList}
        loading={listLoading}
        restoringKey={restoring}
        deletingKey={deleting}
        onRefresh={() => void loadBackupList()}
        onRestore={(item) => void handleRestore(item)}
        onDelete={(item) => void handleDeleteBackup(item)}
      />
      <ConfirmDialogPortal />
    </>
  );
}
