/**
 * 说明：`useConfirmDialog` Hook 模块。
 *
 * 职责：
 * - 承载 `useConfirmDialog` 相关的当前文件实现与模块边界；
 * - 对外暴露 `UseConfirmDialogResult`、`useConfirmDialog` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { AlertTriangle } from 'lucide-react';
import { useState, useCallback, useRef, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

/** 命令式确认弹窗的入参。 */
interface ConfirmOptions {
  /** 弹窗标题 */
  title: string;
  /** 可选：正文说明（可换行） */
  description?: string;
  /** 可选：确认按钮文案，默认读取 `common.confirm`。 */
  confirmLabel?: string;
  /** 可选：取消按钮文案，默认读取 `common.cancel`。 */
  cancelLabel?: string;
  /** 可选：确认按钮风格（默认：default；危险操作用 destructive） */
  variant?: 'default' | 'destructive';
}

/** 当前等待用户响应的确认请求。 */
interface PendingConfirm {
  /** 本次 confirm 的配置 */
  options: ConfirmOptions;
  /** resolve(true/false) 用于返回用户选择 */
  resolve: (ok: boolean) => void;
}

/** 确认弹窗 Portal 组件。 */
type ConfirmDialogPortalComponent = () => ReactElement | null;

/** `useConfirmDialog` 的返回结构。 */
export interface UseConfirmDialogResult {
  /** 发起一次确认请求，并在用户选择后返回布尔结果。 */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** 负责实际渲染弹窗的 Portal 组件。 */
  ConfirmDialogPortal: ConfirmDialogPortalComponent;
}

/**
 * 说明：本 Hook 提供命令式 confirm 弹窗能力。
 *
 * 用法示例（命令式 API）：
 * - 取出方法与 Portal：`const { confirm, ConfirmDialogPortal } = useConfirmDialog();`
 * - 在事件处理函数中调用：`const ok = await confirm({ title: '确认删除？', description: '此操作不可撤销。' });`
 * - 若 ok 为 false 则中止当前逻辑：if (!ok) return;
 * - 在组件 return 末尾渲染：`<ConfirmDialogPortal />`
 */
export function useConfirmDialog(): UseConfirmDialogResult {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  /**
   * 打开确认弹窗，并挂起当前调用方。
   *
   * 说明：
   * - 每次调用都会覆盖当前待确认项，因此约定同一时刻只弹一个确认框；
   * - Promise 只会在用户确认、取消或直接关闭弹窗时 resolve。
   */
  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setPending({ options, resolve });
    });
  }, []);

  /**
   * 收口当前确认请求。
   *
   * 说明：
   * - 先关闭弹窗，再 resolve Promise，避免调用方继续执行时 UI 仍残留旧弹窗；
   * - 无论点击按钮还是通过 Dialog 外层关闭，都会走同一出口。
   */
  const handleClose = useCallback((ok: boolean) => {
    setPending(null);
    resolveRef.current?.(ok);
    resolveRef.current = null;
  }, []);

  /**
   * 实际渲染命令式确认弹窗的 Portal 组件。
   *
   * 说明：
   * - 组件本身无状态，只读取 hook 内部保存的 `pending`；
   * - 未有待确认项时返回 `null`，调用方可始终挂载在页面末尾。
   */
  const ConfirmDialogPortal = useCallback<ConfirmDialogPortalComponent>(() => {
    if (!pending) return null;
    const { options } = pending;
    const destructive = options.variant === 'destructive';
    return (
      <AlertDialog open onOpenChange={(v) => { if (!v) handleClose(false); }}>
        <AlertDialogContent
          onOpenAutoFocus={(event) => {
            if (!destructive) return;
            event.preventDefault();
            requestAnimationFrame(() => {
              cancelButtonRef.current?.focus();
            });
          }}
          className="w-[min(400px,calc(100vw-1.5rem))] max-w-none gap-0 overflow-hidden rounded-lg border-border bg-background p-0 shadow-lg"
        >
          <div className="px-5 pb-5 pt-5">
            <div className="flex items-start gap-3.5">
              <div
                aria-hidden="true"
                data-testid="confirm-dialog-warning-icon"
                className={cn(
                  'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border',
                  destructive
                    ? 'border-destructive/20 bg-destructive/10 text-destructive'
                    : 'border-primary/20 bg-primary/10 text-primary',
                )}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>
              <AlertDialogHeader className="min-w-0 flex-1 space-y-2 text-left">
                <AlertDialogTitle className="text-lg font-semibold leading-6 text-foreground">
                  {options.title}
                </AlertDialogTitle>
                <AlertDialogDescription className={cn(
                  options.description ? 'text-sm leading-6 text-muted-foreground' : 'sr-only',
                )}>
                  {options.description ?? options.title}
                </AlertDialogDescription>
              </AlertDialogHeader>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border/60 bg-muted/20 px-5 py-3.5">
            <AlertDialogCancel ref={cancelButtonRef} className="mt-0 h-9 min-w-20 px-4" onClick={() => handleClose(false)}>
              {options.cancelLabel ?? t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                'h-9 min-w-20 px-4',
                destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : null,
              )}
              onClick={() => handleClose(true)}
            >
              {options.confirmLabel ?? t('common.confirm')}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    );
  }, [pending, handleClose, t]);

  return { confirm, ConfirmDialogPortal };
}
