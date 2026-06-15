/**
 * 说明：`service-worker` 后台运行时模块。
 *
 * 职责：
 * - 承载 `service-worker` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：Service Worker（Manifest V3）
 *
 * 职责：
 * - 扩展的"消息总线"：路由与转发 Content Script / Side Panel 之间的消息
 * - 打开 Side Panel（按 tabId 定位）
 * - 创建 Offscreen Document（为 DOMParser/WebGPU 等 SW 不具备的能力做准备）
 * - 把聊天请求转为真实的流式输出
 *
 * 模块拆分（H-7）：
 * - port-manager.ts — UI Port 管理与消息广播
 * - offscreen-manager.ts — 离屏文档生命周期
 * - backup-scheduler.ts — 备份调度（alarms）
 * - embedding-handler.ts — 向量嵌入生成
 */
import "./extension-api-global";
import { createSwPluginHost } from "../../plugins/sw/host";
import type { SwInboundMessage } from "../../types/sw-messages";
import { SW_PLUGINS } from "../../plugins/sw/registry";
import { createMessageHandlerMap, createOneShotHandlerMap, type ActiveRequestEntry } from "./message-handlers";
import { abortTrackedPortTasksForPort } from "./message-handlers/port-lifecycle";
import { getStorageAdapter } from "../../lib/storage/storage-adapter";
import { consumeBackgroundStoragePromise } from "@/lib/storage/background-storage";
import { I18nError } from "../../lib/i18n/error";
import { installExtensionWorkerRuntimeGuard } from "@/lib/dev/extension-context-guard";
import {
  isBrowserContextCollectableUrl,
  resolvePreferredBrowserContextTab,
} from "@/lib/browser-context/tab-resolver";
import { loadBrowserContextSettings } from "@/lib/browser-context/settings";

// 说明：H-7：从拆分模块导入
import {
  uiPorts,
  sidePanelUiPorts,
  safePostMessage,
  postToAllUi,
  registerUiPort,
  unregisterUiPort,
  type UiEvent,
} from "./port-manager";
import {
  hasOffscreenDocument,
  maybeAutoCloseOffscreen,
  loadOffscreenUnloadConfig,
  getOffscreenPort,
  setOffscreenPort,
  getOffscreenPending,
  getOffscreenUnloadKey,
} from "./offscreen-manager";
import {
  configureChromiumActionPanelBehavior,
  getChromeSidePanelOpen,
  installFirefoxActionClickHandler,
  openPanelForTab,
  openPanelForTabFromUserGesture,
} from "./side-panel";
import {
  beginPageToolSidePanelOwner,
  cancelPageToolSidePanelOwner,
  claimPageToolSidePanelOwner,
  markSidePanelPageToolBridgeReady,
  postPageToolCommandToSidePanel,
  registerSidePanelPageToolPort,
  resolveSidePanelPageToolCommandAck,
  setPageToolSidePanelOwnerCancelHandler,
  unregisterSidePanelPageToolPort,
} from "./side-panel-service";
import { deletePageToolSession } from "./page-tool-session";
import { sendExtensionTabMessage } from "@/lib/extension/runtime-api";
import {
  applyLocalBackupSchedule,
  applyCloudBackupSchedules,
  runLocalBackupAuto,
  runWebDavAuto,
  runS3Auto,
} from "./backup-scheduler";
import {
  LOCAL_BACKUP_KEY,
  LOCAL_BACKUP_ALARM,
  WEBDAV_KEY,
  WEBDAV_ALARM,
  S3_KEY,
  S3_ALARM,
} from "./backup-scheduler-contract";
import { refreshModelRegistryInBackground } from "@/lib/ai/model-registry/background-refresh";
import {
  getTechnologyStackPageKeyForTab,
  installTechnologyStackNetworkListeners,
  noteTechnologyStackNavigationEpoch,
  warmTechnologyStackForTab,
} from "./technology-stack";
import {
  DEFAULT_SW_KEEPALIVE_CONFIG,
  SW_KEEPALIVE_CONFIG_KEY,
  normalizeSwKeepAliveConfig,
  shouldRewriteSwKeepAliveConfig,
  type SwKeepAliveConfig,
} from "@/lib/extension/sw-keepalive-config";
import { createServiceWorkerOneShotRouter } from "./runtime/one-shot-router";
import { createServiceWorkerPortRouter } from "./runtime/port-router";

// 后台运行时守卫：
// - 普通业务网络失败不再升级成扩展级“崩溃错误”；
// - 真实代码错误仍继续冒出，避免把后台异常静默吞掉。
installExtensionWorkerRuntimeGuard();

// ─── 常量 ──────────────────────────────────────────────────

/** 用于维持 SW 活性的心跳 alarm 名称。 */
const HEARTBEAT_ALARM = "olyq/heartbeat";

// ─── 运行时状态 ────────────────────────────────────────────

const swStartedAt = Date.now();
let lastAlarmAt = 0;

// 记录正在进行的流式对话/媒体生成，用于取消/断线清理（键为 requestId）
const activeChats = new Map<string, ActiveRequestEntry>();
const activeImages = new Map<string, ActiveRequestEntry>();
const activeTranscriptions = new Map<string, ActiveRequestEntry>();
const activeSpeeches = new Map<string, ActiveRequestEntry>();
const activeObjects = new Map<string, ActiveRequestEntry>();
// 工具调用 ID -> requestId（用于在 toolCall 维度定位/取消对应的生成请求）
const toolCallToRequestId = new Map<string, string>();
// 健康检查请求表（键为 requestId；每个请求持有 AbortController 与回传 port）
const activeHealthChecks = new Map<string, { controller: AbortController; port: chrome.runtime.Port }>();

// ─── 保活（KeepAlive） ─────────────────────────────────────

/** 获取默认 SW 保活配置。 */
function getDefaultKeepAliveConfig(): SwKeepAliveConfig {
  return { ...DEFAULT_SW_KEEPALIVE_CONFIG };
}

/** 从存储层读取并归一化 SW 保活配置。 */
async function loadKeepAliveConfig(): Promise<SwKeepAliveConfig> {
  const res = await getStorageAdapter().get([SW_KEEPALIVE_CONFIG_KEY]);
  const raw = res[SW_KEEPALIVE_CONFIG_KEY];
  const next = normalizeSwKeepAliveConfig(raw);
  if (shouldRewriteSwKeepAliveConfig(raw)) {
    await getStorageAdapter().set({ [SW_KEEPALIVE_CONFIG_KEY]: next });
  }
  return next;
}

/**
 * 应用并持久化 SW 保活配置。
 *
 * 说明：
 * - `alarmsEnabled=true` 时会立刻重建心跳 alarm；
 * - `alarmsEnabled=false` 时会清掉心跳 alarm，但不会影响其他备份类 alarms。
 */
async function applyKeepAliveConfig(cfg: SwKeepAliveConfig, options: { persist?: boolean } = {}) {
  const next = normalizeSwKeepAliveConfig(cfg);
  if (next.alarmsEnabled) {
    chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: next.periodInMinutes });
  } else {
    chrome.alarms.clear(HEARTBEAT_ALARM);
  }
  if (options.persist === false) return;
  await getStorageAdapter().set({ [SW_KEEPALIVE_CONFIG_KEY]: next });
}

/** 标记是否仍需要执行一轮延后的空闲目录刷新。 */
let needsDeferredModelRegistryWarmup = true;

/**
 * 读取当前构建目标。
 *
 * 说明：
 * - Vite 构建会把 `__OLYQ_BUILD_CONFIG__` 内联为静态常量；
 * - 测试环境可能不会注入该常量，因此保留安全读取，避免单测直接 import 后 ReferenceError。
 */
function getRuntimeTargetBrowser(): "chromium" | "firefox" {
  return typeof __OLYQ_BUILD_CONFIG__ === "object" ? __OLYQ_BUILD_CONFIG__.target : "chromium";
}

/**
 * 在非热路径里触发一次模型注册表刷新。
 *
 * 说明：
 * - SW 启动时不再同步预热模型目录，避免拖慢面板打开与首条消息；
 * - 延后的刷新只会在当前没有 UI/流式任务时执行一次。
 */
function requestDeferredModelRegistryWarmup(reason: "swIdle") {
  if (!needsDeferredModelRegistryWarmup) return;
  if (
    uiPorts.size > 0
    || activeChats.size > 0
    || activeImages.size > 0
    || activeTranscriptions.size > 0
    || activeSpeeches.size > 0
    || activeObjects.size > 0
  ) return;
  needsDeferredModelRegistryWarmup = false;
  void refreshModelRegistryInBackground(reason).catch(() => {
    needsDeferredModelRegistryWarmup = true;
  });
}

/** 获取当前活动标签页 ID。 */
function getActiveTabId(): Promise<number | null> {
  return resolvePreferredBrowserContextTab().then((tab) => (typeof tab?.id === "number" ? tab.id : null));
}

/**
 * 确保侧边栏已打开。
 *
 * 说明：
 * - Chromium 需要明确的 `tabId`，Firefox Sidebar 不依赖 tabId；
 * - 若调用方未提供 `tabId`，这里会主动读取当前活动标签页。
 */
async function ensurePanel(tabId?: number | null) {
  // Chromium Side Panel 需要 tabId；Firefox Sidebar 不需要。
  const id = typeof tabId === "number" ? tabId : await getActiveTabId();
  if (getChromeSidePanelOpen()) {
    if (!id) return;
    await openPanelForTab(id);
    return;
  }
  await openPanelForTab(typeof id === "number" ? id : 0);
}

setPageToolSidePanelOwnerCancelHandler((owner, _reason) => {
  deletePageToolSession(owner.sessionId);
  void sendExtensionTabMessage(owner.tabId, {
    type: 'page-tool/session/cancel',
    payload: {
      ...(owner.sessionId ? { sessionId: owner.sessionId } : {}),
      tool: owner.tool,
      reason: 'replace',
    },
  }).catch(() => {
    // 旧 tab 可能已经关闭或 content script 被浏览器回收；owner 已失效即可。
  });
});

// ─── SW 状态 ──────────────────────────────────────────────

/** 读取当前 SW 的轻量状态快照。 */
async function getSwStatus() {
  return {
    startedAt: swStartedAt,
    lastAlarmAt,
    uiPortCount: uiPorts.size,
    offscreenDoc: await hasOffscreenDocument(),
    offscreenPortConnected: Boolean(getOffscreenPort()),
  };
}

// ─── 插件宿主（Plugin Host） ────────────────────────────────

const swPluginHost = createSwPluginHost({
  plugins: SW_PLUGINS,
  runtime: {
    postUiEvent: (evt) => postToAllUi(evt as UiEvent),
    beginPageToolSidePanelOwner,
    cancelPageToolSidePanelOwner,
    claimPageToolSidePanelOwner,
    postPageToolCommandToSidePanel: (generation, evt) => postPageToolCommandToSidePanel(generation, evt as UiEvent),
    ensurePanel,
    openPanelForTabFromUserGesture,
    getActiveTabId,
  },
});

// ─── B1：浏览器上下文 metadata（Browser Context Metadata） ───────

/**
 * 采集并推送指定标签页的 metadata。
 *
 * 说明：
 * - 只维护轻量 metadata，不做正文采集；
 * - 总开关关闭时主动向 UI 推送 `null`，避免“已关闭但仍显示旧页面”的歧义状态；
 * - 浏览器内部页和扩展页会直接清空 metadata，正文缓存由 UI 侧统一失效。
 */
async function pushBrowserContextMetadataForTab(tabId: number) {
  if (sidePanelUiPorts.size === 0) return;
  const settings = await loadBrowserContextSettings();
  if (!settings.enabled) {
    for (const port of sidePanelUiPorts) {
      safePostMessage(port, { type: 'browser-context/metadata/update', payload: null });
    }
    return;
  }

  const tab = await resolvePreferredBrowserContextTab(tabId);
  if (!tab?.url || typeof tab.id !== 'number' || !isBrowserContextCollectableUrl(tab.url)) {
    for (const port of sidePanelUiPorts) {
      safePostMessage(port, { type: 'browser-context/metadata/update', payload: null });
    }
    return;
  }

  const payload = {
    title: tab.title || '',
    url: tab.url,
    favicon: tab.favIconUrl || '',
    tabId: tab.id,
    extractedAt: Date.now(),
    technologyStackPageKey: getTechnologyStackPageKeyForTab(tab.id, tab.url),
  };

  for (const p of sidePanelUiPorts) {
    safePostMessage(p, { type: 'browser-context/metadata/update', payload });
  }
  void warmTechnologyStackForTab({
    tabId: tab.id,
    url: tab.url,
    title: tab.title || '',
    reason: 'metadata',
  });
}

/** 按 tabId 解析当前普通网页并触发技术栈自动预热。 */
async function warmTechnologyStackForBrowserTab(tabId: number, reason: 'tab-activated' | 'window-focus' | 'tab-complete'): Promise<void> {
  const tab = await resolvePreferredBrowserContextTab(tabId);
  if (!tab?.url || typeof tab.id !== 'number' || !isBrowserContextCollectableUrl(tab.url)) return;
  await warmTechnologyStackForTab({
    tabId: tab.id,
    url: tab.url,
    title: tab.title || '',
    reason,
  });
}

// ─── 消息处理映射表（Handler Map） ──────────────────────────

/** 供 `message-handlers.ts` 使用的宿主上下文。 */
const handlerCtx = {
  activeChats,
  activeImages,
  activeTranscriptions,
  activeSpeeches,
  activeObjects,
  toolCallToRequestId,
  activeHealthChecks,
  ensurePanel,
  openPanelForTabFromUserGesture,
  getActiveTabId,
  pushBrowserContextMetadataForTab,
  getSwStatus,
  applyKeepAliveConfig,
  postToAllUi,
  beginPageToolSidePanelOwner,
  cancelPageToolSidePanelOwner,
  claimPageToolSidePanelOwner,
  postPageToolCommandToSidePanel,
  loadKeepAliveConfig,
};

const handlerMap = createMessageHandlerMap(handlerCtx);
const oneShotMap = createOneShotHandlerMap(handlerCtx);
const portRouter = createServiceWorkerPortRouter(handlerMap);
const oneShotRouter = createServiceWorkerOneShotRouter(oneShotMap);

installTechnologyStackNetworkListeners();
configureChromiumActionPanelBehavior(getRuntimeTargetBrowser());
installFirefoxActionClickHandler(getRuntimeTargetBrowser(), ensurePanel);

// ─── 初始化（Initialization） ───────────────────────────────

/**
 * 扩展安装/更新后的初始化收敛。
 *
 * 说明：
 * - 这里适合做“建立默认配置、恢复定时任务、预热静态能力”这类一次性动作；
 * - 不能依赖 SW 常驻，因此启动时还会有一轮独立恢复逻辑。
 */
chrome.runtime.onInstalled.addListener(() => {
  consumeBackgroundStoragePromise(applyKeepAliveConfig(getDefaultKeepAliveConfig()), {
    key: SW_KEEPALIVE_CONFIG_KEY,
    operation: 'set',
    owner: 'service-worker.onInstalled.keepAlive',
  });
  consumeBackgroundStoragePromise(applyLocalBackupSchedule({ mode: 'reschedule' }), {
    key: LOCAL_BACKUP_KEY,
    operation: 'reload',
    owner: 'service-worker.onInstalled.localBackupSchedule',
  });
  consumeBackgroundStoragePromise(applyCloudBackupSchedules(), {
    key: [WEBDAV_KEY, S3_KEY],
    operation: 'reload',
    owner: 'service-worker.onInstalled.cloudBackupSchedules',
  });
  needsDeferredModelRegistryWarmup = false;
  void refreshModelRegistryInBackground("onInstalled", { force: true }).catch(() => {
    needsDeferredModelRegistryWarmup = true;
  });
  configureChromiumActionPanelBehavior(getRuntimeTargetBrowser());
});

// 在 SW 启动时根据当前配置恢复 alarms（MV3：SW 会反复被回收并重启）
consumeBackgroundStoragePromise(applyLocalBackupSchedule({ mode: 'preserve-existing' }), {
  key: LOCAL_BACKUP_KEY,
  operation: 'reload',
  owner: 'service-worker.startup.localBackupSchedule',
});
consumeBackgroundStoragePromise(applyCloudBackupSchedules(), {
  key: [WEBDAV_KEY, S3_KEY],
  operation: 'reload',
  owner: 'service-worker.startup.cloudBackupSchedules',
});
consumeBackgroundStoragePromise(loadOffscreenUnloadConfig(), {
  key: getOffscreenUnloadKey(),
  operation: 'reload',
  owner: 'service-worker.startup.offscreenUnloadConfig',
});
consumeBackgroundStoragePromise(
  loadKeepAliveConfig().then((cfg) => applyKeepAliveConfig(cfg, { persist: false })),
  {
    key: SW_KEEPALIVE_CONFIG_KEY,
    operation: 'reload',
    owner: 'service-worker.startup.keepAliveConfig',
  },
);

// ─── 存储变更监听（Storage Change Listeners） ───────────────

/** 存储变化后按 key 精准收敛对应后台配置。 */
getStorageAdapter().onChange((changes) => {
  if (LOCAL_BACKUP_KEY in changes) {
    consumeBackgroundStoragePromise(applyLocalBackupSchedule({ mode: 'reschedule' }), {
      key: LOCAL_BACKUP_KEY,
      operation: 'reload',
      owner: 'service-worker.storageChanged.localBackupSchedule',
    });
  }
  if (WEBDAV_KEY in changes || S3_KEY in changes) {
    consumeBackgroundStoragePromise(applyCloudBackupSchedules(), {
      key: [WEBDAV_KEY, S3_KEY],
      operation: 'reload',
      owner: 'service-worker.storageChanged.cloudBackupSchedules',
    });
  }
  if (getOffscreenUnloadKey() in changes) {
    consumeBackgroundStoragePromise(loadOffscreenUnloadConfig(), {
      key: getOffscreenUnloadKey(),
      operation: 'reload',
      owner: 'service-worker.storageChanged.offscreenUnloadConfig',
    });
  }
  if (SW_KEEPALIVE_CONFIG_KEY in changes) {
    consumeBackgroundStoragePromise(
      loadKeepAliveConfig().then((cfg) => applyKeepAliveConfig(cfg, { persist: false })),
      {
        key: SW_KEEPALIVE_CONFIG_KEY,
        operation: 'reload',
        owner: 'service-worker.storageChanged.keepAliveConfig',
      },
    );
  }
});

// ─── Alarm 监听（定时器） ───────────────────────────────────

/** 统一处理 SW 内的心跳与自动备份 alarms。 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) {
    lastAlarmAt = Date.now();
    void maybeAutoCloseOffscreen("heartbeat");
    requestDeferredModelRegistryWarmup("swIdle");
    return;
  }
  if (alarm.name === LOCAL_BACKUP_ALARM) {
    consumeBackgroundStoragePromise(runLocalBackupAuto(), {
      key: LOCAL_BACKUP_KEY,
      operation: 'sync',
      owner: 'service-worker.alarm.localBackupAuto',
    });
    return;
  }
  if (alarm.name === WEBDAV_ALARM) {
    consumeBackgroundStoragePromise(runWebDavAuto(), {
      key: WEBDAV_KEY,
      operation: 'sync',
      owner: 'service-worker.alarm.webDavAuto',
    });
    return;
  }
  if (alarm.name === S3_ALARM) {
    consumeBackgroundStoragePromise(runS3Auto(), {
      key: S3_KEY,
      operation: 'sync',
      owner: 'service-worker.alarm.s3Auto',
    });
  }
});

// ─── Tab 监听（浏览器上下文 metadata） ────────────────────────

/** 激活标签页切换时推送新的 metadata。 */
chrome.tabs.onActivated.addListener((activeInfo) => {
  void pushBrowserContextMetadataForTab(activeInfo.tabId);
  void warmTechnologyStackForBrowserTab(activeInfo.tabId, 'tab-activated');
});

/** 当前活动标签页加载完成后，刷新 metadata。 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  let technologyStackEpochMoved = false;
  if (typeof changeInfo.url === 'string' && isBrowserContextCollectableUrl(changeInfo.url)) {
    noteTechnologyStackNavigationEpoch(tabId, { clearNetwork: false, url: changeInfo.url });
    technologyStackEpochMoved = true;
    void getActiveTabId().then((activeId) => {
      if (activeId === tabId) void pushBrowserContextMetadataForTab(tabId);
    });
    void warmTechnologyStackForTab({
      tabId,
      url: changeInfo.url,
      title: tab.title || '',
      reason: 'tab-complete',
    });
  }
  if (changeInfo.status === 'loading' && !technologyStackEpochMoved) {
    noteTechnologyStackNavigationEpoch(tabId, { clearNetwork: true });
  }
  if (changeInfo.status !== 'complete') return;
  void getActiveTabId().then((activeId) => {
    if (activeId === tabId) void pushBrowserContextMetadataForTab(tabId);
  });
  if (tab.url && isBrowserContextCollectableUrl(tab.url)) {
    void warmTechnologyStackForTab({
      tabId,
      url: tab.url,
      title: tab.title || '',
      reason: 'tab-complete',
    });
  }
});

/** 焦点窗口切换时，重新选择当前真正应绑定的网页上下文。 */
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  void getActiveTabId().then((activeId) => {
    if (activeId) {
      void pushBrowserContextMetadataForTab(activeId);
      void warmTechnologyStackForBrowserTab(activeId, 'window-focus');
      return;
    }
    for (const port of sidePanelUiPorts) {
      safePostMessage(port, { type: 'browser-context/metadata/update', payload: null });
    }
  });
});

// ─── Port 连接（长连接消息） ─────────────────────────────────

/**
 * 处理长连接 Port。
 *
 * 说明：
 * - `olyq:ui` 负责 UI 与后台的共享长连接消息；
 * - `olyq:sidepanel` 只负责页面工具结果进入主工作区的单 owner 命令；
 * - `olyq:offscreen` 负责离屏文档 RPC 回包与断线清理。
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "olyq:sidepanel") {
    registerSidePanelPageToolPort(port);
    port.onMessage.addListener((msg) => {
      if (!msg || typeof msg !== 'object') return;
      const record = msg as Record<string, unknown>;
      if (record.type === 'sidepanel/page-tool-bridge-ready') {
        markSidePanelPageToolBridgeReady(
          port,
          typeof record.generation === 'number' ? record.generation : undefined,
        );
        return;
      }
      if (record.type === 'sidepanel/page-tool-command-ack') {
        resolveSidePanelPageToolCommandAck(port, record);
      }
    });
    port.onDisconnect.addListener(() => {
      unregisterSidePanelPageToolPort(port);
    });
    return;
  }

  if (port.name === "olyq:ui") {
    const registration = registerUiPort(port);
    // 修复 P1-5：通知 UI 侧 SW 已重启，让其清理所有 pending 请求状态
    safePostMessage(port, { type: 'sw/restarted' });
    if (registration.sidePanel) {
      void getActiveTabId().then((activeId) => {
        if (activeId) void pushBrowserContextMetadataForTab(activeId);
      });
    }

    port.onMessage.addListener((msg) => {
      portRouter.dispatch(msg, { port });
    });

    port.onDisconnect.addListener(() => {
      unregisterUiPort(port);

      // UI 端口断线后，统一 abort 绑定在该端口上的所有活动请求，避免后台继续向失效端口写事件。
      abortTrackedPortTasksForPort(activeChats, port, (cur) => {
        for (const toolCallId of cur.toolCallIds) toolCallToRequestId.delete(toolCallId);
      });
      abortTrackedPortTasksForPort(activeImages, port);
      abortTrackedPortTasksForPort(activeTranscriptions, port);
      abortTrackedPortTasksForPort(activeSpeeches, port);
      abortTrackedPortTasksForPort(activeObjects, port);
      abortTrackedPortTasksForPort(activeHealthChecks, port);
    });
    return;
  }

  if (port.name === "olyq:offscreen") {
    setOffscreenPort(port);
    const offscreenPending = getOffscreenPending();

    port.onMessage.addListener((msg) => {
      if (!msg?.type) return;
      const requestId = typeof msg.requestId === "string" ? msg.requestId : String(msg.requestId || "");
      if (requestId && offscreenPending.has(requestId)) {
        const pending = offscreenPending.get(requestId)!;
        offscreenPending.delete(requestId);
        try { clearTimeout(pending.timer); } catch { /* 忽略 */ }
        pending.resolve(msg);
        return;
      }
    });

    port.onDisconnect.addListener(() => {
      if (getOffscreenPort() === port) setOffscreenPort(null);
      // Offscreen 断线时必须把所有挂起 RPC 一次性 reject，避免调用方永久等待。
      for (const [id, pending] of offscreenPending) {
        offscreenPending.delete(id);
        try { clearTimeout(pending.timer); } catch { /* 忽略 */ }
        pending.reject(new I18nError("errors.offscreenDisconnected"));
      }
    });
  }
});

// ─── One-shot 消息（sendMessage） ───────────────────────────

/** 处理一次性 `sendMessage` 请求。 */
chrome.runtime.onMessage.addListener((rawMsg, sender, sendResponse) => {
  if (!rawMsg?.type) return;

  const msg = rawMsg as SwInboundMessage;

  const pluginResult = swPluginHost.dispatch({
    msg: { type: msg.type, payload: 'payload' in msg ? msg.payload : undefined },
    sender,
    sendResponse,
  });
  if (typeof pluginResult === "boolean") return pluginResult;

  const route = oneShotRouter.dispatch(rawMsg, { sender, sendResponse });
  if (route.handled) return route.result;
});
