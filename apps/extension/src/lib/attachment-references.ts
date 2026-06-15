/**
 * 说明：`attachment-references` 基础能力模块。
 *
 * 职责：
 * - 承载 `attachment-references` 相关的当前文件实现与模块边界；
 * - 对外暴露 `collectAttachmentIdsFromTopicRows`、`stripAttachmentRefsFromTopicRows`、`collectAttachmentIdsFromPaintingsStorage` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { TopicMessagesRow } from '@/lib/chat/messages-db';
import type { Message } from '@/types/chat';

/** 从单条消息对象里收集附件 ID。 */
function collectAttachmentIdsFromMessage(raw: unknown): string[] {
  const ids: string[] = [];
  if (!raw || typeof raw !== 'object') return ids;
  const attachments = (raw as { attachments?: unknown }).attachments;
  if (!Array.isArray(attachments)) return ids;
  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== 'object') continue;
    const type = (attachment as Record<string, unknown>).type;
    const id = (attachment as Record<string, unknown>).id;
    if ((type === 'image' || type === 'file') && typeof id === 'string' && id.trim()) {
      ids.push(id.trim());
    }
  }
  return ids;
}

/** 从绘画记录中的图片引用数组里收集附件 ID。 */
function collectAttachmentIdsFromImageRefs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const id = (item as { id?: unknown }).id;
    if (typeof id === 'string' && id.trim()) ids.push(id.trim());
  }
  return ids;
}

/**
 * 从一组 Topic 消息行里收集所有仍被引用的附件 ID。
 *
 * 说明：
 * - 返回值已去重；
 * - 主要用于备份和删除话题后的附件清理判断。
 */
export function collectAttachmentIdsFromTopicRows(rows: TopicMessagesRow[]): string[] {
  const ids: string[] = [];
  for (const row of rows) {
    const messages = Array.isArray(row?.messages) ? row.messages : [];
    for (const message of messages as unknown[]) {
      ids.push(...collectAttachmentIdsFromMessage(message));
    }
  }
  return Array.from(new Set(ids));
}

/**
 * 从 Topic 消息行里移除附件引用，但保留消息正文。
 *
 * 说明：
 * - 常用于 lite 备份，避免把附件 ID 带入无附件归档；
 * - 这里只清空 `attachments` 字段，不改其它消息内容。
 */
export function stripAttachmentRefsFromTopicRows(rows: TopicMessagesRow[]): TopicMessagesRow[] {
  return rows.map((row) => {
    const messages = Array.isArray(row?.messages) ? row.messages : [];
    return {
      ...row,
      messages: messages.map((message): Message => {
        if (!Array.isArray(message.attachments)) return message;
        return {
          ...message,
          attachments: [],
        };
      }),
    } satisfies TopicMessagesRow;
  });
}

/**
 * 从绘画工作台 localStorage 字符串里收集全部附件 ID。
 *
 * 说明：
 * - 输入是原始 JSON 字符串而不是对象，便于直接处理 localStorage 快照；
 * - 解析失败时回退为空数组，不中断调用方流程。
 */
export function collectAttachmentIdsFromPaintingsStorage(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const ids: string[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      ids.push(...collectAttachmentIdsFromImageRefs((item as Record<string, unknown>).inputImages));
      ids.push(...collectAttachmentIdsFromImageRefs((item as Record<string, unknown>).outputImages));
    }
    return Array.from(new Set(ids));
  } catch {
    return [];
  }
}

/**
 * 从绘画工作台 localStorage 字符串里移除所有图片引用。
 *
 * 说明：
 * - 只有确实发生变化时才返回新的 JSON 字符串；
 * - 若输入非法或无需修改，则原样返回。
 */
export function stripAttachmentRefsFromPaintingsStorage(raw: string | null): string | null {
  if (!raw) return raw;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return raw;
    let changed = false;
    const sanitized = parsed.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const record = item as Record<string, unknown>;
      const next = { ...record };
      if (Array.isArray(record.inputImages) && record.inputImages.length > 0) {
        next.inputImages = [];
        changed = true;
      }
      if (Array.isArray(record.outputImages) && record.outputImages.length > 0) {
        next.outputImages = [];
        changed = true;
      }
      return next;
    });
    return changed ? JSON.stringify(sanitized) : raw;
  } catch {
    return raw;
  }
}
