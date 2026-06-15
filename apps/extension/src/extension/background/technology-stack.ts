/**
 * 说明：technology-stack Service Worker 插件。
 *
 * 职责：
 * - 监听 webRequest，按 tab scoped 记录 main_frame 响应头与 script/xhr/fetch URL；
 * - 在 one-shot 请求时先执行不等待 delayed JS / 外链脚本 refetch 的快扫；
 * - 将 delayed JS 与外链脚本 snippet 作为后台增强写回同一内存缓存。
 *
 * 边界：
 * - cookie 只读取名称，不保存、不展示、不注入 AI；
 * - Service Worker 内存缓存允许丢失，SW 重启后会从当前页重新采集；
 * - 不实现第三方扩展的商业、遥测、lead、export 等非探测能力。
 */
import { buildTechnologyPageScanPlan } from '@/lib/technology-stack/scan-plan';
import { loadTechnologyRulePackage } from '@/lib/technology-stack/rule-loader';
import type {
  TechnologyPageScanPlan,
  TechnologyPageSignals,
  TechnologyStackResult,
} from '@/lib/technology-stack/types';
import {
  normalizeTechnologyStackErrorCode,
  type TechnologyStackErrorCode,
} from '@/lib/technology-stack/errors';
import {
  getExtensionTab,
  isExtensionTabMessageError,
  sendExtensionTabMessage,
} from '@/lib/extension/runtime-api';
import { resolvePreferredBrowserContextTab } from '@/lib/browser-context/tab-resolver';
import { ensureContentScriptReadyForTab } from './content-script-manager';
import { postVolatileToAllUi } from './port-manager';
import type { TechnologyStackSignalsResponse } from '@/types/sw-messages';
import {
  appendTechnologyStackExternalScriptSnippets,
  appendTechnologyStackRequestUrl,
  appendTechnologyStackScriptUrl,
  getTechnologyStackNetworkSignals,
  isTechnologyStackCollectableUrl,
  readTechnologyStackCookieSignals,
  recordTechnologyStackMainFrameNetworkSignals,
} from './technology-stack-network';
import {
  buildTechnologyStackResult,
  detectTechnologyStackResult,
} from './technology-stack-detection';
import {
  buildTechnologyStackCacheKey,
  buildTechnologyStackInFlightKey,
  buildTechnologyStackTabUrlEpochKey,
  deleteTechnologyStackEnhancementInFlightIfCurrent,
  ensureTechnologyStackPageIdentity,
  getTechnologyStackEnhancementInFlight,
  getTechnologyStackNavigationEpoch,
  getTechnologyStackNormalInFlight,
  invalidateTechnologyStackRuntimeForTab,
  noteTechnologyStackNavigationEpoch,
  readLatestTechnologyStackCachedEntry,
  readLatestTechnologyStackCachedResult,
  setTechnologyStackEnhancementInFlight,
  setTechnologyStackNormalInFlight,
  writeTechnologyStackCachedResult,
  type CachedTechnologyStackResult,
} from './technology-stack-runtime-state';

export {
  getTechnologyStackPageKeyForTab,
  noteTechnologyStackNavigationEpoch,
} from './technology-stack-runtime-state';

/** one-shot 请求解析后的结果与内部 meta。 */
export interface TechnologyStackResolution {
  /** 对外结构化技术栈结果。 */
  result: TechnologyStackResult;
  /** SW 页面生命周期身份。 */
  pageKey: string;
  /** 当前 result 是否来自 enhanced cache。 */
  enhanced: boolean;
}

/** 技术栈请求最小探测阶段。 */
type TechnologyStackMinPass = 'fast' | 'enhanced';

/** content script 页面信号请求结果。 */
type TechnologyPageSignalsRequestResult =
  | {
      /** 页面信号已经成功返回。 */
      ok: true;
      /** content script 汇总后的安全页面信号。 */
      payload: TechnologyPageSignals;
    }
  | {
      /** 页面信号不可用。 */
      ok: false;
      /** 稳定失败原因；仅作为内部码传递，UI 会再映射成用户可读文案。 */
      error: TechnologyStackErrorCode;
    };

/** browser-context 发送前等待 enhanced 的默认上限。 */
const DEFAULT_ENHANCED_WAIT_MS = 6_500;

/**
 * 向在线 UI 广播技术栈结果。
 *
 * 说明：这是纯运行时通知，不做持久化，也不进入 UI pending 事件队列；
 * 若当前没有 UI 监听器，缓存仍留在 Service Worker 内存里等待后续 one-shot 读取。
 */
function notifyTechnologyStackResultUpdated(args: {
  result: TechnologyStackResult;
  tabId: number;
  url: string;
  epoch: number;
  enhanced: boolean;
}): void {
  const url = args.result.url || args.url;
  const pageKey = buildTechnologyStackTabUrlEpochKey({ tabId: args.tabId, url, epoch: args.epoch });
  postVolatileToAllUi({ type: 'technology-stack/result-updated', payload: { pageKey, enhanced: args.enhanced, result: args.result } });
}

/** 解析目标 tab。 */
async function resolveTechnologyStackTab(tabId?: number): Promise<chrome.tabs.Tab | null> {
  return typeof tabId === 'number'
    ? getExtensionTab(tabId)
    : resolvePreferredBrowserContextTab();
}

/** 从 content script 拉取页面信号。 */
async function requestPageSignals(
  tabId: number,
  scanPlan: TechnologyPageScanPlan,
  options: { delayedJs?: boolean } = {},
): Promise<TechnologyPageSignalsRequestResult> {
  const ready = await ensureContentScriptReadyForTab(tabId);
  if (!ready.ready) return { ok: false, error: normalizeTechnologyStackErrorCode(ready.reason) };
  try {
    const response = await sendExtensionTabMessage<TechnologyStackSignalsResponse | undefined>(
      tabId,
      { type: 'technology-stack/signals/get', payload: { scanPlan, delayedJs: Boolean(options.delayedJs) } },
    );
    if (!response?.payload) return { ok: false, error: 'content-script-unreachable' };
    return { ok: true, payload: response.payload };
  } catch (error) {
    return {
      ok: false,
      error: isExtensionTabMessageError(error)
        ? normalizeTechnologyStackErrorCode(error.reason)
        : normalizeTechnologyStackErrorCode(error),
    };
  }
}

/**
 * 安排后台增强 pass。
 *
 * 说明：
 * - 前台已经返回快扫结果；这里才等待 `DELAYED_JS_PASS_MS` 并 refetch 外链脚本 snippet；
 * - 只写同一个 `tab + url + fingerprint` 的内存缓存，不新增持久化；
 * - 若 tab 导航或缓存被失效，in-flight key 会被删除，旧增强结果会被丢弃。
 */
function scheduleTechnologyStackEnhancement(args: {
  tabId: number;
  url: string;
  title: string;
  epoch: number;
  cacheKey: string;
  scanPlan: TechnologyPageScanPlan;
  rulePackage: Awaited<ReturnType<typeof loadTechnologyRulePackage>>;
}): Promise<void> {
  const existing = getTechnologyStackEnhancementInFlight(args.cacheKey);
  if (existing) return existing.promise;

  const token = Symbol(args.cacheKey);
  const promise = (async () => {
    const pageSignalResult = await requestPageSignals(args.tabId, args.scanPlan, { delayedJs: true });
    if (!pageSignalResult.ok) return;
    const pageSignals = pageSignalResult.payload;
    if (getTechnologyStackNavigationEpoch(args.tabId) !== args.epoch) return;
    if ((pageSignals.url || args.url) !== args.url) return;

    const enhancedCacheKey = buildTechnologyStackCacheKey({
      tabId: args.tabId,
      url: pageSignals.url || args.url,
      pageFingerprint: pageSignals.pageFingerprint,
      epoch: args.epoch,
    });
    if (enhancedCacheKey !== args.cacheKey) return;

    const network = getTechnologyStackNetworkSignals(args.tabId);
    const cookieSignals = await readTechnologyStackCookieSignals(pageSignals.url || args.url);
    const pageSignalsWithSnippets = await appendTechnologyStackExternalScriptSnippets(pageSignals, network);
    const result = detectTechnologyStackResult({
      tabId: args.tabId,
      url: args.url,
      title: args.title,
      pageSignals: pageSignalsWithSnippets,
      network,
      cookieSignals,
      rulePackage: args.rulePackage,
    });

    if (getTechnologyStackEnhancementInFlight(args.cacheKey)?.token !== token) return;
    if (getTechnologyStackNavigationEpoch(args.tabId) !== args.epoch) return;
    writeTechnologyStackCachedResult({
      cacheKey: args.cacheKey,
      tabUrlKey: buildTechnologyStackTabUrlEpochKey({ tabId: args.tabId, url: result.url || args.url, epoch: args.epoch }),
      cached: { result, enhanced: true, epoch: args.epoch },
    });
    notifyTechnologyStackResultUpdated({ result, tabId: args.tabId, url: args.url, epoch: args.epoch, enhanced: true });
  })();

  setTechnologyStackEnhancementInFlight(args.cacheKey, { promise, token });
  promise.finally(() => {
    deleteTechnologyStackEnhancementInFlightIfCurrent(args.cacheKey, token);
  });
  return promise;
}

/**
 * 对已解析的普通网页 tab 执行前台快扫，并安排后台增强。
 *
 * @param args - 已解析出的 tab 身份与刷新选项。
 * @returns 不等待 delayed JS / external snippets 的技术栈结果。
 */
async function collectTechnologyStackForResolvedTab(args: {
  tabId: number;
  url: string;
  title: string;
  force?: boolean;
}): Promise<TechnologyStackResult> {
  const epoch = getTechnologyStackNavigationEpoch(args.tabId);
  const cached = !args.force ? readLatestTechnologyStackCachedResult({ tabId: args.tabId, url: args.url, epoch }) : null;
  if (cached) return cached.result;

  let rulePackage: Awaited<ReturnType<typeof loadTechnologyRulePackage>>;
  try {
    rulePackage = await loadTechnologyRulePackage();
  } catch {
    return buildTechnologyStackResult({ status: 'error', tabId: args.tabId, url: args.url, title: args.title, error: 'rule-package-unavailable' });
  }

  const scanPlan = buildTechnologyPageScanPlan({
    rules: rulePackage.rules,
    summary: rulePackage.summary,
  });
  const pageSignalResult = await requestPageSignals(args.tabId, scanPlan, { delayedJs: false });
  if (!pageSignalResult.ok) {
    return buildTechnologyStackResult({ status: 'error', tabId: args.tabId, url: args.url, title: args.title, error: pageSignalResult.error });
  }
  const pageSignals = pageSignalResult.payload;
  if (getTechnologyStackNavigationEpoch(args.tabId) !== epoch || (pageSignals.url || args.url) !== args.url) {
    return buildTechnologyStackResult({ status: 'error', tabId: args.tabId, url: args.url, title: args.title, error: 'page-stale' });
  }

  const cacheKey = buildTechnologyStackCacheKey({
    tabId: args.tabId,
    url: pageSignals.url || args.url,
    pageFingerprint: pageSignals.pageFingerprint,
    epoch,
  });
  const tabUrlKey = buildTechnologyStackTabUrlEpochKey({ tabId: args.tabId, url: pageSignals.url || args.url, epoch });

  const network = getTechnologyStackNetworkSignals(args.tabId);
  const cookieSignals = await readTechnologyStackCookieSignals(pageSignals.url || args.url);
  const result = detectTechnologyStackResult({
    tabId: args.tabId,
    url: args.url,
    title: args.title,
    pageSignals,
    network,
    cookieSignals,
    rulePackage,
  });
  if (getTechnologyStackNavigationEpoch(args.tabId) !== epoch) {
    return buildTechnologyStackResult({ status: 'error', tabId: args.tabId, url: args.url, title: args.title, error: 'page-stale' });
  }
  writeTechnologyStackCachedResult({
    cacheKey,
    tabUrlKey,
    cached: { result, enhanced: false, epoch },
  });
  notifyTechnologyStackResultUpdated({ result, tabId: args.tabId, url: args.url, epoch, enhanced: false });
  void scheduleTechnologyStackEnhancement({
    tabId: args.tabId,
    url: args.url,
    title: args.title,
    epoch,
    cacheKey,
    scanPlan,
    rulePackage,
  });
  return result;
}

/** 复用同一 tab/url/epoch 的前台快扫，避免 page-ready、UI 和 browser-context 同时触发重复采集。 */
function getOrStartNormalTechnologyStackDetection(args: {
  tabId: number;
  url: string;
  title: string;
}): Promise<TechnologyStackResult> {
  const epoch = ensureTechnologyStackPageIdentity({ tabId: args.tabId, url: args.url });
  const cached = readLatestTechnologyStackCachedResult({ tabId: args.tabId, url: args.url, epoch });
  if (cached) return Promise.resolve(cached.result);

  const inFlightKey = buildTechnologyStackInFlightKey({ tabId: args.tabId, url: args.url, epoch });
  const existing = getTechnologyStackNormalInFlight(inFlightKey);
  if (existing) return existing;

  const promise = collectTechnologyStackForResolvedTab({
    tabId: args.tabId,
    url: args.url,
    title: args.title,
    force: false,
  });
  setTechnologyStackNormalInFlight(inFlightKey, promise);
  return promise;
}

/** 将任意等待预算收敛为有限的 enhanced 等待窗口。 */
function normalizeEnhancedWaitMs(waitMs: number | undefined): number {
  if (typeof waitMs !== 'number' || !Number.isFinite(waitMs)) return DEFAULT_ENHANCED_WAIT_MS;
  return Math.max(0, Math.min(waitMs, 30_000));
}

/** 等待指定 Promise，但超时后返回 `false`，让调用方按 best-effort 继续。 */
async function waitUntilSettledOrTimeout(promise: Promise<unknown>, waitMs: number): Promise<boolean> {
  if (waitMs <= 0) return false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise.then(() => true, () => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), waitMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 读取或启动当前页 enhanced 结果。
 *
 * 说明：fast-first 仍是唯一前台入口；这里仅在调用方明确要求 enhanced 时，
 * 等待已经由 fast pass 安排好的后台增强，超时后返回当前 best-effort 缓存。
 */
async function getOrStartEnhancedTechnologyStackDetection(args: {
  tabId: number;
  url: string;
  title: string;
  waitMs?: number;
}): Promise<CachedTechnologyStackResult | null> {
  const epoch = ensureTechnologyStackPageIdentity({ tabId: args.tabId, url: args.url });
  const initialEntry = readLatestTechnologyStackCachedEntry({ tabId: args.tabId, url: args.url, epoch });
  if (initialEntry?.cached.enhanced) return initialEntry.cached;

  if (!initialEntry) {
    await getOrStartNormalTechnologyStackDetection(args);
  }

  const currentEntry = readLatestTechnologyStackCachedEntry({ tabId: args.tabId, url: args.url, epoch });
  if (!currentEntry || currentEntry.cached.enhanced) return currentEntry?.cached ?? null;

  const enhancement = getTechnologyStackEnhancementInFlight(currentEntry.cacheKey)?.promise ?? null;
  if (enhancement) {
    await waitUntilSettledOrTimeout(enhancement, normalizeEnhancedWaitMs(args.waitMs));
  }

  if (getTechnologyStackNavigationEpoch(args.tabId) !== epoch) return null;
  return readLatestTechnologyStackCachedResult({ tabId: args.tabId, url: args.url, epoch }) ?? currentEntry.cached;
}

/** 构建当前 tab/url/epoch 的 one-shot 响应 meta。 */
function buildResolution(args: {
  tabId: number;
  url: string;
  epoch: number;
  result: TechnologyStackResult;
  enhanced?: boolean;
}): TechnologyStackResolution {
  const url = args.result.url || args.url;
  const cached = readLatestTechnologyStackCachedResult({ tabId: args.tabId, url, epoch: args.epoch });
  return {
    result: args.result,
    pageKey: buildTechnologyStackTabUrlEpochKey({ tabId: args.tabId, url, epoch: args.epoch }),
    enhanced: args.enhanced ?? Boolean(cached?.enhanced),
  };
}

/**
 * 解析当前标签页技术栈，并返回内部 pageKey/enhanced meta。
 *
 * @param payload - 目标标签页与刷新选项。
 * @returns 技术栈结果与内部 meta。
 */
export async function resolveTechnologyStackForTab(payload?: {
  tabId?: number;
  force?: boolean;
  minPass?: TechnologyStackMinPass;
  waitMs?: number;
}): Promise<TechnologyStackResolution> {
  const tab = await resolveTechnologyStackTab(payload?.tabId);
  const tabId = typeof tab?.id === 'number' ? tab.id : null;
  const url = typeof tab?.url === 'string' ? tab.url : '';
  if (!tabId || !url) {
    return { result: buildTechnologyStackResult({ status: 'uncollectable', tabId: null, error: 'tab-unavailable' }), pageKey: '', enhanced: false };
  }
  const title = typeof tab?.title === 'string' ? tab.title : '';
  if (!isTechnologyStackCollectableUrl(url)) {
    return {
      result: buildTechnologyStackResult({ status: 'uncollectable', tabId, url, title, error: 'page-uncollectable' }),
      pageKey: buildTechnologyStackTabUrlEpochKey({ tabId, url, epoch: ensureTechnologyStackPageIdentity({ tabId, url }) }),
      enhanced: false,
    };
  }

  if (payload?.force) {
    noteTechnologyStackNavigationEpoch(tabId, { clearNetwork: false, url });
  }

  const minPass: TechnologyStackMinPass = payload?.minPass === 'enhanced' ? 'enhanced' : 'fast';
  const epoch = ensureTechnologyStackPageIdentity({ tabId, url });

  if (minPass === 'enhanced' && !payload?.force) {
    const cached = await getOrStartEnhancedTechnologyStackDetection({ tabId, url, title, waitMs: payload?.waitMs });
    if (cached) return buildResolution({ tabId, url, epoch, result: cached.result, enhanced: cached.enhanced });
  }

  if (!payload?.force) {
    const result = await getOrStartNormalTechnologyStackDetection({ tabId, url, title });
    return buildResolution({ tabId, url, epoch, result });
  }

  const fastResult = await collectTechnologyStackForResolvedTab({ tabId, url, title, force: true });
  if (minPass !== 'enhanced') {
    return buildResolution({ tabId, url, epoch: getTechnologyStackNavigationEpoch(tabId), result: fastResult });
  }
  const cached = await getOrStartEnhancedTechnologyStackDetection({ tabId, url, title, waitMs: payload?.waitMs });
  return buildResolution({
    tabId,
    url,
    epoch: getTechnologyStackNavigationEpoch(tabId),
    result: cached?.result ?? fastResult,
    enhanced: cached?.enhanced ?? false,
  });
}

/**
 * 检测当前标签页技术栈。
 *
 * @param payload - 目标标签页与刷新选项。
 * @returns 技术栈结果。
 */
export async function getTechnologyStackForTab(payload?: {
  tabId?: number;
  force?: boolean;
  minPass?: TechnologyStackMinPass;
  waitMs?: number;
}): Promise<TechnologyStackResult> {
  return (await resolveTechnologyStackForTab(payload)).result;
}

/** 清理指定 tab 的检测缓存。 */
export function invalidateTechnologyStackForTab(tabId: number): void {
  invalidateTechnologyStackRuntimeForTab(tabId);
}

/**
 * 在普通网页页面生命周期事件后预热技术栈。
 *
 * @param args - 目标 tab、页面身份与触发原因。
 * @returns fast-first 检测结果；调用方通常不需要等待。
 */
export async function warmTechnologyStackForTab(args: {
  tabId: number;
  url: string;
  title?: string;
  reason: 'page-ready' | 'metadata' | 'tab-activated' | 'window-focus' | 'tab-complete';
}): Promise<TechnologyStackResult | null> {
  if (!args.tabId || !isTechnologyStackCollectableUrl(args.url)) return null;
  return getOrStartNormalTechnologyStackDetection({
    tabId: args.tabId,
    url: args.url,
    title: args.title ?? '',
  });
}

/** 安装 webRequest 监听器。 */
export function installTechnologyStackNetworkListeners(): void {
  chrome.webRequest?.onCompleted?.addListener?.(
    (details) => {
      if (details.tabId < 0 || details.type !== 'main_frame') return;
      if (!isTechnologyStackCollectableUrl(details.url)) return;
      recordTechnologyStackMainFrameNetworkSignals(details.tabId, details.responseHeaders);
      noteTechnologyStackNavigationEpoch(details.tabId, { clearNetwork: false, url: details.url });
    },
    { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
    ['responseHeaders'],
  );

  chrome.webRequest?.onCompleted?.addListener?.(
    (details) => {
      if (details.tabId < 0) return;
      if (details.type !== 'script' && details.type !== 'xmlhttprequest') return;
      if (details.frameId !== 0) return;
      appendTechnologyStackRequestUrl(details.tabId, details.url);
      if (details.type === 'script') appendTechnologyStackScriptUrl(details.tabId, details.url);
    },
    { urls: ['http://*/*', 'https://*/*'], types: ['script', 'xmlhttprequest'] },
  );

  chrome.tabs?.onRemoved?.addListener?.((tabId) => {
    invalidateTechnologyStackForTab(tabId);
  });
}
