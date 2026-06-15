/**
 * 说明：`IndexPageOverlays.spec` 页面模块。
 *
 * 职责：
 * - 承载 `IndexPageOverlays.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IndexPageOverlays } from './IndexPageOverlays';

const quickPhraseManagerMock = vi.hoisted(() => vi.fn());

vi.mock('@/components/chat/ModelPickerDialog', () => ({
  ModelPickerDialog: () => null,
}));

vi.mock('@/components/chat/AssistantEditor', () => ({
  AssistantEditor: () => null,
}));

vi.mock('@/components/chat/AssistantStoreDialog', () => ({
  AssistantStoreDialog: () => null,
}));

vi.mock('@/components/chat/AssistantRolePickerDialog', () => ({
  AssistantRolePickerDialog: () => null,
}));

vi.mock('@/components/chat/ExtensionSettings', () => ({
  ExtensionSettings: () => null,
}));

vi.mock('@/components/files/FilesDialog', () => ({
  FilesDialog: () => null,
}));

vi.mock('@/components/launchpad/LaunchpadDialog', () => ({
  LaunchpadDialog: () => null,
}));

vi.mock('@/components/chat/MultiModelSelector', () => ({
  MultiModelSelector: () => null,
}));

vi.mock('@/components/chat/PromptLibrary', () => ({
  PromptLibrary: () => null,
}));

vi.mock('@/components/chat/QuickPhraseManager', () => ({
  QuickPhraseManager: (props: unknown) => {
    quickPhraseManagerMock(props);
    return null;
  },
}));

vi.mock('@/components/chat/SearchPopup', () => ({
  SearchPopup: () => null,
}));

vi.mock('./TopicSettingsDialog', () => ({
  TopicSettingsDialog: ({ open }: { open: boolean }) => (open ? <div>topic-settings-dialog</div> : null),
}));

describe('IndexPageOverlays', () => {
  beforeEach(() => {
    quickPhraseManagerMock.mockClear();
  });

  it('showSettings 打开时会把话题设置挂到 overlay dialog，而不是主布局侧栏', async () => {
    render(
      <IndexPageOverlays
        activeConversationKey="topic-1"
        activeAssistantId="assistant-1"
        activeModel="openai/gpt-5.4"
        allTopics={[]}
        close={vi.fn()}
        dialogs={{
          showSettings: true,
          showPrompts: false,
          showExtSettings: false,
          showModelPicker: false,
          showTranslation: false,
          showGlobalSearch: false,
          showAssistantStore: false,
          showAssistantRolePicker: false,
          showAssistantEditor: false,
          showCompare: false,
          showPhrases: false,
          showLaunchpad: false,
          showFiles: false,
        }}
        editingAssistant={null}
        extSettingsTab="general"
        handleApplyPromptTemplate={vi.fn()}
        handleCreateAssistantFromRolePicker={vi.fn()}
        handleCreateAssistantFromStorePreset={vi.fn()}
        handleSelectTopic={vi.fn()}
        hasLoadedMessages={false}
        hasResolvedTopic
        models={[{ id: 'openai/gpt-5.4' }]}
        onCloseAssistantEditor={vi.fn()}
        onConfirmCompare={vi.fn()}
        onOpenTarget={vi.fn()}
        onOpenMcpSettings={vi.fn()}
        onPendingJump={vi.fn()}
        onTabChange={vi.fn()}
        openModelManager={vi.fn()}
        openMcpSettings={vi.fn()}
        prompts={[]}
        promptActions={{
          addPrompt: vi.fn(),
          deletePrompt: vi.fn(),
        }}
        updateAssistantConfig={vi.fn()}
        updateTopicMeta={vi.fn()}
        builtinPresets={[]}
        userPresets={[]}
        presetSections={[]}
        createPreset={vi.fn(() => '')}
        updatePreset={vi.fn()}
        deletePresets={vi.fn()}
        importPresets={vi.fn(() => [])}
        exportPresets={vi.fn(() => [])}
      />,
    );

    expect(await screen.findByText('topic-settings-dialog')).toBeInTheDocument();
  });

  it('打开快捷短语管理时会传入当前助手 ID', () => {
    render(
      <IndexPageOverlays
        activeConversationKey="topic-1"
        activeAssistantId="assistant-1"
        activeModel="openai/gpt-5.4"
        allTopics={[]}
        close={vi.fn()}
        dialogs={{
          showSettings: false,
          showPrompts: false,
          showExtSettings: false,
          showModelPicker: false,
          showTranslation: false,
          showGlobalSearch: false,
          showAssistantStore: false,
          showAssistantRolePicker: false,
          showAssistantEditor: false,
          showCompare: false,
          showPhrases: true,
          showLaunchpad: false,
          showFiles: false,
        }}
        editingAssistant={null}
        extSettingsTab="general"
        handleApplyPromptTemplate={vi.fn()}
        handleCreateAssistantFromRolePicker={vi.fn()}
        handleCreateAssistantFromStorePreset={vi.fn()}
        handleSelectTopic={vi.fn()}
        hasLoadedMessages={false}
        hasResolvedTopic
        models={[{ id: 'openai/gpt-5.4' }]}
        onCloseAssistantEditor={vi.fn()}
        onConfirmCompare={vi.fn()}
        onOpenTarget={vi.fn()}
        onOpenMcpSettings={vi.fn()}
        onPendingJump={vi.fn()}
        onTabChange={vi.fn()}
        openModelManager={vi.fn()}
        openMcpSettings={vi.fn()}
        prompts={[]}
        promptActions={{
          addPrompt: vi.fn(),
          deletePrompt: vi.fn(),
        }}
        updateAssistantConfig={vi.fn()}
        updateTopicMeta={vi.fn()}
        builtinPresets={[]}
        userPresets={[]}
        presetSections={[]}
        createPreset={vi.fn(() => '')}
        updatePreset={vi.fn()}
        deletePresets={vi.fn()}
        importPresets={vi.fn(() => [])}
        exportPresets={vi.fn(() => [])}
      />,
    );

    expect(quickPhraseManagerMock).toHaveBeenCalledWith(expect.objectContaining({
      open: true,
      activeAssistantId: 'assistant-1',
    }));
  });
});
