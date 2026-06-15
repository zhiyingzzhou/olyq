/**
 * 说明：`badge` 组件模块。
 *
 * 职责：
 * - 承载 `badge` 相关的当前文件实现与模块边界；
 * - 对外暴露 `BadgeProps` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex max-w-full min-w-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-normal break-words transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

/** Badge 组件入参：继承 div 属性，并额外支持 `variant` 变体 */
export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

/**
 * 内部组件：`Badge`。
 *
 * @remarks
 * 用于拆分当前文件中的局部界面结构或交互片段，减少主组件体积并收拢视图职责。
 */
function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
