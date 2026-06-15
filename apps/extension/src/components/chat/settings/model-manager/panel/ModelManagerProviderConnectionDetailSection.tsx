/**
 * 说明：`ModelManagerProviderConnectionDetailSection` 组件模块。
 *
 * 职责：
 * - 在模型管理右侧 Provider 详情页暴露非云专用、但会影响连通性的 Provider 连接字段；
 * - 当前只覆盖 Azure OpenAI 的 API 形态 / API Version，以及 NewAPI 的 Anthropic Messages upstream；
 * - 复用详情页现有紧凑布局和 shadcn 输入控件，不引入 Cherry Studio 表单视觉。
 *
 * 边界：
 * - 本组件只负责详情页编辑体验和局部 provider patch；
 * - 不新增存储 schema，复用 `apiVersion`、`apiOptions.isNotSupportAPIVersion` 与 `anthropicApiHost`；
 * - 运行时参数映射继续由各 provider adapter 管理。
 */
import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { HelpTip, type Provider } from '@/components/chat/settings/model-manager/shared';

type UpdateProvider = (id: string, patch: Partial<Provider>) => void;

type AzureApiShape = 'deployment' | 'v1';

/** 详情页紧凑字段容器。 */
function DetailField({
  label,
  help,
  htmlFor,
  children,
}: {
  readonly label: string;
  readonly help?: string;
  readonly htmlFor?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <Label htmlFor={htmlFor} className="text-sm font-medium leading-none">
          {label}
        </Label>
        {help ? <HelpTip content={help} /> : null}
      </div>
      {children}
    </div>
  );
}

/** 把多段说明合并进同一个 tooltip，避免详情页常驻长描述挤占表单空间。 */
function joinHelpText(...values: ReadonlyArray<string | undefined>): string {
  return values.map((value) => String(value || '').trim()).filter(Boolean).join('\n\n');
}

/** 详情页连接配置区标题。 */
function DetailSectionTitle({
  title,
  help,
}: {
  readonly title: string;
  readonly help?: string;
}) {
  return (
    <div className="flex items-center gap-1 text-sm font-medium">
      <span>{title}</span>
      {help ? <HelpTip content={help} contentClassName="max-w-sm" /> : null}
    </div>
  );
}

/** 返回去掉 Azure api-version flag 后的 apiOptions。 */
function clearAzureSkipApiVersionFlag(provider: Provider): Provider['apiOptions'] | undefined {
  const { isNotSupportAPIVersion: _skipApiVersion, ...rest } = provider.apiOptions ?? {};
  return Object.keys(rest).length > 0 ? rest : undefined;
}

/** 详情页 Azure / NewAPI 连接配置区。 */
export function ModelManagerProviderConnectionDetailSection({
  provider,
  t,
  updateProvider,
}: {
  readonly provider: Provider;
  readonly t: TFunction;
  readonly updateProvider: UpdateProvider;
}) {
  if (provider.type === 'azure-openai') {
    return (
      <AzureOpenAiConnectionSection
        provider={provider}
        t={t}
        updateProvider={updateProvider}
      />
    );
  }

  if (provider.type === 'new-api') {
    return (
      <NewApiConnectionSection
        provider={provider}
        t={t}
        updateProvider={updateProvider}
      />
    );
  }

  return null;
}

/** Azure OpenAI 详情页连接配置区。 */
function AzureOpenAiConnectionSection({
  provider,
  t,
  updateProvider,
}: {
  readonly provider: Provider;
  readonly t: TFunction;
  readonly updateProvider: UpdateProvider;
}) {
  const apiShape: AzureApiShape = provider.apiOptions?.isNotSupportAPIVersion === true ? 'v1' : 'deployment';
  /** 切换 Azure endpoint 形态时彻底清理另一模式的隐藏字段，避免运行时保留双真源。 */
  const onShapeChange = (value: AzureApiShape) => {
    if (value === 'v1') {
      updateProvider(provider.id, {
        apiVersion: undefined,
        apiOptions: {
          ...(provider.apiOptions ?? {}),
          isNotSupportAPIVersion: true,
        },
      });
      return;
    }

    updateProvider(provider.id, {
      apiOptions: clearAzureSkipApiVersionFlag(provider),
    });
  };

  return (
    <div data-testid="model-manager-connection-config-section" className="shrink-0 space-y-3">
      <DetailSectionTitle
        title={t('modelManagerPanel.azure.title')}
        help={joinHelpText(t('modelManagerPanel.azure.sectionHint'), t('modelManagerPanel.azure.hint'))}
      />
      <DetailField
        label={t('modelManagerPanel.azure.apiShape')}
        help={t('modelManagerPanel.azure.apiShapeHint')}
      >
        <Select value={apiShape} onValueChange={(value) => onShapeChange(value as AzureApiShape)}>
          <SelectTrigger aria-label={t('modelManagerPanel.azure.apiShape')} className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="deployment">{t('modelManagerPanel.azure.apiShapeOptions.deployment')}</SelectItem>
            <SelectItem value="v1">{t('modelManagerPanel.azure.apiShapeOptions.v1')}</SelectItem>
          </SelectContent>
        </Select>
      </DetailField>
      {apiShape === 'deployment' ? (
        <DetailField
          label={t('modelManagerPanel.azure.apiVersion')}
          help={t('modelManagerPanel.azure.apiVersionHint')}
          htmlFor="provider-detail-azure-api-version"
        >
          <Input
            id="provider-detail-azure-api-version"
            value={provider.apiVersion ?? ''}
            onChange={(event) => updateProvider(provider.id, { apiVersion: event.target.value })}
            placeholder={t('modelManagerPanel.azure.apiVersionPlaceholder')}
            className="h-9 text-sm font-mono"
          />
        </DetailField>
      ) : null}
    </div>
  );
}

/** NewAPI 详情页连接配置区。 */
function NewApiConnectionSection({
  provider,
  t,
  updateProvider,
}: {
  readonly provider: Provider;
  readonly t: TFunction;
  readonly updateProvider: UpdateProvider;
}) {
  return (
    <div data-testid="model-manager-connection-config-section" className="shrink-0 space-y-3">
      <DetailSectionTitle
        title={t('modelManagerPanel.newApi.title')}
        help={joinHelpText(t('modelManagerPanel.newApi.sectionHint'), t('modelManagerPanel.newApi.hint'))}
      />
      <DetailField
        label={t('modelManagerPanel.newApi.anthropicApiHost')}
        help={t('modelManagerPanel.newApi.anthropicApiHostHint')}
        htmlFor="provider-detail-new-api-anthropic-api-host"
      >
        <Input
          id="provider-detail-new-api-anthropic-api-host"
          value={provider.anthropicApiHost ?? ''}
          onChange={(event) => {
            const next = event.target.value;
            updateProvider(provider.id, { anthropicApiHost: next ? next : undefined });
          }}
          placeholder={t('modelManagerPanel.newApi.anthropicApiHostPlaceholder')}
          className="h-9 text-sm font-mono"
        />
      </DetailField>
    </div>
  );
}
