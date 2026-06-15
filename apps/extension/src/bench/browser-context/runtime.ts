/**
 * 说明：`runtime` browser-context benchmark 运行时模块。
 *
 * 职责：
 * - 在不走 UI 壳层的前提下，直接驱动 browser-context 当前真实实现；
 * - 统一提供 `tab-switch-follow`、`send-preflight`、`capture-coalescing` 三个热点场景；
 * - 把每轮 benchmark 的结构性事实与内部 metrics 快照一起返回给 runner。
 *
 * 边界：
 * - 本模块只服务 benchmark，不进入聊天主链路；
 * - 这里只搭最小 mock 环境，不改 product contract；
 * - benchmark 只验证当前实现的性能/可用性守卫，不承担功能回归测试全覆盖。
 */
import type { Assistant } from '@/types/assistant';
import type { Topic } from '@/types/chat';
import {
  createEmptyBrowserContextSourceManifest,
  clearBrowserContextPromptCache,
  getBrowserContextSourceManifest,
  resetBrowserContextRuntime,
  resolveBrowserContextForSend,
  scheduleBrowserContextWork,
  setBrowserContextActiveConversationKey,
  setBrowserContextMetadata,
  setBrowserContextSourceManifest,
  setBrowserContextStatus,
} from '@/lib/browser-context';
import {
  getBrowserContextMetricsSnapshot,
  resetBrowserContextMetricsForTesting,
  type BrowserContextMetricsSnapshot,
} from '@/lib/browser-context/metrics';
import {
  capturePageStyleFrames,
  resetPageStyleCaptureRuntimeForTesting,
} from '@/extension/background/page-style';
import { useAssistantStore } from '@/hooks/useAssistantStore';

type GlobalChromeState = typeof globalThis & { chrome?: typeof chrome };

const BENCHMARK_ASSISTANT_ID = 'assistant-bench';
const BENCHMARK_TOPIC_ID = 'topic-bench';
const BENCHMARK_URL = 'https://example.com/article';
const BENCHMARK_TAB_ID = 7;
const BENCHMARK_TECHNOLOGY_STACK_PAGE_KEY = `${BENCHMARK_TAB_ID}::${BENCHMARK_URL}::0`;

/** 单次 benchmark 样本。 */
export interface BrowserContextBenchmarkSample {
  durationMs: number;
  details?: Record<string, number>;
}

/** 单个场景 benchmark 结果。 */
export interface BrowserContextBenchmarkScenarioResult {
  scenarioId: 'tab-switch-follow' | 'send-preflight' | 'capture-coalescing';
  samples: BrowserContextBenchmarkSample[];
  metrics: BrowserContextMetricsSnapshot;
}

/**
 * 构造最小可用 topic。
 *
 * @returns benchmark topic。
 */
function createBenchmarkTopic(): Topic {
  return {
    id: BENCHMARK_TOPIC_ID,
    assistantId: BENCHMARK_ASSISTANT_ID,
    name: 'Benchmark Topic',
    pinned: false,
    createdAt: 1,
    updatedAt: 1,
    order: 1,
    isNameManuallyEdited: false,
    browserContextMode: {
      enabled: true,
      fullPageEnabled: false,
      styleSignalsEnabled: false,
    },
  };
}

/**
 * 构造最小可用 assistant。
 *
 * @returns benchmark assistant。
 */
function createBenchmarkAssistant(): Assistant {
  return {
    id: BENCHMARK_ASSISTANT_ID,
    scenario: 'browser',
    name: 'Benchmark Assistant',
    prompt: 'benchmark prompt',
    topics: [createBenchmarkTopic()],
    order: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

/**
 * 把 browser-context 运行时恢复到干净状态。
 */
function resetBrowserContextBenchmarkState(): void {
  clearBrowserContextPromptCache();
  resetBrowserContextRuntime();
  resetBrowserContextMetricsForTesting();
  setBrowserContextActiveConversationKey(BENCHMARK_TOPIC_ID);
  useAssistantStore.setState({
    presets: [],
    assistants: [createBenchmarkAssistant()],
  });
}

/**
 * 构造当前页面 metadata。
 *
 * @returns metadata 快照。
 */
function createBenchmarkMetadata() {
  return {
    title: 'Benchmark Page',
    url: BENCHMARK_URL,
    favicon: 'https://example.com/favicon.ico',
    tabId: BENCHMARK_TAB_ID,
    extractedAt: Date.now(),
    technologyStackPageKey: BENCHMARK_TECHNOLOGY_STACK_PAGE_KEY,
  };
}

/**
 * 以极简方式等待一段时间。
 *
 * @param durationMs - 等待时长。
 */
async function waitMs(durationMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(() => resolve(), Math.max(0, Math.round(durationMs)));
  });
}

/**
 * 安装发送前预检场景所需的 runtime mock。
 *
 * @returns 当前 mock 的调用计数句柄与恢复函数。
 */
function installSendPreflightChromeMock(): {
  counts: {
    layoutRequests: number;
    readableDomRequests: number;
    technologyStackRequests: number;
  };
  restore: () => void;
} {
  const previousChrome = (globalThis as GlobalChromeState).chrome;
  const counts = {
    layoutRequests: 0,
    readableDomRequests: 0,
    technologyStackRequests: 0,
  };

  (globalThis as GlobalChromeState).chrome = {
    runtime: {
      lastError: undefined,
      sendMessage: (message: { type?: string; payload?: { minPass?: string } }, callback: (response: unknown) => void) => {
        if (message.type === 'browser-context/page-style-layout/get') {
          counts.layoutRequests += 1;
          globalThis.setTimeout(() => {
            callback({
              ok: true,
              payload: {
                title: 'Benchmark Page',
                url: BENCHMARK_URL,
                pageFingerprint: 'bench-page-fingerprint',
                routeKey: BENCHMARK_URL,
                stableWindowVersion: 1,
                documentHeight: 2_400,
                viewportHeight: 900,
                viewportWidth: 1_440,
                scrollY: 0,
                extractedAt: Date.now(),
              },
            });
          }, 8);
          return;
        }

        if (message.type === 'browser-context/readable-dom/get') {
          counts.readableDomRequests += 1;
          globalThis.setTimeout(() => {
            callback({
              ok: true,
              payload: {
                title: 'Benchmark Page',
                url: BENCHMARK_URL,
                pageFingerprint: 'bench-page-fingerprint',
                routeKey: BENCHMARK_URL,
                stableWindowVersion: 1,
                extractedAt: Date.now(),
                intent: 'normal',
                mode: 'article',
                text: 'Benchmark readable body '.repeat(80).trim(),
                html: '<article><h1>Benchmark</h1><p>Body</p></article>',
                articleTitle: 'Benchmark Page',
                byline: '',
                excerpt: 'Benchmark excerpt',
                headings: [{ level: 1, text: 'Benchmark' }],
                contentChars: 1_920,
                visibleTextChars: 1_920,
              },
            });
          }, 12);
          return;
        }

        if (message.type === 'technology-stack/get') {
          counts.technologyStackRequests += 1;
          globalThis.setTimeout(() => {
            callback({
              ok: true,
              payload: {
                status: 'ready',
                tabId: BENCHMARK_TAB_ID,
                url: BENCHMARK_URL,
                title: 'Benchmark Page',
                pageFingerprint: 'bench-page-fingerprint',
                detectedAt: Date.now(),
                scanCoverage: 'complete',
                rulePackage: {
                  total: 41,
                  technologyCount: 41,
                  categoryCount: 12,
                  snapshotVersion: 'test',
                  source: 'local-fingerprint-snapshot',
                  unsupportedSignals: [],
                  updateChannel: 'extension-release',
                },
                technologies: [
                  {
                    name: 'React',
                    slug: 'react',
                    categories: ['framework'],
                    version: '18.3.1',
                    versionReliability: 'exact',
                    confidence: 100,
                    sources: ['js', 'script-src'],
                    evidence: [
                      {
                        source: 'js',
                        key: 'React',
                        value: 'window.React',
                        confidence: 80,
                      },
                      {
                        source: 'script-src',
                        key: 'script',
                        value: 'react-dom.production.min.js',
                        confidence: 70,
                      },
                    ],
                    website: 'https://react.dev/',
                    description: 'JavaScript UI library',
                    iconFallback: 'R',
                  },
                ],
              },
              meta: {
                pageKey: BENCHMARK_TECHNOLOGY_STACK_PAGE_KEY,
                enhanced: message.payload?.minPass === 'enhanced',
              },
            });
          }, 5);
          return;
        }

        callback({ ok: false, error: 'collector-unavailable' });
      },
    },
  } as unknown as typeof chrome;

  return {
    counts,
    /** 恢复 benchmark 前的 `chrome` runtime mock。 */
    restore() {
      if (previousChrome) {
        (globalThis as GlobalChromeState).chrome = previousChrome;
        return;
      }
      const target = globalThis as unknown as { chrome?: typeof chrome };
      delete target.chrome;
    },
  };
}

/**
 * 安装截图合并场景所需的 tabs mock。
 *
 * @returns 调用计数句柄与恢复函数。
 */
function installCaptureChromeMock(): {
  counts: {
    captureCalls: number;
    layoutReads: number;
    scrollWrites: number;
  };
  restore: () => void;
} {
  const previousChrome = (globalThis as GlobalChromeState).chrome;
  const counts = {
    captureCalls: 0,
    layoutReads: 0,
    scrollWrites: 0,
  };
  let scrollY = 0;

  (globalThis as GlobalChromeState).chrome = {
    runtime: {
      lastError: undefined,
    },
    tabs: {
      get: (tabId: number, callback: (tab?: chrome.tabs.Tab) => void) => {
        callback({ id: tabId, windowId: 11 } as chrome.tabs.Tab);
      },
      sendMessage: (_tabId: number, message: { type?: string; payload?: { top?: number } }, callback: (response: unknown) => void) => {
        if (message.type === 'page-style/layout/get') {
          counts.layoutReads += 1;
          callback({
            payload: {
              title: 'Benchmark Page',
              url: BENCHMARK_URL,
              pageFingerprint: 'capture-page-fingerprint',
              routeKey: BENCHMARK_URL,
              stableWindowVersion: 2,
              documentHeight: 3_100,
              viewportHeight: 1_000,
              viewportWidth: 1_440,
              scrollY,
              extractedAt: Date.now(),
            },
          });
          return;
        }

        if (message.type === 'page-style/scroll-to') {
          counts.scrollWrites += 1;
          scrollY = Math.max(0, Math.round(message.payload?.top ?? 0));
          callback({
            payload: {
              title: 'Benchmark Page',
              url: BENCHMARK_URL,
              pageFingerprint: 'capture-page-fingerprint',
              routeKey: BENCHMARK_URL,
              stableWindowVersion: 2,
              documentHeight: 3_100,
              viewportHeight: 1_000,
              viewportWidth: 1_440,
              scrollY,
              extractedAt: Date.now(),
            },
          });
          return;
        }

        callback({});
      },
      captureVisibleTab: (_windowId: number, _options: { format?: string }, callback: (dataUrl?: string) => void) => {
        counts.captureCalls += 1;
        callback(`data:image/png;base64,capture-${counts.captureCalls}`);
      },
    },
  } as unknown as typeof chrome;

  return {
    counts,
    /** 恢复 benchmark 前的 `chrome` tabs mock。 */
    restore() {
      if (previousChrome) {
        (globalThis as GlobalChromeState).chrome = previousChrome;
        return;
      }
      const target = globalThis as unknown as { chrome?: typeof chrome };
      delete target.chrome;
    },
  };
}

/**
 * 运行快速 tab 切换跟随场景。
 *
 * @param iterations - 迭代次数。
 * @returns 场景结果。
 */
export async function runTabSwitchFollowBenchmark(iterations: number): Promise<BrowserContextBenchmarkScenarioResult> {
  const samples: BrowserContextBenchmarkSample[] = [];
  resetBrowserContextBenchmarkState();

  for (let index = 0; index < iterations; index += 1) {
    clearBrowserContextPromptCache();
    resetBrowserContextRuntime();
    setBrowserContextActiveConversationKey(BENCHMARK_TOPIC_ID);
    setBrowserContextMetadata({
      ...createBenchmarkMetadata(),
      extractedAt: Date.now(),
    });
    const manifest = createEmptyBrowserContextSourceManifest();
    manifest['tab-meta'] = {
      sourceId: 'tab-meta',
      identity: `${BENCHMARK_TAB_ID}::${BENCHMARK_URL}`,
      freshness: 'fresh',
      collectedAt: Date.now(),
      issueCode: null,
      payloadRef: 'tab-meta::bench',
    };
    manifest['readable-dom'] = {
      sourceId: 'readable-dom',
      identity: `${BENCHMARK_TAB_ID}::${BENCHMARK_URL}::bench-page-fingerprint::${BENCHMARK_URL}::1`,
      freshness: 'fresh',
      collectedAt: Date.now(),
      issueCode: null,
      payloadRef: 'readable-dom::bench',
    };
    setBrowserContextSourceManifest(manifest);
    setBrowserContextStatus('ready');

    const startedAt = performance.now();
    scheduleBrowserContextWork({
      reason: 'metadata-follow',
      conversationKey: BENCHMARK_TOPIC_ID,
    });
    const durationMs = performance.now() - startedAt;
    const currentManifest = getBrowserContextSourceManifest();
    samples.push({
      durationMs,
      details: {
        staleEntries: Number(currentManifest['tab-meta'].freshness === 'stale') + Number(currentManifest['readable-dom'].freshness === 'stale'),
      },
    });
  }

  return {
    scenarioId: 'tab-switch-follow',
    samples,
    metrics: getBrowserContextMetricsSnapshot(),
  };
}

/**
 * 运行发送前预检场景。
 *
 * @param iterations - 迭代次数。
 * @returns 场景结果。
 */
export async function runSendPreflightBenchmark(iterations: number): Promise<BrowserContextBenchmarkScenarioResult> {
  const samples: BrowserContextBenchmarkSample[] = [];
  resetBrowserContextBenchmarkState();
  const chromeMock = installSendPreflightChromeMock();

  try {
    for (let index = 0; index < iterations; index += 1) {
      clearBrowserContextPromptCache();
      resetBrowserContextRuntime();
      setBrowserContextActiveConversationKey(BENCHMARK_TOPIC_ID);
      setBrowserContextMetadata({
        ...createBenchmarkMetadata(),
        extractedAt: Date.now(),
      });
      const layoutRequestsBefore = chromeMock.counts.layoutRequests;
      const readableDomRequestsBefore = chromeMock.counts.readableDomRequests;
      const technologyStackRequestsBefore = chromeMock.counts.technologyStackRequests;

      const coldStartedAt = performance.now();
      const cold = await resolveBrowserContextForSend({
        assistantId: BENCHMARK_ASSISTANT_ID,
        conversationKey: BENCHMARK_TOPIC_ID,
        requireReadableDom: true,
        requireStyleSignals: false,
        requireCaptures: false,
        budgetMs: 400,
      });
      const coldDurationMs = performance.now() - coldStartedAt;

      const warmStartedAt = performance.now();
      const warm = await resolveBrowserContextForSend({
        assistantId: BENCHMARK_ASSISTANT_ID,
        conversationKey: BENCHMARK_TOPIC_ID,
        requireReadableDom: true,
        requireStyleSignals: false,
        requireCaptures: false,
        budgetMs: 400,
      });
      const warmDurationMs = performance.now() - warmStartedAt;

      if (!cold.browserContext.prompt || !warm.browserContext.prompt) {
        throw new Error('send-preflight benchmark 未产出 browser-context prompt');
      }

      samples.push({
        durationMs: coldDurationMs,
        details: {
          warmDurationMs,
          layoutRequests: chromeMock.counts.layoutRequests - layoutRequestsBefore,
          readableDomRequests: chromeMock.counts.readableDomRequests - readableDomRequestsBefore,
          technologyStackRequests: chromeMock.counts.technologyStackRequests - technologyStackRequestsBefore,
          degraded: Number(cold.degraded || warm.degraded),
        },
      });
    }
  } finally {
    chromeMock.restore();
  }

  return {
    scenarioId: 'send-preflight',
    samples,
    metrics: getBrowserContextMetricsSnapshot(),
  };
}

/**
 * 运行截图 ask 级合并场景。
 *
 * @param iterations - 迭代次数。
 * @returns 场景结果。
 */
export async function runCaptureCoalescingBenchmark(iterations: number): Promise<BrowserContextBenchmarkScenarioResult> {
  const samples: BrowserContextBenchmarkSample[] = [];
  resetBrowserContextBenchmarkState();
  const chromeMock = installCaptureChromeMock();

  try {
    for (let index = 0; index < iterations; index += 1) {
      resetPageStyleCaptureRuntimeForTesting();
      const captureCallsBefore = chromeMock.counts.captureCalls;
      const layoutReadsBefore = chromeMock.counts.layoutReads;
      const scrollWritesBefore = chromeMock.counts.scrollWrites;
      const startedAt = performance.now();
      const results = await Promise.all([
        capturePageStyleFrames(1, {
          maxCaptures: 3,
          captureRequestKey: 'topic-bench::capture-page-fingerprint::3',
          expectedPageFingerprint: 'capture-page-fingerprint',
          priority: 2,
        }),
        capturePageStyleFrames(1, {
          maxCaptures: 3,
          captureRequestKey: 'topic-bench::capture-page-fingerprint::3',
          expectedPageFingerprint: 'capture-page-fingerprint',
          priority: 2,
        }),
        capturePageStyleFrames(1, {
          maxCaptures: 3,
          captureRequestKey: 'topic-bench::capture-page-fingerprint::3',
          expectedPageFingerprint: 'capture-page-fingerprint',
          priority: 2,
        }),
        capturePageStyleFrames(1, {
          maxCaptures: 3,
          captureRequestKey: 'topic-bench::capture-page-fingerprint::3',
          expectedPageFingerprint: 'capture-page-fingerprint',
          priority: 2,
        }),
      ]);
      const durationMs = performance.now() - startedAt;

      if (results.some((item) => item.frames.length !== 3)) {
        throw new Error('capture-coalescing benchmark 未拿到完整截图帧');
      }

      samples.push({
        durationMs,
        details: {
          captureCalls: chromeMock.counts.captureCalls - captureCallsBefore,
          layoutReads: chromeMock.counts.layoutReads - layoutReadsBefore,
          scrollWrites: chromeMock.counts.scrollWrites - scrollWritesBefore,
        },
      });
      await waitMs(20);
    }
  } finally {
    chromeMock.restore();
  }

  return {
    scenarioId: 'capture-coalescing',
    samples,
    metrics: getBrowserContextMetricsSnapshot(),
  };
}
