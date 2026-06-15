/**
 * 说明：`useModelManagerPanelView` 组件模块。
 *
 * 职责：
 * - 承载 `useModelManagerPanelView` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useModelManagerPanelView` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { ModelManagerPanelView } from "./panel/ModelManagerPanelView";
import { useModelManagerPanelController } from "./panel/useModelManagerPanelController";

/**
 * 导出 Hook：`useModelManagerPanelView`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useModelManagerPanelView() {
  const controller = useModelManagerPanelController();
  return <ModelManagerPanelView controller={controller} />;
}
