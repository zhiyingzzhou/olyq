/**
 * 说明：`ModelManagerAddProviderDialog.spec` 组件模块。
 *
 * 职责：
 * - 承载 `ModelManagerAddProviderDialog.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ModelManagerAddProviderDialog } from './ModelManagerAddProviderDialog';
import type { AddProviderFormState, ModelManagerAddProviderDialogProps } from './model-manager-types';

const visibleVirtualRowCountState = { current: null as number | null };
const originalScrollIntoView = Element.prototype.scrollIntoView;

const translationMap: Record<string, string> = {
  'modelManagerPanel.addProviderDialog.title': '添加模型平台',
  'modelManagerPanel.addProviderDialog.editTitle': '编辑模型平台',
  'modelManagerPanel.addProviderDialog.description': '配置模型平台',
  'modelManagerPanel.addProviderDialog.fields.name': '平台名称',
  'modelManagerPanel.addProviderDialog.fields.namePlaceholder': '例如 My Provider',
  'modelManagerPanel.addProviderDialog.fields.type': '平台类型',
  'modelManagerPanel.addProviderDialog.fields.apiBase': 'API 地址',
  'modelManagerPanel.addProviderDialog.fields.anthropicApiHost': 'Anthropic 原生地址（可选）',
  'modelManagerPanel.addProviderDialog.fields.anthropicApiHostHint': '仅当该平台下某些模型走 Anthropic Messages 协议时使用；留空则复用 API 地址。',
  'modelManagerPanel.addProviderDialog.fields.anthropicApiHostPlaceholder': '例如 https://api.example.com/anthropic/v1',
  'modelManagerPanel.addProviderDialog.fields.apiVersion': 'API 版本',
  'modelManagerPanel.addProviderDialog.avatar.upload': '上传图片',
  'modelManagerPanel.addProviderDialog.avatar.builtin': '内置图标',
  'modelManagerPanel.addProviderDialog.avatar.reset': '重置头像',
  'modelManagerPanel.addProviderDialog.avatar.builtinTitle': '选择内置图标',
  'modelManagerPanel.addProviderDialog.avatar.searchPlaceholder': '搜索图标',
  'modelManagerPanel.addProviderDialog.avatar.loading': '正在加载图标',
  'modelManagerPanel.addProviderDialog.avatar.noResults': '未找到匹配的图标',
  'modelManagerPanel.advanced.title': '高级设置',
  'modelManagerPanel.actions.add': '添加',
  'modelManagerPanel.notes.title': '备注',
  'modelManagerPanel.notes.placeholder': '仅本地存储，可记录备注',
  'modelManagerPanel.providerOptions.title': 'Provider 级参数',
  'modelManagerPanel.providerOptions.hint': '仅对支持的平台生效',
  'modelManagerPanel.providerOptions.serviceTier': 'Service Tier',
  'modelManagerPanel.providerOptions.serviceTierHint': '仅支持时注入',
  'modelManagerPanel.providerOptions.serviceTierPlaceholder': '默认（不传）',
  'modelManagerPanel.providerOptions.verbosity': 'Verbosity',
  'modelManagerPanel.providerOptions.verbosityHint': '仅 OpenAI Responses 使用',
  'modelManagerPanel.providerOptions.verbosityPlaceholder': '默认（不传）',
  'modelManagerPanel.providerOptions.unset': '默认（不传）',
  'modelManagerPanel.providerOptions.off': '关闭（显式 off）',
  'modelManagerPanel.apiOptions.title': 'API 兼容性',
  'modelManagerPanel.apiOptions.reset': '重置',
  'modelManagerPanel.apiOptions.isNotSupportImageInput': '不支持图片输入',
  'modelManagerPanel.apiOptions.isNotSupportImageInputHint': '关闭图片输入',
  'modelManagerPanel.apiOptions.isNotSupportFileInput': '不支持文件输入',
  'modelManagerPanel.apiOptions.isNotSupportFileInputHint': '关闭文件输入',
  'modelManagerPanel.apiOptions.isNotSupportStreamOptions': '不支持 stream_options',
  'modelManagerPanel.apiOptions.isNotSupportStreamOptionsHint': '关闭 stream usage',
  'modelManagerPanel.apiOptions.isSupportDeveloperRole': '支持 developer role',
  'modelManagerPanel.apiOptions.isSupportDeveloperRoleHint': '控制 developer role',
  'modelManagerPanel.apiOptions.isSupportServiceTier': '支持 service tier',
  'modelManagerPanel.apiOptions.isSupportServiceTierHint': '控制 service tier',
  'modelManagerPanel.apiOptions.isNotSupportEnableThinking': '不支持 enable_thinking',
  'modelManagerPanel.apiOptions.isNotSupportEnableThinkingHint': '控制 thinking',
  'modelManagerPanel.apiOptions.isNotSupportVerbosity': '不支持 verbosity',
  'modelManagerPanel.apiOptions.isNotSupportVerbosityHint': '控制 verbosity',
  'modelManagerPanel.apiOptions.isNotSupportAPIVersion': '不支持 api-version',
  'modelManagerPanel.apiOptions.isNotSupportAPIVersionHint': '控制 api-version',
  'modelManagerPanel.apiKeyAuth.title': 'API Key 鉴权',
  'modelManagerPanel.apiKeyAuth.hint': '配置 API Key 使用的鉴权 Header。普通自定义请求头不会覆盖鉴权。',
  'modelManagerPanel.apiKeyAuth.preset': '鉴权预设',
  'modelManagerPanel.apiKeyAuth.presets.default': '平台默认',
  'modelManagerPanel.apiKeyAuth.presets.authorizationBearer': 'Authorization + Bearer',
  'modelManagerPanel.apiKeyAuth.presets.xApiKey': 'x-api-key（Anthropic）',
  'modelManagerPanel.apiKeyAuth.presets.xGoogApiKey': 'x-goog-api-key（Gemini）',
  'modelManagerPanel.apiKeyAuth.presets.apiKey': 'api-key（Azure OpenAI）',
  'modelManagerPanel.apiKeyAuth.presets.xiApiKey': 'xi-api-key（ElevenLabs）',
  'modelManagerPanel.apiKeyAuth.presets.custom': '自定义',
  'modelManagerPanel.apiKeyAuth.headerName': 'Header 名称',
  'modelManagerPanel.apiKeyAuth.valuePrefix': 'Value 前缀',
  'modelManagerPanel.apiKeyAuth.valuePrefixHint': '留空表示直接发送原始 API Key。',
  'modelManagerPanel.apiKeyAuth.invalidHeader': 'Header 名称不合法，且不能使用 Content-Type。',
  'modelManagerPanel.bedrock.title': 'AWS Bedrock',
  'modelManagerPanel.bedrock.sectionHint': 'Bedrock 使用 IAM 或官方 Bedrock API Key。',
  'modelManagerPanel.bedrock.authType': '鉴权方式',
  'modelManagerPanel.bedrock.authTypeHint': 'IAM 走 AK/SK；API Key 走官方 Bearer。',
  'modelManagerPanel.bedrock.authTypeOptions.iam': 'IAM（Access Key / Secret Key）',
  'modelManagerPanel.bedrock.authTypeOptions.apiKey': 'Bedrock API Key',
  'modelManagerPanel.bedrock.region': '区域 Region',
  'modelManagerPanel.bedrock.regionHint': '例如 us-east-1',
  'modelManagerPanel.bedrock.accessKeyId': '访问密钥 Access Key ID',
  'modelManagerPanel.bedrock.accessKeyIdHint': 'IAM 模式必填',
  'modelManagerPanel.bedrock.secretAccessKey': '私有密钥 Secret Access Key',
  'modelManagerPanel.bedrock.secretAccessKeyHint': 'IAM 模式必填',
  'modelManagerPanel.bedrock.sessionToken': '临时会话令牌 Session Token（可选）',
  'modelManagerPanel.bedrock.sessionTokenHint': '临时凭证可填',
  'modelManagerPanel.bedrock.apiKey': 'Bedrock API Key',
  'modelManagerPanel.bedrock.apiKeyHint': '官方 Bedrock API Key',
  'modelManagerPanel.bedrock.hint': 'Bedrock 使用 IAM 或官方 Bedrock API Key 鉴权。',
  'modelManagerPanel.vertex.title': 'Vertex AI',
  'modelManagerPanel.vertex.sectionHint': 'Vertex AI 普通模式说明',
  'modelManagerPanel.vertex.sectionHintAnthropic': 'Vertex AI Anthropic 模式说明',
  'modelManagerPanel.vertex.authType': '鉴权方式',
  'modelManagerPanel.vertex.authTypeHint': 'Service Account 或 API Key',
  'modelManagerPanel.vertex.authTypeOptions.serviceAccount': 'Service Account',
  'modelManagerPanel.vertex.authTypeOptions.apiKey': 'API Key（express mode）',
  'modelManagerPanel.vertex.projectId': '项目 ID projectId',
  'modelManagerPanel.vertex.projectIdHint': 'GCP 项目标识',
  'modelManagerPanel.vertex.location': '区域 location',
  'modelManagerPanel.vertex.locationHint': 'Vertex 区域',
  'modelManagerPanel.vertex.clientEmail': 'Client Email',
  'modelManagerPanel.vertex.clientEmailHint': '服务账号邮箱',
  'modelManagerPanel.vertex.privateKey': 'Private Key',
  'modelManagerPanel.vertex.privateKeyHint': '服务账号私钥',
  'modelManagerPanel.vertex.privateKeyPlaceholder': '粘贴 private key',
  'modelManagerPanel.vertex.privateKeyId': 'Private Key ID（可选）',
  'modelManagerPanel.vertex.privateKeyIdHint': '可选私钥 ID',
  'modelManagerPanel.vertex.apiKey': 'Vertex API Key',
  'modelManagerPanel.vertex.apiKeyHint': 'express mode key',
  'modelManagerPanel.vertex.hint': 'Vertex AI 可使用 Service Account 或 API Key（express mode）。',
  'modelManagerPanel.vertex.hintAnthropic': 'Vertex Anthropic 固定使用 Service Account。',
  'common.cancel': '取消',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => translationMap[key] ?? key,
  }),
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    estimateSize,
    getItemKey,
  }: {
    count: number;
    estimateSize: () => number;
    getItemKey?: (index: number) => string | number;
  }) => {
    const visibleRowCount = visibleVirtualRowCountState.current == null
      ? count
      : Math.min(count, Math.max(0, visibleVirtualRowCountState.current));
    return {
      measure: vi.fn(),
      measureElement: vi.fn(),
      getTotalSize: () => count * estimateSize(),
      getVirtualItems: () => (
        Array.from({ length: visibleRowCount }, (_, index) => ({
          index,
          key: getItemKey?.(index) ?? `row-${index}`,
          start: index * estimateSize(),
        }))
      ),
    };
  },
}));

afterEach(() => {
  visibleVirtualRowCountState.current = null;
});

/**
 * 测试辅助函数：`createForm`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createForm(overrides: Partial<AddProviderFormState> = {}): AddProviderFormState {
  return {
    name: 'Test Provider',
    type: 'openai',
    authType: undefined,
    apiHost: 'https://example.com/v1',
    anthropicApiHost: '',
    apiVersion: '',
    logo: '',
    apiOptions: undefined,
    apiKeyAuth: undefined,
    serviceTier: undefined,
    verbosity: undefined,
    anthropicCacheControl: undefined,
    bedrock: undefined,
    vertex: undefined,
    rateLimit: '',
    notes: '',
    ...overrides,
  };
}

/**
 * 测试辅助函数：`renderDialog`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function renderDialog(
  form: AddProviderFormState,
  overrides: Partial<ModelManagerAddProviderDialogProps> = {},
) {
  const defaultProps: ModelManagerAddProviderDialogProps = {
    open: true,
    editingProviderId: null,
    addProviderForm: form,
    advancedOpen: true,
    builtinPicker: { open: false, loading: false, search: '' },
    builtinIcons: [],
    onOpenChange: () => undefined,
    onAdvancedToggle: () => undefined,
    onFormPatch: () => undefined,
    onSave: () => undefined,
    onCancel: () => undefined,
    isSaveDisabled: false,
    onRequestBuiltinIcons: () => undefined,
    onSelectBuiltinIcon: () => undefined,
    onBuiltinSearch: () => undefined,
    onResetLogo: () => undefined,
    avatarInputRef: createRef<HTMLInputElement>(),
    onAvatarUpload: () => undefined,
    onToggleBuiltinPicker: () => undefined,
  };

  return render(
    <ModelManagerAddProviderDialog {...defaultProps} {...overrides} />,
  );
}

describe('ModelManagerAddProviderDialog', () => {
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

  it('aws-bedrock 只渲染 Bedrock 高级字段且不泄漏 i18n key', () => {
    const { baseElement } = renderDialog(
      createForm({
        type: 'aws-bedrock',
        bedrock: {
          authType: 'iam',
          region: 'us-east-1',
        },
      }),
    );

    expect(screen.getAllByText('AWS Bedrock').length).toBeGreaterThan(0);
    expect(screen.getByText('区域 Region')).toBeInTheDocument();
    expect(screen.queryByText('项目 ID projectId')).not.toBeInTheDocument();
    expect(baseElement.textContent).not.toContain('modelManagerPanel.');
  });

  it('vertexai 只渲染 Vertex 字段，并显示普通 Vertex 提示', () => {
    renderDialog(
      createForm({
        type: 'vertexai',
        vertex: {
          authType: 'serviceAccount',
          projectId: 'demo-project',
          location: 'us-central1',
          serviceAccount: {
            clientEmail: 'svc@example.iam.gserviceaccount.com',
            privateKey: 'private-key',
          },
        },
      }),
    );

    expect(screen.getAllByText('Vertex AI').length).toBeGreaterThan(0);
    expect(screen.getByText('鉴权方式')).toBeInTheDocument();
    expect(screen.getByText('Client Email')).toBeInTheDocument();
    expect(screen.getByText('Private Key')).toBeInTheDocument();
    expect(screen.getByText('项目 ID projectId')).toBeInTheDocument();
    expect(screen.getByText('Vertex AI 可使用 Service Account 或 API Key（express mode）。')).toBeInTheDocument();
    expect(screen.queryByText('区域 Region')).not.toBeInTheDocument();
    expect(screen.queryByText('Vertex Anthropic 固定使用 Service Account。')).not.toBeInTheDocument();
  });

  it('vertexai 切到 API Key 模式后只显示 express mode key，不显示 project/location', async () => {
    const onFormPatch = vi.fn();
    renderDialog(
      createForm({
        type: 'vertexai',
        vertex: {
          authType: 'serviceAccount',
          projectId: 'demo-project',
          location: 'us-central1',
          serviceAccount: {
            clientEmail: 'svc@example.iam.gserviceaccount.com',
            privateKey: 'private-key',
          },
        },
      }),
      { onFormPatch },
    );

    fireEvent.click(screen.getByRole('combobox', { name: /鉴权方式/i }));
    fireEvent.click(await screen.findByRole('option', { name: 'API Key（express mode）' }));

    expect(onFormPatch).toHaveBeenCalledWith({ vertex: { authType: 'apiKey', apiKey: '' } });
  });

  it('vertexai 的 API Key 模式回填时隐藏 Service Account 字段', () => {
    renderDialog(
      createForm({
        type: 'vertexai',
        vertex: {
          authType: 'apiKey',
          apiKey: 'vertex-key',
        },
      }),
    );

    expect(screen.getByText('Vertex API Key')).toBeInTheDocument();
    expect(screen.queryByText('项目 ID projectId')).not.toBeInTheDocument();
    expect(screen.queryByText('Client Email')).not.toBeInTheDocument();
  });

  it('vertex-anthropic 固定 Service Account，不展示 API Key 模式', () => {
    renderDialog(
      createForm({
        type: 'vertex-anthropic',
        vertex: {
          authType: 'serviceAccount',
          projectId: 'demo-project',
          location: 'us-central1',
          serviceAccount: {
            clientEmail: 'svc@example.iam.gserviceaccount.com',
            privateKey: 'private-key',
          },
        },
      }),
    );

    expect(screen.getByText('Vertex AI Anthropic 模式说明')).toBeInTheDocument();
    expect(screen.getByText('Client Email')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /鉴权方式/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Vertex API Key')).not.toBeInTheDocument();
  });

  it('openai 不显示 Bedrock / Vertex 平台专属字段', () => {
    renderDialog(createForm({ type: 'openai' }));

    expect(screen.queryByText('区域 Region')).not.toBeInTheDocument();
    expect(screen.queryByText('项目 ID projectId')).not.toBeInTheDocument();
    expect(screen.queryByText('Anthropic 原生地址（可选）')).not.toBeInTheDocument();
    expect(screen.getByText('API 兼容性')).toBeInTheDocument();
    expect(screen.getByText('Provider 级参数')).toBeInTheDocument();
  });

  it('API Key 平台显示并保存自定义 API Key 鉴权配置', async () => {
    const onFormPatch = vi.fn();
    renderDialog(createForm({ type: 'openai' }), { onFormPatch });

    expect(screen.getByText('API Key 鉴权')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: /鉴权预设/i }));
    fireEvent.click(await screen.findByRole('option', { name: 'xi-api-key（ElevenLabs）' }));

    expect(onFormPatch).toHaveBeenCalledWith({ apiKeyAuth: { headerName: 'xi-api-key' } });
  });

  it('选择自定义鉴权预设时保持自定义草稿态，不回跳到 Authorization + Bearer', async () => {
    const user = userEvent.setup();
    const onFormPatch = vi.fn();
    const { rerender } = renderDialog(createForm({ type: 'openai' }), { onFormPatch });

    fireEvent.click(screen.getByRole('combobox', { name: /鉴权预设/i }));
    fireEvent.click(await screen.findByRole('option', { name: '自定义' }));

    expect(onFormPatch).toHaveBeenCalledWith({ apiKeyAuth: { headerName: '' } });

    rerender(
      <ModelManagerAddProviderDialog
        open
        editingProviderId={null}
        addProviderForm={createForm({ type: 'openai', apiKeyAuth: { headerName: '' } })}
        advancedOpen
        builtinPicker={{ open: false, loading: false, search: '' }}
        builtinIcons={[]}
        onOpenChange={() => undefined}
        onAdvancedToggle={() => undefined}
        onFormPatch={onFormPatch}
        onSave={() => undefined}
        onCancel={() => undefined}
        isSaveDisabled={false}
        onRequestBuiltinIcons={() => undefined}
        onSelectBuiltinIcon={() => undefined}
        onBuiltinSearch={() => undefined}
        onResetLogo={() => undefined}
        avatarInputRef={createRef<HTMLInputElement>()}
        onAvatarUpload={() => undefined}
        onToggleBuiltinPicker={() => undefined}
      />,
    );

    expect(screen.getByRole('combobox', { name: /鉴权预设/i })).toHaveTextContent('自定义');
    expect(screen.getByText('Header 名称')).toBeInTheDocument();
    expect(screen.getByText('Value 前缀')).toBeInTheDocument();
    expect(screen.queryByText('留空表示直接发送原始 API Key。')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Authorization')).toHaveValue('');
    expect(screen.getByPlaceholderText('Bearer')).toHaveValue('');

    await user.hover(screen.getByRole('button', { name: '留空表示直接发送原始 API Key。' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('留空表示直接发送原始 API Key。');

    fireEvent.change(screen.getByPlaceholderText('Bearer'), { target: { value: 'Token' } });
    expect(onFormPatch).toHaveBeenLastCalledWith({ apiKeyAuth: { headerName: '', valuePrefix: 'Token' } });
  });

  it('非 API Key 通用鉴权平台隐藏 API Key 鉴权配置', () => {
    renderDialog(createForm({
      type: 'vertexai',
      apiKeyAuth: { headerName: 'xi-api-key' },
      vertex: {
        authType: 'serviceAccount',
        projectId: 'demo-project',
        location: 'us-central1',
        serviceAccount: {
          clientEmail: 'svc@example.iam.gserviceaccount.com',
          privateKey: 'private-key',
        },
      },
    }));

    expect(screen.queryByText('API Key 鉴权')).not.toBeInTheDocument();
  });

  it('new-api 在高级设置折叠时不显示 Anthropic 原生地址字段', () => {
    renderDialog(
      createForm({ type: 'new-api' }),
      { advancedOpen: false },
    );

    expect(screen.queryByText('Anthropic 原生地址（可选）')).not.toBeInTheDocument();
    expect(screen.queryByText('仅当该平台下某些模型走 Anthropic Messages 协议时使用；留空则复用 API 地址。')).not.toBeInTheDocument();
  });

  it('new-api 展开高级设置后显示 Anthropic 原生地址字段和提示', () => {
    renderDialog(createForm({ type: 'new-api' }));

    expect(screen.getByText('Anthropic 原生地址（可选）')).toBeInTheDocument();
    expect(screen.getByText('仅当该平台下某些模型走 Anthropic Messages 协议时使用；留空则复用 API 地址。')).toBeInTheDocument();
  });

  it('点击头像菜单里的内置图标项时，会触发内置图标选择链路', async () => {
    const user = userEvent.setup();
    const handleRequestBuiltinIcons = vi.fn();
    const handleToggleBuiltinPicker = vi.fn();
    const { baseElement } = render(
      <ModelManagerAddProviderDialog
        open
        editingProviderId={null}
        addProviderForm={createForm({ type: 'openai' })}
        advancedOpen={false}
        builtinPicker={{ open: false, loading: false, search: '' }}
        builtinIcons={[]}
        onOpenChange={() => undefined}
        onAdvancedToggle={() => undefined}
        onFormPatch={() => undefined}
        onSave={() => undefined}
        onCancel={() => undefined}
        isSaveDisabled={false}
        onRequestBuiltinIcons={handleRequestBuiltinIcons}
        onSelectBuiltinIcon={() => undefined}
        onBuiltinSearch={() => undefined}
        onResetLogo={() => undefined}
        avatarInputRef={createRef<HTMLInputElement>()}
        onAvatarUpload={() => undefined}
        onToggleBuiltinPicker={handleToggleBuiltinPicker}
      />,
    );

    const avatarTrigger = baseElement.querySelector('button[aria-haspopup="menu"]');
    expect(avatarTrigger).toBeInstanceOf(HTMLButtonElement);

    await user.click(avatarTrigger as HTMLButtonElement);
    await user.click(await screen.findByRole('menuitem', { name: '内置图标' }));

    expect(handleToggleBuiltinPicker).toHaveBeenCalledWith(true);
    expect(handleRequestBuiltinIcons).toHaveBeenCalledTimes(1);
  });

  it('内置图标网格里的每个按钮都会暴露共享 tooltip，而不是退回原生 title', async () => {
    render(
      <ModelManagerAddProviderDialog
        open
        editingProviderId={null}
        addProviderForm={createForm({ type: 'openai' })}
        advancedOpen={false}
        builtinPicker={{ open: true, loading: false, search: '' }}
        builtinIcons={[{ id: 'openai', c: true }]}
        onOpenChange={() => undefined}
        onAdvancedToggle={() => undefined}
        onFormPatch={() => undefined}
        onSave={() => undefined}
        onCancel={() => undefined}
        isSaveDisabled={false}
        onRequestBuiltinIcons={() => undefined}
        onSelectBuiltinIcon={() => undefined}
        onBuiltinSearch={() => undefined}
        onResetLogo={() => undefined}
        avatarInputRef={createRef<HTMLInputElement>()}
        onAvatarUpload={() => undefined}
        onToggleBuiltinPicker={() => undefined}
      />,
    );

    const builtinIconButton = screen.getByRole('button', { name: 'OpenAI' });
    expect(builtinIconButton).not.toHaveAttribute('title');

    fireEvent.focus(builtinIconButton);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('OpenAI');
  });

  it('内置图标网格会复用虚拟滚动，只渲染当前窗口命中的行', () => {
    visibleVirtualRowCountState.current = 2;

    render(
      <ModelManagerAddProviderDialog
        open
        editingProviderId={null}
        addProviderForm={createForm({ type: 'openai' })}
        advancedOpen={false}
        builtinPicker={{ open: true, loading: false, search: '' }}
        builtinIcons={Array.from({ length: 40 }, (_, index) => ({ id: `icon-${index}`, c: true }))}
        onOpenChange={() => undefined}
        onAdvancedToggle={() => undefined}
        onFormPatch={() => undefined}
        onSave={() => undefined}
        onCancel={() => undefined}
        isSaveDisabled={false}
        onRequestBuiltinIcons={() => undefined}
        onSelectBuiltinIcon={() => undefined}
        onBuiltinSearch={() => undefined}
        onResetLogo={() => undefined}
        avatarInputRef={createRef<HTMLInputElement>()}
        onAvatarUpload={() => undefined}
        onToggleBuiltinPicker={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Icon-0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Icon-15' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Icon-16' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Icon-39' })).not.toBeInTheDocument();
  });
});
