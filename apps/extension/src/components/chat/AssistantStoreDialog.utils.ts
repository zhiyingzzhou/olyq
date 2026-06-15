/**
 * 说明：`AssistantStoreDialog.utils` 模块。
 *
 * 职责：
 * - 承载助手商店虚拟网格使用的纯函数；
 * - 让 `AssistantStoreDialog.parts` 只暴露 React 组件，避免 fast-refresh 告警；
 * - 统一收口网格布局与导入错误文案的轻量工具。
 *
 * 边界：
 * - 本模块不依赖 React；
 * - 只处理纯计算和字符串整理，不接触对话框状态。
 */

/**
 * 根据当前网格宽度解析响应式列数。
 *
 * @param width - 当前虚拟列表视口宽度。
 * @returns 当前应使用的列数。
 */
export function resolveStoreGridColumnCount(width: number) {
  if (width >= 1080) return 3;
  if (width >= 720) return 2;
  return 1;
}

/**
 * 把平铺卡片打包成虚拟列表按行渲染的 row model。
 *
 * @param items - 当前需要展示的卡片集合。
 * @param columnCount - 当前列数。
 * @returns 按行打包后的二维数组。
 */
export function packStoreGridRows<T>(items: ReadonlyArray<T>, columnCount: number): T[][] {
  const next: T[][] = [];
  for (let index = 0; index < items.length; index += columnCount) {
    next.push(items.slice(index, index + columnCount));
  }
  return next;
}

/**
 * 归一化导入失败文案。
 *
 * @param error - 任意导入错误对象。
 * @param fallback - 兜底错误文案。
 * @returns 适合直接展示的单行错误摘要。
 */
export function formatErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallback;
}
