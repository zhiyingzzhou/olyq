/**
 * 说明：`element-picker` 源码模块。
 *
 * 职责：
 * - 承载 `element-picker` 相关的当前文件实现与模块边界；
 * - 对外暴露 `elementPickerSwPlugin` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { isPlainRecord } from '@/lib/utils/type-guards';
import { I18nError, toI18nTextFromError } from '@/lib/i18n/error';
import {
  getExtensionTab,
  isExtensionTabMessageError,
  type ExtensionTabMessageErrorReason,
  sendExtensionTabMessageWithRetry,
} from '@/lib/extension/runtime-api';
import { isPageToolsEnabledForUrl } from '@/lib/extension/page-tools';
import { ensurePageToolContentScriptReadyForTab } from '@/extension/background/content-script-manager';
import { closePanelForPageToolSession } from '@/extension/background/side-panel';
import { createPageToolSession, deletePageToolSession } from '@/extension/background/page-tool-session';
import type { SwPlugin } from '../host';
import { assertPageToolOpened } from './page-tool-open-ack';

/**
 * 根据标签页 URL 与统一错误原因，推导元素选择器可展示的国际化错误。
 *
 * @param params - 当前标签页地址与共享 contract 原因码。
 * @returns 元素选择器链路可消费的 I18nError。
 */
function buildElementPickerError(params: {
  tabUrl: string | null;
  reason: ExtensionTabMessageErrorReason
    | 'page-uncollectable'
    | 'content-script-injection-failed'
    | 'bundle-missing';
}): I18nError {
  const { reason, tabUrl } = params;
  if (tabUrl?.startsWith('file://')) {
    return new I18nError('errors.elementPickerFileUrlNotAllowed');
  }
  if (
    tabUrl?.startsWith('chrome://')
    || tabUrl?.startsWith('edge://')
    || tabUrl?.startsWith('about:')
    || tabUrl?.startsWith('devtools://')
  ) {
    return new I18nError('errors.elementPickerBrowserInternalPageNotAllowed');
  }
  if (tabUrl?.startsWith('chrome-extension://')) {
    return new I18nError('errors.elementPickerExtensionPageNotAllowed');
  }
  if (
    tabUrl
    && (tabUrl.startsWith('https://chrome.google.com/webstore')
      || tabUrl.startsWith('https://chromewebstore.google.com'))
  ) {
    return new I18nError('errors.elementPickerChromeWebStoreNotAllowed');
  }
  if (reason === 'tab-unavailable') {
    return new I18nError('errors.tabIdNotFound');
  }
  return new I18nError('errors.elementPickerContentScriptUnavailable');
}

/**
 * 元素选择器插件（Service Worker 侧）
 * - element/picker/start：让当前活动标签页进入"选元素模式"（由 Content Script 执行 UI）
 */
export const elementPickerSwPlugin: SwPlugin = {
  id: 'element-picker',
  onMessageTypes: ['element/picker/start'],
  /**
   * 内部方法：`onMessage`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  onMessage({ msg, sender, sendResponse, runtime }) {
    if (msg.type !== 'element/picker/start') return;

    void (async () => {
      const payload = isPlainRecord(msg.payload) ? msg.payload : {};
      const tabIdFromPayload = typeof payload.tabId === 'number' ? payload.tabId : null;
      const returnToPanel = payload.returnToPanel !== false;
      const tabId = tabIdFromPayload ?? sender.tab?.id ?? (await runtime.getActiveTabId());
      if (!tabId) throw new I18nError('errors.tabIdNotFound');

      const tab = await getExtensionTab(tabId);
      const tabUrl = typeof tab?.url === 'string' ? tab.url : null;
      // 网页工具被全局或当前站点禁用时，直接拒绝（避免发起注入/消息转发）。
      if (!(await isPageToolsEnabledForUrl(tabUrl || ''))) throw new I18nError('errors.pageToolsDisabled');

      const ready = await ensurePageToolContentScriptReadyForTab(tabId);
      if (!ready.ready) {
        throw buildElementPickerError({ tabUrl, reason: ready.reason });
      }

      const session = createPageToolSession({ tabId, tool: 'element-picker', returnToPanel });
      const owner = runtime.beginPageToolSidePanelOwner({ tabId, tool: 'element-picker', sessionId: session.sessionId });
      let panelClosed = false;

      try {
        await closePanelForPageToolSession(tabId);
        panelClosed = true;
        const openResponse = await sendExtensionTabMessageWithRetry(
          tabId,
          {
            type: 'element/picker/open',
            payload: { sessionId: session.sessionId, returnToPanel: session.returnToPanel },
          },
          { maxAttempts: 12, delayMs: 120 },
        );
        assertPageToolOpened(openResponse, {
          tool: 'element-picker',
          sessionId: session.sessionId,
          errorKey: 'errors.elementPickerContentScriptUnavailable',
        });
      } catch (error) {
        deletePageToolSession(session.sessionId);
        runtime.cancelPageToolSidePanelOwner(owner.generation);
        const normalizedError = isExtensionTabMessageError(error)
          ? buildElementPickerError({ tabUrl, reason: error.reason })
          : error;
        if (panelClosed) {
          try {
            const recoveryOwner = runtime.beginPageToolSidePanelOwner({ tabId, tool: 'element-picker' });
            await runtime.ensurePanel(tabId);
            await runtime.postPageToolCommandToSidePanel(recoveryOwner.generation, {
              type: 'ui/page-tool-error',
              payload: { error: toI18nTextFromError(normalizedError) },
            });
            runtime.cancelPageToolSidePanelOwner(recoveryOwner.generation);
          } catch {
            // 启动响应会携带原始错误；恢复 Side Panel 失败不覆盖根因。
          }
        }
        throw normalizedError;
      }

      return { ok: true, sessionId: session.sessionId, returnToPanel: session.returnToPanel };
    })()
      .then((res) => sendResponse(res))
      .catch((error: unknown) => sendResponse({ ok: false, error: toI18nTextFromError(error) }));

    // 异步：需要 return true 以保持 sendResponse 通道
    return true;
  },
};
