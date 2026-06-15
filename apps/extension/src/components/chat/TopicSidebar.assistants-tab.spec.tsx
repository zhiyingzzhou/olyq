/**
 * 说明：`TopicSidebar.assistants-tab.spec` 组件模块。
 *
 * 职责：
 * - 承载 `TopicSidebar.assistants-tab.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Assistant } from '@/types/assistant';
import type { TopicSummary } from '@/types/chat';

import { TopicSidebar } from './TopicSidebar';

const { confirmMock } = vi.hoisted(() => ({
  confirmMock: vi.fn(async () => true),
}));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock('@tanstack/react-virtual', () => ({
  defaultRangeExtractor: ({
    startIndex,
    endIndex,
  }: {
    startIndex: number;
    endIndex: number;
  }) => Array.from({ length: Math.max(0, endIndex - startIndex + 1) }, (_, offset) => startIndex + offset),
  useVirtualizer: ({
    count,
    estimateSize,
    getItemKey,
  }: {
    count: number;
    estimateSize?: number | ((index: number) => number);
    getItemKey?: (index: number) => string | number;
  }) => {
    /** 为测试用虚拟列表返回稳定的单行高度。 */
    const resolveSize = (index: number) => {
      if (typeof estimateSize === 'function') return estimateSize(index);
      if (typeof estimateSize === 'number') return estimateSize;
      return 62;
    };

    let total = 0;
    const starts = Array.from({ length: count }, (_, index) => {
      const start = total;
      total += resolveSize(index);
      return start;
    });

    return {
      getTotalSize: () => total,
      getVirtualItems: () => Array.from({ length: count }, (_, index) => ({
        index,
        key: getItemKey?.(index) ?? `row-${index}`,
        start: starts[index] ?? 0,
      })),
      measure: () => undefined,
      measureElement: () => undefined,
      scrollToIndex: vi.fn(),
    };
  },
}));

vi.mock('@/hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: confirmMock,
    ConfirmDialogPortal: () => null,
  }),
}));

vi.mock('@/hooks/useChatStore', () => ({
  useChatStore: <T,>(selector: (state: {
    autoRenameState: Record<string, never>;
  }) => T) => selector({
    autoRenameState: {},
  }),
  getBestEffortConversationMessages: vi.fn(async () => []),
}));

vi.mock('@/hooks/useChatSettingsStore', () => ({
  useChatSettingsStore: Object.assign(
    <T,>(selector: (state: {
      settings: {
        defaultModel: string;
        topicNamingModel?: string;
      };
    }) => T) => selector({
      settings: {
        defaultModel: 'openai/gpt-5.4',
      },
    }),
    {
      getState: () => ({
        settings: {
          defaultModel: 'openai/gpt-5.4',
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

vi.mock('./topic-sidebar/TopicSidebarMini', () => ({
  TopicSidebarMini: () => null,
}));

vi.mock('./topic-sidebar/TopicSidebarDialogs', () => ({
  TopicSidebarDialogs: () => null,
}));

vi.mock('./topic-sidebar/TopicSidebarContent', () => ({
  TopicSidebarContent: () => null,
}));

const assistants = [
  {
    id: 'assistant-1',
    scenario: 'general',
    name: '写作助手',
    description: '负责文章创作',
    iconId: 'file-pen',
    prompt: 'writer',
    tags: ['写作'],
    topics: [
      {
        id: 'topic-1',
        assistantId: 'assistant-1',
        name: '选题讨论',
        pinned: false,
        createdAt: 1_730_000_000_000,
        updatedAt: 1_730_000_000_100,
        order: 1_730_000_000_100,
        isNameManuallyEdited: false,
      },
    ],
    order: 1_730_000_000_100,
    createdAt: 1_730_000_000_000,
    updatedAt: 1_730_000_000_100,
  },
  {
    id: 'assistant-2',
    scenario: 'general',
    name: '代码助手',
    description: '负责代码分析',
    iconId: 'code-2',
    prompt: 'coder',
    tags: ['开发'],
    topics: [
      {
        id: 'topic-2',
        assistantId: 'assistant-2',
        name: '重构方案',
        pinned: false,
        createdAt: 1_730_000_000_200,
        updatedAt: 1_730_000_000_300,
        order: 1_730_000_000_300,
        isNameManuallyEdited: false,
      },
    ],
    order: 1_730_000_000_300,
    createdAt: 1_730_000_000_200,
    updatedAt: 1_730_000_000_300,
  },
] satisfies Assistant[];

const topics = [
  {
    id: 'topic-1',
    title: '选题讨论',
    folderId: null,
    pinned: false,
    createdAt: 1_730_000_000_000,
    updatedAt: 1_730_000_000_100,
    assistantId: 'assistant-1',
    order: 1_730_000_000_100,
    topicPrompt: '',
    isNameManuallyEdited: false,
  },
] satisfies TopicSummary[];

describe('TopicSidebar assistants tab', () => {
  beforeEach(() => {
    confirmMock.mockClear();
    confirmMock.mockResolvedValue(true);
  });

  it('只展示助手实例列表，并把新建助手动作留在单独入口', () => {
    const onCreateAssistant = vi.fn();
    const onSelectAssistant = vi.fn();
    const onEditAssistant = vi.fn();
    const onDeleteAssistant = vi.fn();
    const onChangeTab = vi.fn();

    const { container } = render(
      <TopicSidebar
        activeTab="assistants"
        topics={topics}
        assistants={assistants}
        activeAssistantId="assistant-1"
        activeTopicId="topic-1"
        onSelect={() => {}}
        onSelectAssistant={onSelectAssistant}
        onCreateTopic={() => {}}
        onCreateAssistant={onCreateAssistant}
        onDelete={() => {}}
        onDeleteAssistant={onDeleteAssistant}
        onRename={() => {}}
        onUpdateTopicMeta={() => {}}
        onMoveTopicToAssistant={() => {}}
        onReorderTopics={() => {}}
        onReorderAssistants={() => {}}
        onTogglePin={() => {}}
        onClearMessages={() => {}}
        onEditAssistant={onEditAssistant}
        onChangeTab={onChangeTab}
      />,
    );

    expect(screen.getByText('写作助手')).toBeInTheDocument();
    expect(screen.getByText('代码助手')).toBeInTheDocument();
    expect(screen.getByText('assistant.selectDesc')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'assistant.createNew' }));
    expect(onCreateAssistant).toHaveBeenCalledTimes(1);

    const assistantButton = screen.getByRole('button', { name: /代码助手/ });
    expect(assistantButton.closest('[draggable="true"]')).toBeNull();
    const nativeDraggableHandles = Array.from(container.querySelectorAll('button[draggable="true"]'));
    expect(nativeDraggableHandles).toHaveLength(0);
    expect(screen.getByTestId('assistant-drag-handle-assistant-1')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-drag-handle-assistant-2')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'common.edit' })[0]);
    expect(onEditAssistant).toHaveBeenCalledTimes(1);
    expect(onEditAssistant).toHaveBeenCalledWith(expect.objectContaining({ id: 'assistant-1' }));
    expect(onSelectAssistant).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: 'common.delete' })[1]);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'assistant.deleteConfirmTitle',
      description: 'assistant.deleteConfirmDesc',
      confirmLabel: 'common.delete',
      cancelLabel: 'common.cancel',
      variant: 'destructive',
    }));
    expect(onSelectAssistant).not.toHaveBeenCalled();

    fireEvent.click(assistantButton);
    expect(onSelectAssistant).toHaveBeenCalledTimes(1);
    expect(onSelectAssistant).toHaveBeenCalledWith(expect.objectContaining({ id: 'assistant-2' }));
    expect(onChangeTab).not.toHaveBeenCalled();
    expect(screen.queryByRole('menuitem', { name: 'sidebar.import' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'sidebar.export' })).not.toBeInTheDocument();
  });

  it('只有确认后才真正删除助手', async () => {
    const onDeleteAssistant = vi.fn();

    render(
      <TopicSidebar
        activeTab="assistants"
        topics={topics}
        assistants={assistants}
        activeAssistantId="assistant-1"
        activeTopicId="topic-1"
        onSelect={() => {}}
        onSelectAssistant={() => {}}
        onCreateTopic={() => {}}
        onCreateAssistant={() => {}}
        onDelete={() => {}}
        onDeleteAssistant={onDeleteAssistant}
        onRename={() => {}}
        onUpdateTopicMeta={() => {}}
        onMoveTopicToAssistant={() => {}}
        onReorderTopics={() => {}}
        onReorderAssistants={() => {}}
        onTogglePin={() => {}}
        onClearMessages={() => {}}
        onEditAssistant={() => {}}
        onChangeTab={() => {}}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'common.delete' })[1]);

    await waitFor(() => {
      expect(onDeleteAssistant).toHaveBeenCalledTimes(1);
    });
    expect(onDeleteAssistant).toHaveBeenCalledWith('assistant-2');
  });
});
