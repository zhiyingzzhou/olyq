/**
 * 说明：`WebSearchPanel` 组件模块。
 *
 * 职责：
 * - 承载 `WebSearchPanel` 相关的当前文件实现与模块边界；
 * - 对外暴露 `WebSearchPanel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useMemo, useState, useEffect, useRef } from 'react';
import { Globe, Key, Hash, Server, Clock, Ban, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { getWebSearchProviderMeta, WEB_SEARCH_PROVIDER_REGISTRY } from '@/lib/web-search/provider-registry';
import type { WebSearchSettings } from '@/lib/web-search/types';
import { loadWebSearchSettings, saveWebSearchSettings, subscribeWebSearchSettingsChange } from '@/lib/web-search/settings';
import { useTranslation } from 'react-i18next';
import { formatI18nText } from '@/lib/i18n/format';
import { toI18nTextFromError } from '@/lib/i18n/error';
import { subscribeStoreReloadSignal } from '@/lib/storage/reload-signal';
import { getWebSearchNetworkHostMatchPatterns } from '@/lib/web-search/host-match-patterns';
import { SettingsPanelInset, SettingsPanelRoot, SettingsPanelScroller } from './layout';

/**
 * 联网搜索设置面板。
 *
 * 负责：
 * - 选择搜索 Provider；
 * - 维护 API key、自托管地址、结果数与过滤域名；
 * - 展示联网搜索依赖的安装期网站访问范围，并在恢复备份后重新同步设置。
 */
export function WebSearchPanel() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<WebSearchSettings>(loadWebSearchSettings);
  const [domainInput, setDomainInput] = useState('');
  const domainInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { saveWebSearchSettings(settings); }, [settings]);

  // 云同步/恢复备份后：重新从 localStorage 拉取（避免面板保持旧 state 反向覆盖新配置）
  useEffect(() => {
    /** 响应 store reload 事件，重新从持久化读取联网搜索配置。 */
    const onReload = () => setSettings(loadWebSearchSettings());
    const unsubscribe = subscribeWebSearchSettingsChange(onReload);
    const unsubscribeReload = subscribeStoreReloadSignal(onReload);
    return () => {
      unsubscribe();
      unsubscribeReload();
    };
  }, []);

  /**
   * 合并更新当前联网搜索设置。
   *
   * @param patch - 要写入的设置片段。
   */
  const update = (patch: Partial<WebSearchSettings>) =>
    setSettings(prev => ({ ...prev, ...patch }));

  const currentProvider = getWebSearchProviderMeta(settings.providerId) ?? WEB_SEARCH_PROVIDER_REGISTRY[0]!;
  const excludeDomains = Array.isArray(settings.excludeDomains) ? settings.excludeDomains : [];

  const webSearchHostRequirement = useMemo(() => {
    try {
      const patterns = getWebSearchNetworkHostMatchPatterns(currentProvider.id, settings);
      return { patterns, error: '' };
    } catch (e: unknown) {
      return { patterns: [] as string[], error: formatI18nText(t, toI18nTextFromError(e)) };
    }
  }, [currentProvider.id, settings, t]);

  /**
   * 向排除域名列表中追加一个域名。
   *
   * @param raw - 原始输入内容，允许携带协议与路径。
   */
  const addDomain = (raw: string) => {
    const domain = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!domain || excludeDomains.includes(domain)) {
      setDomainInput('');
      return;
    }
    update({ excludeDomains: [...excludeDomains, domain] });
    setDomainInput('');
  };

  /**
   * 从排除域名列表中移除一个域名。
   *
   * @param domain - 目标域名。
   */
  const removeDomain = (domain: string) => {
    update({ excludeDomains: excludeDomains.filter(d => d !== domain) });
  };

  /**
   * 处理域名输入框快捷键。
   *
   * @param e - 输入框键盘事件。
   */
  const handleDomainKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addDomain(domainInput);
    } else if (e.key === 'Backspace' && !domainInput && excludeDomains.length > 0) {
      removeDomain(excludeDomains[excludeDomains.length - 1]!);
    }
  };

  return (
    <SettingsPanelRoot>
      <SettingsPanelScroller>
        <SettingsPanelInset>
          <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Globe className="h-5 w-5" /> {t('webSearch.title')}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t('webSearch.description')}
        </p>
      </div>

      <div className="space-y-2">
        <Label>{t('webSearch.engine')}</Label>
        <Select value={currentProvider.id} onValueChange={v => update({ providerId: v as WebSearchSettings['providerId'] })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WEB_SEARCH_PROVIDER_REGISTRY.map((provider) => (
              <SelectItem key={provider.id} value={provider.id}>{t(provider.labelKey)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t(currentProvider.descKey)}</p>
      </div>

      {/* 网络目标预览：所选 provider 的 host 访问范围 */}
      {(webSearchHostRequirement.patterns.length > 0 || webSearchHostRequirement.error) && (
        <div className="space-y-2">
          <Label>{t('webSearch.permissions.title')}</Label>
          {webSearchHostRequirement.error ? (
            <p className="text-xs text-destructive">{webSearchHostRequirement.error}</p>
          ) : (
            <>
              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">{t('webSearch.permissions.hint')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {webSearchHostRequirement.patterns.map((pattern) => (
                    <span key={pattern} className="rounded-md border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {pattern}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* API 密钥配置（各 provider 独立字段，互不影响） */}
      {currentProvider.kind === 'apiKey' && currentProvider.apiKeyField && (
        <div className="space-y-2">
          <Label className="flex items-center gap-1">
            <Key className="h-3.5 w-3.5" /> {t('webSearch.settings.apiKeyLabel')}
          </Label>
          <Input
            type="password"
            placeholder={currentProvider.apiKeyPlaceholder}
            value={(settings[currentProvider.apiKeyField] as string) || ''}
            onChange={e => update({ [currentProvider.apiKeyField as keyof WebSearchSettings]: e.target.value } as Partial<WebSearchSettings>)}
          />
          {currentProvider.apiKeyLink ? (
            <p className="text-xs text-muted-foreground">
              {t('webSearch.settings.getApiKeyPrefix')} <a href={currentProvider.apiKeyLink} target="_blank" rel="noreferrer" className="underline">{currentProvider.apiKeyLink}</a>
            </p>
          ) : null}
        </div>
      )}

      {/* SearXNG URL 配置 */}
      {currentProvider.kind === 'url' && currentProvider.urlField && (
        <div className="space-y-2">
          <Label className="flex items-center gap-1">
            <Server className="h-3.5 w-3.5" /> {t('webSearch.settings.instanceUrl')}
          </Label>
          <Input
            type="url"
            placeholder={currentProvider.urlPlaceholder}
            value={(settings[currentProvider.urlField] as string) || ''}
            onChange={e => update({ [currentProvider.urlField as keyof WebSearchSettings]: e.target.value } as Partial<WebSearchSettings>)}
          />
          <p className="text-xs text-muted-foreground">
            {t('webSearch.settings.docsPrefix')} <a href={currentProvider.urlDocsLink} target="_blank" rel="noreferrer" className="underline">{currentProvider.urlDocsLink?.replace(/^https?:\/\//, '')}</a>
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label className="flex items-center gap-1">
          <Hash className="h-3.5 w-3.5" /> {t('webSearch.maxResults')}
        </Label>
        <Input
          type="number"
          min={1}
          max={20}
          value={settings.maxResults}
          onChange={e => update({ maxResults: Math.max(1, Math.min(20, Number(e.target.value) || 5)) })}
          className="w-24"
        />
      </div>

      {/* 追加当前日期 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="search-with-time" className="flex items-center gap-1.5 cursor-pointer">
            <Clock className="h-3.5 w-3.5" /> {t('webSearch.settings.searchWithTimeLabel')}
          </Label>
          <Switch
            id="search-with-time"
            checked={settings.searchWithTime ?? true}
            onCheckedChange={v => update({ searchWithTime: v })}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t('webSearch.settings.searchWithTimeDesc')}</p>
      </div>

      {/* 域名黑名单 */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1">
          <Ban className="h-3.5 w-3.5" /> {t('webSearch.settings.excludeDomainsLabel')}
        </Label>
        <div
          className="flex flex-wrap gap-1.5 border rounded-md px-2 py-1.5 min-h-[38px] cursor-text focus-within:ring-1 focus-within:ring-ring"
          onClick={() => domainInputRef.current?.focus()}
        >
          {excludeDomains.map(d => (
            <span
              key={d}
              className="inline-flex items-center gap-1 text-xs bg-accent text-accent-foreground rounded px-1.5 py-0.5"
            >
              {d}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeDomain(d); }}
                className="hover:text-destructive transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            ref={domainInputRef}
            value={domainInput}
            onChange={e => setDomainInput(e.target.value)}
            onKeyDown={handleDomainKeyDown}
            onBlur={() => { if (domainInput.trim()) addDomain(domainInput); }}
            placeholder={excludeDomains.length === 0 ? t('webSearch.settings.excludeDomainsPlaceholder') : ''}
            className="flex-1 min-w-[180px] bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        <p className="text-xs text-muted-foreground">{t('webSearch.settings.excludeDomainsDesc')}</p>
      </div>
          </div>
        </SettingsPanelInset>
      </SettingsPanelScroller>
    </SettingsPanelRoot>
  );
}
