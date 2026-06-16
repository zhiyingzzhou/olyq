/**
 * 说明：`screenshot-editor-ocr-popover` 内容脚本 OCR 结果浮窗控制器。
 *
 * 职责：
 * - 在网页侧展示截图 OCR 的 loading / 文本 / 空态 / 错误态；
 * - 展示 320px 结果浮窗、选区旁定位、标题栏拖拽与复制反馈；
 * - OCR 浮窗关闭时通知 Service Worker 恢复 Side Panel。
 *
 * 边界：
 * - 本模块不导出截图、不调用模型、不持久化 OCR 文本；
 * - 真实 OCR 只由 Service Worker provider runtime 完成；
 * - 浮窗是页面侧临时 UI，关闭即丢弃结果。
 */
import i18n from '@/i18n';
import type { ScreenshotEditorActionPayload } from '@/plugins/page-tools/screenshot-capture/contracts';
import type { PageToolSessionCloseReason } from '@/types/sw-messages';
import { ensurePageToolsRoot } from '@/extension/content-script/page-tools/page-tools-root';
import { clamp } from './geometry';
import type { ScreenshotEditorUi } from './types';
import { sendExtensionMessage } from '@/lib/extension/runtime-api';
import { createSecureId } from '@/lib/utils/secure-id';

type ScreenshotOcrPopoverState = {
  requestId: string;
  sessionId?: string;
  returnToPanel?: boolean;
  anchorRect?: ScreenshotEditorActionPayload['rect'];
  text: string;
  cleanup: () => void;
  copyTimer: ReturnType<typeof setTimeout> | null;
  manuallyMoved: boolean;
};

let ocrPopoverState: ScreenshotOcrPopoverState | null = null;

/**
 * 创建截图 OCR 请求 ID。
 *
 * 说明：requestId 是 content script、Service Worker 和 OCR 浮窗之间的唯一关联键；
 * 它不是持久化 ID，只用于同一轮用户提交里的旧回包隔离。
 */
export function createScreenshotOcrRequestId(): string {
  return `screenshot-ocr-${createSecureId()}`;
}

/** 根据截图编辑器和 OCR 浮窗可见性刷新 Shadow host 的 pointer-events。 */
function syncPageToolsHostPointerEvents(refs: ScreenshotEditorUi): void {
  const editorVisible = refs.editor.style.display === 'block';
  const ocrVisible = refs.ocrPopover.style.display === 'flex';
  refs.host.style.pointerEvents = editorVisible || ocrVisible ? 'auto' : 'none';
}

/** 通知后台截图 OCR 浮窗所属页面工具会话已经关闭。 */
function notifyScreenshotOcrSessionClosed(
  state: ScreenshotOcrPopoverState,
  reason: PageToolSessionCloseReason,
): void {
  if (!state.sessionId) return;
  void sendExtensionMessage({
    type: 'page-tool/session/closed',
    payload: {
      sessionId: state.sessionId,
      tool: 'screenshot-editor',
      reason,
      ...(state.returnToPanel === true ? { returnToPanel: true } : {}),
      source: { url: location.href, title: document.title },
    },
  }).catch(() => {
    // 浮窗关闭后的恢复失败只能由用户再次点击侧栏恢复；页面侧不额外造第二个错误层。
  });
}

/**
 * 判断 OCR 浮窗是否仍绑定指定会话。
 *
 * @param expectedSessionId - 可选会话 ID。
 */
export function isScreenshotOcrPopoverOpenForAck(expectedSessionId?: string): boolean {
  const root = ensurePageToolsRoot();
  const refs: ScreenshotEditorUi = { host: root.refs.host, shadow: root.refs.shadow, ...root.refs.screenshot };
  if (!ocrPopoverState) return false;
  if (refs.ocrPopover.style.display !== 'flex') return false;
  if (expectedSessionId && ocrPopoverState.sessionId !== expectedSessionId) return false;
  return true;
}

/**
 * 判断 OCR 浮窗是否已经为指定请求显示。
 *
 * @param requestId - 当前 OCR 请求 ID。
 */
export function isScreenshotOcrPopoverOpenForRequest(requestId: string): boolean {
  const root = ensurePageToolsRoot();
  const refs: ScreenshotEditorUi = { host: root.refs.host, shadow: root.refs.shadow, ...root.refs.screenshot };
  return Boolean(
    requestId
    && ocrPopoverState?.requestId === requestId
    && refs.ocrPopover.style.display === 'flex',
  );
}

/** 计算 OCR 浮窗在选区旁边的初始位置。 */
function getOcrPopoverPosition(rect: ScreenshotEditorActionPayload['rect'] | undefined): {
  left: number;
  top: number;
  maxHeight: number;
} {
  const gap = 10;
  const width = 320;
  const viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
  const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
  const selection = rect ?? {
    x: Math.max(16, viewportWidth - width - gap),
    y: 80,
    width: 1,
    height: 1,
  };
  const leftSpace = selection.x;
  const rightSpace = viewportWidth - selection.x - selection.width;
  const preferredLeft = rightSpace > width + gap
    ? selection.x + selection.width + gap
    : leftSpace > width + gap
      ? selection.x - width - gap
      : leftSpace > rightSpace
        ? selection.x - width - gap
        : selection.x + selection.width + gap;
  const left = clamp(preferredLeft, gap, Math.max(gap, viewportWidth - width - gap));
  const top = clamp(selection.y, gap, Math.max(gap, viewportHeight - 150));
  return {
    left,
    top,
    maxHeight: Math.max(150, viewportHeight - top - gap),
  };
}

/** 将 OCR 浮窗定位到选区旁。 */
function positionOcrPopoverFromAnchor(refs: ScreenshotEditorUi, state: ScreenshotOcrPopoverState): void {
  const position = getOcrPopoverPosition(state.anchorRect);
  refs.ocrPopover.style.left = `${position.left}px`;
  refs.ocrPopover.style.top = `${position.top}px`;
  refs.ocrPopover.style.maxHeight = `${position.maxHeight}px`;
}

/** 用户手动拖过 OCR 浮窗后，只把浮窗夹回当前视口，避免覆盖用户选择的位置。 */
function clampOcrPopoverToViewport(refs: ScreenshotEditorUi): void {
  const rect = refs.ocrPopover.getBoundingClientRect();
  const left = clamp(rect.left, 8, Math.max(8, window.innerWidth - Math.min(320, rect.width || 320) - 8));
  const top = clamp(rect.top, 8, Math.max(8, window.innerHeight - 80));
  refs.ocrPopover.style.left = `${left}px`;
  refs.ocrPopover.style.top = `${top}px`;
  refs.ocrPopover.style.maxHeight = `${Math.max(120, window.innerHeight - top - 8)}px`;
}

/** 重置 OCR 浮窗复制按钮。 */
function resetOcrCopyButton(refs: ScreenshotEditorUi, disabled: boolean): void {
  refs.ocrCopyButton.textContent = i18n.t('screenshotEditor.ocr.copy');
  refs.ocrCopyButton.dataset.olyqTooltip = i18n.t('screenshotEditor.ocr.copy');
  refs.ocrCopyButton.setAttribute('aria-label', i18n.t('screenshotEditor.ocr.copy'));
  refs.ocrCopyButton.disabled = disabled;
  delete refs.ocrCopyButton.dataset.copied;
}

/**
 * 更新 OCR 浮窗正文状态。
 *
 * @param requestId - 当前后台 OCR 请求 ID。
 * @param result - 成功文本或错误。
 */
export function updateScreenshotOcrPopover(
  requestId: string,
  result: { text?: string; error?: string },
): void {
  const root = ensurePageToolsRoot();
  const refs: ScreenshotEditorUi = { host: root.refs.host, shadow: root.refs.shadow, ...root.refs.screenshot };
  const current = ocrPopoverState;
  if (!current || current.requestId !== requestId) return;
  const text = String(result.text ?? '').replace(/\r\n?/g, '\n').trim();
  const error = String(result.error ?? '').trim();
  current.text = error ? '' : text;
  refs.ocrPopover.dataset.state = error ? 'error' : text ? 'result' : 'empty';
  refs.ocrContent.dataset.variant = error ? 'error' : text ? 'result' : 'empty';
  refs.ocrContent.textContent = error || text || i18n.t('screenshotEditor.ocr.empty');
  resetOcrCopyButton(refs, Boolean(error || !text));
}

/**
 * 打开 OCR 结果浮窗并显示 loading。
 *
 * @param params - 本次 OCR 请求元数据。
 * @returns 当前 OCR 请求 ID，用于异步回包防串扰。
 */
export function showScreenshotOcrPopover(params: {
  requestId?: string;
  rect?: ScreenshotEditorActionPayload['rect'];
  sessionId?: string;
  returnToPanel?: boolean;
}): string {
  const root = ensurePageToolsRoot();
  const refs: ScreenshotEditorUi = { host: root.refs.host, shadow: root.refs.shadow, ...root.refs.screenshot };
  const currentState = ocrPopoverState;
  if (currentState && currentState.requestId === params.requestId && refs.ocrPopover.style.display === 'flex') {
    if (!currentState.manuallyMoved) positionOcrPopoverFromAnchor(refs, currentState);
    return currentState.requestId;
  }
  if (ocrPopoverState) closeScreenshotOcrPopover({ notifySession: false });

  const requestId = typeof params.requestId === 'string' && params.requestId.trim()
    ? params.requestId.trim()
    : createScreenshotOcrRequestId();
  const popoverState: ScreenshotOcrPopoverState = {
    requestId,
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    ...(params.returnToPanel === true ? { returnToPanel: true } : {}),
    ...(params.rect ? { anchorRect: { ...params.rect } } : {}),
    text: '',
    copyTimer: null,
    manuallyMoved: false,
    cleanup: () => {},
  };
  ocrPopoverState = popoverState;
  positionOcrPopoverFromAnchor(refs, popoverState);
  refs.ocrPopover.style.display = 'flex';
  refs.ocrPopover.dataset.open = 'true';
  refs.ocrPopover.dataset.state = 'loading';
  refs.ocrContent.textContent = '';
  refs.ocrContent.removeAttribute('data-variant');
  resetOcrCopyButton(refs, true);
  refs.host.style.pointerEvents = 'auto';

  let dragging: { startX: number; startY: number; left: number; top: number } | null = null;
  /** 拦截 OCR 浮窗交互事件，避免点击穿透到宿主页面或截图编辑器。 */
  const stopEvent = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };
  /** 正文区域允许浏览器原生文本选择，只阻止事件继续冒泡到宿主页面。 */
  const stopBodyEventPropagation = (event: Event) => {
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };
  /** 拖拽标题栏时更新 OCR 浮窗位置，并重新计算可用高度。 */
  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    stopEvent(event);
    const nextLeft = clamp(dragging.left + event.clientX - dragging.startX, 8, Math.max(8, window.innerWidth - 328));
    const nextTop = clamp(dragging.top + event.clientY - dragging.startY, 8, Math.max(8, window.innerHeight - 80));
    refs.ocrPopover.style.left = `${nextLeft}px`;
    refs.ocrPopover.style.top = `${nextTop}px`;
    refs.ocrPopover.style.maxHeight = `${Math.max(120, window.innerHeight - nextTop - 8)}px`;
  };
  /** 结束标题栏拖拽并释放全局 pointer 监听。 */
  const onPointerUp = (event: PointerEvent) => {
    if (!dragging) return;
    stopEvent(event);
    dragging = null;
    delete refs.ocrHeader.dataset.dragging;
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('pointerup', onPointerUp, true);
  };
  /** 从标题栏开始拖拽 OCR 浮窗；按钮点击不进入拖拽态。 */
  const onHeaderPointerDown = (event: PointerEvent) => {
    if ((event.target as HTMLElement | null)?.closest('button')) return;
    stopEvent(event);
    const rect = refs.ocrPopover.getBoundingClientRect();
    popoverState.manuallyMoved = true;
    refs.ocrHeader.dataset.dragging = 'true';
    dragging = { startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top };
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerUp, true);
  };
  /** 视口尺寸变化后，未手动拖拽时继续贴近原选区。 */
  const onResize = () => {
    if (popoverState.manuallyMoved) {
      clampOcrPopoverToViewport(refs);
      return;
    }
    positionOcrPopoverFromAnchor(refs, popoverState);
  };
  /** 分发 OCR 浮窗内的关闭与复制按钮动作。 */
  const onPopoverClick = (event: MouseEvent) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-ocr-action]');
    if (!button) return;
    stopEvent(event);
    if (button.dataset.ocrAction === 'close') {
      closeScreenshotOcrPopover({ notifySession: true, reason: 'close' });
      return;
    }
    if (button.dataset.ocrAction === 'copy') {
      void copyScreenshotOcrText();
    }
  };
  /** Esc 关闭 OCR 浮窗，并把恢复 Side Panel 交给页面工具会话插件。 */
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    stopEvent(event);
    closeScreenshotOcrPopover({ notifySession: true, reason: 'escape' });
  };

  refs.ocrHeader.addEventListener('pointerdown', onHeaderPointerDown, true);
  refs.ocrBody.addEventListener('pointerdown', stopBodyEventPropagation, true);
  refs.ocrBody.addEventListener('mousedown', stopBodyEventPropagation, true);
  refs.ocrBody.addEventListener('mouseup', stopBodyEventPropagation, true);
  refs.ocrBody.addEventListener('click', stopBodyEventPropagation, true);
  refs.ocrPopover.addEventListener('click', onPopoverClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', onResize, true);

  popoverState.cleanup = () => {
    refs.ocrHeader.removeEventListener('pointerdown', onHeaderPointerDown, true);
    refs.ocrBody.removeEventListener('pointerdown', stopBodyEventPropagation, true);
    refs.ocrBody.removeEventListener('mousedown', stopBodyEventPropagation, true);
    refs.ocrBody.removeEventListener('mouseup', stopBodyEventPropagation, true);
    refs.ocrBody.removeEventListener('click', stopBodyEventPropagation, true);
    refs.ocrPopover.removeEventListener('click', onPopoverClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', onResize, true);
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('pointerup', onPointerUp, true);
    delete refs.ocrHeader.dataset.dragging;
  };
  return requestId;
}

/** 复制 OCR 识别文本并给按钮 2.5 秒成功反馈。 */
async function copyScreenshotOcrText(): Promise<void> {
  const root = ensurePageToolsRoot();
  const refs: ScreenshotEditorUi = { host: root.refs.host, shadow: root.refs.shadow, ...root.refs.screenshot };
  const current = ocrPopoverState;
  if (!current?.text || refs.ocrCopyButton.disabled) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error(i18n.t('screenshotEditor.ocr.copyFailed'));
    await navigator.clipboard.writeText(current.text);
    if (current.copyTimer) clearTimeout(current.copyTimer);
    refs.ocrCopyButton.textContent = i18n.t('screenshotEditor.ocr.copied');
    refs.ocrCopyButton.dataset.olyqTooltip = i18n.t('screenshotEditor.ocr.copied');
    refs.ocrCopyButton.setAttribute('aria-label', i18n.t('screenshotEditor.ocr.copied'));
    refs.ocrCopyButton.dataset.copied = 'true';
    current.copyTimer = setTimeout(() => resetOcrCopyButton(refs, false), 2_500);
  } catch {
    refs.ocrCopyButton.textContent = i18n.t('screenshotEditor.ocr.copyFailed');
    refs.ocrCopyButton.dataset.olyqTooltip = i18n.t('screenshotEditor.ocr.copyFailed');
    refs.ocrCopyButton.setAttribute('aria-label', i18n.t('screenshotEditor.ocr.copyFailed'));
    current.copyTimer = setTimeout(() => resetOcrCopyButton(refs, false), 2_500);
  }
}

/**
 * 关闭 OCR 浮窗。
 *
 * @param options - 是否通知后台恢复 Side Panel。
 */
export function closeScreenshotOcrPopover(options: { notifySession?: boolean; reason?: PageToolSessionCloseReason } = {}): void {
  const root = ensurePageToolsRoot();
  const refs: ScreenshotEditorUi = { host: root.refs.host, shadow: root.refs.shadow, ...root.refs.screenshot };
  const current = ocrPopoverState;
  if (!current) return;
  current.cleanup();
  if (current.copyTimer) clearTimeout(current.copyTimer);
  refs.ocrPopover.style.display = 'none';
  delete refs.ocrPopover.dataset.open;
  refs.ocrPopover.dataset.state = 'loading';
  refs.ocrContent.textContent = '';
  refs.ocrContent.removeAttribute('data-variant');
  resetOcrCopyButton(refs, true);
  ocrPopoverState = null;
  syncPageToolsHostPointerEvents(refs);
  if (options.notifySession) {
    notifyScreenshotOcrSessionClosed(current, options.reason ?? 'close');
  }
}
