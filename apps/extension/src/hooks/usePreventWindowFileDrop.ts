/**
 * 说明：`usePreventWindowFileDrop` Hook 模块。
 *
 * 职责：
 * - 承载 `usePreventWindowFileDrop` 相关的当前文件实现与模块边界；
 * - 对外暴露 `usePreventWindowFileDrop` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useEffect } from 'react';
import { hasFilesInDataTransfer } from '@/lib/dom/file-transfer';

/**
 * 在扩展页面拦截“文件拖到窗口上”的浏览器默认行为。
 *
 * 背景：
 * - 浏览器在页面上接收到文件 drop 时，默认行为往往是“尝试打开该文件”，
 *   这会导致扩展页面被替换/导航，体验非常差（尤其是在侧边栏/弹窗里）。
 *
 * 设计：
 * - 只在检测到 `DataTransfer` 里包含文件时 `preventDefault()`，
 *   避免影响普通文本拖拽（例如拖动选中文本、拖拽链接等）。
 */
export function usePreventWindowFileDrop(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    /**
     * 仅拦截包含文件的拖拽事件。
     *
     * 说明：
     * - `dragover` 必须阻止默认行为，浏览器才允许后续 `drop` 被接收；
     * - 非文件拖拽保持原生行为，避免破坏编辑器和文本选择交互。
     */
    const preventDefaultForFiles = (e: DragEvent) => {
      if (!hasFilesInDataTransfer(e.dataTransfer)) return;
      e.preventDefault();
    };

    window.addEventListener('dragover', preventDefaultForFiles);
    window.addEventListener('drop', preventDefaultForFiles);
    return () => {
      window.removeEventListener('dragover', preventDefaultForFiles);
      window.removeEventListener('drop', preventDefaultForFiles);
    };
  }, [enabled]);
}
