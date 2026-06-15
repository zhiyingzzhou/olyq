/**
 * 说明：`element-picker-extract` 内容脚本模块。
 *
 * 职责：
 * - 承载元素选择器对文本、代码、图片和表格的结构化提取；
 * - 对外暴露 `extractPickedElement` 与 `summarizePickedElement`，供页面命中与提交流程复用；
 *
 * 边界：
 * - 本文件只读取用户显式选中的 DOM 子树，不负责打开选择模式、绘制高亮或跨运行时消息发送。
 */
import { I18nError } from '@/lib/i18n/error';
import { createId } from '@/lib/utils/id';
import type { PickedElement, PickedImage, PickedTable } from '@/types/element-picker';

/** 元素选择器摘要使用的最小翻译函数契约。 */
export type ElementPickerSummaryTranslate = (key: string, params?: Record<string, unknown>) => string;

/**
 * 统计用于 UI 摘要的可见字符数量。
 *
 * @param text - 原始可见文本。
 * @returns 去掉空白后的近似字符数。
 */
function countMeaningfulChars(text: string) {
  return String(text || '').replace(/\s+/g, '').length;
}

/**
 * 将表格单元格文本规整为 Markdown 单元格。
 *
 * @param cell - 表格单元格。
 * @returns 已转义竖线并压缩空白的单元格文本。
 */
function getMarkdownCellText(cell: Element) {
  return safeTextFromElement(cell)
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

/**
 * 从 HTML 表格中提取 Markdown 表格和结构规模。
 *
 * @param table - 目标表格元素。
 * @returns 行列规模与可编辑 Markdown 表格。
 */
function extractPickedTable(table: HTMLTableElement, t: ElementPickerSummaryTranslate): PickedTable {
  const rows = Array.from(table.rows);
  const rowValues = rows.slice(0, 40).map((row) => Array.from(row.cells).map(getMarkdownCellText));
  const columns = Math.max(0, ...rowValues.map((row) => row.length));
  if (columns === 0) return { markdown: '', rows: rows.length, columns: 0 };

  const normalizedRows = rowValues.map((row) => Array.from({ length: columns }, (_, index) => row[index] || ''));
  const hasHeader = rows[0] ? Array.from(rows[0].cells).some((cell) => cell.tagName.toLowerCase() === 'th') : false;
  const header = hasHeader ? normalizedRows[0] : Array.from({ length: columns }, (_, index) => t('elementContext.markdown.generatedColumn', { index: index + 1 }));
  const bodyRows = hasHeader ? normalizedRows.slice(1) : normalizedRows;
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...bodyRows.map((row) => `| ${row.join(' | ')} |`),
  ];
  const truncated = rows.length > rowValues.length;
  if (rows.length > rowValues.length) {
    const truncatedRow = [t('elementContext.markdown.tableTruncated', { rows: rows.length }), ...Array.from({ length: Math.max(0, columns - 1) }, () => '')];
    lines.push(`| ${truncatedRow.join(' | ')} |`);
  }
  return {
    markdown: lines.join('\n'),
    headerCells: hasHeader ? normalizedRows[0] : [],
    bodyRows,
    generatedHeader: !hasHeader,
    truncated,
    rows: rows.length,
    columns,
  };
}

/**
 * 为当前元素生成轻量、同步的结构化摘要。
 *
 * @param el - 当前被选中的页面元素。
 * @returns 展示在顶部提示条中的类型、标签与内容规模。
 */
export function summarizePickedElement(el: Element, t: ElementPickerSummaryTranslate) {
  const tag = el.tagName?.toLowerCase?.() || 'element';
  if (isVisualRegionElement(el)) return t('elementPicker.summary.visual', { tag });

  if (el instanceof HTMLTableElement) {
    const table = extractPickedTable(el, t);
    return t('elementPicker.summary.table', { tag, rows: table.rows, columns: table.columns });
  }

  const codeEl = (el.matches?.('pre, code') ? el : el.querySelector?.('pre, code')) as Element | null;
  if (codeEl) {
    const text = safeTextFromElement(codeEl);
    const lines = Math.max(1, String(text || '').split(/\r?\n/).filter((line) => line.trim()).length);
    const lang = guessCodeLanguage(codeEl);
    return t('elementPicker.summary.code', {
      tag,
      languagePart: lang ? t('elementPicker.summary.languagePart', { language: lang }) : '',
      lines,
    });
  }

  const imageCount = countPickedImagesLightweight(el);
  if (imageCount > 0) return t('elementPicker.summary.image', { tag, count: imageCount });

  const chars = countMeaningfulChars(safeTextFromElement(el));
  if (el instanceof HTMLAnchorElement) return t('elementPicker.summary.link', { tag, count: chars });
  return t('elementPicker.summary.text', { tag, count: chars });
}

/**
 * 同步估算元素内可提取图片数量，避免在选中态就读取 blob/canvas 二进制。
 *
 * @param el - 当前被选中的页面元素。
 * @returns 用于提示条摘要的图片数量。
 */
function countPickedImagesLightweight(el: Element) {
  if (el instanceof HTMLImageElement || el instanceof SVGSVGElement || el instanceof HTMLCanvasElement) return 1;
  const img = el.querySelector?.('img');
  if (img) return 1;
  try {
    const he = el as HTMLElement;
    if (he && typeof window.getComputedStyle === 'function') {
      return parseFirstBgImageUrl(window.getComputedStyle(he).backgroundImage) ? 1 : 0;
    }
  } catch {
    return 0;
  }
  return 0;
}

/**
 * 判断当前元素是否应作为视觉区域处理。
 *
 * @param el - 当前选中元素。
 * @returns iframe、canvas、video 与背景图类区域无法稳定提取 DOM 内容时走截图上下文。
 */
function isVisualRegionElement(el: Element) {
  if (el instanceof HTMLIFrameElement || el instanceof HTMLCanvasElement || el instanceof HTMLVideoElement) return true;
  try {
    const he = el as HTMLElement;
    if (he && typeof window.getComputedStyle === 'function') {
      return Boolean(parseFirstBgImageUrl(window.getComputedStyle(he).backgroundImage));
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * 限制提取文本长度，避免把超长页面内容直接塞进聊天消息。
 *
 * @param text - 原始文本。
 * @param maxLen - 最大保留字符数。
 * @returns 截断后的文本。
 */
function clampText(text: string, maxLen: number) {
  const t = String(text || '');
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…(truncated)`;
}

/**
 * 从代码块类名中猜测语言标识。
 *
 * @param el - 代码元素或其容器。
 * @returns 命中的语言名；未识别时返回空字符串。
 */
function guessCodeLanguage(el: Element): string {
  const cls = (el as HTMLElement | null)?.className;
  const s = typeof cls === 'string' ? cls : '';
  const m1 = s.match(/language-([a-z0-9_+-]+)/i);
  if (m1?.[1]) return m1[1];
  const m2 = s.match(/lang(?:uage)?-([a-z0-9_+-]+)/i);
  if (m2?.[1]) return m2[1];
  return '';
}

/**
 * 以尽量安全的方式提取元素可见文本。
 *
 * @param el - 目标元素。
 * @returns 密码框会返回空字符串，其余元素依次尝试 value、innerText、ARIA、title 与 textContent。
 */
function safeTextFromElement(el: Element): string {
  if (el instanceof HTMLInputElement) {
    const type = String(el.type || '').toLowerCase();
    if (type === 'password') return '';
    return String(el.value || '').trim();
  }
  if (el instanceof HTMLTextAreaElement) return String(el.value || '').trim();
  const he = el as HTMLElement;
  if (he && typeof he.innerText === 'string') {
    const t = he.innerText.trim();
    if (t) return t;
  }
  const aria = he?.getAttribute?.('aria-label');
  if (aria && aria.trim()) return aria.trim();
  const title = he?.getAttribute?.('title');
  if (title && title.trim()) return title.trim();
  return String(el.textContent || '').trim();
}

/**
 * 将 SVG 节点序列化为 data URL。
 *
 * @param svg - 目标 SVG 元素。
 * @returns 成功时返回可直接传输的图片数据，否则返回 `null`。
 */
function trySerializeSvgToDataUrl(svg: SVGSVGElement): PickedImage | null {
  try {
    const xml = new XMLSerializer().serializeToString(svg);
    if (!xml.trim()) return null;
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    return { dataUrl, mime: 'image/svg+xml', name: `element-${createId()}.svg` };
  } catch {
    return null;
  }
}

/**
 * 从 `background-image` CSS 值中解析第一张图片 URL。
 *
 * @param bg - 计算样式中的 `background-image` 原始值。
 * @returns 第一张背景图地址，未命中时返回空字符串。
 */
function parseFirstBgImageUrl(bg: string): string {
  const s = String(bg || '').trim();
  if (!s || s === 'none') return '';
  const m = s.match(/url\((['"]?)(.*?)\1\)/i);
  return m?.[2] ? String(m[2]).trim() : '';
}

/**
 * 尝试把任意图片 URL 规范化为绝对地址。
 *
 * @param url - 原始地址，可能是相对路径、blob URL 或 data URL。
 * @returns 可直接序列化传输的绝对地址或原值。
 */
function absolutizeMaybe(url: string) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw, location.href).toString();
  } catch {
    return raw;
  }
}

/**
 * 当图片来源是 blob URL 时，读取真实二进制并转成 data URL。
 *
 * @param blobUrl - 页面内 blob URL。
 * @returns 可跨上下文传输的 data URL；失败时返回空字符串。
 */
async function maybeReadBlobUrlAsDataUrl(blobUrl: string): Promise<string> {
  const u = String(blobUrl || '').trim();
  if (!u.startsWith('blob:')) return '';
  try {
    const res = await fetch(u);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new I18nError('errors.blobReadFailed'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

/**
 * 把代码命中节点收敛到真正应提取文本的代码容器。
 *
 * @param el - 命中的代码节点或代码容器。
 * @returns 优先返回 `<pre>`，否则返回原始代码节点。
 */
function normalizeCodeContainer(el: Element): Element {
  if (el.tagName.toLowerCase() !== 'code') return el;
  return (el.closest('pre') as HTMLElement | null) || el;
}

/**
 * 从归一化后的页面元素中提取结构化内容。
 *
 * @param el - 归一化后的 DOM 元素。
 * @returns 可发送给 Service Worker 的 `PickedElement` 主体数据。
 */
export async function extractPickedElement(el: Element, t: ElementPickerSummaryTranslate): Promise<PickedElement> {
  const tagName = el.tagName || 'UNKNOWN';

  if (el instanceof HTMLIFrameElement) {
    const src = String(el.src || '').trim();
    const title = String(el.title || '').trim();
    const text = [title ? `iframe.title=${title}` : '', src ? `iframe.src=${src}` : ''].filter(Boolean).join('\n');
    const clamped = clampText(text || '(iframe)', 4000);
    return { kind: 'visual', tagName, text: clamped, charCount: countMeaningfulChars(clamped) };
  }

  if (el instanceof HTMLTableElement) {
    const table = extractPickedTable(el, t);
    const text = clampText(table.markdown || safeTextFromElement(el), 20_000);
    return {
      kind: 'table',
      tagName,
      text,
      table: { ...table, markdown: text },
    };
  }

  if (el.matches?.('pre, code') || el.querySelector?.('pre, code')) {
    const codeEl = (el.matches?.('pre, code') ? el : el.querySelector?.('pre, code')) as Element | null;
    const normalized = codeEl ? normalizeCodeContainer(codeEl) : el;
    const codeText = clampText(safeTextFromElement(normalized), 20_000);
    const lineCount = Math.max(1, codeText.split(/\r?\n/).filter((line) => line.trim()).length);
    return {
      kind: 'code',
      tagName,
      text: codeText,
      lineCount,
      codeLanguage: guessCodeLanguage(normalized),
    };
  }

  const images: PickedImage[] = [];

  if (el instanceof HTMLImageElement) {
    const src = absolutizeMaybe(el.currentSrc || el.src || '');
    const alt = String(el.alt || el.getAttribute('aria-label') || '').trim();
    if (src) {
      if (src.startsWith('blob:')) {
        const dataUrl = await maybeReadBlobUrlAsDataUrl(src);
        if (dataUrl) images.push({ dataUrl, alt, name: `element-${createId()}.png`, mime: 'image/png' });
      } else {
        images.push({ url: src, alt, name: `element-${createId()}.png` });
      }
    }

    const fig = el.closest('figure');
    const figcap = fig?.querySelector('figcaption');
    const caption = figcap ? safeTextFromElement(figcap) : '';

    return {
      kind: 'image',
      tagName,
      text: clampText(caption || alt, 4000),
      images,
    };
  }

  if (el instanceof SVGSVGElement) {
    const img = trySerializeSvgToDataUrl(el);
    if (img) images.push(img);
    const alt = String(el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
    return { kind: 'image', tagName, text: clampText(alt, 4000), images };
  }

  if (el instanceof HTMLCanvasElement || el instanceof HTMLVideoElement) {
    const alt = String(el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
    return { kind: 'visual', tagName, text: clampText(alt, 4000), charCount: countMeaningfulChars(alt) };
  }

  try {
    const he = el as HTMLElement;
    if (he && typeof window.getComputedStyle === 'function') {
      const bgUrl = parseFirstBgImageUrl(window.getComputedStyle(he).backgroundImage);
      const src = absolutizeMaybe(bgUrl);
      if (src) {
        const text = clampText(safeTextFromElement(el) || `background-image=${src}`, 4000);
        return { kind: 'visual', tagName, text, charCount: countMeaningfulChars(text) };
      }
    }
  } catch {
    // 背景图读取失败不影响文本结构提取。
  }

  if (images.length === 0 && el instanceof HTMLElement) {
    const img = el.querySelector('img');
    if (img) {
      const src = absolutizeMaybe((img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src || '');
      const alt = String((img as HTMLImageElement).alt || img.getAttribute('aria-label') || '').trim();
      if (src) images.push({ url: src, alt, name: `element-${createId()}.png` });
    }
  }

  if (images.length > 0) {
    const text = clampText(safeTextFromElement(el), 4000);
    const alt = images.find((x) => x.alt)?.alt || '';
    return { kind: 'image', tagName, text: text || alt, images };
  }

  if (el instanceof HTMLAnchorElement) {
    const href = String(el.href || '').trim();
    const t = safeTextFromElement(el);
    const merged = href ? (t ? `${t}\n${href}` : href) : t;
    const text = clampText(merged, 20_000);
    return { kind: 'text', tagName, text, charCount: countMeaningfulChars(text) };
  }

  const text = clampText(safeTextFromElement(el), 20_000);
  return {
    kind: 'text',
    tagName,
    text,
    charCount: countMeaningfulChars(text),
  };
}
