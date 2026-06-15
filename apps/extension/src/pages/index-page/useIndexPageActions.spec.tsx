/**
 * 说明：`useIndexPageActions.spec` 页面模块。
 *
 * 职责：
 * - 承载入口分流相关的 hook 回归测试；
 * - 守住“启动台助手商店”和“侧栏创建助手”分别打开不同弹层的页面语义。
 *
 * 边界：
 * - 本文件只验证页面动作编排，不覆盖完整视图树或真实 Zustand store 持久化。
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useIndexPageActions } from './useIndexPageActions';

const {
  setActiveAssistantMock,
  setActiveTopicMock,
  activateLocalEmptyTopicMock,
  clearTopicMessagesMock,
  reconcileWithAssistantsMock,
  addPromptMock,
  deletePromptMock,
  createAssistantFromPresetMock,
  updateAssistantConfigMock,
  deleteAssistantMock,
  reorderAssistantsMock,
  createTopicMock,
  deleteTopicMock,
  renameTopicMock,
  updateTopicMetaMock,
  togglePinTopicMock,
  moveTopicToAssistantMock,
  reorderTopicsMock,
  createPresetMock,
  updatePresetMock,
  deletePresetsMock,
  importPresetsMock,
  exportPresetsMock,
} = vi.hoisted(() => ({
  setActiveAssistantMock: vi.fn(),
  setActiveTopicMock: vi.fn(),
  activateLocalEmptyTopicMock: vi.fn(),
  clearTopicMessagesMock: vi.fn(),
  reconcileWithAssistantsMock: vi.fn(),
  addPromptMock: vi.fn(),
  deletePromptMock: vi.fn(),
  createAssistantFromPresetMock: vi.fn(() => 'assistant-created'),
  updateAssistantConfigMock: vi.fn(),
  deleteAssistantMock: vi.fn(),
  reorderAssistantsMock: vi.fn(),
  createTopicMock: vi.fn(() => 'topic-created'),
  deleteTopicMock: vi.fn(),
  renameTopicMock: vi.fn(),
  updateTopicMetaMock: vi.fn(),
  togglePinTopicMock: vi.fn(),
  moveTopicToAssistantMock: vi.fn(),
  reorderTopicsMock: vi.fn(),
  createPresetMock: vi.fn(() => 'preset-created'),
  updatePresetMock: vi.fn(),
  deletePresetsMock: vi.fn(),
  importPresetsMock: vi.fn(() => []),
  exportPresetsMock: vi.fn(() => []),
}));

vi.mock('@/hooks/useChatStore', () => ({
  useChatStore: Object.assign(
    <T,>(selector: (state: {
      setActiveAssistant: typeof setActiveAssistantMock;
      setActiveTopic: typeof setActiveTopicMock;
      activateLocalEmptyTopic: typeof activateLocalEmptyTopicMock;
      clearTopicMessages: typeof clearTopicMessagesMock;
      reconcileWithAssistants: typeof reconcileWithAssistantsMock;
    }) => T) => selector({
      setActiveAssistant: setActiveAssistantMock,
      setActiveTopic: setActiveTopicMock,
      activateLocalEmptyTopic: activateLocalEmptyTopicMock,
      clearTopicMessages: clearTopicMessagesMock,
      reconcileWithAssistants: reconcileWithAssistantsMock,
    }),
    {
      getState: () => ({
        runtime: {
          activeAssistantId: 'assistant-1',
          activeTopicId: 'topic-1',
        },
        activeConversationKey: 'topic-1',
        setActiveAssistant: setActiveAssistantMock,
        setActiveTopic: setActiveTopicMock,
        activateLocalEmptyTopic: activateLocalEmptyTopicMock,
      }),
    },
  ),
}));

vi.mock('@/hooks/usePromptStore', () => ({
  usePromptStore: <T,>(selector: (state: {
    addPrompt: typeof addPromptMock;
    deletePrompt: typeof deletePromptMock;
  }) => T) => selector({
    addPrompt: addPromptMock,
    deletePrompt: deletePromptMock,
  }),
}));

vi.mock('@/hooks/useAssistantStore', () => ({
  useAssistantStore: Object.assign(
    <T,>(selector: (state: {
      assistants: Array<{ id: string; topics: Array<{ id: string }> }>;
      presets: [];
      presetSections: [];
      userPresets: [];
      createPreset: typeof createPresetMock;
      updatePreset: typeof updatePresetMock;
      deletePresets: typeof deletePresetsMock;
      importPresets: typeof importPresetsMock;
      exportPresets: typeof exportPresetsMock;
      createAssistantFromPreset: typeof createAssistantFromPresetMock;
      updateAssistantConfig: typeof updateAssistantConfigMock;
      deleteAssistant: typeof deleteAssistantMock;
      reorderAssistants: typeof reorderAssistantsMock;
      createTopic: typeof createTopicMock;
      deleteTopic: typeof deleteTopicMock;
      renameTopic: typeof renameTopicMock;
      updateTopicMeta: typeof updateTopicMetaMock;
      togglePinTopic: typeof togglePinTopicMock;
      moveTopicToAssistant: typeof moveTopicToAssistantMock;
      reorderTopics: typeof reorderTopicsMock;
    }) => T) => selector({
      assistants: [{ id: 'assistant-1', topics: [{ id: 'topic-1' }] }],
      presets: [],
      presetSections: [],
      userPresets: [],
      createPreset: createPresetMock,
      updatePreset: updatePresetMock,
      deletePresets: deletePresetsMock,
      importPresets: importPresetsMock,
      exportPresets: exportPresetsMock,
      createAssistantFromPreset: createAssistantFromPresetMock,
      updateAssistantConfig: updateAssistantConfigMock,
      deleteAssistant: deleteAssistantMock,
      reorderAssistants: reorderAssistantsMock,
      createTopic: createTopicMock,
      deleteTopic: deleteTopicMock,
      renameTopic: renameTopicMock,
      updateTopicMeta: updateTopicMetaMock,
      togglePinTopic: togglePinTopicMock,
      moveTopicToAssistant: moveTopicToAssistantMock,
      reorderTopics: reorderTopicsMock,
    }),
    {
      getState: () => ({
        assistants: [{ id: 'assistant-1', topics: [{ id: 'topic-1' }] }],
        createTopic: createTopicMock,
      }),
    },
  ),
}));

describe('useIndexPageActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAssistantFromPresetMock.mockReturnValue('assistant-created');
    createTopicMock.mockReturnValue('topic-created');
  });

  it('openAssistantStore 只打开完整商店，并先关闭轻量选择弹窗', () => {
    const open = vi.fn();
    const close = vi.fn();
    const focusAssistantTab = vi.fn();

    const { result } = renderHook(() => useIndexPageActions({
      activeAssistantId: 'assistant-1',
      clickAssistantToShowTopic: false,
      close,
      focusAssistantTab,
      focusTopicTab: vi.fn(),
      open,
      setEditingAssistant: vi.fn(),
      sidebarPosition: 'left',
      t: ((key: string) => key) as never,
    }));

    act(() => {
      result.current.openAssistantStore();
    });

    expect(close).toHaveBeenCalledWith('showAssistantRolePicker');
    expect(open).toHaveBeenCalledWith('showAssistantStore');
    expect(open).not.toHaveBeenCalledWith('showAssistantRolePicker');
    expect(focusAssistantTab).toHaveBeenCalledTimes(1);
  });

  it('openAssistantRolePicker 只打开轻量选择弹窗，并先关闭完整商店', () => {
    const open = vi.fn();
    const close = vi.fn();
    const focusAssistantTab = vi.fn();

    const { result } = renderHook(() => useIndexPageActions({
      activeAssistantId: 'assistant-1',
      clickAssistantToShowTopic: false,
      close,
      focusAssistantTab,
      focusTopicTab: vi.fn(),
      open,
      setEditingAssistant: vi.fn(),
      sidebarPosition: 'left',
      t: ((key: string) => key) as never,
    }));

    act(() => {
      result.current.openAssistantRolePicker();
    });

    expect(close).toHaveBeenCalledWith('showAssistantStore');
    expect(open).toHaveBeenCalledWith('showAssistantRolePicker');
    expect(open).not.toHaveBeenCalledWith('showAssistantStore');
    expect(focusAssistantTab).toHaveBeenCalledTimes(1);
  });

  it('handleCreateAssistantFromRolePicker 创建完成后只关闭轻量选择弹窗', () => {
    const close = vi.fn();
    const focusAssistantTab = vi.fn();

    const { result } = renderHook(() => useIndexPageActions({
      activeAssistantId: 'assistant-1',
      clickAssistantToShowTopic: false,
      close,
      focusAssistantTab,
      focusTopicTab: vi.fn(),
      open: vi.fn(),
      setEditingAssistant: vi.fn(),
      sidebarPosition: 'left',
      t: ((key: string) => key) as never,
    }));

    act(() => {
      result.current.handleCreateAssistantFromRolePicker('preset-role');
    });

    expect(createAssistantFromPresetMock).toHaveBeenCalledWith('preset-role');
    expect(setActiveAssistantMock).toHaveBeenCalledWith('assistant-created');
    expect(close).toHaveBeenCalledWith('showAssistantRolePicker');
    expect(close).not.toHaveBeenCalledWith('showAssistantStore');
    expect(focusAssistantTab).toHaveBeenCalledTimes(1);
  });

  it('handleCreateAssistantFromStorePreset 创建完成后只关闭完整商店', () => {
    const close = vi.fn();
    const focusAssistantTab = vi.fn();

    const { result } = renderHook(() => useIndexPageActions({
      activeAssistantId: 'assistant-1',
      clickAssistantToShowTopic: false,
      close,
      focusAssistantTab,
      focusTopicTab: vi.fn(),
      open: vi.fn(),
      setEditingAssistant: vi.fn(),
      sidebarPosition: 'left',
      t: ((key: string) => key) as never,
    }));

    act(() => {
      result.current.handleCreateAssistantFromStorePreset('preset-store');
    });

    expect(createAssistantFromPresetMock).toHaveBeenCalledWith('preset-store');
    expect(setActiveAssistantMock).toHaveBeenCalledWith('assistant-created');
    expect(close).toHaveBeenCalledWith('showAssistantStore');
    expect(close).not.toHaveBeenCalledWith('showAssistantRolePicker');
    expect(focusAssistantTab).toHaveBeenCalledTimes(1);
  });

  it('handleCreateTopic 创建空话题后直接激活本地 ready 空态', () => {
    const { result } = renderHook(() => useIndexPageActions({
      activeAssistantId: 'assistant-1',
      clickAssistantToShowTopic: false,
      close: vi.fn(),
      focusAssistantTab: vi.fn(),
      focusTopicTab: vi.fn(),
      open: vi.fn(),
      setEditingAssistant: vi.fn(),
      sidebarPosition: 'left',
      t: ((key: string) => key) as never,
    }));

    act(() => {
      result.current.handleCreateTopic();
    });

    expect(createTopicMock).toHaveBeenCalledWith('assistant-1', 'chat.defaultTopicTitle');
    expect(activateLocalEmptyTopicMock).toHaveBeenCalledWith('topic-created');
    expect(setActiveTopicMock).not.toHaveBeenCalledWith('topic-created');
  });
});
