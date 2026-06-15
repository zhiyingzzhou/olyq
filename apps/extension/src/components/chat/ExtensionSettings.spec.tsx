/**
 * 说明：`ExtensionSettings.spec` 组件模块。
 *
 * 职责：
 * - 承载 `ExtensionSettings.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { DEFAULT_SETTINGS } from '@/types/chat';
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore';
import { ExtensionSettings, ExtensionSettingsPage } from './ExtensionSettings';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('./settings/AppearancePanel', () => ({ AppearancePanel: () => <div>appearance-panel</div> }));
vi.mock('./settings/ChatDialogPanel', () => ({ ChatDialogPanel: () => <div>chat-dialog-panel</div> }));
vi.mock('./settings/DeveloperPanel', () => ({ DeveloperPanel: () => <div>developer-panel</div> }));
vi.mock('./settings/ServiceWorkerPanel', () => ({ ServiceWorkerPanel: () => <div>service-worker-panel</div> }));
vi.mock('./settings/McpPanel', () => ({ McpPanel: () => <div>mcp-panel</div> }));
vi.mock('./settings/CloudSyncPanel', () => ({ CloudSyncPanel: () => <div>cloud-sync-panel</div> }));
vi.mock('./settings/ModelManagerPanel', () => ({ ModelManagerPanel: () => <div>model-manager-panel</div> }));
vi.mock('./settings/SecurityPanel', () => ({ SecurityPanel: () => <div>security-panel</div> }));
vi.mock('./settings/SitePermissionsPanel', () => ({ SitePermissionsPanel: () => <div>site-permissions-panel</div> }));
vi.mock('./settings/PerformancePanel', () => ({ PerformancePanel: () => <div>performance-panel</div> }));
vi.mock('./settings/ShadowDOMPanel', () => ({ ShadowDOMPanel: () => <div>shadow-dom-panel</div> }));
vi.mock('./settings/WebSearchPanel', () => ({ WebSearchPanel: () => <div>web-search-panel</div> }));
vi.mock('./settings/MemoryPanel', () => ({ MemoryPanel: () => <div>memory-panel</div> }));
vi.mock('./settings/DefaultModelPanel', () => ({ DefaultModelPanel: () => <div>default-model-panel</div> }));
vi.mock('./settings/LicensesPanel', () => ({ LicensesPanel: () => <div>licenses-panel</div> }));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: { children: ReactNode; value?: string; onValueChange?: (value: string) => void }) => (
    <div data-select-value={value} data-testid="mock-select-root">
      <div>{children}</div>
      <button type="button" data-testid="mock-select-change-models" onClick={() => onValueChange?.('models')}>
        settings.modelManager
      </button>
      <button type="button" data-testid="mock-select-change-memory" onClick={() => onValueChange?.('memory')}>
        settings.memory
      </button>
    </div>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <div role="listbox">{children}</div>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <div role="option" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({
    children,
    ...props
  }: {
    children: ReactNode;
    'aria-label'?: string;
    'data-testid'?: string;
    className?: string;
  }) => (
    <button type="button" role="combobox" {...props}>
      {children}
    </button>
  ),
}));

describe('ExtensionSettings', () => {
  /**
   * 测试辅助函数：`getVisibleTabIds`。
   *
   * @remarks
   * 读取当前设置页实际渲染出来的 tab 顺序，用于验证开发者模式开关前后的导航排列。
   */
  const getVisibleTabIds = () =>
    screen
      .getAllByRole('tab')
      .map((tab) => tab.getAttribute('data-testid'))
      .filter((value): value is string => Boolean(value));

  /**
   * 测试辅助函数：`mockSettingsNavMedia`。
   *
   * @remarks
   * 用同一份 matchMedia mock 驱动设置导航的布局断点与 `aria-orientation` 断言。
   */
  const mockSettingsNavMedia = (matches: boolean) => {
    const media: MediaQueryList = {
      matches,
      media: '(min-width: 640px)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
    vi.stubGlobal('matchMedia', vi.fn(() => media));
    return media;
  };

  /**
   * 测试辅助函数：`renderSettingsPageRoute`。
   *
   * @remarks
   * 用真实 `HashRouter` 模拟 sidepanel 工作区路由，确保 URL hash query 与返回聊天行为一致。
   */
  const renderSettingsPageRoute = (element: ReactNode, hash = '#/settings') => {
    window.history.replaceState(null, '', `/${hash}`);
    return render(
      <HashRouter>
        <Routes>
          <Route path="/" element={<div>chat-home</div>} />
          <Route path="/settings" element={element} />
        </Routes>
      </HashRouter>,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useChatSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS });
    mockSettingsNavMedia(true);
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
    vi.unstubAllGlobals();
  });

  it('未指定 initialTab 时默认打开外观设置', async () => {
    render(<ExtensionSettings open onClose={() => {}} />);

    expect(await screen.findByText('appearance-panel')).toBeInTheDocument();
    expect(screen.getByTestId('extension-settings-tab-appearance')).toHaveAttribute('aria-selected', 'true');
  });

  it('开发者模式关闭时不显示 developer tab', async () => {
    render(<ExtensionSettings open onClose={() => {}} initialTab="chat-dialog" />);

    expect(screen.queryByText('settings.developer')).not.toBeInTheDocument();
    expect(await screen.findByText('chat-dialog-panel')).toBeInTheDocument();
  });

  it('宽模式保留竖向导航并可切换到模型管理', async () => {
    render(<ExtensionSettings open onClose={() => {}} initialTab="chat-dialog" />);

    const dialog = screen.getByTestId('extension-settings-dialog');
    expect(dialog).toHaveStyle({
      width: '1024px',
      minWidth: '0',
      maxWidth: 'calc(100vw - 1.5rem)',
    });
    expect(screen.getByTestId('extension-settings-layout').className).toContain('min-[640px]:flex-row');
    expect(screen.getByTestId('extension-settings-tab-nav').className).toContain('w-48');
    expect(screen.getByTestId('extension-settings-tab-scroll')).toHaveAttribute('data-scrollbar-visibility', 'hover');
    expect(screen.getByTestId('extension-settings-tab-scroll')).toHaveAttribute('data-wheel-behavior', 'native');
    expect(screen.queryByTestId('extension-settings-compact-select')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('extension-settings-tab-models'));

    expect(await screen.findByText('model-manager-panel')).toBeInTheDocument();
    expect(screen.getByTestId('extension-settings-tab-models')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('extension-settings-panel-models')).toHaveAttribute('role', 'tabpanel');
  });

  it('设置导航在 640px 及以上使用左侧竖向 tablist 语义', () => {
    mockSettingsNavMedia(true);

    render(<ExtensionSettings open onClose={() => {}} initialTab="chat-dialog" />);

    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical');
    expect(screen.getByTestId('extension-settings-panel-chat-dialog')).toHaveAttribute('role', 'tabpanel');
  });

  it('设置导航在 640px 以下切到顶部分类下拉并使用 region 语义', async () => {
    mockSettingsNavMedia(false);

    render(<ExtensionSettings open onClose={() => {}} initialTab="chat-dialog" />);

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByTestId('extension-settings-tab-nav')).not.toBeInTheDocument();
    expect(screen.getByTestId('extension-settings-compact-nav')).toBeInTheDocument();
    const compactSelect = screen.getByTestId('extension-settings-compact-select');
    expect(compactSelect).toHaveAttribute('role', 'combobox');
    expect(screen.getByTestId('extension-settings-compact-select-value').tagName).toBe('DIV');
    expect(screen.getByTestId('extension-settings-panel-chat-dialog')).toHaveAttribute('role', 'region');
    expect(screen.getByTestId('extension-settings-panel-chat-dialog')).toHaveAttribute('aria-label', 'settings.chatDialog');

    fireEvent.click(screen.getByTestId('mock-select-change-models'));

    expect(await screen.findByText('model-manager-panel')).toBeInTheDocument();
    expect(screen.getByTestId('extension-settings-panel-models')).toHaveAttribute('role', 'region');
    expect(screen.getByTestId('extension-settings-panel-models')).toHaveAttribute('aria-label', 'settings.modelManager');
  });

  it('普通模式下按固定顺序平铺设置入口，不显示分组标题', () => {
    render(<ExtensionSettings open onClose={() => {}} initialTab="chat-dialog" />);

    const removedLocalRetrievalKey = ['settings', ['local', 'Rag'].join('')].join('.');
    expect(screen.queryByText(removedLocalRetrievalKey)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/extension-settings-tab-group-/)).not.toBeInTheDocument();
    expect(screen.queryByText('settings.groups.experience')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.groups.modelsAndCapabilities')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.groups.webContextAndPermissions')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.groups.maintenance')).not.toBeInTheDocument();
    expect(getVisibleTabIds()).toEqual([
      'extension-settings-tab-appearance',
      'extension-settings-tab-chat-dialog',
      'extension-settings-tab-default-models',
      'extension-settings-tab-models',
      'extension-settings-tab-web-search',
      'extension-settings-tab-memory',
      'extension-settings-tab-mcp',
      'extension-settings-tab-site-permissions',
      'extension-settings-tab-security',
      'extension-settings-tab-cloud-sync',
      'extension-settings-tab-performance',
      'extension-settings-tab-service-worker',
      'extension-settings-tab-shadow-dom',
      'extension-settings-tab-licenses',
    ]);
  });

  it('开发者模式开启时显示 developer tab', () => {
    useChatSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS, enableDeveloperMode: true });

    render(<ExtensionSettings open onClose={() => {}} initialTab="chat-dialog" />);

    expect(screen.getByText('settings.developer')).toBeInTheDocument();
  });

  it('开发者模式开启时 developer 只出现在平铺列表末尾', () => {
    useChatSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS, enableDeveloperMode: true });

    render(<ExtensionSettings open onClose={() => {}} initialTab="chat-dialog" />);

    expect(getVisibleTabIds()).toEqual([
      'extension-settings-tab-appearance',
      'extension-settings-tab-chat-dialog',
      'extension-settings-tab-default-models',
      'extension-settings-tab-models',
      'extension-settings-tab-web-search',
      'extension-settings-tab-memory',
      'extension-settings-tab-mcp',
      'extension-settings-tab-site-permissions',
      'extension-settings-tab-security',
      'extension-settings-tab-cloud-sync',
      'extension-settings-tab-performance',
      'extension-settings-tab-service-worker',
      'extension-settings-tab-shadow-dom',
      'extension-settings-tab-licenses',
      'extension-settings-tab-developer',
    ]);
  });

  it('全页设置宿主复用同一套设置页签并支持 initialTab', async () => {
    renderSettingsPageRoute(<ExtensionSettingsPage initialTab="models" />);

    expect(screen.getByTestId('extension-settings-page')).toBeInTheDocument();
    expect(await screen.findByText('model-manager-panel')).toBeInTheDocument();
    expect(screen.getByTestId('extension-settings-tab-models')).toHaveAttribute('aria-selected', 'true');
    expect(getVisibleTabIds()).toEqual([
      'extension-settings-tab-appearance',
      'extension-settings-tab-chat-dialog',
      'extension-settings-tab-default-models',
      'extension-settings-tab-models',
      'extension-settings-tab-web-search',
      'extension-settings-tab-memory',
      'extension-settings-tab-mcp',
      'extension-settings-tab-site-permissions',
      'extension-settings-tab-security',
      'extension-settings-tab-cloud-sync',
      'extension-settings-tab-performance',
      'extension-settings-tab-service-worker',
      'extension-settings-tab-shadow-dom',
      'extension-settings-tab-licenses',
    ]);
  });

  it('全页设置宿主会从 URL tab 参数恢复初始页签', async () => {
    renderSettingsPageRoute(<ExtensionSettingsPage />, '#/settings?tab=models');

    expect(await screen.findByText('model-manager-panel')).toBeInTheDocument();
    expect(screen.getByTestId('extension-settings-tab-models')).toHaveAttribute('aria-selected', 'true');
  });

  it('全页设置宿主切换页签时同步 hash query，并可返回聊天', async () => {
    renderSettingsPageRoute(<ExtensionSettingsPage />, '#/settings?tab=models');

    fireEvent.click(screen.getByTestId('extension-settings-tab-memory'));

    expect(await screen.findByText('memory-panel')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/settings?tab=memory');

    fireEvent.click(screen.getByTestId('extension-settings-back-to-chat'));

    expect(await screen.findByText('chat-home')).toBeInTheDocument();
  });
});
