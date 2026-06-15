/**
 * 说明：`stream-chat-message-helpers` AI 能力模块。
 *
 * 职责：
 * - 承载 `stream-chat-message-helpers` 相关的当前文件实现与模块边界；
 * - 对外暴露 `buildNoOutputError`、`hasImageAttachments`、`hasFileAttachments`、`toAiSdkMessages` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { I18nError } from '@/lib/i18n/error';
import {
  parseChatStreamFileDataUrl,
  parseChatStreamImageUrl,
} from '@/lib/chat-stream-protocol';
import type { ProviderContract } from './providers/provider-contracts';
import type { ChatMessage } from './types';
import type { StreamChatUsage } from './stream-chat-types';

const OPENAI_NATIVE_FILE_MIME_TYPES = new Set(['application/pdf']);
const ANTHROPIC_NATIVE_FILE_MIME_TYPES = new Set(['application/pdf', 'text/plain']);
const BEDROCK_NATIVE_FILE_MIME_TYPES = new Set([
  'application/pdf',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/html',
  'text/plain',
  'text/markdown',
]);

/**
 * 构造“模型无输出”错误。
 *
 * @param opts - 是否请求了内联生图以及可选的诊断细节。
 * @returns 带国际化 key 的错误对象。
 */
export function buildNoOutputError(opts: { wantsInlineImage: boolean; detail?: string | null }): I18nError {
  const detail = String(opts.detail || '').trim();
  const hasDetail = Boolean(detail);

  if (opts.wantsInlineImage) {
    return hasDetail
      ? new I18nError('errors.inlineImageNoOutputWithDetail', { detail })
      : new I18nError('errors.inlineImageNoOutput');
  }

  return hasDetail
    ? new I18nError('errors.modelNoOutputWithDetail', { detail })
    : new I18nError('errors.modelNoOutput');
}

/**
 * 导出函数：`mapUsage`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function mapUsage(
  usage: { inputTokens?: number | null; outputTokens?: number | null } | null | undefined,
): StreamChatUsage | undefined {
  if (!usage) return undefined;
  return { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 };
}

/**
 * 导出函数：`isAbortError`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function isAbortError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * 导出函数：`hasImageAttachments`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function hasImageAttachments(messages: ChatMessage[]): boolean {
  return messages.some((message) => Array.isArray(message.attachments) && message.attachments.some((attachment) => attachment?.type === 'image'));
}

/**
 * 导出函数：`hasFileAttachments`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function hasFileAttachments(messages: ChatMessage[]): boolean {
  return messages.some((message) => Array.isArray(message.attachments) && message.attachments.some((attachment) => attachment?.type === 'file'));
}

/**
 * 导出函数：`supportsVisionInput`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function supportsVisionInput(messagesMeta: {
  kind: string;
  inputModalities: ReadonlyArray<string>;
  featureKeys: ReadonlySet<string>;
}): boolean {
  return (
    messagesMeta.kind === 'multimodal-chat'
    || messagesMeta.inputModalities.includes('image')
    || messagesMeta.featureKeys.has('vision-input')
  );
}

/**
 * 导出函数：`supportsFileInput`。
 *
 * @remarks
 * 文件输入必须来自显式模态或显式 feature，不能只靠 `multimodal-chat` 主类偷推断。
 */
export function supportsFileInput(messagesMeta: {
  inputModalities: ReadonlyArray<string>;
  featureKeys: ReadonlySet<string>;
}): boolean {
  return messagesMeta.inputModalities.includes('file') || messagesMeta.featureKeys.has('file-input');
}

/**
 * 导出函数：`isNativeFileTransportSupported`。
 *
 * @remarks
 * transport 白名单只决定“当前协议是否允许原生 file schema”，不代表模型本身一定能吃文件。
 */
export function isNativeFileTransportSupported(args: {
  providerId?: string;
  transportProtocol?: string;
  mime: string;
}): boolean {
  const mime = String(args.mime || '').trim().toLowerCase();
  const transportProtocol = String(args.transportProtocol || '').trim().toLowerCase();
  const providerId = String(args.providerId || '').trim().toLowerCase();

  if (!mime) return false;
  if (providerId === 'vercel-ai-gateway') return true;

  switch (transportProtocol) {
    case 'openai-chat':
    case 'openai-compatible':
    case 'openai-responses':
    case 'azure-openai':
      return OPENAI_NATIVE_FILE_MIME_TYPES.has(mime);
    case 'anthropic-messages':
      return ANTHROPIC_NATIVE_FILE_MIME_TYPES.has(mime);
    case 'gemini-generate-content':
      return true;
    case 'bedrock-converse':
      return BEDROCK_NATIVE_FILE_MIME_TYPES.has(mime);
    default:
      return false;
  }
}

/**
 * 导出函数：`getImageInputError`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function getImageInputError(args: {
  providerName: string;
  contract: ProviderContract;
  transportProtocol?: string;
}): I18nError | null {
  if (!args.transportProtocol || args.transportProtocol === 'unknown') {
    return new I18nError('errors.imageInputTransportProtocolUnknown', { providerName: args.providerName });
  }
  if (args.contract.inputPolicies.image === 'unsupported') {
    return new I18nError('errors.imageInputNotSupportedByProvider', { providerName: args.providerName });
  }
  if (args.contract.inputPolicies.image === 'unverified') {
    return new I18nError('errors.imageInputNotVerifiedByProvider', { providerName: args.providerName });
  }
  return null;
}

/**
 * 导出函数：`getFileInputError`。
 *
 * @remarks
 * 文件原生输入只在消息里确实携带 file part 时才会触发；普通文本回退不经过这里。
 */
export function getFileInputError(args: {
  providerId?: string;
  providerName: string;
  contract: ProviderContract;
  transportProtocol?: string;
  messages: ChatMessage[];
}): I18nError | null {
  if (!args.transportProtocol || args.transportProtocol === 'unknown') {
    return new I18nError('errors.fileInputTransportProtocolUnknown', { providerName: args.providerName });
  }
  if (args.contract.inputPolicies.file === 'unsupported') {
    return new I18nError('errors.fileInputNotSupportedByProvider', { providerName: args.providerName });
  }
  if (args.contract.inputPolicies.file === 'unverified') {
    return new I18nError('errors.fileInputNotVerifiedByProvider', { providerName: args.providerName });
  }

  for (const message of args.messages) {
    for (const attachment of message.attachments ?? []) {
      if (attachment.type !== 'file') continue;
      if (!isNativeFileTransportSupported({
        providerId: args.providerId,
        transportProtocol: args.transportProtocol,
        mime: attachment.mime,
      })) {
        return new I18nError('errors.fileInputNotSupportedByProvider', { providerName: args.providerName });
      }
    }
  }

  return null;
}

/**
 * 将 ChatMessage 格式转换为 AI SDK 的 CoreMessage 格式。
 * 支持文本 + 图片附件 + 文件附件。
 */
export function toAiSdkMessages(messages: ChatMessage[]) {
  return messages.map((message) => {
    if (!message.attachments?.length) {
      return { role: message.role as 'user' | 'assistant' | 'system', content: message.content };
    }

    if (message.role === 'user') {
      const parts: Array<
        | { type: 'text'; text: string }
        | { type: 'image'; image: URL | string; mediaType?: string }
        | { type: 'file'; data: string; mediaType: string; filename?: string }
      > = [];

      if (message.content.trim()) {
        parts.push({ type: 'text', text: message.content });
      }

      for (const attachment of message.attachments) {
        if (attachment.type === 'image') {
          const imageUrl = typeof attachment.url === 'string' ? attachment.url.trim() : '';
          if (!imageUrl) {
            throw new I18nError('errors.imageUrlEmpty');
          }
          const parsedImage = parseChatStreamImageUrl(imageUrl);
          if (!parsedImage) {
            throw new I18nError('errors.imageUrlUnsupportedScheme');
          }

          if (parsedImage.kind === 'data') {
            parts.push({
              type: 'image',
              image: parsedImage.base64,
              mediaType: parsedImage.mediaType,
            });
            continue;
          }

          const mediaType = typeof attachment.mime === 'string' && attachment.mime.trim().toLowerCase().startsWith('image/')
            ? attachment.mime.trim()
            : undefined;

          parts.push({
            type: 'image',
            image: parsedImage.url,
            mediaType,
          });
          continue;
        }

        const parsedFile = parseChatStreamFileDataUrl(attachment.dataUrl);
        if (!parsedFile) {
          throw new I18nError('errors.chatStreamMessagesInvalidWithDetail', {
            detail: 'file attachment dataUrl is invalid',
          });
        }
        parts.push({
          type: 'file',
          data: parsedFile.base64,
          mediaType: attachment.mime,
          ...(attachment.name ? { filename: attachment.name } : {}),
        });
      }

      return { role: 'user' as const, content: parts };
    }

    return { role: message.role as 'assistant' | 'system', content: message.content };
  });
}
