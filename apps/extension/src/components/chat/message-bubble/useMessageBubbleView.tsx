/**
 * 说明：`useMessageBubbleView` 组件模块。
 *
 * 职责：
 * - 承载 `useMessageBubbleView` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useMessageBubbleView` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { defaultConversationModelFilter, isVisionModelLike } from '@/lib/ai/model-filters';
import { pickProviderUiMeta } from '@/lib/ai/provider-ui-meta';
import { hasMessageReasoningTrace, hasMessageToolCalls } from '@/lib/chat/message-trace';
import { getAttachmentBlob } from '@/lib/attachments';
import { downloadBlob } from '@/lib/export/download';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/useToast';

import { shouldIgnoreMultiSelectContainerClick } from '../multi-select-click';
import { getAssistantMessageVisualState } from '../assistant-message-visual-state';
import { MessageBubbleLayout } from './MessageBubbleLayout';
import type { FileRef, MessageBubbleProps } from './types';
import { useMessageBubbleActions } from './useMessageBubbleActions';
import { useMessageBubbleMedia } from './useMessageBubbleMedia';

/**
 * 内部函数：`getModelDisplayName`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function getModelDisplayName(modelId: string | undefined, getModelLabel?: (id: string) => string): string {
  if (!modelId) return 'AI';
  return getModelLabel ? getModelLabel(modelId) : (modelId.split('/').pop() || modelId);
}

/**
 * 导出 Hook：`useMessageBubbleView`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useMessageBubbleView({
  message,
  onDelete,
  onEdit,
  onRegenerate,
  isLast,
  isLoading,
  modelId,
  getModelLabel,
  getProviderLogo,
  confirmDelete = true,
  confirmRegenerate = true,
  translateLanguages = [],
  onTranslate,
  onSpeak,
  onClearTranslations,
  onRemoveTranslation,
  onMentionModel,
  availableModels = [],
  mentionVisionOnly = false,
  onOpenModelManager,
  onNewBranch,
  onEnterMultiSelect,
  exportMenuOptions,
  multiSelectMode = false,
  isSelected = false,
  isNavigationActive = false,
  onToggleSelect,
  thinkingExpanded,
  onThinkingExpandedChange,
  browserContextPreflightPhase,
  showOutline = false,
  onToolAbort,
  rowClassName,
}: MessageBubbleProps) {
  const translation = useTranslation();
  const t = translation.t;
  const i18nLanguage = translation.i18n?.language ?? 'en';
  const isUser = message.role === 'user';
  const showStreamingCaret = !isUser && isLast && isLoading;
  const assistantVisualState = getAssistantMessageVisualState(message);
  const { isBusyAssistant, isPreparingReply, isReplacementPending } = assistantVisualState;
  const contentRef = useRef<HTMLDivElement>(null);
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const [translateMenuOpen, setTranslateMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const media = useMessageBubbleMedia({ isUser, message, t });
  const displayModel = getModelDisplayName(message.modelId || modelId, getModelLabel);
  const timeText = useMemo(() => {
    try {
      const date = new Date(message.createdAt);
      return date.toLocaleString(undefined, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }, [message.createdAt]);

  const getExportModelLabel = useCallback((target: typeof message) => (
    target.role !== 'assistant' ? undefined : displayModel
  ), [displayModel]);

  const actions = useMessageBubbleActions({
    confirmDelete,
    confirmRegenerate,
    confirmRegenerateTitle: isUser ? t('message.confirmResend') : t('message.confirmRegenerate'),
    copyCurrentImageAttachmentToClipboard: media.copyCurrentImageAttachmentToClipboard,
    displayModel,
    exportCurrentImageAttachment: media.exportCurrentImageAttachment,
    getExportModelLabel,
    isImageOnlyAssistantMessage: media.isImageOnlyAssistantMessage,
    message,
    modelId,
    onDelete,
    onEdit,
    onRegenerate,
    t,
    timeText,
  });
  const regenerateActionTitle = isUser ? t('chat.resend') : t('chat.regenerate');
  const regenerateDisabledTitle = isUser ? t('chat.resendDisabledWhileLoading') : t('chat.regenerateDisabledWhileLoading');

  useEffect(() => {
    if (multiSelectMode) actions.setEditing(false);
  }, [actions, multiSelectMode]);

  useEffect(() => {
    if (multiSelectMode || actions.editing) {
      setTranslateMenuOpen(false);
      setMoreMenuOpen(false);
    }
  }, [actions.editing, multiSelectMode]);

  const mentionModelFilter = useMemo(() => (
    (modelOption: (typeof availableModels)[number]) => {
      if (!defaultConversationModelFilter(modelOption)) return false;
      if (!mentionVisionOnly) return true;
      return isVisionModelLike(modelOption);
    }
  ), [mentionVisionOnly]);

  const shouldShowEmptyPlaceholder = !isUser
    && !String(message.content || '').trim()
    && !isBusyAssistant
    && !message.error
    && !hasMessageReasoningTrace(message)
    && !hasMessageToolCalls(message)
    && media.imageAttachments.length === 0
    && media.fileRefs.length === 0;

  const avatarProviderId = String(message.modelId || modelId || '').split('/')[0] || '';
  const avatarProviderUi = pickProviderUiMeta(avatarProviderId);
  const avatarProviderLogo = avatarProviderId ? getProviderLogo?.(avatarProviderId) : undefined;
  const canToggleSelection = multiSelectMode && message.role !== 'system' && Boolean(onToggleSelect);
  const canSpeakMessage = !isUser && !media.isImageOnlyAssistantMessage && Boolean(String(message.content || '').trim());
  const shouldPinActionBar = moreMenuOpen || translateMenuOpen;
  const shouldShowImageActions = !isUser && media.hasImageAttachments;
  const mentionLabels = useMemo(() => {
    if (!isUser || !Array.isArray(message.mentions)) return [];
    const seen = new Set<string>();
    const labels: Array<{ id: string; label: string }> = [];
    for (const item of message.mentions) {
      const mentionId = String(item || '').trim();
      if (!mentionId || seen.has(mentionId)) continue;
      seen.add(mentionId);
      const label = String(getModelLabel?.(mentionId) || mentionId).trim() || mentionId;
      labels.push({ id: mentionId, label });
    }
    return labels;
  }, [getModelLabel, isUser, message.mentions]);
  const messageLaneClassName = cn(
    isUser
      ? 'w-fit max-w-[min(72%,42rem)]'
      : media.shouldRenderImageMessageCard
        ? 'w-full max-w-full'
        : 'w-full',
  );

  const avatarClassName = `flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl shadow-sm transition-[background-color,border-color,box-shadow] duration-200 ${
    isUser
      ? `olyq-brand-gradient-surface bg-gradient-to-br from-primary/90 to-primary text-primary-foreground ${
          canToggleSelection && isSelected
            ? 'ring-1 ring-black/5 shadow-[0_14px_28px_-18px_hsl(var(--primary)/0.55)] dark:ring-white/10'
            : ''
        }`
      : `border border-border/60 bg-muted/30 ${
          canToggleSelection && isSelected
            ? 'border-primary/15 bg-background/80 shadow-[0_12px_28px_-20px_hsl(var(--primary)/0.28)]'
            : ''
        }`
  }`;

  const messageSurfaceClassName = cn(
    !isUser ? 'w-full min-w-0' : undefined,
    media.shouldRenderImageMessageCard ? 'max-w-full' : undefined,
    'transition-[background-color,border-color,box-shadow,transform] duration-200',
    isUser
      ? `relative rounded-2xl rounded-tr-sm border border-border/60 bg-card px-3.5 py-2.5 text-foreground shadow-none dark:border-primary/15 dark:bg-primary/[0.06] ${
          canToggleSelection
            ? isSelected
              ? 'border-primary/25 bg-primary/[0.08] ring-1 ring-primary/20'
              : 'group-hover:border-primary/20 group-hover:bg-primary/[0.08]'
            : ''
        }`
      : media.shouldRenderImageMessageCard
        ? `relative rounded-2xl rounded-tl-sm border p-1.5 shadow-sm ${
            canToggleSelection
              ? isSelected
                ? 'border-primary/15 bg-background shadow-[0_16px_34px_-24px_hsl(var(--primary)/0.24)]'
                : 'border-transparent bg-transparent shadow-none group-hover:border-border/50 group-hover:bg-background/40'
              : 'border-0 bg-transparent p-0 shadow-none'
          }`
        : `relative rounded-2xl rounded-tl-sm border border-border/50 bg-card px-4 py-3 shadow-none ${
            canToggleSelection
              ? isSelected
                ? 'border-primary/15 bg-accent/20 shadow-[0_16px_32px_-24px_hsl(var(--primary)/0.18)]'
                : 'group-hover:border-border/70 group-hover:bg-card/70'
              : ''
          }`,
  );

  const handleMessageRowClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!canToggleSelection) return;
    if (shouldIgnoreMultiSelectContainerClick(event.target)) return;
    onToggleSelect?.();
  }, [canToggleSelection, onToggleSelect]);

  const handleDownloadFile = useCallback((fileRef: FileRef) => {
    void (async () => {
      const blob = await getAttachmentBlob(fileRef.id);
      if (!blob) {
        toast({ title: t('common.error'), description: t('chat.attachmentMissing'), variant: 'destructive' });
        return;
      }
      await downloadBlob(blob, fileRef.name);
    })().catch((error) => {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    });
  }, [t]);

  return (
    <MessageBubbleLayout
      actions={actions}
      availableModels={availableModels}
      avatarClassName={avatarClassName}
      avatarProviderId={avatarProviderId}
      avatarProviderLogo={avatarProviderLogo}
      avatarProviderUi={avatarProviderUi}
      canSpeakMessage={canSpeakMessage}
      canToggleSelection={canToggleSelection}
      contentRef={contentRef}
      displayModel={displayModel}
      exportMenuOptions={exportMenuOptions}
      handleDownloadFile={handleDownloadFile}
      handleMessageRowClick={canToggleSelection ? handleMessageRowClick : undefined}
      i18nLanguage={i18nLanguage}
      isBusyAssistant={isBusyAssistant}
      isLast={isLast}
      isLoading={isLoading}
      isPreparingReply={isPreparingReply}
      isReplacementPending={isReplacementPending}
      isSelected={isSelected}
      isUser={isUser}
      media={media}
      mentionLabels={mentionLabels}
      mentionModelFilter={mentionModelFilter}
      mentionPickerOpen={mentionPickerOpen}
      message={message}
      messageLaneClassName={messageLaneClassName}
      messageSurfaceClassName={messageSurfaceClassName}
      modelId={modelId}
      moreMenuOpen={moreMenuOpen}
      multiSelectMode={multiSelectMode}
      isNavigationActive={isNavigationActive}
      onClearTranslations={onClearTranslations}
      onEnterMultiSelect={onEnterMultiSelect}
      onMentionModel={onMentionModel}
      onNewBranch={onNewBranch}
      onOpenModelManager={onOpenModelManager}
      onRemoveTranslation={onRemoveTranslation}
      onSpeak={onSpeak}
      onToggleSelect={onToggleSelect}
      onThinkingExpandedChange={onThinkingExpandedChange}
      onToolAbort={onToolAbort}
      onTranslate={onTranslate}
      browserContextPreflightPhase={browserContextPreflightPhase}
      setMentionPickerOpen={setMentionPickerOpen}
      setMoreMenuOpen={setMoreMenuOpen}
      setTranslateMenuOpen={setTranslateMenuOpen}
      shouldPinActionBar={shouldPinActionBar}
      shouldShowEmptyPlaceholder={shouldShowEmptyPlaceholder}
      shouldShowImageActions={shouldShowImageActions}
      showRegenerateAction={Boolean(onRegenerate)}
      showOutline={showOutline}
      showStreamingCaret={showStreamingCaret}
      regenerateActionTitle={regenerateActionTitle}
      regenerateDisabledTitle={regenerateDisabledTitle}
      rowClassName={rowClassName}
      t={t}
      thinkingExpanded={thinkingExpanded}
      timeText={timeText}
      translateLanguages={translateLanguages}
      translateMenuOpen={translateMenuOpen}
    />
  );
}
