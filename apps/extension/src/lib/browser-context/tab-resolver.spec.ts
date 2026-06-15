/**
 * 说明：`tab-resolver.spec` 浏览器上下文标签页解析测试。
 *
 * 职责：
 * - 守住扩展页独立窗口会回退到最近活跃网页 tab；
 * - 守住浏览器内部页不会错误挟持其他网页上下文；
 * - 验证共享 helper 能同时服务 UI 与 SW 两侧调用。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isBrowserContextCollectableUrl,
  pickPreferredBrowserContextTab,
  resolvePreferredBrowserContextTab,
} from './tab-resolver';

describe('browser-context tab resolver', () => {
  beforeEach(() => {
    const tabsQueryMock = vi.fn((queryInfo: chrome.tabs.QueryInfo, callback: (tabs: chrome.tabs.Tab[]) => void) => {
      if (queryInfo.currentWindow) {
        callback([{
          id: 99,
          title: 'Olyq',
          url: 'chrome-extension://test-extension-id/src/extension/sidepanel/index.html',
          lastAccessed: 300,
        } as chrome.tabs.Tab]);
        return;
      }
      callback([
        {
          id: 99,
          title: 'Olyq',
          url: 'chrome-extension://test-extension-id/src/extension/sidepanel/index.html',
          lastAccessed: 300,
        } as chrome.tabs.Tab,
        {
          id: 7,
          title: 'Tailwind Docs',
          url: 'https://tailwindcss.com/docs/styling-with-utility-classes',
          lastAccessed: 280,
        } as chrome.tabs.Tab,
        {
          id: 8,
          title: 'Example',
          url: 'https://example.com/',
          lastAccessed: 120,
        } as chrome.tabs.Tab,
      ]);
    });
    const tabsGetMock = vi.fn((tabId: number, callback: (tab?: chrome.tabs.Tab) => void) => {
      if (tabId === 99) {
        callback({
          id: 99,
          title: 'Olyq',
          url: 'chrome-extension://test-extension-id/src/extension/sidepanel/index.html',
          lastAccessed: 300,
        } as chrome.tabs.Tab);
        return;
      }
      if (tabId === 17) {
        callback({
          id: 17,
          title: 'Chrome Settings',
          url: 'chrome://settings/',
          lastAccessed: 310,
        } as chrome.tabs.Tab);
        return;
      }
      callback({
        id: 7,
        title: 'Tailwind Docs',
        url: 'https://tailwindcss.com/docs/styling-with-utility-classes',
        lastAccessed: 280,
      } as chrome.tabs.Tab);
    });

    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path = '') => `chrome-extension://test-extension-id/${path}`,
        lastError: null,
      },
      tabs: {
        query: tabsQueryMock,
        get: tabsGetMock,
      },
    } as unknown as typeof chrome);
  });

  it('会识别普通网页可采集，扩展页不可采集', () => {
    expect(isBrowserContextCollectableUrl('https://example.com')).toBe(true);
    expect(isBrowserContextCollectableUrl('chrome-extension://test-extension-id/page.html')).toBe(false);
  });

  it('当前窗口是扩展页时，会回退到最近活跃的普通网页 tab', async () => {
    const tab = await resolvePreferredBrowserContextTab();
    expect(tab?.id).toBe(7);
    expect(tab?.url).toContain('tailwindcss.com');
  });

  it('显式 tab 是浏览器内部页时，不会错误回退到其他网页', async () => {
    const tab = await resolvePreferredBrowserContextTab(17);
    expect(tab).toBeNull();
  });

  it('主候选是扩展页时，会选中最近活跃的网页回退候选', () => {
    const resolved = pickPreferredBrowserContextTab({
      primaryTab: {
        id: 11,
        url: 'chrome-extension://test-extension-id/src/extension/sidepanel/index.html',
        lastAccessed: 200,
      } as chrome.tabs.Tab,
      fallbackTabs: [
        {
          id: 12,
          url: 'https://example.com/a',
          lastAccessed: 100,
        } as chrome.tabs.Tab,
        {
          id: 13,
          url: 'https://example.com/b',
          lastAccessed: 160,
        } as chrome.tabs.Tab,
      ],
    });

    expect(resolved?.id).toBe(13);
  });
});
