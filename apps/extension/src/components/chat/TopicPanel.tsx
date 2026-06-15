/**
 * 说明：`TopicPanel` 组件模块。
 *
 * 职责：
 * - 承载当前话题自己的设置项；
 * - 保证模型、采样、上下文长度和 modelParams 都写入 topic-owned 字段。
 *
 * 边界：
 * - 本文件不读取或保存助手配置；
 * - 自动上下文模式继续由 `PageContextBar` 管理，这里不复制第二个入口。
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { TopicConversation } from '@/types/chat';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { TopicGenerationSettingsSection } from '@/components/chat/TopicGenerationSettingsSection';
import {
  PANEL_CONTROL_FOCUS_CLASS_NAME,
  SettingRow,
  SettingSection,
} from '@/components/chat/TopicPanel.settings-layout';
import {
  buildTopicGenerationSettingsDraft,
  buildTopicGenerationSettingsPatch,
  getTransportProtocol,
  type TopicGenerationDefaults,
  type TopicGenerationSettingsDraft,
} from '@/components/chat/topic-generation-settings';
import { useModelOptions } from '@/hooks/useModelOptions';
import { cn } from '@/lib/utils';

/** TopicPanel 只关心的话题级字段。 */
export type TopicPanelTopic = Pick<
  TopicConversation,
  | 'id'
  | 'assistantId'
  | 'title'
  | 'topicPrompt'
  | 'model'
  | 'temperature'
  | 'topP'
  | 'maxTokens'
  | 'contextLength'
  | 'modelParams'
>;

/** TopicPanel 组件入参。 */
export interface TopicPanelProps {
  /** 当前话题快照。 */
  topic: TopicPanelTopic;
  /** 全局默认生成参数，用于 topic 未覆盖时展示与回落。 */
  generationDefaults: TopicGenerationDefaults;
  /** 保存 topic-owned 字段。 */
  onSaveTopic: (patch: Partial<Pick<
    TopicConversation,
    'topicPrompt' | 'model' | 'temperature' | 'topP' | 'maxTokens' | 'contextLength' | 'modelParams'
  >>) => void;
  /** 关闭弹窗。 */
  onClose: () => void;
  /** 打开模型管理。 */
  onOpenModelManager?: () => void;
  /** 当前助手是否启用了外部联网搜索 Provider。 */
  externalWebSearchActive?: boolean;
}

interface TopicPanelDraftState {
  /** 当前话题提示词草稿。 */
  topicPrompt: string;
  /** 当前话题生成参数草稿。 */
  generation: TopicGenerationSettingsDraft;
}

/**
 * 构建话题设置本地草稿。
 *
 * @param topic - 当前话题快照。
 * @returns 可供表单编辑的话题级草稿。
 */
function buildDraftState(
  topic: TopicPanelTopic,
  generationDefaults: TopicGenerationDefaults,
  transportProtocol?: ReturnType<typeof getTransportProtocol>,
): TopicPanelDraftState {
  return {
    topicPrompt: topic.topicPrompt ?? '',
    generation: buildTopicGenerationSettingsDraft({
      topic,
      defaults: generationDefaults,
      transportProtocol,
    }),
  };
}

/** 当前话题自己的设置表单。 */
export function TopicPanel({
  topic,
  generationDefaults,
  onSaveTopic,
  onClose,
  onOpenModelManager,
  externalWebSearchActive,
}: TopicPanelProps) {
  const { t } = useTranslation();
  const { modelMap } = useModelOptions();
  const initialModel = topic.model?.trim() || generationDefaults.model;
  const initialTransportProtocol = getTransportProtocol(modelMap, initialModel);
  const initialDraft = useMemo(
    () => buildDraftState(topic, generationDefaults, initialTransportProtocol),
    [generationDefaults, initialTransportProtocol, topic],
  );
  const [draft, setDraft] = useState<TopicPanelDraftState>(() => initialDraft);

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft]);

  const topicPatch = useMemo<ReturnType<typeof buildTopicGenerationSettingsPatch>>(() => (
    buildTopicGenerationSettingsPatch({
      draft: draft.generation,
      topic,
      defaults: generationDefaults,
    })
  ), [draft.generation, generationDefaults, topic]);

  const savePatch = useMemo<Partial<Pick<
    TopicConversation,
    'topicPrompt' | 'model' | 'temperature' | 'topP' | 'maxTokens' | 'contextLength' | 'modelParams'
  >>>(() => {
    const nextTopicPrompt = draft.topicPrompt;
    return {
      ...topicPatch.patch,
      ...(nextTopicPrompt === (topic.topicPrompt ?? '') ? {} : { topicPrompt: nextTopicPrompt || undefined }),
    };
  }, [draft.topicPrompt, topic.topicPrompt, topicPatch.patch]);

  /**
   * 更新单个 draft 字段。
   *
   * @param patch - 要合并到当前草稿的局部字段。
   */
  const patchDraft = (patch: Partial<TopicPanelDraftState>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  /** 更新生成参数草稿。 */
  const patchGenerationDraft = (patch: Partial<TopicGenerationSettingsDraft>) => {
    setDraft((current) => ({
      ...current,
      generation: {
        ...current.generation,
        ...patch,
      },
    }));
  };

  /**
   * 保存当前话题草稿。
   */
  const handleSave = () => {
    if (topicPatch.invalid) return;
    if (Object.keys(savePatch).length > 0) {
      onSaveTopic(savePatch);
    }
    onClose();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-7">
          <TopicGenerationSettingsSection
            draft={draft.generation}
            onDraftChange={patchGenerationDraft}
            defaults={generationDefaults}
            onOpenModelManager={onOpenModelManager}
            externalWebSearchActive={externalWebSearchActive}
          />

          <SettingSection
            title={t('topicSettings.sections.prompt')}
            description={t('topicSettings.promptSectionDescription')}
            testId="topic-settings-prompt-section"
          >
            <SettingRow title={t('sidebar.topicPrompt')} description={t('sidebar.topicPromptDesc')} stacked>
              <Textarea
                value={draft.topicPrompt}
                onChange={(event) => patchDraft({ topicPrompt: event.target.value })}
                placeholder={t('sidebar.topicPromptPlaceholder')}
                aria-label={t('sidebar.topicPrompt')}
                className={cn(
                  'min-h-[168px] resize-y rounded-md border-input bg-background px-3 py-2 text-xs leading-5',
                  PANEL_CONTROL_FOCUS_CLASS_NAME,
                )}
              />
            </SettingRow>
          </SettingSection>
        </div>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 px-6 py-4">
        <Button variant="outline" size="sm" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={topicPatch.invalid}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
