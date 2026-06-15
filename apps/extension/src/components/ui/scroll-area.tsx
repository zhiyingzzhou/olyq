/**
 * 说明：`scroll-area` 组件模块。
 *
 * 职责：
 * - 承载 `scroll-area` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import * as React from "react";
import { useNonPassiveWheel } from "@/hooks/useNonPassiveWheel";
import { cn } from "@/lib/utils";

type ScrollbarOrientation = "vertical" | "horizontal" | "both";
type ScrollbarVisibility = "hover" | "always";
type ScrollWheelBehavior = "native" | "horizontal";

type ScrollAxis = "x" | "y";

type ScrollAreaProps = React.HTMLAttributes<HTMLDivElement> & {
  /** 视口层自定义类名。 */
  viewportClassName?: string;
  /** 需要渲染的滚动条方向。 */
  scrollbars?: ScrollbarOrientation;
  /** 滚动条显隐策略。 */
  scrollbarVisibility?: ScrollbarVisibility;
  /** 鼠标滚轮策略，仅横向条带需要把滚轮转换成横向位移时启用。 */
  wheelBehavior?: ScrollWheelBehavior;
};

/**
 * 内部组件：`ScrollArea`。
 *
 * @remarks
 * 使用原生滚动容器承载交互，并统一吃全局 scrollbar token；
 * 这样可以保持与扩展内其他原生滚动区一致的细滚动条外观，不再额外绘制一套自定义滚动条。
 */
const ScrollArea = React.forwardRef<
  HTMLDivElement,
  ScrollAreaProps
>(({ className, children, scrollbars = "vertical", scrollbarVisibility = "hover", wheelBehavior = "native", viewportClassName, ...props }, ref) => {
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const pendingScrollLeftRef = React.useRef<number | null>(null);

  const cancelScheduledFrame = React.useCallback(() => {
    if (frameRef.current == null) return;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frameRef.current);
    else window.clearTimeout(frameRef.current);
    frameRef.current = null;
  }, []);

  const flushPendingScrollLeft = React.useCallback(() => {
    frameRef.current = null;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const nextLeft = pendingScrollLeftRef.current;
    pendingScrollLeftRef.current = null;
    if (typeof nextLeft !== "number") return;
    viewport.scrollLeft = nextLeft;
  }, []);

  React.useEffect(() => () => cancelScheduledFrame(), [cancelScheduledFrame]);

  const handleViewportWheel = React.useCallback((event: WheelEvent) => {
    if (event.defaultPrevented || wheelBehavior !== "horizontal" || event.ctrlKey) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    const deltaX = Number.isFinite(event.deltaX) ? event.deltaX : 0;
    const deltaY = Number.isFinite(event.deltaY) ? event.deltaY : 0;
    const usesHorizontalGesture = deltaX !== 0 && Math.abs(deltaX) >= Math.abs(deltaY);
    const delta = usesHorizontalGesture ? deltaX : deltaY;
    if (!delta) return;

    if (!usesHorizontalGesture && hasNestedScrollableAncestor(viewport, event.target, "y")) return;
    if (usesHorizontalGesture && canNestedScrollableAncestorConsumeDelta(viewport, event.target, "x", delta)) return;

    const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;
    if (maxScrollLeft <= 0) return;

    const baseLeft = pendingScrollLeftRef.current ?? viewport.scrollLeft;
    const nextLeft = clampScrollPosition(baseLeft + delta, 0, maxScrollLeft);
    if (nextLeft === baseLeft) return;

    pendingScrollLeftRef.current = nextLeft;
    if (frameRef.current == null) {
      if (typeof requestAnimationFrame === "function") frameRef.current = requestAnimationFrame(flushPendingScrollLeft);
      else frameRef.current = window.setTimeout(flushPendingScrollLeft, 16);
    }
    event.preventDefault();
  }, [flushPendingScrollLeft, wheelBehavior]);

  useNonPassiveWheel({
    targetRef: viewportRef,
    enabled: wheelBehavior === "horizontal",
    onWheel: handleViewportWheel,
  });

  const viewportOverflowClassName =
    scrollbars === "both"
      ? "overflow-auto"
      : scrollbars === "horizontal"
        ? "overflow-x-auto overflow-y-hidden"
        : "overflow-y-auto overflow-x-hidden";

  return (
    <div
      ref={ref}
      data-slot="scroll-area"
      data-scrollbars={scrollbars}
      data-scrollbar-visibility={scrollbarVisibility}
      data-wheel-behavior={wheelBehavior}
      className={cn("olyq-scroll-area relative min-h-0 min-w-0", className)}
      {...props}
    >
      <div
        ref={viewportRef}
        data-slot="scroll-area-viewport"
        className={cn("h-full w-full min-h-0 min-w-0 rounded-[inherit] [scrollbar-gutter:stable]", viewportOverflowClassName, viewportClassName)}
      >
        {children}
      </div>
    </div>
  );
});
ScrollArea.displayName = "ScrollArea";

export { ScrollArea };

/**
 * 内部函数：`clampScrollPosition`。
 *
 * @remarks
 * 把滚动目标位移限制在合法区间内，避免连续 wheel 合并写入时越界。
 */
function clampScrollPosition(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/**
 * 内部函数：`hasNestedScrollableAncestor`。
 *
 * @remarks
 * 检查当前 wheel 事件目标是否位于外层 viewport 之内、且在中间经过了某个可滚动祖先；
 * 横向条带转换 `deltaY -> scrollLeft` 时，需要优先让内部纵向滚动容器消费事件，避免抢滚轮。
 */
function hasNestedScrollableAncestor(viewport: HTMLElement, target: EventTarget | null, axis: ScrollAxis) {
  let current = resolveTargetElement(target);
  while (current && current !== viewport) {
    if (isScrollableContainer(current, axis)) return true;
    current = current.parentElement;
  }
  return false;
}

/**
 * 内部函数：`canNestedScrollableAncestorConsumeDelta`。
 *
 * @remarks
 * trackpad 的 `deltaX` 手势可能同时落在外层横向条带和内层横向滚动区上；
 * 这里按实际滚动方向判断内层是否还能继续消费位移，能消费就不让外层接管。
 */
function canNestedScrollableAncestorConsumeDelta(
  viewport: HTMLElement,
  target: EventTarget | null,
  axis: ScrollAxis,
  delta: number,
) {
  let current = resolveTargetElement(target);
  while (current && current !== viewport) {
    if (canElementScrollInDirection(current, axis, delta)) return true;
    current = current.parentElement;
  }
  return false;
}

/**
 * 内部函数：`resolveTargetElement`。
 *
 * @remarks
 * wheel 事件目标可能是文本节点等非元素节点；
 * 这里统一回收成最近的 HTMLElement，便于后续做祖先链滚动判定。
 */
function resolveTargetElement(target: EventTarget | null) {
  if (!target) return null;
  if (target instanceof HTMLElement) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

/**
 * 内部函数：`isScrollableContainer`。
 *
 * @remarks
 * 只把真实可滚动且当前轴向存在 overflow 的元素当成滚动容器；
 * 这样可以避免把普通包装层误判成 nested scrollable，导致外层横向条带失去响应。
 */
function isScrollableContainer(element: HTMLElement, axis: ScrollAxis) {
  const style = window.getComputedStyle(element);
  const overflow = axis === "x" ? style.overflowX : style.overflowY;
  if (!["auto", "scroll", "overlay"].includes(overflow)) return false;
  if (axis === "x") return element.scrollWidth > element.clientWidth + 1;
  return element.scrollHeight > element.clientHeight + 1;
}

/**
 * 内部函数：`canElementScrollInDirection`。
 *
 * @remarks
 * 结合当前滚动位置和 delta 方向判断元素是否还能继续滚动；
 * 只有在内层已经到边界时，外层横向条带才会接手 `deltaX`。
 */
function canElementScrollInDirection(element: HTMLElement, axis: ScrollAxis, delta: number) {
  if (!isScrollableContainer(element, axis)) return false;
  if (axis === "x") {
    const maxScrollLeft = element.scrollWidth - element.clientWidth;
    if (delta < 0) return element.scrollLeft > 0;
    if (delta > 0) return element.scrollLeft < maxScrollLeft;
    return false;
  }
  const maxScrollTop = element.scrollHeight - element.clientHeight;
  if (delta < 0) return element.scrollTop > 0;
  if (delta > 0) return element.scrollTop < maxScrollTop;
  return false;
}
