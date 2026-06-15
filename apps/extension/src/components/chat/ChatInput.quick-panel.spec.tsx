/**
 * 说明：`ChatInput.quick-panel.spec` 组件模块。
 *
 * 职责：
 * - 承载 `ChatInput.quick-panel.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createDisabledMcpServerSelection, createManualMcpServerSelection } from '@/lib/mcp/selection';
import type { McpServerConfig } from '@/types/mcp';

const scrollIntoViewMock = vi.fn();

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  writable: true,
  value: scrollIntoViewMock,
});

vi.mock('react-i18next', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock('@/hooks/useToast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/components/chat/MemoryButton', () => ({
  MemoryButton: () => null,
}));

vi.mock('@/hooks/useModelOptions', () => ({
  useModelOptions: () => ({
    providers: [
      { id: 'openai', name: 'OpenAI', logo: undefined, enabled: true },
      { id: 'anthropic', name: 'Anthropic', logo: undefined, enabled: true },
    ],
    models: [
      {
        id: 'openai/gpt-5.4',
        modelId: 'gpt-5.4',
        name: 'GPT-5.4',
        providerId: 'openai',
        providerName: 'OpenAI',
        providerType: 'openai',
        transportProtocol: 'openai-responses',
        kind: 'chat',
        features: ['native-web-search'],
      },
      {
        id: 'anthropic/claude-sonnet-4-6',
        modelId: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6',
        providerId: 'anthropic',
        providerName: 'Anthropic',
        providerType: 'anthropic',
        transportProtocol: 'anthropic-messages',
        kind: 'chat',
        features: [],
      },
    ],
    getModelLabel: (id: string) => ({
      'openai/gpt-5.4': 'GPT-5.4',
      'anthropic/claude-sonnet-4-6': 'Claude Sonnet 4.6',
    }[id] ?? id),
  }),
}));

const settingsState = {
  settings: {
    sendMessageShortcut: 'enter',
    pasteLongTextAsFile: true,
    pasteLongTextThreshold: 2000,
    autoTranslateWithSpace: false,
    translateLanguages: [],
    showTranslateConfirm: false,
    translateTargetLanguage: '',
    translateModel: 'mock-model',
    defaultModel: 'mock-model',
  },
};

vi.mock('@/hooks/useChatSettingsStore', () => ({
  useChatSettingsStore: (selector: (s: typeof settingsState) => unknown) => selector(settingsState),
}));

const assistantStoreState = {
  assistants: [],
  currentAssistant: null as null | {
    id: string;
    enableWebSearch?: boolean;
    webSearchProviderId?: string;
    enableMemory?: boolean;
    regularPhrases?: Array<{
      id: string;
      title: string;
      content: string;
      createdAt: number;
      updatedAt: number;
      order: number;
    }>;
  },
  getAssistant: (assistantId?: string) => {
    if (!assistantId) return null;
    return assistantStoreState.currentAssistant?.id === assistantId ? assistantStoreState.currentAssistant : null;
  },
  updateAssistantConfig: vi.fn(),
};

const useAssistantStoreMock = Object.assign(
  (selector: (s: typeof assistantStoreState) => unknown) => selector(assistantStoreState),
  {
    getState: () => assistantStoreState,
    subscribe: vi.fn(() => () => undefined),
  },
);

vi.mock('@/hooks/useAssistantStore', () => ({
  useAssistantStore: useAssistantStoreMock,
}));

const quickPhraseStoreMock = vi.hoisted(() => {
  const state = {
    phrases: [
      {
        id: 'phrase-1',
        title: 'Greeting',
        content: 'Hello there',
        createdAt: 1,
        updatedAt: 1,
        order: 1,
      },
    ],
    subscribers: new Set<() => void>(),
  };
  return {
    state,
    addQuickPhrase: vi.fn((draft: { title: string; content: string }) => {
      const phrase = {
        id: `phrase-${state.phrases.length + 1}`,
        title: draft.title,
        content: draft.content,
        createdAt: 10,
        updatedAt: 10,
        order: 10,
      };
      state.phrases = [phrase, ...state.phrases];
      for (const callback of state.subscribers) callback();
      return phrase;
    }),
  };
});

const mentionedModelsStoreMock = vi.hoisted(() => {
  const state = {
    values: new Map<string, string[]>(),
    subscribers: new Set<() => void>(),
  };
  /**
   * 规整测试里的 mention 模型 ID 列表。
   */
  const normalizeMentionModelIds = (raw: unknown): string[] => {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const next: string[] = [];
    for (const item of raw) {
      const modelId = typeof item === 'string' ? item.trim() : '';
      if (!modelId || seen.has(modelId)) continue;
      seen.add(modelId);
      next.push(modelId);
    }
    return next;
  };
  return {
    state,
    normalizeMentionModelIds,
    getMentionedModelsForAssistant: vi.fn((assistantId?: string) => {
      const normalizedAssistantId = String(assistantId || '').trim();
      return normalizedAssistantId ? [...(state.values.get(normalizedAssistantId) ?? [])] : [];
    }),
    setMentionedModelsForAssistant: vi.fn((assistantId: string, modelIds: string[]) => {
      const normalizedAssistantId = String(assistantId || '').trim();
      if (!normalizedAssistantId) return [];
      const normalizedModelIds = normalizeMentionModelIds(modelIds);
      if (normalizedModelIds.length > 0) {
        state.values.set(normalizedAssistantId, normalizedModelIds);
      } else {
        state.values.delete(normalizedAssistantId);
      }
      for (const callback of state.subscribers) callback();
      return [...normalizedModelIds];
    }),
    subscribeMentionedModels: vi.fn((callback: () => void) => {
      state.subscribers.add(callback);
      return () => state.subscribers.delete(callback);
    }),
    reset: () => {
      state.values.clear();
      state.subscribers.clear();
    },
  };
});

vi.mock('@/lib/storage/storage-adapter', () => ({
  getStorageAdapter: () => ({
    onChange: () => () => {},
    get: vi.fn(async () => ({})),
    set: vi.fn(async () => {}),
  }),
}));

vi.mock('@/lib/mcp/storage', () => ({
  loadMcpSettingsConfig: vi.fn(async () => ({
    chatToolsEnabled: true,
  })),
}));

const reloadMcpServersResource = vi.fn(async () => {});
const mcpServersResourceState: { enabledServers: McpServerConfig[] } = {
  enabledServers: [
    {
      id: 'server-1',
      name: 'Test MCP Server',
      type: 'streamable-http',
      headers: {},
      oauth: {
        enabled: false,
        registrationStrategy: 'dynamic',
        scopes: [],
        tokenEndpointAuthMethod: 'none',
      },
      url: 'https://example.com/mcp',
      enabled: true,
    },
  ],
};

vi.mock('@/lib/mcp/use-mcp-servers-resource', () => ({
  useMcpServersResource: () => ({
    status: 'ready',
    data: mcpServersResourceState.enabledServers,
    error: null,
    enabledServers: mcpServersResourceState.enabledServers,
    reload: reloadMcpServersResource,
  }),
}));

vi.mock('@/lib/quick-phrases/phrase-store', () => ({
  getQuickPhrases: () => quickPhraseStoreMock.state.phrases.map((phrase) => ({ ...phrase })),
  addQuickPhrase: quickPhraseStoreMock.addQuickPhrase,
  subscribeQuickPhrases: (callback: () => void) => {
    quickPhraseStoreMock.state.subscribers.add(callback);
    return () => quickPhraseStoreMock.state.subscribers.delete(callback);
  },
}));

vi.mock('@/lib/chat/mentioned-models-store', () => ({
  normalizeMentionModelIds: mentionedModelsStoreMock.normalizeMentionModelIds,
  getMentionedModelsForAssistant: mentionedModelsStoreMock.getMentionedModelsForAssistant,
  setMentionedModelsForAssistant: mentionedModelsStoreMock.setMentionedModelsForAssistant,
  subscribeMentionedModels: mentionedModelsStoreMock.subscribeMentionedModels,
}));

vi.mock('@/lib/web-search/settings', () => ({
  loadWebSearchSettings: () => ({
    providerId: 'local-google',
    maxResults: 5,
    searchWithTime: false,
    excludeDomains: [],
  }),
  subscribeWebSearchSettingsChange: () => () => {},
}));

vi.mock('@/lib/attachments', () => ({
  putImageAttachment: vi.fn(),
  putFileAttachment: vi.fn(),
  deleteAttachments: vi.fn(),
  getAttachmentBlob: vi.fn(),
  blobToDataUrl: vi.fn(),
}));

describe('ChatInput: quick panel', () => {
  const interactionTestTimeoutMs = 30_000;

  beforeEach(() => {
    reloadMcpServersResource.mockClear();
    assistantStoreState.updateAssistantConfig.mockClear();
    assistantStoreState.currentAssistant = null;
    quickPhraseStoreMock.addQuickPhrase.mockClear();
    mentionedModelsStoreMock.reset();
    mentionedModelsStoreMock.getMentionedModelsForAssistant.mockClear();
    mentionedModelsStoreMock.setMentionedModelsForAssistant.mockClear();
    mentionedModelsStoreMock.subscribeMentionedModels.mockClear();
    quickPhraseStoreMock.state.phrases = [
      {
        id: 'phrase-1',
        title: 'Greeting',
        content: 'Hello there',
        createdAt: 1,
        updatedAt: 1,
        order: 1,
      },
    ];
    quickPhraseStoreMock.state.subscribers.clear();
    scrollIntoViewMock.mockClear();
    mcpServersResourceState.enabledServers = [
      {
        id: 'server-1',
        name: 'Test MCP Server',
        type: 'streamable-http',
        headers: {},
        oauth: {
          enabled: false,
          registrationStrategy: 'dynamic',
          scopes: [],
          tokenEndpointAuthMethod: 'none',
        },
        url: 'https://example.com/mcp',
        enabled: true,
      },
    ];
  });

  it('应通过 controller 驱动 slash 子菜单并把短语插入输入框', async () => {
    const { ChatInput } = await import('./ChatInput');

    render(
      <TooltipProvider>
        <ChatInput
          onSend={vi.fn()}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
        />
      </TooltipProvider>,
    );

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;

    fireEvent.change(textarea, {
      target: { value: '/', selectionStart: 1 },
    });

    await waitFor(() => expect(screen.getAllByText('chat.qp.root').length).toBeGreaterThan(0));
    const inlinePanel = document.querySelector('[data-quick-panel-placement="inline"][data-quick-panel-variant="input-replica"]');
    expect(inlinePanel).toBeTruthy();
    if (!inlinePanel) throw new Error('inline quick panel should exist');
    expect(document.querySelector('[data-chat-composer-shell]')?.contains(inlinePanel)).toBe(false);

    const phrasesButton = screen.getAllByText('chat.qp.phrases')
      .map((node) => node.closest('button'))
      .find(Boolean);
    expect(phrasesButton).toBeTruthy();
    fireEvent.mouseDown(phrasesButton!);

    await waitFor(() => expect(screen.getByText('Greeting')).toBeInTheDocument());

    const phraseButton = screen.getByText('Greeting').closest('button');
    expect(phraseButton).toBeTruthy();
    fireEvent.mouseDown(phraseButton!);

    await waitFor(() => expect(textarea.value).toBe('Hello there'));
  }, interactionTestTimeoutMs);

  it('应通过输入区闪电按钮在当前光标处插入短语并选中新内容', async () => {
    const { ChatInput } = await import('./ChatInput');

    render(
      <TooltipProvider>
        <ChatInput
          onSend={vi.fn()}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
        />
      </TooltipProvider>,
    );

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: 'Hello  world', selectionStart: 6, selectionEnd: 6 },
    });
    textarea.setSelectionRange(6, 6);

    fireEvent.click(screen.getByTestId('chat-toolbar-phrases'));

    await waitFor(() => expect(screen.getByTestId('phrases-quick-panel-popover')).toBeInTheDocument());
    const phraseButton = screen.getByText('Greeting').closest('button');
    expect(phraseButton).toBeTruthy();
    fireEvent.mouseDown(phraseButton!);

    await waitFor(() => expect(textarea.value).toBe('Hello Hello there world'));
    await waitFor(() => {
      expect(textarea.selectionStart).toBe(6);
      expect(textarea.selectionEnd).toBe(17);
    });
  }, interactionTestTimeoutMs);

  it('应在短语面板中优先展示当前助手常用短语', async () => {
    const { ChatInput } = await import('./ChatInput');
    assistantStoreState.currentAssistant = {
      id: 'assistant-1',
      enableWebSearch: false,
      webSearchProviderId: undefined,
      enableMemory: false,
      regularPhrases: [
        {
          id: 'assistant-phrase-1',
          title: 'Assistant Snippet',
          content: 'Assistant content',
          createdAt: 2,
          updatedAt: 2,
          order: 2,
        },
      ],
    };

    render(
      <TooltipProvider>
        <ChatInput
          onSend={vi.fn()}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
          assistantId="assistant-1"
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByTestId('chat-toolbar-phrases'));

    await waitFor(() => expect(screen.getByText('Assistant Snippet')).toBeInTheDocument());
    const assistantPhrase = screen.getByText('Assistant Snippet');
    const globalPhrase = screen.getByText('Greeting');
    expect(assistantPhrase.compareDocumentPosition(globalPhrase) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }, interactionTestTimeoutMs);

  it('输入区新增短语应写入当前助手常用短语', async () => {
    const { ChatInput } = await import('./ChatInput');
    assistantStoreState.currentAssistant = {
      id: 'assistant-1',
      enableWebSearch: false,
      webSearchProviderId: undefined,
      enableMemory: false,
      regularPhrases: [],
    };

    render(
      <TooltipProvider>
        <ChatInput
          onSend={vi.fn()}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
          assistantId="assistant-1"
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByTestId('chat-toolbar-phrases'));
    await waitFor(() => expect(screen.getByTestId('phrases-quick-panel-popover')).toBeInTheDocument());
    const addButton = screen.getAllByText('quickPhrase.add')
      .map((node) => node.closest('button'))
      .find(Boolean);
    expect(addButton).toBeTruthy();
    fireEvent.mouseDown(addButton!);

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'quickPhrase.add' })).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('quickPhrase.titlePlaceholder'), {
      target: { value: 'Assistant Draft' },
    });
    fireEvent.change(screen.getByPlaceholderText('quickPhrase.contentPlaceholder'), {
      target: { value: 'Assistant draft content' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => {
      expect(assistantStoreState.updateAssistantConfig).toHaveBeenCalledWith('assistant-1', {
        regularPhrases: [
          expect.objectContaining({
            title: 'Assistant Draft',
            content: 'Assistant draft content',
          }),
        ],
      });
    });
    expect(quickPhraseStoreMock.addQuickPhrase).not.toHaveBeenCalled();
  }, interactionTestTimeoutMs);

  it('输入区没有绑定助手时新增短语应写入全局短语', async () => {
    const { ChatInput } = await import('./ChatInput');

    render(
      <TooltipProvider>
        <ChatInput
          onSend={vi.fn()}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByTestId('chat-toolbar-phrases'));
    await waitFor(() => expect(screen.getByTestId('phrases-quick-panel-popover')).toBeInTheDocument());
    const addButton = screen.getAllByText('quickPhrase.add')
      .map((node) => node.closest('button'))
      .find(Boolean);
    expect(addButton).toBeTruthy();
    fireEvent.mouseDown(addButton!);

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'quickPhrase.add' })).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('quickPhrase.titlePlaceholder'), {
      target: { value: 'Global Draft' },
    });
    fireEvent.change(screen.getByPlaceholderText('quickPhrase.contentPlaceholder'), {
      target: { value: 'Global draft content' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => {
      expect(quickPhraseStoreMock.addQuickPhrase).toHaveBeenCalledWith({
        title: 'Global Draft',
        content: 'Global draft content',
      });
    });
    expect(assistantStoreState.updateAssistantConfig).not.toHaveBeenCalled();
  }, interactionTestTimeoutMs);

  it('应支持进入 manual 子菜单，并在点击具体 Server 后输出 manual 选择', async () => {
    const { ChatInput } = await import('./ChatInput');
    const onChangeMcpSelection = vi.fn();

    render(
      <TooltipProvider>
        <ChatInput
          onSend={vi.fn()}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
          mcpSelection={createDisabledMcpServerSelection()}
          onChangeMcpSelection={onChangeMcpSelection}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByLabelText('mcpBridgePanel.title'));

    await waitFor(() => expect(screen.getByText('mcpSelection.mcpModes.manual')).toBeInTheDocument());
    expect(screen.getByTestId('mcp-quick-panel-popover')).toHaveAttribute('data-side', 'top');

    const manualButton = screen.getByText('mcpSelection.mcpModes.manual').closest('button');
    expect(manualButton).toBeTruthy();
    fireEvent.mouseDown(manualButton!);

    await waitFor(() => {
      expect(screen.getByText('Test MCP Server')).toBeInTheDocument();
    });
    expect(onChangeMcpSelection).not.toHaveBeenCalled();

    const serverButton = screen.getByText('Test MCP Server').closest('button');
    expect(serverButton).toBeTruthy();
    fireEvent.mouseDown(serverButton!);

    await waitFor(() => {
      expect(onChangeMcpSelection).toHaveBeenCalledWith({
        mode: 'manual',
        manualServerIds: ['server-1'],
      });
    });
  }, interactionTestTimeoutMs);

  it('manual 子菜单在服务器列表晚到时会跟随最新资源刷新', async () => {
    mcpServersResourceState.enabledServers = [];
    const { ChatInput } = await import('./ChatInput');
    const onChangeMcpSelection = vi.fn();

    const view = render(
      <TooltipProvider>
        <ChatInput
          onSend={vi.fn()}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
          mcpSelection={createDisabledMcpServerSelection()}
          onChangeMcpSelection={onChangeMcpSelection}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByLabelText('mcpBridgePanel.title'));
    await waitFor(() => expect(screen.getByText('mcpSelection.mcpModes.manual')).toBeInTheDocument());

    const manualButton = screen.getByText('mcpSelection.mcpModes.manual').closest('button');
    expect(manualButton).toBeTruthy();
    fireEvent.mouseDown(manualButton!);
    expect(onChangeMcpSelection).not.toHaveBeenCalled();

    mcpServersResourceState.enabledServers = [
      {
        id: 'server-late',
        name: 'Late MCP Server',
        type: 'streamable-http',
        headers: {},
        oauth: {
          enabled: false,
          registrationStrategy: 'dynamic',
          scopes: [],
          tokenEndpointAuthMethod: 'none',
        },
        url: 'https://example.com/mcp',
        enabled: true,
      },
    ];

    view.rerender(
      <TooltipProvider>
        <ChatInput
          onSend={vi.fn()}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
          mcpSelection={createManualMcpServerSelection([])}
          onChangeMcpSelection={onChangeMcpSelection}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.getByText('Late MCP Server')).toBeInTheDocument());
  }, interactionTestTimeoutMs);

  it('应支持 @ mention 面板多选模型且选择后保持面板打开', async () => {
    const { ChatInput } = await import('./ChatInput');

    render(
      <TooltipProvider>
        <ChatInput
          onSend={vi.fn()}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByLabelText('message.mentionModel'));

    await waitFor(() => expect(screen.getAllByText('modelSelect.title').length).toBeGreaterThan(0));
    expect(screen.getByTestId('mention-quick-panel-popover')).toHaveAttribute('data-side', 'top');

    const firstModelButton = screen.getAllByText('GPT-5.4')
      .map((node) => node.closest('button'))
      .find(Boolean);
    expect(firstModelButton).toBeTruthy();
    fireEvent.mouseDown(firstModelButton!);

    await waitFor(() => expect(screen.getAllByText('GPT-5.4').length).toBeGreaterThan(1));
    expect(screen.getByText('Claude Sonnet 4.6')).toBeInTheDocument();

    const secondModelButton = screen.getAllByText('Claude Sonnet 4.6')
      .map((node) => node.closest('button'))
      .find(Boolean);
    expect(secondModelButton).toBeTruthy();
    fireEvent.mouseDown(secondModelButton!);

    await waitFor(() => expect(screen.getAllByText('Claude Sonnet 4.6').length).toBeGreaterThan(1));
    expect(screen.getAllByText('modelSelect.title').length).toBeGreaterThan(0);
  }, interactionTestTimeoutMs);

  it('@ mention 面板按 useModelOptions 的 provider 顺序展示模型', async () => {
    const { ChatInput } = await import('./ChatInput');

    render(
      <TooltipProvider>
        <ChatInput
          onSend={vi.fn()}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByLabelText('message.mentionModel'));

    await waitFor(() => expect(screen.getByTestId('mention-quick-panel-popover')).toBeInTheDocument());
    const rows = Array.from(document.querySelectorAll('[data-quick-panel-item-id^="mention:model:"]'))
      .map((element) => element.getAttribute('data-quick-panel-item-id'));

    expect(rows).toEqual([
      'mention:model:openai/gpt-5.4',
      'mention:model:anthropic/claude-sonnet-4-6',
    ]);
  }, interactionTestTimeoutMs);

  it('发送后应清空文本但保留当前助手的 @ mention 模型', async () => {
    const { ChatInput } = await import('./ChatInput');
    const onSend = vi.fn();

    render(
      <TooltipProvider>
        <ChatInput
          onSend={onSend}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
          assistantId="assistant-a"
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByLabelText('message.mentionModel'));
    await waitFor(() => expect(screen.getByTestId('mention-quick-panel-popover')).toBeInTheDocument());

    const firstModelButton = screen.getAllByText('GPT-5.4')
      .map((node) => node.closest('button'))
      .find(Boolean);
    expect(firstModelButton).toBeTruthy();
    fireEvent.mouseDown(firstModelButton!);

    const secondModelButton = screen.getAllByText('Claude Sonnet 4.6')
      .map((node) => node.closest('button'))
      .find((button) => button !== firstModelButton);
    expect(secondModelButton).toBeTruthy();
    fireEvent.mouseDown(secondModelButton!);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: 'Compare this', selectionStart: 12 },
    });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith({
        text: 'Compare this',
        mentionModels: ['openai/gpt-5.4', 'anthropic/claude-sonnet-4-6'],
      });
    });
    await waitFor(() => expect(screen.queryByTestId('mention-quick-panel-popover')).not.toBeInTheDocument());
    expect(textarea.value).toBe('');
    expect(screen.getByText('GPT-5.4')).toBeInTheDocument();
    expect(screen.getByText('Claude Sonnet 4.6')).toBeInTheDocument();
  }, interactionTestTimeoutMs);

  it('助手切换时 @ mention 模型只恢复当前助手自己的草稿', async () => {
    const { ChatInput } = await import('./ChatInput');
    const onSend = vi.fn();

    const view = render(
      <TooltipProvider>
        <ChatInput
          onSend={onSend}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
          assistantId="assistant-a"
        />
      </TooltipProvider>,
    );

    /**
     * 读取工具栏里的 mention 按钮，排除已选模型 chip 的同名 aria label。
     */
    const mentionToolbarButton = () => screen.getAllByLabelText('message.mentionModel')
      .find((button) => button.getAttribute('aria-haspopup') === 'dialog');

    fireEvent.click(screen.getByLabelText('message.mentionModel'));
    await waitFor(() => expect(screen.getByTestId('mention-quick-panel-popover')).toBeInTheDocument());
    const firstModelButton = screen.getAllByText('GPT-5.4')
      .map((node) => node.closest('button'))
      .find(Boolean);
    expect(firstModelButton).toBeTruthy();
    fireEvent.mouseDown(firstModelButton!);
    await waitFor(() => expect(screen.getAllByText('GPT-5.4').length).toBeGreaterThan(1));

    const closeButton = mentionToolbarButton();
    expect(closeButton).toBeTruthy();
    fireEvent.click(closeButton!);
    await waitFor(() => expect(screen.queryByTestId('mention-quick-panel-popover')).not.toBeInTheDocument());
    expect(screen.getByText('GPT-5.4')).toBeInTheDocument();

    view.rerender(
      <TooltipProvider>
        <ChatInput
          onSend={onSend}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
          assistantId="assistant-b"
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.queryByText('GPT-5.4')).not.toBeInTheDocument());

    view.rerender(
      <TooltipProvider>
        <ChatInput
          onSend={onSend}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
          assistantId="assistant-a"
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.getByText('GPT-5.4')).toBeInTheDocument());
  }, interactionTestTimeoutMs);

  it('应支持在输入 @ 时复用 mention 按钮锚点弹层', async () => {
    const { ChatInput } = await import('./ChatInput');

    render(
      <TooltipProvider>
        <ChatInput
          onSend={vi.fn()}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
        />
      </TooltipProvider>,
    );

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;

    fireEvent.change(textarea, {
      target: { value: '@', selectionStart: 1 },
    });

    await waitFor(() => expect(screen.getAllByText('modelSelect.title').length).toBeGreaterThan(0));
    expect(screen.getByTestId('mention-quick-panel-popover')).toHaveAttribute('data-side', 'top');
  }, interactionTestTimeoutMs);

  it('应支持点击同一图标稳定开关面板，并在不同图标间切换时复用单一 quick panel 状态', async () => {
    const { ChatInput } = await import('./ChatInput');

    render(
      <TooltipProvider>
        <ChatInput
          onSend={vi.fn()}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
        />
      </TooltipProvider>,
    );

    const mentionButton = screen.getByLabelText('message.mentionModel');
    const webSearchButton = screen.getByLabelText('chat.webSearch');

    fireEvent.click(mentionButton);
    await waitFor(() => expect(screen.getByTestId('mention-quick-panel-popover')).toBeInTheDocument());

    fireEvent.click(mentionButton);
    await waitFor(() => expect(screen.queryByTestId('mention-quick-panel-popover')).not.toBeInTheDocument());

    fireEvent.click(mentionButton);
    await waitFor(() => expect(screen.getByTestId('mention-quick-panel-popover')).toBeInTheDocument());

    fireEvent.click(webSearchButton);
    await waitFor(() => expect(screen.getByTestId('web-search-quick-panel-popover')).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByTestId('mention-quick-panel-popover')).not.toBeInTheDocument());
  }, interactionTestTimeoutMs);

  it('鼠标悬浮 quick panel 条目时不应触发自动滚动，离开列表后应清除悬浮高亮', async () => {
    const { ChatInput } = await import('./ChatInput');

    render(
      <TooltipProvider>
        <ChatInput
          onSend={vi.fn()}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByLabelText('message.mentionModel'));

    await waitFor(() => expect(screen.getByTestId('mention-quick-panel-popover')).toBeInTheDocument());

    const hoveredButton = screen.getAllByText('Claude Sonnet 4.6')
      .map((node) => node.closest('button'))
      .find(Boolean);
    expect(hoveredButton).toBeTruthy();

    const hoveredItem = hoveredButton!.closest('[data-quick-panel-item]');
    expect(hoveredItem).toBeTruthy();

    scrollIntoViewMock.mockClear();
    fireEvent.mouseEnter(hoveredButton!);

    await waitFor(() => {
      expect(hoveredItem).toHaveAttribute('data-active', 'true');
    });
    expect(scrollIntoViewMock).not.toHaveBeenCalled();

    const listContainer = hoveredItem!.parentElement;
    expect(listContainer).toBeTruthy();
    fireEvent.mouseLeave(listContainer!);

    await waitFor(() => {
      expect(hoveredItem).toHaveAttribute('data-active', 'false');
    });
  }, interactionTestTimeoutMs);

  it('应支持打开联网搜索面板并切换模型内置搜索', async () => {
    const { ChatInput } = await import('./ChatInput');
    assistantStoreState.currentAssistant = {
      id: 'assistant-1',
      enableWebSearch: false,
      webSearchProviderId: undefined,
      enableMemory: false,
    };

    render(
      <TooltipProvider>
        <ChatInput
          onSend={vi.fn()}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
          assistantId="assistant-1"
          currentModel="openai/gpt-5.4"
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByLabelText('chat.webSearch'));

    await waitFor(() => expect(screen.getAllByText('chat.webSearch').length).toBeGreaterThan(0));
    expect(screen.getByTestId('web-search-quick-panel-popover')).toHaveAttribute('data-side', 'top');

    const builtinButton = screen.getAllByText('chat.webSearchBuiltinLabel')
      .map((node) => node.closest('button'))
      .find(Boolean);
    expect(builtinButton).toBeTruthy();
    fireEvent.mouseDown(builtinButton!);

    await waitFor(() => {
      expect(assistantStoreState.updateAssistantConfig).toHaveBeenCalledWith('assistant-1', {
        webSearchProviderId: undefined,
        enableWebSearch: true,
      });
    });
  }, interactionTestTimeoutMs);

  it('联网搜索面板应提供模型内置搜索设置入口，并复用 settings presentation', async () => {
    const { ChatInput } = await import('./ChatInput');
    const onOpenNativeWebSearchSettings = vi.fn();
    assistantStoreState.currentAssistant = {
      id: 'assistant-1',
      enableWebSearch: true,
      webSearchProviderId: undefined,
      enableMemory: false,
    };

    render(
      <TooltipProvider>
        <ChatInput
          onSend={vi.fn()}
          onStop={() => {}}
          isLoading={false}
          onOpenPrompts={() => {}}
          assistantId="assistant-1"
          currentModel="openai/gpt-5.4"
          onOpenNativeWebSearchSettings={onOpenNativeWebSearchSettings}
        />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByLabelText('chat.webSearch'));

    await waitFor(() => expect(screen.getByTestId('web-search-quick-panel-popover')).toBeInTheDocument());
    const settingsButton = screen.getAllByText('chat.webSearchBuiltinSettings')
      .map((node) => node.closest('button'))
      .find(Boolean);
    expect(settingsButton).toBeTruthy();
    expect(settingsButton!.closest('[data-quick-panel-item]')).toHaveAttribute('data-presentation', 'settings');

    fireEvent.mouseDown(settingsButton!);

    expect(onOpenNativeWebSearchSettings).toHaveBeenCalledTimes(1);
  }, interactionTestTimeoutMs);
});
