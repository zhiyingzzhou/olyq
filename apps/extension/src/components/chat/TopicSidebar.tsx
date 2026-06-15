/**
 * 说明：`TopicSidebar` 组件模块。
 *
 * 职责：
 * - 承载 `TopicSidebar` 相关的当前文件实现与模块边界；
 * - 对外暴露 `TopicSidebar` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { canOpenSidepanelPageInNewTab } from '@/lib/extension/ui-actions';
import { openCurrentWorkspaceInNewTab } from '@/pages/index-page/openWorkspaceInNewTab';

import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

import { AssistantBrowserContent } from './AssistantBrowserContent';
import {
  AssistantBrowserDragSessionContext,
  type AssistantBrowserDragSessionState,
} from './AssistantBrowserContent.drag-session';
import { TopicSidebarContent } from './topic-sidebar/TopicSidebarContent';
import { TopicSidebarDialogs } from './topic-sidebar/TopicSidebarDialogs';
import { AssistantSidebarHeader } from './topic-sidebar/AssistantSidebarHeader';
import { SidebarShellHeader } from './topic-sidebar/SidebarShellHeader';
import { TopicSidebarHeader } from './topic-sidebar/TopicSidebarHeader';
import { TopicSidebarMini } from './topic-sidebar/TopicSidebarMini';
import { useTopicSidebarController } from './topic-sidebar/useTopicSidebarController';
import type { TopicSidebarProps, SidebarTab } from './topic-sidebar/types';

/**
 * 话题侧边栏主容器。
 *
 * 负责聚合：
 * - 话题列表筛选与排序；
 * - 批量管理、重命名、拖拽排序和 Prompt 编辑；
 * - 导入导出、自动命名、清空消息等跨列表操作。
 *
 * 组件本身不直接持久化数据，而是通过 props 回调和 store hook 与外层状态协作。
 */
export function TopicSidebar({
  activeTab,
  topics,
  assistants,
  activeAssistantId,
  activeTopicId,
  onSelect,
  onSelectAssistant,
  onCreateTopic,
  onCreateAssistant,
  onDelete,
  onDeleteAssistant,
  onRename,
  onUpdateTopicMeta,
  onMoveTopicToAssistant,
  onReorderTopics,
  onReorderAssistants,
  onTogglePin,
  onClearMessages,
  onEditAssistant,
  onChangeTab,
  collapsed = false,
  onToggleCollapse,
  presentation = 'inline',
  floatingOpen = false,
  onFloatingOpenChange,
}: TopicSidebarProps) {
  const { t } = useTranslation();
  const { confirm, ConfirmDialogPortal } = useConfirmDialog();
  const [assistantDragSessionState, setAssistantDragSessionState] = useState<AssistantBrowserDragSessionState>('idle');
  const {
    autoRenameState,
    assistantsTabSortType,
    canDragSort,
    clearSelection,
    closeManageMode,
    closeSearchMode,
    deleteSelectedTopics,
    dragOverId,
    dragState,
    filteredTopics,
    finishRename,
    handleAutoRename,
    handleChangeAssistantsTabSortType,
    handleCopyMarkdown,
    handleExportConversation,
    handleRequestClearMessages,
    handleTopicReorder,
    handleToggleSidebarPosition,
    manageMode,
    manageSearchMode,
    manageSearchText,
    moveSelectedTopics,
    openPromptEditor,
    openSearchMode,
    promptDialogOpen,
    promptText,
    renameError,
    renameText,
    renamingAutoId,
    renamingId,
    requestAssistantDelete,
    requestTopicDelete,
    savePrompt,
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
    startRename,
    toggleManageMode,
    toggleSelected,
    toggleSelectAll,
    topicNormal,
    topicPinned,
  } = useTopicSidebarController({
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
  });

  /** 在独立浏览器标签页中打开侧边栏主页面。 */
  const handleOpenInNewTab = useCallback(() => { void openCurrentWorkspaceInNewTab(); }, []);
  const handleChangeTab = useCallback((value: string) => { onChangeTab(value as SidebarTab); }, [onChangeTab]);
  const handleCloseFloatingSidebar = useCallback(() => {
    onFloatingOpenChange?.(false);
  }, [onFloatingOpenChange]);
  const handleCreateTopicFromPanel = useCallback(() => {
    onCreateTopic();
    if (presentation === 'floating') handleCloseFloatingSidebar();
  }, [handleCloseFloatingSidebar, onCreateTopic, presentation]);
  const handleSelectTopicFromPanel = useCallback((topicId: string) => {
    onSelect(topicId);
    if (presentation === 'floating') handleCloseFloatingSidebar();
  }, [handleCloseFloatingSidebar, onSelect, presentation]);
  const assistantDragSessionContextValue = useMemo(() => ({
    state: assistantDragSessionState,
    active: assistantDragSessionState === 'active',
    locked: assistantDragSessionState !== 'idle',
    setState: setAssistantDragSessionState,
  }), [assistantDragSessionState]);
  const shouldRenderFloatingPanel = presentation === 'floating' && collapsed && floatingOpen;

  useEffect(() => {
    if (!shouldRenderFloatingPanel) return;

    /** Esc 只关闭本轮覆盖式侧栏，不触碰持久化侧栏偏好。 */
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      handleCloseFloatingSidebar();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleCloseFloatingSidebar, shouldRenderFloatingPanel]);

  /** 渲染完整侧栏壳体；inline 与 floating 只改变承载方式，不复制业务状态。 */
  const renderSidebarShell = (shellPresentation: 'inline' | 'floating') => (
    <div
      data-testid={shellPresentation === 'floating' ? 'topic-sidebar-floating-panel' : 'topic-sidebar-panel'}
      data-topic-sidebar-shell
      data-sidebar-presentation={shellPresentation}
      role={shellPresentation === 'floating' ? 'dialog' : undefined}
      aria-modal={shellPresentation === 'floating' ? true : undefined}
      aria-label={shellPresentation === 'floating' ? t('sidebar.expand') : undefined}
      className={cn(
        'topic-sidebar-shell h-full flex flex-col border-border bg-sidebar transition-colors duration-200',
        shellPresentation === 'inline' ? 'flex-shrink-0' : 'max-h-full shadow-xl',
        sidebarPosition === 'right' ? 'border-l' : 'border-r',
      )}
    >
      <SidebarShellHeader
        onOpenInNewTab={canOpenSidepanelPageInNewTab() ? handleOpenInNewTab : undefined}
        onToggleCollapse={shellPresentation === 'floating' ? handleCloseFloatingSidebar : onToggleCollapse}
      />

      <Tabs value={activeTab} onValueChange={handleChangeTab} className="flex min-h-0 flex-1 flex-col">
        <div className="px-3 pb-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="assistants">{t('assistant.tab')}</TabsTrigger>
            <TabsTrigger value="topics">{t('topic.tab')}</TabsTrigger>
          </TabsList>
        </div>

        {activeTab === 'assistants' ? (
          <AssistantBrowserDragSessionContext.Provider value={assistantDragSessionContextValue}>
            <>
              <AssistantSidebarHeader
                onCreateAssistant={onCreateAssistant}
                sortType={assistantsTabSortType}
                onChangeSortType={handleChangeAssistantsTabSortType}
              />
              <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
                <AssistantBrowserContent
                  assistants={assistants}
                  activeAssistantId={activeAssistantId}
                  emptyLabel={t('assistant.noResults')}
                  sortType={assistantsTabSortType}
                  onReorderAssistants={onReorderAssistants}
                  onDelete={(id) => {
                    void requestAssistantDelete(id);
                  }}
                  onEdit={onEditAssistant}
                  onSelect={onSelectAssistant}
                />
              </div>
            </>
          </AssistantBrowserDragSessionContext.Provider>
        ) : (
          <>
            <TopicSidebarHeader
              activeAssistantId={activeAssistantId}
              assistants={assistants}
              manageMode={manageMode}
              manageSearchMode={manageSearchMode}
              search={search}
              onChangeSearch={setSearch}
              onCreateTopic={handleCreateTopicFromPanel}
              onOpenAssistantTab={() => onChangeTab('assistants')}
              onToggleManageMode={toggleManageMode}
            />

            <TopicSidebarContent
              activeAssistantId={activeAssistantId}
              activeTopicId={activeTopicId}
              assistants={assistants}
              autoRenameState={autoRenameState}
              canDragSort={canDragSort}
              dragOverId={dragOverId}
              dragState={dragState}
              filteredTopics={filteredTopics}
              manageMode={manageMode}
              manageSearchMode={manageSearchMode}
              manageSearchText={manageSearchText}
              renameText={renameText}
              renamingAutoId={renamingAutoId}
              renamingId={renamingId}
              selectableIds={selectableIds}
              selectedIds={selectedIds}
              sidebarPosition={sidebarPosition}
              topicNormal={topicNormal}
              topicPinned={topicPinned}
              onAutoRename={handleAutoRename}
              onChangeManageSearchText={setManageSearchText}
              onChangeRenameText={setRenameText}
              onClearSelection={clearSelection}
              onCloseManageMode={closeManageMode}
              onCloseSearchMode={closeSearchMode}
              onCopyMarkdown={handleCopyMarkdown}
              onDelete={(id, options) => {
                void requestTopicDelete(id, options);
              }}
              onDeleteSelected={() => void deleteSelectedTopics()}
              onExport={handleExportConversation}
              onFinishRename={finishRename}
              onMoveSelectedToAssistant={moveSelectedTopics}
              onMoveToAssistant={onMoveTopicToAssistant}
              onOpenPromptEditor={openPromptEditor}
              onOpenSearchMode={openSearchMode}
              onRequestClearMessages={handleRequestClearMessages}
              onSelect={handleSelectTopicFromPanel}
              onSetDragOverId={setDragOverId}
              onSetDragState={setDragState}
              onShowRenameError={setRenameError}
              onStartRename={startRename}
              onTogglePin={onTogglePin}
              onToggleSelectAll={toggleSelectAll}
              onToggleSelected={toggleSelected}
              onTopicReorder={handleTopicReorder}
              onToggleSidebarPosition={handleToggleSidebarPosition}
            />
          </>
        )}
      </Tabs>

      <TopicSidebarDialogs
        promptDialogOpen={promptDialogOpen}
        promptText={promptText}
        renameError={renameError}
        onChangePromptDialogOpen={setPromptDialogOpen}
        onChangePromptText={setPromptText}
        onCloseRenameError={() => setRenameError(null)}
        onSavePrompt={savePrompt}
      />
    </div>
  );

  if (collapsed) {
    return (
      <>
        <TopicSidebarMini
          activeTab={activeTab}
          activeAssistantId={activeAssistantId}
          activeTopicId={activeTopicId}
          assistants={assistants}
          items={filteredTopics}
          sidebarPosition={sidebarPosition}
          onCreateAssistant={onCreateAssistant}
          onSelectAssistant={onSelectAssistant}
          onChangeTab={onChangeTab}
          onCreateTopic={onCreateTopic}
          onSelect={onSelect}
          onToggleCollapse={onToggleCollapse}
        />
        {shouldRenderFloatingPanel && (
          <div
            data-testid="topic-sidebar-floating-layer"
            data-topic-sidebar-floating-layer
            data-sidebar-position={sidebarPosition}
            className="fixed inset-0 z-40"
          >
            <button
              type="button"
              aria-label={t('common.close')}
              data-testid="topic-sidebar-floating-backdrop"
              className="absolute inset-0 cursor-default bg-background/10"
              onClick={handleCloseFloatingSidebar}
            />
            <div
              data-topic-sidebar-floating-frame
              className={cn(
                'fixed inset-y-0',
                sidebarPosition === 'right' ? 'right-12' : 'left-12',
              )}
            >
              {renderSidebarShell('floating')}
            </div>
          </div>
        )}
        <ConfirmDialogPortal />
      </>
    );
  }

  return (
    <>
      {renderSidebarShell('inline')}
      <ConfirmDialogPortal />
    </>
  );
}
