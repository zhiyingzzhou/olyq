/**
 * 说明：页面元素引用历史详情展示模型。
 *
 * 职责：
 * - 基于结构化 `ElementActionPayload` 生成摘要优先的 UI-only 展示模型；
 * - 把一级可见摘要、二级完整内容和二级技术详情分开；
 * - 不参与持久化，不生成模型隐藏 Markdown。
 */
import type { PickedElement, PickedImage, PickedTable } from '@/types/element-picker';
import {
  buildElementContextSummary,
  buildElementContextTitle,
  formatElementContextSourceLabel,
  getElementContextKindLabel,
  type ElementContextReferenceLike,
  type ElementContextTranslate,
} from './element-context-draft';

/** 元素引用详情页中的键值元数据。 */
export type ElementContextMetadataItem = {
  /** 当前语言下的字段名。 */
  label: string;
  /** 字段值；网页原文、URL 与 selector 不做翻译。 */
  value: string;
  /** 仅当值是安全 HTTP(S) 地址时提供可点击链接。 */
  href?: string;
  /** 是否使用等宽样式展示，主要服务 selector、URL 和数值坐标。 */
  monospace?: boolean;
};

/** 元素引用详情中的图片条目。 */
type ElementContextDetailImage = {
  label: string;
  url?: string;
  alt?: string;
  name?: string;
  mime?: string;
};

/** 元素引用一级展开态的短预览。 */
export type ElementContextDetailPreview =
  | { kind: 'text' | 'code' | 'image' | 'visual'; text: string }
  | {
    kind: 'table';
    headers?: string[];
    rows?: string[][];
    fallbackText?: string;
    truncatedNotice?: string;
  };

/** 元素引用二级完整内容主体。 */
export type ElementContextDetailBody =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string; language?: string }
  | {
    kind: 'table';
    headers?: string[];
    rows?: string[][];
    fallbackText?: string;
    truncatedNotice?: string;
  }
  | {
    kind: 'image';
    description?: string;
    images: ElementContextDetailImage[];
    attachmentStatus?: string;
  }
  | {
    kind: 'visual';
    description?: string;
    metrics: ElementContextMetadataItem[];
    attachmentStatus?: string;
  };

/** 可直接供历史引用卡展开态消费的摘要优先详情模型。 */
export type ElementContextDetailModel = {
  title: string;
  summary: string;
  sourceLabel?: string;
  headerDetails: string[];
  primaryMetadata: ElementContextMetadataItem[];
  advancedMetadata: ElementContextMetadataItem[];
  preview: ElementContextDetailPreview;
  fullBody: ElementContextDetailBody;
};

/**
 * 折叠连续空白并截断成一级预览文本。
 *
 * @param value - 原始网页文本。
 * @param maxLength - 最大预览长度。
 * @returns 适合聊天历史扫读的短文本。
 */
function compactDetailText(value: unknown, maxLength: number) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

/**
 * 只为 HTTP(S) URL 生成可点击外链。
 *
 * @param raw - 原始 URL。
 * @returns 安全外链；其它协议返回空。
 */
function toSafeHttpHref(raw: unknown) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 将结构化表格转换成二级完整内容主体。
 *
 * @param table - content script 提供的表格结构。
 * @param fallbackText - 结构缺失时的原始文本。
 * @param t - 当前 UI 语言翻译函数。
 * @returns 可渲染的完整表格主体。
 */
function buildTableDetailBody(table: PickedTable | undefined, fallbackText: string, t: ElementContextTranslate): Extract<ElementContextDetailBody, { kind: 'table' }> {
  if (table?.bodyRows?.length && table.columns > 0) {
    const columns = Math.max(1, table.columns);
    const headers = table.generatedHeader
      ? Array.from({ length: columns }, (_, index) => t('elementContext.detail.generatedColumn', { index: index + 1 }))
      : Array.from({ length: columns }, (_, index) => table.headerCells?.[index] ?? '');
    const rows = table.bodyRows.map((row) => Array.from({ length: columns }, (_, index) => row[index] ?? ''));
    return {
      kind: 'table',
      headers,
      rows,
      ...(table.truncated ? { truncatedNotice: t('elementContext.detail.tableTruncated', { rows: table.rows }) } : {}),
    };
  }
  return { kind: 'table', fallbackText: table?.markdown || fallbackText || t('elementContext.detail.empty.table') };
}

/**
 * 从完整表格主体派生最多三行的一级预览。
 *
 * @param body - 完整表格主体。
 * @param t - 当前 UI 语言翻译函数。
 * @returns 可直接放在一级展开态的表格预览。
 */
function buildTablePreview(body: Extract<ElementContextDetailBody, { kind: 'table' }>, t: ElementContextTranslate): ElementContextDetailPreview {
  if (!body.headers?.length || !body.rows?.length) return body;
  const rows = body.rows.slice(0, 3);
  return {
    kind: 'table',
    headers: body.headers,
    rows,
    ...(body.rows.length > rows.length ? { truncatedNotice: t('elementContext.detail.previewMoreRows', { count: rows.length }) } : body.truncatedNotice ? { truncatedNotice: body.truncatedNotice } : {}),
  };
}

/**
 * 生成人类可读的附件状态。
 *
 * @param count - 当前引用拥有的附件数量。
 * @param t - 当前 UI 语言翻译函数。
 * @returns 有附件时返回当前语言状态，否则返回空字符串。
 */
function formatAttachmentStatus(count: number, t: ElementContextTranslate) {
  return count > 0 ? t('elementContext.detail.attachmentStatus', { count }) : '';
}

/**
 * 构建视觉区域二级技术指标。
 *
 * @param element - 视觉区域元素。
 * @param t - 当前 UI 语言翻译函数。
 * @returns rect / viewport 指标列表。
 */
function buildVisualMetrics(element: PickedElement, t: ElementContextTranslate): ElementContextMetadataItem[] {
  const rect = element.visual?.rect;
  const viewport = element.visual?.viewport;
  const items: ElementContextMetadataItem[] = [];
  if (rect) {
    items.push({
      label: t('elementContext.detail.label.visibleRect'),
      value: t('elementContext.detail.value.visibleRect', { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }),
      monospace: true,
    });
  }
  if (viewport) {
    items.push({
      label: t('elementContext.detail.label.viewport'),
      value: t('elementContext.detail.value.viewport', { width: Math.round(viewport.width), height: Math.round(viewport.height), scrollX: Math.round(viewport.scrollX), scrollY: Math.round(viewport.scrollY) }),
      monospace: true,
    });
  }
  return items;
}

/**
 * 构建视觉区域一级摘要尺寸。
 *
 * @param element - 视觉区域元素。
 * @param t - 当前 UI 语言翻译函数。
 * @returns 只包含宽高的短尺寸说明。
 */
function buildVisualRegionSize(element: PickedElement, t: ElementContextTranslate) {
  const rect = element.visual?.rect;
  return rect ? t('elementContext.detail.value.regionSize', { width: Math.round(rect.width), height: Math.round(rect.height) }) : '';
}

/**
 * 构建最多三张图片的展示条目。
 *
 * @param images - 已清理的图片元信息。
 * @param t - 当前 UI 语言翻译函数。
 * @returns 图片详情条目列表。
 */
function buildImageDetails(images: readonly PickedImage[] | undefined, t: ElementContextTranslate): ElementContextDetailImage[] {
  return (images || []).slice(0, 3).map((image, index) => ({
    label: image.alt || image.name || t('elementContext.detail.imageFallback', { index: index + 1 }),
    ...(image.url ? { url: image.url } : {}),
    ...(image.alt ? { alt: image.alt } : {}),
    ...(image.name ? { name: image.name } : {}),
    ...(image.mime ? { mime: image.mime } : {}),
  }));
}

/**
 * 将图片条目展开成二级技术详情字段。
 *
 * @param images - 图片详情条目列表。
 * @param t - 当前 UI 语言翻译函数。
 * @returns 扁平化键值字段列表。
 */
function buildImageAdvancedMetadata(images: readonly ElementContextDetailImage[], t: ElementContextTranslate): ElementContextMetadataItem[] {
  return images.flatMap((image, index) => [
    { label: t('elementContext.detail.imageFallback', { index: index + 1 }), value: image.label },
    image.name ? { label: t('elementContext.detail.label.imageName'), value: image.name } : null,
    image.alt ? { label: t('elementContext.detail.label.imageAlt'), value: image.alt } : null,
    image.mime ? { label: t('elementContext.detail.label.mime'), value: image.mime, monospace: true } : null,
    image.url ? { label: t('elementContext.detail.label.url'), value: image.url, ...(toSafeHttpHref(image.url) ? { href: toSafeHttpHref(image.url) } : {}), monospace: true } : null,
  ].filter((item): item is ElementContextMetadataItem => Boolean(item)));
}

/**
 * 为历史引用卡展开态生成摘要优先的结构化详情模型。
 *
 * @param reference - 元素上下文结构。
 * @param t - 当前 UI 语言翻译函数。
 * @returns 不含 Markdown 的 UI-only 详情模型。
 */
export function buildElementContextDetailModel(reference: ElementContextReferenceLike, t: ElementContextTranslate): ElementContextDetailModel {
  const element = reference.element;
  const title = buildElementContextTitle(reference, t);
  const summary = buildElementContextSummary(reference, t);
  const sourceLabel = formatElementContextSourceLabel(reference.source);
  const headerDetails: string[] = [];
  const primaryMetadata: ElementContextMetadataItem[] = [
    { label: t('elementContext.detail.label.type'), value: getElementContextKindLabel(element, t) },
    { label: t('elementContext.detail.label.tag'), value: String(element.tagName || 'element').toLowerCase(), monospace: true },
  ];
  const advancedMetadata: ElementContextMetadataItem[] = [];
  /** 追加一级指标并同步放入卡片头部短信息。 */
  const addPrimaryMetric = (item: ElementContextMetadataItem) => {
    primaryMetadata.push(item);
    headerDetails.push(item.value);
  };

  if (sourceLabel) primaryMetadata.push({ label: t('elementContext.detail.label.source'), value: sourceLabel });
  if (reference.source?.url) advancedMetadata.push({ label: t('elementContext.detail.label.url'), value: reference.source.url, ...(toSafeHttpHref(reference.source.url) ? { href: toSafeHttpHref(reference.source.url) } : {}), monospace: true });
  if (element.selector) advancedMetadata.push({ label: t('elementContext.detail.label.selector'), value: element.selector, monospace: true });

  let fullBody: ElementContextDetailBody;
  let preview: ElementContextDetailPreview;
  if (element.kind === 'table') {
    addPrimaryMetric({ label: t('elementContext.detail.label.size'), value: t('elementContext.detail.value.tableSize', { rows: element.table?.rows ?? 0, columns: element.table?.columns ?? 0 }) });
    fullBody = buildTableDetailBody(element.table, element.text || '', t);
    preview = buildTablePreview(fullBody, t);
  } else if (element.kind === 'code') {
    const lineCount = element.lineCount ?? Math.max(1, String(element.text || '').split(/\r?\n/).filter((line) => line.trim()).length);
    addPrimaryMetric({ label: t('elementContext.detail.label.lines'), value: t('elementContext.detail.value.lines', { lines: lineCount }) });
    if (element.codeLanguage) primaryMetadata.push({ label: t('elementContext.detail.label.language'), value: element.codeLanguage, monospace: true });
    fullBody = { kind: 'code', text: element.text || t('elementContext.detail.empty.code'), ...(element.codeLanguage ? { language: element.codeLanguage } : {}) };
    preview = { kind: 'code', text: compactDetailText(fullBody.text, 180) };
  } else if (element.kind === 'image') {
    const images = buildImageDetails(element.images, t);
    const attachmentStatus = formatAttachmentStatus(reference.attachmentIds?.length ?? 0, t);
    addPrimaryMetric({ label: t('elementContext.detail.label.images'), value: t('elementContext.detail.value.images', { count: Math.max(1, images.length, reference.attachmentIds?.length ?? 0) }) });
    advancedMetadata.push(...buildImageAdvancedMetadata(images, t));
    fullBody = { kind: 'image', ...(element.text ? { description: element.text } : {}), images, ...(attachmentStatus ? { attachmentStatus } : {}) };
    preview = { kind: 'image', text: compactDetailText(attachmentStatus || element.text || t('elementContext.detail.empty.image'), 160) };
  } else if (element.kind === 'visual') {
    const attachmentStatus = formatAttachmentStatus(reference.attachmentIds?.length ?? 0, t);
    const regionSize = buildVisualRegionSize(element, t);
    if (regionSize) addPrimaryMetric({ label: t('elementContext.detail.label.size'), value: regionSize });
    advancedMetadata.push(...buildVisualMetrics(element, t));
    fullBody = { kind: 'visual', ...(element.text ? { description: element.text } : {}), metrics: buildVisualMetrics(element, t), ...(attachmentStatus ? { attachmentStatus } : {}) };
    preview = { kind: 'visual', text: compactDetailText(attachmentStatus || element.text || regionSize || t('elementContext.detail.empty.visual'), 160) };
  } else {
    const chars = element.charCount ?? String(element.text || '').replace(/\s+/g, '').length;
    addPrimaryMetric({ label: t('elementContext.detail.label.size'), value: t('elementContext.detail.value.chars', { count: chars }) });
    fullBody = { kind: 'text', text: element.text || t('elementContext.detail.empty.text') };
    preview = { kind: 'text', text: compactDetailText(fullBody.text, 180) };
  }
  if (sourceLabel) headerDetails.push(sourceLabel);

  return { title, summary, ...(sourceLabel ? { sourceLabel } : {}), headerDetails, primaryMetadata, advancedMetadata, preview, fullBody };
}
