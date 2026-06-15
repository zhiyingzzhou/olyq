/**
 * 说明：`collectors-source-cache` 浏览器上下文 source 级缓存模块。
 *
 * 职责：
 * - 维护 `tab-meta/readable-dom/page-style-signals/...` 的 source 级缓存；
 * - 统一 source manifest entry、payload store 和 in-flight 合并逻辑；
 * - 为发送前 preflight 与被动预热提供同一套 source 级失效语义。
 *
 * 边界：
 * - 本模块不关心 collector registry 和 prompt 拼装；
 * - 不直接更新 browser-context runtime store，只返回 manifest/source 结果；
 * - 不负责页面身份解析，调用方必须先提供 identity。
 */
import type {
  BrowserContextCollectedSource,
  BrowserContextCollectionIssueCode,
  BrowserContextMetadataSnapshot,
  BrowserContextSourceId,
  BrowserContextSourceCacheMeta,
  BrowserContextSourceManifest,
  BrowserContextSourceManifestEntry,
} from './types';
import { recordBrowserContextSourceCacheAccess } from './metrics';
import { normalizeCollectionIssueCode } from './collectors-prompt';

/**
 * source cache 条目。
 */
export interface BrowserContextSourceCacheEntry {
  /** 当前 source manifest。 */
  manifest: BrowserContextSourceManifestEntry;
  /** 最近一次采集结果。 */
  source: BrowserContextCollectedSource;
  /** 仅供 cache 命中策略使用的运行时元信息。 */
  cacheMeta?: BrowserContextSourceCacheMeta;
  /** 过期时间戳。 */
  expiresAt: number;
}

const sourceCache = new Map<string, BrowserContextSourceCacheEntry>();
const inFlightSourceCache = new Map<string, Promise<BrowserContextSourceCacheEntry>>();
const sourcePayloadStore = new Map<string, Record<string, unknown>>();

/** 删除 source cache 条目，并同步清理对应 payload 引用。 */
function deleteSourceCacheEntry(cacheKey: string): void {
  const entry = sourceCache.get(cacheKey);
  if (entry?.manifest.payloadRef) sourcePayloadStore.delete(entry.manifest.payloadRef);
  sourceCache.delete(cacheKey);
}

/**
 * 生成 source cache key。
 *
 * @param sourceId - source 标识。
 * @param identity - 当前 source identity。
 * @returns 稳定 cache key。
 */
export function buildSourceCacheKey(sourceId: BrowserContextSourceId, identity: string | null): string {
  return `${sourceId}::${identity || 'missing'}`;
}

/**
 * 构建 source manifest entry。
 *
 * @param args - manifest 字段。
 * @returns 新的 manifest entry。
 */
export function buildSourceManifestEntry(args: {
  sourceId: BrowserContextSourceId;
  identity: string | null;
  freshness: BrowserContextSourceManifestEntry['freshness'];
  collectedAt: number | null;
  issueCode: BrowserContextCollectionIssueCode | null;
  payloadRef: string | null;
}): BrowserContextSourceManifestEntry {
  return {
    sourceId: args.sourceId,
    identity: args.identity,
    freshness: args.freshness,
    collectedAt: args.collectedAt,
    issueCode: args.issueCode,
    payloadRef: args.payloadRef,
  };
}

/**
 * 判断 source cache 是否仍然可复用。
 *
 * @param entry - cache 条目。
 * @returns 命中且未过期时返回 `true`。
 */
function isSourceCacheEntryFresh(entry: BrowserContextSourceCacheEntry | null | undefined): boolean {
  return Boolean(entry && entry.expiresAt > Date.now());
}

/**
 * 把 source cache 条目持久化到内存 store。
 *
 * @param cacheKey - source cache key。
 * @param entry - cache 条目。
 * @returns 原样返回写入后的条目。
 */
export function persistSourceCacheEntry(
  cacheKey: string,
  entry: BrowserContextSourceCacheEntry,
): BrowserContextSourceCacheEntry {
  sourceCache.set(cacheKey, entry);
  if (entry.manifest.payloadRef && entry.source.ok && entry.source.data) {
    sourcePayloadStore.set(entry.manifest.payloadRef, entry.source.data);
  }
  return entry;
}

/**
 * 失效全部浏览器上下文缓存。
 */
export function clearBrowserContextPromptCache(): void {
  sourceCache.clear();
  inFlightSourceCache.clear();
  sourcePayloadStore.clear();
}

/**
 * 失效指定 source identity 的缓存。
 *
 * @param args - source 与 identity 过滤条件。
 */
export function invalidateBrowserContextSourceCache(args: {
  sourceId: BrowserContextSourceId;
  identity?: string | null;
  tabId?: number | null;
  url?: string | null;
}): void {
  const sourcePrefix = `${args.sourceId}::`;
  const exactKey = args.identity ? buildSourceCacheKey(args.sourceId, args.identity) : null;
  const targetTabId = typeof args.tabId === 'number' ? args.tabId : null;
  const targetUrl = typeof args.url === 'string' ? args.url : null;
  for (const key of Array.from(sourceCache.keys())) {
    if (!key.startsWith(sourcePrefix)) continue;
    if (exactKey && key !== exactKey) continue;
    if (!exactKey && targetTabId !== null && !key.includes(`::${targetTabId}::`)) continue;
    if (!exactKey && targetUrl && !key.includes(`::${targetUrl}`)) continue;
    deleteSourceCacheEntry(key);
  }
  for (const key of Array.from(inFlightSourceCache.keys())) {
    if (!key.startsWith(sourcePrefix)) continue;
    if (exactKey && !key.startsWith(exactKey)) continue;
    if (!exactKey && targetTabId !== null && !key.includes(`::${targetTabId}::`)) continue;
    if (!exactKey && targetUrl && !key.includes(`::${targetUrl}`)) continue;
    inFlightSourceCache.delete(key);
  }
}

/**
 * 失效指定 tab/url 关联的缓存。
 *
 * @param args - 过滤条件。
 */
export function invalidateBrowserContextPromptCacheForTab(args: {
  tabId?: number | null;
  url?: string | null;
}): void {
  const targetTabId = typeof args.tabId === 'number' ? args.tabId : null;
  const targetUrl = typeof args.url === 'string' ? args.url : null;
  for (const key of Array.from(sourceCache.keys())) {
    if (targetTabId !== null && key.includes(`::${targetTabId}::`)) {
      deleteSourceCacheEntry(key);
      continue;
    }
    if (targetUrl && key.includes(`::${targetUrl}::`)) {
      deleteSourceCacheEntry(key);
    }
  }
  for (const key of Array.from(inFlightSourceCache.keys())) {
    if (targetTabId !== null && key.includes(`::${targetTabId}::`)) {
      inFlightSourceCache.delete(key);
      continue;
    }
    if (targetUrl && key.includes(`::${targetUrl}::`)) {
      inFlightSourceCache.delete(key);
    }
  }
}

/**
 * 失效指定助手当前 profile 的缓存。
 *
 * @param args - 当前请求定位信息。
 */
export function invalidateBrowserContextPromptCacheEntry(args: {
  assistantId: string;
  conversationKey: string;
  profileId: string;
  effectiveSourceKey: string;
  effectiveMaxPromptChars: number;
  tabId?: number | null;
  url?: string | null;
}): void {
  void args.assistantId;
  void args.conversationKey;
  void args.profileId;
  void args.effectiveSourceKey;
  void args.effectiveMaxPromptChars;
  invalidateBrowserContextPromptCacheForTab({
    tabId: args.tabId,
    url: args.url,
  });
}

/**
 * 从 manifest + payload store 还原本轮 source 结果。
 *
 * @param args - 还原参数。
 * @returns 对应 requestedSources 的 source 列表。
 */
export function restoreCollectedSourcesFromManifest(args: {
  metadata: BrowserContextMetadataSnapshot | null;
  manifest: BrowserContextSourceManifest;
  requestedSources: BrowserContextSourceId[];
}): BrowserContextCollectedSource[] {
  return args.requestedSources.map((sourceId) => {
    const entry = args.manifest[sourceId];
    if (sourceId === 'tab-meta' && args.metadata && entry.freshness !== 'missing') {
      return {
        sourceId,
        ok: true,
        data: args.metadata as unknown as Record<string, unknown>,
      };
    }
    const payload = entry.payloadRef ? sourcePayloadStore.get(entry.payloadRef) : null;
    if (payload) {
      return {
        sourceId,
        ok: true,
        data: payload,
      };
    }
    return {
      sourceId,
      ok: false,
      error: entry.issueCode || 'collector-unavailable',
    };
  });
}

/**
 * 基于 source 级缓存解析单个 source。
 *
 * @param args - source 解析参数。
 * @returns 命中的 cache 条目或本轮 live 采集结果。
 */
export async function resolveSourceWithCache(args: {
  sourceId: BrowserContextSourceId;
  identity: string | null;
  cacheTtlMs: number;
  allowLive: boolean;
  forceLive: boolean;
  collect: () => Promise<BrowserContextCollectedSource>;
  degradeIssueCode: BrowserContextCollectionIssueCode;
  acceptCached?: (entry: BrowserContextSourceCacheEntry) => boolean;
  inFlightKey?: string;
}): Promise<BrowserContextSourceCacheEntry> {
  const cacheKey = buildSourceCacheKey(args.sourceId, args.identity);
  const inFlightKey = `${cacheKey}::${args.inFlightKey ?? 'default'}`;
  const cached = sourceCache.get(cacheKey) ?? null;
  if (!args.forceLive && isSourceCacheEntryFresh(cached) && (!args.acceptCached || args.acceptCached(cached!))) {
    recordBrowserContextSourceCacheAccess(args.sourceId, true);
    return {
      ...cached!,
      manifest: {
        ...cached!.manifest,
        identity: args.identity,
        freshness: 'fresh',
        issueCode: null,
      },
    };
  }

  recordBrowserContextSourceCacheAccess(args.sourceId, false);
  if (!args.allowLive) {
    if (cached?.source.ok && cached.source.data) {
      return {
        ...cached,
        manifest: {
          ...cached.manifest,
          identity: args.identity,
          freshness: 'stale',
          issueCode: args.degradeIssueCode,
        },
      };
    }
    return {
      manifest: buildSourceManifestEntry({
        sourceId: args.sourceId,
        identity: args.identity,
        freshness: 'missing',
        collectedAt: cached?.manifest.collectedAt ?? null,
        issueCode: args.degradeIssueCode,
        payloadRef: cached?.manifest.payloadRef ?? null,
      }),
      source: {
        sourceId: args.sourceId,
        ok: false,
        error: args.degradeIssueCode,
      },
      expiresAt: Date.now() + args.cacheTtlMs,
    };
  }

  if (!args.forceLive) {
    const pending = inFlightSourceCache.get(inFlightKey);
    if (pending) return pending;
  }

  const task: Promise<BrowserContextSourceCacheEntry> = (async () => {
    let liveSource: BrowserContextCollectedSource;
    try {
      liveSource = await args.collect();
    } catch (error: unknown) {
      liveSource = {
        sourceId: args.sourceId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    if (liveSource.ok && liveSource.data) {
      return persistSourceCacheEntry(cacheKey, {
        manifest: buildSourceManifestEntry({
          sourceId: args.sourceId,
          identity: args.identity,
          freshness: 'fresh',
          collectedAt: Date.now(),
          issueCode: null,
          payloadRef: cacheKey,
        }),
        source: liveSource,
        cacheMeta: liveSource.cacheMeta,
        expiresAt: Date.now() + args.cacheTtlMs,
      });
    }

    const issueCode = normalizeCollectionIssueCode(String(liveSource.error || args.degradeIssueCode));
    if (cached?.source.ok && cached.source.data) {
      return {
        ...cached,
        manifest: {
          ...cached.manifest,
          identity: args.identity,
          freshness: 'stale',
          issueCode,
        },
      } satisfies BrowserContextSourceCacheEntry;
    }
    return {
      manifest: buildSourceManifestEntry({
        sourceId: args.sourceId,
        identity: args.identity,
        freshness: 'missing',
        collectedAt: Date.now(),
        issueCode,
        payloadRef: null,
      }),
      source: {
        sourceId: args.sourceId,
        ok: false,
        error: issueCode,
      },
      expiresAt: Date.now() + args.cacheTtlMs,
    } satisfies BrowserContextSourceCacheEntry;
  })();

  inFlightSourceCache.set(inFlightKey, task);
  try {
    return await task;
  } finally {
    inFlightSourceCache.delete(inFlightKey);
  }
}

/**
 * 将 technology-stack runtime update 写入 browser-context source cache。
 *
 * @param args - 当前页面 pageKey、结果与缓存 TTL。
 * @returns 写入后的 source cache 条目。
 */
export function upsertTechnologyStackSourceCacheFromRuntimeUpdate(args: {
  pageKey: string;
  result: Record<string, unknown>;
  enhanced: boolean;
  cacheTtlMs: number;
}): BrowserContextSourceCacheEntry {
  const cacheKey = buildSourceCacheKey('technology-stack', args.pageKey);
  return persistSourceCacheEntry(cacheKey, {
    manifest: buildSourceManifestEntry({
      sourceId: 'technology-stack',
      identity: args.pageKey,
      freshness: 'fresh',
      collectedAt: Number(args.result.detectedAt) || Date.now(),
      issueCode: null,
      payloadRef: cacheKey,
    }),
    source: {
      sourceId: 'technology-stack',
      ok: true,
      data: args.result,
      cacheMeta: {
        technologyStackPageKey: args.pageKey,
        technologyStackEnhanced: args.enhanced,
      },
    },
    cacheMeta: {
      technologyStackPageKey: args.pageKey,
      technologyStackEnhanced: args.enhanced,
    },
    expiresAt: Date.now() + args.cacheTtlMs,
  });
}
