/**
 * 说明：`MessageBubbleLayout` 组件模块。
 *
 * 职责：
 * - 承载 `MessageBubbleLayout` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MessageBubbleLayout` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { User } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { MouseEvent, RefObject } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { ProviderIcon } from '@/components/ui/ProviderIcon';
import type { Message } from '@/types/chat';

import { FileAttachmentCard } from '../FileAttachmentCard';
import { ImageMessageCard } from '../ImageMessageCard';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { MessageErrorNotice } from '../MessageErrorNotice';
import { MessageOutline } from '../MessageOutline';
import { MessageTraceBlocks } from '../MessageTraceBlocks';
import { MessageTranslationsBlock } from '../MessageTranslationsBlock';
import { PreviewableImage } from '../PreviewableImage';
import { WebSearchResultsBlock } from '../WebSearchResultsBlock';
import { AssistantGenerationStatus } from '../AssistantGenerationStatus';
import { MessageBubbleActionBar } from './MessageBubbleActionBar';
import { MessageContextReferenceCards } from './MessageContextReferenceCards';
import { MessageBubbleHeader } from './MessageBubbleHeader';
import type { useMessageBubbleActions } from './useMessageBubbleActions';
import type { useMessageBubbleMedia } from './useMessageBubbleMedia';
import type { FileRef, MessageBubbleProps } from './types';
import { hasMessageReasoningTrace } from '@/lib/chat/message-trace';

interface MessageBubbleLayoutProps {
  readonly actions: ReturnType<typeof useMessageBubbleActions>;
  readonly availableModels: NonNullable<MessageBubbleProps['availableModels']>;
  readonly avatarClassName: string;
  readonly avatarProviderId: string;
  readonly avatarProviderLogo?: string;
  readonly avatarProviderUi: { icon?: string; color?: string };
  readonly canSpeakMessage: boolean;
  readonly canToggleSelection: boolean;
  readonly contentRef: RefObject<HTMLDivElement | null>;
  readonly displayModel: string;
  readonly exportMenuOptions: MessageBubbleProps['exportMenuOptions'];
  readonly handleDownloadFile: (fileRef: FileRef) => void;
  readonly handleMessageRowClick?: (event: MouseEvent<HTMLDivElement>) => void;
  readonly i18nLanguage: string;
  readonly isBusyAssistant: boolean;
  readonly isLast: boolean;
  readonly isLoading: boolean;
  readonly isNavigationActive: boolean;
  readonly isPreparingReply: boolean;
  readonly isReplacementPending: boolean;
  readonly isSelected: boolean;
  readonly isUser: boolean;
  readonly media: ReturnType<typeof useMessageBubbleMedia>;
  readonly mentionLabels: Array<{ id: string; label: string }>;
  readonly mentionModelFilter: (modelId: NonNullable<MessageBubbleProps['availableModels']>[number]) => boolean;
  readonly mentionPickerOpen: boolean;
  readonly message: Message;
  readonly messageLaneClassName: string;
  readonly messageSurfaceClassName: string;
  readonly modelId?: string;
  readonly moreMenuOpen: boolean;
  readonly multiSelectMode: boolean;
  readonly onClearTranslations?: MessageBubbleProps['onClearTranslations'];
  readonly onEnterMultiSelect?: MessageBubbleProps['onEnterMultiSelect'];
  readonly onMentionModel?: MessageBubbleProps['onMentionModel'];
  readonly onNewBranch?: MessageBubbleProps['onNewBranch'];
  readonly onOpenModelManager?: MessageBubbleProps['onOpenModelManager'];
  readonly onRemoveTranslation?: MessageBubbleProps['onRemoveTranslation'];
  readonly onSpeak?: MessageBubbleProps['onSpeak'];
  readonly onToggleSelect?: MessageBubbleProps['onToggleSelect'];
  readonly onToolAbort?: MessageBubbleProps['onToolAbort'];
  readonly onThinkingExpandedChange?: MessageBubbleProps['onThinkingExpandedChange'];
  readonly onTranslate?: MessageBubbleProps['onTranslate'];
  readonly browserContextPreflightPhase?: MessageBubbleProps['browserContextPreflightPhase'];
  readonly setMentionPickerOpen: (open: boolean) => void;
  readonly setMoreMenuOpen: (open: boolean) => void;
  readonly setTranslateMenuOpen: (open: boolean) => void;
  readonly shouldPinActionBar: boolean;
  readonly shouldShowEmptyPlaceholder: boolean;
  readonly shouldShowImageActions: boolean;
  readonly showRegenerateAction: boolean;
  readonly showOutline: boolean;
  readonly showStreamingCaret: boolean;
  readonly regenerateActionTitle: string;
  readonly regenerateDisabledTitle: string;
  readonly rowClassName?: string;
  readonly t: TFunction;
  readonly thinkingExpanded?: boolean;
  readonly timeText: string;
  readonly translateLanguages: string[];
  readonly translateMenuOpen: boolean;
}

/**
 * 导出组件：`MessageBubbleLayout`。
 *
 * @remarks
 * 负责承载当前文件对应的界面渲染、交互编排和视图层边界。
 */
export function MessageBubbleLayout({
  actions,
  availableModels,
  avatarClassName,
  avatarProviderId,
  avatarProviderLogo,
  avatarProviderUi,
  canSpeakMessage,
  canToggleSelection,
  contentRef,
  displayModel,
  exportMenuOptions,
  handleDownloadFile,
  handleMessageRowClick,
  i18nLanguage,
  isBusyAssistant,
  isLast,
  isLoading,
  isNavigationActive,
  isPreparingReply,
  isReplacementPending,
  isSelected,
  isUser,
  media,
  mentionLabels,
  mentionModelFilter,
  mentionPickerOpen,
  message,
  messageLaneClassName,
  messageSurfaceClassName,
  modelId,
  moreMenuOpen,
  multiSelectMode,
  onClearTranslations,
  onEnterMultiSelect,
  onMentionModel,
  onNewBranch,
  onOpenModelManager,
  onRemoveTranslation,
  onSpeak,
  onToggleSelect,
  onToolAbort,
  onThinkingExpandedChange,
  onTranslate,
  browserContextPreflightPhase,
  setMentionPickerOpen,
  setMoreMenuOpen,
  setTranslateMenuOpen,
  shouldPinActionBar,
  shouldShowEmptyPlaceholder,
  shouldShowImageActions,
  showRegenerateAction,
  showOutline,
  showStreamingCaret,
  regenerateActionTitle,
  regenerateDisabledTitle,
  rowClassName,
  t,
  thinkingExpanded,
  timeText,
  translateLanguages,
  translateMenuOpen,
}: MessageBubbleLayoutProps) {
  const { ConfirmDialogPortal } = actions;
  const assistantStatusMode = (
    browserContextPreflightPhase === 'style-capture' && !isUser && isBusyAssistant
      ? 'styleCapture'
      : isReplacementPending
        ? 'replacementPending'
        : isPreparingReply
          ? 'preparing'
          : null
  );

  return (
    <>
      <div
        data-msg-id={message.id}
        data-nav-active={isNavigationActive ? 'true' : 'false'}
        onClick={handleMessageRowClick}
        className={cn(
          'group flex gap-3 px-4 py-4',
          rowClassName,
          isUser ? 'flex-row-reverse' : undefined,
          multiSelectMode ? 'select-none' : undefined,
          canToggleSelection ? 'cursor-pointer' : undefined,
        )}
      >
        <div className={avatarClassName}>
          {isUser ? (
            <User className="h-4 w-4" />
          ) : (
            <ProviderIcon
              providerId={avatarProviderId}
              customLogo={avatarProviderLogo}
              fallbackIcon={avatarProviderUi.icon}
              fallbackColor={avatarProviderUi.color}
              size="sm"
            />
          )}
        </div>

        <div className={cn('min-w-0 flex flex-1', isUser ? 'justify-end' : 'justify-start')}>
          <div
            data-testid={`message-lane-${message.id}`}
            className={cn('flex min-w-0 flex-col', messageLaneClassName)}
          >
            <div
              data-testid={`message-frame-${message.id}`}
              className="min-w-0"
            >
              <MessageBubbleHeader
                canToggleSelection={canToggleSelection}
                displayModel={displayModel}
                isSelected={isSelected}
                isUser={isUser}
                messageId={message.id}
                onToggleSelect={onToggleSelect}
                t={t}
                timeText={timeText}
              />

              {isUser ? (
                <MessageContextReferenceCards
                  messageId={message.id}
                  references={message.contextReferences}
                  t={t}
                />
              ) : null}

              {actions.editing ? (
                <div className="w-full space-y-2">
                  <Textarea
                    value={actions.editText}
                    onChange={(event) => actions.setEditText(event.target.value)}
                    className="min-h-[80px] bg-card/50 backdrop-blur-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => actions.setEditing(false)}>
                      {t('common.cancel')}
                    </Button>
                    <Button size="sm" onClick={actions.saveEdit}>
                      {t('common.save')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  ref={contentRef}
                  data-search-scope="true"
                  data-testid={`message-surface-${message.id}`}
                  className={messageSurfaceClassName}
                >
                  {isUser ? (
                    <>
                      {mentionLabels.length > 0 ? (
                        <div data-testid="message-mentions" className="mb-2 flex flex-wrap gap-1.5">
                          {mentionLabels.map((mention) => (
                            <span
                              key={mention.id}
                              className="inline-flex max-w-full items-center rounded-full border border-primary/15 bg-primary/10 px-2 py-0.5 text-xs font-medium text-foreground/85"
                            >
                              <span className="truncate">@{mention.label}</span>
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {media.fileRefs.length > 0 ? (
                        <div className="mb-3 flex flex-col gap-2">
                          {media.fileRefs.map((fileRef) => (
                            <FileAttachmentCard
                              key={fileRef.id}
                              tone="user"
                              name={fileRef.name}
                              mime={fileRef.mime}
                              size={fileRef.size}
                              className="w-full"
                              onClick={() => handleDownloadFile(fileRef)}
                            />
                          ))}
                        </div>
                      ) : null}

                      {media.shouldRenderImageMessageCard ? (
                        <ImageMessageCard
                          images={media.imageCardItems}
                          isGenerating={false}
                          index={media.imageIndex}
                          onIndexChange={media.setImageIndex}
                        />
                      ) : media.imageUrls.length > 0 ? (
                        <div className="mb-2 flex flex-wrap gap-2">
                          {media.imageUrls.map((image) => (
                            <PreviewableImage key={image.id} src={image.url} alt={image.name || t('chat.image')} />
                          ))}
                        </div>
                      ) : null}

                      {message.content ? (
                        <div className="user-bubble-markdown text-sm">
                          <MarkdownRenderer content={message.content} idPrefix={`msg-${message.id}`} isStreaming={false} />
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {assistantStatusMode ? (
                        <AssistantGenerationStatus mode={assistantStatusMode} t={t} />
                      ) : null}
                      <div className={cn(isReplacementPending ? 'opacity-60 saturate-[0.82]' : undefined)}>
                        {media.fileRefs.length > 0 ? (
                          <div className="mb-3 flex flex-col gap-2">
                            {media.fileRefs.map((fileRef) => (
                              <FileAttachmentCard
                                key={fileRef.id}
                                tone="assistant"
                                name={fileRef.name}
                                mime={fileRef.mime}
                                size={fileRef.size}
                                className="w-full"
                                onClick={() => handleDownloadFile(fileRef)}
                              />
                            ))}
                          </div>
                        ) : null}

                        {media.shouldRenderImageMessageCard ? (
                          <ImageMessageCard
                            images={isBusyAssistant && !isReplacementPending ? [] : media.imageCardItems}
                            isGenerating={isBusyAssistant && !isReplacementPending}
                            index={media.imageIndex}
                            onIndexChange={media.setImageIndex}
                          />
                        ) : media.imageUrls.length > 0 ? (
                          <div className="mb-2 flex flex-wrap gap-2">
                            {media.imageUrls.map((image) => (
                              <PreviewableImage key={image.id} src={image.url} alt={image.name || t('chat.image')} />
                            ))}
                          </div>
                        ) : null}

                        {showOutline && message.content ? (
                          <MessageOutline markdown={message.content} idPrefix={`msg-${message.id}`} containerRef={contentRef} />
                        ) : null}
                        {(message.webSearchStatus || (message.webSearchResults && message.webSearchResults.length > 0)) ? (
                          <WebSearchResultsBlock
                            results={message.webSearchResults ?? []}
                            isSearching={message.webSearchStatus === 'searching'}
                            providerId={message.webSearchProviderId}
                            query={message.webSearchQuery}
                            error={message.webSearchError}
                          />
                        ) : null}
                        <MessageTraceBlocks
                          message={message}
                          isStreamingReasoning={isLast && isLoading && !message.content && !isReplacementPending}
                          thinkingExpanded={thinkingExpanded}
                          onThinkingExpandedChange={onThinkingExpandedChange}
                          onToolAbort={onToolAbort}
                        />

                        <MessageErrorNotice
                          error={message.error}
                          details={message.errorDetails}
                          className={message.error ? 'mb-2' : undefined}
                        />

                        {message.content ? (
                          <MarkdownRenderer
                            content={message.content}
                            idPrefix={`msg-${message.id}`}
                            isStreaming={isLast && isLoading && !isReplacementPending}
                          />
                        ) : isPreparingReply && !media.shouldRenderImageMessageCard && !hasMessageReasoningTrace(message) && message.webSearchStatus !== 'searching' ? null : !isReplacementPending && (showStreamingCaret || isBusyAssistant) && !media.shouldRenderImageMessageCard && !hasMessageReasoningTrace(message) && message.webSearchStatus !== 'searching' ? (
                          <span className="animate-pulse text-sm text-muted-foreground">{t('chat.thinking')}</span>
                        ) : message.error ? null : shouldShowEmptyPlaceholder ? (
                          media.shouldRenderImageMessageCard ? null : <span className="text-sm text-muted-foreground">{t('group.empty')}</span>
                        ) : null}

                        <MessageTranslationsBlock
                          translations={message.translations}
                          onClearAll={message.translations?.length ? onClearTranslations : undefined}
                          onRemoveTranslation={onRemoveTranslation}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {!actions.editing && !multiSelectMode ? (
              <MessageBubbleActionBar
                actions={actions}
                availableModels={availableModels}
                canSpeakMessage={canSpeakMessage}
                exportMenuOptions={exportMenuOptions}
                i18nLanguage={i18nLanguage}
                isLast={isLast}
                isLoading={isLoading}
                isUser={isUser}
                media={media}
                mentionModelFilter={mentionModelFilter}
                mentionPickerOpen={mentionPickerOpen}
                message={message}
                modelId={modelId}
                moreMenuOpen={moreMenuOpen}
                onClearTranslations={onClearTranslations}
                onEnterMultiSelect={onEnterMultiSelect}
                onMentionModel={onMentionModel}
                onNewBranch={onNewBranch}
                onOpenModelManager={onOpenModelManager}
                onSpeak={onSpeak}
                onTranslate={onTranslate}
                regenerateActionTitle={regenerateActionTitle}
                regenerateDisabledTitle={regenerateDisabledTitle}
                setMentionPickerOpen={setMentionPickerOpen}
                setMoreMenuOpen={setMoreMenuOpen}
                setTranslateMenuOpen={setTranslateMenuOpen}
                shouldPinActionBar={shouldPinActionBar}
                shouldShowImageActions={shouldShowImageActions}
                showRegenerateAction={showRegenerateAction}
                t={t}
                translateLanguages={translateLanguages}
                translateMenuOpen={translateMenuOpen}
              />
            ) : null}
          </div>
        </div>
      </div>
      <ConfirmDialogPortal />
    </>
  );
}
