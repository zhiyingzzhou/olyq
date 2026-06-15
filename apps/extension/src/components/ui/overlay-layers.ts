/**
 * 说明：`overlay-layers` 组件模块。
 *
 * 职责：
 * - 收口浏览器扩展内共享 overlay 的层级契约；
 * - 统一浮层类组件与阻塞式模态组件的 z-index 真相，避免各自写魔法数后发生反压。
 * - 明确阻塞式 modal 必须以“整套 shell”进入同一全局层级，再在 shell 内区分遮罩和内容。
 *
 * 边界：
 * - 这里只定义共享层级常量，不承载具体 Radix / Vaul 组件实现；
 * - 局部业务组件若确实需要更高层级，必须先复用这里的语义再讨论扩展。
 */

/** 普通浮层（popover / dropdown / tooltip 等）的层级。 */
export const OVERLAY_FLOATING_LAYER_INDEX = 200;
/** 阻塞式模态整套 shell 的全局层级，必须压过所有普通浮层。 */
export const OVERLAY_MODAL_STACK_LAYER_INDEX = 400;
/** 媒体预览这类 modal 内再打开的阻塞式预览层级，必须压过普通 modal。 */
export const OVERLAY_MODAL_PREVIEW_LAYER_INDEX = 450;
/** 全局 toast 视口层级，必须压过阻塞式模态，否则 modal 内触发的反馈会被盖住。 */
export const OVERLAY_TOAST_LAYER_INDEX = 500;
/** 阻塞式模态 shell 内的遮罩相对层级。 */
export const OVERLAY_MODAL_BACKDROP_DEPTH_INDEX = 0;
/** 阻塞式模态 shell 内的内容相对层级。 */
export const OVERLAY_MODAL_CONTENT_DEPTH_INDEX = 10;

/** 普通浮层层级类名。 */
export const OVERLAY_FLOATING_LAYER_CLASS = 'z-[200]';
/** 阻塞式模态整套 shell 层级类名。 */
export const OVERLAY_MODAL_STACK_LAYER_CLASS = 'z-[400]';
/** 阻塞式媒体预览 shell 层级类名。 */
export const OVERLAY_MODAL_PREVIEW_LAYER_CLASS = 'z-[450]';
/** 全局 toast 视口层级类名。 */
export const OVERLAY_TOAST_LAYER_CLASS = 'z-[500]';
/** 阻塞式模态 shell 容器类名。 */
export const OVERLAY_MODAL_STACK_SHELL_CLASS = 'fixed inset-0 z-[400]';
/** 阻塞式媒体预览 shell 容器类名。 */
export const OVERLAY_MODAL_PREVIEW_SHELL_CLASS = 'fixed inset-0 z-[450]';
/** 阻塞式模态 shell 的 DOM selector。 */
export const OVERLAY_MODAL_STACK_SHELL_SELECTOR = '[data-olyq-overlay-shell="modal"]';
/** 阻塞式模态遮罩在 shell 内的相对层级类名。 */
export const OVERLAY_MODAL_BACKDROP_LAYER_CLASS = 'z-0';
/** 阻塞式模态内容在 shell 内的相对层级类名。 */
export const OVERLAY_MODAL_CONTENT_LAYER_CLASS = 'z-10';

/**
 * 解析浮层应挂载到哪个 portal 容器。
 *
 * 说明：
 * - 默认浮层仍直接挂在 `document.body`；
 * - 但如果触发节点位于 blocking modal 内，浮层必须回到同一 modal shell，
 *   否则 portal 到 body 后会掉回 shell 外层，重新被 modal 的遮罩/内容层级压住。
 */
export function resolveFloatingOverlayPortalContainer(anchor: HTMLElement | null): HTMLElement | null {
  const container = anchor?.closest(OVERLAY_MODAL_STACK_SHELL_SELECTOR);
  return container instanceof HTMLElement ? container : null;
}
