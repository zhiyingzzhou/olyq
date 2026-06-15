/**
 * 说明：技术栈探测的 Service Worker 内存状态 owner。
 *
 * 职责：
 * - 维护 tab/url/epoch 派生的 `technologyStackPageKey`；
 * - 保存 fast / enhanced 结构化结果缓存；
 * - 管理 normal fast request 与后台 enhancement 的 in-flight 合并。
 *
 * 边界：
 * - 这里只保存结构化结果与运行时 token，不保存页面原文、脚本片段或 cookie 值；
 * - 状态随 MV3 Service Worker 回收丢失，丢失后由 page-ready、metadata 或按需请求重新 warm；
 * - 不负责采集页面/网络信号，也不负责 detector 规则匹配。
 */
import type { TechnologyStackResult } from '@/lib/technology-stack/types';
import { clearTechnologyStackNetworkSignals } from './technology-stack-network';

/** 内部缓存条目；`enhanced` 只表达后台是否已补完 delayed JS / external snippets，不进入 UI 产品态。 */
export interface CachedTechnologyStackResult {
  /** 对外可展示的结构化技术栈结果。 */
  result: TechnologyStackResult;
  /** 是否已经完成后台增强 pass。 */
  enhanced: boolean;
  /** 当前 tab 页面生命周期 epoch，用于丢弃旧导航的晚到结果。 */
  epoch: number;
}

/** 后台 enhancement 的 in-flight 记录。 */
export interface TechnologyStackEnhancementEntry {
  /** 正在执行的 enhancement promise。 */
  promise: Promise<void>;
  /** 用于避免旧 finally 删除新任务的 token。 */
  token: symbol;
}

/** tab scoped 检测结果缓存。 */
const resultCache = new Map<string, CachedTechnologyStackResult>();
/** tab + url + epoch scoped 最新结果指针，打开 UI 时优先从这里命中内存缓存。 */
const latestCacheKeyByTabUrl = new Map<string, string>();
/** tab scoped 页面生命周期 epoch；同 URL reload / SPA route / force refresh 都会推进。 */
const navigationEpochByTab = new Map<number, number>();
/** tab scoped 最新页面 URL，用于 page-ready / metadata warm 发现 SPA route 后推进 epoch。 */
const latestPageUrlByTab = new Map<number, string>();
/** tab + url + epoch scoped 普通探测 in-flight 缓存，只合并非 force 请求。 */
const inFlightDetectionsByTabUrl = new Map<string, Promise<TechnologyStackResult>>();
/** tab + url + fingerprint + epoch scoped 后台增强 in-flight 缓存。 */
const inFlightEnhancementsByCacheKey = new Map<string, TechnologyStackEnhancementEntry>();

/** 读取当前 tab 的页面生命周期 epoch。 */
export function getTechnologyStackNavigationEpoch(tabId: number): number {
  return navigationEpochByTab.get(tabId) ?? 0;
}

/** 构造 tab/url/epoch 级别的技术栈页面身份 key。 */
export function buildTechnologyStackTabUrlEpochKey(args: { tabId: number; url: string; epoch: number }): string {
  return `${args.tabId}::${args.url}::${args.epoch}`;
}

/** 构造检测结果缓存 key。 */
export function buildTechnologyStackCacheKey(args: {
  tabId: number;
  url: string;
  pageFingerprint: string;
  epoch: number;
}): string {
  return `${args.tabId}::${args.url}::${args.pageFingerprint}::${args.epoch}`;
}

/** 构造普通探测 in-flight key。 */
export function buildTechnologyStackInFlightKey(args: { tabId: number; url: string; epoch: number }): string {
  return buildTechnologyStackTabUrlEpochKey(args);
}

/**
 * 删除某个 tab 上不再属于当前页面生命周期的技术栈内存状态。
 *
 * @param tabId - 目标 tab。
 * @param options - 是否同时清理网络信号；SPA route 通常保留同页网络信号，reload 则清理。
 */
export function clearTechnologyStackRuntimeForTab(tabId: number, options: { clearNetwork?: boolean } = {}): void {
  if (options.clearNetwork !== false) clearTechnologyStackNetworkSignals(tabId);
  for (const key of Array.from(latestCacheKeyByTabUrl.keys())) {
    if (key.startsWith(`${tabId}::`)) latestCacheKeyByTabUrl.delete(key);
  }
  for (const key of Array.from(inFlightDetectionsByTabUrl.keys())) {
    if (key.startsWith(`${tabId}::`)) inFlightDetectionsByTabUrl.delete(key);
  }
  for (const key of Array.from(inFlightEnhancementsByCacheKey.keys())) {
    if (key.startsWith(`${tabId}::`)) inFlightEnhancementsByCacheKey.delete(key);
  }
  for (const key of Array.from(resultCache.keys())) {
    if (key.startsWith(`${tabId}::`)) resultCache.delete(key);
  }
}

/** 推进 tab 页面生命周期 epoch，并清理旧页面的 in-flight/cache。 */
export function noteTechnologyStackNavigationEpoch(
  tabId: number,
  options: { clearNetwork?: boolean; url?: string } = {},
): number {
  const nextEpoch = getTechnologyStackNavigationEpoch(tabId) + 1;
  navigationEpochByTab.set(tabId, nextEpoch);
  if (options.url) latestPageUrlByTab.set(tabId, options.url);
  clearTechnologyStackRuntimeForTab(tabId, options);
  return nextEpoch;
}

/** 确保当前 tab/url 的技术栈页面身份已同步到最新 epoch。 */
export function ensureTechnologyStackPageIdentity(args: { tabId: number; url: string }): number {
  const previousUrl = latestPageUrlByTab.get(args.tabId);
  if (previousUrl && previousUrl !== args.url) {
    return noteTechnologyStackNavigationEpoch(args.tabId, { clearNetwork: false, url: args.url });
  }
  latestPageUrlByTab.set(args.tabId, args.url);
  return getTechnologyStackNavigationEpoch(args.tabId);
}

/**
 * 同步并读取当前 tab/url 对应的技术栈页面身份 key。
 *
 * @remarks
 * 该 key 只由 Service Worker 的页面生命周期 epoch 派生，用于 UI 判断某条技术栈
 * 更新是否仍属于当前页面；它不携带页面原文，也不会持久化。
 */
export function getTechnologyStackPageKeyForTab(tabId: number, url: string): string {
  return buildTechnologyStackTabUrlEpochKey({ tabId, url, epoch: ensureTechnologyStackPageIdentity({ tabId, url }) });
}

/** 读取当前 tab/url/epoch 的最新缓存结果。 */
export function readLatestTechnologyStackCachedResult(args: {
  tabId: number;
  url: string;
  epoch: number;
}): CachedTechnologyStackResult | null {
  return readLatestTechnologyStackCachedEntry(args)?.cached ?? null;
}

/** 读取当前 tab/url/epoch 的最新缓存结果与底层 cache key。 */
export function readLatestTechnologyStackCachedEntry(args: {
  tabId: number;
  url: string;
  epoch: number;
}): { cacheKey: string; cached: CachedTechnologyStackResult } | null {
  const tabUrlKey = buildTechnologyStackTabUrlEpochKey(args);
  const cacheKey = latestCacheKeyByTabUrl.get(tabUrlKey);
  const cached = cacheKey ? resultCache.get(cacheKey) ?? null : null;
  return cacheKey && cached ? { cacheKey, cached } : null;
}

/** 写入技术栈检测结果缓存，并同步最新 tab/url/epoch 指针。 */
export function writeTechnologyStackCachedResult(args: {
  cacheKey: string;
  tabUrlKey: string;
  cached: CachedTechnologyStackResult;
}): void {
  resultCache.set(args.cacheKey, args.cached);
  latestCacheKeyByTabUrl.set(args.tabUrlKey, args.cacheKey);
}

/** 读取普通 fast 探测 in-flight。 */
export function getTechnologyStackNormalInFlight(inFlightKey: string): Promise<TechnologyStackResult> | null {
  return inFlightDetectionsByTabUrl.get(inFlightKey) ?? null;
}

/** 写入普通 fast 探测 in-flight，并在同一 promise 完成后清理。 */
export function setTechnologyStackNormalInFlight(
  inFlightKey: string,
  promise: Promise<TechnologyStackResult>,
): void {
  inFlightDetectionsByTabUrl.set(inFlightKey, promise);
  promise.finally(() => {
    if (inFlightDetectionsByTabUrl.get(inFlightKey) === promise) {
      inFlightDetectionsByTabUrl.delete(inFlightKey);
    }
  });
}

/** 读取后台 enhancement in-flight。 */
export function getTechnologyStackEnhancementInFlight(cacheKey: string): TechnologyStackEnhancementEntry | null {
  return inFlightEnhancementsByCacheKey.get(cacheKey) ?? null;
}

/** 写入后台 enhancement in-flight。 */
export function setTechnologyStackEnhancementInFlight(
  cacheKey: string,
  entry: TechnologyStackEnhancementEntry,
): void {
  inFlightEnhancementsByCacheKey.set(cacheKey, entry);
}

/** 当前 token 仍匹配时清理后台 enhancement in-flight。 */
export function deleteTechnologyStackEnhancementInFlightIfCurrent(cacheKey: string, token: symbol): void {
  if (inFlightEnhancementsByCacheKey.get(cacheKey)?.token === token) {
    inFlightEnhancementsByCacheKey.delete(cacheKey);
  }
}

/** 清理指定 tab 的检测缓存和页面身份。 */
export function invalidateTechnologyStackRuntimeForTab(tabId: number): void {
  clearTechnologyStackRuntimeForTab(tabId);
  navigationEpochByTab.delete(tabId);
  latestPageUrlByTab.delete(tabId);
}
