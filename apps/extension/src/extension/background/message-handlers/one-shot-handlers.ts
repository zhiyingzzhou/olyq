/**
 * 说明：`one-shot-handlers` 后台运行时模块。
 *
 * 职责：
 * - 承载 `one-shot-handlers` 相关的当前文件实现与模块边界；
 * - 对外暴露 `createOneShotHandlers` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type {
  BrowserContextReadableDomIntent,
  SwStdResponse,
} from "../../../types/sw-messages";
import { ensureOffscreenDocument } from "../offscreen-manager";
import type { UiEvent } from "../port-manager";
import {
  ensureContentScriptReadyForTab,
  getContentScriptStatus,
} from "../content-script-manager";
import { i18nText } from "../../../lib/i18n/text";
import { toI18nTextFromError } from "../../../lib/i18n/error";
import { loadBrowserContextSettings } from "@/lib/browser-context/settings";
import type { HandlerContext, OneShotHandlerMap } from "./types";
import { loadPageToolsRuntime } from "./runtime-loaders";
import {
  capturePageStyleFrames,
  normalizePageStyleCaptureFailureCode,
  requestPageStyleLayoutMetrics,
  requestPageStyleSignals,
} from "../page-style";
import { resolveTechnologyStackForTab, warmTechnologyStackForTab } from "../technology-stack";
import { normalizeTechnologyStackErrorCode } from "@/lib/technology-stack/errors";
import { createMcpOneShotHandlers } from "./one-shot-mcp-handlers";
import { createElementActionHandler } from "./element-action-handler";
import { resolveLinkPreviewMetadata } from "../link-preview";
import { applyLocalBackupSchedule, readLocalBackupScheduleStatus } from "../backup-scheduler";
import { collectReadableDomFromTab, EMBEDDED_FRAME_EXTRA_BUDGET_MS } from "../readable-dom-frames";

// 说明：这里处理的是“单次请求-单次响应”型消息。
// 一旦请求需要流式事件、Abort 或长时任务，就应该走 Port handler，而不是继续往这里塞。
const DEFAULT_BROWSER_CONTEXT_STABLE_WAIT_MS = 3_000;
const MAX_BROWSER_CONTEXT_STABLE_WAIT_MS = 10_000;
const BROWSER_CONTEXT_RESPONSE_GRACE_MS = 500;

/**
 * 归一化 browser-context 页面稳定窗口预算。
 *
 * @param value - 调用方传入的等待毫秒数。
 * @returns 限制后的稳定等待预算。
 */
function normalizeBrowserContextStableWaitMs(value: unknown): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_BROWSER_CONTEXT_STABLE_WAIT_MS;
  return Math.min(MAX_BROWSER_CONTEXT_STABLE_WAIT_MS, Math.max(1, Math.round(numeric)));
}

/**
 * 归一化正文采集意图。
 *
 * @param value - 调用方传入的 intent。
 * @returns 当前支持的正文采集意图。
 */
function normalizeReadableDomIntent(value: unknown): BrowserContextReadableDomIntent {
  return value === 'full-page' ? 'full-page' : 'normal';
}

/**
 * 给 one-shot 页面采集请求加后台侧硬超时。
 *
 * 说明：content script 自身也会按 `stableWaitMs` 返回 `timeout`，但后台 tab
 * 可能被浏览器暂停 rAF 或节流定时器；SW 必须拥有自己的响应边界，确保 Chrome
 * message channel 最终会被回应，UI 的刷新旋转态不会无限 pending。
 *
 * @param task - 页面侧请求。
 * @param stableWaitMs - 页面稳定窗口等待预算。
 * @returns 页面侧结果，或稳定 timeout 标记。
 */
async function raceBrowserContextOneShot<T>(
  task: Promise<T>,
  stableWaitMs: number,
  extraBudgetMs = 0,
): Promise<T | { timeout: true }> {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  const timeoutTask = new Promise<{ timeout: true }>((resolve) => {
    timeoutId = globalThis.setTimeout(
      () => resolve({ timeout: true }),
      stableWaitMs + Math.max(0, Math.round(extraBudgetMs)) + BROWSER_CONTEXT_RESPONSE_GRACE_MS,
    );
  });
  try {
    return await Promise.race([task, timeoutTask]);
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId);
  }
}

/** 判断 one-shot race 是否命中 timeout。 */
function isBrowserContextOneShotTimeout(value: unknown): value is { timeout: true } {
  return Boolean(value && typeof value === 'object' && (value as { timeout?: unknown }).timeout === true);
}

/**
 * 创建后台 one-shot 消息处理器映射。
 *
 * @remarks
 * 这些 handler 主要处理轻量配置查询、面板唤起和 MCP/页面工具的短链路命令。
 * 返回值固定是消息类型到处理函数的映射，供 service worker 路由器直接分发。
 */
export function createOneShotHandlers(ctx: HandlerContext): OneShotHandlerMap {
  const {
    openPanelForTabFromUserGesture,
    getActiveTabId,
    pushBrowserContextMetadataForTab,
    postToAllUi,
    loadKeepAliveConfig,
  } = ctx;

    /**
   * 内部函数：`handleSelectionAction`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleSelectionAction(
    msg: Record<string, unknown>,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean {
    // 说明：selection/action 是页面面对侧栏的用户手势入口。
    // 这里必须先把侧边栏打开动作前置，并且只能走手势安全 helper；通用 ensurePanel()
    // 会在内部等待 tab / setOptions 后再 open，真实 Chromium 会把这类异步链路拒绝成
    // “sidePanel.open() may only be called in response to a user gesture”。
    // 打开失败不能作为裸 Promise 漏到 SW 顶层；选区事件本身会进入 UI pending 队列，用户仍可手动打开面板查看。
    if (typeof sender.tab?.id === 'number') {
      void openPanelForTabFromUserGesture(sender.tab.id).catch(() => {});
    }
    const sourceUrl = typeof (msg.payload as { source?: { url?: unknown } } | undefined)?.source?.url === 'string'
      ? String((msg.payload as { source: { url: string } }).source.url)
      : sender.tab?.url ?? '';
    void loadPageToolsRuntime()
      .then(({ isPageToolsEnabledForUrl }) => isPageToolsEnabledForUrl(sourceUrl))
      .then((enabled) => {
        if (!enabled) {
          sendResponse({ ok: false, error: i18nText("errors.pageToolsDisabled") } satisfies SwStdResponse);
          return;
        }
        postToAllUi({ type: "ui/selection", payload: msg.payload } as UiEvent);
        sendResponse({ ok: true } satisfies SwStdResponse);
      })
      .catch((e: unknown) => sendResponse({ ok: false, error: toI18nTextFromError(e) } satisfies SwStdResponse));
    return true;
  }

    /**
   * 内部函数：`handleOffscreenEnsure`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleOffscreenEnsure(
    _msg: Record<string, unknown>,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean {
    // 说明：offscreen 文档是能力宿主，不是常驻中台。
    // 这里只保证“需要时存在”，失败直接回传给调用方决定是否降级。
    void ensureOffscreenDocument()
      .then(() => sendResponse({ ok: true } satisfies SwStdResponse))
      .catch((e) => sendResponse({ ok: false, error: toI18nTextFromError(e) } satisfies SwStdResponse));
    return true;
  }

    /**
   * 内部函数：`handleOffscreenClose`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleOffscreenClose(
    _msg: Record<string, unknown>,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean | void {
    if (!chrome.offscreen?.closeDocument) {
      sendResponse({ ok: false, error: i18nText("errors.offscreenCloseDocumentUnavailable") } satisfies SwStdResponse);
      return;
    }
    chrome.offscreen.closeDocument(() => {
      const err = chrome.runtime.lastError;
      if (err) sendResponse({ ok: false, error: toI18nTextFromError(err.message) } satisfies SwStdResponse);
      else sendResponse({ ok: true } satisfies SwStdResponse);
    });
    return true;
  }

    /**
   * 内部函数：`handleKeepAliveGet`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleKeepAliveGet(
    _msg: Record<string, unknown>,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean {
    void loadKeepAliveConfig().then((cfg) => sendResponse({ ok: true, payload: cfg }));
    return true;
  }

  /**
   * 内部函数：`handleLocalBackupScheduleGet`。
   *
   * @remarks
   * 本地自动快照的 alarm 属于 Service Worker 管辖范围，UI 只能通过这个
   * typed one-shot 读取计划和最近状态，避免设置面板直接碰 `chrome.alarms`。
   * 查询动作只允许补建缺失计划，不能重建已有同周期 alarm，否则打开设置页会推迟下一次执行。
   */
  function handleLocalBackupScheduleGet(
    _msg: Record<string, unknown>,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean {
    void applyLocalBackupSchedule({ mode: 'preserve-existing' })
      .then(() => readLocalBackupScheduleStatus())
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((e: unknown) => sendResponse({ ok: false, error: toI18nTextFromError(e) } satisfies SwStdResponse));
    return true;
  }

    /**
   * 内部函数：`handleSwPing`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleSwPing(
    _msg: Record<string, unknown>,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): void {
    sendResponse({ ok: true } satisfies SwStdResponse);
  }

  /**
   * 内部函数：`handleLinkPreviewMetadataGet`。
   *
   * @remarks
   * 链接预览属于用户悬浮/聚焦触发的短链路后台能力：
   * - UI 不直接跨域 fetch；
   * - 后台只接受 http/https 并只返回结构化元数据；
   * - 失败时使用稳定错误码，交给预览卡片做展示降级。
   */
  function handleLinkPreviewMetadataGet(
    msg: Record<string, unknown>,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean {
    const payload = (msg.payload as Record<string, unknown> | undefined) ?? {};
    const url = typeof payload.url === 'string' ? payload.url : '';
    void resolveLinkPreviewMetadata(url)
      .then((resolution) => sendResponse({ ok: true, ...resolution }))
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: toI18nTextFromError(error) } satisfies SwStdResponse);
      });
    return true;
  }

  /**
   * 内部函数：`handleBrowserContextReadableDomGet`。
   *
   * @remarks
   * browser-context 的正文采集属于“按需、短链路、可降级”操作：
   * - 总开关关闭时必须直接返回空 payload，不能再向内容脚本发正文请求；
   * - 内容脚本不可用、权限失效、页面不可读时也只做降级，不抛致命错误。
   */
  function handleBrowserContextReadableDomGet(
    msg: Record<string, unknown>,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean {
    void (async () => {
      const settings = await loadBrowserContextSettings();
      if (!settings.enabled) {
        sendResponse({ ok: true, payload: null });
        return;
      }

      const payload = (msg.payload as Record<string, unknown> | undefined) ?? {};
      const targetTabId = typeof payload.tabId === 'number' ? payload.tabId : await getActiveTabId();
      const intent = normalizeReadableDomIntent(payload.intent);
      const stableWaitMs = normalizeBrowserContextStableWaitMs(payload.stableWaitMs);
      if (!targetTabId) {
        sendResponse({ ok: true, payload: null, error: "tab-unavailable" });
        return;
      }

      const ready = await ensureContentScriptReadyForTab(targetTabId);
      if (!ready.ready) {
        sendResponse({ ok: true, payload: null, error: ready.reason });
        return;
      }

      try {
        const result = await raceBrowserContextOneShot(collectReadableDomFromTab({
          tabId: targetTabId,
          intent,
          stableWaitMs,
        }), stableWaitMs, EMBEDDED_FRAME_EXTRA_BUDGET_MS);
        if (isBrowserContextOneShotTimeout(result)) {
          sendResponse({ ok: true, payload: null, error: "timeout" });
          return;
        }
        const readablePayload = result?.payload ?? null;
        if (!readablePayload?.text?.trim()) {
          sendResponse({ ok: true, payload: null, error: readablePayload?.degradeReason || result?.error || "empty-body" });
          return;
        }
        sendResponse({ ok: true, payload: readablePayload });
      } catch {
        sendResponse({ ok: true, payload: null, error: "content-script-unreachable" });
      }
    })().catch((error: unknown) => {
      sendResponse({ ok: false, error: toI18nTextFromError(error) } satisfies SwStdResponse);
    });
    return true;
  }

  /**
   * 内部函数：`handleBrowserContextPageStyleSignalsGet`。
   *
   * @remarks
   * 页面设计信号已经彻底切进 browser-context 会话模式：
   * - 不再通过 UI 入口“点一下就发送”；
   * - 这里只负责按需返回结构化设计信号，供 system prompt 注入链路消费；
   * - 失败时继续遵守 browser-context 的“可降级、不阻断聊天”契约。
   */
  function handleBrowserContextPageStyleSignalsGet(
    msg: Record<string, unknown>,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean {
    void (async () => {
      const settings = await loadBrowserContextSettings();
      if (!settings.enabled) {
        sendResponse({ ok: true, payload: null });
        return;
      }

      const payload = (msg.payload as Record<string, unknown> | undefined) ?? {};
      const targetTabId = typeof payload.tabId === "number" ? payload.tabId : await getActiveTabId();
      const stableWaitMs = normalizeBrowserContextStableWaitMs(payload.stableWaitMs);

      if (!targetTabId) {
        sendResponse({ ok: true, payload: null, error: "tab-unavailable" });
        return;
      }

      const ready = await ensureContentScriptReadyForTab(targetTabId);
      if (!ready.ready) {
        sendResponse({ ok: true, payload: null, error: ready.reason });
        return;
      }

      try {
        const signals = await raceBrowserContextOneShot(
          requestPageStyleSignals(targetTabId, { stableWaitMs }),
          stableWaitMs,
        );
        if (isBrowserContextOneShotTimeout(signals)) {
          sendResponse({ ok: true, payload: null, error: "timeout" });
          return;
        }
        sendResponse({ ok: true, payload: signals });
      } catch (error: unknown) {
        sendResponse({
          ok: true,
          payload: null,
          error: error instanceof Error && error.message === 'timeout' ? 'timeout' : "content-script-unreachable",
        });
      }
    })().catch((error: unknown) => {
      sendResponse({ ok: false, error: toI18nTextFromError(error) } satisfies SwStdResponse);
    });
    return true;
  }

  /**
   * 内部函数：`handleBrowserContextPageStyleLayoutGet`。
   *
   * @remarks
   * 页面风格 snapshot 会先用布局指纹判断当前 topic 是否可以直接复用旧快照：
   * - 布局度量是轻量 one-shot，不会触发截图；
   * - 若 content script 不可达，调用方会自行回退到已存 snapshot，而不是在这里伪造结果。
   */
  function handleBrowserContextPageStyleLayoutGet(
    msg: Record<string, unknown>,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean {
    void (async () => {
      const settings = await loadBrowserContextSettings();
      if (!settings.enabled) {
        sendResponse({ ok: true, payload: null });
        return;
      }

      const payload = (msg.payload as Record<string, unknown> | undefined) ?? {};
      const targetTabId = typeof payload.tabId === 'number' ? payload.tabId : await getActiveTabId();
      if (!targetTabId) {
        sendResponse({ ok: true, payload: null, error: 'tab-unavailable' });
        return;
      }

      const ready = await ensureContentScriptReadyForTab(targetTabId);
      if (!ready.ready) {
        sendResponse({ ok: true, payload: null, error: ready.reason });
        return;
      }

      try {
        const metrics = await requestPageStyleLayoutMetrics(targetTabId);
        sendResponse({ ok: true, payload: metrics });
      } catch {
        sendResponse({ ok: true, payload: null, error: 'content-script-unreachable' });
      }
    })().catch((error: unknown) => {
      sendResponse({ ok: false, error: toI18nTextFromError(error) } satisfies SwStdResponse);
    });
    return true;
  }

  /**
   * 内部函数：`handleBrowserContextPageStyleCapturesGet`。
   *
   * @remarks
   * 页面视觉截图属于 browser-context 风格模式的附加输入：
   * - 只有在聊天发送链路明确请求时才抓取，不参与自动 metadata 推送；
   * - 失败时返回明确错误，交给 UI 决定是否降级为仅使用 DOM/CSS 信号；
   * - 仍然复用 content script readiness 检查，避免在未注入页面上直接调用截图编排。
   */
  function handleBrowserContextPageStyleCapturesGet(
    msg: Record<string, unknown>,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean {
    void (async () => {
      const settings = await loadBrowserContextSettings();
      if (!settings.enabled) {
        sendResponse({ ok: true, payload: null });
        return;
      }

      const payload = (msg.payload as Record<string, unknown> | undefined) ?? {};
      const targetTabId = typeof payload.tabId === 'number' ? payload.tabId : await getActiveTabId();
      const maxCaptures = typeof payload.maxCaptures === 'number' ? payload.maxCaptures : undefined;
      const captureRequestKey = typeof payload.captureRequestKey === 'string' ? payload.captureRequestKey : undefined;
      const expectedPageFingerprint = typeof payload.expectedPageFingerprint === 'string'
        ? payload.expectedPageFingerprint
        : undefined;
      const priority = typeof payload.priority === 'number' ? payload.priority : undefined;
      if (!targetTabId) {
        sendResponse({ ok: true, payload: null, error: 'tab-unavailable' });
        return;
      }

      const ready = await ensureContentScriptReadyForTab(targetTabId);
      if (!ready.ready) {
        sendResponse({ ok: true, payload: null, error: ready.reason });
        return;
      }

      try {
        const captures = await capturePageStyleFrames(targetTabId, {
          maxCaptures,
          captureRequestKey,
          expectedPageFingerprint,
          priority,
        });
        sendResponse({ ok: true, payload: captures });
      } catch (error: unknown) {
        sendResponse({ ok: true, payload: null, error: normalizePageStyleCaptureFailureCode(error) });
      }
    })().catch((error: unknown) => {
      sendResponse({ ok: false, error: toI18nTextFromError(error) } satisfies SwStdResponse);
    });
    return true;
  }

  /**
   * 内部函数：`handleTechnologyStackGet`。
   *
   * @remarks
   * technology-stack 是可降级的页面插件能力；失败时返回结构化状态，不阻断聊天。
   */
  function handleTechnologyStackGet(
    msg: Record<string, unknown>,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean {
    const payload = (msg.payload as Record<string, unknown> | undefined) ?? {};
    const tabId = typeof payload.tabId === 'number' ? payload.tabId : undefined;
    const minPass = payload.minPass === 'enhanced' ? 'enhanced' : 'fast';
    const waitMs = typeof payload.waitMs === 'number' ? payload.waitMs : undefined;
    void resolveTechnologyStackForTab({ tabId, minPass, waitMs })
      .then((resolution) => sendResponse({
        ok: true,
        payload: resolution.result,
        meta: {
          pageKey: resolution.pageKey,
          enhanced: resolution.enhanced,
        },
      }))
      .catch((error: unknown) => {
        sendResponse({
          ok: true,
          payload: null,
          error: normalizeTechnologyStackErrorCode(error),
        });
      });
    return true;
  }

  /** 强制刷新当前页面技术栈。 */
  function handleTechnologyStackRefresh(
    msg: Record<string, unknown>,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean {
    const payload = (msg.payload as Record<string, unknown> | undefined) ?? {};
    const tabId = typeof payload.tabId === 'number' ? payload.tabId : undefined;
    const minPass = payload.minPass === 'enhanced' ? 'enhanced' : 'fast';
    const waitMs = typeof payload.waitMs === 'number' ? payload.waitMs : undefined;
    void resolveTechnologyStackForTab({ tabId, force: true, minPass, waitMs })
      .then((resolution) => {
        sendResponse({
          ok: true,
          payload: resolution.result,
          meta: {
            pageKey: resolution.pageKey,
            enhanced: resolution.enhanced,
          },
        });
        if (typeof resolution.result.tabId === 'number') {
          void pushBrowserContextMetadataForTab(resolution.result.tabId);
        }
      })
      .catch((error: unknown) => {
        sendResponse({
          ok: true,
          payload: null,
          error: normalizeTechnologyStackErrorCode(error),
        });
      });
    return true;
  }

  /**
   * 内容脚本页面 ready 后触发技术栈自动预热。
   *
   * @remarks
   * 只信任 sender.tab / main frame 身份；payload 里的 URL 和标题仅作为页面身份输入，
   * 不包含任何页面原文，因此不会扩大隐私边界。
   */
  function handleTechnologyStackPageReady(
    msg: Record<string, unknown>,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean {
    const tabId = typeof sender.tab?.id === 'number' ? sender.tab.id : null;
    const frameId = typeof sender.frameId === 'number' ? sender.frameId : 0;
    const payload = (msg.payload as Record<string, unknown> | undefined) ?? {};
    const url = typeof payload.url === 'string' ? payload.url : sender.tab?.url || '';
    const title = typeof payload.title === 'string' ? payload.title : sender.tab?.title || '';
    if (!tabId || frameId !== 0 || !/^https?:/i.test(url)) {
      sendResponse({ ok: true, payload: null });
      return false;
    }
    void warmTechnologyStackForTab({ tabId, url, title, reason: 'page-ready' })
      .then((result) => {
        sendResponse({ ok: true, payload: result });
        void getActiveTabId()
          .then((activeTabId) => {
            if (activeTabId === tabId) void pushBrowserContextMetadataForTab(tabId);
          })
          .catch(() => {});
      })
      .catch((error: unknown) => {
        sendResponse({
          ok: true,
          payload: null,
          error: normalizeTechnologyStackErrorCode(error),
        });
      });
    return true;
  }

    /**
   * 内部函数：`handleContentScriptStatusGet`。
   *
   * @remarks
   * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
   */
  function handleContentScriptStatusGet(
    _msg: Record<string, unknown>,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ): boolean {
    void getContentScriptStatus()
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((e: unknown) => sendResponse({ ok: false, error: toI18nTextFromError(e) } satisfies SwStdResponse));
    return true;
  }

  // 说明：这里显式返回消息名到 handler 的静态映射，
  // 让 service worker 路由层保持纯分发，不在别处隐式拼装字符串。
  return {
    "selection/action": handleSelectionAction,
    "element/action": createElementActionHandler(ctx),
    "offscreen/ensure": handleOffscreenEnsure,
    "offscreen/close": handleOffscreenClose,
    "sw/keepalive/get": handleKeepAliveGet,
    "local-backup/schedule/get": handleLocalBackupScheduleGet,
    "sw/ping": handleSwPing,
    "link-preview/metadata/get": handleLinkPreviewMetadataGet,
    "browser-context/readable-dom/get": handleBrowserContextReadableDomGet,
    "browser-context/page-style-signals/get": handleBrowserContextPageStyleSignalsGet,
    "browser-context/page-style-layout/get": handleBrowserContextPageStyleLayoutGet,
    "browser-context/page-style-captures/get": handleBrowserContextPageStyleCapturesGet,
    "technology-stack/get": handleTechnologyStackGet,
    "technology-stack/refresh": handleTechnologyStackRefresh,
    "technology-stack/page-ready": handleTechnologyStackPageReady,
    "content-script/status/get": handleContentScriptStatusGet,
    ...createMcpOneShotHandlers(),
  };
}
