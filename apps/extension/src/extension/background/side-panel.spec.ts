/**
 * 说明：`side-panel.spec` 后台侧边栏打开能力回归测试。
 *
 * 职责：
 * - 锁住 Chromium Side Panel Promise / callback 两种运行时形态；
 * - 确保打开侧边栏失败不会变成未处理异常。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  expectSidePanelPageToolBridgeReadyMock,
  isSidePanelPageToolLoadedForOpenMock,
  requestSidePanelPageToolBridgeReadyMock,
  waitForSidePanelPageToolLoadedMock,
} = vi.hoisted(() => ({
  expectSidePanelPageToolBridgeReadyMock: vi.fn(),
  isSidePanelPageToolLoadedForOpenMock: vi.fn(() => false),
  requestSidePanelPageToolBridgeReadyMock: vi.fn(),
  waitForSidePanelPageToolLoadedMock: vi.fn(async () => true),
}));

vi.mock('./side-panel-service', () => ({
  expectSidePanelPageToolBridgeReady: expectSidePanelPageToolBridgeReadyMock,
  isSidePanelPageToolLoadedForOpen: isSidePanelPageToolLoadedForOpenMock,
  requestSidePanelPageToolBridgeReady: requestSidePanelPageToolBridgeReadyMock,
  waitForSidePanelPageToolLoaded: waitForSidePanelPageToolLoadedMock,
}));

import {
  configureChromiumActionPanelBehavior,
  closePanelForPageToolSession,
  getChromeSidePanelOpen,
  installFirefoxActionClickHandler,
  openPanelForTab,
  openPanelForTabFromUserGesture,
} from './side-panel';

describe('side panel runtime helper', () => {
  afterEach(() => {
    vi.clearAllMocks();
    isSidePanelPageToolLoadedForOpenMock.mockReset();
    isSidePanelPageToolLoadedForOpenMock.mockReturnValue(false);
    requestSidePanelPageToolBridgeReadyMock.mockReset();
    waitForSidePanelPageToolLoadedMock.mockResolvedValue(true);
    vi.unstubAllGlobals();
  });

  it('Promise 风格 sidePanel.open 不需要 callback，并保留 sidePanel receiver', async () => {
    const calls: unknown[][] = [];
    /** 模拟 Chrome 116+ Promise 形态的 `sidePanel.open`。 */
    const sidePanel = {
      /** 需要以 `sidePanel` 对象为 receiver 调用的 Promise 形态 open。 */
      open(this: unknown, options: { tabId: number }) {
        if (this !== sidePanel) throw new TypeError('Illegal invocation');
        calls.push([options]);
        return Promise.resolve();
      },
    };
    vi.stubGlobal('chrome', {
      runtime: { lastError: undefined },
      sidePanel,
    });

    expect(getChromeSidePanelOpen()).toBeTypeOf('function');
    await expect(openPanelForTab(7)).resolves.toBeUndefined();

    expect(calls).toEqual([[{ tabId: 7 }]]);
    expect(waitForSidePanelPageToolLoadedMock).toHaveBeenCalledWith();
  });

  it('Promise 风格 sidePanel.open 拒绝时会把失败交给调用方处理', async () => {
    const calls: unknown[][] = [];
    /** 模拟用户手势失效时 Promise 形态的 `sidePanel.open` 拒绝。 */
    const sidePanel = {
      /** 需要以 `sidePanel` 对象为 receiver 调用的拒绝态 open。 */
      open(this: unknown, options: { tabId: number }) {
        if (this !== sidePanel) throw new TypeError('Illegal invocation');
        calls.push([options]);
        return Promise.reject(new Error('gesture required'));
      },
    };
    vi.stubGlobal('chrome', {
      runtime: { lastError: undefined },
      sidePanel,
    });

    await expect(openPanelForTab(8)).rejects.toThrow('gesture required');

    expect(calls).toEqual([[{ tabId: 8 }]]);
    expect(waitForSidePanelPageToolLoadedMock).not.toHaveBeenCalled();
  });

  it('callback 风格 sidePanel.open 会保留 receiver 并上抛 runtime.lastError', async () => {
    const calls: unknown[][] = [];
    /** 模拟旧 callback 形态的 `sidePanel.open`，失败只暴露在 `runtime.lastError`。 */
    const sidePanel = {
      /** 需要以 `sidePanel` 对象为 receiver 调用的 callback 形态 open。 */
      open(this: unknown, options: { tabId: number }, callback: () => void) {
        if (this !== sidePanel) throw new TypeError('Illegal invocation');
        calls.push([options, callback]);
        callback();
      },
    };
    vi.stubGlobal('chrome', {
      runtime: { lastError: { message: 'gesture required' } },
      sidePanel,
    });

    await expect(openPanelForTab(9)).rejects.toThrow('gesture required');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toEqual({ tabId: 9 });
    expect(typeof calls[0]?.[1]).toBe('function');
  });

  it('Chromium 打开 Side Panel 前会恢复当前 tab 面板配置', async () => {
    const order: string[] = [];
    const sidePanel = {
      open: vi.fn(function (this: unknown) {
        if (this !== sidePanel) throw new TypeError('Illegal invocation');
        order.push('open');
        return Promise.resolve();
      }),
      setOptions: vi.fn(function (this: unknown) {
        if (this !== sidePanel) throw new TypeError('Illegal invocation');
        order.push('setOptions');
        return Promise.resolve();
      }),
    };
    vi.stubGlobal('chrome', {
      runtime: { lastError: undefined },
      sidePanel,
    });

    await openPanelForTab(17);

    expect(sidePanel.open).toHaveBeenCalledWith({ tabId: 17 });
    expect(sidePanel.setOptions).toHaveBeenCalledWith({
      path: 'src/extension/sidepanel/index.html',
      enabled: true,
    });
    expect(order).toEqual(['setOptions', 'open']);
    expect(waitForSidePanelPageToolLoadedMock).toHaveBeenCalledWith();
  });

  it('用户手势链路打开 Side Panel 时按 Monica 顺序发起 setOptions 后立即调用 open', async () => {
    const order: string[] = [];
    let resolveSetOptions!: () => void;
    const sidePanel = {
      open: vi.fn(function (this: unknown) {
        if (this !== sidePanel) throw new TypeError('Illegal invocation');
        order.push('open');
        return Promise.resolve();
      }),
      setOptions: vi.fn(function (this: unknown) {
        if (this !== sidePanel) throw new TypeError('Illegal invocation');
        order.push('setOptions');
        return new Promise<void>((resolve) => {
          resolveSetOptions = resolve;
        });
      }),
    };
    vi.stubGlobal('chrome', {
      runtime: { lastError: undefined },
      sidePanel,
    });

    const task = openPanelForTabFromUserGesture(21, 5);

    expect(order).toEqual(['setOptions', 'open']);
    expect(sidePanel.open).toHaveBeenCalledWith({ tabId: 21 });
    expect(sidePanel.setOptions).toHaveBeenCalledWith({
      path: 'src/extension/sidepanel/index.html',
      enabled: true,
    });
    expect(expectSidePanelPageToolBridgeReadyMock).toHaveBeenCalledWith(5);
    expect(waitForSidePanelPageToolLoadedMock).not.toHaveBeenCalled();
    expect(requestSidePanelPageToolBridgeReadyMock).not.toHaveBeenCalled();

    resolveSetOptions();
    await expect(task).resolves.toBeUndefined();
    expect(requestSidePanelPageToolBridgeReadyMock).toHaveBeenCalledWith(5);
    expect(waitForSidePanelPageToolLoadedMock).toHaveBeenCalledWith(5);
  });

  it('用户手势链路发现目标 bridge 已 loaded 时不重复触发 sidePanel.open', async () => {
    isSidePanelPageToolLoadedForOpenMock.mockReturnValueOnce(true);
    const sidePanel = {
      open: vi.fn(function (this: unknown) {
        if (this !== sidePanel) throw new TypeError('Illegal invocation');
        return Promise.resolve();
      }),
      setOptions: vi.fn(function (this: unknown) {
        if (this !== sidePanel) throw new TypeError('Illegal invocation');
        return Promise.resolve();
      }),
    };
    vi.stubGlobal('chrome', {
      runtime: { lastError: undefined },
      sidePanel,
    });

    await openPanelForTabFromUserGesture(21, 5);

    expect(expectSidePanelPageToolBridgeReadyMock).toHaveBeenCalledWith(5);
    expect(isSidePanelPageToolLoadedForOpenMock).toHaveBeenCalledWith(5);
    expect(sidePanel.open).not.toHaveBeenCalled();
    expect(sidePanel.setOptions).not.toHaveBeenCalled();
    expect(requestSidePanelPageToolBridgeReadyMock).not.toHaveBeenCalled();
    expect(waitForSidePanelPageToolLoadedMock).not.toHaveBeenCalled();
  });

  it('Firefox sidebarAction 返回 Promise 或抛错时都不会影响调用方', async () => {
    const open = vi.fn(() => Promise.resolve());
    vi.stubGlobal('chrome', {
      runtime: { lastError: undefined },
    });
    vi.stubGlobal('browser', {
      sidebarAction: { open },
    });

    await expect(openPanelForTab(10)).resolves.toBeUndefined();

    expect(open).toHaveBeenCalledTimes(1);
    expect(waitForSidePanelPageToolLoadedMock).toHaveBeenCalledWith();
  });

  it('Chromium action 交给浏览器 Side Panel owner 打开，不注册 action click listener', () => {
    const calls: Array<{ openPanelOnActionClick: boolean }> = [];
    const onClicked = {
      /** 模拟 Chrome Event 方法必须以事件对象作为 receiver 调用。 */
      addListener(this: unknown, _listener: (tab: { id?: number }) => void) {
        if (this !== onClicked) throw new TypeError('Illegal invocation');
      },
    };
    const addListenerSpy = vi.spyOn(onClicked, 'addListener');
    const sidePanel = {
      /** 模拟 Chromium Side Panel 方法也必须由 sidePanel 对象承载调用。 */
      setPanelBehavior(this: unknown, behavior: { openPanelOnActionClick: boolean }) {
        if (this !== sidePanel) throw new TypeError('Illegal invocation');
        calls.push(behavior);
        return Promise.resolve();
      },
    };
    vi.stubGlobal('chrome', {
      runtime: { lastError: undefined },
      sidePanel,
      action: { onClicked },
    });

    configureChromiumActionPanelBehavior('chromium');
    configureChromiumActionPanelBehavior('firefox');

    expect(calls).toEqual([{ openPanelOnActionClick: true }]);
    expect(addListenerSpy).not.toHaveBeenCalled();
  });

  it('页面工具会话关闭面板时使用 Monica 式全局禁用再恢复，不使用 sidePanel.close', async () => {
    const close = vi.fn(() => Promise.resolve());
    const sidePanel = {
      close,
      setOptions: vi.fn(function (this: unknown) {
        if (this !== sidePanel) throw new TypeError('Illegal invocation');
        return Promise.resolve();
      }),
    };
    vi.stubGlobal('chrome', {
      runtime: { lastError: undefined },
      sidePanel,
    });

    await closePanelForPageToolSession(18);

    expect(close).not.toHaveBeenCalled();
    expect(sidePanel.setOptions).toHaveBeenNthCalledWith(1, {
      path: 'src/extension/sidepanel/index.html',
      enabled: false,
    });
    expect(sidePanel.setOptions).toHaveBeenNthCalledWith(2, {
      path: 'src/extension/sidepanel/index.html',
      enabled: true,
    });
  });

  it('页面工具会话隐藏失败时会把结构性错误交给启动事务回滚', async () => {
    const sidePanel = {
      setOptions: vi.fn(function (this: unknown) {
        if (this !== sidePanel) throw new TypeError('Illegal invocation');
        return Promise.reject(new Error('side panel unavailable'));
      }),
    };
    vi.stubGlobal('chrome', {
      runtime: { lastError: undefined },
      sidePanel,
    });

    await expect(closePanelForPageToolSession(19)).rejects.toThrow('side panel unavailable');

    expect(sidePanel.setOptions).toHaveBeenNthCalledWith(1, {
      path: 'src/extension/sidepanel/index.html',
      enabled: false,
    });
  });

  it('Firefox action click handler 会复用主面板打开语义', () => {
    const listeners: Array<(tab: { id?: number }) => void> = [];
    const ensurePanel = vi.fn();
    const onClicked = {
      /** 模拟 Firefox Event 方法必须以事件对象作为 receiver 调用。 */
      addListener(this: unknown, listener: (tab: { id?: number }) => void) {
        if (this !== onClicked) throw new TypeError('Illegal invocation');
        listeners.push(listener);
      },
    };
    vi.stubGlobal('browser', {
      action: { onClicked },
    });

    installFirefoxActionClickHandler('chromium', ensurePanel);
    installFirefoxActionClickHandler('firefox', ensurePanel);
    listeners[0]?.({ id: 42 });

    expect(listeners).toHaveLength(1);
    expect(ensurePanel).toHaveBeenCalledWith(42);
  });
});
