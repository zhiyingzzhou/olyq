/**
 * 说明：`useMessageBubbleActions` 组件模块。
 *
 * 职责：
 * - 承载 `useMessageBubbleActions` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useMessageBubbleActions` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { toast } from '@/hooks/useToast';
import { downloadText } from '@/lib/export/download';
import { buildMarkdownExportDocument, buildWordExportDocument } from '@/lib/export/document-builder';
import { getSuccessfulMessageTranslations } from '@/lib/chat/message-translations';
import type { Message } from '@/types/chat';

interface UseMessageBubbleActionsOptions {
  readonly confirmDelete: boolean;
  readonly confirmRegenerate: boolean;
  readonly confirmRegenerateTitle: string;
  readonly copyCurrentImageAttachmentToClipboard: () => Promise<void>;
  readonly displayModel: string;
  readonly exportCurrentImageAttachment: () => Promise<void>;
  readonly getExportModelLabel: (target: Message) => string | undefined;
  readonly isImageOnlyAssistantMessage: boolean;
  readonly message: Message;
  readonly modelId?: string;
  readonly onDelete: () => void;
  readonly onEdit: (content: string) => void;
  readonly onRegenerate?: () => void;
  readonly t: (key: string, params?: Record<string, unknown>) => string;
  readonly timeText: string;
}

/**
 * 导出 Hook：`useMessageBubbleActions`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useMessageBubbleActions({
  confirmDelete,
  confirmRegenerate,
  confirmRegenerateTitle,
  copyCurrentImageAttachmentToClipboard,
  displayModel,
  exportCurrentImageAttachment,
  getExportModelLabel,
  isImageOnlyAssistantMessage,
  message,
  modelId,
  onDelete,
  onEdit,
  onRegenerate,
  t,
  timeText,
}: UseMessageBubbleActionsOptions) {
  const { confirm, ConfirmDialogPortal } = useConfirmDialog();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setEditText(message.content);
  }, [message.content]);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  const successfulTranslations = useMemo(
    () => getSuccessfulMessageTranslations(message.translations),
    [message.translations],
  );

  const buildMessageExportTitle = useCallback(
    () => `${t('message.message')} · ${timeText || message.id}`,
    [message.id, t, timeText],
  );

  const resetCopiedState = useCallback(() => {
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }, []);

  const copy = useCallback(() => {
    if (isImageOnlyAssistantMessage) {
      void (async () => {
        try {
          await copyCurrentImageAttachmentToClipboard();
          toast({ title: t('common.success'), description: t('message.copiedImage') });
          resetCopiedState();
        } catch (error) {
          toast({
            title: t('common.error'),
            description: error instanceof Error ? error.message : String(error),
            variant: 'destructive',
          });
        }
      })();
      return;
    }

    const normalized = String(message.content || '')
      .trimStart()
      .replace(/[ \t]{2,}\n/g, '\n');
    void navigator.clipboard.writeText(normalized).catch(() => undefined);
    resetCopiedState();
  }, [copyCurrentImageAttachmentToClipboard, isImageOnlyAssistantMessage, message.content, resetCopiedState, t]);

  const copyTranslation = useCallback(async () => {
    const content = successfulTranslations.find((translation) => String(translation.content || '').trim())?.content;
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      toast({ title: t('chat.copied'), description: t('message.translationCopied') });
    } catch {
      toast({ title: t('common.error'), description: t('sidebar.clipboardFailed'), variant: 'destructive' });
    }
  }, [successfulTranslations, t]);

  const exportMarkdown = useCallback(async (opts: { includeReasoning: boolean; copy?: boolean; filenamePrefix?: string }) => {
    const markdown = await buildMarkdownExportDocument({
      title: buildMessageExportTitle(),
      messages: [message],
      includeReasoning: opts.includeReasoning,
      fallbackAssistantModelLabel: String(message.modelId || modelId || displayModel || '').trim() || undefined,
      getModelLabel: getExportModelLabel,
    });

    if (opts.copy) {
      try {
        await navigator.clipboard.writeText(markdown);
        toast({ title: t('chat.copied'), description: t('message.copiedMarkdown') });
      } catch {
        toast({ title: t('common.error'), description: t('sidebar.clipboardFailed'), variant: 'destructive' });
      }
      return;
    }

    const ts = new Date(message.createdAt);
    const stamp = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')}_${String(ts.getHours()).padStart(2, '0')}-${String(ts.getMinutes()).padStart(2, '0')}-${String(ts.getSeconds()).padStart(2, '0')}`;
    await downloadText(markdown, `${opts.filenamePrefix || 'message'}_${stamp}.md`, 'text/markdown;charset=utf-8');
    toast({ title: t('common.success'), description: t('message.exportedMarkdown') });
  }, [buildMessageExportTitle, displayModel, getExportModelLabel, message, modelId, t]);

  const exportWord = useCallback(async () => {
    const html = await buildWordExportDocument({
      title: buildMessageExportTitle(),
      messages: [message],
      includeReasoning: true,
      fallbackAssistantModelLabel: String(message.modelId || modelId || displayModel || '').trim() || undefined,
      getModelLabel: getExportModelLabel,
    });

    const ts = new Date(message.createdAt);
    const stamp = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')}_${String(ts.getHours()).padStart(2, '0')}-${String(ts.getMinutes()).padStart(2, '0')}-${String(ts.getSeconds()).padStart(2, '0')}`;
    await downloadText(html, `message_${stamp}.doc`, 'application/msword;charset=utf-8');
    toast({ title: t('common.success'), description: t('message.exportedWord') });
  }, [buildMessageExportTitle, displayModel, getExportModelLabel, message, modelId, t]);

  const handleCopyImage = useCallback(async () => {
    try {
      await copyCurrentImageAttachmentToClipboard();
      toast({ title: t('common.success'), description: t('message.copiedImage') });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  }, [copyCurrentImageAttachmentToClipboard, t]);

  const handleExportImage = useCallback(async () => {
    try {
      await exportCurrentImageAttachment();
      toast({ title: t('common.success'), description: t('message.exportedImage') });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  }, [exportCurrentImageAttachment, t]);

  const handleCopyPlain = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content || '');
      toast({ title: t('chat.copied'), description: t('message.copiedPlain') });
    } catch {
      toast({ title: t('common.error'), description: t('sidebar.clipboardFailed'), variant: 'destructive' });
    }
  }, [message.content, t]);

  const handleDelete = useCallback(async () => {
    if (confirmDelete) {
      const ok = await confirm({
        title: t('message.confirmDelete'),
        description: t('message.confirmDeleteDesc'),
        confirmLabel: t('common.delete'),
        cancelLabel: t('common.cancel'),
        variant: 'destructive',
      });
      if (!ok) return;
    }
    onDelete();
  }, [confirm, confirmDelete, onDelete, t]);

  const handleRegenerate = useCallback(async () => {
    if (!onRegenerate) return;
    if (confirmRegenerate) {
      const ok = await confirm({
        title: confirmRegenerateTitle,
        description: confirmRegenerateTitle === t('message.confirmResend')
          ? t('message.confirmResendDesc')
          : t('message.confirmRegenerateDesc'),
        confirmLabel: confirmRegenerateTitle === t('message.confirmResend') ? t('chat.resend') : t('chat.regenerate'),
        cancelLabel: t('common.cancel'),
        variant: 'destructive',
      });
      if (!ok) return;
    }
    onRegenerate();
  }, [confirm, confirmRegenerate, confirmRegenerateTitle, onRegenerate, t]);

  const saveEdit = useCallback(() => {
    onEdit(editText);
    setEditing(false);
  }, [editText, onEdit]);

  const startEditing = useCallback(() => {
    setEditText(message.content);
    setEditing(true);
  }, [message.content]);

  return {
    ConfirmDialogPortal,
    copied,
    copy,
    copyTranslation,
    editText,
    editing,
    exportMarkdown,
    exportWord,
    handleCopyImage,
    handleCopyPlain,
    handleDelete,
    handleExportImage,
    handleRegenerate,
    saveEdit,
    setCopied,
    setEditText,
    setEditing,
    startEditing,
    successfulTranslations,
  };
}
