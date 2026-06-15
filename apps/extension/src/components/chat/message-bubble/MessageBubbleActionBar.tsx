/**
 * 说明：`MessageBubbleActionBar` 组件模块。
 *
 * 职责：
 * - 收口消息气泡底部操作栏及其子菜单；
 * - 维持现有样式与交互语义不变，把菜单和按钮编排从主布局文件拆走。
 *
 * 边界：
 * - 本文件只负责底部动作，不处理正文、头部宽度约束和附件渲染。
 */
import { AtSign, Check, Copy, GitBranch, Headphones, Languages, MoreHorizontal, Pencil, RefreshCw, Trash2 } from 'lucide-react';

import { ModelPickerDialog } from '@/components/chat/ModelPickerDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { getTranslationLanguageDisplayLabel } from '@/lib/chat/translation-languages';

import { MessageBubbleActionButton } from './MessageBubbleActionButton';
import type { MessageBubbleProps } from './types';
import type { useMessageBubbleActions } from './useMessageBubbleActions';
import type { useMessageBubbleMedia } from './useMessageBubbleMedia';

interface MessageBubbleActionBarProps {
  readonly actions: ReturnType<typeof useMessageBubbleActions>;
  readonly availableModels: NonNullable<MessageBubbleProps['availableModels']>;
  readonly canSpeakMessage: boolean;
  readonly exportMenuOptions: MessageBubbleProps['exportMenuOptions'];
  readonly i18nLanguage: string;
  readonly isLast: boolean;
  readonly isLoading: boolean;
  readonly isUser: boolean;
  readonly media: ReturnType<typeof useMessageBubbleMedia>;
  readonly mentionModelFilter: (modelId: NonNullable<MessageBubbleProps['availableModels']>[number]) => boolean;
  readonly mentionPickerOpen: boolean;
  readonly message: MessageBubbleProps['message'];
  readonly modelId?: string;
  readonly moreMenuOpen: boolean;
  readonly onClearTranslations?: MessageBubbleProps['onClearTranslations'];
  readonly onEnterMultiSelect?: MessageBubbleProps['onEnterMultiSelect'];
  readonly onMentionModel?: MessageBubbleProps['onMentionModel'];
  readonly onNewBranch?: MessageBubbleProps['onNewBranch'];
  readonly onOpenModelManager?: MessageBubbleProps['onOpenModelManager'];
  readonly onSpeak?: MessageBubbleProps['onSpeak'];
  readonly onTranslate?: MessageBubbleProps['onTranslate'];
  readonly regenerateActionTitle: string;
  readonly regenerateDisabledTitle: string;
  readonly setMentionPickerOpen: (open: boolean) => void;
  readonly setMoreMenuOpen: (open: boolean) => void;
  readonly setTranslateMenuOpen: (open: boolean) => void;
  readonly shouldPinActionBar: boolean;
  readonly shouldShowImageActions: boolean;
  readonly showRegenerateAction: boolean;
  readonly t: (key: string, params?: Record<string, unknown>) => string;
  readonly translateLanguages: string[];
  readonly translateMenuOpen: boolean;
}

/**
 * 导出组件：`MessageBubbleActionBar`。
 *
 * @remarks
 * 保持现有按钮、菜单和 overlay 行为不变，只把底部动作编排从主布局里拆出以降低热点复杂度。
 */
export function MessageBubbleActionBar({
  actions,
  availableModels,
  canSpeakMessage,
  exportMenuOptions,
  i18nLanguage,
  isLast,
  isLoading,
  isUser,
  media,
  mentionModelFilter,
  mentionPickerOpen,
  message,
  modelId,
  moreMenuOpen,
  onClearTranslations,
  onEnterMultiSelect,
  onMentionModel,
  onNewBranch,
  onOpenModelManager,
  onSpeak,
  onTranslate,
  regenerateActionTitle,
  regenerateDisabledTitle,
  setMentionPickerOpen,
  setMoreMenuOpen,
  setTranslateMenuOpen,
  shouldPinActionBar,
  shouldShowImageActions,
  showRegenerateAction,
  t,
  translateLanguages,
  translateMenuOpen,
}: MessageBubbleActionBarProps) {
  return (
    <div
      data-testid={`message-actions-${message.id}`}
      data-visible={isLast || shouldPinActionBar ? 'true' : 'false'}
      className={`mt-2 flex w-full gap-0.5 transition-all duration-200 ${
        isLast || shouldPinActionBar ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      } ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <MessageBubbleActionButton onClick={actions.copy} tooltip={media.isImageOnlyAssistantMessage ? t('message.copyImage') : t('chat.copy')}>
        {actions.copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </MessageBubbleActionButton>
      {isUser ? (
        <MessageBubbleActionButton onClick={actions.startEditing} tooltip={t('common.edit')}>
          <Pencil className="h-3.5 w-3.5" />
        </MessageBubbleActionButton>
      ) : null}
      {showRegenerateAction ? (
        <MessageBubbleActionButton
          onClick={() => void actions.handleRegenerate()}
          disabled={isLoading}
          tooltip={isLoading ? regenerateDisabledTitle : regenerateActionTitle}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </MessageBubbleActionButton>
      ) : null}

      {canSpeakMessage && onSpeak ? (
        <MessageBubbleActionButton onClick={onSpeak} tooltip={t('message.speak')}>
          <Headphones className="h-3.5 w-3.5" />
        </MessageBubbleActionButton>
      ) : null}

      {!isUser && onMentionModel && availableModels.length > 0 ? (
        <>
          <MessageBubbleActionButton onClick={() => setMentionPickerOpen(true)} tooltip={t('message.mentionModel')}>
            <AtSign className="h-3.5 w-3.5" />
          </MessageBubbleActionButton>
          <ModelPickerDialog
            open={mentionPickerOpen}
            value={message.modelId || modelId || availableModels[0]?.id || ''}
            onSelect={(nextModelId) => {
              onMentionModel(nextModelId);
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
      ) : null}

      {!isUser && !media.isImageOnlyAssistantMessage && onTranslate && translateLanguages.length > 0 ? (
        <DropdownMenu open={translateMenuOpen} onOpenChange={setTranslateMenuOpen}>
          <DropdownMenuTrigger asChild>
            <span>
              <MessageBubbleActionButton onClick={() => undefined} tooltip={t('message.translate')}>
                <Languages className="h-3.5 w-3.5" />
              </MessageBubbleActionButton>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {translateLanguages.map((language) => (
              <DropdownMenuItem key={language} onSelect={() => onTranslate(language)}>
                {getTranslationLanguageDisplayLabel(language, i18nLanguage)}
              </DropdownMenuItem>
            ))}
            {message.translations && message.translations.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                {actions.successfulTranslations.length > 0 ? (
                  <DropdownMenuItem onSelect={() => void actions.copyTranslation()}>
                    {t('message.copyTranslation')}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => onClearTranslations?.()}>
                  {t('message.closeTranslation')}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {!isUser ? (
        <DropdownMenu open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
          <DropdownMenuTrigger asChild>
            <span>
              <MessageBubbleActionButton onClick={() => undefined} tooltip={t('message.more')}>
                <MoreHorizontal className="h-3.5 w-3.5" />
              </MessageBubbleActionButton>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={actions.startEditing}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              {t('common.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onNewBranch?.()}>
              <GitBranch className="mr-2 h-3.5 w-3.5" />
              {t('message.newBranch')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onEnterMultiSelect?.()}>
              {t('message.multiSelect')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void actions.exportMarkdown({ includeReasoning: false, filenamePrefix: 'message' })}>
              {t('message.saveAsFile')}
            </DropdownMenuItem>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t('sidebar.export')}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                {(exportMenuOptions?.copy_plain ?? true) ? (
                  <DropdownMenuItem onSelect={() => void actions.handleCopyPlain()}>
                    {t('message.copyPlain')}
                  </DropdownMenuItem>
                ) : null}
                {shouldShowImageActions && (exportMenuOptions?.copy_image ?? true) ? (
                  <DropdownMenuItem onSelect={() => void actions.handleCopyImage()}>
                    {t('message.copyImage')}
                  </DropdownMenuItem>
                ) : null}
                {shouldShowImageActions && (exportMenuOptions?.export_image ?? true) ? (
                  <DropdownMenuItem onSelect={() => void actions.handleExportImage()}>
                    {t('message.exportImage')}
                  </DropdownMenuItem>
                ) : null}
                {(exportMenuOptions?.markdown ?? true) ? (
                  <DropdownMenuItem onSelect={() => void actions.exportMarkdown({ includeReasoning: false })}>
                    {t('message.exportMarkdown')}
                  </DropdownMenuItem>
                ) : null}
                {(exportMenuOptions?.markdown_reason ?? true) ? (
                  <DropdownMenuItem onSelect={() => void actions.exportMarkdown({ includeReasoning: true })}>
                    {t('message.exportMarkdownReason')}
                  </DropdownMenuItem>
                ) : null}
                {(exportMenuOptions?.word ?? true) ? (
                  <DropdownMenuItem onSelect={() => void actions.exportWord()}>
                    {t('message.exportWord')}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <MessageBubbleActionButton onClick={() => void actions.handleDelete()} danger tooltip={t('common.delete')}>
        <Trash2 className="h-3.5 w-3.5" />
      </MessageBubbleActionButton>
    </div>
  );
}
