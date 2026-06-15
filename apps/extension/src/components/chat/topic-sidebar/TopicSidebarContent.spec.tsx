/**
 * 说明：`TopicSidebarContent.spec` 组件模块。
 *
 * 职责：
 * - 覆盖话题侧栏虚拟列表窗口约束；
 * - 确认 1000+ 话题时只渲染可视窗口内的行，且可见项交互仍然有效。
 *
 * 边界：
 * - 本文件不覆盖真实拖拽、重命名或批量管理的细节行为；
 * - 子项渲染改用轻量测试桩，只验证父层 row model 与虚拟窗口装配。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Assistant } from '@/types/assistant';
import type { TopicSummary } from '@/types/chat';

import { TopicSidebarContent } from './TopicSidebarContent';

const { virtualWindowRef } = vi.hoisted(() => ({
  virtualWindowRef: {
    current: null as null | { startIndex: number; endIndex: number },
  },
}));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => {
        const messages: Record<string, string> = {
          'sidebar.pinned': '置顶',
          'sidebar.emptyTopics': '暂无话题',
        };
        return messages[key] ?? key;
      },
    }),
  };
});

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    estimateSize,
    getItemKey,
  }: {
    count: number;
    estimateSize?: number | ((index: number) => number);
    getItemKey?: (index: number) => string | number;
  }) => {
    /** 为测试里的虚拟话题行返回稳定估算高度。 */
    const resolveSize = (index: number) => {
      if (typeof estimateSize === 'function') return estimateSize(index);
      if (typeof estimateSize === 'number') return estimateSize;
      return 48;
    };

    let total = 0;
    const starts = Array.from({ length: count }, (_, index) => {
      const start = total;
      total += resolveSize(index);
      return start;
    });
    const windowRange = virtualWindowRef.current;
    const startIndex = count < 1 ? 0 : Math.max(0, Math.min(windowRange?.startIndex ?? 0, count - 1));
    const endIndex = count < 1
      ? -1
      : Math.max(startIndex, Math.min(windowRange?.endIndex ?? count - 1, count - 1));

    return {
      getTotalSize: () => total,
      getVirtualItems: () => (
        count < 1 || endIndex < startIndex
          ? []
          : Array.from({ length: endIndex - startIndex + 1 }, (_, offset) => {
              const index = startIndex + offset;
              return {
                index,
                key: getItemKey?.(index) ?? `row-${index}`,
                start: starts[index] ?? 0,
              };
            })
      ),
      measure: () => undefined,
      measureElement: () => undefined,
      scrollToIndex: vi.fn(),
    };
  },
}));

vi.mock('./TopicSidebarTopicItem', () => ({
  TopicSidebarTopicItem: ({
    topic,
    onSelect,
  }: {
    topic: TopicSummary;
    onSelect: (id: string) => void;
  }) => (
    <button
      type="button"
      data-testid={`topic-row-${topic.id}`}
      onClick={() => onSelect(topic.id)}
    >
      {topic.title}
    </button>
  ),
}));

vi.mock('./TopicSidebarManageFooter', () => ({
  TopicSidebarManageFooter: () => <div data-testid="topic-manage-footer" />,
}));

/** 构造满足侧栏渲染需求的最小话题摘要。 */
function makeTopic(index: number): TopicSummary {
  return {
    id: `topic-${index}`,
    title: `虚拟话题 ${index}`,
    folderId: null,
    pinned: false,
    createdAt: index,
    updatedAt: index,
    assistantId: 'assistant-1',
    order: index,
    topicPrompt: '',
    browserContextMode: undefined,
    isNameManuallyEdited: false,
  };
}

/** 构造最小助手集合，供侧栏 Move / Select 依赖使用。 */
function createAssistants(): Assistant[] {
  return [{
    id: 'assistant-1',
    scenario: 'general',
    name: '默认助手',
    description: 'desc',
    prompt: 'prompt',
    topics: [],
    order: 1,
    createdAt: 1,
    updatedAt: 1,
  }];
}

/** 生成 `TopicSidebarContent` 的默认测试入参。 */
function createProps(topics: TopicSummary[], onSelect = vi.fn()) {
  return {
    activeAssistantId: 'assistant-1',
    activeTopicId: null,
    assistants: createAssistants(),
    autoRenameState: {},
    canDragSort: true,
    dragOverId: null,
    dragState: null,
    filteredTopics: topics,
    manageMode: false,
    manageSearchMode: false,
    manageSearchText: '',
    renameText: '',
    renamingAutoId: null,
    renamingId: null,
    selectableIds: [],
    selectedIds: new Set<string>(),
    sidebarPosition: 'left' as const,
    topicNormal: topics,
    topicPinned: [],
    onAutoRename: vi.fn(),
    onChangeManageSearchText: vi.fn(),
    onChangeRenameText: vi.fn(),
    onClearSelection: vi.fn(),
    onCloseManageMode: vi.fn(),
    onCloseSearchMode: vi.fn(),
    onCopyMarkdown: vi.fn(),
    onDelete: vi.fn(),
    onDeleteSelected: vi.fn(),
    onExport: vi.fn(),
    onFinishRename: vi.fn(),
    onMoveSelectedToAssistant: vi.fn(),
    onMoveToAssistant: vi.fn(),
    onOpenPromptEditor: vi.fn(),
    onOpenSearchMode: vi.fn(),
    onRequestClearMessages: vi.fn(),
    onSelect,
    onSetDragOverId: vi.fn(),
    onSetDragState: vi.fn(),
    onShowRenameError: vi.fn(),
    onStartRename: vi.fn(),
    onTogglePin: vi.fn(),
    onToggleSelectAll: vi.fn(),
    onToggleSelected: vi.fn(),
    onTopicReorder: vi.fn(),
    onToggleSidebarPosition: vi.fn(),
  };
}

describe('TopicSidebarContent', () => {
  beforeEach(() => {
    virtualWindowRef.current = null;
  });

  it('1000+ 话题时只渲染虚拟窗口内的行，并保留可见项交互', () => {
    virtualWindowRef.current = { startIndex: 0, endIndex: 7 };
    const topics = Array.from({ length: 1200 }, (_, index) => makeTopic(index));
    const onSelect = vi.fn();

    render(<TopicSidebarContent {...createProps(topics, onSelect)} />);

    expect(screen.getAllByTestId(/topic-row-topic-/)).toHaveLength(8);
    expect(screen.queryByText('虚拟话题 20')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('虚拟话题 0'));
    expect(onSelect).toHaveBeenCalledWith('topic-0');
  });
});
