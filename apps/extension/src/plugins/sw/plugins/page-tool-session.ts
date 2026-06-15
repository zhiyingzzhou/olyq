/**
 * 说明：`page-tool-session` Service Worker 插件模块。
 *
 * 职责：
 * - 接收 content script 在元素选择器 / 截图编辑器取消或关闭时发出的会话结束通知；
 * - 按后台会话表决定是否重新打开 sidepanel；
 * - 让“关闭工具后回到侧栏”不依赖某个内容脚本 controller 的局部状态。
 *
 * 边界：
 * - 本插件不创建会话，不投递元素或截图内容；
 * - 成功关闭会话只返回 `{ ok: true }`，重复关闭也保持幂等。
 */
import { claimPageToolSessionRestoreTarget } from '@/extension/background/page-tool-session';
import { toI18nTextFromError } from '@/lib/i18n/error';
import { i18nText } from '@/lib/i18n/text';
import { isPlainRecord } from '@/lib/utils/type-guards';
import type { SwPlugin } from '../host';

/** 页面工具会话关闭插件。 */
export const pageToolSessionSwPlugin: SwPlugin = {
  id: 'page-tool-session',
  onMessageTypes: ['page-tool/session/closed'],
  /**
   * 处理 content script 的页面工具关闭通知。
   *
   * @param params - Service Worker 插件宿主传入的消息、sender、响应函数和运行时门面。
   * @returns 异步响应标记。
   */
  onMessage({ msg, sender, sendResponse, runtime }) {
    if (msg.type !== 'page-tool/session/closed') return;

    void (async () => {
      const payload = isPlainRecord(msg.payload) ? msg.payload : {};
      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : undefined;
      const tool = payload.tool === 'element-picker' || payload.tool === 'screenshot-editor'
        ? payload.tool
        : null;
      const restoreTarget = claimPageToolSessionRestoreTarget({
        sessionId,
        fallbackTabId: sender.tab?.id,
        returnToPanel: payload.returnToPanel === true,
      });
      const ownerClaim = runtime.claimPageToolSidePanelOwner({
        sessionId,
        tool,
        fallbackTabId: restoreTarget.targetTabId ?? sender.tab?.id,
        returnToPanel: restoreTarget.returnToPanel,
      });
      if (!ownerClaim.ok) return { ok: false, error: ownerClaim.error };
      if (ownerClaim.returnToPanel) {
        try {
          await runtime.openPanelForTabFromUserGesture(ownerClaim.owner.tabId, ownerClaim.owner.generation);
        } catch {
          return { ok: false, error: i18nText('errors.pageToolSidePanelUnavailable') };
        }
      }
      runtime.cancelPageToolSidePanelOwner(ownerClaim.owner.generation);
      return { ok: true };
    })()
      .then((res) => sendResponse(res))
      .catch((error: unknown) => sendResponse({ ok: false, error: toI18nTextFromError(error) }));

    return true;
  },
};
