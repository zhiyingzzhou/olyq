/**
 * 说明：`chat-stream-v1-payload` 后台运行时模块。
 *
 * 职责：
 * - 承载 `chat-stream-v1-payload` 相关的当前文件实现与模块边界；
 * - 对外暴露 `parseChatStreamMessagesPayload` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import {
  parseChatStreamFileDataUrl,
  parseChatStreamImageUrl,
  type ChatStreamWireAttachment,
  type ChatStreamWireFileAttachment,
  type ChatStreamWireImageAttachment,
  type ChatStreamWireMessage,
} from '@/lib/chat-stream-protocol';
import { isOutboundModelImageMime, normalizeImageMimeType } from '@/lib/chat/outbound-image-formats';
import { I18nError } from '@/lib/i18n/error';
import { isPlainRecord } from '@/lib/utils/type-guards';

const VALID_CHAT_MESSAGE_ROLES = new Set(['user', 'assistant', 'system'] as const);

/**
 * 内部函数：`createInvalidMessagesError`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function createInvalidMessagesError(detail?: string) {
  return detail
    ? new I18nError('errors.chatStreamMessagesInvalidWithDetail', { detail })
    : new I18nError('errors.chatStreamMessagesInvalid');
}

/**
 * 内部函数：`parseImageAttachment`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function parseImageAttachment(raw: Record<string, unknown>, path: string): ChatStreamWireImageAttachment {
  if ('dataUrl' in raw) {
    throw createInvalidMessagesError(`${path} must use url instead of dataUrl`);
  }

  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (!url) {
    throw createInvalidMessagesError(`${path}.url must be a non-empty string`);
  }
  const parsedUrl = parseChatStreamImageUrl(url);
  if (!parsedUrl) {
    throw createInvalidMessagesError(`${path}.url must be a valid image data URL or http(s) URL`);
  }

  const mime = typeof raw.mime === 'string' ? normalizeImageMimeType(raw.mime) : '';
  if (mime && !isOutboundModelImageMime(mime)) {
    throw createInvalidMessagesError(`${path}.mime must be png, jpeg, or webp after outbound normalization`);
  }
  if (parsedUrl.kind === 'data' && mime && mime !== parsedUrl.mediaType) {
    throw createInvalidMessagesError(`${path}.mime must match dataUrl media type`);
  }

  const attachment: ChatStreamWireImageAttachment = {
    type: 'image',
    url,
  };
  if (typeof raw.name === 'string' && raw.name.trim()) attachment.name = raw.name;
  if (mime) attachment.mime = mime;
  if (typeof raw.size === 'number' && Number.isFinite(raw.size) && raw.size >= 0) attachment.size = raw.size;
  return attachment;
}

/**
 * 内部函数：`parseFileAttachment`。
 *
 * @remarks
 * 文件协议只允许本地 data URL，避免后台自行下载远端文件或跨域猜测 schema。
 */
function parseFileAttachment(raw: Record<string, unknown>, path: string): ChatStreamWireFileAttachment {
  const dataUrl = typeof raw.dataUrl === 'string' ? raw.dataUrl.trim() : '';
  if (!dataUrl) {
    throw createInvalidMessagesError(`${path}.dataUrl must be a non-empty string`);
  }
  const parsedDataUrl = parseChatStreamFileDataUrl(dataUrl);
  if (!parsedDataUrl) {
    throw createInvalidMessagesError(`${path}.dataUrl must be a valid base64 data URL`);
  }

  const mime = typeof raw.mime === 'string' ? raw.mime.trim().toLowerCase() : '';
  if (!mime) {
    throw createInvalidMessagesError(`${path}.mime must be a non-empty string`);
  }
  if (mime !== parsedDataUrl.mediaType) {
    throw createInvalidMessagesError(`${path}.mime must match dataUrl media type`);
  }

  const attachment: ChatStreamWireFileAttachment = {
    type: 'file',
    dataUrl,
    mime,
  };
  if (typeof raw.name === 'string' && raw.name.trim()) attachment.name = raw.name;
  if (typeof raw.size === 'number' && Number.isFinite(raw.size) && raw.size >= 0) attachment.size = raw.size;
  return attachment;
}

/**
 * 内部函数：`parseAttachment`。
 *
 * @remarks
 * 统一解析单条附件，保持图片与文件协议的校验边界清晰。
 */
function parseAttachment(raw: unknown, messageIndex: number, attachmentIndex: number): ChatStreamWireAttachment {
  const path = `messages[${messageIndex}].attachments[${attachmentIndex}]`;
  if (!isPlainRecord(raw)) {
    throw createInvalidMessagesError(`${path} must be an object`);
  }

  if (raw.type === 'image') {
    return parseImageAttachment(raw, path);
  }
  if (raw.type === 'file') {
    return parseFileAttachment(raw, path);
  }
  throw createInvalidMessagesError(`${path}.type must be image or file`);
}

/**
 * 内部函数：`parseMessage`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function parseMessage(raw: unknown, index: number): ChatStreamWireMessage {
  const path = `messages[${index}]`;
  if (!isPlainRecord(raw)) {
    throw createInvalidMessagesError(`${path} must be an object`);
  }

  const rawRole = raw.role;
  if (typeof rawRole !== 'string' || !VALID_CHAT_MESSAGE_ROLES.has(rawRole as ChatStreamWireMessage['role'])) {
    throw createInvalidMessagesError(`${path}.role must be one of user, assistant, system`);
  }
  const role = rawRole as ChatStreamWireMessage['role'];

  if (typeof raw.content !== 'string') {
    throw createInvalidMessagesError(`${path}.content must be a string`);
  }

  if (typeof raw.attachments === 'undefined') {
    return { role, content: raw.content };
  }

  if (!Array.isArray(raw.attachments)) {
    throw createInvalidMessagesError(`${path}.attachments must be an array`);
  }

  const attachments = raw.attachments.map((attachment, attachmentIndex) =>
    parseAttachment(attachment, index, attachmentIndex),
  );

  return attachments.length > 0
    ? { role, content: raw.content, attachments }
    : { role, content: raw.content };
}

/** 严格解析 `chat/stream-v1` 的 messages 入参。 */
export function parseChatStreamMessagesPayload(raw: unknown): ChatStreamWireMessage[] {
  if (typeof raw === 'undefined') return [];
  if (!Array.isArray(raw)) {
    throw createInvalidMessagesError('messages must be an array');
  }
  return raw.map(parseMessage);
}
