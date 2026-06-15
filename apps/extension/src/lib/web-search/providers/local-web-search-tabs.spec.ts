/**
 * 说明：`local-web-search-tabs.spec` 基础能力模块测试。
 *
 * 职责：
 * - 验证本地 Web Search provider 共享标签页编排会复用 extension contract；
 * - 守住“Google / Bing / 百度都后台打开临时标签页、所有本地 provider 最终都关闭临时标签页”的边界语义。
 *
 * 边界：
 * - 这里只测试临时标签页工作流，不覆盖站点 DOM 抽取细节。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeApiMocks = vi.hoisted(() => ({
  hasExtensionTabScriptingRuntime: vi.fn(),
  queryCurrentWindowActiveTab: vi.fn(),
  createExtensionTab: vi.fn(),
  waitForExtensionTabComplete: vi.fn(),
  updateExtensionTab: vi.fn(),
  executeExtensionTabScript: vi.fn(),
  removeExtensionTab: vi.fn(),
}));

vi.mock('@/lib/extension/runtime-api', () => runtimeApiMocks);

describe('local-web-search-tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeApiMocks.hasExtensionTabScriptingRuntime.mockReturnValue(true);
    runtimeApiMocks.queryCurrentWindowActiveTab.mockResolvedValue({ id: 7 });
    runtimeApiMocks.createExtensionTab.mockResolvedValue({ id: 11 });
    runtimeApiMocks.waitForExtensionTabComplete.mockResolvedValue(true);
    runtimeApiMocks.updateExtensionTab.mockResolvedValue({ id: 7, active: true });
    runtimeApiMocks.executeExtensionTabScript.mockResolvedValue([{ title: 'one', url: 'https://example.com', snippet: '' }]);
    runtimeApiMocks.removeExtensionTab.mockResolvedValue(true);
  });

  it('三个本地 provider 都以后台临时标签页打开搜索页', async () => {
    const { createLocalGoogleProvider } = await import('./local-google');
    const { createLocalBingProvider } = await import('./local-bing');
    const { createLocalBaiduProvider } = await import('./local-baidu');

    const providers = [
      {
        provider: createLocalGoogleProvider(),
        expectedUrl: 'https://www.google.com/search?q=olyq&num=7',
      },
      {
        provider: createLocalBingProvider(),
        expectedUrl: 'https://cn.bing.com/search?q=olyq&ensearch=1',
      },
      {
        provider: createLocalBaiduProvider(),
        expectedUrl: 'https://www.baidu.com/s?wd=olyq',
      },
    ];

    for (const item of providers) {
      const results = await item.provider.search('olyq', { maxResults: 5 });

      expect(runtimeApiMocks.createExtensionTab).toHaveBeenLastCalledWith({
        url: item.expectedUrl,
        active: false,
      });
      expect(runtimeApiMocks.waitForExtensionTabComplete).toHaveBeenLastCalledWith(11, { timeoutMs: 10_000 });
      expect(runtimeApiMocks.removeExtensionTab).toHaveBeenLastCalledWith(11);
      expect(results).toEqual([{ title: 'one', url: 'https://example.com', snippet: '' }]);
    }

    expect(runtimeApiMocks.queryCurrentWindowActiveTab).not.toHaveBeenCalled();
    expect(runtimeApiMocks.updateExtensionTab).not.toHaveBeenCalled();
    expect(runtimeApiMocks.createExtensionTab).toHaveBeenCalledTimes(3);
  });

  it('执行失败时仍会关闭临时标签页', async () => {
    const { runLocalWebSearchInTemporaryTab } = await import('./local-web-search-tabs');
    runtimeApiMocks.executeExtensionTabScript.mockRejectedValueOnce(new Error('boom'));

    await expect(runLocalWebSearchInTemporaryTab({
      provider: 'Bing',
      searchUrl: 'https://cn.bing.com/search?q=olyq',
      active: false,
      extractor: (max: number) => [{ title: `result-${max}`, url: 'https://example.com', snippet: '' }],
      args: [3] as [number],
    })).rejects.toThrow('boom');

    expect(runtimeApiMocks.removeExtensionTab).toHaveBeenCalledWith(11);
  });

  it('会清理 searchWithTime 注入的日期前缀', async () => {
    const { normalizeLocalWebSearchQuery } = await import('./local-web-search-tabs');

    expect(normalizeLocalWebSearchQuery('today is 2026-04-09\r\nolyq browser extension')).toBe(
      'olyq browser extension',
    );
    expect(normalizeLocalWebSearchQuery('plain query')).toBe('plain query');
  });
});
