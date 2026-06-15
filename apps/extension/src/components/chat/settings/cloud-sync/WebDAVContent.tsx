/**
 * 说明：`WebDAVContent` 组件模块。
 *
 * 职责：
 * - 承载 `WebDAVContent` 相关的当前文件实现与模块边界；
 * - 对外暴露 `WebDAVContent` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useMemo, useState } from 'react';
import { useChromeStorageConfig } from '@/hooks/useChromeStorageConfig';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Save, ClipboardPaste, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/useToast';
import { exportBackupAsZip, importBackupFromZip, broadcastStoreReload } from '@/lib/backup';
import {
  BACKUP_MIME_TYPE,
  DEFAULT_BACKUP_PROFILE,
  isLiteBackupProfile,
  normalizeBackupProfile,
} from '@/lib/backup-config';
import { normalizeSyncIntervalMinutes, normalizeMaxBackups } from '@/lib/sync/normalize';
import {
  formatSyncRunError,
  buildWebDavSyncUrl,
  type SyncRunStatusRecord,
  type SyncRunStatus,
  runWebDavStructuredSync,
  WEBDAV_SYNC_STATUS_KEY,
} from '@/lib/sync/cloud-sync';
import { useTranslation } from 'react-i18next';
import { I18nError, toI18nTextFromError } from '@/lib/i18n/error';
import { formatI18nText } from '@/lib/i18n/format';
import { toHostMatchPatternFromUrl } from '@/lib/extension/host-match-patterns';
import { SettingsCard, SettingsRow, SettingsSection, SyncIntervalSelect, MaxBackupsSelect, PasswordInput, SyncNowButton } from './shared';
import { buildBackupFileName, type RemoteBackupVersion } from './shared-utils';
import { RemoteBackupVersionsDialog } from './RemoteBackupVersionsDialog';
import { buildWebDavBackupDirectoryUrl, listWebDavBackupVersions } from '@/lib/webdav-backup-list';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

/**
 * WebDAV 云同步面板。
 *
 * 负责：
 * - 管理 WebDAV 地址、认证与目录配置；
 * - 执行手动备份 / 恢复；
 * - 在目录模式下尽力清理超过上限的旧备份。
 */
export function WebDAVContent() {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [backupList, setBackupList] = useState<RemoteBackupVersion[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [restoringKey, setRestoringKey] = useState<string | null>(null);
  const { confirm, ConfirmDialogPortal } = useConfirmDialog();

  const [config, patchConfig] = useChromeStorageConfig(
    'olyq.sync.webdav.v1',
    { syncInterval: 0, maxBackups: 0, backupProfile: DEFAULT_BACKUP_PROFILE, disableStream: false, url: '', username: '', password: '', path: '/olyq' },
    (r) => ({
      syncInterval: normalizeSyncIntervalMinutes(r.syncInterval),
      maxBackups: normalizeMaxBackups(r.maxBackups),
      backupProfile: normalizeBackupProfile(r.backupProfile),
      ...(typeof r.disableStream === 'boolean' ? { disableStream: r.disableStream } : {}),
      ...(typeof r.url === 'string' ? { url: r.url } : {}),
      ...(typeof r.username === 'string' ? { username: r.username } : {}),
      ...(typeof r.password === 'string' ? { password: r.password } : {}),
      ...(typeof r.path === 'string' ? { path: r.path } : {}),
    }),
  );
  const { syncInterval, maxBackups, backupProfile, disableStream, url, username, password, path } = config;
  const liteBackupEnabled = isLiteBackupProfile(backupProfile);
  const [syncStatus] = useChromeStorageConfig<SyncRunStatusRecord>(
    WEBDAV_SYNC_STATUS_KEY,
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

  /**
   * 归一化 WebDAV 基础地址，去掉尾部多余 `/`。
   *
   * @param u - 原始 URL。
   * @returns 归一化后的基础地址。
   */
  const normalizeBase = (u: string) => u.replace(/\/+$/, '');
  /**
   * 归一化 WebDAV 路径，确保目录/文件路径统一以 `/` 开头。
   *
   * @param p - 原始路径。
   * @returns 归一化后的路径。
   */
  const normalizePath = (p: string) => {
    const t = String(p || '').trim();
    if (!t) return '';
    return t.startsWith('/') ? t : `/${t}`;
  };

  /**
   * 组合出最终备份文件目标 URL。
   *
   * @param base - WebDAV 基础地址。
   * @param p - 用户配置的目录路径。
   * @param filename - 自动生成的备份文件名。
   * @returns 可直接用于 PUT/GET 的目标 URL。
   */
  const buildTargetUrl = (base: string, p: string, filename: string) => {
    const b = normalizeBase(base);
    const raw = normalizePath(p) || '/';
    const dir = raw.replace(/\/+$/, '');
    return `${b}${dir}/${filename}`;
  };

  /**
   * 构造 HTTP Basic Auth 请求头。
   *
   * @param u - 用户名。
   * @param p - 密码。
   * @returns `Authorization` 请求头值。
   */
  const toBasicAuth = (u: string, p: string) => {
    const s = `${u}:${p}`;
    const bytes = new TextEncoder().encode(s);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      const slice = bytes.subarray(i, Math.min(bytes.length, i + chunk));
      bin += String.fromCharCode(...Array.from(slice));
    }
    return `Basic ${btoa(bin)}`;
  };

  const canConnect = Boolean(url.trim());
  const authHeader = username || password ? toBasicAuth(username, password) : '';

  /**
   * WebDAV 属于用户自托管 URL；当前安装期 host access 已覆盖普通 http/https。
   *
   * 这里只校验 URL 可转换为浏览器 host match pattern，真实连通性和鉴权错误交给后续 fetch 链路。
   */
  const validateWebDavEndpointUrl = async (): Promise<boolean> => {
    const pat = toHostMatchPatternFromUrl(url);
    if (!pat) {
      toast.error(formatI18nText(t, toI18nTextFromError(new I18nError('errors.invalidUrl', { url }))));
      return false;
    }
    return true;
  };

  const backupFileName = useMemo(() => {
    return buildBackupFileName(backupProfile);
  }, [backupProfile]);

  const uploadUrl = canConnect ? buildTargetUrl(url, path, backupFileName) : '';
  const syncTargetUrl = canConnect ? buildWebDavSyncUrl(url, path) : '';
  const backupDirectoryUrl = canConnect ? buildWebDavBackupDirectoryUrl(url, path) : '';

  /**
   * 执行一次 WebDAV 手动备份。
   *
   * 说明：
   * - 先校验目标 URL；
   * - 上传备份 ZIP；
   * - 若当前是目录模式且设置了最大备份数，则尽力通过 PROPFIND + DELETE 清理旧文件。
   */
  const backupToWebDav = async () => {
    if (!canConnect) return;
    try {
      const ok = await validateWebDavEndpointUrl();
      if (!ok) return;
      const blob = await exportBackupAsZip(backupProfile);
      const resp = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': BACKUP_MIME_TYPE,
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: blob,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        const detail = `${text || ''}`.trim();
        throw new I18nError(
          'errors.httpRequestFailedWithDetail',
          { detail: detail ? `HTTP ${resp.status}: ${detail}` : `HTTP ${resp.status}` },
          { cause: { status: resp.status, text } },
        );
      }
      // 参数 maxBackups：目录模式尽力清理旧备份（PROPFIND + DELETE）
      try {
        if (maxBackups > 0) {
          const versions = await listWebDavBackupVersions({ url, path, authHeader });
          const toDelete = versions.slice(maxBackups);
          for (const item of toDelete) {
            await fetch(item.url || item.key, {
              method: 'DELETE',
              headers: { ...(authHeader ? { Authorization: authHeader } : {}) },
            }).catch(() => void 0);
          }
          if (toDelete.length > 0) toast.info(t('cloudSyncPanel.localBackup.toast.cleaned', { count: toDelete.length }));
        }
      } catch {
        // 清理失败不影响备份本身
      }

      toast.success(t('cloudSyncPanel.webdav.toast.backedUp'));
    } catch (e: unknown) {
      toast.error(formatI18nText(t, toI18nTextFromError(e, { key: 'errors.httpRequestFailed' })));
    }
  };

  /**
   * 拉取 WebDAV 远端备份版本列表。
   *
   * 说明：
   * - 恢复入口只认用户在弹窗中显式选择的版本；
   * - 目录为空或 PROPFIND 失败都不会退回旧的 lastBackupUrl / 自动猜最近文件。
   */
  const loadBackupList = async () => {
    if (!canConnect) return;
    setListLoading(true);
    try {
      const ok = await validateWebDavEndpointUrl();
      if (!ok) return;
      const versions = await listWebDavBackupVersions({ url, path, authHeader });
      setBackupList(versions);
    } catch (e: unknown) {
      toast.error(formatI18nText(t, toI18nTextFromError(e, { key: 'errors.httpRequestFailed' })));
    } finally {
      setListLoading(false);
    }
  };

  /** 打开 WebDAV 备份版本弹窗并立即刷新远端列表。 */
  const openRestoreDialog = async () => {
    if (!canConnect) return;
    setManageOpen(true);
    await loadBackupList();
  };

  /**
   * 从用户选定的 WebDAV 备份版本恢复本地数据。
   *
   * @param item - 用户在版本列表中选择的远端 ZIP 版本。
   */
  const restoreFromWebDavVersion = async (item: RemoteBackupVersion) => {
    const okToRestore = await confirm({
      title: t('cloudSyncPanel.remoteBackups.restoreConfirmTitle'),
      description: t('cloudSyncPanel.remoteBackups.restoreConfirmDesc', { name: item.name }),
      confirmLabel: t('cloudSyncPanel.actions.restore'),
      cancelLabel: t('common.cancel'),
      variant: 'destructive',
    });
    if (!okToRestore) return;

    const targetUrl = item.url || item.key;
    if (!targetUrl) {
      toast.error(t('cloudSyncPanel.webdav.toast.restoreUrlMissing'));
      return;
    }

    try {
      const ok = await validateWebDavEndpointUrl();
      if (!ok) return;
      setRestoringKey(item.key);
      const resp = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        const detail = `${text || ''}`.trim();
        throw new I18nError(
          'errors.httpRequestFailedWithDetail',
          { detail: detail ? `HTTP ${resp.status}: ${detail}` : `HTTP ${resp.status}` },
          { cause: { status: resp.status, text } },
        );
      }
      const blob = await resp.blob();
      await importBackupFromZip(blob);
      broadcastStoreReload();
      toast.success(t('cloudSyncPanel.webdav.toast.restored'));
    } catch (e: unknown) {
      toast.error(formatI18nText(t, toI18nTextFromError(e, { key: 'errors.httpRequestFailed' })));
    } finally {
      setRestoringKey(null);
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
   * 内部函数变量：`syncNow`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const syncNow = async () => {
    try {
      const ok = await validateWebDavEndpointUrl();
      if (!ok) return;
      setSyncing(true);
      const result = await runWebDavStructuredSync();
      toast.success(t('cloudSyncPanel.sync.toast.synced', { merged: result.merged }));
    } catch (error) {
      toast.error(formatSyncRunError(error, t));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <SettingsCard title={t('cloudSyncPanel.webdav.title')}>
        <SettingsSection>
          <SettingsRow label={t('cloudSyncPanel.webdav.url')}>
            <Input value={url} onChange={e => patchConfig({ url: e.target.value })} placeholder="http://localhost:8080" className="h-8 text-sm w-56" />
          </SettingsRow>
          <SettingsRow label={t('cloudSyncPanel.webdav.username')}>
            <Input value={username} onChange={e => patchConfig({ username: e.target.value })} placeholder={t('cloudSyncPanel.webdav.usernamePlaceholder')} className="h-8 text-sm w-56" />
          </SettingsRow>
          <SettingsRow label={t('cloudSyncPanel.webdav.password')}>
            <PasswordInput
              value={password}
              onChange={(v) => patchConfig({ password: v })}
              placeholder={t('cloudSyncPanel.webdav.passwordPlaceholder')}
              show={showPassword}
              onToggle={() => setShowPassword(!showPassword)}
            />
          </SettingsRow>
          <SettingsRow label={t('cloudSyncPanel.webdav.path')}>
            <Input value={path} onChange={e => patchConfig({ path: e.target.value })} className="h-8 text-sm w-56" />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection
          title={t('cloudSyncPanel.snapshotBackup.title')}
          description={t('cloudSyncPanel.snapshotBackup.desc')}
        >
          <SettingsRow label={t('cloudSyncPanel.dataDir.backupRestore')}>
            <div className="settings-responsive-actions flex min-w-0 flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 whitespace-nowrap" disabled={!canConnect} onClick={() => void backupToWebDav()}>
                <Save className="h-3.5 w-3.5" /> {t('cloudSyncPanel.webdav.actions.backup')}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 whitespace-nowrap" disabled={!canConnect || listLoading} onClick={() => void openRestoreDialog()}>
                {listLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardPaste className="h-3.5 w-3.5" />} {t('cloudSyncPanel.webdav.actions.restore')}
              </Button>
            </div>
          </SettingsRow>
          <SettingsRow label={t('cloudSyncPanel.webdav.targetFile')} description={t('cloudSyncPanel.webdav.targetFileDesc')}>
            <div className="min-w-0 max-w-[340px] truncate font-mono text-xs text-muted-foreground" title={backupDirectoryUrl || uploadUrl}>
              {backupDirectoryUrl || uploadUrl || '—'}
            </div>
          </SettingsRow>
          <SettingsRow label={t('cloudSyncPanel.maxBackups.title')}>
            <MaxBackupsSelect value={maxBackups} onChange={(v) => patchConfig({ maxBackups: v })} />
          </SettingsRow>
          <SettingsRow label={t('cloudSyncPanel.liteBackup.title')} description={t('cloudSyncPanel.liteBackup.desc')}>
            <Switch checked={liteBackupEnabled} onCheckedChange={(checked) => patchConfig({ backupProfile: checked ? 'lite' : 'full' })} />
          </SettingsRow>
          <SettingsRow label={t('cloudSyncPanel.webdav.disableStream')} description={t('cloudSyncPanel.webdav.disableStreamDesc')}>
            <Switch checked={disableStream} onCheckedChange={(v) => patchConfig({ disableStream: v })} />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection
          title={t('cloudSyncPanel.sync.title')}
          description={t('cloudSyncPanel.sync.desc')}
        >
          <SettingsRow label={t('cloudSyncPanel.sync.runLabel')} description={syncStatusText}>
            <SyncNowButton syncing={syncing} disabled={!canConnect} onClick={() => void syncNow()}>
              {t('cloudSyncPanel.sync.syncNow')}
            </SyncNowButton>
          </SettingsRow>
          <SettingsRow label={t('cloudSyncPanel.autoSync.title')}>
            <SyncIntervalSelect
              value={syncInterval}
              onChange={(v) => {
                void (async () => {
                  const next = normalizeSyncIntervalMinutes(v);
                  if (next > 0) {
                    const ok = await validateWebDavEndpointUrl();
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
          <SettingsRow label={t('cloudSyncPanel.sync.fileLabel')}>
            <div className="min-w-0 max-w-[340px] truncate font-mono text-xs text-muted-foreground" title={syncTargetUrl}>
              {syncTargetUrl || '—'}
            </div>
          </SettingsRow>
        </SettingsSection>
      </SettingsCard>
      <RemoteBackupVersionsDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        title={t('cloudSyncPanel.webdav.manage.title')}
        description={t('cloudSyncPanel.webdav.manage.description')}
        items={backupList}
        loading={listLoading}
        restoringKey={restoringKey}
        onRefresh={() => void loadBackupList()}
        onRestore={(item) => void restoreFromWebDavVersion(item)}
      />
      <ConfirmDialogPortal />
    </>
  );
}
