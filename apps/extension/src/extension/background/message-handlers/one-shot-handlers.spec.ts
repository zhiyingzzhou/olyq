/**
 * 说明：`one-shot-handlers.spec` 后台一次性消息回归测试。
 *
 * 职责：
 * - 锁住 page-facing selection 入口的打开面板时序；
 * - 确认 page-tools 禁用时不会继续把选区事件投递给 UI。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserContextSettings } from '@/lib/browser-context/settings';
import { ensureContentScriptReadyForTab } from '../content-script-manager';
import type { HandlerContext } from './types';
import { createOneShotHandlers } from './one-shot-handlers';

const {
  createMcpOneShotHandlersMock,
  loadPageToolsRuntimeMock,
  resolveLinkPreviewMetadataMock,
  collectReadableDomFromTabMock,
  resolveTechnologyStackForTabMock,
  warmTechnologyStackForTabMock,
} = vi.hoisted(() => ({
  createMcpOneShotHandlersMock: vi.fn(() => ({})),
  loadPageToolsRuntimeMock: vi.fn(),
  resolveLinkPreviewMetadataMock: vi.fn(),
  collectReadableDomFromTabMock: vi.fn(),
  resolveTechnologyStackForTabMock: vi.fn(),
  warmTechnologyStackForTabMock: vi.fn(),
}));

vi.mock('../offscreen-manager', () => ({
  ensureOffscreenDocument: vi.fn(),
}));

vi.mock('../content-script-manager', () => ({
  ensureContentScriptReadyForTab: vi.fn(),
  ensureContentScriptRegistration: vi.fn(),
  getContentScriptStatus: vi.fn(),
  setContentScriptEnabled: vi.fn(),
}));

vi.mock('@/lib/browser-context/settings', () => ({
  loadBrowserContextSettings: vi.fn(),
}));

vi.mock('../readable-dom-frames', () => ({
  EMBEDDED_FRAME_EXTRA_BUDGET_MS: 1_500,
  collectReadableDomFromTab: collectReadableDomFromTabMock,
}));

vi.mock('../page-style', () => ({
  captureVisibleViewportFrame: vi.fn(),
  capturePageStyleFrames: vi.fn(),
  normalizePageStyleCaptureFailureCode: vi.fn(),
  requestPageStyleLayoutMetrics: vi.fn(),
  requestPageStyleSignals: vi.fn(),
}));

vi.mock('../technology-stack', () => ({
  resolveTechnologyStackForTab: resolveTechnologyStackForTabMock,
  warmTechnologyStackForTab: warmTechnologyStackForTabMock,
}));

vi.mock('../link-preview', () => ({
  resolveLinkPreviewMetadata: resolveLinkPreviewMetadataMock,
}));

vi.mock('./one-shot-mcp-handlers', () => ({
  createMcpOneShotHandlers: createMcpOneShotHandlersMock,
}));

vi.mock('./runtime-loaders', () => ({
  loadPageToolsRuntime: loadPageToolsRuntimeMock,
}));

/** 构造 one-shot handler 所需的最小后台上下文。 */
function makeContext(): HandlerContext {
  return {
    activeChats: new Map(),
    activeImages: new Map(),
    activeTranscriptions: new Map(),
    activeSpeeches: new Map(),
    activeObjects: new Map(),
    toolCallToRequestId: new Map(),
    activeHealthChecks: new Map(),
    ensurePanel: vi.fn(async () => undefined),
    openPanelForTabFromUserGesture: vi.fn(async () => undefined),
    getActiveTabId: vi.fn(async () => 42),
    pushBrowserContextMetadataForTab: vi.fn(),
    getSwStatus: vi.fn(async () => ({})),
    applyKeepAliveConfig: vi.fn(),
    postToAllUi: vi.fn(),
    beginPageToolSidePanelOwner: vi.fn(({ tabId, tool = 'screenshot-editor', sessionId }: { tabId: number; tool?: 'element-picker' | 'screenshot-editor'; sessionId?: string }) => ({ tabId, tool, sessionId, generation: 1, createdAt: Date.now() })),
    cancelPageToolSidePanelOwner: vi.fn(),
    claimPageToolSidePanelOwner: vi.fn(({ fallbackTabId, sessionId, tool = 'screenshot-editor', returnToPanel }: { fallbackTabId?: number | null; sessionId?: string | null; tool?: 'element-picker' | 'screenshot-editor' | null; returnToPanel?: boolean }) => ({ ok: true as const, owner: { tabId: fallbackTabId ?? 42, tool: tool ?? 'screenshot-editor', ...(sessionId ? { sessionId } : {}), generation: 1, createdAt: Date.now() }, returnToPanel: returnToPanel !== false })),
    postPageToolCommandToSidePanel: vi.fn(async () => ({ ok: true as const })),
    loadKeepAliveConfig: vi.fn(),
  };
}

/** 构造可控 Promise，便于断言异步校验之前的同步时序。 */
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('one-shot selection handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMcpOneShotHandlersMock.mockReturnValue({});
    vi.mocked(loadBrowserContextSettings).mockResolvedValue({
      enabled: true,
      fullPagePromptChars: 24_000,
    });
    vi.mocked(ensureContentScriptReadyForTab).mockResolvedValue({
      ready: true,
      injected: false,
    });
    collectReadableDomFromTabMock.mockResolvedValue({ payload: null, error: 'empty-body' });
    resolveTechnologyStackForTabMock.mockResolvedValue({
      result: {
        status: 'empty',
        tabId: 42,
        url: 'https://example.com/',
        title: 'Example',
        pageFingerprint: 'fingerprint',
        detectedAt: 1,
        technologies: [],
      },
      pageKey: '42::https://example.com/::0',
      enhanced: false,
    });
    warmTechnologyStackForTabMock.mockResolvedValue(null);
    resolveLinkPreviewMetadataMock.mockResolvedValue({
      payload: {
        url: 'https://example.com/post',
        finalUrl: 'https://example.com/post',
        hostname: 'example.com',
        title: 'Example',
        description: null,
        imageUrl: null,
        imageAlt: null,
        siteName: null,
        fetchedAt: 1,
      },
    });
  });

  it('selection/action 会在 page-tools 异步校验前立即打开面板', async () => {
    const pageToolsRuntime = createDeferred<{
      isPageToolsEnabledForUrl: (url: string) => Promise<boolean>;
    }>();
    loadPageToolsRuntimeMock.mockReturnValueOnce(pageToolsRuntime.promise);
    const ctx = makeContext();
    const handlers = createOneShotHandlers(ctx);
    const sendResponse = vi.fn();
    const payload = {
      action: 'ask',
      text: 'selected text',
      source: { url: 'https://example.com/article', title: 'Example' },
    };

    const handled = handlers['selection/action']?.(
      { type: 'selection/action', payload },
      { tab: { id: 123, url: 'https://example.com/article' } } as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(handled).toBe(true);
    expect(ctx.openPanelForTabFromUserGesture).toHaveBeenCalledWith(123);
    expect(ctx.ensurePanel).not.toHaveBeenCalled();
    expect(loadPageToolsRuntimeMock).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ctx.openPanelForTabFromUserGesture).mock.invocationCallOrder[0]).toBeLessThan(
      loadPageToolsRuntimeMock.mock.invocationCallOrder[0],
    );
    expect(ctx.postToAllUi).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();

    pageToolsRuntime.resolve({
      isPageToolsEnabledForUrl: vi.fn(async () => true),
    });

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });
  });

  it('page-tools 启用时会广播 ui/selection 并返回成功', async () => {
    const isPageToolsEnabledForUrl = vi.fn(async () => true);
    loadPageToolsRuntimeMock.mockResolvedValueOnce({ isPageToolsEnabledForUrl });
    const ctx = makeContext();
    const handlers = createOneShotHandlers(ctx);
    const sendResponse = vi.fn();
    const payload = {
      action: 'ask',
      text: 'selected text',
      source: { url: 'https://example.com/article', title: 'Example' },
    };

    handlers['selection/action']?.(
      { type: 'selection/action', payload },
      { tab: { id: 124, url: 'https://example.com/article' } } as chrome.runtime.MessageSender,
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });

    expect(ctx.openPanelForTabFromUserGesture).toHaveBeenCalledWith(124);
    expect(ctx.ensurePanel).not.toHaveBeenCalled();
    expect(isPageToolsEnabledForUrl).toHaveBeenCalledWith('https://example.com/article');
    expect(ctx.postToAllUi).toHaveBeenCalledWith({ type: 'ui/selection', payload });
  });

  it('page-tools 禁用时不广播 ui/selection，但仍保留点击触发的打开面板动作', async () => {
    const isPageToolsEnabledForUrl = vi.fn(async () => false);
    loadPageToolsRuntimeMock.mockResolvedValueOnce({ isPageToolsEnabledForUrl });
    const ctx = makeContext();
    const handlers = createOneShotHandlers(ctx);
    const sendResponse = vi.fn();
    const payload = {
      action: 'ask',
      text: 'selected text',
      source: { url: 'https://example.com/article', title: 'Example' },
    };

    handlers['selection/action']?.(
      { type: 'selection/action', payload },
      { tab: { id: 125, url: 'https://example.com/article' } } as chrome.runtime.MessageSender,
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: false,
        error: { key: 'errors.pageToolsDisabled' },
      });
    });

    expect(ctx.openPanelForTabFromUserGesture).toHaveBeenCalledWith(125);
    expect(ctx.ensurePanel).not.toHaveBeenCalled();
    expect(isPageToolsEnabledForUrl).toHaveBeenCalledWith('https://example.com/article');
    expect(ctx.postToAllUi).not.toHaveBeenCalled();
  });

  it('selection/action 会消费 Side Panel 打开失败，避免裸 Promise 拒绝冒到 SW 顶层', async () => {
    const isPageToolsEnabledForUrl = vi.fn(async () => true);
    loadPageToolsRuntimeMock.mockResolvedValueOnce({ isPageToolsEnabledForUrl });
    const ctx = makeContext();
    vi.mocked(ctx.openPanelForTabFromUserGesture).mockRejectedValueOnce(
      new Error('sidePanel.open() may only be called in response to a user gesture'),
    );
    const handlers = createOneShotHandlers(ctx);
    const sendResponse = vi.fn();
    const payload = {
      action: 'ask',
      text: 'selected text',
      source: { url: 'https://example.com/article', title: 'Example' },
    };

    handlers['selection/action']?.(
      { type: 'selection/action', payload },
      { tab: { id: 126, url: 'https://example.com/article' } } as chrome.runtime.MessageSender,
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });

    expect(ctx.openPanelForTabFromUserGesture).toHaveBeenCalledWith(126);
    expect(ctx.postToAllUi).toHaveBeenCalledWith({ type: 'ui/selection', payload });
  });

  it('technology-stack/page-ready 在当前 active tab 上会刷新 metadata page identity', async () => {
    const ctx = makeContext();
    const handlers = createOneShotHandlers(ctx);
    const sendResponse = vi.fn();

    handlers['technology-stack/page-ready']?.(
      {
        type: 'technology-stack/page-ready',
        payload: {
          url: 'https://example.com/spa',
          title: 'SPA',
          readyState: 'complete',
          reason: 'spa-route',
        },
      },
      { tab: { id: 42, url: 'https://example.com/spa', title: 'SPA' }, frameId: 0 } as chrome.runtime.MessageSender,
      sendResponse,
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ ok: true, payload: null });
    });

    expect(warmTechnologyStackForTabMock).toHaveBeenCalledWith({
      tabId: 42,
      url: 'https://example.com/spa',
      title: 'SPA',
      reason: 'page-ready',
    });
    await vi.waitFor(() => {
      expect(ctx.pushBrowserContextMetadataForTab).toHaveBeenCalledWith(42);
    });
  });

  it('browser-context/readable-dom/get 内容脚本不返回时会按稳定错误码 timeout 收尾', async () => {
    vi.useFakeTimers();
    try {
      collectReadableDomFromTabMock.mockReturnValueOnce(new Promise(() => {}));
      const ctx = makeContext();
      const handlers = createOneShotHandlers(ctx);
      const sendResponse = vi.fn();

      const handled = handlers['browser-context/readable-dom/get']?.(
        {
          type: 'browser-context/readable-dom/get',
          payload: {
            tabId: 42,
            stableWaitMs: 25,
          },
        },
        {} as chrome.runtime.MessageSender,
        sendResponse,
      );

      expect(handled).toBe(true);
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(525);
      await Promise.resolve();

      expect(sendResponse).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_500);
      await Promise.resolve();

      expect(collectReadableDomFromTabMock).toHaveBeenCalledWith({
        tabId: 42,
        intent: 'normal',
        stableWaitMs: 25,
      });
      expect(sendResponse).toHaveBeenCalledWith({ ok: true, payload: null, error: 'timeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('link-preview/metadata/get 通过后台 resolver 返回结构化元数据', async () => {
    const ctx = makeContext();
    const handlers = createOneShotHandlers(ctx);
    const sendResponse = vi.fn();

    const handled = handlers['link-preview/metadata/get']?.(
      {
        type: 'link-preview/metadata/get',
        payload: { url: 'https://example.com/post' },
      },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(handled).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        payload: {
          url: 'https://example.com/post',
          finalUrl: 'https://example.com/post',
          hostname: 'example.com',
          title: 'Example',
          description: null,
          imageUrl: null,
          imageAlt: null,
          siteName: null,
          fetchedAt: 1,
        },
      });
    });
    expect(resolveLinkPreviewMetadataMock).toHaveBeenCalledWith('https://example.com/post');
  });

  it('link-preview/metadata/get 超时时也会完成一次 sendResponse', async () => {
    const ctx = makeContext();
    const handlers = createOneShotHandlers(ctx);
    const sendResponse = vi.fn();
    resolveLinkPreviewMetadataMock.mockResolvedValueOnce({
      payload: null,
      error: 'timeout',
    });

    const handled = handlers['link-preview/metadata/get']?.(
      {
        type: 'link-preview/metadata/get',
        payload: { url: 'https://example.com/slow' },
      },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(handled).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        payload: null,
        error: 'timeout',
      });
    });
  });
});
