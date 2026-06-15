/**
 * 说明：`screenshot-editor` Service Worker 插件模块。
 *
 * 职责：
 * - 承接 Sidepanel 发起的截图编辑器启动请求；
 * - 复用现有可见视口截图队列，避免绕过浏览器截图配额保护；
 * - 转发 content script 提交的截图动作到 UI Port。
 *
 * 边界：
 * - 本插件只做路由、权限开关校验和一次性截图，不持久化截图；
 * - 图片进入 Sidepanel 后由既有附件系统落库；
 * - OCR 作为独立后台识别任务，复用统一 provider runtime 与 vision-input 判型，
 *   不再经过 Sidepanel 聊天附件投递链路。
 */
import { captureVisibleViewportFrame } from '@/extension/background/page-style';
import { ensurePageToolContentScriptReadyForTab } from '@/extension/background/content-script-manager';
import { extractTextFromScreenshot } from '@/plugins/page-tools/screenshot-capture/screenshot-ocr';
import { claimPageToolSessionRestoreTarget, createPageToolSession, deletePageToolSession } from '@/extension/background/page-tool-session';
import { closePanelForPageToolSession } from '@/extension/background/side-panel';
import { isPageToolsEnabledForUrl } from '@/lib/extension/page-tools';
import {
  getExtensionTab,
  isExtensionTabMessageError,
  sendExtensionTabMessageWithRetry,
  type ExtensionTabMessageErrorReason,
} from '@/lib/extension/runtime-api';
import { isOutboundModelImageMime, normalizeImageMimeType } from '@/lib/chat/outbound-image-formats';
import { parseChatStreamImageUrl } from '@/lib/chat-stream-protocol';
import { I18nError, toI18nTextFromError } from '@/lib/i18n/error';
import { i18nText } from '@/lib/i18n/text';
import { isPlainRecord } from '@/lib/utils/type-guards';
import type {
  ScreenshotEditorAction,
  ScreenshotEditorActionPayload,
  ScreenshotEditorImageMime,
} from '@/plugins/page-tools/screenshot-capture/contracts';
import type { SwPlugin } from '../../sw/host';
import { assertPageToolOpened } from '../../sw/plugins/page-tool-open-ack';

/**
 * 根据标签页 URL 与统一错误原因，推导截图编辑器可展示的国际化错误。
 *
 * @param params - 当前标签页地址与共享 contract 原因码。
 * @returns 截图编辑器链路可消费的 I18nError。
 */
function buildScreenshotEditorError(params: {
  tabUrl: string | null;
  reason: ExtensionTabMessageErrorReason
    | 'page-uncollectable'
    | 'content-script-injection-failed'
    | 'bundle-missing';
}): I18nError {
  const { reason, tabUrl } = params;
  if (tabUrl?.startsWith('file://')) {
    return new I18nError('errors.screenshotEditorFileUrlNotAllowed');
  }
  if (
    tabUrl?.startsWith('chrome://')
    || tabUrl?.startsWith('edge://')
    || tabUrl?.startsWith('about:')
    || tabUrl?.startsWith('devtools://')
  ) {
    return new I18nError('errors.screenshotEditorBrowserInternalPageNotAllowed');
  }
  if (tabUrl?.startsWith('chrome-extension://') || tabUrl?.startsWith('moz-extension://')) {
    return new I18nError('errors.screenshotEditorExtensionPageNotAllowed');
  }
  if (
    tabUrl
    && (tabUrl.startsWith('https://chrome.google.com/webstore')
      || tabUrl.startsWith('https://chromewebstore.google.com'))
  ) {
    return new I18nError('errors.screenshotEditorChromeWebStoreNotAllowed');
  }
  if (reason === 'tab-unavailable') {
    return new I18nError('errors.tabIdNotFound');
  }
  return new I18nError('errors.screenshotEditorContentScriptUnavailable');
}

/** 关闭 sidepanel 后等待页面 viewport/layout 稳定的短暂间隔。 */
const PAGE_TOOL_PANEL_CLOSE_SETTLE_MS = 80;

/** 等待指定毫秒数。 */
async function delay(ms: number) {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 将共享页面风格截图错误转换为截图编辑器专属文案。
 *
 * 说明：`captureVisibleViewportFrame()` 也服务 browser-context 风格模式，它的错误文案包含
 * “退化为 DOM/CSS 设计信号”的语义；截图编辑器是用户显式操作，不能展示这类不适用的降级说明。
 *
 * @param error - 截图队列抛出的原始错误。
 * @returns 截图编辑器链路应返回给 UI 的错误。
 */
function normalizeScreenshotCaptureError(error: unknown): unknown {
  if (!(error instanceof I18nError)) return error;
  if (error.i18n.key === 'errors.pageStyleScreenshotsRateLimited') {
    return new I18nError('errors.screenshotEditorCaptureRateLimited');
  }
  if (error.i18n.key === 'errors.pageStyleScreenshotsUnavailableWithDetail') {
    return new I18nError('errors.screenshotEditorCaptureUnavailableWithDetail', error.i18n.params);
  }
  if (error.i18n.key === 'errors.pageStyleScreenshotsUnavailable') {
    return new I18nError('errors.screenshotEditorCaptureUnavailable');
  }
  return error;
}

/**
 * 将未知截图动作规整为当前允许的动作集合。
 *
 * @param value - 外部消息里的动作字段。
 * @returns 合法动作；非法时返回 `null`。
 */
function normalizeScreenshotAction(value: unknown): ScreenshotEditorAction | null {
  return value === 'chat' || value === 'ocr' ? value : null;
}

/** 创建后台兜底 OCR 请求 ID，兼容旧调用方未传 ID 的情况。 */
function createOcrRequestId(): string {
  return `screenshot-ocr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 校验 content script 提交的截图动作负载。
 *
 * @param payload - 原始消息负载。
 * @returns 结构化截图动作负载。
 */
function normalizeScreenshotActionPayload(payload: unknown): ScreenshotEditorActionPayload {
  if (!isPlainRecord(payload)) throw new I18nError('errors.screenshotEditorActionInvalid');
  const action = normalizeScreenshotAction(payload.action);
  const image = isPlainRecord(payload.image) ? payload.image : null;
  const dataUrl = typeof image?.dataUrl === 'string' ? image.dataUrl : '';
  const parsedImage = parseChatStreamImageUrl(dataUrl);
  const mime = normalizeImageMimeType(image?.mime || (parsedImage?.kind === 'data' ? parsedImage.mediaType : ''));
  if (
    !action
    || parsedImage?.kind !== 'data'
    || !isOutboundModelImageMime(mime)
    || mime !== parsedImage.mediaType
  ) {
    throw new I18nError('errors.screenshotEditorActionInvalid');
  }

  const source = isPlainRecord(payload.source) ? payload.source : {};
  const rect = isPlainRecord(payload.rect) ? payload.rect : null;
  const sessionId = typeof payload.sessionId === 'string' && payload.sessionId.trim() ? payload.sessionId.trim() : '';
  const ocrRequestId = typeof payload.ocrRequestId === 'string' && payload.ocrRequestId.trim()
    ? payload.ocrRequestId.trim()
    : action === 'ocr'
      ? createOcrRequestId()
      : '';

  return {
    action,
    image: {
      dataUrl,
      mime: mime as ScreenshotEditorImageMime,
      name: typeof image?.name === 'string' && image.name.trim()
        ? image.name.trim()
        : `screenshot-${Date.now()}.${mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'}`,
    },
    source: {
      ...(typeof source.url === 'string' ? { url: source.url } : {}),
      ...(typeof source.title === 'string' ? { title: source.title } : {}),
    },
    ...(rect ? {
      rect: {
        x: Number(rect.x) || 0,
        y: Number(rect.y) || 0,
        width: Number(rect.width) || 0,
        height: Number(rect.height) || 0,
      },
    } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(payload.returnToPanel === true ? { returnToPanel: true } : {}),
    ...(ocrRequestId ? { ocrRequestId } : {}),
  };
}

/** 截图编辑器插件（Service Worker 侧）。 */
export const screenshotEditorSwPlugin: SwPlugin = {
  id: 'screenshot-editor',
  onMessageTypes: ['screenshot/editor/start', 'screenshot/action'],
  /**
   * 处理截图编辑器启动和截图动作转发消息。
   *
   * @param params - Service Worker 插件宿主传入的消息、sender、响应函数和运行时门面。
   * @returns 异步响应标记；不匹配的消息交回插件宿主继续分发。
   */
  onMessage({ msg, sender, sendResponse, runtime }) {
    if (msg.type === 'screenshot/editor/start') {
      void (async () => {
        const payload = isPlainRecord(msg.payload) ? msg.payload : {};
        const tabIdFromPayload = typeof payload.tabId === 'number' ? payload.tabId : null;
        const returnToPanel = payload.returnToPanel !== false;
        const tabId = tabIdFromPayload ?? sender.tab?.id ?? (await runtime.getActiveTabId());
        if (!tabId) throw new I18nError('errors.tabIdNotFound');

        const tab = await getExtensionTab(tabId);
        const tabUrl = typeof tab?.url === 'string' ? tab.url : null;
        if (!(await isPageToolsEnabledForUrl(tabUrl || ''))) throw new I18nError('errors.pageToolsDisabled');

        const ready = await ensurePageToolContentScriptReadyForTab(tabId);
        if (!ready.ready) {
          throw buildScreenshotEditorError({ tabUrl, reason: ready.reason });
        }

        const session = createPageToolSession({ tabId, tool: 'screenshot-editor', returnToPanel });
        const owner = runtime.beginPageToolSidePanelOwner({ tabId, tool: 'screenshot-editor', sessionId: session.sessionId });
        let panelClosed = false;

        try {
          await closePanelForPageToolSession(tabId);
          panelClosed = true;
          await delay(PAGE_TOOL_PANEL_CLOSE_SETTLE_MS);
          let dataUrl = '';
          try {
            dataUrl = await captureVisibleViewportFrame(tab?.windowId);
          } catch (error: unknown) {
            throw normalizeScreenshotCaptureError(error);
          }
          const openResponse = await sendExtensionTabMessageWithRetry(
            tabId,
            {
              type: 'screenshot/editor/open',
              payload: {
                screenshot: {
                  dataUrl,
                  mime: 'image/png',
                  name: `screenshot-${Date.now()}.png`,
                },
                sessionId: session.sessionId,
                returnToPanel: session.returnToPanel,
              },
            },
            { maxAttempts: 12, delayMs: 120 },
          );
          assertPageToolOpened(openResponse, {
            tool: 'screenshot-editor',
            sessionId: session.sessionId,
            errorKey: 'errors.screenshotEditorContentScriptUnavailable',
          });
        } catch (error) {
          deletePageToolSession(session.sessionId);
          runtime.cancelPageToolSidePanelOwner(owner.generation);
          const normalizedError = isExtensionTabMessageError(error)
            ? buildScreenshotEditorError({ tabUrl, reason: error.reason })
            : error;
          if (panelClosed) {
            try {
              const recoveryOwner = runtime.beginPageToolSidePanelOwner({ tabId, tool: 'screenshot-editor' });
              await runtime.ensurePanel(tabId);
              await runtime.postPageToolCommandToSidePanel(recoveryOwner.generation, {
                type: 'ui/page-tool-error',
                payload: { error: toI18nTextFromError(normalizedError) },
              });
              runtime.cancelPageToolSidePanelOwner(recoveryOwner.generation);
            } catch {
              // 若浏览器拒绝恢复 Side Panel，启动响应仍返回原始结构化错误。
            }
          }
          throw normalizedError;
        }

        return { ok: true, sessionId: session.sessionId, returnToPanel: session.returnToPanel };
      })()
        .then((res) => sendResponse(res))
        .catch((error: unknown) => sendResponse({ ok: false, error: toI18nTextFromError(error) }));
      return true;
    }

    if (msg.type === 'screenshot/action') {
      void (async () => {
        const payload = normalizeScreenshotActionPayload(msg.payload);
        if (payload.action === 'ocr') {
          try {
            const result = await extractTextFromScreenshot(payload);
            return {
              ok: true,
              text: result.text,
              ...(payload.ocrRequestId ? { ocrRequestId: payload.ocrRequestId } : {}),
            };
          } catch (error) {
            return {
              ok: false,
              error: toI18nTextFromError(error),
              ...(payload.ocrRequestId ? { ocrRequestId: payload.ocrRequestId } : {}),
            };
          }
        }

        const restoreTarget = claimPageToolSessionRestoreTarget({
          sessionId: payload.sessionId,
          fallbackTabId: sender.tab?.id,
          returnToPanel: payload.returnToPanel,
        });
        const ownerClaim = runtime.claimPageToolSidePanelOwner({
          sessionId: payload.sessionId,
          tool: 'screenshot-editor',
          fallbackTabId: restoreTarget.targetTabId ?? sender.tab?.id,
          returnToPanel: restoreTarget.returnToPanel,
        });
        const panelOpenTask = ownerClaim.ok && ownerClaim.returnToPanel
          ? runtime.openPanelForTabFromUserGesture(ownerClaim.owner.tabId, ownerClaim.owner.generation)
          : null;
        if (panelOpenTask) {
          try {
            await panelOpenTask;
          } catch {
            if (ownerClaim.ok) runtime.cancelPageToolSidePanelOwner(ownerClaim.owner.generation);
            return { ok: false, error: i18nText('errors.pageToolSidePanelUnavailable') };
          }
        }
        if (!ownerClaim.ok || !ownerClaim.returnToPanel) return { ok: false, error: ownerClaim.ok ? i18nText('errors.pageToolSidePanelUnavailable') : ownerClaim.error };
        const delivered = await runtime.postPageToolCommandToSidePanel(ownerClaim.owner.generation, { type: 'ui/screenshot', payload });
        if (!delivered.ok) {
          runtime.cancelPageToolSidePanelOwner(ownerClaim.owner.generation);
          return { ok: false, error: delivered.error ?? i18nText('errors.pageToolSidePanelUnavailable') };
        }
        runtime.cancelPageToolSidePanelOwner(ownerClaim.owner.generation);
        return { ok: true };
      })()
        .then((res) => sendResponse(res))
        .catch((error: unknown) => sendResponse({ ok: false, error: toI18nTextFromError(error) }));
      return true;
    }

    return undefined;
  },
};
