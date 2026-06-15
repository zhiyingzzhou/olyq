/**
 * 说明：`TopicSidebar.export.spec` 组件模块。
 *
 * 职责：
 * - 承载 `TopicSidebar.export.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { exportToMarkdown } from '@/lib/export/export-markdown';
import { toast } from '@/hooks/useToast';
import type { Message, TopicSummary } from '@/types/chat';
import type { Assistant } from '@/types/assistant';
import { TopicSidebar } from './TopicSidebar';

const { confirmMock } = vi.hoisted(() => ({
  confirmMock: vi.fn(async () => true),
}));

const { autoRenameWithModelMock } = vi.hoisted(() => ({
  autoRenameWithModelMock: vi.fn(),
}));

const { setAutoRenameStateMock } = vi.hoisted(() => ({
  setAutoRenameStateMock: vi.fn(),
}));

const activeTopic = {
  id: 'topic-1',
  title: '测试话题',
  folderId: null,
  pinned: false,
  createdAt: 1_730_000_000_000,
  updatedAt: 1_730_000_000_100,
  assistantId: 'assistant-1',
  order: 1,
  topicPrompt: '',
  model: 'openai/gpt-5.4',
  isNameManuallyEdited: false,
} satisfies TopicSummary;

const assistants = [
  {
    id: 'assistant-1',
    scenario: 'general',
    name: '默认助手',
    prompt: 'system prompt',
    topics: [
      {
        id: 'topic-1',
        assistantId: 'assistant-1',
        name: '测试话题',
        pinned: false,
        createdAt: 1_730_000_000_000,
        updatedAt: 1_730_000_000_100,
        order: 1_730_000_000_100,
        model: 'openai/gpt-5.4',
      },
    ],
    order: 1_730_000_000_100,
    createdAt: 1_730_000_000_000,
    updatedAt: 1_730_000_000_100,
  },
] satisfies Assistant[];

const topicsWithSibling = [
  activeTopic,
  {
    ...activeTopic,
    id: 'topic-2',
    title: '另一个话题',
    order: 2,
    updatedAt: 1_730_000_000_200,
  },
] satisfies TopicSummary[];

const assistantsWithSiblingTopic = [
  {
    ...assistants[0],
    topics: [
      assistants[0].topics[0],
      {
        id: 'topic-2',
        assistantId: 'assistant-1',
        name: '另一个话题',
        pinned: false,
        createdAt: 1_730_000_000_200,
        updatedAt: 1_730_000_000_200,
        order: 1_730_000_000_200,
      },
    ],
  },
] satisfies Assistant[];

const chatStoreState: {
  activeConversationKey: string;
  activeMessages: Message[];
  activeMessagesLoading: boolean;
  autoRenameState: Record<string, never>;
} = {
  activeConversationKey: 'topic-1',
  activeMessages: [
    {
      id: 'msg-1',
      role: 'assistant',
      content: '统一导出正文',
      createdAt: 1_730_000_000_000,
    },
  ],
  activeMessagesLoading: false,
  autoRenameState: {},
};

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock('@/hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: confirmMock,
    ConfirmDialogPortal: () => null,
  }),
}));

vi.mock('@/hooks/useChatStore', () => ({
  useChatStore: <T,>(selector: (state: {
    activeConversationKey: string;
    activeMessages: Message[];
    activeMessagesLoading: boolean;
    autoRenameState: Record<string, never>;
    setAutoRenameState: typeof setAutoRenameStateMock;
  }) => T) => selector({
    activeConversationKey: 'topic-1',
    activeMessages: [
      {
        id: 'msg-1',
        role: 'assistant',
        content: '统一导出正文',
        createdAt: 1_730_000_000_000,
      },
    ],
    activeMessagesLoading: false,
    autoRenameState: {},
    setAutoRenameState: setAutoRenameStateMock,
  }),
  getBestEffortConversationMessages: vi.fn(async () => chatStoreState.activeMessages),
}));

vi.mock('@/hooks/useChatSettingsStore', () => ({
  useChatSettingsStore: Object.assign(
    <T,>(selector: (state: {
      settings: {
        defaultModel: string;
        defaultSystemPrompt: string;
        defaultTemperature: number;
        defaultTopP: number;
        defaultMaxTokens: number;
        defaultContextLength: number;
        topicNamingModel?: string;
      };
    }) => T) => selector({
      settings: {
        defaultModel: 'openai/gpt-5.4',
        defaultSystemPrompt: '默认系统提示词',
        defaultTemperature: 0.7,
        defaultTopP: 0.9,
        defaultMaxTokens: 2048,
        defaultContextLength: 10,
      },
    }),
    {
      getState: () => ({
        settings: {
          defaultModel: 'openai/gpt-5.4',
          defaultSystemPrompt: '默认系统提示词',
          defaultTemperature: 0.7,
          defaultTopP: 0.9,
          defaultMaxTokens: 2048,
          defaultContextLength: 10,
        },
      }),
    },
  ),
}));

vi.mock('@/lib/display-settings', () => ({
  loadDisplaySettings: () => ({ sidebarPosition: 'left' }),
  subscribeDisplaySettingsChange: () => () => {},
  updateDisplaySettings: vi.fn(),
}));

vi.mock('@/hooks/useToast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/lib/export/export-markdown', () => ({
  exportToMarkdown: vi.fn(async () => '# 统一 Markdown 导出'),
}));

vi.mock('@/lib/export', () => ({
  exportTopic: vi.fn(async () => {}),
}));

vi.mock('./topic-sidebar/utils', async () => {
  const actual = await vi.importActual<typeof import('./topic-sidebar/utils')>('./topic-sidebar/utils');
  return {
    ...actual,
    autoRenameWithModel: autoRenameWithModelMock,
  };
});

vi.mock('@/lib/chat/messages-db', () => ({
  getTopicMessages: vi.fn(async () => []),
}));

vi.mock('./topic-sidebar/TopicSidebarHeader', () => ({
  TopicSidebarHeader: () => <div>header</div>,
}));

vi.mock('./topic-sidebar/TopicSidebarMini', () => ({
  TopicSidebarMini: () => <div>mini</div>,
}));

vi.mock('./topic-sidebar/TopicSidebarDialogs', () => ({
  TopicSidebarDialogs: () => null,
}));

vi.mock('./topic-sidebar/TopicSidebarContent', () => ({
  TopicSidebarContent: ({
    filteredTopics,
    onAutoRename,
    onCopyMarkdown,
    onDelete,
    onDeleteSelected,
    onToggleSelected,
    selectedIds,
  }: {
    filteredTopics: TopicSummary[];
    onAutoRename: (id: string) => void;
    onCopyMarkdown: (id: string) => void;
    onDelete: (id: string) => void;
    onDeleteSelected: () => void;
    onToggleSelected: (id: string) => void;
    selectedIds: ReadonlySet<string>;
  }) => (
    <div>
      <button type="button" onClick={() => void onCopyMarkdown('topic-1')}>
        copy-markdown
      </button>
      <button type="button" onClick={() => void onAutoRename('topic-1')}>
        auto-rename
      </button>
      {filteredTopics.map((topic) => (
        <div key={topic.id}>
          <button type="button" onClick={() => void onDelete(topic.id)}>
            {`delete-topic-${topic.id}`}
          </button>
          <button type="button" onClick={() => onToggleSelected(topic.id)}>
            {`select-topic-${topic.id}`}
          </button>
        </div>
      ))}
      <button type="button" onClick={() => void onDeleteSelected()}>
        delete-selected
      </button>
      <div data-testid="selected-count">{selectedIds.size}</div>
    </div>
  ),
}));

describe('TopicSidebar export', () => {
  beforeEach(() => {
    vi.mocked(exportToMarkdown).mockClear();
    vi.mocked(toast).mockClear();
    autoRenameWithModelMock.mockReset();
    setAutoRenameStateMock.mockReset();
    confirmMock.mockClear();
    confirmMock.mockResolvedValue(true);
    chatStoreState.activeMessages = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: '统一导出正文',
        createdAt: 1_730_000_000_000,
      },
    ];
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn(async () => undefined),
      },
    });
  });

  it('复制 Markdown 会复用新的话题 Markdown 导出器', async () => {
    const exportToMarkdownMock = vi.mocked(exportToMarkdown);
    const toastMock = vi.mocked(toast);

    render(
      <TopicSidebar
        activeTab="topics"
        topics={[activeTopic]}
        assistants={assistants}
        activeAssistantId="assistant-1"
        activeTopicId="topic-1"
        onSelect={() => {}}
        onSelectAssistant={() => {}}
        onCreateTopic={() => {}}
        onCreateAssistant={() => {}}
        onDelete={() => {}}
        onDeleteAssistant={() => {}}
        onRename={() => {}}
        onUpdateTopicMeta={() => {}}
        onMoveTopicToAssistant={() => {}}
        onReorderTopics={() => {}}
        onReorderAssistants={() => {}}
        onTogglePin={() => {}}
        onClearMessages={() => {}}
        onEditAssistant={() => {}}
        onChangeTab={() => {}}
      />
    );

    fireEvent.click(screen.getByText('copy-markdown'));

    await waitFor(() => {
      expect(exportToMarkdownMock).toHaveBeenCalledTimes(1);
    });
    expect(exportToMarkdownMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'topic-1',
      title: '测试话题',
      messages: chatStoreState.activeMessages,
      model: 'openai/gpt-5.4',
    }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('# 统一 Markdown 导出');
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      description: 'sidebar.copiedMarkdown',
    }));
    expect(screen.queryByRole('menuitem', { name: 'sidebar.import' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'sidebar.export' })).not.toBeInTheDocument();
  });

  it('自动命名成功后只会写回 name，不再写 title', async () => {
    const onUpdateTopicMeta = vi.fn();
    chatStoreState.activeMessages = [
      {
        id: 'msg-user',
        role: 'user',
        content: '请帮我分析 MCP 反馈控制台页面',
        createdAt: 1_730_000_000_000,
      },
      {
        id: 'msg-assistant',
        role: 'assistant',
        content: '这里是页面分析结论',
        createdAt: 1_730_000_000_100,
      },
    ];
    autoRenameWithModelMock.mockResolvedValue('MCP反馈控制台页面分析');

    render(
      <TopicSidebar
        activeTab="topics"
        topics={[activeTopic]}
        assistants={assistants}
        activeAssistantId="assistant-1"
        activeTopicId="topic-1"
        onSelect={() => {}}
        onSelectAssistant={() => {}}
        onCreateTopic={() => {}}
        onCreateAssistant={() => {}}
        onDelete={() => {}}
        onDeleteAssistant={() => {}}
        onRename={() => {}}
        onUpdateTopicMeta={onUpdateTopicMeta}
        onMoveTopicToAssistant={() => {}}
        onReorderTopics={() => {}}
        onReorderAssistants={() => {}}
        onTogglePin={() => {}}
        onClearMessages={() => {}}
        onEditAssistant={() => {}}
        onChangeTab={() => {}}
      />
    );

    fireEvent.click(screen.getByText('auto-rename'));

    await waitFor(() => {
      expect(autoRenameWithModelMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(onUpdateTopicMeta).toHaveBeenCalledWith('topic-1', {
        name: 'MCP反馈控制台页面分析',
        isNameManuallyEdited: false,
      });
    });
    expect(onUpdateTopicMeta).not.toHaveBeenCalledWith('topic-1', expect.objectContaining({
      title: expect.any(String),
    }));
  });

  it('单条话题删除会先弹确认，取消时不会误删', async () => {
    const onDelete = vi.fn();
    confirmMock.mockResolvedValueOnce(false);

    render(
      <TopicSidebar
        activeTab="topics"
        topics={topicsWithSibling}
        assistants={assistantsWithSiblingTopic}
        activeAssistantId="assistant-1"
        activeTopicId="topic-1"
        onSelect={() => {}}
        onSelectAssistant={() => {}}
        onCreateTopic={() => {}}
        onCreateAssistant={() => {}}
        onDelete={onDelete}
        onDeleteAssistant={() => {}}
        onRename={() => {}}
        onUpdateTopicMeta={() => {}}
        onMoveTopicToAssistant={() => {}}
        onReorderTopics={() => {}}
        onReorderAssistants={() => {}}
        onTogglePin={() => {}}
        onClearMessages={() => {}}
        onEditAssistant={() => {}}
        onChangeTab={() => {}}
      />
    );

    fireEvent.click(screen.getByText('delete-topic-topic-1'));

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({
        title: 'sidebar.confirmDeleteTitle',
        description: 'sidebar.confirmDeleteDesc',
        confirmLabel: 'common.delete',
        cancelLabel: 'common.cancel',
        variant: 'destructive',
      }));
    });
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('删除最后一个话题时，会改成清空消息而不是直接拦截', async () => {
    const onDelete = vi.fn();
    const onClearMessages = vi.fn();
    const onUpdateTopicMeta = vi.fn();

    render(
      <TopicSidebar
        activeTab="topics"
        topics={[activeTopic]}
        assistants={assistants}
        activeAssistantId="assistant-1"
        activeTopicId="topic-1"
        onSelect={() => {}}
        onSelectAssistant={() => {}}
        onCreateTopic={() => {}}
        onCreateAssistant={() => {}}
        onDelete={onDelete}
        onDeleteAssistant={() => {}}
        onRename={() => {}}
        onUpdateTopicMeta={onUpdateTopicMeta}
        onMoveTopicToAssistant={() => {}}
        onReorderTopics={() => {}}
        onReorderAssistants={() => {}}
        onTogglePin={() => {}}
        onClearMessages={onClearMessages}
        onEditAssistant={() => {}}
        onChangeTab={() => {}}
      />
    );

    fireEvent.click(screen.getByText('delete-topic-topic-1'));

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({
        title: 'sidebar.confirmDeleteLastTopicTitle',
        description: 'sidebar.confirmDeleteLastTopicDesc',
        confirmLabel: 'sidebar.clearMessages',
        cancelLabel: 'common.cancel',
        variant: 'destructive',
      }));
    });
    await waitFor(() => {
      expect(onClearMessages).toHaveBeenCalledWith('topic-1');
    });
    expect(onUpdateTopicMeta).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('批量删除继续只弹一次确认，不会叠加单条确认', async () => {
    const onDelete = vi.fn();

    render(
      <TopicSidebar
        activeTab="topics"
        topics={topicsWithSibling}
        assistants={assistantsWithSiblingTopic}
        activeAssistantId="assistant-1"
        activeTopicId="topic-1"
        onSelect={() => {}}
        onSelectAssistant={() => {}}
        onCreateTopic={() => {}}
        onCreateAssistant={() => {}}
        onDelete={onDelete}
        onDeleteAssistant={() => {}}
        onRename={() => {}}
        onUpdateTopicMeta={() => {}}
        onMoveTopicToAssistant={() => {}}
        onReorderTopics={() => {}}
        onReorderAssistants={() => {}}
        onTogglePin={() => {}}
        onClearMessages={() => {}}
        onEditAssistant={() => {}}
        onChangeTab={() => {}}
      />
    );

    fireEvent.click(screen.getByText('select-topic-topic-1'));
    await waitFor(() => {
      expect(screen.getByTestId('selected-count')).toHaveTextContent('1');
    });

    fireEvent.click(screen.getByText('delete-selected'));

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledTimes(1);
    });
    expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'sidebar.confirmBatchDelete',
      description: 'sidebar.confirmBatchDeleteDesc',
      confirmLabel: 'common.delete',
      cancelLabel: 'common.cancel',
      variant: 'destructive',
    }));
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
    expect(onDelete).toHaveBeenCalledWith('topic-1');
  });

  it('批量删除覆盖到最后一个保留话题时，会删掉其它话题并清空保留话题', async () => {
    const onDelete = vi.fn();
    const onClearMessages = vi.fn();
    const onUpdateTopicMeta = vi.fn();

    render(
      <TopicSidebar
        activeTab="topics"
        topics={topicsWithSibling}
        assistants={assistantsWithSiblingTopic}
        activeAssistantId="assistant-1"
        activeTopicId="topic-1"
        onSelect={() => {}}
        onSelectAssistant={() => {}}
        onCreateTopic={() => {}}
        onCreateAssistant={() => {}}
        onDelete={onDelete}
        onDeleteAssistant={() => {}}
        onRename={() => {}}
        onUpdateTopicMeta={onUpdateTopicMeta}
        onMoveTopicToAssistant={() => {}}
        onReorderTopics={() => {}}
        onReorderAssistants={() => {}}
        onTogglePin={() => {}}
        onClearMessages={onClearMessages}
        onEditAssistant={() => {}}
        onChangeTab={() => {}}
      />
    );

    fireEvent.click(screen.getByText('select-topic-topic-1'));
    fireEvent.click(screen.getByText('select-topic-topic-2'));

    await waitFor(() => {
      expect(screen.getByTestId('selected-count')).toHaveTextContent('2');
    });

    fireEvent.click(screen.getByText('delete-selected'));

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({
        title: 'sidebar.confirmBatchDeleteKeepingLastTitle',
        description: 'sidebar.confirmBatchDeleteKeepingLastDesc',
        confirmLabel: 'common.delete',
        cancelLabel: 'common.cancel',
        variant: 'destructive',
      }));
    });
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onDelete).toHaveBeenCalledWith('topic-2');
      expect(onClearMessages).toHaveBeenCalledWith('topic-1');
      expect(onUpdateTopicMeta).not.toHaveBeenCalled();
    });
  });
});
