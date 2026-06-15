/**
 * 说明：`ChatInputLayout` 组件模块。
 *
 * 职责：
 * - 承载 `ChatInputLayout` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ChatInputLayout` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { AlertTriangle, AtSign, Image as ImageIcon, ZoomIn, X } from 'lucide-react';
import { useState, type Ref, type RefObject } from 'react';
import type { TFunction } from 'i18next';

import { ChatInputToolbar } from '@/components/chat/ChatInputToolbar';
import { ChatQuickPanel } from '@/components/chat/ChatQuickPanel';
import { CHAT_READING_COLUMN_CLASS } from '@/components/chat/chat-layout-classes';
import type { SelectionPanelHint } from '@/components/chat/SelectionPanelShared';
import { FileAttachmentCard } from '@/components/chat/FileAttachmentCard';
import { ChatInputElementDraftCards } from './ChatInputElementDraftCards';
import { MediaPreviewOverlay } from '@/components/chat/MediaPreviewOverlay';
import { TooltipAction } from '@/components/ui/tooltip-action';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { QuickPanelItem, QuickPanelKind, QuickPanelMenu } from '@/components/chat/hooks/useQuickPanelController';
import type { PendingAttachment } from '@/components/chat/hooks/useChatAttachments';
import type { WebSearchProviderId } from '@/lib/web-search/types';
import type { MessageAttachment } from '@/types/chat';
import type { ChatInputReasoningViewModel } from './types';
import type { ChatInputElementDraftCard } from './element-draft-markdown';

type PendingImageAttachment = PendingAttachment & {
  ref: Extract<MessageAttachment, { type: 'image' }>;
};

interface ChatInputImageAttachmentPreviewProps {
  readonly attachment: PendingImageAttachment;
  readonly t: TFunction;
}

/**
 * 输入区图片附件缩略图。
 *
 * 说明：
 * - 只消费 `useChatAttachments` 已创建的 `previewUrl`，不重新读取 IndexedDB；
 * - Object URL 生命周期继续由附件 hook 统一管理，预览层这里只负责展示。
 */
function ChatInputImageAttachmentPreview({ attachment, t }: ChatInputImageAttachmentPreviewProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const previewUrl = typeof attachment.previewUrl === 'string' ? attachment.previewUrl : '';
  const imageName = attachment.ref.name || t('chat.image');
  const canPreview = Boolean(previewUrl) && !loadError;

  if (!canPreview) {
    return (
      <div
        className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/30 text-muted-foreground shadow-sm"
        aria-label={loadError ? t('chat.imageLoadFailed', { name: imageName }) : t('chat.attachmentMissing')}
        data-testid="chat-input-image-attachment-placeholder"
      >
        <ImageIcon className="h-5 w-5" />
      </div>
    );
  }

  return (
    <>
      <TooltipAction tooltip={t('chat.imagePreviewTitle')}>
        <button
          type="button"
          className="group/preview relative block h-16 w-16 overflow-hidden rounded-lg border border-border/60 shadow-sm outline-none transition-colors hover:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/40"
          onClick={() => setPreviewOpen(true)}
          data-testid="chat-input-image-attachment-preview"
        >
          <img
            src={previewUrl}
            alt={imageName}
            className="h-full w-full object-cover"
            onError={() => setLoadError(true)}
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 transition-colors group-hover/preview:bg-black/20 group-focus-visible/preview:bg-black/20">
            <ZoomIn className="h-4 w-4 text-white opacity-0 transition-opacity group-hover/preview:opacity-85 group-focus-visible/preview:opacity-85" />
          </span>
        </button>
      </TooltipAction>

      <MediaPreviewOverlay
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        ariaLabel={imageName || t('chat.imagePreviewTitle')}
      >
        <img
          src={previewUrl}
          alt={imageName}
          className="max-h-[92vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
          onError={() => setPreviewOpen(false)}
        />
      </MediaPreviewOverlay>
    </>
  );
}

interface ChatInputLayoutProps {
  readonly addFiles: (files: FileList | File[] | null) => Promise<void>;
  readonly assistantId?: string;
  readonly attachmentCount: number;
  readonly attachments: PendingAttachment[];
  readonly canGenerateImage?: boolean;
  readonly cancelTranslateConfirm: () => void;
  readonly confirmTranslateFromButton: () => void;
  readonly handleChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  readonly handleDragLeave: (event: React.DragEvent) => void;
  readonly handleDragOver: (event: React.DragEvent) => void;
  readonly handleDrop: (event: React.DragEvent) => void;
  readonly handleInputBlur: () => void;
  readonly handleInputFocus?: () => void;
  readonly handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly handlePaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  readonly hasInlineQuery: boolean;
  readonly hasMessages?: boolean;
  readonly composerShellHeight: number;
  readonly isDragging: boolean;
  readonly isLoading: boolean;
  readonly isTranslating: boolean;
  readonly mcpButtonActive: boolean;
  readonly mentionModels: string[];
  readonly getModelLabel: (modelId: string) => string;
  readonly onChangeReasoningState?: (value: ChatInputReasoningViewModel['value']) => void;
  readonly onClearMessages?: () => void;
  readonly onInsertContextDivider?: () => void;
  readonly onOpenMemorySettings?: () => void;
  readonly onOpenPrompts: () => void;
  readonly onQuickPanelOpenChange: (kind: Extract<QuickPanelKind, 'mention' | 'web-search' | 'mcp' | 'phrases'>, nextOpen: boolean) => void;
  readonly onRequestTranslate: () => void;
  readonly onSend: () => void;
  readonly onStop: () => void;
  readonly onToggleGenerateImage?: () => void;
  readonly quickActiveMenu: QuickPanelMenu;
  readonly quickPanelFooterLabel?: string;
  readonly quickPanelHints: SelectionPanelHint[];
  readonly quickPanelIndex: number;
  readonly quickPanelInlineSymbol: string | null;
  readonly quickPanelKind: QuickPanelKind | null;
  readonly quickPanelOpen: boolean;
  readonly quickPanelRef: RefObject<HTMLDivElement | null>;
  readonly reasoningState?: ChatInputReasoningViewModel;
  readonly inputRef: Ref<HTMLTextAreaElement>;
  readonly removeAttachmentAt: (index: number) => void;
  readonly resolvedTranslateTargetLanguage: string;
  readonly selectQuickItem: (item: QuickPanelItem) => void;
  readonly selectedWebSearchProviderId?: WebSearchProviderId;
  readonly sendDisabled: boolean;
  readonly startResize: (event: React.MouseEvent) => void;
  readonly t: TFunction;
  readonly text: string;
  readonly toggleMentionModel: (modelId: string) => void;
  readonly translateConfirmOpen: boolean;
  readonly translateDisabled: boolean;
  readonly webSearchActive: boolean;
  readonly webSearchButtonTooltip: string;
  readonly fileRef: RefObject<HTMLInputElement | null>;
  readonly appendFileToInput: (attachment: MessageAttachment & { type: 'file' }) => Promise<void>;
  readonly copyFileContent: (attachment: MessageAttachment & { type: 'file' }) => Promise<void>;
  readonly elementDraftCards: ChatInputElementDraftCard[];
  readonly canGoBack: boolean;
  readonly filteredQuickItems: QuickPanelItem[];
  readonly goBackQuickMenu: () => void;
  readonly enableGenerateImage?: boolean;
  readonly onRemoveElementDraftCard: (draftId: string) => void;
}

/**
 * 导出组件：`ChatInputLayout`。
 *
 * @remarks
 * 负责承载当前文件对应的界面渲染、交互编排和视图层边界。
 */
export function ChatInputLayout({
  addFiles,
  assistantId,
  attachmentCount,
  attachments,
  canGenerateImage,
  composerShellHeight,
  canGoBack,
  cancelTranslateConfirm,
  confirmTranslateFromButton,
  copyFileContent,
  elementDraftCards,
  filteredQuickItems,
  getModelLabel,
  goBackQuickMenu,
  handleChange,
  handleDragLeave,
  handleDragOver,
  handleDrop,
  handleInputBlur,
  handleInputFocus,
  handleKeyDown,
  handlePaste,
  hasInlineQuery,
  hasMessages,
  isDragging,
  isLoading,
  isTranslating,
  mcpButtonActive,
  mentionModels,
  onChangeReasoningState,
  onClearMessages,
  onInsertContextDivider,
  onOpenMemorySettings,
  onOpenPrompts,
  onQuickPanelOpenChange,
  onRemoveElementDraftCard,
  onRequestTranslate,
  onSend,
  onStop,
  onToggleGenerateImage,
  quickActiveMenu,
  quickPanelFooterLabel,
  quickPanelHints,
  quickPanelIndex,
  quickPanelInlineSymbol,
  quickPanelKind,
  quickPanelOpen,
  quickPanelRef,
  reasoningState,
  inputRef,
  removeAttachmentAt,
  resolvedTranslateTargetLanguage,
  selectQuickItem,
  selectedWebSearchProviderId,
  sendDisabled,
  startResize,
  t,
  text,
  toggleMentionModel,
  translateConfirmOpen,
  translateDisabled,
  webSearchActive,
  webSearchButtonTooltip,
  fileRef,
  appendFileToInput,
  enableGenerateImage,
}: ChatInputLayoutProps) {
  const inlineQuickPanelOpen = quickPanelOpen && quickPanelKind === 'slash';
  const anchoredQuickPanel = quickPanelKind === 'mention' || quickPanelKind === 'web-search' || quickPanelKind === 'mcp' || quickPanelKind === 'phrases'
    ? {
        panelRef: quickPanelRef,
        activeMenu: quickActiveMenu,
        items: filteredQuickItems,
        activeIndex: quickPanelIndex,
        inlineSymbol: quickPanelInlineSymbol,
        footerLabel: quickPanelFooterLabel ?? '',
        showFooterBadge: hasInlineQuery,
        hints: quickPanelHints,
        canGoBack,
        onGoBack: goBackQuickMenu,
        onSelectItem: selectQuickItem,
      }
    : undefined;

  return (
    <div className="border-t border-border/60 bg-background/80 px-4 pb-4 pt-3 backdrop-blur-sm">
      <div
        data-chat-input-container
        className={`${CHAT_READING_COLUMN_CLASS} min-w-0 transition-all duration-200 ${
          isDragging ? 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background rounded-2xl' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <ChatInputElementDraftCards
          cards={elementDraftCards}
          deleteLabel={t('common.delete')}
          t={t}
          onRemove={onRemoveElementDraftCard}
        />

        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 px-1">
            {attachments.map((attachment, index) => (
              <ContextMenu key={`${attachment.ref.type}-${attachment.ref.id}-${index}`}>
                <ContextMenuTrigger asChild>
                  <div className="group/thumb relative">
                    {attachment.ref.type === 'image' ? (
                      <ChatInputImageAttachmentPreview
                        attachment={attachment as PendingImageAttachment}
                        t={t}
                      />
                    ) : (
                      <FileAttachmentCard
                        tone="neutral"
                        name={attachment.ref.name}
                        mime={attachment.ref.mime}
                        size={attachment.ref.size}
                        className="min-w-[220px] max-w-[300px]"
                      />
                    )}

                    <TooltipAction tooltip={t('common.delete')}>
                      <button
                        type="button"
                        onClick={() => removeAttachmentAt(index)}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 shadow-sm transition-opacity group-hover/thumb:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </TooltipAction>
                  </div>
                </ContextMenuTrigger>

                {attachment.ref.type === 'file' && (
                  <ContextMenuContent className="w-56">
                    <ContextMenuItem onSelect={() => void appendFileToInput(attachment.ref as MessageAttachment & { type: 'file' })}>
                      {t('chat.appendFileToInput')}
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => void copyFileContent(attachment.ref as MessageAttachment & { type: 'file' })}>
                      {t('chat.copyFileContent')}
                    </ContextMenuItem>
                  </ContextMenuContent>
                )}
              </ContextMenu>
            ))}
          </div>
        )}

        <div className="relative">
          {inlineQuickPanelOpen && (
            <ChatQuickPanel
              panelRef={quickPanelRef}
              activeMenu={quickActiveMenu}
              items={filteredQuickItems}
              placement="inline"
              activeIndex={quickPanelIndex}
              inlineSymbol={quickPanelInlineSymbol}
              footerLabel={quickPanelFooterLabel ?? ''}
              showFooterBadge={hasInlineQuery}
              hints={quickPanelHints}
              canGoBack={canGoBack}
              backLabel={t('common.prev')}
              emptyTitleFallback={t('search.noResults')}
              onGoBack={goBackQuickMenu}
              onSelectItem={selectQuickItem}
            />
          )}

          <div
            data-chat-composer-shell
            className="group/input relative flex flex-col rounded-2xl border border-border/60 bg-card/50 shadow-none backdrop-blur-sm transition-all duration-200 focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/30"
            style={{ '--chat-composer-shell-height': `${composerShellHeight}px` } as React.CSSProperties}
          >
            <TooltipAction tooltip={t('chat.resizeInput')}>
              <div
                role="separator"
                aria-orientation="horizontal"
                aria-label={t('chat.resizeInput')}
                className="absolute left-0 right-0 top-0 z-10 h-2 cursor-row-resize opacity-0 transition-opacity group-hover/input:opacity-100"
                onMouseDown={startResize}
              />
            </TooltipAction>

            {mentionModels.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-3 pt-2">
                {mentionModels.map((modelId) => (
                  <TooltipAction key={modelId} tooltip={t('message.mentionModel')}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-full bg-accent/50 px-2 py-1 text-xs transition-colors hover:bg-accent"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        toggleMentionModel(modelId);
                      }}
                    >
                      <AtSign className="h-3 w-3 opacity-70" />
                      <span className="max-w-[220px] truncate">{getModelLabel(modelId)}</span>
                      <X className="h-3 w-3 opacity-60" />
                    </button>
                  </TooltipAction>
                ))}
              </div>
            )}

            <div className="chat-input-composer-body flex min-h-0 flex-1 flex-col px-4 pb-1.5 pt-2">
              <textarea
                ref={inputRef}
                data-testid="chat-input"
                value={text}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                placeholder={isDragging ? t('chat.dropToAddImage') : t('chat.inputPlaceholderRich')}
                rows={1}
                className="chat-input-textarea min-h-[2.75rem] w-full flex-1 basis-0 resize-none bg-transparent text-sm placeholder:text-muted-foreground/60 focus:outline-none overflow-y-auto"
              />

              <div className="chat-input-toolbar-frame mt-1.5 shrink-0 border-t border-border/50 pt-1.5">
                <ChatInputToolbar
                  t={t}
                  assistantId={assistantId}
                  onOpenPrompts={onOpenPrompts}
                  fileRef={fileRef}
                  onAddFiles={addFiles}
                  webSearchActive={webSearchActive}
                  quickPanelOpen={quickPanelOpen}
                  quickPanelKind={quickPanelKind}
                  anchoredQuickPanel={anchoredQuickPanel}
                  onQuickPanelOpenChange={onQuickPanelOpenChange}
                  webSearchButtonTooltip={webSearchButtonTooltip}
                  selectedWebSearchProviderId={selectedWebSearchProviderId}
                  onOpenMemorySettings={onOpenMemorySettings}
                  mentionModels={mentionModels}
                  mcpButtonActive={mcpButtonActive}
                  reasoningState={reasoningState}
                  onChangeReasoningState={onChangeReasoningState}
                  onInsertContextDivider={onInsertContextDivider}
                  isLoading={isLoading}
                  canGenerateImage={canGenerateImage}
                  enableGenerateImage={enableGenerateImage}
                  onToggleGenerateImage={onToggleGenerateImage}
                  hasMessages={hasMessages}
                  onClearMessages={onClearMessages}
                  attachmentCount={attachmentCount}
                  resolvedTranslateTargetLanguage={resolvedTranslateTargetLanguage}
                  onRequestTranslate={onRequestTranslate}
                  isTranslating={isTranslating}
                  translateDisabled={translateDisabled}
                  onStop={onStop}
                  onSend={onSend}
                  sendDisabled={sendDisabled}
                />
              </div>
            </div>
          </div>
        </div>

        <p className="mt-2 text-center text-xs text-muted-foreground/50">
          {t('chat.inputHints')}
        </p>

        <AlertDialog
          open={translateConfirmOpen}
          onOpenChange={(value) => {
            if (!value) {
              cancelTranslateConfirm();
            }
          }}
        >
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader className="text-left">
              <div className="flex items-start gap-4">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <AlertDialogTitle className="text-base font-semibold">{t('chat.translateConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription className="mt-2">{t('chat.translateConfirmDesc')}</AlertDialogDescription>
                </div>
              </div>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-4">
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={confirmTranslateFromButton}>
                {t('chat.translateConfirmOk')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
