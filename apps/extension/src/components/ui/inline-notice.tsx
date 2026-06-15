/**
 * 说明：`InlineNotice` 组件模块。
 *
 * 职责：
 * - 为图标与提示文案并排展示提供统一布局契约；
 * - 默认按 flex 交叉轴居中，避免业务组件用 `mt-*` 局部微调图标；
 * - 为装饰性状态图标内建 `aria-hidden`，避免读屏重复播报已由文案表达的语义。
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const inlineNoticeVariants = cva(
  "flex w-full min-w-0 gap-2 text-sm",
  {
    variants: {
      tone: {
        muted: "text-muted-foreground",
        info: "text-muted-foreground",
        success: "text-muted-foreground",
        warning: "text-muted-foreground",
        destructive: "text-destructive",
      },
      align: {
        center: "items-center",
        start: "items-start",
      },
      surface: {
        subtle: "rounded-md border px-2.5 py-2",
        bare: "rounded-none border-0 bg-transparent",
        plain: "rounded-none border-0 bg-transparent p-0",
      },
    },
    compoundVariants: [
      { tone: "muted", surface: "subtle", class: "border-border/60 bg-muted/20" },
      { tone: "info", surface: "subtle", class: "border-blue-500/20 bg-blue-500/5" },
      { tone: "success", surface: "subtle", class: "border-emerald-500/20 bg-emerald-500/5" },
      { tone: "warning", surface: "subtle", class: "border-amber-500/20 bg-amber-500/5" },
      { tone: "destructive", surface: "subtle", class: "border-destructive/30 bg-destructive/5" },
    ],
    defaultVariants: {
      tone: "muted",
      align: "center",
      surface: "subtle",
    },
  },
);

const iconToneClassNames = {
  muted: "text-muted-foreground/70",
  info: "text-blue-500",
  success: "text-emerald-500",
  warning: "text-amber-500",
  destructive: "text-destructive",
} as const;

const iconSizeClassNames = {
  xs: "h-3.5 w-3.5",
  sm: "h-4 w-4",
  md: "h-5 w-5",
} as const;

/**
 * `InlineNotice` 的外部 props。
 */
export interface InlineNoticeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof inlineNoticeVariants> {
  /** 左侧状态图标；图标语义由右侧文案表达，因此组件会自动设置 `aria-hidden`。 */
  readonly icon?: LucideIcon;
  /** 图标额外样式，通常只用于沿用既有语义色强度。 */
  readonly iconClassName?: string;
  /** 图标尺寸，默认使用设置页提示行的紧凑尺寸。 */
  readonly iconSize?: keyof typeof iconSizeClassNames;
  /** 右侧正文容器额外样式。 */
  readonly bodyClassName?: string;
}

/**
 * 内联提示行。
 *
 * @remarks
 * 单行或短文案默认使用 `align="center"`；确实包含多行标题、段落或按钮时显式传入
 * `align="start"`，图标仍由固定首行高度容器承载，不再依赖 margin 微调。
 */
const InlineNotice = React.forwardRef<HTMLDivElement, InlineNoticeProps>(
  (
    {
      align = "center",
      bodyClassName,
      children,
      className,
      icon: Icon,
      iconClassName,
      iconSize = "sm",
      surface = "subtle",
      tone = "muted",
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      data-inline-notice
      data-inline-notice-align={align}
      data-inline-notice-surface={surface}
      data-inline-notice-tone={tone}
      className={cn(inlineNoticeVariants({ align, surface, tone }), className)}
      {...props}
    >
      {Icon ? (
        <span
          data-inline-notice-icon
          className={cn(
            "flex shrink-0 items-center justify-center",
            align === "start" ? "h-5" : "self-center",
          )}
        >
          <Icon
            aria-hidden="true"
            focusable="false"
            className={cn(
              "shrink-0",
              iconSizeClassNames[iconSize],
              tone ? iconToneClassNames[tone] : iconToneClassNames.muted,
              iconClassName,
            )}
          />
        </span>
      ) : null}
      <div data-inline-notice-body className={cn("min-w-0 flex-1 leading-5", bodyClassName)}>
        {children}
      </div>
    </div>
  ),
);
InlineNotice.displayName = "InlineNotice";

export { InlineNotice };
