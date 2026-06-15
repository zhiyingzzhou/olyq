/**
 * 说明：`useTopicSidebarController` Hook 模块。
 *
 * 职责：
 * - 维护话题侧边栏的本地 UI 状态与派生列表；
 * - 把动作编排委托给 `useTopicSidebarActions`，让控制层只负责数据装配；
 * - 统一输出 `TopicSidebar` 视图层所需的状态与回调。
 *
 * 边界：
 * - 本模块不直接渲染 JSX；
 * - 它不接管 store 持久化，只聚合当前组件树里的状态。
 */
import { useEffect, useMemo, useState } from 'react';

import type { Assistant } from '@/types/assistant';
import type { TopicSummary } from '@/types/chat';
import type { UseConfirmDialogResult } from '@/hooks/useConfirmDialog';
import { useChatStore } from '@/hooks/useChatStore';
import { loadDisplaySettings, subscribeDisplaySettingsChange } from '@/lib/display-settings';

import type {
  AssistantsTabSortType,
  SidebarPosition,
  TopicSidebarDragState,
  TopicSidebarProps,
} from './types';
import { useTopicSidebarActions } from './useTopicSidebarActions';

interface UseTopicSidebarControllerOptions {
  readonly topics: TopicSummary[];
  readonly assistants: Assistant[];
  readonly activeAssistantId: string | null;
  readonly activeTopicId: string | null;
  readonly onDelete: TopicSidebarProps['onDelete'];
  readonly onDeleteAssistant: TopicSidebarProps['onDeleteAssistant'];
  readonly onRename: TopicSidebarProps['onRename'];
  readonly onUpdateTopicMeta: TopicSidebarProps['onUpdateTopicMeta'];
  readonly onMoveTopicToAssistant: TopicSidebarProps['onMoveTopicToAssistant'];
  readonly onReorderTopics: TopicSidebarProps['onReorderTopics'];
  readonly onClearMessages: TopicSidebarProps['onClearMessages'];
  readonly confirm: UseConfirmDialogResult['confirm'];
}

interface TopicSidebarControllerResult extends ReturnType<typeof useTopicSidebarActions> {
  readonly autoRenameState: Record<string, { loading?: boolean; error?: string } | undefined>;
  readonly assistantsTabSortType: AssistantsTabSortType;
  readonly canDragSort: boolean;
  readonly dragOverId: string | null;
  readonly dragState: TopicSidebarDragState | null;
  readonly filteredTopics: TopicSummary[];
  readonly manageMode: boolean;
  readonly manageSearchMode: boolean;
  readonly manageSearchText: string;
  readonly promptDialogOpen: boolean;
  readonly promptText: string;
  readonly renameError: string | null;
  readonly renameText: string;
  readonly renamingAutoId: string | null;
  readonly renamingId: string | null;
  readonly search: string;
  readonly selectableIds: string[];
  readonly selectedIds: Set<string>;
  readonly setDragOverId: (value: string | null) => void;
  readonly setDragState: (value: TopicSidebarDragState | null) => void;
  readonly setManageSearchText: (value: string) => void;
  readonly setPromptDialogOpen: (value: boolean) => void;
  readonly setPromptText: (value: string) => void;
  readonly setRenameError: (value: string | null) => void;
  readonly setRenameText: (value: string) => void;
  readonly setSearch: (value: string) => void;
  readonly sidebarPosition: SidebarPosition;
  readonly topicNormal: TopicSummary[];
  readonly topicPinned: TopicSummary[];
}

/**
 * 组装 `TopicSidebar` 的状态、派生值和动作。
 *
 * @param options - 侧边栏当前数据与上层回调。
 * @returns 供 `TopicSidebar` 直接消费的控制器对象。
 */
export function useTopicSidebarController({
  topics,
  assistants,
  activeAssistantId,
  activeTopicId,
  onDelete,
  onDeleteAssistant,
  onRename,
  onUpdateTopicMeta,
  onMoveTopicToAssistant,
  onReorderTopics,
  onClearMessages,
  confirm,
}: UseTopicSidebarControllerOptions): TopicSidebarControllerResult {
  const autoRenameState = useChatStore((state) => state.autoRenameState);
  const [search, setSearch] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [manageMode, setManageMode] = useState(false);
  const [manageSearchMode, setManageSearchMode] = useState(false);
  const [manageSearchText, setManageSearchText] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [dragState, setDragState] = useState<TopicSidebarDragState | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [promptEditingId, setPromptEditingId] = useState<string | null>(null);
  const [promptText, setPromptText] = useState('');
  const [renamingAutoId, setRenamingAutoId] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [sidebarPosition, setSidebarPosition] = useState<SidebarPosition>(() => loadDisplaySettings().sidebarPosition);
  const [assistantsTabSortType, setAssistantsTabSortType] = useState<AssistantsTabSortType>(
    () => loadDisplaySettings().assistantsTabSortType ?? 'list',
  );
  const [pinTopicsToTop, setPinTopicsToTop] = useState<boolean>(() => loadDisplaySettings().pinTopicsToTop ?? false);

  useEffect(() => {
    return subscribeDisplaySettingsChange(() => {
      const settings = loadDisplaySettings();
      setSidebarPosition(settings.sidebarPosition);
      setAssistantsTabSortType(settings.assistantsTabSortType ?? 'list');
      setPinTopicsToTop(settings.pinTopicsToTop ?? false);
    });
  }, []);

  const topicSearchIndex = useMemo(
    () => new Map(topics.map((topic) => [topic.id, topic.title.toLowerCase()])),
    [topics],
  );
  const orderedTopics = useMemo(
    () => (pinTopicsToTop
      ? [...topics.filter((topic) => topic.pinned), ...topics.filter((topic) => !topic.pinned)]
      : [...topics]),
    [pinTopicsToTop, topics],
  );
  const filteredTopics = useMemo(() => {
    const keyword = (manageMode && manageSearchMode ? manageSearchText : search).trim().toLowerCase();
    if (!keyword) return orderedTopics;
    return orderedTopics.filter((topic) => topicSearchIndex.get(topic.id)?.includes(keyword));
  }, [manageMode, manageSearchMode, manageSearchText, orderedTopics, search, topicSearchIndex]);
  const topicPinned = useMemo(
    () => (pinTopicsToTop ? filteredTopics.filter((topic) => topic.pinned) : []),
    [filteredTopics, pinTopicsToTop],
  );
  const topicNormal = useMemo(
    () => (pinTopicsToTop ? filteredTopics.filter((topic) => !topic.pinned) : filteredTopics),
    [filteredTopics, pinTopicsToTop],
  );
  const selectableIds = useMemo(
    () => filteredTopics.filter((topic) => !topic.pinned).map((topic) => topic.id),
    [filteredTopics],
  );
  const canDragSort = !manageMode && !search.trim();

  const actions = useTopicSidebarActions({
    topics,
    assistants,
    activeAssistantId,
    activeTopicId,
    confirm,
    onDelete,
    onDeleteAssistant,
    onRename,
    onUpdateTopicMeta,
    onMoveTopicToAssistant,
    onReorderTopics,
    onClearMessages,
    topicNormal,
    topicPinned,
    selectableIds,
    selectedIds,
    renamingId,
    renameText,
    promptEditingId,
    promptText,
    renamingAutoId,
    sidebarPosition,
    setRenamingId,
    setRenameText,
    setManageMode,
    setManageSearchMode,
    setManageSearchText,
    setSelectedIds,
    setDragState,
    setDragOverId,
    setPromptDialogOpen,
    setPromptEditingId,
    setPromptText,
    setRenamingAutoId,
    setAssistantsTabSortType,
  });

  return {
    autoRenameState,
    assistantsTabSortType,
    canDragSort,
    dragOverId,
    dragState,
    filteredTopics,
    manageMode,
    manageSearchMode,
    manageSearchText,
    promptDialogOpen,
    promptText,
    renameError,
    renameText,
    renamingAutoId,
    renamingId,
    search,
    selectableIds,
    selectedIds,
    setDragOverId,
    setDragState,
    setManageSearchText,
    setPromptDialogOpen,
    setPromptText,
    setRenameError,
    setRenameText,
    setSearch,
    sidebarPosition,
    topicNormal,
    topicPinned,
    ...actions,
  };
}
