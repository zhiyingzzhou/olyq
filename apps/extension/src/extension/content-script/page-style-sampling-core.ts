/**
 * 说明：`page-style-sampling-core` 页面风格采样核心模块。
 *
 * 职责：
 * - 定义页面风格采样过程中共用的数据结构、阈值与基础工具；
 * - 提供 DOM/布局度量读取、元素可见性判断与样式快照缓存；
 * - 作为 buckets/signals/runtime 三层之间共享的最小稳定内核。
 *
 * 边界：
 * - 本模块不负责运行时失效缓存，不安装 observer；
 * - 本模块不直接导出 browser-context 对外接口；
 * - 这里只处理内容脚本当前页面内可同步读取的 DOM/CSS 信息。
 */
import type {
  PageStyleLayoutMetricsPayload,
  PageStyleSignalsPayload,
} from '@/types/sw-messages';
import {
  canonicalizeCssColor,
  isMeaningfulColor,
  normalizeComplexCssValue,
  normalizeCssWhitespace,
  type CssValueAnalysisCache,
} from './page-style-css';

/** 页面风格采样阈值集合。 */
export const PAGE_STYLE_LIMITS = {
  headingSamples: 8,
  sectionSamples: 8,
  cardSamples: 8,
  cardCandidates: 32,
  buttonSamples: 12,
  inputSamples: 8,
  tagSamples: 8,
  navSamples: 4,
  linkSamples: 8,
  visualSamples: 40,
  containerSamples: 12,
  paragraphSamples: 12,
  componentStyleSamples: 4,
  sectionGapSamples: 6,
  imageDensityCount: 11,
  illustrationSvgCount: 2,
  treeWalkVisits: 1_600,
} as const;

/** 装饰判断会复用的渐变函数名。 */
export const GRADIENT_FUNCTIONS = [
  'linear-gradient',
  'radial-gradient',
  'conic-gradient',
  'repeating-linear-gradient',
  'repeating-radial-gradient',
  'repeating-conic-gradient',
] as const;

/** 页面缺少显式背景色时的兜底值。 */
export const COLORLESS_TRANSPARENT_FALLBACK = 'transparent';

/** 扁平化后的矩形快照。 */
export interface RectSnapshot {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

/** 单个元素在当前分析轮次里的样式快照。 */
export interface SampledElementStyle {
  display: string;
  visibility: string;
  opacity: string;
  position: string;
  color: string;
  backgroundColor: string;
  backgroundImage: string;
  borderTopWidth: string;
  borderTopStyle: string;
  borderTopColor: string;
  borderBottomWidth: string;
  borderBottomStyle: string;
  borderBottomColor: string;
  borderRadius: string;
  boxShadow: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  marginTop: string;
  marginBottom: string;
  marginLeft: string;
  marginRight: string;
  paddingTop: string;
  paddingBottom: string;
  width: string;
  maxWidth: string;
  backdropFilter: string;
}

/** 单个元素在当前分析轮次里的结构化采样快照。 */
export interface SampledElementSnapshot {
  tagName: string;
  className: string;
  role: string;
  href: string;
  inputType: string;
  rect: RectSnapshot;
  style: SampledElementStyle;
  textContent: string;
  visible: boolean;
  hiddenByDisplay: boolean;
}

/** 单轮页面风格分析上下文。 */
export interface PageStyleAnalysisEnv {
  cssValueCache: CssValueAnalysisCache;
  elementSnapshotCache: WeakMap<Element, SampledElementSnapshot>;
}

/** TreeWalker 单轮遍历收集到的候选桶。 */
export interface PageStyleBuckets {
  headings: Element[];
  sections: Element[];
  containers: Element[];
  buttons: Element[];
  inputs: Element[];
  tags: Element[];
  navs: Element[];
  links: Element[];
  visuals: Element[];
  paragraphs: Element[];
  cardCandidates: Element[];
  sectionCount: number;
  headingCount: number;
  visualCount: number;
  svgCount: number;
  visitedCount: number;
}

/** 页面风格指纹构建时复用的结构种子。 */
export interface PageStyleFingerprintSeed {
  sectionCount: number;
  headingCount: number;
  heroTag: string;
}

/** 完成一次整页分析后缓存的核心快照。 */
export interface PageStyleAnalysisSnapshot {
  signals: PageStyleSignalsPayload;
  metricsBase: Omit<PageStyleLayoutMetricsPayload, 'scrollY' | 'extractedAt'>;
  fingerprintSeed: PageStyleFingerprintSeed;
  routeKey: string;
  viewportWidth: number;
  viewportHeight: number;
  documentHeight: number;
}

/**
 * 解析像素值。
 *
 * @param value - CSS 长度字符串。
 * @returns 归一化后的像素值；无法解析时返回 `null`。
 */
export function parsePx(value: string | null | undefined): number | null {
  const normalized = normalizeCssWhitespace(value).toLowerCase();
  if (!normalized || normalized === 'auto' || normalized === 'normal') return null;
  const matched = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!matched) return null;
  const parsed = Number(matched[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 归一化通用字符串列表并限制长度。
 *
 * @param values - 原始值列表。
 * @param maxItems - 最大保留数量。
 * @returns 去空去重后的结果。
 */
export function uniqueStrings(values: Array<string | number | null | undefined>, maxItems: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeCssWhitespace(String(value ?? ''));
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= maxItems) break;
  }
  return result;
}

/**
 * 将 DOMRect 序列化为扁平对象，避免缓存 live 对象。
 *
 * @param rect - 浏览器返回的矩形。
 * @returns 扁平矩形快照。
 */
export function toRectSnapshot(rect: DOMRect | DOMRectReadOnly): RectSnapshot {
  return {
    left: Number.isFinite(rect.left) ? Math.round(rect.left) : 0,
    right: Number.isFinite(rect.right) ? Math.round(rect.right) : 0,
    top: Number.isFinite(rect.top) ? Math.round(rect.top) : 0,
    bottom: Number.isFinite(rect.bottom) ? Math.round(rect.bottom) : 0,
    width: Number.isFinite(rect.width) ? Math.round(rect.width) : 0,
    height: Number.isFinite(rect.height) ? Math.round(rect.height) : 0,
  };
}

/**
 * 读取当前页面的 document 高度。
 *
 * @returns 归一化后的文档高度。
 */
export function getCurrentDocumentHeight(): number {
  const body = document.body;
  const docEl = document.documentElement;
  return Math.max(
    body?.scrollHeight ?? 0,
    body?.offsetHeight ?? 0,
    docEl?.scrollHeight ?? 0,
    docEl?.offsetHeight ?? 0,
    docEl?.clientHeight ?? 0,
    Math.round(window.innerHeight || 0),
  );
}

/**
 * 读取当前视口高度。
 *
 * @returns 归一化后的视口高度。
 */
export function getCurrentViewportHeight(): number {
  return Math.max(
    Math.round(window.innerHeight || 0),
    Math.round(document.documentElement?.clientHeight || 0),
  );
}

/**
 * 读取当前视口宽度。
 *
 * @returns 归一化后的视口宽度。
 */
export function getCurrentViewportWidth(): number {
  return Math.max(
    Math.round(window.innerWidth || 0),
    Math.round(document.documentElement?.clientWidth || 0),
  );
}

/**
 * 读取当前页面滚动位置。
 *
 * @returns 归一化后的 scrollY。
 */
export function getCurrentScrollY(): number {
  const body = document.body;
  const docEl = document.documentElement;
  return Math.max(
    0,
    Math.round(window.scrollY || window.pageYOffset || docEl?.scrollTop || body?.scrollTop || 0),
  );
}

/**
 * 构造当前页面路由 key。
 *
 * @returns 由 URL 与标题拼成的轻量 key。
 */
export function getCurrentRouteKey(): string {
  return `${location.href}::${document.title || ''}`;
}

/**
 * 读取页面采样根节点。
 *
 * @returns 优先 `body`，缺失时退回 `documentElement`。
 */
export function getPageSamplingRoot(): Element {
  return document.body ?? document.documentElement;
}

/**
 * 读取首个可见颜色。
 *
 * @param values - 候选颜色列表。
 * @param fallback - 兜底颜色。
 * @returns 归一化后的颜色。
 */
export function pickFirstMeaningfulColor(values: Array<string | null | undefined>, fallback = ''): string {
  for (const value of values) {
    if (isMeaningfulColor(value)) return canonicalizeCssColor(value);
  }
  return fallback;
}

/**
 * 判断当前节点是否是扩展自己注入的宿主节点。
 *
 * @param element - 目标元素。
 * @returns 是否应被整棵子树跳过。
 */
export function isExtensionInjectedRoot(element: Element): boolean {
  return element.id === '__olyq_shadow_host__' || element.tagName.toLowerCase() === 'olyq-shadow-host';
}

/**
 * 读取单个元素在当前分析轮次里的样式快照。
 *
 * @param element - 目标元素。
 * @param env - 单轮分析上下文。
 * @returns 结构化采样快照。
 */
export function getSampledElementSnapshot(element: Element, env: PageStyleAnalysisEnv): SampledElementSnapshot {
  const cached = env.elementSnapshotCache.get(element);
  if (cached) return cached;

  const computed = window.getComputedStyle(element);
  const display = normalizeCssWhitespace(computed.getPropertyValue('display'));
  const visibility = normalizeCssWhitespace(computed.getPropertyValue('visibility'));
  const opacity = normalizeCssWhitespace(computed.getPropertyValue('opacity'));
  const hiddenByDisplay = display === 'none';

  let rect: RectSnapshot = {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: 0,
    height: 0,
  };
  if (!hiddenByDisplay) {
    rect = toRectSnapshot(element.getBoundingClientRect());
  }

  const textContent = normalizeCssWhitespace(element.textContent || '');
  const tagName = element.tagName.toLowerCase();
  const hasRenderableTag = ['img', 'svg', 'canvas', 'picture', 'input', 'textarea', 'button', 'select'].includes(tagName);
  const visible = !hiddenByDisplay
    && visibility !== 'hidden'
    && opacity !== '0'
    && (
      rect.width > 1
      || rect.height > 1
      || element === document.body
      || element === document.documentElement
      || Boolean(textContent)
      || hasRenderableTag
    );

  const snapshot: SampledElementSnapshot = {
    tagName,
    className: typeof (element as HTMLElement).className === 'string' ? normalizeCssWhitespace((element as HTMLElement).className) : '',
    role: normalizeCssWhitespace(element.getAttribute('role') || ''),
    href: normalizeCssWhitespace(element.getAttribute('href') || ''),
    inputType: tagName === 'input' ? normalizeCssWhitespace((element as HTMLInputElement).type || '') : '',
    rect,
    style: {
      display,
      visibility,
      opacity,
      position: normalizeCssWhitespace(computed.getPropertyValue('position')),
      color: canonicalizeCssColor(computed.getPropertyValue('color')),
      backgroundColor: canonicalizeCssColor(computed.getPropertyValue('background-color')),
      backgroundImage: normalizeComplexCssValue(computed.getPropertyValue('background-image'), env.cssValueCache),
      borderTopWidth: normalizeCssWhitespace(computed.getPropertyValue('border-top-width')),
      borderTopStyle: normalizeCssWhitespace(computed.getPropertyValue('border-top-style')),
      borderTopColor: canonicalizeCssColor(computed.getPropertyValue('border-top-color')),
      borderBottomWidth: normalizeCssWhitespace(computed.getPropertyValue('border-bottom-width')),
      borderBottomStyle: normalizeCssWhitespace(computed.getPropertyValue('border-bottom-style')),
      borderBottomColor: canonicalizeCssColor(computed.getPropertyValue('border-bottom-color')),
      borderRadius: normalizeCssWhitespace(computed.getPropertyValue('border-radius')),
      boxShadow: normalizeComplexCssValue(computed.getPropertyValue('box-shadow'), env.cssValueCache),
      fontFamily: normalizeCssWhitespace(computed.getPropertyValue('font-family')),
      fontSize: normalizeCssWhitespace(computed.getPropertyValue('font-size')),
      fontWeight: normalizeCssWhitespace(computed.getPropertyValue('font-weight')),
      lineHeight: normalizeCssWhitespace(computed.getPropertyValue('line-height')),
      marginTop: normalizeCssWhitespace(computed.getPropertyValue('margin-top')),
      marginBottom: normalizeCssWhitespace(computed.getPropertyValue('margin-bottom')),
      marginLeft: normalizeCssWhitespace(computed.getPropertyValue('margin-left')),
      marginRight: normalizeCssWhitespace(computed.getPropertyValue('margin-right')),
      paddingTop: normalizeCssWhitespace(computed.getPropertyValue('padding-top')),
      paddingBottom: normalizeCssWhitespace(computed.getPropertyValue('padding-bottom')),
      width: normalizeCssWhitespace(computed.getPropertyValue('width')),
      maxWidth: normalizeCssWhitespace(computed.getPropertyValue('max-width')),
      backdropFilter: normalizeComplexCssValue(
        computed.getPropertyValue('backdrop-filter') || computed.getPropertyValue('-webkit-backdrop-filter'),
        env.cssValueCache,
      ),
    },
    textContent,
    visible,
    hiddenByDisplay,
  };
  env.elementSnapshotCache.set(element, snapshot);
  return snapshot;
}

/**
 * 判断元素在当前轮次里是否可见。
 *
 * @param element - 目标元素。
 * @param env - 单轮分析上下文。
 * @returns 是否可参与采样。
 */
export function isProbablyVisible(element: Element | null | undefined, env: PageStyleAnalysisEnv): element is Element {
  if (!element) return false;
  return getSampledElementSnapshot(element, env).visible;
}

/**
 * 在元素桶里追加一个元素，并保持唯一性和上限。
 *
 * @param bucket - 目标数组。
 * @param element - 候选元素。
 * @param limit - 最大数量。
 */
export function pushSample(bucket: Element[], element: Element, limit: number): void {
  if (bucket.length >= limit || bucket.includes(element)) return;
  bucket.push(element);
}
