/**
 * 说明：Side Panel 单 owner 服务。
 *
 * 职责：
 * - 只维护一个 active page-tool sidepanel owner；
 * - 接收 Sidepanel 页面通过 `olyq:sidepanel` 建立的专用 Port；
 * - 向当前 Sidepanel 投递页面工具命令，并等待业务 ack；
 * - 旧 generation、旧 Port、旧 pending 命令都会被明确拒绝，避免多 tab 并发时串投。
 *
 * 边界：
 * - 本模块不直接调用 `chrome.sidePanel.open/setOptions`，浏览器 API 仍由 `side-panel.ts` 封装；
 * - 内存状态只属于 SW 当前生命周期；SW 重启后 content payload 可按显式 sender fallback
 *   重新创建 owner，但不会猜测旧 Port 的 tab 归属。
 */
import type { UiEvent } from './port-manager';
import { safePostMessage } from './port-manager';
import { createId } from '@/lib/utils/id';
import { i18nText } from '@/lib/i18n/text';
import type { I18nText } from '@/types/i18n';
import type { SidePanelPageToolCommandMessage, SidePanelPageToolReadyRequestMessage } from '@/types/sidepanel-page-tool-port';
import type { PageToolSessionCloseReason, PageToolSessionTool } from '@/types/sw-messages';

/** 当前唯一 owner 的运行时记录。 */
export type SidePanelOwnerRecord = {
  /** 当前 owner 绑定的网页 tabId。 */
  tabId: number;
  /** 当前 owner 所属页面工具类型。 */
  tool: PageToolSessionTool;
  /** 当前 owner 对应的页面工具 session；SW 重启 fallback 允许为空。 */
  sessionId?: string;
  /** 单调递增代际；所有命令与 ack 都必须匹配。 */
  generation: number;
  /** 创建时间，用于测试与诊断。 */
  createdAt: number;
};

/** 认领当前 owner 的结果。 */
export type SidePanelOwnerClaimResult =
  | { ok: true; owner: SidePanelOwnerRecord; returnToPanel: boolean }
  | { ok: false; error: I18nText };

/** Sidepanel 页面工具命令投递结果。 */
export type SidePanelPageToolCommandResult =
  | { ok: true }
  | { ok: false; error?: I18nText };

const SIDEPANEL_LOADED_TIMEOUT_MS = 8_000;
const SIDEPANEL_COMMAND_ACK_TIMEOUT_MS = 15_000;

let activeOwner: SidePanelOwnerRecord | null = null;
let ownerGeneration = 0;
let connectedPort: chrome.runtime.Port | null = null;
let loadedPort: chrome.runtime.Port | null = null;
let loadedGeneration = 0;
let expectedLoadedGeneration = 0;

const loadedWaiters = new Set<() => void>();

/** 页面工具 owner 被替换时，由 Service Worker 负责通知旧 tab 关闭 overlay。 */
type PageToolOwnerCancelHandler = (owner: SidePanelOwnerRecord, reason: PageToolSessionCloseReason) => void;

let ownerCancelHandler: PageToolOwnerCancelHandler | null = null;

const pendingCommandAcks = new Map<string, {
  generation: number;
  port: chrome.runtime.Port;
  resolve: (result: SidePanelPageToolCommandResult) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

/** 唤醒等待 Sidepanel 专用 Port 的调用方。 */
function notifyLoadedWaiters(): void {
  for (const waiter of loadedWaiters) waiter();
  loadedWaiters.clear();
}

/** 以统一错误拒绝当前全部待 ack 命令。 */
function rejectPendingCommands(error?: I18nText): void {
  for (const [requestId, pending] of pendingCommandAcks) {
    pendingCommandAcks.delete(requestId);
    clearTimeout(pending.timer);
    pending.resolve({ ok: false, ...(error ? { error } : {}) });
  }
}

/**
 * 注册页面工具 owner 取消回调。
 *
 * 说明：SidePanelService 不直接访问 `chrome.tabs`，只把“旧 owner 应该退出页面 overlay”
 * 这件事交给 Service Worker 宿主执行，保持浏览器 API 边界集中。
 *
 * @param handler - 取消回调；传 `null` 可用于测试重置。
 */
export function setPageToolSidePanelOwnerCancelHandler(handler: PageToolOwnerCancelHandler | null): void {
  ownerCancelHandler = handler;
}

/** 通知旧页面工具 overlay 退出，不等待 content script 回包。 */
function notifyOwnerCancelled(owner: SidePanelOwnerRecord, reason: PageToolSessionCloseReason): void {
  try {
    ownerCancelHandler?.(owner, reason);
  } catch {
    // 取消旧 overlay 是清理动作；失败不能阻断新 owner 或当前 sidepanel 打开。
  }
}

/** 取消当前 owner，并按互斥语义通知旧页面工具退出。 */
function replaceActiveOwner(reason: PageToolSessionCloseReason): void {
  const owner = activeOwner;
  if (!owner) return;
  activeOwner = null;
  expectedLoadedGeneration = 0;
  loadedPort = null;
  loadedGeneration = 0;
  rejectPendingCommands(i18nText('errors.pageToolSidePanelUnavailable'));
  notifyOwnerCancelled(owner, reason);
  notifyLoadedWaiters();
}

/**
 * 开始一个新的页面工具 Sidepanel owner。
 *
 * @param params - owner 所属 tab 与可选 session。
 * @returns 新 owner 记录。
 */
export function beginPageToolSidePanelOwner(params: {
  tabId: number;
  tool: PageToolSessionTool;
  sessionId?: string;
}): SidePanelOwnerRecord {
  replaceActiveOwner('replace');
  rejectPendingCommands(i18nText('errors.pageToolSidePanelUnavailable'));
  ownerGeneration += 1;
  // 新页面工具会话必须等待本代 Sidepanel bridge-ready，不能复用上一轮已经
  // loaded 的旧 Port；否则命令可能被隐藏或即将卸载的面板提前 ack。
  loadedPort = null;
  loadedGeneration = 0;
  expectedLoadedGeneration = 0;
  activeOwner = {
    tabId: params.tabId,
    tool: params.tool,
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    generation: ownerGeneration,
    createdAt: Date.now(),
  };
  return activeOwner;
}

/**
 * 取消当前 owner。
 *
 * @param generation - 可选代际；传入时只取消匹配 owner，避免旧流程误取消新 owner。
 */
export function cancelPageToolSidePanelOwner(generation?: number): void {
  if (typeof generation === 'number' && activeOwner?.generation !== generation) return;
  activeOwner = null;
  expectedLoadedGeneration = 0;
  loadedPort = null;
  loadedGeneration = 0;
  rejectPendingCommands(i18nText('errors.pageToolSidePanelUnavailable'));
  notifyLoadedWaiters();
}

/**
 * 认领当前页面工具 owner。
 *
 * 说明：
 * - 若存在 active owner，content payload 必须匹配 sessionId，否则旧 tab/旧工具不能抢当前面板；
 * - 若 SW 已重启导致 active owner 丢失，只在 payload 明确要求 returnToPanel 且 sender.tab.id
 *   存在时创建新的 owner，维持用户关闭/提交后能回到侧栏的语义。
 *
 * @param params - content script payload 与 sender fallback。
 * @returns 当前动作可使用的 owner。
 */
export function claimPageToolSidePanelOwner(params: {
  sessionId?: string | null;
  tool?: PageToolSessionTool | null;
  fallbackTabId?: number | null;
  returnToPanel?: boolean;
}): SidePanelOwnerClaimResult {
  const sessionId = typeof params.sessionId === 'string' && params.sessionId.trim() ? params.sessionId.trim() : '';
  const tool = params.tool === 'element-picker' || params.tool === 'screenshot-editor' ? params.tool : null;
  if (activeOwner) {
    if (tool && activeOwner.tool !== tool) {
      return { ok: false, error: i18nText('errors.pageToolSidePanelUnavailable') };
    }
    if (sessionId && activeOwner.sessionId && sessionId !== activeOwner.sessionId) {
      return { ok: false, error: i18nText('errors.pageToolSidePanelUnavailable') };
    }
    if (sessionId && !activeOwner.sessionId) {
      return { ok: false, error: i18nText('errors.pageToolSidePanelUnavailable') };
    }
    return { ok: true, owner: activeOwner, returnToPanel: params.returnToPanel !== false };
  }

  if (params.returnToPanel === true && typeof params.fallbackTabId === 'number') {
    return {
      ok: true,
      owner: beginPageToolSidePanelOwner({
        tabId: params.fallbackTabId,
        tool: tool ?? 'screenshot-editor',
        ...(sessionId ? { sessionId } : {}),
      }),
      returnToPanel: true,
    };
  }

  return { ok: false, error: i18nText('errors.pageToolSidePanelUnavailable') };
}

/**
 * 注册 Sidepanel 页面工具专用 raw Port。
 *
 * 说明：
 * - raw Port 连接只代表 Sidepanel 文档开始加载；
 * - 只有 React bridge 订阅完成并发送 `sidepanel/page-tool-bridge-ready` 后，
 *   才能把它视作可接收页面工具命令的 loaded Port。
 *
 * @param port - `chrome.runtime.connect({ name: "olyq:sidepanel" })` 建立的 Port。
 */
export function registerSidePanelPageToolPort(port: chrome.runtime.Port): void {
  connectedPort = port;
}

/**
 * 标记 Sidepanel 页面工具 bridge 已完成命令订阅。
 *
 * @param port - 发出 ready 的专用 Port。
 */
export function markSidePanelPageToolBridgeReady(port: chrome.runtime.Port, generation?: number): void {
  if (connectedPort && connectedPort !== port) return;
  connectedPort = port;

  if (typeof generation !== 'number') {
    if (activeOwner) {
      if (expectedLoadedGeneration === activeOwner.generation) {
        requestSidePanelPageToolBridgeReady(activeOwner.generation);
        return;
      }
      replaceActiveOwner('replace');
      return;
    }
    loadedPort = port;
    loadedGeneration = 0;
    notifyLoadedWaiters();
    return;
  }

  if (!activeOwner || generation !== activeOwner.generation || expectedLoadedGeneration !== generation) return;
  loadedPort = port;
  loadedGeneration = generation;
  expectedLoadedGeneration = 0;
  notifyLoadedWaiters();
}

/**
 * 声明接下来要等待某个页面工具 generation 的 bridge-ready。
 *
 * @param generation - 当前页面工具 owner 代际。
 */
export function expectSidePanelPageToolBridgeReady(generation: number): void {
  if (activeOwner?.generation !== generation) return;
  expectedLoadedGeneration = generation;
}

/**
 * 要求当前 Sidepanel React bridge 为指定页面工具代际重新发送 ready。
 *
 * 说明：
 * - Chromium Side Panel 有时会复用同一个文档；新 owner 开始时旧 ready 已被废弃，
 *   因此必须在 `sidePanel.open()` 之后显式要求当前 bridge 按 generation 重新确认；
 * - 若当前没有 Port，后续新文档连接时仍会主动发送 ready。
 *
 * @param generation - 当前页面工具 owner 代际。
 */
export function requestSidePanelPageToolBridgeReady(generation: number): void {
  expectSidePanelPageToolBridgeReady(generation);
  if (!connectedPort) return;
  const msg: SidePanelPageToolReadyRequestMessage = {
    type: 'sidepanel/page-tool-ready-request',
    generation,
  };
  safePostMessage(connectedPort, msg);
}

/**
 * 判断 Sidepanel 页面工具 bridge 是否已经处于目标 loaded 态。
 *
 * 说明：
 * - 这个检查只认 React bridge ready 后的 `loadedPort`，不把 raw Port 连接当成
 *   主工作区可用，避免 content inline Port 或尚未订阅的文档误判为已打开；
 * - 传入 generation 时必须匹配当前 active owner，旧 owner / 旧 Port 不能跳过
 *   `sidePanel.open()` 的恢复事务。
 *
 * @param generation - 可选页面工具 owner 代际。
 * @returns 当前 Sidepanel bridge 是否已经可用于该恢复动作。
 */
export function isSidePanelPageToolLoadedForOpen(generation?: number): boolean {
  if (!loadedPort) return false;
  if (typeof generation !== 'number') return true;
  return activeOwner?.generation === generation && loadedGeneration === generation;
}

/**
 * 注销 Sidepanel 页面工具专用 Port。
 *
 * @param port - 断开的 Port。
 */
export function unregisterSidePanelPageToolPort(port: chrome.runtime.Port): void {
  if (connectedPort === port) connectedPort = null;
  if (loadedPort === port) {
    loadedPort = null;
    loadedGeneration = 0;
  }
  for (const [requestId, pending] of pendingCommandAcks) {
    if (pending.port !== port) continue;
    pendingCommandAcks.delete(requestId);
    clearTimeout(pending.timer);
    pending.resolve({ ok: false, error: i18nText('errors.pageToolSidePanelUnavailable') });
  }
}

/**
 * 等待 Sidepanel 专用 Port 已加载。
 *
 * @param generation - 可选 owner 代际；传入时要求当前 active owner 匹配。
 * @param timeoutMs - 最长等待时间。
 * @returns 是否等到可用 Port。
 */
export async function waitForSidePanelPageToolLoaded(
  generation?: number,
  timeoutMs = SIDEPANEL_LOADED_TIMEOUT_MS,
): Promise<boolean> {
  /**
   * 判断等待期间当前 owner 代际是否仍匹配。
   *
   * @returns 未指定代际或 active owner 仍是目标代际时返回 `true`。
   */
  const generationMatches = () => typeof generation !== 'number' || activeOwner?.generation === generation;
  /**
   * 判断当前专用 Port 是否已经对齐目标 owner 代际。
   *
   * @returns loaded Port 存在且 generation 与等待目标一致时返回 `true`。
   */
  const loadedMatches = () => Boolean(
    loadedPort
    && generationMatches()
    && (typeof generation !== 'number' || loadedGeneration === generation),
  );
  if (loadedMatches()) return true;

  return await new Promise<boolean>((resolve) => {
    let settled = false;
    /**
     * 结束当前 loaded 等待。
     *
     * @param ready - 是否已经等到可用 Sidepanel 专用 Port。
     */
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      loadedWaiters.delete(onLoaded);
      clearTimeout(timer);
      resolve(ready);
    };
    /**
     * Sidepanel 专用 Port 连接后重新检查 owner 代际。
     */
    const onLoaded = () => finish(loadedMatches());
    const timer = setTimeout(() => finish(false), Math.max(0, timeoutMs));
    loadedWaiters.add(onLoaded);
  });
}

/**
 * 完成 Sidepanel 页面工具命令 ack。
 *
 * @param port - 发送 ack 的专用 Port。
 * @param msg - Sidepanel 回包。
 * @returns 是否命中当前 pending 命令。
 */
export function resolveSidePanelPageToolCommandAck(
  port: chrome.runtime.Port,
  msg: Record<string, unknown>,
): boolean {
  const requestId = typeof msg.requestId === 'string' ? msg.requestId : '';
  const generation = typeof msg.generation === 'number' ? msg.generation : -1;
  if (!requestId) return false;
  const pending = pendingCommandAcks.get(requestId);
  if (!pending || pending.port !== port || pending.generation !== generation) return false;
  pendingCommandAcks.delete(requestId);
  clearTimeout(pending.timer);

  const payload = msg.payload && typeof msg.payload === 'object' && !Array.isArray(msg.payload)
    ? msg.payload as { ok?: unknown; error?: unknown }
    : {};
  const ok = payload.ok === true;
  const error = payload.error && typeof payload.error === 'object' ? payload.error as I18nText : undefined;
  pending.resolve(ok ? { ok: true } : { ok: false, ...(error ? { error } : {}) });
  return true;
}

/**
 * 向当前 Sidepanel owner 投递页面工具命令，并等待业务 ack。
 *
 * @param generation - 当前页面工具 owner 代际。
 * @param command - 页面工具事件。
 * @param timeoutMs - ack 超时时间。
 * @returns Sidepanel 业务处理结果。
 */
export async function postPageToolCommandToSidePanel(
  generation: number,
  command: UiEvent,
  timeoutMs = SIDEPANEL_COMMAND_ACK_TIMEOUT_MS,
): Promise<SidePanelPageToolCommandResult> {
  if (activeOwner?.generation !== generation) {
    return { ok: false, error: i18nText('errors.pageToolSidePanelUnavailable') };
  }
  if (!(await waitForSidePanelPageToolLoaded(generation))) {
    return { ok: false, error: i18nText('errors.pageToolSidePanelUnavailable') };
  }
  const port = loadedPort;
  if (!port) return { ok: false, error: i18nText('errors.pageToolSidePanelUnavailable') };

  const requestId = `sidepanel-page-tool-${createId()}`;
  return await new Promise<SidePanelPageToolCommandResult>((resolve) => {
    const timer = setTimeout(() => {
      pendingCommandAcks.delete(requestId);
      resolve({ ok: false, error: i18nText('errors.pageToolSidePanelUnavailable') });
    }, Math.max(0, timeoutMs));
    pendingCommandAcks.set(requestId, { generation, port, resolve, timer });

    const msg: SidePanelPageToolCommandMessage = {
      type: 'sidepanel/page-tool-command',
      requestId,
      generation,
      command,
    };
    if (!safePostMessage(port, msg)) {
      clearTimeout(timer);
      pendingCommandAcks.delete(requestId);
      resolve({ ok: false, error: i18nText('errors.pageToolSidePanelUnavailable') });
    }
  });
}

/**
 * 测试专用：读取当前 owner。
 *
 * @returns 当前 owner 或空。
 */
export function getActiveSidePanelOwnerForTest(): SidePanelOwnerRecord | null {
  return activeOwner;
}

/**
 * 测试专用：重置单 owner 服务内存状态。
 */
export function resetSidePanelServiceForTest(): void {
  activeOwner = null;
  ownerGeneration = 0;
  connectedPort = null;
  loadedPort = null;
  loadedGeneration = 0;
  expectedLoadedGeneration = 0;
  loadedWaiters.clear();
  rejectPendingCommands();
  ownerCancelHandler = null;
}
