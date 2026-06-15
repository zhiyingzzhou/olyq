/**
 * 说明：`page-tool-session.spec` Service Worker 插件测试。
 *
 * 职责：
 * - 验证 content script 关闭页面工具时会按会话恢复 sidepanel；
 * - 确认重复关闭保持幂等，不让面板打开动作被多次触发。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPageToolSession } from '@/extension/background/page-tool-session';
import { pageToolSessionSwPlugin } from './page-tool-session';

/** 等待插件异步响应。 */
async function waitPluginResponse(sendResponse: ReturnType<typeof vi.fn>) {
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
  return sendResponse.mock.calls[0]?.[0] as { ok?: boolean; error?: unknown };
}

describe('pageToolSessionSwPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('关闭已登记会话后会用用户手势链路恢复对应 tab 的 sidepanel', async () => {
    const session = createPageToolSession({ tabId: 42, tool: 'screenshot-editor', returnToPanel: true });
    const sendResponse = vi.fn();
    const ensurePanel = vi.fn(async () => undefined);
    const openPanelForTabFromUserGesture = vi.fn(async () => undefined);

    const handled = pageToolSessionSwPlugin.onMessage({
      msg: {
        type: 'page-tool/session/closed',
        payload: { sessionId: session.sessionId, tool: 'screenshot-editor', reason: 'escape' },
      },
      sender: { tab: { id: 42 } as chrome.tabs.Tab },
      sendResponse,
      runtime: {
        postUiEvent: vi.fn(),
      beginPageToolSidePanelOwner: vi.fn(({ tabId, tool = 'screenshot-editor', sessionId }: { tabId: number; tool?: 'element-picker' | 'screenshot-editor'; sessionId?: string }) => ({ tabId, tool, sessionId, generation: 1, createdAt: Date.now() })),
      cancelPageToolSidePanelOwner: vi.fn(),
      claimPageToolSidePanelOwner: vi.fn(({ fallbackTabId, sessionId, tool = 'screenshot-editor', returnToPanel }: { fallbackTabId?: number | null; sessionId?: string | null; tool?: 'element-picker' | 'screenshot-editor' | null; returnToPanel?: boolean }) => ({ ok: true as const, owner: { tabId: fallbackTabId ?? 42, tool: tool ?? 'screenshot-editor', ...(sessionId ? { sessionId } : {}), generation: 1, createdAt: Date.now() }, returnToPanel: returnToPanel !== false })),
      postPageToolCommandToSidePanel: vi.fn(async () => ({ ok: true as const })),
        ensurePanel,
        openPanelForTabFromUserGesture,
        getActiveTabId: vi.fn(async () => 42),
      },
    });

    expect(handled).toBe(true);
    await expect(waitPluginResponse(sendResponse)).resolves.toMatchObject({ ok: true });
    expect(openPanelForTabFromUserGesture).toHaveBeenCalledWith(42, 1);
    expect(ensurePanel).not.toHaveBeenCalled();

    const secondResponse = vi.fn();
    pageToolSessionSwPlugin.onMessage({
      msg: {
        type: 'page-tool/session/closed',
        payload: { sessionId: session.sessionId, tool: 'screenshot-editor', reason: 'escape' },
      },
      sender: { tab: { id: 42 } as chrome.tabs.Tab },
      sendResponse: secondResponse,
      runtime: {
        postUiEvent: vi.fn(),
      beginPageToolSidePanelOwner: vi.fn(({ tabId, tool = 'screenshot-editor', sessionId }: { tabId: number; tool?: 'element-picker' | 'screenshot-editor'; sessionId?: string }) => ({ tabId, tool, sessionId, generation: 1, createdAt: Date.now() })),
      cancelPageToolSidePanelOwner: vi.fn(),
      claimPageToolSidePanelOwner: vi.fn(({ fallbackTabId, sessionId, tool = 'screenshot-editor', returnToPanel }: { fallbackTabId?: number | null; sessionId?: string | null; tool?: 'element-picker' | 'screenshot-editor' | null; returnToPanel?: boolean }) => ({ ok: true as const, owner: { tabId: fallbackTabId ?? 42, tool: tool ?? 'screenshot-editor', ...(sessionId ? { sessionId } : {}), generation: 1, createdAt: Date.now() }, returnToPanel: returnToPanel !== false })),
      postPageToolCommandToSidePanel: vi.fn(async () => ({ ok: true as const })),
        ensurePanel,
        openPanelForTabFromUserGesture,
        getActiveTabId: vi.fn(async () => 42),
      },
    });

    await expect(waitPluginResponse(secondResponse)).resolves.toMatchObject({ ok: true });
    expect(openPanelForTabFromUserGesture).toHaveBeenCalledTimes(1);
  });

  it('SW 会话丢失时会按 returnToPanel 与 sender.tab 恢复 sidepanel', async () => {
    const sendResponse = vi.fn();
    const ensurePanel = vi.fn(async () => undefined);
    const openPanelForTabFromUserGesture = vi.fn(async () => undefined);

    pageToolSessionSwPlugin.onMessage({
      msg: {
        type: 'page-tool/session/closed',
        payload: {
          sessionId: 'missing-session',
          tool: 'element-picker',
          reason: 'escape',
          returnToPanel: true,
        },
      },
      sender: { tab: { id: 77 } as chrome.tabs.Tab },
      sendResponse,
      runtime: {
        postUiEvent: vi.fn(),
      beginPageToolSidePanelOwner: vi.fn(({ tabId, tool = 'screenshot-editor', sessionId }: { tabId: number; tool?: 'element-picker' | 'screenshot-editor'; sessionId?: string }) => ({ tabId, tool, sessionId, generation: 1, createdAt: Date.now() })),
      cancelPageToolSidePanelOwner: vi.fn(),
      claimPageToolSidePanelOwner: vi.fn(({ fallbackTabId, sessionId, tool = 'screenshot-editor', returnToPanel }: { fallbackTabId?: number | null; sessionId?: string | null; tool?: 'element-picker' | 'screenshot-editor' | null; returnToPanel?: boolean }) => ({ ok: true as const, owner: { tabId: fallbackTabId ?? 42, tool: tool ?? 'screenshot-editor', ...(sessionId ? { sessionId } : {}), generation: 1, createdAt: Date.now() }, returnToPanel: returnToPanel !== false })),
      postPageToolCommandToSidePanel: vi.fn(async () => ({ ok: true as const })),
        ensurePanel,
        openPanelForTabFromUserGesture,
        getActiveTabId: vi.fn(async () => 77),
      },
    });

    await expect(waitPluginResponse(sendResponse)).resolves.toMatchObject({ ok: true });
    expect(openPanelForTabFromUserGesture).toHaveBeenCalledWith(77, 1);
    expect(ensurePanel).not.toHaveBeenCalled();
  });
});
