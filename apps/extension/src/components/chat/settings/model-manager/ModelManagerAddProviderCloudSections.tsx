/**
 * 说明：`ModelManagerAddProviderCloudSections` 组件模块。
 *
 * 职责：
 * - 承载 Bedrock 与 Vertex AI 这类云厂商专用鉴权配置区；
 * - 复用 Add Provider 表单现有 Field、Input、Textarea、SelectPanel 交互，不引入外部表单风格；
 * - 只负责字段展示与局部 patch，不承担保存、secret 分离或运行时 SDK 映射。
 *
 * 边界：
 * - Bedrock / Vertex 的存储结构仍由 provider schema 与保存链路收口；
 * - Vertex Anthropic 在 UI 层只暴露 service account，运行时仍由 adapter 做最终守卫。
 */
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ProviderConfig } from '@/lib/ai/types';

import type { BedrockConfig, VertexConfig } from './model-manager-types';
import { Field, SelectPanel } from './ModelManagerAddProviderSections';

/** Add Provider Bedrock 区。 */
export function BedrockSection({
  bedrock,
  onPatch,
}: {
  readonly bedrock?: BedrockConfig;
  readonly onPatch: (value: BedrockConfig) => void;
}) {
  const { t } = useTranslation();
  const current = bedrock ?? { authType: 'iam', region: '' };
  const authType = current.authType ?? 'iam';
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="space-y-1">
        <div className="text-sm font-medium">{t('modelManagerPanel.bedrock.title')}</div>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('modelManagerPanel.bedrock.sectionHint')}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SelectPanel
          label={t('modelManagerPanel.bedrock.authType')}
          description={t('modelManagerPanel.bedrock.authTypeHint')}
          placeholder=""
          value={authType}
          options={[
            { value: 'iam', label: t('modelManagerPanel.bedrock.authTypeOptions.iam') },
            { value: 'apiKey', label: t('modelManagerPanel.bedrock.authTypeOptions.apiKey') },
          ]}
          onChange={(value) => onPatch({ ...current, authType: value as BedrockConfig['authType'] })}
        />
        <Field
          label={t('modelManagerPanel.bedrock.region')}
          description={t('modelManagerPanel.bedrock.regionHint')}
        >
          <Input
            value={current.region}
            onChange={(event) => onPatch({ ...current, region: event.target.value })}
            className="h-9 text-sm font-mono"
            placeholder="us-east-1"
          />
        </Field>
      </div>
      {authType === 'apiKey' ? (
        <Field
          label={t('modelManagerPanel.bedrock.apiKey')}
          description={t('modelManagerPanel.bedrock.apiKeyHint')}
        >
          <Input
            type="password"
            value={current.apiKey ?? ''}
            onChange={(event) => onPatch({ ...current, apiKey: event.target.value })}
            className="h-9 text-sm font-mono"
          />
        </Field>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label={t('modelManagerPanel.bedrock.accessKeyId')}
            description={t('modelManagerPanel.bedrock.accessKeyIdHint')}
          >
            <Input
              value={current.accessKeyId ?? ''}
              onChange={(event) => onPatch({ ...current, accessKeyId: event.target.value })}
              className="h-9 text-sm font-mono"
            />
          </Field>
          <Field
            label={t('modelManagerPanel.bedrock.secretAccessKey')}
            description={t('modelManagerPanel.bedrock.secretAccessKeyHint')}
          >
            <Input
              type="password"
              value={current.secretAccessKey ?? ''}
              onChange={(event) => onPatch({ ...current, secretAccessKey: event.target.value })}
              className="h-9 text-sm font-mono"
            />
          </Field>
          <Field
            label={t('modelManagerPanel.bedrock.sessionToken')}
            description={t('modelManagerPanel.bedrock.sessionTokenHint')}
          >
            <Input
              value={current.sessionToken ?? ''}
              onChange={(event) => onPatch({ ...current, sessionToken: event.target.value })}
              className="h-9 text-sm font-mono"
            />
          </Field>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t('modelManagerPanel.bedrock.hint')}</p>
    </div>
  );
}

/** Add Provider Vertex 区。 */
export function VertexSection({
  vertex,
  providerType,
  onPatch,
}: {
  readonly vertex?: VertexConfig;
  readonly providerType: ProviderConfig['type'];
  readonly onPatch: (value: VertexConfig) => void;
}) {
  const { t } = useTranslation();
  const isVertexAnthropic = providerType === 'vertex-anthropic';
  const current = vertex ?? { authType: 'serviceAccount' as const, projectId: '', location: '', serviceAccount: { clientEmail: '', privateKey: '' } };
  const authType = isVertexAnthropic ? 'serviceAccount' : current.authType ?? 'serviceAccount';
  const serviceAccount = current.serviceAccount ?? { clientEmail: '', privateKey: '', privateKeyId: '' };
  const serviceAccountConfig: VertexConfig = {
    authType: 'serviceAccount',
    projectId: current.projectId ?? '',
    location: current.location ?? '',
    serviceAccount,
  };
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="space-y-1">
        <div className="text-sm font-medium">{t('modelManagerPanel.vertex.title')}</div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {isVertexAnthropic
            ? t('modelManagerPanel.vertex.sectionHintAnthropic')
            : t('modelManagerPanel.vertex.sectionHint')}
        </p>
      </div>
      {isVertexAnthropic ? null : (
        <SelectPanel
          label={t('modelManagerPanel.vertex.authType')}
          description={t('modelManagerPanel.vertex.authTypeHint')}
          placeholder=""
          value={authType}
          options={[
            { value: 'serviceAccount', label: t('modelManagerPanel.vertex.authTypeOptions.serviceAccount') },
            { value: 'apiKey', label: t('modelManagerPanel.vertex.authTypeOptions.apiKey') },
          ]}
          onChange={(value) => {
            if (value === 'apiKey') {
              onPatch({ authType: 'apiKey', apiKey: current.apiKey ?? '' });
              return;
            }
            onPatch(serviceAccountConfig);
          }}
        />
      )}
      {authType === 'apiKey' ? (
        <Field
          label={t('modelManagerPanel.vertex.apiKey')}
          description={t('modelManagerPanel.vertex.apiKeyHint')}
        >
          <Input
            type="password"
            value={current.apiKey ?? ''}
            onChange={(event) => onPatch({ authType: 'apiKey', apiKey: event.target.value })}
            className="h-9 text-sm font-mono"
          />
        </Field>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              label={t('modelManagerPanel.vertex.projectId')}
              description={t('modelManagerPanel.vertex.projectIdHint')}
            >
              <Input
                value={current.projectId ?? ''}
                onChange={(event) => onPatch({ ...serviceAccountConfig, projectId: event.target.value })}
                className="h-9 text-sm font-mono"
              />
            </Field>
            <Field
              label={t('modelManagerPanel.vertex.location')}
              description={t('modelManagerPanel.vertex.locationHint')}
            >
              <Input
                value={current.location ?? ''}
                onChange={(event) => onPatch({ ...serviceAccountConfig, location: event.target.value })}
                className="h-9 text-sm font-mono"
                placeholder="us-central1"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              label={t('modelManagerPanel.vertex.clientEmail')}
              description={t('modelManagerPanel.vertex.clientEmailHint')}
            >
              <Input
                value={serviceAccount.clientEmail}
                onChange={(event) => onPatch({
                  ...serviceAccountConfig,
                  serviceAccount: { ...serviceAccount, clientEmail: event.target.value },
                })}
                className="h-9 text-sm font-mono"
              />
            </Field>
            <Field
              label={t('modelManagerPanel.vertex.privateKeyId')}
              description={t('modelManagerPanel.vertex.privateKeyIdHint')}
            >
              <Input
                value={serviceAccount.privateKeyId ?? ''}
                onChange={(event) => onPatch({
                  ...serviceAccountConfig,
                  serviceAccount: { ...serviceAccount, privateKeyId: event.target.value },
                })}
                className="h-9 text-sm font-mono"
              />
            </Field>
          </div>
          <Field
            label={t('modelManagerPanel.vertex.privateKey')}
            description={t('modelManagerPanel.vertex.privateKeyHint')}
          >
            <Textarea
              value={serviceAccount.privateKey}
              onChange={(event) => onPatch({
                ...serviceAccountConfig,
                serviceAccount: { ...serviceAccount, privateKey: event.target.value },
              })}
              className="min-h-[120px] text-xs font-mono"
              placeholder={t('modelManagerPanel.vertex.privateKeyPlaceholder')}
            />
          </Field>
        </>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {isVertexAnthropic ? t('modelManagerPanel.vertex.hintAnthropic') : t('modelManagerPanel.vertex.hint')}
      </p>
    </div>
  );
}
