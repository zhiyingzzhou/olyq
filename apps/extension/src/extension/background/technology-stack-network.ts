/**
 * 说明：技术栈探测的 Service Worker 网络信号缓存。
 *
 * 职责：
 * - 记录 main frame 响应头、顶层 frame script / XHR URL 与外链脚本 URL 样本；
 * - 在后台 enhanced pass 中按预算读取外链脚本文本片段；
 * - 读取 cookie 名称和值，并保证 cookie 值只作为本轮 detector 的瞬时输入。
 *
 * 边界：
 * - 本模块只维护 SW 内存态，SW 重启后允许丢失；
 * - 不保存、不展示、不日志输出 cookie 值、脚本文本或页面原文；
 * - 不负责 pageKey / epoch / 结果缓存，那些由 `technology-stack-runtime-state` 拥有。
 */
import { isBrowserContextCollectableUrl } from '@/lib/browser-context/tab-resolver';
import type {
  TechnologyCookieValueSignal,
  TechnologyNetworkSignals,
  TechnologyPageSignals,
} from '@/lib/technology-stack/types';

/** 网络信号预算；所有上限只约束本地匹配输入，不形成用户可见 partial 状态。 */
const NETWORK_SIGNAL_BUDGETS = {
  maxRequestUrls: 180,
  maxScriptUrls: 25,
  maxExternalScriptChars: 100_000,
  externalScriptTimeoutMs: 1_500,
  maxCookieNames: 80,
} as const;

/** tab scoped 网络信号缓存。 */
const networkSignalsByTab = new Map<number, TechnologyNetworkSignals>();

/** 判断 URL 是否可用于技术栈采集。 */
export function isTechnologyStackCollectableUrl(url: string): boolean {
  return isBrowserContextCollectableUrl(url);
}

/** 清理指定 tab 的网络信号缓存。 */
export function clearTechnologyStackNetworkSignals(tabId: number): void {
  networkSignalsByTab.delete(tabId);
}

/** 获取或创建指定 tab 的网络信号缓存。 */
export function getTechnologyStackNetworkSignals(tabId: number): TechnologyNetworkSignals {
  const existing = networkSignalsByTab.get(tabId);
  if (existing) return existing;
  const created: TechnologyNetworkSignals = {
    headers: {},
    cookieNames: [],
    requestUrls: [],
    scriptUrls: [],
    updatedAt: Date.now(),
  };
  networkSignalsByTab.set(tabId, created);
  return created;
}

/** 归一化 webRequest 响应头，保留同名 header 的逗号合并语义。 */
function normalizeResponseHeaders(headers: chrome.webRequest.HttpHeader[] | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const header of headers ?? []) {
    const key = String(header.name || '').trim().toLowerCase();
    if (!key) continue;
    const value = String(header.value || '').trim();
    if (!value) continue;
    result[key] = result[key] ? `${result[key]}, ${value}` : value;
  }
  return result;
}

/**
 * 记录 main frame 响应头，并重置该页面生命周期内的 subresource URL 样本。
 *
 * @param tabId - 当前 tab。
 * @param responseHeaders - webRequest 提供的响应头。
 */
export function recordTechnologyStackMainFrameNetworkSignals(
  tabId: number,
  responseHeaders: chrome.webRequest.HttpHeader[] | undefined,
): void {
  const signals = getTechnologyStackNetworkSignals(tabId);
  signals.headers = normalizeResponseHeaders(responseHeaders);
  signals.requestUrls = [];
  signals.scriptUrls = [];
  signals.updatedAt = Date.now();
}

/** 添加请求 URL 样本。 */
export function appendTechnologyStackRequestUrl(tabId: number, url: string): void {
  if (!isTechnologyStackCollectableUrl(url)) return;
  const signals = getTechnologyStackNetworkSignals(tabId);
  if (!signals.requestUrls.includes(url)) {
    signals.requestUrls.push(url);
    if (signals.requestUrls.length > NETWORK_SIGNAL_BUDGETS.maxRequestUrls) {
      signals.requestUrls.splice(0, signals.requestUrls.length - NETWORK_SIGNAL_BUDGETS.maxRequestUrls);
    }
  }
  signals.updatedAt = Date.now();
}

/** 添加外链脚本 URL 样本，供后台 enhanced pass 的 bounded snippet 扫描使用。 */
export function appendTechnologyStackScriptUrl(tabId: number, url: string): void {
  if (!isTechnologyStackCollectableUrl(url)) return;
  const signals = getTechnologyStackNetworkSignals(tabId);
  signals.scriptUrls = signals.scriptUrls ?? [];
  if (!signals.scriptUrls.includes(url)) {
    signals.scriptUrls.push(url);
    if (signals.scriptUrls.length > NETWORK_SIGNAL_BUDGETS.maxScriptUrls) {
      signals.scriptUrls.splice(0, signals.scriptUrls.length - NETWORK_SIGNAL_BUDGETS.maxScriptUrls);
    }
  }
  signals.updatedAt = Date.now();
}

/**
 * 读取外部脚本的预算内文本片段。
 *
 * 这里只处理当前页面实际加载过的脚本 URL，片段只参与本轮本地匹配。
 * CDN / CSP / CORS 拒绝扩展源请求属于正常缺口，失败时静默跳过。
 */
async function fetchExternalScriptSnippet(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_SIGNAL_BUDGETS.externalScriptTimeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', cache: 'force-cache' });
    if (!response.ok) return null;
    if (!response.body?.getReader) {
      return (await response.text()).slice(0, NETWORK_SIGNAL_BUDGETS.maxExternalScriptChars);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    try {
      while (text.length < NETWORK_SIGNAL_BUDGETS.maxExternalScriptChars) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.cancel().catch(() => {});
    }
    return text.slice(0, NETWORK_SIGNAL_BUDGETS.maxExternalScriptChars);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 为页面信号追加外部脚本内容片段。 */
export async function appendTechnologyStackExternalScriptSnippets(
  pageSignals: TechnologyPageSignals,
  network: TechnologyNetworkSignals,
): Promise<TechnologyPageSignals> {
  const networkScriptUrls = network.scriptUrls ?? [];
  const scriptUrls = (networkScriptUrls.length > 0 ? networkScriptUrls : pageSignals.scriptSrc)
    .slice(0, NETWORK_SIGNAL_BUDGETS.maxScriptUrls);
  if (scriptUrls.length < 1) return pageSignals;
  const snippets = (await Promise.all(scriptUrls.map((url) => fetchExternalScriptSnippet(url))))
    .filter((text): text is string => Boolean(text));
  if (snippets.length < 1) return pageSignals;
  return {
    ...pageSignals,
    inlineScript: [...pageSignals.inlineScript, ...snippets],
  };
}

/** 读取 cookie 名称和值；值只进入本轮 detector 瞬时匹配，不进入结果和缓存。 */
export async function readTechnologyStackCookieSignals(
  url: string,
): Promise<{ names: string[]; values: TechnologyCookieValueSignal[] }> {
  if (!chrome.cookies?.getAll || !isTechnologyStackCollectableUrl(url)) return { names: [], values: [] };
  return await new Promise((resolve) => {
    try {
      chrome.cookies.getAll({ url }, (cookies) => {
        void chrome.runtime.lastError;
        const names = Array.from(new Set((cookies ?? []).map((cookie) => String(cookie.name || '').trim()).filter(Boolean)));
        const values = (cookies ?? [])
          .map((cookie) => ({
            name: String(cookie.name || '').trim(),
            value: String(cookie.value || ''),
          }))
          .filter((cookie) => cookie.name && cookie.value)
          .slice(0, NETWORK_SIGNAL_BUDGETS.maxCookieNames);
        resolve({
          names: names.slice(0, NETWORK_SIGNAL_BUDGETS.maxCookieNames),
          values,
        });
      });
    } catch {
      resolve({ names: [], values: [] });
    }
  });
}
