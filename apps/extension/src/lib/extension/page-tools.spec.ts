/**
 * 说明：`page-tools.spec` 扩展网页工具配置测试。
 *
 * 职责：
 * - 锁住 page-tools 单一共享配置真源；
 * - 验证全局开关与站点级禁用列表的优先级；
 * - 防止页面内隐藏入口以后绕过 `shared-json-config-channel` 自造状态。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonStorageMock } from '@/test/json-storage-mock';

const PAGE_TOOLS_TEST_STORAGE_KEY = 'olyq.page-tools.v1';

vi.mock('@/lib/storage/json-storage', async () => {
  const { createJsonStorageMockModule } = await import('@/test/json-storage-mock');
  return createJsonStorageMockModule();
});

describe('page-tools settings', () => {
  beforeEach(() => {
    vi.resetModules();
    jsonStorageMock.reset();
  });

  it('默认启用网页工具且站点禁用列表为空', async () => {
    const { loadPageToolsSettings, isPageToolsEnabledForUrl } = await import('./page-tools');

    await expect(loadPageToolsSettings()).resolves.toEqual({
      enabled: true,
      disabledSiteOrigins: [],
    });
    await expect(isPageToolsEnabledForUrl('https://example.com/page')).resolves.toBe(true);
  });

  it('按精确 http/https origin 归一化站点禁用列表', async () => {
    jsonStorageMock.setStoredValue(PAGE_TOOLS_TEST_STORAGE_KEY, {
      enabled: true,
      disabledSiteOrigins: [
        'https://example.com/path',
        'https://example.com/other',
        'http://example.com',
        'chrome://settings',
        '',
      ],
    });
    const { loadPageToolsSettings, normalizePageToolsSiteOrigin } = await import('./page-tools');

    expect(normalizePageToolsSiteOrigin('https://example.com/a?b=1')).toBe('https://example.com');
    expect(normalizePageToolsSiteOrigin('http://example.com/')).toBe('http://example.com');
    expect(normalizePageToolsSiteOrigin('chrome://extensions')).toBeNull();
    await expect(loadPageToolsSettings()).resolves.toEqual({
      enabled: true,
      disabledSiteOrigins: ['http://example.com', 'https://example.com'],
    });
  });

  it('支持禁用和恢复当前网站', async () => {
    const {
      disablePageToolsForSite,
      enablePageToolsForSite,
      isPageToolsEnabledForUrl,
      loadPageToolsSettings,
    } = await import('./page-tools');

    await disablePageToolsForSite('https://example.com/docs/a');
    await expect(isPageToolsEnabledForUrl('https://example.com/other')).resolves.toBe(false);
    await expect(isPageToolsEnabledForUrl('https://sub.example.com/other')).resolves.toBe(true);

    await enablePageToolsForSite('https://example.com/any');
    await expect(isPageToolsEnabledForUrl('https://example.com/other')).resolves.toBe(true);
    await expect(loadPageToolsSettings()).resolves.toEqual({
      enabled: true,
      disabledSiteOrigins: [],
    });
  });

  it('全局禁用优先于站点级状态', async () => {
    const { disablePageToolsForSite, isPageToolsEnabledForUrl, setPageToolsEnabled } = await import('./page-tools');

    await disablePageToolsForSite('https://example.com/docs/a');
    await setPageToolsEnabled(false);

    await expect(isPageToolsEnabledForUrl('https://example.com/other')).resolves.toBe(false);
    await expect(isPageToolsEnabledForUrl('https://another.example/')).resolves.toBe(false);
    expect(jsonStorageMock.getStoredValue(PAGE_TOOLS_TEST_STORAGE_KEY)).toEqual({
      enabled: false,
      disabledSiteOrigins: ['https://example.com'],
    });
    expect(jsonStorageMock.writeStoredJsonWithBootstrapMirrorInBackgroundMock).toHaveBeenCalledWith(
      PAGE_TOOLS_TEST_STORAGE_KEY,
      {
        enabled: false,
        disabledSiteOrigins: ['https://example.com'],
      },
      'shared-json-config-channel',
    );
  });
});
