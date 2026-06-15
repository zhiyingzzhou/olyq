/**
 * 说明：`message-translations` 基础能力模块。
 *
 * 职责：
 * - 承载 `message-translations` 相关的当前文件实现与模块边界；
 * - 对外暴露 `normalizeMessageErrorDetails`、`normalizeMessageTranslations`、`normalizeMessagesFromStorage` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { isI18nText } from '@/lib/i18n/text';
import {
  isLegacyElementModelContext,
  normalizeMessageContextReferences,
} from '@/lib/chat/message-context-references';
import { isPlainRecord } from '@/lib/utils/type-guards';
import type { Message, MessageErrorDetails, MessageTranslation } from '@/types/chat';

/** 翻译状态枚举；用于运行时校验持久化数据。 */
const TRANSLATION_STATUSES: ReadonlySet<MessageTranslation['status']> = new Set(['loading', 'success', 'error']);

/** 判断运行时值是否为合法翻译状态。 */
function isTranslationStatus(value: unknown): value is MessageTranslation['status'] {
  return typeof value === 'string' && TRANSLATION_STATUSES.has(value as MessageTranslation['status']);
}

/**
 * 归一化结构化错误详情。
 *
 * 说明：
 * - 只保留字符串字段，避免把不可序列化对象重新写回消息体；
 * - 空对象会被折叠成 `undefined`。
 */
export function normalizeMessageErrorDetails(raw: unknown): MessageErrorDetails | undefined {
  if (!isPlainRecord(raw)) return undefined;

  const details: MessageErrorDetails = {};
  if (typeof raw.name === 'string' && raw.name.trim()) details.name = raw.name.trim();
  if (isI18nText(raw.messageI18n)) details.messageI18n = raw.messageI18n;
  if (typeof raw.message === 'string' && raw.message.trim()) details.message = raw.message.trim();
  if (typeof raw.stack === 'string' && raw.stack.trim()) details.stack = raw.stack.trim();
  if (typeof raw.cause === 'string' && raw.cause.trim()) details.cause = raw.cause.trim();

  return Object.keys(details).length > 0 ? details : undefined;
}

type NormalizeTranslationsOptions = {
  /** 持久化恢复时，陈旧 loading 项无法恢复，应直接丢弃。 */
  dropLoading?: boolean;
};

/**
 * 归一化翻译条目列表。
 *
 * 兼容规则：
 * - 旧结构 `{ language, content }` 自动升级成 `status: 'success'`
 * - 非法项直接丢弃
 * - `dropLoading=true` 时移除历史遗留的 loading 项
 */
export function normalizeMessageTranslations(
  raw: unknown,
  options?: NormalizeTranslationsOptions,
): { translations?: MessageTranslation[]; changed: boolean } {
  if (raw === undefined) return { translations: undefined, changed: false };
  if (!Array.isArray(raw)) return { translations: undefined, changed: true };

  const dropLoading = options?.dropLoading === true;
  let changed = false;
  const next: MessageTranslation[] = [];

  for (const item of raw) {
    if (!isPlainRecord(item)) {
      changed = true;
      continue;
    }

    const language = typeof item.language === 'string' ? item.language.trim() : '';
    if (!language) {
      changed = true;
      continue;
    }

    const content = typeof item.content === 'string' ? item.content : '';
    const status = isTranslationStatus(item.status) ? item.status : 'success';
    const error = isI18nText(item.error) ? item.error : undefined;
    const errorDetails = normalizeMessageErrorDetails(item.errorDetails);

    if (!isTranslationStatus(item.status)) changed = true;
    if (item.error !== undefined && !error) changed = true;
    if (dropLoading && status === 'loading') {
      changed = true;
      continue;
    }

    next.push({
      language,
      status,
      content,
      ...(error ? { error } : {}),
      ...(errorDetails ? { errorDetails } : {}),
    });
  }

  if (next.length !== raw.length) changed = true;
  return { translations: next.length > 0 ? next : undefined, changed };
}

/** 归一化消息级错误摘要；旧版字符串摘要不再作为当前 schema 保留。 */
function normalizeMessageI18nText(raw: unknown): { value?: Message['error']; changed: boolean } {
  if (raw === undefined) return { value: undefined, changed: false };
  if (isI18nText(raw)) return { value: raw, changed: false };
  return { value: undefined, changed: true };
}

/** 归一化 trace 内工具调用错误；旧版字符串错误会被清理，避免继续持久化提前格式化文案。 */
function normalizeMessageTrace(rawTrace: Message['trace']): { trace?: Message['trace']; changed: boolean } {
  if (!Array.isArray(rawTrace)) return { trace: rawTrace, changed: false };

  let changed = false;
  const trace = rawTrace.map((item) => {
    if (item.kind !== 'tool-call') return item;
    if (item.error === undefined || isI18nText(item.error)) return item;
    changed = true;
    const { error: _legacyError, ...rest } = item;
    return rest;
  });

  return { trace, changed };
}

/**
 * 归一化从存储中读取出的消息列表。
 *
 * 说明：
 * - 只做“恢复期需要的语义修复”，当前覆盖 translations 与页面元素引用卡；
 * - 若没有任何变动，直接复用原数组引用，避免无谓重渲染。
 */
export function normalizeMessagesFromStorage(messages: Message[]): { messages: Message[]; changed: boolean } {
  if (!Array.isArray(messages) || messages.length === 0) return { messages: Array.isArray(messages) ? messages : [], changed: false };

  let changed = false;
  const next = messages.map((message) => {
    const { translations, changed: translationsChanged } = normalizeMessageTranslations(message.translations, { dropLoading: true });
    const { references, changed: referencesChanged } = normalizeMessageContextReferences(message.contextReferences);
    const { value: error, changed: errorChanged } = normalizeMessageI18nText(message.error);
    const { value: webSearchError, changed: webSearchErrorChanged } = normalizeMessageI18nText(message.webSearchError);
    const { trace, changed: traceChanged } = normalizeMessageTrace(message.trace);
    const legacyElementModelContextChanged = isLegacyElementModelContext(message.modelContext);

    if (
      !translationsChanged
      && !referencesChanged
      && !errorChanged
      && !webSearchErrorChanged
      && !traceChanged
      && !legacyElementModelContextChanged
    ) return message;

    changed = true;
    return {
      ...message,
      ...(legacyElementModelContextChanged ? { modelContext: undefined } : {}),
      ...(traceChanged ? { trace } : {}),
      ...(error ? { error } : { error: undefined }),
      ...(webSearchError ? { webSearchError } : { webSearchError: undefined }),
      ...(translations ? { translations } : { translations: undefined }),
      ...(references?.length ? { contextReferences: references } : { contextReferences: undefined }),
    };
  });

  return changed ? { messages: next, changed } : { messages, changed };
}

/** 只提取成功的翻译结果，供搜索、导出和复制逻辑复用。 */
export function getSuccessfulMessageTranslations(translations: Message['translations']): MessageTranslation[] {
  if (!Array.isArray(translations)) return [];
  return translations.filter((translation) => translation.status === 'success');
}
