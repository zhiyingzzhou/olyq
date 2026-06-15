/**
 * 说明：`LaunchpadDialog` 组件模块。
 *
 * 职责：
 * - 承载 `LaunchpadDialog` 相关的当前文件实现与模块边界；
 * - 对外暴露 `LaunchpadTarget`、`LaunchpadDialogProps`、`LaunchpadDialog` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Languages, Folder, Paintbrush } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/** 启动台支持打开的目标页。 */
export type LaunchpadTarget =
  | 'store'
  | 'translate'
  | 'files'
  | 'paint';

/**
 * 启动台弹窗入参。
 *
 * 说明：
 * - 启动台只负责展示入口卡片并把用户选择回抛给外层；
 * - 真正打开哪个页面或弹窗由父层统一决定。
 */
export interface LaunchpadDialogProps {
  /** 启动台弹窗是否打开。 */
  readonly open: boolean;
  /** 关闭启动台。 */
  readonly onClose: () => void;
  /** 打开指定目标页。 */
  readonly onOpenTarget: (target: LaunchpadTarget) => void;
}

/**
 * 根据目标类型返回对应卡片渐变色。
 *
 * @param target - 启动台目标类型。
 * @returns Tailwind 渐变类名。
 */
function gradientByTarget(target: LaunchpadTarget) {
  switch (target) {
    case 'store':
      return 'from-indigo-500 to-indigo-700';
    case 'translate':
      return 'from-cyan-500 to-sky-500';
    case 'files':
      return 'from-amber-500 to-yellow-400';
    case 'paint':
      return 'from-pink-500 to-fuchsia-500';
  }
}

/**
 * 启动台弹窗。
 *
 * 用于把常用工具页统一收纳到一个入口，减少主界面按钮堆叠。
 */
export function LaunchpadDialog({ open, onClose, onOpenTarget }: LaunchpadDialogProps) {
  const { t } = useTranslation();

  /** 启动台中展示的应用卡片。 */
  const items = useMemo(() => {
    return [
      { id: 'store' as const, icon: Sparkles, label: t('launchpad.items.store') },
      { id: 'translate' as const, icon: Languages, label: t('launchpad.items.translate') },
      { id: 'files' as const, icon: Folder, label: t('launchpad.items.files') },
      { id: 'paint' as const, icon: Paintbrush, label: t('launchpad.items.paint') },
    ];
  }, [t]);

  /**
   * 打开指定目标并关闭启动台。
   *
   * @param target - 目标页。
   */
  const handleOpen = (target: LaunchpadTarget) => {
    onOpenTarget(target);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl w-[min(900px,calc(100vw-1.5rem))] p-0 overflow-hidden" data-testid="launchpad-dialog">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle>{t('launchpad.title')}</DialogTitle>
          <DialogDescription>{t('launchpad.description')}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[75vh] px-6 pb-6">
          <div className="space-y-6">
            <section className="space-y-2.5">
              <h3 className="text-xs text-muted-foreground/80 uppercase tracking-wider">{t('launchpad.sections.apps')}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {items.map((it) => {
                  const Icon = it.icon;
                  return (
                    <button
                      key={it.id}
                      onClick={() => handleOpen(it.id)}
                      className="group text-left rounded-2xl border border-border bg-card hover:bg-accent/40 transition-colors p-3"
                      data-testid={`launchpad-target-${it.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'h-11 w-11 rounded-2xl bg-gradient-to-br flex items-center justify-center text-white shadow-sm shrink-0',
                            gradientByTarget(it.id),
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{it.label}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{t(`launchpad.hints.${it.id}`)}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
