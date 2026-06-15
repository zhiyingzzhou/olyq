/**
 * 说明：`ModelManagerPanelView` 组件模块。
 *
 * 职责：
 * - 承载 `ModelManagerPanelView` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelManagerPanelView` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { ModelManagerProviderDetail, ModelManagerLoadOverlay } from "./ModelManagerProviderDetail";
import { ModelManagerProviderSidebar } from "./ModelManagerProviderSidebar";
import { ModelManagerPanelDialogs } from "./ModelManagerPanelDialogs";
import type { ModelManagerPanelController } from "./useModelManagerPanelController";

type Props = {
  controller: ModelManagerPanelController;
};

/**
 * 导出组件：`ModelManagerPanelView`。
 *
 * @remarks
 * 负责承载当前文件对应的界面渲染、交互编排和视图层边界。
 */
export function ModelManagerPanelView({ controller }: Props) {
  return (
    <>
      <div data-model-manager-panel-container className="relative h-full min-h-0 min-w-0 overflow-hidden">
        <div
          data-testid="model-manager-layout"
          className={`model-manager-layout flex h-full min-h-0 min-w-0 flex-row ${controller.providersState.isProviderInteractionBlocked ? "pointer-events-none select-none opacity-60" : ""}`}
        >
          <ModelManagerProviderSidebar controller={controller} />
          <ModelManagerProviderDetail controller={controller} />
        </div>
        <ModelManagerLoadOverlay controller={controller} />
      </div>
      <ModelManagerPanelDialogs controller={controller} />
      <controller.ConfirmDialogPortal />
    </>
  );
}
