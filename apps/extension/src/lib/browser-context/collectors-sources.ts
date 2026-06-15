/**
 * 说明：`collectors-sources` 浏览器上下文 source 采集模块。
 *
 * 职责：
 * - 承载页面身份解析、SW one-shot 请求和 source 级采集编排；
 * - 统一 `readable-dom` / `page-style-signals` 的 identity key 与 cache 命中逻辑；
 * - 为预热与发送前 preflight 提供同一套 source manifest 构建入口。
 *
 * 边界：
 * - 本模块不负责最终 prompt 渲染和 UI 状态写回；
 * - 不直接注册内置 collector，只通过 registry 查找已注册插件；
 * - 不处理截图附件拼装，captures 仍由 `page-style-context` 单独治理。
 */
import {
  requestBrowserContextPageStyleLayout,
  requestBrowserContextPageStyleSignals,
  requestBrowserContextReadableDom,
  type BrowserContextPageStyleLayoutRuntimeResponse,
  type BrowserContextPageStyleSignalsRuntimeResponse,
  type BrowserContextReadableDomRuntimeResponse,
} from '@/lib/extension/browser-context-api';
import {
  isBrowserContextCollectableUrl,
  resolvePreferredBrowserContextTab,
} from './tab-resolver';
import {
  getBrowserContextElementSnapshot,
  getBrowserContextMetadata,
  getBrowserContextSelectionSnapshot,
  setBrowserContextMetadata,
} from './runtime';
import { getBrowserContextCollector } from './collectors-registry';
import {
  buildSourceCacheKey,
  buildSourceManifestEntry,
  persistSourceCacheEntry,
  resolveSourceWithCache,
  restoreCollectedSourcesFromManifest,
} from './collectors-source-cache';
import { normalizeCollectionIssueCode } from './collectors-prompt';
import {
  createEmptyBrowserContextSourceManifest,
  type BrowserContextCollectedSource,
  type BrowserContextCollectionIssueCode,
  type BrowserContextCollectorContext,
  type BrowserContextMetadataSnapshot,
  type BrowserContextProfile,
  type BrowserContextSourceId,
  type BrowserContextSourceManifest,
  type BrowserContextWorkReason,
} from './types';
import type { BrowserContextReadableDomIntent } from '@/types/sw-messages';
import { resolvePageStyleContextSnapshot } from './page-style-context';

type BrowserContextReadableDomResponse = BrowserContextReadableDomRuntimeResponse;
type BrowserContextPageStyleLayoutResponse = BrowserContextPageStyleLayoutRuntimeResponse;
type BrowserContextPageStyleSignalsResponse = BrowserContextPageStyleSignalsRuntimeResponse;
const PANEL_VISIBLE_STABLE_WAIT_MS = 3_000;
const INPUT_INTENT_STABLE_WAIT_MS = 2_000;
const MANUAL_REFRESH_STABLE_WAIT_MS = 6_000;
const SEND_PREFLIGHT_DEFAULT_STABLE_WAIT_MS = 400;
const SEND_PREFLIGHT_FULL_PAGE_STABLE_WAIT_MS = 2_000;

/**
 * 发送前正文稳定窗口预算。
 *
 * @remarks
 * `resolveBrowserContextForSend()` 的 `budgetMs` 是整条前台 preflight 的等待上限；
 * 正文采集里的顶层 frame 仍要用短稳定窗口，避免预览壳页面先耗完整个预算，
 * 导致后台没有时间进入可见 iframe 的独立补采集链路。
 */
export const SEND_PREFLIGHT_READABLE_DOM_STABLE_WAIT_MS = SEND_PREFLIGHT_DEFAULT_STABLE_WAIT_MS;

/**
 * 全文发送前 `readable-dom` 的页面稳定窗口预算。
 *
 * 说明：该值只传给 content script 等待 `full-page` 正文稳定，不等同聊天发送层
 * 的总等待预算；总预算还要覆盖 source cache 合并、prompt 渲染和前台调度余量。
 */
export const SEND_PREFLIGHT_FULL_PAGE_READABLE_DOM_STABLE_WAIT_MS = SEND_PREFLIGHT_FULL_PAGE_STABLE_WAIT_MS;

/**
 * 页面身份种子。
 */
export interface BrowserContextPageIdentitySeed {
  /** 当前稳定窗口对应的页面指纹。 */
  pageFingerprint: string;
  /** 当前路由键。 */
  routeKey: string;
  /** 当前稳定窗口版本。 */
  stableWindowVersion: number;
}

/**
 * source 采集结果与 manifest。
 */
export interface BrowserContextCollectedManifestResult {
  /** 本轮 source manifest。 */
  manifest: BrowserContextSourceManifest;
  /** 根据 manifest 还原出的 source 列表。 */
  collected: BrowserContextCollectedSource[];
}

/**
 * 从当前活动标签页兜底查询 metadata。
 *
 * 说明：
 * - SW 会实时推送 metadata，但 UI 初次挂载或 SW 重启后的短窗口里可能尚未收到推送；
 * - 这里直接使用扩展页已有的 `tabs/activeTab` 权限做一次兜底，避免聊天发送被 metadata 缺失卡住。
 *
 * @returns 最新 metadata；无法获取时返回 `null`。
 */
export async function queryActiveTabMetadata(): Promise<BrowserContextMetadataSnapshot | null> {
  try {
    const tab = await resolvePreferredBrowserContextTab();
    const tabId = typeof tab?.id === 'number' ? tab.id : 0;
    const url = typeof tab?.url === 'string' ? tab.url : '';
    if (!tabId || !isBrowserContextCollectableUrl(url)) return null;
    return {
      title: tab?.title || '',
      url,
      favicon: tab?.favIconUrl || '',
      tabId,
      extractedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * 请求 SW 按需触发一次多策略正文采集。
 *
 * @param metadata - 当前页面 metadata。
 * @returns 采集结果与失败原因。
 */
export async function requestReadableDomFromSw(
  metadata: BrowserContextMetadataSnapshot | null,
  stableWaitMs?: number,
  intent: BrowserContextReadableDomIntent = 'normal',
): Promise<BrowserContextReadableDomResponse> {
  const tabId = metadata?.tabId ?? 0;
  if (!tabId || !metadata?.url || !isBrowserContextCollectableUrl(metadata.url)) {
    return { ok: true, payload: null, error: 'page-uncollectable' };
  }

  try {
    const response = await requestBrowserContextReadableDom({ tabId, intent, stableWaitMs });
    if (!response?.ok) return { ok: false, payload: null, error: response?.error || 'content-script-unreachable' };
    return response ?? { ok: true, payload: null, error: 'collector-unavailable' };
  } catch {
    return { ok: false, payload: null, error: 'content-script-unreachable' };
  }
}

/**
 * 请求 SW 按需提取当前页面的设计信号。
 *
 * @param metadata - 当前页面 metadata。
 * @returns 设计信号与失败原因。
 */
export async function requestPageStyleSignalsFromSw(
  metadata: BrowserContextMetadataSnapshot | null,
  stableWaitMs?: number,
): Promise<BrowserContextPageStyleSignalsResponse> {
  const tabId = metadata?.tabId ?? 0;
  if (!tabId || !metadata?.url || !isBrowserContextCollectableUrl(metadata.url)) {
    return { ok: true, payload: null, error: 'page-uncollectable' };
  }

  try {
    const response = await requestBrowserContextPageStyleSignals({ tabId, stableWaitMs });
    if (!response?.ok) return { ok: false, payload: null, error: response?.error || 'content-script-unreachable' };
    return response ?? { ok: true, payload: null, error: 'collector-unavailable' };
  } catch {
    return { ok: false, payload: null, error: 'content-script-unreachable' };
  }
}

/**
 * 请求 SW 按需提取当前页面的布局身份种子。
 *
 * @param metadata - 当前页面 metadata。
 * @returns 布局度量与失败原因。
 */
export async function requestPageStyleLayoutFromSw(
  metadata: BrowserContextMetadataSnapshot | null,
): Promise<BrowserContextPageStyleLayoutResponse> {
  const tabId = metadata?.tabId ?? 0;
  if (!tabId || !metadata?.url || !isBrowserContextCollectableUrl(metadata.url)) {
    return { ok: true, payload: null, error: 'page-uncollectable' };
  }

  try {
    const response = await requestBrowserContextPageStyleLayout({ tabId });
    if (!response?.ok) return { ok: false, payload: null, error: response?.error || 'content-script-unreachable' };
    return response ?? { ok: true, payload: null, error: 'collector-unavailable' };
  } catch {
    return { ok: false, payload: null, error: 'content-script-unreachable' };
  }
}

/**
 * 把布局响应转换成页面身份种子。
 *
 * @param payload - 页面布局响应 payload。
 * @returns 归一化后的页面身份种子。
 */
function toPageIdentitySeed(
  payload: NonNullable<BrowserContextPageStyleLayoutResponse['payload']>,
): BrowserContextPageIdentitySeed {
  return {
    pageFingerprint: String(payload.pageFingerprint || '').trim(),
    routeKey: String(payload.routeKey || '').trim(),
    stableWindowVersion: Number(payload.stableWindowVersion || 0),
  };
}

/**
 * 解析当前页面身份种子。
 *
 * @param metadata - 当前页面 metadata。
 * @returns identity seed 与失败问题码。
 */
export async function resolvePageIdentitySeed(
  metadata: BrowserContextMetadataSnapshot | null,
): Promise<{ seed: BrowserContextPageIdentitySeed | null; issueCode: BrowserContextCollectionIssueCode | null }> {
  const response = await requestPageStyleLayoutFromSw(metadata);
  const payload = response.payload ?? null;
  if (!payload?.pageFingerprint) {
    return {
      seed: null,
      issueCode: normalizeCollectionIssueCode(String(response.error || 'collector-unavailable')),
    };
  }
  return {
    seed: toPageIdentitySeed(payload),
    issueCode: null,
  };
}

/**
 * 基于当前运行时上下文构造 collector 执行参数。
 *
 * @param args - collector 上下文参数。
 * @returns collector 上下文。
 */
function buildCollectorContext(args: {
  assistantId: string;
  conversationKey: string;
  profile: BrowserContextProfile;
  metadata: BrowserContextMetadataSnapshot | null;
  reason: BrowserContextWorkReason;
  force?: boolean;
  signal?: AbortSignal;
  stableWaitMs?: number;
  technologyStackMinPass?: 'fast' | 'enhanced';
  technologyStackWaitMs?: number;
  readableDomIntent?: BrowserContextReadableDomIntent;
}): BrowserContextCollectorContext {
  return {
    assistantId: args.assistantId,
    conversationKey: args.conversationKey,
    profile: args.profile,
    metadata: args.metadata,
    selection: getBrowserContextSelectionSnapshot(),
    element: getBrowserContextElementSnapshot(),
    force: args.force,
    signal: args.signal,
    reason: args.reason,
    stableWaitMs: args.stableWaitMs,
    technologyStackMinPass: args.technologyStackMinPass,
    technologyStackWaitMs: args.technologyStackWaitMs,
    readableDomIntent: args.readableDomIntent ?? 'normal',
  };
}

/**
 * 解析页面稳定窗口等待预算。
 *
 * 说明：被动预热与发送前 preflight 都是可降级短链路，必须有明确上限；
 * 手动刷新是用户显式动作，可以给更长等待，但仍不能无限等待后台 rAF 或持续 mutation。
 *
 * @param reason - 当前调度原因。
 * @param override - 调用方显式预算。
 * @returns 稳定窗口等待毫秒数。
 */
function resolveStableWaitMsForReason(reason: BrowserContextWorkReason, override?: number): number {
  if (Number.isFinite(override) && Number(override) > 0) return Math.max(1, Math.round(Number(override)));
  if (reason === 'manual-refresh') return MANUAL_REFRESH_STABLE_WAIT_MS;
  if (reason === 'input-intent') return INPUT_INTENT_STABLE_WAIT_MS;
  if (reason === 'send-preflight') return SEND_PREFLIGHT_DEFAULT_STABLE_WAIT_MS;
  return PANEL_VISIBLE_STABLE_WAIT_MS;
}

/**
 * 解析当前页面身份。
 *
 * @param options - 页面身份解析参数。
 * @returns 最新 metadata。
 */
export async function resolvePageIdentity(options: {
  metadata?: BrowserContextMetadataSnapshot | null;
  force?: boolean;
}): Promise<BrowserContextMetadataSnapshot | null> {
  let metadata = options.metadata ?? getBrowserContextMetadata();
  if (!metadata || options.force) {
    metadata = await queryActiveTabMetadata();
    if (metadata) setBrowserContextMetadata(metadata);
  }
  return metadata;
}

/**
 * 收集当前 profile 所需的 source manifest。
 *
 * @param args - source 收集参数。
 * @returns source manifest 与可恢复的 source 列表。
 */
export async function collectSources(args: {
  assistantId: string;
  conversationKey: string;
  profile: BrowserContextProfile;
  metadata: BrowserContextMetadataSnapshot | null;
  requestedSources?: BrowserContextSourceId[];
  reason: BrowserContextWorkReason;
  allowLive: boolean;
  forceLive?: boolean;
  technologyStackMinPass?: 'fast' | 'enhanced';
  technologyStackWaitMs?: number;
  readableDomIntent?: BrowserContextReadableDomIntent;
  stableWaitMs?: number;
  pageIdentitySeed?: BrowserContextPageIdentitySeed | null;
  pageStyleResolved?: Awaited<ReturnType<typeof resolvePageStyleContextSnapshot>> | null;
  signal?: AbortSignal;
}): Promise<BrowserContextCollectedManifestResult> {
  const requestedSources = Array.from(new Set(args.requestedSources ?? args.profile.sources));
  const manifest = createEmptyBrowserContextSourceManifest();
  const stableWaitMs = resolveStableWaitMsForReason(args.reason, args.stableWaitMs);
  const ctx = buildCollectorContext({
    assistantId: args.assistantId,
    conversationKey: args.conversationKey,
    profile: args.profile,
    metadata: args.metadata,
    reason: args.reason,
    force: args.forceLive,
    signal: args.signal,
    stableWaitMs,
    technologyStackMinPass: args.technologyStackMinPass,
    technologyStackWaitMs: args.technologyStackWaitMs,
    readableDomIntent: args.readableDomIntent ?? 'normal',
  });

  let pageIdentitySeed = args.pageIdentitySeed ?? null;
  if (
    !pageIdentitySeed
    && requestedSources.some((sourceId) => (
      sourceId === 'readable-dom'
      || sourceId === 'page-style-signals'
    ))
  ) {
    const resolvedIdentity = await resolvePageIdentitySeed(args.metadata);
    pageIdentitySeed = resolvedIdentity.seed;
  }

  for (const sourceId of requestedSources) {
    if (sourceId === 'tab-meta') {
      const metadata = args.metadata;
      manifest[sourceId] = buildSourceManifestEntry({
        sourceId,
        identity: metadata ? `${metadata.tabId}::${metadata.url}` : null,
        freshness: metadata ? 'fresh' : 'missing',
        collectedAt: metadata?.extractedAt ?? null,
        issueCode: metadata ? null : 'metadata-unavailable',
        payloadRef: metadata ? buildSourceCacheKey(sourceId, `${metadata.tabId}::${metadata.url}`) : null,
      });
      if (metadata) {
        persistSourceCacheEntry(manifest[sourceId].payloadRef!, {
          manifest: manifest[sourceId],
          source: {
            sourceId,
            ok: true,
            data: metadata as unknown as Record<string, unknown>,
          },
          expiresAt: Date.now() + args.profile.cacheTtlMs,
        });
      }
      continue;
    }

    if (sourceId === 'technology-stack') {
      const identity = args.metadata?.technologyStackPageKey
        ?? (args.metadata ? `${args.metadata.tabId}::${args.metadata.url}` : null);
      const needsEnhanced = args.reason === 'send-preflight' && args.technologyStackMinPass === 'enhanced';
      manifest[sourceId] = (
        await resolveSourceWithCache({
          sourceId,
          identity,
          cacheTtlMs: args.profile.cacheTtlMs,
          allowLive: args.allowLive,
          forceLive: Boolean(args.forceLive),
          acceptCached: needsEnhanced
            ? (entry) => entry.cacheMeta?.technologyStackEnhanced === true
            : undefined,
          inFlightKey: needsEnhanced ? 'enhanced' : 'fast',
          collect: async () => (
            await getBrowserContextCollector(sourceId)?.collect(ctx)
            ?? { sourceId, ok: false, error: 'collector-unavailable' }
          ),
          degradeIssueCode: args.reason === 'send-preflight' ? 'timeout' : 'stale',
        })
      ).manifest;
      continue;
    }

    if (sourceId === 'selection-snapshot') {
      const selection = getBrowserContextSelectionSnapshot();
      const identity = selection?.capturedAt ? String(selection.capturedAt) : null;
      manifest[sourceId] = (
        await resolveSourceWithCache({
          sourceId,
          identity,
          cacheTtlMs: args.profile.cacheTtlMs,
          allowLive: true,
          forceLive: Boolean(args.forceLive),
          collect: async () => (
            await getBrowserContextCollector(sourceId)?.collect(ctx)
            ?? { sourceId, ok: false, error: 'selection-unavailable' }
          ),
          degradeIssueCode: 'selection-unavailable',
        })
      ).manifest;
      continue;
    }

    if (sourceId === 'element-snapshot') {
      const element = getBrowserContextElementSnapshot();
      const identity = element?.capturedAt ? String(element.capturedAt) : null;
      manifest[sourceId] = (
        await resolveSourceWithCache({
          sourceId,
          identity,
          cacheTtlMs: args.profile.cacheTtlMs,
          allowLive: true,
          forceLive: Boolean(args.forceLive),
          collect: async () => (
            await getBrowserContextCollector(sourceId)?.collect(ctx)
            ?? { sourceId, ok: false, error: 'element-unavailable' }
          ),
          degradeIssueCode: 'element-unavailable',
        })
      ).manifest;
      continue;
    }

    if (sourceId === 'readable-dom') {
      const identity = pageIdentitySeed
        ? [
            String(args.metadata?.tabId ?? 0),
            args.metadata?.url ?? '',
            pageIdentitySeed.pageFingerprint,
            pageIdentitySeed.routeKey,
            String(pageIdentitySeed.stableWindowVersion),
          ].join('::')
        : null;
      manifest[sourceId] = (
        await resolveSourceWithCache({
          sourceId,
          identity,
          cacheTtlMs: args.profile.cacheTtlMs,
          allowLive: args.allowLive,
          forceLive: Boolean(args.forceLive),
          collect: async () => (
            await getBrowserContextCollector(sourceId)?.collect(ctx)
            ?? { sourceId, ok: false, error: 'collector-unavailable' }
          ),
          degradeIssueCode: args.reason === 'send-preflight' ? 'timeout' : 'stale',
        })
      ).manifest;
      continue;
    }

    if (sourceId === 'page-style-signals') {
      const pageStylePayload = args.pageStyleResolved?.snapshot?.signals ?? null;
      const identity = pageStylePayload
        ? [
            String(args.metadata?.tabId ?? 0),
            args.metadata?.url ?? '',
            pageStylePayload.pageFingerprint,
            pageStylePayload.routeKey,
            String(pageStylePayload.stableWindowVersion),
          ].join('::')
        : pageIdentitySeed
          ? [
              String(args.metadata?.tabId ?? 0),
              args.metadata?.url ?? '',
              pageIdentitySeed.pageFingerprint,
              pageIdentitySeed.routeKey,
              String(pageIdentitySeed.stableWindowVersion),
            ].join('::')
          : null;
      if (pageStylePayload) {
        const cacheKey = buildSourceCacheKey(sourceId, identity);
        persistSourceCacheEntry(cacheKey, {
          manifest: buildSourceManifestEntry({
            sourceId,
            identity,
            freshness: 'fresh',
            collectedAt: Number(pageStylePayload.extractedAt) || Date.now(),
            issueCode: null,
            payloadRef: cacheKey,
          }),
          source: {
            sourceId,
            ok: true,
            data: pageStylePayload as unknown as Record<string, unknown>,
          },
          expiresAt: Date.now() + args.profile.cacheTtlMs,
        });
        manifest[sourceId] = buildSourceManifestEntry({
          sourceId,
          identity,
          freshness: 'fresh',
          collectedAt: Number(pageStylePayload.extractedAt) || Date.now(),
          issueCode: null,
          payloadRef: cacheKey,
        });
        continue;
      }
      manifest[sourceId] = (
        await resolveSourceWithCache({
          sourceId,
          identity,
          cacheTtlMs: args.profile.cacheTtlMs,
          allowLive: args.allowLive,
          forceLive: Boolean(args.forceLive),
          collect: async () => (
            await getBrowserContextCollector(sourceId)?.collect(ctx)
            ?? { sourceId, ok: false, error: 'collector-unavailable' }
          ),
          degradeIssueCode: args.reason === 'send-preflight' ? 'timeout' : 'stale',
        })
      ).manifest;
    }
  }

  return {
    manifest,
    collected: restoreCollectedSourcesFromManifest({
      metadata: args.metadata,
      manifest,
      requestedSources,
    }),
  };
}
