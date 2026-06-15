/**
 * 说明：`page-style` 内容脚本页面风格分析模块。
 *
 * 职责：
 * - 提供 browser-context“风格模式”需要的 DOM/CSS 设计信号提取；
 * - 把页面风格采样收口为“单轮 TreeWalker 遍历 + CSS 值归一化 + 内存失效缓存”；
 * - 对外保持 `extractPageStyleSignals`、`extractPageStyleLayoutMetrics`、`scrollPageStyleTo` 三个稳定导出。
 *
 * 边界：
 * - 本模块不负责截图、聊天消息发送或 SW 协议变更；
 * - 本模块只维护当前内容脚本生命周期内的内存缓存与失效时序；
 * - 对外 payload 结构保持现状，不向 UI、SW 或存储层扩散新的内部语义。
 */
import type {
  PageStyleLayoutMetricsPayload,
  PageStyleSignalsPayload,
} from '@/types/sw-messages';
import { clonePageStyleSignalsPayload } from '@/lib/browser-context/page-style-signals-payload';
import {
  getCurrentDocumentHeight,
  getCurrentRouteKey,
  getCurrentViewportHeight,
  getCurrentViewportWidth,
  type PageStyleAnalysisSnapshot,
} from './page-style-sampling-core';
import {
  buildCurrentLayoutMetricsPayload,
  buildPageStyleAnalysisSnapshot,
} from './page-style-sampling-signals';
import {
  getCurrentPageStabilitySnapshot,
  resetPageStabilityRuntimeForTesting,
  waitForPageStableWindow,
} from './page-stability';

/** 内容脚本缓存的失效原因。 */
interface PageStyleRuntimeDirtyFlags {
  structure: boolean;
  layout: boolean;
}

/** 内容脚本存活期间复用的页面风格运行时缓存。 */
interface PageStyleRuntimeCache {
  analysis: PageStyleAnalysisSnapshot | null;
  dirtyFlags: PageStyleRuntimeDirtyFlags;
  observersInstalled: boolean;
  mutationObserver: MutationObserver | null;
  resizeObserver: ResizeObserver | null;
  resizeListener: (() => void) | null;
}

/** 模块级缓存；只在当前页面的内容脚本生命周期内有效。 */
const runtimeCache: PageStyleRuntimeCache = {
  analysis: null,
  dirtyFlags: {
    structure: true,
    layout: true,
  },
  observersInstalled: false,
  mutationObserver: null,
  resizeObserver: null,
  resizeListener: null,
};

/**
 * 彻底重置当前内容脚本里的 page-style 运行时缓存。
 *
 * 说明：
 * - 这个 helper 只给 benchmark / 单测使用，避免为了模拟“冷启动”去整页 reload；
 * - 它会同时清空 analysis、dirty flags 和 observer 安装状态，保证下一次读取重新走完整初始化；
 * - 对正式业务链路没有调用方，不参与外部协议，也不改变页面风格模式对用户的可见行为。
 */
export function resetPageStyleRuntimeForTesting(): void {
  runtimeCache.mutationObserver?.disconnect();
  runtimeCache.resizeObserver?.disconnect();
  if (runtimeCache.resizeListener) {
    window.removeEventListener('resize', runtimeCache.resizeListener);
  }

  runtimeCache.analysis = null;
  runtimeCache.dirtyFlags.structure = true;
  runtimeCache.dirtyFlags.layout = true;
  runtimeCache.observersInstalled = false;
  runtimeCache.mutationObserver = null;
  runtimeCache.resizeObserver = null;
  runtimeCache.resizeListener = null;
  resetPageStabilityRuntimeForTesting();
}

/**
 * 等待浏览器完成若干帧渲染。
 *
 * @param count - 需要等待的帧数。
 */
async function waitForAnimationFrames(count = 2): Promise<void> {
  const total = Math.max(1, Math.floor(count));
  for (let index = 0; index < total; index += 1) {
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }
}

/**
 * 标记当前缓存的结构与布局信息都已失效。
 */
function markStructureDirty(): void {
  runtimeCache.dirtyFlags.structure = true;
  runtimeCache.dirtyFlags.layout = true;
}

/**
 * 标记当前缓存的布局信息已失效。
 */
function markLayoutDirty(): void {
  runtimeCache.dirtyFlags.layout = true;
}

/**
 * 触发一次完整重采样，并把结果写回模块级缓存。
 *
 * @returns 最新 analysis snapshot。
 */
function analyzePageStyle(): PageStyleAnalysisSnapshot {
  const stability = getCurrentPageStabilitySnapshot();
  const analysis = buildPageStyleAnalysisSnapshot(stability);
  runtimeCache.analysis = analysis;
  runtimeCache.dirtyFlags.structure = false;
  runtimeCache.dirtyFlags.layout = false;
  return analysis;
}

/**
 * 安装页面结构/布局失效观察器。
 */
function ensureRuntimeObservers(): void {
  if (runtimeCache.observersInstalled) return;

  runtimeCache.mutationObserver = new MutationObserver((records) => {
    if (records.length < 1) return;
    markStructureDirty();
  });
  runtimeCache.mutationObserver.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'data-theme', 'src', 'href', 'role', 'type', 'data-tag', 'data-badge'],
  });

  if (typeof ResizeObserver === 'function') {
    runtimeCache.resizeObserver = new ResizeObserver(() => {
      markLayoutDirty();
    });
    runtimeCache.resizeObserver.observe(document.documentElement);
    if (document.body) {
      runtimeCache.resizeObserver.observe(document.body);
    }
  }

  runtimeCache.resizeListener = () => {
    markLayoutDirty();
  };
  window.addEventListener('resize', runtimeCache.resizeListener, { passive: true });
  runtimeCache.observersInstalled = true;
}

/**
 * 在每次读取前校验缓存是否仍然匹配当前页面。
 */
function ensureAnalysisFreshness(): void {
  ensureRuntimeObservers();
  const analysis = runtimeCache.analysis;
  if (!analysis) {
    markStructureDirty();
    return;
  }
  if (analysis.routeKey !== getCurrentRouteKey()) {
    markStructureDirty();
    return;
  }

  const viewportWidth = getCurrentViewportWidth();
  const viewportHeight = getCurrentViewportHeight();
  const documentHeight = getCurrentDocumentHeight();
  if (
    analysis.viewportWidth !== viewportWidth
    || analysis.viewportHeight !== viewportHeight
    || analysis.documentHeight !== documentHeight
  ) {
    markLayoutDirty();
  }
}

/**
 * 为 `signals/get` 返回当前有效 analysis；结构或布局脏时都触发整页重采样。
 *
 * @returns 可直接用于导出 signals 的 analysis snapshot。
 */
function getCurrentAnalysisForSignals(): PageStyleAnalysisSnapshot {
  ensureAnalysisFreshness();
  if (!runtimeCache.analysis || runtimeCache.dirtyFlags.structure || runtimeCache.dirtyFlags.layout) {
    return analyzePageStyle();
  }
  return runtimeCache.analysis;
}

/**
 * 为 `layout/get` 返回当前有效 analysis；仅结构脏时需要整页重采样。
 *
 * @returns 至少拥有稳定结构种子的 analysis snapshot。
 */
function getCurrentAnalysisForLayoutMetrics(): PageStyleAnalysisSnapshot {
  ensureAnalysisFreshness();
  if (!runtimeCache.analysis || runtimeCache.dirtyFlags.structure) {
    return analyzePageStyle();
  }
  return runtimeCache.analysis;
}

/**
 * 同步提取当前页面的设计信号。
 *
 * @returns 结构化设计信号。
 */
export function extractPageStyleSignals(): PageStyleSignalsPayload {
  const analysis = getCurrentAnalysisForSignals();
  return clonePageStyleSignalsPayload(analysis.signals);
}

/**
 * 在稳定窗口内提取当前页面的设计信号。
 *
 * @param stableWaitMs - 页面稳定窗口最长等待毫秒数。
 * @returns 结构化设计信号。
 */
export async function extractPageStyleSignalsAfterStable(stableWaitMs?: number): Promise<PageStyleSignalsPayload> {
  const stability = await waitForPageStableWindow({ maxWaitMs: stableWaitMs });
  const analysis = getCurrentAnalysisForSignals();
  if (
    analysis.signals.routeKey !== stability.routeKey
    || analysis.signals.stableWindowVersion !== stability.stableWindowVersion
  ) {
    runtimeCache.analysis = buildPageStyleAnalysisSnapshot(stability);
    runtimeCache.dirtyFlags.structure = false;
    runtimeCache.dirtyFlags.layout = false;
  }
  return clonePageStyleSignalsPayload(runtimeCache.analysis!.signals);
}

/**
 * 读取当前页面截图编排需要的布局度量。
 *
 * @returns 结构化页面高度、视口高度与滚动位置。
 */
export function extractPageStyleLayoutMetrics(): PageStyleLayoutMetricsPayload {
  return buildCurrentLayoutMetricsPayload(getCurrentAnalysisForLayoutMetrics(), getCurrentPageStabilitySnapshot());
}

/**
 * 把页面滚动到目标位置，并等待布局稳定。
 *
 * @param top - 目标滚动位置。
 * @returns 滚动完成后的最新布局度量。
 */
export async function scrollPageStyleTo(top: number): Promise<PageStyleLayoutMetricsPayload> {
  const targetTop = Math.max(0, Math.round(Number.isFinite(top) ? top : 0));
  window.scrollTo({ top: targetTop, behavior: 'auto' });
  await waitForAnimationFrames(2);
  return extractPageStyleLayoutMetrics();
}
