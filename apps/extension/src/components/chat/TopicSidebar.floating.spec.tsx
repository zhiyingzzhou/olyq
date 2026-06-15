/**
 * 说明：`TopicSidebar.floating.spec` 组件测试模块。
 *
 * 职责：
 * - 覆盖侧栏 mini rail + 覆盖式完整面板的本地交互；
 * - 确认 floating 模式的关闭行为只更新临时打开态，不触碰 display-settings；
 *
 * 边界：
 * - 本文件聚焦 `TopicSidebar` 的承载层，不覆盖真实拖拽、导出或自动命名细节。
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Assistant } from '@/types/assistant';
import type { TopicSummary } from '@/types/chat';

import { TopicSidebar } from './TopicSidebar';

const updateDisplaySettingsMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

vi.mock('@/lib/display-settings', () => ({
  loadDisplaySettings: () => ({
    sidebarPosition: 'left',
    assistantsTabSortType: 'list',
    pinTopicsToTop: false,
  }),
  subscribeDisplaySettingsChange: () => () => {},
  updateDisplaySettings: updateDisplaySettingsMock,
}));

vi.mock('@/hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(async () => true),
    ConfirmDialogPortal: () => null,
  }),
}));

vi.mock('@/lib/extension/ui-actions', () => ({
  canOpenSidepanelPageInNewTab: () => false,
}));

vi.mock('./AssistantBrowserContent', () => ({
  AssistantBrowserContent: () => <div data-testid="assistant-browser-rows" />,
}));

vi.mock('./topic-sidebar/AssistantSidebarHeader', () => ({
  AssistantSidebarHeader: () => <div data-testid="assistant-sidebar-header" />,
}));

vi.mock('./topic-sidebar/TopicSidebarDialogs', () => ({
  TopicSidebarDialogs: () => null,
}));

vi.mock('./topic-sidebar/TopicSidebarHeader', () => ({
  TopicSidebarHeader: ({
    onCreateTopic,
  }: {
    onCreateTopic: () => void;
  }) => (
    <div data-testid="topic-sidebar-header">
      <button type="button" onClick={onCreateTopic}>sidebar.newTopic</button>
    </div>
  ),
}));

vi.mock('./topic-sidebar/TopicSidebarContent', () => ({
  TopicSidebarContent: ({
    filteredTopics,
    onSelect,
  }: {
    filteredTopics: TopicSummary[];
    onSelect: (id: string) => void;
  }) => (
    <div data-testid="topic-sidebar-content">
      {filteredTopics.map((topic) => (
        <button key={topic.id} type="button" onClick={() => onSelect(topic.id)}>
          {topic.title}
        </button>
      ))}
    </div>
  ),
}));

const topics = [
  {
    id: 'topic-1',
    title: '窄屏话题',
    folderId: null,
    pinned: false,
    createdAt: 1,
    updatedAt: 1,
    assistantId: 'assistant-1',
    order: 1,
    topicPrompt: '',
    isNameManuallyEdited: false,
  },
] satisfies TopicSummary[];

const assistants = [
  {
    id: 'assistant-1',
    scenario: 'general',
    name: '默认助手',
    prompt: 'prompt',
    topics: [],
    order: 1,
    createdAt: 1,
    updatedAt: 1,
  },
] satisfies Assistant[];

/**
 * 渲染处于 floating 承载模式下的话题侧栏。
 *
 * @remarks
 * 默认让 mini rail 与覆盖式完整面板同时出现，单个用例可以通过 overrides 切换打开态或回调。
 */
function renderFloatingSidebar(overrides: Partial<ComponentProps<typeof TopicSidebar>> = {}) {
  const props = {
    activeTab: 'topics' as const,
    topics,
    assistants,
    activeAssistantId: 'assistant-1',
    activeTopicId: 'topic-1',
    collapsed: true,
    presentation: 'floating' as const,
    floatingOpen: true,
    onFloatingOpenChange: vi.fn(),
    onSelect: vi.fn(),
    onSelectAssistant: vi.fn(),
    onCreateTopic: vi.fn(),
    onCreateAssistant: vi.fn(),
    onDelete: vi.fn(),
    onDeleteAssistant: vi.fn(),
    onRename: vi.fn(),
    onUpdateTopicMeta: vi.fn(),
    onMoveTopicToAssistant: vi.fn(),
    onReorderTopics: vi.fn(),
    onReorderAssistants: vi.fn(),
    onTogglePin: vi.fn(),
    onClearMessages: vi.fn(),
    onEditAssistant: vi.fn(),
    onChangeTab: vi.fn(),
    onToggleCollapse: vi.fn(),
    ...overrides,
  };

  render(<TopicSidebar {...props} />);
  return props;
}

describe('TopicSidebar floating presentation', () => {
  beforeEach(() => {
    updateDisplaySettingsMock.mockClear();
  });

  it('mini rail 展开只触发临时打开入口，不写持久化设置', () => {
    const props = renderFloatingSidebar({ floatingOpen: false });

    expect(screen.getByTestId('topic-sidebar-mini-rail')).toBeInTheDocument();
    expect(screen.queryByTestId('topic-sidebar-floating-layer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('topic-sidebar-rail-expand'));

    expect(props.onToggleCollapse).toHaveBeenCalledTimes(1);
    expect(props.onFloatingOpenChange).not.toHaveBeenCalled();
    expect(updateDisplaySettingsMock).not.toHaveBeenCalled();
  });

  it('floating 打开后用覆盖式完整面板承载侧栏，不写持久化设置', () => {
    const props = renderFloatingSidebar();

    expect(screen.getByTestId('topic-sidebar-mini-rail')).toBeInTheDocument();
    expect(screen.getByTestId('topic-sidebar-floating-layer')).toBeInTheDocument();
    expect(screen.getByTestId('topic-sidebar-floating-panel')).toHaveAttribute('data-sidebar-presentation', 'floating');
    expect(screen.getByTestId('topic-sidebar-mini-rail').className).not.toContain('glass-');
    expect(screen.getByTestId('topic-sidebar-floating-panel').className).not.toContain('glass-');

    fireEvent.click(screen.getByRole('button', { name: 'assistant.tab' }));

    expect(props.onChangeTab).toHaveBeenCalledWith('assistants');
    expect(props.onFloatingOpenChange).not.toHaveBeenCalled();
    expect(updateDisplaySettingsMock).not.toHaveBeenCalled();
  });

  it('Esc、遮罩和头部收起按钮都只关闭 floating 面板', () => {
    const props = renderFloatingSidebar();

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('topic-sidebar-floating-backdrop'));
    fireEvent.click(screen.getByRole('button', { name: 'sidebar.collapse' }));

    expect(props.onFloatingOpenChange).toHaveBeenCalledTimes(3);
    expect(props.onFloatingOpenChange).toHaveBeenCalledWith(false);
    expect(updateDisplaySettingsMock).not.toHaveBeenCalled();
  });

  it('选择话题或新建话题后关闭 floating 面板，把空间还给聊天区', () => {
    const props = renderFloatingSidebar();

    fireEvent.click(within(screen.getByTestId('topic-sidebar-content')).getByRole('button', { name: '窄屏话题' }));
    fireEvent.click(within(screen.getByTestId('topic-sidebar-header')).getByRole('button', { name: 'sidebar.newTopic' }));

    expect(props.onSelect).toHaveBeenCalledWith('topic-1');
    expect(props.onCreateTopic).toHaveBeenCalledTimes(1);
    expect(props.onFloatingOpenChange).toHaveBeenCalledTimes(2);
    expect(props.onFloatingOpenChange).toHaveBeenCalledWith(false);
  });
});
