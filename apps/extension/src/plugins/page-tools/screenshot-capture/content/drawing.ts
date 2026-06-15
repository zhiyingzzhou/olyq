/**
 * 说明：`screenshot-editor-drawing` 截图编辑器画布绘制模块。
 *
 * 职责：
 * - 管理标注撤销栈、图形预览、图形提交、可拖拽文字 rune、马赛克和最终 PNG 导出；
 * - 保持原始截图和标注层分离，导出时只裁剪选区并叠加 annotation canvas。
 *
 * 边界：
 * - 本模块不创建 Shadow DOM、不监听页面事件、不向 Service Worker 发送动作。
 */
import {
  normalizeRectFromPoints,
  toImageRect,
  toImagePoint,
} from './geometry';
import { I18nError } from '@/lib/i18n/error';
import type { ScreenshotEditorImagePayload, ScreenshotEditorImageMime } from '@/plugins/page-tools/screenshot-capture/contracts';
import { getCanvasContext } from './render';
import type {
  Point,
  Rect,
  ScreenshotAnnotationHistoryEntry,
  ScreenshotEditorState,
  ScreenshotEditorUi,
  ScreenshotTextAnnotation,
} from './types';
import {
  clearTextDraftNode,
  cloneTextAnnotations,
  createTextAnnotationId,
  drawTextAnnotationsToCanvas,
  findTextAnnotation,
  focusTextDraftEnd,
  getCurrentTextStyle,
  getTextDraftLayout,
  getTextDraftSize,
  getTextDraftValue,
  moveTextAnnotation,
  renderTextAnnotations,
  selectTextAnnotation,
  setTextAnnotationDragging,
  syncTextInputStyle,
} from './text-annotations';

/** OCR 图片按上传前预算收敛，避免大 PNG 让多模态 provider 直接拒绝。 */
const OCR_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
/** OCR 请求只需要足够清晰的文字输入，最长边限制可显著减少后台请求体积。 */
const OCR_IMAGE_MAX_LONG_EDGE = 2048;
/** OCR JPEG 压缩档位；不使用固定 delay 或 provider 分支探测。 */
const OCR_JPEG_QUALITY_TIERS = [0.92, 0.82, 0.72, 0.62] as const;

export {
  clearTextAnnotations,
  clearTextDraftNode,
  focusTextDraftEnd,
  syncTextInputStyle,
} from './text-annotations';

/**
 * 截图 Rune 管理器。
 *
 * 说明：
 * - 按绘制层与标注管理层拆分职责，避免 controller 同时承担状态和渲染；
 * - controller 只负责事件时序，本对象集中管理“标注 rune”的预览、提交、撤销、文字与导出；
 * - bitmap 标注使用 Canvas backing store，文字标注使用页面侧 DOM rune；
 * - 历史记录同时保存轻量 PNG 快照和文字对象快照，不进入持久化。
 */
export type ScreenshotRuneManager = {
  /** 保存当前标注层快照。 */
  pushHistory: () => void;
  /** 撤销上一笔标注。 */
  undo: () => Promise<void>;
  /** 重绘已提交文字标注 DOM 层。 */
  renderTextAnnotations: () => void;
  /** 选中指定文字标注。 */
  selectTextAnnotation: (id: string | null) => void;
  /** 标记指定文字标注是否正在拖拽。 */
  setTextAnnotationDragging: (id: string | null, dragging: boolean) => void;
  /** 读取指定文字标注对象。 */
  getTextAnnotation: (id: string) => ScreenshotTextAnnotation | null;
  /** 移动指定文字标注。 */
  moveTextAnnotation: (id: string, next: Point) => void;
  /** 清理当前拖拽预览层。 */
  clearPreview: () => void;
  /** 绘制当前工具预览。 */
  drawPreview: (from: Point, to: Point) => void;
  /** 提交当前工具图形。 */
  commitShape: (from: Point, to: Point) => void;
  /** 提交当前文字输入为页面侧可拖拽 rune；IME 组合输入期间会拒绝提交。 */
  commitText: () => boolean;
  /** 在选区内打开文字输入层。 */
  openTextInput: (point: Point) => void;
  /** 导出当前选区 PNG。 */
  exportSelectionToDataUrl: () => string;
  /** 导出当前选区给 OCR 使用的模型友好图片。 */
  exportSelectionForOcr: (name: string) => ScreenshotEditorImagePayload;
};

/**
 * 创建截图 Rune 管理器。
 *
 * @param refs - React 渲染出的截图编辑器节点引用。
 * @param current - 当前截图编辑器会话状态。
 * @returns 面向 ScreenshotBoardController 的命令式 rune 操作集合。
 */
export function createScreenshotRuneManager(
  refs: ScreenshotEditorUi,
  current: ScreenshotEditorState,
): ScreenshotRuneManager {
  return {
    pushHistory: () => pushHistory(refs, current),
    undo: async () => restoreAnnotationSnapshot(refs, current, current.history.pop() ?? null),
    renderTextAnnotations: () => renderTextAnnotations(refs, current),
    selectTextAnnotation: (id) => selectTextAnnotation(refs, current, id),
    setTextAnnotationDragging: (id, dragging) => setTextAnnotationDragging(refs, id, dragging),
    getTextAnnotation: (id) => findTextAnnotation(current, id),
    moveTextAnnotation: (id, next) => moveTextAnnotation(refs, current, id, next),
    clearPreview: () => clearPreview(refs),
    drawPreview: (from, to) => drawPreview(refs, current, from, to),
    commitShape: (from, to) => commitShape(refs, current, from, to),
    commitText: () => commitText(refs, current),
    openTextInput: (point) => openTextInput(refs, current, point),
    exportSelectionToDataUrl: () => exportSelectionToDataUrl(refs, current),
    exportSelectionForOcr: (name) => exportSelectionForOcr(refs, current, name),
  };
}

/**
 * 保存一份当前标注画布快照，用于撤销。
 *
 * @param refs - UI 节点引用集合。
 * @param current - 当前截图编辑器状态。
 */
export function pushHistory(refs: ScreenshotEditorUi, current: ScreenshotEditorState) {
  current.history.push({
    canvasDataUrl: refs.annotationCanvas.toDataURL('image/png'),
    textAnnotations: cloneTextAnnotations(current.textAnnotations),
    selectedTextAnnotationId: current.selectedTextAnnotationId,
  });
  if (current.history.length > 30) current.history.shift();
}

/**
 * 恢复一份标注画布快照。
 *
 * @param refs - UI 节点引用集合。
 * @param dataUrl - 撤销栈里保存的 PNG data URL；为空时清空标注层。
 */
export async function restoreAnnotationSnapshot(
  refs: ScreenshotEditorUi,
  current: ScreenshotEditorState,
  snapshot: ScreenshotAnnotationHistoryEntry | null,
) {
  const ctx = getCanvasContext(refs.annotationCanvas);
  ctx.clearRect(0, 0, refs.annotationCanvas.width, refs.annotationCanvas.height);
  current.textAnnotations = cloneTextAnnotations(snapshot?.textAnnotations ?? []);
  current.selectedTextAnnotationId = snapshot?.selectedTextAnnotationId ?? null;
  renderTextAnnotations(refs, current);
  if (!snapshot?.canvasDataUrl) return;
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      ctx.drawImage(image, 0, 0);
      resolve();
    };
    image.onerror = () => reject(new Error('screenshot-editor-undo-failed'));
    image.src = snapshot.canvasDataUrl;
  });
}

/**
 * 清理预览画布。
 *
 * @param refs - UI 节点引用集合。
 */
export function clearPreview(refs: ScreenshotEditorUi) {
  getCanvasContext(refs.previewCanvas).clearRect(0, 0, refs.previewCanvas.width, refs.previewCanvas.height);
}

/**
 * 将当前工具拖拽预览绘制到预览层。
 *
 * @param refs - UI 节点引用集合。
 * @param current - 当前截图编辑器状态。
 * @param from - 拖拽起点，使用 CSS 视口坐标。
 * @param to - 拖拽当前点，使用 CSS 视口坐标。
 */
export function drawPreview(refs: ScreenshotEditorUi, current: ScreenshotEditorState, from: Point, to: Point) {
  clearPreview(refs);
  const ctx = getCanvasContext(refs.previewCanvas);
  const rect = normalizeRectFromPoints(from, to);
  const strokeSize = current.activeTool === 'pen'
    ? current.annotationStyle.penSize
    : current.annotationStyle.strokeSize;
  ctx.save();
  ctx.strokeStyle = current.activeTool === 'mosaic'
    ? 'rgba(59,130,246,.96)'
    : current.annotationStyle.sharedColor;
  ctx.lineWidth = Math.max(1, strokeSize);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (current.activeTool === 'rect') {
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  } else if (current.activeTool === 'circle') {
    ctx.beginPath();
    ctx.ellipse(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (current.activeTool === 'arrow') {
    drawArrow(ctx, from, to, 1, strokeSize);
  } else if (current.activeTool === 'mosaic') {
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  }
  ctx.restore();
}

/**
 * 将当前工具拖拽结果提交到标注画布。
 *
 * @param refs - UI 节点引用集合。
 * @param current - 当前截图编辑器状态。
 * @param fromCss - 拖拽起点，使用 CSS 视口坐标。
 * @param toCss - 拖拽结束点，使用 CSS 视口坐标。
 */
export function commitShape(refs: ScreenshotEditorUi, current: ScreenshotEditorState, fromCss: Point, toCss: Point) {
  const ctx = getCanvasContext(refs.annotationCanvas);
  const from = toImagePoint(fromCss, current);
  const to = toImagePoint(toCss, current);
  const rectCss = normalizeRectFromPoints(fromCss, toCss);
  const rect = toImageRect(rectCss, current);
  const scale = current.imageWidth / Math.max(1, current.viewportWidth);
  const strokeSize = current.activeTool === 'pen'
    ? current.annotationStyle.penSize
    : current.annotationStyle.strokeSize;

  ctx.save();
  ctx.strokeStyle = current.annotationStyle.sharedColor;
  ctx.fillStyle = current.annotationStyle.sharedColor;
  ctx.lineWidth = Math.max(1, strokeSize * scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (current.activeTool === 'rect') {
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  } else if (current.activeTool === 'circle') {
    ctx.beginPath();
    ctx.ellipse(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2, rect.height / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (current.activeTool === 'arrow') {
    drawArrow(ctx, from, to, scale, strokeSize * scale);
  } else if (current.activeTool === 'mosaic') {
    drawMosaic(refs, rect, current.annotationStyle.mosaicSize * scale);
  }
  ctx.restore();
}

/**
 * 绘制文本输入内容到标注画布。
 *
 * @param refs - UI 节点引用集合。
 * @param current - 当前截图编辑器状态。
 */
export function commitText(refs: ScreenshotEditorUi, current: ScreenshotEditorState): boolean {
  if (refs.textInput.dataset.composing === 'true') return false;
  if (refs.textInput.dataset.open !== 'true') return true;

  const text = getTextDraftValue(refs.textInput);
  const left = Number(refs.textInput.dataset.x || 0);
  const top = Number(refs.textInput.dataset.y || 0);
  const maxWidth = Number(refs.textInput.dataset.maxWidth || 0);
  const textStyle = getCurrentTextStyle(current);
  const size = getTextDraftSize(refs, current, text, maxWidth);
  clearTextDraftNode(refs.textInput);
  refs.textInput.style.display = 'none';
  delete refs.textInput.dataset.open;
  delete refs.textInput.dataset.maxWidth;
  delete refs.textInput.dataset.composing;
  if (!text.trim()) return true;

  pushHistory(refs, current);
  const annotation: ScreenshotTextAnnotation = {
    id: createTextAnnotationId(),
    x: left,
    y: top,
    width: size.width,
    height: size.height,
    maxWidth,
    text,
    ...textStyle,
  };
  current.textAnnotations.push(annotation);
  current.selectedTextAnnotationId = annotation.id;
  renderTextAnnotations(refs, current);
  return true;
}

/**
 * 在选区内展示文本输入框。
 *
 * @param refs - UI 节点引用集合。
 * @param current - 当前截图编辑器状态。
 * @param point - 用户点击位置，使用 CSS 视口坐标。
 */
export function openTextInput(refs: ScreenshotEditorUi, current: ScreenshotEditorState, point: Point) {
  if (!current.selection) return;
  const textStyle = getCurrentTextStyle(current);
  const layout = getTextDraftLayout(current, point, textStyle);
  refs.textInput.dataset.x = String(layout.x);
  refs.textInput.dataset.y = String(layout.y);
  refs.textInput.dataset.maxWidth = String(layout.maxWidth);
  refs.textInput.dataset.open = 'true';
  delete refs.textInput.dataset.composing;
  syncTextInputStyle(refs, current);
  refs.textInput.style.left = `${layout.x}px`;
  refs.textInput.style.top = `${layout.y}px`;
  refs.textInput.style.maxWidth = `${layout.maxWidth}px`;
  refs.textInput.style.minWidth = `${layout.minWidth}px`;
  refs.textInput.style.minHeight = `${layout.minHeight}px`;
  refs.textInput.style.removeProperty('width');
  refs.textInput.style.removeProperty('height');
  refs.textInput.style.cursor = 'text';
  refs.textInput.style.display = 'block';
  clearTextDraftNode(refs.textInput);
  focusTextDraftEnd(refs.textInput);
}

/**
 * 导出当前选区 PNG，包含原图裁剪与标注层裁剪。
 *
 * @param refs - UI 节点引用集合。
 * @param current - 当前截图编辑器状态。
 * @returns PNG data URL。
 */
export function exportSelectionToDataUrl(refs: ScreenshotEditorUi, current: ScreenshotEditorState): string {
  return renderSelectionToCanvas(refs, current).toDataURL('image/png');
}

/**
 * 导出当前选区给 OCR 使用的模型视觉输入图片。
 *
 * 说明：
 * - 聊天发送仍保留无损 PNG；OCR 单独按模型请求体预算压缩；
 * - 首选原始 PNG，超出预算后按最长边缩放并转 JPEG；
 * - 如果压缩后仍超过预算，直接返回稳定错误，不把超大请求交给 provider 试错。
 *
 * @param refs - UI 节点引用集合。
 * @param current - 当前截图编辑器状态。
 * @param name - 基础文件名。
 * @returns 可直接进入 Service Worker OCR action 的图片负载。
 */
export function exportSelectionForOcr(
  refs: ScreenshotEditorUi,
  current: ScreenshotEditorState,
  name: string,
): ScreenshotEditorImagePayload {
  const fullCanvas = renderSelectionToCanvas(refs, current);
  const png = fullCanvas.toDataURL('image/png');
  if (getDataUrlPayloadBytes(png) <= OCR_IMAGE_MAX_BYTES) {
    return {
      dataUrl: png,
      mime: 'image/png',
      name: normalizeImagePayloadName(name, 'image/png'),
    };
  }

  const ocrCanvas = resizeCanvasForOcr(fullCanvas);
  for (const quality of OCR_JPEG_QUALITY_TIERS) {
    const jpeg = exportCanvasDataUrl(ocrCanvas, 'image/jpeg', quality);
    if (jpeg.startsWith('data:image/jpeg;base64,') && getDataUrlPayloadBytes(jpeg) <= OCR_IMAGE_MAX_BYTES) {
      return {
        dataUrl: jpeg,
        mime: 'image/jpeg',
        name: normalizeImagePayloadName(name, 'image/jpeg'),
      };
    }
  }

  throw new I18nError('errors.screenshotOcrImageTooLarge', {
    mb: Math.round((OCR_IMAGE_MAX_BYTES / 1024 / 1024) * 10) / 10,
  });
}

/**
 * 将当前选区渲染到一个独立输出 canvas。
 *
 * @param refs - UI 节点引用集合。
 * @param current - 当前截图编辑器状态。
 * @returns 已叠加原图与标注层的选区 canvas。
 */
function renderSelectionToCanvas(refs: ScreenshotEditorUi, current: ScreenshotEditorState): HTMLCanvasElement {
  if (!current.selection) throw new Error('screenshot-editor-selection-missing');
  const rect = toImageRect(current.selection, current);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(rect.width));
  out.height = Math.max(1, Math.round(rect.height));
  const ctx = getCanvasContext(out);
  ctx.drawImage(refs.sourceImage, rect.x, rect.y, rect.width, rect.height, 0, 0, out.width, out.height);
  ctx.drawImage(refs.annotationCanvas, rect.x, rect.y, rect.width, rect.height, 0, 0, out.width, out.height);
  drawTextAnnotationsToCanvas(ctx, current, rect);
  return out;
}

/**
 * 按 OCR 长边预算缩放 canvas。
 *
 * @param source - 已渲染完成的原始选区 canvas。
 * @returns 可用于 OCR 压缩导出的 canvas。
 */
function resizeCanvasForOcr(source: HTMLCanvasElement): HTMLCanvasElement {
  const longest = Math.max(source.width, source.height, 1);
  const ratio = Math.min(1, OCR_IMAGE_MAX_LONG_EDGE / longest);
  if (ratio >= 1) return source;

  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(source.width * ratio));
  out.height = Math.max(1, Math.round(source.height * ratio));
  const ctx = getCanvasContext(out);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, out.width, out.height);
  return out;
}

/**
 * 导出 canvas data URL 并校验浏览器是否接受目标 MIME。
 *
 * @param canvas - 待导出的 canvas。
 * @param mime - 目标 MIME。
 * @param quality - JPEG/WebP 质量参数。
 * @returns 与目标 MIME 匹配的 data URL。
 */
function exportCanvasDataUrl(canvas: HTMLCanvasElement, mime: ScreenshotEditorImageMime, quality?: number): string {
  return canvas.toDataURL(mime, quality);
}

/**
 * 粗略计算 data URL 的 payload 字节数。
 *
 * @param dataUrl - base64 图片 data URL。
 * @returns 解码后的二进制字节数估算。
 */
function getDataUrlPayloadBytes(dataUrl: string): number {
  const body = String(dataUrl || '').split(',', 2)[1] || '';
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((body.length * 3) / 4) - padding);
}

/**
 * 根据目标 MIME 归一化导出文件名。
 *
 * @param name - 原始文件名。
 * @param mime - 目标图片 MIME。
 * @returns 后缀与 MIME 一致的文件名。
 */
function normalizeImagePayloadName(name: string, mime: ScreenshotEditorImageMime): string {
  const extension = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
  const base = String(name || '').trim().replace(/\.[a-z0-9]{1,8}$/i, '') || `screenshot-${Date.now()}`;
  return `${base}.${extension}`;
}

/**
 * 将 data URL 写入系统剪贴板。
 *
 * @param dataUrl - PNG data URL。
 */
export async function copyPngToClipboard(dataUrl: string) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new I18nError('errors.clipboardImageWriteUnsupported');
  }
  const blob = await (await fetch(dataUrl)).blob();
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

/**
 * 下载导出的 PNG。
 *
 * @param dataUrl - PNG data URL。
 * @param name - 下载文件名。
 */
export function downloadPng(dataUrl: string, name: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = name;
  a.rel = 'noopener';
  document.documentElement.appendChild(a);
  a.click();
  a.remove();
}

/**
 * 绘制箭头。
 *
 * @param ctx - 目标 2D context。
 * @param from - 原图或 CSS 坐标起点。
 * @param to - 原图或 CSS 坐标终点。
 * @param scale - 箭头尺寸缩放系数。
 * @param strokeWidth - 当前线宽，用于让箭头头部跟随粗细变化。
 */
function drawArrow(ctx: CanvasRenderingContext2D, from: Point, to: Point, scale: number, strokeWidth: number) {
  const headLength = Math.max(14 * scale, strokeWidth * 4);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.lineTo(to.x - headLength * Math.cos(angle - Math.PI / 6), to.y - headLength * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - headLength * Math.cos(angle + Math.PI / 6), to.y - headLength * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

/**
 * 将指定原图区域绘制为马赛克并叠到标注画布。
 *
 * @param refs - UI 节点引用集合。
 * @param rect - 原图像素矩形。
 * @param blockSize - 马赛克像素块大小。
 */
function drawMosaic(refs: ScreenshotEditorUi, rect: Rect, blockSize: number) {
  if (rect.width < 2 || rect.height < 2) return;
  const ctx = getCanvasContext(refs.annotationCanvas);
  const block = Math.max(4, Math.round(blockSize));
  const smallWidth = Math.max(1, Math.round(rect.width / block));
  const smallHeight = Math.max(1, Math.round(rect.height / block));
  const tmp = document.createElement('canvas');
  tmp.width = smallWidth;
  tmp.height = smallHeight;
  const tmpCtx = getCanvasContext(tmp);
  tmpCtx.drawImage(refs.sourceImage, rect.x, rect.y, rect.width, rect.height, 0, 0, smallWidth, smallHeight);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, smallWidth, smallHeight, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}
