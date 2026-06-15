/**
 * 说明：`McpPanel.spec` 组件模块。
 *
 * 职责：
 * - 覆盖 remote-only MCP 设置页的关键交互；
 * - 确认服务列表、全局开关、连接与 OAuth 授权按钮会落到正确依赖；
 * - 不再覆盖任何 bridge / stdio 分支。
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { McpServerConfig } from '@/types/mcp';

const {
  loadMcpSettingsConfigMock,
  saveMcpSettingsConfigMock,
  loadMcpAuditMock,
  appendMcpAuditMock,
  saveMcpServersMock,
  useMcpServersResourceMock,
  getSharedMcpServerStatesMock,
  connectSharedMcpServerMock,
  disconnectSharedMcpServerMock,
  listSharedMcpServerToolsMock,
  callSharedMcpToolMock,
  authorizeSharedMcpServerMock,
  clearSharedMcpServerAuthorizationMock,
} = vi.hoisted(() => ({
  loadMcpSettingsConfigMock: vi.fn(),
  saveMcpSettingsConfigMock: vi.fn(),
  loadMcpAuditMock: vi.fn(),
  appendMcpAuditMock: vi.fn(),
  saveMcpServersMock: vi.fn(),
  useMcpServersResourceMock: vi.fn(),
  getSharedMcpServerStatesMock: vi.fn(),
  connectSharedMcpServerMock: vi.fn(),
  disconnectSharedMcpServerMock: vi.fn(),
  listSharedMcpServerToolsMock: vi.fn(),
  callSharedMcpToolMock: vi.fn(),
  authorizeSharedMcpServerMock: vi.fn(),
  clearSharedMcpServerAuthorizationMock: vi.fn(),
})); 

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/hooks/useToast', () => ({ toast }));

vi.mock('@/lib/mcp/storage', () => ({
  getDefaultMcpSettingsConfig: () => ({ chatToolsEnabled: true }),
  loadMcpSettingsConfig: loadMcpSettingsConfigMock,
  saveMcpSettingsConfig: saveMcpSettingsConfigMock,
  loadMcpAudit: loadMcpAuditMock,
  appendMcpAudit: appendMcpAuditMock,
  saveMcpServers: saveMcpServersMock,
}));

vi.mock('@/lib/mcp/use-mcp-servers-resource', () => ({
  useMcpServersResource: useMcpServersResourceMock,
}));

vi.mock('@/lib/mcp/background-client', () => ({
  getSharedMcpServerStates: getSharedMcpServerStatesMock,
  connectSharedMcpServer: connectSharedMcpServerMock,
  disconnectSharedMcpServer: disconnectSharedMcpServerMock,
  listSharedMcpServerTools: listSharedMcpServerToolsMock,
  callSharedMcpTool: callSharedMcpToolMock,
  authorizeSharedMcpServer: authorizeSharedMcpServerMock,
  clearSharedMcpServerAuthorization: clearSharedMcpServerAuthorizationMock,
}));

vi.mock('./McpServerEditorDialog', () => ({
  McpServerEditorDialog: ({
    open,
    editingServer,
    onSave,
  }: {
    open: boolean;
    editingServer: McpServerConfig | null;
    onSave: (server: {
      name: string;
      type: 'streamable-http';
      url: string;
      headers: Record<string, string>;
      oauth: {
        enabled: boolean;
        registrationStrategy: 'dynamic';
        scopes: string[];
        tokenEndpointAuthMethod: 'none';
      };
    }) => void | Promise<void>;
  }) => (
    open ? (
      <button
        type="button"
        onClick={() => void onSave({
          name: editingServer?.name ?? 'New MCP Server',
          type: 'streamable-http',
          url: 'https://new.example/mcp',
          headers: { Authorization: 'Bearer token' },
          oauth: {
            enabled: Boolean(editingServer?.oauth.enabled),
            registrationStrategy: 'dynamic',
            scopes: [],
            tokenEndpointAuthMethod: 'none',
          },
        })}
      >
        dialog-save
      </button>
    ) : null
  ),
}));

import { McpPanel } from './McpPanel';

/**
 * 创建一个默认 remote-only MCP server 测试样本。
 *
 * @param overrides - 需要覆盖的字段。
 * @returns 合并覆盖后的 MCP server 配置。
 */
function makeServer(overrides?: Partial<McpServerConfig>): McpServerConfig {
  return {
    id: 'server-1',
    name: 'Remote MCP',
    type: 'streamable-http',
    url: 'https://example.com/mcp',
    headers: {},
    oauth: {
      enabled: false,
      registrationStrategy: 'dynamic',
      scopes: [],
      tokenEndpointAuthMethod: 'none',
    },
    enabled: true,
    ...overrides,
  };
}

describe('McpPanel', () => {
  const reloadMock = vi.fn(async () => {});
  let servers: McpServerConfig[];

  beforeEach(() => {
    vi.clearAllMocks();
    servers = [makeServer()];
    loadMcpSettingsConfigMock.mockResolvedValue({ chatToolsEnabled: true });
    saveMcpSettingsConfigMock.mockResolvedValue(undefined);
    loadMcpAuditMock.mockResolvedValue([]);
    appendMcpAuditMock.mockResolvedValue(undefined);
    saveMcpServersMock.mockResolvedValue(undefined);
    getSharedMcpServerStatesMock.mockResolvedValue({
      'server-1': {
        connected: true,
        meta: {
          protocolVersion: '2025-11-25',
          serverName: 'Remote MCP',
          serverVersion: '1.0.0',
        },
        tools: [{ name: 'fetch' }],
      },
    });
    connectSharedMcpServerMock.mockResolvedValue({
      meta: { protocolVersion: '2025-11-25', serverName: 'Remote MCP', serverVersion: '1.0.0' },
      tools: [{ name: 'fetch' }],
    });
    disconnectSharedMcpServerMock.mockResolvedValue(undefined);
    listSharedMcpServerToolsMock.mockResolvedValue({
      meta: { protocolVersion: '2025-11-25', serverName: 'Remote MCP', serverVersion: '1.0.0' },
      tools: [{ name: 'fetch' }, { name: 'search' }],
    });
    callSharedMcpToolMock.mockResolvedValue({ content: [] });
    authorizeSharedMcpServerMock.mockResolvedValue(undefined);
    clearSharedMcpServerAuthorizationMock.mockResolvedValue(undefined);
    useMcpServersResourceMock.mockImplementation(() => ({
      status: 'ready',
      data: servers,
      error: null,
      enabledServers: servers.filter((server) => server.enabled),
      reload: reloadMock,
    }));
  });

  it('渲染 remote-only 服务列表与工具计数', async () => {
    render(<McpPanel />);

    expect(await screen.findByText('Remote MCP')).toBeInTheDocument();
    expect(screen.getByText('mcpBridgePanel.serverType.streamableHttp')).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('https://example.com/mcp'))).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('mcpBridgePanel.servers.toolsCount'))).toBeInTheDocument();
  });

  it('切换聊天工具开关时会写回 MCP settings', async () => {
    render(<McpPanel />);

    const toggle = await screen.findByRole('switch', { name: 'mcpBridgePanel.settings.chatTools' });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(saveMcpSettingsConfigMock).toHaveBeenCalledWith({ chatToolsEnabled: false });
    });
  });

  it('点击连接会直接连接 shared MCP session，不再请求运行时 网络目标', async () => {
    getSharedMcpServerStatesMock.mockResolvedValue({});
    render(<McpPanel />);

    const connectButton = await screen.findByText('mcpBridgePanel.servers.connect');
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(connectSharedMcpServerMock).toHaveBeenCalledWith('server-1');
    });
  });

  it('支持新增 remote MCP 服务', async () => {
    render(<McpPanel />);

    fireEvent.click(await screen.findByText('mcpBridgePanel.servers.add'));
    fireEvent.click(await screen.findByText('dialog-save'));

    await waitFor(() => {
      expect(saveMcpServersMock).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({
          name: 'New MCP Server',
          type: 'streamable-http',
          url: 'https://new.example/mcp',
        }),
      ]));
    });
  });

  it('OAuth 服务可显式触发授权与清授权', async () => {
    const user = userEvent.setup();
    servers = [
      makeServer({
        oauth: {
          enabled: true,
          registrationStrategy: 'dynamic',
          scopes: [],
          tokenEndpointAuthMethod: 'none',
        },
      }),
    ];
    render(<McpPanel />);

    await user.click(await screen.findByText('mcpBridgePanel.servers.authorize'));
    await waitFor(() => expect(authorizeSharedMcpServerMock).toHaveBeenCalledWith('server-1'));

    const clearAuthorizationButton = screen.getByText('mcpBridgePanel.servers.clearAuthorization');
    await waitFor(() => expect(clearAuthorizationButton).not.toBeDisabled());
    await user.click(clearAuthorizationButton);

    await waitFor(() => expect(clearSharedMcpServerAuthorizationMock).toHaveBeenCalledWith('server-1'));
  });

  it('删除 MCP 服务时先打开共享危险确认，取消不会删除', async () => {
    render(<McpPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /mcpBridgePanel\.servers\.delete/ }));

    const confirmDialog = screen.getByRole('alertdialog');
    expect(confirmDialog).toHaveTextContent('mcpBridgePanel.toast.serverDeleteConfirm');
    expect(confirmDialog).toHaveTextContent('mcpBridgePanel.toast.serverDeleteConfirmDesc');
    expect(screen.getByTestId('confirm-dialog-warning-icon')).toHaveClass('text-destructive');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'common.cancel' }));

    expect(saveMcpServersMock).not.toHaveBeenCalled();
  });

  it('确认删除 MCP 服务后移除配置并刷新状态', async () => {
    render(<McpPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /mcpBridgePanel\.servers\.delete/ }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'common.delete' }));

    await waitFor(() => {
      expect(disconnectSharedMcpServerMock).toHaveBeenCalledWith('server-1');
      expect(saveMcpServersMock).toHaveBeenCalledWith([]);
      expect(toast.success).toHaveBeenCalledWith('mcpBridgePanel.toast.serverDeleted');
    });
  });
});
