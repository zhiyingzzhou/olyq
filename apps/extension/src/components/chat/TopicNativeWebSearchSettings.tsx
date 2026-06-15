/**
 * 说明：`TopicNativeWebSearchSettings` 组件模块。
 *
 * 职责：
 * - 在话题设置里渲染模型内置搜索参数；
 * - 只消费 `native-web-search-capability` 与 `native-web-search-params` 两个轻量真源；
 * - 把所有配置写回 `topic.modelParams.nativeWebSearch`，不新增 storage key。
 *
 * 边界：
 * - 这里只负责 UI 和 modelParams patch，不创建 provider tool；
 * - 未被 descriptor 标为支持的 provider 参数不展示、不下发。
 */
import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  resolveNativeWebSearchCapability,
  type NativeWebSearchCapabilityInput,
} from '@/lib/ai/native-web-search-capability';
import {
  buildModelParamsWithNativeWebSearchConfig,
  normalizeNativeWebSearchDomains,
  readNativeWebSearchProviderConfig,
  resolveNativeWebSearchParameterDescriptor,
  type AnthropicNativeWebSearchConfig,
  type NativeWebSearchContextSize,
  type NativeWebSearchUserLocation,
  type OpenAiNativeWebSearchConfig,
  type OpenRouterNativeWebSearchConfig,
  type OpenRouterNativeWebSearchEngine,
  type XaiNativeWebSearchConfig,
} from '@/lib/ai/native-web-search-params';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  PANEL_CONTROL_FOCUS_CLASS_NAME,
  SettingRow,
} from '@/components/chat/TopicPanel.settings-layout';

type NativeWebSearchUiConfig =
  | OpenAiNativeWebSearchConfig
  | AnthropicNativeWebSearchConfig
  | XaiNativeWebSearchConfig
  | OpenRouterNativeWebSearchConfig;

/** 搜索上下文尺寸选项。 */
const SEARCH_CONTEXT_SIZE_OPTIONS: ReadonlyArray<{ value: NativeWebSearchContextSize; labelKey: string }> = [
  { value: 'low', labelKey: 'topicSettings.nativeWebSearchContextLow' },
  { value: 'medium', labelKey: 'topicSettings.nativeWebSearchContextMedium' },
  { value: 'high', labelKey: 'topicSettings.nativeWebSearchContextHigh' },
];

/** OpenRouter server tool engine 选项。 */
const OPENROUTER_ENGINE_OPTIONS: ReadonlyArray<{ value: OpenRouterNativeWebSearchEngine; labelKey: string }> = [
  { value: 'auto', labelKey: 'topicSettings.nativeWebSearchEngineAuto' },
  { value: 'native', labelKey: 'topicSettings.nativeWebSearchEngineNative' },
  { value: 'exa', labelKey: 'topicSettings.nativeWebSearchEngineExa' },
  { value: 'firecrawl', labelKey: 'topicSettings.nativeWebSearchEngineFirecrawl' },
  { value: 'parallel', labelKey: 'topicSettings.nativeWebSearchEngineParallel' },
];

/** 组件入参。 */
interface TopicNativeWebSearchSettingsProps {
  /** 当前模型的 native web search 能力判型输入。 */
  readonly capabilityInput: NativeWebSearchCapabilityInput;
  /** 当前已解析的 topic.modelParams。 */
  readonly modelParams?: Record<string, unknown>;
  /** 是否禁用表单。 */
  readonly disabled?: boolean;
  /** 外部联网搜索 provider 是否已启用。 */
  readonly externalWebSearchActive?: boolean;
  /** 写回新的 modelParams。 */
  readonly onModelParamsChange: (nextModelParams: Record<string, unknown> | undefined) => void;
}

/** 域名 chip 输入控件入参。 */
interface DomainListControlProps {
  /** 控件标题。 */
  readonly label: string;
  /** 当前域名列表。 */
  readonly value: readonly string[];
  /** 输入占位文案。 */
  readonly placeholder: string;
  /** 移除按钮 aria-label 构造。 */
  readonly removeLabel: (domain: string) => string;
  /** 更新域名列表。 */
  readonly onChange: (next: string[]) => void;
  /** 可选错误文案。 */
  readonly error?: string;
  /** 是否禁用控件。 */
  readonly disabled?: boolean;
}

/** 判断两个域名列表是否存在交集。 */
function findDomainConflicts(left: readonly string[] | undefined, right: readonly string[] | undefined): string[] {
  if (!left?.length || !right?.length) return [];
  const rightSet = new Set(right);
  return left.filter((domain) => rightSet.has(domain));
}

/** 与现有设置面板一致的紧凑域名 chip 输入。 */
function DomainListControl({
  label,
  value,
  placeholder,
  removeLabel,
  onChange,
  error,
  disabled,
}: DomainListControlProps) {
  const [input, setInput] = useState('');

  /** 提交输入框中的一个或多个域名 token。 */
  const commitInput = () => {
    const domains = normalizeNativeWebSearchDomains(input);
    if (!domains?.length) {
      setInput('');
      return;
    }
    const merged = normalizeNativeWebSearchDomains([...value, ...domains]) ?? [];
    onChange(merged);
    setInput('');
  };

  /** 移除指定域名。 */
  const removeDomain = (domain: string) => {
    onChange(value.filter((item) => item !== domain));
  };

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div
        className={cn(
          'flex min-h-[2.25rem] min-w-0 cursor-text flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5',
          'focus-within:border-ring focus-within:ring-1 focus-within:ring-inset focus-within:ring-ring',
          disabled && 'cursor-not-allowed opacity-60',
        )}
        onClick={(event) => {
          if (disabled) return;
          const inputElement = event.currentTarget.querySelector('input');
          inputElement?.focus();
        }}
      >
        {value.map((domain) => (
          <span
            key={domain}
            className="inline-flex max-w-full items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-xs text-accent-foreground"
          >
            <span className="min-w-0 truncate">{domain}</span>
            <button
              type="button"
              aria-label={removeLabel(domain)}
              className="shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                removeDomain(domain);
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',' || event.key === ';') {
              event.preventDefault();
              commitInput();
            }
            if (event.key === 'Backspace' && !input && value.length > 0) {
              removeDomain(value[value.length - 1]!);
            }
          }}
          onBlur={() => {
            if (input.trim()) commitInput();
          }}
          placeholder={value.length === 0 ? placeholder : ''}
          aria-label={label}
          disabled={disabled}
          className="min-w-[7rem] max-w-full flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed"
        />
      </div>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}

/** 话题设置里的模型内置搜索参数分区。 */
export function TopicNativeWebSearchSettings({
  capabilityInput,
  modelParams,
  disabled,
  externalWebSearchActive,
  onModelParamsChange,
}: TopicNativeWebSearchSettingsProps) {
  const { t } = useTranslation();

  const descriptor = useMemo(
    () => resolveNativeWebSearchParameterDescriptor(resolveNativeWebSearchCapability(capabilityInput)),
    [capabilityInput],
  );
  const config = useMemo(() => (
    readNativeWebSearchProviderConfig(descriptor.providerKey, modelParams) as NativeWebSearchUiConfig | undefined
  ), [descriptor.providerKey, modelParams]);

  const providerKey = descriptor.providerKey;
  if (!providerKey || !descriptor.hasConfigurableFields) return null;

  /** 更新当前 provider namespace 下的模型内置搜索参数。 */
  const patchConfig = (patch: Partial<NativeWebSearchUiConfig>) => {
    if (disabled) return;
    const current = readNativeWebSearchProviderConfig(providerKey, modelParams) as NativeWebSearchUiConfig | undefined;
    const nextConfig = {
      ...(current ?? {}),
      ...patch,
    } as NativeWebSearchUiConfig;
    onModelParamsChange(buildModelParamsWithNativeWebSearchConfig({
      modelParams,
      providerKey,
      config: nextConfig,
    }));
  };

  /** 更新近似位置中的单个字段。 */
  const patchLocation = (
    key: Exclude<keyof NativeWebSearchUserLocation, 'type'>,
    value: string,
  ) => {
    const currentLocation = config && 'userLocation' in config ? config.userLocation : undefined;
    patchConfig({
      userLocation: {
        ...(currentLocation ?? { type: 'approximate' as const }),
        [key]: value.trim() || undefined,
      },
    } as Partial<NativeWebSearchUiConfig>);
  };

  const form = (config ?? {}) as {
    searchContextSize?: NativeWebSearchContextSize;
    engine?: OpenRouterNativeWebSearchEngine;
    maxResults?: number;
    maxTotalResults?: number;
    maxUses?: number;
    allowedDomains?: string[];
    blockedDomains?: string[];
    excludedDomains?: string[];
    userLocation?: NativeWebSearchUserLocation;
    externalWebAccess?: boolean;
    enableImageUnderstanding?: boolean;
  };
  const domainConflicts = findDomainConflicts(
    form.allowedDomains,
    descriptor.supportsBlockedDomains ? form.blockedDomains : form.excludedDomains,
  );
  const domainConflictText = domainConflicts.length > 0
    ? t('topicSettings.nativeWebSearchDomainConflict', { domains: domainConflicts.join(', ') })
    : undefined;

  return (
    <SettingRow
      title={t('topicSettings.nativeWebSearchParamsLabel')}
      description={t(descriptor.descriptionKey)}
      stacked
      testId="topic-settings-native-web-search"
    >
      <div className="grid gap-3">
        {externalWebSearchActive ? (
          <p className="text-[11px] leading-5 text-muted-foreground">
            {t('topicSettings.nativeWebSearchExternalProviderActive')}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {descriptor.supportsSearchContextSize ? (
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">
                {t('topicSettings.nativeWebSearchContextSize')}
              </Label>
              <Select
                value={form.searchContextSize ?? 'default'}
                onValueChange={(value) => patchConfig({
                  searchContextSize: value === 'default' ? undefined : value as NativeWebSearchContextSize,
                } as Partial<NativeWebSearchUiConfig>)}
                disabled={disabled}
              >
                <SelectTrigger
                  className={cn('h-8 rounded-md border-input bg-background text-xs', PANEL_CONTROL_FOCUS_CLASS_NAME)}
                  data-testid="topic-settings-native-web-search-context-size"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t('topicSettings.nativeWebSearchDefault')}</SelectItem>
                  {SEARCH_CONTEXT_SIZE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {descriptor.supportsEngine ? (
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">
                {t('topicSettings.nativeWebSearchEngine')}
              </Label>
              <Select
                value={form.engine ?? 'default'}
                onValueChange={(value) => patchConfig({
                  engine: value === 'default' ? undefined : value as OpenRouterNativeWebSearchEngine,
                } as Partial<NativeWebSearchUiConfig>)}
                disabled={disabled}
              >
                <SelectTrigger
                  className={cn('h-8 rounded-md border-input bg-background text-xs', PANEL_CONTROL_FOCUS_CLASS_NAME)}
                  data-testid="topic-settings-native-web-search-engine"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t('topicSettings.nativeWebSearchDefault')}</SelectItem>
                  {OPENROUTER_ENGINE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {descriptor.supportsMaxUses ? (
            <NumberControl
              label={t('topicSettings.nativeWebSearchMaxUses')}
              value={form.maxUses}
              disabled={disabled}
              testId="topic-settings-native-web-search-max-uses"
              onChange={(value) => patchConfig({ maxUses: value } as Partial<NativeWebSearchUiConfig>)}
            />
          ) : null}

          {descriptor.supportsMaxResults ? (
            <NumberControl
              label={t('topicSettings.nativeWebSearchMaxResults')}
              value={form.maxResults}
              max={25}
              disabled={disabled}
              testId="topic-settings-native-web-search-max-results"
              onChange={(value) => patchConfig({ maxResults: value } as Partial<NativeWebSearchUiConfig>)}
            />
          ) : null}

          {descriptor.supportsMaxTotalResults ? (
            <NumberControl
              label={t('topicSettings.nativeWebSearchMaxTotalResults')}
              value={form.maxTotalResults}
              disabled={disabled}
              testId="topic-settings-native-web-search-max-total-results"
              onChange={(value) => patchConfig({ maxTotalResults: value } as Partial<NativeWebSearchUiConfig>)}
            />
          ) : null}
        </div>

        {descriptor.supportsAllowedDomains ? (
          <DomainListControl
            label={t('topicSettings.nativeWebSearchAllowedDomains')}
            value={form.allowedDomains ?? []}
            placeholder={t('topicSettings.nativeWebSearchDomainsPlaceholder')}
            removeLabel={(domain) => t('topicSettings.nativeWebSearchRemoveDomain', { domain })}
            error={domainConflictText}
            disabled={disabled}
            onChange={(domains) => patchConfig({ allowedDomains: domains.length > 0 ? domains : undefined } as Partial<NativeWebSearchUiConfig>)}
          />
        ) : null}

        {descriptor.supportsBlockedDomains ? (
          <DomainListControl
            label={t('topicSettings.nativeWebSearchBlockedDomains')}
            value={form.blockedDomains ?? []}
            placeholder={t('topicSettings.nativeWebSearchDomainsPlaceholder')}
            removeLabel={(domain) => t('topicSettings.nativeWebSearchRemoveDomain', { domain })}
            error={domainConflictText}
            disabled={disabled}
            onChange={(domains) => patchConfig({ blockedDomains: domains.length > 0 ? domains : undefined } as Partial<NativeWebSearchUiConfig>)}
          />
        ) : null}

        {descriptor.supportsExcludedDomains ? (
          <DomainListControl
            label={t('topicSettings.nativeWebSearchExcludedDomains')}
            value={form.excludedDomains ?? []}
            placeholder={t('topicSettings.nativeWebSearchDomainsPlaceholder')}
            removeLabel={(domain) => t('topicSettings.nativeWebSearchRemoveDomain', { domain })}
            error={domainConflictText}
            disabled={disabled}
            onChange={(domains) => patchConfig({ excludedDomains: domains.length > 0 ? domains : undefined } as Partial<NativeWebSearchUiConfig>)}
          />
        ) : null}

        {descriptor.supportsUserLocation ? (
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t('topicSettings.nativeWebSearchUserLocation')}
            </Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <LocationInput value={form.userLocation?.country} disabled={disabled} placeholder={t('topicSettings.nativeWebSearchCountryPlaceholder')} onChange={(value) => patchLocation('country', value)} />
              <LocationInput value={form.userLocation?.region} disabled={disabled} placeholder={t('topicSettings.nativeWebSearchRegionPlaceholder')} onChange={(value) => patchLocation('region', value)} />
              <LocationInput value={form.userLocation?.city} disabled={disabled} placeholder={t('topicSettings.nativeWebSearchCityPlaceholder')} onChange={(value) => patchLocation('city', value)} />
              <LocationInput value={form.userLocation?.timezone} disabled={disabled} placeholder={t('topicSettings.nativeWebSearchTimezonePlaceholder')} onChange={(value) => patchLocation('timezone', value)} />
            </div>
          </div>
        ) : null}

        {descriptor.supportsExternalWebAccess ? (
          <SwitchControl
            label={t('topicSettings.nativeWebSearchExternalAccess')}
            description={t('topicSettings.nativeWebSearchExternalAccessDescription')}
            checked={form.externalWebAccess ?? true}
            disabled={disabled}
            testId="topic-settings-native-web-search-external-access"
            onCheckedChange={(checked) => patchConfig({ externalWebAccess: checked } as Partial<NativeWebSearchUiConfig>)}
          />
        ) : null}

        {descriptor.supportsImageUnderstanding ? (
          <SwitchControl
            label={t('topicSettings.nativeWebSearchImageUnderstanding')}
            description={t('topicSettings.nativeWebSearchImageUnderstandingDescription')}
            checked={Boolean(form.enableImageUnderstanding)}
            disabled={disabled}
            testId="topic-settings-native-web-search-image-understanding"
            onCheckedChange={(checked) => patchConfig({ enableImageUnderstanding: checked } as Partial<NativeWebSearchUiConfig>)}
          />
        ) : null}
      </div>
    </SettingRow>
  );
}

/** 紧凑数字输入。 */
function NumberControl({
  label,
  value,
  max,
  disabled,
  testId,
  onChange,
}: {
  readonly label: string;
  readonly value?: number;
  readonly max?: number;
  readonly disabled?: boolean;
  readonly testId: string;
  readonly onChange: (next: number | undefined) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        step={1}
        value={value ?? ''}
        onChange={(event) => {
          if (!event.target.value) {
            onChange(undefined);
            return;
          }
          const parsed = Math.max(1, Number.parseInt(event.target.value, 10) || 1);
          onChange(max ? Math.min(max, parsed) : parsed);
        }}
        className={cn('h-8 rounded-md border-input bg-background px-3 text-xs', PANEL_CONTROL_FOCUS_CLASS_NAME)}
        disabled={disabled}
        data-testid={testId}
      />
    </div>
  );
}

/** 紧凑位置输入。 */
function LocationInput({
  value,
  placeholder,
  disabled,
  onChange,
}: {
  readonly value?: string;
  readonly placeholder: string;
  readonly disabled?: boolean;
  readonly onChange: (next: string) => void;
}) {
  return (
    <Input
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={cn('h-8 rounded-md border-input bg-background px-3 text-xs', PANEL_CONTROL_FOCUS_CLASS_NAME)}
      disabled={disabled}
    />
  );
}

/** 紧凑开关行。 */
function SwitchControl({
  label,
  description,
  checked,
  disabled,
  testId,
  onCheckedChange,
}: {
  readonly label: string;
  readonly description: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly testId: string;
  readonly onCheckedChange: (next: boolean) => void;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="min-w-0">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        data-testid={testId}
      />
    </div>
  );
}
