/**
 * 说明：technology-stack 页面 ready 自动预热触发器。
 *
 * 职责：
 * - 在普通 http/https 主 frame 页面 ready 后通知 Service Worker 预热技术栈；
 * - 监听 SPA 路由变化，复用同一条 page-ready 消息刷新后台缓存；
 * - 只上报 URL、标题、readyState 和触发原因，不携带页面原文。
 *
 * 边界：
 * - 不执行技术栈采集，不读取页面原文或 cookie；
 * - 不持久化任何状态，所有运行时哨兵只存在于当前 content script 生命周期。
 */
import { hasExtensionMessageRuntime, sendExtensionMessage } from '@/lib/extension/runtime-api';
import type { SwStdResponse } from '@/types/sw-messages';

const PAGE_READY_DEBOUNCE_MS = 250;
const PAGE_READY_RUNTIME_KEY = '__olyq_technology_stack_page_ready_runtime__';

type TechnologyStackPageReadyReason = 'initial' | 'dom-content-loaded' | 'spa-route' | 'popstate' | 'hashchange';

interface TechnologyStackPageReadyRuntime {
  installed: boolean;
  timer: number | null;
  lastReportedKey: string;
  originalPushState: History['pushState'] | null;
  originalReplaceState: History['replaceState'] | null;
  popstateListener: (() => void) | null;
  hashchangeListener: (() => void) | null;
  domContentLoadedListener: (() => void) | null;
}

/** 读取或创建页面 ready reporter 的跨模块运行时态。 */
function getPageReadyRuntime(): TechnologyStackPageReadyRuntime {
  const host = globalThis as typeof globalThis & { [PAGE_READY_RUNTIME_KEY]?: TechnologyStackPageReadyRuntime };
  if (!host[PAGE_READY_RUNTIME_KEY]) {
    host[PAGE_READY_RUNTIME_KEY] = {
      installed: false,
      timer: null,
      lastReportedKey: '',
      originalPushState: null,
      originalReplaceState: null,
      popstateListener: null,
      hashchangeListener: null,
      domContentLoadedListener: null,
    };
  }
  return host[PAGE_READY_RUNTIME_KEY];
}

/** 判断当前页面是否允许自动上报技术栈 ready。 */
function canReportTechnologyStackPageReady(): boolean {
  if (!/^https?:/i.test(location.href)) return false;
  try {
    if (window.top !== window.self) return false;
  } catch {
    return false;
  }
  return hasExtensionMessageRuntime();
}

/** 向后台上报当前页面已经可以执行技术栈自动预热。 */
function reportTechnologyStackPageReady(reason: TechnologyStackPageReadyReason): void {
  if (!canReportTechnologyStackPageReady()) return;
  const runtime = getPageReadyRuntime();
  const key = `${location.href}::${document.title || ''}::${document.readyState}`;
  if (runtime.lastReportedKey === key) return;
  runtime.lastReportedKey = key;
  void sendExtensionMessage<SwStdResponse>({
    type: 'technology-stack/page-ready',
    payload: {
      url: location.href,
      title: document.title || '',
      readyState: document.readyState,
      reason,
      reportedAt: Date.now(),
    },
  }).catch(() => {
    // 页面自动预热是机会性信号；失败后仍可由 UI / browser-context 按需请求。
  });
}

/** debounce 页面 ready 上报，避免 SPA 路由连续改写造成重复 warm。 */
function scheduleTechnologyStackPageReady(reason: TechnologyStackPageReadyReason): void {
  if (!canReportTechnologyStackPageReady()) return;
  const runtime = getPageReadyRuntime();
  if (runtime.timer) window.clearTimeout(runtime.timer);
  runtime.timer = window.setTimeout(() => {
    runtime.timer = null;
    reportTechnologyStackPageReady(reason);
  }, PAGE_READY_DEBOUNCE_MS);
}

/** 包装 History API，在 SPA 路由变化后触发同一套页面 ready 上报。 */
function installHistoryRouteHooks(runtime: TechnologyStackPageReadyRuntime): void {
  if (!runtime.originalPushState) runtime.originalPushState = history.pushState;
  if (!runtime.originalReplaceState) runtime.originalReplaceState = history.replaceState;

  history.pushState = function pushState(...args) {
    const result = runtime.originalPushState!.apply(this, args);
    scheduleTechnologyStackPageReady('spa-route');
    return result;
  };
  history.replaceState = function replaceState(...args) {
    const result = runtime.originalReplaceState!.apply(this, args);
    scheduleTechnologyStackPageReady('spa-route');
    return result;
  };
}

/**
 * 安装页面生命周期触发器。
 *
 * @remarks
 * content script 静态注入普通网页后，会在页面 ready 时主动唤醒 SW 预热技术栈；
 * SPA 路由变化也走同一条 page-ready 消息，避免 UI 继续展示旧路由结果。
 */
export function installTechnologyStackPageReadyReporter(): void {
  const runtime = getPageReadyRuntime();
  if (runtime.installed) return;
  runtime.installed = true;
  installHistoryRouteHooks(runtime);

  runtime.popstateListener = () => scheduleTechnologyStackPageReady('popstate');
  runtime.hashchangeListener = () => scheduleTechnologyStackPageReady('hashchange');
  window.addEventListener('popstate', runtime.popstateListener, { passive: true });
  window.addEventListener('hashchange', runtime.hashchangeListener, { passive: true });

  if (/complete|interactive|loaded/.test(document.readyState)) {
    scheduleTechnologyStackPageReady('initial');
    return;
  }
  runtime.domContentLoadedListener = () => scheduleTechnologyStackPageReady('dom-content-loaded');
  document.addEventListener('DOMContentLoaded', runtime.domContentLoadedListener, { once: true });
}

/** 重置页面 ready reporter 内存态，仅供单测使用。 */
export function resetTechnologyStackPageReadyReporterForTesting(): void {
  const runtime = getPageReadyRuntime();
  if (runtime.timer) window.clearTimeout(runtime.timer);
  if (runtime.popstateListener) window.removeEventListener('popstate', runtime.popstateListener);
  if (runtime.hashchangeListener) window.removeEventListener('hashchange', runtime.hashchangeListener);
  if (runtime.domContentLoadedListener) document.removeEventListener('DOMContentLoaded', runtime.domContentLoadedListener);
  if (runtime.originalPushState) history.pushState = runtime.originalPushState;
  if (runtime.originalReplaceState) history.replaceState = runtime.originalReplaceState;
  runtime.installed = false;
  runtime.timer = null;
  runtime.lastReportedKey = '';
  runtime.originalPushState = null;
  runtime.originalReplaceState = null;
  runtime.popstateListener = null;
  runtime.hashchangeListener = null;
  runtime.domContentLoadedListener = null;
}
