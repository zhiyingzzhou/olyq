/**
 * 说明：Sidepanel 页面工具专用 Port 前端桥接测试。
 *
 * 职责：
 * - 验证 React bridge 完成命令订阅后才向 SW 宣告 ready；
 * - 避免 SW 只凭 raw Port 连接就投递页面工具命令。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockEvent<T extends (...args: unknown[]) => void> = {
  listeners: T[];
  addListener: ReturnType<typeof vi.fn>;
};

type MockPort = chrome.runtime.Port & {
  postMessage: ReturnType<typeof vi.fn>;
  onMessage: MockEvent<(msg: unknown) => void>;
  onDisconnect: MockEvent<() => void>;
};

/** 构造 Chrome Event 风格 mock。 */
function makeEvent<T extends (...args: unknown[]) => void>(): MockEvent<T> {
  const listeners: T[] = [];
  return {
    listeners,
    addListener: vi.fn((listener: T) => {
      listeners.push(listener);
    }),
  };
}

/** 构造最小 runtime Port mock。 */
function makePort(): MockPort {
  return {
    name: 'olyq:sidepanel',
    postMessage: vi.fn(),
    onMessage: makeEvent<(msg: unknown) => void>(),
    onDisconnect: makeEvent<() => void>(),
  } as unknown as MockPort;
}

describe('sidepanel-page-tool-port bridge ready', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('订阅已存在时，Port 连接后发送 bridge-ready', async () => {
    const port = makePort();
    const connect = vi.fn(() => port);
    vi.stubGlobal('chrome', {
      runtime: {
        connect,
        lastError: undefined,
      },
    });

    const bridge = await import('./sidepanel-page-tool-port');
    bridge.onSidePanelPageToolCommand(vi.fn());
    await bridge.ensureSidePanelPageToolPortReady();

    expect(connect).toHaveBeenCalledWith({ name: 'olyq:sidepanel' });
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'sidepanel/page-tool-bridge-ready' });
  });

  it('Port 已连接时，首次订阅后发送 bridge-ready', async () => {
    const port = makePort();
    vi.stubGlobal('chrome', {
      runtime: {
        connect: vi.fn(() => port),
        lastError: undefined,
      },
    });

    const bridge = await import('./sidepanel-page-tool-port');
    await bridge.ensureSidePanelPageToolPortReady();
    expect(port.postMessage).not.toHaveBeenCalled();

    bridge.onSidePanelPageToolCommand(vi.fn());
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'sidepanel/page-tool-bridge-ready' });
  });

  it('收到 generation ready request 后会重新发送带代际的 bridge-ready', async () => {
    const port = makePort();
    vi.stubGlobal('chrome', {
      runtime: {
        connect: vi.fn(() => port),
        lastError: undefined,
      },
    });

    const bridge = await import('./sidepanel-page-tool-port');
    bridge.onSidePanelPageToolCommand(vi.fn());
    await bridge.ensureSidePanelPageToolPortReady();
    port.postMessage.mockClear();

    port.onMessage.listeners[0]?.({ type: 'sidepanel/page-tool-ready-request', generation: 7 });

    expect(port.postMessage).toHaveBeenCalledWith({
      type: 'sidepanel/page-tool-bridge-ready',
      generation: 7,
    });
  });
});
