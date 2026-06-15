/**
 * 说明：`readable-dom` 共享 DOM 工具模块。
 *
 * 职责：
 * - 定义正文采集候选、文本块和页面文本统计类型；
 * - 统一可见性、噪声排除、开放 Shadow DOM 遍历和文本归一化；
 * - 提供列表、表格、标题等结构片段的轻量转换工具。
 *
 * 边界：
 * - 本模块只提供纯 DOM 读取工具，不决定最终采集策略；
 * - 不访问 Service Worker、browser-context runtime 或持久化状态。
 */
import type {
  BrowserContextReadableDomDegradeReason,
  BrowserContextReadableDomMode,
} from '@/types/sw-messages';
import type { BrowserContextHeading } from '@/lib/browser-context/types';

/** 页面身份基础字段。 */
export interface ReadableDomBasePayload {
  title: string;
  url: string;
  extractedAt: number;
  pageFingerprint: string;
  routeKey: string;
  stableWindowVersion: number;
}

/** 可见页面文本块。 */
export interface TextBlock {
  kind: 'heading' | 'paragraph' | 'list' | 'table' | 'code' | 'quote';
  text: string;
  level?: 1 | 2 | 3;
  language?: string;
}

/** 页面可见文本统计。 */
export interface TextStats {
  text: string;
  chars: number;
  imageCount: number;
  canvasCount: number;
}

/** 单个正文策略候选。 */
export interface ExtractionCandidate {
  mode: BrowserContextReadableDomMode;
  text: string;
  html?: string;
  articleTitle?: string;
  byline?: string;
  excerpt?: string;
  headings: BrowserContextHeading[];
  contentChars: number;
  visibleTextChars: number;
  structuredItemCount?: number;
  structuredSignal?: StructuredCandidateSignal;
  degradeReason?: BrowserContextReadableDomDegradeReason;
  score: number;
}

/** 结构页面内部候选。 */
export interface StructuredCandidate {
  text: string;
  headings: BrowserContextHeading[];
  contentChars: number;
  itemCount: number;
  score: number;
  signal?: StructuredCandidateSignal;
}

/** 结构候选的通用质量信号。 */
export interface StructuredCandidateSignal {
  /** 候选元素真实可见面积；`null` 表示当前测试宿主无法读取布局。 */
  visibleArea: number | null;
  /** 子条目中像状态流、日志、部署记录这类短机器文本的比例。 */
  statusLikeRatio: number;
  /** 子条目去重后的重复率。 */
  duplicateRatio: number;
  /** 子条目的自然语言密度，越高越像可读内容。 */
  naturalLanguageRatio: number;
  /** 该结构候选占可见页面总正文的比例。 */
  visibleTextRatio: number;
}

/** 结构提纲最多注入的标题数。 */
export const MAX_HEADINGS = 8;

/** 结构列表最多注入的条目数。 */
export const MAX_STRUCTURED_ITEMS = 80;

/** 可见页面正文最低字符门槛。 */
export const MIN_VISIBLE_PAGE_CHARS = 120;

/** 结构列表正文最低字符门槛。 */
export const MIN_STRUCTURED_PAGE_CHARS = 120;

/** 文章主体最低字符门槛。 */
export const MIN_ARTICLE_CHARS = 140;

/** 文章正文相对页面可见文本的最低比例。 */
export const ARTICLE_VISIBLE_RATIO_FLOOR = 0.18;

/** 不参与正文采集的结构标签。 */
export const HARD_EXCLUDED_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'iframe',
  'object',
  'embed',
  'nav',
  'footer',
  'aside',
  'form',
  'dialog',
  'select',
  'option',
  'button',
  'input',
  'textarea',
]);

/** 用于判断父级是否已有更具体结构块的标签集合。 */
export const STRUCTURAL_BLOCK_TAGS = new Set([
  'article',
  'main',
  'section',
  'div',
  'p',
  'blockquote',
  'pre',
  'table',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'figure',
  'figcaption',
  'details',
  'summary',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);

/** 可直接当作段落采集的文本标签。 */
export const TEXT_BLOCK_TAGS = new Set(['p', 'blockquote', 'figcaption', 'summary', 'dt', 'dd']);

const STATUS_STREAM_TOKEN_PATTERN = /\b(?:deploy|build|release|preview|prod|staging|dev|fix|feat|feature|cache|perf|api|auth|main|master|sha|commit|branch|pod|queue|latency|connected|waiting|unavailable)\b/i;
const MACHINE_TOKEN_PATTERN = /(?:[a-z]+-[a-z0-9-]{2,}|[a-f0-9]{7,}|#\d+|\d+\s*(?:ms|s|m|h|d|pods?|branches?|runs?|calls?)\b|\/[a-z0-9_-]+)/i;
const NATURAL_LANGUAGE_WORD_PATTERN = /[a-zA-Z]{3,}|[\u4e00-\u9fff]{2,}/g;

const NOISE_KEYWORDS = [
  'nav',
  'navbar',
  'navigation',
  'menu',
  'breadcrumb',
  'footer',
  'sidebar',
  'aside',
  'toolbar',
  'share',
  'social',
  'pagination',
  'cookie',
  'consent',
  'modal',
  'popup',
  'popover',
  'overlay',
  'advert',
  'ads',
  'sponsor',
  'subscribe',
  'newsletter',
  'login',
  'signin',
  'sign-in',
  'signup',
  'sign-up',
  'auth',
  'comment-form',
];

/**
 * 把文本压缩成适合 prompt 的稳定空白形态。
 *
 * @param text - 原始文本。
 * @returns 归一化后的文本。
 */
export function normalizeText(text: string): string {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 把单行文本压缩成稳定片段。
 *
 * @param text - 原始文本。
 * @returns 单行文本。
 */
export function normalizeInlineText(text: string): string {
  return normalizeText(text).replace(/\s*\n+\s*/g, ' ').trim();
}

/** 判断节点是否为 Element。 */
export function isElement(node: Node | null): node is Element {
  return Boolean(node && node.nodeType === Node.ELEMENT_NODE);
}

/** 判断节点是否为文本节点。 */
export function isTextNode(node: Node | null): node is Text {
  return Boolean(node && node.nodeType === Node.TEXT_NODE);
}

/**
 * 判断元素是否属于 Olyq 自身注入的页面 UI。
 *
 * @param element - 待判断元素。
 * @returns 属于扩展 UI 时返回 `true`。
 */
function isOlyqElement(element: Element): boolean {
  const id = element.id.toLowerCase();
  const className = typeof element.className === 'string' ? element.className.toLowerCase() : '';
  if (id.includes('olyq') || className.includes('olyq')) return true;
  if (element.hasAttribute('data-page-context-bar')) return true;
  for (const attr of Array.from(element.attributes)) {
    if (attr.name.toLowerCase().startsWith('data-olyq')) return true;
  }
  return false;
}

/**
 * 判断元素是否在视觉上隐藏。
 *
 * @param element - 待判断元素。
 * @returns 隐藏时返回 `true`。
 */
export function isHiddenElement(element: Element): boolean {
  if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') return true;
  if ((element as HTMLElement).inert) return true;
  const inlineStyle = (element.getAttribute('style') || '').toLowerCase();
  if (
    /display\s*:\s*none/.test(inlineStyle)
    || /visibility\s*:\s*hidden/.test(inlineStyle)
    || /content-visibility\s*:\s*hidden/.test(inlineStyle)
  ) {
    return true;
  }
  try {
    const style = window.getComputedStyle(element) as CSSStyleDeclaration & { contentVisibility?: string };
    if (
      style.display === 'none'
      || style.visibility === 'hidden'
      || style.contentVisibility === 'hidden'
    ) {
      return true;
    }
  } catch {
    // jsdom 或特殊宿主节点可能拿不到 computed style；此时继续基于结构采集。
  }
  return false;
}

/**
 * 读取元素真实可见面积。
 *
 * 说明：jsdom 这类无布局宿主会返回全 0；这里用 `null` 表达“未知”，避免单测环境被误判为隐藏。
 *
 * @param element - 待判断元素。
 * @returns 可见面积；无法可靠读取时返回 `null`。
 */
export function getElementVisibleArea(element: Element): number | null {
  try {
    const rect = element.getBoundingClientRect();
    const width = Math.max(0, rect.width);
    const height = Math.max(0, rect.height);
    if (width > 0 && height > 0) return width * height;
    const htmlElement = element as HTMLElement;
    if (htmlElement.offsetWidth > 0 && htmlElement.offsetHeight > 0) {
      return htmlElement.offsetWidth * htmlElement.offsetHeight;
    }
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return null;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const hasLayoutApi = window.getComputedStyle !== undefined;
      const hasRealViewport = window.innerWidth > 0 && window.innerHeight > 0;
      if (hasLayoutApi && hasRealViewport && (rect.width === 0 || rect.height === 0)) return 0;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * 判断短文本是否像状态流 / 机器日志条目。
 *
 * 说明：这里不识别具体站点，只识别短、重复、token 化的状态文本形态；论坛帖子、商品卡片和
 * 文档目录通常包含更多自然语言片段，不会被这条规则整体压低。
 *
 * @param text - 候选条目文本。
 * @returns 像机器状态条目时返回 `true`。
 */
export function isStatusStreamLikeText(text: string): boolean {
  const normalized = normalizeInlineText(text).toLowerCase();
  if (!normalized) return false;
  if (normalized.length > 96) return false;
  const hasStatusToken = STATUS_STREAM_TOKEN_PATTERN.test(normalized);
  const hasMachineToken = MACHINE_TOKEN_PATTERN.test(normalized);
  const compactTokenCount = normalized.split(/\s+/).filter((token) => /[-_/]|\d/.test(token)).length;
  return hasStatusToken && (hasMachineToken || compactTokenCount >= 2);
}

/**
 * 计算文本的自然语言密度。
 *
 * @param text - 待评估文本。
 * @returns 0 到 1 之间的近似密度。
 */
export function calculateNaturalLanguageRatio(text: string): number {
  const normalized = normalizeInlineText(text);
  if (!normalized) return 0;
  const matches = normalized.match(NATURAL_LANGUAGE_WORD_PATTERN) ?? [];
  const naturalChars = matches.join('').length;
  return Math.max(0, Math.min(1, naturalChars / normalized.length));
}

/**
 * 判断元素是否是明显的导航、弹窗、表单或装饰噪声。
 *
 * @param element - 待判断元素。
 * @returns 噪声元素返回 `true`。
 */
function isNoiseElement(element: Element): boolean {
  if (isOlyqElement(element)) return true;
  const tag = element.tagName.toLowerCase();
  if (HARD_EXCLUDED_TAGS.has(tag)) return true;
  const role = (element.getAttribute('role') || '').toLowerCase();
  if (['navigation', 'contentinfo', 'complementary', 'dialog', 'alertdialog', 'search'].includes(role)) return true;
  if (element.getAttribute('aria-modal') === 'true') return true;
  const marker = [
    element.id,
    typeof element.className === 'string' ? element.className : '',
    role,
    element.getAttribute('data-testid') || '',
    element.getAttribute('data-test') || '',
  ].join(' ').toLowerCase();
  return marker ? NOISE_KEYWORDS.some((keyword) => marker.includes(keyword)) : false;
}

/**
 * 判断元素是否可参与正文采集。
 *
 * @param element - 待判断元素。
 * @param options - 是否排除结构噪声。
 * @returns 可采集时返回 `true`。
 */
export function isCollectableElement(element: Element, options: { excludeNoise: boolean }): boolean {
  if (isHiddenElement(element)) return false;
  if (options.excludeNoise && isNoiseElement(element)) return false;
  return !HARD_EXCLUDED_TAGS.has(element.tagName.toLowerCase());
}

/**
 * 读取元素和开放 Shadow DOM 下的子节点。
 *
 * @param element - 当前元素。
 * @returns 当前元素的 DOM 子节点和开放 Shadow DOM 子节点。
 */
export function getComposedChildNodes(element: Element): Node[] {
  const children = Array.from(element.childNodes);
  const shadowRoot = element.shadowRoot;
  return shadowRoot ? [...children, ...Array.from(shadowRoot.childNodes)] : children;
}

/**
 * 收集可见文本、图片和 canvas 计数，用作质量判定基准。
 *
 * @param root - 起始节点。
 * @param options - 是否排除结构噪声。
 * @returns 文本统计。
 */
export function collectVisibleTextStats(root: Node | null, options: { excludeNoise: boolean }): TextStats {
  const chunks: string[] = [];
  let imageCount = 0;
  let canvasCount = 0;
  /**
   * 按 composed tree 递归读取可见文本。
   *
   * @param node - 当前节点。
   */
  function walkNode(node: Node): void {
    if (isTextNode(node)) {
      const text = normalizeInlineText(node.textContent || '');
      if (text) chunks.push(text);
      return;
    }
    if (!isElement(node) || isHiddenElement(node)) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'img' || tag === 'picture') imageCount += 1;
    if (tag === 'canvas') canvasCount += 1;
    if (!isCollectableElement(node, options)) return;
    for (const child of getComposedChildNodes(node)) walkNode(child);
  }
  if (root) walkNode(root);
  const text = normalizeText(chunks.join('\n'));
  return { text, chars: text.length, imageCount, canvasCount };
}

/**
 * 从正文根节点提取最多前 8 条 h1-h3 结构标题。
 *
 * @param root - 结构提取起点。
 * @returns 轻量标题列表。
 */
export function extractDocumentHeadings(root: ParentNode | null): BrowserContextHeading[] {
  if (!root) return [];
  const seen = new Set<string>();
  const headings: BrowserContextHeading[] = [];
  for (const node of Array.from(root.querySelectorAll('h1, h2, h3'))) {
    if (isElement(node) && !isCollectableElement(node, { excludeNoise: true })) continue;
    const tagName = node.tagName.toLowerCase();
    const raw = normalizeInlineText(node.textContent || '');
    if (!raw) continue;
    const text = raw.length > 160 ? `${raw.slice(0, 157).trim()}...` : raw;
    const key = `${tagName}:${text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    headings.push({ level: tagName === 'h1' ? 1 : tagName === 'h2' ? 2 : 3, text });
    if (headings.length >= MAX_HEADINGS) break;
  }
  return headings;
}

/**
 * 从文本块中提炼结构标题。
 *
 * @param blocks - 已采集的文本块。
 * @returns 轻量标题列表。
 */
export function extractHeadingsFromBlocks(blocks: TextBlock[]): BrowserContextHeading[] {
  const headings: BrowserContextHeading[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    if (block.kind !== 'heading' || !block.level) continue;
    const text = normalizeInlineText(block.text);
    const key = `${block.level}:${text.toLowerCase()}`;
    if (!text || seen.has(key)) continue;
    seen.add(key);
    headings.push({ level: block.level, text });
    if (headings.length >= MAX_HEADINGS) break;
  }
  return headings;
}

/**
 * 判断某个元素是否包含更具体的结构块。
 *
 * @param element - 待判断元素。
 * @returns 包含结构块时返回 `true`。
 */
export function hasStructuralElementChild(element: Element): boolean {
  return Array.from(element.children).some((child) => STRUCTURAL_BLOCK_TAGS.has(child.tagName.toLowerCase()));
}

/**
 * 把表格转换成轻量 Markdown。
 *
 * @param table - 表格元素。
 * @returns 表格文本；无有效单元格时返回空字符串。
 */
export function tableToMarkdown(table: Element): string {
  const rows = Array.from(table.querySelectorAll('tr'))
    .map((row) => Array.from(row.querySelectorAll('th, td')).map((cell) => normalizeInlineText(cell.textContent || '')).filter(Boolean))
    .filter((cells) => cells.length > 0)
    .slice(0, 40);
  if (rows.length < 1) return '';
  const width = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => Array.from({ length: width }, (_, index) => row[index] || ''));
  const separator = Array.from({ length: width }, () => '---');
  return [normalizedRows[0], separator, ...normalizedRows.slice(1)]
    .map((row) => `| ${row.map((cell) => cell.replace(/\|/g, '\\|')).join(' | ')} |`)
    .join('\n');
}

/**
 * 提取一个元素中的可见纯文本。
 *
 * @param element - 待提取元素。
 * @returns 元素可见文本。
 */
export function extractElementText(element: Element): string {
  return collectVisibleTextStats(element, { excludeNoise: true }).text;
}

/**
 * 从列表元素生成 Markdown 列表文本。
 *
 * @param list - `ul` 或 `ol` 元素。
 * @returns 列表文本和有效条目数。
 */
export function listToMarkdown(list: Element): { text: string; itemCount: number } {
  const ordered = list.tagName.toLowerCase() === 'ol';
  const items = Array.from(list.children)
    .filter((child) => child.tagName.toLowerCase() === 'li')
    .map((item) => normalizeInlineText(extractElementText(item)))
    .filter((text) => text.length >= 3)
    .slice(0, MAX_STRUCTURED_ITEMS);
  return {
    text: items.map((item, index) => `${ordered ? `${index + 1}.` : '-'} ${item}`).join('\n'),
    itemCount: items.length,
  };
}

/**
 * 从代码块元素中提取语言提示。
 *
 * @param pre - `pre` 或 `code` 元素。
 * @returns 代码语言名。
 */
export function extractCodeLanguage(pre: Element): string {
  const className = [pre.getAttribute('class') || '', pre.querySelector('code')?.getAttribute('class') || ''].join(' ');
  const match = className.match(/(?:language|lang)-([a-z0-9_-]+)/i);
  return match?.[1] || '';
}
