/**
 * 说明：`ModelManagerAddProviderSections` 组件模块。
 *
 * 职责：
 * - 承载 `ModelManagerAddProviderSections` 相关的当前文件实现与模块边界；
 * - 对外暴露 `Field`、`CompatibilityGrid`、`ServiceTierVerbosity` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { ProviderConfig } from '@/lib/ai/types';

import type {
  AnthropicCacheControl,
  ProviderApiOptions,
} from './model-manager-types';
import { HelpTip } from './shared';

const TRANSPORT_COMPATIBILITY_OPTIONS = [
  { value: 'isNotSupportImageInput', labelKey: 'isNotSupportImageInput' },
  { value: 'isNotSupportFileInput', labelKey: 'isNotSupportFileInput' },
  { value: 'isNotSupportStreamOptions', labelKey: 'isNotSupportStreamOptions' },
  { value: 'isSupportDeveloperRole', labelKey: 'isSupportDeveloperRole' },
  { value: 'isSupportServiceTier', labelKey: 'isSupportServiceTier' },
  { value: 'isNotSupportEnableThinking', labelKey: 'isNotSupportEnableThinking' },
  { value: 'isNotSupportVerbosity', labelKey: 'isNotSupportVerbosity' },
  { value: 'isNotSupportAPIVersion', labelKey: 'isNotSupportAPIVersion' },
] as const satisfies ReadonlyArray<{ value: keyof ProviderApiOptions; labelKey: string }>;

const DEFAULT_COMPATIBILITY_VALUES: Partial<Record<keyof ProviderApiOptions, boolean>> = {
  isSupportServiceTier: true,
};

const RESET_COMPATIBILITY_PATCH: Partial<ProviderApiOptions> = {
  isNotSupportImageInput: undefined,
  isNotSupportFileInput: undefined,
  isNotSupportStreamOptions: undefined,
  isSupportDeveloperRole: undefined,
  isSupportServiceTier: undefined,
  isNotSupportEnableThinking: undefined,
  isNotSupportVerbosity: undefined,
  isNotSupportAPIVersion: undefined,
};

/** Add Provider 通用字段包装。 */
export function Field({
  label,
  description,
  help,
  required,
  children,
}: {
  readonly label: string;
  readonly description?: string;
  readonly help?: string;
  readonly required?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="flex items-center gap-1 text-sm font-medium leading-none">
          {required ? <span className="text-destructive">*</span> : null}
          <span>{label}</span>
          {help ? <HelpTip content={help} /> : null}
        </Label>
        {description ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Add Provider API 兼容性区。 */
export function CompatibilityGrid({
  apiOptions,
  onPatch,
}: {
  readonly apiOptions?: ProviderApiOptions;
  readonly onPatch: (value: Partial<ProviderApiOptions>) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 rounded-lg border border-border bg-background/40 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t('modelManagerPanel.apiOptions.title')}</span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => onPatch(RESET_COMPATIBILITY_PATCH)}
          disabled={!apiOptions}
        >
          {t('modelManagerPanel.apiOptions.reset')}
        </Button>
      </div>
      <div className="space-y-3">
        {TRANSPORT_COMPATIBILITY_OPTIONS.map((option) => (
          <div key={option.value} className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm">{t(`modelManagerPanel.apiOptions.${option.labelKey}`)}</div>
              <div className="text-xs text-muted-foreground">{t(`modelManagerPanel.apiOptions.${option.labelKey}Hint`)}</div>
            </div>
            <Switch
              checked={apiOptions?.[option.value] ?? DEFAULT_COMPATIBILITY_VALUES[option.value] ?? false}
              onCheckedChange={(value) => onPatch({ [option.value]: Boolean(value) })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Add Provider 服务等级与 verbosity 区。 */
export function ServiceTierVerbosity({
  serviceTier,
  verbosity,
  onServiceTier,
  onVerbosity,
}: {
  readonly serviceTier?: ProviderConfig['serviceTier'];
  readonly verbosity?: ProviderConfig['verbosity'];
  readonly onServiceTier: (value: ProviderConfig['serviceTier']) => void;
  readonly onVerbosity: (value: ProviderConfig['verbosity']) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="space-y-1">
        <div className="text-sm font-medium">{t('modelManagerPanel.providerOptions.title')}</div>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('modelManagerPanel.providerOptions.hint')}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SelectPanel
          label={t('modelManagerPanel.providerOptions.serviceTier')}
          description={t('modelManagerPanel.providerOptions.serviceTierHint')}
          placeholder={t('modelManagerPanel.providerOptions.serviceTierPlaceholder')}
          value={serviceTier ?? '__unset__'}
          options={[
            { value: '__unset__', label: t('modelManagerPanel.providerOptions.unset') },
            { value: 'auto', label: 'auto' },
            { value: 'default', label: 'default' },
            { value: 'flex', label: 'flex' },
            { value: 'priority', label: 'priority' },
            { value: 'on_demand', label: 'on_demand' },
          ]}
          onChange={(value) => onServiceTier(value === '__unset__' ? undefined : (value as ProviderConfig['serviceTier']))}
        />
        <SelectPanel
          label={t('modelManagerPanel.providerOptions.verbosity')}
          description={t('modelManagerPanel.providerOptions.verbosityHint')}
          placeholder={t('modelManagerPanel.providerOptions.verbosityPlaceholder')}
          value={verbosity ?? '__unset__'}
          options={[
            { value: '__unset__', label: t('modelManagerPanel.providerOptions.unset') },
            { value: 'low', label: 'low' },
            { value: 'medium', label: 'medium' },
            { value: 'high', label: 'high' },
          ]}
          onChange={(value) => onVerbosity(value === '__unset__' ? undefined : (value as ProviderConfig['verbosity']))}
        />
      </div>
    </div>
  );
}

/** Add Provider Anthropic cache control 区。 */
export function AnthropicCacheControlSection({
  control,
  onPatch,
}: {
  readonly control?: AnthropicCacheControl;
  readonly onPatch: (value: AnthropicCacheControl | undefined) => void;
}) {
  const { t } = useTranslation();
  const next = control ?? { tokenThreshold: 0, cacheSystemMessage: true, cacheLastNMessages: 0 };
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{t('modelManagerPanel.anthropicCache.title')}</div>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onPatch(undefined)} disabled={!control}>
          {t('modelManagerPanel.anthropicCache.reset')}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <NumberInput
          label={t('modelManagerPanel.anthropicCache.tokenThreshold')}
          value={next.tokenThreshold}
          onChange={(value) => onPatch({ ...next, tokenThreshold: value })}
        />
        <ToggleBound
          label={t('modelManagerPanel.anthropicCache.cacheSystem')}
          checked={next.cacheSystemMessage}
          onToggle={(value) => onPatch({ ...next, cacheSystemMessage: value })}
        />
        <NumberInput
          label={t('modelManagerPanel.anthropicCache.cacheLastN')}
          value={next.cacheLastNMessages}
          onChange={(value) => onPatch({ ...next, cacheLastNMessages: value })}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t('modelManagerPanel.anthropicCache.hint')}</p>
    </div>
  );
}

/**
 * 通用下拉选择面板。
 *
 * 说明：
 * - 供 Add Provider 表单中多个“枚举值设置项”复用；
 * - 只负责展示和回传字符串值，不承担业务级转换。
 */
export function SelectPanel({
  label,
  description,
  placeholder,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly description?: string;
  readonly placeholder: string;
  readonly value: string;
  readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-sm font-medium">{label}</Label>
        {description ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="h-9 text-sm">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} className="text-sm">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Add Provider 表单里的数字输入块，会自动把输入收敛成非负整数。 */
function NumberInput({
  label,
  description,
  value,
  onChange,
}: {
  readonly label: string;
  readonly description?: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-sm font-medium">{label}</Label>
        {description ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <Input
        type="number"
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Number.isFinite(next) ? Math.max(0, Math.floor(next)) : 0);
        }}
        className="h-9 text-sm font-mono"
      />
    </div>
  );
}

/** Add Provider 表单里的布尔开关块。 */
function ToggleBound({
  label,
  description,
  checked,
  onToggle,
}: {
  readonly label: string;
  readonly description?: string;
  readonly checked: boolean;
  readonly onToggle: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border px-3 py-3">
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-sm">{label}</span>
          {description ? <HelpTip content={description} /> : null}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onToggle} />
    </div>
  );
}
