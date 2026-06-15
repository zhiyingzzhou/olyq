/**
 * 说明：`FilesDialog` 组件模块。
 *
 * 职责：
 * - 承载 `FilesDialog` 相关的当前文件实现与模块边界；
 * - 对外暴露 `FilesDialogProps`、`FilesDialog` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/useToast';
import { Download, RefreshCw, Search, Trash2, Image as ImageIcon, File as FileIcon, History, RotateCcw } from 'lucide-react';
import type { AttachmentKind, AttachmentMeta } from '@/lib/attachments';
import { deleteAttachments, getAttachmentBlob, listAttachmentMetas } from '@/lib/attachments';
import { downloadBlob } from '@/lib/export/download';
import { MediaPreviewOverlay } from '@/components/chat/MediaPreviewOverlay';
import type { LocalBackupMeta } from '@/lib/local-backup';
import { deleteManagedLocalBackup, getLocalBackupBlob, listLocalBackups } from '@/lib/local-backup';
import { broadcastStoreReload, importBackupFromZip } from '@/lib/backup';
import { I18nError, toI18nTextFromError } from '@/lib/i18n/error';
import { formatI18nText } from '@/lib/i18n/format';

/**
 * 将字节数格式化为便于文件列表展示的短文本。
 *
 * 说明：
 * - 这里只用于 UI 展示，不追求严格二进制单位学术精度；
 * - 非法值统一降级成 `0B`，避免把异常数据直接暴露到界面。
 */
function formatBytes(bytes: number) {
  const b = Number(bytes || 0);
  if (!Number.isFinite(b) || b <= 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = b;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)}${units[i]}`;
}

/**
 * 将毫秒时间戳格式化为本地时间字符串。
 *
 * 说明：
 * - 备份和附件列表都走这个展示逻辑，保持时间文案一致；
 * - 时间戳异常时退回原始字符串，避免整个渲染流程抛错。
 */
function formatDate(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts || '');
  }
}

/**
 * 判断事件目标是否落在“媒体预览层”内部。
 *
 * 说明：图片预览通过 Portal 渲染到 document.body，
 * 对底层 FilesDialog 来说，这些点击天然会被视为“外部点击”。
 * 这里统一识别预览层根节点，供 Dialog 的 outside 事件精确拦截使用。
 */
function isTargetWithinMediaPreview(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('[data-media-preview-root="true"]'));
}

/**
 * 文件管理弹窗的入参。
 *
 * 说明：
 * - 组件内部自行管理页签、筛选、预览和异步加载状态；
 * - 外层只需要控制开关与关闭行为。
 */
export interface FilesDialogProps {
  /** 是否显示文件管理弹窗。 */
  open: boolean;
  /** 请求关闭弹窗时的回调。 */
  onClose: () => void;
}

/**
 * 文件与本地备份管理弹窗。
 *
 * 说明：
 * - 附件页签负责筛选、下载、删除和图片预览；
 * - 备份页签负责查看本地备份、恢复备份以及导出历史 ZIP；
 * - 组件本身不会在 `open=false` 时卸载，所以需要主动清理预览 URL 和局部状态。
 */
export function FilesDialog({ open, onClose }: FilesDialogProps) {
  const { t } = useTranslation();
  /** 当前页签：附件管理或本地备份管理。 */
  const [tab, setTab] = useState<'attachments' | 'backups'>('attachments');
  /** 附件列表是否正在刷新。 */
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  /** 备份列表是否正在刷新。 */
  const [loadingBackups, setLoadingBackups] = useState(false);
  /** 任一页签存在异步操作时统一置为加载中。 */
  const loading = loadingAttachments || loadingBackups;

  /** 当前加载到内存的附件元数据列表。 */
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  /** 附件类型筛选条件。 */
  const [kind, setKind] = useState<'all' | AttachmentKind>('all');
  /** 附件搜索关键字。 */
  const [search, setSearch] = useState('');
  /** 当前被批量选中的附件 ID。 */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  /** 图片预览层是否打开。 */
  const [previewOpen, setPreviewOpen] = useState(false);
  /** 当前预览图片对应的 Object URL。 */
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  /** 最近一次创建的预览 URL，用于关闭时回收。 */
  const previewRevokeRef = useRef<string | null>(null);

  /** 本地备份元数据列表。 */
  const [backups, setBackups] = useState<LocalBackupMeta[]>([]);

  /**
   * 统一释放当前预览 Object URL。
   *
   * 背景：图片预览使用 `URL.createObjectURL(blob)` 生成临时地址；
   * 如果不集中回收，切换预览图片或关闭弹窗后会留下无效引用，长期运行会造成内存泄漏。
   */
  const revokePreviewUrl = useCallback(() => {
    if (!previewRevokeRef.current) return;
    URL.revokeObjectURL(previewRevokeRef.current);
    previewRevokeRef.current = null;
  }, []);

  /**
   * 统一重置图片预览状态。
   *
   * 这里故意把“关闭预览 + 清理 URL”收敛到一个入口，避免：
   * - 文件管理 Dialog 关闭后，旧的 `previewOpen` 状态残留；
   * - 重新打开文件管理时，旧预览层重新挂载到错误层级；
   * - 新旧图片切换时，前一个 Object URL 未及时释放。
   */
  const resetPreviewState = useCallback(() => {
    setPreviewOpen(false);
    setPreviewUrl(null);
    revokePreviewUrl();
  }, [revokePreviewUrl]);

  /**
   * 文件管理 Dialog 的统一关闭入口。
   *
   * 说明：FilesDialog 组件本身不会因为 `open=false` 而卸载，
   * 因此必须在这里主动清空预览状态，避免下一次打开时“带着上次的预览层”回来。
   */
  const handleDialogOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) return;
    resetPreviewState();
    onClose();
  }, [onClose, resetPreviewState]);

  /**
   * 拉取附件元数据列表。
   *
   * 说明：
   * - 这里只更新列表，不处理 loading 状态；
   * - 这样可被首次加载和显式刷新两类场景复用。
   */
  const loadAttachments = useCallback(async () => {
    try {
      const list = await listAttachmentMetas(2000);
      setAttachments(list);
    } catch (e: unknown) {
      toast.error(formatI18nText(t, toI18nTextFromError(e)));
    }
  }, [t]);

  /** 带加载态的附件刷新入口。 */
  const refreshAttachments = useCallback(async () => {
    setLoadingAttachments(true);
    try {
      await loadAttachments();
    } finally {
      setLoadingAttachments(false);
    }
  }, [loadAttachments]);

  /**
   * 拉取本地备份元数据列表。
   *
   * 说明：
   * - 只查询备份元信息，不会把实际 ZIP Blob 一并读出；
   * - 真正恢复或下载时才再按 ID 读取内容。
   */
  const loadBackups = useCallback(async () => {
    try {
      const list = await listLocalBackups(100);
      setBackups(list);
    } catch (e: unknown) {
      toast.error(formatI18nText(t, toI18nTextFromError(e)));
    }
  }, [t]);

  /** 带加载态的本地备份刷新入口。 */
  const refreshBackups = useCallback(async () => {
    setLoadingBackups(true);
    try {
      await loadBackups();
    } finally {
      setLoadingBackups(false);
    }
  }, [loadBackups]);

  useEffect(() => {
    if (!open) {
      resetPreviewState();
      return;
    }
    setSelectedIds([]);
    // 每次打开都重新拉取，保证附件和备份视图与后台最新状态一致。
    void refreshAttachments();
    void refreshBackups();
  }, [open, refreshAttachments, refreshBackups, resetPreviewState]);

  /**
   * 根据筛选条件和搜索词派生附件列表。
   *
   * 说明：
   * - 搜索会同时匹配文件名、MIME 和附件 ID；
   * - 该结果同时用于列表渲染和“全选”目标集计算。
   */
  const filteredAttachments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return attachments.filter((a) => {
      if (kind !== 'all' && a.kind !== kind) return false;
      if (!q) return true;
      return a.name.toLowerCase().includes(q) || a.mime.toLowerCase().includes(q) || a.id.toLowerCase().includes(q);
    });
  }, [attachments, kind, search]);

  /**
   * 切换单个附件的选中状态。
   *
   * 说明：
   * - 使用 Set 去重，避免 Checkbox 多次触发时把同一 ID 写入多份；
   * - 返回新数组是为了兼容 React state 的不可变更新约定。
   */
  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const set = new Set(prev);
      if (checked) set.add(id);
      else set.delete(id);
      return Array.from(set);
    });
  };

  /**
   * 切换当前筛选结果中的“全选”状态。
   *
   * 说明：
   * - 只影响当前筛选后的可见附件，不会跨筛选条件保留隐藏项；
   * - 取消全选时直接清空 `selectedIds`，让交互语义保持简单明确。
   */
  const toggleAll = (checked: boolean) => {
    if (checked) setSelectedIds(filteredAttachments.map((a) => a.id));
    else setSelectedIds([]);
  };

  /**
   * 批量删除当前选中的附件。
   *
   * 说明：
   * - 删除成功后会重新拉取附件列表，确保列表、计数和选中状态一致；
   * - 失败时保持原有选中状态，方便用户重试或调整。
   */
  const doDeleteSelected = async () => {
    const ids = selectedIds.slice();
    if (ids.length === 0) return;
    setLoadingAttachments(true);
    try {
      await deleteAttachments(ids);
      setSelectedIds([]);
      await loadAttachments();
      toast.success(t('files.toast.deleted', { count: ids.length }));
    } catch (e: unknown) {
      toast.error(formatI18nText(t, toI18nTextFromError(e)));
    } finally {
      setLoadingAttachments(false);
    }
  };

  /**
   * 打开图片附件预览。
   *
   * 说明：
   * - 仅图片类型允许预览，其它附件直接忽略；
   * - 切换预览目标前会先回收旧 URL，避免旧图串到新图或造成内存泄漏。
   */
  const doPreview = async (meta: AttachmentMeta) => {
    if (meta.kind !== 'image') return;
    try {
      const blob = await getAttachmentBlob(meta.id);
      if (!blob) throw new I18nError('files.errors.attachmentMissing');
      // 切换预览目标前先释放上一张图的 Object URL，避免串图与泄漏。
      revokePreviewUrl();
      const url = URL.createObjectURL(blob);
      previewRevokeRef.current = url;
      setPreviewUrl(url);
      setPreviewOpen(true);
    } catch (e: unknown) {
      toast.error(formatI18nText(t, toI18nTextFromError(e)));
    }
  };

  /**
   * 下载单个附件。
   *
   * 说明：
   * - 实际内容通过附件 ID 再次读取，保证拿到的是最新 Blob；
   * - 缺失内容统一按附件丢失错误处理。
   */
  const doDownload = async (meta: AttachmentMeta) => {
    try {
      const blob = await getAttachmentBlob(meta.id);
      if (!blob) throw new I18nError('files.errors.attachmentMissing');
      await downloadBlob(blob, meta.name || `attachment-${meta.id}`);
    } catch (e: unknown) {
      toast.error(formatI18nText(t, toI18nTextFromError(e)));
    }
  };

  /** 下载单个本地备份 ZIP。 */
  const doDownloadBackup = async (meta: LocalBackupMeta) => {
    try {
      const blob = await getLocalBackupBlob(meta.id);
      if (!blob) throw new I18nError('files.errors.backupMissing');
      await downloadBlob(blob, meta.fileName);
    } catch (e: unknown) {
      toast.error(formatI18nText(t, toI18nTextFromError(e)));
    }
  };

  /**
   * 用指定本地备份恢复扩展数据。
   *
   * 说明：
   * - 导入成功后会广播 store reload，通知其它页面重新读取最新状态；
   * - 这里不主动关闭弹窗，便于用户恢复后继续检查备份列表。
   */
  const doRestoreBackup = async (meta: LocalBackupMeta) => {
    setLoadingBackups(true);
    try {
      const blob = await getLocalBackupBlob(meta.id);
      if (!blob) throw new I18nError('files.errors.backupMissing');
      await importBackupFromZip(blob);
      broadcastStoreReload();
      toast.success(t('files.toast.restored'));
    } catch (e: unknown) {
      toast.error(formatI18nText(t, toI18nTextFromError(e)));
    } finally {
      setLoadingBackups(false);
    }
  };

  /** 删除单条本地备份记录及其 ZIP 内容。 */
  const doDeleteBackup = async (meta: LocalBackupMeta) => {
    setLoadingBackups(true);
    try {
      await deleteManagedLocalBackup(meta, { permissionMode: 'request' });
      await loadBackups();
      toast.success(t('files.toast.backupDeleted'));
    } catch (e: unknown) {
      toast.error(formatI18nText(t, toI18nTextFromError(e)));
    } finally {
      setLoadingBackups(false);
    }
  };

  /** 当前筛选结果是否已全部选中。 */
  const allChecked = selectedIds.length > 0 && selectedIds.length === filteredAttachments.length;
  /** 当前是否处于“部分选中”状态，用于 Checkbox 的半选展示。 */
  const indeterminate = selectedIds.length > 0 && selectedIds.length < filteredAttachments.length;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="max-w-5xl w-[min(1100px,calc(100vw-1.5rem))] p-0 overflow-hidden"
        onPointerDownOutside={(event) => {
          if (!previewOpen) return;
          if (!isTargetWithinMediaPreview(event.detail.originalEvent.target)) return;
          /**
           * 关键修复：当点击目标位于图片预览层（遮罩 / 图片 / 底部工具栏）内时，
           * 阻止底层 FilesDialog 把这次交互误判成 outside click。
           *
           * 这样可以同时满足：
           * - 点击预览遮罩：只关闭预览；
           * - 点击预览工具栏：只操作预览；
           * - 文件管理弹窗保持打开。
           */
          event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (!previewOpen) return;
          // 预览打开时，Esc 应优先关闭预览层，而不是把底层文件管理弹窗一起关掉。
          event.preventDefault();
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle>{t('files.title')}</DialogTitle>
          <DialogDescription>{t('files.description')}</DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="grid grid-cols-2 w-64">
              <TabsTrigger value="attachments">{t('files.tabs.attachments')}</TabsTrigger>
              <TabsTrigger value="backups">{t('files.tabs.backups')}</TabsTrigger>
            </TabsList>

            <TabsContent value="attachments" className="mt-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('files.searchPlaceholder')}
                    className="pl-8 h-9 text-sm"
                  />
                </div>
                <Button variant={kind === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setKind('all')}>
                  {t('files.filters.all')}
                </Button>
                <Button variant={kind === 'image' ? 'default' : 'outline'} size="sm" onClick={() => setKind('image')}>
                  <ImageIcon className="h-4 w-4 mr-1" /> {t('files.filters.images')}
                </Button>
                <Button variant={kind === 'file' ? 'default' : 'outline'} size="sm" onClick={() => setKind('file')}>
                  <FileIcon className="h-4 w-4 mr-1" /> {t('files.filters.files')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void refreshAttachments()} disabled={loading}>
                  <RefreshCw className="h-4 w-4 mr-1" /> {t('common.refresh')}
                </Button>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allChecked ? true : indeterminate ? 'indeterminate' : false}
                    onCheckedChange={(v) => toggleAll(Boolean(v))}
                  />
                  <span className="text-sm text-muted-foreground">{t('files.selected', { count: selectedIds.length })}</span>
                </div>
                <Button variant="destructive" size="sm" onClick={() => void doDeleteSelected()} disabled={selectedIds.length === 0 || loading}>
                  <Trash2 className="h-4 w-4 mr-1" /> {t('files.deleteSelected')}
                </Button>
              </div>

              <div className="mt-3 border border-border rounded-xl overflow-hidden">
                <ScrollArea className="h-[56vh]">
                  <div className="divide-y divide-border">
                    {filteredAttachments.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-10 text-center">{t('files.empty')}</div>
                    ) : (
                      filteredAttachments.map((a) => (
                        <div key={a.id} className="flex items-center gap-3 p-3 hover:bg-accent/30 transition-colors">
                          <Checkbox checked={selectedIds.includes(a.id)} onCheckedChange={(v) => toggleSelected(a.id, Boolean(v))} />
                          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            {a.kind === 'image' ? <ImageIcon className="h-4 w-4" /> : <FileIcon className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{a.name}</div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {formatBytes(a.size)} · {a.mime} · {formatDate(a.createdAt)}
                            </div>
                          </div>
                          {a.kind === 'image' && (
                            <Button variant="outline" size="sm" onClick={() => void doPreview(a)}>
                              {t('files.preview')}
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => void doDownload(a)}>
                            <Download className="h-4 w-4 mr-1" /> {t('files.download')}
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent value="backups" className="mt-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <History className="h-4 w-4" />
                  {t('files.backupsHint')}
                </div>
                <Button variant="outline" size="sm" onClick={() => void refreshBackups()} disabled={loading}>
                  <RefreshCw className="h-4 w-4 mr-1" /> {t('common.refresh')}
                </Button>
              </div>

              <div className="mt-3 border border-border rounded-xl overflow-hidden">
                <ScrollArea className="h-[56vh]">
                  <div className="divide-y divide-border">
                    {backups.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-10 text-center">{t('files.backupsEmpty')}</div>
                    ) : (
                      backups.map((b) => (
                        <div key={b.id} className="flex items-center gap-3 p-3 hover:bg-accent/30 transition-colors">
                          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <RotateCcw className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{b.fileName}</div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {formatDate(b.createdAt)} · {formatBytes(b.bytes)}{b.lite ? ` · ${t('files.lite')}` : ''}
                            </div>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => void doDownloadBackup(b)}>
                            <Download className="h-4 w-4 mr-1" /> {t('files.download')}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => void doRestoreBackup(b)} disabled={loading}>
                            {t('files.restore')}
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => void doDeleteBackup(b)} disabled={loading}>
                            {t('common.delete')}
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <MediaPreviewOverlay
          open={previewOpen}
          onClose={resetPreviewState}
          ariaLabel={t('files.preview')}
        >
          {previewUrl ? <img src={previewUrl} alt="" className="max-w-[80vw] max-h-[80vh] rounded-lg" /> : null}
        </MediaPreviewOverlay>
      </DialogContent>
    </Dialog>
  );
}
