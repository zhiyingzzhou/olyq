/**
 * 说明：`screenshot-editor` 内容脚本入口模块。
 *
 * 职责：
 * - 在网页侧打开和关闭 Shadow DOM 截图编辑器；
 * - 编排选区拖拽、移动、缩放、标注工具、键盘快捷键和页面事件清理；
 * - 将用户显式提交的截图结果发送给 Service Worker，再由 Sidepanel 插入输入区。
 *
 * 边界：
 * - 本模块只处理页面侧临时交互，不持久化任何截图或编辑状态；
 * - React 只渲染 Shadow DOM 静态 UI，Canvas 与 pointer 热路径由本 controller 管理；
 * - OCR 浮窗只负责页面侧 loading / 结果展示，真实识别能力由 Service Worker
 *   通过统一 provider runtime 调用视觉模型完成。
 */
import type { ScreenshotEditorOpenPayload } from '@/plugins/page-tools/screenshot-capture/contracts';
import type { PageToolSessionCloseReason } from '@/types/sw-messages';
import { dismissPageTooltip } from '@/extension/content-script/page-tooltip';
import { ensurePageToolsRoot } from '@/extension/content-script/page-tools/page-tools-root';
import {
  clearTextAnnotations,
  createScreenshotRuneManager,
  syncTextInputStyle,
} from './drawing';
import {
  hideScreenshotActionFeedback,
} from './feedback';
import {
  clamp,
  clampSelection,
  cloneRect,
  normalizeRectFromPoints,
  pointInSelection,
  resizeSelection,
  toImagePoint,
} from './geometry';
import {
  getCanvasContext,
  renderSelection,
  resizeCanvases,
  setActiveTool,
  syncScreenshotToolbarActionState,
} from './render';
import {
  DEFAULT_SCREENSHOT_ANNOTATION_STYLE,
  SCREENSHOT_EDITOR_MIN_SELECTION_SIZE,
  SCREENSHOT_EDITOR_MODE_KEY,
  type Point,
  type ResizeHandle,
  type ScreenshotEditorState,
  type ScreenshotEditorUi,
  type ScreenshotTool,
} from './types';
import { applyToolOptionButton, stepActiveToolSize } from './style';
import {
  closeScreenshotOcrPopover,
  isScreenshotOcrPopoverOpenForAck,
} from './ocr-popover';
import {
  clearScreenshotTextDraft,
  createScreenshotTextDraftController,
} from './text-draft';
import {
  applyTextRuneDrag,
  beginTextRuneDrag,
  finishTextRuneDrag,
} from './text-rune-drag';
import { runScreenshotToolbarAction } from './toolbar-actions';
import { sendExtensionMessage } from '@/lib/extension/runtime-api';

let ui: ScreenshotEditorUi | null = null;
let state: ScreenshotEditorState | null = null;

/**
 * 判断当前页面是否处于截图编辑模式。
 *
 * @returns 仅用于同一 content script 内的运行时状态判断。
 */
export function isScreenshotEditorMode() {
  return (globalThis as unknown as Record<string, unknown>)[SCREENSHOT_EDITOR_MODE_KEY] === true;
}

/**
 * 判断截图编辑器是否已经真实显示并绑定本轮监听器。
 *
 * @param expectedSessionId - Service Worker 当前期望的会话 ID。
 * @returns 只有编辑器 DOM 可见、模式标记已开启、事件清理器已注册且 session 匹配时才返回 true。
 */
export function isScreenshotEditorOpenForAck(expectedSessionId?: string): boolean {
  if (!isScreenshotEditorMode()) return false;
  if (expectedSessionId && state?.payload.sessionId !== expectedSessionId) return false;
  return ui?.editor.style.display === 'block'
    && typeof state?.cleanup === 'function';
}

/**
 * 设置截图编辑模式标记。
 *
 * @param enabled - 是否开启截图编辑器。
 */
function setScreenshotEditorMode(enabled: boolean) {
  (globalThis as unknown as Record<string, unknown>)[SCREENSHOT_EDITOR_MODE_KEY] = enabled;
}

/** 通知后台截图编辑器会话已经关闭。 */
function notifyScreenshotSessionClosed(payload: ScreenshotEditorOpenPayload | undefined, reason: PageToolSessionCloseReason) {
  if (!payload?.sessionId) return;
  void sendExtensionMessage({
    type: 'page-tool/session/closed',
    payload: {
      sessionId: payload.sessionId,
      tool: 'screenshot-editor',
      reason,
      ...(payload.returnToPanel === true ? { returnToPanel: true } : {}),
      source: { url: location.href, title: document.title },
    },
  }).catch(() => {
    // 会话恢复失败只能由用户再次点击侧栏恢复；内容脚本不在页面上额外展示错误。
  });
}

/** 根据截图编辑器和 OCR 浮窗可见性刷新 Shadow host 的 pointer-events。 */
function syncPageToolsHostPointerEvents(refs: ScreenshotEditorUi): void {
  const editorVisible = refs.editor.style.display === 'block';
  const ocrVisible = isScreenshotOcrPopoverOpenForAck();
  refs.host.style.pointerEvents = editorVisible || ocrVisible ? 'auto' : 'none';
}

/**
 * 根据图片加载结果初始化截图编辑器。
 *
 * @param refs - UI 节点引用集合。
 * @param current - 当前截图编辑器状态。
 */
function markImageReady(refs: ScreenshotEditorUi, current: ScreenshotEditorState) {
  current.imageReady = true;
  current.imageWidth = Math.max(1, refs.sourceImage.naturalWidth || refs.sourceImage.width || window.innerWidth || 1);
  current.imageHeight = Math.max(1, refs.sourceImage.naturalHeight || refs.sourceImage.height || window.innerHeight || 1);
  resizeCanvases(refs, current);
  getCanvasContext(refs.annotationCanvas).clearRect(0, 0, refs.annotationCanvas.width, refs.annotationCanvas.height);
  getCanvasContext(refs.previewCanvas).clearRect(0, 0, refs.previewCanvas.width, refs.previewCanvas.height);
  renderSelection(refs, current);
  syncScreenshotToolbarActionState(refs, current);
}

/**
 * 打开截图编辑器。
 *
 * @param payload - SW 提供的可见视口截图。
 */
export function openScreenshotEditor(payload: ScreenshotEditorOpenPayload) {
  closeScreenshotEditor();
  closeScreenshotOcrPopover({ notifySession: false });

  const root = ensurePageToolsRoot();
  ui = { host: root.refs.host, shadow: root.refs.shadow, ...root.refs.screenshot };
  const refs = ui;
  refs.host.style.pointerEvents = 'auto';
  refs.editor.style.display = 'block';
  refs.sourceImage.src = payload.screenshot.dataUrl;

  const current: ScreenshotEditorState = {
    payload,
    imageReady: false,
    imageWidth: 1,
    imageHeight: 1,
    viewportWidth: Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1),
    viewportHeight: Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1),
    selection: null,
    activeTool: null,
    annotationStyle: { ...DEFAULT_SCREENSHOT_ANNOTATION_STYLE },
    activeDrag: null,
    textAnnotations: [],
    selectedTextAnnotationId: null,
    history: [],
    cleanup: null,
  };
  state = current;
  setScreenshotEditorMode(true);
  setActiveTool(refs, current, null);
  const runeManager = createScreenshotRuneManager(refs, current);
  /** 同步撤销按钮在文字草稿编辑态和撤销栈变化后的灰态。 */
  const syncToolbarActionState = () => {
    syncScreenshotToolbarActionState(refs, current, {
      textDraftOpen: refs.textInput.dataset.open === 'true',
    });
  };

  /**
   * 读取事件对应的视口坐标。
   */
  const eventPoint = (event: MouseEvent | PointerEvent): Point => ({ x: clamp(event.clientX, 0, current.viewportWidth), y: clamp(event.clientY, 0, current.viewportHeight) });

  /**
   * 阻断事件穿透到原网页。
   */
  const blockEvent = (event: Event) => {
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
  };
  const textDraft = createScreenshotTextDraftController(refs, runeManager, blockEvent, syncToolbarActionState);

  /** 图片完成加载后初始化画布与遮罩。 */
  const onImageLoad = () => markImageReady(refs, current);

  /** 处理选区创建、移动、缩放和标注工具的 pointer 起点。 */
  const onPointerDown = (event: PointerEvent) => {
    if (!current.imageReady) return;
    blockEvent(event);
    const point = eventPoint(event);
    if (textDraft.isOpen()) {
      void textDraft.commit();
      syncToolbarActionState();
      return;
    }

    const target = event.target as HTMLElement | null;
    if (beginTextRuneDrag(refs, current, runeManager, target, point)) return;
    runeManager.selectTextAnnotation(null);
    const handle = target?.dataset?.handle as ResizeHandle | undefined;
    if (handle && current.selection) {
      current.activeDrag = { mode: 'resize', start: point, origin: cloneRect(current.selection), handle };
      return;
    }
    if (target === refs.selection && current.selection && !current.activeTool) {
      current.activeDrag = { mode: 'move', start: point, origin: cloneRect(current.selection) };
      return;
    }
    if (current.selection && pointInSelection(point, current.selection)) {
      if (!current.activeTool) {
        current.activeDrag = { mode: 'move', start: point, origin: cloneRect(current.selection) };
        return;
      }
      if (current.activeTool === 'text') {
        runeManager.openTextInput(point);
        syncToolbarActionState();
        return;
      }
      runeManager.pushHistory();
      current.activeDrag = { mode: 'draw', start: point, origin: cloneRect(current.selection) };
      return;
    }
    current.activeDrag = { mode: 'select', start: point, origin: { x: point.x, y: point.y, width: 0, height: 0 } };
    current.selection = {
      x: point.x,
      y: point.y,
      width: SCREENSHOT_EDITOR_MIN_SELECTION_SIZE,
      height: SCREENSHOT_EDITOR_MIN_SELECTION_SIZE,
    };
    renderSelection(refs, current);
    syncToolbarActionState();
  };

  let pendingMovePoint: Point | null = null;
  let pointerMoveFrame = 0;

  /**
   * 根据当前拖拽模式刷新选区或标注预览。
   *
   * 说明：
   * - pointermove 只记录最后一个点并进入 rAF 队列；
   * - 真正的 Canvas 绘制和选区定位每帧最多执行一次，避免 React 或 DOM 高频抖动。
   */
  const applyPointerMove = (point: Point) => {
    if (!current.activeDrag) return;
    const drag = current.activeDrag;
    const delta = { x: point.x - drag.start.x, y: point.y - drag.start.y };

    if (drag.mode === 'select') {
      current.selection = clampSelection(normalizeRectFromPoints(drag.start, point), current.viewportWidth, current.viewportHeight);
      renderSelection(refs, current);
      return;
    }
    if (drag.mode === 'move') {
      current.selection = clampSelection({
        ...drag.origin,
        x: drag.origin.x + delta.x,
        y: drag.origin.y + delta.y,
      }, current.viewportWidth, current.viewportHeight);
      renderSelection(refs, current);
      return;
    }
    if (drag.mode === 'resize' && drag.handle) {
      current.selection = resizeSelection(drag.origin, drag.handle, delta, current.viewportWidth, current.viewportHeight);
      renderSelection(refs, current);
      return;
    }
    if (applyTextRuneDrag(runeManager, drag, delta)) return;
    if (drag.mode === 'draw' && current.activeTool === 'pen') {
      const ctx = getCanvasContext(refs.annotationCanvas);
      const prev = toImagePoint(drag.start, current);
      const next = toImagePoint(point, current);
      drag.start = point;
      ctx.save();
      ctx.strokeStyle = current.annotationStyle.sharedColor;
      ctx.lineWidth = Math.max(1, current.annotationStyle.penSize * current.imageWidth / Math.max(1, current.viewportWidth));
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (drag.mode === 'draw') runeManager.drawPreview(drag.start, point);
  };

  /**
   * 执行已经排队的 pointermove 绘制任务。
   *
   * 说明：该函数只在 rAF 或 pointerup 强制 flush 时运行，确保热路径每帧最多重绘一次。
   */
  const flushPointerMove = () => {
    pointerMoveFrame = 0;
    const point = pendingMovePoint;
    pendingMovePoint = null;
    if (point) applyPointerMove(point);
  };

  /**
   * 立即执行最后一个待处理 pointermove。
   *
   * 说明：pointerup 到达时必须先落下最后一帧，否则快速拖拽会丢失终点前的预览状态。
   */
  const flushPointerMoveNow = () => {
    if (pointerMoveFrame) {
      window.cancelAnimationFrame(pointerMoveFrame);
      pointerMoveFrame = 0;
    }
    flushPointerMove();
  };

  /** 记录 pointermove，等待 rAF 合帧后再绘制。 */
  const onPointerMove = (event: PointerEvent) => {
    if (!current.activeDrag) return;
    blockEvent(event);
    pendingMovePoint = eventPoint(event);
    if (!pointerMoveFrame) pointerMoveFrame = window.requestAnimationFrame(flushPointerMove);
  };

  /** 结束拖拽并把非画笔工具的预览提交到标注层。 */
  const onPointerUp = (event: PointerEvent) => {
    if (!current.activeDrag) return;
    blockEvent(event);
    flushPointerMoveNow();
    const point = eventPoint(event);
    const drag = current.activeDrag;
    current.activeDrag = null;

    finishTextRuneDrag(runeManager, drag);
    if (drag.mode === 'draw' && current.activeTool && current.activeTool !== 'pen' && current.activeTool !== 'text') {
      runeManager.clearPreview();
      runeManager.commitShape(drag.start, point);
    }
    renderSelection(refs, current);
    syncToolbarActionState();
  };

  /** 处理工具条按钮点击。 */
  const onToolbarClick = (event: MouseEvent) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-tool],button[data-action]');
    if (!button) return;
    blockEvent(event);
    const tool = button.dataset.tool as ScreenshotTool | undefined;
    if (tool) {
      if (!textDraft.commit()) return;
      setActiveTool(refs, current, tool);
      syncTextInputStyle(refs, current);
      syncToolbarActionState();
      return;
    }
    const action = button.dataset.action || '';
    if (action === 'undo' && textDraft.isOpen()) {
      void textDraft.commit();
      syncToolbarActionState();
      return;
    }
    if (button.dataset.disabled === 'true') return;
    void runScreenshotToolbarAction(refs, current, action, {
      commitTextDraft: textDraft.commit,
      isTextDraftOpen: textDraft.isOpen,
      syncActionState: syncToolbarActionState,
      closeEditor: closeScreenshotEditor,
    });
  };

  /** 处理工具条下方的颜色、尺寸和字号设置。 */
  const onToolOptionsClick = (event: MouseEvent) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      'button[data-style-color],button[data-style-size],button[data-mosaic-style-size],button[data-style-font-size]',
    );
    if (!button) return;
    blockEvent(event);
    if (!textDraft.commit()) return;
    applyToolOptionButton(refs, current, button);
    syncToolbarActionState();
  };

  /** 处理 PixPin 式滚轮尺寸调节，并阻止页面在截图标注时跟着滚动。 */
  const onEditorWheel = (event: WheelEvent) => {
    if (!isScreenshotEditorMode()) return;
    if (!current.activeTool) {
      blockEvent(event);
      return;
    }
    blockEvent(event);
    stepActiveToolSize(refs, current, event.deltaY < 0 ? 1 : -1);
  };

  /** 处理编辑器级键盘快捷键。 */
  const onKeyDown = (event: KeyboardEvent) => {
    const textEditorOpen = textDraft.isOpen();
    if (textDraft.isEvent(event) || (textEditorOpen && textDraft.isComposing(event))) {
      return;
    }
    if (event.key === 'Escape') {
      blockEvent(event);
      closeScreenshotEditor({ notifySession: true, reason: 'escape' });
      return;
    }
    if (event.key === 'Enter') {
      blockEvent(event);
      void runScreenshotToolbarAction(refs, current, 'confirm', { closeEditor: closeScreenshotEditor });
      return;
    }
    blockEvent(event);
  };

  /** 视口尺寸变化时重算画布和选区。 */
  const onResize = () => {
    if (!current.imageReady) return;
    resizeCanvases(refs, current);
    if (current.selection) current.selection = clampSelection(current.selection, current.viewportWidth, current.viewportHeight);
    renderSelection(refs, current);
    syncToolbarActionState();
  };

  /** 移除本次打开会话注册的所有页面事件监听。 */
  const cleanup = () => {
    if (pointerMoveFrame) {
      window.cancelAnimationFrame(pointerMoveFrame);
      pointerMoveFrame = 0;
    }
    pendingMovePoint = null;
    refs.sourceImage.removeEventListener('load', onImageLoad);
    refs.annotationCanvas.removeEventListener('pointerdown', onPointerDown, true);
    refs.textLayer.removeEventListener('pointerdown', onPointerDown, true);
    refs.selection.removeEventListener('pointerdown', onPointerDown, true);
    refs.editor.removeEventListener('wheel', onEditorWheel, true);
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('pointerup', onPointerUp, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', onResize, true);
    refs.toolbar.removeEventListener('click', onToolbarClick, true);
    refs.toolOptions.removeEventListener('click', onToolOptionsClick, true);
    refs.textInput.removeEventListener('keydown', textDraft.onKeyDown, true);
    refs.textInput.removeEventListener('compositionstart', textDraft.onCompositionStart, true);
    refs.textInput.removeEventListener('compositionend', textDraft.onCompositionEnd, true);
    refs.textInput.removeEventListener('beforeinput', textDraft.onInputEvent, true);
    refs.textInput.removeEventListener('input', textDraft.onInputEvent, true);
    refs.textInput.removeEventListener('pointerdown', textDraft.onPointerDown, true);
    refs.textInput.removeEventListener('blur', textDraft.onBlur, true);
  };

  current.cleanup = cleanup;
  refs.sourceImage.addEventListener('load', onImageLoad);
  refs.annotationCanvas.addEventListener('pointerdown', onPointerDown, true);
  refs.textLayer.addEventListener('pointerdown', onPointerDown, true);
  refs.selection.addEventListener('pointerdown', onPointerDown, true);
  refs.editor.addEventListener('wheel', onEditorWheel, { capture: true, passive: false });
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', onResize, true);
  refs.toolbar.addEventListener('click', onToolbarClick, true);
  refs.toolOptions.addEventListener('click', onToolOptionsClick, true);
  refs.textInput.addEventListener('keydown', textDraft.onKeyDown, true);
  refs.textInput.addEventListener('compositionstart', textDraft.onCompositionStart, true);
  refs.textInput.addEventListener('compositionend', textDraft.onCompositionEnd, true);
  refs.textInput.addEventListener('beforeinput', textDraft.onInputEvent, true);
  refs.textInput.addEventListener('input', textDraft.onInputEvent, true);
  refs.textInput.addEventListener('pointerdown', textDraft.onPointerDown, true);
  refs.textInput.addEventListener('blur', textDraft.onBlur, true);

  if (refs.sourceImage.complete) markImageReady(refs, current);
  try {
    (document.activeElement as HTMLElement | null)?.blur?.();
  } catch {
    // 无法 blur 时仍继续进入截图编辑器。
  }
}

/**
 * 关闭截图编辑器并清理页面事件监听。
 */
export function closeScreenshotEditor(options: { notifySession?: boolean; reason?: PageToolSessionCloseReason } = {}) {
  const current = state;
  const refs = ui;
  const payload = current?.payload;
  current?.cleanup?.();
  if (refs) {
    refs.host.style.pointerEvents = 'none';
    refs.editor.style.display = 'none';
    refs.sourceImage.removeAttribute('src');
    refs.toolOptions.style.display = 'none';
    refs.toolOptions.removeAttribute('data-active-tool');
    hideScreenshotActionFeedback(refs);
    clearScreenshotTextDraft(refs);
    if (current) clearTextAnnotations(refs, current);
    else refs.textLayer.replaceChildren();
    refs.sizeBadge.style.display = 'none';
    refs.sizeBadge.removeAttribute('data-variant');
    dismissPageTooltip(refs.shadow);
    getCanvasContext(refs.maskCanvas).clearRect(0, 0, refs.maskCanvas.width, refs.maskCanvas.height);
    getCanvasContext(refs.annotationCanvas).clearRect(0, 0, refs.annotationCanvas.width, refs.annotationCanvas.height);
    getCanvasContext(refs.previewCanvas).clearRect(0, 0, refs.previewCanvas.width, refs.previewCanvas.height);
  }
  state = null;
  setScreenshotEditorMode(false);
  if (refs) syncPageToolsHostPointerEvents(refs);
  if (options.notifySession) notifyScreenshotSessionClosed(payload, options.reason ?? 'close');
}
