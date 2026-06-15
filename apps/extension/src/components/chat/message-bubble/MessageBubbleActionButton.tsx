/**
 * 说明：`MessageBubbleActionButton` 组件模块。
 *
 * 职责：
 * - 承载 `MessageBubbleActionButton` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MessageBubbleActionButton` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ReactNode } from 'react';

import { TooltipAction } from '@/components/ui/tooltip-action';

/**
 * 导出组件：`MessageBubbleActionButton`。
 *
 * @remarks
 * 负责承载当前文件对应的界面渲染、交互编排和视图层边界。
 */
export function MessageBubbleActionButton({
  children,
  danger,
  disabled = false,
  onClick,
  tooltip,
}: {
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  tooltip?: string;
}) {
  const button = (
    <button
      type="button"
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      aria-label={tooltip}
      className={`rounded-lg p-1.5 transition-all duration-200 ${
        disabled
          ? 'cursor-not-allowed opacity-45 text-muted-foreground'
          : danger
            ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
  if (!tooltip) return button;
  return <TooltipAction tooltip={tooltip}>{button}</TooltipAction>;
}
