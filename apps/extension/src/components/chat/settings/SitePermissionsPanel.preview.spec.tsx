/**
 * 说明：`SitePermissionsPanel.preview.spec` 组件模块。
 *
 * 职责：
 * - 承载 `SitePermissionsPanel.preview.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getBrowserContextPolicyStateMock,
  getBrowserContextSettingsMock,
  pageToolsDisabledSiteOriginsMock,
  clearPageToolsDisabledSitesMock,
  enablePageToolsSiteMock,
  setBrowserContextEnabledMock,
  setBrowserContextFullPagePromptCharsMock,
  setBrowserContextTagRulesMock,
  setPageToolsEnabledMock,
  toastMock,
} = vi.hoisted(() => {
  const browserContextTagRulesMock: Array<{ id: string; tag: string; profileId: string; priority: number; enabled: boolean }> = [];
  const pageToolsDisabledSiteOriginsMock: string[] = [];
  return {
    browserContextTagRulesMock,
    pageToolsDisabledSiteOriginsMock,
    clearPageToolsDisabledSitesMock: vi.fn(),
    enablePageToolsSiteMock: vi.fn(),
    getBrowserContextPolicyStateMock: vi.fn(() => ({ tagRules: browserContextTagRulesMock, assistantOverrides: [] })),
    getBrowserContextSettingsMock: vi.fn(() => ({ enabled: true, fullPagePromptChars: 24_000 })),
    setBrowserContextEnabledMock: vi.fn(),
    setBrowserContextFullPagePromptCharsMock: vi.fn((value: number) => ({ enabled: true, fullPagePromptChars: value })),
    setBrowserContextTagRulesMock: vi.fn(),
    setPageToolsEnabledMock: vi.fn(),
    toastMock: vi.fn(),
  };
});

const t = vi.hoisted(() => (key: string) => key);

vi.mock('react-i18next', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t,
    }),
  };
});

vi.mock('@/hooks/useToast', () => ({
  toast: toastMock,
}));

vi.mock('@/hooks/usePageToolsEnabled', () => ({
  usePageToolsEnabled: () => ({
    enabled: true,
    disabledSiteOrigins: pageToolsDisabledSiteOriginsMock,
    loaded: true,
    setEnabled: setPageToolsEnabledMock,
    enableSite: enablePageToolsSiteMock,
    clearDisabledSites: clearPageToolsDisabledSitesMock,
  }),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    estimateSize,
    getItemKey,
  }: {
    count: number;
    estimateSize: (index: number) => number;
    getItemKey?: (index: number) => string | number;
  }) => ({
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({
      index,
      key: getItemKey?.(index) ?? index,
      start: Array.from({ length: index }, (_unused, itemIndex) => estimateSize(itemIndex)).reduce((total, size) => total + size, 0),
    })),
    getTotalSize: () => Array.from({ length: count }, (_unused, index) => estimateSize(index)).reduce((total, size) => total + size, 0),
    measure: vi.fn(),
  }),
}));

vi.mock('@/lib/browser-context', () => ({
  BUILTIN_BROWSER_CONTEXT_PROFILES: [
    {
      id: 'minimal-page',
      title: 'Minimal Page',
      description: 'desc',
      sources: ['tab-meta', 'readable-dom'],
      outputFormat: 'markdown',
      maxPromptChars: 6000,
      cacheTtlMs: 60_000,
    },
  ],
  DEFAULT_BROWSER_CONTEXT_PROFILE_ID: 'minimal-page',
  getBrowserContextPolicyState: getBrowserContextPolicyStateMock,
  getBrowserContextSettings: getBrowserContextSettingsMock,
  requestBrowserContextMetadata: vi.fn(),
  setBrowserContextEnabled: setBrowserContextEnabledMock,
  setBrowserContextFullPagePromptChars: setBrowserContextFullPagePromptCharsMock,
  setBrowserContextTagRules: setBrowserContextTagRulesMock,
  subscribeBrowserContextPolicyChange: () => () => undefined,
  subscribeBrowserContextSettingsChange: () => () => undefined,
}));

import { SitePermissionsPanel } from './SitePermissionsPanel';

describe('SitePermissionsPanel preview fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pageToolsDisabledSiteOriginsMock.splice(0);
    delete (globalThis as { chrome?: typeof chrome }).chrome;
  });

  it('在非扩展页面中进入只读降级状态而不是报错', async () => {
    render(<SitePermissionsPanel />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'common.refresh' })).toBeDisabled();
    });

    expect(toastMock).not.toHaveBeenCalled();
  });

  it('扩展环境只展示安装期 host access 状态，不提供撤销按钮', async () => {
    (globalThis as { chrome?: typeof chrome }).chrome = {
      runtime: {
        sendMessage: vi.fn((message: { type?: string }, callback: (response: unknown) => void) => {
          if (message?.type === 'content-script/status/get') {
            callback({
              ok: true,
              payload: {
                enabled: true,
                registrationMethod: 'static',
                scriptingAvailable: true,
                contentScriptsAvailable: false,
                declaredHostMatches: ['http://*/*', 'https://*/*'],
                registered: true,
                bundledJs: ['assets/content-script.js'],
              },
            });
            return;
          }

          if (message?.type === 'content-script/refresh') {
            callback({ ok: true });
            return;
          }

          callback({ ok: false });
        }) as unknown as typeof chrome.runtime.sendMessage,
        lastError: undefined,
      },
    } as typeof chrome;

    render(<SitePermissionsPanel />);

    await waitFor(() => {
      expect(screen.getByText('sitePermissionsPanel.status.staticReady')).toBeInTheDocument();
    });
    expect(screen.getByText('sitePermissionsPanel.hostAccess.installGranted')).toBeInTheDocument();
    expect(screen.getByText('sitePermissionsPanel.method.static')).toBeInTheDocument();
    expect(screen.getByTestId('site-permissions-technology-stack-icon')).toBeInTheDocument();
  });

  it('支持配置全文网页模式的 prompt 注入上限', async () => {
    render(<SitePermissionsPanel />);

    const input = screen.getByDisplayValue('24000');
    fireEvent.change(input, { target: { value: '30000' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(setBrowserContextFullPagePromptCharsMock).toHaveBeenCalledWith(30000);
    });
  });

  it('展示并恢复网页工具禁用网站', async () => {
    pageToolsDisabledSiteOriginsMock.push('https://example.com', 'https://docs.example.com');

    render(<SitePermissionsPanel />);

    expect(screen.getByRole('textbox', { name: 'sitePermissionsPanel.pageTools.disabledSitesSearchLabel' })).toBeInTheDocument();
    expect(screen.getByText('sitePermissionsPanel.pageTools.disabledSitesCount')).toBeInTheDocument();
    const viewport = screen.getByTestId('page-tools-disabled-sites-viewport');
    expect(viewport.className).toContain('h-[min(20rem,42vh)]');
    expect(viewport.className).toContain('overflow-y-auto');
    expect(viewport).toHaveAttribute('role', 'list');
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
    expect(screen.getByText('https://docs.example.com')).toBeInTheDocument();
    const listItems = screen.getAllByRole('listitem');
    expect(listItems[0]).toHaveAttribute('aria-setsize', '2');
    expect(listItems[0]).toHaveAttribute('aria-posinset', '1');

    const restoreButtons = screen.getAllByRole('button', { name: 'sitePermissionsPanel.pageTools.restoreSiteAriaLabel' });
    fireEvent.click(restoreButtons[0]);

    await waitFor(() => {
      expect(enablePageToolsSiteMock).toHaveBeenCalledWith('https://example.com');
    });
  });

  it('支持搜索和清空网页工具禁用网站列表', async () => {
    pageToolsDisabledSiteOriginsMock.push('https://example.com', 'https://docs.example.com', 'https://other.test');

    render(<SitePermissionsPanel />);

    const searchInput = screen.getByRole('textbox', { name: 'sitePermissionsPanel.pageTools.disabledSitesSearchLabel' });
    fireEvent.change(searchInput, { target: { value: 'docs' } });

    expect(screen.getByText('https://docs.example.com')).toBeInTheDocument();
    expect(screen.queryByText('https://example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('https://other.test')).not.toBeInTheDocument();
    expect(screen.getByText('sitePermissionsPanel.pageTools.disabledSitesMatchCount')).toBeInTheDocument();
    const filteredItem = screen.getByRole('listitem');
    expect(filteredItem).toHaveAttribute('aria-setsize', '1');
    expect(filteredItem).toHaveAttribute('aria-posinset', '1');

    const clearButton = screen.getByRole('button', { name: 'common.clear' });
    expect(clearButton).not.toHaveAttribute('title');
    fireEvent.click(clearButton);

    expect(searchInput).toHaveValue('');
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
    expect(screen.getByText('https://docs.example.com')).toBeInTheDocument();
    expect(screen.getByText('https://other.test')).toBeInTheDocument();
  });

  it('搜索网页工具禁用网站无结果时展示空结果状态', async () => {
    pageToolsDisabledSiteOriginsMock.push('https://example.com');

    render(<SitePermissionsPanel />);

    fireEvent.change(screen.getByRole('textbox', { name: 'sitePermissionsPanel.pageTools.disabledSitesSearchLabel' }), {
      target: { value: 'missing' },
    });

    expect(screen.getByText('sitePermissionsPanel.pageTools.noDisabledSitesMatch')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('支持清空全部网页工具禁用网站', async () => {
    pageToolsDisabledSiteOriginsMock.push('https://example.com');

    render(<SitePermissionsPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'sitePermissionsPanel.pageTools.clearDisabledSites' }));

    await waitFor(() => {
      expect(clearPageToolsDisabledSitesMock).toHaveBeenCalledTimes(1);
    });
  });
});
