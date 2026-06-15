/**
 * 说明：SidePanelService 单 owner 回归测试。
 *
 * 职责：
 * - 锁住单 active owner；
 * - 验证专用 `olyq:sidepanel` Port 的命令 / ack 事务；
 * - 防止旧 generation 或旧 Port 完成当前页面工具命令。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginPageToolSidePanelOwner,
  cancelPageToolSidePanelOwner,
  claimPageToolSidePanelOwner,
  getActiveSidePanelOwnerForTest,
  isSidePanelPageToolLoadedForOpen,
  markSidePanelPageToolBridgeReady,
  postPageToolCommandToSidePanel,
  registerSidePanelPageToolPort,
  requestSidePanelPageToolBridgeReady,
  resetSidePanelServiceForTest,
  resolveSidePanelPageToolCommandAck,
  setPageToolSidePanelOwnerCancelHandler,
  unregisterSidePanelPageToolPort,
} from './side-panel-service';

/** 构造最小 Port mock。 */
function makePort(): chrome.runtime.Port & { postMessage: ReturnType<typeof vi.fn> } {
  return {
    name: 'olyq:sidepanel',
    postMessage: vi.fn(),
  } as unknown as chrome.runtime.Port & { postMessage: ReturnType<typeof vi.fn> };
}

describe('side-panel-service single owner', () => {
  afterEach(() => {
    vi.useRealTimers();
    resetSidePanelServiceForTest();
    vi.clearAllMocks();
  });

  it('新的 owner 会让旧 generation 命令稳定失败', async () => {
    const port = makePort();
    const oldOwner = beginPageToolSidePanelOwner({ tabId: 101, tool: 'screenshot-editor', sessionId: 'old-session' });
    const newOwner = beginPageToolSidePanelOwner({ tabId: 202, tool: 'screenshot-editor', sessionId: 'new-session' });
    registerSidePanelPageToolPort(port);
    markSidePanelPageToolBridgeReady(port);

    expect(newOwner.generation).toBeGreaterThan(oldOwner.generation);
    await expect(postPageToolCommandToSidePanel(oldOwner.generation, {
      type: 'ui/page-tool-error',
      payload: { error: { key: 'errors.pageToolsDisabled' } },
    })).resolves.toEqual({ ok: false, error: { key: 'errors.pageToolSidePanelUnavailable' } });
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it('只接受当前 generation 且来自命令目标 Port 的 ack', async () => {
    const port = makePort();
    const otherPort = makePort();
    const owner = beginPageToolSidePanelOwner({ tabId: 42, tool: 'screenshot-editor', sessionId: 'session-42' });
    registerSidePanelPageToolPort(port);
    requestSidePanelPageToolBridgeReady(owner.generation);
    markSidePanelPageToolBridgeReady(port, owner.generation);

    const delivery = postPageToolCommandToSidePanel(owner.generation, {
      type: 'ui/screenshot',
      payload: {
        action: 'chat',
        image: { dataUrl: 'data:image/png;base64,AAAA', mime: 'image/png', name: 'shot.png' },
      },
    });

    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledTimes(2));
    const command = port.postMessage.mock.calls[1]?.[0] as { requestId: string; generation: number };
    expect(command).toMatchObject({
      type: 'sidepanel/page-tool-command',
      generation: owner.generation,
    });

    expect(resolveSidePanelPageToolCommandAck(otherPort, {
      type: 'sidepanel/page-tool-command-ack',
      requestId: command.requestId,
      generation: command.generation,
      payload: { ok: true },
    })).toBe(false);
    expect(resolveSidePanelPageToolCommandAck(port, {
      type: 'sidepanel/page-tool-command-ack',
      requestId: command.requestId,
      generation: command.generation + 1,
      payload: { ok: true },
    })).toBe(false);
    expect(resolveSidePanelPageToolCommandAck(port, {
      type: 'sidepanel/page-tool-command-ack',
      requestId: command.requestId,
      generation: command.generation,
      payload: { ok: true },
    })).toBe(true);

    await expect(delivery).resolves.toEqual({ ok: true });
  });

  it('active owner 存在时拒绝旧 session 抢占当前 sidepanel', () => {
    beginPageToolSidePanelOwner({ tabId: 42, tool: 'screenshot-editor', sessionId: 'current-session' });

    expect(claimPageToolSidePanelOwner({
      sessionId: 'old-session',
      fallbackTabId: 99,
      returnToPanel: true,
    })).toEqual({ ok: false, error: { key: 'errors.pageToolSidePanelUnavailable' } });
  });

  it('Port 断开会让等待 ack 的命令失败', async () => {
    const port = makePort();
    const owner = beginPageToolSidePanelOwner({ tabId: 42, tool: 'screenshot-editor', sessionId: 'session-42' });
    registerSidePanelPageToolPort(port);
    requestSidePanelPageToolBridgeReady(owner.generation);
    markSidePanelPageToolBridgeReady(port, owner.generation);

    const delivery = postPageToolCommandToSidePanel(owner.generation, {
      type: 'ui/page-tool-error',
      payload: { error: { key: 'errors.pageToolsDisabled' } },
    });
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledTimes(1));
    unregisterSidePanelPageToolPort(port);

    await expect(delivery).resolves.toEqual({
      ok: false,
      error: { key: 'errors.pageToolSidePanelUnavailable' },
    });
    cancelPageToolSidePanelOwner(owner.generation);
  });

  it('raw Port 连接但 bridge 未 ready 时不会投递页面工具命令', async () => {
    vi.useFakeTimers();
    const port = makePort();
    registerSidePanelPageToolPort(port);
    const owner = beginPageToolSidePanelOwner({ tabId: 42, tool: 'screenshot-editor', sessionId: 'session-42' });

    expect(isSidePanelPageToolLoadedForOpen(owner.generation)).toBe(false);
    const delivery = postPageToolCommandToSidePanel(owner.generation, {
      type: 'ui/page-tool-error',
      payload: { error: { key: 'errors.pageToolsDisabled' } },
    });

    await vi.advanceTimersByTimeAsync(8_010);
    expect(port.postMessage).not.toHaveBeenCalled();
    await expect(delivery).resolves.toEqual({
      ok: false,
      error: { key: 'errors.pageToolSidePanelUnavailable' },
    });
  });

  it('新 owner 不会复用上一代已经 ready 的旧 Port', async () => {
    vi.useFakeTimers();
    const port = makePort();
    const firstOwner = beginPageToolSidePanelOwner({ tabId: 1, tool: 'screenshot-editor', sessionId: 'first' });
    registerSidePanelPageToolPort(port);
    requestSidePanelPageToolBridgeReady(firstOwner.generation);
    markSidePanelPageToolBridgeReady(port, firstOwner.generation);

    port.postMessage.mockClear();
    const secondOwner = beginPageToolSidePanelOwner({ tabId: 2, tool: 'screenshot-editor', sessionId: 'second' });
    const delivery = postPageToolCommandToSidePanel(secondOwner.generation, {
      type: 'ui/page-tool-error',
      payload: { error: { key: 'errors.pageToolsDisabled' } },
    });

    await vi.advanceTimersByTimeAsync(8_010);
    expect(port.postMessage).not.toHaveBeenCalled();
    await expect(delivery).resolves.toEqual({
      ok: false,
      error: { key: 'errors.pageToolSidePanelUnavailable' },
    });
  });

  it('ready request 允许同一 Sidepanel 文档按当前 generation 重新确认 loaded', async () => {
    const port = makePort();
    const firstOwner = beginPageToolSidePanelOwner({ tabId: 1, tool: 'screenshot-editor', sessionId: 'first' });
    registerSidePanelPageToolPort(port);
    requestSidePanelPageToolBridgeReady(firstOwner.generation);
    markSidePanelPageToolBridgeReady(port, firstOwner.generation);

    expect(isSidePanelPageToolLoadedForOpen(firstOwner.generation)).toBe(true);

    port.postMessage.mockClear();
    const secondOwner = beginPageToolSidePanelOwner({ tabId: 2, tool: 'screenshot-editor', sessionId: 'second' });
    expect(isSidePanelPageToolLoadedForOpen(secondOwner.generation)).toBe(false);
    requestSidePanelPageToolBridgeReady(secondOwner.generation);
    expect(port.postMessage).toHaveBeenCalledWith({
      type: 'sidepanel/page-tool-ready-request',
      generation: secondOwner.generation,
    });

    markSidePanelPageToolBridgeReady(port, secondOwner.generation);
    expect(isSidePanelPageToolLoadedForOpen(secondOwner.generation)).toBe(true);
    const delivery = postPageToolCommandToSidePanel(secondOwner.generation, {
      type: 'ui/page-tool-error',
      payload: { error: { key: 'errors.pageToolsDisabled' } },
    });
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledTimes(2));
    const command = port.postMessage.mock.calls[1]?.[0] as { requestId: string; generation: number };
    resolveSidePanelPageToolCommandAck(port, {
      type: 'sidepanel/page-tool-command-ack',
      requestId: command.requestId,
      generation: command.generation,
      payload: { ok: true },
    });
    await expect(delivery).resolves.toEqual({ ok: true });
  });

  it('普通 bridge-ready 遇到已声明等待的 generation 时只请求代际 ready，不取消 owner', () => {
    const port = makePort();
    const onCancel = vi.fn();
    setPageToolSidePanelOwnerCancelHandler(onCancel);
    const owner = beginPageToolSidePanelOwner({ tabId: 42, tool: 'screenshot-editor', sessionId: 'session-42' });
    registerSidePanelPageToolPort(port);
    requestSidePanelPageToolBridgeReady(owner.generation);
    port.postMessage.mockClear();

    markSidePanelPageToolBridgeReady(port);

    expect(getActiveSidePanelOwnerForTest()).toEqual(owner);
    expect(onCancel).not.toHaveBeenCalled();
    expect(port.postMessage).toHaveBeenCalledWith({
      type: 'sidepanel/page-tool-ready-request',
      generation: owner.generation,
    });
    expect(isSidePanelPageToolLoadedForOpen(owner.generation)).toBe(false);
  });

  it('普通 bridge-ready 表示手动打开 sidepanel，会取消旧页面工具 owner', () => {
    const port = makePort();
    const onCancel = vi.fn();
    setPageToolSidePanelOwnerCancelHandler(onCancel);
    const owner = beginPageToolSidePanelOwner({ tabId: 42, tool: 'screenshot-editor', sessionId: 'session-42' });
    registerSidePanelPageToolPort(port);

    markSidePanelPageToolBridgeReady(port);

    expect(getActiveSidePanelOwnerForTest()).toBeNull();
    expect(onCancel).toHaveBeenCalledWith(owner, 'replace');
  });
});
