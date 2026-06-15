/**
 * 说明：`message-image-actions` 组件模块。
 *
 * 职责：
 * - 承载 `message-image-actions` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MessageImageAttachment`、`getMessageImageAttachments`、`getSelectedMessageImageAttachment` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { getAttachmentBlob } from '@/lib/attachments';
import { downloadBlob } from '@/lib/export/download';
import { getMessageContextReferenceAttachmentIds } from '@/lib/chat/message-context-references';
import type { Message } from '@/types/chat';

/**
 * 从消息附件数组中提取出的图片附件结构。
 */
export type MessageImageAttachment = Extract<NonNullable<Message['attachments']>[number], { type: 'image' }>;

/**
 * 提取消息中所有可操作的图片附件。
 *
 * @param message - 原始聊天消息。
 * @returns 仅保留带有效附件 ID 的图片附件，供预览、复制和导出使用。
 */
export function getMessageImageAttachments(message: Message): MessageImageAttachment[] {
  const contextOwnedAttachmentIds = getMessageContextReferenceAttachmentIds(message);
  return (message.attachments ?? []).filter((attachment): attachment is MessageImageAttachment => {
    const id = typeof attachment?.id === 'string' ? attachment.id.trim() : '';
    return attachment?.type === 'image' && id.length > 0 && !contextOwnedAttachmentIds.has(id);
  });
}

/**
 * 根据索引选出当前激活的图片附件。
 *
 * @param attachments - 已过滤后的图片附件列表。
 * @param index - UI 当前选中的图片下标。
 * @returns 当索引非法时会自动夹紧到合法范围；附件为空时返回 `null`。
 */
export function getSelectedMessageImageAttachment(
  attachments: MessageImageAttachment[],
  index: number,
): MessageImageAttachment | null {
  if (attachments.length === 0) return null;
  const safeIndex = Number.isFinite(index) ? Math.max(0, Math.min(attachments.length - 1, Math.floor(index))) : 0;
  return attachments[safeIndex] ?? attachments[0] ?? null;
}

/**
 * 读取附件对应的 Blob，不存在时抛出带 UI 文案的错误。
 *
 * @param attachment - 目标图片附件。
 * @param missingMessage - 当附件实体缺失时抛出的提示文案。
 * @returns 附件二进制内容。
 */
async function requireAttachmentBlob(attachment: MessageImageAttachment, missingMessage: string) {
  const blob = await getAttachmentBlob(attachment.id);
  if (!blob) throw new Error(missingMessage);
  return blob;
}

/**
 * 将数字格式化为 2 位字符串。
 */
function pad2(value: number) {
  return String(value).padStart(2, '0');
}

/**
 * 将数字格式化为 3 位字符串。
 */
function pad3(value: number) {
  return String(value).padStart(3, '0');
}

/**
 * 生成适合文件名的时间戳。
 *
 * @param now - 可注入的时间对象，便于测试。
 * @returns 形如 `2026-03-26_14-23-05-123` 的时间戳字符串。
 */
function formatExportTimestamp(now = new Date()) {
  return [
    now.getFullYear(),
    pad2(now.getMonth() + 1),
    pad2(now.getDate()),
  ].join('-') + '_' + [
    pad2(now.getHours()),
    pad2(now.getMinutes()),
    pad2(now.getSeconds()),
    pad3(now.getMilliseconds()),
  ].join('-');
}

/**
 * 根据 MIME 类型推断导出文件扩展名。
 *
 * @param mime - 图片 MIME。
 * @returns 常见图片后缀，无法识别时回退为 `png`。
 */
function inferExtension(mime: string) {
  const normalized = String(mime || '').toLowerCase();
  if (normalized.includes('jpeg')) return 'jpg';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('bmp')) return 'bmp';
  if (normalized.includes('svg')) return 'svg';
  return 'png';
}

/**
 * 基于附件原名与当前时间生成导出文件名。
 *
 * @param attachment - 目标图片附件。
 * @param now - 可选时间对象，便于测试与稳定输出。
 * @returns 带时间戳的文件名，避免重复下载时被浏览器覆盖。
 */
function buildTimestampedImageFilename(attachment: MessageImageAttachment, now = new Date()) {
  const rawName = String(attachment.name || '').trim();
  const dotIndex = rawName.lastIndexOf('.');
  const hasExtension = dotIndex > 0 && dotIndex < rawName.length - 1;
  const basename = hasExtension ? rawName.slice(0, dotIndex) : (rawName || `image-${attachment.id}`);
  const extension = hasExtension ? rawName.slice(dotIndex + 1) : inferExtension(attachment.mime);
  return `${basename}_${formatExportTimestamp(now)}.${extension}`;
}

/**
 * 将消息图片写入系统剪贴板。
 *
 * @param attachment - 目标图片附件。
 * @param options - 国际化错误文案集合。
 * @returns 写入成功后返回。
 * @throws 当附件缺失或浏览器不支持二进制剪贴板写入时抛错。
 */
export async function copyMessageImageAttachment(
  attachment: MessageImageAttachment,
  options: {
    /**
     * 找不到附件实体时向上抛出的错误文案。
     */
    missingMessage: string;
    /**
     * 浏览器不支持 `ClipboardItem` 或 `clipboard.write` 时的错误文案。
     */
    clipboardUnsupportedMessage: string;
  },
) {
  const blob = await requireAttachmentBlob(attachment, options.missingMessage);

  /** 浏览器原生 `ClipboardItem` 构造函数签名（用于兼容性探测与类型收窄）。 */
  type ClipboardItemConstructor = new (items: Record<string, Blob>) => ClipboardItem;
  const ClipboardItemCtor = (globalThis as unknown as { ClipboardItem?: ClipboardItemConstructor }).ClipboardItem;
  if (!navigator.clipboard?.write || !ClipboardItemCtor) {
    throw new Error(options.clipboardUnsupportedMessage);
  }

  const mime = blob.type || attachment.mime || 'image/png';
  await navigator.clipboard.write([new ClipboardItemCtor({ [mime]: blob })]);
}

/**
 * 将消息图片导出为本地文件。
 *
 * @param attachment - 目标图片附件。
 * @param options - 国际化错误文案集合。
 * @returns 下载任务触发完成后返回。
 */
export async function exportMessageImageAttachment(
  attachment: MessageImageAttachment,
  options: {
    /**
     * 找不到附件实体时向上抛出的错误文案。
     */
    missingMessage: string;
  },
) {
  const blob = await requireAttachmentBlob(attachment, options.missingMessage);
  const filename = buildTimestampedImageFilename(attachment);
  await downloadBlob(blob, filename);
}
