/**
 * 说明：`sidebarLayoutMode` 页面模块。
 *
 * 职责：
 * - 定义主工作区侧栏响应式布局的唯一断点；
 * - 将宽度到布局模式的判定收口为纯函数，方便组件和 guard 共同验证；
 *
 * 边界：
 * - 本文件只处理宽度判定，不读取 DOM、不写持久化状态。
 */

/** 侧栏从覆盖式浮层切回常驻完整栏的工作区宽度断点。 */
export const SIDEBAR_FLOATING_BREAKPOINT_PX = 860;

/** 主工作区侧栏布局模式。 */
export type SidebarLayoutMode = 'full' | 'floating';

/**
 * 根据主工作区可用宽度决定侧栏布局模式。
 *
 * @param workspaceWidth - 根工作区当前可用宽度，单位为 CSS px。
 * @returns `full` 表示完整侧栏常驻；`floating` 表示只常驻 mini rail，完整侧栏通过覆盖式浮层打开。
 */
export function resolveSidebarLayoutMode(workspaceWidth: number): SidebarLayoutMode {
  return workspaceWidth >= SIDEBAR_FLOATING_BREAKPOINT_PX ? 'full' : 'floating';
}
