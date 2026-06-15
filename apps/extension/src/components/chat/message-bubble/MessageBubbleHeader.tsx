/**
 * 说明：`MessageBubbleHeader` 组件模块。
 *
 * 职责：
 * - 承载消息头部“标题区 + 元信息区”的稳定宽度契约；
 * - 统一 user / assistant 两侧对齐逻辑，避免 `MessageBubbleLayout` 继续堆叠细节。
 *
 * 边界：
 * - 本文件只负责头部展示与选择交互，不处理正文、操作栏和消息数据流。
 */
import { Check } from 'lucide-react';

import { TooltipAction } from '@/components/ui/tooltip-action';
import { cn } from '@/lib/utils';

interface MessageBubbleHeaderProps {
  readonly canToggleSelection: boolean;
  readonly displayModel: string;
  readonly isSelected: boolean;
  readonly isUser: boolean;
  readonly messageId: string;
  readonly onToggleSelect?: () => void;
  readonly t: (key: string) => string;
  readonly timeText: string;
}

/**
 * 导出组件：`MessageBubbleHeader`。
 *
 * @remarks
 * 让标题文本与时间/勾选框共享同一条 message lane 宽度约束，避免容器变窄时互相挤压。
 */
export function MessageBubbleHeader({
  canToggleSelection,
  displayModel,
  isSelected,
  isUser,
  messageId,
  onToggleSelect,
  t,
  timeText,
}: MessageBubbleHeaderProps) {
  const headerText = (
    <div
      data-testid={`message-header-text-${messageId}`}
      className={cn('min-w-0 flex-1', isUser ? 'text-right' : 'text-left')}
    >
      <span className="block truncate text-sm font-medium text-foreground/80">
        {isUser ? t('chat.roleYou') : displayModel}
      </span>
    </div>
  );
  const headerMeta = (timeText || canToggleSelection) ? (
    <div data-testid={`message-header-meta-${messageId}`} className="flex shrink-0 items-center gap-2">
      {timeText ? (
        <span
          data-testid={`message-header-time-${messageId}`}
          className="shrink-0 font-mono text-[10px] text-muted-foreground/70"
        >
          {timeText}
        </span>
      ) : null}
      {canToggleSelection ? (
        <TooltipAction tooltip={t('message.multiSelect')}>
          <button
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            data-multi-select-ignore="true"
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelect?.();
            }}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
              isSelected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted-foreground/30 bg-background/40 hover:bg-accent/50'
            }`}
          >
            {isSelected ? <Check className="h-3 w-3" /> : null}
          </button>
        </TooltipAction>
      ) : null}
    </div>
  ) : null;

  return (
    <div
      data-testid={`message-header-${messageId}`}
      className={cn('mb-1.5 flex w-full min-w-0 items-center gap-2', isUser ? 'justify-end' : 'justify-start')}
    >
      {isUser ? (
        <>
          {headerMeta}
          {headerText}
        </>
      ) : (
        <>
          {headerText}
          {headerMeta}
        </>
      )}
    </div>
  );
}
