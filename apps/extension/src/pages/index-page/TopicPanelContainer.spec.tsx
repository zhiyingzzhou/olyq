/**
 * 说明：`TopicPanelContainer.spec` 页面模块。
 *
 * 职责：
 * - 承载 `TopicPanelContainer.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAssistantStore } from '@/hooks/useAssistantStore';
import { useChatStore } from '@/hooks/useChatStore';
import type { Topic } from '@/types/chat';
import { TopicPanelContainer } from './TopicPanelContainer';

vi.mock('@/hooks/useModelOptions', () => ({
  useModelOptions: () => ({
    providers: [
      { id: 'openai', name: 'OpenAI', logo: undefined },
      { id: 'anthropic', name: 'Anthropic', logo: undefined },
    ],
    modelMap: new Map([
      ['openai/gpt-5.4', { id: 'openai/gpt-5.4', name: 'GPT-5.4', providerName: 'OpenAI', transportProtocol: 'openai-chat' }],
      ['anthropic/claude-sonnet-4-6', { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6', providerName: 'Anthropic', transportProtocol: 'anthropic-messages' }],
    ]),
    getModelLabel: (value: string) => value,
  }),
}));

vi.mock('@/components/chat/ModelPickerDialog', () => ({
  ModelPickerDialog: ({
    open,
    onSelect,
  }: {
    open: boolean;
    onSelect: (modelId: string) => void;
  }) => (open ? (
    <div data-testid="topic-generation-model-picker">
      <button type="button" onClick={() => onSelect('anthropic/claude-sonnet-4-6')}>
        choose claude
      </button>
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
    'common.close': '关闭',
    'common.save': '保存',
    'assistant.useDefault': '使用默认',
    'chat.reasoningEffort': '推理强度',
    'sidebar.topicPrompt': '话题提示词',
    'sidebar.topicPromptDesc': 'topic prompt desc',
    'sidebar.topicPromptPlaceholder': 'topic-prompt',
    'topicSettings.title': '话题设置',
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
 * 用于当前测试中的最小话题搭建，不作为运行时代码复用。
 */
function makeTopic(): Topic {
  const now = Date.now();
  return {
    id: 'topic-1',
    assistantId: 'assistant-1',
    name: '测试话题',
    pinned: false,
    createdAt: now,
    updatedAt: now,
    order: now,
    topicPrompt: 'old prompt',
    model: 'openai/gpt-5.4',
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 4096,
    contextLength: 18,
    modelParams: { seed: 7 },
    isNameManuallyEdited: false,
  };
}

describe('TopicPanelContainer', () => {
  beforeEach(() => {
    localStorage.clear();

    useAssistantStore.setState({
      presets: [
        {
          id: '__builtin_default_role__',
          scenario: 'general' as const,
          name: '默认助手',
          prompt: 'builtin prompt',
        },
      ],
      assistants: [
        {
          id: 'assistant-1',
          scenario: 'general' as const,
          name: 'Writer',
          prompt: 'assistant prompt',
          topics: [makeTopic()],
          order: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    useChatStore.setState({
      runtime: {
        activeAssistantId: 'assistant-1',
        activeTopicId: 'topic-1',
      },
      activeConversationKey: 'topic-1',
      activeMessages: [],
      activeMessagesLoading: false,
      activeConversationState: 'ready',
      autoRenameState: {},
    });

  });

  it('通过真实 store 保存 topicPrompt 与 topic 生成参数，不会触发 Maximum update depth 循环', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<TopicPanelContainer onClose={vi.fn()} />);

    expect(screen.queryByText('测试话题')).not.toBeInTheDocument();
    expect(screen.queryByText('系统提示词')).not.toBeInTheDocument();
    expect(screen.getByText('模型')).toBeInTheDocument();
    expect(screen.getByText('模型参数')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('topic-prompt'), {
      target: { value: 'updated topic prompt' },
    });
    fireEvent.change(screen.getByLabelText('最大输出'), {
      target: { value: '8192' },
    });
    fireEvent.click(screen.getByTestId('topic-settings-model-trigger'));
    fireEvent.click(screen.getByText('choose claude'));
    fireEvent.change(screen.getByTestId('topic-settings-model-params'), {
      target: { value: '{\n  "seed": 9\n}' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    const assistant = useAssistantStore.getState().getAssistant('assistant-1');
    expect(assistant?.prompt).toBe('assistant prompt');
    expect(assistant?.topics[0]?.topicPrompt).toBe('updated topic prompt');
    expect(assistant?.topics[0]?.model).toBe('anthropic/claude-sonnet-4-6');
    expect(assistant?.topics[0]?.maxTokens).toBe(8192);
    expect(assistant?.topics[0]?.modelParams).toEqual({ seed: 9 });
    expect(assistant).not.toHaveProperty('maxTokens');

    const maxDepthErrors = consoleErrorSpy.mock.calls.filter((args) => (
      args.some((item) => typeof item === 'string' && item.includes('Maximum update depth exceeded'))
    ));
    expect(maxDepthErrors).toEqual([]);

    consoleErrorSpy.mockRestore();
  });
});
