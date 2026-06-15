/**
 * 说明：`help-tip` 组件模块。
 *
 * 职责：
 * - 提供浏览器扩展内统一的帮助提示 icon 原语；
 * - 收口帮助图标的 tooltip 交互与样式，避免裸 `HelpCircle + title` 混搭；
 * - 复用共享 tooltip 基础设施，保证 modal 内层级与交互行为一致。
 *
 * 边界：
 * - 这里只处理帮助 icon 的 trigger 与 tooltip 内容，不负责表单布局或说明文案来源；
 * - 空内容时只渲染静态 icon，不补任何原生 `title` 兜底。
 */
import { HelpCircle } from 'lucide-react';

import { TooltipAction } from '@/components/ui/tooltip-action';

/** 帮助提示 icon 入参。 */
export interface HelpTipProps {
  /** tooltip 文案。 */
  readonly content: string;
  /** 图标类名。 */
  readonly iconClassName?: string;
  /** tooltip 弹出方向。 */
  readonly side?: 'top' | 'right' | 'bottom' | 'left';
  /** tooltip 对齐方式。 */
  readonly align?: 'start' | 'center' | 'end';
  /** tooltip 与触发器的偏移距离。 */
  readonly sideOffset?: number;
  /** tooltip 内容附加样式。 */
  readonly contentClassName?: string;
}

/**
 * 共享帮助提示 icon。
 *
 * 说明：
 * - content 为空时只渲染只读 icon，避免制造空 tooltip；
 * - content 存在时统一走 `TooltipAction`，防止业务层继续手写裸 tooltip 结构。
 */
export function HelpTip({
  content,
  iconClassName,
  side = 'right',
  align = 'start',
  sideOffset = 6,
  contentClassName,
}: HelpTipProps) {
  const text = String(content || '').trim();

  if (!text) {
    return <HelpCircle aria-hidden className={iconClassName || 'h-3 w-3 text-muted-foreground'} />;
  }

 return (
    <TooltipAction
      tooltip={text}
      ariaLabel={text}
      side={side}
      align={align}
      sideOffset={sideOffset}
      contentClassName={contentClassName || 'max-w-xs'}
    >
      <button
        type="button"
        className="inline-flex items-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <HelpCircle className={iconClassName || 'h-3 w-3 text-muted-foreground'} />
      </button>
    </TooltipAction>
  );
}
