/**
 * 说明：`useDataDirContentView` 组件模块。
 *
 * 职责：
 * - 承载 `useDataDirContentView` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useDataDirContentView` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Copy, ClipboardPaste, Loader2, RefreshCw } from 'lucide-react';
import { toast } from '@/hooks/useToast';
import { exportBackupAsZip, importBackupFromZip, broadcastStoreReload } from '@/lib/backup';
import {
  DEFAULT_BACKUP_PROFILE,
  isLiteBackupProfile,
} from '@/lib/backup-config';
import { clearAllMemories, countMemories } from '@/lib/memory';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import { toI18nTextFromError } from '@/lib/i18n/error';
import { formatI18nText } from '@/lib/i18n/format';
import {
  clearRegisteredPersistenceDomains,
  summarizeRegisteredPersistenceDomains,
} from '@/lib/persistence/maintenance';
import type { BackupProfile } from '@/lib/persistence/types';
import { SettingsCard, SettingsRow, SettingsSection } from './shared';
import { BACKUP_FILE_ACCEPT, buildBackupFileName, downloadBackupBlob } from './shared-utils';

/**
 * 数据目录面板视图逻辑。
 *
 * 负责：
 * - 导出/恢复 ZIP 备份；
 * - 展示数据规模摘要；
 * - 清理记忆、缓存与整包重置数据。
 *
 * 这是一个返回 JSX 的 hook 风格视图函数，便于与 `DataDirContent` 外壳分离。
 */
export function useDataDirContentView() {
  const { t } = useTranslation();
  // 统一错误出口：尽量将异常归一为 I18nText，再由 UI 渲染为最终文案（避免直接展示 error.message）。
  /**
   * 用统一 toast 形式展示数据目录相关错误。
   *
   * 说明：
   * - 这里不直接拼接 `error.message`，而是先归一成 `I18nText` 再交给 UI 渲染；
   * - 这样可以避免后台错误 key、原始异常对象或未本地化文案直接泄漏到界面。
   */
  const toastError = (e: unknown) => toast.error(formatI18nText(t, toI18nTextFromError(e)));
  /** 当前导出时选中的备份档位。 */
  const [backupProfile, setBackupProfile] = useState<BackupProfile>(DEFAULT_BACKUP_PROFILE);
  /** 当前浏览器估算的缓存占用大小。 */
  const [cacheSize, setCacheSize] = useState('—');
  /** 恢复备份文件选择器引用。 */
  const restoreRef = useRef<HTMLInputElement | null>(null);

  /** 查看应用数据摘要弹窗开关。 */
  const [dataOpen, setDataOpen] = useState(false);
  /** 删除“知识库/记忆文件”确认弹窗开关。 */
  const [deleteFilesOpen, setDeleteFilesOpen] = useState(false);
  /** 清空缓存确认弹窗开关。 */
  const [clearCacheOpen, setClearCacheOpen] = useState(false);
  /** 整体重置数据确认弹窗开关。 */
  const [resetOpen, setResetOpen] = useState(false);

  /** 当前是否有危险操作正在执行。 */
  const [busy, setBusy] = useState(false);

  /** 当前生成的应用数据摘要文本。 */
  const [dataSummary, setDataSummary] = useState<string>('');
  /** 数据摘要是否正在加载。 */
  const [dataLoading, setDataLoading] = useState(false);

  /**
   * 刷新浏览器侧整体存储占用估算。
   *
   * 这里只读取浏览器 `StorageManager.estimate()` 的粗略值，
   * 用于给“清除缓存”操作提供一个可感知的量级提示。
   */
  const refreshStorageEstimate = useCallback(async () => {
    if (!navigator.storage?.estimate) return;
    try {
      const est = await navigator.storage.estimate();
      const usage = typeof est.usage === 'number' ? est.usage : 0;
      const mb = usage / 1024 / 1024;
      setCacheSize(`${mb.toFixed(0)}MB`);
    } catch {
      setCacheSize('—');
    }
  }, []);

  useEffect(() => {
    void refreshStorageEstimate();
  }, [refreshStorageEstimate]);

  /** 导出一份当前数据备份。 */
  const doBackup = async () => {
    try {
      const blob = await exportBackupAsZip(backupProfile);
      await downloadBackupBlob(blob, buildBackupFileName(backupProfile));
      toast.success(t('cloudSyncPanel.dataDir.toast.backupExported'));
    } catch (e: unknown) {
      toastError(e);
    }
  };

  /**
   * 从备份文件恢复数据。
   *
   * @param file - 用户选择的 ZIP 备份文件。
   */
  const doRestore = async (file: File) => {
    try {
      await importBackupFromZip(file);
      broadcastStoreReload();
      toast.success(t('cloudSyncPanel.dataDir.toast.restoreDone'));
    } catch (e: unknown) {
      toastError(e);
    }
  };

  /**
   * 汇总当前应用数据规模并生成 JSON 摘要。
   *
   * 说明：
   * - 只读取注册表内声明过的持久化域；
   * - 不再直接扫描 `localStorage` / `chrome.storage.local` 原始键空间；
   * - 最终结果会序列化为格式化 JSON，供用户复制或排查数据占用。
   */
  const loadDataSummary = async () => {
    setDataLoading(true);
    try {
      const [summary, memoryCount] = await Promise.all([
        summarizeRegisteredPersistenceDomains(),
        countMemories().catch(() => 0),
      ]);
      setDataSummary(JSON.stringify({
        ...summary,
        diagnostics: {
          memoryCount,
        },
      }, null, 2));
    } catch (e: unknown) {
      toastError(e);
      setDataSummary('');
    } finally {
      setDataLoading(false);
    }
  };

  /** 清空记忆等“知识库文件”数据。 */
  const clearKbFiles = async () => {
    setBusy(true);
    try {
      await clearAllMemories();
      broadcastStoreReload();
      toast.success(t('cloudSyncPanel.dataDir.toast.filesDeleted'));
      void refreshStorageEstimate();
    } catch (e: unknown) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  /**
   * 清空 Cache Storage 等浏览器缓存。
   *
   * 该操作不触碰聊天消息、附件和记忆数据，
   * 主要用于回收页面缓存与离线请求缓存占用。
   */
  const clearCaches = async () => {
    setBusy(true);
    try {
      if (typeof caches !== 'undefined' && caches?.keys) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      toast.success(t('cloudSyncPanel.dataDir.toast.cacheCleared'));
      void refreshStorageEstimate();
    } catch (e: unknown) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  /**
   * 重置扩展的全部本地数据。
   *
   * 顺序上先清空注册表里声明过的持久化域，再清掉 Cache Storage，
   * 最后广播 reload 并刷新页面，让 UI 在空白状态下重新初始化。
   */
  const resetAllData = async () => {
    setBusy(true);
    try {
      await clearRegisteredPersistenceDomains();

      if (typeof caches !== 'undefined' && caches?.keys) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }

      broadcastStoreReload();
      toast.success(t('cloudSyncPanel.dataDir.toast.resetDone'));
      window.setTimeout(() => window.location.reload(), 300);
    } catch (e: unknown) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 数据设置 Card */}
      <SettingsCard title={t('cloudSyncPanel.dataDir.dataSettingsTitle')}>
        <SettingsSection>
          <SettingsRow label={t('cloudSyncPanel.dataDir.backupRestore')}>
            <div className="settings-responsive-actions flex min-w-0 flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 whitespace-nowrap" onClick={() => void doBackup()}>
                <Copy className="h-3.5 w-3.5" /> {t('cloudSyncPanel.actions.backup')}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 whitespace-nowrap" onClick={() => restoreRef.current?.click()}>
                <ClipboardPaste className="h-3.5 w-3.5" /> {t('cloudSyncPanel.actions.restore')}
              </Button>
            </div>
          </SettingsRow>
          <SettingsRow label={t('cloudSyncPanel.liteBackup.title')} description={t('cloudSyncPanel.liteBackup.desc')}>
            <Switch checked={isLiteBackupProfile(backupProfile)} onCheckedChange={(checked) => setBackupProfile(checked ? 'lite' : 'full')} />
          </SettingsRow>
        </SettingsSection>
      </SettingsCard>

      <input
        ref={restoreRef}
        type="file"
        accept={BACKUP_FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = '';
          if (!f) return;
          void doRestore(f);
        }}
      />

      {/* 数据目录 Card */}
      <SettingsCard title={t('cloudSyncPanel.dataDir.dataDirTitle')}>
        <SettingsSection>
          <SettingsRow label={t('cloudSyncPanel.dataDir.appData')} description={t('cloudSyncPanel.dataDir.appDataDesc')}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDataOpen(true);
                void loadDataSummary();
              }}
            >
              {t('cloudSyncPanel.dataDir.viewData')}
            </Button>
          </SettingsRow>
          <SettingsRow label={t('cloudSyncPanel.dataDir.kbFiles')}>
            <Button variant="outline" size="sm" onClick={() => setDeleteFilesOpen(true)}>
              {t('cloudSyncPanel.dataDir.deleteFiles')}
            </Button>
          </SettingsRow>
          <SettingsRow label={<span>{t('cloudSyncPanel.dataDir.clearCache')} <span className="text-muted-foreground font-normal">({cacheSize})</span></span>}>
            <Button variant="outline" size="sm" onClick={() => setClearCacheOpen(true)}>
              {t('cloudSyncPanel.dataDir.clearCache')}
            </Button>
          </SettingsRow>
          <SettingsRow label={t('cloudSyncPanel.dataDir.resetData')}>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setResetOpen(true)}
            >
              {t('cloudSyncPanel.dataDir.resetData')}
            </Button>
          </SettingsRow>
        </SettingsSection>
      </SettingsCard>

      {/* 查看数据 */}
      <Dialog open={dataOpen} onOpenChange={(v) => !v && setDataOpen(false)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('cloudSyncPanel.dataDir.viewDataDialog.title')}</DialogTitle>
            <DialogDescription>{t('cloudSyncPanel.dataDir.viewDataDialog.desc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => void loadDataSummary()} disabled={dataLoading}>
                {dataLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                {t('cloudSyncPanel.actions.refresh')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(dataSummary || '');
                    toast.success(t('cloudSyncPanel.dataDir.toast.copied'));
                  } catch {
                    toast.error(t('cloudSyncPanel.toast.copyFailed'));
                  }
                }}
                disabled={!dataSummary}
              >
                {t('cloudSyncPanel.actions.copy')}
              </Button>
            </div>

            <div className="max-h-[420px] overflow-auto rounded-md border border-border bg-muted/20 p-3">
              {dataLoading ? (
                <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
              ) : (
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{dataSummary || '—'}</pre>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setDataOpen(false)}>{t('common.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除文件确认 */}
      <Dialog open={deleteFilesOpen} onOpenChange={(v) => !v && setDeleteFilesOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cloudSyncPanel.dataDir.deleteFilesDialog.title')}</DialogTitle>
            <DialogDescription>{t('cloudSyncPanel.dataDir.deleteFilesDialog.desc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteFilesOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteFilesOpen(false);
                void clearKbFiles();
              }}
              disabled={busy}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 清除缓存确认 */}
      <Dialog open={clearCacheOpen} onOpenChange={(v) => !v && setClearCacheOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cloudSyncPanel.dataDir.clearCacheDialog.title')}</DialogTitle>
            <DialogDescription>{t('cloudSyncPanel.dataDir.clearCacheDialog.desc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setClearCacheOpen(false)}>{t('common.cancel')}</Button>
            <Button
              onClick={() => {
                setClearCacheOpen(false);
                void clearCaches();
              }}
              disabled={busy}
            >
              {t('cloudSyncPanel.dataDir.clearCache')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重置数据确认 */}
      <Dialog open={resetOpen} onOpenChange={(v) => !v && setResetOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">{t('cloudSyncPanel.dataDir.resetDialog.title')}</DialogTitle>
            <DialogDescription>{t('cloudSyncPanel.dataDir.resetDialog.desc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setResetOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setResetOpen(false);
                void resetAllData();
              }}
              disabled={busy}
            >
              {t('cloudSyncPanel.dataDir.resetData')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
