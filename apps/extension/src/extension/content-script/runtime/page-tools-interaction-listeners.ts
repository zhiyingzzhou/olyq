/**
 * 说明：网页工具普通浮层的页面级交互监听生命周期。
 *
 * 职责：
 * - 管理划词菜单、隐藏菜单和内联卡片在 scroll / resize / mouse / keyboard 下的响应；
 * - 将高频位置刷新合并到单帧 RAF，降低对宿主页面的布局扰动；
 * - 返回唯一 cleanup，确保 content script 关闭网页工具时能干净移除监听器和待执行帧。
 *
 * 边界：
 * - 本模块不读取或写入 page-tools 持久化配置；
 * - 不直接操作元素选择器、截图编辑器或跨运行时通信；
 * - 只通过调用方传入的回调访问当前 UI owner 状态。
 */
import type { PageToolsInlineRefs } from '../page-tools/page-tools-root';
import { createRafScheduledTask } from './raf-scheduler';

/** 普通网页工具交互监听依赖。 */
export type PageToolsInteractionListenerOptions = {
  /** 当前 page-tools 总开关是否可用。 */
  isPageToolsEnabled: () => boolean;
  /** 当前是否已有 modal-like 页面工具接管页面。 */
  isPageModalToolMode: () => boolean;
  /** 读取当前 Shadow DOM 内普通浮层引用。 */
  readUiRefs: () => PageToolsInlineRefs | null;
  /** 当前 Selection 变化后的菜单刷新入口。 */
  onSelectionChange: () => void;
  /** 关闭划词菜单及其从属隐藏菜单。 */
  hideMenu: () => void;
  /** 关闭隐藏菜单，并在键盘路径下可恢复焦点。 */
  closeHidePanel: (options?: { restoreFocus?: boolean }) => void;
  /** RAF 合帧后的浮层重新定位入口。 */
  repositionVisibleFloatingUi: () => void;
};

/**
 * 安装普通网页工具页面级交互监听。
 *
 * @param options - 当前 runtime owner 提供的状态读取和 UI 操作回调。
 * @returns 移除全部监听器和待执行 RAF 的 cleanup。
 */
export function installPageToolsInteractionListeners(options: PageToolsInteractionListenerOptions): () => void {
  const repositionTask = createRafScheduledTask(options.repositionVisibleFloatingUi);

  /** 鼠标释放后读取浏览器最终 Selection 状态。 */
  const onMouseUp = () => {
    setTimeout(options.onSelectionChange, 0);
  };

  /** 键盘选区变化后刷新划词菜单，忽略单独修饰键。 */
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta') return;
    setTimeout(options.onSelectionChange, 0);
  };

  /** 滚动和 resize 只安排一帧定位刷新，避免同步重排放大到宿主页面。 */
  const onViewportChange = () => {
    if (!options.isPageToolsEnabled()) return;
    if (options.isPageModalToolMode()) return;
    repositionTask.request();
  };

  /** 点击普通浮层外部时关闭划词菜单，但保留已打开的结果卡片阅读态。 */
  const onMouseDown = (event: MouseEvent) => {
    if (!options.isPageToolsEnabled()) return;
    if (options.isPageModalToolMode()) return;
    const refs = options.readUiRefs();
    if (!refs) return;
    const path = event.composedPath();
    if (!path.includes(refs.menu) && !path.includes(refs.hidePanel) && !path.includes(refs.card)) {
      options.hideMenu();
    }
  };

  /** Escape 只关闭隐藏菜单并恢复焦点，不改变网页工具持久开关。 */
  const onKeyDown = (event: KeyboardEvent) => {
    if (!options.isPageToolsEnabled()) return;
    if (event.key !== 'Escape') return;
    if (options.readUiRefs()?.hidePanel.style.display === 'flex') {
      event.preventDefault();
      event.stopPropagation();
      options.closeHidePanel({ restoreFocus: true });
    }
  };

  document.addEventListener('mouseup', onMouseUp, true);
  document.addEventListener('keyup', onKeyUp, true);
  document.addEventListener('scroll', onViewportChange, true);
  document.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', onViewportChange, true);

  return () => {
    document.removeEventListener('mouseup', onMouseUp, true);
    document.removeEventListener('keyup', onKeyUp, true);
    document.removeEventListener('scroll', onViewportChange, true);
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', onViewportChange, true);
    repositionTask.cancel();
  };
}
