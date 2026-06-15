/**
 * 说明：`page-tool-session-cancel` 内容脚本模块。
 *
 * 职责：
 * - 承接 Service Worker 发来的页面工具会话取消命令；
 * - 只关闭当前页面上匹配的截图编辑器或元素选择器 overlay；
 * - 保证“被替换/被手动 sidepanel 打断”的旧会话不会反向恢复 sidepanel。
 *
 * 边界：
 * - 本模块只做 content script 内部清理，不投递 UI 事件、不创建新会话；
 * - 会话 owner、generation 与 sidepanel 恢复仍由 Service Worker 统一管理。
 */
import {
  closeElementPicker,
  isElementPickerMode,
  isElementPickerOpenForAck,
} from './element-picker';
import {
  closeScreenshotEditor,
  isScreenshotEditorMode,
  isScreenshotEditorOpenForAck,
} from '@/plugins/page-tools/screenshot-capture/content/controller';

type PageToolSessionCancelPayload = {
  sessionId?: unknown;
  tool?: unknown;
};

/** 标准化后台取消页面工具会话时传入的弱类型 payload。 */
function readCancelPayload(payload: unknown): {
  sessionId?: string;
  tool?: 'element-picker' | 'screenshot-editor';
} {
  const record = payload && typeof payload === 'object'
    ? payload as PageToolSessionCancelPayload
    : {};
  const sessionId = typeof record.sessionId === 'string' && record.sessionId.trim()
    ? record.sessionId.trim()
    : undefined;
  const tool = record.tool === 'element-picker' || record.tool === 'screenshot-editor'
    ? record.tool
    : undefined;
  return { sessionId, tool };
}

/**
 * 按 Service Worker 指定的页面工具会话关闭当前 overlay。
 *
 * 关闭时必须禁止发送 `page-tool/session/closed`，否则被替换的旧会话会重新
 * 触发 sidepanel 恢复，破坏单 owner 互斥。
 *
 * OCR 结果浮窗是截图 editor 已提交后的 detached result surface：它不再是
 * 需要和 Side Panel 互斥的全屏页面工具 overlay，普通 owner replacement
 * 不能关闭它，否则 sidepanel 恢复时会把刚显示的识别结果闪退。
 */
export function cancelPageToolSessionFromBackground(payload: unknown): void {
  const { sessionId, tool } = readCancelPayload(payload);

  if (!tool || tool === 'element-picker') {
    const shouldCloseElementPicker = sessionId
      ? isElementPickerOpenForAck(sessionId)
      : isElementPickerMode();
    if (shouldCloseElementPicker) closeElementPicker({ notifySession: false, reason: 'replace' });
  }

  if (!tool || tool === 'screenshot-editor') {
    const shouldCloseScreenshotEditor = sessionId
      ? isScreenshotEditorOpenForAck(sessionId)
      : isScreenshotEditorMode();
    if (shouldCloseScreenshotEditor) closeScreenshotEditor({ notifySession: false, reason: 'replace' });
  }
}
