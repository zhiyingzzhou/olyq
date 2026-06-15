/**
 * 说明：`tooltip-action` 组件模块。
 *
 * 职责：
 * - 提供浏览器扩展内统一的 icon/action tooltip trigger 原语；
 * - 收口 hover 提示、aria-label 与 modal-safe tooltip portal 契约；
 * - 避免业务组件继续把原生 `title` 当成产品级 hover 提示真源。
 *
 * 边界：
 * - 这里只负责 React UI 内的 tooltip trigger 装配，不处理 page-facing content-script 的轻量 tooltip；
 * - 纯文本截断 reveal 仍由业务节点自行决定是否保留 `title`，不在这里接管。
 */
import * as React from 'react';

import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type TooltipActionChildProps = {
  /** 原生 tooltip 文案；组件会清掉它，避免和产品级 tooltip 双显。 */
  title?: string;
  /** 原生禁用态，禁用按钮需要包裹才能触发 tooltip。 */
  disabled?: boolean;
  /** ARIA 禁用态。 */
  'aria-disabled'?: boolean | 'true' | 'false';
  /** 无障碍名称。 */
  'aria-label'?: string;
};

/** 统一 tooltip action 原语入参。 */
export interface TooltipActionProps {
  /** hover / focus 后展示的 tooltip 文案。 */
  readonly tooltip: React.ReactNode;
  /** 触发节点；通常是 icon-only 的 button / a / Button。 */
  readonly children: React.ReactElement<TooltipActionChildProps>;
  /** 可选的无障碍名称；未传时会在 tooltip 是纯文本的情况下直接复用。 */
  readonly ariaLabel?: string;
  /** tooltip 弹出方向。 */
  readonly side?: React.ComponentPropsWithoutRef<typeof TooltipContent>['side'];
  /** tooltip 对齐方式。 */
  readonly align?: React.ComponentPropsWithoutRef<typeof TooltipContent>['align'];
  /** tooltip 与 trigger 的偏移距离。 */
  readonly sideOffset?: number;
  /** tooltip 内容附加样式。 */
  readonly contentClassName?: string;
  /** 可选覆盖默认 delayDuration。 */
  readonly delayDuration?: number;
}

/**
 * 统一的 tooltip action trigger。
 *
 * 说明：
 * - 自动移除子节点上的原生 `title`，避免再次回退成浏览器 tooltip；
 * - 若 tooltip 是纯文本，会自动回填为 `aria-label`；
 * - disabled 按钮会自动包一层非禁用 span，保证 hover 仍能触发 tooltip。
 */
export function TooltipAction({
  tooltip,
  children,
  ariaLabel,
  side = 'top',
  align,
  sideOffset = 4,
  contentClassName,
  delayDuration,
}: TooltipActionProps) {
  const onlyChild = React.Children.only(children);
  const resolvedAriaLabel = typeof tooltip === 'string' ? (ariaLabel ?? tooltip) : ariaLabel;

  const childProps = onlyChild.props;
  const childDisabled = childProps.disabled === true;
  const childAriaDisabled = childProps['aria-disabled'] === true || childProps['aria-disabled'] === 'true';
  const wrappedChild = React.cloneElement(onlyChild, {
    title: undefined,
    ...(resolvedAriaLabel && childProps['aria-label'] == null ? { 'aria-label': resolvedAriaLabel } : {}),
  });
  const triggerNode = childDisabled || childAriaDisabled
    ? <span className="inline-flex">{wrappedChild}</span>
    : wrappedChild;

  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>{triggerNode}</TooltipTrigger>
      <TooltipContent side={side} align={align} sideOffset={sideOffset} className={cn('max-w-xs', contentClassName)}>
        {typeof tooltip === 'string' ? (
          <p className="text-xs leading-relaxed whitespace-pre-wrap">{tooltip}</p>
        ) : (
          tooltip
        )}
      </TooltipContent>
    </Tooltip>
  );
}
