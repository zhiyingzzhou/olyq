/**
 * 说明：`run-stream-chat-file-events` 基础能力模块。
 *
 * 职责：
 * - 承载 `run-stream-chat-file-events` 相关的当前文件实现与模块边界；
 * - 对外暴露 `persistPendingStreamFiles` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { downloadUrlToFile } from '@/lib/ai/image-download';
import { toI18nTextFromError } from '@/lib/i18n/error';
import type { MessageAttachment } from '@/types/chat';
import type { I18nText } from '@/types/i18n';
import type { DeveloperDebugSource } from '@/hooks/useDeveloperToolsStore';
import type { PendingStreamFile } from './run-stream-chat-types';

interface PersistPendingStreamFilesOptions {
  readonly developerSource: DeveloperDebugSource;
  readonly pendingFiles: PendingStreamFile[];
  readonly requestId: string;
  readonly terminalKind: 'done' | 'error' | 'aborted';
}

/**
 * 导出函数：`persistPendingStreamFiles`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function persistPendingStreamFiles({
  developerSource,
  pendingFiles,
  requestId,
  terminalKind,
}: PersistPendingStreamFilesOptions): Promise<{
  attachments: MessageAttachment[];
  imageDownloadError: I18nText | null;
}> {
  const attachments: MessageAttachment[] = [];
  let imageDownloadError: I18nText | null = null;

  if (pendingFiles.length === 0) {
    return { attachments, imageDownloadError };
  }

  const { putImageAttachment } = await import('@/lib/attachments');

  void requestId;
  void developerSource;

  for (const file of pendingFiles) {
    try {
      if (terminalKind === 'aborted' && file.kind === 'url') continue;
      const resolved = file.kind === 'url'
        ? await downloadUrlToFile(file.url)
        : { base64: file.data, mediaType: file.mediaType };
      if (!resolved?.base64) continue;

      const mediaType = String(resolved.mediaType || 'image/png');
      const binary = atob(resolved.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const extension = mediaType.split('/')[1]?.split(';')[0] || 'png';
      const blob = new Blob([bytes], { type: mediaType });
      const name = file.kind === 'url' && typeof file.name === 'string' && file.name.trim()
        ? file.name.trim()
        : `generated.${extension}`;
      const attachment = await putImageAttachment({ blob, name, mime: mediaType });
      attachments.push({
        type: 'image',
        id: attachment.id,
        name: attachment.name,
        mime: attachment.mime,
        size: attachment.size,
      });
    } catch (error) {
      if (!imageDownloadError) imageDownloadError = toI18nTextFromError(error);
    }
  }

  return { attachments, imageDownloadError };
}
