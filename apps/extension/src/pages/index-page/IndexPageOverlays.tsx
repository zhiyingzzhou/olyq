/**
 * 说明：`IndexPageOverlays` 页面模块。
 *
 * 职责：
 * - 承载 `IndexPageOverlays` 相关的当前文件实现与模块边界；
 * - 对外暴露 `IndexPageOverlaysProps`、`IndexPageOverlays` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { defaultConversationModelFilter } from '@/lib/ai/model-filters';
import { AssistantEditor } from '@/components/chat/AssistantEditor';
import { AssistantRolePickerDialog } from '@/components/chat/AssistantRolePickerDialog';
import { AssistantStoreDialog } from '@/components/chat/AssistantStoreDialog';
import { ExtensionSettings } from '@/components/chat/ExtensionSettings';
import { ModelPickerDialog } from '@/components/chat/ModelPickerDialog';
import { MultiModelSelector } from '@/components/chat/MultiModelSelector';
import { PromptLibrary } from '@/components/chat/PromptLibrary';
import { QuickPhraseManager } from '@/components/chat/QuickPhraseManager';
import { SearchPopup } from '@/components/chat/SearchPopup';
import { FilesDialog } from '@/components/files/FilesDialog';
import { LaunchpadDialog } from '@/components/launchpad/LaunchpadDialog';
import type { DialogName, DialogState } from '@/hooks/useDialogState';
import type { StoredAssistantPresetDraft } from '@/lib/assistant/preset-storage';
import type { Assistant, AssistantConfig, AssistantPreset, StoredAssistantPreset } from '@/types/assistant';
import type { AssistantPresetSection } from '@/data/role-templates';
import type { PromptTemplate, Topic, TopicSummary } from '@/types/chat';
import type { LaunchpadTarget } from '@/components/launchpad/LaunchpadDialog';
import { TopicSettingsDialog } from './TopicSettingsDialog';

/** 导出类型：`IndexPageOverlaysProps`。 */
export interface IndexPageOverlaysProps {
  readonly activeConversationKey: string | null;
  readonly activeAssistantId: string | null;
  readonly activeModel: string;
  readonly allTopics: TopicSummary[];
  readonly close: (name: DialogName) => void;
  readonly dialogs: DialogState;
  readonly editingAssistant: Assistant | null;
  readonly extSettingsTab: string;
  readonly handleApplyPromptTemplate: (content: string) => void;
  readonly handleCreateAssistantFromRolePicker: (presetId: string) => void;
  readonly handleCreateAssistantFromStorePreset: (presetId: string) => void;
  readonly handleSelectTopic: (topicId: string) => void;
  readonly hasLoadedMessages: boolean;
  readonly hasResolvedTopic: boolean;
  readonly models: Array<{ id: string }>;
  readonly onCloseAssistantEditor: () => void;
  readonly onConfirmCompare: (modelIds: string[]) => void;
  readonly onOpenTarget: (target: LaunchpadTarget) => void;
  readonly onOpenMcpSettings: () => void;
  readonly onPendingJump: (topicId: string, messageId?: string) => void;
  readonly onTabChange: (tabId: string) => void;
  readonly openModelManager: () => void;
  readonly openMcpSettings: () => void;
  readonly prompts: PromptTemplate[];
  readonly promptActions: {
    addPrompt: (prompt: { title: string; content: string; category: string }) => void;
    deletePrompt: (id: string) => void;
  };
  readonly updateAssistantConfig: (assistantId: string, patch: Partial<AssistantConfig>) => void;
  readonly updateTopicMeta: (topicId: string, patch: Partial<Omit<Topic, 'id' | 'assistantId'>>) => void;
  readonly builtinPresets: AssistantPreset[];
  readonly userPresets: StoredAssistantPreset[];
  readonly presetSections: AssistantPresetSection[];
  readonly createPreset: (draft: StoredAssistantPresetDraft) => string;
  readonly updatePreset: (presetId: string, updates: Partial<StoredAssistantPresetDraft>) => void;
  readonly deletePresets: (presetIds: string[]) => void;
  readonly importPresets: (input: unknown) => StoredAssistantPreset[];
  readonly exportPresets: (presetIds?: string[]) => StoredAssistantPreset[];
}

/**
 * 导出组件：`IndexPageOverlays`。
 *
 * @remarks
 * 负责承载当前文件对应的界面渲染、交互编排和视图层边界。
 */
export function IndexPageOverlays({
  activeConversationKey,
  activeAssistantId,
  activeModel,
  allTopics,
  close,
  dialogs,
  editingAssistant,
  extSettingsTab,
  handleApplyPromptTemplate,
  handleCreateAssistantFromRolePicker,
  handleCreateAssistantFromStorePreset,
  handleSelectTopic,
  hasLoadedMessages,
  hasResolvedTopic,
  onCloseAssistantEditor,
  onConfirmCompare,
  onOpenTarget,
  onOpenMcpSettings,
  onPendingJump,
  onTabChange,
  openModelManager,
  prompts,
  promptActions,
  updateAssistantConfig,
  updateTopicMeta,
  builtinPresets,
  userPresets,
  presetSections,
  createPreset,
  updatePreset,
  deletePresets,
  importPresets,
  exportPresets,
}: IndexPageOverlaysProps) {
  return (
    <>
      <PromptLibrary
        open={dialogs.showPrompts}
        onClose={() => close('showPrompts')}
        userPrompts={prompts}
        onAdd={promptActions.addPrompt}
        onDelete={promptActions.deletePrompt}
        onApply={handleApplyPromptTemplate}
      />

      <AssistantStoreDialog
        open={dialogs.showAssistantStore}
        builtinPresets={builtinPresets}
        userPresets={userPresets}
        presetSections={presetSections}
        onClose={() => close('showAssistantStore')}
        onCreateAssistantFromPreset={handleCreateAssistantFromStorePreset}
        onCreatePreset={createPreset}
        onUpdatePreset={updatePreset}
        onDeletePresets={deletePresets}
        onImportPresets={importPresets}
        onExportPresets={exportPresets}
      />

      <AssistantRolePickerDialog
        open={dialogs.showAssistantRolePicker}
        templates={builtinPresets}
        sections={presetSections}
        onClose={() => close('showAssistantRolePicker')}
        onSelectTemplate={handleCreateAssistantFromRolePicker}
      />

      {editingAssistant && (
        <AssistantEditor
          open={dialogs.showAssistantEditor}
          onClose={onCloseAssistantEditor}
          assistant={editingAssistant}
          onUpdate={updateAssistantConfig}
          onOpenMcpSettings={onOpenMcpSettings}
        />
      )}

      {dialogs.showExtSettings ? (
        <ExtensionSettings
          open={dialogs.showExtSettings}
          onClose={() => close('showExtSettings')}
          initialTab={extSettingsTab}
          onTabChange={onTabChange}
        />
      ) : null}

      {hasResolvedTopic && (
        <TopicSettingsDialog
          open={dialogs.showSettings}
          onClose={() => close('showSettings')}
          onOpenModelManager={openModelManager}
        />
      )}

      {hasResolvedTopic && activeConversationKey && (
        <ModelPickerDialog
          open={dialogs.showModelPicker}
          value={activeModel}
          onSelect={(modelId) => {
            if (activeConversationKey) updateTopicMeta(activeConversationKey, { model: modelId });
          }}
          onClose={() => close('showModelPicker')}
          filter={defaultConversationModelFilter}
          onOpenModelManager={() => {
            close('showModelPicker');
            openModelManager();
          }}
        />
      )}

      {hasLoadedMessages && (
        <MultiModelSelector
          open={dialogs.showCompare}
          onClose={() => close('showCompare')}
          currentModel={activeModel}
          onConfirm={onConfirmCompare}
        />
      )}

      <QuickPhraseManager
        open={dialogs.showPhrases}
        activeAssistantId={activeAssistantId}
        onClose={() => close('showPhrases')}
      />

      <LaunchpadDialog
        open={dialogs.showLaunchpad}
        onClose={() => close('showLaunchpad')}
        onOpenTarget={onOpenTarget}
      />
      <FilesDialog open={dialogs.showFiles} onClose={() => close('showFiles')} />

      <SearchPopup
        open={dialogs.showGlobalSearch}
        onClose={() => close('showGlobalSearch')}
        topics={allTopics}
        onOpenInChat={(topicId, messageId) => {
          const sid = String(topicId || '').trim();
          if (!sid) return;
          close('showGlobalSearch');
          handleSelectTopic(sid);
          onPendingJump(sid, messageId);
        }}
      />
    </>
  );
}
