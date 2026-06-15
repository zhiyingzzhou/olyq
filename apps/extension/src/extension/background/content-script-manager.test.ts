/**
 * 说明：`content-script-manager.test` 后台运行时模块。
 *
 * 职责：
 * - 覆盖静态 content script 注入模型下的状态读取与 tab 就绪握手；
 * - 确认 browser-context 仍不按需注入，同时 page tools 用户手势链路可显式补注入；
 * - 守住内部页、缺少 manifest 静态声明和内容脚本不可达的稳定原因码。
 *
 * 边界：
 * - 本文件只验证 `content-script-manager` 自身的运行时 contract；
 * - `runtime-api` 的 tabs/message 错误分类由独立测试覆盖。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getExtensionTabMock,
  sendExtensionTabMessageWithRetryMock,
} = vi.hoisted(() => ({
  getExtensionTabMock: vi.fn(),
  sendExtensionTabMessageWithRetryMock: vi.fn(),
}));

vi.mock('@/lib/extension/runtime-api', () => ({
  getExtensionTab: getExtensionTabMock,
  isExtensionTabMessageError: vi.fn(() => false),
  sendExtensionTabMessageWithRetry: sendExtensionTabMessageWithRetryMock,
}));

type ChromeRuntimeMock = {
  runtime: {
    lastError?: { message?: string } | null;
    getManifest: () => {
      content_scripts?: Array<{
        matches?: string[];
        js?: string[];
      }>;
    };
    getURL: (path: string) => string;
  };
  scripting?: {
    registerContentScripts?: (...args: unknown[]) => void;
    executeScript?: (...args: unknown[]) => void;
  };
};

/** 安装测试用的最小 Chrome runtime mock。 */
function installChromeRuntimeMock(
  manifest: ReturnType<ChromeRuntimeMock['runtime']['getManifest']>,
  options: { loaderText?: string; fetchOk?: boolean; fetchStatus?: number } = {},
) {
  const registerContentScripts = vi.fn();
  const scripting = {
    registerContentScripts,
    executeScript: vi.fn(function (this: unknown, ...args: unknown[]) {
      if (this !== scripting) throw new TypeError('Illegal invocation');
      const callback = args[1];
      if (typeof callback === 'function') callback();
    }),
  };
  const loaderText = options.loaderText
    ?? 'const { onExecute } = await import(chrome.runtime.getURL("assets/content-script-main.js")); onExecute?.();';
  const fetchMock = vi.fn(async () => ({
    ok: options.fetchOk !== false,
    status: options.fetchStatus ?? (options.fetchOk === false ? 404 : 200),
    text: async () => loaderText,
  }));
  vi.stubGlobal('fetch', fetchMock);
  (globalThis as { chrome?: ChromeRuntimeMock }).chrome = {
    runtime: {
      lastError: null,
      getManifest: () => manifest,
      getURL: (path: string) => `chrome-extension://olyq/${path}`,
    },
    scripting,
  };
  return { registerContentScripts, executeScript: scripting.executeScript, fetchMock };
}

/** 删除测试挂载的扩展 API。 */
function unsetChromeRuntimeMock() {
  delete (globalThis as { chrome?: ChromeRuntimeMock }).chrome;
}

describe('content-script-manager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    unsetChromeRuntimeMock();
    getExtensionTabMock.mockResolvedValue({
      id: 11,
      url: 'https://example.com/article',
    });
    sendExtensionTabMessageWithRetryMock.mockResolvedValue({
      title: 'Example',
      url: 'https://example.com/article',
    });
  });

  it('静态 manifest 下状态固定为 static，并只暴露 http/https 安装期匹配', async () => {
    installChromeRuntimeMock({
      content_scripts: [{
        matches: ['http://*/*', 'https://*/*'],
        js: ['assets/content-script.js'],
      }],
    });

    const mod = await import('./content-script-manager');

    await expect(mod.getContentScriptStatus()).resolves.toMatchObject({
      enabled: true,
      registrationMethod: 'static',
      declaredHostMatches: ['http://*/*', 'https://*/*'],
      registered: true,
      bundledJs: ['assets/content-script.js'],
      lastRegistrationError: null,
    });
  });

  it('ensureContentScriptRegistration 和 setContentScriptEnabled 在静态模型下都是 no-op', async () => {
    const { registerContentScripts } = installChromeRuntimeMock({
      content_scripts: [{
        matches: ['http://*/*', 'https://*/*'],
        js: ['assets/content-script.js'],
      }],
    });

    const mod = await import('./content-script-manager');
    await expect(mod.ensureContentScriptRegistration('test')).resolves.toBeUndefined();
    await expect(mod.setContentScriptEnabled(false)).resolves.toBeUndefined();

    expect(registerContentScripts).not.toHaveBeenCalled();
  });

  it('普通 http/https 页面握手成功时返回 ready，并明确不会按需注入', async () => {
    installChromeRuntimeMock({
      content_scripts: [{
        matches: ['http://*/*', 'https://*/*'],
        js: ['assets/content-script.js'],
      }],
    });

    const mod = await import('./content-script-manager');

    await expect(mod.ensureContentScriptReadyForTab(11)).resolves.toEqual({
      ready: true,
      injected: false,
    });
    expect(sendExtensionTabMessageWithRetryMock).toHaveBeenCalledWith(
      11,
      { type: 'page/getMeta' },
      { maxAttempts: 10, delayMs: 80 },
    );
  });

  it('内部页、扩展页、about 和 file 页面固定返回 page-uncollectable', async () => {
    installChromeRuntimeMock({
      content_scripts: [{
        matches: ['http://*/*', 'https://*/*'],
        js: ['assets/content-script.js'],
      }],
    });
    getExtensionTabMock.mockResolvedValue({
      id: 12,
      url: 'chrome://extensions',
    });

    const mod = await import('./content-script-manager');

    await expect(mod.ensureContentScriptReadyForTab(12)).resolves.toEqual({
      ready: false,
      reason: 'page-uncollectable',
      phase: 'preflight',
    });
    expect(sendExtensionTabMessageWithRetryMock).not.toHaveBeenCalled();
  });

  it('manifest 缺少静态 http/https content script 时返回 bundle-missing', async () => {
    installChromeRuntimeMock({
      content_scripts: [{
        matches: ['https://example.com/*'],
        js: ['assets/content-script.js'],
      }],
    });

    const mod = await import('./content-script-manager');

    await expect(mod.ensureContentScriptReadyForTab(11)).resolves.toEqual({
      ready: false,
      reason: 'bundle-missing',
      phase: 'manifest',
      detail: 'manifest is missing static http/https content script bundle',
    });
  });

  it('tab 不存在时返回 tab-unavailable', async () => {
    installChromeRuntimeMock({
      content_scripts: [{
        matches: ['http://*/*', 'https://*/*'],
        js: ['assets/content-script.js'],
      }],
    });
    getExtensionTabMock.mockResolvedValue(null);

    const mod = await import('./content-script-manager');

    await expect(mod.ensureContentScriptReadyForTab(99)).resolves.toEqual({
      ready: false,
      reason: 'tab-unavailable',
      phase: 'preflight',
    });
  });

  it('内容脚本握手失败时返回 content-script-unreachable，不回退 executeScript 补注入', async () => {
    const { executeScript } = installChromeRuntimeMock({
      content_scripts: [{
        matches: ['http://*/*', 'https://*/*'],
        js: ['assets/content-script.js'],
      }],
    });
    sendExtensionTabMessageWithRetryMock.mockRejectedValue(new Error('Receiving end does not exist.'));

    const mod = await import('./content-script-manager');

    await expect(mod.ensureContentScriptReadyForTab(11)).resolves.toEqual({
      ready: false,
      reason: 'content-script-unreachable',
      phase: 'initial-handshake',
      detail: 'Receiving end does not exist.',
    });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('page tools 旧标签页握手失败时会解析 CRXJS loader、导入主 bundle 并重新握手', async () => {
    const { executeScript } = installChromeRuntimeMock({
      content_scripts: [{
        matches: ['http://*/*', 'https://*/*'],
        js: ['assets/content-script-loader.js'],
      }],
    });
    sendExtensionTabMessageWithRetryMock
      .mockRejectedValueOnce(new Error('Receiving end does not exist.'))
      .mockResolvedValueOnce({ title: 'Example', url: 'https://example.com/article' });

    const mod = await import('./content-script-manager');

    await expect(mod.ensurePageToolContentScriptReadyForTab(11)).resolves.toEqual({
      ready: true,
      injected: true,
    });
    expect(executeScript).toHaveBeenCalledWith(
      {
        target: { tabId: 11 },
        func: expect.any(Function),
        args: ['chrome-extension://olyq/assets/content-script-main.js'],
      },
      expect.any(Function),
    );
  });

  it('page tools 补注入失败时返回 content-script-injection-failed', async () => {
    const { executeScript } = installChromeRuntimeMock({
      content_scripts: [{
        matches: ['http://*/*', 'https://*/*'],
        js: ['assets/content-script-loader.js'],
      }],
    });
    executeScript.mockImplementationOnce(() => {
      throw new Error('Cannot access contents of url');
    });
    sendExtensionTabMessageWithRetryMock.mockRejectedValue(new Error('Receiving end does not exist.'));

    const mod = await import('./content-script-manager');

    await expect(mod.ensurePageToolContentScriptReadyForTab(11)).resolves.toEqual({
      ready: false,
      reason: 'content-script-injection-failed',
      phase: 'injection',
      detail: 'Cannot access contents of url',
    });
  });

  it('page tools loader 无法解析主 bundle 时保留 injection 阶段诊断', async () => {
    installChromeRuntimeMock({
      content_scripts: [{
        matches: ['http://*/*', 'https://*/*'],
        js: ['assets/content-script-loader.js'],
      }],
    }, {
      loaderText: 'console.error("stale content script loader")',
    });
    sendExtensionTabMessageWithRetryMock.mockRejectedValue(new Error('Receiving end does not exist.'));

    const mod = await import('./content-script-manager');

    await expect(mod.ensurePageToolContentScriptReadyForTab(11)).resolves.toEqual({
      ready: false,
      reason: 'content-script-injection-failed',
      phase: 'injection',
      detail: 'manifest content script loader does not reference a CRXJS main bundle',
    });
  });

  it('page tools 主 bundle 导入失败时返回浏览器原始 detail', async () => {
    const { executeScript } = installChromeRuntimeMock({
      content_scripts: [{
        matches: ['http://*/*', 'https://*/*'],
        js: ['assets/content-script-loader.js'],
      }],
    });
    executeScript.mockImplementationOnce(() => Promise.reject(new Error('failed to import content script main bundle')));
    sendExtensionTabMessageWithRetryMock.mockRejectedValue(new Error('Receiving end does not exist.'));

    const mod = await import('./content-script-manager');

    await expect(mod.ensurePageToolContentScriptReadyForTab(11)).resolves.toEqual({
      ready: false,
      reason: 'content-script-injection-failed',
      phase: 'injection',
      detail: 'failed to import content script main bundle',
    });
  });

  it('page tools 不会把 loader executeScript 成功误判为主 bundle ready', async () => {
    installChromeRuntimeMock({
      content_scripts: [{
        matches: ['http://*/*', 'https://*/*'],
        js: ['assets/content-script-loader.js'],
      }],
    });
    sendExtensionTabMessageWithRetryMock
      .mockRejectedValueOnce(new Error('Receiving end does not exist.'))
      .mockRejectedValueOnce(new Error('loader imported bundle but listener is not ready'));

    const mod = await import('./content-script-manager');

    await expect(mod.ensurePageToolContentScriptReadyForTab(11)).resolves.toEqual({
      ready: false,
      reason: 'content-script-unreachable',
      phase: 'post-injection-handshake',
      detail: 'loader imported bundle but listener is not ready',
    });
  });
});
