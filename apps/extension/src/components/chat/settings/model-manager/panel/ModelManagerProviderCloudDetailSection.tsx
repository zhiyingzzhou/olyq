/**
 * 说明：`ModelManagerProviderCloudDetailSection` 组件模块。
 *
 * 职责：
 * - 在模型管理右侧详情页直接暴露 Bedrock / Vertex 的专用鉴权配置；
 * - 复用当前详情页的紧凑表单风格，不引入 Add Provider 弹窗布局或 Cherry Studio 表单样式；
 * - 让 API Key / 私钥类字段先停留在本地草稿，blur 或 Enter 后再写回 provider 配置。
 *
 * 边界：
 * - 本组件只处理详情页字段展示与局部 patch；
 * - schema、secret 拆分和 runtime SDK 映射仍由 AI provider 层负责；
 * - 旧 `vertex.credentialsJson` 不在这里恢复或兼容。
 */
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { TFunction } from 'i18next';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/useToast';
import { parseApiKeyInput } from '@/lib/ai/api-keys';
import type { AwsBedrockConfig, VertexAiConfig } from '@/lib/ai/types';

import { HelpTip, isImeComposingLikeEvent, type Provider } from '@/components/chat/settings/model-manager/shared';
import {
  buildBedrockApiKeyConfig,
  buildBedrockIamConfig,
  buildVertexApiKeyConfig,
  buildVertexServiceAccountConfig,
} from './model-manager-cloud-detail-utils';

type UpdateProvider = (id: string, patch: Partial<Provider>) => void;

interface CloudSecretDrafts {
  readonly bedrockAccessKeyId: string;
  readonly bedrockSecretAccessKey: string;
  readonly bedrockSessionToken: string;
  readonly bedrockApiKey: string;
  readonly vertexApiKey: string;
  readonly vertexPrivateKey: string;
}

/**
 * 从 provider 当前值创建敏感字段草稿。
 *
 * 说明：
 * - 草稿只用于详情页输入体验；
 * - 切换 provider、鉴权模式或外部配置写回后会重新同步。
 */
function createCloudSecretDrafts(provider: Provider): CloudSecretDrafts {
  return {
    bedrockAccessKeyId: provider.bedrock?.accessKeyId ?? '',
    bedrockSecretAccessKey: provider.bedrock?.secretAccessKey ?? '',
    bedrockSessionToken: provider.bedrock?.sessionToken ?? '',
    bedrockApiKey: provider.bedrock?.apiKey ?? '',
    vertexApiKey: provider.vertex?.apiKey ?? '',
    vertexPrivateKey: provider.vertex?.serviceAccount?.privateKey ?? '',
  };
}

/** 把 API Key 草稿收敛为单 key；明显 URL-like 输入会 toast 并中止提交。 */
function parseSingleApiKeyDraft(raw: string, t: TFunction): string | null | undefined {
  const parsed = parseApiKeyInput(raw);
  if (parsed.rejected.length > 0) {
    toast.error(t('modelManagerPanel.apiKey.errorUrlLike'));
    return null;
  }
  return parsed.keys[0] ?? undefined;
}

/** 让单行敏感输入支持 Enter 提交，同时尊重 IME 组合输入。 */
function commitInputOnEnter(event: KeyboardEvent<HTMLInputElement>, commit: () => void) {
  if (isImeComposingLikeEvent(event)) return;
  if (event.key !== 'Enter') return;
  event.preventDefault();
  commit();
}

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

/** 详情页云厂商配置区标题。 */
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

/** 详情页 Bedrock / Vertex 专用鉴权配置区。 */
export function ModelManagerProviderCloudDetailSection({
  provider,
  t,
  updateProvider,
}: {
  readonly provider: Provider;
  readonly t: TFunction;
  readonly updateProvider: UpdateProvider;
}) {
  const [drafts, setDrafts] = useState(() => createCloudSecretDrafts(provider));

  useEffect(() => {
    setDrafts(createCloudSecretDrafts(provider));
  }, [provider]);

  if (provider.type === 'aws-bedrock') {
    return (
      <BedrockDetailSection
        provider={provider}
        drafts={drafts}
        setDrafts={setDrafts}
        t={t}
        updateProvider={updateProvider}
      />
    );
  }

  if (provider.type === 'vertexai' || provider.type === 'vertex-anthropic') {
    return (
      <VertexDetailSection
        provider={provider}
        drafts={drafts}
        setDrafts={setDrafts}
        t={t}
        updateProvider={updateProvider}
      />
    );
  }

  return null;
}

/** 详情页 Bedrock 鉴权区。 */
function BedrockDetailSection({
  provider,
  drafts,
  setDrafts,
  t,
  updateProvider,
}: {
  readonly provider: Provider;
  readonly drafts: CloudSecretDrafts;
  readonly setDrafts: (next: CloudSecretDrafts | ((current: CloudSecretDrafts) => CloudSecretDrafts)) => void;
  readonly t: TFunction;
  readonly updateProvider: UpdateProvider;
}) {
  const current = provider.bedrock ?? { authType: 'iam' as const, region: '' };
  const authType = current.authType ?? 'iam';
  /** 将 Bedrock 局部配置 patch 写回当前 provider。 */
  const updateBedrock = (bedrock: AwsBedrockConfig) => updateProvider(provider.id, { bedrock });
  /** 提交 Bedrock API Key 草稿，并在写回前拒绝误填的 URL。 */
  const commitApiKey = () => {
    const apiKey = parseSingleApiKeyDraft(drafts.bedrockApiKey, t);
    if (apiKey === null) return;
    setDrafts((draft) => ({ ...draft, bedrockApiKey: apiKey ?? '' }));
    updateBedrock(buildBedrockApiKeyConfig(current, apiKey));
  };

  return (
    <div data-testid="model-manager-cloud-config-section" className="shrink-0 space-y-3">
      <DetailSectionTitle
        title={t('modelManagerPanel.bedrock.title')}
        help={joinHelpText(t('modelManagerPanel.bedrock.sectionHint'), t('modelManagerPanel.bedrock.hint'))}
      />
      <div className="grid grid-cols-1 gap-3 min-[960px]:grid-cols-2">
        <DetailField
          label={t('modelManagerPanel.bedrock.authType')}
          help={t('modelManagerPanel.bedrock.authTypeHint')}
        >
          <Select
            value={authType}
            onValueChange={(value) => {
              setDrafts((draft) => ({
                ...draft,
                bedrockAccessKeyId: '',
                bedrockSecretAccessKey: '',
                bedrockSessionToken: '',
                bedrockApiKey: '',
              }));
              updateBedrock(value === 'apiKey'
                ? buildBedrockApiKeyConfig(current)
                : buildBedrockIamConfig(current));
            }}
          >
            <SelectTrigger aria-label={t('modelManagerPanel.bedrock.authType')} className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="iam">{t('modelManagerPanel.bedrock.authTypeOptions.iam')}</SelectItem>
              <SelectItem value="apiKey">{t('modelManagerPanel.bedrock.authTypeOptions.apiKey')}</SelectItem>
            </SelectContent>
          </Select>
        </DetailField>
        <DetailField
          label={t('modelManagerPanel.bedrock.region')}
          help={t('modelManagerPanel.bedrock.regionHint')}
          htmlFor="provider-detail-bedrock-region"
        >
          <Input
            id="provider-detail-bedrock-region"
            value={current.region}
            onChange={(event) => updateBedrock({ ...current, region: event.target.value })}
            className="h-9 text-sm font-mono"
            placeholder="us-east-1"
          />
        </DetailField>
      </div>
      {authType === 'apiKey' ? (
        <DetailField
          label={t('modelManagerPanel.bedrock.apiKey')}
          help={t('modelManagerPanel.bedrock.apiKeyHint')}
          htmlFor="provider-detail-bedrock-api-key"
        >
          <Input
            id="provider-detail-bedrock-api-key"
            type="password"
            value={drafts.bedrockApiKey}
            onChange={(event) => setDrafts((draft) => ({ ...draft, bedrockApiKey: event.target.value }))}
            onBlur={commitApiKey}
            onKeyDown={(event) => commitInputOnEnter(event, commitApiKey)}
            className="h-9 text-sm font-mono"
          />
        </DetailField>
      ) : (
        <div className="grid grid-cols-1 gap-3 min-[960px]:grid-cols-2">
          <DetailField
            label={t('modelManagerPanel.bedrock.accessKeyId')}
            help={t('modelManagerPanel.bedrock.accessKeyIdHint')}
            htmlFor="provider-detail-bedrock-access-key-id"
          >
            <Input
              id="provider-detail-bedrock-access-key-id"
              value={drafts.bedrockAccessKeyId}
              onChange={(event) => setDrafts((draft) => ({ ...draft, bedrockAccessKeyId: event.target.value }))}
              onBlur={() => updateBedrock({ ...current, accessKeyId: drafts.bedrockAccessKeyId || undefined })}
              onKeyDown={(event) => commitInputOnEnter(event, () => updateBedrock({ ...current, accessKeyId: drafts.bedrockAccessKeyId || undefined }))}
              className="h-9 text-sm font-mono"
            />
          </DetailField>
          <DetailField
            label={t('modelManagerPanel.bedrock.secretAccessKey')}
            help={t('modelManagerPanel.bedrock.secretAccessKeyHint')}
            htmlFor="provider-detail-bedrock-secret-access-key"
          >
            <Input
              id="provider-detail-bedrock-secret-access-key"
              type="password"
              value={drafts.bedrockSecretAccessKey}
              onChange={(event) => setDrafts((draft) => ({ ...draft, bedrockSecretAccessKey: event.target.value }))}
              onBlur={() => updateBedrock({ ...current, secretAccessKey: drafts.bedrockSecretAccessKey || undefined })}
              onKeyDown={(event) => commitInputOnEnter(event, () => updateBedrock({ ...current, secretAccessKey: drafts.bedrockSecretAccessKey || undefined }))}
              className="h-9 text-sm font-mono"
            />
          </DetailField>
          <DetailField
            label={t('modelManagerPanel.bedrock.sessionToken')}
            help={t('modelManagerPanel.bedrock.sessionTokenHint')}
            htmlFor="provider-detail-bedrock-session-token"
          >
            <Input
              id="provider-detail-bedrock-session-token"
              value={drafts.bedrockSessionToken}
              onChange={(event) => setDrafts((draft) => ({ ...draft, bedrockSessionToken: event.target.value }))}
              onBlur={() => updateBedrock({ ...current, sessionToken: drafts.bedrockSessionToken || undefined })}
              onKeyDown={(event) => commitInputOnEnter(event, () => updateBedrock({ ...current, sessionToken: drafts.bedrockSessionToken || undefined }))}
              className="h-9 text-sm font-mono"
            />
          </DetailField>
        </div>
      )}
    </div>
  );
}

/** 详情页 Vertex / Vertex Anthropic 鉴权区。 */
function VertexDetailSection({
  provider,
  drafts,
  setDrafts,
  t,
  updateProvider,
}: {
  readonly provider: Provider;
  readonly drafts: CloudSecretDrafts;
  readonly setDrafts: (next: CloudSecretDrafts | ((current: CloudSecretDrafts) => CloudSecretDrafts)) => void;
  readonly t: TFunction;
  readonly updateProvider: UpdateProvider;
}) {
  const isVertexAnthropic = provider.type === 'vertex-anthropic';
  const current = provider.vertex ?? { authType: 'serviceAccount' as const, projectId: '', location: '', serviceAccount: { clientEmail: '', privateKey: '' } };
  const authType = isVertexAnthropic ? 'serviceAccount' : current.authType ?? 'serviceAccount';
  const serviceAccountConfig = buildVertexServiceAccountConfig(current);
  const serviceAccount = serviceAccountConfig.serviceAccount ?? { clientEmail: '', privateKey: '' };
  /** 将 Vertex 局部配置 patch 写回当前 provider。 */
  const updateVertex = (vertex: VertexAiConfig) => updateProvider(provider.id, { vertex });
  /** 提交 Vertex express API Key 草稿，并在写回前拒绝误填的 URL。 */
  const commitApiKey = () => {
    const apiKey = parseSingleApiKeyDraft(drafts.vertexApiKey, t);
    if (apiKey === null) return;
    setDrafts((draft) => ({ ...draft, vertexApiKey: apiKey ?? '' }));
    updateVertex(buildVertexApiKeyConfig(apiKey));
  };

  return (
    <div data-testid="model-manager-cloud-config-section" className="shrink-0 space-y-3">
      <DetailSectionTitle
        title={t('modelManagerPanel.vertex.title')}
        help={joinHelpText(
          isVertexAnthropic
            ? t('modelManagerPanel.vertex.sectionHintAnthropic')
            : t('modelManagerPanel.vertex.sectionHint'),
          isVertexAnthropic ? t('modelManagerPanel.vertex.hintAnthropic') : t('modelManagerPanel.vertex.hint'),
        )}
      />
      {isVertexAnthropic ? null : (
        <DetailField
          label={t('modelManagerPanel.vertex.authType')}
          help={t('modelManagerPanel.vertex.authTypeHint')}
        >
          <Select
            value={authType}
            onValueChange={(value) => {
              setDrafts((draft) => ({ ...draft, vertexApiKey: '', vertexPrivateKey: '' }));
              updateVertex(value === 'apiKey'
                ? buildVertexApiKeyConfig()
                : {
                    authType: 'serviceAccount',
                    projectId: '',
                    location: '',
                    serviceAccount: { clientEmail: '', privateKey: '' },
                  });
            }}
          >
            <SelectTrigger aria-label={t('modelManagerPanel.vertex.authType')} className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="serviceAccount">{t('modelManagerPanel.vertex.authTypeOptions.serviceAccount')}</SelectItem>
              <SelectItem value="apiKey">{t('modelManagerPanel.vertex.authTypeOptions.apiKey')}</SelectItem>
            </SelectContent>
          </Select>
        </DetailField>
      )}
      {authType === 'apiKey' ? (
        <DetailField
          label={t('modelManagerPanel.vertex.apiKey')}
          help={t('modelManagerPanel.vertex.apiKeyHint')}
          htmlFor="provider-detail-vertex-api-key"
        >
          <Input
            id="provider-detail-vertex-api-key"
            type="password"
            value={drafts.vertexApiKey}
            onChange={(event) => setDrafts((draft) => ({ ...draft, vertexApiKey: event.target.value }))}
            onBlur={commitApiKey}
            onKeyDown={(event) => commitInputOnEnter(event, commitApiKey)}
            className="h-9 text-sm font-mono"
          />
        </DetailField>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 min-[960px]:grid-cols-2">
            <DetailField
              label={t('modelManagerPanel.vertex.projectId')}
              help={t('modelManagerPanel.vertex.projectIdHint')}
              htmlFor="provider-detail-vertex-project-id"
            >
              <Input
                id="provider-detail-vertex-project-id"
                value={serviceAccountConfig.projectId ?? ''}
                onChange={(event) => updateVertex({ ...serviceAccountConfig, projectId: event.target.value })}
                className="h-9 text-sm font-mono"
              />
            </DetailField>
            <DetailField
              label={t('modelManagerPanel.vertex.location')}
              help={t('modelManagerPanel.vertex.locationHint')}
              htmlFor="provider-detail-vertex-location"
            >
              <Input
                id="provider-detail-vertex-location"
                value={serviceAccountConfig.location ?? ''}
                onChange={(event) => updateVertex({ ...serviceAccountConfig, location: event.target.value })}
                className="h-9 text-sm font-mono"
                placeholder="us-central1"
              />
            </DetailField>
          </div>
          <div className="grid grid-cols-1 gap-3 min-[960px]:grid-cols-2">
            <DetailField
              label={t('modelManagerPanel.vertex.clientEmail')}
              help={t('modelManagerPanel.vertex.clientEmailHint')}
              htmlFor="provider-detail-vertex-client-email"
            >
              <Input
                id="provider-detail-vertex-client-email"
                value={serviceAccount.clientEmail}
                onChange={(event) => updateVertex({
                  ...serviceAccountConfig,
                  serviceAccount: { ...serviceAccount, clientEmail: event.target.value },
                })}
                className="h-9 text-sm font-mono"
              />
            </DetailField>
            <DetailField
              label={t('modelManagerPanel.vertex.privateKeyId')}
              help={t('modelManagerPanel.vertex.privateKeyIdHint')}
              htmlFor="provider-detail-vertex-private-key-id"
            >
              <Input
                id="provider-detail-vertex-private-key-id"
                value={serviceAccount.privateKeyId ?? ''}
                onChange={(event) => updateVertex({
                  ...serviceAccountConfig,
                  serviceAccount: {
                    ...serviceAccount,
                    ...(event.target.value ? { privateKeyId: event.target.value } : { privateKeyId: undefined }),
                  },
                })}
                className="h-9 text-sm font-mono"
              />
            </DetailField>
          </div>
          <DetailField
            label={t('modelManagerPanel.vertex.privateKey')}
            help={t('modelManagerPanel.vertex.privateKeyHint')}
            htmlFor="provider-detail-vertex-private-key"
          >
            <Textarea
              id="provider-detail-vertex-private-key"
              value={drafts.vertexPrivateKey}
              onChange={(event) => setDrafts((draft) => ({ ...draft, vertexPrivateKey: event.target.value }))}
              onBlur={() => updateVertex({
                ...serviceAccountConfig,
                serviceAccount: { ...serviceAccount, privateKey: drafts.vertexPrivateKey },
              })}
              className="min-h-[96px] text-xs font-mono"
              placeholder={t('modelManagerPanel.vertex.privateKeyPlaceholder')}
            />
          </DetailField>
        </>
      )}
    </div>
  );
}
