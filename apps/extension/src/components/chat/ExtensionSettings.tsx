/**
 * 说明：`ExtensionSettings` 组件模块。
 *
 * 职责：
 * - 承载 `ExtensionSettings` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ExtensionSettings` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bot, Bug, Cpu, Cloud, Gauge, Plug, Layers, Network, Palette, Globe, Brain, MessageSquare, Scale, GlobeLock, ShieldCheck, type LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ServiceWorkerPanel } from './settings/ServiceWorkerPanel';
import { McpPanel } from './settings/McpPanel';
import { SitePermissionsPanel } from './settings/SitePermissionsPanel';
import { PerformancePanel } from './settings/PerformancePanel';
import { ShadowDOMPanel } from './settings/ShadowDOMPanel';
import { AppearancePanel } from './settings/AppearancePanel';
import { ChatDialogPanel } from './settings/ChatDialogPanel';
import { CloudSyncPanel } from './settings/CloudSyncPanel';
import { DefaultModelPanel } from './settings/DefaultModelPanel';
import { DeveloperPanel } from './settings/DeveloperPanel';
import { LicensesPanel } from './settings/LicensesPanel';
import { MemoryPanel } from './settings/MemoryPanel';
import { ModelManagerPanel } from './settings/ModelManagerPanel';
import { SecurityPanel } from './settings/SecurityPanel';
import { WebSearchPanel } from './settings/WebSearchPanel';
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

/** 扩展设置总面板入参 */
interface Props {
  /** 是否打开弹窗 */
  open: boolean;
  /** 关闭弹窗回调 */
  onClose: () => void;
  /**
   * 可选：外部指定当前 Tab（用于从"选择模型"弹窗一键跳转到"模型管理"）。
   *
   * 说明：
   * - 该值既作为"首次打开时的默认 Tab"，也作为"打开期间的强制切换信号"。
   * - 这样可以在设置弹窗已打开时，仍然通过更新 initialTab 来切到目标页。
   */
  initialTab?: string;
  /**
   * 可选：Tab 切换回调（用于上层记住用户最后停留的 Tab，便于下次打开保持一致）。
   */
  onTabChange?: (tabId: string) => void;
}

/** 设置导航页签定义。 */
interface SettingsTabDefinition {
  /** 稳定页签 ID，同时用于 URL 中的 `tab` 参数。 */
  readonly id: string;
  /** 用户可见页签标题的 i18n key。 */
  readonly labelKey: string;
  /** 页签图标。 */
  readonly icon: LucideIcon;
}

/** 可复用设置主体入参。 */
export interface ExtensionSettingsSurfaceProps {
  /**
   * 初始页签。
   *
   * 说明：
   * - 弹窗宿主用它响应外部跳转；
   * - 工作区全页宿主用它消费 URL 中的 `tab` 参数。
   */
  readonly initialTab?: string;
  /** 当前宿主是否处于活跃打开状态；弹窗关闭时不响应外部 tab 同步。 */
  readonly active?: boolean;
  /** 用户主动切换页签时回调给上层记忆。 */
  readonly onTabChange?: (tabId: string) => void;
  /** 当前有效页签变化时回调给弹窗头部动作使用。 */
  readonly onActiveTabChange?: (tabId: string) => void;
  /** 附加到主体布局根节点的 className。 */
  readonly className?: string;
}

/** 全页设置入口入参。 */
export interface ExtensionSettingsPageProps {
  /** 可选初始页签；未传时从当前 URL 解析。 */
  readonly initialTab?: string;
}

const tabs: readonly SettingsTabDefinition[] = [
  { id: 'appearance', labelKey: 'settings.appearance', icon: Palette },
  { id: 'chat-dialog', labelKey: 'settings.chatDialog', icon: MessageSquare },
  { id: 'default-models', labelKey: 'settings.defaultModels', icon: Bot },
  { id: 'models', labelKey: 'settings.modelManager', icon: Cpu },
  { id: 'web-search', labelKey: 'settings.webSearch', icon: Globe },
  { id: 'memory', labelKey: 'settings.memory', icon: Brain },
  { id: 'mcp', labelKey: 'settings.mcpBridge', icon: Plug },
  { id: 'site-permissions', labelKey: 'settings.sitePermissions', icon: GlobeLock },
  { id: 'security', labelKey: 'settings.security', icon: ShieldCheck },
  { id: 'cloud-sync', labelKey: 'settings.cloudSync', icon: Cloud },
  { id: 'performance', labelKey: 'settings.performance', icon: Gauge },
  { id: 'service-worker', labelKey: 'settings.serviceWorker', icon: Layers },
  { id: 'shadow-dom', labelKey: 'settings.uiArch', icon: Network },
  { id: 'licenses', labelKey: 'settings.licenses', icon: Scale },
];

const developerTab: SettingsTabDefinition = { id: 'developer', labelKey: 'settings.developer', icon: Bug };
const SETTINGS_NAV_SIDE_RAIL_QUERY = '(min-width: 640px)';

/**
 * 从可见页签列表中解析合法页签 ID。
 *
 * 说明：
 * - 工作区设置页可能来自手写 URL 或路由入口；
 * - 非法值统一回到第一项，避免出现空面板。
 */
function resolveSettingsTabId(tabId: string | undefined, visibleTabs: readonly SettingsTabDefinition[]): string {
  const normalized = typeof tabId === 'string' ? tabId.trim() : '';
  if (normalized && visibleTabs.some((tab) => tab.id === normalized)) return normalized;
  return visibleTabs[0]?.id ?? 'appearance';
}

/**
 * 从工作区设置页 URL 中解析初始设置页签。
 *
 * 说明：
 * - 工作区路由使用 `#/settings?tab=...`；
 * - 这里也接受普通 `?tab=...` 与 `#tab=...`，方便测试和开发预览复用。
 */
function readExtensionSettingsInitialTabFromLocation(): string {
  if (typeof window === 'undefined') return 'appearance';
  try {
    const url = new URL(window.location.href);
    const queryTab = url.searchParams.get('tab')?.trim();
    if (queryTab) return queryTab;

    const hash = url.hash.replace(/^#/, '').replace(/^\/+/, '');
    if (!hash) return 'appearance';
    const hashParams = new URLSearchParams(hash);
    const hashParamTab = hashParams.get('tab')?.trim();
    if (hashParamTab) return hashParamTab;

    const hashQueryIndex = hash.indexOf('?');
    if (hashQueryIndex >= 0) {
      const nestedHashParams = new URLSearchParams(hash.slice(hashQueryIndex + 1));
      const nestedTab = nestedHashParams.get('tab')?.trim();
      if (nestedTab) return nestedTab;
    }

    return decodeURIComponent(hash.split(/[/?&]/)[0] || 'appearance').trim() || 'appearance';
  } catch {
    return 'appearance';
  }
}

/**
 * 判断扩展设置导航当前是否应使用左侧竖向 rail。
 *
 * 说明：
 * - CSS 负责真实布局切换；
 * - 这里同步导航形态，让可访问语义跟随同一个 640px 断点。
 */
function useSettingsNavSideRail(): boolean {
  const [isSideRail, setIsSideRail] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia(SETTINGS_NAV_SIDE_RAIL_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(SETTINGS_NAV_SIDE_RAIL_QUERY);
    setIsSideRail(media.matches);

    /**
     * 响应设置弹窗导航断点变化。
     *
     * @param event - 媒体查询变化事件。
     */
    const handleChange = (event: MediaQueryListEvent) => {
      setIsSideRail(event.matches);
    };

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange);
      return () => media.removeEventListener('change', handleChange);
    }

    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  return isSideRail;
}

/**
 * 扩展设置主体。
 *
 * 说明：
 * - 同一份导航与设置面板同时服务弹窗宿主和工作区全页宿主；
 * - 这里只处理设置页内部 tab 状态，不直接访问浏览器 API。
 */
export function ExtensionSettingsSurface({
  active = true,
  className,
  initialTab = 'appearance',
  onActiveTabChange,
  onTabChange,
}: ExtensionSettingsSurfaceProps) {
  const { t } = useTranslation();
  const developerModeEnabled = useChatSettingsStore((state) => state.settings.enableDeveloperMode ?? false);
  const visibleTabs = useMemo(
    () => (developerModeEnabled ? [...tabs, developerTab] : tabs),
    [developerModeEnabled],
  );
  const isSideRailNav = useSettingsNavSideRail();
  // 初始值用 initialTab，避免"打开瞬间闪到默认 tab 再切回"的视觉跳动。
  const [activeTab, setActiveTab] = useState(() => resolveSettingsTabId(initialTab, visibleTabs));

  // 当外部要求切换 Tab（或弹窗重新打开）时，同步内部状态。
  // 典型场景：在"选择模型"弹窗里点击"模型管理"，需要立刻跳到 models tab。
  useEffect(() => {
    if (!active) return;
    const resolvedTab = resolveSettingsTabId(initialTab, visibleTabs);
    setActiveTab((current) => (current === resolvedTab ? current : resolvedTab));
  }, [active, initialTab, visibleTabs]);

  useEffect(() => {
    const resolvedTab = resolveSettingsTabId(activeTab, visibleTabs);
    if (resolvedTab !== activeTab) {
      setActiveTab(resolvedTab);
      return;
    }
    onActiveTabChange?.(activeTab);
  }, [activeTab, onActiveTabChange, visibleTabs]);

  /**
   * 切换当前设置页签，并把结果同步给上层记忆逻辑。
   *
   * @param tabId - 目标页签 ID。
   */
  const handleTabSelect = (tabId: string) => {
    const resolvedTab = resolveSettingsTabId(tabId, visibleTabs);
    setActiveTab(resolvedTab);
    onTabChange?.(resolvedTab);
  };

  const activeTabMeta = visibleTabs.find((tab) => tab.id === activeTab) ?? visibleTabs[0] ?? tabs[0];
  const activeTabId = activeTabMeta.id;
  const ActiveTabIcon = activeTabMeta.icon;
  const activePanelId = `extension-settings-panel-${activeTabId}`;
  const activeTabButtonId = `extension-settings-tab-${activeTabId}`;

  return (
    <div
      data-testid="extension-settings-layout"
      className={`flex min-h-0 min-w-0 flex-1 flex-col min-[640px]:flex-row ${className ?? ''}`}
    >
      {isSideRailNav ? (
        <div
          data-extension-settings-side-nav
          data-testid="extension-settings-tab-nav"
          className="min-h-0 w-48 min-w-0 shrink-0 border-r border-border bg-muted/30"
        >
          <ScrollArea
            data-testid="extension-settings-tab-scroll"
            scrollbars="vertical"
            scrollbarVisibility="hover"
            className="h-full"
            viewportClassName="h-full min-w-0"
          >
            <div
              role="tablist"
              aria-orientation="vertical"
              aria-label={t('settings.title')}
              className="flex min-h-full w-full min-w-0 flex-col gap-1 p-2 pr-2"
            >
              {visibleTabs.map((tab) => {
                const tabId = `extension-settings-tab-${tab.id}`;
                const isActive = activeTabId === tab.id;

                return (
                  <button
                    key={tab.id}
                    id={tabId}
                    role="tab"
                    type="button"
                    aria-controls={activePanelId}
                    aria-selected={isActive}
                    data-testid={tabId}
                    onClick={() => handleTabSelect(tab.id)}
                    className={`flex w-full shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    }`}
                  >
                    <tab.icon className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{t(tab.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {!isSideRailNav ? (
          <div
            data-extension-settings-compact-nav
            data-testid="extension-settings-compact-nav"
            className="shrink-0 border-b border-border bg-muted/30 px-3 py-2"
          >
            <Select value={activeTabId} onValueChange={handleTabSelect}>
              <SelectTrigger
                aria-label={t('settings.title')}
                data-testid="extension-settings-compact-select"
                className="h-9 w-full bg-background text-sm"
              >
                <div
                  data-testid="extension-settings-compact-select-value"
                  className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden"
                >
                  <ActiveTabIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{t(activeTabMeta.labelKey)}</span>
                </div>
              </SelectTrigger>
              <SelectContent align="start" className="max-h-[min(24rem,calc(100dvh-8rem))]">
                {visibleTabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <SelectItem key={tab.id} value={tab.id}>
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{t(tab.labelKey)}</span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div
          id={activePanelId}
          role={isSideRailNav ? 'tabpanel' : 'region'}
          aria-labelledby={isSideRailNav ? activeTabButtonId : undefined}
          aria-label={isSideRailNav ? undefined : t(activeTabMeta.labelKey)}
          data-extension-settings-panel-container
          data-testid={activePanelId}
          className="min-h-0 min-w-0 flex-1 overflow-hidden"
        >
          {activeTabId === 'appearance' && <AppearancePanel />}
          {activeTabId === 'chat-dialog' && <ChatDialogPanel />}
          {activeTabId === 'developer' && developerModeEnabled && <DeveloperPanel />}
          {activeTabId === 'service-worker' && <ServiceWorkerPanel />}
          {activeTabId === 'mcp' && <McpPanel />}
          {activeTabId === 'cloud-sync' && <CloudSyncPanel />}
          {activeTabId === 'web-search' && <WebSearchPanel />}
          {activeTabId === 'memory' && <MemoryPanel />}
          {activeTabId === 'models' && <ModelManagerPanel />}
          {activeTabId === 'default-models' && <DefaultModelPanel />}
          {activeTabId === 'shadow-dom' && <ShadowDOMPanel />}
          {activeTabId === 'performance' && <PerformancePanel />}
          {activeTabId === 'site-permissions' && <SitePermissionsPanel />}
          {activeTabId === 'security' && <SecurityPanel />}
          {activeTabId === 'licenses' && <LicensesPanel />}
        </div>
      </div>
    </div>
  );
}

/**
 * 扩展设置总弹窗。
 *
 * 说明：
 * - 统一收纳模型、性能、权限、云同步、外观等所有设置子面板；
 * - `initialTab` 既是首次打开默认值，也可作为外部强制跳转目标；
 * - 宿主切换由页面路由层决定，弹窗自身只负责当前承载方式的展示。
 */
export function ExtensionSettings({ open, onClose, initialTab = 'appearance', onTabChange }: Props) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        data-testid="extension-settings-dialog"
        className="flex min-h-0 min-w-0 max-w-none flex-col gap-0 overflow-hidden rounded-lg p-0 h-[min(85vh,calc(100dvh-1.5rem))] max-h-[calc(100dvh-1.5rem)]"
        style={{ width: 1024, minWidth: 0, maxWidth: 'calc(100vw - 1.5rem)' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4 pr-16">
          <DialogTitle className="min-w-0 truncate text-lg font-semibold">{t('settings.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('settings.description')}</DialogDescription>
        </div>
        <ExtensionSettingsSurface
          active={open}
          initialTab={initialTab}
          onTabChange={onTabChange}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * 扩展设置全页宿主。
 *
 * 说明：
 * - 供 sidepanel / sidebar 内的 `/settings` 工作区路由使用；
 * - 复用 `ExtensionSettingsSurface`，确保全页与弹窗展示同一套设置能力和状态真源。
 */
export function ExtensionSettingsPage({
  initialTab = readExtensionSettingsInitialTabFromLocation(),
}: ExtensionSettingsPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleTabChange = useCallback((tabId: string) => {
    navigate(`/settings?tab=${encodeURIComponent(tabId)}`, { replace: true });
  }, [navigate]);

  return (
    <main
      data-testid="extension-settings-page"
      className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-background text-foreground"
    >
      <header className="h-12 shrink-0 flex items-center justify-between gap-2 border-b border-border/60 bg-sidebar px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => navigate('/')}
            data-testid="extension-settings-back-to-chat"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('settings.backToChat')}
          </Button>
          <div className="hidden min-w-0 sm:block">
            <h1 className="truncate text-sm font-semibold">{t('settings.title')}</h1>
            <p className="truncate text-[11px] text-muted-foreground">{t('settings.description')}</p>
          </div>
        </div>
      </header>
      <ExtensionSettingsSurface initialTab={initialTab} onTabChange={handleTabChange} />
    </main>
  );
}
