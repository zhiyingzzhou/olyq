/**
 * 说明：`assistant-preset-order` 内置助手排序模块。
 *
 * 职责：
 * - 承载浏览器场景内置预设的稳定排序真源；
 * - 让轻量选择弹窗与助手商店复用同一套顺序，不再各自维护；
 * - 避免“展示看起来一样，但顺序和分组体感不一致”的回归。
 *
 * 边界：
 * - 本模块只处理内置预设顺序；
 * - 不承担网格布局、卡片渲染或虚拟列表测量。
 */

/** 浏览器场景内置预设的稳定展示顺序。 */
export const BROWSER_CORE_PRESET_ORDER = [
  'browser-briefing',
  'browser-research',
  'browser-extractor',
  'browser-operator',
] as const;

/**
 * 按浏览器场景的稳定产品顺序返回新数组。
 *
 * @param items - 任意带 `id` 的浏览器场景条目。
 * @returns 按稳定顺序排好的新数组；未知 id 会保留原相对顺序并排在后面。
 */
export function sortBrowserPresetItems<T extends { id: string }>(items: ReadonlyArray<T>): T[] {
  const orderMap = new Map<string, number>(BROWSER_CORE_PRESET_ORDER.map((presetId, index) => [presetId, index]));

  return [...items].sort((left, right) => (
    (orderMap.get(left.id) ?? Number.MAX_SAFE_INTEGER)
    - (orderMap.get(right.id) ?? Number.MAX_SAFE_INTEGER)
  ));
}
