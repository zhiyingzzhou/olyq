/**
 * 说明：`useMessageBubbleMedia` 组件模块。
 *
 * 职责：
 * - 承载 `useMessageBubbleMedia` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useMessageBubbleMedia` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getAttachmentBlob } from '@/lib/attachments';
import { getMessageContextReferenceAttachmentIds } from '@/lib/chat/message-context-references';
import {
  copyMessageImageAttachment,
  exportMessageImageAttachment,
  getMessageImageAttachments,
  getSelectedMessageImageAttachment,
} from '@/components/chat/message-image-actions';
import { hasMessageReasoningTrace, hasMessageToolCalls } from '@/lib/chat/message-trace';
import type { ImageMessageCardItem } from '@/components/chat/ImageMessageCard';
import type { Message } from '@/types/chat';

import type { FileRef, ImageUrlItem } from './types';

interface UseMessageBubbleMediaOptions {
  readonly isUser: boolean;
  readonly message: Message;
  readonly t: (key: string) => string;
}

/**
 * 导出 Hook：`useMessageBubbleMedia`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useMessageBubbleMedia({ isUser, message, t }: UseMessageBubbleMediaOptions) {
  const [imageIndex, setImageIndex] = useState(0);
  const [imageUrls, setImageUrls] = useState<ImageUrlItem[]>([]);
  const contextOwnedAttachmentIds = useMemo(
    () => getMessageContextReferenceAttachmentIds(message),
    [message],
  );

  const imageAttachments = useMemo(() => (
    getMessageImageAttachments(message).map((attachment) => ({
      ...attachment,
      name: attachment.name || t('chat.image'),
    }))
  ), [message, t]);

  const fileRefs = useMemo<FileRef[]>(() => (
    (message.attachments || [])
      .filter((attachment) => {
        const id = typeof attachment?.id === 'string' ? attachment.id.trim() : '';
        return attachment?.type === 'file' && id && !contextOwnedAttachmentIds.has(id);
      })
      .map((attachment) => ({
        id: attachment.id,
        name: attachment.name || t('chat.file'),
        mime: attachment.mime || 'application/octet-stream',
        size: attachment.size || 0,
      }))
  ), [contextOwnedAttachmentIds, message.attachments, t]);

  const imageCardItems = useMemo<ImageMessageCardItem[]>(() => (
    imageUrls.map((item) => ({ id: item.id, url: item.url, name: item.name }))
  ), [imageUrls]);

  const currentImageAttachment = useMemo(
    () => getSelectedMessageImageAttachment(imageAttachments, imageIndex),
    [imageAttachments, imageIndex],
  );

  useEffect(() => {
    if (imageAttachments.length === 0) {
      setImageUrls((current) => (current.length === 0 ? current : []));
      return;
    }

    let alive = true;
    const createdUrls: string[] = [];

    void Promise.all(
      imageAttachments.map(async (attachment) => {
        const blob = await getAttachmentBlob(attachment.id);
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        createdUrls.push(url);
        return { id: attachment.id, url, name: attachment.name };
      }),
    )
      .then((items) => {
        if (!alive) {
          for (const url of createdUrls) {
            try {
              URL.revokeObjectURL(url);
            } catch {
              // 忽略 object url 清理失败
            }
          }
          return;
        }
        setImageUrls(items.filter(Boolean) as ImageUrlItem[]);
      })
      .catch(() => {
        if (!alive) return;
        setImageUrls([]);
      });

    return () => {
      alive = false;
      for (const url of createdUrls) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // 忽略 object url 清理失败
        }
      }
    };
  }, [imageAttachments]);

  useEffect(() => {
    setImageIndex(0);
  }, [message.id, imageAttachments.length]);

  const hasImageAttachments = imageAttachments.length > 0;

  const isImageOnlyAssistantMessage = useMemo(() => {
    if (isUser) return false;
    if (String(message.content || '').trim()) return false;
    if (hasMessageReasoningTrace(message)) return false;
    if (message.error) return false;
    if (hasMessageToolCalls(message)) return false;
    if (fileRefs.length > 0) return false;
    return imageAttachments.length > 0;
  }, [fileRefs.length, imageAttachments.length, isUser, message]);

  const shouldRenderImageMessageCard = useMemo(() => {
    if (isUser || message.error) return false;
    if (isImageOnlyAssistantMessage) return true;
    if (message.status !== 'preparing' && message.status !== 'processing') return false;
    if (message.renderHint !== 'image') return false;
    if (String(message.content || '').trim()) return false;
    if (hasMessageReasoningTrace(message)) return false;
    if (hasMessageToolCalls(message)) return false;
    if (fileRefs.length > 0) return false;
    return true;
  }, [fileRefs.length, isImageOnlyAssistantMessage, isUser, message]);

  const copyCurrentImageAttachmentToClipboard = useCallback(async () => {
    if (!currentImageAttachment) throw new Error(t('chat.attachmentMissing'));
    await copyMessageImageAttachment(currentImageAttachment, {
      missingMessage: t('chat.attachmentMissing'),
      clipboardUnsupportedMessage: t('errors.clipboardImageWriteUnsupported'),
    });
  }, [currentImageAttachment, t]);

  const exportCurrentImageAttachment = useCallback(async () => {
    if (!currentImageAttachment) throw new Error(t('chat.attachmentMissing'));
    await exportMessageImageAttachment(currentImageAttachment, {
      missingMessage: t('chat.attachmentMissing'),
    });
  }, [currentImageAttachment, t]);

  return {
    copyCurrentImageAttachmentToClipboard,
    currentImageAttachment,
    exportCurrentImageAttachment,
    fileRefs,
    hasImageAttachments,
    imageAttachments,
    imageCardItems,
    imageIndex,
    imageUrls,
    isImageOnlyAssistantMessage,
    setImageIndex,
    shouldRenderImageMessageCard,
  };
}
