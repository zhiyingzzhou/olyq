/**
 * 说明：`element-context-draft` 基础能力模块。
 *
 * 职责：
 * - 将元素选择器返回的结构化 `PickedElement` 清理成可持久化真源；
 * - 按当前 UI 语言生成引用卡标题、摘要和隐藏模型上下文 Markdown；
 * - 保持纯函数边界，不读取 DOM、不访问扩展 runtime、不写入存储。
 *
 * 边界：
 * - content script 负责 DOM 提取和页面侧临时 UI；
 * - sidepanel 负责附件落库，并在入库前丢弃 data URL 等大字段；
 * - ChatInput / MessageBubble / 发送链路只通过这里把结构化真源渲染成当前语言文案。
 */
import type {
  ElementActionPayload,
  PickedElement,
  PickedElementViewport,
  PickedElementViewportRect,
  PickedImage,
  PickedTable,
} from '@/types/element-picker';
import { isPlainRecord } from '@/lib/utils/type-guards';

/** 元素引用文案生成所需的最小翻译函数契约。 */
export type ElementContextTranslate = (key: string, params?: Record<string, unknown>) => string;

/** 可按当前语言直接展示或发送给模型的元素引用视图模型。 */
export type ElementContextRenderedContent = {
  /** 引用卡标题。 */
  title: string;
  /** 引用卡摘要。 */
  summary: string;
  /** 来源页面短标签。 */
  sourceLabel?: string;
  /** 作为隐藏模型上下文发送的 Markdown 内容。 */
  markdown: string;
};

/** 元素引用渲染输入；消息引用和输入区草稿都满足这份结构。 */
export type ElementContextReferenceLike = ElementActionPayload & {
  /** 该元素引用拥有的附件 ID，用于生成“已作为附件加入”这类当前语言提示。 */
  attachmentIds?: readonly string[];
};

/**
 * 为 Markdown 代码围栏选择不会与内容冲突的 fence。
 *
 * @param text - 待包裹正文。
 * @returns 可直接拼接的 fence 文本。
 */
function pickFence(text: string) {
  return String(text || '').includes('```') ? '````' : '```';
}

/**
 * 规整单行展示文本。
 *
 * @param value - 原始文本。
 * @param maxLength - 最大展示长度。
 * @returns 去掉多余空白并按长度截断后的文本。
 */
function compactText(value: unknown, maxLength: number) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

/** 读取有限数字，避免把脏持久化值写回当前 schema。 */
function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** 读取非负有限数字。 */
function nonNegativeNumber(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number === undefined ? undefined : Math.max(0, number);
}

/** 判断元素 kind 是否属于当前 schema。 */
function isPickedElementKind(value: unknown): value is PickedElement['kind'] {
  return value === 'text' || value === 'code' || value === 'image' || value === 'table' || value === 'visual';
}

/**
 * 从来源信息中生成短标签。
 *
 * @param source - 来源页面信息。
 * @returns 优先标题，其次 hostname，均不可用时返回空字符串。
 */
export function formatElementContextSourceLabel(source: ElementActionPayload['source']) {
  const title = compactText(source?.title, 80);
  if (title) return title;
  const url = String(source?.url || '').trim();
  if (!url) return '';
  try {
    return new URL(url).hostname || url;
  } catch {
    return compactText(url, 80);
  }
}

/** 清理来源信息，只保留可序列化的 title / url。 */
function sanitizeElementSource(raw: unknown): ElementActionPayload['source'] | undefined {
  if (!isPlainRecord(raw)) return undefined;
  const url = typeof raw.url === 'string' && raw.url.trim() ? raw.url.trim() : undefined;
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : undefined;
  return url || title ? { ...(url ? { url } : {}), ...(title ? { title } : {}) } : undefined;
}

/** 清理图片元信息，明确丢弃 data URL，避免把大字段持久化进消息库。 */
function sanitizePickedImages(raw: unknown): PickedImage[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const images = raw
    .map((item): PickedImage | null => {
      if (!isPlainRecord(item)) return null;
      const url = typeof item.url === 'string' && item.url.trim() ? item.url.trim() : undefined;
      const alt = typeof item.alt === 'string' && item.alt.trim() ? item.alt.trim() : undefined;
      const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : undefined;
      const mime = typeof item.mime === 'string' && item.mime.trim() ? item.mime.trim() : undefined;
      return url || alt || name || mime ? { ...(url ? { url } : {}), ...(alt ? { alt } : {}), ...(name ? { name } : {}), ...(mime ? { mime } : {}) } : null;
    })
    .filter((item): item is PickedImage => Boolean(item))
    .slice(0, 3);
  return images.length > 0 ? images : undefined;
}

/** 清理表格二维数组，单元格文本来自网页原文，不做翻译。 */
function sanitizeTableRows(raw: unknown): string[][] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const rows = raw
    .map((row) => (
      Array.isArray(row)
        ? row.map((cell) => String(cell ?? '').replace(/\s+/g, ' ').trim())
        : []
    ))
    .filter((row) => row.length > 0);
  return rows.length > 0 ? rows : undefined;
}

/** 清理表格结构，保留能让展示层按当前语言重新生成扩展文案的字段。 */
function sanitizePickedTable(raw: unknown): PickedTable | undefined {
  if (!isPlainRecord(raw)) return undefined;
  const rows = nonNegativeNumber(raw.rows) ?? 0;
  const columns = nonNegativeNumber(raw.columns) ?? 0;
  const markdown = typeof raw.markdown === 'string' ? raw.markdown.trim() : '';
  const headerCells = Array.isArray(raw.headerCells)
    ? raw.headerCells.map((cell) => String(cell ?? '').replace(/\s+/g, ' ').trim())
    : undefined;
  const bodyRows = sanitizeTableRows(raw.bodyRows);
  const generatedHeader = raw.generatedHeader === true;
  const truncated = raw.truncated === true;

  return {
    markdown,
    ...(headerCells && headerCells.length > 0 ? { headerCells } : {}),
    ...(bodyRows ? { bodyRows } : {}),
    ...(generatedHeader ? { generatedHeader } : {}),
    ...(truncated ? { truncated } : {}),
    rows,
    columns,
  };
}

/** 清理视觉区域矩形。 */
function sanitizeViewportRect(raw: unknown): PickedElementViewportRect | undefined {
  if (!isPlainRecord(raw)) return undefined;
  const x = finiteNumber(raw.x);
  const y = finiteNumber(raw.y);
  const width = finiteNumber(raw.width);
  const height = finiteNumber(raw.height);
  if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined;
  return { x, y, width, height };
}

/** 清理视口元信息。 */
function sanitizeViewport(raw: unknown): PickedElementViewport | undefined {
  if (!isPlainRecord(raw)) return undefined;
  const width = finiteNumber(raw.width);
  const height = finiteNumber(raw.height);
  const scrollX = finiteNumber(raw.scrollX);
  const scrollY = finiteNumber(raw.scrollY);
  const devicePixelRatio = finiteNumber(raw.devicePixelRatio);
  if (width === undefined || height === undefined || scrollX === undefined || scrollY === undefined || devicePixelRatio === undefined) return undefined;
  return { width, height, scrollX, scrollY, devicePixelRatio };
}

/** 清理视觉区域结构，并明确丢弃 screenshot data URL。 */
function sanitizePickedVisual(raw: unknown): PickedElement['visual'] | undefined {
  if (!isPlainRecord(raw)) return undefined;
  const rect = sanitizeViewportRect(raw.rect);
  const viewport = sanitizeViewport(raw.viewport);
  if (!rect || !viewport) return undefined;
  return { rect, viewport };
}

/**
 * 将来自跨运行时消息或持久化层的元素引用清理成当前结构化 schema。
 *
 * @param raw - 原始元素上下文 payload。
 * @returns 当前 schema 下的 payload；非法旧形态返回 `null`，由调用方丢弃。
 */
export function sanitizeElementActionPayload(raw: unknown): ElementActionPayload | null {
  if (!isPlainRecord(raw) || !isPlainRecord(raw.element)) return null;
  const elementRaw = raw.element;
  if (!isPickedElementKind(elementRaw.kind)) return null;

  const element: PickedElement = {
    kind: elementRaw.kind,
    tagName: typeof elementRaw.tagName === 'string' && elementRaw.tagName.trim() ? elementRaw.tagName.trim() : 'UNKNOWN',
  };
  const selector = compactText(elementRaw.selector, 240);
  if (selector) element.selector = selector;
  if (typeof elementRaw.text === 'string') element.text = elementRaw.text;
  const charCount = nonNegativeNumber(elementRaw.charCount);
  if ((element.kind === 'text' || element.kind === 'visual') && charCount !== undefined) element.charCount = charCount;
  if (element.kind === 'code') {
    const lineCount = nonNegativeNumber(elementRaw.lineCount);
    if (lineCount !== undefined) element.lineCount = lineCount;
    const codeLanguage = compactText(elementRaw.codeLanguage, 40);
    if (codeLanguage) element.codeLanguage = codeLanguage;
  }
  if (element.kind === 'image') {
    const images = sanitizePickedImages(elementRaw.images);
    if (images) element.images = images;
  }
  if (element.kind === 'table') {
    const table = sanitizePickedTable(elementRaw.table);
    if (table) element.table = table;
  }
  if (element.kind === 'visual') {
    const visual = sanitizePickedVisual(elementRaw.visual);
    if (visual) element.visual = visual;
  }

  const source = sanitizeElementSource(raw.source);
  return { element, ...(source ? { source } : {}) };
}

/**
 * 获取结构化元素的人类可读类型。
 *
 * @param element - 元素选择器提取出的结构化元素。
 * @param t - 当前 UI 语言翻译函数。
 * @returns 用于卡片和 Markdown 标题的当前语言类型名。
 */
export function getElementContextKindLabel(element: PickedElement, t: ElementContextTranslate) {
  return t(`elementContext.kind.${element.kind}`);
}

/**
 * 生成元素引用标题。
 *
 * @param reference - 元素上下文结构。
 * @param t - 当前 UI 语言翻译函数。
 * @returns 当前语言下的标题。
 */
export function buildElementContextTitle(reference: ElementContextReferenceLike, t: ElementContextTranslate) {
  const tag = String(reference.element.tagName || 'element').toLowerCase();
  return `${getElementContextKindLabel(reference.element, t)} · ${tag}`;
}

/**
 * 生成元素引用摘要。
 *
 * @param reference - 元素上下文结构。
 * @param t - 当前 UI 语言翻译函数。
 * @returns 当前语言下的摘要。
 */
export function buildElementContextSummary(reference: ElementContextReferenceLike, t: ElementContextTranslate) {
  const element = reference.element;
  const tag = String(element.tagName || 'element').toLowerCase();
  const kind = getElementContextKindLabel(element, t);
  if (element.kind === 'table') {
    return t('elementContext.summary.table', {
      kind,
      tag,
      rows: element.table?.rows ?? 0,
      columns: element.table?.columns ?? 0,
    });
  }
  if (element.kind === 'code') {
    const lineCount = element.lineCount ?? Math.max(1, String(element.text || '').split(/\r?\n/).filter((line) => line.trim()).length);
    return t('elementContext.summary.code', {
      kind,
      tag,
      languagePart: element.codeLanguage ? t('elementContext.summary.codeLanguagePart', { language: element.codeLanguage }) : '',
      lines: lineCount,
    });
  }
  if (element.kind === 'image') {
    const count = Math.max(1, element.images?.length ?? 0, reference.attachmentIds?.length ?? 0);
    return t('elementContext.summary.image', { kind, tag, count });
  }
  if (element.kind === 'visual') return t('elementContext.summary.visual', { kind, tag });
  const chars = element.charCount ?? String(element.text || '').replace(/\s+/g, '').length;
  return t('elementContext.summary.text', { kind, tag, count: chars });
}

/** 将 Markdown 表格单元格转义为安全的单元格文本。 */
function formatMarkdownCell(value: string) {
  return String(value || '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
}

/** 生成可按当前语言渲染扩展生成列名和截断提示的 Markdown 表格。 */
function buildTableMarkdown(table: PickedTable | undefined, fallbackText: string, t: ElementContextTranslate) {
  if (table?.bodyRows?.length && table.columns > 0) {
    const columns = Math.max(1, table.columns);
    const header = table.generatedHeader
      ? Array.from({ length: columns }, (_, index) => t('elementContext.markdown.generatedColumn', { index: index + 1 }))
      : Array.from({ length: columns }, (_, index) => table.headerCells?.[index] ?? '');
    const bodyRows = table.bodyRows.map((row) => Array.from({ length: columns }, (_, index) => row[index] ?? ''));
    const lines = [
      `| ${header.map(formatMarkdownCell).join(' | ')} |`,
      `| ${header.map(() => '---').join(' | ')} |`,
      ...bodyRows.map((row) => `| ${row.map(formatMarkdownCell).join(' | ')} |`),
    ];
    if (table.truncated) {
      const truncatedRow = [
        t('elementContext.markdown.tableTruncated', { rows: table.rows }),
        ...Array.from({ length: Math.max(0, columns - 1) }, () => ''),
      ];
      lines.push(`| ${truncatedRow.map(formatMarkdownCell).join(' | ')} |`);
    }
    return lines.join('\n');
  }
  return table?.markdown || fallbackText || t('elementContext.markdown.tableEmpty');
}

/**
 * 生成 Markdown 引用块正文。
 *
 * @param reference - 元素上下文结构。
 * @param t - 当前 UI 语言翻译函数。
 * @returns 可直接拼入模型上下文的 Markdown 片段。
 */
export function buildElementContextBodyMarkdown(reference: ElementContextReferenceLike, t: ElementContextTranslate) {
  const element = reference.element;
  if (element.kind === 'table') {
    return buildTableMarkdown(element.table, element.text || '', t);
  }

  const text = element.text || '';
  if (element.kind === 'code') {
    const fence = pickFence(text);
    return `${fence}${element.codeLanguage || ''}\n${text || t('elementContext.markdown.codeEmpty')}\n${fence}`;
  }

  if (element.kind === 'image') {
    const hasAttachment = (reference.attachmentIds?.length ?? 0) > 0;
    const imageLines = (element.images || [])
      .slice(0, 3)
      .map((image, index) => {
        const label = image.alt || image.name || t('elementContext.markdown.imageFallback', { index: index + 1 });
        const url = image.url || (hasAttachment ? t('elementContext.markdown.imageAttached') : '');
        return `- ${label}${url ? `: ${url}` : ''}`;
      });
    const description = text ? `\n\n${text}` : '';
    return [...imageLines, description].filter(Boolean).join('\n') || t('elementContext.markdown.imageAttachmentOnly');
  }

  if (element.kind === 'visual') {
    const rect = element.visual?.rect;
    const viewport = element.visual?.viewport;
    const metaLines = [
      rect
        ? t('elementContext.markdown.visibleRect', {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        })
        : '',
      viewport
        ? t('elementContext.markdown.viewport', {
          width: Math.round(viewport.width),
          height: Math.round(viewport.height),
          scrollX: Math.round(viewport.scrollX),
          scrollY: Math.round(viewport.scrollY),
        })
        : '',
      (reference.attachmentIds?.length ?? 0) > 0 ? t('elementContext.markdown.screenshotAttached') : '',
    ].filter(Boolean);
    const description = text ? [text, ''].join('\n') : '';
    return [description, ...metaLines].filter(Boolean).join('\n') || t('elementContext.markdown.visualAttachmentOnly');
  }

  return text || t('elementContext.markdown.textEmpty');
}

/**
 * 将结构化元素引用渲染为当前语言的完整展示模型。
 *
 * @param reference - 元素上下文结构。
 * @param t - 当前 UI 语言翻译函数。
 * @returns 引用卡和隐藏模型上下文所需的完整文案。
 */
export function buildElementContextRenderedContent(reference: ElementContextReferenceLike, t: ElementContextTranslate): ElementContextRenderedContent {
  const sourceLabel = formatElementContextSourceLabel(reference.source);
  const selector = compactText(reference.element.selector, 160);
  const title = buildElementContextTitle(reference, t);
  const summary = buildElementContextSummary(reference, t);
  const body = buildElementContextBodyMarkdown(reference, t);
  const sourceLines = [
    sourceLabel ? t('elementContext.markdown.source', { source: sourceLabel }) : '',
    reference.source?.url ? t('elementContext.markdown.url', { url: reference.source.url }) : '',
    selector ? t('elementContext.markdown.selector', { selector }) : '',
  ].filter(Boolean);

  const markdown = [
    `### ${t('elementContext.markdown.heading', { title })}`,
    summary,
    ...sourceLines,
    '',
    body,
  ].join('\n').trim();

  return {
    title,
    summary,
    ...(sourceLabel ? { sourceLabel } : {}),
    markdown,
  };
}

/**
 * 将一组元素引用合成为模型隐藏上下文。
 *
 * @param references - 当前用户消息携带的结构化元素引用。
 * @param t - 当前 UI 语言翻译函数。
 * @returns 可拼入模型 user content 的 Markdown；无引用时返回空字符串。
 */
export function buildElementReferencesModelContext(
  references: readonly ElementContextReferenceLike[] | undefined,
  t: ElementContextTranslate,
) {
  if (!Array.isArray(references) || references.length === 0) return '';
  return references
    .map((reference) => buildElementContextRenderedContent(reference, t).markdown.trim())
    .filter(Boolean)
    .join('\n\n');
}
