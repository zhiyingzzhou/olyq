/**
 * 说明：`AssistantEditor.spec` 组件模块。
 *
 * 职责：
 * - 承载 `AssistantEditor.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistantEditor } from './AssistantEditor';

const { browserContextAssistantOverrideMock } = vi.hoisted(() => ({
  browserContextAssistantOverrideMock: {
    current: null as null | {
      assistantId: string;
      mode: 'profile';
      profileId: string;
    },
  },
}));

const { modelOptionsMock } = vi.hoisted(() => ({
  modelOptionsMock: {
    providers: [
      { id: 'openai', name: 'OpenAI', logo: undefined },
      { id: 'anthropic', name: 'Anthropic', logo: undefined },
      { id: 'openrouter', name: 'OpenRouter', logo: undefined },
    ],
    modelMap: new Map([
      ['openai/gpt-5.4', {
        id: 'openai/gpt-5.4',
        name: 'GPT-5.4',
        providerName: 'OpenAI',
        transportProtocol: 'openai-chat',
      }],
      ['anthropic/claude-sonnet-4-6', {
        id: 'anthropic/claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6',
        providerName: 'Anthropic',
        transportProtocol: 'anthropic-messages',
      }],
      ['openrouter/openai/gpt-5', {
        id: 'openrouter/openai/gpt-5',
        name: 'OpenRouter GPT-5',
        providerName: 'OpenRouter',
        transportProtocol: 'openai-chat',
      }],
    ]),
  },
}));

const originalScrollIntoView = Element.prototype.scrollIntoView;

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock('@/hooks/useModelOptions', () => ({
  useModelOptions: () => ({
    providers: modelOptionsMock.providers,
    modelMap: modelOptionsMock.modelMap,
    getModelLabel: (value: string) => value,
  }),
}));

vi.mock('@/hooks/useChatSettingsStore', () => ({
  useChatSettingsStore: <T,>(selector: (state: {
    settings: {
      defaultModel: string;
      defaultTemperature: number;
      defaultTopP: number;
      defaultMaxTokens: number;
      defaultContextLength: number;
    };
  }) => T) => selector({
    settings: {
      defaultModel: 'openai/gpt-5.4',
      defaultTemperature: 0.7,
      defaultTopP: 0.9,
      defaultMaxTokens: 4096,
      defaultContextLength: 10,
    },
  }),
}));

vi.mock('@/lib/browser-context', () => ({
  BUILTIN_BROWSER_CONTEXT_PROFILES: [
    {
      id: 'minimal-page',
      title: 'Minimal Page',
      description: '',
      sources: ['tab-meta', 'readable-dom'],
      outputFormat: 'text',
      maxPromptChars: 2400,
      cacheTtlMs: 60_000,
    },
  ],
  DEFAULT_BROWSER_CONTEXT_PROFILE_ID: 'minimal-page',
  getBrowserContextAssistantOverride: () => browserContextAssistantOverrideMock.current,
  removeBrowserContextAssistantOverride: () => undefined,
  resolveBrowserContextPolicyForAssistant: () => ({
    profile: {
      id: 'minimal-page',
      title: 'Minimal Page',
      description: '',
      sources: ['tab-meta', 'readable-dom'],
      outputFormat: 'text',
      maxPromptChars: 2400,
      cacheTtlMs: 60_000,
    },
    source: 'default',
  }),
  upsertBrowserContextAssistantOverride: () => undefined,
}));

vi.mock('@/hooks/useAssistantStore', () => ({
  useAssistantStore: <T,>(selector: (state: {
    assistants: Array<{ id: string; tags?: string[] }>;
  }) => T) => selector({
    assistants: [{ id: 'assistant-1', tags: ['浏览器助手'] }],
  }),
}));

vi.mock('@/lib/memory', () => ({
  getMemoryConfig: () => ({ enabled: false }),
  isMemoryConfigured: () => false,
}));

vi.mock('@/lib/mcp/assistant-selection-storage', () => ({
  resolveAssistantMcpSelection: () => ({ mode: 'auto', manualServerIds: [] }),
}));

vi.mock('@/lib/mcp/use-mcp-servers-resource', () => ({
  useMcpServersResource: () => ({
    status: 'success',
    enabledServers: [],
    error: null,
  }),
}));

vi.mock('@/components/ui/ProviderIcon', () => ({
  ProviderIcon: () => <span data-testid="provider-icon" />,
}));

vi.mock('@/components/chat/ModelPickerDialog', () => ({
  ModelPickerDialog: ({
    open,
    onSelect,
    onClose,
  }: {
    open: boolean;
    onSelect: (modelId: string) => void;
    onClose: () => void;
  }) => (open ? (
    <div data-testid="assistant-generation-model-picker">
      <button type="button" onClick={() => onSelect('anthropic/claude-sonnet-4-6')}>
        choose claude
      </button>
      <button type="button" onClick={onClose}>close picker</button>
    </div>
  ) : null),
}));

describe('AssistantEditor', () => {
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

  beforeEach(() => {
    browserContextAssistantOverrideMock.current = null;
  });

  it('更新助手弹窗只提供主图标字段', () => {
    render(
      <AssistantEditor
        open
        onClose={() => {}}
        assistant={{
          id: 'assistant-1',
          scenario: 'browser',
          name: 'SEO 分析',
          iconId: 'chart-column',
          description: '分析网页 SEO',
          prompt: 'analyze seo',
          tags: ['浏览器助手'],
          topics: [],
          order: 1,
          createdAt: 1,
          updatedAt: 1,
        }}
        onUpdate={() => {}}
      />,
    );

    expect(screen.queryByText('assistant.customEmoji')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('legacy-icon')).not.toBeInTheDocument();
  });

  it('为内置 profile 展示可读标题而不是技术 ID', () => {
    browserContextAssistantOverrideMock.current = {
      assistantId: 'assistant-1',
      mode: 'profile',
      profileId: 'minimal-page',
    };

    render(
      <AssistantEditor
        open
        onClose={() => {}}
        assistant={{
          id: 'assistant-1',
          scenario: 'browser',
          name: '浏览器助手',
          description: '分析页面',
          prompt: 'analyze page',
          tags: ['浏览器助手'],
          topics: [],
          order: 1,
          createdAt: 1,
          updatedAt: 1,
        }}
        onUpdate={() => {}}
      />,
    );

    expect(screen.getByText('pageContext.profileCatalog.minimalPage.title')).toBeInTheDocument();
  });

  it('在更新助手弹窗里可以展开主图标列表并切换选项', async () => {
    const onUpdate = vi.fn();

    render(
      <AssistantEditor
        open
        onClose={() => {}}
        assistant={{
          id: 'assistant-1',
          scenario: 'browser',
          name: '任务执行',
          iconId: 'wrench',
          description: '执行任务',
          prompt: 'do task',
          tags: ['浏览器助手'],
          topics: [],
          order: 1,
          createdAt: 1,
          updatedAt: 1,
        }}
        onUpdate={onUpdate}
      />,
    );

    const dialog = screen.getByRole('dialog');
    const [iconSelect] = within(dialog).getAllByRole('combobox');

    fireEvent.click(iconSelect);
    fireEvent.click(await screen.findByRole('option', { name: 'assistant.iconCatalog.sparkles' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    expect(onUpdate).toHaveBeenCalledWith('assistant-1', expect.objectContaining({
      iconId: 'sparkles',
    }));
  });

  it('更新助手弹窗不再承载常用短语管理入口', () => {
    render(
      <AssistantEditor
        open
        onClose={() => {}}
        assistant={{
          id: 'assistant-1',
          scenario: 'browser',
          name: '任务执行',
          iconId: 'wrench',
          description: '执行任务',
          prompt: 'do task',
          tags: ['浏览器助手'],
          regularPhrases: [{
            id: 'regular-1',
            title: '旧短语',
            content: 'old content',
            createdAt: 1,
            updatedAt: 1,
            order: 1,
          }],
          topics: [],
          order: 1,
          createdAt: 1,
          updatedAt: 1,
        }}
        onUpdate={() => {}}
      />,
    );

    expect(screen.queryByText('quickPhrase.assistantManageTitle')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('quickPhrase.titlePlaceholder')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('quickPhrase.dragHandle')).not.toBeInTheDocument();
  });

  it('更新助手配置时保留已有常用短语', () => {
    const onUpdate = vi.fn();

    render(
      <AssistantEditor
        open
        onClose={() => {}}
        assistant={{
          id: 'assistant-1',
          scenario: 'browser',
          name: '任务执行',
          iconId: 'wrench',
          description: '执行任务',
          prompt: 'do task',
          tags: ['浏览器助手'],
          regularPhrases: [{
            id: 'regular-1',
            title: '旧短语',
            content: 'old content',
            createdAt: 1,
            updatedAt: 1,
            order: 1,
          }],
          topics: [],
          order: 1,
          createdAt: 1,
          updatedAt: 1,
        }}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    expect(onUpdate).toHaveBeenCalledWith('assistant-1', expect.objectContaining({
      regularPhrases: [expect.objectContaining({
        id: 'regular-1',
        title: '旧短语',
        content: 'old content',
      })],
    }));
  });

  it('助手编辑器只保存助手级字段，不再渲染或写出生成参数', () => {
    const onUpdate = vi.fn();

    render(
      <AssistantEditor
        open
        onClose={() => {}}
        assistant={{
          id: 'assistant-1',
          scenario: 'browser',
          name: '任务执行',
          iconId: 'wrench',
          description: '执行任务',
          prompt: 'do task',
          tags: ['浏览器助手'],
          topics: [],
          order: 1,
          createdAt: 1,
          updatedAt: 1,
        }}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('assistant.systemPromptPlaceholder'), {
      target: { value: 'updated system prompt' },
    });

    expect(screen.queryByTestId('assistant-generation-model-trigger')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('assistant.generation.maxTokens')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-generation-model-params')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    expect(onUpdate).toHaveBeenCalledWith('assistant-1', expect.objectContaining({
      prompt: 'updated system prompt',
    }));
    const patch = onUpdate.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('model');
    expect(patch).not.toHaveProperty('temperature');
    expect(patch).not.toHaveProperty('topP');
    expect(patch).not.toHaveProperty('maxTokens');
    expect(patch).not.toHaveProperty('contextLength');
    expect(patch).not.toHaveProperty('modelParams');
  });
});
