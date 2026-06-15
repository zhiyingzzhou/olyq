/**
 * 说明：`useTopicSidebarActions` Hook 模块。
 *
 * 职责：
 * - 收口话题侧边栏里的异步动作、删除确认、导出与自动命名逻辑；
 * - 把与 store、剪贴板、显示设置和确认弹窗交互的副作用集中到一处；
 * - 避免 `useTopicSidebarController` 再次膨胀成热点长文件。
 *
 * 边界：
 * - 本模块不创建 JSX；
 * - 它只消费上层已建好的 UI 状态与 setter，不新增第二套真源。
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { Assistant } from '@/types/assistant';
import type { ResolvedConversationContext, TopicSummary } from '@/types/chat';
import type { UseConfirmDialogResult } from '@/hooks/useConfirmDialog';
import { toast } from '@/hooks/useToast';
import { getBestEffortConversationMessages, useChatStore } from '@/hooks/useChatStore';
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore';
import { exportTopic } from '@/lib/export';
import { exportToMarkdown } from '@/lib/export/export-markdown';
import { toAutoRenameErrorText } from '@/lib/chat/auto-rename';
import { buildResolvedConversationContext } from '@/lib/chat/resolved-conversation';
import { updateDisplaySettings } from '@/lib/display-settings';
import { formatI18nText } from '@/lib/i18n/format';

import type { AssistantsTabSortType, SidebarPosition, TopicGroup, TopicSidebarDragState, TopicSidebarProps } from './types';
import { autoRenameWithModel, buildTopicBatchDeletePlan } from './utils';

interface UseTopicSidebarActionsOptions {
  readonly topics: TopicSummary[];
  readonly assistants: Assistant[];
  readonly activeAssistantId: string | null;
  readonly activeTopicId: string | null;
  readonly confirm: UseConfirmDialogResult['confirm'];
  readonly onDelete: TopicSidebarProps['onDelete'];
  readonly onDeleteAssistant: TopicSidebarProps['onDeleteAssistant'];
  readonly onRename: TopicSidebarProps['onRename'];
  readonly onUpdateTopicMeta: TopicSidebarProps['onUpdateTopicMeta'];
  readonly onMoveTopicToAssistant: TopicSidebarProps['onMoveTopicToAssistant'];
  readonly onReorderTopics: TopicSidebarProps['onReorderTopics'];
  readonly onClearMessages: TopicSidebarProps['onClearMessages'];
  readonly topicNormal: TopicSummary[];
  readonly topicPinned: TopicSummary[];
  readonly selectableIds: string[];
  readonly selectedIds: Set<string>;
  readonly renamingId: string | null;
  readonly renameText: string;
  readonly promptEditingId: string | null;
  readonly promptText: string;
  readonly renamingAutoId: string | null;
  readonly sidebarPosition: SidebarPosition;
  readonly setRenamingId: (value: string | null) => void;
  readonly setRenameText: (value: string) => void;
  readonly setManageMode: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setManageSearchMode: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setManageSearchText: (value: string) => void;
  readonly setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  readonly setDragState: (value: TopicSidebarDragState | null) => void;
  readonly setDragOverId: (value: string | null) => void;
  readonly setPromptDialogOpen: (value: boolean) => void;
  readonly setPromptEditingId: (value: string | null) => void;
  readonly setPromptText: (value: string) => void;
  readonly setRenamingAutoId: (value: string | null) => void;
  readonly setAssistantsTabSortType: (value: AssistantsTabSortType) => void;
}

interface TopicSidebarActionsResult {
  readonly clearSelection: () => void;
  readonly closeManageMode: () => void;
  readonly closeSearchMode: () => void;
  readonly deleteSelectedTopics: () => Promise<void>;
  readonly finishRename: () => void;
  readonly handleAutoRename: (id: string) => Promise<void>;
  readonly handleChangeAssistantsTabSortType: (sortType: AssistantsTabSortType) => void;
  readonly handleCopyMarkdown: (id: string) => Promise<void>;
  readonly handleExportConversation: (id: string, format: 'markdown' | 'html' | 'word') => Promise<void>;
  readonly handleRequestClearMessages: (id: string) => Promise<void>;
  readonly handleTopicReorder: (sourceId: string, targetId: string, group: TopicGroup) => void;
  readonly handleToggleSidebarPosition: () => void;
  readonly moveSelectedTopics: (assistantId: string) => void;
  readonly openPromptEditor: (id: string) => void;
  readonly openSearchMode: () => void;
  readonly requestAssistantDelete: (assistantId: string) => Promise<void>;
  readonly requestTopicDelete: (id: string, options?: { pinned?: boolean }) => Promise<void>;
  readonly savePrompt: () => void;
  readonly startRename: (topic: { id: string; title: string }) => void;
  readonly toggleManageMode: () => void;
  readonly toggleSelected: (id: string) => void;
  readonly toggleSelectAll: () => void;
}

/**
 * 收口 `TopicSidebar` 的副作用动作与确认链路。
 *
 * @param options - 当前侧边栏的状态快照、setter 和上层回调。
 * @returns 供控制器层复用的动作集合。
 */
export function useTopicSidebarActions({
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
}: UseTopicSidebarActionsOptions): TopicSidebarActionsResult {
  const { t } = useTranslation();
  const setAutoRenameState = useChatStore((state) => state.setAutoRenameState);
  const defaultModel = useChatSettingsStore((state) => state.settings.defaultModel);
  const topicNamingModel = useChatSettingsStore((state) => state.settings.topicNamingModel ?? state.settings.defaultModel);

  /** 开始手动重命名。 */
  const startRename = useCallback((topic: { id: string; title: string }) => {
    setRenamingId(topic.id);
    setRenameText(topic.title);
  }, [setRenameText, setRenamingId]);

  /** 提交手动重命名。 */
  const finishRename = useCallback(() => {
    if (renamingId && renameText.trim()) onRename(renamingId, renameText.trim());
    setRenamingId(null);
  }, [onRename, renameText, renamingId, setRenamingId]);

  /** 关闭管理模式并重置其衍生状态。 */
  const closeManageMode = useCallback(() => {
    setManageMode(false);
    setManageSearchMode(false);
    setManageSearchText('');
    setSelectedIds(new Set());
  }, [setManageMode, setManageSearchMode, setManageSearchText, setSelectedIds]);

  /** 切换管理模式。 */
  const toggleManageMode = useCallback(() => {
    setManageMode((current) => {
      if (current) {
        setManageSearchMode(false);
        setManageSearchText('');
        setSelectedIds(new Set());
      }
      return !current;
    });
  }, [setManageMode, setManageSearchMode, setManageSearchText, setSelectedIds]);

  /** 打开管理模式搜索。 */
  const openSearchMode = useCallback(() => {
    setManageSearchMode(true);
  }, [setManageSearchMode]);

  /** 关闭管理模式搜索并清空关键字。 */
  const closeSearchMode = useCallback(() => {
    setManageSearchMode(false);
    setManageSearchText('');
  }, [setManageSearchMode, setManageSearchText]);

  /** 切换单条选中状态。 */
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [setSelectedIds]);

  /** 切换全选状态。 */
  const toggleSelectAll = useCallback(() => {
    const shouldClear = selectedIds.size > 0 && selectedIds.size === selectableIds.length;
    setSelectedIds(new Set(shouldClear ? [] : selectableIds));
  }, [selectableIds, selectedIds, setSelectedIds]);

  /** 清空当前选中集合。 */
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, [setSelectedIds]);

  /** 执行无确认删除。 */
  const executeTopicDelete = useCallback((id: string, options?: { pinned?: boolean }) => {
    const key = String(id || '').trim();
    if (!key || options?.pinned) return false;
    onDelete(key);
    return true;
  }, [onDelete]);

  /** 确认最后一个话题删除时的“清空消息保壳”降级。 */
  const confirmKeepLastTopicByClearing = useCallback(async (options?: { batchCount?: number }) => {
    const batchCount = typeof options?.batchCount === 'number' ? Math.max(0, Math.floor(options.batchCount)) : 0;
    const isBatch = batchCount > 1;
    return await confirm({
      title: isBatch
        ? t('sidebar.confirmBatchDeleteKeepingLastTitle', { count: batchCount })
        : t('sidebar.confirmDeleteLastTopicTitle'),
      description: isBatch
        ? t('sidebar.confirmBatchDeleteKeepingLastDesc')
        : t('sidebar.confirmDeleteLastTopicDesc'),
      confirmLabel: isBatch ? t('common.delete') : t('sidebar.clearMessages'),
      cancelLabel: t('common.cancel'),
      variant: 'destructive',
    });
  }, [confirm, t]);

  /** 把“删除最后话题”彻底切换成清空后的默认话题壳。 */
  const clearRetainedLastTopic = useCallback((id: string) => {
    const key = String(id || '').trim();
    if (!key) return;
    onClearMessages(key);
  }, [onClearMessages]);

  /** 请求删除单个话题。 */
  const requestTopicDelete = useCallback(async (id: string, options?: { pinned?: boolean }) => {
    const key = String(id || '').trim();
    if (!key || options?.pinned) return;

    const remaining = topics.filter((topic) => topic.id !== key);
    if (remaining.length < 1) {
      const ok = await confirmKeepLastTopicByClearing();
      if (ok) clearRetainedLastTopic(key);
      return;
    }

    const ok = await confirm({
      title: t('sidebar.confirmDeleteTitle'),
      description: t('sidebar.confirmDeleteDesc'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      variant: 'destructive',
    });
    if (ok) executeTopicDelete(key, options);
  }, [clearRetainedLastTopic, confirm, confirmKeepLastTopicByClearing, executeTopicDelete, t, topics]);

  /** 请求删除助手，并显式说明级联影响。 */
  const requestAssistantDelete = useCallback(async (assistantId: string) => {
    const normalizedAssistantId = String(assistantId || '').trim();
    if (!normalizedAssistantId) return;
    const assistant = assistants.find((item) => item.id === normalizedAssistantId) ?? null;
    if (!assistant) return;

    const ok = await confirm({
      title: t('assistant.deleteConfirmTitle'),
      description: t('assistant.deleteConfirmDesc', { count: assistant.topics.length }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      variant: 'destructive',
    });
    if (ok) onDeleteAssistant(normalizedAssistantId);
  }, [assistants, confirm, onDeleteAssistant, t]);

  /** 打开 Prompt 编辑器。 */
  const openPromptEditor = useCallback((id: string) => {
    const topic = topics.find((item) => item.id === id) ?? null;
    setPromptEditingId(id);
    setPromptText(String(topic?.topicPrompt || ''));
    setPromptDialogOpen(true);
  }, [setPromptDialogOpen, setPromptEditingId, setPromptText, topics]);

  /** 加载导出和自动命名所需的话题快照。 */
  const loadTopicConversation = useCallback(async (id: string): Promise<ResolvedConversationContext | null> => {
    const key = String(id || '').trim();
    if (!key) return null;

    const settings = useChatSettingsStore.getState().settings;
    const messages = await getBestEffortConversationMessages(key);
    const summary = topics.find((item) => item.id === key) ?? null;
    if (!summary?.assistantId) return null;
    const assistant = assistants.find((item) => item.id === summary.assistantId) ?? null;
    if (!assistant) return null;

    return buildResolvedConversationContext({
      assistant,
      topic: {
        id: summary.id,
        assistantId: summary.assistantId,
        name: summary.title,
        pinned: summary.pinned,
        createdAt: summary.createdAt,
        updatedAt: summary.updatedAt,
        order: summary.order,
        topicPrompt: summary.topicPrompt,
        isNameManuallyEdited: summary.isNameManuallyEdited,
      },
      messages,
      settings,
    });
  }, [assistants, topics]);

  /** 保存 Prompt 编辑结果。 */
  const savePrompt = useCallback(() => {
    if (!promptEditingId) return;
    onUpdateTopicMeta(promptEditingId, { topicPrompt: promptText });
    setPromptDialogOpen(false);
    setPromptEditingId(null);
    setPromptText('');
  }, [onUpdateTopicMeta, promptEditingId, promptText, setPromptDialogOpen, setPromptEditingId, setPromptText]);

  /** 通过模型自动重命名。 */
  const handleAutoRename = useCallback(async (id: string) => {
    if (renamingAutoId) return;
    setRenamingAutoId(id);
    setAutoRenameState(id, { loading: true });
    try {
      const topicConversation = await loadTopicConversation(id);
      if (!topicConversation) {
        setAutoRenameState(id, null);
        return;
      }
      const messages = Array.isArray(topicConversation.messages) ? topicConversation.messages : [];
      if (messages.length < 2) {
        setAutoRenameState(id, null);
        toast({ title: t('common.tip'), description: t('sidebar.notEnoughMessages') });
        return;
      }
      const nextTitle = await autoRenameWithModel(topicNamingModel || topicConversation.model || defaultModel, messages);
      if (nextTitle) onUpdateTopicMeta(id, { name: nextTitle, isNameManuallyEdited: false });
      setAutoRenameState(id, null);
    } catch (error: unknown) {
      setAutoRenameState(id, { loading: false, error: formatI18nText(t, toAutoRenameErrorText(error)) });
    } finally {
      setRenamingAutoId(null);
    }
  }, [defaultModel, loadTopicConversation, onUpdateTopicMeta, renamingAutoId, setAutoRenameState, setRenamingAutoId, t, topicNamingModel]);

  /** 导出 Markdown 并复制到剪贴板。 */
  const handleCopyMarkdown = useCallback(async (id: string) => {
    const topicConversation = await loadTopicConversation(id);
    if (!topicConversation) return;
    try {
      await navigator.clipboard.writeText(await exportToMarkdown(topicConversation));
      toast({ title: t('chat.copied'), description: t('sidebar.copiedMarkdown') });
    } catch {
      toast({ title: t('common.error'), description: t('sidebar.clipboardFailed'), variant: 'destructive' });
    }
  }, [loadTopicConversation, t]);

  /** 导出单个话题。 */
  const handleExportConversation = useCallback(async (id: string, format: 'markdown' | 'html' | 'word') => {
    const topicConversation = await loadTopicConversation(id);
    if (topicConversation) await exportTopic(topicConversation, format);
  }, [loadTopicConversation]);

  /** 请求清空话题消息。 */
  const handleRequestClearMessages = useCallback(async (id: string) => {
    const ok = await confirm({
      title: t('sidebar.confirmClearMessages'),
      description: t('sidebar.confirmClearMessagesDesc'),
      confirmLabel: t('sidebar.clearMessages'),
      cancelLabel: t('common.cancel'),
      variant: 'destructive',
    });
    if (ok) onClearMessages(id);
  }, [confirm, onClearMessages, t]);

  /** 切换侧边栏停靠位置。 */
  const handleToggleSidebarPosition = useCallback(() => {
    const next = sidebarPosition === 'left' ? 'right' : 'left';
    updateDisplaySettings({ sidebarPosition: next });
    toast({
      title: t('common.tip'),
      description: t('sidebar.sidebarPositionChanged', { pos: next === 'left' ? t('sidebar.left') : t('sidebar.right') }),
    });
  }, [sidebarPosition, t]);

  /** 在当前分组内重排话题。 */
  const handleTopicReorder = useCallback((sourceId: string, targetId: string, group: TopicGroup) => {
    if (!activeAssistantId) {
      setDragState(null);
      setDragOverId(null);
      return;
    }

    const list = group === 'pinned' ? topicPinned : topicNormal;
    const fromIndex = list.findIndex((topic) => topic.id === sourceId);
    const toIndex = list.findIndex((topic) => topic.id === targetId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      setDragState(null);
      setDragOverId(null);
      return;
    }

    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) return;
    next.splice(toIndex, 0, moved);
    onReorderTopics(activeAssistantId, next.map((topic) => topic.id));
    setDragState(null);
    setDragOverId(null);
  }, [activeAssistantId, onReorderTopics, setDragOverId, setDragState, topicNormal, topicPinned]);

  /** 切换助手标签页展示模式。 */
  const handleChangeAssistantsTabSortType = useCallback((sortType: AssistantsTabSortType) => {
    setAssistantsTabSortType(sortType);
    updateDisplaySettings({ assistantsTabSortType: sortType });
  }, [setAssistantsTabSortType]);

  /** 批量移动当前选中话题。 */
  const moveSelectedTopics = useCallback((assistantId: string) => {
    const target = String(assistantId || '').trim();
    if (!target || selectedIds.size === 0) return;
    for (const id of selectedIds) onMoveTopicToAssistant(id, target);
    toast({ title: t('common.tip'), description: t('sidebar.movedCount', { count: selectedIds.size }) });
    setSelectedIds(new Set());
  }, [onMoveTopicToAssistant, selectedIds, setSelectedIds, t]);

  /** 批量删除当前选中的话题。 */
  const deleteSelectedTopics = useCallback(async () => {
    if (selectedIds.size < 1) return;

    const deletePlan = buildTopicBatchDeletePlan({
      activeTopicId,
      selectedIds,
      totalTopicCount: topics.length,
    });
    if (deletePlan.clearsLastTopic) {
      if (!deletePlan.retainedTopicId) return;
      const ok = await confirmKeepLastTopicByClearing({ batchCount: selectedIds.size });
      if (!ok) return;

      for (const id of deletePlan.deleteIds) executeTopicDelete(id);
      clearRetainedLastTopic(deletePlan.retainedTopicId);
      setSelectedIds(new Set());
      return;
    }
    if (deletePlan.deleteIds.length < 1) return;

    const ok = await confirm({
      title: t('sidebar.confirmBatchDelete', { count: selectedIds.size }),
      description: t('sidebar.confirmBatchDeleteDesc'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      variant: 'destructive',
    });
    if (!ok) return;

    for (const id of deletePlan.deleteIds) executeTopicDelete(id);
    setSelectedIds(new Set());
  }, [activeTopicId, clearRetainedLastTopic, confirm, confirmKeepLastTopicByClearing, executeTopicDelete, selectedIds, setSelectedIds, t, topics.length]);

  return {
    clearSelection,
    closeManageMode,
    closeSearchMode,
    deleteSelectedTopics,
    finishRename,
    handleAutoRename,
    handleChangeAssistantsTabSortType,
    handleCopyMarkdown,
    handleExportConversation,
    handleRequestClearMessages,
    handleTopicReorder,
    handleToggleSidebarPosition,
    moveSelectedTopics,
    openPromptEditor,
    openSearchMode,
    requestAssistantDelete,
    requestTopicDelete,
    savePrompt,
    startRename,
    toggleManageMode,
    toggleSelected,
    toggleSelectAll,
  };
}
