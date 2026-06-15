/**
 * 说明：`screenshot-editor.spec` Service Worker 插件测试。
 *
 * 职责：
 * - 验证截图编辑器启动链路复用后台截图能力并投递到 content script；
 * - 验证 content script 提交的截图动作会进入 UI Port，而不是自动发送消息；
 * - 覆盖 page-tools 禁用时的稳定拒绝语义。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nError } from '@/lib/i18n/error';
import { screenshotEditorSwPlugin } from './sw-plugin';

const {
  captureVisibleViewportFrameMock,
  closePanelForPageToolSessionMock,
  ensurePageToolContentScriptReadyForTabMock,
  extractTextFromScreenshotMock,
  getExtensionTabMock,
  isPageToolsEnabledForUrlMock,
  sendExtensionTabMessageMock,
  sendExtensionTabMessageWithRetryMock,
} = vi.hoisted(() => ({
  captureVisibleViewportFrameMock: vi.fn(),
  closePanelForPageToolSessionMock: vi.fn(),
  ensurePageToolContentScriptReadyForTabMock: vi.fn(),
  extractTextFromScreenshotMock: vi.fn(),
  getExtensionTabMock: vi.fn(),
  isPageToolsEnabledForUrlMock: vi.fn(),
  sendExtensionTabMessageMock: vi.fn(),
  sendExtensionTabMessageWithRetryMock: vi.fn(),
}));

vi.mock('@/extension/background/content-script-manager', () => ({
  ensurePageToolContentScriptReadyForTab: ensurePageToolContentScriptReadyForTabMock,
}));

vi.mock('@/plugins/page-tools/screenshot-capture/screenshot-ocr', () => ({
  extractTextFromScreenshot: extractTextFromScreenshotMock,
}));

vi.mock('@/extension/background/page-style', () => ({
  captureVisibleViewportFrame: captureVisibleViewportFrameMock,
}));

vi.mock('@/extension/background/side-panel', () => ({
  closePanelForPageToolSession: closePanelForPageToolSessionMock,
}));

vi.mock('@/lib/extension/page-tools', () => ({
  isPageToolsEnabledForUrl: isPageToolsEnabledForUrlMock,
}));

vi.mock('@/lib/extension/runtime-api', () => ({
  getExtensionTab: getExtensionTabMock,
  isExtensionTabMessageError: vi.fn(() => false),
  sendExtensionTabMessage: sendExtensionTabMessageMock,
  sendExtensionTabMessageWithRetry: sendExtensionTabMessageWithRetryMock,
}));

/** 等待插件异步 sendResponse 被调用。 */
async function waitPluginResponse(sendResponse: ReturnType<typeof vi.fn>) {
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
  return sendResponse.mock.calls[0]?.[0] as { ok?: boolean; error?: unknown };
}

describe('screenshotEditorSwPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getExtensionTabMock.mockResolvedValue({
      id: 42,
      windowId: 7,
      url: 'https://example.com/page',
    });
    ensurePageToolContentScriptReadyForTabMock.mockResolvedValue({ ready: true, injected: false });
    closePanelForPageToolSessionMock.mockResolvedValue(undefined);
    isPageToolsEnabledForUrlMock.mockResolvedValue(true);
    captureVisibleViewportFrameMock.mockResolvedValue('data:image/png;base64,AAAA');
    sendExtensionTabMessageWithRetryMock.mockImplementation(async (_tabId: number, message: { payload?: { sessionId?: string; returnToPanel?: boolean } }) => ({
      ok: true,
      opened: true,
      tool: 'screenshot-editor',
      sessionId: message.payload?.sessionId,
      returnToPanel: message.payload?.returnToPanel,
    }));
    sendExtensionTabMessageMock.mockResolvedValue({ ok: true });
    extractTextFromScreenshotMock.mockResolvedValue({ text: 'Recognized text' });
  });

  it('启动截图编辑器时抓取可见视口并投递到目标 content script', async () => {
    const sendResponse = vi.fn();
    const runtime = {
      postUiEvent: vi.fn(),
      beginPageToolSidePanelOwner: vi.fn(({ tabId, tool = 'screenshot-editor', sessionId }: { tabId: number; tool?: 'element-picker' | 'screenshot-editor'; sessionId?: string }) => ({ tabId, tool, sessionId, generation: 1, createdAt: Date.now() })),
      cancelPageToolSidePanelOwner: vi.fn(),
      claimPageToolSidePanelOwner: vi.fn(({ fallbackTabId, sessionId, tool = 'screenshot-editor', returnToPanel }: { fallbackTabId?: number | null; sessionId?: string | null; tool?: 'element-picker' | 'screenshot-editor' | null; returnToPanel?: boolean }) => ({ ok: true as const, owner: { tabId: fallbackTabId ?? 42, tool: tool ?? 'screenshot-editor', ...(sessionId ? { sessionId } : {}), generation: 1, createdAt: Date.now() }, returnToPanel: returnToPanel !== false })),
      postPageToolCommandToSidePanel: vi.fn(async () => ({ ok: true as const })),
      ensurePanel: vi.fn(async () => undefined),
      openPanelForTabFromUserGesture: vi.fn(async () => undefined),
      getActiveTabId: vi.fn(async () => 42),
    };

    const handled = screenshotEditorSwPlugin.onMessage({
      msg: { type: 'screenshot/editor/start', payload: { tabId: 42 } },
      sender: {},
      sendResponse,
      runtime,
    });

    expect(handled).toBe(true);
    const response = await waitPluginResponse(sendResponse);
    expect(response.ok).toBe(true);
    expect(ensurePageToolContentScriptReadyForTabMock).toHaveBeenCalledWith(42);
    expect(closePanelForPageToolSessionMock).toHaveBeenCalledWith(42);
    expect(captureVisibleViewportFrameMock).toHaveBeenCalledWith(7);
    expect(closePanelForPageToolSessionMock.mock.invocationCallOrder[0]).toBeLessThan(
      captureVisibleViewportFrameMock.mock.invocationCallOrder[0],
    );
    expect(closePanelForPageToolSessionMock.mock.invocationCallOrder[0]).toBeLessThan(
      sendExtensionTabMessageWithRetryMock.mock.invocationCallOrder[0],
    );
    expect(sendExtensionTabMessageWithRetryMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        type: 'screenshot/editor/open',
        payload: expect.objectContaining({
          sessionId: expect.stringContaining('page-tool-screenshot-editor-42-'),
          returnToPanel: true,
          screenshot: expect.objectContaining({
            dataUrl: 'data:image/png;base64,AAAA',
            mime: 'image/png',
          }),
        }),
      }),
      expect.objectContaining({ maxAttempts: 12 }),
    );
  });

  it('page-tools 禁用时不截图也不投递 content script', async () => {
    isPageToolsEnabledForUrlMock.mockResolvedValue(false);
    const sendResponse = vi.fn();

    screenshotEditorSwPlugin.onMessage({
      msg: { type: 'screenshot/editor/start', payload: { tabId: 42 } },
      sender: {},
      sendResponse,
      runtime: {
        postUiEvent: vi.fn(),
      beginPageToolSidePanelOwner: vi.fn(({ tabId, tool = 'screenshot-editor', sessionId }: { tabId: number; tool?: 'element-picker' | 'screenshot-editor'; sessionId?: string }) => ({ tabId, tool, sessionId, generation: 1, createdAt: Date.now() })),
      cancelPageToolSidePanelOwner: vi.fn(),
      claimPageToolSidePanelOwner: vi.fn(({ fallbackTabId, sessionId, tool = 'screenshot-editor', returnToPanel }: { fallbackTabId?: number | null; sessionId?: string | null; tool?: 'element-picker' | 'screenshot-editor' | null; returnToPanel?: boolean }) => ({ ok: true as const, owner: { tabId: fallbackTabId ?? 42, tool: tool ?? 'screenshot-editor', ...(sessionId ? { sessionId } : {}), generation: 1, createdAt: Date.now() }, returnToPanel: returnToPanel !== false })),
      postPageToolCommandToSidePanel: vi.fn(async () => ({ ok: true as const })),
        ensurePanel: vi.fn(async () => undefined),
        openPanelForTabFromUserGesture: vi.fn(async () => undefined),
        getActiveTabId: vi.fn(async () => 42),
      },
    });

    const response = await waitPluginResponse(sendResponse);
    expect(response.ok).toBe(false);
    expect(ensurePageToolContentScriptReadyForTabMock).not.toHaveBeenCalled();
    expect(closePanelForPageToolSessionMock).not.toHaveBeenCalled();
    expect(captureVisibleViewportFrameMock).not.toHaveBeenCalled();
    expect(sendExtensionTabMessageWithRetryMock).not.toHaveBeenCalled();
  });

  it('截图 API 失败时返回截图编辑器专用错误文案，不暴露风格模式降级语义', async () => {
    captureVisibleViewportFrameMock.mockRejectedValue(
      new I18nError('errors.pageStyleScreenshotsUnavailableWithDetail', { detail: 'permission denied' }),
    );
    const sendResponse = vi.fn();
    const runtime = {
      postUiEvent: vi.fn(),
      beginPageToolSidePanelOwner: vi.fn(({ tabId, tool = 'screenshot-editor', sessionId }: { tabId: number; tool?: 'element-picker' | 'screenshot-editor'; sessionId?: string }) => ({ tabId, tool, sessionId, generation: 1, createdAt: Date.now() })),
      cancelPageToolSidePanelOwner: vi.fn(),
      claimPageToolSidePanelOwner: vi.fn(({ fallbackTabId, sessionId, tool = 'screenshot-editor', returnToPanel }: { fallbackTabId?: number | null; sessionId?: string | null; tool?: 'element-picker' | 'screenshot-editor' | null; returnToPanel?: boolean }) => ({ ok: true as const, owner: { tabId: fallbackTabId ?? 42, tool: tool ?? 'screenshot-editor', ...(sessionId ? { sessionId } : {}), generation: 1, createdAt: Date.now() }, returnToPanel: returnToPanel !== false })),
      postPageToolCommandToSidePanel: vi.fn(async () => ({ ok: true as const })),
      ensurePanel: vi.fn(async () => undefined),
      openPanelForTabFromUserGesture: vi.fn(async () => undefined),
      getActiveTabId: vi.fn(async () => 42),
    };

    screenshotEditorSwPlugin.onMessage({
      msg: { type: 'screenshot/editor/start', payload: { tabId: 42 } },
      sender: {},
      sendResponse,
      runtime,
    });

    const response = await waitPluginResponse(sendResponse);
    expect(response.ok).toBe(false);
    expect(response.error).toEqual({
      key: 'errors.screenshotEditorCaptureUnavailableWithDetail',
      params: { detail: 'permission denied' },
    });
    expect(closePanelForPageToolSessionMock).toHaveBeenCalledWith(42);
    expect(runtime.ensurePanel).toHaveBeenCalledWith(42);
    expect(runtime.postPageToolCommandToSidePanel).toHaveBeenCalledWith(1, expect.objectContaining({
      type: 'ui/page-tool-error',
      payload: expect.objectContaining({ error: expect.anything() }),
    }));
    expect(sendExtensionTabMessageWithRetryMock).not.toHaveBeenCalled();
  });

  it('隐藏 sidepanel 失败时不继续截图或打开编辑器，避免假成功', async () => {
    closePanelForPageToolSessionMock.mockRejectedValueOnce(new Error('Illegal invocation'));
    const sendResponse = vi.fn();
    const runtime = {
      postUiEvent: vi.fn(),
      beginPageToolSidePanelOwner: vi.fn(({ tabId, tool = 'screenshot-editor', sessionId }: { tabId: number; tool?: 'element-picker' | 'screenshot-editor'; sessionId?: string }) => ({ tabId, tool, sessionId, generation: 1, createdAt: Date.now() })),
      cancelPageToolSidePanelOwner: vi.fn(),
      claimPageToolSidePanelOwner: vi.fn(({ fallbackTabId, sessionId, tool = 'screenshot-editor', returnToPanel }: { fallbackTabId?: number | null; sessionId?: string | null; tool?: 'element-picker' | 'screenshot-editor' | null; returnToPanel?: boolean }) => ({ ok: true as const, owner: { tabId: fallbackTabId ?? 42, tool: tool ?? 'screenshot-editor', ...(sessionId ? { sessionId } : {}), generation: 1, createdAt: Date.now() }, returnToPanel: returnToPanel !== false })),
      postPageToolCommandToSidePanel: vi.fn(async () => ({ ok: true as const })),
      ensurePanel: vi.fn(async () => undefined),
      openPanelForTabFromUserGesture: vi.fn(async () => undefined),
      getActiveTabId: vi.fn(async () => 42),
    };

    screenshotEditorSwPlugin.onMessage({
      msg: { type: 'screenshot/editor/start', payload: { tabId: 42 } },
      sender: {},
      sendResponse,
      runtime,
    });

    const response = await waitPluginResponse(sendResponse);
    expect(response.ok).toBe(false);
    expect(captureVisibleViewportFrameMock).not.toHaveBeenCalled();
    expect(sendExtensionTabMessageWithRetryMock).not.toHaveBeenCalled();
    expect(runtime.ensurePanel).not.toHaveBeenCalled();
  });

  it('content script 打开截图编辑器返回 ok:false 时会恢复 sidepanel 并提示错误', async () => {
    sendExtensionTabMessageWithRetryMock.mockResolvedValueOnce({ ok: false, error: { key: 'errors.pageToolsDisabled' } });
    const sendResponse = vi.fn();
    const runtime = {
      postUiEvent: vi.fn(),
      beginPageToolSidePanelOwner: vi.fn(({ tabId, tool = 'screenshot-editor', sessionId }: { tabId: number; tool?: 'element-picker' | 'screenshot-editor'; sessionId?: string }) => ({ tabId, tool, sessionId, generation: 1, createdAt: Date.now() })),
      cancelPageToolSidePanelOwner: vi.fn(),
      claimPageToolSidePanelOwner: vi.fn(({ fallbackTabId, sessionId, tool = 'screenshot-editor', returnToPanel }: { fallbackTabId?: number | null; sessionId?: string | null; tool?: 'element-picker' | 'screenshot-editor' | null; returnToPanel?: boolean }) => ({ ok: true as const, owner: { tabId: fallbackTabId ?? 42, tool: tool ?? 'screenshot-editor', ...(sessionId ? { sessionId } : {}), generation: 1, createdAt: Date.now() }, returnToPanel: returnToPanel !== false })),
      postPageToolCommandToSidePanel: vi.fn(async () => ({ ok: true as const })),
      ensurePanel: vi.fn(async () => undefined),
      openPanelForTabFromUserGesture: vi.fn(async () => undefined),
      getActiveTabId: vi.fn(async () => 42),
    };

    screenshotEditorSwPlugin.onMessage({
      msg: { type: 'screenshot/editor/start', payload: { tabId: 42 } },
      sender: {},
      sendResponse,
      runtime,
    });

    const response = await waitPluginResponse(sendResponse);
    expect(response.ok).toBe(false);
    expect(response.error).toEqual({ key: 'errors.pageToolsDisabled' });
    expect(runtime.ensurePanel).toHaveBeenCalledWith(42);
    expect(runtime.postPageToolCommandToSidePanel).toHaveBeenCalledWith(1, expect.objectContaining({
      type: 'ui/page-tool-error',
      payload: expect.objectContaining({ error: { key: 'errors.pageToolsDisabled' } }),
    }));
  });

  it('content script 未确认 opened:true 时会恢复 sidepanel，避免截图入口假成功', async () => {
    sendExtensionTabMessageWithRetryMock.mockResolvedValueOnce({ ok: true });
    const sendResponse = vi.fn();
    const runtime = {
      postUiEvent: vi.fn(),
      beginPageToolSidePanelOwner: vi.fn(({ tabId, tool = 'screenshot-editor', sessionId }: { tabId: number; tool?: 'element-picker' | 'screenshot-editor'; sessionId?: string }) => ({ tabId, tool, sessionId, generation: 1, createdAt: Date.now() })),
      cancelPageToolSidePanelOwner: vi.fn(),
      claimPageToolSidePanelOwner: vi.fn(({ fallbackTabId, sessionId, tool = 'screenshot-editor', returnToPanel }: { fallbackTabId?: number | null; sessionId?: string | null; tool?: 'element-picker' | 'screenshot-editor' | null; returnToPanel?: boolean }) => ({ ok: true as const, owner: { tabId: fallbackTabId ?? 42, tool: tool ?? 'screenshot-editor', ...(sessionId ? { sessionId } : {}), generation: 1, createdAt: Date.now() }, returnToPanel: returnToPanel !== false })),
      postPageToolCommandToSidePanel: vi.fn(async () => ({ ok: true as const })),
      ensurePanel: vi.fn(async () => undefined),
      openPanelForTabFromUserGesture: vi.fn(async () => undefined),
      getActiveTabId: vi.fn(async () => 42),
    };

    screenshotEditorSwPlugin.onMessage({
      msg: { type: 'screenshot/editor/start', payload: { tabId: 42 } },
      sender: {},
      sendResponse,
      runtime,
    });

    const response = await waitPluginResponse(sendResponse);
    expect(response.ok).toBe(false);
    expect(response.error).toEqual({ key: 'errors.screenshotEditorContentScriptUnavailable' });
    expect(runtime.ensurePanel).toHaveBeenCalledWith(42);
  });

  it('截图动作会在异步校验前恢复 sidepanel，再转发为 ui/screenshot', async () => {
    const sendResponse = vi.fn();
    const postPageToolCommandToSidePanel = vi.fn(async () => ({ ok: true as const }));
    const ensurePanel = vi.fn(async () => undefined);
    const openPanelForTabFromUserGesture = vi.fn(async () => undefined);
    const owner = { tabId: 42, tool: 'screenshot-editor' as const, sessionId: 'session-1', generation: 1, createdAt: Date.now() };

    screenshotEditorSwPlugin.onMessage({
      msg: {
        type: 'screenshot/action',
        payload: {
          action: 'chat',
          image: { dataUrl: 'data:image/png;base64,BBBB', mime: 'image/png', name: 'shot.png' },
          source: { url: 'https://example.com/page', title: 'Example' },
          returnToPanel: true,
        },
      },
      sender: { tab: { id: 42, url: 'https://example.com/page' } as chrome.tabs.Tab },
      sendResponse,
      runtime: {
        postUiEvent: vi.fn(),
        beginPageToolSidePanelOwner: vi.fn(() => owner),
        cancelPageToolSidePanelOwner: vi.fn(),
        claimPageToolSidePanelOwner: vi.fn(() => ({ ok: true as const, owner, returnToPanel: true })),
        postPageToolCommandToSidePanel,
        ensurePanel,
        openPanelForTabFromUserGesture,
        getActiveTabId: vi.fn(async () => 42),
      },
    });

    const response = await waitPluginResponse(sendResponse);
    expect(response.ok).toBe(true);
    expect(openPanelForTabFromUserGesture).toHaveBeenCalledWith(42, 1);
    expect(ensurePanel).not.toHaveBeenCalled();
    expect(isPageToolsEnabledForUrlMock).toHaveBeenCalledTimes(0);
    expect(openPanelForTabFromUserGesture.mock.invocationCallOrder[0]).toBeLessThan(
      postPageToolCommandToSidePanel.mock.invocationCallOrder[0],
    );
    expect(postPageToolCommandToSidePanel).toHaveBeenCalledWith(1, {
      type: 'ui/screenshot',
      payload: expect.objectContaining({
        action: 'chat',
        image: expect.objectContaining({ name: 'shot.png' }),
      }),
    });
  });

  it('截图动作在当前 tab sidepanel 未 ready 时返回稳定错误，不假成功', async () => {
    const sendResponse = vi.fn();
    const ensurePanel = vi.fn(async () => undefined);
    const openPanelForTabFromUserGesture = vi.fn(async () => undefined);

    screenshotEditorSwPlugin.onMessage({
      msg: {
        type: 'screenshot/action',
        payload: {
          action: 'chat',
          image: { dataUrl: 'data:image/png;base64,BBBB', mime: 'image/png', name: 'shot.png' },
          source: { url: 'https://example.com/page', title: 'Example' },
          returnToPanel: true,
        },
      },
      sender: { tab: { id: 42, url: 'https://example.com/page' } as chrome.tabs.Tab },
      sendResponse,
      runtime: {
        postUiEvent: vi.fn(),
      beginPageToolSidePanelOwner: vi.fn(({ tabId, tool = 'screenshot-editor', sessionId }: { tabId: number; tool?: 'element-picker' | 'screenshot-editor'; sessionId?: string }) => ({ tabId, tool, sessionId, generation: 1, createdAt: Date.now() })),
      cancelPageToolSidePanelOwner: vi.fn(),
      claimPageToolSidePanelOwner: vi.fn(({ fallbackTabId, sessionId, tool = 'screenshot-editor', returnToPanel }: { fallbackTabId?: number | null; sessionId?: string | null; tool?: 'element-picker' | 'screenshot-editor' | null; returnToPanel?: boolean }) => ({ ok: true as const, owner: { tabId: fallbackTabId ?? 42, tool: tool ?? 'screenshot-editor', ...(sessionId ? { sessionId } : {}), generation: 1, createdAt: Date.now() }, returnToPanel: returnToPanel !== false })),
      postPageToolCommandToSidePanel: vi.fn(async () => ({ ok: false as const })),
        ensurePanel,
        openPanelForTabFromUserGesture,
        getActiveTabId: vi.fn(async () => 42),
      },
    });

    const response = await waitPluginResponse(sendResponse);
    expect(response).toEqual({ ok: false, error: { key: 'errors.pageToolSidePanelUnavailable' } });
    expect(openPanelForTabFromUserGesture).toHaveBeenCalledWith(42, 1);
    expect(ensurePanel).not.toHaveBeenCalled();
  });

  it('截图动作打开 sidepanel 失败时返回稳定错误并且不投递截图', async () => {
    const sendResponse = vi.fn();
    const postPageToolCommandToSidePanel = vi.fn(async () => ({ ok: true as const }));
    const ensurePanel = vi.fn(async () => undefined);
    const openPanelForTabFromUserGesture = vi.fn(async () => {
      throw new Error('sidePanel.open() may only be called in response to a user gesture');
    });
    const owner = { tabId: 42, tool: 'screenshot-editor' as const, sessionId: 'session-1', generation: 1, createdAt: Date.now() };

    screenshotEditorSwPlugin.onMessage({
      msg: {
        type: 'screenshot/action',
        payload: {
          action: 'chat',
          image: { dataUrl: 'data:image/png;base64,BBBB', mime: 'image/png', name: 'shot.png' },
          source: { url: 'https://example.com/page', title: 'Example' },
          returnToPanel: true,
        },
      },
      sender: { tab: { id: 42, url: 'https://example.com/page' } as chrome.tabs.Tab },
      sendResponse,
      runtime: {
        postUiEvent: vi.fn(),
        beginPageToolSidePanelOwner: vi.fn(() => owner),
        cancelPageToolSidePanelOwner: vi.fn(),
        claimPageToolSidePanelOwner: vi.fn(() => ({ ok: true as const, owner, returnToPanel: true })),
        postPageToolCommandToSidePanel,
        ensurePanel,
        openPanelForTabFromUserGesture,
        getActiveTabId: vi.fn(async () => 42),
      },
    });

    const response = await waitPluginResponse(sendResponse);
    expect(response).toEqual({ ok: false, error: { key: 'errors.pageToolSidePanelUnavailable' } });
    expect(openPanelForTabFromUserGesture).toHaveBeenCalledWith(42, 1);
    expect(ensurePanel).not.toHaveBeenCalled();
  });

  it('OCR 动作只调用后台视觉模型并返回文本，不打开 sidepanel', async () => {
    const sendResponse = vi.fn();
    const openPanelForTabFromUserGesture = vi.fn(async () => undefined);
    const postPageToolCommandToSidePanel = vi.fn(async () => ({ ok: true as const }));
    const cancelPageToolSidePanelOwner = vi.fn();
    const claimPageToolSidePanelOwner = vi.fn();

    screenshotEditorSwPlugin.onMessage({
      msg: {
        type: 'screenshot/action',
        payload: {
          action: 'ocr',
          image: { dataUrl: 'data:image/png;base64,BBBB', mime: 'image/png', name: 'shot.png' },
          source: { url: 'https://example.com/page', title: 'Example' },
          sessionId: 'session-ocr',
          returnToPanel: true,
          ocrRequestId: 'ocr-request-1',
        },
      },
      sender: { tab: { id: 42, url: 'https://example.com/page' } as chrome.tabs.Tab },
      sendResponse,
      runtime: {
        postUiEvent: vi.fn(),
        beginPageToolSidePanelOwner: vi.fn(),
        cancelPageToolSidePanelOwner,
        claimPageToolSidePanelOwner,
        postPageToolCommandToSidePanel,
        ensurePanel: vi.fn(async () => undefined),
        openPanelForTabFromUserGesture,
        getActiveTabId: vi.fn(async () => 42),
      },
    });

    const response = await waitPluginResponse(sendResponse);
    expect(response).toEqual({ ok: true, text: 'Recognized text', ocrRequestId: 'ocr-request-1' });
    expect(extractTextFromScreenshotMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ocr',
      image: expect.objectContaining({ name: 'shot.png' }),
      ocrRequestId: 'ocr-request-1',
    }));
    expect(openPanelForTabFromUserGesture).not.toHaveBeenCalled();
    expect(claimPageToolSidePanelOwner).not.toHaveBeenCalled();
    expect(sendExtensionTabMessageMock).not.toHaveBeenCalled();
    expect(cancelPageToolSidePanelOwner).not.toHaveBeenCalled();
    expect(postPageToolCommandToSidePanel).not.toHaveBeenCalled();
  });

  it('OCR 动作接受压缩后的 JPEG payload，并保持 MIME 与 data URL 一致', async () => {
    const sendResponse = vi.fn();
    const owner = {
      tabId: 42,
      tool: 'screenshot-editor' as const,
      sessionId: 'session-ocr-jpeg',
      generation: 8,
      createdAt: Date.now(),
    };

    screenshotEditorSwPlugin.onMessage({
      msg: {
        type: 'screenshot/action',
        payload: {
          action: 'ocr',
          image: { dataUrl: 'data:image/jpeg;base64,SkZJRg==', mime: 'image/jpeg', name: 'shot.jpg' },
          sessionId: 'session-ocr-jpeg',
          returnToPanel: true,
          ocrRequestId: 'ocr-request-jpeg',
        },
      },
      sender: { tab: { id: 42, url: 'https://example.com/page' } as chrome.tabs.Tab },
      sendResponse,
      runtime: {
        postUiEvent: vi.fn(),
        beginPageToolSidePanelOwner: vi.fn(),
        cancelPageToolSidePanelOwner: vi.fn(),
        claimPageToolSidePanelOwner: vi.fn(() => ({ ok: true as const, owner, returnToPanel: true })),
        postPageToolCommandToSidePanel: vi.fn(async () => ({ ok: true as const })),
        ensurePanel: vi.fn(async () => undefined),
        openPanelForTabFromUserGesture: vi.fn(async () => undefined),
        getActiveTabId: vi.fn(async () => 42),
      },
    });

    const response = await waitPluginResponse(sendResponse);
    expect(response.ok).toBe(true);
    expect(extractTextFromScreenshotMock).toHaveBeenCalledWith(expect.objectContaining({
      image: {
        dataUrl: 'data:image/jpeg;base64,SkZJRg==',
        mime: 'image/jpeg',
        name: 'shot.jpg',
      },
    }));
  });

  it('截图动作拒绝 MIME 与 data URL 不一致的 OCR 图片', async () => {
    const sendResponse = vi.fn();

    screenshotEditorSwPlugin.onMessage({
      msg: {
        type: 'screenshot/action',
        payload: {
          action: 'ocr',
          image: { dataUrl: 'data:image/jpeg;base64,SkZJRg==', mime: 'image/png', name: 'shot.png' },
          returnToPanel: true,
          ocrRequestId: 'ocr-request-invalid-mime',
        },
      },
      sender: { tab: { id: 42, url: 'https://example.com/page' } as chrome.tabs.Tab },
      sendResponse,
      runtime: {
        postUiEvent: vi.fn(),
        beginPageToolSidePanelOwner: vi.fn(),
        cancelPageToolSidePanelOwner: vi.fn(),
        claimPageToolSidePanelOwner: vi.fn(),
        postPageToolCommandToSidePanel: vi.fn(async () => ({ ok: true as const })),
        ensurePanel: vi.fn(async () => undefined),
        openPanelForTabFromUserGesture: vi.fn(async () => undefined),
        getActiveTabId: vi.fn(async () => 42),
      },
    });

    const response = await waitPluginResponse(sendResponse);
    expect(response).toEqual({
      ok: false,
      error: { key: 'errors.screenshotEditorActionInvalid' },
    });
    expect(extractTextFromScreenshotMock).not.toHaveBeenCalled();
  });

  it('OCR 动作不受 sidepanel open 失败影响，结果只由 OCR 模型决定', async () => {
    const sendResponse = vi.fn();
    const openPanelForTabFromUserGesture = vi.fn(async () => {
      throw new Error('sidePanel.open() may only be called in response to a user gesture');
    });
    const postPageToolCommandToSidePanel = vi.fn(async () => ({ ok: true as const }));
    const cancelPageToolSidePanelOwner = vi.fn();
    const owner = {
      tabId: 42,
      tool: 'screenshot-editor' as const,
      sessionId: 'session-ocr',
      generation: 7,
      createdAt: Date.now(),
    };

    screenshotEditorSwPlugin.onMessage({
      msg: {
        type: 'screenshot/action',
        payload: {
          action: 'ocr',
          image: { dataUrl: 'data:image/png;base64,BBBB', mime: 'image/png', name: 'shot.png' },
          source: { url: 'https://example.com/page', title: 'Example' },
          sessionId: 'session-ocr',
          returnToPanel: true,
          ocrRequestId: 'ocr-request-open-failed',
        },
      },
      sender: { tab: { id: 42, url: 'https://example.com/page' } as chrome.tabs.Tab },
      sendResponse,
      runtime: {
        postUiEvent: vi.fn(),
        beginPageToolSidePanelOwner: vi.fn(),
        cancelPageToolSidePanelOwner,
        claimPageToolSidePanelOwner: vi.fn(() => ({ ok: true as const, owner, returnToPanel: true })),
        postPageToolCommandToSidePanel,
        ensurePanel: vi.fn(async () => undefined),
        openPanelForTabFromUserGesture,
        getActiveTabId: vi.fn(async () => 42),
      },
    });

    const response = await waitPluginResponse(sendResponse);
    expect(response).toEqual({
      ok: true,
      text: 'Recognized text',
      ocrRequestId: 'ocr-request-open-failed',
    });
    expect(openPanelForTabFromUserGesture).not.toHaveBeenCalled();
    expect(extractTextFromScreenshotMock).toHaveBeenCalled();
    expect(sendExtensionTabMessageMock).not.toHaveBeenCalled();
    expect(cancelPageToolSidePanelOwner).not.toHaveBeenCalled();
    expect(postPageToolCommandToSidePanel).not.toHaveBeenCalled();
  });

  it('OCR 模型失败时返回模型错误且不打开 sidepanel', async () => {
    extractTextFromScreenshotMock.mockRejectedValueOnce(new I18nError('errors.screenshotOcrFailed'));
    const sendResponse = vi.fn();
    const openPanelForTabFromUserGesture = vi.fn(async () => undefined);
    const owner = {
      tabId: 42,
      tool: 'screenshot-editor' as const,
      sessionId: 'session-ocr',
      generation: 7,
      createdAt: Date.now(),
    };

    screenshotEditorSwPlugin.onMessage({
      msg: {
        type: 'screenshot/action',
        payload: {
          action: 'ocr',
          image: { dataUrl: 'data:image/png;base64,BBBB', mime: 'image/png', name: 'shot.png' },
          source: { url: 'https://example.com/page', title: 'Example' },
          sessionId: 'session-ocr',
          returnToPanel: true,
          ocrRequestId: 'ocr-request-model-failed',
        },
      },
      sender: { tab: { id: 42, url: 'https://example.com/page' } as chrome.tabs.Tab },
      sendResponse,
      runtime: {
        postUiEvent: vi.fn(),
        beginPageToolSidePanelOwner: vi.fn(),
        cancelPageToolSidePanelOwner: vi.fn(),
        claimPageToolSidePanelOwner: vi.fn(() => ({ ok: true as const, owner, returnToPanel: true })),
        postPageToolCommandToSidePanel: vi.fn(async () => ({ ok: true as const })),
        ensurePanel: vi.fn(async () => undefined),
        openPanelForTabFromUserGesture,
        getActiveTabId: vi.fn(async () => 42),
      },
    });

    const response = await waitPluginResponse(sendResponse);
    expect(response).toEqual({
      ok: false,
      error: { key: 'errors.screenshotOcrFailed' },
      ocrRequestId: 'ocr-request-model-failed',
    });
    expect(openPanelForTabFromUserGesture).not.toHaveBeenCalled();
    expect(sendExtensionTabMessageMock).not.toHaveBeenCalled();
  });
});
