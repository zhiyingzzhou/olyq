/**
 * 说明：`TopicGenerationSettingsSection` 组件模块。
 *
 * 职责：
 * - 承载 topic-owned 的模型、采样、上下文长度和 modelParams 编辑；
 * - 复用 provider-aware reasoning 真源，避免聊天输入区和话题设置复制能力判断；
 * - 对外提供草稿构建、校验与 patch 构建 helper，供话题设置保存时复用。
 *
 * 边界：
 * - 本文件只处理话题生成参数表单，不读写 store；
 * - `system prompt` 仍由助手编辑器主表单管理，这里只管理每话题模型与生成参数。
 */
import { useMemo, useState } from 'react';
import { ChevronsUpDown, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useModelOptions } from '@/hooks/useModelOptions';
import type { ProviderReasoningValue } from '@/lib/ai/provider-reasoning';
import {
  buildModelParamsWithProviderReasoning,
  isReasoningBudgetDraftInvalid,
  resolveProviderReasoningDescriptor,
} from '@/lib/ai/provider-reasoning';
import { defaultConversationModelFilter } from '@/lib/ai/model-filters';
import { pickProviderUiMeta } from '@/lib/ai/provider-ui-meta';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ModelPickerDialog } from '@/components/chat/ModelPickerDialog';
import { ProviderIcon } from '@/components/ui/ProviderIcon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { TopicNativeWebSearchSettings } from '@/components/chat/TopicNativeWebSearchSettings';
import {
  PANEL_CONTROL_FOCUS_CLASS_NAME,
  SettingRow,
  SettingSection,
  SliderSettingRow,
} from '@/components/chat/TopicPanel.settings-layout';
import {
  TOPIC_CONTEXT_LENGTH_MAX,
  TOPIC_CONTEXT_LENGTH_MIN,
  TOPIC_CONTEXT_LENGTH_STEP,
  TOPIC_TEMPERATURE_MAX,
  TOPIC_TEMPERATURE_MIN,
  TOPIC_TEMPERATURE_STEP,
  TOPIC_TOP_P_MAX,
  TOPIC_TOP_P_MIN,
  TOPIC_TOP_P_STEP,
  buildReasoningDraftState,
  formatModelParamsDraft,
  getTransportProtocol,
  parseMaxTokensDraft,
  parseModelParamsDraft,
  type TopicGenerationDefaults,
  type TopicGenerationSettingsDraft,
} from '@/components/chat/topic-generation-settings';

/** 话题生成参数组件入参。 */
interface TopicGenerationSettingsSectionProps {
  /** 当前草稿。 */
  draft: TopicGenerationSettingsDraft;
  /** 合并草稿更新。 */
  onDraftChange: (patch: Partial<TopicGenerationSettingsDraft>) => void;
  /** 全局默认值快照。 */
  defaults: TopicGenerationDefaults;
  /** 打开模型管理。 */
  onOpenModelManager?: () => void;
  /** 外部联网搜索是否已在当前助手上启用。 */
  externalWebSearchActive?: boolean;
}

/** 话题模型与生成参数设置分区。 */
export function TopicGenerationSettingsSection({
  draft,
  onDraftChange,
  defaults,
  onOpenModelManager,
  externalWebSearchActive,
}: TopicGenerationSettingsSectionProps) {
  const { t } = useTranslation();
  const { getModelLabel, modelMap, providers } = useModelOptions();
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  const activeModelId = draft.model.trim() || defaults.model;
  const activeModelOption = modelMap.get(activeModelId);
  const activeTransportProtocol = getTransportProtocol(modelMap, activeModelId);
  const providerId = String(activeModelId || '').split('/')[0] || '';
  const provider = providers.find((item) => item.id === providerId);
  const providerUi = pickProviderUiMeta(providerId);
  const hasModelOverride = Boolean(draft.model.trim());

  const parsedModelParams = useMemo(() => parseModelParamsDraft(draft.modelParams), [draft.modelParams]);
  const modelParamsError = parsedModelParams === null ? t('topicSettings.modelParamsInvalid') : null;
  const maxTokensState = useMemo(() => parseMaxTokensDraft(draft.maxTokens), [draft.maxTokens]);
  const maxTokensError = maxTokensState.invalid ? t('topicSettings.maxTokensInvalid') : null;
  const reasoningBudgetError = isReasoningBudgetDraftInvalid(draft.reasoningBudgetText)
    ? t('topicSettings.reasoningBudgetInvalid')
    : null;

  const reasoningDescriptor = useMemo(() => resolveProviderReasoningDescriptor({
    model: activeModelId,
    transportProtocol: activeTransportProtocol,
    modelParams: parsedModelParams === null ? undefined : parsedModelParams,
  }), [activeModelId, activeTransportProtocol, parsedModelParams]);
  /**
   * 根据当前模型重新回填 provider-aware 推理草稿。
   *
   * @param modelOverride - 当前待生效的 topic.model override。
   * @param modelParams - 当前待解析的 `modelParams`。
   * @returns 新的 provider-aware 推理表单状态。
   */
  const syncReasoningDraft = (
    modelOverride: string | undefined,
    modelParams: Record<string, unknown> | undefined,
  ) => buildReasoningDraftState({
    model: modelOverride?.trim() || defaults.model,
    transportProtocol: getTransportProtocol(modelMap, modelOverride?.trim() || defaults.model),
    modelParams,
  });

  /**
   * 当用户直接编辑 JSON 文本时，同步刷新 provider-aware 推理表单回填。
   *
   * @param value - 最新的 JSON 文本草稿。
   */
  const handleModelParamsChange = (value: string) => {
    const parsed = parseModelParamsDraft(value);
    if (parsed === null) {
      onDraftChange({ modelParams: value });
      return;
    }

    onDraftChange({
      modelParams: value,
      ...syncReasoningDraft(draft.model, parsed),
    });
  };

  /**
   * 处理模型选择器的本地草稿更新。
   *
   * @param modelOverride - 新的 topic.model override。
   */
  const handleModelOverrideChange = (modelOverride: string | undefined) => {
    const parsed = parseModelParamsDraft(draft.modelParams);
    onDraftChange({
      model: modelOverride ?? '',
      ...syncReasoningDraft(modelOverride, parsed === null ? undefined : parsed),
    });
  };

  /**
   * 更新 provider-aware 推理表单，并把可识别字段同步回 JSON 文本草稿。
   *
   * @param patch - provider-aware 推理表单局部草稿。
   */
  const patchReasoning = (patch: Partial<Pick<
    TopicGenerationSettingsDraft,
    'reasoningValue' | 'reasoningBudgetText' | 'reasoningExclude'
  >>) => {
    if (parsedModelParams === null || !reasoningDescriptor) return;

    const nextReasoningValue = patch.reasoningValue ?? draft.reasoningValue;
    const nextReasoningBudgetText = patch.reasoningBudgetText ?? draft.reasoningBudgetText;
    const nextReasoningExclude = patch.reasoningExclude ?? draft.reasoningExclude;

    if (isReasoningBudgetDraftInvalid(nextReasoningBudgetText)) {
      onDraftChange({
        reasoningValue: nextReasoningValue,
        reasoningBudgetText: nextReasoningBudgetText,
        reasoningExclude: nextReasoningExclude,
      });
      return;
    }

    const nextModelParams = buildModelParamsWithProviderReasoning({
      model: activeModelId,
      transportProtocol: activeTransportProtocol,
      modelParams: parsedModelParams,
      draft: {
        value: nextReasoningValue,
        budgetText: nextReasoningBudgetText,
        exclude: nextReasoningExclude,
      },
    });

    onDraftChange({
      reasoningValue: nextReasoningValue,
      reasoningBudgetText: nextReasoningBudgetText,
      reasoningExclude: nextReasoningExclude,
      modelParams: formatModelParamsDraft(nextModelParams),
    });
  };

  /**
   * 写回模型内置搜索参数更新后的 `modelParams`。
   *
   * @param nextModelParams - 已由 native search 参数模块清洗过的下一版参数。
   */
  const handleNativeWebSearchModelParamsChange = (nextModelParams: Record<string, unknown> | undefined) => {
    onDraftChange({
      modelParams: formatModelParamsDraft(nextModelParams),
      ...syncReasoningDraft(draft.model, nextModelParams),
    });
  };

  return (
    <SettingSection
      title={t('topicSettings.sections.generation')}
      description={t('topicSettings.generationSectionDescription')}
      testId="topic-settings-generation-section"
    >
      <SettingRow title={t('topicSettings.model')} description={t('topicSettings.modelDescription')}>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className={cn(
              'flex h-8 min-w-0 flex-1 justify-between gap-2 rounded-md px-3 text-left text-xs',
              PANEL_CONTROL_FOCUS_CLASS_NAME,
            )}
            onClick={() => setModelPickerOpen(true)}
            data-testid="topic-settings-model-trigger"
          >
            <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              <ProviderIcon
                providerId={providerId}
                customLogo={provider?.logo}
                fallbackIcon={providerUi.icon}
                fallbackColor={providerUi.color}
                size="xs"
              />
              <span className="min-w-0 flex-1 truncate text-foreground">{getModelLabel(activeModelId)}</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </Button>

          {hasModelOverride ? (
            <TooltipAction tooltip={t('assistant.useDefault')}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label={t('assistant.useDefault')}
                data-testid="topic-settings-model-clear"
                onClick={() => handleModelOverrideChange(undefined)}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipAction>
          ) : null}
        </div>
      </SettingRow>

      <SliderSettingRow
        title={t('topicSettings.temperature')}
        description={t('topicSettings.temperatureDescription')}
        value={draft.temperature}
        displayValue={draft.temperature.toFixed(1)}
        min={TOPIC_TEMPERATURE_MIN}
        max={TOPIC_TEMPERATURE_MAX}
        step={TOPIC_TEMPERATURE_STEP}
        onChange={(value) => onDraftChange({ temperature: Number(value.toFixed(1)) })}
      />

      <SliderSettingRow
        title={t('topicSettings.topP')}
        description={t('topicSettings.topPDescription')}
        value={draft.topP}
        displayValue={draft.topP.toFixed(2)}
        min={TOPIC_TOP_P_MIN}
        max={TOPIC_TOP_P_MAX}
        step={TOPIC_TOP_P_STEP}
        onChange={(value) => onDraftChange({ topP: Number(value.toFixed(2)) })}
      />

      <SettingRow title={t('topicSettings.maxTokens')} description={t('topicSettings.maxTokensDescription')}>
        <div className="grid gap-1.5">
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={draft.maxTokens}
            onChange={(event) => onDraftChange({ maxTokens: event.target.value })}
            aria-label={t('topicSettings.maxTokens')}
            className={cn('h-8 rounded-md border-input bg-background px-3 text-xs', PANEL_CONTROL_FOCUS_CLASS_NAME)}
          />
          {maxTokensError ? <p className="text-[11px] text-destructive">{maxTokensError}</p> : null}
        </div>
      </SettingRow>

      <SliderSettingRow
        title={t('topicSettings.contextLength')}
        description={t('topicSettings.contextLengthDescription')}
        value={draft.contextLength}
        displayValue={String(draft.contextLength)}
        min={TOPIC_CONTEXT_LENGTH_MIN}
        max={TOPIC_CONTEXT_LENGTH_MAX}
        step={TOPIC_CONTEXT_LENGTH_STEP}
        onChange={(value) => onDraftChange({ contextLength: Math.round(value) })}
      />

      {reasoningDescriptor ? (
        <>
          <SettingRow
            title={t('chat.reasoningEffort')}
            description={reasoningDescriptor.helperTextKeys?.map((helperKey) => t(helperKey)).join(' ')}
            testId="topic-settings-reasoning-row"
          >
            <Select
              value={draft.reasoningValue}
              onValueChange={(value) => patchReasoning({ reasoningValue: value as ProviderReasoningValue })}
              disabled={Boolean(modelParamsError)}
            >
              <SelectTrigger
                className={cn('h-8 rounded-md border-input bg-background text-xs', PANEL_CONTROL_FOCUS_CLASS_NAME)}
                data-testid="topic-settings-reasoning-trigger"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reasoningDescriptor.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>

          {reasoningDescriptor.excludeLabelKey ? (
            <SettingRow
              title={t(reasoningDescriptor.excludeLabelKey)}
              description={
                reasoningDescriptor.excludeDescriptionKey
                  ? t(reasoningDescriptor.excludeDescriptionKey)
                  : undefined
              }
              contentClassName="flex justify-end"
            >
              <Switch
                checked={draft.reasoningExclude}
                onCheckedChange={(checked) => patchReasoning({ reasoningExclude: checked })}
                disabled={Boolean(modelParamsError) || draft.reasoningValue === 'off'}
                data-testid="topic-settings-reasoning-exclude"
              />
            </SettingRow>
          ) : null}

          {reasoningDescriptor.budgetLabelKey ? (
            <SettingRow
              title={t(reasoningDescriptor.budgetLabelKey)}
              description={
                reasoningDescriptor.budgetDescriptionKey
                  ? t(reasoningDescriptor.budgetDescriptionKey)
                  : undefined
              }
            >
              <div className="grid gap-1.5">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={draft.reasoningBudgetText}
                  onChange={(event) => patchReasoning({ reasoningBudgetText: event.target.value })}
                  className={cn('h-8 rounded-md border-input bg-background px-3 text-xs', PANEL_CONTROL_FOCUS_CLASS_NAME)}
                  disabled={Boolean(modelParamsError) || draft.reasoningValue === 'off'}
                  data-testid="topic-settings-reasoning-budget"
                />
                {reasoningBudgetError ? (
                  <p className="text-[11px] text-destructive">{reasoningBudgetError}</p>
                ) : null}
              </div>
            </SettingRow>
          ) : null}
        </>
      ) : null}

      <TopicNativeWebSearchSettings
        capabilityInput={{
          providerId: activeModelOption?.providerId ?? providerId,
          providerType: activeModelOption?.providerType ?? provider?.type,
          transportProtocol: activeTransportProtocol,
          modelId: activeModelOption?.modelId ?? activeModelId.split('/').slice(1).join('/'),
          featureKeys: activeModelOption?.features,
          supportedParameters: activeModelOption?.supportedParameters,
        }}
        modelParams={parsedModelParams === null ? undefined : parsedModelParams}
        disabled={Boolean(modelParamsError)}
        externalWebSearchActive={externalWebSearchActive}
        onModelParamsChange={handleNativeWebSearchModelParamsChange}
      />

      <SettingRow
        title={t('topicSettings.modelParamsLabel')}
        description={t('topicSettings.modelParamsDescription')}
        stacked
      >
        <Textarea
          value={draft.modelParams}
          onChange={(event) => handleModelParamsChange(event.target.value)}
          placeholder={'{\n  "seed": 1\n}'}
          aria-label={t('topicSettings.modelParamsLabel')}
          className={cn(
            'min-h-[168px] resize-y rounded-md border-input bg-background px-3 py-2 font-mono text-xs leading-5',
            PANEL_CONTROL_FOCUS_CLASS_NAME,
          )}
          data-testid="topic-settings-model-params"
        />
        {modelParamsError ? <p className="text-[11px] text-destructive">{modelParamsError}</p> : null}
      </SettingRow>

      <ModelPickerDialog
        open={modelPickerOpen}
        value={activeModelId}
        onSelect={(modelId) => handleModelOverrideChange(modelId)}
        onClose={() => setModelPickerOpen(false)}
        filter={defaultConversationModelFilter}
        onOpenModelManager={onOpenModelManager ? () => {
          setModelPickerOpen(false);
          onOpenModelManager();
        } : undefined}
      />
    </SettingSection>
  );
}
