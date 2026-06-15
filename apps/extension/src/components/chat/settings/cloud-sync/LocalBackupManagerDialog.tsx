/**
 * 说明：`LocalBackupManagerDialog` 组件模块。
 *
 * 职责：
 * - 展示本地备份快照列表；
 * - 承载恢复、下载、删除和刷新这些列表级动作；
 * - 让 `LocalBackupContent` 保持在配置与动作编排边界内。
 */
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { LocalBackupMeta } from '@/lib/local-backup';
import { ClipboardPaste, Download, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatFileSize } from './shared-utils';

/**
 * 本地备份管理弹窗属性。
 */
export interface LocalBackupManagerDialogProps {
  /** 弹窗是否打开。 */
  open: boolean;
  /** 弹窗打开状态变更回调。 */
  onOpenChange: (open: boolean) => void;
  /** 当前备份列表。 */
  items: LocalBackupMeta[];
  /** 列表是否正在加载。 */
  listLoading: boolean;
  /** 当前正在恢复的备份 ID。 */
  restoring: string | null;
  /** 当前正在删除的备份 ID。 */
  deleting: string | null;
  /** 当前正在下载的备份 ID。 */
  downloading: string | null;
  /** 刷新列表。 */
  onRefresh: () => void;
  /** 恢复指定备份。 */
  onRestore: (meta: LocalBackupMeta) => void;
  /** 下载指定备份。 */
  onDownload: (meta: LocalBackupMeta) => void;
  /** 删除指定备份。 */
  onDelete: (meta: LocalBackupMeta) => void;
  /** 时间格式化函数。 */
  formatDate: (timestamp: number) => string;
}

/**
 * 本地备份快照管理弹窗。
 *
 * @param props - 列表状态与用户动作。
 * @returns 本地快照管理弹窗。
 */
export function LocalBackupManagerDialog({
  deleting,
  downloading,
  formatDate,
  items,
  listLoading,
  onDelete,
  onDownload,
  onOpenChange,
  onRefresh,
  onRestore,
  open,
  restoring,
}: LocalBackupManagerDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('cloudSyncPanel.localBackup.manageTitle')}</DialogTitle>
          <DialogDescription>{t('cloudSyncPanel.localBackup.manageDesc')}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">{t('cloudSyncPanel.localBackup.manageCount', { count: items.length })}</span>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('cloudSyncPanel.actions.refresh')}
            onClick={onRefresh}
            disabled={listLoading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', listLoading && 'animate-spin')} />
          </Button>
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1">
          {listLoading && items.length === 0 && (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> {t('common.loading')}
            </div>
          )}
          {!listLoading && items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">{t('cloudSyncPanel.localBackup.manageEmpty')}</p>
          )}

          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent/50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" title={it.fileName}>
                  {it.fileName}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(it.createdAt)} · {formatFileSize(it.bytes)}{it.lite ? ` · ${t('cloudSyncPanel.liteBackup.title')}` : ''}
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                disabled={restoring === it.id}
                onClick={() => onRestore(it)}
              >
                {restoring === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ClipboardPaste className="h-3 w-3" />}
                {t('cloudSyncPanel.actions.restore')}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                disabled={downloading === it.id}
                onClick={() => onDownload(it)}
              >
                {downloading === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                {t('cloudSyncPanel.actions.download')}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-destructive hover:text-destructive"
                aria-label={t('common.delete')}
                disabled={deleting === it.id}
                onClick={() => onDelete(it)}
              >
                {deleting === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
