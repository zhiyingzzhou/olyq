/**
 * 说明：`screenshot-editor-entry` 截图编辑器消息入口模块。
 *
 * 职责：
 * - 在 content script 收到 SW 打开截图编辑器消息时完成 i18n ready 校验；
 * - 规整一次性打开负载，再交给截图编辑器运行时创建 Shadow DOM。
 *
 * 边界：
 * - 本模块不绑定 runtime listener，不处理页面工具互斥，也不向后台发送动作。
 */
import { ensureI18nReady } from '@/i18n';
import { I18nError } from '@/lib/i18n/error';
import { openScreenshotEditor } from './controller';

/**
 * 按需打开截图编辑器。
 *
 * @param payload - Service Worker 投递的原始截图编辑器打开负载。
 */
export async function openScreenshotEditorOnDemand(payload: unknown) {
  await ensureI18nReady();
  const screenshot = (payload as { screenshot?: unknown } | undefined)?.screenshot;
  if (!screenshot || typeof (screenshot as { dataUrl?: unknown }).dataUrl !== 'string') {
    throw new I18nError('errors.screenshotEditorActionInvalid');
  }
  openScreenshotEditor({
    screenshot: {
      dataUrl: String((screenshot as { dataUrl: string }).dataUrl),
      mime: 'image/png',
      name: typeof (screenshot as { name?: unknown }).name === 'string'
        ? String((screenshot as { name: string }).name)
        : `screenshot-${Date.now()}.png`,
    },
    ...(typeof (payload as { sessionId?: unknown } | undefined)?.sessionId === 'string'
      ? { sessionId: String((payload as { sessionId: string }).sessionId) }
      : {}),
    ...((payload as { returnToPanel?: unknown } | undefined)?.returnToPanel === true
      ? { returnToPanel: true }
      : {}),
  });
}
