/**
 * 说明：`runtime` 页面风格 benchmark 运行时模块。
 *
 * 职责：
 * - 在真实浏览器 DOM 里直接复用 `page-style` 内核做基准测量；
 * - 为 cold / warm / scroll / mutation / resize 场景提供稳定的 benchmark API；
 * - 在同一 JS 世界里拦截 `createTreeWalker`、`getComputedStyle`、`getBoundingClientRect`，输出结构性性能计数。
 *
 * 边界：
 * - 本模块只服务 benchmark 页面，不进入扩展默认运行时或 SW 协议；
 * - 不改 page-style 外部 payload 结构，也不持久化任何业务态；
 * - 所有“复位”语义都只通过内部 helper 和 synthetic DOM 完成，不影响真实页面逻辑。
 */
import type {
  PageStyleLayoutMetricsPayload,
  PageStyleSignalsPayload,
} from '@/types/sw-messages';
import {
  extractPageStyleLayoutMetrics,
  extractPageStyleSignals,
  resetPageStyleRuntimeForTesting,
} from '@/extension/content-script/page-style';
import {
  renderPageStyleBenchmarkFixture,
  type PageStyleBenchmarkFixtureId,
} from './fixtures';

/** benchmark 里关注的结构性调用计数。 */
export interface PageStyleBenchmarkCounters {
  createTreeWalkerCalls: number;
  getComputedStyleCalls: number;
  getBoundingClientRectCalls: number;
}

/** 单次 benchmark 测量结果。 */
export interface PageStyleBenchmarkMeasurement {
  scenarioId: string;
  sampleKind: 'signals' | 'metrics';
  fixtureId: PageStyleBenchmarkFixtureId;
  durationMs: number;
  counters: PageStyleBenchmarkCounters;
  pageFingerprint: string;
  scrollY: number | null;
  documentHeight: number | null;
  viewportHeight: number | null;
  title: string;
  url: string;
}

/** resize 准备阶段返回的基线信息。 */
export interface PageStyleBenchmarkResizePreparation {
  fixtureId: PageStyleBenchmarkFixtureId;
  baselineFingerprint: string;
  viewportWidth: number;
  viewportHeight: number;
}

/** 对外暴露给 Node benchmark runner 的页面级 API。 */
export interface PageStyleBenchmarkHarness {
  /**
   * 等 benchmark 页面 DOM、样式和 observer 稳定后再开始正式采样。
   *
   * @returns 页面已经就绪。
   */
  ready(): Promise<boolean>;

  /**
   * 以冷启动状态测一次 signals 抽样。
   *
   * @param fixtureId - 目标 fixture。
   * @returns 单次冷启动测量结果。
   */
  measureColdSignals(fixtureId: PageStyleBenchmarkFixtureId): Promise<PageStyleBenchmarkMeasurement>;

  /**
   * 先预热缓存，再测一次 warm signals 命中。
   *
   * @param fixtureId - 目标 fixture。
   * @returns 单次热缓存测量结果。
   */
  measureWarmSignals(fixtureId: PageStyleBenchmarkFixtureId): Promise<PageStyleBenchmarkMeasurement>;

  /**
   * 在滚动后只提取布局 metrics，验证不会触发整页重采样。
   *
   * @param fixtureId - 目标 fixture。
   * @param scrollTop - 目标滚动位置。
   * @returns 单次滚动 metrics 测量结果。
   */
  measureScrollMetrics(fixtureId: PageStyleBenchmarkFixtureId, scrollTop: number): Promise<PageStyleBenchmarkMeasurement>;

  /**
   * 先制造一次结构失效，再测 signals 重采样。
   *
   * @param fixtureId - 目标 fixture。
   * @returns 单次 mutation invalidation 测量结果。
   */
  measureMutationSignals(fixtureId: PageStyleBenchmarkFixtureId): Promise<PageStyleBenchmarkMeasurement>;

  /**
   * 为 resize 场景先建立 baseline，并返回 resize 前的指纹与视口信息。
   *
   * @param fixtureId - 目标 fixture。
   * @returns resize 基线信息。
   */
  prepareResizeFixture(fixtureId: PageStyleBenchmarkFixtureId): Promise<PageStyleBenchmarkResizePreparation>;

  /**
   * 在 resize 后只提取布局 metrics，验证布局脏标记不会触发整页重采样。
   *
   * @param fixtureId - 目标 fixture。
   * @returns 单次 resize metrics 测量结果。
   */
  measureResizeMetrics(fixtureId: PageStyleBenchmarkFixtureId): Promise<PageStyleBenchmarkMeasurement>;

  /**
   * 在 resize 后重新提取 signals，验证布局变化会触发一次受控重采样。
   *
   * @param fixtureId - 目标 fixture。
   * @returns 单次 resize signals 测量结果。
   */
  measureResizeSignals(fixtureId: PageStyleBenchmarkFixtureId): Promise<PageStyleBenchmarkMeasurement>;
}

type StatusWriter = (text: string) => void;

/**
 * 创建 page-style benchmark 运行时。
 *
 * @param host - synthetic 页面渲染容器。
 * @param writeStatus - 可选状态输出函数。
 * @returns 对外暴露的 benchmark runtime。
 */
export function createPageStyleBenchmarkHarness(
  host: HTMLElement,
  writeStatus?: StatusWriter,
): PageStyleBenchmarkHarness {
  /**
   * 用简单文本同步当前 benchmark 阶段，便于手动打开页面调试。
   *
   * @param text - 状态说明。
   */
  function updateStatus(text: string): void {
    writeStatus?.(text);
  }

  /**
   * 等待两帧，让浏览器完成布局和 observer 回调。
   */
  async function waitForStableFrames(): Promise<void> {
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  /**
   * 等待 DOM mutation 相关的 observer 与微任务结算。
   */
  async function flushDomMutation(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await waitForStableFrames();
  }

  /**
   * 重新渲染指定 fixture，并把 page-style 运行时重置回冷启动状态。
   *
   * @param fixtureId - 目标 fixture。
   */
  async function resetAndRenderFixture(fixtureId: PageStyleBenchmarkFixtureId): Promise<void> {
    updateStatus(`reset:${fixtureId}`);
    resetPageStyleRuntimeForTesting();
    renderPageStyleBenchmarkFixture(fixtureId, host);
    await waitForStableFrames();
  }

  /**
   * 根据当前 benchmark fixture 触发一次结构失效。
   *
   * @param fixtureId - 当前 fixture。
   */
  async function invalidateFixtureStructure(fixtureId: PageStyleBenchmarkFixtureId): Promise<void> {
    document.body.classList.add(`benchmark-mutated-${fixtureId}`);
    document.documentElement.setAttribute('data-theme', `${fixtureId}-mutated`);
    const anchor = host.querySelector('main') ?? host;
    anchor.insertAdjacentHTML(
      'beforeend',
      `<section data-benchmark-late-section="${fixtureId}" style="margin: 48px 0 0; padding: 48px; border-radius: 24px; background: rgba(255, 255, 255, 0.82); border: 1px solid rgb(220, 225, 235); box-shadow: 0 16px 36px rgba(15, 23, 42, 0.08);">Late section for ${fixtureId}</section>`,
    );
    await flushDomMutation();
  }

  /**
   * 在单次调用外层包一层结构性计数和高精度计时。
   *
   * @param scenarioId - 场景标识。
   * @param fixtureId - 当前 fixture。
   * @param sampleKind - signals / metrics。
   * @param operation - 真正要执行的 page-style 调用。
   * @returns 单次测量结果。
   */
  async function measureOperation(
    scenarioId: string,
    fixtureId: PageStyleBenchmarkFixtureId,
    sampleKind: 'signals' | 'metrics',
    operation: () => PageStyleSignalsPayload | PageStyleLayoutMetricsPayload,
  ): Promise<PageStyleBenchmarkMeasurement> {
    const counters: PageStyleBenchmarkCounters = {
      createTreeWalkerCalls: 0,
      getComputedStyleCalls: 0,
      getBoundingClientRectCalls: 0,
    };
    const originalCreateTreeWalker = Document.prototype.createTreeWalker;
    const originalGetComputedStyle = window.getComputedStyle;
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

    Document.prototype.createTreeWalker = function createTreeWalkerPatched(
      root: Node,
      whatToShow?: number,
      filter?: NodeFilter | null,
    ): TreeWalker {
      counters.createTreeWalkerCalls += 1;
      return originalCreateTreeWalker.call(this, root, whatToShow, filter);
    };
    window.getComputedStyle = function getComputedStylePatched(
      element: Element,
      pseudoElement?: string | null,
    ): CSSStyleDeclaration {
      counters.getComputedStyleCalls += 1;
      return originalGetComputedStyle.call(window, element, pseudoElement);
    } as typeof window.getComputedStyle;
    Element.prototype.getBoundingClientRect = function getBoundingClientRectPatched(): DOMRect {
      counters.getBoundingClientRectCalls += 1;
      return originalGetBoundingClientRect.call(this);
    };

    try {
      updateStatus(`measure:${scenarioId}`);
      const start = performance.now();
      const payload = operation();
      const durationMs = performance.now() - start;
      const metricsPayload = sampleKind === 'metrics' ? payload as PageStyleLayoutMetricsPayload : null;

      return {
        scenarioId,
        sampleKind,
        fixtureId,
        durationMs,
        counters,
        pageFingerprint: payload.pageFingerprint,
        scrollY: metricsPayload?.scrollY ?? null,
        documentHeight: metricsPayload?.documentHeight ?? null,
        viewportHeight: metricsPayload?.viewportHeight ?? null,
        title: payload.title,
        url: payload.url,
      };
    } finally {
      Document.prototype.createTreeWalker = originalCreateTreeWalker;
      window.getComputedStyle = originalGetComputedStyle;
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  }

  return {
    /**
     * 等 benchmark 页面初次渲染稳定后再允许外部开始采样。
     *
     * @returns 页面已就绪。
     */
    async ready(): Promise<boolean> {
      updateStatus('ready');
      await waitForStableFrames();
      return true;
    },
    /**
     * 以冷启动状态采一轮完整 signals，给后续 warm/ratio guard 提供基线。
     *
     * @param fixtureId - 目标 fixture。
     * @returns 冷启动场景的测量结果。
     */
    async measureColdSignals(fixtureId: PageStyleBenchmarkFixtureId): Promise<PageStyleBenchmarkMeasurement> {
      await resetAndRenderFixture(fixtureId);
      return await measureOperation('cold-signals', fixtureId, 'signals', () => extractPageStyleSignals());
    },
    /**
     * 先预热内容脚本缓存，再测热命中场景是否保持零额外整页采样。
     *
     * @param fixtureId - 目标 fixture。
     * @returns 热缓存场景的测量结果。
     */
    async measureWarmSignals(fixtureId: PageStyleBenchmarkFixtureId): Promise<PageStyleBenchmarkMeasurement> {
      await resetAndRenderFixture(fixtureId);
      extractPageStyleSignals();
      return await measureOperation('warm-signals', fixtureId, 'signals', () => extractPageStyleSignals());
    },
    /**
     * 在完成预热后执行滚动，并只提取布局 metrics。
     *
     * @param fixtureId - 目标 fixture。
     * @param scrollTop - 目标滚动位置。
     * @returns 纯滚动 metrics 场景的测量结果。
     */
    async measureScrollMetrics(
      fixtureId: PageStyleBenchmarkFixtureId,
      scrollTop: number,
    ): Promise<PageStyleBenchmarkMeasurement> {
      await resetAndRenderFixture(fixtureId);
      extractPageStyleSignals();
      window.scrollTo({ top: Math.max(0, Math.round(scrollTop)), behavior: 'auto' });
      await waitForStableFrames();
      return await measureOperation('scroll-metrics', fixtureId, 'metrics', () => extractPageStyleLayoutMetrics());
    },
    /**
     * 在预热后制造一次结构失效，再测 signals 是否只触发一轮受控重采样。
     *
     * @param fixtureId - 目标 fixture。
     * @returns mutation invalidation 场景的测量结果。
     */
    async measureMutationSignals(fixtureId: PageStyleBenchmarkFixtureId): Promise<PageStyleBenchmarkMeasurement> {
      await resetAndRenderFixture(fixtureId);
      extractPageStyleSignals();
      await invalidateFixtureStructure(fixtureId);
      return await measureOperation('mutation-signals', fixtureId, 'signals', () => extractPageStyleSignals());
    },
    /**
     * 为 resize 场景建立基线指纹，供 runner 在变更 viewport 前记录初始状态。
     *
     * @param fixtureId - 目标 fixture。
     * @returns resize 前的基线信息。
     */
    async prepareResizeFixture(fixtureId: PageStyleBenchmarkFixtureId): Promise<PageStyleBenchmarkResizePreparation> {
      await resetAndRenderFixture(fixtureId);
      const baseline = extractPageStyleSignals();
      return {
        fixtureId,
        baselineFingerprint: baseline.pageFingerprint,
        viewportWidth: Math.round(window.innerWidth || 0),
        viewportHeight: Math.round(window.innerHeight || 0),
      };
    },
    /**
     * resize 后只提取布局 metrics，验证 layout dirty 不会误触发整页重采样。
     *
     * @param fixtureId - 目标 fixture。
     * @returns resize metrics 场景的测量结果。
     */
    async measureResizeMetrics(fixtureId: PageStyleBenchmarkFixtureId): Promise<PageStyleBenchmarkMeasurement> {
      await waitForStableFrames();
      return await measureOperation('resize-metrics', fixtureId, 'metrics', () => extractPageStyleLayoutMetrics());
    },
    /**
     * resize 后再次提取 signals，验证 viewport 变化会触发一次受控重采样。
     *
     * @param fixtureId - 目标 fixture。
     * @returns resize signals 场景的测量结果。
     */
    async measureResizeSignals(fixtureId: PageStyleBenchmarkFixtureId): Promise<PageStyleBenchmarkMeasurement> {
      await waitForStableFrames();
      return await measureOperation('resize-signals', fixtureId, 'signals', () => extractPageStyleSignals());
    },
  };
}
