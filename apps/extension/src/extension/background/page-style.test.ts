/**
 * 说明：`page-style.test` 后台页面风格截图模块测试。
 *
 * 职责：
 * - 验证整页截图采样点规划仍能覆盖长页面；
 * - 验证 `captureVisibleTab` 调度会主动节流，避免撞浏览器频率配额；
 * - 验证命中浏览器截图配额时会重试，并在最终失败时返回本地化错误 key。
 *
 * 边界：
 * - 这里只覆盖 SW 侧截图编排与错误收敛，不验证真实浏览器截图像素内容；
 * - `chrome.tabs.*` 通过轻量 mock 驱动，content script 布局读取也只覆盖协议形状。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type RuntimeLastErrorState = {
  lastError?: {
    message: string;
  };
};

/**
 * 安装本测试需要的最小 `chrome.tabs` mock。
 *
 * @param params - 布局参数与截图行为覆盖项。
 * @returns 当前测试用到的 mock 句柄。
 */
function installPageStyleChrome(params?: {
  documentHeight?: number;
  viewportHeight?: number;
  initialScrollY?: number;
  onCapture?: (callIndex: number, callback: (dataUrl?: string) => void, runtimeState: RuntimeLastErrorState) => void;
}) {
  const runtimeState: RuntimeLastErrorState = {};
  let scrollY = params?.initialScrollY ?? 0;
  const documentHeight = params?.documentHeight ?? 3_200;
  const viewportHeight = params?.viewportHeight ?? 1_000;

  const sendMessage = vi.fn((tabId: number, message: Record<string, unknown>, callback: (response: unknown) => void) => {
    if (tabId !== 1) throw new Error(`unexpected tab id: ${tabId}`);
    if (message.type === 'page-style/layout/get') {
      callback({
        payload: {
          documentHeight,
          viewportHeight,
          scrollY,
          title: 'Example',
          url: 'https://example.com',
        },
      });
      return;
    }
    if (message.type === 'page-style/scroll-to') {
      scrollY = Number((message.payload as { top?: number } | undefined)?.top ?? 0);
      callback({
        payload: {
          documentHeight,
          viewportHeight,
          scrollY,
          title: 'Example',
          url: 'https://example.com',
        },
      });
      return;
    }
    callback({});
  });

  const get = vi.fn((tabId: number, callback: (tab: chrome.tabs.Tab | undefined) => void) => {
    callback({ id: tabId, windowId: 7 } as chrome.tabs.Tab);
  });

  const captureVisibleTab = vi.fn((windowId: number, _options: { format?: string }, callback: (dataUrl?: string) => void) => {
    if (windowId !== 7) throw new Error(`unexpected window id: ${windowId}`);
    const callIndex = captureVisibleTab.mock.calls.length - 1;
    if (params?.onCapture) {
      params.onCapture(callIndex, callback, runtimeState);
      return;
    }
    callback(`data:image/png;base64,frame-${callIndex + 1}`);
  });

  (globalThis as unknown as { chrome?: typeof chrome }).chrome = {
    runtime: runtimeState,
    tabs: {
      get,
      sendMessage,
      captureVisibleTab,
    },
  } as unknown as typeof chrome;

  return {
    sendMessage,
    captureVisibleTab,
    get,
  };
}

describe('page-style background capture orchestration', () => {
  const originalChrome = globalThis.chrome;

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetModules();
    if (originalChrome) {
      (globalThis as unknown as { chrome?: typeof chrome }).chrome = originalChrome;
      return;
    }
    delete (globalThis as unknown as { chrome?: typeof chrome }).chrome;
  });

  it('plans evenly distributed capture offsets for long pages', async () => {
    const { planPageStyleCaptureOffsets } = await import('./page-style');

    expect(planPageStyleCaptureOffsets({
      documentHeight: 4_800,
      viewportHeight: 1_000,
    }, 5)).toEqual([0, 950, 1_900, 2_850, 3_800]);
  });

  it('paces captureVisibleTab calls across multi-frame screenshots', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-08T10:00:00.000Z'));

    const captureStartedAt: number[] = [];
    installPageStyleChrome({
      initialScrollY: 240,
      onCapture: (_callIndex, callback) => {
        captureStartedAt.push(Date.now());
        callback('data:image/png;base64,ok');
      },
    });

    const { capturePageStyleFrames } = await import('./page-style');
    const resultPromise = capturePageStyleFrames(1, { maxCaptures: 3 });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.frames).toHaveLength(3);
    expect(captureStartedAt).toHaveLength(3);
    expect(captureStartedAt[1]! - captureStartedAt[0]!).toBeGreaterThanOrEqual(700);
    expect(captureStartedAt[2]! - captureStartedAt[1]!).toBeGreaterThanOrEqual(700);
  });

  it('coalesces same ask/page capture requests into one live capture promise', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-08T10:00:00.000Z'));

    const chromeMock = installPageStyleChrome({
      initialScrollY: 120,
      onCapture: (_callIndex, callback) => {
        callback('data:image/png;base64,coalesced');
      },
    });

    const { capturePageStyleFrames } = await import('./page-style');
    const pending = Promise.all([
      capturePageStyleFrames(1, { maxCaptures: 3, captureRequestKey: 'topic-1::fingerprint::3' }),
      capturePageStyleFrames(1, { maxCaptures: 3, captureRequestKey: 'topic-1::fingerprint::3' }),
      capturePageStyleFrames(1, { maxCaptures: 3, captureRequestKey: 'topic-1::fingerprint::3' }),
    ]);
    await vi.runAllTimersAsync();
    const results = await pending;

    expect(results).toHaveLength(3);
    expect(results.every((item) => item.frames.length === 3)).toBe(true);
    expect(chromeMock.captureVisibleTab).toHaveBeenCalledTimes(3);
  });

  it('retries quota-limited captures and eventually succeeds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-08T10:00:00.000Z'));

    let attempts = 0;
    installPageStyleChrome({
      documentHeight: 1_000,
      viewportHeight: 1_000,
      onCapture: (_callIndex, callback, runtimeState) => {
        attempts += 1;
        if (attempts === 1) {
          runtimeState.lastError = {
            message: 'This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota.',
          };
          callback(undefined);
          runtimeState.lastError = undefined;
          return;
        }
        callback('data:image/png;base64,retry-ok');
      },
    });

    const { capturePageStyleFrames } = await import('./page-style');
    const resultPromise = capturePageStyleFrames(1, { maxCaptures: 1 });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(attempts).toBe(2);
    expect(result.frames).toEqual([expect.objectContaining({
      dataUrl: 'data:image/png;base64,retry-ok',
    })]);
  });

  it('returns a localized rate-limit error after exhausting capture retries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-08T10:00:00.000Z'));

    installPageStyleChrome({
      documentHeight: 1_000,
      viewportHeight: 1_000,
      onCapture: (_callIndex, callback, runtimeState) => {
        runtimeState.lastError = {
          message: 'This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota.',
        };
        callback(undefined);
        runtimeState.lastError = undefined;
      },
    });

    const { capturePageStyleFrames } = await import('./page-style');
    const resultPromise = capturePageStyleFrames(1, { maxCaptures: 1 });
    void resultPromise.catch(() => undefined);
    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toMatchObject({
      name: 'I18nError',
      i18n: {
        key: 'errors.pageStyleScreenshotsRateLimited',
      },
    });
  });

  it('cleans keyed failed captures without creating an unhandled rejection', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-08T10:00:00.000Z'));

    const unhandledRejections: unknown[] = [];
    /**
     * 捕获测试窗口里的未处理 Promise rejection。
     *
     * 说明：本用例专门守住 `captureRequestKey` 清理逻辑不能再创建 detached rejection；
     * 一旦发生未处理错误，数组断言会给出稳定失败信号。
     */
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      unhandledRejections.push(event.reason);
      event.preventDefault();
    };
    globalThis.addEventListener('unhandledrejection', onUnhandledRejection);

    let failFirstCapture = true;
    installPageStyleChrome({
      documentHeight: 1_000,
      viewportHeight: 1_000,
      onCapture: (_callIndex, callback, runtimeState) => {
        if (failFirstCapture) {
          failFirstCapture = false;
          runtimeState.lastError = {
            message: 'Tabs cannot be captured right now.',
          };
          callback(undefined);
          runtimeState.lastError = undefined;
          return;
        }
        callback('data:image/png;base64,recovered');
      },
    });

    try {
      const { capturePageStyleFrames } = await import('./page-style');
      const failedPromise = capturePageStyleFrames(1, {
        maxCaptures: 1,
        captureRequestKey: 'topic-1::fingerprint-docs-v1::1',
      });
      void failedPromise.catch(() => undefined);
      await vi.runAllTimersAsync();
      await expect(failedPromise).rejects.toMatchObject({
        name: 'I18nError',
        i18n: {
          key: 'errors.pageStyleScreenshotsUnavailableWithDetail',
          params: {
            detail: 'Tabs cannot be captured right now.',
          },
        },
      });

      await Promise.resolve();
      await Promise.resolve();
      expect(unhandledRejections).toEqual([]);

      const recoveredPromise = capturePageStyleFrames(1, {
        maxCaptures: 1,
        captureRequestKey: 'topic-1::fingerprint-docs-v1::1',
      });
      await vi.runAllTimersAsync();
      await expect(recoveredPromise).resolves.toMatchObject({
        frames: [expect.objectContaining({
          dataUrl: 'data:image/png;base64,recovered',
        })],
      });
    } finally {
      globalThis.removeEventListener('unhandledrejection', onUnhandledRejection);
    }
  });
});
