/**
 * 说明：`screenshot-action-payload` 截图工具提交负载构造模块。
 *
 * 职责：
 * - 把工具条动作映射为跨运行时截图 action；
 * - 为聊天提交保留 PNG，为 OCR 使用专用图片出口；
 * - 让 controller 只保留事件编排，不继续膨胀导出细节。
 *
 * 边界：
 * - 本模块不发送 runtime 消息、不关闭截图编辑器、不创建浮窗；
 * - OCR 图片压缩和大小预算仍由 rune manager / drawing 模块负责。
 */
import type {
  ScreenshotEditorAction,
  ScreenshotEditorActionPayload,
} from '@/plugins/page-tools/screenshot-capture/contracts';
import { cloneRect } from './geometry';
import type { ScreenshotRuneManager } from './drawing';
import type { ScreenshotEditorState } from './types';

/** 将工具条 action 归一为后台截图 action；无提交语义时返回 `null`。 */
export function normalizeSubmitToolbarAction(action: string): ScreenshotEditorAction | null {
  return action === 'ocr'
    ? 'ocr'
    : action === 'chat' || action === 'confirm'
      ? 'chat'
      : null;
}

/**
 * 构造截图提交负载。
 *
 * @param params - 当前会话状态、rune manager、提交动作和来源页面信息。
 * @returns 可直接发送给 Service Worker 的截图 action payload。
 */
export function createScreenshotActionPayload(params: {
  current: ScreenshotEditorState;
  runeManager: ScreenshotRuneManager;
  submitAction: ScreenshotEditorAction;
  source: { url: string; title: string };
}): ScreenshotEditorActionPayload {
  const name = `screenshot-${Date.now()}.png`;
  const image = params.submitAction === 'ocr'
    ? params.runeManager.exportSelectionForOcr(name)
    : {
      dataUrl: params.runeManager.exportSelectionToDataUrl(),
      mime: 'image/png' as const,
      name,
    };

  return {
    action: params.submitAction,
    image,
    source: params.source,
    ...(params.current.selection ? { rect: cloneRect(params.current.selection) } : {}),
    ...(params.current.payload.sessionId ? { sessionId: params.current.payload.sessionId } : {}),
    ...(params.current.payload.returnToPanel === true ? { returnToPanel: true } : {}),
  };
}
