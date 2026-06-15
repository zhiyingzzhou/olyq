/**
 * 说明：元素选择器 one-shot 提交处理器。
 *
 * 职责：
 * - 在元素选择器提交时补齐 visual 元素截图；
 * - 按 Sidepanel 单 owner 会话恢复侧栏；
 * - 通过专用 `olyq:sidepanel` Port 投递元素草稿，并等待 Sidepanel 业务 ack。
 *
 * 边界：
 * - 本模块只处理 `element/action` 单次消息；
 * - 不创建页面工具 session，不直接管理 Side Panel 浏览器 API owner。
 */
import type { SwStdResponse } from "../../../types/sw-messages";
import type { UiEvent } from "../port-manager";
import { claimPageToolSessionRestoreTarget } from "../page-tool-session";
import { captureVisibleViewportFrame } from "../page-style";
import { I18nError, toI18nTextFromError } from "../../../lib/i18n/error";
import { i18nText } from "../../../lib/i18n/text";
import { isPlainRecord } from '@/lib/utils/type-guards';
import type { HandlerContext, OneShotHandler } from "./types";
import { loadPageToolsRuntime } from "./runtime-loaders";

/**
 * 为视觉区域元素补上当前可见视口截图。
 *
 * @param payload - content script 发来的元素 payload。
 * @param sender - 消息发送方，用于定位当前窗口。
 * @returns 已补齐截图的 payload。
 */
async function attachVisualScreenshotToElementPayload(payload: unknown, sender: chrome.runtime.MessageSender) {
  if (!isPlainRecord(payload)) return payload;
  const element = isPlainRecord(payload.element) ? payload.element : null;
  if (!element || element.kind !== 'visual') return payload;
  const visual = isPlainRecord(element.visual) ? element.visual : null;
  if (!visual) throw new I18nError('errors.elementPickerVisualScreenshotFailed');
  const existingScreenshot = isPlainRecord(visual.screenshot) ? visual.screenshot : null;
  if (typeof existingScreenshot?.dataUrl === 'string' && existingScreenshot.dataUrl.startsWith('data:image/')) return payload;

  try {
    const dataUrl = await captureVisibleViewportFrame(sender.tab?.windowId);
    return {
      ...payload,
      element: {
        ...element,
        visual: {
          ...visual,
          screenshot: {
            dataUrl,
            mime: 'image/png',
            name: `element-visual-${Date.now()}.png`,
          },
        },
      },
    };
  } catch (error) {
    throw new I18nError('errors.elementPickerVisualScreenshotFailed', undefined, { cause: error });
  }
}

/**
 * 创建元素选择器提交消息处理器。
 *
 * @param ctx - 后台消息处理上下文。
 * @returns `element/action` 对应的 one-shot handler。
 */
export function createElementActionHandler(ctx: HandlerContext): OneShotHandler {
  return function handleElementAction(
    msg: Record<string, unknown>,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean {
    const sourceUrl = typeof (msg.payload as { source?: { url?: unknown } } | undefined)?.source?.url === 'string'
      ? String((msg.payload as { source: { url: string } }).source.url)
      : sender.tab?.url ?? '';
    const actionPayloadRecord = isPlainRecord(msg.payload) ? msg.payload : {};
    const restoreTarget = claimPageToolSessionRestoreTarget({
      sessionId: typeof actionPayloadRecord.sessionId === 'string' ? actionPayloadRecord.sessionId : undefined,
      fallbackTabId: sender.tab?.id,
      returnToPanel: actionPayloadRecord.returnToPanel === true,
    });
    const ownerClaim = ctx.claimPageToolSidePanelOwner({
      sessionId: typeof actionPayloadRecord.sessionId === 'string' ? actionPayloadRecord.sessionId : undefined,
      tool: 'element-picker',
      fallbackTabId: restoreTarget.targetTabId ?? sender.tab?.id,
      returnToPanel: restoreTarget.returnToPanel,
    });
    // 视觉元素必须在恢复 Sidepanel 前就启动可见视口截图，否则浏览器可能已经把当前
    // 可见面切到 Sidepanel，导致后续裁剪拿到错误画面。
    const visualPayloadTask = attachVisualScreenshotToElementPayload(msg.payload, sender);
    void visualPayloadTask.catch(() => undefined);
    const panelOpenTask = ownerClaim.ok && ownerClaim.returnToPanel
      ? ctx.openPanelForTabFromUserGesture(ownerClaim.owner.tabId, ownerClaim.owner.generation)
      : null;
    /**
     * 恢复当前元素选择器 owner 对应的 Sidepanel。
     *
     * 说明：调用 `openPanelForTabFromUserGesture()` 的动作已在任何 await 之前触发；
     * 这里仅等待浏览器完成打开与专用 Port loaded，不能重新发起打开动作。
     */
    const restorePanel = async () => {
      if (!ownerClaim.ok || !ownerClaim.returnToPanel) return;
      if (panelOpenTask) await panelOpenTask;
    };

    void loadPageToolsRuntime()
      .then(({ isPageToolsEnabledForUrl }) => isPageToolsEnabledForUrl(sourceUrl))
      .then(async (enabled) => {
        if (!enabled) {
          try {
            await restorePanel();
            if (ownerClaim.ok) ctx.cancelPageToolSidePanelOwner(ownerClaim.owner.generation);
          } catch {
            // 页面工具提交来自 content-script 用户手势，恢复失败时直接返回稳定错误。
          }
          sendResponse({ ok: false, error: i18nText("errors.pageToolsDisabled") } satisfies SwStdResponse);
          return;
        }
        if (!ownerClaim.ok || !ownerClaim.returnToPanel) {
          sendResponse({ ok: false, error: ownerClaim.ok ? i18nText("errors.pageToolSidePanelUnavailable") : ownerClaim.error } satisfies SwStdResponse);
          return;
        }
        const payload = await visualPayloadTask;
        try {
          await restorePanel();
        } catch {
          if (ownerClaim.ok) ctx.cancelPageToolSidePanelOwner(ownerClaim.owner.generation);
          sendResponse({ ok: false, error: i18nText("errors.pageToolSidePanelUnavailable") } satisfies SwStdResponse);
          return;
        }
        const delivered = await ctx.postPageToolCommandToSidePanel(ownerClaim.owner.generation, { type: "ui/element", payload } as UiEvent);
        if (!delivered.ok) {
          ctx.cancelPageToolSidePanelOwner(ownerClaim.owner.generation);
          sendResponse({ ok: false, error: delivered.error ?? i18nText("errors.pageToolSidePanelUnavailable") } satisfies SwStdResponse);
          return;
        }
        ctx.cancelPageToolSidePanelOwner(ownerClaim.owner.generation);
        sendResponse({ ok: true } satisfies SwStdResponse);
      })
      .catch((e: unknown) => sendResponse({ ok: false, error: toI18nTextFromError(e) } satisfies SwStdResponse));
    return true;
  };
}
