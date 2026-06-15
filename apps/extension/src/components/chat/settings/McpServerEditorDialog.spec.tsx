/**
 * 说明：`McpServerEditorDialog.spec` 组件模块。
 *
 * 职责：
 * - 守住 MCP 服务编辑弹窗的显式类型输入、JSON round-trip 与 remote-only 错误表达；
 * - 防止弹窗再次泄露 raw i18n key，或把 bridge / stdio / shared session 这类内部叙事写回默认文案。
 *
 * 边界：
 * - 这里只覆盖弹窗自身交互，不替代 MCP 设置页整体的集成测试。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { McpServerEditorDialog } from './McpServerEditorDialog';

const originalScrollIntoView = Element.prototype.scrollIntoView;

const translations = {
  common: {
    add: '添加',
    cancel: '取消',
    close: '关闭',
    save: '保存',
  },
  errors: {
    mcpConfigStringMapRequired: '{{field}} 必须是 JSON 对象',
    mcpConfigStdioUnsupported: '当前只支持远程 Streamable HTTP MCP 服务，不支持 stdio / command 配置',
    mcpStreamableHttpUrlMissing: '缺少 Streamable HTTP URL',
    jsonParseFailedWithDetail: 'JSON 解析失败：{{detail}}（输入：{{hint}}）',
  },
  mcpBridgePanel: {
    toast: {
      serverNameRequired: '请输入服务名称',
    },
    dialog: {
      addTitle: '添加 MCP 服务',
      editTitle: '编辑 MCP 服务',
      description: '填写远程 Streamable HTTP MCP 服务地址；如需连接本地服务，请先把它暴露成 HTTP 端点。',
      formMode: '表单模式',
      jsonMode: 'JSON 模式',
      type: '服务类型',
      name: '服务名称',
      namePlaceholder: '例如 GitHub MCP',
      url: '服务 URL',
      jsonConfig: '完整的 JSON 配置',
      jsonHint: '支持标准 mcpServers 包装格式。必须显式提供 `type` 和 `url`；当前只接受 `type`、`url`、`headers`、`oauth`。',
      parseToForm: '解析并切换到表单模式',
      headers: '请求头（可选）',
      headersPlaceholder: '{"Authorization":"Bearer xxx"}',
      headersHint: 'JSON 对象格式；会附加到每次 Streamable HTTP 请求头。',
      warnStreamableHttp: '保存时会按你填写的 URL、请求头和 OAuth 配置连接这个 MCP 服务。',
    },
    serverType: {
      streamableHttp: 'Streamable HTTP',
    },
    oauth: {
      enable: '启用 OAuth',
      enableHint: '启用后，扩展会按 MCP 远程授权规范做 metadata discovery、DCR / prereg client、PKCE 与 token refresh。',
      registrationStrategy: '注册策略',
      dynamic: '动态注册（DCR）',
      preregistered: '预注册客户端',
      scopes: 'Scopes（每行一个）',
      resource: 'Resource override',
      protectedResourceMetadataUrl: 'Protected Resource Metadata URL',
      authorizationServerMetadataUrl: 'Authorization Server Metadata URL',
      dynamicClientName: '动态客户端名称',
      tokenEndpointAuthMethod: 'Token Endpoint 鉴权方式',
      tokenEndpointAuthNone: 'none',
      tokenEndpointAuthSecretPost: 'client_secret_post',
      preregClientId: '预注册 Client ID',
      preregClientSecret: '预注册 Client Secret',
    },
    servers: {
      add: '添加服务',
    },
  },
} as const;

/**
 * 按点分路径从测试用翻译表里取出最终文案。
 *
 * @param key - i18n key。
 * @returns 命中的字符串文案；未命中时回退原 key。
 */
function resolveTranslation(key: string): string {
  const value = key.split('.').reduce<unknown>((acc, part) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[part];
  }, translations);
  return typeof value === 'string' ? value : key;
}

/**
 * 模拟测试环境里的 `t()`，并替换模板参数。
 *
 * @param key - i18n key。
 * @param params - 插值参数。
 * @returns 已完成插值的测试文案。
 */
function translate(key: string, params?: Record<string, unknown>) {
  return resolveTranslation(key).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => String(params?.[name] ?? ''));
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translate }),
}));

describe('McpServerEditorDialog', () => {
  beforeAll(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
  });

  afterAll(() => {
    if (originalScrollIntoView) {
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
        writable: true,
      });
      return;
    }
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it('新建弹窗默认显示显式类型下拉，并导出包含 type 的 canonical JSON', async () => {
    const user = userEvent.setup();
    render(<McpServerEditorDialog open editingServer={null} onOpenChange={() => void 0} onSave={() => void 0} />);

    const streamableHttpWarning = screen
      .getByText('保存时会按你填写的 URL、请求头和 OAuth 配置连接这个 MCP 服务。')
      .closest('[data-inline-notice]');

    expect(screen.getByRole('combobox', { name: '服务类型' })).toHaveTextContent('Streamable HTTP');
    expect(screen.getByText('填写远程 Streamable HTTP MCP 服务地址；如需连接本地服务，请先把它暴露成 HTTP 端点。')).toBeInTheDocument();
    expect(screen.queryByText(/bridge|shared session|stdio/i)).not.toBeInTheDocument();
    expect(streamableHttpWarning).toBeInTheDocument();
    expect(streamableHttpWarning?.className).toContain('items-center');
    expect(streamableHttpWarning?.querySelector('[data-inline-notice-icon] svg')).toHaveAttribute('aria-hidden', 'true');
    expect(streamableHttpWarning?.className).not.toContain('translate-y');

    await user.click(screen.getByRole('button', { name: 'JSON 模式' }));

    expect(String(screen.getByRole('textbox', { name: '完整的 JSON 配置' }).textContent)).toContain('"type": "streamable-http"');
  });

  it('未填任何字段时，表单和 JSON 模式可以安全切换，不会泄露 transport 推断错误', async () => {
    const user = userEvent.setup();
    render(<McpServerEditorDialog open editingServer={null} onOpenChange={() => void 0} onSave={() => void 0} />);

    await user.click(screen.getByRole('button', { name: 'JSON 模式' }));
    await user.click(screen.getByRole('button', { name: '表单模式' }));

    expect(screen.getByRole('combobox', { name: '服务类型' })).toHaveTextContent('Streamable HTTP');
    expect(screen.queryByText('errors.mcpConfigTransportInferenceFailed')).not.toBeInTheDocument();
    expect(screen.queryByText('无法判断 MCP 服务类型：请至少提供 command 或 url')).not.toBeInTheDocument();
  });

  it('JSON 模式下粘贴 stdio 配置时显示翻译后的 remote-only 错误，不显示 raw key', async () => {
    const user = userEvent.setup();
    render(<McpServerEditorDialog open editingServer={null} onOpenChange={() => void 0} onSave={() => void 0} />);

    await user.click(screen.getByRole('button', { name: 'JSON 模式' }));
    fireEvent.change(screen.getByRole('textbox', { name: '完整的 JSON 配置' }), {
      target: {
        value: JSON.stringify(
          {
            mcpServers: {
              server: {
                command: 'npx',
                args: ['@modelcontextprotocol/server-filesystem', '/tmp'],
              },
            },
          },
          null,
          2,
        ),
      },
    });

    await user.click(screen.getByRole('button', { name: '解析并切换到表单模式' }));

    expect(screen.getByText('当前只支持远程 Streamable HTTP MCP 服务，不支持 stdio / command 配置')).toBeInTheDocument();
    expect(screen.queryByText('errors.mcpConfigStdioUnsupported')).not.toBeInTheDocument();
  });

  it('JSON 模式缺少 url 时会落到缺 URL 错误，而不是 transport 推断错误', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<McpServerEditorDialog open editingServer={null} onOpenChange={() => void 0} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: 'JSON 模式' }));
    fireEvent.change(screen.getByRole('textbox', { name: '完整的 JSON 配置' }), {
      target: {
        value: JSON.stringify(
          {
            mcpServers: {
              server: {
                type: 'streamable-http',
              },
            },
          },
          null,
          2,
        ),
      },
    });

    await user.click(screen.getByRole('button', { name: '添加服务' }));

    expect(screen.getByText('缺少 Streamable HTTP URL')).toBeInTheDocument();
    expect(screen.queryByText('errors.mcpConfigTransportInferenceFailed')).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
