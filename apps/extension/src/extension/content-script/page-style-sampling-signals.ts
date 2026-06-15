/**
 * 说明：`page-style-sampling-signals` 页面风格信号归纳模块。
 *
 * 职责：
 * - 基于单轮 buckets 与样式快照，归纳页面级、排版级、布局级、组件级和装饰级信号；
 * - 构造稳定指纹、可复用 analysis snapshot，以及滚动/截图依赖的实时 metrics payload；
 * - 为 `page-style.ts` 运行时层提供“完整重采样”和“layout-only 刷新”两种稳定输出。
 *
 * 边界：
 * - 本模块不维护跨请求 dirty flag，也不安装 observer；
 * - 复杂值判断继续复用 `page-style-css.ts` 与 core 快照，不新增协议字段；
 * - 所有输出都严格保持现有 `PageStyleSignalsPayload` / `PageStyleLayoutMetricsPayload` 形状。
 */
import type {
  PageStyleComponentSignals,
  PageStyleDecorationSignals,
  PageStyleLayoutMetricsPayload,
  PageStyleLayoutSignals,
  PageStylePageSignals,
  PageStyleSampleSignals,
  PageStyleSignalsPayload,
  PageStyleTypographySignals,
} from '@/types/sw-messages';
import { clonePageStyleSignalsPayload } from '@/lib/browser-context/page-style-signals-payload';
import type { PageStableWindowSnapshot } from './page-stability';
import {
  cssValueHasFunction,
  hasMeaningfulComplexCssValue,
  isMeaningfulColor,
  isTranslucentMeaningfulColor,
  normalizeCssWhitespace,
} from './page-style-css';
import { collectCardSamples, collectPageBuckets } from './page-style-sampling-buckets';
import {
  COLORLESS_TRANSPARENT_FALLBACK,
  GRADIENT_FUNCTIONS,
  getCurrentDocumentHeight,
  getCurrentRouteKey,
  getCurrentScrollY,
  getCurrentViewportHeight,
  getCurrentViewportWidth,
  getPageSamplingRoot,
  getSampledElementSnapshot,
  PAGE_STYLE_LIMITS,
  parsePx,
  pickFirstMeaningfulColor,
  uniqueStrings,
  type PageStyleAnalysisEnv,
  type PageStyleAnalysisSnapshot,
  type PageStyleFingerprintSeed,
} from './page-style-sampling-core';

export { clonePageStyleSignalsPayload };

/**
 * 执行一次完整的页面风格分析，并生成可缓存的 snapshot。
 *
 * @returns 已完成的分析快照。
 */
export function buildPageStyleAnalysisSnapshot(stability?: Pick<PageStableWindowSnapshot, 'routeKey' | 'stableWindowVersion'>): PageStyleAnalysisSnapshot {
  const env: PageStyleAnalysisEnv = {
    cssValueCache: new Map(),
    elementSnapshotCache: new WeakMap(),
  };
  const buckets = collectPageBuckets(env);
  const cards = collectCardSamples(buckets.cardCandidates, env);
  const documentHeight = getCurrentDocumentHeight();
  const viewportHeight = getCurrentViewportHeight();
  const viewportWidth = getCurrentViewportWidth();
  const fingerprintSeed: PageStyleFingerprintSeed = {
    sectionCount: buckets.sectionCount,
    headingCount: buckets.headingCount,
    heroTag: buckets.sections[0]?.tagName.toLowerCase()
      || buckets.headings[0]?.closest('section, article, header, main')?.tagName.toLowerCase()
      || '',
  };
  const pageFingerprint = buildPageStyleFingerprint({
    ...fingerprintSeed,
    documentHeight,
    viewportHeight,
    viewportWidth,
  });

  const signals: PageStyleSignalsPayload = {
    title: document.title || '',
    url: location.href,
    pageFingerprint,
    routeKey: stability?.routeKey ?? getCurrentRouteKey(),
    stableWindowVersion: stability?.stableWindowVersion ?? 0,
    extractedAt: Date.now(),
    page: collectPageSignals(cards, buckets.buttons, buckets.links, buckets.containers, buckets.sections, env),
    typography: collectTypographySignals(buckets.headings, buckets.buttons, buckets.paragraphs, env),
    layout: collectLayoutSignals(
      buckets.sections,
      cards,
      buckets.headings,
      buckets.navs,
      buckets.visualCount,
      buckets.sectionCount,
      env,
    ),
    components: collectComponentSignals(cards, buckets.buttons, buckets.inputs, buckets.tags, buckets.navs, env),
    decoration: collectDecorationSignals(cards, buckets.containers, buckets.navs, buckets.visuals, buckets.svgCount, env),
    samples: collectSampleSignals(buckets.headings, buckets.sections, cards),
  };

  return {
    signals,
    metricsBase: {
      title: signals.title,
      url: signals.url,
      pageFingerprint,
      routeKey: signals.routeKey,
      stableWindowVersion: signals.stableWindowVersion,
      documentHeight,
      viewportHeight,
    },
    fingerprintSeed,
    routeKey: getCurrentRouteKey(),
    viewportWidth,
    viewportHeight,
    documentHeight,
  };
}

/**
 * 基于缓存的结构化种子，实时构造当前布局度量。
 *
 * @param analysis - 最近一次完整分析结果。
 * @returns 最新布局度量。
 */
export function buildCurrentLayoutMetricsPayload(
  analysis: PageStyleAnalysisSnapshot,
  stability?: Pick<PageStableWindowSnapshot, 'routeKey' | 'stableWindowVersion'>,
): PageStyleLayoutMetricsPayload {
  const documentHeight = getCurrentDocumentHeight();
  const viewportHeight = getCurrentViewportHeight();
  return {
    ...analysis.metricsBase,
    pageFingerprint: buildPageStyleFingerprint({
      ...analysis.fingerprintSeed,
      documentHeight,
      viewportHeight,
      viewportWidth: getCurrentViewportWidth(),
    }),
    routeKey: stability?.routeKey ?? analysis.metricsBase.routeKey,
    stableWindowVersion: stability?.stableWindowVersion ?? analysis.metricsBase.stableWindowVersion,
    extractedAt: Date.now(),
    documentHeight,
    viewportHeight,
    scrollY: getCurrentScrollY(),
  };
}

/**
 * 读取元素的推荐宽度。
 *
 * @param element - 目标元素。
 * @param env - 单轮分析上下文。
 * @returns 像素宽度；无法确定时返回 `null`。
 */
function getElementWidth(element: Element, env: PageStyleAnalysisEnv): number | null {
  const snapshot = getSampledElementSnapshot(element, env);
  if (snapshot.rect.width > 0) return snapshot.rect.width;
  return parsePx(snapshot.style.maxWidth) ?? parsePx(snapshot.style.width);
}

/**
 * 读取元素的视觉样式签名。
 *
 * @param element - 目标元素。
 * @param env - 单轮分析上下文。
 * @returns 紧凑的风格描述字符串。
 */
function buildStyleSignature(element: Element, env: PageStyleAnalysisEnv): string {
  const snapshot = getSampledElementSnapshot(element, env);
  const borderWidth = parsePx(snapshot.style.borderTopWidth) ?? 0;
  const border = snapshot.style.borderTopStyle !== 'none' && borderWidth > 0 && isMeaningfulColor(snapshot.style.borderTopColor)
    ? snapshot.style.borderTopColor
    : '';
  const radius = snapshot.style.borderRadius;
  const shadow = hasMeaningfulComplexCssValue(snapshot.style.boxShadow, env.cssValueCache) ? snapshot.style.boxShadow : '';
  const backdropFilter = hasMeaningfulComplexCssValue(snapshot.style.backdropFilter, env.cssValueCache)
    ? snapshot.style.backdropFilter
    : '';
  return [
    isMeaningfulColor(snapshot.style.backgroundColor) ? `bg:${snapshot.style.backgroundColor}` : '',
    isMeaningfulColor(snapshot.style.color) ? `text:${snapshot.style.color}` : '',
    border ? `border:${border}` : '',
    radius && radius !== '0px' ? `radius:${radius}` : '',
    shadow ? `shadow:${shadow}` : '',
    snapshot.style.fontWeight ? `weight:${snapshot.style.fontWeight}` : '',
    backdropFilter ? `blur:${backdropFilter}` : '',
  ].filter(Boolean).join(' ; ');
}

/**
 * 收集 section 间距样本。
 *
 * @param sections - section 样本。
 * @param env - 单轮分析上下文。
 * @returns 间距列表。
 */
function collectSectionGapSamples(sections: Element[], env: PageStyleAnalysisEnv): number[] {
  const result: number[] = [];
  for (const section of sections) {
    const snapshot = getSampledElementSnapshot(section, env);
    const gap = (parsePx(snapshot.style.marginTop) ?? 0)
      + (parsePx(snapshot.style.marginBottom) ?? 0)
      + (parsePx(snapshot.style.paddingTop) ?? 0)
      + (parsePx(snapshot.style.paddingBottom) ?? 0);
    if (gap <= 0) continue;
    const rounded = Math.round(gap);
    if (!result.includes(rounded)) result.push(rounded);
    if (result.length >= PAGE_STYLE_LIMITS.sectionGapSamples) break;
  }
  return result;
}

/**
 * 判断页面是否存在明显 hero 区。
 *
 * @param sections - section 样本。
 * @param headings - 标题样本。
 * @param viewportHeight - 当前视口高度。
 * @param env - 单轮分析上下文。
 * @returns 是否命中 hero。
 */
function detectHero(sections: Element[], headings: Element[], viewportHeight: number, env: PageStyleAnalysisEnv): boolean {
  if (headings.length < 1) return false;
  const firstSection = sections[0] ?? headings[0]?.closest('section, article, header, main');
  if (!firstSection) return false;
  const snapshot = getSampledElementSnapshot(firstSection, env);
  if (!snapshot.visible) return false;
  if (snapshot.rect.height > viewportHeight * 0.35) return true;
  return Boolean(snapshot.tagName === 'header' || snapshot.className.includes('hero') || firstSection.querySelector('img, svg, canvas, picture'));
}

/**
 * 归纳导航风格。
 *
 * @param nav - 导航元素。
 * @param env - 单轮分析上下文。
 * @returns 导航形态摘要。
 */
function describeNavStyle(nav: Element | null, env: PageStyleAnalysisEnv): string {
  if (!nav) return 'none';
  const snapshot = getSampledElementSnapshot(nav, env);
  if (!snapshot.visible) return 'none';
  const position = snapshot.style.position === 'sticky' || snapshot.style.position === 'fixed' ? 'sticky-top' : 'static-top';
  const background = isMeaningfulColor(snapshot.style.backgroundColor) ? `bg:${snapshot.style.backgroundColor}` : '';
  const borderBottomWidth = parsePx(snapshot.style.borderBottomWidth) ?? 0;
  const border = snapshot.style.borderBottomStyle !== 'none' && borderBottomWidth > 0 ? 'bordered' : '';
  const shadow = hasMeaningfulComplexCssValue(snapshot.style.boxShadow, env.cssValueCache) ? 'shadowed' : '';
  return [position, background, border, shadow].filter(Boolean).join(' ; ');
}

/**
 * 推断卡片/栅格布局倾向。
 *
 * @param cards - 卡片样本。
 * @param env - 单轮分析上下文。
 * @returns 布局摘要。
 */
function describeCardGrid(cards: Element[], env: PageStyleAnalysisEnv): string {
  if (cards.length < 1) return 'none';
  const parentCounts = new Map<Element, number>();
  for (const card of cards) {
    const parent = card.parentElement;
    if (!parent) continue;
    parentCounts.set(parent, (parentCounts.get(parent) ?? 0) + 1);
  }
  const entry = Array.from(parentCounts.entries()).sort((left, right) => right[1] - left[1])[0];
  if (!entry) return cards.length > 2 ? 'multi-card-list' : 'single-column';
  const [parent, count] = entry;
  const display = getSampledElementSnapshot(parent, env).style.display;
  if ((display.includes('grid') || display.includes('flex')) && count >= 2) {
    return display.includes('grid') ? 'multi-column-grid' : 'multi-column-flex';
  }
  return count >= 2 ? 'stacked-cards' : 'single-column';
}

/**
 * 估计图片密度。
 *
 * @param imageCount - 图片节点数量。
 * @returns 密度级别。
 */
function describeImageDensity(imageCount: number): PageStyleLayoutSignals['imageDensity'] {
  if (imageCount <= 0) return 'none';
  if (imageCount <= 3) return 'low';
  if (imageCount <= 10) return 'medium';
  return 'high';
}

/**
 * 收集页面级信号。
 *
 * @param cards - 卡片样本。
 * @param buttons - 按钮样本。
 * @param links - 链接样本。
 * @param containers - 容器样本。
 * @param sections - section 样本。
 * @param env - 单轮分析上下文。
 * @returns 页面级信号。
 */
function collectPageSignals(
  cards: Element[],
  buttons: Element[],
  links: Element[],
  containers: Element[],
  sections: Element[],
  env: PageStyleAnalysisEnv,
): PageStylePageSignals {
  const root = getPageSamplingRoot();
  const bodySnapshot = getSampledElementSnapshot(root, env);
  const documentSnapshot = getSampledElementSnapshot(document.documentElement, env);
  const widthSamples = containers
    .map((element) => getElementWidth(element, env))
    .filter((value): value is number => typeof value === 'number' && value > 0);
  const layoutAnchor = containers[0] ?? root;
  const layoutSnapshot = getSampledElementSnapshot(layoutAnchor, env);
  const centeredLayout = layoutSnapshot.rect.width > 0
    ? Math.abs(layoutSnapshot.rect.left - Math.max(0, getCurrentViewportWidth() - layoutSnapshot.rect.right)) <= 24
    : layoutSnapshot.style.marginLeft === 'auto' && layoutSnapshot.style.marginRight === 'auto';
  const gapSamples = collectSectionGapSamples(sections, env);

  return {
    backgroundColor: pickFirstMeaningfulColor(
      [bodySnapshot.style.backgroundColor, documentSnapshot.style.backgroundColor],
      COLORLESS_TRANSPARENT_FALLBACK,
    ),
    textColor: pickFirstMeaningfulColor([bodySnapshot.style.color, documentSnapshot.style.color], ''),
    linkColor: pickFirstMeaningfulColor(links.map((element) => getSampledElementSnapshot(element, env).style.color), ''),
    primaryButtonColor: pickFirstMeaningfulColor(buttons.map((element) => getSampledElementSnapshot(element, env).style.backgroundColor), ''),
    borderColors: uniqueStrings(
      [...cards, ...buttons].map((element) => {
        const snapshot = getSampledElementSnapshot(element, env);
        const borderWidth = parsePx(snapshot.style.borderTopWidth) ?? 0;
        return snapshot.style.borderTopStyle !== 'none' && borderWidth > 0 ? snapshot.style.borderTopColor : '';
      }),
      PAGE_STYLE_LIMITS.componentStyleSamples,
    ),
    shadowSamples: uniqueStrings(
      [...cards, ...buttons].map((element) => {
        const shadow = getSampledElementSnapshot(element, env).style.boxShadow;
        return hasMeaningfulComplexCssValue(shadow, env.cssValueCache) ? shadow : '';
      }),
      PAGE_STYLE_LIMITS.componentStyleSamples,
    ),
    radiusSamples: uniqueStrings(
      [...cards, ...buttons].map((element) => {
        const radius = getSampledElementSnapshot(element, env).style.borderRadius;
        return radius && radius !== '0px' ? radius : '';
      }),
      PAGE_STYLE_LIMITS.componentStyleSamples,
    ),
    maxContentWidth: widthSamples.length > 0 ? Math.max(...widthSamples) : null,
    centeredLayout,
    airyWhitespace: gapSamples.some((gap) => gap >= 96),
  };
}

/**
 * 收集排版信号。
 *
 * @param headings - 标题样本。
 * @param buttons - 按钮样本。
 * @param paragraphs - 正文样本。
 * @param env - 单轮分析上下文。
 * @returns 排版信号。
 */
function collectTypographySignals(
  headings: Element[],
  buttons: Element[],
  paragraphs: Element[],
  env: PageStyleAnalysisEnv,
): PageStyleTypographySignals {
  const bodySnapshot = getSampledElementSnapshot(getPageSamplingRoot(), env);
  return {
    bodyFontFamilies: uniqueStrings([bodySnapshot.style.fontFamily], PAGE_STYLE_LIMITS.componentStyleSamples),
    headingFontFamilies: uniqueStrings(headings.map((element) => getSampledElementSnapshot(element, env).style.fontFamily), PAGE_STYLE_LIMITS.componentStyleSamples),
    buttonFontFamilies: uniqueStrings(buttons.map((element) => getSampledElementSnapshot(element, env).style.fontFamily), PAGE_STYLE_LIMITS.componentStyleSamples),
    bodyFontSize: bodySnapshot.style.fontSize,
    bodyLineHeight: bodySnapshot.style.lineHeight,
    headingFontSizes: uniqueStrings(headings.map((element) => getSampledElementSnapshot(element, env).style.fontSize), PAGE_STYLE_LIMITS.componentStyleSamples),
    buttonFontSizes: uniqueStrings(buttons.map((element) => getSampledElementSnapshot(element, env).style.fontSize), PAGE_STYLE_LIMITS.componentStyleSamples),
    fontWeights: uniqueStrings(
      [...headings, ...buttons, ...paragraphs].map((element) => getSampledElementSnapshot(element, env).style.fontWeight),
      PAGE_STYLE_LIMITS.componentStyleSamples,
    ),
  };
}

/**
 * 收集布局信号。
 *
 * @param sections - section 样本。
 * @param cards - 卡片样本。
 * @param headings - 标题样本。
 * @param navs - 导航样本。
 * @param visualCount - 图片计数。
 * @param sectionCount - section 计数。
 * @param env - 单轮分析上下文。
 * @returns 布局信号。
 */
function collectLayoutSignals(
  sections: Element[],
  cards: Element[],
  headings: Element[],
  navs: Element[],
  visualCount: number,
  sectionCount: number,
  env: PageStyleAnalysisEnv,
): PageStyleLayoutSignals {
  const nav = navs[0] ?? document.querySelector('nav, header');
  return {
    hasHero: detectHero(sections, headings, getCurrentViewportHeight(), env),
    navStyle: describeNavStyle(nav, env),
    sectionCount,
    sectionGapSamples: collectSectionGapSamples(sections, env),
    cardGridHint: describeCardGrid(cards, env),
    imageDensity: describeImageDensity(visualCount),
  };
}

/**
 * 收集组件风格信号。
 *
 * @param cards - 卡片样本。
 * @param buttons - 按钮样本。
 * @param inputs - 输入框样本。
 * @param tags - 标签样本。
 * @param navs - 导航样本。
 * @param env - 单轮分析上下文。
 * @returns 组件信号。
 */
function collectComponentSignals(
  cards: Element[],
  buttons: Element[],
  inputs: Element[],
  tags: Element[],
  navs: Element[],
  env: PageStyleAnalysisEnv,
): PageStyleComponentSignals {
  return {
    buttonStyles: uniqueStrings(buttons.map((element) => buildStyleSignature(element, env)), PAGE_STYLE_LIMITS.componentStyleSamples),
    cardStyles: uniqueStrings(cards.map((element) => buildStyleSignature(element, env)), PAGE_STYLE_LIMITS.componentStyleSamples),
    inputStyles: uniqueStrings(inputs.map((element) => buildStyleSignature(element, env)), PAGE_STYLE_LIMITS.componentStyleSamples),
    tagStyles: uniqueStrings(tags.map((element) => buildStyleSignature(element, env)), PAGE_STYLE_LIMITS.componentStyleSamples),
    navStyles: uniqueStrings(navs.map((element) => buildStyleSignature(element, env)), PAGE_STYLE_LIMITS.componentStyleSamples),
  };
}

/**
 * 收集装饰语言信号。
 *
 * @param cards - 卡片样本。
 * @param containers - 容器样本。
 * @param navs - 导航样本。
 * @param visuals - 视觉样本。
 * @param svgCount - SVG 数量。
 * @param env - 单轮分析上下文。
 * @returns 装饰信号。
 */
function collectDecorationSignals(
  cards: Element[],
  containers: Element[],
  navs: Element[],
  visuals: Element[],
  svgCount: number,
  env: PageStyleAnalysisEnv,
): PageStyleDecorationSignals {
  const decorated = [...cards, ...containers, ...navs];
  const usesGradients = decorated.some((element) => {
    const backgroundImage = getSampledElementSnapshot(element, env).style.backgroundImage;
    return cssValueHasFunction(backgroundImage, GRADIENT_FUNCTIONS, env.cssValueCache);
  });
  const usesGlass = decorated.some((element) => {
    const snapshot = getSampledElementSnapshot(element, env);
    return hasMeaningfulComplexCssValue(snapshot.style.backdropFilter, env.cssValueCache)
      || (isTranslucentMeaningfulColor(snapshot.style.backgroundColor) && (parsePx(snapshot.style.borderRadius) ?? 0) >= 12);
  });
  const usesBorders = decorated.some((element) => {
    const snapshot = getSampledElementSnapshot(element, env);
    return snapshot.style.borderTopStyle !== 'none' && (parsePx(snapshot.style.borderTopWidth) ?? 0) > 0;
  });
  const usesShadows = decorated.some((element) => {
    const boxShadow = getSampledElementSnapshot(element, env).style.boxShadow;
    return hasMeaningfulComplexCssValue(boxShadow, env.cssValueCache);
  });
  const hasStickyHeader = navs.some((element) => {
    const position = getSampledElementSnapshot(element, env).style.position;
    return position === 'sticky' || position === 'fixed';
  });
  const viewportWidth = getCurrentViewportWidth();
  const viewportHeight = getCurrentViewportHeight();
  const hasLargeImages = visuals.some((element) => {
    const rect = getSampledElementSnapshot(element, env).rect;
    return rect.width >= viewportWidth * 0.45 || rect.height >= viewportHeight * 0.3;
  });
  return {
    hasLargeImages,
    usesGradients,
    usesIllustrations: svgCount >= PAGE_STYLE_LIMITS.illustrationSvgCount || visuals.length >= 6,
    usesBorders,
    usesGlass,
    usesShadows,
    hasStickyHeader,
  };
}

/**
 * 收集样本与定位信息。
 *
 * @param headings - 标题样本。
 * @param sections - section 样本。
 * @param cards - 卡片样本。
 * @returns 样本信息。
 */
function collectSampleSignals(headings: Element[], sections: Element[], cards: Element[]): PageStyleSampleSignals {
  return {
    headings: uniqueStrings(headings.map((element) => normalizeCssWhitespace(element.textContent || '')), PAGE_STYLE_LIMITS.headingSamples),
    sectionSelectors: uniqueStrings(sections.map((element) => element.tagName.toLowerCase()), PAGE_STYLE_LIMITS.sectionSamples),
    cardSelectors: uniqueStrings(cards.map((element) => element.tagName.toLowerCase()), PAGE_STYLE_LIMITS.cardSamples),
  };
}

/**
 * 构造当前页面的稳定风格指纹。
 *
 * @param args - 指纹输入。
 * @returns 当前页面稳定指纹。
 */
function buildPageStyleFingerprint(args: {
  documentHeight: number;
  viewportHeight: number;
  viewportWidth: number;
  sectionCount: number;
  headingCount: number;
  heroTag: string;
}): string {
  const docEl = document.documentElement;
  const body = document.body;
  const main = document.querySelector('main');
  return [
    location.href,
    document.title || '',
    String(args.documentHeight),
    String(args.viewportHeight),
    String(args.viewportWidth),
    String(args.sectionCount),
    String(args.headingCount),
    typeof body?.className === 'string' ? normalizeCssWhitespace(body.className) : '',
    normalizeCssWhitespace(docEl?.getAttribute('data-theme') || ''),
    typeof main?.className === 'string' ? normalizeCssWhitespace(main.className) : '',
    args.heroTag,
  ].join('::');
}
