/**
 * 说明：`SelectionPanelShared` 组件模块。
 *
 * 职责：
 * - 承载 `SelectionPanelShared` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SelectionPanelHint`、`SelectionPanelHintBarProps`、`SelectionPanelHintBar` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { MouseEventHandler, ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * 选择面板底部快捷键提示项。
 */
export type SelectionPanelHint = {
  /**
   * 提示项唯一标识，用作渲染 key。
   */
  id: string;
  /**
   * 快捷键标签，可为文本或图标组合。
   */
  keyLabel: ReactNode;
  /**
   * 快捷键对应的含义说明。
   */
  text: ReactNode;
  /**
   * 当前提示是否处于激活态，例如“可返回上一级”。
   */
  active?: boolean;
};

/**
 * 选择面板底部提示条属性。
 */
export interface SelectionPanelHintBarProps {
  /**
   * 左侧附加标签，通常用于展示当前上下文或搜索词。
   */
  label?: ReactNode;
  /**
   * 需要展示的快捷键提示项列表。
   */
  hints: SelectionPanelHint[];
  /**
   * 额外样式类名。
   */
  className?: string;
  /**
   * 视觉变体。
   */
  variant?: 'default' | 'input-replica';
}

/**
 * 选择面板底部快捷键提示条。
 *
 * @param props - 左侧标签、提示列表与样式扩展。
 * @returns 面向键盘操作的提示区域。
 */
export function SelectionPanelHintBar({
  label,
  hints,
  className,
  variant = 'default',
}: SelectionPanelHintBarProps) {
  return (
    <div
      className={cn(
        variant === 'input-replica'
          ? 'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border px-4 py-2 text-xs text-muted-foreground'
          : 'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border/60 bg-muted/[0.18] px-3.5 py-2.5 text-[11px] text-muted-foreground',
        className,
      )}
    >
      <div className="min-w-0 truncate text-muted-foreground/90">{label}</div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {hints.map((hint) => (
          <div key={hint.id} className="flex items-center gap-1 whitespace-nowrap">
            <span
              className={cn(
                variant === 'input-replica'
                  ? 'inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none'
                  : 'inline-flex items-center rounded-md border border-border/60 bg-background/80 px-1.5 py-0.5 font-mono text-[10px] leading-none',
                hint.active ? 'border-primary/30 text-primary' : 'text-foreground/70',
              )}
            >
              {hint.keyLabel}
            </span>
            <span>{hint.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 选择面板列表项属性。
 */
export interface SelectionPanelRowProps {
  /**
   * 主标题内容。
   */
  title: ReactNode;
  /**
   * 次级描述文案。
   */
  description?: ReactNode;
  /**
   * 左侧图标区域内容。
   */
  icon?: ReactNode;
  /**
   * 右侧附加内容，如后缀徽标。
   */
  right?: ReactNode;
  /**
   * 当前是否为键盘导航的高亮项。
   */
  active?: boolean;
  /**
   * 当前是否处于已选中状态。
   */
  selected?: boolean;
  /**
   * 当前行是否表示可进入的子菜单。
   */
  menu?: boolean;
  /**
   * 是否禁用点击。
   */
  disabled?: boolean;
  /**
   * 点击列表项时触发的回调。
   */
  onClick?: () => void;
  /**
   * 鼠标移入时触发的回调，通常用于同步高亮索引。
   */
  onMouseEnter?: () => void;
  /**
   * 鼠标按下时触发的回调，用于阻止焦点丢失等交互。
   */
  onMouseDown?: MouseEventHandler<HTMLButtonElement>;
  /**
   * 外层按钮附加类名。
   */
  className?: string;
  /**
   * 标题文本附加类名。
   */
  titleClassName?: string;
  /**
   * 视觉变体。
   */
  variant?: 'default' | 'input-replica';
}

/**
 * 选择面板中的通用列表行。
 *
 * @param props - 标题、描述、选中态与交互回调。
 * @returns 支持菜单箭头、选中标记与禁用态的按钮行。
 */
export function SelectionPanelRow({
  title,
  description,
  icon,
  right,
  active,
  selected,
  menu,
  disabled,
  onClick,
  onMouseEnter,
  onMouseDown,
  className,
  titleClassName,
  variant = 'default',
}: SelectionPanelRowProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseDown={onMouseDown}
      className={cn(
        variant === 'input-replica'
          ? 'group w-full px-4 py-2.5 text-left transition-colors disabled:pointer-events-none disabled:opacity-45'
          : 'group w-full rounded-2xl border px-3.5 py-3 text-left transition-[border-color,background-color,box-shadow,color] disabled:pointer-events-none disabled:opacity-45',
        variant === 'input-replica'
          ? active || selected
            ? 'bg-muted/50 text-foreground'
            : 'text-foreground hover:bg-muted/50'
          : active
            ? 'border-primary/35 bg-primary/[0.08] text-foreground shadow-sm'
            : selected
              ? 'border-primary/20 bg-primary/[0.045] text-foreground'
              : 'border-border/50 bg-background/80 hover:border-border hover:bg-accent/35',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {icon ? (
          <div
            className={cn(
              variant === 'input-replica'
                ? 'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-muted/30 text-muted-foreground'
                : 'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border transition-colors',
              variant === 'input-replica'
                ? active || selected
                  ? 'text-foreground'
                  : 'group-hover:text-foreground'
                : active || selected
                  ? 'border-primary/20 bg-primary/12 text-primary'
                  : 'border-border/60 bg-muted/35 text-muted-foreground group-hover:text-foreground',
            )}
          >
            {icon}
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <div
            className={cn(
              variant === 'input-replica' ? 'truncate text-sm text-foreground' : 'truncate text-sm font-medium leading-5',
              titleClassName,
            )}
          >
            {title}
          </div>
          {description ? (
            <div className={cn(
              variant === 'input-replica' ? 'text-xs text-muted-foreground' : 'mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground',
            )}
            >
              {description}
            </div>
          ) : null}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 text-muted-foreground">
          {right}
          {selected ? (
            variant === 'input-replica'
              ? <Check className="h-4 w-4 text-foreground" />
              : (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/12 text-primary">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )
          ) : null}
          {menu ? <ChevronRight className="h-4 w-4" /> : null}
        </div>
      </div>
    </button>
  );
}

/**
 * 选择面板空状态属性。
 */
export interface SelectionPanelEmptyProps {
  /**
   * 空状态标题。
   */
  title: ReactNode;
  /**
   * 空状态说明文案。
   */
  description?: ReactNode;
  /**
   * 额外操作区，例如跳转设置按钮。
   */
  action?: ReactNode;
  /**
   * 视觉变体。
   */
  variant?: 'default' | 'input-replica';
}

/**
 * 选择面板空状态内容。
 *
 * @param props - 标题、描述与附加操作。
 * @returns 当列表为空时展示的占位视图。
 */
export function SelectionPanelEmpty({
  title,
  description,
  action,
  variant = 'default',
}: SelectionPanelEmptyProps) {
  return (
    <div
      className={cn(
        variant === 'input-replica'
          ? 'mx-4 my-2 rounded-lg border border-dashed border-border bg-background px-4 py-6 text-center'
          : 'mx-2 my-2 rounded-2xl border border-dashed border-border/60 bg-muted/[0.14] px-5 py-9 text-center',
      )}
    >
      <div className="text-sm font-medium text-foreground/85">{title}</div>
      {description ? <div className="mt-1.5 text-xs leading-5 text-muted-foreground">{description}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
