/**
 * 说明：`ModelManagerProviderDetail.spec` 组件模块。
 *
 * 职责：
 * - 覆盖右侧“已添加模型”列表区域的最小高度与内部滚动容器约束；
 * - 防止模型为空或表单区变高时，模型列表再次被压缩成过窄短条。
 *
 * 边界：
 * - 本文件只验证当前详情区的布局约束与空态渲染，不扩散 catalog/provider dialog 的其它行为。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ModelManagerProviderDetail } from './ModelManagerProviderDetail';
import type { ModelManagerPanelController } from './useModelManagerPanelController';

const { toastError } = vi.hoisted(() => ({
  toastError: vi.fn(),
}));
const originalScrollIntoView = Element.prototype.scrollIntoView;

vi.mock('@/hooks/useToast', () => ({
  toast: {
    error: toastError,
  },
}));

vi.mock('@/components/ui/ProviderIcon', () => ({
  ProviderIcon: ({ providerId }: { providerId: string }) => <span data-testid={`provider-icon-${providerId}`}>{providerId}</span>,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

type TestModel = {
  id: string;
  name: string;
  group: string;
  isDefault?: boolean;
};

/**
 * 测试辅助函数：`createController`。
 *
 * @remarks
 * 为详情区渲染提供最小可用 controller，避免把测试耦合到真实 hook 状态机构造。
 */
function createController(
  models: TestModel[],
  providerOverrides: Record<string, unknown> = {},
  updateProvider = vi.fn(),
) {
  const selected = {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.openai.com/v1',
    enabled: true,
    models,
    ...providerOverrides,
  };

  const inlineGroups = models.reduce<Record<string, TestModel[]>>((groups, model) => {
    const key = model.group || '默认';
    groups[key] ??= [];
    groups[key].push(model);
    return groups;
  }, {});

  const selectedModelViews = new Map(
    models.map((model) => [
      model.id,
      {
        rowBadgeKeys: [],
        baseModelKey: model.id.split('/').pop()?.trim().toLowerCase() || '',
        versionSortKey: model.id.split('/').pop()?.trim().toLowerCase() || '',
      },
    ]),
  );

  const controller = {
    apiKeys: {
      apiKeyDraft: '',
      commitInlineApiKeyDraft: vi.fn(),
      openApiKeyListDialog: vi.fn(),
      setApiKeyDraft: vi.fn(),
    },
    catalog: {
      setManageOpen: vi.fn(),
    },
    collapsedGroups: new Set<string>(),
    headersDialog: {
      openHeadersDialog: vi.fn(),
    },
    health: {
      canRunHealthCheck: true,
      clearHealthResults: vi.fn(),
      setHealthOpen: vi.fn(),
    },
    modelDialog: {
      inlineFilteredModels: models,
      inlineGroups,
      inlineModelSearch: '',
      inlineModelSearchInputRef: { current: null },
      inlineModelSearchOpen: false,
      openAddModel: vi.fn(),
      openEditModel: vi.fn(),
      removeModel: vi.fn(),
      setInlineModelSearch: vi.fn(),
      setInlineModelSearchOpen: vi.fn(),
    },
    providerDialog: {
      handleRemoveProvider: vi.fn(),
      openEditProvider: vi.fn(),
    },
    providersState: {
      apiKeysForUi: [],
      getProviderDisplayName: (provider: { name: string }) => provider.name,
      hasDirtyChange: false,
      retrySaveProviders: vi.fn(),
      saveError: '',
      selected,
      selectedModelViews,
      updateProvider,
    },
    t: (key: string, params?: Record<string, string | number>) => {
      if (key === 'modelManagerPanel.models.title') return '已添加模型';
      if (key === 'modelManagerPanel.models.empty') return '暂无模型';
      if (key === 'modelManagerPanel.actions.manage') return '管理';
      if (key === 'modelManagerPanel.actions.add') return '添加';
      if (key === 'modelManagerPanel.actions.healthCheck') return '健康检查';
      if (key === 'modelManagerPanel.apiKey.title') return 'API Key';
      if (key === 'modelManagerPanel.apiKey.placeholder') return '输入 API Key';
      if (key === 'modelManagerPanel.apiKey.hintMain') return '主 Key 提示';
      if (key === 'modelManagerPanel.apiKey.inlineHintMulti') return '多 Key 提示';
      if (key === 'modelManagerPanel.apiKey.moreKeys') return `还有 ${params?.count ?? 0} 个 Key`;
      if (key === 'modelManagerPanel.apiKey.manageAll') return '管理全部';
      if (key === 'modelManagerPanel.apiKey.settings') return 'Key 设置';
      if (key === 'modelManagerPanel.apiBase.title') return 'API Base';
      if (key === 'modelManagerPanel.apiBase.overrideTitle') return 'API 地址（可选）';
      if (key === 'modelManagerPanel.apiBase.overrideHint') return '仅用于自定义代理';
      if (key === 'modelManagerPanel.apiBase.overridePlaceholder') return '留空使用官方默认地址';
      if (key === 'modelManagerPanel.apiBase.preview') return `预览 URL：${String(params?.url ?? '')}`;
      if (key === 'modelManagerPanel.apiBase.previewBase') return `预览 Base：${String(params?.url ?? '')}`;
      if (key === 'modelManagerPanel.apiBase.previewTransportDependent') return `预览 Base：${String(params?.url ?? '')}（具体聊天端点由模型协议决定）`;
      if (key === 'modelManagerPanel.apiBase.emptyHint') return '未配置 API Base';
      if (key === 'modelManagerPanel.bedrock.title') return 'AWS Bedrock';
      if (key === 'modelManagerPanel.bedrock.sectionHint') return 'Bedrock 使用 IAM 或官方 Bedrock API Key。';
      if (key === 'modelManagerPanel.bedrock.authType') return '鉴权方式';
      if (key === 'modelManagerPanel.bedrock.authTypeHint') return 'IAM 走 AK/SK；API Key 走官方 Bearer。';
      if (key === 'modelManagerPanel.bedrock.authTypeOptions.iam') return 'IAM（Access Key / Secret Key）';
      if (key === 'modelManagerPanel.bedrock.authTypeOptions.apiKey') return 'Bedrock API Key';
      if (key === 'modelManagerPanel.bedrock.region') return '区域 Region';
      if (key === 'modelManagerPanel.bedrock.regionHint') return '例如 us-east-1';
      if (key === 'modelManagerPanel.bedrock.accessKeyId') return '访问密钥 Access Key ID';
      if (key === 'modelManagerPanel.bedrock.accessKeyIdHint') return 'IAM 模式必填';
      if (key === 'modelManagerPanel.bedrock.secretAccessKey') return '私有密钥 Secret Access Key';
      if (key === 'modelManagerPanel.bedrock.secretAccessKeyHint') return 'IAM 模式必填';
      if (key === 'modelManagerPanel.bedrock.sessionToken') return '临时会话令牌 Session Token（可选）';
      if (key === 'modelManagerPanel.bedrock.sessionTokenHint') return '临时凭证可填';
      if (key === 'modelManagerPanel.bedrock.apiKey') return 'Bedrock API Key';
      if (key === 'modelManagerPanel.bedrock.apiKeyHint') return '官方 Bedrock API Key';
      if (key === 'modelManagerPanel.bedrock.hint') return 'Bedrock 使用 IAM 或官方 Bedrock API Key 鉴权。';
      if (key === 'modelManagerPanel.vertex.title') return 'Vertex AI';
      if (key === 'modelManagerPanel.vertex.sectionHint') return 'Vertex AI 普通模式说明';
      if (key === 'modelManagerPanel.vertex.sectionHintAnthropic') return 'Vertex AI Anthropic 模式说明';
      if (key === 'modelManagerPanel.vertex.authType') return '鉴权方式';
      if (key === 'modelManagerPanel.vertex.authTypeHint') return 'Service Account 或 API Key';
      if (key === 'modelManagerPanel.vertex.authTypeOptions.serviceAccount') return 'Service Account';
      if (key === 'modelManagerPanel.vertex.authTypeOptions.apiKey') return 'API Key（express mode）';
      if (key === 'modelManagerPanel.vertex.projectId') return '项目 ID projectId';
      if (key === 'modelManagerPanel.vertex.projectIdHint') return 'GCP 项目标识';
      if (key === 'modelManagerPanel.vertex.location') return '区域 location';
      if (key === 'modelManagerPanel.vertex.locationHint') return 'Vertex 区域';
      if (key === 'modelManagerPanel.vertex.clientEmail') return 'Client Email';
      if (key === 'modelManagerPanel.vertex.clientEmailHint') return '服务账号邮箱';
      if (key === 'modelManagerPanel.vertex.privateKey') return 'Private Key';
      if (key === 'modelManagerPanel.vertex.privateKeyHint') return '服务账号私钥';
      if (key === 'modelManagerPanel.vertex.privateKeyPlaceholder') return '粘贴 private key';
      if (key === 'modelManagerPanel.vertex.privateKeyId') return 'Private Key ID（可选）';
      if (key === 'modelManagerPanel.vertex.privateKeyIdHint') return '可选私钥 ID';
      if (key === 'modelManagerPanel.vertex.apiKey') return 'Vertex API Key';
      if (key === 'modelManagerPanel.vertex.apiKeyHint') return 'express mode key';
      if (key === 'modelManagerPanel.vertex.hint') return 'Vertex AI 可使用 Service Account 或 API Key（express mode）。';
      if (key === 'modelManagerPanel.vertex.hintAnthropic') return 'Vertex Anthropic 固定使用 Service Account。';
      if (key === 'modelManagerPanel.azure.title') return 'Azure OpenAI';
      if (key === 'modelManagerPanel.azure.sectionHint') return 'Azure 支持 deployment + api-version 或 /openai/v1 endpoint。';
      if (key === 'modelManagerPanel.azure.apiShape') return 'API 形态';
      if (key === 'modelManagerPanel.azure.apiShapeHint') return '选择 Azure endpoint 形态';
      if (key === 'modelManagerPanel.azure.apiShapeOptions.deployment') return 'Deployment endpoint + api-version';
      if (key === 'modelManagerPanel.azure.apiShapeOptions.v1') return 'Azure OpenAI v1 endpoint';
      if (key === 'modelManagerPanel.azure.apiVersion') return 'API Version';
      if (key === 'modelManagerPanel.azure.apiVersionHint') return 'Deployment 模式必填';
      if (key === 'modelManagerPanel.azure.apiVersionPlaceholder') return '例如 2024-10-21';
      if (key === 'modelManagerPanel.azure.hint') return 'Azure 模式切换说明';
      if (key === 'modelManagerPanel.newApi.title') return 'NewAPI';
      if (key === 'modelManagerPanel.newApi.sectionHint') return 'NewAPI 可按模型协议分流';
      if (key === 'modelManagerPanel.newApi.anthropicApiHost') return 'Anthropic Messages 地址（可选）';
      if (key === 'modelManagerPanel.newApi.anthropicApiHostHint') return '留空复用 API 地址';
      if (key === 'modelManagerPanel.newApi.anthropicApiHostPlaceholder') return '例如 https://api.example.com/anthropic/v1';
      if (key === 'modelManagerPanel.newApi.hint') return '只影响 Anthropic Messages 分流。';
      if (key === 'modelManagerPanel.apiKey.errorUrlLike') return '这里需要填写 API Key，不是 API 地址。';
      if (key === 'modelManagerPanel.actions.customHeaders') return '自定义请求头';
      if (key === 'common.delete') return '删除';
      if (key === 'common.edit') return '编辑';
      if (key === 'common.clear') return '清空';
      if (key === 'common.search') return '搜索';
      return key;
    },
    toggleGroup: vi.fn(),
  } as unknown as ModelManagerPanelController;

  return controller;
}

/** 断言 Provider 专用配置区只保留无外框分组，不回退成卡片壳。 */
function expectConfigSectionHasNoOuterFrame(testId: 'model-manager-cloud-config-section' | 'model-manager-connection-config-section') {
  const classNames = screen.getByTestId(testId).className.split(/\s+/);
  expect(classNames).toEqual(expect.arrayContaining(['shrink-0', 'space-y-3']));
  expect(classNames).not.toContain('rounded-lg');
  expect(classNames).not.toContain('border');
  expect(classNames).not.toContain('border-border/70');
  expect(classNames).not.toContain('p-3');
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  toastError.mockClear();
});

afterAll(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

describe('ModelManagerProviderDetail', () => {
  it('Provider 头部检测按钮使用固定右侧槽位，不继承设置行拉伸规则', () => {
    render(<ModelManagerProviderDetail controller={createController([])} />);

    const actions = screen.getByTestId('model-manager-provider-summary-actions');
    const healthButton = screen.getByRole('button', { name: '健康检查' });

    expect(actions.className).toContain('model-manager-provider-summary-actions');
    expect(actions.className).toContain('shrink-0');
    expect(actions.className).toContain('justify-end');
    expect(actions.className).not.toContain('settings-responsive-actions');
    expect(healthButton.className).toContain('shrink-0');
    expect(healthButton.className).toContain('whitespace-nowrap');
  });

  it('模型超过 5 条时，列表区域保留最小高度并使用内部滚动容器', () => {
    const models = [
      { id: 'gpt-5.4', name: 'GPT-5.4', group: 'Chat' },
      { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini', group: 'Chat' },
      { id: 'gpt-5.2', name: 'GPT-5.2', group: 'Chat' },
      { id: 'gpt-5.1', name: 'GPT-5.1', group: 'Chat', isDefault: true },
      { id: 'gpt-4.1', name: 'GPT-4.1', group: 'Chat' },
      { id: 'gpt-3.5', name: 'GPT-3.5', group: 'Chat' },
    ];

    render(<ModelManagerProviderDetail controller={createController(models)} />);

    const body = screen.getByTestId('model-manager-provider-detail-body');
    const safeArea = screen.getByTestId('model-manager-provider-detail-bottom-safe-area');
    const tailSpacer = screen.getByTestId('model-manager-provider-detail-tail-spacer');
    const list = screen.getByTestId('model-manager-model-list');
    const scroll = screen.getByTestId('model-manager-model-list-scroll');
    const content = screen.getByTestId('model-manager-model-list-content');
    const headerActions = screen.getByTestId('model-manager-model-actions');
    const firstModelRow = screen.getByTestId('model-manager-model-row-gpt-3.5');

    const modelSection = screen.getByTestId('model-manager-model-section');

    expect(body.className).toContain('model-manager-provider-detail-body');
    expect(body.className).toContain('flex-1');
    expect(body.className).toContain('overflow-y-auto');
    expect(body.className).toContain('overflow-x-hidden');
    expect(body.className).toContain('overscroll-contain');
    expect(body.className).toContain('[scrollbar-gutter:stable]');
    expect(safeArea.className).toContain('model-manager-provider-detail-bottom-safe-area');
    expect(safeArea.className).toContain('pointer-events-none');
    expect(safeArea.className).toContain('absolute');
    expect(tailSpacer.className).toContain('model-manager-provider-detail-tail-spacer');
    expect(body.className).not.toContain('overflow-hidden');
    expect(body.firstElementChild?.className).toContain('model-manager-provider-detail-grid');
    expect(body.firstElementChild?.className).toContain('min-h-full');
    expect(body.firstElementChild?.className).not.toContain('pb-4');
    expect(body.firstElementChild?.className).not.toContain('min-[960px]:pb-6');
    expect(String(body.firstElementChild?.className ?? '').split(/\s+/)).not.toContain('h-full');
    expect(modelSection.className).toContain('model-manager-model-section');
    expect(modelSection.className).toContain('min-w-0');
    expect(modelSection.className).not.toContain('min-h-0');
    expect(list.className).toContain('min-h-0');
    expect(list.className).not.toContain('flex-1');
    expect(list.className).not.toContain('100dvh');
    expect(list.className).not.toContain('min-h-[18rem]');
    expect(scroll.className).toContain('overflow-y-auto');
    expect(content.className).toContain('divide-y');
    expect(headerActions).toContainElement(screen.getByRole('button', { name: '管理' }));
    expect(headerActions).toContainElement(screen.getByRole('button', { name: '添加' }));
    expect(screen.getAllByRole('button', { name: '管理' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '添加' })).toHaveLength(1);
    expect(firstModelRow.className).toContain('model-manager-model-row');
    expect(firstModelRow.className).not.toContain('grid-cols-[auto_minmax(0,1fr)_auto]');
    expect(firstModelRow.querySelector('.model-manager-model-row-grid')?.className).toContain('model-manager-model-row-grid');
    expect(firstModelRow.querySelector('.model-manager-model-row-title')?.className).toContain('min-w-0');
    expect(firstModelRow.querySelector('.model-manager-model-row-badges')?.className).toContain('min-w-0');
    const gridChildren = Array.from(firstModelRow.querySelector('.model-manager-model-row-grid')?.children ?? []);
    expect(gridChildren[0]?.className).toContain('model-manager-model-row-icon');
    expect(gridChildren[1]?.className).toContain('model-manager-model-row-title');
    expect(gridChildren[2]?.className).toContain('model-manager-model-row-badges');
    expect(gridChildren[3]?.className).toContain('model-manager-model-row-actions');
    const actionButtons = firstModelRow.querySelectorAll('.model-manager-model-row-actions button');
    expect(actionButtons).toHaveLength(2);
    for (const button of Array.from(actionButtons)) {
      expect(button.className).toContain('h-7');
      expect(button.className).toContain('w-7');
    }
    const orderedNames = [
      screen.getByText('GPT-3.5'),
      screen.getByText('GPT-4.1'),
      screen.getByText('GPT-5.1'),
      screen.getByText('GPT-5.2'),
      screen.getByText('GPT-5.4'),
      screen.getByText('GPT-5.4 mini'),
    ];
    for (let index = 0; index < orderedNames.length - 1; index += 1) {
      expect(
        orderedNames[index]?.compareDocumentPosition(orderedNames[index + 1] as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it('模型为空时，空态也保留在同一块最小高度区域内', () => {
    render(<ModelManagerProviderDetail controller={createController([])} />);

    const body = screen.getByTestId('model-manager-provider-detail-body');
    const safeArea = screen.getByTestId('model-manager-provider-detail-bottom-safe-area');
    const tailSpacer = screen.getByTestId('model-manager-provider-detail-tail-spacer');
    const list = screen.getByTestId('model-manager-model-list');
    const scroll = screen.getByTestId('model-manager-model-list-scroll');
    const content = screen.getByTestId('model-manager-model-list-content');

    expect(body.className).toContain('model-manager-provider-detail-body');
    expect(body.className).toContain('overflow-y-auto');
    expect(body.className).toContain('overflow-x-hidden');
    expect(body.className).toContain('overscroll-contain');
    expect(safeArea.className).toContain('model-manager-provider-detail-bottom-safe-area');
    expect(safeArea.className).toContain('pointer-events-none');
    expect(tailSpacer.className).toContain('model-manager-provider-detail-tail-spacer');
    expect(body.className).not.toContain('overflow-hidden');
    expect(body.firstElementChild?.className).toContain('model-manager-provider-detail-grid');
    expect(body.firstElementChild?.className).toContain('min-h-full');
    expect(body.firstElementChild?.className).not.toContain('pb-4');
    expect(body.firstElementChild?.className).not.toContain('min-[960px]:pb-6');
    expect(String(body.firstElementChild?.className ?? '').split(/\s+/)).not.toContain('h-full');
    expect(list.className).toContain('min-h-0');
    expect(list.className).not.toContain('flex-1');
    expect(list.className).not.toContain('100dvh');
    expect(list.className).not.toContain('min-h-[18rem]');
    expect(scroll.className).toContain('overflow-y-auto');
    expect(content.className).toContain('divide-y');
    expect(screen.getByText('暂无模型')).toBeInTheDocument();
  });

  it('DeepSeek V3 基础款与子版本在已添加模型列表中不会重复或丢失', () => {
    const models = [
      { id: 'deepseek-ai/DeepSeek-V3.1-Terminus', name: 'DeepSeek V3.1 Terminus', group: 'deepseek-ai' },
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', group: 'deepseek-ai' },
      { id: 'deepseek-ai/DeepSeek-V3.2', name: 'DeepSeek V3.2', group: 'deepseek-ai' },
    ];

    render(<ModelManagerProviderDetail controller={createController(models)} />);

    const deepSeekV3 = screen.getByText('DeepSeek V3');
    const deepSeekV31 = screen.getByText('DeepSeek V3.1 Terminus');
    const deepSeekV32 = screen.getByText('DeepSeek V3.2');

    expect(screen.getAllByText('DeepSeek V3')).toHaveLength(1);
    expect(screen.getAllByText('DeepSeek V3.1 Terminus')).toHaveLength(1);
    expect(screen.getAllByText('DeepSeek V3.2')).toHaveLength(1);
    expect(deepSeekV3.compareDocumentPosition(deepSeekV31) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(deepSeekV31.compareDocumentPosition(deepSeekV32) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Anthropic provider 的 API 预览会显示 native /messages 端点，而不是 /chat/completions', () => {
    const controller = createController([]);
    controller.providersState.selected = {
      ...controller.providersState.selected,
      id: 'anthropic',
      name: 'Anthropic',
      type: 'anthropic',
      apiHost: 'https://sub2api.h5doc.xyz',
    };

    render(<ModelManagerProviderDetail controller={controller} />);

    expect(screen.getByText('预览 URL：https://sub2api.h5doc.xyz/v1/messages')).toBeInTheDocument();
    expect(screen.queryByText('预览 URL：https://sub2api.h5doc.xyz/v1/chat/completions')).not.toBeInTheDocument();
  });

  it('默认 openai provider 的 API 预览会显示 /chat/completions', () => {
    render(<ModelManagerProviderDetail controller={createController([])} />);

    expect(screen.getByText('预览 URL：https://api.openai.com/v1/chat/completions')).toBeInTheDocument();
    expect(screen.queryByText('预览 URL：https://api.openai.com/v1/responses')).not.toBeInTheDocument();
  });

  it('Azure OpenAI 详情页显示 API 形态和 API Version，并按 legacy deployment 预览 api-version', () => {
    const updateProvider = vi.fn();
    render(<ModelManagerProviderDetail controller={createController([], {
      id: 'azure-openai',
      name: 'Azure OpenAI',
      type: 'azure-openai',
      apiKey: 'azure-key',
      apiHost: 'https://example-resource.openai.azure.com/openai/deployments/demo',
      apiVersion: '2024-10-21',
    }, updateProvider)} />);

    expect(screen.getAllByText('Azure OpenAI').length).toBeGreaterThan(0);
    expect(screen.getByRole('combobox', { name: 'API 形态' })).toBeInTheDocument();
    expect(screen.getByLabelText('API Version')).toHaveValue('2024-10-21');
    expectConfigSectionHasNoOuterFrame('model-manager-connection-config-section');
    expect(screen.getByText('预览 URL：https://example-resource.openai.azure.com/openai/deployments/demo/chat/completions?api-version=2024-10-21')).toBeInTheDocument();
    expect(screen.queryByText('预览 URL：https://example-resource.openai.azure.com/openai/deployments/demo/v1/chat/completions')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('API Version'), { target: { value: '2025-01-01' } });

    expect(updateProvider).toHaveBeenCalledWith('azure-openai', { apiVersion: '2025-01-01' });
  });

  it('Azure OpenAI 切到 v1 endpoint 会隐藏 API Version，并清空 apiVersion 与写入 skip flag', async () => {
    const updateProvider = vi.fn();
    const controller = createController([], {
      id: 'azure-openai',
      name: 'Azure OpenAI',
      type: 'azure-openai',
      apiHost: 'https://example-resource.openai.azure.com/openai/deployments/demo',
      apiVersion: '2024-10-21',
      apiOptions: { isSupportDeveloperRole: true },
    }, updateProvider);
    const { rerender } = render(<ModelManagerProviderDetail controller={controller} />);

    fireEvent.click(screen.getByRole('combobox', { name: 'API 形态' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Azure OpenAI v1 endpoint' }));

    expect(updateProvider).toHaveBeenCalledWith('azure-openai', {
      apiVersion: undefined,
      apiOptions: {
        isSupportDeveloperRole: true,
        isNotSupportAPIVersion: true,
      },
    });

    controller.providersState.selected = {
      ...controller.providersState.selected,
      apiHost: 'https://example-resource.openai.azure.com/openai/v1',
      apiVersion: undefined,
      apiOptions: {
        isSupportDeveloperRole: true,
        isNotSupportAPIVersion: true,
      },
    };
    rerender(<ModelManagerProviderDetail controller={controller} />);

    expect(screen.queryByLabelText('API Version')).not.toBeInTheDocument();
    expect(screen.getByText('预览 URL：https://example-resource.openai.azure.com/openai/v1/chat/completions')).toBeInTheDocument();
    expect(screen.queryByText(/api-version=/)).not.toBeInTheDocument();

    updateProvider.mockClear();
    fireEvent.click(screen.getByRole('combobox', { name: 'API 形态' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Deployment endpoint + api-version' }));

    expect(updateProvider).toHaveBeenCalledWith('azure-openai', {
      apiOptions: { isSupportDeveloperRole: true },
    });
  });

  it('Vertex AI 在详情页隐藏通用 API Key 输入，避免和专用 express key 双真源', () => {
    render(<ModelManagerProviderDetail controller={createController([], {
      id: 'vertexai',
      name: 'Vertex AI',
      type: 'vertexai',
      apiHost: 'https://{region}-aiplatform.googleapis.com',
      vertex: { authType: 'apiKey', apiKey: 'vertex-key' },
    })} />);

    expect(screen.queryByText('API Key')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Vertex API Key')).toBeInTheDocument();
    expect(screen.getByText('API 地址（可选）')).toBeInTheDocument();
  });

  it('AWS Bedrock 详情页直接显示 IAM 专用配置，并把 API 地址作为可选 override', () => {
    const updateProvider = vi.fn();
    render(<ModelManagerProviderDetail controller={createController([], {
      id: 'aws-bedrock',
      name: 'AWS Bedrock',
      type: 'aws-bedrock',
      apiHost: 'https://bedrock-runtime.{region}.amazonaws.com',
      bedrock: { authType: 'iam', region: 'us-east-1' },
    }, updateProvider)} />);

    expect(screen.getAllByText('AWS Bedrock').length).toBeGreaterThan(0);
    expect(screen.getByRole('combobox', { name: '鉴权方式' })).toBeInTheDocument();
    expect(screen.getByLabelText('区域 Region')).toHaveValue('us-east-1');
    expect(screen.getByLabelText('访问密钥 Access Key ID')).toBeInTheDocument();
    expect(screen.getByLabelText('私有密钥 Secret Access Key')).toBeInTheDocument();
    expect(screen.getByLabelText('临时会话令牌 Session Token（可选）')).toBeInTheDocument();
    expectConfigSectionHasNoOuterFrame('model-manager-cloud-config-section');
    expect(screen.getByText('API 地址（可选）')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('留空使用官方默认地址')).toHaveValue('');
    expect(screen.getByText('预览 Base：https://bedrock-runtime.us-east-1.amazonaws.com')).toBeInTheDocument();
    expect(screen.queryByText('API Key')).not.toBeInTheDocument();

    const secret = screen.getByLabelText('私有密钥 Secret Access Key');
    fireEvent.change(secret, { target: { value: 'new-secret' } });
    fireEvent.blur(secret);

    expect(updateProvider).toHaveBeenCalledWith('aws-bedrock', {
      bedrock: {
        authType: 'iam',
        region: 'us-east-1',
        secretAccessKey: 'new-secret',
      },
    });
  });

  it('AWS Bedrock 详情页切到 API Key 时只提交 API Key 模式配置', async () => {
    const updateProvider = vi.fn();
    render(<ModelManagerProviderDetail controller={createController([], {
      id: 'aws-bedrock',
      name: 'AWS Bedrock',
      type: 'aws-bedrock',
      apiHost: 'https://bedrock-runtime.{region}.amazonaws.com',
      bedrock: {
        authType: 'iam',
        region: 'us-east-1',
        accessKeyId: 'ak',
        secretAccessKey: 'sk',
      },
    }, updateProvider)} />);

    fireEvent.click(screen.getByRole('combobox', { name: '鉴权方式' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Bedrock API Key' }));

    expect(updateProvider).toHaveBeenCalledWith('aws-bedrock', {
      bedrock: { authType: 'apiKey', region: 'us-east-1' },
    });
  });

  it('AWS Bedrock API Key 模式会清理 Bearer，并拒绝 URL-like 输入', () => {
    const updateProvider = vi.fn();
    render(<ModelManagerProviderDetail controller={createController([], {
      id: 'aws-bedrock',
      name: 'AWS Bedrock',
      type: 'aws-bedrock',
      apiHost: 'https://bedrock-runtime.{region}.amazonaws.com',
      bedrock: { authType: 'apiKey', region: 'us-east-1', apiKey: '' },
    }, updateProvider)} />);

    const apiKey = screen.getByLabelText('Bedrock API Key');
    fireEvent.change(apiKey, { target: { value: 'Bearer bedrock-key' } });
    fireEvent.blur(apiKey);

    expect(updateProvider).toHaveBeenCalledWith('aws-bedrock', {
      bedrock: { authType: 'apiKey', region: 'us-east-1', apiKey: 'bedrock-key' },
    });

    updateProvider.mockClear();
    fireEvent.change(apiKey, { target: { value: 'https://bedrock-runtime.us-east-1.amazonaws.com' } });
    fireEvent.blur(apiKey);

    expect(toastError).toHaveBeenCalledWith('这里需要填写 API Key，不是 API 地址。');
    expect(updateProvider).not.toHaveBeenCalled();
  });

  it('Vertex AI 详情页显示 Service Account 专用配置', () => {
    render(<ModelManagerProviderDetail controller={createController([], {
      id: 'vertexai',
      name: 'Vertex AI',
      type: 'vertexai',
      apiHost: 'https://{region}-aiplatform.googleapis.com',
      vertex: {
        authType: 'serviceAccount',
        projectId: 'demo-project',
        location: 'us-central1',
        serviceAccount: {
          clientEmail: 'svc@example.iam.gserviceaccount.com',
          privateKey: 'private-key',
        },
      },
    })} />);

    expect(screen.getByRole('combobox', { name: '鉴权方式' })).toBeInTheDocument();
    expect(screen.getByLabelText('项目 ID projectId')).toHaveValue('demo-project');
    expect(screen.getByLabelText('区域 location')).toHaveValue('us-central1');
    expect(screen.getByLabelText('Client Email')).toHaveValue('svc@example.iam.gserviceaccount.com');
    expect(screen.getByLabelText('Private Key')).toHaveValue('private-key');
    expectConfigSectionHasNoOuterFrame('model-manager-cloud-config-section');
    expect(screen.getByText('API 地址（可选）')).toBeInTheDocument();
    expect(screen.getByText('预览 URL：https://us-central1-aiplatform.googleapis.com/v1beta/models')).toBeInTheDocument();
    expect(screen.queryByText('API Key')).not.toBeInTheDocument();
  });

  it('Vertex AI express API Key 模式不显示 project/location，并使用全局 endpoint 预览', () => {
    const updateProvider = vi.fn();
    render(<ModelManagerProviderDetail controller={createController([], {
      id: 'vertexai',
      name: 'Vertex AI',
      type: 'vertexai',
      apiHost: 'https://{region}-aiplatform.googleapis.com',
      vertex: { authType: 'apiKey', apiKey: '' },
    }, updateProvider)} />);

    expect(screen.getByLabelText('Vertex API Key')).toBeInTheDocument();
    expect(screen.queryByText('项目 ID projectId')).not.toBeInTheDocument();
    expect(screen.queryByText('区域 location')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('留空使用官方默认地址')).toHaveValue('');
    expect(screen.getByText('预览 URL：https://aiplatform.googleapis.com/v1beta/models')).toBeInTheDocument();

    const apiKey = screen.getByLabelText('Vertex API Key');
    fireEvent.change(apiKey, { target: { value: 'Bearer vertex-key' } });
    fireEvent.blur(apiKey);

    expect(updateProvider).toHaveBeenCalledWith('vertexai', {
      vertex: { authType: 'apiKey', apiKey: 'vertex-key' },
    });
  });

  it('Vertex AI express API Key 拒绝 URL-like 输入', () => {
    const updateProvider = vi.fn();
    render(<ModelManagerProviderDetail controller={createController([], {
      id: 'vertexai',
      name: 'Vertex AI',
      type: 'vertexai',
      apiHost: 'https://{region}-aiplatform.googleapis.com',
      vertex: { authType: 'apiKey', apiKey: '' },
    }, updateProvider)} />);

    const apiKey = screen.getByLabelText('Vertex API Key');
    fireEvent.change(apiKey, { target: { value: 'https://aiplatform.googleapis.com' } });
    fireEvent.blur(apiKey);

    expect(toastError).toHaveBeenCalledWith('这里需要填写 API Key，不是 API 地址。');
    expect(updateProvider).not.toHaveBeenCalled();
  });

  it('Vertex Anthropic 详情页固定 Service Account，不展示 API Key 模式', () => {
    render(<ModelManagerProviderDetail controller={createController([], {
      id: 'vertex-anthropic',
      name: 'Vertex AI（Anthropic）',
      type: 'vertex-anthropic',
      apiHost: 'https://{region}-aiplatform.googleapis.com',
      vertex: {
        authType: 'serviceAccount',
        projectId: 'demo-project',
        location: 'us-central1',
        serviceAccount: {
          clientEmail: 'svc@example.iam.gserviceaccount.com',
          privateKey: 'private-key',
        },
      },
    })} />);

    expect(screen.getByRole('button', { name: /Vertex AI Anthropic 模式说明/ })).toBeInTheDocument();
    expect(screen.getByLabelText('项目 ID projectId')).toHaveValue('demo-project');
    expect(screen.getByLabelText('Client Email')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '鉴权方式' })).not.toBeInTheDocument();
    expect(screen.queryByText('Vertex API Key')).not.toBeInTheDocument();
  });

  it('显式 openai-response provider 的 API 预览会继续显示 /responses', () => {
    const controller = createController([]);
    controller.providersState.selected = {
      ...controller.providersState.selected,
      type: 'openai-response',
    };

    render(<ModelManagerProviderDetail controller={controller} />);

    expect(screen.getByText('预览 URL：https://api.openai.com/v1/responses')).toBeInTheDocument();
    expect(screen.queryByText('预览 URL：https://api.openai.com/v1/chat/completions')).not.toBeInTheDocument();
  });

  it('new-api provider 在 transport 未唯一确定时只显示 base 预览', () => {
    const updateProvider = vi.fn();
    const controller = createController([]);
    controller.providersState.selected = {
      ...controller.providersState.selected,
      id: 'new-api',
      name: 'NewAPI',
      type: 'new-api',
      apiHost: 'https://proxy.example.com',
      anthropicApiHost: 'https://anthropic.example.com/v1',
    };
    controller.providersState.updateProvider = updateProvider;

    render(<ModelManagerProviderDetail controller={controller} />);

    expect(screen.getByLabelText('Anthropic Messages 地址（可选）')).toHaveValue('https://anthropic.example.com/v1');
    expectConfigSectionHasNoOuterFrame('model-manager-connection-config-section');
    expect(screen.getByText('预览 Base：https://proxy.example.com/v1（具体聊天端点由模型协议决定）')).toBeInTheDocument();
    expect(screen.queryByText('预览 URL：https://proxy.example.com/v1/chat/completions')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Anthropic Messages 地址（可选）'), {
      target: { value: 'https://new-anthropic.example.com/v1' },
    });

    expect(updateProvider).toHaveBeenCalledWith('new-api', {
      anthropicApiHost: 'https://new-anthropic.example.com/v1',
    });
  });
});
