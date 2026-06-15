/**
 * 说明：`layout` 组件模块。
 *
 * 职责：
 * - 承载 `layout` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SettingsPanelRoot`、`SettingsPanelScroller`、`SettingsPanelInset` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ComponentPropsWithoutRef, HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

/** 设置面板根容器：填满右侧 viewport，并由子层决定滚动责任。 */
export function SettingsPanelRoot({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('settings-panel-root flex h-full min-h-0 flex-col', className)} {...props} />;
}

/** 设置面板整页滚动容器：简单页统一在这里滚动。 */
export function SettingsPanelScroller({
  className,
  viewportClassName,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof ScrollArea>) {
  return (
    <ScrollArea
      scrollbars="vertical"
      scrollbarVisibility="hover"
      className={cn('min-h-0 flex-1', className)}
      viewportClassName={cn('h-full', viewportClassName)}
      {...props}
    >
      {children}
    </ScrollArea>
  );
}

/** 设置面板统一内边距。 */
export function SettingsPanelInset({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('settings-panel-inset min-w-0 px-6 py-6', className)} {...props} />;
}

/** 设置说明与控件的通用两列行：窄容器下由 CSS 容器查询统一降级为单列。 */
export function SettingsResponsiveRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'settings-responsive-row grid grid-cols-[minmax(0,1fr)_minmax(220px,320px)] items-center gap-3',
        className,
      )}
      {...props}
    />
  );
}

/** 设置行左侧说明块：保护标题和说明的最小收缩语义。 */
export function SettingsResponsiveLead({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('settings-responsive-lead min-w-0', className)} {...props} />;
}

/** 设置行右侧控件槽：宽屏右对齐，窄容器下自动占满一整行。 */
export function SettingsResponsiveControl({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('settings-responsive-control min-w-0 justify-self-end', className)}
      {...props}
    />
  );
}
