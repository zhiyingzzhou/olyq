/**
 * 说明：`side-panel` 后台运行时模块。
 *
 * 职责：
 * - 集中封装 Chromium Side Panel 与 Firefox Sidebar 的打开动作；
 * - 隔离浏览器 API 的 Promise / callback 形态差异，避免消息路由层重复处理。
 *
 * 边界：
 * - 本模块只负责“尝试打开侧边栏”，不决定何时投递 UI 事件，也不读取业务存储。
 */
import {
  expectSidePanelPageToolBridgeReady,
  isSidePanelPageToolLoadedForOpen,
  requestSidePanelPageToolBridgeReady,
  waitForSidePanelPageToolLoaded,
} from './side-panel-service';

/** Chromium `sidePanel.open` 的最小运行时签名。 */
export type ChromeSidePanelOpen = {
  /** Promise 形态：Manifest V3 下推荐使用，调用方可通过返回值吞掉拒绝。 */
  (options: { tabId: number }): Promise<void> | void;
  /** callback 形态：部分运行时仍会通过 `runtime.lastError` 暴露失败。 */
  (options: { tabId: number }, callback: () => void): void;
};

/** Chromium `sidePanel.setOptions` 的最小运行时签名。 */
export type ChromeSidePanelSetOptions = {
  /** Promise 形态。 */
  (options: { tabId?: number; path?: string; enabled?: boolean }): Promise<void> | void;
  /** callback 形态。 */
  (options: { tabId?: number; path?: string; enabled?: boolean }, callback: () => void): void;
};

/** Firefox 风格 `sidebarAction` 句柄的最小能力描述。 */
type SidebarActionLike = {
  /** 打开浏览器侧边栏；不同浏览器可能返回 `void` 或 `Promise`。 */
  open?: () => unknown
};

/** 当前浏览器全局对象里与 Sidebar 相关的最小 API 视图。 */
type BrowserLike = {
  /** Firefox 环境下注入的 sidebarAction 入口。 */
  sidebarAction?: SidebarActionLike
};

/** 扩展 toolbar action 点击事件的最小能力描述。 */
type ActionLike = {
  /** 点击扩展 toolbar action 时触发的事件。 */
  onClicked?: {
    /** 注册点击监听器。 */
    addListener?: (callback: (tab: { id?: number }) => void) => void;
  };
};

/** 当前全局对象中和侧边栏相关的浏览器 API 视图。 */
type SidePanelGlobalApi = {
  /** Chrome / Chromium 扩展 API。 */
  chrome?: {
    /** MV3 toolbar action API。 */
    action?: ActionLike;
    /** Chromium Side Panel API。 */
    sidePanel?: { open?: unknown; close?: unknown; setOptions?: unknown; setPanelBehavior?: unknown };
    /** Chromium runtime API，用于读取 callback 窗口内的 lastError。 */
    runtime?: { lastError?: unknown };
    /** 少数 Chromium 兼容环境可能暴露的 sidebarAction。 */
    sidebarAction?: SidebarActionLike;
  };
  /** Firefox WebExtensions API。 */
  browser?: BrowserLike & { action?: ActionLike };
};

/** Olyq Chromium Side Panel 页面路径。 */
const SIDEPANEL_PAGE_PATH = 'src/extension/sidepanel/index.html';

/** Chromium Side Panel API 的最小可调用视图。 */
type ChromeSidePanelApi = NonNullable<NonNullable<SidePanelGlobalApi['chrome']>['sidePanel']>;

/**
 * 获取 Chromium `sidePanel.open` 的安全调用句柄。
 *
 * 说明：
 * - 类型定义层面该 API 可能被视为总是存在，但真实运行环境未必支持；
 * - 因此这里必须做运行时探测，避免在 Firefox 等环境直接崩溃。
 */
export function getChromeSidePanelOpen(): ChromeSidePanelOpen | null {
  const sidePanel = (globalThis as unknown as SidePanelGlobalApi).chrome?.sidePanel as ChromeSidePanelApi | undefined;
  if (typeof sidePanel?.open !== 'function') return null;
  return ((options: { tabId: number }, callback?: () => void) => {
    if (callback) {
      (sidePanel.open as ChromeSidePanelOpen)(options, callback);
      return;
    }
    return (sidePanel.open as ChromeSidePanelOpen)(options);
  }) as ChromeSidePanelOpen;
}

/**
 * 判断一个返回值是否像 Promise。
 *
 * @param value - 浏览器 API 返回值。
 * @returns 是否可以安全调用 `catch`。
 */
function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(value && typeof (value as { catch?: unknown }).catch === 'function');
}

/**
 * 读取 callback 风格扩展 API 暴露的 lastError。
 *
 * 说明：
 * - Chrome 的 callback API 只要求调用方“读取” lastError 即可避免控制台噪声；
 * - 页面工具恢复 / 隐藏依赖这条链路，必须把失败交回调用方处理，避免假成功。
 */
function readRuntimeLastErrorMessage(): string | null {
  const message = (globalThis as unknown as SidePanelGlobalApi).chrome?.runtime?.lastError;
  const text = typeof (message as { message?: unknown } | undefined)?.message === 'string'
    ? String((message as { message?: string }).message || '').trim()
    : '';
  return text || null;
}

/**
 * 等待 Sidepanel 页面工具 bridge loaded。
 *
 * @param generation - 页面工具会话代际；缺省时沿用普通主面板打开语义。
 */
async function waitForPageToolBridgeLoaded(generation?: number): Promise<boolean> {
  return typeof generation === 'number'
    ? await waitForSidePanelPageToolLoaded(generation)
    : await waitForSidePanelPageToolLoaded();
}

/**
 * 调用 Chromium Side Panel API。
 *
 * @param sidePanelApi - Chromium `chrome.sidePanel` 对象。
 * @param tabId - 需要打开侧边栏的标签页 ID。
 */
async function openChromeSidePanelForTab(sidePanelApi: ChromeSidePanelApi, tabId: number): Promise<void> {
  await callChromeSidePanelMethod(sidePanelApi, 'open', { tabId });
}

/**
 * 恢复 Chromium 全局 Side Panel 的 Olyq 页面配置。
 *
 * 说明：
 * - 当前 manifest 使用 `side_panel.default_path` 全局面板；
 * - 打开前只恢复全局 path/enabled，不写 `tabId`，避免生成 tab-specific panel 实例；
 * - 失败只表示当前浏览器暂时不能配置 side panel，不额外发明 fallback。
 *
 */
async function enableChromeSidePanelForOpen(): Promise<void> {
  const sidePanelApi = (globalThis as unknown as SidePanelGlobalApi).chrome?.sidePanel as ChromeSidePanelApi | undefined;
  if (typeof sidePanelApi?.setOptions !== 'function') return;
  await callChromeSidePanelMethod(sidePanelApi, 'setOptions', {
    path: SIDEPANEL_PAGE_PATH,
    enabled: true,
  });
}

/**
 * 调用 Chromium Side Panel 的 Promise / callback 双形态 API。
 *
 * @param sidePanelApi - Chrome 原生 `chrome.sidePanel` 对象，必须作为 receiver 保留。
 * @param methodName - 需要调用的 sidePanel 方法名。
 * @param options - 传给浏览器 API 的参数。
 */
async function callChromeSidePanelMethod<TOptions extends object>(
  sidePanelApi: ChromeSidePanelApi,
  methodName: 'open' | 'setOptions',
  options: TOptions,
): Promise<void> {
  const fn = sidePanelApi[methodName];
  if (typeof fn !== 'function') return;

  return await new Promise<void>((resolve, reject) => {
    try {
      if (fn.length >= 2) {
        (sidePanelApi[methodName] as (opts: TOptions, callback: () => void) => void)(options, () => {
          const detail = readRuntimeLastErrorMessage();
          if (detail) {
            reject(new Error(detail));
            return;
          }
          resolve();
        });
        return;
      }
      const result = (sidePanelApi[methodName] as (opts: TOptions) => Promise<void> | void)(options);
      if (isPromiseLike(result)) {
        void result.then(() => resolve()).catch((error: unknown) => reject(error));
        return;
      }
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 调用 Firefox 风格 Sidebar API。
 */
async function openFirefoxSidebar(): Promise<void> {
  const browserApi = (globalThis as unknown as SidePanelGlobalApi).browser;
  const chromeApi = (globalThis as unknown as SidePanelGlobalApi).chrome;
  const sidebarAction = browserApi?.sidebarAction ?? chromeApi?.sidebarAction;
  if (!sidebarAction?.open) return;
  try {
    const result = sidebarAction.open();
    if (isPromiseLike(result)) await result.catch(() => {});
  } catch {
    // 忽略：不同浏览器/版本在 sidebarAction.open 的异常行为不一致。
  }
}

/**
 * 在当前浏览器里打开侧边栏。
 *
 * 说明：
 * - Chromium 走 `sidePanel.open({ tabId })`；
 * - Firefox 风格环境走 `sidebarAction.open()`；
 * - Chromium 失败会抛给调用方，由页面工具会话恢复或 UI toast 处理；
 * - Firefox 仍保持显式 no-op/尽力打开语义，不做隐藏 fallback 或额外权限探测。
 *
 * @param tabId - Chromium Side Panel 需要的目标标签页 ID。
 */
export async function openPanelForTab(tabId: number): Promise<void> {
  const sidePanelApi = (globalThis as unknown as SidePanelGlobalApi).chrome?.sidePanel as ChromeSidePanelApi | undefined;
  if (typeof sidePanelApi?.open === 'function') {
    await enableChromeSidePanelForOpen();
    await openChromeSidePanelForTab(sidePanelApi, tabId);
    await waitForSidePanelPageToolLoaded();
    return;
  }

  await openFirefoxSidebar();
  await waitForSidePanelPageToolLoaded();
}

/**
 * 在内容脚本用户点击链路里打开当前 tab 的 Side Panel。
 *
 * 说明：
 * - Chrome 要求 `sidePanel.open()` 贴近用户手势调用；
 * - 稳定时序是先发起全局 `setOptions({ path, enabled:true })`，再立刻
 *   `open({ tabId })`，因此这里不能先 `await sidePanel.setOptions()`，否则 content script 到 SW 消息链路里的
 *   用户手势窗口会被异步边界吃掉，真实浏览器会拒绝打开；
 * - `setOptions()` 仍然会被发起并在 `open()` 后收敛结果，确保当前 tab 的 path/enabled
 *   配置错误不会静默通过；
 * - Firefox 没有 Chromium Side Panel，同步走既有 Sidebar 尽力打开语义。
 *
 * @param tabId - 当前页面工具会话所属网页 tabId。
 */
export async function openPanelForTabFromUserGesture(tabId: number, pageToolGeneration?: number): Promise<void> {
  const sidePanelApi = (globalThis as unknown as SidePanelGlobalApi).chrome?.sidePanel as ChromeSidePanelApi | undefined;
  if (typeof pageToolGeneration === 'number') expectSidePanelPageToolBridgeReady(pageToolGeneration);
  if (isSidePanelPageToolLoadedForOpen(pageToolGeneration)) return;
  if (typeof sidePanelApi?.open === 'function') {
    const enableTask = typeof sidePanelApi.setOptions === 'function'
      ? callChromeSidePanelMethod(sidePanelApi, 'setOptions', {
          path: SIDEPANEL_PAGE_PATH,
          enabled: true,
        })
      : Promise.resolve();
    const openTask = callChromeSidePanelMethod(sidePanelApi, 'open', { tabId });

    const openResult = await Promise.allSettled([enableTask, openTask]);
    const enableOutcome = openResult[0];
    const openOutcome = openResult[1];
    if (openOutcome.status === 'rejected') throw openOutcome.reason;
    if (enableOutcome.status === 'rejected') throw enableOutcome.reason;
    if (typeof pageToolGeneration === 'number') requestSidePanelPageToolBridgeReady(pageToolGeneration);
    if (!(await waitForPageToolBridgeLoaded(pageToolGeneration))) {
      throw new Error('side panel UI port unavailable');
    }
    return;
  }

  await openFirefoxSidebar();
  if (!(await waitForPageToolBridgeLoaded(pageToolGeneration))) {
    throw new Error('side panel UI port unavailable');
  }
}

/**
 * 为页面工具会话关闭 Chromium Side Panel。
 *
 * 说明：
 * - 页面工具会话以当前网页 tab 为唯一 owner；
 * - 但当前 Chromium manifest 使用 `default_path` 全局 Side Panel，因此隐藏动作必须采用
 *   全局 disable / enable，不能写成 tab-specific panel 配置；
 * - Firefox Sidebar 没有稳定的按 tab 关闭 API，本函数在 Firefox 下保持 no-op。
 *
 * @param tabId - 当前页面工具作用的网页 tabId。
 */
export async function closePanelForPageToolSession(tabId: number): Promise<void> {
  void tabId;
  const sidePanelApi = (globalThis as unknown as SidePanelGlobalApi).chrome?.sidePanel as ChromeSidePanelApi | undefined;
  if (typeof sidePanelApi?.setOptions !== 'function') return;
  await callChromeSidePanelMethod(sidePanelApi, 'setOptions', { path: SIDEPANEL_PAGE_PATH, enabled: false });
  await callChromeSidePanelMethod(sidePanelApi, 'setOptions', { path: SIDEPANEL_PAGE_PATH, enabled: true });
}

/**
 * 配置 Chromium toolbar action 直开 Side Panel。
 *
 * 说明：
 * - 当前产品不再声明用户可见 popup，toolbar action 的默认行为就是打开主工作区；
 * - Chromium toolbar action 的打开行为只交给浏览器内建 Side Panel owner；
 * - `sidePanel.open()` 继续只服务页面工具恢复等非 toolbar action 的程序化路径；
 * - 失败只表示当前运行时暂时无法配置该行为，不引入 popup 或标签页 fallback。
 *
 * @param target - 当前构建目标。
 */
export function configureChromiumActionPanelBehavior(target: "chromium" | "firefox"): void {
  if (target !== "chromium") return;
  const sidePanelApi = (globalThis as unknown as SidePanelGlobalApi).chrome?.sidePanel;
  if (typeof sidePanelApi?.setPanelBehavior !== "function") return;

  try {
    const result = (sidePanelApi as { setPanelBehavior(behavior: { openPanelOnActionClick: boolean }): unknown }).setPanelBehavior({
      openPanelOnActionClick: true,
    });
    if (isPromiseLike(result)) void result.catch(() => {});
  } catch {
    // 不做隐藏 fallback；用户仍可通过浏览器侧栏菜单或后续点击恢复。
  }
}

/**
 * 注册 Firefox toolbar action 点击打开 Sidebar。
 *
 * 说明：
 * - Firefox 没有 Chromium 的 `sidePanel.setPanelBehavior`；
 * - `action` 点击事件仍是用户手势窗口，因此直接调用调用方提供的 `ensurePanel`；
 * - 只在 Firefox 构建注册，避免 Chromium 同时触发 action click 与 side panel 默认行为。
 *
 * @param target - 当前构建目标。
 * @param ensurePanel - Service Worker 内部的主面板打开语义。
 */
export function installFirefoxActionClickHandler(
  target: "chromium" | "firefox",
  ensurePanel: (tabId?: number | null) => void | Promise<void>,
): void {
  if (target !== "firefox") return;
  const api = globalThis as unknown as SidePanelGlobalApi;
  const action = api.browser?.action ?? api.chrome?.action;
  action?.onClicked?.addListener?.((tab) => {
    void ensurePanel(tab?.id);
  });
}
