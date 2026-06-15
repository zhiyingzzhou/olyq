/**
 * 说明：`screenshot-editor-feedback` 截图工具条轻量反馈模块。
 *
 * 职责：
 * - 管理复制成功这类非阻塞 `role=status` 反馈；
 * - 避免截图编辑器主控制器继续膨胀；
 * - 保持反馈定位跟随截图工具条，而不是散落 DOM 直写。
 */
import { clamp } from './geometry';
import type { ScreenshotEditorUi } from './types';

let toolFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 隐藏复制等轻量工具动作反馈。
 *
 * @param refs - UI 节点引用集合。
 */
export function hideScreenshotActionFeedback(refs: ScreenshotEditorUi): void {
  if (toolFeedbackTimer) {
    clearTimeout(toolFeedbackTimer);
    toolFeedbackTimer = null;
  }
  refs.toolFeedback.style.display = 'none';
  refs.toolFeedback.textContent = '';
  refs.toolFeedback.removeAttribute('data-variant');
}

/**
 * 显示截图工具条的短暂成功反馈。
 *
 * @param refs - UI 节点引用集合。
 * @param message - 当前语言下的反馈文本。
 */
export function showScreenshotActionFeedback(refs: ScreenshotEditorUi, message: string): void {
  hideScreenshotActionFeedback(refs);
  const toolbarRect = refs.toolbar.getBoundingClientRect();
  refs.toolFeedback.dataset.variant = 'success';
  refs.toolFeedback.textContent = message;
  refs.toolFeedback.style.left = `${clamp(toolbarRect.left || 12, 12, Math.max(12, window.innerWidth - 220))}px`;
  refs.toolFeedback.style.top = `${clamp((toolbarRect.bottom || 12) + 8, 12, Math.max(12, window.innerHeight - 44))}px`;
  refs.toolFeedback.style.display = 'block';
  toolFeedbackTimer = setTimeout(() => {
    hideScreenshotActionFeedback(refs);
  }, 2_000);
}
