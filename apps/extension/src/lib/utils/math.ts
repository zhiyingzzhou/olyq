/**
 * 说明：`math` 基础能力模块。
 *
 * 职责：
 * - 承载 `math` 相关的当前文件实现与模块边界；
 * - 对外暴露 `clamp` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 将数值收敛到区间 [min, max]。
 * - 当 `n` 为 NaN/非有限数时，返回 `min`（兜底为下界）。
 */
export function clamp(n: number, min: number, max: number): number {
  const v = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, v));
}
