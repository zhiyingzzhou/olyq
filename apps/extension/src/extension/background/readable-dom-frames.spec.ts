/**
 * 说明：`readable-dom-frames.spec` 后台 iframe 正文汇总器测试。
 *
 * 职责：
 * - 验证顶层正文成功时不枚举 iframe；
 * - 验证顶层正文不达标时会按 frameId 采集可见 iframe；
 * - 验证多个 iframe 候选按正文质量排序。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendExtensionTabMessage } from '@/lib/extension/runtime-api';
import type { BrowserContextReadableDomPayload } from '@/types/sw-messages';
import {
  collectReadableDomFromTab,
  rankReadableFramePayloads,
  type ReadableDomFrameCandidate,
} from './readable-dom-frames';

const { sendExtensionTabMessageMock } = vi.hoisted(() => ({
  sendExtensionTabMessageMock: vi.fn(),
}));

vi.mock('@/lib/extension/runtime-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/extension/runtime-api')>('@/lib/extension/runtime-api');
  return {
    ...actual,
    sendExtensionTabMessage: sendExtensionTabMessageMock,
  };
});

/** 构造 readable-dom payload。 */
function makePayload(overrides: Partial<BrowserContextReadableDomPayload> = {}): BrowserContextReadableDomPayload {
  const text = overrides.text ?? 'A readable body with enough content to pass the extraction gate.';
  return {
    title: 'Frame',
    url: 'https://example.com/frame',
    extractedAt: 1,
    pageFingerprint: 'fp',
    routeKey: 'route',
    stableWindowVersion: 1,
    intent: 'normal',
    mode: 'visible-page',
    text,
    html: '',
    articleTitle: 'Frame Article',
    byline: '',
    excerpt: '',
    headings: [],
    contentChars: text.length,
    visibleTextChars: text.length,
    ...overrides,
  };
}

/** 安装 webNavigation frame mock。 */
function installFrameMock(frames: Array<{ frameId: number; parentFrameId: number; url: string }>) {
  const getAllFrames = vi.fn((_details: chrome.webNavigation.GetAllFrameDetails, callback: (details?: chrome.webNavigation.GetAllFrameResultDetails[]) => void) => {
    callback(frames as chrome.webNavigation.GetAllFrameResultDetails[]);
  });
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'test-extension',
      lastError: undefined,
    },
    webNavigation: {
      getAllFrames,
    },
  });
  return { getAllFrames };
}

describe('readable-dom frame collector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('顶层 frame 正文成功时不枚举 iframe', async () => {
    const { getAllFrames } = installFrameMock([
      { frameId: 0, parentFrameId: -1, url: 'https://host.example/' },
      { frameId: 3, parentFrameId: 0, url: 'https://embed.example/' },
    ]);
    sendExtensionTabMessageMock.mockResolvedValueOnce({ payload: makePayload({ title: 'Top', url: 'https://host.example/' }) });

    const result = await collectReadableDomFromTab({ tabId: 7, intent: 'normal', stableWaitMs: 500 });

    expect(result.payload?.sourceKind).toBe('top-frame');
    expect(result.payload?.frameId).toBe(0);
    expect(getAllFrames).not.toHaveBeenCalled();
    expect(sendExtensionTabMessage).toHaveBeenCalledTimes(1);
    expect(sendExtensionTabMessage).toHaveBeenCalledWith(
      7,
      { type: 'browser-context/getReadableDom', payload: { intent: 'normal', stableWaitMs: 500 } },
      { frameId: 0 },
    );
  });

  it('顶层低质量时会枚举并采集可见 iframe', async () => {
    const { getAllFrames } = installFrameMock([
      { frameId: 0, parentFrameId: -1, url: 'https://host.example/' },
      { frameId: 4, parentFrameId: 0, url: 'https://embed.example/article' },
    ]);
    sendExtensionTabMessageMock
      .mockResolvedValueOnce({ payload: null, error: 'low-quality-extraction' })
      .mockResolvedValueOnce({
        payload: [{
          src: 'https://embed.example/article',
          title: 'Article frame',
          area: 600_000,
          inViewport: true,
        }],
      })
      .mockResolvedValueOnce({ payload: makePayload({ title: 'Embedded', url: 'https://embed.example/article', contentChars: 420 }) });

    const result = await collectReadableDomFromTab({ tabId: 7, intent: 'full-page', stableWaitMs: 1_000 });

    expect(getAllFrames).toHaveBeenCalledWith({ tabId: 7 }, expect.any(Function));
    expect(result.payload?.sourceKind).toBe('embedded-frame');
    expect(result.payload?.frameId).toBe(4);
    expect(result.payload?.frameUrl).toBe('https://embed.example/article');
    expect(sendExtensionTabMessageMock.mock.calls[2]).toEqual([
      7,
      { type: 'browser-context/getReadableDom', payload: { intent: 'full-page', stableWaitMs: 1500 } },
      { frameId: 4 },
    ]);
  });

  it('发送前短预算不会压缩 iframe 自身正文稳定等待', async () => {
    installFrameMock([
      { frameId: 0, parentFrameId: -1, url: 'https://host.example/' },
      { frameId: 4, parentFrameId: 0, url: 'https://embed.example/article' },
    ]);
    sendExtensionTabMessageMock
      .mockResolvedValueOnce({ payload: null, error: 'low-quality-extraction' })
      .mockResolvedValueOnce({
        payload: [{
          src: 'https://embed.example/article',
          title: 'Article frame',
          area: 600_000,
          inViewport: true,
        }],
      })
      .mockResolvedValueOnce({ payload: makePayload({ title: 'Embedded', url: 'https://embed.example/article', contentChars: 420 }) });

    const result = await collectReadableDomFromTab({ tabId: 7, intent: 'normal', stableWaitMs: 400 });

    expect(result.payload?.sourceKind).toBe('embedded-frame');
    expect(sendExtensionTabMessageMock.mock.calls[2]).toEqual([
      7,
      { type: 'browser-context/getReadableDom', payload: { intent: 'normal', stableWaitMs: 1500 } },
      { frameId: 4 },
    ]);
  });

  it('iframe 全部不可达时保留顶层降级原因', async () => {
    installFrameMock([
      { frameId: 0, parentFrameId: -1, url: 'https://host.example/' },
      { frameId: 5, parentFrameId: 0, url: 'https://embed.example/' },
    ]);
    sendExtensionTabMessageMock
      .mockResolvedValueOnce({ payload: null, error: 'low-quality-extraction' })
      .mockResolvedValueOnce({
        payload: [{ src: 'https://embed.example/', title: 'Embed', area: 100_000, inViewport: true }],
      })
      .mockResolvedValueOnce({ payload: null, error: 'content-script-unreachable' });

    const result = await collectReadableDomFromTab({ tabId: 7, intent: 'normal', stableWaitMs: 600 });

    expect(result).toEqual({ payload: null, error: 'low-quality-extraction' });
  });

  it('iframe 扫描受全局 1500ms 预算限制', async () => {
    vi.useFakeTimers();
    try {
      installFrameMock([
        { frameId: 0, parentFrameId: -1, url: 'https://host.example/' },
        { frameId: 1, parentFrameId: 0, url: 'https://embed.example/one' },
        { frameId: 2, parentFrameId: 0, url: 'https://embed.example/two' },
        { frameId: 3, parentFrameId: 0, url: 'https://embed.example/three' },
        { frameId: 4, parentFrameId: 0, url: 'https://embed.example/four' },
        { frameId: 5, parentFrameId: 0, url: 'https://embed.example/five' },
        { frameId: 6, parentFrameId: 0, url: 'https://embed.example/six' },
      ]);
      sendExtensionTabMessageMock.mockImplementation((_tabId, message, options) => {
        if (message.type === 'browser-context/getReadableDom' && options?.frameId === 0) {
          return Promise.resolve({ payload: null, error: 'low-quality-extraction' });
        }
        if (message.type === 'page/getVisibleFrames') {
          return Promise.resolve({
            payload: Array.from({ length: 6 }, (_, index) => ({
              src: `https://embed.example/${index + 1}`,
              title: `Frame ${index + 1}`,
              area: 100_000,
              inViewport: true,
            })),
          });
        }
        return new Promise(() => {});
      });

      const resultPromise = collectReadableDomFromTab({ tabId: 7, intent: 'normal', stableWaitMs: 3_000 });
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1_499);
      await Promise.resolve();

      expect(sendExtensionTabMessageMock).toHaveBeenCalledTimes(4);

      await vi.advanceTimersByTimeAsync(1);
      await expect(resultPromise).resolves.toEqual({ payload: null, error: 'low-quality-extraction' });
      expect(sendExtensionTabMessageMock).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('顶层 frame 等满稳定窗口后仍会使用独立 iframe 预算', async () => {
    vi.useFakeTimers();
    try {
      installFrameMock([
        { frameId: 0, parentFrameId: -1, url: 'https://ui.example/preview' },
        { frameId: 8, parentFrameId: 0, url: 'https://preview.example/' },
      ]);
      sendExtensionTabMessageMock.mockImplementation((_tabId, message, options) => {
        if (message.type === 'browser-context/getReadableDom' && options?.frameId === 0) {
          return new Promise((resolve) => {
            setTimeout(() => resolve({ payload: null, error: 'low-quality-extraction' }), 3_000);
          });
        }
        if (message.type === 'page/getVisibleFrames') {
          return Promise.resolve({
            payload: [{
              src: 'https://preview.example/',
              title: 'Preview',
              area: 1_440_000,
              inViewport: true,
            }],
          });
        }
        if (message.type === 'browser-context/getReadableDom' && options?.frameId === 8) {
          return Promise.resolve({
            payload: makePayload({
              title: 'Preview',
              url: 'https://preview.example/',
              text: 'Preview readable body '.repeat(80),
              contentChars: 1_760,
              mode: 'visible-page',
            }),
          });
        }
        return Promise.resolve({ payload: null });
      });

      const resultPromise = collectReadableDomFromTab({ tabId: 7, intent: 'normal', stableWaitMs: 3_000 });
      await vi.advanceTimersByTimeAsync(3_000);

      const result = await resultPromise;
      expect(result.payload?.sourceKind).toBe('embedded-frame');
      expect(result.payload?.frameId).toBe(8);
      expect(sendExtensionTabMessageMock).toHaveBeenCalledWith(
        7,
        { type: 'browser-context/getReadableDom', payload: { intent: 'normal', stableWaitMs: 1500 } },
        { frameId: 8 },
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('多 iframe 候选按正文模式和字数排序', () => {
    const weak = {
      frame: { frameId: 2, parentFrameId: 0, url: 'https://embed.example/list' },
      payload: makePayload({ mode: 'structured-page', text: 'short body', contentChars: 120 }),
    } satisfies ReadableDomFrameCandidate;
    const strong = {
      frame: { frameId: 3, parentFrameId: 0, url: 'https://embed.example/article' },
      payload: makePayload({ mode: 'article', text: 'long article body'.repeat(80), contentChars: 1_280 }),
    } satisfies ReadableDomFrameCandidate;

    expect(rankReadableFramePayloads([weak, strong])).toBe(strong.payload);
  });
});
