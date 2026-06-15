/**
 * 说明：截图标注样式状态控制模块。
 *
 * 职责：
 * - 维护截图标注颜色、粗细、字号和马赛克尺寸；
 * - 把二级设置面板点击与滚轮调节收口为 controller helper；
 * - 同步文字 DOM 编辑态和工具设置面板 active 状态。
 *
 * 边界：
 * - 本模块不绘制 Canvas、不发送 runtime 消息、不持久化样式；
 * - 样式状态只作用于当前截图编辑会话。
 */
import { syncTextInputStyle } from './drawing';
import { syncScreenshotToolOptions } from './render';
import {
  SCREENSHOT_MARK_SIZE_TIERS,
  SCREENSHOT_MOSAIC_SIZE_TIERS,
  SCREENSHOT_TEXT_FONT_SIZES,
  type ScreenshotEditorState,
  type ScreenshotEditorUi,
} from './types';

/**
 * 在有序候选里按方向步进到相邻值。
 *
 * @param values - 可选尺寸或字号候选。
 * @param currentValue - 当前值。
 * @param direction - `1` 表示增大，`-1` 表示减小。
 * @returns 步进后的值。
 */
function stepOptionValue(values: readonly number[], currentValue: number, direction: 1 | -1): number {
  const currentIndex = values.findIndex((value) => value === currentValue);
  const index = currentIndex >= 0
    ? currentIndex
    : values.reduce((best, value, valueIndex) => (
      Math.abs(value - currentValue) < Math.abs(values[best] - currentValue) ? valueIndex : best
    ), 0);
  return values[Math.min(values.length - 1, Math.max(0, index + direction))];
}

/**
 * 为当前激活工具写入尺寸配置。
 *
 * @param current - 当前截图编辑器状态。
 * @param size - 新尺寸。
 */
function setActiveToolSize(current: ScreenshotEditorState, size: number): void {
  if (current.activeTool === 'pen') {
    current.annotationStyle.penSize = size;
    return;
  }
  if (current.activeTool === 'mosaic') {
    current.annotationStyle.mosaicSize = size;
    return;
  }
  if (current.activeTool === 'rect' || current.activeTool === 'circle' || current.activeTool === 'arrow') {
    current.annotationStyle.strokeSize = size;
  }
}

/**
 * 按当前工具处理 PixPin 式滚轮调节。
 *
 * @param refs - UI 节点引用集合。
 * @param current - 当前截图编辑器状态。
 * @param direction - `1` 表示增大，`-1` 表示减小。
 */
export function stepActiveToolSize(refs: ScreenshotEditorUi, current: ScreenshotEditorState, direction: 1 | -1): void {
  if (current.activeTool === 'text') {
    current.annotationStyle.textSize = stepOptionValue(
      SCREENSHOT_TEXT_FONT_SIZES,
      current.annotationStyle.textSize,
      direction,
    );
    syncTextInputStyle(refs, current);
    syncScreenshotToolOptions(refs, current);
    return;
  }

  const currentSize = current.activeTool === 'pen'
    ? current.annotationStyle.penSize
    : current.activeTool === 'mosaic'
      ? current.annotationStyle.mosaicSize
      : current.annotationStyle.strokeSize;
  const tiers = current.activeTool === 'mosaic'
    ? SCREENSHOT_MOSAIC_SIZE_TIERS
    : SCREENSHOT_MARK_SIZE_TIERS;
  setActiveToolSize(current, stepOptionValue(tiers, currentSize, direction));
  syncScreenshotToolOptions(refs, current);
}

/**
 * 处理工具二级设置面板按钮。
 *
 * @param refs - UI 节点引用集合。
 * @param current - 当前截图编辑器状态。
 * @param button - 被点击的颜色、尺寸或字号按钮。
 */
export function applyToolOptionButton(
  refs: ScreenshotEditorUi,
  current: ScreenshotEditorState,
  button: HTMLButtonElement,
): void {
  const color = button.dataset.styleColor;
  if (color) {
    if (current.activeTool === 'text') current.annotationStyle.textColor = color;
    else current.annotationStyle.sharedColor = color;
    syncTextInputStyle(refs, current);
    syncScreenshotToolOptions(refs, current);
    return;
  }

  const size = Number(button.dataset.styleSize);
  if (Number.isFinite(size) && size > 0) {
    if (current.activeTool === 'mosaic') return;
    setActiveToolSize(current, size);
    syncScreenshotToolOptions(refs, current);
    return;
  }

  const mosaicSize = Number(button.dataset.mosaicStyleSize);
  if (Number.isFinite(mosaicSize) && mosaicSize > 0) {
    if (current.activeTool !== 'mosaic') return;
    current.annotationStyle.mosaicSize = mosaicSize;
    syncScreenshotToolOptions(refs, current);
    return;
  }

  const fontSize = Number(button.dataset.styleFontSize);
  if (Number.isFinite(fontSize) && fontSize > 0) {
    current.annotationStyle.textSize = fontSize;
    syncTextInputStyle(refs, current);
    syncScreenshotToolOptions(refs, current);
  }
}
