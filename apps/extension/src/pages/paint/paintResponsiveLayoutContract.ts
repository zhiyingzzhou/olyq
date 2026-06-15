/**
 * 说明：Paint 响应式布局契约模块。
 *
 * 职责：
 * - 提供 Paint 工作台 expanded / compact 的阈值和判定函数；
 * - 让页面和 guard 共用同一个布局真源；
 * - 避免组件文件混合导出非组件值影响 React Fast Refresh。
 *
 * 边界：
 * - 本文件不渲染 UI、不持有状态，也不访问 Paint 业务数据。
 */

/** Paint 工作台切到抽屉式 compact 布局的容器宽度阈值。 */
export const PAINT_COMPACT_LAYOUT_MAX_WIDTH = 960;

/** Paint 工作台当前布局模式。 */
export type PaintLayoutMode = 'compact' | 'expanded';

/** Paint compact 布局里可打开的支持面板。 */
export type PaintCompactDrawer = 'settings' | 'history';

/**
 * 读取当前容器宽度对应的 Paint 布局模式。
 *
 * @param width - Paint 工作区当前可用宽度。
 * @returns 小于 960px 时返回 compact，否则返回 expanded。
 */
export function resolvePaintLayoutMode(width: number): PaintLayoutMode {
  return width < PAINT_COMPACT_LAYOUT_MAX_WIDTH ? 'compact' : 'expanded';
}

/**
 * 浏览器首帧布局模式种子，真实模式仍由工作区容器 ResizeObserver 接管。
 *
 * @returns SSR / 测试无 window 时默认 expanded，浏览器中按首帧窗口宽度估算。
 */
export function getInitialPaintLayoutMode(): PaintLayoutMode {
  if (typeof window === 'undefined') return 'expanded';
  return resolvePaintLayoutMode(window.innerWidth);
}
