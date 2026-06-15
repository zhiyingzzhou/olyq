/**
 * 说明：`MessageGroupLayout` 组件模块。
 *
 * 职责：
 * - 承载 `MessageGroupLayout` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MessageGroupLayout` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlignJustify,
  AtSign,
  Columns2,
  LayoutGrid,
  Layers,
  RefreshCw,
  Settings2,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ModelPickerDialog } from '@/components/chat/ModelPickerDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { defaultConversationModelFilter, isVisionModelLike } from '@/lib/ai/model-filters';
import type { ModelOption } from '@/hooks/useModelOptions';
import { HorizontalMessageGroupPanel } from './HorizontalMessageGroupPanel';
import { ModelCard } from './ModelCard';
import { GridPreviewPopover } from './GridPreviewPopover';
import { MessageGroupWindowActions } from './MessageGroupWindowActions';
import {
  gridColsClass,
  resolveEffectiveGridColumns,
} from './layout-helpers';
import type { MessageGroupLayoutProps } from './layout-types';
import type { MessageGroupLayout as LayoutMode } from './types';

/**
 * 导出组件：`MessageGroupLayout`。
 *
 * @remarks
 * 负责承载当前文件对应的界面渲染、交互编排和视图层边界。
 */
export function MessageGroupLayout({
  availableModels,
  availableHeight,
  confirmRegenerate,
  currentModelId,
  failedCount,
  foldMode,
  getModelLabel,
  getModelShortLabel,
  getProviderLogo,
  gridColumns,
  gridColumnsDraft,
  gridPopoverTrigger,
  isLoading,
  browserContextPreflightPhase,
  layout,
  presentation,
  mentionVisionOnly,
  multiSelectMode,
  onClearTranslations,
  onCloseFullscreen,
  onDeleteGroup,
  onGridColumnsDraftChange,
  onOpenFullscreen,
  onMentionModel,
  onOpenModelManager,
  onRegenerateAssistant,
  onRemoveTranslation,
  onRetryFailedAll,
  onSpeakAssistant,
  onThinkingExpandedChange,
  onToggleSelect,
  onToggleUseful,
  onToolAbort,
  onTranslate,
  onUpdatePrefs,
  selected,
  selectedIds,
  selectedModelId,
  showOutline,
  sortedAssistants,
  thinkingExpandedIds,
  translateLanguages,
}: MessageGroupLayoutProps) {
  const { t } = useTranslation();
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [bodyWidth, setBodyWidth] = useState(0);
  const isFullscreen = presentation === 'fullscreen';
  const horizontalPanelHeight = resolveHorizontalPanelHeight(availableHeight, presentation);
  const effectiveGridColumns = useMemo(() => resolveEffectiveGridColumns({
    containerWidth: bodyWidth,
    gridColumns,
    presentation,
  }), [bodyWidth, gridColumns, presentation]);
    /**
   * 内部函数变量：`mentionModelFilter`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const mentionModelFilter = (model: ModelOption) => {
    if (!defaultConversationModelFilter(model)) return false;
    if (!mentionVisionOnly) return true;
    return isVisionModelLike(model);
  };

  const layoutOptions = [
    { value: 'fold' as const, label: t('group.layoutFold'), Icon: Layers },
    { value: 'vertical' as const, label: t('group.layoutVertical'), Icon: AlignJustify },
    { value: 'horizontal' as const, label: t('group.layoutHorizontal'), Icon: Columns2 },
    { value: 'grid' as const, label: t('group.layoutGrid'), Icon: LayoutGrid },
  ];
  const shellClassName = isFullscreen
    ? 'flex h-full min-h-0 flex-col overflow-hidden rounded-[1.25rem] border border-border/70 bg-background/85 shadow-[0_28px_90px_-44px_rgba(15,23,42,0.45)] backdrop-blur-xl'
    : 'mx-4 mb-2 overflow-hidden rounded-xl border border-border/60 bg-muted/10';
  const bodyClassName = isFullscreen
    ? layout === 'horizontal'
      ? 'flex-1 min-h-0 min-w-0'
      : 'flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-y-contain p-3 [scrollbar-gutter:stable] [overflow-anchor:none]'
    : layout === 'horizontal'
      ? 'min-w-0'
      : 'min-w-0 p-2';

  useEffect(() => {
    const element = bodyRef.current;
    if (!element) return;

    /**
     * grid 的有效列数现在由容器宽度驱动，而不是直接信任用户偏好，
     * 因此这里在初次挂载和后续 resize 时都同步刷新 bodyWidth，避免窄宽度下仍沿用过宽列数。
     */
    const updateWidth = () => {
      setBodyWidth(element.clientWidth);
    };

    updateWidth();
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [layout, presentation]);

  return (
    <div
      data-testid={isFullscreen ? 'message-group-fullscreen-shell' : 'message-group-inline-shell'}
      className={shellClassName}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/20 px-3 py-2">
        <ToggleGroup
          type="single"
          value={layout}
          onValueChange={(value) => value && onUpdatePrefs({ style: value as LayoutMode })}
          className="gap-1"
        >
          {layoutOptions.map(({ value, label, Icon }) => (
            <Tooltip key={value}>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value={value}
                  aria-label={label}
                  data-selected={layout === value ? 'true' : 'false'}
                  className={`h-9 w-9 shrink-0 rounded-xl border border-border/60 bg-background/80 px-0 shadow-sm backdrop-blur-sm transition-all duration-150 focus-visible:z-10 ${
                    layout === value
                      ? '!border-foreground/90 !bg-foreground !text-background shadow-md hover:!bg-foreground hover:!text-background'
                      : 'text-muted-foreground hover:border-border hover:bg-background hover:text-foreground'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="top"><p className="text-xs">{label}</p></TooltipContent>
            </Tooltip>
          ))}
        </ToggleGroup>

        <MessageGroupWindowActions
          isFullscreen={isFullscreen}
          onOpenFullscreen={onOpenFullscreen}
          onCloseFullscreen={onCloseFullscreen}
        />

        {!multiSelectMode && failedCount > 0 && !isLoading && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onRetryFailedAll}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            {t('group.retryFailedAll', { count: failedCount })}
          </Button>
        )}

        {layout === 'grid' && (
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
                <Settings2 className="mr-1 h-3.5 w-3.5" />
                {t('group.gridSettings')}
              </Button>
            </PopoverTrigger>
            <PopoverContent collisionPadding={12} className="w-64">
              <div className="space-y-3">
                <div className="text-[11px] leading-relaxed text-muted-foreground">
                  {t('group.gridSettings')}：{t('group.gridColumns')} / {t('group.gridTrigger')}
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-foreground/80">{t('group.gridColumns')}</div>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[gridColumnsDraft]}
                      min={2}
                      max={6}
                      step={1}
                      onValueChange={(value) => onGridColumnsDraftChange(value[0] ?? 2)}
                      onValueCommit={(value) => onUpdatePrefs({ gridColumns: Math.max(2, Math.min(6, value[0] ?? 2)) })}
                      aria-label={t('group.gridColumns')}
                    />
                    <div className="w-6 text-right text-xs tabular-nums text-foreground/80">
                      {gridColumnsDraft}
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-foreground/80">{t('group.gridTrigger')}</div>
                  <Select
                    value={gridPopoverTrigger}
                    onValueChange={(value) => onUpdatePrefs({ gridPopoverTrigger: value === 'click' ? 'click' : 'hover' })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hover" className="text-xs">{t('group.triggerHover')}</SelectItem>
                      <SelectItem value="click" className="text-xs">{t('group.triggerClick')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}

        <div className="flex-1" />

        {!multiSelectMode && onMentionModel && availableModels.length > 0 && (
          <>
            <TooltipAction tooltip={t('message.mentionModel')}>
              <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setMentionPickerOpen(true)}>
                <AtSign className="h-3.5 w-3.5" />
              </Button>
            </TooltipAction>

            <ModelPickerDialog
              open={mentionPickerOpen}
              value={currentModelId || selected?.modelId || sortedAssistants[0]?.modelId || ''}
              onSelect={(modelId) => {
                onMentionModel(modelId);
                setMentionPickerOpen(false);
              }}
              onClose={() => setMentionPickerOpen(false)}
              filter={mentionModelFilter}
              onOpenModelManager={onOpenModelManager ? () => {
                setMentionPickerOpen(false);
                onOpenModelManager();
              } : undefined}
            />
          </>
        )}

        {!multiSelectMode && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={onDeleteGroup}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            {t('group.deleteGroup')}
          </Button>
        )}
      </div>

      {layout === 'fold' && (
        <div className="border-b border-border/60 bg-background/30 px-3 py-2">
          <div className="flex items-center gap-2">
            <ScrollArea
              scrollbars="horizontal"
              scrollbarVisibility="hover"
              wheelBehavior="horizontal"
              className="min-w-0 flex-1"
              viewportClassName="touch-pan-x overscroll-x-contain"
            >
              <ToggleGroup
                type="single"
                value={selectedModelId}
                onValueChange={(value) => value && onUpdatePrefs({ foldSelectedModelId: value })}
                variant="outline"
                size="sm"
                className="w-max min-w-full justify-start pb-2 pr-4"
                aria-label={t('group.modelTabs')}
              >
                {sortedAssistants.map((message) => {
                  const id = message.id;
                  const fullLabel = message.modelId ? getModelLabel(message.modelId) : t('chat.assistant');
                  const fullId = message.modelId ? String(message.modelId) : '';
                  const a11yLabel = fullId ? `${fullLabel}（${fullId}）` : fullLabel;
                  const visualLabel = message.modelId
                    ? (foldMode === 'compact' && getModelShortLabel ? getModelShortLabel(message.modelId) : fullLabel)
                    : fullLabel;
                  const item = (
                    <ToggleGroupItem
                      key={id}
                      value={id}
                      className="whitespace-nowrap text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                      data-testid="message-group-tab"
                      data-model-id={message.modelId ?? ''}
                      aria-label={a11yLabel}
                    >
                      {visualLabel}
                    </ToggleGroupItem>
                  );

                  if (foldMode === 'compact') {
                    return (
                      <Tooltip key={id} delayDuration={500}>
                        <TooltipTrigger asChild>{item}</TooltipTrigger>
                        <TooltipContent side="top">
                          <div className="space-y-0.5">
                            <div className="text-xs font-medium">{fullLabel}</div>
                            {fullId ? <div className="text-[10px] text-muted-foreground">{fullId}</div> : null}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return item;
                })}
              </ToggleGroup>
            </ScrollArea>

            <Select
              value={foldMode}
              onValueChange={(value) => onUpdatePrefs({ foldDisplayMode: value === 'expanded' ? 'expanded' : 'compact' })}
            >
              <SelectTrigger className="h-7 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compact" className="text-xs">{t('group.compact')}</SelectItem>
                <SelectItem value="expanded" className="text-xs">{t('group.expanded')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div ref={bodyRef} data-testid="message-group-layout-body" className={bodyClassName}>
        {layout === 'fold' ? (
          <div className="min-h-0 min-w-0">
            <ModelCard
              cardClassName="min-w-0"
              contentClassName="min-w-0"
              message={selected}
              isLoading={isLoading}
              browserContextPreflightPhase={browserContextPreflightPhase}
              getModelLabel={getModelLabel}
              getProviderLogo={getProviderLogo}
              onToggleUseful={onToggleUseful}
              confirmRegenerate={confirmRegenerate}
              translateLanguages={translateLanguages}
              onTranslate={onTranslate}
              onClearTranslations={onClearTranslations}
              onRemoveTranslation={onRemoveTranslation}
              onRegenerateAssistant={onRegenerateAssistant}
              onSpeakAssistant={onSpeakAssistant}
              thinkingExpanded={thinkingExpandedIds?.has(selected.id)}
              onThinkingExpandedChange={(next) => onThinkingExpandedChange?.(selected.id, next)}
              showOutline={showOutline}
              multiSelectMode={multiSelectMode}
              isSelected={selectedIds.has(selected.id)}
              onToggleSelect={() => onToggleSelect(selected.id)}
              onToolAbort={onToolAbort}
            />
          </div>
        ) : layout === 'vertical' ? (
          <div className="min-h-0 min-w-0 space-y-2">
            {sortedAssistants.map((message) => (
              <ModelCard
                key={message.id}
                message={message}
                isLoading={isLoading}
                browserContextPreflightPhase={browserContextPreflightPhase}
                getModelLabel={getModelLabel}
                getProviderLogo={getProviderLogo}
                onToggleUseful={onToggleUseful}
                confirmRegenerate={confirmRegenerate}
                translateLanguages={translateLanguages}
                onTranslate={onTranslate}
                onClearTranslations={onClearTranslations}
                onRemoveTranslation={onRemoveTranslation}
                onRegenerateAssistant={onRegenerateAssistant}
                onSpeakAssistant={onSpeakAssistant}
                thinkingExpanded={thinkingExpandedIds?.has(message.id)}
                onThinkingExpandedChange={(next) => onThinkingExpandedChange?.(message.id, next)}
                showOutline={showOutline}
                multiSelectMode={multiSelectMode}
                isSelected={selectedIds.has(message.id)}
                onToggleSelect={() => onToggleSelect(message.id)}
                onToolAbort={onToolAbort}
              />
            ))}
          </div>
        ) : layout === 'horizontal' ? (
          <HorizontalMessageGroupPanel
            panelHeight={horizontalPanelHeight}
            presentation={presentation}
            sortedAssistants={sortedAssistants}
            isLoading={isLoading}
            browserContextPreflightPhase={browserContextPreflightPhase}
            getModelLabel={getModelLabel}
            getProviderLogo={getProviderLogo}
            onToggleUseful={onToggleUseful}
            confirmRegenerate={confirmRegenerate}
            translateLanguages={translateLanguages}
            onTranslate={onTranslate}
            onClearTranslations={onClearTranslations}
            onRemoveTranslation={onRemoveTranslation}
            onRegenerateAssistant={onRegenerateAssistant}
            onSpeakAssistant={onSpeakAssistant}
            thinkingExpandedIds={thinkingExpandedIds}
            onThinkingExpandedChange={onThinkingExpandedChange}
            showOutline={showOutline}
            multiSelectMode={multiSelectMode}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            onToolAbort={onToolAbort}
          />
        ) : (
          <div data-testid="message-group-grid" className={`grid gap-2 ${gridColsClass(effectiveGridColumns)}`}>
            {sortedAssistants.map((message) => (
              multiSelectMode ? (
                <ModelCard
                  key={message.id}
                  message={message}
                  isLoading={isLoading}
                  browserContextPreflightPhase={browserContextPreflightPhase}
                  getModelLabel={getModelLabel}
                  getProviderLogo={getProviderLogo}
                  onToggleUseful={onToggleUseful}
                  confirmRegenerate={confirmRegenerate}
                  translateLanguages={translateLanguages}
                  onTranslate={onTranslate}
                  onClearTranslations={onClearTranslations}
                  onRemoveTranslation={onRemoveTranslation}
                  onRegenerateAssistant={onRegenerateAssistant}
                  onSpeakAssistant={onSpeakAssistant}
                  thinkingExpanded={thinkingExpandedIds?.has(message.id)}
                  preview
                  multiSelectMode
                  isSelected={selectedIds.has(message.id)}
                  onToggleSelect={() => onToggleSelect(message.id)}
                  showOutline={showOutline}
                  onToolAbort={onToolAbort}
                />
              ) : (
                <GridPreviewPopover
                  key={message.id}
                  triggerMode={gridPopoverTrigger}
                  trigger={(
                    <ModelCard
                      message={message}
                      isLoading={isLoading}
                      browserContextPreflightPhase={browserContextPreflightPhase}
                      getModelLabel={getModelLabel}
                      getProviderLogo={getProviderLogo}
                      onToggleUseful={onToggleUseful}
                      confirmRegenerate={confirmRegenerate}
                      translateLanguages={translateLanguages}
                      onTranslate={onTranslate}
                      onClearTranslations={onClearTranslations}
                      onRemoveTranslation={onRemoveTranslation}
                      onRegenerateAssistant={onRegenerateAssistant}
                      onSpeakAssistant={onSpeakAssistant}
                      thinkingExpanded={thinkingExpandedIds?.has(message.id)}
                      preview
                      showOutline={showOutline}
                      onToolAbort={onToolAbort}
                    />
                  )}
                  renderContent={({ onNestedOverlayOpenChange }) => (
                    <ModelCard
                      message={message}
                      isLoading={isLoading}
                      browserContextPreflightPhase={browserContextPreflightPhase}
                      getModelLabel={getModelLabel}
                      getProviderLogo={getProviderLogo}
                      onToggleUseful={onToggleUseful}
                      confirmRegenerate={confirmRegenerate}
                      translateLanguages={translateLanguages}
                      onTranslate={onTranslate}
                      onClearTranslations={onClearTranslations}
                      onRemoveTranslation={onRemoveTranslation}
                      onRegenerateAssistant={onRegenerateAssistant}
                      onSpeakAssistant={onSpeakAssistant}
                      thinkingExpanded={thinkingExpandedIds?.has(message.id)}
                      onThinkingExpandedChange={(next) => onThinkingExpandedChange?.(message.id, next)}
                      onNestedOverlayOpenChange={onNestedOverlayOpenChange}
                      showOutline={showOutline}
                      onToolAbort={onToolAbort}
                    />
                  )}
                />
              )
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 内部函数：`resolveHorizontalPanelHeight`。
 *
 * @remarks
 * 横向比较模式现在统一使用固定高度面板；
 * inline 和 fullscreen 都跟随各自可用视口，但 fullscreen 会放宽上限，避免大工作区浪费高度。
 */
function resolveHorizontalPanelHeight(availableHeight?: number, presentation: 'inline' | 'fullscreen' = 'inline') {
  if (typeof availableHeight !== 'number' || !Number.isFinite(availableHeight)) {
    return presentation === 'fullscreen' ? 620 : 520;
  }

  const nextHeight = Math.round(availableHeight - 88);
  if (presentation === 'fullscreen') {
    return Math.max(420, Math.min(1100, nextHeight));
  }
  return Math.max(360, Math.min(720, nextHeight));
}
