/**
 * 说明：`runtime-api.spec` 扩展运行时访问模块测试。
 *
 * 职责：
 * - 验证共享扩展 contract 对 `sendMessage`、标签页查询与扩展页打开的 Promise 化行为；
 * - 守住“UI 不再各自拼 browser API 访问”之后的基础 helper 语义。
 *
 * 边界：
 * - 这里只测试 `runtime-api.ts` 的基础能力，不覆盖上层业务动作。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ChromeLastError = { message: string };

type RuntimeTabsOnUpdatedListener = Parameters<typeof chrome.tabs.onUpdated.addListener>[0];

/**
 * 在 mock 回调执行窗口内暴露 `runtime.lastError`。
 *
 * @param set - 设置当前 lastError 的函数。
 * @param error - 本次回调要暴露的错误。
 * @param fn - 实际执行逻辑。
 * @returns 原样返回回调执行结果。
 */
function withRuntimeLastError<T>(
  set: (error: ChromeLastError | undefined) => void,
  error: ChromeLastError | undefined,
  fn: () => T,
): T {
  set(error);
  try {
    return fn();
  } finally {
    set(undefined);
  }
}

describe('runtime-api', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('sendExtensionMessage 会把 one-shot sendMessage Promise 化', async () => {
    const sendMessage = vi.fn((message: unknown, callback: (response: unknown) => void) => {
      callback({ ok: true, payload: { echoed: true, message } });
    });

    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-extension',
        lastError: undefined,
        sendMessage,
      },
    });

    const { sendExtensionMessage } = await import('./runtime-api');
    const response = await sendExtensionMessage<{ ok: true; payload: { echoed: boolean; message: unknown } }>({
      type: 'sw/ping',
    });

    expect(sendMessage).toHaveBeenCalledWith({ type: 'sw/ping' }, expect.any(Function));
    expect(response).toEqual({
      ok: true,
      payload: {
        echoed: true,
        message: { type: 'sw/ping' },
      },
    });
  });

  it('sendExtensionMessage 在 runtime 不可用时抛错', async () => {
    vi.stubGlobal('chrome', {});

    const { sendExtensionMessage } = await import('./runtime-api');

    await expect(sendExtensionMessage({ type: 'sw/ping' })).rejects.toMatchObject({
      name: 'ExtensionRuntimeError',
      reason: 'runtime-unavailable',
      detail: 'chrome.runtime.sendMessage is unavailable',
    });
  });

  it('queryCurrentWindowActiveTab 会返回当前窗口第一个活动标签页', async () => {
    const query = vi.fn((queryInfo: chrome.tabs.QueryInfo, callback: (tabs: chrome.tabs.Tab[]) => void) => {
      callback([
        { id: 11, title: 'Active Tab', url: 'https://example.com' } as chrome.tabs.Tab,
        { id: 12, title: 'Second Tab', url: 'https://example.org' } as chrome.tabs.Tab,
      ]);
    });

    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-extension',
        lastError: undefined,
      },
      tabs: {
        query,
      },
    });

    const { queryCurrentWindowActiveTab } = await import('./runtime-api');
    const tab = await queryCurrentWindowActiveTab();

    expect(query).toHaveBeenCalledWith(
      { active: true, currentWindow: true },
      expect.any(Function),
    );
    expect(tab).toEqual({ id: 11, title: 'Active Tab', url: 'https://example.com' });
  });

  it('getExtensionTab 会安全返回指定标签页快照', async () => {
    const get = vi.fn((tabId: number, callback: (tab?: chrome.tabs.Tab) => void) => {
      callback({ id: tabId, title: 'Tab Detail', url: 'https://example.com/detail' } as chrome.tabs.Tab);
    });

    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-extension',
        lastError: undefined,
      },
      tabs: {
        get,
      },
    });

    const { getExtensionTab } = await import('./runtime-api');
    await expect(getExtensionTab(99)).resolves.toEqual({
      id: 99,
      title: 'Tab Detail',
      url: 'https://example.com/detail',
    });
    expect(get).toHaveBeenCalledWith(99, expect.any(Function));
  });

  it('sendExtensionTabMessage 会把缺少 host 权限归一成稳定错误原因', async () => {
    let lastError: ChromeLastError | undefined;
    /**
     * 在 mock 回调窗口内维护 `runtime.lastError`。
     *
     * @param error - 当前希望暴露给 callback 的浏览器错误。
     */
    const setLastError = (error: ChromeLastError | undefined) => { lastError = error; };
    const sendMessage = vi.fn((_tabId: number, _message: unknown, callback: (response?: unknown) => void) => {
      return withRuntimeLastError(
        setLastError,
        { message: 'Cannot access contents of the page. Extension manifest must request permission to access the respective host.' },
        () => callback(undefined),
      );
    });

    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-extension',
        /**
         * 模拟 Chrome 仅在 callback 执行期间可读的 `runtime.lastError`。
         */
        get lastError() { return lastError; },
      },
      tabs: {
        sendMessage,
      },
    });

    const { sendExtensionTabMessage } = await import('./runtime-api');
    await expect(sendExtensionTabMessage(7, { type: 'page/getMeta' })).rejects.toMatchObject({
      name: 'ExtensionTabMessageError',
      reason: 'page-access-unavailable',
      tabId: 7,
    });
  });

  it('sendExtensionTabMessage 可以把消息定向到指定 frame', async () => {
    const sendMessage = vi.fn((
      _tabId: number,
      _message: unknown,
      _options: chrome.tabs.MessageSendOptions,
      callback: (response?: unknown) => void,
    ) => {
      callback({ ok: true, frame: true });
    });

    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-extension',
        lastError: undefined,
      },
      tabs: {
        sendMessage,
      },
    });

    const { sendExtensionTabMessage } = await import('./runtime-api');
    await expect(sendExtensionTabMessage(7, { type: 'page/getMeta' }, { frameId: 12 })).resolves.toEqual({
      ok: true,
      frame: true,
    });
    expect(sendMessage).toHaveBeenCalledWith(7, { type: 'page/getMeta' }, { frameId: 12 }, expect.any(Function));
  });

  it('sendExtensionTabMessageWithRetry 会在内容脚本稍后就绪时成功返回', async () => {
    vi.useFakeTimers();
    let lastError: ChromeLastError | undefined;
    /**
     * 在 mock 回调窗口内维护 `runtime.lastError`。
     *
     * @param error - 当前希望暴露给 callback 的浏览器错误。
     */
    const setLastError = (error: ChromeLastError | undefined) => { lastError = error; };
    let attempts = 0;

    const sendMessage = vi.fn((_tabId: number, _message: unknown, callback: (response?: unknown) => void) => {
      attempts += 1;
      if (attempts < 3) {
        return withRuntimeLastError(
          setLastError,
          { message: 'Receiving end does not exist.' },
          () => callback(undefined),
        );
      }
      return withRuntimeLastError(setLastError, undefined, () => callback({ ok: true }));
    });

    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-extension',
        /**
         * 模拟 Chrome 仅在 callback 执行期间可读的 `runtime.lastError`。
         */
        get lastError() { return lastError; },
      },
      tabs: {
        sendMessage,
      },
    });

    const { sendExtensionTabMessageWithRetry } = await import('./runtime-api');
    const pending = sendExtensionTabMessageWithRetry<{ ok: boolean }>(
      7,
      { type: 'page/getMeta' },
      { maxAttempts: 4, delayMs: 50 },
    );

    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ ok: true });
    expect(sendMessage).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('sendExtensionTabMessageWithRetry 会在重试耗尽后抛出 content-script-unreachable', async () => {
    vi.useFakeTimers();
    let lastError: ChromeLastError | undefined;
    /**
     * 在 mock 回调窗口内维护 `runtime.lastError`。
     *
     * @param error - 当前希望暴露给 callback 的浏览器错误。
     */
    const setLastError = (error: ChromeLastError | undefined) => { lastError = error; };

    const sendMessage = vi.fn((_tabId: number, _message: unknown, callback: (response?: unknown) => void) => (
      withRuntimeLastError(
        setLastError,
        { message: 'Could not establish connection. Receiving end does not exist.' },
        () => callback(undefined),
      )
    ));

    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-extension',
        /**
         * 模拟 Chrome 仅在 callback 执行期间可读的 `runtime.lastError`。
         */
        get lastError() { return lastError; },
      },
      tabs: {
        sendMessage,
      },
    });

    const { sendExtensionTabMessageWithRetry } = await import('./runtime-api');
    const pending = sendExtensionTabMessageWithRetry(
      8,
      { type: 'page/getMeta' },
      { maxAttempts: 2, delayMs: 40 },
    );

    void pending.catch(() => undefined);
    await vi.runAllTimersAsync();
    await expect(pending).rejects.toMatchObject({
      name: 'ExtensionTabMessageError',
      reason: 'content-script-unreachable',
      tabId: 8,
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('openExtensionPageInTab 会通过 runtime.getURL 打开扩展页', async () => {
    const getURL = vi.fn((path: string) => `chrome-extension://test-extension/${path}`);
    const create = vi.fn((createProperties: chrome.tabs.CreateProperties, callback: (tab: chrome.tabs.Tab) => void) => {
      callback({
        id: 21,
        url: createProperties.url,
        active: createProperties.active,
      } as chrome.tabs.Tab);
    });

    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-extension',
        getURL,
        lastError: undefined,
      },
      tabs: {
        create,
      },
    });

    const { openExtensionPageInTab } = await import('./runtime-api');
    const tab = await openExtensionPageInTab('src/extension/sidepanel/index.html', { active: false });

    expect(getURL).toHaveBeenCalledWith('src/extension/sidepanel/index.html');
    expect(create).toHaveBeenCalledWith(
      {
        active: false,
        url: 'chrome-extension://test-extension/src/extension/sidepanel/index.html',
      },
      expect.any(Function),
    );
    expect(tab).toEqual({
      id: 21,
      url: 'chrome-extension://test-extension/src/extension/sidepanel/index.html',
      active: false,
    });
  });

  it('waitForExtensionTabComplete 会在目标标签页完成加载后 resolve true', async () => {
    vi.useFakeTimers();
    const listeners = new Set<RuntimeTabsOnUpdatedListener>();

    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-extension',
        lastError: undefined,
      },
      tabs: {
        onUpdated: {
          addListener: vi.fn((listener: RuntimeTabsOnUpdatedListener) => {
            listeners.add(listener);
          }),
          removeListener: vi.fn((listener: RuntimeTabsOnUpdatedListener) => {
            listeners.delete(listener);
          }),
        },
      },
    });

    const { waitForExtensionTabComplete } = await import('./runtime-api');
    const pending = waitForExtensionTabComplete(42, { timeoutMs: 1_000 });

    listeners.forEach((listener) => listener(42, { status: 'complete' }, { id: 42 } as chrome.tabs.Tab));
    await expect(pending).resolves.toBe(true);
    vi.useRealTimers();
  });

  it('executeExtensionTabScript 会返回首个脚本执行结果', async () => {
    const executeScript = vi.fn((options: unknown, callback: (results: Array<{ result: unknown }>) => void) => {
      callback([{ result: [{ title: 'result' }] }]);
    });

    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-extension',
        lastError: undefined,
      },
      scripting: {
        executeScript,
      },
    });

    const { executeExtensionTabScript } = await import('./runtime-api');
    const result = await executeExtensionTabScript({
      tabId: 9,
      func: (max: number) => [{ title: `result-${max}` }],
      args: [5] as [number],
    });

    expect(executeScript).toHaveBeenCalledWith(
      {
        target: { tabId: 9 },
        func: expect.any(Function),
        args: [5],
      },
      expect.any(Function),
    );
    expect(result).toEqual([{ title: 'result' }]);
  });

  it('identity helper 会清 token cache 并读取 profile email', async () => {
    const removeCachedAuthToken = vi.fn((details: { token: string }, callback: () => void) => callback());
    const getProfileUserInfo = vi.fn((callback: (info: { email?: string }) => void) => callback({ email: 'user@example.com' }));

    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-extension',
        lastError: undefined,
      },
      identity: {
        removeCachedAuthToken,
        getProfileUserInfo,
      },
    });

    const { readIdentityProfileEmail, removeCachedIdentityAuthToken } = await import('./runtime-api');
    await expect(removeCachedIdentityAuthToken('token-1')).resolves.toBe(true);
    await expect(readIdentityProfileEmail()).resolves.toBe('user@example.com');
    expect(removeCachedAuthToken).toHaveBeenCalledWith({ token: 'token-1' }, expect.any(Function));
    expect(getProfileUserInfo).toHaveBeenCalledWith(expect.any(Function));
  });
});
