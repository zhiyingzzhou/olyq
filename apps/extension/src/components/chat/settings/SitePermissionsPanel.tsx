/**
 * 说明：`SitePermissionsPanel` 组件模块。
 *
 * 职责：
 * - 承载 `SitePermissionsPanel` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SitePermissionsPanel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Globe, Info, Plus, RefreshCw, RotateCcw, ScanSearch, Shield, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore';
import { usePageToolsEnabled } from '@/hooks/usePageToolsEnabled';
import { toI18nTextFromError } from '@/lib/i18n/error';
import { formatI18nText } from '@/lib/i18n/format';
import { toast } from '@/hooks/useToast';
import {
  BUILTIN_BROWSER_CONTEXT_PROFILES,
  DEFAULT_BROWSER_CONTEXT_PROFILE_ID,
  getBrowserContextPolicyState,
  getBrowserContextSettings,
  requestBrowserContextMetadata,
  setBrowserContextEnabled,
  setBrowserContextFullPagePromptChars,
  setBrowserContextTagRules,
  subscribeBrowserContextPolicyChange,
  subscribeBrowserContextSettingsChange,
  type BrowserContextTagRule,
} from '@/lib/browser-context';
import { getBrowserContextProfilePresentation } from '@/lib/browser-context/profile-presentation';
import { createId } from '@/lib/utils/id';
import { PageToolsDisabledSitesList } from './PageToolsDisabledSitesList';
import { useContentScriptStatus } from './useContentScriptStatus';
import { SettingsPanelInset, SettingsPanelRoot, SettingsPanelScroller } from './layout';

/**
 * 站点权限与内容脚本注入设置面板。
 *
 * 负责：
 * - 展示安装期普通网页 host access 与静态 content script 状态；
 * - 管理自动浏览器上下文、网页工具和技术栈探测相关设置说明；
 * - 不再提供运行时网页授权、撤销或动态注入开关。
 */
export function SitePermissionsPanel() {
  const { t } = useTranslation();
  const developerModeEnabled = useChatSettingsStore((state) => state.settings.enableDeveloperMode ?? false);
  /** 网页工具开关是否正在切换。 */
  const [pageToolsBusy, setPageToolsBusy] = useState(false);
  /** browser-context 总开关是否正在切换。 */
  const [browserContextBusy, setBrowserContextBusy] = useState(false);
  /** browser-context 总开关当前值。 */
  const [browserContextEnabled, setBrowserContextEnabledState] = useState(() => getBrowserContextSettings().enabled);
  /** 全文网页模式正文预算本地编辑态。 */
  const [browserContextFullPagePromptChars, setBrowserContextFullPagePromptCharsState] = useState(
    () => String(getBrowserContextSettings().fullPagePromptChars),
  );
  /** 标签规则本地编辑态。 */
  const [browserContextTagRules, setBrowserContextTagRulesState] = useState<BrowserContextTagRule[]>(
    () => getBrowserContextPolicyState().tagRules,
  );
  const {
    enabled: pageToolsEnabled,
    disabledSiteOrigins: pageToolsDisabledSiteOrigins,
    loaded: pageToolsLoaded,
    setEnabled: setPageToolsEnabled,
    enableSite: enablePageToolsSite,
    clearDisabledSites: clearPageToolsDisabledSites,
  } = usePageToolsEnabled();
  const {
    runtimeAvailable,
    status,
    busy,
    installTimeWebAccessDeclared,
    refresh,
  } = useContentScriptStatus();

  /**
   * 切换网页工具总开关。
   *
   * 该开关影响划词助手、元素选择器等网页交互入口，
   * 但不直接等同于 content script 是否已注册。
   *
   * @param enabled - 目标启用状态。
   */
  const togglePageTools = useCallback(async (enabled: boolean) => {
    setPageToolsBusy(true);
    try {
      await setPageToolsEnabled(enabled);
    } catch (e: unknown) {
      toast({
        title: t('common.error'),
        description: formatI18nText(t, toI18nTextFromError(e)),
        variant: 'destructive',
      });
    } finally {
      setPageToolsBusy(false);
    }
  }, [setPageToolsEnabled, t]);

  /**
   * 恢复指定网站的网页工具。
   *
   * @param origin - page-tools 站点禁用列表中的精确 origin。
   */
  const restorePageToolsSite = useCallback(async (origin: string) => {
    setPageToolsBusy(true);
    try {
      await enablePageToolsSite(origin);
    } catch (e: unknown) {
      toast({
        title: t('common.error'),
        description: formatI18nText(t, toI18nTextFromError(e)),
        variant: 'destructive',
      });
    } finally {
      setPageToolsBusy(false);
    }
  }, [enablePageToolsSite, t]);

  /** 清空网页工具站点级禁用列表。 */
  const clearPageToolsSites = useCallback(async () => {
    setPageToolsBusy(true);
    try {
      await clearPageToolsDisabledSites();
    } catch (e: unknown) {
      toast({
        title: t('common.error'),
        description: formatI18nText(t, toI18nTextFromError(e)),
        variant: 'destructive',
      });
    } finally {
      setPageToolsBusy(false);
    }
  }, [clearPageToolsDisabledSites, t]);

  /**
   * 切换自动浏览器上下文总开关。
   *
   * 说明：
   * - 该开关只影响自动浏览器上下文采集；
   * - selection/action 与 element/action 仍由 page tools 单独控制。
   *
   * @param enabled - 目标启用状态。
   */
  const toggleBrowserContext = useCallback(async (enabled: boolean) => {
    setBrowserContextBusy(true);
    try {
      setBrowserContextEnabled(Boolean(enabled));
      setBrowserContextEnabledState(Boolean(enabled));
      if (enabled) requestBrowserContextMetadata();
    } catch (e: unknown) {
      toast({
        title: t('common.error'),
        description: formatI18nText(t, toI18nTextFromError(e)),
        variant: 'destructive',
      });
    } finally {
      setBrowserContextBusy(false);
    }
  }, [t]);

  /**
   * 把本地标签规则草稿写回策略中心。
   *
   * @param next - 新规则列表。
   */
  const persistBrowserContextTagRules = useCallback((next: BrowserContextTagRule[]) => {
    setBrowserContextTagRulesState(next);
    setBrowserContextTagRules(next);
  }, []);

  /**
   * 提交全文网页模式正文预算。
   *
   * @param nextValue - 输入框值。
   */
  const persistBrowserContextFullPagePromptChars = useCallback((nextValue: string) => {
    const nextSettings = setBrowserContextFullPagePromptChars(Number(nextValue || 0));
    setBrowserContextFullPagePromptCharsState(String(nextSettings.fullPagePromptChars));
  }, []);

  /**
   * 新增一条标签规则草稿。
   */
  const addBrowserContextTagRule = useCallback(() => {
    const maxPriority = browserContextTagRules.reduce((max, rule) => Math.max(max, rule.priority), 0);
    setBrowserContextTagRulesState((current) => [
      ...current,
      {
        id: createId(),
        tag: '',
        profileId: DEFAULT_BROWSER_CONTEXT_PROFILE_ID,
        priority: maxPriority + 1,
        enabled: true,
      },
    ]);
  }, [browserContextTagRules]);

  useEffect(() => {
    const unsubscribeSettings = subscribeBrowserContextSettingsChange(() => {
      const settings = getBrowserContextSettings();
      setBrowserContextEnabledState(settings.enabled);
      setBrowserContextFullPagePromptCharsState(String(settings.fullPagePromptChars));
    });
    const unsubscribePolicy = subscribeBrowserContextPolicyChange(() => {
      setBrowserContextTagRulesState(getBrowserContextPolicyState().tagRules);
    });
    return () => {
      unsubscribeSettings();
      unsubscribePolicy();
    };
  }, []);

  /** 当前注册方式对应的国际化标签。 */
  const methodLabel = useMemo(() => {
    const m = status?.registrationMethod ?? 'none';
    if (m === 'static') return t('sitePermissionsPanel.method.static');
    return t('sitePermissionsPanel.method.none');
  }, [status?.registrationMethod, t]);

  /** 注册方式徽章样式：不可用时降级为 secondary。 */
  const methodBadgeVariant = status?.registrationMethod === 'none' ? 'secondary' : 'default';

  /** 当前内容脚本总开关是否打开。 */
  const enabled = Boolean(status?.enabled);
  /** 当前内容脚本是否已完成注册。 */
  const registered = Boolean(status?.registered);

  /** 安装期网页访问声明状态徽章样式。 */
  const hostBadgeVariant = installTimeWebAccessDeclared ? 'default' : 'secondary';
  /** 安装期网页访问声明状态展示文案。 */
  const hostStatusText = installTimeWebAccessDeclared ? t('sitePermissionsPanel.hostAccess.installGranted') : t('sitePermissionsPanel.hostAccess.installMissing');

  return (
    <SettingsPanelRoot>
      <SettingsPanelScroller>
        <SettingsPanelInset>
          <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-1">{t('sitePermissionsPanel.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('sitePermissionsPanel.description')}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="min-w-0 p-4 rounded-lg border border-border bg-card">
          <InlineNotice icon={Shield} tone="success" surface="plain" className="mb-2 text-xs">
            {t('sitePermissionsPanel.status.injection')}
          </InlineNotice>
          <Badge variant={enabled && registered ? 'default' : 'secondary'} className="text-xs">
            {enabled && registered ? t('sitePermissionsPanel.status.staticReady') : t('sitePermissionsPanel.status.notReady')}
          </Badge>
        </div>
        <div className="min-w-0 p-4 rounded-lg border border-border bg-card">
          <InlineNotice icon={Info} tone="info" surface="plain" className="mb-2 text-xs">
            {t('sitePermissionsPanel.status.method')}
          </InlineNotice>
          <Badge
            variant={methodBadgeVariant}
            className="max-w-full min-w-0 whitespace-normal break-all rounded-lg text-[11px] leading-snug"
          >
            {methodLabel}
          </Badge>
        </div>
        <div className="min-w-0 p-4 rounded-lg border border-border bg-card">
          <InlineNotice icon={Globe} tone="warning" surface="plain" className="mb-2 text-xs">
            {t('sitePermissionsPanel.status.hostAccess')}
          </InlineNotice>
          <Badge variant={hostBadgeVariant} className="text-xs">{hostStatusText}</Badge>
        </div>
      </div>

      <div className="space-y-3 p-4 rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ScanSearch
                className="h-4 w-4 text-primary"
                strokeWidth={1.9}
                data-testid="site-permissions-technology-stack-icon"
              />
              <h4 className="text-sm font-medium">{t('sitePermissionsPanel.technologyStack.title')}</h4>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t('sitePermissionsPanel.technologyStack.desc')}</p>
          </div>
          <Badge variant="secondary" className="shrink-0 text-[11px]">
            {t('sitePermissionsPanel.technologyStack.status')}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{t('sitePermissionsPanel.technologyStack.privacy')}</p>
      </div>

      <div className="space-y-4 p-4 rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">{t('sitePermissionsPanel.browserContext.title')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('sitePermissionsPanel.browserContext.desc')}</p>
          </div>
          <Switch
            checked={browserContextEnabled}
            onCheckedChange={(value) => void toggleBrowserContext(value)}
            disabled={browserContextBusy}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t('sitePermissionsPanel.browserContext.scopeHint')}</p>
        <div className="space-y-1.5">
          <Label className="text-sm">{t('sitePermissionsPanel.browserContext.fullPagePromptCharsTitle')}</Label>
          <Input
            type="number"
            min={4000}
            step={1000}
            value={browserContextFullPagePromptChars}
            onChange={(event) => setBrowserContextFullPagePromptCharsState(event.target.value)}
            onBlur={() => persistBrowserContextFullPagePromptChars(browserContextFullPagePromptChars)}
          />
          <p className="text-xs text-muted-foreground">{t('sitePermissionsPanel.browserContext.fullPagePromptCharsHint')}</p>
        </div>
      </div>

      <div className="space-y-4 p-4 rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-sm">{t('sitePermissionsPanel.browserContext.tagRulesTitle')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('sitePermissionsPanel.browserContext.tagRulesDesc')}</p>
          </div>
          <Button variant="outline" size="sm" onClick={addBrowserContextTagRule}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t('sitePermissionsPanel.browserContext.addRule')}
          </Button>
        </div>

        {browserContextTagRules.length < 1 ? (
          <div className="text-xs text-muted-foreground">{t('sitePermissionsPanel.browserContext.emptyRules')}</div>
        ) : (
          <div className="space-y-3">
            {browserContextTagRules.map((rule) => (
              <div key={rule.id} className="grid grid-cols-1 gap-3 rounded-lg border border-border/70 p-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_120px_auto_auto]">
                <Input
                  value={rule.tag}
                  placeholder={t('sitePermissionsPanel.browserContext.tagPlaceholder')}
                  onChange={(event) => {
                    const next = browserContextTagRules.map((item) => item.id === rule.id ? { ...item, tag: event.target.value } : item);
                    setBrowserContextTagRulesState(next);
                  }}
                  onBlur={() => persistBrowserContextTagRules(browserContextTagRules)}
                />
                <Select
                  value={rule.profileId}
                  onValueChange={(value) => {
                    const next = browserContextTagRules.map((item) => item.id === rule.id ? { ...item, profileId: value } : item);
                    persistBrowserContextTagRules(next);
                  }}
                >
                  <SelectTrigger className="h-9">
                    <span className="truncate text-sm">
                      {getBrowserContextProfilePresentation(
                        BUILTIN_BROWSER_CONTEXT_PROFILES.find((profile) => profile.id === rule.profileId)
                          ?? BUILTIN_BROWSER_CONTEXT_PROFILES[0],
                        t,
                      ).title}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {BUILTIN_BROWSER_CONTEXT_PROFILES.map((profile) => {
                      const presentation = getBrowserContextProfilePresentation(profile, t);
                      return (
                        <SelectItem key={profile.id} value={profile.id} textValue={presentation.title}>
                          <div className="py-1">
                            <div className="text-sm font-medium">{presentation.title}</div>
                            <div className="text-xs text-muted-foreground">{presentation.description}</div>
                            <div className="text-[11px] text-muted-foreground/80">{presentation.detail}</div>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={String(rule.priority)}
                  onChange={(event) => {
                    const nextPriority = Number(event.target.value || 0);
                    const next = browserContextTagRules.map((item) => item.id === rule.id ? { ...item, priority: Number.isFinite(nextPriority) ? nextPriority : 0 } : item);
                    persistBrowserContextTagRules(next);
                  }}
                />
                <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2">
                  <span className="text-xs text-muted-foreground">{t('common.enabled')}</span>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(value) => {
                      const next = browserContextTagRules.map((item) => item.id === rule.id ? { ...item, enabled: value } : item);
                      persistBrowserContextTagRules(next);
                    }}
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => persistBrowserContextTagRules(browserContextTagRules.filter((item) => item.id !== rule.id))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">{t('sitePermissionsPanel.browserContext.singleWinnerHint')}</p>
      </div>

      <div className="space-y-4 p-4 rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-sm">{t('sitePermissionsPanel.pageTools.title')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('sitePermissionsPanel.pageTools.desc')}</p>
          </div>
          <Switch
            checked={pageToolsEnabled}
            onCheckedChange={(v) => void togglePageTools(v)}
            disabled={pageToolsBusy || !pageToolsLoaded}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-medium text-foreground/80">{t('sitePermissionsPanel.pageTools.disabledSitesTitle')}</div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void clearPageToolsSites()}
              disabled={pageToolsBusy || pageToolsDisabledSiteOrigins.length < 1}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {t('sitePermissionsPanel.pageTools.clearDisabledSites')}
            </Button>
          </div>
          <PageToolsDisabledSitesList
            origins={pageToolsDisabledSiteOrigins}
            busy={pageToolsBusy}
            onRestoreSite={(origin) => void restorePageToolsSite(origin)}
          />
        </div>
      </div>

      <div className="space-y-4 p-4 rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-sm">{t('sitePermissionsPanel.hostAccess.title')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('sitePermissionsPanel.hostAccess.desc')}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={busy || !runtimeAvailable}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> {t('common.refresh')}
          </Button>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          {t('sitePermissionsPanel.hostAccess.installNote')}
        </div>

        {status?.lastRegistrationError ? (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="text-xs font-medium text-foreground/80">{t('sitePermissionsPanel.debug.lastRegistrationError')}</div>
            <div className="mt-1 text-sm">{status.lastRegistrationError.message}</div>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <div>
                {t('sitePermissionsPanel.debug.errorCode')}
                {' '}
                <span className="font-mono">{status.lastRegistrationError.code}</span>
              </div>
              <div>
                {t('sitePermissionsPanel.debug.errorReason')}
                {' '}
                <span className="font-mono">{status.lastRegistrationError.reason}</span>
              </div>
              {status.lastRegistrationError.detail ? (
                <div className="break-all font-mono">{status.lastRegistrationError.detail}</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {developerModeEnabled ? (
        <div className="text-xs text-muted-foreground">
          {t('sitePermissionsPanel.debug.loader')}
          {' '}
          <span className="font-mono break-all">{(status?.bundledJs ?? []).join(', ') || '—'}</span>
        </div>
      ) : null}
          </div>
        </SettingsPanelInset>
      </SettingsPanelScroller>
    </SettingsPanelRoot>
  );
}
