/**
 * 说明：`multi-select-click` 组件模块。
 *
 * 职责：
 * - 承载 `multi-select-click` 相关的当前文件实现与模块边界；
 * - 对外暴露 `shouldIgnoreMultiSelectContainerClick` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 判断当前点击是否来自消息内的交互控件。
 *
 * 这些元素需要保留原有交互，不能被整行/整卡多选点击拦截。
 *
 * @param target - 点击事件目标。
 * @returns `true` 表示应跳过多选切换。
 */
export function shouldIgnoreMultiSelectContainerClick(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest([
      'button',
      'a',
      'input',
      'textarea',
      'select',
      'option',
      'summary',
      'label',
      '[role="button"]',
      '[role="link"]',
      '[role="menuitem"]',
      '[role="checkbox"]',
      '[contenteditable="true"]',
      '[data-multi-select-ignore="true"]',
    ].join(',')),
  );
}
