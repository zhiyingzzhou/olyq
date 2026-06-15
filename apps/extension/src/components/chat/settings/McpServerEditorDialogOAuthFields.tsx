/**
 * 说明：`McpServerEditorDialogOAuthFields` 组件模块。
 *
 * 职责：
 * - 承载 MCP server 编辑弹窗里的 OAuth 表单分区；
 * - 只负责 remote-only OAuth 配置项渲染，不处理保存与校验；
 * - 把大体积 JSX 从主弹窗文件中拆出，保持编辑器 owner 清晰。
 */
import type { TFunction } from 'i18next';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { McpOAuthConfig } from '@/types/mcp';

type OAuthFieldIds = {
  oauthEnabled: string;
  registrationStrategy: string;
  scopes: string;
  resource: string;
  protectedResourceMetadataUrl: string;
  authorizationServerMetadataUrl: string;
  dynamicClientName: string;
  preregClientId: string;
  preregClientSecret: string;
  tokenEndpointAuthMethod: string;
};

type McpServerEditorDialogOAuthFieldsProps = {
  t: TFunction;
  fieldIds: OAuthFieldIds;
  oauthEnabled: boolean;
  registrationStrategy: McpOAuthConfig['registrationStrategy'];
  scopesText: string;
  resource: string;
  protectedResourceMetadataUrl: string;
  authorizationServerMetadataUrl: string;
  dynamicClientName: string;
  preregClientId: string;
  preregClientSecret: string;
  tokenEndpointAuthMethod: McpOAuthConfig['tokenEndpointAuthMethod'];
  onOauthEnabledChange: (enabled: boolean) => void;
  onRegistrationStrategyChange: (value: McpOAuthConfig['registrationStrategy']) => void;
  onScopesTextChange: (value: string) => void;
  onResourceChange: (value: string) => void;
  onProtectedResourceMetadataUrlChange: (value: string) => void;
  onAuthorizationServerMetadataUrlChange: (value: string) => void;
  onDynamicClientNameChange: (value: string) => void;
  onPreregClientIdChange: (value: string) => void;
  onPreregClientSecretChange: (value: string) => void;
  onTokenEndpointAuthMethodChange: (value: McpOAuthConfig['tokenEndpointAuthMethod']) => void;
};

/**
 * 渲染 MCP server 编辑弹窗里的 OAuth 字段区。
 *
 * @param props - OAuth 配置值、字段 ID 与回调集合。
 * @returns OAuth 配置区 JSX。
 */
export function McpServerEditorDialogOAuthFields({
  t,
  fieldIds,
  oauthEnabled,
  registrationStrategy,
  scopesText,
  resource,
  protectedResourceMetadataUrl,
  authorizationServerMetadataUrl,
  dynamicClientName,
  preregClientId,
  preregClientSecret,
  tokenEndpointAuthMethod,
  onOauthEnabledChange,
  onRegistrationStrategyChange,
  onScopesTextChange,
  onResourceChange,
  onProtectedResourceMetadataUrlChange,
  onAuthorizationServerMetadataUrlChange,
  onDynamicClientNameChange,
  onPreregClientIdChange,
  onPreregClientSecretChange,
  onTokenEndpointAuthMethodChange,
}: McpServerEditorDialogOAuthFieldsProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor={fieldIds.oauthEnabled} className="text-sm font-medium">
            {t('mcpBridgePanel.oauth.enable')}
          </Label>
          <p className="mt-1 text-[11px] text-muted-foreground">{t('mcpBridgePanel.oauth.enableHint')}</p>
        </div>
        <Switch id={fieldIds.oauthEnabled} checked={oauthEnabled} onCheckedChange={onOauthEnabledChange} />
      </div>

      {oauthEnabled ? (
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor={fieldIds.registrationStrategy} className="text-xs font-medium">
              {t('mcpBridgePanel.oauth.registrationStrategy')}
            </Label>
            <Select value={registrationStrategy} onValueChange={(value) => onRegistrationStrategyChange(value as McpOAuthConfig['registrationStrategy'])}>
              <SelectTrigger id={fieldIds.registrationStrategy} className="h-9 text-sm">
                <SelectValue placeholder={t('mcpBridgePanel.oauth.registrationStrategy')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dynamic">{t('mcpBridgePanel.oauth.dynamic')}</SelectItem>
                <SelectItem value="preregistered">{t('mcpBridgePanel.oauth.preregistered')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={fieldIds.scopes} className="text-xs font-medium">
                {t('mcpBridgePanel.oauth.scopes')}
              </Label>
              <Textarea
                id={fieldIds.scopes}
                value={scopesText}
                onChange={(event) => onScopesTextChange(event.target.value)}
                rows={4}
                className="min-h-[96px] resize-none font-mono text-xs leading-5"
                placeholder={'openid\nprofile'}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={fieldIds.resource} className="text-xs font-medium">
                {t('mcpBridgePanel.oauth.resource')}
              </Label>
              <Input
                id={fieldIds.resource}
                value={resource}
                onChange={(event) => onResourceChange(event.target.value)}
                className="h-9 font-mono text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={fieldIds.protectedResourceMetadataUrl} className="text-xs font-medium">
                {t('mcpBridgePanel.oauth.protectedResourceMetadataUrl')}
              </Label>
              <Input
                id={fieldIds.protectedResourceMetadataUrl}
                value={protectedResourceMetadataUrl}
                onChange={(event) => onProtectedResourceMetadataUrlChange(event.target.value)}
                className="h-9 font-mono text-sm"
                placeholder="https://example.com/.well-known/oauth-protected-resource"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={fieldIds.authorizationServerMetadataUrl} className="text-xs font-medium">
                {t('mcpBridgePanel.oauth.authorizationServerMetadataUrl')}
              </Label>
              <Input
                id={fieldIds.authorizationServerMetadataUrl}
                value={authorizationServerMetadataUrl}
                onChange={(event) => onAuthorizationServerMetadataUrlChange(event.target.value)}
                className="h-9 font-mono text-sm"
                placeholder="https://auth.example.com/.well-known/oauth-authorization-server"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={fieldIds.dynamicClientName} className="text-xs font-medium">
                {t('mcpBridgePanel.oauth.dynamicClientName')}
              </Label>
              <Input
                id={fieldIds.dynamicClientName}
                value={dynamicClientName}
                onChange={(event) => onDynamicClientNameChange(event.target.value)}
                className="h-9 text-sm"
                placeholder={t('mcpBridgePanel.oauth.dynamicClientNamePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={fieldIds.tokenEndpointAuthMethod} className="text-xs font-medium">
                {t('mcpBridgePanel.oauth.tokenEndpointAuthMethod')}
              </Label>
              <Select
                value={tokenEndpointAuthMethod || 'none'}
                onValueChange={(value) => onTokenEndpointAuthMethodChange(value as McpOAuthConfig['tokenEndpointAuthMethod'])}
              >
                <SelectTrigger id={fieldIds.tokenEndpointAuthMethod} className="h-9 text-sm">
                  <SelectValue placeholder={t('mcpBridgePanel.oauth.tokenEndpointAuthMethod')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('mcpBridgePanel.oauth.tokenEndpointAuthNone')}</SelectItem>
                  <SelectItem value="client_secret_post">{t('mcpBridgePanel.oauth.tokenEndpointAuthSecretPost')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={fieldIds.preregClientId} className="text-xs font-medium">
                {t('mcpBridgePanel.oauth.preregClientId')}
              </Label>
              <Input
                id={fieldIds.preregClientId}
                value={preregClientId}
                onChange={(event) => onPreregClientIdChange(event.target.value)}
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={fieldIds.preregClientSecret} className="text-xs font-medium">
                {t('mcpBridgePanel.oauth.preregClientSecret')}
              </Label>
              <Input
                id={fieldIds.preregClientSecret}
                value={preregClientSecret}
                onChange={(event) => onPreregClientSecretChange(event.target.value)}
                className="h-9 font-mono text-sm"
                type="password"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
