/**
 * 说明：`port-manager` 后台运行时模块。
 *
 * 职责：
 * - 承载 `port-manager` 相关的当前文件实现与模块边界；
 * - 对外暴露 `UiEventSource`、`UiSelectionEvent`、`UiElementEvent` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：Port Manager——UI/消息通道管理
 *
 * 负责：
 * - 维护 UI Port 集合（Side Panel / Content Script）
 * - 安全地向 Port 发送消息（已断开则静默忽略）
 * - UI 事件缓冲与批量补发（SW 先于 Side Panel 启动时避免丢消息）
 */

import type { ScreenshotEditorActionPayload } from '@/plugins/page-tools/screenshot-capture/contracts';
import type { I18nText } from '@/types/i18n';

/**
 * UI 事件的来源信息。
 *
 * 说明：
 * - 主要用于在侧边栏展示“来自哪个页面/标签页”；
 * - 字段允许缺省，因为某些来源（例如程序性触发）可能没有完整页面上下文。
 */
export interface UiEventSource {
  /** 来源页面 URL。 */
  url?: string;
  /** 来源页面标题。 */
  title?: string;
}

/** 选中文本事件。 */
export interface UiSelectionEvent {
  /** 事件类型。 */
  type: "ui/selection";
  /** 事件负载。 */
  payload: {
    /** 希望侧边栏对选中文本执行的动作。 */
    action: "explain" | "translate" | "summarize" | "ask";
    /** 选中的文本内容。 */
    text: string;
    /** 可选：来源页面信息。 */
    source?: UiEventSource;
  };
}

/** 元素分析事件。 */
export interface UiElementEvent {
  /** 事件类型。 */
  type: "ui/element";
  /** 事件负载。 */
  payload: {
    /** 被拾取的结构化元素信息；具体结构由内容脚本发送方定义。 */
    element: unknown;
    /** 可选：来源页面信息。 */
    source?: UiEventSource;
  };
}

/** 截图编辑器事件。 */
export interface UiScreenshotEvent {
  /** 事件类型。 */
  type: "ui/screenshot";
  /** 截图动作负载，由 Sidepanel 负责入库为附件并插入输入草稿。 */
  payload: ScreenshotEditorActionPayload;
}

/** 页面工具启动后失败事件。 */
export interface UiPageToolErrorEvent {
  /** 事件类型。 */
  type: "ui/page-tool-error";
  /** 面向 UI 的本地化错误。 */
  payload: {
    /** 错误文案。 */
    error: I18nText;
  };
}

/** UI 事件：用于把 Content Script 的输入转发到 Side Panel。 */
export type UiEvent =
  | UiSelectionEvent
  | UiElementEvent
  | UiScreenshotEvent
  | UiPageToolErrorEvent;

/** 已连接的 UI 通道 */
export const uiPorts = new Set<chrome.runtime.Port>();

/** 已确认来自 sidepanel / sidebar 主工作区的 UI 通道。 */
export const sidePanelUiPorts = new Set<chrome.runtime.Port>();

/** Olyq Side Panel 页面路径，用于区分扩展主面板 Port 与网页内联 Port。 */
const SIDEPANEL_PAGE_PATH = '/src/extension/sidepanel/index.html';

/** 当 UI 还没连接时，先把事件缓存起来，等 Side Panel 连接后再补发 */
const pendingUiEvents: UiEvent[] = [];
/** 最大缓冲事件数，防止 Side Panel 长时间未打开时事件队列无限增长。 */
const MAX_PENDING_UI_EVENTS = 100;

/**
 * 判断一个 `olyq:ui` Port 是否来自 Side Panel 主工作区。
 *
 * 说明：
 * - content script 的内联响应卡片也会使用 `olyq:ui` Port 承载流式任务；
 * - 只有扩展页面 URL 指向 `src/extension/sidepanel/index.html` 的 Port 才代表主面板已加载；
 * - 这条边界用于页面工具恢复 sidepanel 时等待真实 UI，而不是被网页内联 Port 误唤醒。
 */
export function isSidePanelUiPort(port: chrome.runtime.Port): boolean {
  if (port.name !== 'olyq:ui') return false;
  const senderUrl = typeof port.sender?.url === 'string' ? port.sender.url : '';
  if (!senderUrl) return false;
  try {
    const url = new URL(senderUrl);
    return (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:')
      && url.pathname.endsWith(SIDEPANEL_PAGE_PATH);
  } catch {
    return senderUrl.includes(SIDEPANEL_PAGE_PATH);
  }
}

/** 注册一个已连接的 `olyq:ui` Port，并在主面板连上时唤醒等待者。 */
export function registerUiPort(port: chrome.runtime.Port): { sidePanel: boolean } {
  uiPorts.add(port);
  const sidePanel = isSidePanelUiPort(port);
  if (sidePanel) {
    sidePanelUiPorts.add(port);
    flushPendingUiEvents();
  }
  return { sidePanel };
}

/** 注销一个已断开的 `olyq:ui` Port。 */
export function unregisterUiPort(port: chrome.runtime.Port): void {
  uiPorts.delete(port);
  sidePanelUiPorts.delete(port);
}

/**
 * 安全地向 Port 发送消息；若 Port 已断开则静默忽略。
 *
 * 说明：
 * - `disconnect` 事件和 `postMessage` 失败并非严格同步，因此这里做最后一道兜底；
 * - 失败时不抛错，避免某个 UI 端口短暂断线影响整个后台事件广播。
 *
 * @returns 消息是否成功写入 Port。
 */
export function safePostMessage(port: chrome.runtime.Port, msg: unknown): boolean {
  try {
    port.postMessage(msg);
    return true;
  } catch {
    // 说明：Port 已断开（disconnect 事件可能尚未触发），忽略
    return false;
  }
}

/**
 * 向所有已连接的 UI Port 广播事件；若无 UI 连接则缓存。
 *
 * 说明：
 * - 这是 SW 向 side panel 等 UI 面板投递事件的统一出口；
 * - 缓冲区只保留最近 `MAX_PENDING_UI_EVENTS` 条，优先保证“最近状态”不丢。
 */
export function postToAllUi(evt: UiEvent): void {
  if (sidePanelUiPorts.size === 0) {
    // 优化 P2-4：超出上限时丢弃最旧的事件，防止无限增长
    if (pendingUiEvents.length >= MAX_PENDING_UI_EVENTS) {
      pendingUiEvents.shift();
    }
    pendingUiEvents.push(evt);
    return;
  }
  for (const p of sidePanelUiPorts) safePostMessage(p, evt);
}

/**
 * 向当前在线 UI Port 广播易失事件。
 *
 * 说明：这类事件只代表“当前内存状态刚更新”，不能进入 pending 队列；
 * UI 断开期间错过事件时，重新打开面板会通过 one-shot API 读取最新内存缓存。
 */
export function postVolatileToAllUi(evt: unknown): void {
  if (sidePanelUiPorts.size === 0) return;
  for (const p of sidePanelUiPorts) safePostMessage(p, evt);
}

/**
 * 补发缓冲的 UI 事件（在新 UI Port 连接时调用）。
 *
 * 说明：
 * - 采用“先整体取出，再逐条广播”的方式，避免补发过程中又被重复读到；
 * - 若补发时 UI 再次断开，`postToAllUi` 会自行决定是否重新缓存剩余事件。
 */
export function flushPendingUiEvents(): void {
  if (sidePanelUiPorts.size === 0 || pendingUiEvents.length === 0) return;
  const batch = pendingUiEvents.splice(0, pendingUiEvents.length);
  for (const evt of batch) postToAllUi(evt);
}
