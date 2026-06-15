/**
 * 说明：`element-picker.spec` Service Worker 插件测试。
 *
 * 职责：
 * - 验证元素选择器启动前会确保 page tools content script 可达；
 * - 验证启动成功后创建页面工具会话、关闭 sidepanel 再投递 content script；
 * - 防止旧的“启动后立刻打开 sidepanel”行为回归。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementPickerSwPlugin } from './element-picker';

const {
  closePanelForPageToolSessionMock,
  ensurePageToolContentScriptReadyForTabMock,
  getExtensionTabMock,
  isPageToolsEnabledForUrlMock,
  sendExtensionTabMessageWithRetryMock,
} = vi.hoisted(() => ({
  closePanelForPageToolSessionMock: vi.fn(),
  ensurePageToolContentScriptReadyForTabMock: vi.fn(),
  getExtensionTabMock: vi.fn(),
  isPageToolsEnabledForUrlMock: vi.fn(),
  sendExtensionTabMessageWithRetryMock: vi.fn(),
}));

vi.mock('@/extension/background/content-script-manager', () => ({
  ensurePageToolContentScriptReadyForTab: ensurePageToolContentScriptReadyForTabMock,
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
  sendExtensionTabMessageWithRetry: sendExtensionTabMessageWithRetryMock,
}));

/** 等待插件异步响应。 */
async function waitPluginResponse(sendResponse: ReturnType<typeof vi.fn>) {
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
  return sendResponse.mock.calls[0]?.[0] as { ok?: boolean; error?: unknown; sessionId?: string; returnToPanel?: boolean };
}

describe('elementPickerSwPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getExtensionTabMock.mockResolvedValue({
      id: 42,
      url: 'https://github.com/owner/repo',
    });
    ensurePageToolContentScriptReadyForTabMock.mockResolvedValue({ ready: true, injected: true });
    closePanelForPageToolSessionMock.mockResolvedValue(undefined);
    isPageToolsEnabledForUrlMock.mockResolvedValue(true);
    sendExtensionTabMessageWithRetryMock.mockImplementation(async (_tabId: number, message: { payload?: { sessionId?: string; returnToPanel?: boolean } }) => ({
      ok: true,
      opened: true,
      tool: 'element-picker',
      sessionId: message.payload?.sessionId,
      returnToPanel: message.payload?.returnToPanel,
    }));
  });

  it('启动选择器时先关闭 sidepanel 再投递会话，不再立即打开 sidepanel', async () => {
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

    const handled = elementPickerSwPlugin.onMessage({
      msg: { type: 'element/picker/start', payload: { tabId: 42 } },
      sender: {},
      sendResponse,
      runtime,
    });

    expect(handled).toBe(true);
    const response = await waitPluginResponse(sendResponse);
    expect(response.ok).toBe(true);
    expect(response.sessionId).toEqual(expect.stringContaining('page-tool-element-picker-42-'));
    expect(response.returnToPanel).toBe(true);
    expect(ensurePageToolContentScriptReadyForTabMock).toHaveBeenCalledWith(42);
    expect(sendExtensionTabMessageWithRetryMock).toHaveBeenCalledWith(
      42,
      {
        type: 'element/picker/open',
        payload: {
          sessionId: response.sessionId,
          returnToPanel: true,
        },
      },
      expect.objectContaining({ maxAttempts: 12 }),
    );
    expect(closePanelForPageToolSessionMock).toHaveBeenCalledWith(42);
    expect(closePanelForPageToolSessionMock.mock.invocationCallOrder[0]).toBeLessThan(
      sendExtensionTabMessageWithRetryMock.mock.invocationCallOrder[0],
    );
    expect(runtime.ensurePanel).not.toHaveBeenCalled();
  });

  it('关闭 sidepanel 后打开选择器失败时会恢复 sidepanel 并投递错误事件', async () => {
    sendExtensionTabMessageWithRetryMock.mockRejectedValueOnce(new Error('Receiving end does not exist.'));
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

    elementPickerSwPlugin.onMessage({
      msg: { type: 'element/picker/start', payload: { tabId: 42 } },
      sender: {},
      sendResponse,
      runtime,
    });

    const response = await waitPluginResponse(sendResponse);
    expect(response.ok).toBe(false);
    expect(closePanelForPageToolSessionMock).toHaveBeenCalledWith(42);
    expect(runtime.ensurePanel).toHaveBeenCalledWith(42);
    expect(runtime.postPageToolCommandToSidePanel).toHaveBeenCalledWith(1, expect.objectContaining({
      type: 'ui/page-tool-error',
      payload: expect.objectContaining({ error: expect.anything() }),
    }));
  });

  it('隐藏 sidepanel 失败时不继续打开选择器，避免消息送达被误当成功', async () => {
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

    elementPickerSwPlugin.onMessage({
      msg: { type: 'element/picker/start', payload: { tabId: 42 } },
      sender: {},
      sendResponse,
      runtime,
    });

    const response = await waitPluginResponse(sendResponse);
    expect(response.ok).toBe(false);
    expect(sendExtensionTabMessageWithRetryMock).not.toHaveBeenCalled();
    expect(runtime.ensurePanel).not.toHaveBeenCalled();
  });

  it('content script 返回 ok:false 时会回滚会话、恢复 sidepanel 并提示错误', async () => {
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

    elementPickerSwPlugin.onMessage({
      msg: { type: 'element/picker/start', payload: { tabId: 42 } },
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

  it('content script 未返回 opened:true 时会恢复 sidepanel，避免误判工具已打开', async () => {
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

    elementPickerSwPlugin.onMessage({
      msg: { type: 'element/picker/start', payload: { tabId: 42 } },
      sender: {},
      sendResponse,
      runtime,
    });

    const response = await waitPluginResponse(sendResponse);
    expect(response.ok).toBe(false);
    expect(response.error).toEqual({ key: 'errors.elementPickerContentScriptUnavailable' });
    expect(runtime.ensurePanel).toHaveBeenCalledWith(42);
  });

  it('page-tools 禁用时不补注入、不关闭 sidepanel', async () => {
    isPageToolsEnabledForUrlMock.mockResolvedValue(false);
    const sendResponse = vi.fn();

    elementPickerSwPlugin.onMessage({
      msg: { type: 'element/picker/start', payload: { tabId: 42 } },
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
    expect(sendExtensionTabMessageWithRetryMock).not.toHaveBeenCalled();
    expect(closePanelForPageToolSessionMock).not.toHaveBeenCalled();
  });
});
