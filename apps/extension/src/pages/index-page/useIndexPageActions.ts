/**
 * 说明：`useIndexPageActions` 页面模块。
 *
 * 职责：
 * - 承载 `useIndexPageActions` 相关的当前文件实现与模块边界；
 * - 对外暴露 `UseIndexPageActionsOptions`、`useIndexPageActions` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import { shallow } from 'zustand/shallow';

import type { DialogName } from '@/hooks/useDialogState';
import { useAssistantStore } from '@/hooks/useAssistantStore';
import { useChatStore } from '@/hooks/useChatStore';
import { usePromptStore } from '@/hooks/usePromptStore';
import { getAssistantTopics, pickAssistantEntryTopic } from '@/lib/chat/topic-tree';
import type { Assistant } from '@/types/assistant';

/** 导出类型：`UseIndexPageActionsOptions`。 */
export interface UseIndexPageActionsOptions {
  readonly activeAssistantId: string | null;
  readonly clickAssistantToShowTopic: boolean;
  readonly close: (name: DialogName) => void;
  readonly focusAssistantTab: () => void;
  readonly focusTopicTab: () => void;
  readonly open: (name: DialogName) => void;
  readonly setEditingAssistant: Dispatch<SetStateAction<Assistant | null>>;
  readonly sidebarPosition: 'left' | 'right';
  readonly t: TFunction;
}

/**
 * 导出 Hook：`useIndexPageActions`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useIndexPageActions({
  activeAssistantId,
  clickAssistantToShowTopic,
  close,
  focusAssistantTab,
  focusTopicTab,
  open,
  setEditingAssistant,
  sidebarPosition,
  t,
}: UseIndexPageActionsOptions) {
  const chatActions = useChatStore((state) => ({
    setActiveAssistant: state.setActiveAssistant,
    setActiveTopic: state.setActiveTopic,
    activateLocalEmptyTopic: state.activateLocalEmptyTopic,
    clearTopicMessages: state.clearTopicMessages,
    reconcileWithAssistants: state.reconcileWithAssistants,
  }), shallow);
  const promptActions = usePromptStore((state) => ({
    addPrompt: state.addPrompt,
    deletePrompt: state.deletePrompt,
  }), shallow);
  const assistantActions = useAssistantStore((state) => ({
    assistants: state.assistants,
    presets: state.presets,
    presetSections: state.presetSections,
    userPresets: state.userPresets,
    createPreset: state.createPreset,
    updatePreset: state.updatePreset,
    deletePresets: state.deletePresets,
    importPresets: state.importPresets,
    exportPresets: state.exportPresets,
    createAssistantFromPreset: state.createAssistantFromPreset,
    updateAssistantConfig: state.updateAssistantConfig,
    deleteAssistant: state.deleteAssistant,
    reorderAssistants: state.reorderAssistants,
    createTopic: state.createTopic,
    deleteTopic: state.deleteTopic,
    renameTopic: state.renameTopic,
    updateTopicMeta: state.updateTopicMeta,
    togglePinTopic: state.togglePinTopic,
    moveTopicToAssistant: state.moveTopicToAssistant,
    reorderTopics: state.reorderTopics,
  }), shallow);

  /** 以当前激活助手为归属创建一个新话题。 */
  const handleCreateTopic = useCallback(() => {
    const assistantId = activeAssistantId || assistantActions.assistants[0]?.id || null;
    if (!assistantId) return;
    const topicId = assistantActions.createTopic(assistantId, t('chat.defaultTopicTitle'));
    if (!topicId) return;
    chatActions.activateLocalEmptyTopic(topicId);
  }, [activeAssistantId, assistantActions, chatActions, t]);

  /**
   * 侧边栏内选择某个助手后，立即切换到该助手。
   *
   * @param assistant - 用户选中的助手。
   */
  const handleSelectAssistantFromSidebar = useCallback((assistant: Assistant) => {
    chatActions.setActiveAssistant(assistant.id);
    if (sidebarPosition === 'left' && clickAssistantToShowTopic) focusTopicTab();
  }, [chatActions, clickAssistantToShowTopic, focusTopicTab, sidebarPosition]);

  /**
   * 打开助手编辑器并加载现有助手数据。
   *
   * @param assistant - 待编辑的助手。
   */
  const handleEditAssistant = useCallback((assistant: Assistant) => {
    setEditingAssistant(assistant);
    open('showAssistantEditor');
  }, [open, setEditingAssistant]);

  /** 从启动台或其它“商店”入口打开完整助手商店。 */
  const openAssistantStore = useCallback(() => {
    close('showAssistantRolePicker');
    focusAssistantTab();
    open('showAssistantStore');
  }, [close, focusAssistantTab, open]);

  /** 从助手侧栏打开轻量角色选择弹层。 */
  const openAssistantRolePicker = useCallback(() => {
    close('showAssistantStore');
    focusAssistantTab();
    open('showAssistantRolePicker');
  }, [close, focusAssistantTab, open]);

  /**
   * 基于预设创建助手并收起指定承载弹层。
   *
   * @param presetId - 助手预设 ID。
   * @param dialogName - 本次创建完成后应关闭的弹层。
   */
  const createAssistantFromPresetAndClose = useCallback((presetId: string, dialogName: DialogName) => {
    const createdAssistantId = assistantActions.createAssistantFromPreset(presetId);
    if (!createdAssistantId) return;
    chatActions.setActiveAssistant(createdAssistantId);
    close(dialogName);
    focusAssistantTab();
  }, [assistantActions, chatActions, close, focusAssistantTab]);

  /**
   * 基于完整商店中的预设创建新的用户助手，并保持左栏停留在助手标签。
   *
   * @param presetId - 助手预设 ID。
   */
  const handleCreateAssistantFromStorePreset = useCallback((presetId: string) => {
    createAssistantFromPresetAndClose(presetId, 'showAssistantStore');
  }, [createAssistantFromPresetAndClose]);

  /**
   * 基于轻量选择弹窗中的预设直接创建新的用户助手。
   *
   * @param presetId - 助手预设 ID。
   */
  const handleCreateAssistantFromRolePicker = useCallback((presetId: string) => {
    createAssistantFromPresetAndClose(presetId, 'showAssistantRolePicker');
  }, [createAssistantFromPresetAndClose]);

  /**
   * 外部指令（选择助手/元素入口）会走这里：
   * - 约束：外部入口一律进入“话题（topic）”并投递消息
   */
  const ensureActiveTopicForExternalSend = useCallback((): string | null => {
    const assistantId = activeAssistantId || assistantActions.assistants[0]?.id || null;
    if (!assistantId) return null;

    const chat = useChatStore.getState();

    if (chat.runtime.activeAssistantId !== assistantId) {
      chat.setActiveAssistant(assistantId);
    }

    const assistants = useAssistantStore.getState().assistants;
    const list = getAssistantTopics(assistants, assistantId);
    const preferred = chat.runtime.activeTopicId;
    const preferredValid = Boolean(preferred && list.some((topic) => topic.id === preferred));
    const next = preferredValid
      ? preferred!
      : (
        pickAssistantEntryTopic(assistants.find((assistant) => assistant.id === assistantId) ?? null)?.id
        ?? ''
      );
    let createdEmptyTopic = false;
    const targetId = next || (() => {
      const createdTopicId = useAssistantStore.getState().createTopic(assistantId, t('chat.defaultTopicTitle'));
      createdEmptyTopic = Boolean(createdTopicId);
      return createdTopicId;
    })();
    if (!targetId) return null;

    if (chat.activeConversationKey !== targetId || chat.runtime.activeTopicId !== targetId) {
      if (createdEmptyTopic) chat.activateLocalEmptyTopic(targetId);
      else chat.setActiveTopic(targetId);
    }

    return targetId;
  }, [activeAssistantId, assistantActions.assistants, t]);

  /**
   * 选择一个话题，并在必要时同步切换助手。
   *
   * @param topicId - 目标 topic ID。
   */
  const handleSelectTopic = useCallback((topicId: string) => {
    const sid = String(topicId || '').trim();
    if (!sid) return;
    chatActions.setActiveTopic(sid);
  }, [chatActions]);

  /**
   * 删除指定话题。
   *
   * @param id - topic ID。
   */
  const handleDeleteConversation = useCallback((id: string) => {
    const key = String(id || '').trim();
    if (!key) return;
    assistantActions.deleteTopic(key);
  }, [assistantActions]);

  /**
   * 重命名指定话题。
   *
   * @param id - topic ID。
   * @param name - 新名称。
   */
  const handleRenameConversation = useCallback((id: string, name: string) => {
    const key = String(id || '').trim();
    if (!key) return;
    assistantActions.renameTopic(key, name, true);
  }, [assistantActions]);

  /**
   * 切换话题置顶状态。
   *
   * @param id - topic ID。
   */
  const handleTogglePinConversation = useCallback((id: string) => {
    const key = String(id || '').trim();
    if (!key) return;
    assistantActions.togglePinTopic(key);
  }, [assistantActions]);

  /**
   * 清空指定话题的消息内容。
   *
   * @param id - 目标话题 ID。
   */
  const handleClearMessagesConversation = useCallback((id: string) => {
    chatActions.clearTopicMessages(id);
  }, [chatActions]);

  return {
    assistantActions,
    chatActions,
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
  };
}
