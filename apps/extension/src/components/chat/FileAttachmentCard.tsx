/**
 * 说明：`FileAttachmentCard` 组件模块。
 *
 * 职责：
 * - 承载 `FileAttachmentCard` 相关的当前文件实现与模块边界；
 * - 对外暴露 `FileAttachmentCard` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { Download, FileText } from 'lucide-react';
import type { MouseEventHandler } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { TooltipAction } from '@/components/ui/tooltip-action';

/** 文件附件卡片的色调来源。 */
type FileAttachmentCardTone = 'assistant' | 'user' | 'neutral';

/** 文件附件卡片属性。 */
interface FileAttachmentCardProps {
  /** 文件展示名称。 */
  readonly name: string;
  /** 文件 MIME 类型。 */
  readonly mime: string;
  /** 文件大小，单位为字节。 */
  readonly size: number;
  /** 卡片色调，通常跟随消息气泡角色。 */
  readonly tone?: FileAttachmentCardTone;
  /** 外部附加样式。 */
  readonly className?: string;
  /** 点击卡片时的处理函数；存在时卡片会渲染为按钮。 */
  readonly onClick?: MouseEventHandler<HTMLButtonElement>;
  /** 可选标题提示；未传时自动根据名称、类型和大小拼接。 */
  readonly title?: string;
}

/**
 * 格式化文件大小。
 *
 * @param size - 原始字节数。
 * @returns 适合 UI 展示的 B/KB/MB 文案。
 */
function formatFileSize(size: number): string {
  const safeSize = Number.isFinite(size) && size > 0 ? size : 0;
  if (safeSize >= 1024 * 1024) {
    const value = safeSize / (1024 * 1024);
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, '')} MB`;
  }
  if (safeSize >= 1024) {
    const value = safeSize / 1024;
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, '')} KB`;
  }
  return `${safeSize} B`;
}

/**
 * 推导文件类型短标签。
 *
 * @param name - 文件名。
 * @param mime - MIME 类型。
 * @returns 类似 `PDF`、`JSON`、`TEXT` 的紧凑标签。
 */
function getFileKindLabel(name: string, mime: string): string {
  const ext = name.trim().split('.').pop()?.trim().toUpperCase();
  if (ext && ext.length > 0 && ext.length <= 6 && ext !== name.trim().toUpperCase()) return ext;

  const normalizedMime = mime.trim().toLowerCase();
  if (normalizedMime.includes('markdown')) return 'MD';
  if (normalizedMime.includes('json')) return 'JSON';
  if (normalizedMime.includes('csv')) return 'CSV';
  if (normalizedMime.includes('yaml')) return 'YAML';
  if (normalizedMime.includes('xml')) return 'XML';
  if (normalizedMime.startsWith('text/')) return 'TEXT';
  return 'FILE';
}

/**
 * 聊天消息中的文件附件卡片。
 *
 * 可用于只读展示，也可在传入 `onClick` 时承担下载入口。
 */
export function FileAttachmentCard({
  name,
  mime,
  size,
  tone = 'assistant',
  className,
  onClick,
  title,
}: FileAttachmentCardProps) {
  const { t } = useTranslation();
  const sizeLabel = formatFileSize(size);
  const kindLabel = getFileKindLabel(name, mime);
  /** 是否渲染成交互按钮。 */
  const isInteractive = typeof onClick === 'function';
  /** 浏览器 tooltip 与无障碍标签的兜底文案。 */
  const labelTitle = title ?? `${name} · ${mime} · ${sizeLabel}`;

  const rootClassName = cn(
    'min-w-0 overflow-hidden rounded-[20px] border text-left transition-all duration-200',
    'flex items-center gap-3 px-3 py-3',
    isInteractive && 'cursor-pointer hover:-translate-y-[1px]',
    tone === 'assistant' && [
      'bg-primary/[0.08] border-primary/15 shadow-sm',
      isInteractive && 'hover:bg-primary/[0.11] hover:border-primary/25 hover:shadow-md',
    ],
    tone === 'user' && [
      'bg-background/60 border-border/60 text-foreground shadow-sm dark:bg-background/35',
      isInteractive && 'hover:bg-primary/[0.08] hover:border-primary/20 hover:shadow-md',
    ],
    tone === 'neutral' && [
      'bg-card/80 border-border/60 shadow-sm',
      isInteractive && 'hover:bg-card hover:border-primary/20 hover:shadow-md',
    ],
    className,
  );

  const content = (
    <>
      <div
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border',
          tone === 'assistant' && 'border-primary/15 bg-primary/[0.12] text-primary',
          tone === 'user' && 'border-primary/15 bg-primary/[0.10] text-primary',
          tone === 'neutral' && 'border-border/50 bg-muted/50 text-foreground/75',
        )}
      >
        <FileText className="h-[18px] w-[18px]" />
      </div>

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'truncate text-sm font-medium leading-none',
            'text-foreground/95',
          )}
        >
          {name}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span
            className={cn(
              'inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-semibold uppercase tracking-[0.16em]',
              tone === 'assistant' && 'border-primary/15 bg-background/60 text-foreground/70',
              tone === 'user' && 'border-primary/15 bg-primary/[0.08] text-foreground/70',
              tone === 'neutral' && 'border-border/50 bg-muted/60 text-foreground/65',
            )}
          >
            {kindLabel}
          </span>
          <span
            className={cn(
              'truncate text-[11px]',
              'text-muted-foreground/85',
            )}
          >
            {sizeLabel}
          </span>
        </div>
      </div>

      {isInteractive ? (
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors',
            tone === 'assistant' && 'border-primary/15 bg-background/70 text-primary group-hover:bg-primary group-hover:text-primary-foreground',
            tone === 'user' && 'border-border/60 bg-background/80 text-muted-foreground group-hover:border-primary/20 group-hover:text-foreground',
            tone === 'neutral' && 'border-border/60 bg-background/80 text-muted-foreground group-hover:border-primary/20 group-hover:text-foreground',
          )}
          aria-hidden="true"
        >
          <Download className="h-4 w-4" />
        </div>
      ) : null}
    </>
  );

  if (isInteractive) {
    return (
      <TooltipAction tooltip={labelTitle}>
        <button
          type="button"
          onClick={onClick}
          className={cn(rootClassName, 'group')}
          aria-label={`${t('files.download')}: ${name}`}
        >
          {content}
        </button>
      </TooltipAction>
    );
  }

  return (
    <div className={rootClassName} title={labelTitle}>
      {content}
    </div>
  );
}
