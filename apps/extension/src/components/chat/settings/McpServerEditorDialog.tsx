/**
 * 说明：`McpServerEditorDialog` 组件模块。
 *
 * 职责：
 * - 承载 remote-only MCP 服务创建/编辑弹窗；
 * - 支持“结构化表单”和“原始 JSON”两种编辑方式；
 * - 当前只允许配置 `Streamable HTTP + headers + OAuth`。
 */
import { useEffect, useId, useLayoutEffect, useState } from 'react';
import { AlertTriangle, Code2, List, WandSparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatUserError } from '@/lib/i18n/user-message';
import {
  getDefaultMcpServerDraft,
  getDefaultMcpOAuthConfig,
  normalizeMcpServerDraft,
  parseSingleLooseMcpServerDraftJson,
  parseSingleMcpServerConfigJson,
  stringifySingleMcpServerConfig,
} from '@/lib/mcp/config';
import type { McpOAuthConfig, McpServerConfig, McpServerDraftConfig, McpServerType } from '@/types/mcp';

import { McpServerEditorDialogOAuthFields } from './McpServerEditorDialogOAuthFields';

/** `McpServerEditorDialog` 的外部 props。 */
export type McpServerEditorDialogProps = {
  open: boolean;
  editingServer: McpServerConfig | null;
  onOpenChange: (open: boolean) => void;
  onSave: (server: McpServerDraftConfig) => Promise<void> | void;
};

type EditorMode = 'form' | 'json';

type ValidationResult =
  | { ok: true; draft: McpServerDraftConfig }
  | { ok: false; error: string };

/**
 * 把 headers 字典序列化成可编辑 JSON。
 *
 * @param value - headers 字典。
 * @returns 格式化后的 JSON 文本。
 */
function stringifyMap(value: Record<string, string>) {
  return JSON.stringify(value, null, 2);
}

/**
 * 以宽松模式解析 headers 文本。
 *
 * @param text - 用户当前输入的 JSON 文本。
 * @returns 失败时回退为空对象的字符串字典。
 */
function parseObjectTextLoose(text: string) {
  const raw = text.trim();
  if (!raw) return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {} as Record<string, string>;
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .map(([key, value]) => [String(key || '').trim(), String(value ?? '')])
        .filter(([key]) => Boolean(key)),
    );
  } catch {
    return {} as Record<string, string>;
  }
}

/**
 * 把 scopes 列表序列化成多行文本。
 *
 * @param scopes - 当前 scope 列表。
 * @returns 以换行拼接的 scopes 文本。
 */
function stringifyScopes(scopes: string[]) {
  return scopes.join('\n');
}

/**
 * 把多行 scope 文本解析成列表。
 *
 * @param text - 用户输入的 scopes 文本。
 * @returns 去空白后的 scope 列表。
 */
function parseScopes(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * remote-only MCP server 编辑弹窗。
 *
 * @param props - 弹窗开关、当前编辑对象与保存回调。
 * @returns MCP server 编辑弹窗 JSX。
 */
export function McpServerEditorDialog({ open, editingServer, onOpenChange, onSave }: McpServerEditorDialogProps) {
  const { t } = useTranslation();
  const idPrefix = useId();

  const [mode, setMode] = useState<EditorMode>('form');
  const [serverType, setServerType] = useState<McpServerType>('streamable-http');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [headersText, setHeadersText] = useState('{}');
  const [oauthEnabled, setOauthEnabled] = useState(false);
  const [registrationStrategy, setRegistrationStrategy] = useState<McpOAuthConfig['registrationStrategy']>('dynamic');
  const [scopesText, setScopesText] = useState('');
  const [resource, setResource] = useState('');
  const [protectedResourceMetadataUrl, setProtectedResourceMetadataUrl] = useState('');
  const [authorizationServerMetadataUrl, setAuthorizationServerMetadataUrl] = useState('');
  const [dynamicClientName, setDynamicClientName] = useState('');
  const [preregClientId, setPreregClientId] = useState('');
  const [preregClientSecret, setPreregClientSecret] = useState('');
  const [tokenEndpointAuthMethod, setTokenEndpointAuthMethod] = useState<McpOAuthConfig['tokenEndpointAuthMethod']>('none');
  const [jsonText, setJsonText] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fieldIds = {
    name: `${idPrefix}-name`,
    url: `${idPrefix}-url`,
    headers: `${idPrefix}-headers`,
    oauthEnabled: `${idPrefix}-oauth-enabled`,
    registrationStrategy: `${idPrefix}-oauth-registration`,
    scopes: `${idPrefix}-oauth-scopes`,
    resource: `${idPrefix}-oauth-resource`,
    protectedResourceMetadataUrl: `${idPrefix}-oauth-protected-resource-metadata`,
    authorizationServerMetadataUrl: `${idPrefix}-oauth-authorization-server-metadata`,
    dynamicClientName: `${idPrefix}-oauth-dynamic-client-name`,
    preregClientId: `${idPrefix}-oauth-prereg-client-id`,
    preregClientSecret: `${idPrefix}-oauth-prereg-client-secret`,
    tokenEndpointAuthMethod: `${idPrefix}-oauth-token-endpoint-auth-method`,
    json: `${idPrefix}-json`,
    type: `${idPrefix}-type`,
  };

  useLayoutEffect(() => {
    if (!open) return;
    const next = editingServer ?? getDefaultMcpServerDraft();
    const oauth = next.oauth ?? getDefaultMcpOAuthConfig();
    setMode('form');
    setServerType(next.type);
    setName(next.name || '');
    setUrl(next.url || '');
    setHeadersText(stringifyMap(next.headers));
    setOauthEnabled(oauth.enabled);
    setRegistrationStrategy(oauth.registrationStrategy);
    setScopesText(stringifyScopes(oauth.scopes));
    setResource(oauth.resource || '');
    setProtectedResourceMetadataUrl(oauth.protectedResourceMetadataUrl || '');
    setAuthorizationServerMetadataUrl(oauth.authorizationServerMetadataUrl || '');
    setDynamicClientName(oauth.dynamicClientName || '');
    setPreregClientId(oauth.preregClientId || '');
    setPreregClientSecret(oauth.preregClientSecret || '');
    setTokenEndpointAuthMethod(oauth.tokenEndpointAuthMethod || 'none');
    setJsonText(stringifySingleMcpServerConfig(next, next.name || 'server'));
    setInlineError(null);
    setSubmitting(false);
  }, [editingServer, open]);

  useEffect(() => {
    if (!open) return;
    /** 监听 Escape，允许用户在任何编辑模式下快速关闭弹窗。 */
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onOpenChange(false);
    };
    window.addEventListener('keydown', handleKeydown, true);
    return () => window.removeEventListener('keydown', handleKeydown, true);
  }, [onOpenChange, open]);

  /**
   * 严格解析 headers JSON 文本。
   *
   * @param text - 原始 JSON 文本。
   * @param fieldName - 出错时用于提示的字段名。
   * @returns 解析后的字符串字典。
   */
  const parseObjectText = (text: string, fieldName: 'headers') => {
    const raw = text.trim() || '{}';
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(t('errors.jsonParseFailedWithDetail', { detail, hint: raw.slice(0, 80) }), { cause: error });
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(t('errors.mcpConfigStringMapRequired', { field: fieldName }));
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .map(([key, value]) => [String(key || '').trim(), String(value ?? '')])
        .filter(([key]) => Boolean(key)),
    );
  };

  /** 把当前表单里的 OAuth 字段收口成标准草稿结构。 */
  const buildOauthDraft = (): McpOAuthConfig => ({
    enabled: oauthEnabled,
    registrationStrategy,
    scopes: parseScopes(scopesText),
    ...(resource.trim() ? { resource: resource.trim() } : {}),
    ...(protectedResourceMetadataUrl.trim() ? { protectedResourceMetadataUrl: protectedResourceMetadataUrl.trim() } : {}),
    ...(authorizationServerMetadataUrl.trim() ? { authorizationServerMetadataUrl: authorizationServerMetadataUrl.trim() } : {}),
    ...(dynamicClientName.trim() ? { dynamicClientName: dynamicClientName.trim() } : {}),
    ...(preregClientId.trim() ? { preregClientId: preregClientId.trim() } : {}),
    ...(preregClientSecret.trim() ? { preregClientSecret: preregClientSecret.trim() } : {}),
    tokenEndpointAuthMethod: tokenEndpointAuthMethod || 'none',
  });

  /** 校验结构化表单并返回标准草稿。 */
  const validateForm = (): ValidationResult => {
    const trimmedName = name.trim();
    if (!trimmedName) return { ok: false, error: t('mcpBridgePanel.toast.serverNameRequired') };

    try {
      const draft = normalizeMcpServerDraft({
        name: trimmedName,
        type: serverType,
        url: url.trim(),
        headers: parseObjectText(headersText, 'headers'),
        oauth: buildOauthDraft(),
      }, trimmedName);
      return { ok: true, draft };
    } catch (error) {
      return { ok: false, error: formatUserError(t, error) };
    }
  };

  /** 在表单尚未完全合法时生成宽松 JSON 预览。 */
  const buildLooseJsonText = () => {
    const alias = name.trim() || 'server';
    const looseOauth = buildOauthDraft();
    return JSON.stringify({
      mcpServers: {
        [alias]: {
          type: serverType,
          ...(url.trim() ? { url: url.trim() } : {}),
          ...(Object.keys(parseObjectTextLoose(headersText)).length > 0 ? { headers: parseObjectTextLoose(headersText) } : {}),
          ...(looseOauth.enabled ? { oauth: looseOauth } : {}),
        },
      },
    }, null, 2);
  };

  /** 校验原始 JSON 模式下的 server 配置。 */
  const validateJson = (): ValidationResult => {
    try {
      const parsed = parseSingleMcpServerConfigJson(jsonText.trim() || '{}');
      if (!parsed.server.name.trim()) {
        return { ok: false, error: t('mcpBridgePanel.toast.serverNameRequired') };
      }
      return { ok: true, draft: parsed.server };
    } catch (error) {
      return { ok: false, error: formatUserError(t, error) };
    }
  };

  /**
   * 用标准草稿回填结构化表单。
   *
   * @param draft - 通过 JSON 成功解析后的标准草稿。
   */
  const syncFormFromDraft = (draft: McpServerDraftConfig) => {
    const oauth = draft.oauth ?? getDefaultMcpOAuthConfig();
    setServerType(draft.type);
    setName(draft.name);
    setUrl(draft.url || '');
    setHeadersText(stringifyMap(draft.headers));
    setOauthEnabled(oauth.enabled);
    setRegistrationStrategy(oauth.registrationStrategy);
    setScopesText(stringifyScopes(oauth.scopes));
    setResource(oauth.resource || '');
    setProtectedResourceMetadataUrl(oauth.protectedResourceMetadataUrl || '');
    setAuthorizationServerMetadataUrl(oauth.authorizationServerMetadataUrl || '');
    setDynamicClientName(oauth.dynamicClientName || '');
    setPreregClientId(oauth.preregClientId || '');
    setPreregClientSecret(oauth.preregClientSecret || '');
    setTokenEndpointAuthMethod(oauth.tokenEndpointAuthMethod || 'none');
  };

  /** 把当前结构化表单切换成 JSON 编辑模式。 */
  const switchToJson = () => {
    if (mode === 'json') return;
    const result = validateForm();
    setJsonText(result.ok ? stringifySingleMcpServerConfig(result.draft, result.draft.name || 'server') : buildLooseJsonText());
    setInlineError(null);
    setMode('json');
  };

  /** 把当前 JSON 文本回填到结构化表单。 */
  const parseJsonIntoForm = () => {
    if (mode === 'form') return;
    try {
      const parsed = parseSingleLooseMcpServerDraftJson(jsonText.trim() || '{}');
      syncFormFromDraft(parsed.server);
      setInlineError(null);
      setMode('form');
    } catch (error) {
      setInlineError(formatUserError(t, error));
      return;
    }
  };

  /**
   * 在表单模式与 JSON 模式之间切换。
   *
   * @param nextMode - 目标编辑模式。
   */
  const handleModeChange = (nextMode: string) => {
    if (nextMode === 'json') {
      switchToJson();
      return;
    }
    parseJsonIntoForm();
  };

  /** 提交当前编辑结果。 */
  const handleSubmit = async () => {
    const result = mode === 'form' ? validateForm() : validateJson();
    if (!result.ok) {
      setInlineError(result.error);
      return;
    }

    setSubmitting(true);
    try {
      await onSave(result.draft);
      setInlineError(null);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/60" onClick={() => onOpenChange(false)}>
      <div
        role="dialog"
        aria-modal="false"
        aria-label={editingServer ? t('mcpBridgePanel.dialog.editTitle') : t('mcpBridgePanel.dialog.addTitle')}
        className="fixed left-1/2 top-1/2 z-[71] flex h-[82vh] w-[min(52rem,calc(100vw-1.5rem))] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-background shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-border px-6 pb-4 pt-6 text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">
                {editingServer ? t('mcpBridgePanel.dialog.editTitle') : t('mcpBridgePanel.dialog.addTitle')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('mcpBridgePanel.dialog.description')}</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-sm p-1 text-muted-foreground transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">
          <div className="space-y-4">
            <div className="grid w-full grid-cols-2 rounded-md bg-muted p-1">
              <button
                type="button"
                onClick={() => handleModeChange('form')}
                className={`inline-flex items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-all ${
                  mode === 'form' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                <span>{t('mcpBridgePanel.dialog.formMode')}</span>
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('json')}
                className={`inline-flex items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-all ${
                  mode === 'json' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Code2 className="h-3.5 w-3.5" />
                <span>{t('mcpBridgePanel.dialog.jsonMode')}</span>
              </button>
            </div>

            {mode === 'form' ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor={fieldIds.type} className="text-xs font-medium">
                    <span aria-hidden="true" className="text-destructive">*</span> {t('mcpBridgePanel.dialog.type')}
                  </Label>
                  <Select
                    value={serverType}
                    onValueChange={(value) => {
                      setServerType(value as McpServerType);
                      setInlineError(null);
                    }}
                  >
                    <SelectTrigger id={fieldIds.type} className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="streamable-http">{t('mcpBridgePanel.serverType.streamableHttp')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={fieldIds.name} className="text-xs font-medium">
                    <span aria-hidden="true" className="text-destructive">*</span> {t('mcpBridgePanel.dialog.name')}
                  </Label>
                  <Input
                    id={fieldIds.name}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setInlineError(null);
                    }}
                    placeholder={t('mcpBridgePanel.dialog.namePlaceholder')}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={fieldIds.url} className="text-xs font-medium">
                    <span aria-hidden="true" className="text-destructive">*</span> {t('mcpBridgePanel.dialog.url')}
                  </Label>
                  <Input
                    id={fieldIds.url}
                    value={url}
                    onChange={(event) => {
                      setUrl(event.target.value);
                      setInlineError(null);
                    }}
                    placeholder="https://example.com/mcp"
                    className="h-9 font-mono text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={fieldIds.headers} className="text-xs font-medium">
                    {t('mcpBridgePanel.dialog.headers')}
                  </Label>
                  <Textarea
                    id={fieldIds.headers}
                    value={headersText}
                    onChange={(event) => {
                      setHeadersText(event.target.value);
                      setInlineError(null);
                    }}
                    placeholder={t('mcpBridgePanel.dialog.headersPlaceholder')}
                    rows={6}
                    className="min-h-[120px] resize-none font-mono text-xs leading-5"
                  />
                  <p className="text-[11px] text-muted-foreground">{t('mcpBridgePanel.dialog.headersHint')}</p>
                </div>

                <McpServerEditorDialogOAuthFields
                  t={t}
                  fieldIds={fieldIds}
                  oauthEnabled={oauthEnabled}
                  registrationStrategy={registrationStrategy}
                  scopesText={scopesText}
                  resource={resource}
                  protectedResourceMetadataUrl={protectedResourceMetadataUrl}
                  authorizationServerMetadataUrl={authorizationServerMetadataUrl}
                  dynamicClientName={dynamicClientName}
                  preregClientId={preregClientId}
                  preregClientSecret={preregClientSecret}
                  tokenEndpointAuthMethod={tokenEndpointAuthMethod}
                  onOauthEnabledChange={setOauthEnabled}
                  onRegistrationStrategyChange={setRegistrationStrategy}
                  onScopesTextChange={setScopesText}
                  onResourceChange={setResource}
                  onProtectedResourceMetadataUrlChange={setProtectedResourceMetadataUrl}
                  onAuthorizationServerMetadataUrlChange={setAuthorizationServerMetadataUrl}
                  onDynamicClientNameChange={setDynamicClientName}
                  onPreregClientIdChange={setPreregClientId}
                  onPreregClientSecretChange={setPreregClientSecret}
                  onTokenEndpointAuthMethodChange={setTokenEndpointAuthMethod}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={fieldIds.json} className="text-xs font-medium">
                    {t('mcpBridgePanel.dialog.jsonConfig')}
                  </Label>
                  <Textarea
                    id={fieldIds.json}
                    value={jsonText}
                    onChange={(event) => {
                      setJsonText(event.target.value);
                      setInlineError(null);
                    }}
                    rows={18}
                    className="min-h-[360px] resize-none font-mono text-xs leading-5"
                  />
                  <p className="text-[11px] text-muted-foreground">{t('mcpBridgePanel.dialog.jsonHint')}</p>
                </div>

                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={parseJsonIntoForm}>
                  <WandSparkles className="h-3.5 w-3.5" />
                  {t('mcpBridgePanel.dialog.parseToForm')}
                </Button>
              </div>
            )}
          </div>

          {inlineError ? (
            <Alert variant="destructive" className="mt-4 py-3">
              <AlertDescription className="text-xs leading-5">{inlineError}</AlertDescription>
            </Alert>
          ) : null}

          <InlineNotice icon={AlertTriangle} tone="warning" className="mt-4 !border-border/60 !bg-muted/20 py-3 text-[11px]">
            <span className="text-muted-foreground">
              {t('mcpBridgePanel.dialog.warnStreamableHttp')}
            </span>
          </InlineNotice>
        </div>

        <div className="shrink-0 border-t border-border px-6 py-4">
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" size="sm" onClick={() => void handleSubmit()} disabled={submitting}>
              {editingServer ? t('common.save') : t('mcpBridgePanel.servers.add')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
