/**
 * 说明：`screenshot-editor-text-annotations` 截图文字标注模块。
 *
 * 职责：
 * - 管理文字草稿的 DOM 布局、样式同步和文本读取；
 * - 管理提交后的可拖拽 DOM text rune；
 * - 在最终导出时把 text rune 绘制到输出 canvas。
 *
 * 边界：
 * - 本模块不监听页面事件、不创建截图编辑器结构、不发送 runtime 消息；
 * - Canvas bitmap 标注、选区渲染和 OCR 图片压缩仍属于 `drawing.ts`。
 */
import { clamp, toImagePoint } from './geometry';
import { getCanvasContext } from './render';
import type {
  Point,
  Rect,
  ScreenshotEditorState,
  ScreenshotEditorUi,
  ScreenshotTextAnnotation,
} from './types';

/** 文本编辑框在 CSS 视口坐标中的内边距。 */
const TEXT_EDITOR_PADDING_X = 4;
const TEXT_EDITOR_PADDING_Y = 4;
/** 截图文字标注固定使用通用 sans-serif，与 Shadow DOM contentEditable 保持一致。 */
const TEXT_EDITOR_FONT_FAMILY = 'sans-serif';
/** contentEditable 空内容时仍要给用户一个可见插入区域，但不能变成固定尺寸表单。 */
const TEXT_EDITOR_MIN_WIDTH = 24;
const TEXT_EDITOR_EDGE_PADDING = 8;
/** 当前页面会话内的文字 rune ID 递增种子，不进入持久化。 */
let textAnnotationIdSeed = 0;

/** 文字标注的 DOM 编辑态、DOM rune 与 Canvas 输出态共享样式。 */
export type ScreenshotTextDraftStyle = {
  /** CSS 像素字号。 */
  fontSize: number;
  /** CSS 像素行高。 */
  lineHeight: number;
  /** 文本颜色。 */
  color: string;
  /** CSS font-family。 */
  fontFamily: string;
  /** CSS 像素横向 padding。 */
  paddingX: number;
  /** CSS 像素纵向 padding。 */
  paddingY: number;
};

/** 当前文字草稿的布局约束。 */
export type ScreenshotTextDraftLayout = {
  /** CSS 视口坐标 x。 */
  x: number;
  /** CSS 视口坐标 y。 */
  y: number;
  /** 当前点击点到选区右侧的最大宽度。 */
  maxWidth: number;
  /** contentEditable 空内容时的最小宽度。 */
  minWidth: number;
  /** contentEditable 空内容时的最小高度。 */
  minHeight: number;
};

/** 读取当前文字工具样式。 */
export function getCurrentTextStyle(current: ScreenshotEditorState): ScreenshotTextDraftStyle {
  return {
    fontSize: current.annotationStyle.textSize,
    lineHeight: current.annotationStyle.textSize,
    color: current.annotationStyle.textColor,
    fontFamily: TEXT_EDITOR_FONT_FAMILY,
    paddingX: TEXT_EDITOR_PADDING_X,
    paddingY: TEXT_EDITOR_PADDING_Y,
  };
}

/** 计算文字草稿的自然布局边界。 */
export function getTextDraftLayout(
  current: ScreenshotEditorState,
  point: Point,
  style: ScreenshotTextDraftStyle,
): ScreenshotTextDraftLayout {
  const selection = current.selection;
  if (!selection) {
    return {
      x: point.x,
      y: point.y,
      maxWidth: TEXT_EDITOR_MIN_WIDTH,
      minWidth: TEXT_EDITOR_MIN_WIDTH,
      minHeight: style.lineHeight + style.paddingY * 2,
    };
  }
  const right = selection.x + selection.width;
  const x = clamp(point.x, selection.x + 4, Math.max(selection.x + 4, right - TEXT_EDITOR_EDGE_PADDING));
  const maxWidth = Math.max(TEXT_EDITOR_MIN_WIDTH, right - x - TEXT_EDITOR_EDGE_PADDING);
  return {
    x,
    y: clamp(point.y, selection.y + 4, Math.max(selection.y + 4, selection.y + selection.height - style.fontSize)),
    maxWidth,
    minWidth: Math.min(TEXT_EDITOR_MIN_WIDTH, maxWidth),
    minHeight: style.lineHeight + style.paddingY * 2,
  };
}

/** 同步文字编辑框的透明编辑态样式。 */
export function syncTextInputStyle(refs: ScreenshotEditorUi, current: ScreenshotEditorState): void {
  const style = getCurrentTextStyle(current);
  refs.textInput.style.font = `${style.fontSize}px/1 ${style.fontFamily}`;
  refs.textInput.style.lineHeight = `${style.lineHeight}px`;
  refs.textInput.style.color = style.color;
  refs.textInput.style.caretColor = style.color;
  refs.textInput.style.padding = `${style.paddingY}px ${style.paddingX}px`;
}

/** 读取 contentEditable 的纯文本。 */
export function getTextDraftValue(element: HTMLDivElement): string {
  const text = element.innerText || element.textContent || '';
  return text.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ');
}

/** 获取提交文字时使用的 CSS 尺寸。 */
export function getTextDraftSize(
  refs: ScreenshotEditorUi,
  current: ScreenshotEditorState,
  text: string,
  maxWidth: number,
): { width: number; height: number } {
  const rect = refs.textInput.getBoundingClientRect();
  const rectWidth = rect.width || refs.textInput.offsetWidth;
  const rectHeight = rect.height || refs.textInput.offsetHeight;
  if (rectWidth > 0 || rectHeight > 0) {
    return {
      width: Math.max(1, Math.min(rectWidth || maxWidth || TEXT_EDITOR_MIN_WIDTH, maxWidth || rectWidth || TEXT_EDITOR_MIN_WIDTH)),
      height: Math.max(1, rectHeight || getCurrentTextStyle(current).lineHeight),
    };
  }

  const style = getCurrentTextStyle(current);
  const ctx = getCanvasContext(refs.annotationCanvas);
  ctx.save();
  ctx.font = `${style.fontSize}px ${style.fontFamily}`;
  const available = Math.max(1, (maxWidth || current.viewportWidth) - style.paddingX * 2);
  const lines = layoutTextLines(ctx, text, available);
  const width = lines.reduce((longest, line) => Math.max(longest, ctx.measureText(line || ' ').width), 0);
  ctx.restore();
  return {
    width: clamp(width + style.paddingX * 2, TEXT_EDITOR_MIN_WIDTH, Math.max(TEXT_EDITOR_MIN_WIDTH, maxWidth || current.viewportWidth)),
    height: Math.max(style.lineHeight + style.paddingY * 2, lines.length * style.lineHeight + style.paddingY * 2),
  };
}

/** 清空 contentEditable 草稿节点。 */
export function clearTextDraftNode(element: HTMLDivElement): void {
  element.textContent = '';
}

/** 把 contentEditable 焦点移动到文本末尾。 */
export function focusTextDraftEnd(element: HTMLDivElement): void {
  element.focus();
  const selection = element.ownerDocument.defaultView?.getSelection();
  if (!selection) return;
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** 复制当前文字标注对象数组，避免撤销栈和运行态共享引用。 */
export function cloneTextAnnotations(annotations: ScreenshotTextAnnotation[]): ScreenshotTextAnnotation[] {
  return annotations.map((annotation) => ({ ...annotation }));
}

/** 为当前截图会话创建稳定文字标注 ID。 */
export function createTextAnnotationId(): string {
  textAnnotationIdSeed += 1;
  return `screenshot-text-${textAnnotationIdSeed}`;
}

/** 在当前状态中查找指定文字标注。 */
export function findTextAnnotation(current: ScreenshotEditorState, id: string): ScreenshotTextAnnotation | null {
  return current.textAnnotations.find((annotation) => annotation.id === id) ?? null;
}

/** 选中指定文字标注，并同步 DOM 边界状态。 */
export function selectTextAnnotation(
  refs: ScreenshotEditorUi,
  current: ScreenshotEditorState,
  id: string | null,
): void {
  current.selectedTextAnnotationId = id && findTextAnnotation(current, id) ? id : null;
  renderTextAnnotations(refs, current);
}

/** 标记文字标注拖拽态，仅影响页面编辑态 cursor / border，不进入导出图像。 */
export function setTextAnnotationDragging(
  refs: ScreenshotEditorUi,
  id: string | null,
  dragging: boolean,
): void {
  refs.textLayer.querySelectorAll<HTMLElement>('.text-annotation[data-dragging="true"]').forEach((node) => {
    if (!id || node.dataset.textAnnotationId !== id || !dragging) delete node.dataset.dragging;
  });
  if (!id) return;
  const node = [...refs.textLayer.querySelectorAll<HTMLElement>('.text-annotation')]
    .find((candidate) => candidate.dataset.textAnnotationId === id);
  if (!node) return;
  if (dragging) node.dataset.dragging = 'true';
  else delete node.dataset.dragging;
}

/** 移动指定文字标注，并把位置限制在当前选区内。 */
export function moveTextAnnotation(
  refs: ScreenshotEditorUi,
  current: ScreenshotEditorState,
  id: string,
  next: Point,
): void {
  const annotation = findTextAnnotation(current, id);
  if (!annotation) return;
  const bounds = current.selection ?? {
    x: 0,
    y: 0,
    width: current.viewportWidth,
    height: current.viewportHeight,
  };
  annotation.x = clamp(next.x, bounds.x, Math.max(bounds.x, bounds.x + bounds.width - annotation.width));
  annotation.y = clamp(next.y, bounds.y, Math.max(bounds.y, bounds.y + bounds.height - annotation.height));
  renderTextAnnotations(refs, current);
}

/** 清空已提交文字标注 DOM 与状态。 */
export function clearTextAnnotations(refs: ScreenshotEditorUi, current: ScreenshotEditorState): void {
  current.textAnnotations = [];
  current.selectedTextAnnotationId = null;
  refs.textLayer.replaceChildren();
}

/** 重绘已提交文字标注 DOM 层。 */
export function renderTextAnnotations(refs: ScreenshotEditorUi, current: ScreenshotEditorState): void {
  const existing = new Map<string, HTMLDivElement>();
  refs.textLayer.querySelectorAll<HTMLDivElement>('.text-annotation').forEach((node) => {
    const id = node.dataset.textAnnotationId;
    if (id) existing.set(id, node);
  });

  const activeIds = new Set(current.textAnnotations.map((annotation) => annotation.id));
  for (const [id, node] of existing) {
    if (!activeIds.has(id)) node.remove();
  }

  for (const annotation of current.textAnnotations) {
    let node = existing.get(annotation.id);
    if (!node) {
      node = refs.textLayer.ownerDocument.createElement('div');
      node.className = 'text-annotation';
      node.dataset.textAnnotationId = annotation.id;
      refs.textLayer.appendChild(node);
    }
    node.textContent = annotation.text;
    node.dataset.selected = current.selectedTextAnnotationId === annotation.id ? 'true' : 'false';
    node.style.left = `${annotation.x}px`;
    node.style.top = `${annotation.y}px`;
    node.style.width = `${Math.max(1, annotation.width)}px`;
    node.style.minHeight = `${Math.max(1, annotation.height)}px`;
    node.style.maxWidth = `${Math.max(1, annotation.maxWidth)}px`;
    node.style.font = `${annotation.fontSize}px/1 ${annotation.fontFamily}`;
    node.style.lineHeight = `${annotation.lineHeight}px`;
    node.style.color = annotation.color;
    node.style.padding = `${annotation.paddingY}px ${annotation.paddingX}px`;
  }
}

/** 按 canvas 当前字体把多行文本折行。 */
export function layoutTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph) {
      lines.push('');
      continue;
    }
    lines.push(...wrapCanvasText(ctx, paragraph, maxWidth));
  }
  return lines.length ? lines : [''];
}

/** 按 canvas 当前字体把单段文本折行。 */
function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const lines: string[] = [];
  let line = '';
  const tokens = text.split(/(\s+)/).filter(Boolean);

  for (const token of tokens) {
    const next = line ? `${line}${token}` : token;
    if (ctx.measureText(next).width <= maxWidth) {
      line = next;
      continue;
    }
    if (line) {
      lines.push(line.trimEnd());
      line = '';
    }
    if (ctx.measureText(token).width <= maxWidth) {
      line = token.trimStart();
      continue;
    }
    for (const char of Array.from(token)) {
      const charNext = line ? `${line}${char}` : char;
      if (ctx.measureText(charNext).width <= maxWidth) {
        line = charNext;
      } else {
        if (line) lines.push(line);
        line = char;
      }
    }
  }
  if (line) lines.push(line.trimEnd());
  return lines.length ? lines : [text];
}

/** 将页面侧文字 rune 绘制到最终导出 canvas。 */
export function drawTextAnnotationsToCanvas(
  ctx: CanvasRenderingContext2D,
  current: ScreenshotEditorState,
  selectionImageRect: Rect,
): void {
  const scale = current.imageWidth / Math.max(1, current.viewportWidth);
  ctx.save();
  ctx.textBaseline = 'top';
  for (const annotation of current.textAnnotations) {
    const point = toImagePoint({
      x: annotation.x + annotation.paddingX,
      y: annotation.y + annotation.paddingY,
    }, current);
    const maxTextWidth = Math.max(1, (annotation.width - annotation.paddingX * 2) * scale);
    const fontSize = Math.max(1, annotation.fontSize * scale);
    const lineHeight = Math.max(1, annotation.lineHeight * scale);
    ctx.font = `${fontSize}px ${annotation.fontFamily}`;
    ctx.fillStyle = annotation.color;
    let lineIndex = 0;
    for (const line of layoutTextLines(ctx, annotation.text, maxTextWidth)) {
      if (line) {
        ctx.fillText(
          line,
          point.x - selectionImageRect.x,
          point.y - selectionImageRect.y + lineIndex * lineHeight,
        );
      }
      lineIndex += 1;
    }
  }
  ctx.restore();
}
