/**
 * 说明：technology-stack content script 采集器测试。
 *
 * 职责：
 * - 覆盖 DOM property 对象存在性与 page-world JS 对象信号；
 * - 确认 content script 不再把对象存在性信号丢成未命中；
 * - 通过本地模拟 bridge 验证消息边界，不加载远程代码或真实扩展资源。
 */
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  collectTechnologyPageSignals,
  resetTechnologyStackContentScriptRuntimeForTesting,
} from './technology-stack';
import {
  installTechnologyStackPageReadyReporter,
  resetTechnologyStackPageReadyReporterForTesting,
} from './technology-stack-page-ready';
import type { TechnologyPageScanPlan } from '@/lib/technology-stack/types';

const BRIDGE_REQUEST_TYPE = 'olyq:technology-stack:js-signals:request';
const BRIDGE_RESPONSE_TYPE = 'olyq:technology-stack:js-signals:response';

/** 构造最小页面扫描计划。 */
function createScanPlan(overrides: Partial<TechnologyPageScanPlan> = {}): TechnologyPageScanPlan {
  return {
    mode: 'full',
    version: 'unit',
    domSelectors: [],
    jsChains: [],
    quickPatterns: [],
    pagePatterns: [],
    ...overrides,
  };
}

/**
 * 安装模拟 page-world bridge。
 *
 * @param resolveSignals - 根据请求 chain 返回 bridge signals。
 * @returns 移除监听器的函数。
 */
function installBridgeResponder(
  resolveSignals: (chains: string[]) => Record<string, boolean | string | number>,
): () => void {
  /** 接收 isolated world 发出的 bridge 请求，并同步派发模拟 page-world 响应。 */
  const listener = (event: MessageEvent) => {
    const data = event.data as { type?: unknown; requestId?: unknown; chains?: unknown } | null;
    if (!data || data.type !== BRIDGE_REQUEST_TYPE) return;
    const chains = Array.isArray(data.chains) ? data.chains.map(String) : [];
    window.dispatchEvent(new MessageEvent('message', {
      source: window,
      data: {
        type: BRIDGE_RESPONSE_TYPE,
        requestId: data.requestId,
        signals: resolveSignals(chains),
      },
    }));
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

describe('technology-stack content script collector', () => {
  const cleanup: Array<() => void> = [];

  beforeEach(() => {
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (resource: string) => `chrome-extension://olyq/${resource}`,
        sendMessage: vi.fn((_message: unknown, callback?: () => void) => callback?.()),
      },
    });
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  afterEach(() => {
    for (const remove of cleanup.splice(0)) remove();
    document.getElementById('__olyq_technology_stack_bridge__')?.remove();
    resetTechnologyStackContentScriptRuntimeForTesting();
    resetTechnologyStackPageReadyReporterForTesting();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('DOM property 为对象时按存在性 boolean 回传', async () => {
    const root = document.createElement('div');
    Object.defineProperty(root, '_reactRootContainer', {
      value: { mounted: true },
      configurable: true,
    });
    document.body.append(root);
    cleanup.push(installBridgeResponder(() => ({})));

    const signals = await collectTechnologyPageSignals(createScanPlan({
      domSelectors: ['body > div::prop::_reactRootContainer'],
    }));

    expect(signals.dom['body > div::prop::_reactRootContainer']).toBe(true);
  });

  it('page-world JS 对象 chain 会以 boolean 信号进入结果', async () => {
    cleanup.push(installBridgeResponder((chains) => {
      const signals: Record<string, boolean | string | number> = {};
      if (chains.includes('_ethers')) signals._ethers = true;
      return signals;
    }));

    const signals = await collectTechnologyPageSignals(createScanPlan({
      jsChains: ['_ethers'],
    }));

    expect(signals.js._ethers).toBe(true);
  });

  it('缺失的 page-world JS chain 不会生成 false 信号', async () => {
    cleanup.push(installBridgeResponder(() => ({})));

    const signals = await collectTechnologyPageSignals(createScanPlan({
      jsChains: ['MissingTech'],
    }));

    expect('MissingTech' in signals.js).toBe(false);
  });

  it('page-world JS 的 false 和 0 是已存在值', async () => {
    cleanup.push(installBridgeResponder((chains) => {
      const signals: Record<string, boolean | string | number> = {};
      if (chains.includes('Feature.disabled')) signals['Feature.disabled'] = false;
      if (chains.includes('Feature.count')) signals['Feature.count'] = 0;
      return signals;
    }));

    const signals = await collectTechnologyPageSignals(createScanPlan({
      jsChains: ['Feature.disabled', 'Feature.count'],
    }));

    expect(signals.js['Feature.disabled']).toBe(false);
    expect(signals.js['Feature.count']).toBe(0);
  });

  it('DOM class 扫描会聚合非首个节点的命中值', async () => {
    document.body.innerHTML = '<div class="plain"></div><section class="flex min-h-screen bg-slate-950"></section>';
    cleanup.push(installBridgeResponder(() => ({})));

    const signals = await collectTechnologyPageSignals(createScanPlan({
      domSelectors: ['body [class]::class'],
    }));

    expect(signals.dom['body [class]::class']).toContain('bg-slate-950');
  });

  it('delayed JS pass 能补检异步挂载的 page-world chain', async () => {
    const originalSetTimeout = window.setTimeout.bind(window);
    vi.spyOn(window, 'setTimeout').mockImplementation(((handler: TimerHandler, timeout?: number, ...args: unknown[]) => (
      originalSetTimeout(handler, timeout === 5_000 ? 0 : timeout, ...args)
    )) as typeof window.setTimeout);
    let requestCount = 0;
    cleanup.push(installBridgeResponder((chains) => {
      requestCount += 1;
      const signals: Record<string, boolean | string | number> = {};
      if (requestCount > 1 && chains.includes('moment.version')) signals['moment.version'] = '2.24.0';
      return signals;
    }));

    const signals = await collectTechnologyPageSignals(createScanPlan({
      jsChains: ['moment.version'],
    }), { delayedJs: true });

    expect(requestCount).toBeGreaterThanOrEqual(2);
    expect(signals.js['moment.version']).toBe('2.24.0');
  });

  it('页面 ready 后会自动上报 SW 预热技术栈', async () => {
    vi.useFakeTimers();

    installTechnologyStackPageReadyReporter();
    await vi.advanceTimersByTimeAsync(250);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'technology-stack/page-ready',
        payload: expect.objectContaining({
          url: location.href,
          title: document.title,
        }),
      }),
      expect.any(Function),
    );
  });

  it('SPA 路由变化会 debounce 后重新上报 page-ready', async () => {
    vi.useFakeTimers();
    installTechnologyStackPageReadyReporter();
    await vi.advanceTimersByTimeAsync(250);
    vi.mocked(chrome.runtime.sendMessage).mockClear();

    history.pushState({}, '', '/technology-stack-spa');
    await vi.advanceTimersByTimeAsync(250);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'technology-stack/page-ready',
        payload: expect.objectContaining({
          url: expect.stringContaining('/technology-stack-spa'),
        }),
      }),
      expect.any(Function),
    );
  });

  it('delayed JS pass 会复用首次 fast pass 的页面信号', async () => {
    const originalSetTimeout = window.setTimeout.bind(window);
    vi.spyOn(window, 'setTimeout').mockImplementation(((handler: TimerHandler, timeout?: number, ...args: unknown[]) => (
      originalSetTimeout(handler, timeout === 5_000 ? 0 : timeout, ...args)
    )) as typeof window.setTimeout);
    document.body.innerHTML = '<main><div id="app" data-reactroot="">React App</div></main>';
    cleanup.push(installBridgeResponder(() => ({})));
    const fastSignals = await collectTechnologyPageSignals(createScanPlan({
      domSelectors: ['[data-reactroot]'],
    }));
    document.body.innerHTML = '<main></main>';

    const delayedSignals = await collectTechnologyPageSignals(createScanPlan({
      domSelectors: ['[data-reactroot]'],
    }), { delayedJs: true });

    expect(fastSignals.dom['[data-reactroot]']).toBe(true);
    expect(delayedSignals.dom['[data-reactroot]']).toBe(true);
  });
});
