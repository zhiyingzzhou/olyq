/**
 * 说明：`TraceDisclosure` 组件模块。
 *
 * 职责：
 * - 承载 assistant trace 区块统一的折叠触发器与内容容器；
 * - 收口 thinking / tool-call 在宽度、展开语义与可访问性上的共享契约；
 * - 确保 trace 区块只消费 message lane 宽度，不再反向参与定宽。
 *
 * 边界：
 * - 本文件只负责 disclosure 壳层与通用几何；
 * - 不负责具体的 reasoning / tool payload 文本拼装。
 */
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface TraceDisclosureProps {
  /** 当前是否展开。 */
  readonly open: boolean;
  /** 展开状态变更回调。 */
  readonly onOpenChange: (next: boolean) => void;
  /** 左侧图标或状态前缀。 */
  readonly leading?: ReactNode;
  /** 主标题。 */
  readonly title: ReactNode;
  /** 可选的副标题。 */
  readonly subtitle?: ReactNode;
  /** 右侧元信息。 */
  readonly trailing?: ReactNode;
  /** disclosure 正文。 */
  readonly children: ReactNode;
  /** 根容器 className。 */
  readonly className?: string;
  /** 触发器 className。 */
  readonly triggerClassName?: string;
  /** 正文容器 className。 */
  readonly contentClassName?: string;
  /** 标题文本 className。 */
  readonly titleClassName?: string;
}

/**
 * 导出组件：`TraceDisclosure`。
 *
 * @remarks
 * 统一 trace 折叠块的 trigger / content contract，避免 thinking 与 tool-call 再各自维护一套宽度语义。
 */
export function TraceDisclosure({
  open,
  onOpenChange,
  leading,
  title,
  subtitle,
  trailing,
  children,
  className,
  triggerClassName,
  contentClassName,
  titleClassName,
}: TraceDisclosureProps) {
  const contentId = useId();

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className={cn('mb-2 min-w-0 overflow-hidden rounded-xl border bg-muted/20', className)}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-controls={contentId}
            aria-expanded={open}
            className={cn(
              'flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              triggerClassName,
            )}
          >
            {leading ? (
              <span className="flex shrink-0 items-center gap-1.5">
                {leading}
              </span>
            ) : null}
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className={cn('min-w-0 flex-1 truncate font-medium', titleClassName)}>
                {title}
              </span>
              {subtitle ? (
                <span className="min-w-0 truncate text-[11px] text-muted-foreground/70">
                  {subtitle}
                </span>
              ) : null}
            </span>
            {trailing ? (
              <span className="flex shrink-0 items-center gap-2">
                {trailing}
              </span>
            ) : null}
            <span className="flex shrink-0 items-center">
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent id={contentId} className="border-t border-border/50">
          <div className={cn('min-w-0 px-3 pb-3 pt-2', contentClassName)}>
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
