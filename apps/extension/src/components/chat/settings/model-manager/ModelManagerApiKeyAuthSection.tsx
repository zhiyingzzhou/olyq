/**
 * 说明：`ModelManagerApiKeyAuthSection` 组件模块。
 *
 * 职责：
 * - 承载 Add/Edit Provider 的 API Key 鉴权 header 配置区；
 * - 对外暴露 `ModelManagerApiKeyAuthSection`，供 provider 表单高级配置复用；
 *
 * 边界：
 * - 本文件只处理 API Key 鉴权 UI，不负责运行时请求头生成；
 * - 保存前最终清洗仍由 `provider-form` 与 `ProviderConfigSchema` 负责。
 */
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { isValidHttpHeaderName } from '@/lib/ai/provider-auth';
import type { ProviderConfig } from '@/lib/ai/types';

import { Field, SelectPanel } from './ModelManagerAddProviderSections';

type ApiKeyAuthPreset = 'default' | 'authorization-bearer' | 'x-api-key' | 'x-goog-api-key' | 'api-key' | 'xi-api-key' | 'custom';

const API_KEY_AUTH_PRESETS: ReadonlyArray<{ readonly value: ApiKeyAuthPreset; readonly labelKey: string }> = [
  { value: 'default', labelKey: 'default' },
  { value: 'authorization-bearer', labelKey: 'authorizationBearer' },
  { value: 'x-api-key', labelKey: 'xApiKey' },
  { value: 'x-goog-api-key', labelKey: 'xGoogApiKey' },
  { value: 'api-key', labelKey: 'apiKey' },
  { value: 'xi-api-key', labelKey: 'xiApiKey' },
  { value: 'custom', labelKey: 'custom' },
] as const;

/** 根据表单中的鉴权配置识别当前预设。 */
function resolveApiKeyAuthPreset(value?: ProviderConfig['apiKeyAuth']): ApiKeyAuthPreset {
  if (!value) return 'default';
  const headerName = String(value.headerName || '').trim().toLowerCase();
  const valuePrefix = String(value.valuePrefix || '').trim();
  if (headerName === 'authorization' && valuePrefix === 'Bearer') return 'authorization-bearer';
  if (headerName === 'x-api-key' && !valuePrefix) return 'x-api-key';
  if (headerName === 'x-goog-api-key' && !valuePrefix) return 'x-goog-api-key';
  if (headerName === 'api-key' && !valuePrefix) return 'api-key';
  if (headerName === 'xi-api-key' && !valuePrefix) return 'xi-api-key';
  return 'custom';
}

/** 把鉴权预设转换为可落库的自定义配置；默认预设返回 undefined。 */
function createApiKeyAuthFromPreset(preset: ApiKeyAuthPreset): ProviderConfig['apiKeyAuth'] | undefined {
  switch (preset) {
    case 'authorization-bearer':
      return { headerName: 'Authorization', valuePrefix: 'Bearer' };
    case 'x-api-key':
      return { headerName: 'x-api-key' };
    case 'x-goog-api-key':
      return { headerName: 'x-goog-api-key' };
    case 'api-key':
      return { headerName: 'api-key' };
    case 'xi-api-key':
      return { headerName: 'xi-api-key' };
    case 'custom':
      return { headerName: '' };
    case 'default':
    default:
      return undefined;
  }
}

/** Add/Edit Provider API Key 鉴权 header 区。 */
export function ModelManagerApiKeyAuthSection({
  value,
  onChange,
}: {
  readonly value?: ProviderConfig['apiKeyAuth'];
  readonly onChange: (value: ProviderConfig['apiKeyAuth'] | undefined) => void;
}) {
  const { t } = useTranslation();
  const preset = resolveApiKeyAuthPreset(value);
  const headerName = value?.headerName ?? '';
  const valuePrefix = value?.valuePrefix ?? '';
  const customHeaderInvalid = preset === 'custom'
    && headerName.trim().length > 0
    && (!isValidHttpHeaderName(headerName) || /^content-type$/i.test(headerName));

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="space-y-1">
        <div className="text-sm font-medium">{t('modelManagerPanel.apiKeyAuth.title')}</div>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('modelManagerPanel.apiKeyAuth.hint')}</p>
      </div>
      <SelectPanel
        label={t('modelManagerPanel.apiKeyAuth.preset')}
        placeholder={t('modelManagerPanel.apiKeyAuth.preset')}
        value={preset}
        options={API_KEY_AUTH_PRESETS.map((option) => ({
          value: option.value,
          label: t(`modelManagerPanel.apiKeyAuth.presets.${option.labelKey}`),
        }))}
        onChange={(nextPreset) => onChange(createApiKeyAuthFromPreset(nextPreset as ApiKeyAuthPreset))}
      />
      {preset === 'custom' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label={t('modelManagerPanel.apiKeyAuth.headerName')}
            description={customHeaderInvalid ? t('modelManagerPanel.apiKeyAuth.invalidHeader') : undefined}
          >
            <Input
              value={headerName}
              onChange={(event) => onChange({
                headerName: event.target.value,
                ...(valuePrefix.trim() ? { valuePrefix } : {}),
              })}
              placeholder="Authorization"
              className="h-9 text-sm font-mono"
            />
          </Field>
          <Field
            label={t('modelManagerPanel.apiKeyAuth.valuePrefix')}
            help={t('modelManagerPanel.apiKeyAuth.valuePrefixHint')}
          >
            <Input
              value={valuePrefix}
              onChange={(event) => onChange({
                headerName,
                ...(event.target.value.trim() ? { valuePrefix: event.target.value } : {}),
              })}
              placeholder="Bearer"
              className="h-9 text-sm font-mono"
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}
