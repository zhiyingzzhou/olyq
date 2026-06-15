/**
 * 说明：`useMessageGroupView` 组件模块。
 *
 * 职责：
 * - 承载 `useMessageGroupView` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useMessageGroupView` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useEffect, useMemo, useState } from 'react';

import { MessageGroupLayout } from './MessageGroupLayout';
import { isFailedAssistant } from './isFailedAssistant';
import type { MessageGroupViewProps } from './types';

/**
 * 多模型消息分组视图控制器。
 *
 * @param props - 分组内 assistant 列表、偏好设置与交互回调。
 * @returns 多模型分组 UI。
 */
export function useMessageGroupView({
  assistants,
  availableHeight,
  presentation = 'inline',
  prefs,
  isLoading,
  browserContextPreflightPhase,
  getModelLabel,
  getModelShortLabel,
  getProviderLogo,
  onCloseFullscreen,
  onUpdatePrefs,
  onOpenFullscreen,
  onDeleteGroup,
  onRetryFailedAll,
  onToggleUseful,
  multiSelectMode,
  selectedIds,
  onToggleSelect,
  onMentionModel,
  availableModels = [],
  mentionVisionOnly = false,
  currentModelId,
  onOpenModelManager,
  confirmRegenerate,
  translateLanguages,
  onTranslate,
  onClearTranslations,
  onRemoveTranslation,
  onRegenerateAssistant,
  onSpeakAssistant,
  thinkingExpandedIds,
  onThinkingExpandedChange,
  showOutline = false,
  onToolAbort,
}: MessageGroupViewProps) {
  const layout = prefs.style;
  const foldMode = prefs.foldDisplayMode ?? 'compact';
  const gridColumns = prefs.gridColumns ?? 2;
  const gridPopoverTrigger = prefs.gridPopoverTrigger ?? 'hover';
  const [gridColumnsDraft, setGridColumnsDraft] = useState(gridColumns);

  const sortedAssistants = useMemo(() => assistants, [assistants]);
  const selectedModelId = prefs.foldSelectedModelId || sortedAssistants[0]?.id || '';
  const selected = sortedAssistants.find((message) => message.id === selectedModelId) || sortedAssistants[0]!;
  const failedCount = useMemo(() => sortedAssistants.filter(isFailedAssistant).length, [sortedAssistants]);

  useEffect(() => {
    setGridColumnsDraft(gridColumns);
  }, [gridColumns]);

  return (
    <MessageGroupLayout
      availableModels={availableModels}
      availableHeight={availableHeight}
      confirmRegenerate={confirmRegenerate}
      currentModelId={currentModelId}
      failedCount={failedCount}
      foldMode={foldMode}
      getModelLabel={getModelLabel}
      getModelShortLabel={getModelShortLabel}
      getProviderLogo={getProviderLogo}
      gridColumns={gridColumns}
      gridColumnsDraft={gridColumnsDraft}
      gridPopoverTrigger={gridPopoverTrigger}
      isLoading={isLoading}
      browserContextPreflightPhase={browserContextPreflightPhase}
      layout={layout}
      presentation={presentation}
      mentionVisionOnly={mentionVisionOnly}
      multiSelectMode={multiSelectMode}
      onClearTranslations={onClearTranslations}
      onCloseFullscreen={onCloseFullscreen}
      onDeleteGroup={onDeleteGroup}
      onGridColumnsDraftChange={setGridColumnsDraft}
      onOpenFullscreen={onOpenFullscreen}
      onMentionModel={onMentionModel}
      onOpenModelManager={onOpenModelManager}
      onRegenerateAssistant={onRegenerateAssistant}
      onRemoveTranslation={onRemoveTranslation}
      onRetryFailedAll={onRetryFailedAll}
      onSpeakAssistant={onSpeakAssistant}
      onThinkingExpandedChange={onThinkingExpandedChange}
      onToggleSelect={onToggleSelect}
      onToggleUseful={onToggleUseful}
      onToolAbort={onToolAbort}
      onTranslate={onTranslate}
      onUpdatePrefs={onUpdatePrefs as never}
      selected={selected}
      selectedIds={selectedIds}
      selectedModelId={selectedModelId}
      showOutline={showOutline}
      sortedAssistants={sortedAssistants}
      thinkingExpandedIds={thinkingExpandedIds}
      translateLanguages={translateLanguages}
    />
  );
}
