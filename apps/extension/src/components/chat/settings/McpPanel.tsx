/**
 * 说明：`McpPanel` 组件模块。
 *
 * 职责：
 * - 承载浏览器扩展内 remote-only MCP 设置页；
 * - 管理 MCP 全局开关、远程服务列表、OAuth 授权、工具调试与审计日志；
 * - 明确当前产品只支持 `Streamable HTTP + headers + OAuth`。
 */
import { useEffect, useState } from 'react';
import { Plug } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { toast } from '@/hooks/useToast';
import { toHostMatchPatternFromUrl } from '@/lib/extension/host-match-patterns';
import { formatUserError } from '@/lib/i18n/user-message';
import {
  authorizeSharedMcpServer,
  callSharedMcpTool,
  clearSharedMcpServerAuthorization,
  connectSharedMcpServer,
  disconnectSharedMcpServer,
  getSharedMcpServerStates,
  listSharedMcpServerTools,
  type McpSharedServerState,
} from '@/lib/mcp/background-client';
import {
  appendMcpAudit,
  getDefaultMcpSettingsConfig,
  loadMcpAudit,
  loadMcpSettingsConfig,
  saveMcpServers,
  saveMcpSettingsConfig,
} from '@/lib/mcp/storage';
import { useMcpServersResource } from '@/lib/mcp/use-mcp-servers-resource';
import { createId } from '@/lib/utils/id';
import type { McpAuditRecord, McpServerConfig, McpServerDraftConfig } from '@/types/mcp';

import { SettingsPanelInset, SettingsPanelRoot, SettingsPanelScroller } from './layout';
import {
  McpAuditSection,
  McpServerListSection,
  McpToolRunnerSection,
} from './McpPanelSections';
import { buildMcpAuthorizationShape, formatMcpPanelJson } from './McpPanelSectionHelpers';
import { McpServerEditorDialog } from './McpServerEditorDialog';

type SharedStateMap = Record<string, McpSharedServerState>;

/** remote-only MCP 设置面板。 */
export function McpPanel() {
  const { t } = useTranslation();
  const { confirm, ConfirmDialogPortal } = useConfirmDialog();
  const serversResource = useMcpServersResource(true);

  const [settings, setSettings] = useState(getDefaultMcpSettingsConfig());
  const [sharedStates, setSharedStates] = useState<SharedStateMap>({});
  const [audit, setAudit] = useState<McpAuditRecord[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServerConfig | null>(null);
  const [pendingServerId, setPendingServerId] = useState<string | null>(null);
  const [toolServerId, setToolServerId] = useState('');
  const [toolName, setToolName] = useState('');
  const [toolArgsText, setToolArgsText] = useState('{}');
  const [toolResultText, setToolResultText] = useState('');
  const [toolRunning, setToolRunning] = useState(false);

  const servers = serversResource.data;
  const connectedServers = servers.filter((server) => sharedStates[server.id]?.connected);
  const selectedServer = connectedServers.find((server) => server.id === toolServerId) ?? null;

  /**
   * 刷新 MCP 面板当前所需的所有快照。
   *
   * @returns 设置、审计和共享连接状态都会同步到最新值。
   */
  async function reloadPanelSnapshot() {
    const [nextSettings, nextAudit, nextSharedStates] = await Promise.all([
      loadMcpSettingsConfig(),
      loadMcpAudit(20),
      getSharedMcpServerStates(),
    ]);
    setSettings(nextSettings);
    setAudit(nextAudit);
    setSharedStates(nextSharedStates);
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [nextSettings, nextAudit, nextSharedStates] = await Promise.all([
          loadMcpSettingsConfig(),
          loadMcpAudit(20),
          getSharedMcpServerStates(),
        ]);
        if (!alive) return;
        setSettings(nextSettings);
        setAudit(nextAudit);
        setSharedStates(nextSharedStates);
      } catch (error) {
        if (!alive) return;
        toast.error(formatUserError(t, error));
      }
    })();
    return () => {
      alive = false;
    };
  }, [t]);

  useEffect(() => {
    if (connectedServers.some((server) => server.id === toolServerId)) return;
    setToolServerId(connectedServers[0]?.id ?? '');
  }, [connectedServers, toolServerId]);

  useEffect(() => {
    const currentTools = toolServerId ? (sharedStates[toolServerId]?.tools ?? []) : [];
    if (currentTools.some((tool) => tool.name === toolName)) return;
    setToolName(currentTools[0]?.name ?? '');
  }, [sharedStates, toolName, toolServerId]);

  /**
   * 校验当前 server URL 可被安装期普通网页 host access 覆盖。
   *
   * @param server - 待操作的远程 MCP server。
   * @returns URL 合法时正常结束；真实网络失败由 MCP 后台连接链路返回。
   */
  async function ensureServerPermission(server: McpServerConfig) {
    const pattern = toHostMatchPatternFromUrl(server.url);
    if (!pattern) {
      throw new Error(t('errors.invalidUrl', { url: server.url }));
    }
  }

  /**
   * 持久化 MCP server 列表，并同步触发资源 reload。
   *
   * @param nextServers - 下一版完整 server 列表。
   */
  async function persistServers(nextServers: McpServerConfig[]) {
    await saveMcpServers(nextServers);
    await serversResource.reload();
  }

  /**
   * 保存当前编辑中的 MCP server。
   *
   * @param draft - 通过表单或 JSON 规整后的 server 草稿。
   */
  async function handleSaveServer(draft: McpServerDraftConfig) {
    const currentEditing = editingServer;
    if (currentEditing && buildMcpAuthorizationShape(currentEditing) !== buildMcpAuthorizationShape(draft) && currentEditing.oauth.enabled) {
      await clearSharedMcpServerAuthorization(currentEditing.id);
    }

    const nextServers = currentEditing
      ? servers.map((server) => (server.id === currentEditing.id ? { ...server, ...draft } : server))
      : [
          ...servers,
          {
            id: createId(),
            enabled: true,
            ...draft,
          },
        ];

    await persistServers(nextServers);
    await reloadPanelSnapshot();
    setEditorOpen(false);
    setEditingServer(null);
    toast.success(t(currentEditing ? 'mcpBridgePanel.toast.serverUpdated' : 'mcpBridgePanel.toast.serverAdded'));
  }

  /**
   * 切换聊天工具总开关。
   *
   * @param enabled - 是否启用 MCP chat tools。
   */
  async function handleToggleChatTools(enabled: boolean) {
    try {
      const next = { ...settings, chatToolsEnabled: enabled };
      await saveMcpSettingsConfig(next);
      setSettings(next);
      toast.success(t('common.save'));
    } catch (error) {
      toast.error(formatUserError(t, error));
    }
  }

  /**
   * 连接指定 remote MCP server。
   *
   * @param server - 待连接的 server。
   */
  async function handleConnect(server: McpServerConfig) {
    setPendingServerId(server.id);
    try {
      await ensureServerPermission(server);
      await connectSharedMcpServer(server.id);
      await reloadPanelSnapshot();
    } catch (error) {
      toast.error(formatUserError(t, error));
    } finally {
      setPendingServerId(null);
    }
  }

  /**
   * 断开指定 remote MCP server。
   *
   * @param serverId - 目标 serverId。
   */
  async function handleDisconnect(serverId: string) {
    setPendingServerId(serverId);
    try {
      await disconnectSharedMcpServer(serverId);
      await reloadPanelSnapshot();
    } catch (error) {
      toast.error(formatUserError(t, error));
    } finally {
      setPendingServerId(null);
    }
  }

  /**
   * 强制刷新指定 server 的工具目录。
   *
   * @param server - 目标 server。
   */
  async function handleRefreshTools(server: McpServerConfig) {
    setPendingServerId(server.id);
    try {
      await ensureServerPermission(server);
      await listSharedMcpServerTools(server.id, { forceRefresh: true });
      await reloadPanelSnapshot();
      toast.success(t('mcpBridgePanel.toast.toolsRefreshed', { count: sharedStates[server.id]?.tools.length ?? 0 }));
    } catch (error) {
      toast.error(formatUserError(t, error));
    } finally {
      setPendingServerId(null);
    }
  }

  /**
   * 触发指定 OAuth server 的授权流程。
   *
   * @param server - 目标 server。
   */
  async function handleAuthorize(server: McpServerConfig) {
    setPendingServerId(server.id);
    try {
      await ensureServerPermission(server);
      await authorizeSharedMcpServer(server.id);
      await reloadPanelSnapshot();
      toast.success(t('mcpBridgePanel.toast.authorizationDone'));
    } catch (error) {
      toast.error(formatUserError(t, error));
    } finally {
      setPendingServerId(null);
    }
  }

  /**
   * 清理指定 server 的 OAuth 授权缓存。
   *
   * @param server - 目标 server。
   */
  async function handleClearAuthorization(server: McpServerConfig) {
    setPendingServerId(server.id);
    try {
      await clearSharedMcpServerAuthorization(server.id);
      await reloadPanelSnapshot();
      toast.success(t('mcpBridgePanel.toast.authorizationCleared'));
    } catch (error) {
      toast.error(formatUserError(t, error));
    } finally {
      setPendingServerId(null);
    }
  }

  /**
   * 切换单个 MCP server 的启用状态。
   *
   * @param server - 目标 server。
   * @param enabled - 下一状态。
   */
  async function handleToggleServer(server: McpServerConfig, enabled: boolean) {
    setPendingServerId(server.id);
    try {
      if (!enabled) {
        await disconnectSharedMcpServer(server.id);
      }
      await persistServers(
        servers.map((item) => (item.id === server.id ? { ...item, enabled } : item)),
      );
      await reloadPanelSnapshot();
    } catch (error) {
      toast.error(formatUserError(t, error));
    } finally {
      setPendingServerId(null);
    }
  }

  /**
   * 删除一个 MCP server。
   *
   * @param server - 待删除的 server。
   */
  async function handleDeleteServer(server: McpServerConfig) {
    const ok = await confirm({
      title: t('mcpBridgePanel.toast.serverDeleteConfirm', { name: server.name }),
      description: t('mcpBridgePanel.toast.serverDeleteConfirmDesc'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      variant: 'destructive',
    });
    if (!ok) return;
    setPendingServerId(server.id);
    try {
      if (server.oauth.enabled) {
        await clearSharedMcpServerAuthorization(server.id);
      } else {
        await disconnectSharedMcpServer(server.id).catch(() => void 0);
      }
      await persistServers(servers.filter((item) => item.id !== server.id));
      await reloadPanelSnapshot();
      toast.success(t('mcpBridgePanel.toast.serverDeleted'));
    } catch (error) {
      toast.error(formatUserError(t, error));
    } finally {
      setPendingServerId(null);
    }
  }

  /** 执行一次 MCP 工具调用，并把结果写入审计。 */
  async function handleRunTool() {
    if (!selectedServer) {
      toast.error(t('mcpBridgePanel.toast.toolNeedServer'));
      return;
    }
    if (!toolName.trim()) {
      toast.error(t('mcpBridgePanel.toast.toolNeedTool'));
      return;
    }

    let args: unknown;
    try {
      args = JSON.parse(toolArgsText || '{}');
    } catch {
      toast.error(t('mcpBridgePanel.toast.argsInvalidJson'));
      return;
    }

    setToolRunning(true);
    const startedAt = Date.now();
    try {
      await ensureServerPermission(selectedServer);
      const result = await callSharedMcpTool(selectedServer.id, toolName, args);
      const record: McpAuditRecord = {
        id: createId(),
        at: Date.now(),
        serverId: selectedServer.id,
        tool: toolName,
        args,
        ok: true,
        durationMs: Date.now() - startedAt,
        result,
      };
      await appendMcpAudit(record);
      setAudit((current) => [record, ...current].slice(0, 20));
      setToolResultText(formatMcpPanelJson(result));
      toast.success(t('mcpBridgePanel.toast.toolDone'));
    } catch (error) {
      const message = formatUserError(t, error);
      const record: McpAuditRecord = {
        id: createId(),
        at: Date.now(),
        serverId: selectedServer.id,
        tool: toolName,
        args,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: message,
      };
      await appendMcpAudit(record);
      setAudit((current) => [record, ...current].slice(0, 20));
      setToolResultText(message);
      toast.error(t('mcpBridgePanel.toast.toolFailed', { error: message }));
    } finally {
      setToolRunning(false);
    }
  }

  return (
    <SettingsPanelRoot>
      <SettingsPanelScroller>
        <SettingsPanelInset>
          <div className="space-y-6">
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold">
                <Plug className="h-5 w-5" />
                {t('mcpBridgePanel.title')}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{t('mcpBridgePanel.description')}</p>
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor="mcp-chat-tools" className="text-sm font-medium">
                    {t('mcpBridgePanel.settings.chatTools')}
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('mcpBridgePanel.settings.chatToolsDesc')}
                  </p>
                </div>
                <Switch
                  id="mcp-chat-tools"
                  checked={settings.chatToolsEnabled}
                  onCheckedChange={(checked) => void handleToggleChatTools(Boolean(checked))}
                />
              </div>
            </div>

            <McpServerListSection
              t={t}
              resource={serversResource}
              sharedStates={sharedStates}
              pendingServerId={pendingServerId}
              onAdd={() => {
                setEditingServer(null);
                setEditorOpen(true);
              }}
              onToggleServer={(server, enabled) => void handleToggleServer(server, enabled)}
              onConnect={(server) => void handleConnect(server)}
              onDisconnect={(serverId) => void handleDisconnect(serverId)}
              onRefreshTools={(server) => void handleRefreshTools(server)}
              onAuthorize={(server) => void handleAuthorize(server)}
              onClearAuthorization={(server) => void handleClearAuthorization(server)}
              onEdit={(server) => {
                setEditingServer(server);
                setEditorOpen(true);
              }}
              onDelete={(server) => void handleDeleteServer(server)}
            />

            <McpToolRunnerSection
              t={t}
              connectedServers={connectedServers}
              sharedStates={sharedStates}
              toolServerId={toolServerId}
              toolName={toolName}
              toolArgsText={toolArgsText}
              toolResultText={toolResultText}
              toolRunning={toolRunning}
              onChangeToolServerId={setToolServerId}
              onChangeToolName={setToolName}
              onChangeToolArgsText={setToolArgsText}
              onRunTool={() => void handleRunTool()}
            />

            <McpAuditSection t={t} audit={audit} />
          </div>
        </SettingsPanelInset>
      </SettingsPanelScroller>

      <McpServerEditorDialog
        open={editorOpen}
        editingServer={editingServer}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) {
            setEditingServer(null);
          }
        }}
        onSave={handleSaveServer}
      />
      <ConfirmDialogPortal />
    </SettingsPanelRoot>
  );
}
