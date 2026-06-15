/**
 * 说明：`useChatAttachments` 组件模块。
 *
 * 职责：
 * - 承载 `useChatAttachments` 相关的当前文件实现与模块边界；
 * - 对外暴露 `PendingAttachment`、`UseChatAttachmentsOptions`、`UseChatAttachmentsResult` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { toast } from '@/hooks/useToast';
import { deleteAttachments, getAttachmentBlob, putFileAttachment, putImageAttachment } from '@/lib/attachments';
import { isLikelyAudioAttachment, isLikelyTextAttachment } from '@/lib/chat/attachment-media';
import { decodeOutboundImageDataUrl, normalizeOutboundImageBlob } from '@/lib/chat/outbound-image-normalization';
import { I18nError } from '@/lib/i18n/error';
import type { MessageAttachment } from '@/types/chat';
import { useSerialTaskQueue } from './useSerialTaskQueue';

/** 聊天输入区附件控制器依赖的最小翻译函数签名。 */
type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

/**
 * 待发送附件在输入区中的展示结构。
 */
export type PendingAttachment = {
  /**
   * 已持久化的附件引用。
   */
  ref: MessageAttachment;
  /**
   * 仅用于本地预览的对象 URL。
   */
  previewUrl?: string;
};

/**
 * 进入串行上传队列前的附件草稿结构。
 */
type QueuedAttachmentDraft =
  | {
      /**
       * 图片文件草稿。
       */
      kind: 'image';
      /**
       * 原始文件对象。
       */
      file: File;
    }
  | {
      /**
       * 普通文件草稿。
       */
      kind: 'file';
      /**
       * 原始文件对象。
       */
      file: File;
    }
  | {
      /**
       * 由粘贴长文本生成的 Blob 文件草稿。
       */
      kind: 'blob-file';
      /**
       * 原始 Blob。
       */
      blob: Blob;
      /**
       * 生成的文件名。
       */
      name: string;
      /**
       * 生成文件的 MIME。
       */
      mime: string;
      /**
       * 成功入队后需要展示的 toast 文案。
       */
      successToastDescription?: string;
    };

/**
 * 聊天附件 hook 入参。
 */
export interface UseChatAttachmentsOptions {
  /**
   * 国际化函数。
   */
  t: TranslateFn;
  /**
   * 粘贴超长文本时是否转为文件附件。
   */
  pasteLongTextAsFile: boolean;
  /**
   * 超过该长度的纯文本会按文件附件处理。
   */
  pasteLongTextThreshold: number;
  /**
   * 更新输入框文本的回调。
   */
  setText: Dispatch<SetStateAction<string>>;
  /**
   * 把焦点还给输入框的回调。
   */
  focusInput: () => void;
}

/**
 * 聊天附件 hook 返回值。
 */
export interface UseChatAttachmentsResult {
  /**
   * 当前待发送附件列表。
   */
  attachments: PendingAttachment[];
  /**
   * 当前是否处于拖拽悬停状态。
   */
  isDragging: boolean;
  /**
   * 当前待发送附件中是否包含图片。
   */
  hasImageAttachments: boolean;
  /**
   * 把一组文件加入待发送附件队列。
   */
  addFiles: (files: FileList | File[] | null) => Promise<void>;
  /**
   * 把已经落库的外部附件加入待发送队列。
   */
  addExistingAttachments: (items: MessageAttachment[]) => Promise<MessageAttachment[]>;
  /**
   * 把外部截图 data URL 交给输入区附件系统统一校验、落库并加入待发送队列。
   */
  addImageDataUrlAttachment: (item: { dataUrl: string; name?: string; mime?: string }) => Promise<MessageAttachment[]>;
  /**
   * 按索引删除一条待发送附件。
   */
  removeAttachmentAt: (idx: number) => void;
  /**
   * 按附件 ID 删除一组待发送附件。
   */
  removeAttachmentsByIds: (ids: string[]) => void;
  /**
   * 把文件附件内容追加到输入框。
   */
  appendFileToInput: (attachment: MessageAttachment & { type: 'file' }) => Promise<void>;
  /**
   * 复制文件附件的文本内容。
   */
  copyFileContent: (attachment: MessageAttachment & { type: 'file' }) => Promise<void>;
  /**
   * 处理输入框粘贴事件。
   */
  handlePaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  /**
   * 处理拖拽悬停事件。
   */
  handleDragOver: (event: React.DragEvent) => void;
  /**
   * 处理拖拽离开事件。
   */
  handleDragLeave: (event: React.DragEvent) => void;
  /**
   * 处理文件拖放事件。
   */
  handleDrop: (event: React.DragEvent) => void;
  /**
   * 消费当前全部待发送附件，并清空输入区状态。
   */
  consumeAttachments: () => MessageAttachment[];
}

const MAX_IMAGE_ATTACHMENTS = 4;
const MAX_FILE_ATTACHMENTS = 6;
const MAX_IMAGE_ATTACHMENT_BYTES = 6 * 1024 * 1024;
const MAX_FILE_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const MAX_AUDIO_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * 聊天输入区附件控制器。
 *
 * 负责处理粘贴/拖拽/选择文件产生的附件队列、预览 URL 生命周期、
 * 附件数量和大小限制，以及上传失败后的清理逻辑。
 *
 * @param options - 国际化函数、粘贴策略与输入框控制器。
 * @returns 附件状态与常用操作集合。
 */
export function useChatAttachments({
  t,
  pasteLongTextAsFile,
  pasteLongTextThreshold,
  setText,
  focusInput,
}: UseChatAttachmentsOptions): UseChatAttachmentsResult {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const attachmentsRef = useRef<PendingAttachment[]>([]);
  const attachmentGenerationRef = useRef(0);
  const composerDisposedRef = useRef(false);
  const runAttachmentQueue = useSerialTaskQueue();

  /**
   * 统一更新附件状态，并同步维护 ref 镜像。
   */
  const updateAttachments = useCallback((updater: (prev: PendingAttachment[]) => PendingAttachment[]) => {
    setAttachments((prev) => {
      const next = updater(prev);
      attachmentsRef.current = next;
      return next;
    });
  }, []);

  /**
   * 回收单个预览对象 URL。
   */
  const revokePreviewUrl = useCallback((previewUrl?: string) => {
    if (!previewUrl) return;
    try {
      URL.revokeObjectURL(previewUrl);
    } catch {
      // Ignore preview cleanup failures during teardown.
    }
  }, []);

  /**
   * 清理一批已入队但最终未使用的附件实体。
   */
  const cleanupQueuedAttachments = useCallback(async (items: PendingAttachment[]) => {
    if (items.length === 0) return;

    for (const item of items) revokePreviewUrl(item.previewUrl);
    const ids = items.map((item) => item.ref.id).filter(Boolean);
    if (ids.length > 0) {
      await deleteAttachments(ids).catch(() => void 0);
    }
  }, [revokePreviewUrl]);

  useEffect(() => {
    return () => {
      composerDisposedRef.current = true;
      attachmentGenerationRef.current += 1;
      for (const item of attachmentsRef.current) revokePreviewUrl(item.previewUrl);
      attachmentsRef.current = [];
    };
  }, [revokePreviewUrl]);

  /**
   * 以串行方式处理附件草稿队列。
   *
   * 该流程会统一执行数量/大小校验、真正写入附件仓库，以及在组件销毁或代际变化时清理脏数据。
   */
  const enqueueAttachmentDrafts = useCallback(async (drafts: readonly QueuedAttachmentDraft[]) => {
    if (drafts.length === 0) return;

    const generation = attachmentGenerationRef.current;
    /**
     * 判断当前这批附件处理流程是否已经过期。
     *
     * 说明：
     * - 组件卸载或新一代上传流程开始后，旧异步结果必须立即作废；
     * - 这样可以避免附件重复落库、预览 URL 泄漏或旧结果覆盖新状态。
     */
    const isStale = () => composerDisposedRef.current || attachmentGenerationRef.current !== generation;

    await runAttachmentQueue(async () => {
      if (isStale()) return;

      let imageCount = attachmentsRef.current.filter((item) => item.ref.type === 'image').length;
      let fileCount = attachmentsRef.current.filter((item) => item.ref.type === 'file').length;
      const staged: PendingAttachment[] = [];
      const successDescriptions: string[] = [];

      for (const draft of drafts) {
        if (isStale()) {
          await cleanupQueuedAttachments(staged);
          return;
        }

        if (draft.kind === 'image') {
          if (imageCount >= MAX_IMAGE_ATTACHMENTS) {
            toast({
              title: t('chat.tooManyImagesTitle'),
              description: t('chat.tooManyImagesDesc', { count: MAX_IMAGE_ATTACHMENTS }),
              variant: 'destructive',
            });
            continue;
          }
          if (draft.file.size > MAX_IMAGE_ATTACHMENT_BYTES) {
            toast({
              title: t('chat.imageTooLargeTitle'),
              description: t('chat.imageTooLargeDesc', { name: draft.file.name || 'image' }),
              variant: 'destructive',
            });
            continue;
          }

          try {
            const normalized = await normalizeOutboundImageBlob({
              blob: draft.file,
              name: draft.file.name || 'image',
              mime: draft.file.type || 'image/*',
            });
            if (normalized.size > MAX_IMAGE_ATTACHMENT_BYTES) {
              toast({
                title: t('chat.imageTooLargeTitle'),
                description: t('chat.imageTooLargeDesc', { name: normalized.name || draft.file.name || 'image' }),
                variant: 'destructive',
              });
              continue;
            }
            const ref = await putImageAttachment({
              blob: normalized.blob,
              name: normalized.name,
              mime: normalized.mime,
            });
            if (isStale()) {
              await deleteAttachments([ref.id]).catch(() => void 0);
              await cleanupQueuedAttachments(staged);
              return;
            }

            staged.push({ ref, previewUrl: URL.createObjectURL(normalized.blob) });
            imageCount += 1;
          } catch (error: unknown) {
            toast({
              title: t('chat.addFailedTitle'),
              description: error instanceof Error ? error.message : String(error),
              variant: 'destructive',
            });
          }
          continue;
        }

        const blob = draft.kind === 'blob-file' ? draft.blob : draft.file;
        const name = draft.kind === 'blob-file' ? draft.name : draft.file.name || 'file';
        const mime = draft.kind === 'blob-file' ? draft.mime : draft.file.type || 'application/octet-stream';

        const isAudioFile = draft.kind === 'file' && isLikelyAudioAttachment(name, mime);
        if (draft.kind === 'file' && !isAudioFile && !isLikelyTextAttachment(name, mime)) {
          toast({
            title: t('chat.unsupportedFileTitle'),
            description: t('chat.unsupportedFileDesc'),
            variant: 'destructive',
          });
          continue;
        }
        if (fileCount >= MAX_FILE_ATTACHMENTS) {
          toast({
            title: t('chat.tooManyFilesTitle'),
            description: t('chat.tooManyFilesDesc', { count: MAX_FILE_ATTACHMENTS }),
            variant: 'destructive',
          });
          continue;
        }
        const maxBytes = isAudioFile ? MAX_AUDIO_ATTACHMENT_BYTES : MAX_FILE_ATTACHMENT_BYTES;
        if (blob.size > maxBytes) {
          toast({
            title: t('chat.fileTooLargeTitle'),
            description: t('chat.fileTooLargeDesc', { name: name || 'file' }),
            variant: 'destructive',
          });
          continue;
        }

        try {
          const ref = await putFileAttachment({ blob, name, mime: mime || 'application/octet-stream' });
          if (isStale()) {
            await deleteAttachments([ref.id]).catch(() => void 0);
            await cleanupQueuedAttachments(staged);
            return;
          }

          staged.push({ ref });
          fileCount += 1;
          if (draft.kind === 'blob-file' && draft.successToastDescription) {
            successDescriptions.push(draft.successToastDescription);
          }
        } catch (error: unknown) {
          toast({
            title: t('chat.addFailedTitle'),
            description: error instanceof Error ? error.message : String(error),
            variant: 'destructive',
          });
        }
      }

      if (staged.length === 0) return;
      if (isStale()) {
        await cleanupQueuedAttachments(staged);
        return;
      }

      updateAttachments((prev) => [...prev, ...staged]);
      for (const description of successDescriptions) {
        toast({ title: t('common.success'), description });
      }
    });
  }, [cleanupQueuedAttachments, runAttachmentQueue, t, updateAttachments]);

  /**
   * 将文件列表转换为附件草稿并入队。
   */
  const addFiles = useCallback(async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;

    await enqueueAttachmentDrafts(
      Array.from(files).map<QueuedAttachmentDraft>((file) => (
        file.type.startsWith('image/')
          ? { kind: 'image', file }
          : { kind: 'file', file }
      )),
    );
  }, [enqueueAttachmentDrafts]);

  /**
   * 将外部流程已经落库的附件加入当前输入队列。
   *
   * @param items - 已持久化的消息附件引用。
   * @returns 实际接受进入输入区的附件引用。
   */
  const addExistingAttachments = useCallback(async (items: MessageAttachment[]) => {
    if (items.length === 0) return [];

    const generation = attachmentGenerationRef.current;
    /**
     * 判断当前外部附件入队流程是否已经过期。
     *
     * @returns 组件卸载或附件代际变化时返回 `true`。
     */
    const isStale = () => composerDisposedRef.current || attachmentGenerationRef.current !== generation;

    return await runAttachmentQueue(async () => {
      if (isStale()) return [];

      let imageCount = attachmentsRef.current.filter((item) => item.ref.type === 'image').length;
      let fileCount = attachmentsRef.current.filter((item) => item.ref.type === 'file').length;
      const staged: PendingAttachment[] = [];
      const accepted: MessageAttachment[] = [];
      const rejectedIds: string[] = [];

      for (const ref of items) {
        if (isStale()) {
          await cleanupQueuedAttachments(staged);
          return [];
        }

        if (ref.type === 'image') {
          if (imageCount >= MAX_IMAGE_ATTACHMENTS || ref.size > MAX_IMAGE_ATTACHMENT_BYTES) {
            rejectedIds.push(ref.id);
            continue;
          }
          let previewUrl: string | undefined;
          const blob = await getAttachmentBlob(ref.id);
          if (blob) previewUrl = URL.createObjectURL(blob);
          staged.push({ ref, previewUrl });
          accepted.push(ref);
          imageCount += 1;
          continue;
        }

        if (fileCount >= MAX_FILE_ATTACHMENTS || ref.size > MAX_FILE_ATTACHMENT_BYTES) {
          rejectedIds.push(ref.id);
          continue;
        }
        staged.push({ ref });
        accepted.push(ref);
        fileCount += 1;
      }

      if (rejectedIds.length > 0) {
        await deleteAttachments(rejectedIds).catch(() => void 0);
      }
      if (staged.length === 0) return accepted;
      if (isStale()) {
        await cleanupQueuedAttachments(staged);
        return [];
      }

      updateAttachments((prev) => [...prev, ...staged]);
      return accepted;
    });
  }, [cleanupQueuedAttachments, runAttachmentQueue, updateAttachments]);

  /**
   * 将外部图片 data URL 按输入区唯一附件规则加入队列。
   *
   * 说明：
   * - 页面截图不再由 Sidepanel bridge 预落库；
   * - 大小、数量、规范化、预览 URL 和清理都只走 ChatInput 附件真源。
   *
   * @param item - 外部图片 data URL 与元信息。
   * @returns 实际进入输入区的图片附件引用。
   */
  const addImageDataUrlAttachment = useCallback(async (item: { dataUrl: string; name?: string; mime?: string }) => {
    const generation = attachmentGenerationRef.current;
    /**
     * 判断截图 data URL 入队流程是否已经过期。
     *
     * @returns 组件卸载或附件代际变化时返回 `true`。
     */
    const isStale = () => composerDisposedRef.current || attachmentGenerationRef.current !== generation;

    return await runAttachmentQueue(async () => {
      if (isStale()) return [];
      const imageCount = attachmentsRef.current.filter((entry) => entry.ref.type === 'image').length;
      if (imageCount >= MAX_IMAGE_ATTACHMENTS) {
        throw new I18nError('errors.tooManyImageAttachments', { count: MAX_IMAGE_ATTACHMENTS });
      }

      const parsed = decodeOutboundImageDataUrl(item.dataUrl);
      if (parsed.blob.size > MAX_IMAGE_ATTACHMENT_BYTES) {
        const mb = Math.max(0.1, Math.round((parsed.blob.size / 1024 / 1024) * 10) / 10);
        throw new I18nError('errors.imageTooLargeSkipped', { mb });
      }

      const normalized = await normalizeOutboundImageBlob({
        blob: parsed.blob,
        name: item.name || `screenshot-${Date.now()}.png`,
        mime: item.mime || parsed.mime,
      });
      if (normalized.size > MAX_IMAGE_ATTACHMENT_BYTES) {
        const mb = Math.max(0.1, Math.round((normalized.size / 1024 / 1024) * 10) / 10);
        throw new I18nError('errors.imageTooLargeSkipped', { mb });
      }

      const ref = await putImageAttachment({
        blob: normalized.blob,
        name: normalized.name,
        mime: normalized.mime,
      });
      if (isStale()) {
        await deleteAttachments([ref.id]).catch(() => void 0);
        return [];
      }

      const pending: PendingAttachment = {
        ref,
        previewUrl: URL.createObjectURL(normalized.blob),
      };
      updateAttachments((prev) => [...prev, pending]);
      return [ref];
    });
  }, [runAttachmentQueue, updateAttachments]);

  /**
   * 删除指定索引的待发送附件。
   */
  const removeAttachmentAt = useCallback((idx: number) => {
    updateAttachments((prev) => {
      const current = prev[idx];
      if (current) {
        revokePreviewUrl(current.previewUrl);
        void deleteAttachments([current.ref.id]);
      }
      return prev.filter((_, index) => index !== idx);
    });
  }, [revokePreviewUrl, updateAttachments]);

  /**
   * 删除指定附件 ID 集合对应的待发送附件。
   */
  const removeAttachmentsByIds = useCallback((ids: string[]) => {
    const targetIds = new Set(ids.filter(Boolean));
    if (targetIds.size === 0) return;
    updateAttachments((prev) => {
      const removed = prev.filter((item) => targetIds.has(item.ref.id));
      for (const item of removed) revokePreviewUrl(item.previewUrl);
      const removedIds = removed.map((item) => item.ref.id);
      if (removedIds.length > 0) void deleteAttachments(removedIds);
      return prev.filter((item) => !targetIds.has(item.ref.id));
    });
  }, [revokePreviewUrl, updateAttachments]);

  /**
   * 读取文件附件的纯文本内容。
   */
  const readFileAttachmentText = useCallback(async (attachment: MessageAttachment & { type: 'file' }) => {
    const blob = await getAttachmentBlob(attachment.id);
    if (!blob) throw new Error(t('chat.attachmentMissing'));
    if (!isLikelyTextAttachment(attachment.name, attachment.mime || blob.type)) {
      throw new Error(t('chat.fileNotText'));
    }
    return await blob.text();
  }, [t]);

  /**
   * 把文件附件内容追加到输入框，并尽力复制到剪贴板。
   */
  const appendFileToInput = useCallback(async (attachment: MessageAttachment & { type: 'file' }) => {
    try {
      const content = await readFileAttachmentText(attachment);
      const block = `\n\n[${attachment.name}]\n${content}\n`;
      setText((prev) => (prev ? `${prev}${block}` : block.trimStart()));
      try {
        await navigator.clipboard.writeText(content);
      } catch {
        // Clipboard is best-effort only.
      }
      toast({ title: t('common.success'), description: t('chat.fileAppended') });
      focusInput();
    } catch (error: unknown) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  }, [focusInput, readFileAttachmentText, setText, t]);

  /**
   * 复制文件附件的纯文本内容。
   */
  const copyFileContent = useCallback(async (attachment: MessageAttachment & { type: 'file' }) => {
    try {
      const content = await readFileAttachmentText(attachment);
      await navigator.clipboard.writeText(content);
      toast({ title: t('chat.copied'), description: t('chat.fileCopied') });
    } catch (error: unknown) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  }, [readFileAttachmentText, t]);

  /**
   * 处理粘贴事件。
   *
   * 优先把粘贴图片当作附件处理；若开启“长文本转文件”，会把超长纯文本转成 `.txt` 附件。
   */
  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const dataTransfer = event.clipboardData;
    if (!dataTransfer) return;

    const filesFromFiles = Array.from(dataTransfer.files ?? []).filter((file) => (
      file && typeof file.type === 'string' && file.type.startsWith('image/')
    ));
    if (filesFromFiles.length > 0) {
      event.preventDefault();
      void addFiles(filesFromFiles);
      return;
    }

    const filesFromItems: File[] = [];
    const items = dataTransfer.items;
    if (items) {
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (!item) continue;
        if (item.kind !== 'file') continue;
        if (!String(item.type || '').startsWith('image/')) continue;
        const file = item.getAsFile();
        if (file) filesFromItems.push(file);
      }
    }
    if (filesFromItems.length > 0) {
      event.preventDefault();
      void addFiles(filesFromItems);
      return;
    }

    const textPlain = dataTransfer.getData('text/plain') ?? '';
    if (pasteLongTextAsFile && textPlain && textPlain.length >= pasteLongTextThreshold) {
      event.preventDefault();
      const name = `paste_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
      const blob = new Blob([textPlain], { type: 'text/plain' });
      void enqueueAttachmentDrafts([
        {
          kind: 'blob-file',
          blob,
          name,
          mime: 'text/plain',
          successToastDescription: t('chat.pastedAsFile', { name }),
        },
      ]);
    }
  }, [addFiles, enqueueAttachmentDrafts, pasteLongTextAsFile, pasteLongTextThreshold, t]);

  /**
   * 处理拖拽悬停事件。
   */
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  /**
   * 处理拖拽离开事件。
   */
  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  /**
   * 处理文件拖放事件。
   */
  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) {
      void addFiles(event.dataTransfer.files);
    }
  }, [addFiles]);

  /**
   * 消费当前待发送附件列表，并清空输入区附件状态。
   */
  const consumeAttachments = useCallback(() => {
    const refs = attachmentsRef.current.map((item) => item.ref);
    attachmentGenerationRef.current += 1;
    updateAttachments((prev) => {
      for (const item of prev) revokePreviewUrl(item.previewUrl);
      return [];
    });
    return refs;
  }, [revokePreviewUrl, updateAttachments]);

  const result: UseChatAttachmentsResult = {
    attachments,
    isDragging,
    hasImageAttachments: attachments.some((item) => item.ref.type === 'image'),
    addFiles,
    addExistingAttachments,
    addImageDataUrlAttachment,
    removeAttachmentAt,
    removeAttachmentsByIds,
    appendFileToInput,
    copyFileContent,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    consumeAttachments,
  };
  return result;
}
