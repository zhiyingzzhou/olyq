/**
 * 说明：`ModelCard` 组件模块。
 *
 * 职责：
 * - 承载 `ModelCard` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ModelCard` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { Check, Copy, Headphones, Languages, RefreshCw, ThumbsUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PreviewableImage } from '@/components/chat/PreviewableImage';
import { MessageOutline } from '@/components/chat/MessageOutline';
import { MessageErrorNotice } from '@/components/chat/MessageErrorNotice';
import { MessageTraceBlocks } from '@/components/chat/MessageTraceBlocks';
import { MessageTranslationsBlock } from '@/components/chat/MessageTranslationsBlock';
import { WebSearchResultsBlock } from '@/components/chat/WebSearchResultsBlock';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { AssistantGenerationStatus } from '@/components/chat/AssistantGenerationStatus';
import { getAssistantMessageVisualState } from '@/components/chat/assistant-message-visual-state';
import { ProviderIcon } from '@/components/ui/ProviderIcon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { getAttachmentBlob } from '@/lib/attachments';
import { getSuccessfulMessageTranslations } from '@/lib/chat/message-translations';
import { hasMessageReasoningTrace, hasMessageToolCalls } from '@/lib/chat/message-trace';
import { getTranslationLanguageDisplayLabel } from '@/lib/chat/translation-languages';
import { pickProviderUiMeta } from '@/lib/ai/provider-ui-meta';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/useToast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import type { Message } from '@/types/chat';
import {
  copyMessageImageAttachment,
  getMessageImageAttachments,
  getSelectedMessageImageAttachment,
} from '@/components/chat/message-image-actions';
import { shouldIgnoreMultiSelectContainerClick } from '@/components/chat/multi-select-click';
import { GRID_PREVIEW_FLOATING_LAYER_ATTR } from './layout-helpers';

/**
 * 内部函数：`assignRef`。
 *
 * @remarks
 * 让正文滚动容器同时服务 `ModelCard` 内部大纲定位和外层横向比较联动滚动注册。
 */
function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  (ref as { current: T | null }).current = value;
}

/**
 * 导出组件：`ModelCard`。
 *
 * @remarks
 * 负责承载当前文件对应的界面渲染、交互编排和视图层边界。
 */
export const ModelCard = memo(function ModelCard({
  cardClassName: cardClassNameProp,
  contentClassName,
  message,
  isLoading,
  browserContextPreflightPhase,
  getModelLabel,
  getProviderLogo,
  onToggleUseful,
  confirmRegenerate,
  translateLanguages,
  onTranslate,
  onClearTranslations,
  onRemoveTranslation,
  onRegenerateAssistant,
  onSpeakAssistant,
  thinkingExpanded,
  onThinkingExpandedChange,
  preview,
  multiSelectMode,
  isSelected,
  onToggleSelect,
  onNestedOverlayOpenChange,
  showOutline,
  onToolAbort,
  contentContainerRef,
}: {
  cardClassName?: string;
  contentClassName?: string;
  message: Message;
  isLoading: boolean;
  browserContextPreflightPhase?: 'style-capture' | null;
  getModelLabel: (id: string) => string;
  getProviderLogo?: (providerId: string) => string | undefined;
  onToggleUseful: (id: string) => void;
  confirmRegenerate?: boolean;
  translateLanguages?: string[];
  onTranslate?: (assistantMsgId: string, language: string) => void;
  onClearTranslations?: (assistantMsgId: string) => void;
  onRemoveTranslation?: (assistantMsgId: string, language: string) => void;
  onRegenerateAssistant?: (assistantMsgId: string) => void;
  onSpeakAssistant?: (assistantMsgId: string) => void;
  thinkingExpanded?: boolean;
  onThinkingExpandedChange?: (next: boolean) => void;
  preview?: boolean;
  multiSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onNestedOverlayOpenChange?: (open: boolean) => void;
  showOutline?: boolean;
  onToolAbort?: (toolCallId: string) => void;
  contentContainerRef?: Ref<HTMLDivElement>;
}) {
  const { t, i18n } = useTranslation();
  const { confirm, ConfirmDialogPortal } = useConfirmDialog();
  const title = message.modelId ? getModelLabel(message.modelId) : t('chat.assistant');
  const successfulTranslations = useMemo(
    () => getSuccessfulMessageTranslations(message.translations),
    [message.translations],
  );
  const providerId = String(message.modelId || '').split('/')[0] || '';
  const providerLogo = providerId ? getProviderLogo?.(providerId) : undefined;
  const providerUi = pickProviderUiMeta(providerId);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const assistantVisualState = getAssistantMessageVisualState(message);
  const { isPreparingReply, isBusyAssistant, isReplacementPending } = assistantVisualState;
  const [translateMenuOpen, setTranslateMenuOpen] = useState(false);

  const imageAttachments = useMemo(() => {
    return getMessageImageAttachments(message).map((attachment) => ({
      ...attachment,
      name: attachment.name || t('chat.image'),
    }));
  }, [message, t]);

  const isImageOnlyAssistantMessage = useMemo(() => {
    const hasText = Boolean(String(message.content || '').trim());
    if (hasText) return false;
    const hasReasoning = hasMessageReasoningTrace(message);
    if (hasReasoning) return false;
    if (message.error) return false;
    if (hasMessageToolCalls(message)) return false;
    const hasFile = (message.attachments || []).some((attachment) => attachment?.type === 'file');
    if (hasFile) return false;
    return imageAttachments.length > 0;
  }, [imageAttachments.length, message]);
  const canSpeakMessage = Boolean(String(message.content || '').trim()) && !isImageOnlyAssistantMessage;

  const copyFirstImageAttachmentToClipboard = useCallback(async () => {
    const first = getSelectedMessageImageAttachment(imageAttachments, 0);
    if (!first) throw new Error(t('chat.attachmentMissing'));
    await copyMessageImageAttachment(first, {
      missingMessage: t('chat.attachmentMissing'),
      clipboardUnsupportedMessage: t('errors.clipboardImageWriteUnsupported'),
    });
  }, [imageAttachments, t]);

  const [imageUrls, setImageUrls] = useState<Array<{ id: string; url: string; name: string }>>([]);

  useEffect(() => {
    let alive = true;
    const created: string[] = [];
    void Promise.all(
      imageAttachments.map(async (attachment) => {
        const blob = await getAttachmentBlob(attachment.id);
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        created.push(url);
        return { id: attachment.id, url, name: attachment.name };
      }),
    )
      .then((list) => {
        if (!alive) {
          for (const url of created) {
            try { URL.revokeObjectURL(url); } catch { /* ignore */ }
          }
          return;
        }
        setImageUrls(list.filter((item): item is NonNullable<typeof item> => item !== null));
      })
      .catch(() => {
        if (!alive) return;
        setImageUrls([]);
      });

    return () => {
      alive = false;
      for (const url of created) {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      }
    };
  }, [imageAttachments]);

  useEffect(() => () => {
    onNestedOverlayOpenChange?.(false);
  }, [onNestedOverlayOpenChange]);

  const canToggleSelection = Boolean(multiSelectMode && onToggleSelect);
  const cardClassName = cn(
    'group min-h-0 min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-[background-color,border-color,box-shadow] duration-200',
    preview ? 'h-[300px]' : '',
    canToggleSelection ? 'cursor-pointer select-none' : '',
    canToggleSelection && isSelected
      ? 'border-primary/20 bg-accent/20 shadow-[0_18px_38px_-26px_hsl(var(--primary)/0.24)]'
      : canToggleSelection
        ? 'hover:border-border/80 hover:bg-card/70 hover:shadow-md'
        : '',
    cardClassNameProp,
  );
  const handleCardClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!canToggleSelection) return;
    if (shouldIgnoreMultiSelectContainerClick(event.target)) return;
    onToggleSelect?.();
  }, [canToggleSelection, onToggleSelect]);
  const handleContentRef = useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node;
    assignRef(contentContainerRef, node);
  }, [contentContainerRef]);
  const handleTranslateMenuOpenChange = useCallback((nextOpen: boolean) => {
    setTranslateMenuOpen(nextOpen);
    onNestedOverlayOpenChange?.(nextOpen);
  }, [onNestedOverlayOpenChange]);
  const assistantStatusMode = (
    browserContextPreflightPhase === 'style-capture' && isBusyAssistant
      ? 'styleCapture'
      : isReplacementPending
        ? 'replacementPending'
        : isPreparingReply
          ? 'preparing'
          : null
  );

  return (
    <>
      <div data-msg-id={message.id} data-selected={isSelected ? 'true' : 'false'} onClick={canToggleSelection ? handleCardClick : undefined} className={cardClassName}>
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {providerId ? (
              <ProviderIcon
                providerId={providerId}
                customLogo={providerLogo}
                fallbackIcon={providerUi.icon}
                fallbackColor={providerUi.color}
                size="xs"
              />
            ) : null}
            <div className="truncate text-xs font-medium" title={title}>
              {title}
            </div>
          </div>
          {canToggleSelection ? (
            <TooltipAction tooltip={t('message.multiSelect')}>
              <button
                type="button"
                role="checkbox"
                aria-checked={Boolean(isSelected)}
                data-multi-select-ignore="true"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleSelect?.();
                }}
                className={`ml-1 flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                  isSelected
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-muted-foreground/30 bg-background/40 hover:bg-accent/50'
                }`}
              >
                {isSelected ? <Check className="h-3 w-3" /> : null}
              </button>
            </TooltipAction>
          ) : (
            <>
              <TooltipAction tooltip={isImageOnlyAssistantMessage ? t('message.copyImage') : t('chat.copy')}>
                <button
                  type="button"
                  onClick={() => {
                    if (isImageOnlyAssistantMessage) {
                      void copyFirstImageAttachmentToClipboard().then(
                        () => toast({ title: t('common.success'), description: t('message.copiedImage') }),
                        (error: unknown) => toast({ title: t('common.error'), description: error instanceof Error ? error.message : String(error), variant: 'destructive' }),
                      );
                      return;
                    }

                    void navigator.clipboard.writeText(message.content || '').then(
                      () => toast({ title: t('chat.copied'), description: t('message.copiedPlain') }),
                      () => toast({ title: t('common.error'), description: t('sidebar.clipboardFailed'), variant: 'destructive' }),
                    );
                  }}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </TooltipAction>

              {onTranslate && !isImageOnlyAssistantMessage && Array.isArray(translateLanguages) && translateLanguages.length > 0 && (
                <DropdownMenu open={translateMenuOpen} onOpenChange={handleTranslateMenuOpenChange}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={t('message.translate')}
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <Languages className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">{t('message.translate')}</p>
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent
                    align="end"
                    className="w-44"
                    {...(onNestedOverlayOpenChange ? { [GRID_PREVIEW_FLOATING_LAYER_ATTR]: 'true' } : {})}
                  >
                    {translateLanguages.map((language) => (
                      <DropdownMenuItem key={language} onSelect={() => onTranslate(message.id, language)}>
                        {getTranslationLanguageDisplayLabel(language, i18n.language)}
                      </DropdownMenuItem>
                    ))}
                    {message.translations && message.translations.length > 0 ? (
                      <>
                        <DropdownMenuSeparator />
                        {successfulTranslations.length > 0 ? (
                          <DropdownMenuItem
                            onSelect={() => {
                              const first = successfulTranslations.find((translation) => String(translation.content || '').trim())?.content ?? '';
                              if (!first) return;
                              void navigator.clipboard.writeText(first).then(
                                () => toast({ title: t('chat.copied'), description: t('message.translationCopied') }),
                                () => toast({ title: t('common.error'), description: t('sidebar.clipboardFailed'), variant: 'destructive' }),
                              );
                            }}
                          >
                            {t('message.copyTranslation')}
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem onSelect={() => onClearTranslations?.(message.id)}>
                          {t('message.closeTranslation')}
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {onRegenerateAssistant && (
                <TooltipAction tooltip={isLoading ? t('chat.regenerateDisabledWhileLoading') : t('chat.regenerate')}>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={async () => {
                      if (isLoading) return;
                      if (confirmRegenerate) {
                        const ok = await confirm({
                          title: t('message.confirmRegenerate'),
                          description: t('message.confirmRegenerateDesc'),
                          confirmLabel: t('chat.regenerate'),
                          cancelLabel: t('common.cancel'),
                          variant: 'destructive',
                        });
                        if (!ok) return;
                      }
                      onRegenerateAssistant(message.id);
                    }}
                    className={cn(
                      'rounded p-1 transition-colors',
                      isLoading
                        ? 'cursor-not-allowed opacity-45 text-muted-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </TooltipAction>
              )}
              {onSpeakAssistant && canSpeakMessage && (
                <TooltipAction tooltip={t('message.speak')}>
                  <button
                    type="button"
                    onClick={() => onSpeakAssistant(message.id)}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Headphones className="h-3.5 w-3.5" />
                  </button>
                </TooltipAction>
              )}
              <TooltipAction tooltip={t('group.useful')}>
                <button
                  type="button"
                  onClick={() => onToggleUseful(message.id)}
                  className={`rounded p-1 transition-colors ${message.useful ? 'text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                </button>
              </TooltipAction>
            </>
          )}
        </div>

        <div
          ref={handleContentRef}
          data-search-scope="true"
          className={cn(
            'relative px-3 py-3 text-sm',
            preview ? 'max-h-[260px] overflow-hidden pointer-events-none' : '',
            contentClassName,
          )}
        >
          {assistantStatusMode ? (
            <AssistantGenerationStatus mode={assistantStatusMode} t={t} />
          ) : null}
          <div className={cn(isReplacementPending ? 'opacity-60 saturate-[0.82]' : undefined)}>
            {showOutline && !preview && message.content && (
              <MessageOutline markdown={message.content} idPrefix={`msg-${message.id}`} containerRef={contentRef} />
            )}
            <MessageErrorNotice
              error={message.error}
              details={message.errorDetails}
              interactive={!preview}
              className={message.error && !preview ? 'mb-2' : undefined}
            />
            {(message.webSearchStatus || (message.webSearchResults && message.webSearchResults.length > 0)) && (
              <WebSearchResultsBlock
                results={message.webSearchResults ?? []}
                isSearching={message.webSearchStatus === 'searching'}
                providerId={message.webSearchProviderId}
                query={message.webSearchQuery}
                error={message.webSearchError}
              />
            )}
            <MessageTraceBlocks
              message={message}
              isStreamingReasoning={Boolean(isBusyAssistant && !message.content && !isReplacementPending)}
              thinkingExpanded={thinkingExpanded}
              onThinkingExpandedChange={onThinkingExpandedChange}
              onToolAbort={onToolAbort}
            />
            {imageUrls.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {imageUrls.map((image) => (
                  <PreviewableImage
                    key={image.id}
                    src={image.url}
                    alt={image.name}
                    className="max-h-48 max-w-[260px] rounded-lg border border-border/60 object-contain"
                  />
                ))}
              </div>
            )}
            {message.content ? (
              <MarkdownRenderer content={message.content} idPrefix={`msg-${message.id}`} />
            ) : isPreparingReply && !hasMessageReasoningTrace(message) && message.webSearchStatus !== 'searching' ? null : !isReplacementPending && isBusyAssistant && !hasMessageReasoningTrace(message) && message.webSearchStatus !== 'searching' ? (
              <span className="animate-pulse text-muted-foreground">{t('chat.thinking')}</span>
            ) : message.error || imageAttachments.length > 0 ? null : (
              <span className="text-muted-foreground">{t('group.empty')}</span>
            )}

            {!preview ? (
              <MessageTranslationsBlock
                translations={message.translations}
                interactive={!canToggleSelection}
                onClearAll={!canToggleSelection && message.translations?.length ? () => onClearTranslations?.(message.id) : undefined}
                onRemoveTranslation={!canToggleSelection && onRemoveTranslation ? (language) => onRemoveTranslation(message.id, language) : undefined}
              />
            ) : null}
          </div>
        </div>
      </div>
      <ConfirmDialogPortal />
    </>
  );
});
