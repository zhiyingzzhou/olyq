/**
 * 说明：`MessageErrorNotice` 组件模块。
 *
 * 职责：
 * - 承载 `MessageErrorNotice` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MessageErrorNotice` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

import { toast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import { formatI18nText } from '@/lib/i18n/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TooltipAction } from '@/components/ui/tooltip-action';
import type { MessageErrorDetails } from '@/types/chat';
import type { I18nText } from '@/types/i18n';

const KNOWN_TECHNICAL_ERROR_NAMES = new Set(['I18nError', 'AI_APICallError', 'APICallError', 'AbortError']);

/**
 * 内部函数：`trimText`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function trimText(value: string | undefined): string {
  return String(value || '').trim();
}

/**
 * 内部函数：`buildDisplayStackHeader`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function buildDisplayStackHeader(errorName: string, errorMessage: string): string {
  const name = trimText(errorName);
  const message = trimText(errorMessage);
  if (!name) return message;
  if (!message || message === name) return name;
  return `${name}: ${message}`;
}

/**
 * 内部函数：`resolveDisplayErrorName`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function resolveDisplayErrorName(
  t: (key: string) => string,
  details: MessageErrorDetails | undefined,
  hasMessageI18n: boolean,
): string {
  const rawName = trimText(details?.name);
  if (!rawName) return t('common.error');

  if (!hasMessageI18n) return rawName;

  if (rawName === 'I18nError') return t('common.error');
  if (rawName === 'AI_APICallError' || rawName === 'APICallError') return t('errors.apiCallFailed');
  if (rawName === 'AbortError') return t('common.cancelled');
  return rawName;
}

/**
 * 内部函数：`sanitizeDisplayStack`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function sanitizeDisplayStack(args: {
  stack?: string;
  rawName?: string;
  rawMessage?: string;
  messageKey?: string;
  displayName: string;
  displayMessage: string;
  summary: string;
}): string {
  const stack = trimText(args.stack);
  if (!stack) return '';

  const lines = stack.split('\n');
  const firstLine = trimText(lines[0]);
  const rawName = trimText(args.rawName);
  const rawMessage = trimText(args.rawMessage);
  const messageKey = trimText(args.messageKey);
  const displayMessage = trimText(args.displayMessage);
  const summary = trimText(args.summary);

  const colonIndex = firstLine.indexOf(':');
  const headerName = colonIndex >= 0 ? trimText(firstLine.slice(0, colonIndex)) : '';
  const headerMessage = colonIndex >= 0 ? trimText(firstLine.slice(colonIndex + 1)) : '';

  const shouldReplaceHeader =
    !!headerName
    && (KNOWN_TECHNICAL_ERROR_NAMES.has(headerName) || (!!rawName && headerName === rawName))
    && (
      headerMessage === rawMessage
      || headerMessage === messageKey
      || headerMessage === displayMessage
      || headerMessage === summary
      || (headerName === 'I18nError' && messageKey.startsWith('errors.'))
    );

  if (!shouldReplaceHeader) return stack;

  lines[0] = buildDisplayStackHeader(args.displayName, displayMessage || summary);
  return lines.join('\n').trim();
}

/**
 * 按当前实现：消息内错误提示（"Failed to fetch / 详情"）。
 *
 * 设计目标：
 * - 避免出现"空白对话框/空白气泡"：当请求失败且无正文时也要给用户可见反馈
 * - 提供"详情"弹窗，便于定位 provider/baseURL/网络等问题并复制反馈
 * - 默认不提供消息级局部关闭按钮，避免把失败消息关成空白壳；只有显式传入 `dismissible + onDismiss`
 *   的局部场景（例如翻译错误条目）才允许渲染关闭按钮。
 */
export function MessageErrorNotice({
  error,
  details,
  className,
  interactive = true,
  dismissible = false,
  onDismiss,
}: {
  /** 用于直接展示给用户的错误摘要。这里才按当前 UI 语言渲染。 */
  error?: I18nText;
  /** 可选：结构化错误详情（来自 Service Worker） */
  details?: MessageErrorDetails;
  /** 外部样式补充 */
  className?: string;
  /** 预览态（grid preview）不允许交互，避免出现"可点但点不了"的错觉 */
  interactive?: boolean;
  /** 是否显示局部关闭按钮。默认关闭，避免主消息错误被关成空白壳。 */
  dismissible?: boolean;
  /** 可选：由父级控制真正移除该错误项，仅在 `dismissible=true` 时生效。 */
  onDismiss?: () => void;
}) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const summary = error ? formatI18nText(t, error).trim() : '';
  const hasError = Boolean(summary);

  useEffect(() => {
    setDialogOpen(false);
  }, [summary]);

  const rawErrorName = trimText(details?.name);
  const translatedMessage = details?.messageI18n ? formatI18nText(t, details.messageI18n) : '';
  const errorMessage = (translatedMessage || details?.message || summary).trim();
  const errorName = resolveDisplayErrorName(t, details, Boolean(details?.messageI18n));
  const errorStack = sanitizeDisplayStack({
    stack: details?.stack,
    rawName: rawErrorName,
    rawMessage: details?.message,
    messageKey: details?.messageI18n?.key,
    displayName: errorName,
    displayMessage: errorMessage,
    summary,
  });
  const errorCause = (details?.cause || '').trim();
  const canDismiss = interactive && dismissible && typeof onDismiss === 'function';

  const copyText = useMemo(() => {
    const parts: string[] = [];
    parts.push(`${t('message.errorName')}: ${errorName}`);
    parts.push(`${t('message.errorMessage')}: ${errorMessage || summary}`);
    if (errorStack) parts.push(`${t('message.errorStack')}:\n${errorStack}`);
    parts.push(`${t('message.errorCause')}: ${errorCause || '{}'}`);
    return parts.join('\n\n').trim();
  }, [errorCause, errorMessage, errorName, errorStack, summary, t]);

  if (!hasError) return null;

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2',
          className,
        )}
      >
        <div className="min-w-0 flex-1 text-sm text-foreground truncate" title={summary}>
          {summary}
        </div>

        {interactive ? (
          <>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="shrink-0 text-xs font-medium text-destructive hover:underline"
              aria-label={t('message.details')}
            >
              {t('message.details')}
            </button>
            {canDismiss ? (
              <TooltipAction tooltip={t('common.close')}>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="shrink-0 rounded-md p-1 text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
                  aria-label={t('common.close')}
                >
                  <X className="h-4 w-4" />
                </button>
              </TooltipAction>
            ) : null}
          </>
        ) : null}
      </div>

      {interactive ? (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl p-0 flex flex-col max-h-[85vh] overflow-hidden">
            <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
              <DialogTitle>{t('message.errorDetails')}</DialogTitle>
              <DialogDescription className="sr-only">{t('message.errorDetails')}</DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">{t('message.errorName')}</div>
                <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm font-mono break-all">
                  {errorName}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">{t('message.errorMessage')}</div>
                <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm font-mono break-all">
                  {errorMessage || summary}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">{t('message.errorStack')}</div>
                <pre className="max-h-64 overflow-auto rounded-md border border-destructive/30 bg-destructive/5 p-3 text-[11px] leading-relaxed text-destructive whitespace-pre-wrap break-all">
                  {errorStack || t('common.noData')}
                </pre>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">{t('message.errorCause')}</div>
                <pre className="max-h-40 overflow-auto rounded-md border border-border/60 bg-muted/20 p-3 text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap break-all">
                  {errorCause || '{}'}
                </pre>
              </div>
            </div>

            <DialogFooter className="px-6 py-4 border-t border-border/60 shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(copyText)
                    .then(
                      () => toast({ title: t('chat.copied'), description: t('message.copiedError') }),
                      () => toast({ title: t('common.error'), description: t('sidebar.clipboardFailed'), variant: 'destructive' }),
                    );
                }}
              >
                {t('chat.copy')}
              </Button>
              <Button type="button" onClick={() => setDialogOpen(false)}>
                {t('common.close')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
