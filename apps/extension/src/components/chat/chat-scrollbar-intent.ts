/**
 * 说明：主聊天原生滚动条输入识别模块。
 *
 * 职责：
 * - 用真实 DOM 几何判断一次 pointer / mouse down 是否命中滚动容器自己的纵向 scrollbar gutter；
 * - 为聊天滚动 owner 提供“拖拽原生滚动条也属于用户阅读接管”的稳定输入来源。
 *
 * 边界：
 * - 本文件只做命中判断，不写入滚动状态，也不触发 DOM 滚动；
 * - classic scrollbar 走布局 gutter；overlay scrollbar 不缩减 clientWidth 时，只认 Olyq 自己的 scrollbar 视觉 token。
 */

/** 导出类型：可用于判断 scrollbar gutter 命中的 pointer / mouse down 事件子集。 */
export interface ChatScrollbarPointerIntentEvent {
  /** 鼠标主键编号；未提供时按主键处理，兼容 React / 测试事件对象。 */
  readonly button?: number;
  /** 当前指针的视口 X 坐标。 */
  readonly clientX: number;
  /** 当前指针的视口 Y 坐标。 */
  readonly clientY: number;
  /** PointerEvent 的 primary 标记；MouseEvent 没有该字段时按 primary 处理。 */
  readonly isPrimary?: boolean;
  /** 事件原始目标。只有目标正是滚动容器自身时才允许命中原生 scrollbar。 */
  readonly target: EventTarget | null;
}

/**
 * 内部函数：读取 CSS px 长度。
 */
function readCssPixelLength(value: string) {
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * 判断一次 pointer / mouse down 是否命中元素自己的纵向 scrollbar gutter。
 *
 * @remarks
 * `scroll` 事件只能表达位置变化，无法区分 wheel、键盘、拖拽滚动条或脚本写入。
 * 主聊天需要在用户按住原生滚动条的第一拍就取消贴底跟随，因此这里用
 * `offsetWidth / clientWidth / clientLeft` 还原浏览器实际保留的 gutter 几何。
 *
 * @param element - 待判断的滚动容器。
 * @param event - pointer / mouse down 事件。
 * @returns 命中 classic gutter 或 Olyq overlay scrollbar 视觉区域时返回 true。
 */
export function isChatVerticalScrollbarGutterPointerDown(
  element: HTMLDivElement | null,
  event: ChatScrollbarPointerIntentEvent,
) {
  if (!element) return false;
  if (event.target !== element) return false;
  if (event.isPrimary === false) return false;
  if (typeof event.button === "number" && event.button !== 0) return false;
  if (element.scrollHeight <= element.clientHeight + 1) return false;

  const totalReservedWidth = Math.max(0, element.offsetWidth - element.clientWidth);

  const rect = element.getBoundingClientRect();
  if (
    event.clientY < rect.top
    || event.clientY > rect.bottom
    || event.clientX < rect.left
    || event.clientX > rect.right
  ) {
    return false;
  }

  const style = getComputedStyle(element);
  const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
  const borderRight = Number.parseFloat(style.borderRightWidth) || 0;
  const leftReservedWidth = element.clientLeft;
  const rightReservedWidth = totalReservedWidth - leftReservedWidth;
  const leftScrollbarWidth = Math.max(0, leftReservedWidth - borderLeft);
  const rightScrollbarWidth = Math.max(0, rightReservedWidth - borderRight);
  const scaleX = rect.width / Math.max(1, element.offsetWidth);
  const localX = event.clientX - rect.left;
  const leftStart = borderLeft * scaleX;
  const leftEnd = (borderLeft + leftScrollbarWidth) * scaleX;
  const rightStart = rect.width - (borderRight + rightScrollbarWidth) * scaleX;
  const rightEnd = rect.width - borderRight * scaleX;

  if (
    (leftScrollbarWidth > 0 && localX >= leftStart && localX <= leftEnd)
    || (rightScrollbarWidth > 0 && localX >= rightStart && localX <= rightEnd)
  ) {
    return true;
  }

  /**
   * Chromium / WebKit 的 overlay scrollbar 不会占据 layout gutter，因此
   * `offsetWidth - clientWidth` 可能为 0。Olyq 已经用全局 CSS token 固定了
   * scrollbar 的视觉宽度，这里只在事件目标就是滚动容器自身时，用该 token
   * 判断右侧 overlay thumb 的可点击区域，不引入额外魔法常量。
   */
  const overlayScrollbarWidth = readCssPixelLength(style.getPropertyValue("--olyq-scrollbar-size"));
  if (overlayScrollbarWidth <= 0) return false;
  const overlayRightStart = rect.width - Math.min(rect.width, overlayScrollbarWidth);
  return localX >= overlayRightStart && localX <= rect.width;
}
