/**
 * 说明：`document-builder` 基础能力模块。
 *
 * 职责：
 * - 承载 `document-builder` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ExportDocumentMessage`、`ExportDocument`、`BuildExportDocumentOptions` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import i18n from '@/i18n';
import { blobToDataUrl, getAttachmentBlob } from '@/lib/attachments';
import { getSuccessfulMessageTranslations } from '@/lib/chat/message-translations';
import { getMessageContextReferenceAttachmentIds } from '@/lib/chat/message-context-references';
import { getMessageTraceSegments } from '@/lib/chat/message-trace';
import { formatI18nText } from '@/lib/i18n/format';
import type { Message } from '@/types/chat';

type ExportToolCall = { toolCallId: string; toolName: string; status: string; argsText: string; resultText: string; errorText: string };
type ExportTraceSection = { kind: 'reasoning'; text: string } | { kind: 'tool-call'; toolCall: ExportToolCall };
type ExportImageAttachment = { id: string; name: string; mime: string; size: number; dataUrl: string | null };
type ExportFileAttachment = { id: string; name: string; mime: string; size: number; textContent: string | null };
type ExportWebSearchResult = { title: string; url: string; snippet: string };
type ExportTranslation = { language: string; content: string };

/**
 * 导出文档中的单条消息结构。
 */
export type ExportDocumentMessage = {
  /**
   * 消息角色。
   */
  role: Message['role'];
  /**
   * 消息创建时间戳。
   */
  createdAt: number;
  /**
   * 助手消息对应的模型标签；非助手消息为空。
   */
  modelLabel?: string;
  /**
   * 主消息内容。
   */
  content: string;
  /** assistant 内部过程 trace 区块；顺序与原消息 trace 一致。 */
  traceSections: ExportTraceSection[];
  /**
   * 图片附件列表。
   */
  imageAttachments: ExportImageAttachment[];
  /**
   * 普通文件附件列表。
   */
  fileAttachments: ExportFileAttachment[];
  /**
   * 联网搜索执行状态。
   */
  webSearchStatus?: Message['webSearchStatus'];
  /**
   * 联网搜索 Provider 标识。
   */
  webSearchProviderId?: string;
  /**
   * 联网搜索查询词。
   */
  webSearchQuery?: string;
  /**
   * 联网搜索错误文案。
   */
  webSearchError?: string;
  /**
   * 联网搜索结果列表。
   */
  webSearchResults: ExportWebSearchResult[];
  /**
   * 消息翻译结果列表。
   */
  translations: ExportTranslation[];
  /**
   * 消息主错误文案。
   */
  error: string;
  /**
   * 序列化后的详细错误信息。
   */
  errorDetails: string;
};

/**
 * 导出的完整话题文档结构。
 */
export type ExportDocument = {
  /**
   * 导出文档标题。
   */
  title: string;
  /**
   * 导出操作发生的时间戳。
   */
  exportedAt: number;
  /**
   * 导出的消息总数。
   */
  messageCount: number;
  /**
   * 已序列化的消息列表。
   */
  messages: ExportDocumentMessage[];
};

/**
 * 构建导出文档时的输入参数。
 */
export type BuildExportDocumentOptions = {
  /**
   * 导出标题；为空时回退到国际化默认标题。
   */
  title: string;
  /**
   * 需要导出的原始消息数组。
   */
  messages: Message[];
  /**
   * 指定导出时间；不传则使用当前时间。
   */
  exportedAt?: number;
  /**
   * 是否包含推理内容；显式传 `false` 时会清空导出中的 reasoning。
   */
  includeReasoning?: boolean;
  /**
   * 当助手消息本身没有模型标签时的兜底展示文案。
   */
  fallbackAssistantModelLabel?: string;
  /**
   * 自定义模型标签解析函数。
   */
  getModelLabel?: (message: Message) => string | undefined;
};

/**
 * 转义 HTML 特殊字符。
 *
 * @param value - 原始文本。
 * @returns 适合安全插入 HTML 的字符串。
 */
function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 将多行纯文本转成可插入 HTML 的内容。
 *
 * @param value - 原始多行文本。
 * @returns HTML 转义后并把换行替换为 `\<br\>` 的文本。
 */
function toMultilineHtml(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

/**
 * 按当前语言格式化时间戳。
 *
 * @param ts - 毫秒级时间戳。
 * @returns 适合导出文档展示的时间文本。
 */
function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(i18n.language === 'en-US' ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 将字节数格式化为可读文件大小。
 *
 * @param bytes - 原始字节数。
 * @returns 形如 `1.2 MB`、`512.0 KB` 的展示文案。
 */
function formatFileSize(bytes: number): string {
  const safeBytes = Math.max(0, Number(bytes || 0));
  if (safeBytes >= 1024 * 1024) return `${(safeBytes / (1024 * 1024)).toFixed(1)} MB`;
  if (safeBytes >= 1024) return `${(safeBytes / 1024).toFixed(1)} KB`;
  return `${safeBytes} B`;
}

/**
 * 将未知值稳定序列化为字符串。
 *
 * @param value - 任意值。
 * @returns 字符串、JSON 文本或兜底的 `String(value)`。
 */
function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * 生成消息头部展示用的角色标签。
 *
 * @param message - 已序列化的导出消息。
 * @returns 角色展示文案。
 */
function getMessageRoleLabel(message: ExportDocumentMessage): string {
  if (message.role === 'user') return i18n.t('chat.roleYou');
  if (message.role === 'system') return i18n.t('chat.system');
  return message.modelLabel || i18n.t('chat.assistant');
}

/**
 * 读取并序列化图片附件。
 *
 * @param att - 原始图片附件。
 * @returns 附件元信息和可嵌入文档的 data URL；读取失败时保留元信息并返回 `null` 数据。
 */
async function serializeImageAttachment(att: Extract<NonNullable<Message['attachments']>[number], { type: 'image' }>): Promise<ExportImageAttachment> {
  try {
    const blob = await getAttachmentBlob(att.id);
    if (!blob) return { id: att.id, name: att.name, mime: att.mime, size: att.size, dataUrl: null };
    return {
      id: att.id,
      name: att.name,
      mime: att.mime,
      size: att.size,
      dataUrl: await blobToDataUrl(blob),
    };
  } catch {
    return { id: att.id, name: att.name, mime: att.mime, size: att.size, dataUrl: null };
  }
}

/**
 * 读取并序列化普通文件附件。
 *
 * @param att - 原始文件附件。
 * @returns 附件元信息和文本内容；读取失败时 `textContent` 为 `null`。
 */
async function serializeFileAttachment(att: Extract<NonNullable<Message['attachments']>[number], { type: 'file' }>): Promise<ExportFileAttachment> {
  try {
    const blob = await getAttachmentBlob(att.id);
    if (!blob) return { id: att.id, name: att.name, mime: att.mime, size: att.size, textContent: null };
    return {
      id: att.id,
      name: att.name,
      mime: att.mime,
      size: att.size,
      textContent: await blob.text(),
    };
  } catch {
    return { id: att.id, name: att.name, mime: att.mime, size: att.size, textContent: null };
  }
}

/**
 * 将原始消息转换为导出层统一结构。
 *
 * @param message - 原始聊天消息。
 * @param options - 导出配置项。
 * @returns 已包含附件、工具调用和联网搜索信息的导出消息对象。
 */
async function serializeMessage(message: Message, options: BuildExportDocumentOptions): Promise<ExportDocumentMessage> {
  const contextOwnedAttachmentIds = getMessageContextReferenceAttachmentIds(message);
  const attachments = (Array.isArray(message.attachments) ? message.attachments : [])
    .filter((attachment) => {
      const id = typeof attachment?.id === 'string' ? attachment.id.trim() : '';
      return !id || !contextOwnedAttachmentIds.has(id);
    });
  const imageAttachments = await Promise.all(
    attachments
      .filter((att): att is Extract<NonNullable<Message['attachments']>[number], { type: 'image' }> => att.type === 'image')
      .map((att) => serializeImageAttachment(att)),
  );
  const fileAttachments = await Promise.all(
    attachments
      .filter((att): att is Extract<NonNullable<Message['attachments']>[number], { type: 'file' }> => att.type === 'file')
      .map((att) => serializeFileAttachment(att)),
  );

  const traceSections = getMessageTraceSegments(message).flatMap<ExportTraceSection>((segment) => {
    if (segment.kind === 'reasoning') {
      if (options.includeReasoning === false) return [];
      return [{ kind: 'reasoning', text: segment.text }];
    }
    return [{
      kind: 'tool-call',
      toolCall: {
        toolCallId: segment.toolCall.toolCallId,
        toolName: segment.toolCall.toolName,
        status: segment.toolCall.status,
        argsText: stringifyUnknown(segment.toolCall.args),
        resultText: stringifyUnknown(segment.toolCall.result),
        errorText: segment.toolCall.error ? formatI18nText(i18n.t.bind(i18n), segment.toolCall.error) : '',
      },
    }];
  });

  const errorDetails = message.errorDetails
    ? stringifyUnknown(message.errorDetails)
    : '';

  return {
    role: message.role,
    createdAt: message.createdAt,
    modelLabel: message.role === 'assistant'
      ? (options.getModelLabel?.(message) || String(message.modelId || options.fallbackAssistantModelLabel || '').trim() || undefined)
      : undefined,
    content: String(message.content || ''),
    traceSections,
    imageAttachments,
    fileAttachments,
    webSearchStatus: message.webSearchStatus,
    webSearchProviderId: message.webSearchProviderId,
    webSearchQuery: message.webSearchQuery,
    webSearchError: message.webSearchError ? formatI18nText(i18n.t.bind(i18n), message.webSearchError) : '',
    webSearchResults: Array.isArray(message.webSearchResults) ? message.webSearchResults : [],
    translations: getSuccessfulMessageTranslations(message.translations).map((translation) => ({
      language: translation.language,
      content: translation.content,
    })),
    error: message.error ? formatI18nText(i18n.t.bind(i18n), message.error) : '',
    errorDetails,
  };
}

/**
 * 向 Markdown 输出中追加一个四级章节标题。
 *
 * 说明：
 * - 统一管理章节标题和后续空行，避免各类导出块手写时格式不一致；
 * - 该函数只负责结构骨架，不负责具体内容渲染。
 */
function pushMarkdownSection(lines: string[], title: string) {
  lines.push(`#### ${title}`);
  lines.push('');
}

/**
 * 将单条导出消息渲染为 Markdown 片段。
 *
 * @param lines - 输出行数组，会被原地追加内容。
 * @param message - 已序列化的导出消息。
 */
function renderMarkdownMessage(lines: string[], message: ExportDocumentMessage) {
  lines.push(`### ${getMessageRoleLabel(message)} · ${formatTimestamp(message.createdAt)}`);
  lines.push('');

  if (message.content) {
    lines.push(message.content);
    lines.push('');
  }

  for (const section of message.traceSections) {
    if (section.kind === 'reasoning') {
      pushMarkdownSection(lines, i18n.t('exportTopic.reasoning'));
      lines.push('<details>');
      lines.push(`<summary>${i18n.t('exportTopic.reasoning')}</summary>`);
      lines.push('');
      lines.push(section.text);
      lines.push('');
      lines.push('</details>');
      lines.push('');
      continue;
    }

    const { toolCall } = section;
    pushMarkdownSection(lines, `${i18n.t('exportTopic.toolCalls')} · ${toolCall.toolName}`);
    lines.push(`- ${i18n.t('exportTopic.toolStatus')}: ${toolCall.status}`);
    if (toolCall.errorText) lines.push(`- ${i18n.t('exportTopic.error')}: ${toolCall.errorText}`);
    lines.push('');
    if (toolCall.argsText) {
      lines.push(`**${i18n.t('exportTopic.toolArgs')}**`);
      lines.push('');
      lines.push('```json');
      lines.push(toolCall.argsText);
      lines.push('```');
      lines.push('');
    }
    if (toolCall.resultText) {
      lines.push(`**${i18n.t('exportTopic.toolResult')}**`);
      lines.push('');
      lines.push('```json');
      lines.push(toolCall.resultText);
      lines.push('```');
      lines.push('');
    }
  }

  if (message.imageAttachments.length > 0) {
    pushMarkdownSection(lines, i18n.t('exportTopic.images'));
    for (const image of message.imageAttachments) {
      lines.push(`- ${image.name} · ${image.mime} · ${formatFileSize(image.size)}`);
      lines.push('');
      if (image.dataUrl) {
        lines.push(`![${image.name}](${image.dataUrl})`);
      } else {
        lines.push(`> ${i18n.t('exportTopic.attachmentMissing')}`);
      }
      lines.push('');
    }
  }

  if (message.fileAttachments.length > 0) {
    pushMarkdownSection(lines, i18n.t('exportTopic.files'));
    for (const file of message.fileAttachments) {
      lines.push(`- ${file.name} · ${file.mime} · ${formatFileSize(file.size)}`);
      lines.push('');
      if (file.textContent !== null) {
        lines.push('```text');
        lines.push(file.textContent);
        lines.push('```');
      } else {
        lines.push(`> ${i18n.t('exportTopic.attachmentMissing')}`);
      }
      lines.push('');
    }
  }

  if (message.webSearchStatus || message.webSearchQuery || message.webSearchError || message.webSearchResults.length > 0) {
    pushMarkdownSection(lines, i18n.t('chat.webSearch'));
    if (message.webSearchStatus) lines.push(`- ${i18n.t('exportTopic.toolStatus')}: ${message.webSearchStatus}`);
    if (message.webSearchProviderId) lines.push(`- ${i18n.t('exportTopic.webSearchProvider')}: ${message.webSearchProviderId}`);
    if (message.webSearchQuery) lines.push(`- ${i18n.t('exportTopic.webSearchQuery')}: ${message.webSearchQuery}`);
    if (message.webSearchError) lines.push(`- ${i18n.t('exportTopic.error')}: ${message.webSearchError}`);
    if (message.webSearchResults.length > 0) {
      lines.push('');
      for (const result of message.webSearchResults) {
        lines.push(`- [${result.title || result.url}](${result.url})`);
        if (result.snippet) lines.push(`  - ${result.snippet}`);
      }
    }
    lines.push('');
  }

  if (message.translations.length > 0) {
    pushMarkdownSection(lines, i18n.t('exportTopic.translations'));
    for (const translation of message.translations) {
      lines.push(`##### ${i18n.t('exportTopic.translationItem', { language: translation.language })}`);
      lines.push('');
      lines.push(translation.content);
      lines.push('');
    }
  }

  if (message.error || message.errorDetails) {
    pushMarkdownSection(lines, i18n.t('exportTopic.error'));
    if (message.error) {
      lines.push(`> ${message.error}`);
      lines.push('');
    }
    if (message.errorDetails) {
      lines.push('```json');
      lines.push(message.errorDetails);
      lines.push('```');
      lines.push('');
    }
  }

  if (
    !message.content
    && message.traceSections.length === 0
    && message.imageAttachments.length === 0
    && message.fileAttachments.length === 0
    && !message.webSearchStatus
    && !message.webSearchQuery
    && !message.webSearchError
    && message.webSearchResults.length === 0
    && message.translations.length === 0
    && !message.error
    && !message.errorDetails
  ) {
    lines.push(i18n.t('message.exportPayloadMissing'));
    lines.push('');
  }

  lines.push('---');
  lines.push('');
}

/**
 * 将单条导出消息渲染为 HTML 片段。
 *
 * @param message - 已序列化的导出消息。
 * @returns 可直接拼接进 HTML 文档主体的字符串。
 */
function renderHtmlMessage(message: ExportDocumentMessage): string {
  const sections: string[] = [];

  if (message.content) {
    sections.push(`<div class="export-body">${toMultilineHtml(message.content)}</div>`);
  }

  for (const section of message.traceSections) {
    if (section.kind === 'reasoning') {
      sections.push(`
        <section class="export-section">
          <h4>${escapeHtml(i18n.t('exportTopic.reasoning'))}</h4>
          <details open>
            <summary>${escapeHtml(i18n.t('exportTopic.reasoning'))}</summary>
            <div class="export-pre">${toMultilineHtml(section.text)}</div>
          </details>
        </section>
      `);
      continue;
    }

    const { toolCall } = section;
    sections.push(`
      <section class="export-section">
        <h4>${escapeHtml(`${i18n.t('exportTopic.toolCalls')} · ${toolCall.toolName}`)}</h4>
        <article class="export-card">
          <div class="export-meta">${escapeHtml(`${i18n.t('exportTopic.toolStatus')}: ${toolCall.status}`)}</div>
          ${toolCall.errorText ? `<div class="export-error">${escapeHtml(toolCall.errorText)}</div>` : ''}
          ${toolCall.argsText ? `<div class="export-label">${escapeHtml(i18n.t('exportTopic.toolArgs'))}</div><pre class="export-pre">${escapeHtml(toolCall.argsText)}</pre>` : ''}
          ${toolCall.resultText ? `<div class="export-label">${escapeHtml(i18n.t('exportTopic.toolResult'))}</div><pre class="export-pre">${escapeHtml(toolCall.resultText)}</pre>` : ''}
        </article>
      </section>
    `);
  }

  if (message.imageAttachments.length > 0) {
    sections.push(`
      <section class="export-section">
        <h4>${escapeHtml(i18n.t('exportTopic.images'))}</h4>
        <div class="export-grid">
          ${message.imageAttachments.map((image) => `
            <article class="export-card">
              <div class="export-meta">${escapeHtml(`${image.name} · ${image.mime} · ${formatFileSize(image.size)}`)}</div>
              ${image.dataUrl
                ? `<img src="${escapeHtml(image.dataUrl)}" alt="${escapeHtml(image.name)}" class="export-image" />`
                : `<div class="export-missing">${escapeHtml(i18n.t('exportTopic.attachmentMissing'))}</div>`}
            </article>
          `).join('')}
        </div>
      </section>
    `);
  }

  if (message.fileAttachments.length > 0) {
    sections.push(`
      <section class="export-section">
        <h4>${escapeHtml(i18n.t('exportTopic.files'))}</h4>
        ${message.fileAttachments.map((file) => `
          <article class="export-card">
            <div class="export-meta">${escapeHtml(`${file.name} · ${file.mime} · ${formatFileSize(file.size)}`)}</div>
            ${file.textContent !== null
              ? `<pre class="export-pre">${escapeHtml(file.textContent)}</pre>`
              : `<div class="export-missing">${escapeHtml(i18n.t('exportTopic.attachmentMissing'))}</div>`}
          </article>
        `).join('')}
      </section>
    `);
  }

  if (message.webSearchStatus || message.webSearchQuery || message.webSearchError || message.webSearchResults.length > 0) {
    sections.push(`
      <section class="export-section">
        <h4>${escapeHtml(i18n.t('chat.webSearch'))}</h4>
        <div class="export-meta-list">
          ${message.webSearchStatus ? `<div>${escapeHtml(`${i18n.t('exportTopic.toolStatus')}: ${message.webSearchStatus}`)}</div>` : ''}
          ${message.webSearchProviderId ? `<div>${escapeHtml(`${i18n.t('exportTopic.webSearchProvider')}: ${message.webSearchProviderId}`)}</div>` : ''}
          ${message.webSearchQuery ? `<div>${escapeHtml(`${i18n.t('exportTopic.webSearchQuery')}: ${message.webSearchQuery}`)}</div>` : ''}
          ${message.webSearchError ? `<div class="export-error">${escapeHtml(`${i18n.t('exportTopic.error')}: ${message.webSearchError}`)}</div>` : ''}
        </div>
        ${message.webSearchResults.length > 0 ? `
          <div class="export-list">
            ${message.webSearchResults.map((result) => `
              <article class="export-card">
                <a href="${escapeHtml(result.url)}" class="export-link">${escapeHtml(result.title || result.url)}</a>
                ${result.snippet ? `<div class="export-snippet">${toMultilineHtml(result.snippet)}</div>` : ''}
              </article>
            `).join('')}
          </div>
        ` : ''}
      </section>
    `);
  }

  if (message.translations.length > 0) {
    sections.push(`
      <section class="export-section">
        <h4>${escapeHtml(i18n.t('exportTopic.translations'))}</h4>
        ${message.translations.map((translation) => `
          <article class="export-card">
            <div class="export-meta">${escapeHtml(i18n.t('exportTopic.translationItem', { language: translation.language }))}</div>
            <div class="export-body">${toMultilineHtml(translation.content)}</div>
          </article>
        `).join('')}
      </section>
    `);
  }

  if (message.error || message.errorDetails) {
    sections.push(`
      <section class="export-section">
        <h4>${escapeHtml(i18n.t('exportTopic.error'))}</h4>
        ${message.error ? `<div class="export-error">${escapeHtml(message.error)}</div>` : ''}
        ${message.errorDetails ? `<pre class="export-pre">${escapeHtml(message.errorDetails)}</pre>` : ''}
      </section>
    `);
  }

  if (sections.length === 0) {
    sections.push(`<div class="export-body">${escapeHtml(i18n.t('message.exportPayloadMissing'))}</div>`);
  }

  return `
    <section class="message-block">
      <div class="message-header">
        <strong>${escapeHtml(getMessageRoleLabel(message))}</strong>
        <span>${escapeHtml(formatTimestamp(message.createdAt))}</span>
      </div>
      ${sections.join('')}
    </section>
  `;
}

/**
 * 构建导出层统一文档结构。
 *
 * @param options - 导出配置项。
 * @returns 已序列化好的导出文档对象。
 */
async function buildExportDocument(options: BuildExportDocumentOptions): Promise<ExportDocument> {
  const exportedAt = typeof options.exportedAt === 'number' ? options.exportedAt : Date.now();
  const messages = await Promise.all(options.messages.map((message) => serializeMessage(message, options)));
  return {
    title: String(options.title || i18n.t('exportTopic.fallbackTitle')),
    exportedAt,
    messageCount: messages.length,
    messages,
  };
}

/**
 * 构建 Markdown 导出内容。
 *
 * @param options - 导出配置项。
 * @returns 完整 Markdown 文本。
 */
export async function buildMarkdownExportDocument(options: BuildExportDocumentOptions): Promise<string> {
  const document = await buildExportDocument(options);
  const lines: string[] = [
    `# ${document.title}`,
    '',
    `> ${i18n.t('exportTopic.exportedAt')}: ${formatTimestamp(document.exportedAt)} · ${i18n.t('exportTopic.messageCount', { count: document.messageCount })}`,
    '',
    '---',
    '',
  ];

  for (const message of document.messages) {
    renderMarkdownMessage(lines, message);
  }

  return lines.join('\n');
}

/**
 * 构建 HTML 文档外壳。
 *
 * @param document - 已序列化的导出文档。
 * @param body - 所有消息拼接后的 HTML 主体。
 * @param options - 额外输出控制项。
 * @returns 完整 HTML 文本。
 */
function buildHtmlDocumentShell(document: ExportDocument, body: string, options?: { wordCompatible?: boolean }) {
  const title = escapeHtml(document.title);
  const meta = escapeHtml(`${i18n.t('exportTopic.exportedAt')}: ${formatTimestamp(document.exportedAt)} · ${i18n.t('exportTopic.messageCount', { count: document.messageCount })}`);
  const extraMeta = options?.wordCompatible
    ? '<meta name="ProgId" content="Word.Document"><meta name="Generator" content="Olyq">'
    : '';

  return `<!DOCTYPE html>
<html ${options?.wordCompatible ? 'xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"' : 'lang="zh-CN"'}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${extraMeta}
  <title>${title}</title>
  <style>
    body { font-family: ${options?.wordCompatible ? "'Microsoft YaHei', 'Segoe UI', sans-serif" : "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"}; max-width: 960px; margin: 0 auto; padding: 24px; background: #f7f7f9; color: #1f2937; font-size: 14px; line-height: 1.6; }
    h1 { font-size: ${options?.wordCompatible ? '24px' : '28px'}; margin-bottom: 8px; }
    .meta { color: #6b7280; font-size: 12px; margin-bottom: 20px; }
    .message-block { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 16px; margin-bottom: 16px; }
    .message-header { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; margin-bottom: 10px; font-size: 13px; color: #4b5563; }
    .export-section { margin-top: 14px; }
    .export-section h4 { margin: 0 0 8px; font-size: 13px; color: #111827; }
    .export-body { white-space: pre-wrap; word-break: break-word; }
    .export-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .export-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; background: #fafafa; margin-bottom: 10px; }
    .export-meta { font-size: 12px; color: #6b7280; margin-bottom: 8px; }
    .export-label { font-size: 12px; font-weight: 600; color: #374151; margin: 8px 0 4px; }
    .export-pre { white-space: pre-wrap; word-break: break-word; background: #111827; color: #f9fafb; padding: 10px; border-radius: 8px; font-size: 12px; overflow: auto; }
    .export-image { width: 100%; height: auto; border-radius: 10px; border: 1px solid #d1d5db; background: #fff; }
    .export-link { color: #2563eb; text-decoration: none; font-weight: 600; }
    .export-link:hover { text-decoration: underline; }
    .export-snippet { margin-top: 6px; white-space: pre-wrap; color: #374151; }
    .export-error { color: #b91c1c; white-space: pre-wrap; word-break: break-word; }
    .export-missing { color: #92400e; font-size: 12px; }
    .export-meta-list { font-size: 12px; color: #4b5563; display: grid; gap: 4px; }
    .export-list { display: grid; gap: 10px; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">${meta}</div>
  ${body}
</body>
</html>`;
}

/**
 * 构建常规 HTML 导出文档。
 *
 * @param options - 导出配置项。
 * @returns 可直接保存为 `.html` 的完整文档字符串。
 */
export async function buildHtmlExportDocument(options: BuildExportDocumentOptions): Promise<string> {
  const document = await buildExportDocument(options);
  const body = document.messages.map((message) => renderHtmlMessage(message)).join('\n');
  return buildHtmlDocumentShell(document, body);
}

/**
 * 构建兼容 Word 打开的 HTML 导出文档。
 *
 * @param options - 导出配置项。
 * @returns 带 Word 兼容元信息的 HTML 字符串。
 */
export async function buildWordExportDocument(options: BuildExportDocumentOptions): Promise<string> {
  const document = await buildExportDocument(options);
  const body = document.messages.map((message) => renderHtmlMessage(message)).join('\n');
  return buildHtmlDocumentShell(document, body, { wordCompatible: true });
}
