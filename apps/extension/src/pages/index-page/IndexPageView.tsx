/**
 * 说明：`IndexPageView` 页面模块。
 *
 * 职责：
 * - 承载 `IndexPageView` 相关的当前文件实现与模块边界；
 * - 对外暴露 `IndexPageView` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { shallow } from 'zustand/shallow';

import { RightToolbar } from '@/components/chat/RightToolbar';
import { TopicSidebar } from '@/components/chat/TopicSidebar';
import type { TopicMetaUpdate } from '@/components/chat/topic-sidebar/types';
import { useDialogState } from '@/hooks/useDialogState';
import { useAssistantStore } from '@/hooks/useAssistantStore';
import { useChatStore } from '@/hooks/useChatStore';
import { useModelOptions } from '@/hooks/useModelOptions';
import { usePageToolsEnabled } from '@/hooks/usePageToolsEnabled';
import { usePromptStore } from '@/hooks/usePromptStore';
import { toTopicSummary } from '@/lib/chat/resolved-conversation';
import { getAssistantTopics } from '@/lib/chat/topic-tree';
import { createId } from '@/lib/utils/id';
import type { Assistant } from '@/types/assistant';
import { DEFAULT_SETTINGS, type TopicSummary } from '@/types/chat';

import { ChatAreaContainer } from './ChatAreaContainer';
import { IndexPageOverlays } from './IndexPageOverlays';
import { TranslationPanel } from '@/components/chat/TranslationPanel';
import { useDialogRouting } from './useDialogRouting';
import { useActiveConversationModel } from './useActiveConversationModel';
import { useExternalUiPortBridge } from './useExternalUiPortBridge';
import { useIndexPageActions } from './useIndexPageActions';
import { useSidebarPreferences } from './useSidebarPreferences';
import { resolveSidebarLayoutMode, type SidebarLayoutMode } from './sidebarLayoutMode';
import type { ChatAreaHandle } from '@/components/chat/ChatArea';

interface PendingJumpTarget {
  topicId: string;
  messageId?: string;
}

/**
 * 内部组件：`Sidebar`。
 *
 * @remarks
 * 用于拆分当前文件中的局部界面结构或交互片段，减少主组件体积并收拢视图职责。
 */
function Sidebar({
  activeAssistantId,
  activeTopicId,
  assistants,
  collapsed,
  onChangeTab,
  onClearMessages,
  onCreateAssistant,
  onCreateTopic,
  onDelete,
  onDeleteAssistant,
  onEditAssistant,
  onMoveTopicToAssistant,
  onReorderAssistants,
  onReorderTopics,
  onRename,
  onSelect,
  onSelectAssistant,
  onFloatingOpenChange,
  onToggleCollapse,
  onTogglePin,
  onUpdateTopicMeta,
  presentation,
  floatingOpen,
  sidebarTab,
  topics,
}: {
  activeAssistantId: string | null;
  activeTopicId: string | null;
  assistants: Assistant[];
  collapsed: boolean;
  onChangeTab: (tab: 'assistants' | 'topics') => void;
  onClearMessages: (id: string) => void;
  onCreateAssistant: () => void;
  onCreateTopic: () => void;
  onDelete: (id: string) => void;
  onDeleteAssistant: (assistantId: string) => void;
  onEditAssistant: (assistant: Assistant) => void;
  onMoveTopicToAssistant: (topicId: string, assistantId: string) => void;
  onReorderAssistants: (assistantIds: string[]) => void;
  onReorderTopics: (assistantId: string, topicIds: string[]) => void;
  onRename: (id: string, name: string) => void;
  onSelect: (topicId: string) => void;
  onSelectAssistant: (assistant: Assistant) => void;
  onFloatingOpenChange?: (open: boolean) => void;
  onToggleCollapse?: () => void;
  onTogglePin: (id: string) => void;
  onUpdateTopicMeta: (id: string, patch: TopicMetaUpdate) => void;
  presentation?: 'inline' | 'floating';
  floatingOpen?: boolean;
  sidebarTab: 'assistants' | 'topics';
  topics: TopicSummary[];
}) {
  return (
    <TopicSidebar
      activeTab={sidebarTab}
      topics={topics}
      assistants={assistants}
      activeAssistantId={activeAssistantId}
      activeTopicId={activeTopicId}
      onSelect={onSelect}
      onSelectAssistant={onSelectAssistant}
      onCreateTopic={onCreateTopic}
      onCreateAssistant={onCreateAssistant}
      onDelete={onDelete}
      onDeleteAssistant={onDeleteAssistant}
      onRename={onRename}
      onUpdateTopicMeta={onUpdateTopicMeta}
      onMoveTopicToAssistant={onMoveTopicToAssistant}
      onReorderTopics={onReorderTopics}
      onReorderAssistants={onReorderAssistants}
      onTogglePin={onTogglePin}
      onClearMessages={onClearMessages}
      onEditAssistant={onEditAssistant}
      onChangeTab={onChangeTab}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      presentation={presentation}
      floatingOpen={floatingOpen}
      onFloatingOpenChange={onFloatingOpenChange}
    />
  );
}

/**
 * 导出组件：`IndexPageView`。
 *
 * @remarks
 * 负责承载当前文件对应的界面渲染、交互编排和视图层边界。
 */
export function IndexPageView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { models } = useModelOptions();
  const { enabled: pageToolsEnabled } = usePageToolsEnabled();
  const prompts = usePromptStore((state) => state.prompts);
  const assistants = useAssistantStore((state) => state.assistants);
  const { runtime, activeConversationKey } = useChatStore((state) => ({
    runtime: state.runtime,
    activeConversationKey: state.activeConversationKey,
  }), shallow);

  const { dialogs, open, close, toggle } = useDialogState();
  const [editingAssistant, setEditingAssistant] = useState<Assistant | null>(null);
  const [pendingJump, setPendingJump] = useState<PendingJumpTarget | null>(null);
  const [sidebarLayoutMode, setSidebarLayoutMode] = useState<SidebarLayoutMode>(() => (
    typeof window === 'undefined' ? 'full' : resolveSidebarLayoutMode(window.innerWidth)
  ));
  const [floatingSidebarOpen, setFloatingSidebarOpen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const chatRef = useRef<ChatAreaHandle | null>(null);

  const {
    clickAssistantToShowTopic,
    focusAssistantTab,
    focusTopicTab,
    handleChangeSidebarTab,
    handleToggleSidebarCollapse,
    sidebarCollapsed,
    sidebarPosition,
    sidebarTab,
  } = useSidebarPreferences();
  const {
    assistantActions,
    ensureActiveTopicForExternalSend,
    handleClearMessagesConversation,
    handleCreateAssistantFromRolePicker,
    handleCreateAssistantFromStorePreset,
    handleCreateTopic,
    handleDeleteConversation,
    handleEditAssistant,
    handleRenameConversation,
    handleSelectAssistantFromSidebar,
    handleSelectTopic,
    handleTogglePinConversation,
    openAssistantRolePicker,
    openAssistantStore,
    promptActions,
  } = useIndexPageActions({
    activeAssistantId: runtime.activeAssistantId,
    clickAssistantToShowTopic,
    close,
    focusAssistantTab,
    focusTopicTab,
    open,
    setEditingAssistant,
    sidebarPosition,
    t,
  });
  const {
    extSettingsTab,
    focusChat,
    openExtensionSettings,
    openLaunchpadTarget,
    openMcpSettings,
    openMemorySettings,
    openModelManager,
    openWebSearchSettings,
    setExtSettingsTab,
  } = useDialogRouting({
    close,
    navigate,
    open,
    openAssistantStore,
  });

  const { activeLoadedTopicId, activeModel, hasLoadedMessages, hasResolvedTopic } = useActiveConversationModel();
  const sidebarFloating = sidebarLayoutMode === 'floating';
  const effectiveSidebarCollapsed = sidebarCollapsed || sidebarFloating;
  const handleOpenFloatingSidebar = useCallback(() => setFloatingSidebarOpen(true), []);
  const effectiveSidebarToggle = sidebarFloating ? handleOpenFloatingSidebar : handleToggleSidebarCollapse;
  const closeFloatingSidebarIfNeeded = useCallback(() => {
    if (sidebarLayoutMode !== 'floating') return;
    setFloatingSidebarOpen(false);
  }, [sidebarLayoutMode]);
  const handleSelectTopicFromSidebar = useCallback((topicId: string) => {
    handleSelectTopic(topicId);
    closeFloatingSidebarIfNeeded();
  }, [closeFloatingSidebarIfNeeded, handleSelectTopic]);
  const handleCreateTopicFromSidebar = useCallback(() => {
    handleCreateTopic();
    closeFloatingSidebarIfNeeded();
  }, [closeFloatingSidebarIfNeeded, handleCreateTopic]);
  /**
   * 将提示词库模板作为用户输入草稿插入当前聊天输入区。
   *
   * 说明：
   * - 提示词库不再写 `topicPrompt`，避免和助手 persona/system prompt 入口竞争；
   * - 普通话题级 `topicPrompt` 仍由话题设置显式维护。
   */
  const handleApplyPromptTemplate = useCallback((content: string) => {
    const prompt = String(content || '').trim();
    if (!prompt) return;
    chatRef.current?.insertDraft({
      id: createId(),
      kind: 'prompt-template',
      content: prompt,
    });
  }, []);

  const currentAssistantTopics = useMemo<TopicSummary[]>(() => {
    const list = getAssistantTopics(assistants, runtime.activeAssistantId);
    return list.map((topic) => toTopicSummary(topic));
  }, [assistants, runtime.activeAssistantId]);

  const allTopics = useMemo<TopicSummary[]>(() => {
    const topics = assistants.flatMap((assistant) => assistant.topics);
    return topics.map((topic) => toTopicSummary(topic));
  }, [assistants]);

  // 全局搜索快捷键：Cmd/Ctrl+Shift+F
  useEffect(() => {
        /**
     * 内部函数变量：`onKeyDown`。
     *
     * @remarks
     * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
     */
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
      const key = String(event.key || '').toLowerCase();
      if (key !== 'f') return;
      event.preventDefault();
      open('showGlobalSearch');
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  useEffect(() => {
    if (!pendingJump || !activeLoadedTopicId) return;
    if (pendingJump.topicId !== activeLoadedTopicId) return;
    if (pendingJump.messageId) {
      chatRef.current?.scrollToMessage?.(pendingJump.messageId);
    }
    setPendingJump(null);
  }, [activeLoadedTopicId, pendingJump]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    /**
     * 侧栏响应式只认主工作区当前可用宽度。
     *
     * 说明：
     * - 不读取或写入 display-settings，避免窄宽临时 rail 污染用户偏好；
     * - ResizeObserver 会覆盖 sidepanel resize、新标签页 resize 和浏览器缩放后的真实容器宽度。
     */
    const syncSidebarLayoutMode = () => {
      const nextWidth = workspace.clientWidth || window.innerWidth || 0;
      setSidebarLayoutMode(resolveSidebarLayoutMode(nextWidth));
    };

    syncSidebarLayoutMode();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncSidebarLayoutMode);
      return () => window.removeEventListener('resize', syncSidebarLayoutMode);
    }

    const observer = new ResizeObserver(syncSidebarLayoutMode);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (sidebarLayoutMode === 'full') setFloatingSidebarOpen(false);
  }, [sidebarLayoutMode]);

  const { startElementPicker, startScreenshotEditor } = useExternalUiPortBridge({
    activeLoadedTopicId,
    chatRef,
    focusChat,
    ensureActiveTopicForExternalSend,
    pageToolsEnabled,
    t,
  });

  return (
    <div
      ref={workspaceRef}
      data-olyq-workspace-shell
      data-sidebar-layout-mode={sidebarLayoutMode}
      className="flex h-screen w-full overflow-hidden bg-background text-foreground"
    >
      {sidebarPosition === 'left' && (
        <Sidebar
          activeAssistantId={runtime.activeAssistantId}
          activeTopicId={runtime.activeTopicId}
          assistants={assistants}
          collapsed={effectiveSidebarCollapsed}
          onChangeTab={handleChangeSidebarTab}
          onClearMessages={handleClearMessagesConversation}
          onCreateAssistant={openAssistantRolePicker}
          onCreateTopic={handleCreateTopicFromSidebar}
          onDelete={handleDeleteConversation}
          onDeleteAssistant={assistantActions.deleteAssistant}
          onEditAssistant={handleEditAssistant}
          onMoveTopicToAssistant={assistantActions.moveTopicToAssistant}
          onReorderAssistants={assistantActions.reorderAssistants}
          onReorderTopics={assistantActions.reorderTopics}
          onRename={handleRenameConversation}
          onSelect={handleSelectTopicFromSidebar}
          onSelectAssistant={handleSelectAssistantFromSidebar}
          onFloatingOpenChange={setFloatingSidebarOpen}
          onToggleCollapse={effectiveSidebarToggle}
          onTogglePin={handleTogglePinConversation}
          onUpdateTopicMeta={assistantActions.updateTopicMeta}
          presentation={sidebarFloating ? 'floating' : 'inline'}
          floatingOpen={floatingSidebarOpen}
          sidebarTab={sidebarTab}
          topics={currentAssistantTopics}
        />
      )}

      <div data-chat-main-shell className="flex min-h-0 min-w-0 flex-1">
        {dialogs.showTranslation ? (
          <TranslationPanel
            model={activeModel || models[0]?.id || DEFAULT_SETTINGS.defaultModel}
            onClose={() => close('showTranslation')}
          />
        ) : (
          <ChatAreaContainer
            ref={chatRef}
            onOpenPrompts={() => open('showPrompts')}
            onOpenModelManager={openModelManager}
            onOpenWebSearchSettings={openWebSearchSettings}
            onOpenNativeWebSearchSettings={() => open('showSettings')}
            onOpenMcpSettings={openMcpSettings}
            onOpenMemorySettings={openMemorySettings}
          />
        )}

        <RightToolbar
          dialogs={dialogs}
          open={open}
          onOpenExtensionSettings={openExtensionSettings}
          toggle={toggle}
          onStartElementPicker={startElementPicker}
          onStartScreenshotEditor={startScreenshotEditor}
          pageToolsEnabled={pageToolsEnabled}
        />
      </div>

      <IndexPageOverlays
        activeConversationKey={activeConversationKey}
        activeAssistantId={runtime.activeAssistantId}
        activeModel={activeModel}
        allTopics={allTopics}
        close={close}
        dialogs={dialogs}
        editingAssistant={editingAssistant}
        extSettingsTab={extSettingsTab}
        handleApplyPromptTemplate={handleApplyPromptTemplate}
        handleCreateAssistantFromRolePicker={handleCreateAssistantFromRolePicker}
        handleCreateAssistantFromStorePreset={handleCreateAssistantFromStorePreset}
        handleSelectTopic={handleSelectTopic}
        hasLoadedMessages={hasLoadedMessages}
        hasResolvedTopic={hasResolvedTopic}
        models={models}
        onCloseAssistantEditor={() => {
          close('showAssistantEditor');
          setEditingAssistant(null);
        }}
        onConfirmCompare={(modelIds) => {
          const messages = useChatStore.getState().activeMessages ?? [];
          const lastUserMsg = [...messages].reverse().find((message) => message.role === 'user');
          if (lastUserMsg) {
            chatRef.current?.sendCompare(lastUserMsg.content, modelIds);
          }
        }}
        onOpenTarget={openLaunchpadTarget}
        onOpenMcpSettings={openMcpSettings}
        onPendingJump={(topicId, messageId) => {
          setPendingJump(messageId ? { topicId, messageId } : { topicId });
        }}
        onTabChange={(tabId) => setExtSettingsTab(tabId)}
        openModelManager={openModelManager}
        openMcpSettings={openMcpSettings}
        prompts={prompts}
        promptActions={promptActions}
        updateAssistantConfig={assistantActions.updateAssistantConfig}
        updateTopicMeta={assistantActions.updateTopicMeta}
        builtinPresets={assistantActions.presets}
        userPresets={assistantActions.userPresets}
        presetSections={assistantActions.presetSections}
        createPreset={assistantActions.createPreset}
        updatePreset={assistantActions.updatePreset}
        deletePresets={assistantActions.deletePresets}
        importPresets={assistantActions.importPresets}
        exportPresets={assistantActions.exportPresets}
      />

      {sidebarPosition === 'right' && (
        <Sidebar
          activeAssistantId={runtime.activeAssistantId}
          activeTopicId={runtime.activeTopicId}
          assistants={assistants}
          collapsed={effectiveSidebarCollapsed}
          onChangeTab={handleChangeSidebarTab}
          onClearMessages={handleClearMessagesConversation}
          onCreateAssistant={openAssistantRolePicker}
          onCreateTopic={handleCreateTopicFromSidebar}
          onDelete={handleDeleteConversation}
          onDeleteAssistant={assistantActions.deleteAssistant}
          onEditAssistant={handleEditAssistant}
          onMoveTopicToAssistant={assistantActions.moveTopicToAssistant}
          onReorderAssistants={assistantActions.reorderAssistants}
          onReorderTopics={assistantActions.reorderTopics}
          onRename={handleRenameConversation}
          onSelect={handleSelectTopicFromSidebar}
          onSelectAssistant={handleSelectAssistantFromSidebar}
          onFloatingOpenChange={setFloatingSidebarOpen}
          onToggleCollapse={effectiveSidebarToggle}
          onTogglePin={handleTogglePinConversation}
          onUpdateTopicMeta={assistantActions.updateTopicMeta}
          presentation={sidebarFloating ? 'floating' : 'inline'}
          floatingOpen={floatingSidebarOpen}
          sidebarTab={sidebarTab}
          topics={currentAssistantTopics}
        />
      )}
    </div>
  );
}
