/**
 * 说明：网页工具 Content Script 运行时模块。
 *
 * 职责：
 * - 统一启动划词菜单、内联响应卡片、元素选择器、截图编辑器与技术栈 ready reporter；
 * - 收口 Content Script 面向 Service Worker 的 one-shot / Port 通信；
 * - 管理页面级事件监听、RAF 合帧定位和网页工具开关同步。
 *
 * 边界：
 * - 本文件只在普通网页 isolated world 内运行；
 * - 不持久化业务状态，持久化配置只经 `page-tools` shared channel 读取；
 * - 不直连扩展 runtime 原语，跨运行时通信统一走 typed client。
 */
import { createId } from "@/lib/utils/id";
import { installDevExtensionContextInvalidatedGuard } from "@/lib/dev/extension-context-guard";
import i18n, { ensureI18nReady } from "@/i18n";
import { normalizeI18nText } from "@/lib/i18n/text";
import { formatI18nText } from "@/lib/i18n/format";
import {
  disablePageToolsForSite,
  loadPageToolsSettings,
  normalizePageToolsSiteOrigin,
  setPageToolsEnabled,
  subscribePageToolsSettings,
} from "@/lib/extension/page-tools";
import { installTechnologyStackPageReadyReporter } from '../technology-stack-page-ready';
import { closeElementPicker, isElementPickerMode } from "../element-picker";
import { closeScreenshotEditor, isScreenshotEditorMode } from '@/plugins/page-tools/screenshot-capture/content/controller';
import { ensurePageToolsRoot, type PageToolsInlineRefs } from '../page-tools/page-tools-root';
import { positionPageFloatingElement, type PageFloatingAnchorRect } from '../floating-position';
import { resolveSelectionFloatingAnchorRect, snapshotAnchorRect } from '../selection-anchor';
import { dismissPageTooltip } from '../page-tooltip';
import { normalizeInlineOutputForDisplay } from '../inline-output';
import { sendExtensionMessage } from '@/lib/extension/runtime-api';
import { connectUiPortClient, type UiPortClient } from '@/lib/extension/ui-port-client';
import { installPageToolsContentMessageHandlers } from './page-tools-content-handlers';
import { installPageToolsInteractionListeners } from './page-tools-interaction-listeners';
import type { SwStdResponse } from '@/types/sw-messages';

/** 划词助手支持的内联动作类型。 */
type SelectionAction = "explain" | "translate" | "summarize" | "ask";

// 开发模式修复：CRXJS 的 HMR client 在扩展重载后可能抛出
// `Extension context invalidated.`（见 vendor/crx-client-port.js）。
// 该错误属于开发期“扩展上下文被替换”的正常现象，但不应以 Uncaught Error 的形式刷屏。
installDevExtensionContextInvalidatedGuard();

/**
 * 选择助手（Content Script）
 * - 运行在网页的 isolated world 中
 * - 通过 Shadow DOM 隔离样式，避免被宿主站点 CSS 污染
 * - 用户划选文字后弹出悬浮菜单：解释 / 翻译 / 总结 / 问 Olyq
 * - 解释/翻译/总结：在页面内弹出内联响应卡片（流式）
 * - 问 Olyq：打开侧边栏转发到 Side Panel
 */
/** 防止按需补注入时重复绑定监听器的全局哨兵 key。 */
const CONTENT_SCRIPT_BOOTSTRAP_KEY = "__olyq_content_script_bootstrapped__";

let uiRefs: PageToolsInlineRefs | null = null;
let uiHandlersBound = false;
let interactionListenersCleanup: (() => void) | null = null;

/** 判断当前页面是否处于截图编辑器模式。 */
function isPageModalToolMode() {
  return isElementPickerMode() || isScreenshotEditorMode();
}

/**
 * 将当前页面选区动作发送给 Service Worker。
 *
 * @param action - 划词动作类型。
 * @param text - 当前选区文本。
 */
function sendSelectionAction(action: SelectionAction, text: string): void {
  void sendExtensionMessage<SwStdResponse>({
    type: 'selection/action',
    payload: {
      action,
      text,
      source: { url: location.href, title: document.title },
    },
  }).catch(() => {
    // 页面浮层属于轻量入口；SW 断开时不在网页上额外插入错误层，用户可重新划词触发。
  });
}

/**
 * 内部函数：`closeElementPickerIfNeeded`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function closeElementPickerIfNeeded() {
  if (!isElementPickerMode()) return;
  closeElementPicker();
}

/** 关闭截图编辑器（若正在运行）。 */
function closeScreenshotEditorIfNeeded() {
  if (!isScreenshotEditorMode()) return;
  closeScreenshotEditor();
}

/**
 * 读取当前页面的划词文本。
 *
 * 说明：
 * - 统一做 `trim()`，避免纯空白选择也触发菜单；
 * - 这里始终以浏览器原生 Selection 为准，不缓存历史内容。
 */
function getSelectionText() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return "";
  return sel.toString().trim();
}

/**
 * 获取当前选择区域的屏幕坐标。
 *
 * 说明：
 * - 悬浮菜单和内联响应卡片都依赖这个矩形进行定位；
 * - 若选区已失效、宽高为 0 或浏览器抛错，则返回 `null` 并让上层静默放弃显示。
 */
function getSelectionRect() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  try {
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return rect;
  } catch {
    return null;
  }
}

/** 读取 content script 当前语言下的 UI 文案。 */
function tr(key: string, params?: Record<string, unknown>) {
  return i18n.t(key, params);
}

/**
 * 内部函数：`installUiEventHandlers`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function installUiEventHandlers(refs: PageToolsInlineRefs) {
  if (uiHandlersBound) return;
  uiHandlersBound = true;

  refs.menu.addEventListener("click", (e) => {
    if (!pageToolsEnabled) return;
    const target = e.target as HTMLElement | null;
    const btn = target?.closest("button[data-action]") as HTMLButtonElement | null;
    if (!btn) return;

    const action = btn.dataset.action as SelectionAction;
    const text = getSelectionText();
    if (!text) return;

    hideMenu();

    // "问 Olyq" → 打开侧边栏（保持现有行为）
    if (action === "ask") {
      sendSelectionAction(action, text);
      return;
    }

    // 解释/翻译/总结 → 页面内联流式响应
    void startInlineStream(action, text);
  });

  refs.menu.addEventListener("click", (e) => {
    if (!pageToolsEnabled) return;
    const target = e.target as HTMLElement | null;
    const btn = target?.closest("button[data-hide-trigger]") as HTMLButtonElement | null;
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();
    void showHidePanel(btn);
  });

  refs.card.addEventListener("click", (e) => {
    if (!pageToolsEnabled) return;
    const target = e.target as HTMLElement | null;
    const btn = target?.closest("button[data-card-action]") as HTMLButtonElement | null;
    if (!btn) return;

    const cardAction = btn.dataset.cardAction;

    if (cardAction === "close") {
      hideCard();
      return;
    }

    if (cardAction === "copy") {
      const text = refs.cardBody.textContent || "";
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = tr('contentScript.card.copied');
        setTimeout(() => { btn.textContent = tr('contentScript.card.copy'); }, 1500);
      }).catch(() => { /* clipboard unavailable */ });
      return;
    }

    if (cardAction === "open") {
      // 将原始划选内容转发到侧边栏继续对话
      sendSelectionAction(lastAction, lastSelectedText);
      hideCard();
    }
  });

  refs.hidePanel.addEventListener("click", (e) => {
    if (!pageToolsEnabled) return;
    const target = e.target as HTMLElement | null;
    const btn = target?.closest("button[data-hide-action]") as HTMLButtonElement | null;
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    void applyHideAction(btn.dataset.hideAction || "");
  });
}

/**
 * 内部函数：`ensureUiRefs`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function ensureUiRefs() {
  if (uiRefs) return uiRefs;
  uiRefs = ensurePageToolsRoot().refs.inline;
  installUiEventHandlers(uiRefs);
  return uiRefs;
}

/** 上一次成功显示菜单时对应的划词文本，用于避免重复重绘。 */
let lastText = "";
/** 延迟隐藏菜单的定时器句柄。 */
let hideTimer: number | null = null;
/** 当前内联流式请求占用的 runtime Port。 */
let activePort: UiPortClient | null = null;
/** 当前正在流式输出的请求 ID。 */
let activeRequestId = "";
/** 最近一次执行的划词动作。 */
let lastAction: SelectionAction = "explain";
/** 最近一次触发动作时的原始划词文本。 */
let lastSelectedText = "";
// 网页工具开关：用于关闭划词助手/元素选择器等网页内浮层
let pageToolsEnabled = false;
/** 本页面生命周期内的临时隐藏态；刷新或重新访问后自然恢复。 */
let pageToolsSessionDismissed = false;
/** 最近一次打开隐藏菜单的入口按钮，用于同步展开态并在 Esc 关闭后归还焦点。 */
let activeHidePanelTrigger: HTMLButtonElement | null = null;
/** 最近一次用于定位划词菜单的选区矩形，滚动和 resize 时复用。 */
let activeMenuAnchorRect: PageFloatingAnchorRect | null = null;
/** 最近一次用于定位内联响应卡片的选区矩形；实时 Selection 失效时才作为兜底锚点。 */
let activeResponseCardAnchorRect: PageFloatingAnchorRect | null = null;

// ---------- 网页工具浮层状态 ----------

/** 关闭当前 Shadow DOM 内的轻量 tooltip。 */
function closePageTooltip() {
  if (!uiRefs) return;
  dismissPageTooltip(uiRefs.menu.getRootNode() as ShadowRoot);
}

/** 隐藏三档隐藏选项弹出层。 */
function hideHidePanel() {
  if (!uiRefs) {
    activeHidePanelTrigger = null;
    return;
  }
  uiRefs.hidePanel.style.display = "none";
  uiRefs.hidePanel.setAttribute("aria-hidden", "true");
  uiRefs.menu
    .querySelectorAll<HTMLButtonElement>('button[data-hide-trigger="menu"]')
    .forEach((button) => button.setAttribute("aria-expanded", "false"));
  activeHidePanelTrigger = null;
}

/** 立即隐藏划词菜单并清空上一次选中文本缓存。 */
function hideMenu() {
  if (uiRefs) uiRefs.menu.style.display = "none";
  activeMenuAnchorRect = null;
  lastText = "";
  hideHidePanel();
  closePageTooltip();
}

/**
 * 关闭隐藏菜单并可选地把焦点还给触发按钮。
 *
 * 说明：
 * - 外部点击只负责收起菜单，避免把焦点强行拉回 Shadow DOM；
 * - Escape 属于键盘关闭路径，应回到 menu button，符合 ARIA menu button 预期。
 */
function closeHidePanel(options: { restoreFocus?: boolean } = {}) {
  const trigger = activeHidePanelTrigger;
  hideHidePanel();
  closePageTooltip();
  if (!options.restoreFocus) return;
  trigger?.focus?.();
}

/**
 * 隐藏内联响应卡片，并同步终止当前流式请求。
 *
 * 说明：
 * - 卡片关闭后不应继续消耗 Port 和后台模型流；
 * - 因此这里会统一调用 `abortInlineStream()` 做资源回收。
 */
function hideCard() {
  if (uiRefs) uiRefs.card.style.display = "none";
  activeResponseCardAnchorRect = null;
  hideHidePanel();
  closePageTooltip();
  abortInlineStream();
}

/** 关闭 content script 注入到页面内的普通网页工具浮层。 */
function closeAllPageToolOverlays() {
  hideMenu();
  hideCard();
}

/**
 * 进入结构化元素选择模式前，清理普通划词路径留下的 UI 与浏览器选区。
 *
 * 说明：
 * - “选择元素”是精细 DOM 元素上下文入口，不再与普通划词共享动作菜单；
 * - 因此启动选择器前必须先关闭划词菜单和内联响应卡片，并移除原生 Selection，
 *   避免同一页面同时出现两套 Olyq 浮层。
 */
function prepareElementPickerEntry() {
  closeAllPageToolOverlays();
  closeScreenshotEditorIfNeeded();
  try {
    window.getSelection()?.removeAllRanges();
  } catch {
    // Selection 读取失败时继续打开元素选择器，避免少数页面脚本阻断用户手势。
  }
}

/** 进入截图编辑模式前，清理其它网页工具浮层和原生选区。 */
function prepareScreenshotEditorEntry() {
  closeAllPageToolOverlays();
  closeElementPickerIfNeeded();
  try {
    window.getSelection()?.removeAllRanges();
  } catch {
    // Selection 读取失败时继续打开截图编辑器。
  }
}

/**
 * 终止当前内联流式请求。
 *
 * 说明：
 * - 先尝试向后台发送 `chat/abort`，让 service worker 主动停止生成；
 * - 无论 abort 消息是否成功，都会断开 Port，避免孤立连接残留。
 */
function abortInlineStream() {
  if (activePort && activeRequestId) {
    activePort.post({ type: "chat/abort", requestId: activeRequestId });
  }
  // 修复 M-10：显式断开端口，避免孤立端口累积
  if (activePort) {
    activePort.disconnect();
    activePort = null;
  }
  activeRequestId = "";
}

/** 延迟隐藏菜单，用于给点击菜单按钮或轻微选区变化留出缓冲时间。 */
function scheduleHide(ms = 250) {
  if (hideTimer) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(hideMenu, ms);
}

/**
 * 定位普通划词菜单。
 *
 * @param rect - 当前选区矩形。
 */
function positionMenu(rect: PageFloatingAnchorRect) {
  if (!uiRefs) return;
  positionPageFloatingElement({
    anchorRect: rect,
    floating: uiRefs.menu,
    preferredSide: 'top',
    align: 'center',
    gap: 8,
    padding: 10,
    fallbackWidth: 560,
    fallbackHeight: 44,
    sizeStrategy: 'position-only',
  });
}

/** 若隐藏菜单处于打开态，则按当前触发按钮重新定位。 */
function repositionHidePanelIfVisible() {
  if (!uiRefs || uiRefs.hidePanel.style.display !== "flex" || !activeHidePanelTrigger) return;
  positionPageFloatingElement({
    anchorRect: snapshotAnchorRect(activeHidePanelTrigger.getBoundingClientRect()),
    floating: uiRefs.hidePanel,
    preferredSide: 'bottom',
    align: 'end',
    gap: 8,
    padding: 10,
    fallbackWidth: 260,
    fallbackHeight: 120,
  });
}

/** 若内联响应卡片处于打开态，则按最近一次响应锚点重新定位。 */
function repositionResponseCardIfVisible() {
  if (!uiRefs || uiRefs.card.style.display !== "flex" || !activeResponseCardAnchorRect) return;
  activeResponseCardAnchorRect = resolveSelectionFloatingAnchorRect({
    getSelectionRect,
    getSelectionText,
    expectedText: lastSelectedText,
    fallbackRect: activeResponseCardAnchorRect,
  });
  if (!activeResponseCardAnchorRect) return;
  positionPageFloatingElement({
    anchorRect: activeResponseCardAnchorRect,
    floating: uiRefs.card,
    preferredSide: 'bottom',
    align: 'center',
    gap: 8,
    padding: 10,
    fallbackWidth: 420,
    fallbackHeight: 340,
  });
}

/**
 * 页面滚动或视口变化时刷新所有仍可见的普通网页工具浮层位置。
 *
 * 说明：
 * - 菜单仍以当前 Selection 为真源；响应卡片和隐藏菜单只重算坐标，不改变展开态或焦点；
 * - 这对应 Floating UI / Popper 的 autoUpdate 思路，但不引入额外依赖。
 */
function repositionVisibleFloatingUi() {
  if (!pageToolsEnabled || isPageModalToolMode()) return;
  if (uiRefs?.menu.style.display === "flex") {
    const rect = getSelectionRect();
    if (rect) {
      activeMenuAnchorRect = snapshotAnchorRect(rect);
      positionMenu(activeMenuAnchorRect);
    } else if (activeMenuAnchorRect) {
      positionMenu(activeMenuAnchorRect);
    }
  }
  repositionResponseCardIfVisible();
  repositionHidePanelIfVisible();
}

/**
 * 根据当前选区显示或重新定位划词菜单。
 *
 * 说明：
 * - 菜单固定显示在选区上方中央附近；
 * - 若当前没有有效选区，则改为短延时隐藏，避免闪烁。
 */
async function showMenu() {
  if (pageToolsSessionDismissed) return;
  const text = getSelectionText();
  const rect = getSelectionRect();
  if (!text || !rect) {
    scheduleHide(50);
    return;
  }
  lastText = text;
  await ensureI18nReady();

  const { menu } = ensureUiRefs();
  activeMenuAnchorRect = snapshotAnchorRect(rect);
  menu.style.display = "flex";
  positionMenu(activeMenuAnchorRect);
}

/**
 * 在指定触发按钮附近显示网页工具隐藏菜单。
 *
 * 说明：
 * - 普通 http/https 网页才展示“当前网站禁用”；
 * - 弹层保持在 Shadow DOM 内，不新增页面级权限或额外注入面。
 */
async function showHidePanel(anchor: HTMLElement) {
  await ensureI18nReady();
  const refs = ensureUiRefs();
  hideHidePanel();
  closePageTooltip();
  const trigger = anchor.closest('button[data-hide-trigger]') as HTMLButtonElement | null;
  activeHidePanelTrigger = trigger;
  trigger?.setAttribute("aria-expanded", "true");
  const disableSiteButton = refs.hidePanel.querySelector<HTMLButtonElement>('button[data-hide-action="disable-site"]');
  if (disableSiteButton) disableSiteButton.hidden = !normalizePageToolsSiteOrigin(location.href);

  refs.hidePanel.style.display = "flex";
  refs.hidePanel.setAttribute("aria-hidden", "false");
  repositionHidePanelIfVisible();
  refs.hidePanel.focus?.();
}

/**
 * 执行页面内隐藏菜单的三种动作。
 *
 * @param action - 隐藏菜单按钮声明的动作类型。
 */
async function applyHideAction(action: string) {
  if (action === "dismiss-session") {
    pageToolsSessionDismissed = true;
    closeAllPageToolOverlays();
    return;
  }
  if (action === "disable-site") {
    await disablePageToolsForSite(location.href);
    pageToolsSessionDismissed = false;
    closeAllPageToolOverlays();
    return;
  }
  if (action === "disable-global") {
    pageToolsSessionDismissed = false;
    await setPageToolsEnabled(false);
    closeAllPageToolOverlays();
  }
}

/**
 * 响应浏览器选区变化。
 *
 * 说明：
 * - 网页工具关闭或页面级工具开启时直接跳过；
 * - 只有选中文本发生变化时才重新显示菜单，减少重复布局。
 */
function onSelectionChange() {
  // 网页工具被关闭时不显示划词菜单
  if (!pageToolsEnabled) return;
  if (pageToolsSessionDismissed) return;
  // 页面级工具打开时，不再响应划词菜单（避免误触/干扰）
  if (isPageModalToolMode()) return;
  const text = getSelectionText();
  if (!text) {
    scheduleHide(120);
    return;
  }
  if (text === lastText && uiRefs?.menu.style.display === "flex") return;
  void showMenu();
}

// ---------- 内联响应卡片 ----------

/** 动作类型到卡片标题文案的映射。 */
const ACTION_LABEL_KEYS: Record<SelectionAction, string> = {
  explain: "contentScript.actions.explain",
  translate: "contentScript.actions.translate",
  summarize: "contentScript.actions.summarize",
  ask: "contentScript.actions.ask",
};

/**
 * 为内联助手构造一次性提示词。
 *
 * 说明：
 * - 翻译会根据原文是否包含中文自动推断目标语言；
 * - 这里只负责快速页内操作，不复用主对话里的系统提示与复杂上下文。
 */
function buildInlinePrompt(action: SelectionAction, text: string): string {
  const containsZh = /[\u4e00-\u9fa5]/.test(text);
  if (action === "translate") {
    return tr('contentScript.inlinePrompt.translate', {
      targetLanguage: tr(containsZh ? 'contentScript.inlinePrompt.targetEnglish' : 'contentScript.inlinePrompt.targetChinese'),
      text,
    });
  }
  if (action === "summarize") {
    return tr('contentScript.inlinePrompt.summarize', { text });
  }
  return tr('contentScript.inlinePrompt.explain', { text });
}

/**
 * 在当前选区附近展示内联响应卡片。
 *
 * 说明：
 * - 卡片默认出现在选区下方；
 * - 若靠近底部，则自动压到视口内，避免被窗口边缘截断。
 */
function showResponseCard(rect: DOMRect) {
  const { card } = ensureUiRefs();
  activeResponseCardAnchorRect = snapshotAnchorRect(rect);
  card.style.display = "flex";
  repositionResponseCardIfVisible();
}

/**
 * 启动一次页内流式响应。
 *
 * 说明：
 * - 每次请求都会独占一个 runtime Port，方便中断与生命周期管理；
 * - 生成中的文本会持续写回卡片正文，错误时则用本地化文案覆盖展示。
 */
async function startInlineStream(action: SelectionAction, text: string) {
  abortInlineStream();

  const rect = getSelectionRect();
  if (!rect) return;
  await ensureI18nReady();

  const { cardBody, cardLabel } = ensureUiRefs();
  lastAction = action;
  lastSelectedText = text;
  cardLabel.textContent = tr('contentScript.card.label', { action: tr(ACTION_LABEL_KEYS[action]) });
  cardBody.textContent = "";
  cardBody.style.color = "";
  // 添加光标
  const cursor = document.createElement("span");
  cursor.className = "cursor";
  cardBody.appendChild(cursor);

  showResponseCard(rect);

  // 为本次内联请求单独打开一个 Port：
  // - Content Script 无法直接复用 Side Panel 的 React 内部连接
  // - 将每次内联请求隔离到独立 Port，便于断线清理与避免与 UI 端口互相干扰
  const port = connectUiPortClient();
  activePort = port;
  const requestId = `inline-${createId()}`;
  activeRequestId = requestId;

  let content = "";

  port.onMessage((msg) => {
    const messageRequestId = 'requestId' in msg && typeof msg.requestId === 'string' ? msg.requestId : '';
    if (messageRequestId !== requestId) return;
    if (msg.type === "chat/delta" && typeof msg.delta === "string") {
      content += msg.delta;
      const displayContent = normalizeInlineOutputForDisplay(action, content);
      // 移除光标、更新文本、再把光标加回去
      const c = cardBody.querySelector(".cursor");
      cardBody.textContent = displayContent;
      if (c) cardBody.appendChild(c);
      // 自动滚动到底部
      cardBody.scrollTop = cardBody.scrollHeight;
    }
    if (msg.type === "chat/done") {
      const c = cardBody.querySelector(".cursor");
      if (c) c.remove();
      activeRequestId = "";
    }
    // 修复 M-5：错误事件需要向用户展示错误信息，而非静默吞掉
    if (msg.type === "chat/error") {
      const c = cardBody.querySelector(".cursor");
      if (c) c.remove();
      if (!content.trim()) {
        cardBody.textContent = formatI18nText(i18n.t.bind(i18n), normalizeI18nText(msg.error));
        cardBody.style.color = "rgba(255,100,100,.9)";
      }
      activeRequestId = "";
    }
  });

  port.onDisconnect(() => {
    if (activePort === port) activePort = null;
    activeRequestId = "";
    const c = cardBody.querySelector(".cursor");
    if (c) c.remove();
  });

  // 发送聊天请求（V1 协议）
  port.post({
    type: "chat/stream-v1",
    requestId,
    payload: {
      messages: [{ role: "user", content: buildInlinePrompt(action, text) }],
      model: "", // 空字符串表示使用默认模型（由 SW 解析）
      temperature: 0.5,
      topP: 0.9,
      maxTokens: 1024,
    },
  });
}

// ---------- 事件监听 ----------

/** 安装页面级交互监听，并把 cleanup 收口到当前 runtime owner。 */
function installInteractionListeners() {
  if (interactionListenersCleanup) return;
  const cleanup = installPageToolsInteractionListeners({
    isPageToolsEnabled: () => pageToolsEnabled,
    isPageModalToolMode,
    readUiRefs: () => uiRefs,
    onSelectionChange,
    hideMenu,
    closeHidePanel,
    repositionVisibleFloatingUi,
  });
  interactionListenersCleanup = () => {
    cleanup();
    interactionListenersCleanup = null;
  };
}

/**
 * 内部函数：`removeInteractionListeners`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function removeInteractionListeners() {
  interactionListenersCleanup?.();
}

// ---------- 消息处理（供 SW 查询） ----------

/**
 * 绑定 content script 的消息监听与开关同步。
 *
 * 说明：
 * - SW 现在可能会在“旧标签页未刷新”的情况下按需补注入同一个 loader；
 * - 因此这里必须保证整个 bootstrap 只执行一次，避免重复绑定 onMessage 和 storage listener。
 */
function initContentScriptRuntime(): void {
  installTechnologyStackPageReadyReporter();
  installPageToolsContentMessageHandlers({
    getSelectionText,
    prepareElementPickerEntry,
    prepareScreenshotEditorEntry,
  });

  // 初始加载 + 监听变更（storage.onChanged）
  void loadPageToolsSettings()
    .then((s) => applyPageToolsEnabled(Boolean(s.enabled) && !s.disabledSiteOrigins.includes(normalizePageToolsSiteOrigin(location.href) || "")))
    .catch(() => {
      // 读取失败时不阻塞：保持默认启用
      applyPageToolsEnabled(true);
    });
  subscribePageToolsSettings((s) => applyPageToolsEnabled(Boolean(s.enabled) && !s.disabledSiteOrigins.includes(normalizePageToolsSiteOrigin(location.href) || "")));
}

/**
 * 同步“网页工具开关”状态：
 * - 关闭时：隐藏划词菜单/内联卡片，并强制退出元素选择器（若正在运行）
 * - 开启时：恢复交互（无需刷新页面）
 */
function applyPageToolsEnabled(enabled: boolean) {
  pageToolsEnabled = Boolean(enabled);
  if (pageToolsEnabled) {
    pageToolsSessionDismissed = false;
    installInteractionListeners();
    return;
  }
  removeInteractionListeners();
  closeAllPageToolOverlays();
  closeElementPickerIfNeeded();
  closeScreenshotEditorIfNeeded();
}

/** 安装网页工具 Content Script 运行时。 */
export function installPageToolsRuntime(): void {
  const contentScriptRuntime = globalThis as unknown as Record<string, unknown>;
  if (contentScriptRuntime[CONTENT_SCRIPT_BOOTSTRAP_KEY] === true) return;
  contentScriptRuntime[CONTENT_SCRIPT_BOOTSTRAP_KEY] = true;
  initContentScriptRuntime();
}
