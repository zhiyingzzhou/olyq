/**
 * 说明：`McpPanelSections` 组件模块。
 *
 * 职责：
 * - 承载 remote-only MCP 设置页里的大块展示分区；
 * - 把服务列表、工具调试区与审计区从主面板中拆开，收回单一职责；
 * - 复用统一的 remote MCP 文案与状态渲染，不再给 bridge / stdio 预留入口。
 */
import { Pencil, Plus, RefreshCw, ShieldCheck, ShieldOff, Trash2, Wrench } from 'lucide-react';
import type { TFunction } from 'i18next';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatUserError } from '@/lib/i18n/user-message';
import type { McpServersResource } from '@/lib/mcp/use-mcp-servers-resource';
import type { McpAuditRecord, McpServerConfig } from '@/types/mcp';
import type { McpSharedServerState } from '@/lib/mcp/background-client';
import { formatMcpPanelJson } from './McpPanelSectionHelpers';

type TranslateFn = TFunction;

type SharedStateMap = Record<string, McpSharedServerState>;

type McpServerListSectionProps = {
  t: TranslateFn;
  resource: McpServersResource;
  sharedStates: SharedStateMap;
  pendingServerId: string | null;
  onAdd: () => void;
  onToggleServer: (server: McpServerConfig, enabled: boolean) => void;
  onConnect: (server: McpServerConfig) => void;
  onDisconnect: (serverId: string) => void;
  onRefreshTools: (server: McpServerConfig) => void;
  onAuthorize: (server: McpServerConfig) => void;
  onClearAuthorization: (server: McpServerConfig) => void;
  onEdit: (server: McpServerConfig) => void;
  onDelete: (server: McpServerConfig) => void;
};

type McpToolRunnerSectionProps = {
  t: TranslateFn;
  connectedServers: McpServerConfig[];
  sharedStates: SharedStateMap;
  toolServerId: string;
  toolName: string;
  toolArgsText: string;
  toolResultText: string;
  toolRunning: boolean;
  onChangeToolServerId: (value: string) => void;
  onChangeToolName: (value: string) => void;
  onChangeToolArgsText: (value: string) => void;
  onRunTool: () => void;
};

type McpAuditSectionProps = {
  t: TranslateFn;
  audit: McpAuditRecord[];
};

/**
 * 渲染 remote-only MCP 服务列表区。
 *
 * @param props - 当前服务列表、连接状态与交互回调。
 * @returns MCP 服务列表区 JSX。
 */
export function McpServerListSection({
  t,
  resource,
  sharedStates,
  pendingServerId,
  onAdd,
  onToggleServer,
  onConnect,
  onDisconnect,
  onRefreshTools,
  onAuthorize,
  onClearAuthorization,
  onEdit,
  onDelete,
}: McpServerListSectionProps) {
  const servers = resource.data;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium">{t('mcpBridgePanel.servers.title')}</h4>
          <p className="mt-1 text-xs text-muted-foreground">{t('mcpBridgePanel.servers.description')}</p>
        </div>
        <Button type="button" size="sm" onClick={onAdd}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t('mcpBridgePanel.servers.add')}
        </Button>
      </div>

      {resource.status === 'error' ? (
        <Alert variant="destructive">
          <AlertDescription>{formatUserError(t, resource.error)}</AlertDescription>
        </Alert>
      ) : null}

      {servers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('mcpBridgePanel.servers.empty')}</p>
      ) : (
        <div className="space-y-3">
          {servers.map((server) => {
            const state = sharedStates[server.id];
            const isBusy = pendingServerId === server.id;
            const protocolVersion = state?.meta?.protocolVersion?.trim();

            return (
              <div key={server.id} className="rounded-lg border bg-background/70 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{server.name}</div>
                      <Badge variant={state?.connected ? 'default' : 'secondary'}>
                        {t(state?.connected ? 'mcpBridgePanel.servers.connected' : 'mcpBridgePanel.servers.disconnected')}
                      </Badge>
                      <Badge variant={server.enabled ? 'secondary' : 'outline'}>
                        {t(server.enabled ? 'mcpBridgePanel.servers.enabled' : 'mcpBridgePanel.servers.disabled')}
                      </Badge>
                      <Badge variant="outline">{t('mcpBridgePanel.serverType.streamableHttp')}</Badge>
                      {server.oauth.enabled ? <Badge variant="outline">{t('mcpBridgePanel.servers.oauthEnabled')}</Badge> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('mcpBridgePanel.servers.url')}
                      {' '}
                      {server.url}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('mcpBridgePanel.servers.toolsCount', { count: state?.tools.length ?? 0 })}
                      {protocolVersion ? ` · ${t('mcpBridgePanel.server.protocolVersion', { version: protocolVersion })}` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label htmlFor={`mcp-server-enabled-${server.id}`} className="sr-only">
                      {t('mcpBridgePanel.servers.enabled')}
                    </Label>
                    <Switch
                      id={`mcp-server-enabled-${server.id}`}
                      checked={server.enabled}
                      disabled={isBusy}
                      onCheckedChange={(checked) => onToggleServer(server, Boolean(checked))}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {state?.connected ? (
                    <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={() => onDisconnect(server.id)}>
                      {t('mcpBridgePanel.servers.disconnect')}
                    </Button>
                  ) : (
                    <Button type="button" size="sm" disabled={isBusy || !server.enabled} onClick={() => onConnect(server)}>
                      {t('mcpBridgePanel.servers.connect')}
                    </Button>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isBusy || !server.enabled}
                    onClick={() => onRefreshTools(server)}
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    {t('mcpBridgePanel.servers.refreshTools')}
                  </Button>

                  {server.oauth.enabled ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isBusy || !server.enabled}
                        onClick={() => onAuthorize(server)}
                      >
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                        {t('mcpBridgePanel.servers.authorize')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => onClearAuthorization(server)}
                      >
                        <ShieldOff className="mr-1.5 h-3.5 w-3.5" />
                        {t('mcpBridgePanel.servers.clearAuthorization')}
                      </Button>
                    </>
                  ) : null}

                  <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={() => onEdit(server)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    {t('mcpBridgePanel.servers.edit')}
                  </Button>

                  <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={() => onDelete(server)}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    {t('mcpBridgePanel.servers.delete')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * 渲染 MCP 工具调试区。
 *
 * @param props - 当前已连接服务、工具输入与执行状态。
 * @returns MCP 工具调试区 JSX。
 */
export function McpToolRunnerSection({
  t,
  connectedServers,
  sharedStates,
  toolServerId,
  toolName,
  toolArgsText,
  toolResultText,
  toolRunning,
  onChangeToolServerId,
  onChangeToolName,
  onChangeToolArgsText,
  onRunTool,
}: McpToolRunnerSectionProps) {
  const selectedTools = toolServerId ? (sharedStates[toolServerId]?.tools ?? []) : [];

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <h4 className="flex items-center gap-2 text-sm font-medium">
          <Wrench className="h-4 w-4" />
          {t('mcpBridgePanel.toolRunner.title')}
        </h4>
        <p className="mt-1 text-xs text-muted-foreground">{t('mcpBridgePanel.toolRunner.auditHint')}</p>
      </div>

      {connectedServers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('mcpBridgePanel.toolRunner.needConnect')}</p>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mcp-tool-server">{t('mcpBridgePanel.toolRunner.service')}</Label>
              <select
                id="mcp-tool-server"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
                value={toolServerId}
                onChange={(event) => onChangeToolServerId(event.target.value)}
              >
                {connectedServers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mcp-tool-name">{t('mcpBridgePanel.toolRunner.tool')}</Label>
              <select
                id="mcp-tool-name"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
                value={toolName}
                onChange={(event) => onChangeToolName(event.target.value)}
              >
                {selectedTools.map((tool) => (
                  <option key={tool.name} value={tool.name}>
                    {tool.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mcp-tool-args">{t('mcpBridgePanel.toolRunner.args')}</Label>
            <Textarea
              id="mcp-tool-args"
              rows={6}
              value={toolArgsText}
              onChange={(event) => onChangeToolArgsText(event.target.value)}
            />
          </div>

          <div className="flex justify-end">
            <Button type="button" disabled={toolRunning} onClick={onRunTool}>
              {toolRunning ? t('mcpBridgePanel.toolRunner.running') : t('mcpBridgePanel.toolRunner.run')}
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mcp-tool-result">{t('mcpBridgePanel.toolRunner.result')}</Label>
            <Textarea
              id="mcp-tool-result"
              rows={8}
              readOnly
              value={toolResultText}
              placeholder={t('mcpBridgePanel.toolRunner.resultPlaceholder')}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 渲染 MCP 工具审计区。
 *
 * @param props - 审计记录列表。
 * @returns MCP 审计区 JSX。
 */
export function McpAuditSection({ t, audit }: McpAuditSectionProps) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h4 className="text-sm font-medium">{t('mcpBridgePanel.audit.title')}</h4>
      {audit.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('mcpBridgePanel.audit.empty')}</p>
      ) : (
        <div className="space-y-2">
          {audit.map((record) => (
            <div key={record.id} className="rounded-md border bg-background/70 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={record.ok ? 'default' : 'destructive'}>
                  {t(record.ok ? 'mcpBridgePanel.audit.ok' : 'mcpBridgePanel.audit.err')}
                </Badge>
                <span>{record.tool}</span>
                <span className="text-muted-foreground">{t('mcpBridgePanel.audit.server', { serverId: record.serverId })}</span>
                <span className="text-muted-foreground">
                  {t('mcpBridgePanel.audit.durationMs', { durationMs: record.durationMs })}
                </span>
              </div>
              {record.error ? (
                <pre className="mt-2 whitespace-pre-wrap break-all text-destructive">{record.error}</pre>
              ) : (
                <pre className="mt-2 whitespace-pre-wrap break-all">{formatMcpPanelJson(record.result)}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
