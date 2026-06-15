/**
 * 说明：`screenshot-editor-toolbar-actions` 截图工具条动作模块。
 *
 * 职责：
 * - 执行撤销、复制、下载、发送到对话、OCR 与确认这类低频工具条动作；
 * - 让 controller 只保留 pointer / keyboard 热路径编排；
 * - 在文字草稿编辑态阻止撤销抢占外部点击提交语义。
 *
 * 边界：
 * - 本模块不注册 DOM 事件、不创建截图编辑器节点、不持久化状态；
 * - Side Panel 恢复、OCR 后台识别和附件交付仍走既有截图 action contract。
 */
import i18n from '@/i18n';
import type { PageToolSessionCloseReason } from '@/types/sw-messages';
import {
  formatScreenshotActionError,
  readScreenshotActionOcrRequestId,
  sendScreenshotAction,
} from './action-response';
import {
  createScreenshotActionPayload,
  normalizeSubmitToolbarAction,
} from './action-payload';
import {
  copyPngToClipboard,
  createScreenshotRuneManager,
  downloadPng,
} from './drawing';
import {
  showScreenshotActionFeedback,
} from './feedback';
import {
  createScreenshotOcrRequestId,
  showScreenshotOcrPopover,
  updateScreenshotOcrPopover,
} from './ocr-popover';
import type { ScreenshotEditorState, ScreenshotEditorUi } from './types';

/** 工具条动作执行时由 controller 注入的页面状态与回调。 */
export type ScreenshotToolbarActionOptions = {
  /** 提交当前文字草稿；返回 false 表示 IME 等输入态暂不可提交。 */
  commitTextDraft?: () => boolean;
  /** 当前文字草稿是否仍处于编辑态。 */
  isTextDraftOpen?: () => boolean;
  /** 工具条动作状态变更后的同步回调。 */
  syncActionState?: () => void;
  /** 关闭截图编辑器的 controller owner。 */
  closeEditor: (options?: { notifySession?: boolean; reason?: PageToolSessionCloseReason }) => void;
};

/**
 * 在截图编辑器内展示本地动作失败。
 *
 * 说明：
 * - 复制 / 下载仍停留在编辑器内，因此可以就地显示错误；
 * - 发送到对话 / OCR 会在发起后台动作前同步退出全屏编辑器，避免 Side Panel
 *   打开挤压页面时截图遮罩发生偏移，这两类失败由 Side Panel toast 或后台响应承接。
 */
function showScreenshotActionError(refs: ScreenshotEditorUi, message: string): void {
  refs.sizeBadge.dataset.variant = 'error';
  refs.sizeBadge.textContent = message || i18n.t('errors.pageToolSidePanelUnavailable');
  refs.sizeBadge.style.display = 'block';
  refs.sizeBadge.style.left = '12px';
  refs.sizeBadge.style.top = '12px';
}

/**
 * 根据当前选区导出并执行工具条动作。
 *
 * @param refs - UI 节点引用集合。
 * @param current - 当前截图编辑器状态。
 * @param action - 工具条动作名。
 * @param options - controller 注入的草稿、关闭与状态同步回调。
 */
export async function runScreenshotToolbarAction(
  refs: ScreenshotEditorUi,
  current: ScreenshotEditorState,
  action: string,
  options: ScreenshotToolbarActionOptions,
): Promise<void> {
  if (action === 'close') {
    options.closeEditor({ notifySession: true, reason: 'close' });
    return;
  }
  const runeManager = createScreenshotRuneManager(refs, current);
  if (action === 'undo') {
    if (options.isTextDraftOpen?.() || current.history.length === 0) {
      options.syncActionState?.();
      return;
    }
    await runeManager.undo();
    options.syncActionState?.();
    return;
  }
  if (!current.selection) return;

  const textCommitted = options.commitTextDraft?.() ?? runeManager.commitText();
  if (!textCommitted) return;
  if (action === 'copy') {
    try {
      const dataUrl = runeManager.exportSelectionToDataUrl();
      await copyPngToClipboard(dataUrl);
      showScreenshotActionFeedback(refs, i18n.t('screenshotEditor.feedback.copied'));
    } catch (error) {
      showScreenshotActionError(refs, formatScreenshotActionError(error));
    }
    return;
  }
  if (action === 'download') {
    try {
      const dataUrl = runeManager.exportSelectionToDataUrl();
      downloadPng(dataUrl, `screenshot-${Date.now()}.png`);
    } catch (error) {
      showScreenshotActionError(refs, formatScreenshotActionError(error));
    }
    return;
  }

  const submitAction = normalizeSubmitToolbarAction(action);
  if (!submitAction) return;

  let payload;
  try {
    payload = createScreenshotActionPayload({
      current,
      runeManager,
      submitAction,
      source: { url: location.href, title: document.title },
    });
  } catch (error) {
    showScreenshotActionError(refs, formatScreenshotActionError(error));
    return;
  }

  try {
    options.closeEditor({ notifySession: false });
    if (submitAction === 'ocr') {
      const requestId = createScreenshotOcrRequestId();
      payload.ocrRequestId = requestId;
      showScreenshotOcrPopover({
        requestId,
        rect: payload.rect,
        sessionId: payload.sessionId,
        returnToPanel: payload.returnToPanel,
      });
      void sendScreenshotAction(payload)
        .then((response) => {
          const responseRequestId = typeof response.ocrRequestId === 'string' && response.ocrRequestId.trim()
            ? response.ocrRequestId.trim()
            : requestId;
          updateScreenshotOcrPopover(responseRequestId, {
            text: typeof response.text === 'string' ? response.text : '',
          });
        })
        .catch((error) => {
          const responseRequestId = readScreenshotActionOcrRequestId(error) ?? requestId;
          updateScreenshotOcrPopover(responseRequestId, {
            error: formatScreenshotActionError(error),
          });
        });
      return;
    }
    await sendScreenshotAction(payload);
  } catch (error) {
    // 编辑器已经按页面工具提交时序退出；这里不能恢复全屏 overlay，否则会再次和
    // Side Panel 产生双浮层。后台 / Side Panel 会负责展示结构化错误。
    void error;
  }
}
