/**
 * 说明：`AssistantIcon` 组件模块。
 *
 * 职责：
 * - 承载 `AssistantIcon` 相关的当前文件实现与模块边界；
 * - 对外暴露 `AssistantIcon` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { getAssistantIconOption } from '@/lib/assistant-icons';
import { cn } from '@/lib/utils';
import type { AssistantIconId } from '@/types/assistant';

type AssistantIconProps = {
  iconId?: AssistantIconId;
  className?: string;
  iconClassName?: string;
  size?: number;
  strokeWidth?: number;
  'data-testid'?: string;
};

/**
 * 助手图标统一渲染入口。
 *
 * 渲染优先级：
 * 1. 稳定的 iconId
 * 2. 默认机器人图标
 */
export function AssistantIcon({
  iconId,
  className,
  iconClassName,
  size = 16,
  strokeWidth = 1.9,
  'data-testid': dataTestId,
}: AssistantIconProps) {
  const option = getAssistantIconOption(iconId);
  const Glyph = option.icon;

  return (
    <span
      data-testid={dataTestId}
      data-assistant-icon-source={iconId ? 'icon' : 'default'}
      data-assistant-icon-id={option.id}
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
      aria-hidden="true"
    >
      <Glyph size={size} strokeWidth={strokeWidth} className={iconClassName} />
    </span>
  );
}
