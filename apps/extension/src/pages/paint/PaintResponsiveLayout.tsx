/**
 * 说明：`PaintResponsiveLayout` 页面布局模块。
 *
 * 职责：
 * - 定义 Paint 工作台 expanded / compact 的响应式布局判定；
 * - 承载 compact 模式下的左右抽屉外壳；
 * - 复用扩展现有 Dialog overlay、焦点清理和紧凑表面样式。
 *
 * 边界：
 * - 本文件只处理布局承载，不持有生成、上传、历史、模型或参数业务状态；
 * - expanded 三栏尺寸保存仍由 Paint 页面里的 `ResizablePanelGroup` 负责。
 */
import { useCallback, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { preventRadixCloseAutoFocus, useAutoBlurActiveElementOnMount } from '@/components/ui/radix-auto-blur';
import { cn } from '@/lib/utils';

/** Paint compact 抽屉属性。 */
interface PaintResponsiveDrawerProps {
  /** 抽屉是否打开。 */
  readonly open: boolean;
  /** 抽屉贴靠方向。 */
  readonly side: 'left' | 'right';
  /** 抽屉标题。 */
  readonly title: string;
  /** 抽屉副标题。 */
  readonly description: string;
  /** 抽屉内容。 */
  readonly children: ReactNode;
  /** Radix 打开状态回调。 */
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * Paint compact 布局使用的左右抽屉。
 *
 * 只复用现有 Radix Dialog 层级、焦点清理和 Olyq 紧凑表面样式；
 * 抽屉本身不持有业务状态，关闭后内容由外层 Paint 页面继续作为唯一 owner。
 */
export function PaintResponsiveDrawer({
  open,
  side,
  title,
  description,
  children,
  onOpenChange,
}: PaintResponsiveDrawerProps) {
  const contentRef = useAutoBlurActiveElementOnMount<HTMLDivElement>(null);

  const handleCloseAutoFocus = useCallback((event: Event) => {
    preventRadixCloseAutoFocus(event);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/20">
          <DialogPrimitive.Content
            ref={contentRef}
            data-olyq-overlay-part="content"
            data-testid={side === 'left' ? 'paint-settings-drawer' : 'paint-history-drawer'}
            onCloseAutoFocus={handleCloseAutoFocus}
            className={cn(
              'fixed inset-y-0 z-10 flex h-full w-[min(22rem,calc(100vw-2rem))] min-w-0 flex-col border-border/60 bg-background shadow-lg duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              side === 'left'
                ? 'left-0 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left'
                : 'right-0 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
            )}
          >
            <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-3">
              <div className="min-w-0">
                <DialogPrimitive.Title className="truncate text-sm font-semibold text-foreground">
                  {title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="truncate text-[11px] text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label={title}
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogPrimitive.Close>
            </div>
            <div className="min-h-0 flex-1">
              {children}
            </div>
          </DialogPrimitive.Content>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
