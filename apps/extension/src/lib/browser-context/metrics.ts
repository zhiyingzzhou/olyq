/**
 * 说明：`metrics` 浏览器上下文内部指标模块。
 *
 * 职责：
 * - 维护 browser-context 三层链路的统一内存指标真源；
 * - 为 benchmark、调试与后续观测提供稳定快照，而不是让各模块散落自算比率；
 * - 统一沉淀 metadata 跟随、source cache、发送前预检与截图编排的性能/可用性口径。
 *
 * 边界：
 * - 本模块只保存当前运行时内存态，不做持久化、上报或 UI 渲染；
 * - 不直接依赖浏览器 API；采集、发送与截图链路只负责调用记录函数；
 * - 这里只维护指标口径，不承载业务决策。
 */
import type { BrowserContextSourceId } from './types';

const METRIC_SAMPLE_LIMIT = 200;

type WarmStartReason = 'panel-visible' | 'input-intent' | 'manual-refresh';

interface BrowserContextMetricSeriesState {
  samples: number[];
}

interface BrowserContextSourceCacheMetricState {
  hits: number;
  misses: number;
}

interface BrowserContextMetricsState {
  metadataToStale: BrowserContextMetricSeriesState;
  warmStart: BrowserContextMetricSeriesState;
  warmStartByReason: Record<WarmStartReason, BrowserContextMetricSeriesState>;
  sendPreflight: BrowserContextMetricSeriesState;
  captureQueueWait: BrowserContextMetricSeriesState;
  sourceCacheBySource: Record<BrowserContextSourceId, BrowserContextSourceCacheMetricState>;
  sourceCollectionAttempts: number;
  permissionMisses: number;
  sendPreflightCount: number;
  degradedSends: number;
  captureRequests: number;
  captureQuotaRetries: number;
  captureCoalescingHits: number;
  captureCoalescingMisses: number;
}

/** 统计序列快照。 */
export interface BrowserContextMetricSeriesSnapshot {
  count: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  p95Ms: number;
}

/** 单个 source cache 的命中快照。 */
export interface BrowserContextSourceCacheMetricSnapshot {
  hits: number;
  misses: number;
  hitRatio: number;
}

/** browser-context 全链路指标快照。 */
export interface BrowserContextMetricsSnapshot {
  latencies: {
    metadataToStale: BrowserContextMetricSeriesSnapshot;
    warmStart: BrowserContextMetricSeriesSnapshot;
    warmStartByReason: Record<WarmStartReason, BrowserContextMetricSeriesSnapshot>;
    sendPreflight: BrowserContextMetricSeriesSnapshot;
    captureQueueWait: BrowserContextMetricSeriesSnapshot;
  };
  sourceCacheBySource: Record<BrowserContextSourceId, BrowserContextSourceCacheMetricSnapshot>;
  counters: {
    sourceCollectionAttempts: number;
    permissionMisses: number;
    sendPreflightCount: number;
    degradedSends: number;
    captureRequests: number;
    captureQuotaRetries: number;
    captureCoalescingHits: number;
    captureCoalescingMisses: number;
  };
  ratios: {
    sourceCacheHitRatio: number;
    captureCoalescingHitRatio: number;
    quotaRetryRate: number;
    permissionMissRate: number;
    degradedSendRate: number;
  };
}

/**
 * 创建空的统计序列。
 *
 * @returns 新序列。
 */
function createMetricSeriesState(): BrowserContextMetricSeriesState {
  return { samples: [] };
}

/**
 * 创建空的 source cache 统计。
 *
 * @returns 新统计对象。
 */
function createSourceCacheMetricState(): BrowserContextSourceCacheMetricState {
  return {
    hits: 0,
    misses: 0,
  };
}

/**
 * 创建默认 metrics state。
 *
 * @returns 新的 state。
 */
function createBrowserContextMetricsState(): BrowserContextMetricsState {
  return {
    metadataToStale: createMetricSeriesState(),
    warmStart: createMetricSeriesState(),
    warmStartByReason: {
      'panel-visible': createMetricSeriesState(),
      'input-intent': createMetricSeriesState(),
      'manual-refresh': createMetricSeriesState(),
    },
    sendPreflight: createMetricSeriesState(),
    captureQueueWait: createMetricSeriesState(),
    sourceCacheBySource: {
      'tab-meta': createSourceCacheMetricState(),
      'technology-stack': createSourceCacheMetricState(),
      'readable-dom': createSourceCacheMetricState(),
      'page-style-signals': createSourceCacheMetricState(),
      'selection-snapshot': createSourceCacheMetricState(),
      'element-snapshot': createSourceCacheMetricState(),
    },
    sourceCollectionAttempts: 0,
    permissionMisses: 0,
    sendPreflightCount: 0,
    degradedSends: 0,
    captureRequests: 0,
    captureQuotaRetries: 0,
    captureCoalescingHits: 0,
    captureCoalescingMisses: 0,
  };
}

let metricsState = createBrowserContextMetricsState();

/**
 * 计算比率。
 *
 * @param numerator - 分子。
 * @param denominator - 分母。
 * @returns `[0,1]` 范围内的比率。
 */
function toRatio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

/**
 * 向序列追加样本。
 *
 * @param series - 目标序列。
 * @param durationMs - 时延。
 */
function pushDurationSample(series: BrowserContextMetricSeriesState, durationMs: number): void {
  const normalized = Math.max(0, Number.isFinite(durationMs) ? Number(durationMs) : 0);
  series.samples.push(normalized);
  if (series.samples.length > METRIC_SAMPLE_LIMIT) {
    series.samples.splice(0, series.samples.length - METRIC_SAMPLE_LIMIT);
  }
}

/**
 * 把序列 state 转成只读快照。
 *
 * @param series - 目标序列。
 * @returns 统计结果。
 */
function toMetricSeriesSnapshot(series: BrowserContextMetricSeriesState): BrowserContextMetricSeriesSnapshot {
  const samples = [...series.samples].sort((left, right) => left - right);
  if (samples.length < 1) {
    return {
      count: 0,
      minMs: 0,
      maxMs: 0,
      meanMs: 0,
      p95Ms: 0,
    };
  }
  const total = samples.reduce((sum, value) => sum + value, 0);
  const p95Index = Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1);
  return {
    count: samples.length,
    minMs: samples[0] ?? 0,
    maxMs: samples[samples.length - 1] ?? 0,
    meanMs: total / samples.length,
    p95Ms: samples[p95Index] ?? 0,
  };
}

/**
 * 记录 metadata 跟随 -\> stale 状态的完成时延。
 *
 * @param durationMs - 本次时延。
 */
export function recordBrowserContextMetadataToStaleLatency(durationMs: number): void {
  pushDurationSample(metricsState.metadataToStale, durationMs);
}

/**
 * 记录预热链路时延。
 *
 * @param reason - 当前预热原因。
 * @param durationMs - 本次时延。
 */
export function recordBrowserContextWarmStartLatency(
  reason: WarmStartReason,
  durationMs: number,
): void {
  pushDurationSample(metricsState.warmStart, durationMs);
  pushDurationSample(metricsState.warmStartByReason[reason], durationMs);
}

/**
 * 记录发送前预检时延，并同步 degraded 发送计数。
 *
 * @param durationMs - 本次时延。
 * @param degraded - 是否发生 source 级降级。
 */
export function recordBrowserContextSendPreflightLatency(durationMs: number, degraded: boolean): void {
  metricsState.sendPreflightCount += 1;
  if (degraded) {
    metricsState.degradedSends += 1;
  }
  pushDurationSample(metricsState.sendPreflight, durationMs);
}

/**
 * 记录截图队列等待时延。
 *
 * @param durationMs - 从入队到真正开始执行的等待时延。
 */
export function recordBrowserContextCaptureQueueWait(durationMs: number): void {
  pushDurationSample(metricsState.captureQueueWait, durationMs);
}

/**
 * 记录单个 source cache 的访问结果。
 *
 * @param sourceId - 当前 source。
 * @param hit - 是否命中 fresh cache。
 */
export function recordBrowserContextSourceCacheAccess(sourceId: BrowserContextSourceId, hit: boolean): void {
  metricsState.sourceCollectionAttempts += 1;
  if (hit) {
    metricsState.sourceCacheBySource[sourceId].hits += 1;
    return;
  }
  metricsState.sourceCacheBySource[sourceId].misses += 1;
}

/**
 * 记录权限缺失命中次数。
 */
export function recordBrowserContextPermissionMiss(): void {
  metricsState.permissionMisses += 1;
}

/**
 * 记录截图 ask 级 coalescing 命中情况。
 *
 * @param hit - 是否命中已有 in-flight promise。
 */
export function recordBrowserContextCaptureCoalescing(hit: boolean): void {
  if (hit) {
    metricsState.captureCoalescingHits += 1;
    return;
  }
  metricsState.captureCoalescingMisses += 1;
}

/**
 * 记录一次真实截图 API 请求。
 */
export function recordBrowserContextCaptureRequest(): void {
  metricsState.captureRequests += 1;
}

/**
 * 记录一次截图配额重试。
 */
export function recordBrowserContextCaptureQuotaRetry(): void {
  metricsState.captureQuotaRetries += 1;
}

/**
 * 读取 browser-context 指标快照。
 *
 * @returns 当前内存态的只读快照。
 */
export function getBrowserContextMetricsSnapshot(): BrowserContextMetricsSnapshot {
  const sourceCacheBySource = {
    'tab-meta': {
      ...metricsState.sourceCacheBySource['tab-meta'],
      hitRatio: toRatio(
        metricsState.sourceCacheBySource['tab-meta'].hits,
        metricsState.sourceCacheBySource['tab-meta'].hits + metricsState.sourceCacheBySource['tab-meta'].misses,
      ),
    },
    'technology-stack': {
      ...metricsState.sourceCacheBySource['technology-stack'],
      hitRatio: toRatio(
        metricsState.sourceCacheBySource['technology-stack'].hits,
        metricsState.sourceCacheBySource['technology-stack'].hits + metricsState.sourceCacheBySource['technology-stack'].misses,
      ),
    },
    'readable-dom': {
      ...metricsState.sourceCacheBySource['readable-dom'],
      hitRatio: toRatio(
        metricsState.sourceCacheBySource['readable-dom'].hits,
        metricsState.sourceCacheBySource['readable-dom'].hits + metricsState.sourceCacheBySource['readable-dom'].misses,
      ),
    },
    'page-style-signals': {
      ...metricsState.sourceCacheBySource['page-style-signals'],
      hitRatio: toRatio(
        metricsState.sourceCacheBySource['page-style-signals'].hits,
        metricsState.sourceCacheBySource['page-style-signals'].hits + metricsState.sourceCacheBySource['page-style-signals'].misses,
      ),
    },
    'selection-snapshot': {
      ...metricsState.sourceCacheBySource['selection-snapshot'],
      hitRatio: toRatio(
        metricsState.sourceCacheBySource['selection-snapshot'].hits,
        metricsState.sourceCacheBySource['selection-snapshot'].hits + metricsState.sourceCacheBySource['selection-snapshot'].misses,
      ),
    },
    'element-snapshot': {
      ...metricsState.sourceCacheBySource['element-snapshot'],
      hitRatio: toRatio(
        metricsState.sourceCacheBySource['element-snapshot'].hits,
        metricsState.sourceCacheBySource['element-snapshot'].hits + metricsState.sourceCacheBySource['element-snapshot'].misses,
      ),
    },
  } satisfies Record<BrowserContextSourceId, BrowserContextSourceCacheMetricSnapshot>;

  const totalSourceCacheHits = Object.values(sourceCacheBySource).reduce((sum, item) => sum + item.hits, 0);
  const totalSourceCacheMisses = Object.values(sourceCacheBySource).reduce((sum, item) => sum + item.misses, 0);
  return {
    latencies: {
      metadataToStale: toMetricSeriesSnapshot(metricsState.metadataToStale),
      warmStart: toMetricSeriesSnapshot(metricsState.warmStart),
      warmStartByReason: {
        'panel-visible': toMetricSeriesSnapshot(metricsState.warmStartByReason['panel-visible']),
        'input-intent': toMetricSeriesSnapshot(metricsState.warmStartByReason['input-intent']),
        'manual-refresh': toMetricSeriesSnapshot(metricsState.warmStartByReason['manual-refresh']),
      },
      sendPreflight: toMetricSeriesSnapshot(metricsState.sendPreflight),
      captureQueueWait: toMetricSeriesSnapshot(metricsState.captureQueueWait),
    },
    sourceCacheBySource,
    counters: {
      sourceCollectionAttempts: metricsState.sourceCollectionAttempts,
      permissionMisses: metricsState.permissionMisses,
      sendPreflightCount: metricsState.sendPreflightCount,
      degradedSends: metricsState.degradedSends,
      captureRequests: metricsState.captureRequests,
      captureQuotaRetries: metricsState.captureQuotaRetries,
      captureCoalescingHits: metricsState.captureCoalescingHits,
      captureCoalescingMisses: metricsState.captureCoalescingMisses,
    },
    ratios: {
      sourceCacheHitRatio: toRatio(totalSourceCacheHits, totalSourceCacheHits + totalSourceCacheMisses),
      captureCoalescingHitRatio: toRatio(
        metricsState.captureCoalescingHits,
        metricsState.captureCoalescingHits + metricsState.captureCoalescingMisses,
      ),
      quotaRetryRate: toRatio(metricsState.captureQuotaRetries, metricsState.captureRequests),
      permissionMissRate: toRatio(metricsState.permissionMisses, metricsState.sourceCollectionAttempts),
      degradedSendRate: toRatio(metricsState.degradedSends, metricsState.sendPreflightCount),
    },
  };
}

/**
 * 重置全部内存指标，仅供测试和 benchmark 使用。
 */
export function resetBrowserContextMetricsForTesting(): void {
  metricsState = createBrowserContextMetricsState();
}
