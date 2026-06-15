/**
 * 说明：远端备份版本选择弹窗。
 *
 * 职责：
 * - 统一 WebDAV / S3 的远端 ZIP 快照列表展示；
 * - 只承载版本选择、刷新和行内恢复动作，不直接知道 provider 网络细节；
 * - 让恢复动作始终从用户明确选择的版本发起，避免隐式恢复最近文件。
 */
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { cn } from '@/lib/utils';
import { ArchiveRestore, FileArchive, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { formatFileSize, type RemoteBackupVersion } from './shared-utils';

/** 远端备份版本弹窗属性。 */
export interface RemoteBackupVersionsDialogProps {
  /** 弹窗是否打开。 */
  open: boolean;
  /** 弹窗开关回调。 */
  onOpenChange: (open: boolean) => void;
  /** 标题文案。 */
  title: string;
  /** 说明文案。 */
  description: string;
  /** 当前远端备份版本列表。 */
  items: RemoteBackupVersion[];
  /** 是否正在刷新列表。 */
  loading: boolean;
  /** 当前正在恢复的版本 key。 */
  restoringKey?: string | null;
  /** 当前正在删除的版本 key。 */
  deletingKey?: string | null;
  /** 刷新远端版本列表。 */
  onRefresh: () => void;
  /** 从指定版本恢复。 */
  onRestore: (item: RemoteBackupVersion) => void;
  /** 可选：删除指定版本。 */
  onDelete?: (item: RemoteBackupVersion) => void;
}

/**
 * 远端备份版本选择弹窗。
 *
 * @param props - 弹窗状态、版本列表和行内操作。
 * @returns 统一设置页密度的版本列表弹窗。
 */
export function RemoteBackupVersionsDialog({
  open,
  onOpenChange,
  title,
  description,
  items,
  loading,
  restoringKey,
  deletingKey,
  onRefresh,
  onRestore,
  onDelete,
}: RemoteBackupVersionsDialogProps) {
  const { t } = useTranslation();
  const headerRef = useRef<HTMLDivElement | null>(null);

  const handleOpenAutoFocus = useCallback((event: Event) => {
    // 说明：Radix 默认会把首焦点落到第一个可聚焦按钮上，导致刷新 tooltip 在弹窗打开时直接弹出。
    // 这里把初始焦点收回到非交互标题区，后续 Tab 顺序仍然正常进入工具按钮和列表操作。
    event.preventDefault();
    headerRef.current?.focus({ preventScroll: true });
  }, []);

  /** 把远端修改时间格式化成本地可读文本；缺失时展示未知时间。 */
  const formatDate = (timestamp: number) => {
    if (!timestamp) return t('cloudSyncPanel.remoteBackups.unknownTime');
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return t('cloudSyncPanel.remoteBackups.unknownTime');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0" onOpenAutoFocus={handleOpenAutoFocus}>
        <DialogHeader className="border-b border-border/40 px-5 py-4 pr-12">
          <div ref={headerRef} tabIndex={-1} className="space-y-1.5 focus:outline-none">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="leading-relaxed">{description}</DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex h-11 items-center justify-between border-b border-border/30 bg-muted/20 px-5">
          <span className="text-xs font-medium text-muted-foreground">
            {t('cloudSyncPanel.remoteBackups.count', { count: items.length })}
          </span>
          <TooltipAction tooltip={t('common.refresh')}>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          </TooltipAction>
        </div>

        <ScrollArea className="h-[min(360px,calc(100vh-12rem))] min-h-[184px]" viewportClassName="p-2">
          {loading && items.length === 0 && (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('common.loading')}
            </div>
          )}
          {!loading && items.length === 0 && (
            <p className="flex min-h-40 items-center justify-center px-4 text-center text-sm text-muted-foreground">
              {t('cloudSyncPanel.remoteBackups.empty')}
            </p>
          )}
          {items.length > 0 ? (
            <ul className="space-y-1">
              {items.map((item) => {
                const isRestoring = restoringKey === item.key;
                const isDeleting = deletingKey === item.key;

                return (
                  <li
                    key={item.key}
                    className="group grid grid-cols-[auto,minmax(0,1fr),auto] items-center gap-3 rounded-md border border-transparent px-3 py-2.5 transition-colors hover:border-border/60 hover:bg-accent/35 focus-within:border-ring/30 focus-within:bg-accent/35 max-[520px]:grid-cols-[auto,minmax(0,1fr)]"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border/50 bg-background text-muted-foreground shadow-sm">
                      <FileArchive className="h-4 w-4" />
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium leading-5 text-foreground" title={item.url || item.key}>
                        {item.name}
                      </div>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="rounded-sm bg-muted/60 px-1.5 py-0.5 tabular-nums leading-none text-muted-foreground">
                          {formatDate(item.lastModified)}
                        </span>
                        <span className="rounded-sm bg-muted/60 px-1.5 py-0.5 tabular-nums leading-none text-muted-foreground">
                          {formatFileSize(item.size)}
                        </span>
                        {item.profile === 'lite' ? (
                          <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium leading-none text-primary">
                            {t('cloudSyncPanel.liteBackup.title')}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-1.5 max-[520px]:col-span-2 max-[520px]:pl-12">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 px-2.5 text-xs font-medium"
                        disabled={isRestoring}
                        onClick={() => onRestore(item)}
                      >
                        {isRestoring ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ArchiveRestore className="h-3.5 w-3.5" />
                        )}
                        {t('cloudSyncPanel.actions.restore')}
                      </Button>
                      {onDelete ? (
                        <TooltipAction tooltip={t('common.delete')}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            disabled={isDeleting}
                            onClick={() => onDelete(item)}
                          >
                            {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </TooltipAction>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
