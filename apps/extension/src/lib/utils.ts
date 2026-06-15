/**
 * 说明：`utils` 基础能力模块。
 *
 * 职责：
 * - 承载 `utils` 相关的当前文件实现与模块边界；
 * - 对外暴露 `cn` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * `cn`：组合 className 的工具函数（clsx + tailwind-merge）。
 *
 * 用途：
 * - 统一处理条件 class（clsx）；
 * - 合并 Tailwind 冲突 class（tailwind-merge），避免样式覆盖顺序导致的 UI 异常。
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
