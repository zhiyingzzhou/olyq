/**
 * 说明：technology-stack Service Worker 协调测试。
 *
 * 职责：
 * - 验证 UI 预热、弹窗打开和 browser-context collector 并发请求时共享前台快扫；
 * - 保证 delayed JS 与外链脚本 snippet 只在后台增强 pass 执行；
 * - 只使用模拟 content script / rule package，不访问真实网页或远程资源。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getTechnologyStackForTab,
  invalidateTechnologyStackForTab,
  noteTechnologyStackNavigationEpoch,
  resolveTechnologyStackForTab,
  warmTechnologyStackForTab,
} from './technology-stack';
import type { TechnologyPageSignals, TechnologyRule, TechnologyRulePackageSummary } from '@/lib/technology-stack/types';

const mocks = vi.hoisted(() => ({
  detectTechnologyStackWithRules: vi.fn(),
  ensureContentScriptReadyForTab: vi.fn(),
  getExtensionTab: vi.fn(),
  loadTechnologyRulePackage: vi.fn(),
  postVolatileToAllUi: vi.fn(),
  resolvePreferredBrowserContextTab: vi.fn(),
  sendExtensionTabMessage: vi.fn(),
}));

vi.mock('@/lib/technology-stack/detector', () => ({
  detectTechnologyStackWithRules: mocks.detectTechnologyStackWithRules,
}));

vi.mock('@/lib/technology-stack/rule-loader', () => ({
  loadTechnologyRulePackage: mocks.loadTechnologyRulePackage,
}));

vi.mock('@/lib/extension/runtime-api', () => ({
  getExtensionTab: mocks.getExtensionTab,
  sendExtensionTabMessage: mocks.sendExtensionTabMessage,
}));

vi.mock('@/lib/browser-context/tab-resolver', () => ({
  isBrowserContextCollectableUrl: (url: string) => url.startsWith('http'),
  resolvePreferredBrowserContextTab: mocks.resolvePreferredBrowserContextTab,
}));

vi.mock('./content-script-manager', () => ({
  ensureContentScriptReadyForTab: mocks.ensureContentScriptReadyForTab,
}));

vi.mock('./port-manager', () => ({
  postVolatileToAllUi: mocks.postVolatileToAllUi,
}));

/** 最小规则包摘要 fixture。 */
const rulePackageSummary: TechnologyRulePackageSummary = {
  total: 1,
  technologyCount: 1,
  categoryCount: 1,
  snapshotVersion: 'unit',
  source: 'local-fingerprint-snapshot',
  unsupportedSignals: ['dns', 'probe', 'certIssuer', 'robots'],
  updateChannel: 'extension-release',
};

/** 最小页面信号 fixture。 */
const pageSignals: TechnologyPageSignals = {
  title: 'Example',
  url: 'https://example.com/',
  extractedAt: 1,
  pageFingerprint: 'fingerprint',
  language: 'en-US',
  meta: {},
  scriptSrc: [],
  inlineScript: [],
  stylesheetHrefs: [],
  cssText: [],
  dom: {},
  text: '',
  html: '',
  js: {},
  localPatternMatches: [],
  localCandidateSlugs: [],
  scanCoverage: 'complete',
};

/** 构造可手动 resolve 的 Promise。 */
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

/** 读取发给 content script 的 delayed JS 标记。 */
function readDelayedJsFlags(): boolean[] {
  return mocks.sendExtensionTabMessage.mock.calls.map((call) => {
    const message = call[1] as { payload?: { delayedJs?: boolean } };
    return Boolean(message.payload?.delayedJs);
  });
}

describe('technology-stack background coordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('chrome', {
      cookies: {
        getAll: vi.fn((_query: unknown, callback: (cookies: unknown[]) => void) => callback([])),
      },
      runtime: {
        sendMessage: vi.fn((_message: unknown, callback?: () => void) => callback?.()),
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => 'window.React = { version: "18.3.1" };',
    })));
    invalidateTechnologyStackForTab(7);
    mocks.getExtensionTab.mockResolvedValue({ id: 7, url: 'https://example.com/', title: 'Example' });
    mocks.ensureContentScriptReadyForTab.mockResolvedValue({ ready: true });
    mocks.loadTechnologyRulePackage.mockResolvedValue({
      rules: [{ name: 'React', slug: 'react', categories: ['javascript-frameworks'] }] as TechnologyRule[],
      summary: rulePackageSummary,
    });
    mocks.detectTechnologyStackWithRules.mockReturnValue({
      technologies: [{
        name: 'React',
        slug: 'react',
        categories: ['javascript-frameworks'],
        confidence: 80,
        sources: ['js'],
        evidence: [],
        iconCandidates: [],
        iconFallback: 'R',
      }],
      scanCoverage: 'complete',
      durationMs: 1,
    });
  });

  afterEach(() => {
    invalidateTechnologyStackForTab(7);
    vi.unstubAllGlobals();
  });

  it('同一 tab/url 的普通并发请求只触发一次前台快扫，后台增强单独等待 delayed JS', async () => {
    const fastSignals = createDeferred<{ payload: TechnologyPageSignals }>();
    const enhancedSignals = createDeferred<{ payload: TechnologyPageSignals }>();
    mocks.sendExtensionTabMessage.mockImplementation((_tabId, message) => {
      const delayedJs = Boolean((message as { payload?: { delayedJs?: boolean } }).payload?.delayedJs);
      return delayedJs ? enhancedSignals.promise : fastSignals.promise;
    });

    const first = getTechnologyStackForTab({ tabId: 7 });
    const second = getTechnologyStackForTab({ tabId: 7 });

    await vi.waitFor(() => expect(mocks.sendExtensionTabMessage).toHaveBeenCalledTimes(1));
    expect(readDelayedJsFlags()).toEqual([false]);
    fastSignals.resolve({ payload: pageSignals });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBe(secondResult);
    expect(firstResult.technologies.map((tech) => tech.slug)).toEqual(['react']);
    expect(mocks.detectTechnologyStackWithRules).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(readDelayedJsFlags()).toEqual([false, true]));

    enhancedSignals.resolve({ payload: pageSignals });
    await vi.waitFor(() => expect(mocks.detectTechnologyStackWithRules).toHaveBeenCalledTimes(2));
  });

  it('page-ready 自动预热和弹窗请求共享同一前台快扫', async () => {
    const fastSignals = createDeferred<{ payload: TechnologyPageSignals }>();
    mocks.sendExtensionTabMessage.mockImplementation((_tabId, message) => {
      const delayedJs = Boolean((message as { payload?: { delayedJs?: boolean } }).payload?.delayedJs);
      return delayedJs ? new Promise(() => {}) : fastSignals.promise;
    });

    const warmed = warmTechnologyStackForTab({
      tabId: 7,
      url: 'https://example.com/',
      title: 'Example',
      reason: 'page-ready',
    });
    const requested = getTechnologyStackForTab({ tabId: 7 });

    await vi.waitFor(() => expect(readDelayedJsFlags()).toEqual([false]));
    fastSignals.resolve({ payload: pageSignals });
    const [warmResult, requestResult] = await Promise.all([warmed, requested]);

    expect(warmResult).toBe(requestResult);
    expect(mocks.detectTechnologyStackWithRules).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(readDelayedJsFlags()).toEqual([false, true]));
  });

  it('content script 就绪失败时保留稳定失败原因', async () => {
    mocks.ensureContentScriptReadyForTab.mockResolvedValueOnce({ ready: false, reason: 'bundle-missing' });

    const result = await getTechnologyStackForTab({ tabId: 7 });

    expect(result.status).toBe('error');
    expect(result.error).toBe('bundle-missing');
    expect(mocks.sendExtensionTabMessage).not.toHaveBeenCalled();
  });

  it('规则包读取失败时返回稳定错误码', async () => {
    mocks.loadTechnologyRulePackage.mockRejectedValueOnce(new Error('missing local rule package'));

    const result = await getTechnologyStackForTab({ tabId: 7 });

    expect(result.status).toBe('error');
    expect(result.error).toBe('rule-package-unavailable');
  });

  it('页面身份变化时返回 page-stale 稳定错误码', async () => {
    mocks.sendExtensionTabMessage.mockResolvedValueOnce({
      payload: {
        ...pageSignals,
        url: 'https://example.com/old',
      },
    });

    const result = await getTechnologyStackForTab({ tabId: 7 });

    expect(result.status).toBe('error');
    expect(result.error).toBe('page-stale');
  });

  it('前台快扫不 refetch 外链脚本，后台增强才执行 snippet 扫描并通知 UI', async () => {
    const enhancedSignals = createDeferred<{ payload: TechnologyPageSignals }>();
    const pageSignalsWithScript: TechnologyPageSignals = {
      ...pageSignals,
      scriptSrc: ['https://example.com/app.js'],
    };
    mocks.sendExtensionTabMessage.mockImplementation((_tabId, message) => {
      const delayedJs = Boolean((message as { payload?: { delayedJs?: boolean } }).payload?.delayedJs);
      return delayedJs ? enhancedSignals.promise : Promise.resolve({ payload: pageSignalsWithScript });
    });

    const result = await getTechnologyStackForTab({ tabId: 7 });

    expect(result.technologies.map((tech) => tech.slug)).toEqual(['react']);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(readDelayedJsFlags()).toEqual([false, true]);

    enhancedSignals.resolve({ payload: pageSignalsWithScript });

    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com/app.js',
      expect.objectContaining({ credentials: 'omit', cache: 'force-cache' }),
    ));
    await vi.waitFor(() => expect(mocks.postVolatileToAllUi).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'technology-stack/result-updated',
        payload: expect.objectContaining({
          pageKey: '7::https://example.com/::0',
          enhanced: true,
          result: expect.objectContaining({ tabId: 7, url: 'https://example.com/' }),
        }),
      }),
    ));
  });

  it('force 请求绕过普通 in-flight 合并，但前台仍不等待 delayed JS', async () => {
    const firstFastSignals = createDeferred<{ payload: TechnologyPageSignals }>();
    const forceFastSignals = createDeferred<{ payload: TechnologyPageSignals }>();
    let fastRequestCount = 0;
    mocks.sendExtensionTabMessage.mockImplementation((_tabId, message) => {
      const delayedJs = Boolean((message as { payload?: { delayedJs?: boolean } }).payload?.delayedJs);
      if (delayedJs) return new Promise(() => {});
      fastRequestCount += 1;
      return fastRequestCount === 1 ? firstFastSignals.promise : forceFastSignals.promise;
    });

    const normal = getTechnologyStackForTab({ tabId: 7 });
    await vi.waitFor(() => expect(readDelayedJsFlags()).toEqual([false]));
    const force = getTechnologyStackForTab({ tabId: 7, force: true });
    await vi.waitFor(() => expect(readDelayedJsFlags()).toEqual([false, false]));

    firstFastSignals.resolve({ payload: pageSignals });
    forceFastSignals.resolve({ payload: pageSignals });
    await Promise.all([normal, force]);

    expect(readDelayedJsFlags().filter((flag) => !flag)).toHaveLength(2);
    expect(mocks.detectTechnologyStackWithRules).toHaveBeenCalledTimes(1);
  });

  it('同一 tab/url/fingerprint 的后台增强会 coalesce', async () => {
    const enhancedSignals = createDeferred<{ payload: TechnologyPageSignals }>();
    mocks.sendExtensionTabMessage.mockImplementation((_tabId, message) => {
      const delayedJs = Boolean((message as { payload?: { delayedJs?: boolean } }).payload?.delayedJs);
      return delayedJs ? enhancedSignals.promise : Promise.resolve({ payload: pageSignals });
    });

    await getTechnologyStackForTab({ tabId: 7 });
    await getTechnologyStackForTab({ tabId: 7 });

    expect(readDelayedJsFlags().filter((flag) => flag)).toHaveLength(1);
  });

  it('enhanced 请求会等待后台增强完成后返回 enhanced meta', async () => {
    const enhancedSignals = createDeferred<{ payload: TechnologyPageSignals }>();
    mocks.sendExtensionTabMessage.mockImplementation((_tabId, message) => {
      const delayedJs = Boolean((message as { payload?: { delayedJs?: boolean } }).payload?.delayedJs);
      return delayedJs ? enhancedSignals.promise : Promise.resolve({ payload: pageSignals });
    });

    const pending = resolveTechnologyStackForTab({ tabId: 7, minPass: 'enhanced', waitMs: 1_000 });
    let settled = false;
    pending.then(() => {
      settled = true;
    }).catch(() => {
      settled = true;
    });

    await vi.waitFor(() => expect(readDelayedJsFlags()).toEqual([false, true]));
    await Promise.resolve();
    expect(settled).toBe(false);

    enhancedSignals.resolve({ payload: pageSignals });
    const resolution = await pending;

    expect(resolution.enhanced).toBe(true);
    expect(resolution.pageKey).toBe('7::https://example.com/::0');
  });

  it('enhanced 请求超时后返回 best-effort fast 结果', async () => {
    mocks.sendExtensionTabMessage.mockImplementation((_tabId, message) => {
      const delayedJs = Boolean((message as { payload?: { delayedJs?: boolean } }).payload?.delayedJs);
      return delayedJs ? new Promise(() => {}) : Promise.resolve({ payload: pageSignals });
    });

    const resolution = await resolveTechnologyStackForTab({ tabId: 7, minPass: 'enhanced', waitMs: 1 });

    expect(readDelayedJsFlags()).toEqual([false, true]);
    expect(resolution.result.technologies.map((tech) => tech.slug)).toEqual(['react']);
    expect(resolution.enhanced).toBe(false);
  });

  it('page-ready 自动预热会写入 latest cache，后续请求不再触发 content script full scan', async () => {
    mocks.sendExtensionTabMessage.mockImplementation((_tabId, message) => {
      const delayedJs = Boolean((message as { payload?: { delayedJs?: boolean } }).payload?.delayedJs);
      return delayedJs ? new Promise(() => {}) : Promise.resolve({ payload: pageSignals });
    });

    const warmed = await warmTechnologyStackForTab({
      tabId: 7,
      url: 'https://example.com/',
      title: 'Example',
      reason: 'page-ready',
    });

    expect(warmed?.technologies.map((tech) => tech.slug)).toEqual(['react']);
    expect(readDelayedJsFlags()).toEqual([false, true]);
    mocks.sendExtensionTabMessage.mockClear();

    const cached = await getTechnologyStackForTab({ tabId: 7 });

    expect(cached.technologies.map((tech) => tech.slug)).toEqual(['react']);
    expect(mocks.sendExtensionTabMessage).not.toHaveBeenCalled();
  });

  it('SPA page-ready URL 变化会推进 pageKey epoch 并广播新页面结果', async () => {
    const newPageSignals: TechnologyPageSignals = {
      ...pageSignals,
      url: 'https://example.com/spa',
      pageFingerprint: 'fingerprint-spa',
    };
    let fastRequestCount = 0;
    mocks.sendExtensionTabMessage.mockImplementation((_tabId, message) => {
      const delayedJs = Boolean((message as { payload?: { delayedJs?: boolean } }).payload?.delayedJs);
      if (delayedJs) return new Promise(() => {});
      fastRequestCount += 1;
      return Promise.resolve({ payload: fastRequestCount === 1 ? pageSignals : newPageSignals });
    });

    await warmTechnologyStackForTab({
      tabId: 7,
      url: 'https://example.com/',
      title: 'Example',
      reason: 'page-ready',
    });
    mocks.postVolatileToAllUi.mockClear();

    await warmTechnologyStackForTab({
      tabId: 7,
      url: 'https://example.com/spa',
      title: 'SPA',
      reason: 'page-ready',
    });

    expect(mocks.postVolatileToAllUi).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'technology-stack/result-updated',
        payload: expect.objectContaining({
          pageKey: '7::https://example.com/spa::1',
          enhanced: false,
          result: expect.objectContaining({ url: 'https://example.com/spa' }),
        }),
      }),
    );
  });

  it('navigation epoch 推进后旧 enhancement 晚到不会覆盖新页面结果', async () => {
    const oldEnhancedSignals = createDeferred<{ payload: TechnologyPageSignals }>();
    const newPageSignals: TechnologyPageSignals = {
      ...pageSignals,
      url: 'https://example.com/new',
      pageFingerprint: 'fingerprint-new',
    };
    let fastRequestCount = 0;
    mocks.sendExtensionTabMessage.mockImplementation((_tabId, message) => {
      const delayedJs = Boolean((message as { payload?: { delayedJs?: boolean } }).payload?.delayedJs);
      if (delayedJs) return fastRequestCount === 1 ? oldEnhancedSignals.promise : new Promise(() => {});
      fastRequestCount += 1;
      return Promise.resolve({ payload: fastRequestCount === 1 ? pageSignals : newPageSignals });
    });

    await warmTechnologyStackForTab({
      tabId: 7,
      url: 'https://example.com/',
      title: 'Example',
      reason: 'page-ready',
    });
    noteTechnologyStackNavigationEpoch(7, { clearNetwork: false, url: 'https://example.com/new' });
    mocks.getExtensionTab.mockResolvedValue({ id: 7, url: 'https://example.com/new', title: 'Example New' });
    await warmTechnologyStackForTab({
      tabId: 7,
      url: 'https://example.com/new',
      title: 'Example New',
      reason: 'page-ready',
    });
    mocks.postVolatileToAllUi.mockClear();

    oldEnhancedSignals.resolve({ payload: pageSignals });
    await Promise.resolve();

    expect(mocks.postVolatileToAllUi).not.toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          result: expect.objectContaining({ url: 'https://example.com/' }),
        }),
      }),
    );
  });
});
