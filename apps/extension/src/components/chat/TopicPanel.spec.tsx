/**
 * 说明：`TopicPanel.spec` 组件模块。
 *
 * 职责：
 * - 验证话题设置只承载 topic-owned 字段；
 * - 防止生成参数再回流到助手配置。
 *
 * 边界：
 * - 本文件只覆盖 `TopicPanel` 的本地草稿与保存语义。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TopicPanel, type TopicPanelTopic } from './TopicPanel';

vi.mock('@/hooks/useModelOptions', () => ({
  useModelOptions: () => ({
    providers: [
      { id: 'openai', name: 'OpenAI', logo: undefined, type: 'openai' },
      { id: 'anthropic', name: 'Anthropic', logo: undefined, type: 'anthropic' },
      { id: 'openrouter', name: 'OpenRouter', logo: undefined, type: 'openai' },
    ],
    modelMap: new Map([
      ['openai/gpt-5.4', {
        id: 'openai/gpt-5.4',
        modelId: 'gpt-5.4',
        name: 'GPT-5.4',
        providerId: 'openai',
        providerName: 'OpenAI',
        providerType: 'openai',
        transportProtocol: 'openai-responses',
        features: ['native-web-search'],
        supportedParameters: ['tools'],
      }],
      ['anthropic/claude-sonnet-4-6', {
        id: 'anthropic/claude-sonnet-4-6',
        modelId: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6',
        providerId: 'anthropic',
        providerName: 'Anthropic',
        providerType: 'anthropic',
        transportProtocol: 'anthropic-messages',
      }],
      ['openrouter/openai/gpt-5', {
        id: 'openrouter/openai/gpt-5',
        modelId: 'openai/gpt-5',
        name: 'OpenRouter GPT-5',
        providerId: 'openrouter',
        providerName: 'OpenRouter',
        providerType: 'openai',
        transportProtocol: 'openai-chat',
        supportedParameters: ['tools'],
      }],
    ]),
    getModelLabel: (value: string) => value,
  }),
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
    <div data-testid="topic-generation-model-picker">
      <button type="button" onClick={() => onSelect('anthropic/claude-sonnet-4-6')}>
        choose claude
      </button>
      <button type="button" onClick={onClose}>close picker</button>
    </div>
  ) : null),
}));

vi.mock('@/components/ui/ProviderIcon', () => ({
  ProviderIcon: () => <span data-testid="provider-icon" />,
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('react-i18next');
  const translations: Record<string, string> = {
    'common.cancel': '取消',
    'common.save': '保存',
    'assistant.useDefault': '使用默认',
    'chat.reasoningEffort': '推理强度',
    'sidebar.topicPrompt': '话题提示词',
    'sidebar.topicPromptDesc': 'topic prompt desc',
    'sidebar.topicPromptPlaceholder': 'topic-prompt',
    'topicSettings.sections.generation': '模型与生成参数',
    'topicSettings.generationSectionDescription': 'generation desc',
    'topicSettings.model': '模型',
    'topicSettings.modelDescription': 'model desc',
    'topicSettings.temperature': '温度',
    'topicSettings.temperatureDescription': 'temperature desc',
    'topicSettings.topP': 'Top P',
    'topicSettings.topPDescription': 'top p desc',
    'topicSettings.maxTokens': '最大输出',
    'topicSettings.maxTokensDescription': 'max tokens desc',
    'topicSettings.maxTokensInvalid': 'max tokens invalid',
    'topicSettings.contextLength': '上下文条数',
    'topicSettings.contextLengthDescription': 'context length desc',
    'topicSettings.modelParamsLabel': '模型参数',
    'topicSettings.modelParamsDescription': 'model params desc',
    'topicSettings.modelParamsInvalid': 'model params invalid',
    'topicSettings.reasoningBudgetInvalid': 'reasoning budget invalid',
    'topicSettings.nativeWebSearchParamsLabel': '模型内置搜索参数',
    'topicSettings.nativeWebSearchOpenAiDescription': 'openai native search desc',
    'topicSettings.nativeWebSearchOpenRouterDescription': 'openrouter native search desc',
    'topicSettings.nativeWebSearchDefault': '平台默认',
    'topicSettings.nativeWebSearchContextSize': '搜索上下文',
    'topicSettings.nativeWebSearchContextLow': '低',
    'topicSettings.nativeWebSearchContextMedium': '中',
    'topicSettings.nativeWebSearchContextHigh': '高',
    'topicSettings.nativeWebSearchEngine': '搜索引擎',
    'topicSettings.nativeWebSearchEngineAuto': '自动',
    'topicSettings.nativeWebSearchEngineNative': 'OpenRouter 原生',
    'topicSettings.nativeWebSearchEngineExa': 'Exa',
    'topicSettings.nativeWebSearchEngineFirecrawl': 'Firecrawl',
    'topicSettings.nativeWebSearchEngineParallel': '并行',
    'topicSettings.nativeWebSearchMaxResults': '单次结果数',
    'topicSettings.nativeWebSearchMaxTotalResults': '总结果数',
    'topicSettings.nativeWebSearchAllowedDomains': '允许域名',
    'topicSettings.nativeWebSearchExcludedDomains': '排除域名',
    'topicSettings.nativeWebSearchDomainsPlaceholder': '输入域名后回车',
    'topicSettings.nativeWebSearchRemoveDomain': '移除域名 {{domain}}',
    'topicSettings.nativeWebSearchDomainConflict': '域名不能同时出现在两个列表中：{{domains}}',
    'topicSettings.nativeWebSearchUserLocation': '近似位置',
    'topicSettings.nativeWebSearchCountryPlaceholder': '国家码，例如 US',
    'topicSettings.nativeWebSearchRegionPlaceholder': '地区/州',
    'topicSettings.nativeWebSearchCityPlaceholder': '城市',
    'topicSettings.nativeWebSearchTimezonePlaceholder': '时区，例如 America/Los_Angeles',
    'topicSettings.nativeWebSearchExternalAccess': '实时外部访问',
    'topicSettings.nativeWebSearchExternalAccessDescription': 'external access desc',
    'topicSettings.nativeWebSearchExternalProviderActive': '外部搜索优先',
    'topicSettings.sections.prompt': '提示词',
    'topicSettings.promptSectionDescription': 'prompt desc',
  };
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => translations[key] ?? key,
    }),
  };
});

/**
 * 测试辅助函数：`makeTopic`。
 *
 * @remarks
 * 用于当前测试中的最小话题配置搭建，不作为运行时代码复用。
 */
function makeTopic(overrides?: Partial<TopicPanelTopic>): TopicPanelTopic {
  return {
    id: 'topic-1',
    assistantId: 'assistant-1',
    title: '测试话题',
    topicPrompt: 'old prompt',
    ...overrides,
  };
}

const generationDefaults = {
  model: 'openai/gpt-5.4',
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 4096,
  contextLength: 20,
};

describe('TopicPanel', () => {
  it('回填 topicPrompt 与 topic-owned 生成参数，保存前不会触发 store 写回', () => {
    const onSaveTopic = vi.fn();
    const onClose = vi.fn();

    render(
      <TopicPanel
        topic={makeTopic({
          model: 'openrouter/openai/gpt-5',
          maxTokens: 2048,
          modelParams: { seed: 7 },
        })}
        generationDefaults={generationDefaults}
        onSaveTopic={onSaveTopic}
        onClose={onClose}
      />,
    );

    expect(screen.getByPlaceholderText('topic-prompt')).toHaveValue('old prompt');
    expect(screen.queryByText('系统提示词')).not.toBeInTheDocument();
    expect(screen.getByText('模型与生成参数')).toBeInTheDocument();
    expect(screen.getByText('模型')).toBeInTheDocument();
    expect(screen.getByText('温度')).toBeInTheDocument();
    expect(screen.getByText('Top P')).toBeInTheDocument();
    expect(screen.getByText('上下文条数')).toBeInTheDocument();
    expect(screen.getByText('模型参数')).toBeInTheDocument();
    expect(screen.getByTestId('topic-settings-model-params')).toHaveValue('{\n  "seed": 7\n}');
    expect(screen.queryByText('测试话题')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('topic-prompt'), {
      target: { value: 'new topic prompt' },
    });
    fireEvent.change(screen.getByLabelText('最大输出'), {
      target: { value: '8192' },
    });
    fireEvent.click(screen.getByTestId('topic-settings-model-trigger'));
    fireEvent.click(screen.getByText('choose claude'));
    fireEvent.change(screen.getByTestId('topic-settings-model-params'), {
      target: { value: '{\n  "seed": 9\n}' },
    });

    expect(onSaveTopic).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(onSaveTopic).toHaveBeenCalledWith({
      topicPrompt: 'new topic prompt',
      model: 'anthropic/claude-sonnet-4-6',
      maxTokens: 8192,
      modelParams: { seed: 9 },
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('取消会直接丢弃本地草稿', () => {
    const onSaveTopic = vi.fn();
    const onClose = vi.fn();

    render(
      <TopicPanel
        topic={makeTopic()}
        generationDefaults={generationDefaults}
        onSaveTopic={onSaveTopic}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('topic-prompt'), {
      target: { value: 'discard me' },
    });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(onSaveTopic).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('无变更保存时只关闭弹窗，不写 topic meta', () => {
    const onSaveTopic = vi.fn();
    const onClose = vi.fn();

    render(
      <TopicPanel
        topic={makeTopic()}
        generationDefaults={generationDefaults}
        onSaveTopic={onSaveTopic}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(onSaveTopic).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('分组不渲染外层卡片，保持普通设置行密度', () => {
    render(
      <TopicPanel
        topic={makeTopic()}
        generationDefaults={generationDefaults}
        onSaveTopic={vi.fn()}
        onClose={() => {}}
      />,
    );

    const promptSection = screen.getByTestId('topic-settings-prompt-section');
    expect(promptSection).toHaveClass('space-y-3');
    expect(promptSection).not.toHaveClass('rounded-lg', 'rounded-xl', 'border', 'bg-card', 'bg-background/40');
  });

  it('模型内置搜索参数写入 topic.modelParams.nativeWebSearch，不新增其它真源', () => {
    const onSaveTopic = vi.fn();

    render(
      <TopicPanel
        topic={makeTopic({
          model: 'openai/gpt-5.4',
          modelParams: { seed: 7 },
        })}
        generationDefaults={generationDefaults}
        onSaveTopic={onSaveTopic}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('模型内置搜索参数')).toBeInTheDocument();

    const domainInput = screen.getByPlaceholderText('输入域名后回车') as HTMLInputElement;
    fireEvent.change(domainInput, { target: { value: 'https://Example.com/docs?q=1' } });
    fireEvent.keyDown(domainInput, { key: 'Enter', code: 'Enter' });
    fireEvent.change(screen.getByPlaceholderText('国家码，例如 US'), {
      target: { value: 'us' },
    });

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(onSaveTopic).toHaveBeenCalledWith({
      modelParams: {
        seed: 7,
        nativeWebSearch: {
          openai: {
            allowedDomains: ['example.com'],
            userLocation: { type: 'approximate', country: 'US' },
          },
        },
      },
    });
  });

  it('外部搜索开启时只提示发送会优先外部搜索，仍保留当前话题参数编辑入口', () => {
    render(
      <TopicPanel
        topic={makeTopic({
          model: 'openai/gpt-5.4',
          modelParams: { nativeWebSearch: { openai: { allowedDomains: ['example.com'] } } },
        })}
        generationDefaults={generationDefaults}
        onSaveTopic={vi.fn()}
        onClose={() => {}}
        externalWebSearchActive
      />,
    );

    expect(screen.getByText('模型内置搜索参数')).toBeInTheDocument();
    expect(screen.getByText('外部搜索优先')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });
});
