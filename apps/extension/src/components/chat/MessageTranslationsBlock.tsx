/**
 * 说明：`MessageTranslationsBlock` 组件模块。
 *
 * 职责：
 * - 承载 `MessageTranslationsBlock` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MessageTranslationsBlock` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { Copy, Loader2, X } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { MessageTranslation } from '@/types/chat';
import { toast } from '@/hooks/useToast';
import { getSuccessfulMessageTranslations } from '@/lib/chat/message-translations';
import { getTranslationLanguageDisplayLabel } from '@/lib/chat/translation-languages';
import { TooltipAction } from '@/components/ui/tooltip-action';

import { MessageErrorNotice } from './MessageErrorNotice';

interface MessageTranslationsBlockProps {
  /** 当前消息挂载的所有翻译条目。 */
  translations?: MessageTranslation[];
  /** 是否允许复制、关闭和打开错误详情。 */
  interactive?: boolean;
  /** 清空当前消息的全部翻译。 */
  onClearAll?: () => void;
  /** 移除指定语言的单个翻译条目。 */
  onRemoveTranslation?: (language: string) => void;
}

const EMPTY_TRANSLATIONS: MessageTranslation[] = [];

/** 消息下方的共享内联翻译区块。 */
export function MessageTranslationsBlock({
  translations,
  interactive = true,
  onClearAll,
  onRemoveTranslation,
}: MessageTranslationsBlockProps) {
  const { t, i18n } = useTranslation();
  const items = useMemo(
    () => (Array.isArray(translations) ? translations : EMPTY_TRANSLATIONS),
    [translations],
  );
  const successfulTranslations = useMemo(() => getSuccessfulMessageTranslations(items), [items]);
  const firstCopyableTranslation = useMemo(
    () => successfulTranslations.find((translation) => String(translation.content || '').trim()),
    [successfulTranslations],
  );

  if (items.length === 0) return null;

    /**
   * 内部函数变量：`copyTranslation`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const copyTranslation = async () => {
    if (!firstCopyableTranslation) return;

    try {
      await navigator.clipboard.writeText(firstCopyableTranslation.content);
      toast({ title: t('chat.copied'), description: t('message.translationCopied') });
    } catch {
      toast({ title: t('common.error'), description: t('sidebar.clipboardFailed'), variant: 'destructive' });
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t border-border/40 pt-3" data-testid="message-translations">
      <div className="flex items-center gap-2">
        <span data-skip-search="true" className="text-xs font-medium text-muted-foreground">
          {t('message.translation')}
        </span>
        <div className="flex-1" />
        {interactive && firstCopyableTranslation ? (
          <TooltipAction tooltip={t('message.copyTranslation')}>
            <button
              type="button"
              onClick={() => { void copyTranslation(); }}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </TooltipAction>
        ) : null}
        {interactive && onClearAll ? (
          <TooltipAction tooltip={t('message.closeTranslation')}>
            <button
              type="button"
              onClick={onClearAll}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </TooltipAction>
        ) : null}
      </div>

      {items.map((translation) => {
        const displayLanguage = getTranslationLanguageDisplayLabel(translation.language, i18n.language);
        const languageLabel = t('message.translationTargetLabel', { language: displayLanguage });
        if (translation.status === 'loading') {
          const hasStreamingContent = Boolean(String(translation.content || '').trim());
          return (
            <div key={translation.language} className="rounded-lg border border-border/60 bg-muted/20 p-2">
              <div data-skip-search="true" className="mb-1 text-[11px] text-muted-foreground">
                {languageLabel}
              </div>
              {hasStreamingContent ? (
                <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{translation.content}</div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{t('translation.translating')}</span>
                </div>
              )}
            </div>
          );
        }

        if (translation.status === 'error') {
          return (
            <div key={translation.language} className="rounded-lg border border-border/60 bg-muted/20 p-2">
              <div data-skip-search="true" className="mb-2 text-[11px] text-muted-foreground">
                {languageLabel}
              </div>
              <MessageErrorNotice
                error={translation.error || { key: 'common.error' }}
                details={translation.errorDetails}
                interactive={interactive}
                dismissible={interactive && Boolean(onRemoveTranslation)}
                onDismiss={interactive ? () => onRemoveTranslation?.(translation.language) : undefined}
              />
            </div>
          );
        }

        return (
          <div key={translation.language} className="rounded-lg border border-border/60 bg-muted/20 p-2">
            <div data-skip-search="true" className="mb-1 text-[11px] text-muted-foreground">
              {languageLabel}
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{translation.content}</div>
          </div>
        );
      })}
    </div>
  );
}
