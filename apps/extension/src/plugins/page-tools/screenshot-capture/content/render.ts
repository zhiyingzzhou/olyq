/**
 * 说明：`screenshot-editor-render` 截图编辑器渲染模块。
 *
 * 职责：
 * - 维护画布 backing store 尺寸、遮罩、选区框、尺寸提示和工具条位置；
 * - 复用 page-facing `floating-position` 的 flip / shift / position-only 策略；
 * - 同步工具条 active 状态。
 *
 * 边界：
 * - 本模块只刷新已有 DOM 和 canvas，不创建 UI、不发送截图动作、不持久化状态。
 */
import { positionPageFloatingElement, type PageFloatingAnchorRect } from '@/extension/content-script/floating-position';
import { clamp } from './geometry';
import type { ScreenshotEditorState, ScreenshotEditorUi, ScreenshotTool } from './types';

/**
 * 根据当前截图尺寸重置画布 backing store。
 *
 * @param refs - UI 节点引用集合。
 * @param current - 当前截图编辑器状态。
 */
export function resizeCanvases(refs: ScreenshotEditorUi, current: ScreenshotEditorState) {
  current.viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
  current.viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);

  for (const canvas of [refs.maskCanvas, refs.previewCanvas]) {
    canvas.width = current.viewportWidth;
    canvas.height = current.viewportHeight;
  }
  refs.annotationCanvas.width = current.imageWidth;
  refs.annotationCanvas.height = current.imageHeight;
}

/**
 * 获取指定画布的 2D context；失败时抛出稳定错误。
 *
 * @param canvas - 目标画布。
 * @returns 可用的 2D context。
 */
export function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('screenshot-editor-canvas-unavailable');
  return ctx;
}

/**
 * 根据当前选区状态刷新选区框、尺寸提示与工具条。
 *
 * @param refs - UI 节点引用集合。
 * @param current - 当前截图编辑器状态。
 */
export function renderSelection(refs: ScreenshotEditorUi, current: ScreenshotEditorState) {
  const rect = current.selection;
  if (!rect) {
    refs.selection.style.display = 'none';
    refs.sizeBadge.style.display = 'none';
    refs.toolbar.style.display = 'none';
    refs.toolOptions.style.display = 'none';
    refs.toolOptions.removeAttribute('data-active-tool');
    syncScreenshotEditorCursor(refs, current);
    redrawMask(refs, current);
    return;
  }

  refs.selection.style.display = 'block';
  refs.selection.style.left = `${rect.x}px`;
  refs.selection.style.top = `${rect.y}px`;
  refs.selection.style.width = `${rect.width}px`;
  refs.selection.style.height = `${rect.height}px`;
  syncScreenshotEditorCursor(refs, current);

  refs.sizeBadge.style.display = 'block';
  delete refs.sizeBadge.dataset.variant;
  refs.sizeBadge.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  refs.sizeBadge.style.left = `${clamp(rect.x, 12, current.viewportWidth - 80)}px`;
  refs.sizeBadge.style.top = `${clamp(rect.y - 32, 12, current.viewportHeight - 28)}px`;

  refs.toolbar.style.display = 'flex';
  positionPageFloatingElement({
    anchorRect: {
      left: rect.x,
      top: rect.y,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
      width: rect.width,
      height: rect.height,
    } satisfies PageFloatingAnchorRect,
    floating: refs.toolbar,
    preferredSide: 'bottom',
    fallbackPlacements: ['top'],
    align: 'center',
    gap: 10,
    padding: 12,
    fallbackWidth: 560,
    fallbackHeight: 44,
    sizeStrategy: 'position-only',
  });
  syncScreenshotToolOptions(refs, current);
  redrawMask(refs, current);
}

/**
 * 设置当前标注工具，并同步工具条按钮 active 态。
 *
 * @param refs - UI 节点引用集合。
 * @param current - 当前截图编辑器状态。
 * @param tool - 新的标注工具；为空时回到移动选区模式。
 */
export function setActiveTool(refs: ScreenshotEditorUi, current: ScreenshotEditorState, tool: ScreenshotTool | null) {
  current.activeTool = tool;
  refs.toolbar.querySelectorAll<HTMLButtonElement>('button[data-tool]').forEach((button) => {
    button.dataset.active = button.dataset.tool === tool ? 'true' : 'false';
  });
  syncScreenshotToolOptions(refs, current);
  syncScreenshotEditorCursor(refs, current);
}

/**
 * 同步截图工具条动作按钮的可用状态。
 *
 * 说明：文字输入态会用透明编辑层接管外部点击，撤销不能在
 * `contentEditable` 打开时同一点击里抢先执行；这里用显式按钮状态表达同一
 * 交互约束，并由 controller 在点击外部提交后恢复。
 *
 * @param refs - UI 节点引用集合。
 * @param current - 当前截图编辑器状态。
 * @param options - 当前文字草稿是否处于编辑态。
 */
export function syncScreenshotToolbarActionState(
  refs: ScreenshotEditorUi,
  current: ScreenshotEditorState,
  options: { textDraftOpen?: boolean } = {},
): void {
  const undoButton = refs.toolbar.querySelector<HTMLButtonElement>('button[data-action="undo"]');
  if (!undoButton) return;
  const undoDisabled = options.textDraftOpen === true || current.history.length === 0;
  undoButton.dataset.disabled = undoDisabled ? 'true' : 'false';
  undoButton.setAttribute('aria-disabled', undoDisabled ? 'true' : 'false');
}

/**
 * 同步截图工具二级设置面板的显示、定位和 active 状态。
 *
 * 说明：
 * - 工具条和设置面板由 React 静态渲染，当前工具 / 颜色 / 尺寸状态由 controller
 *   写入 DOM dataset，避免把 pointer 高频绘制接回 React 状态；
 * - 面板定位复用 page-facing floating helper，跟随工具条做 flip / shift。
 *
 * @param refs - UI 节点引用集合。
 * @param current - 当前截图编辑器状态。
 */
export function syncScreenshotToolOptions(refs: ScreenshotEditorUi, current: ScreenshotEditorState) {
  const tool = current.activeTool;
  if (!current.selection || !tool) {
    refs.toolOptions.style.display = 'none';
    refs.toolOptions.removeAttribute('data-active-tool');
    return;
  }

  refs.toolOptions.style.display = 'flex';
  refs.toolOptions.dataset.activeTool = tool;
  refs.toolOptions.querySelectorAll<HTMLElement>('[data-options-group]').forEach((group) => {
    const groupName = group.dataset.optionsGroup;
    const visible = groupName === 'font-size'
      ? tool === 'text'
      : groupName === 'color'
        ? tool !== 'mosaic'
        : groupName === 'size'
          ? tool !== 'text'
          : false;
    group.hidden = !visible;
  });
  const colorValue = tool === 'text' ? current.annotationStyle.textColor : current.annotationStyle.sharedColor;
  const sizeValue = tool === 'mosaic'
    ? current.annotationStyle.mosaicSize
    : tool === 'pen'
      ? current.annotationStyle.penSize
      : current.annotationStyle.strokeSize;

  refs.toolOptions.querySelectorAll<HTMLButtonElement>('button[data-style-color]').forEach((button) => {
    button.dataset.active = button.dataset.styleColor === colorValue ? 'true' : 'false';
  });
  refs.toolOptions.querySelectorAll<HTMLButtonElement>('button[data-style-size]').forEach((button) => {
    button.dataset.active = tool !== 'mosaic' && Number(button.dataset.styleSize) === sizeValue ? 'true' : 'false';
  });
  refs.toolOptions.querySelectorAll<HTMLButtonElement>('button[data-mosaic-style-size]').forEach((button) => {
    button.dataset.active = tool === 'mosaic' && Number(button.dataset.mosaicStyleSize) === sizeValue ? 'true' : 'false';
  });
  refs.toolOptions.querySelectorAll<HTMLButtonElement>('button[data-style-font-size]').forEach((button) => {
    button.dataset.active = Number(button.dataset.styleFontSize) === current.annotationStyle.textSize ? 'true' : 'false';
  });

  const toolbarRect = refs.toolbar.getBoundingClientRect();
  positionPageFloatingElement({
    anchorRect: {
      left: toolbarRect.left,
      top: toolbarRect.top,
      right: toolbarRect.right,
      bottom: toolbarRect.bottom,
      width: toolbarRect.width,
      height: toolbarRect.height,
    } satisfies PageFloatingAnchorRect,
    floating: refs.toolOptions,
    preferredSide: 'bottom',
    fallbackPlacements: ['top'],
    align: 'center',
    gap: 6,
    padding: 12,
    fallbackWidth: 420,
    fallbackHeight: 42,
    sizeStrategy: 'position-only',
  });
}

/**
 * 同步截图编辑器当前工具语义对应的鼠标形态。
 *
 * 说明：
 * - 选区层位于绘制 canvas 上方，必须由同一 helper 同步 cursor，避免标注工具
 *   激活后仍显示移动选区的 `move`；
 * - resize handle 的 cursor 继续由 CSS 控制，本函数只处理选区主体与绘制画布。
 *
 * @param refs - UI 节点引用集合。
 * @param current - 当前截图编辑器状态。
 */
export function syncScreenshotEditorCursor(refs: ScreenshotEditorUi, current: ScreenshotEditorState) {
  const tool = current.activeTool;
  const drawingCursor = tool === 'text' ? 'text' : 'crosshair';
  refs.annotationCanvas.style.cursor = drawingCursor;
  refs.selection.style.cursor = !current.selection
    ? 'crosshair'
    : tool === 'text'
      ? 'text'
      : tool
        ? 'crosshair'
        : 'move';
}

/**
 * 重绘蒙层，让选区内部保持清晰、外部置灰。
 *
 * @param refs - UI 节点引用集合。
 * @param current - 当前截图编辑器状态。
 */
function redrawMask(refs: ScreenshotEditorUi, current: ScreenshotEditorState) {
  const ctx = getCanvasContext(refs.maskCanvas);
  ctx.clearRect(0, 0, refs.maskCanvas.width, refs.maskCanvas.height);
  ctx.fillStyle = 'rgba(15,23,42,.54)';
  ctx.fillRect(0, 0, current.viewportWidth, current.viewportHeight);
  if (!current.selection) return;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,1)';
  ctx.fillRect(current.selection.x, current.selection.y, current.selection.width, current.selection.height);
  ctx.restore();
}
