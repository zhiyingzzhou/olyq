/**
 * 说明：`ModelManagerProviderDetail.tooltip.spec` 组件模块。
 *
 * 职责：
 * - 覆盖 model manager 详情区里的真实 icon tooltip 场景；
 * - 防止帮助 icon / 搜索 icon 再次退回原生 `title`；
 * - 守住业务层 icon 统一走 shared tooltip contract。
 *
 * 边界：
 * - 这里只验证 provider detail 里的 icon tooltip；
 * - 不扩散到 catalog、dialog 提交流程或 provider 持久化逻辑。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ModelManagerProviderDetail } from './ModelManagerProviderDetail';
import type { ModelManagerPanelController } from './useModelManagerPanelController';

vi.mock('@/components/ui/ProviderIcon', () => ({
  ProviderIcon: ({ providerId }: { providerId: string }) => <span data-testid={`provider-icon-${providerId}`}>{providerId}</span>,
}));

/**
 * 为 tooltip 场景提供最小 controller。
 *
 * @returns 足够渲染 detail 面板的最小 controller。
 */
function createController(): ModelManagerPanelController {
  return {
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
      inlineFilteredModels: [],
      inlineGroups: {},
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
      apiKeysForUi: ['sk-test-1'],
      getProviderDisplayName: (provider: { name: string }) => provider.name,
      hasDirtyChange: false,
      retrySaveProviders: vi.fn(),
      saveError: '',
      selected: {
        id: 'openai',
        name: 'OpenAI',
        type: 'openai',
        apiKey: '',
        apiHost: 'https://api.openai.com/v1',
        enabled: true,
        models: [],
      },
      selectedModelViews: new Map(),
      updateProvider: vi.fn(),
    },
    providerLoadError: '',
    providerLoadPending: false,
    t: (key: string) => {
      const translations: Record<string, string> = {
        'modelManagerPanel.apiKey.title': 'API Key',
        'modelManagerPanel.apiKey.placeholder': '输入 API Key',
        'modelManagerPanel.apiKey.hintMain': '主 Key 提示',
        'modelManagerPanel.apiKey.settings': 'Key 设置',
        'modelManagerPanel.apiBase.title': 'API Base',
        'modelManagerPanel.apiBase.emptyHint': '未配置 API Base',
        'modelManagerPanel.apiBase.preview': '预览 URL：https://api.openai.com/v1/chat/completions',
        'modelManagerPanel.apiBase.previewBase': '预览 Base：https://api.openai.com/v1',
        'modelManagerPanel.apiBase.previewTransportDependent': '预览 Base：https://api.openai.com/v1（具体聊天端点由模型协议决定）',
        'modelManagerPanel.actions.customHeaders': '自定义请求头',
        'modelManagerPanel.models.title': '已添加模型',
        'modelManagerPanel.models.empty': '暂无模型',
        'modelManagerPanel.actions.manage': '管理',
        'modelManagerPanel.actions.add': '添加',
        'modelManagerPanel.manageDialog.searchPlaceholder': '搜索模型',
        'common.search': '搜索',
      };
      return translations[key] ?? key;
    },
    toggleGroup: vi.fn(),
  } as unknown as ModelManagerPanelController;
}

describe('ModelManagerProviderDetail tooltip contract', () => {
  it('帮助 icon hover 后会显示共享 tooltip 文案', async () => {
    render(<ModelManagerProviderDetail controller={createController()} />);

    const helpIcon = screen.getByRole('button', { name: '未配置 API Base' });
    expect(helpIcon).not.toHaveAttribute('title');

    fireEvent.focus(helpIcon);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('未配置 API Base');
  });

  it('搜索 icon 会通过 TooltipAction 暴露统一 tooltip 与 accessible name', async () => {
    render(<ModelManagerProviderDetail controller={createController()} />);

    const searchButton = screen.getByRole('button', { name: '搜索' });
    expect(searchButton).not.toHaveAttribute('title');

    fireEvent.focus(searchButton);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('搜索');
  });
});
