/**
 * 说明：`ChatArea.multi-select-layout.spec` 组件模块。
 *
 * 职责：
 * - 承载 `ChatArea.multi-select-layout.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatArea } from './ChatArea';
import type { Message, ResolvedConversationContext } from '@/types/chat';

const {
  messageGroupViewSpy,
  messageBubbleSpy,
  useMultiSelectMock,
  patchTopicConfigMock,
} = vi.hoisted(() => ({
  messageGroupViewSpy: vi.fn(),
  messageBubbleSpy: vi.fn(),
  useMultiSelectMock: vi.fn(),
  patchTopicConfigMock: vi.fn(),
}));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 120,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: `row-${index}`, start: index * 120 })),
    measureElement: () => undefined,
    scrollToIndex: vi.fn(),
  }),
}));

vi.mock('@/hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(async () => true),
    ConfirmDialogPortal: () => null,
  }),
}));

vi.mock('@/hooks/useModelOptions', () => ({
  useModelOptions: () => ({
    providers: [],
    models: [],
    modelMap: new Map(),
    getModelLabel: (id: string) => id,
    getModelShortLabel: (id: string) => id,
  }),
}));

const settingsState = {
  settings: {
    confirmDeleteMessage: true,
    confirmRegenerateMessage: true,
    translateLanguages: [],
    exportMenuOptions: {},
    showMessageOutline: false,
    messageNavigation: 'off',
    enableDeveloperMode: false,
  },
};

vi.mock('@/hooks/useChatSettingsStore', () => ({
  useChatSettingsStore: (selector: (state: typeof settingsState) => unknown) => selector(settingsState),
}));

vi.mock('@/hooks/useChatStore', () => ({
  useChatStore: (selector: (state: { patchTopicConfig: typeof patchTopicConfigMock }) => unknown) => selector({ patchTopicConfig: patchTopicConfigMock }),
}));

vi.mock('@/hooks/useAssistantStore', () => ({
  useAssistantStore: vi.fn(),
}));

vi.mock('./hooks/useMultiSelect', () => ({
  useMultiSelect: (...args: unknown[]) => useMultiSelectMock(...args),
}));

vi.mock('./MessageBubble', () => ({
  MessageBubble: (props: { message: Message }) => {
    messageBubbleSpy(props);
    return <div data-testid="message-bubble" data-message-id={props.message.id} data-role={props.message.role} />;
  },
}));

vi.mock('./MessageGroupView', () => ({
  MessageGroupView: (props: {
    askId: string;
    assistants: Message[];
    multiSelectMode: boolean;
    selectedIds: ReadonlySet<string>;
    onToggleSelect: (assistantMsgId: string) => void;
  }) => {
    messageGroupViewSpy(props);
    return (
      <div data-testid="mock-message-group-view" data-ask-id={props.askId}>
        {props.assistants.map((assistant) => (
          <span key={assistant.id}>{assistant.id}</span>
        ))}
      </div>
    );
  },
}));

vi.mock('./ChatInput', () => ({
  ChatInput: () => <div data-testid="chat-input" />,
}));

vi.mock('./WelcomeEmptyState', () => ({
  WelcomeEmptyState: () => <div data-testid="welcome-empty" />,
}));

vi.mock('./ContentSearch', () => ({
  ContentSearch: () => null,
}));

vi.mock('./MultiSelectToolbar', () => ({
  MultiSelectToolbar: () => <div data-testid="multi-select-toolbar" />,
}));

vi.mock('./PageContextBar', () => ({
  PageContextBar: () => null,
}));

vi.mock('./PinnedTodoPanel', () => ({
  PinnedTodoPanel: () => null,
}));

vi.mock('./PermissionModeDisplay', () => ({
  PermissionModeDisplay: () => null,
}));

/**
 * 测试辅助函数：`createTopicConversation`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createTopicConversation(messages: Message[]): ResolvedConversationContext {
  return {
    id: 'topic-1',
    title: '测试话题',
    messages,
    folderId: null,
    pinned: false,
    createdAt: 1_730_000_000_000,
    updatedAt: 1_730_000_000_000,
    assistantId: 'assistant-1',
    topicPrompt: '',
    isNameManuallyEdited: false,
    order: 1_730_000_000_000,
    systemPrompt: '',
    model: 'provider/model',
    temperature: 0.7,
    topP: 1,
    maxTokens: 4096,
    contextLength: 20,
    modelParams: {},
    mcpSelection: { mode: 'auto', manualServerIds: [] },
    enableGenerateImage: false,
    enableWebSearch: false,
  };
}

describe('ChatArea 多模型多选布局', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMultiSelectMock.mockReturnValue({
      multiSelectMode: true,
      setMultiSelectMode: vi.fn(),
      selectedIds: new Set(['assistant-1']),
      setSelectedIds: vi.fn(),
      allSelected: false,
      selectDragRef: { current: null },
      selectRect: null,
      setSelectRect: vi.fn(),
      enterMultiSelect: vi.fn(),
      exitMultiSelect: vi.fn(),
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      cleanupUnusedAttachments: vi.fn(),
      handleMultiSelectCopy: vi.fn(),
      handleMultiSelectSave: vi.fn(),
      handleMultiSelectDelete: vi.fn(),
      onMultiSelectMouseDown: vi.fn(),
    });
  });

  it('进入多选模式后仍保留消息分组，并把多选状态传给分组视图', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        askId: 'ask-1',
        role: 'user',
        content: '请同时回答',
        createdAt: 1_730_000_000_001,
        groupPrefs: {
          style: 'grid',
          foldDisplayMode: 'compact',
          foldSelectedModelId: 'assistant-1',
          gridColumns: 2,
          gridPopoverTrigger: 'hover',
        },
      },
      {
        id: 'assistant-1',
        askId: 'ask-1',
        role: 'assistant',
        modelId: 'provider/model-a',
        content: '回答 A',
        createdAt: 1_730_000_000_002,
      },
      {
        id: 'assistant-2',
        askId: 'ask-1',
        role: 'assistant',
        modelId: 'provider/model-b',
        content: '回答 B',
        createdAt: 1_730_000_000_003,
      },
    ];

    render(
      <ChatArea
        topic={createTopicConversation(messages)}
        onUpdateMessages={vi.fn()}
        onOpenPrompts={vi.fn()}
      />,
    );

    expect(screen.getByTestId('message-group')).toBeInTheDocument();
    expect(screen.getByTestId('mock-message-group-view')).toBeInTheDocument();
    expect(screen.getAllByTestId('message-bubble')).toHaveLength(1);
    expect(screen.getByTestId('message-bubble')).toHaveAttribute('data-role', 'user');
    expect(screen.queryByTestId('message-bubble')).not.toHaveAttribute('data-message-id', 'assistant-1');

    expect(messageGroupViewSpy).toHaveBeenCalled();
    const latestCall = messageGroupViewSpy.mock.calls.at(-1)?.[0];
    expect(latestCall).toMatchObject({
      askId: 'ask-1',
      multiSelectMode: true,
    });
    expect(latestCall?.assistants.map((assistant: Message) => assistant.id)).toEqual(['assistant-1', 'assistant-2']);
    expect(latestCall?.selectedIds.has('assistant-1')).toBe(true);
    expect(typeof latestCall?.onToggleSelect).toBe('function');
    expect(screen.getByTestId('multi-select-toolbar')).toBeInTheDocument();
  });

  it('消息恢复中时保留话题外壳而不退回欢迎空态', () => {
    render(
      <ChatArea
        topic={createTopicConversation([])}
        messagesLoading
        onUpdateMessages={vi.fn()}
        onOpenPrompts={vi.fn()}
      />,
    );

    expect(screen.getByTestId('chat-area-loading')).toBeInTheDocument();
    expect(screen.getAllByText('common.loading').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('welcome-empty')).not.toBeInTheDocument();
    expect(screen.queryByText('chat.selectOrCreate')).not.toBeInTheDocument();
  });

  it('会话解析中时即使还没有 topic 也只显示稳定 loading 壳子', () => {
    render(
      <ChatArea
        topic={null}
        conversationState="loading"
        onUpdateMessages={vi.fn()}
        onOpenPrompts={vi.fn()}
      />,
    );

    expect(screen.getByTestId('chat-area-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('welcome-empty')).not.toBeInTheDocument();
    expect(screen.queryByText('chat.selectOrCreate')).not.toBeInTheDocument();
  });

  it('只有会话稳定后才显示欢迎空态', () => {
    render(
      <ChatArea
        topic={createTopicConversation([])}
        conversationState="ready"
        onUpdateMessages={vi.fn()}
        onOpenPrompts={vi.fn()}
      />,
    );

    expect(screen.getByTestId('welcome-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-area-loading')).not.toBeInTheDocument();
  });
});
