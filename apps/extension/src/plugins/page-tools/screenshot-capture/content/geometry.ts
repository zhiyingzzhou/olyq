/**
 * 说明：`screenshot-editor-geometry` 截图编辑器几何计算模块。
 *
 * 职责：
 * - 提供选区归一化、边界限制、坐标转换、命中检测和八向缩放计算；
 * - 让事件处理和画布绘制共享同一套几何语义。
 *
 * 边界：
 * - 本模块只做纯计算，不读取 DOM、不绘制 canvas、不访问浏览器 runtime。
 */
import {
  SCREENSHOT_EDITOR_MIN_SELECTION_SIZE,
  type Point,
  type Rect,
  type ResizeHandle,
  type ScreenshotEditorState,
} from './types';

/**
 * 限制数值在闭区间内。
 *
 * @param value - 待限制的数值。
 * @param min - 最小值。
 * @param max - 最大值。
 * @returns 位于 `[min, max]` 内的安全数值。
 */
export function clamp(value: number, min: number, max: number) {
  const safeMax = Math.max(min, max);
  return Math.min(Math.max(value, min), safeMax);
}

/**
 * 复制矩形对象，避免事件过程中共享引用被后续状态改写。
 *
 * @param rect - 原始矩形。
 * @returns 新矩形对象。
 */
export function cloneRect(rect: Rect): Rect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/**
 * 归一化任意两点构造出的选区矩形。
 *
 * @param a - 起始点。
 * @param b - 结束点。
 * @returns 左上角和正宽高矩形。
 */
export function normalizeRectFromPoints(a: Point, b: Point): Rect {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x, b.x);
  const bottom = Math.max(a.y, b.y);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * 将选区限制在当前视口内，并保证最小尺寸。
 *
 * @param rect - 待规整选区。
 * @param viewportWidth - 当前视口宽度。
 * @param viewportHeight - 当前视口高度。
 * @returns 不越界且可操作的选区。
 */
export function clampSelection(rect: Rect, viewportWidth: number, viewportHeight: number): Rect {
  const width = clamp(rect.width, SCREENSHOT_EDITOR_MIN_SELECTION_SIZE, viewportWidth);
  const height = clamp(rect.height, SCREENSHOT_EDITOR_MIN_SELECTION_SIZE, viewportHeight);
  return {
    x: clamp(rect.x, 0, viewportWidth - width),
    y: clamp(rect.y, 0, viewportHeight - height),
    width,
    height,
  };
}

/**
 * 将 CSS 像素点转换为原始截图像素点。
 *
 * @param point - 视口 CSS 像素点。
 * @param current - 当前截图编辑器状态。
 * @returns 原始截图像素点。
 */
export function toImagePoint(point: Point, current: ScreenshotEditorState): Point {
  return {
    x: point.x * current.imageWidth / Math.max(1, current.viewportWidth),
    y: point.y * current.imageHeight / Math.max(1, current.viewportHeight),
  };
}

/**
 * 将 CSS 像素矩形转换为原始截图像素矩形。
 *
 * @param rect - 视口 CSS 像素矩形。
 * @param current - 当前截图编辑器状态。
 * @returns 原始截图像素矩形。
 */
export function toImageRect(rect: Rect, current: ScreenshotEditorState): Rect {
  const start = toImagePoint({ x: rect.x, y: rect.y }, current);
  const end = toImagePoint({ x: rect.x + rect.width, y: rect.y + rect.height }, current);
  return {
    x: start.x,
    y: start.y,
    width: Math.max(1, end.x - start.x),
    height: Math.max(1, end.y - start.y),
  };
}

/**
 * 判断点是否位于当前选区内。
 *
 * @param point - 视口 CSS 像素点。
 * @param rect - 当前选区。
 * @returns 点是否命中选区。
 */
export function pointInSelection(point: Point, rect: Rect | null) {
  return Boolean(rect
    && point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height);
}

/**
 * 根据 resize handle 计算下一帧选区。
 *
 * @param origin - 拖拽开始时的选区快照。
 * @param handle - 命中的八向缩放控制点。
 * @param delta - 相对拖拽起点的位移。
 * @param viewportWidth - 当前视口宽度。
 * @param viewportHeight - 当前视口高度。
 * @returns 规整后的下一帧选区。
 */
export function resizeSelection(
  origin: Rect,
  handle: ResizeHandle,
  delta: Point,
  viewportWidth: number,
  viewportHeight: number,
): Rect {
  let left = origin.x;
  let top = origin.y;
  let right = origin.x + origin.width;
  let bottom = origin.y + origin.height;

  if (handle.includes('w')) left += delta.x;
  if (handle.includes('e')) right += delta.x;
  if (handle.includes('n')) top += delta.y;
  if (handle.includes('s')) bottom += delta.y;

  if (right - left < SCREENSHOT_EDITOR_MIN_SELECTION_SIZE) {
    if (handle.includes('w')) left = right - SCREENSHOT_EDITOR_MIN_SELECTION_SIZE;
    else right = left + SCREENSHOT_EDITOR_MIN_SELECTION_SIZE;
  }
  if (bottom - top < SCREENSHOT_EDITOR_MIN_SELECTION_SIZE) {
    if (handle.includes('n')) top = bottom - SCREENSHOT_EDITOR_MIN_SELECTION_SIZE;
    else bottom = top + SCREENSHOT_EDITOR_MIN_SELECTION_SIZE;
  }

  return clampSelection({ x: left, y: top, width: right - left, height: bottom - top }, viewportWidth, viewportHeight);
}
