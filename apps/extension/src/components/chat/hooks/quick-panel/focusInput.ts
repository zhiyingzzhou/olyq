/**
 * 说明：`focusInput` quick panel 辅助模块。
 *
 * 职责：
 * - 统一 quick panel 关闭或插入后的 textarea 焦点恢复；
 * - 等待 Radix modal / popover 过渡期结束后再写入选区；
 * - 避免 controller 主文件继续膨胀焦点时序细节。
 */
import type { RefObject } from 'react';

/**
 * 在安全时机恢复输入框焦点，并可选移动光标。
 *
 * @param inputRef - 聊天输入框引用。
 * @param cursorPos - 可选光标位置。
 */
export function focusQuickPanelInputCursorSafely(
  inputRef: RefObject<HTMLTextAreaElement | null>,
  cursorPos?: number,
): void {
  focusQuickPanelInputRangeSafely(inputRef, cursorPos, cursorPos);
}

/**
 * 在安全时机恢复输入框焦点和选区。
 *
 * @param inputRef - 聊天输入框引用。
 * @param selectionStart - 选区起点。
 * @param selectionEnd - 选区终点。
 */
export function focusQuickPanelInputRangeSafely(
  inputRef: RefObject<HTMLTextAreaElement | null>,
  selectionStart?: number,
  selectionEnd?: number,
): void {
  let tries = 0;
  const maxTries = 8;

  /**
   * 执行单次焦点恢复尝试。
   *
   * @remarks
   * 当根节点仍处于 Radix `aria-hidden` 过渡态时，会延后一帧重试，避免焦点写回被浏览器拒绝。
   */
  const step = () => {
    tries += 1;
    try {
      const root = document.getElementById('root');
      if (root?.getAttribute('aria-hidden') === 'true' && tries < maxTries) {
        requestAnimationFrame(step);
        return;
      }

      const element = inputRef.current;
      if (!element) return;
      element.focus();
      if (typeof selectionStart !== 'number') return;
      const start = Math.max(0, Math.min(selectionStart, element.value.length));
      const end = typeof selectionEnd === 'number'
        ? Math.max(start, Math.min(selectionEnd, element.value.length))
        : start;
      element.setSelectionRange(start, end);
    } catch {
      // 忽略弹层关闭过程中的短暂 DOM / selection 不可用状态。
    }
  };

  requestAnimationFrame(step);
}
