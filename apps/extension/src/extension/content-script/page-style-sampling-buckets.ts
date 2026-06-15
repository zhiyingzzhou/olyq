/**
 * 说明：`page-style-sampling-buckets` 页面风格单轮遍历模块。
 *
 * 职责：
 * - 把内容脚本页面风格抽样收口为一次有上限的 TreeWalker 遍历；
 * - 在单轮内同时收集 headings / sections / cards / buttons / inputs / tags / navs / links / visuals / containers；
 * - 把“卡片候选”与“最终卡片样本”拆开，避免同一页面多轮 selector 扫描。
 *
 * 边界：
 * - 本模块只负责候选桶采样，不安装 observer，不维护跨请求缓存；
 * - 复杂 CSS 值判断复用 core/css helper，不重复解析样式字符串；
 * - 输出仍保持内部结构，不向 UI、SW 或存储层扩散新语义。
 */
import { hasMeaningfulComplexCssValue, isMeaningfulColor } from './page-style-css';
import {
  getPageSamplingRoot,
  getSampledElementSnapshot,
  isExtensionInjectedRoot,
  PAGE_STYLE_LIMITS,
  parsePx,
  pushSample,
  type PageStyleAnalysisEnv,
  type PageStyleBuckets,
  type SampledElementSnapshot,
} from './page-style-sampling-core';

/**
 * 用单轮 TreeWalker 遍历收集所有代表性采样桶。
 *
 * @param env - 单轮分析上下文。
 * @returns 已收集的采样桶。
 */
export function collectPageBuckets(env: PageStyleAnalysisEnv): PageStyleBuckets {
  const root = getPageSamplingRoot();
  const buckets: PageStyleBuckets = {
    headings: [],
    sections: [],
    containers: [],
    buttons: [],
    inputs: [],
    tags: [],
    navs: [],
    links: [],
    visuals: [],
    paragraphs: [],
    cardCandidates: [],
    sectionCount: 0,
    headingCount: 0,
    visualCount: 0,
    svgCount: 0,
    visitedCount: 0,
  };

  /**
   * 处理单个可见元素，把它放进对应采样桶。
   *
   * @param element - 当前遍历到的元素。
   */
  const visitElement = (element: Element) => {
    if (buckets.visitedCount >= PAGE_STYLE_LIMITS.treeWalkVisits) return;
    buckets.visitedCount += 1;

    const snapshot = getSampledElementSnapshot(element, env);
    if (!snapshot.visible) return;

    if (snapshot.tagName === 'h1' || snapshot.tagName === 'h2' || snapshot.tagName === 'h3') {
      buckets.headingCount += 1;
      pushSample(buckets.headings, element, PAGE_STYLE_LIMITS.headingSamples);
    }

    if (isSectionLike(snapshot)) {
      buckets.sectionCount += 1;
      pushSample(buckets.sections, element, PAGE_STYLE_LIMITS.sectionSamples);
      pushSample(buckets.containers, element, PAGE_STYLE_LIMITS.containerSamples);
    }

    if (snapshot.tagName === 'nav' || snapshot.tagName === 'header') {
      pushSample(buckets.navs, element, PAGE_STYLE_LIMITS.navSamples);
    }

    if (snapshot.tagName === 'a' && snapshot.href) {
      pushSample(buckets.links, element, PAGE_STYLE_LIMITS.linkSamples);
    }

    if (
      snapshot.tagName === 'button'
      || snapshot.role === 'button'
      || (snapshot.tagName === 'input' && (snapshot.inputType === 'button' || snapshot.inputType === 'submit'))
    ) {
      pushSample(buckets.buttons, element, PAGE_STYLE_LIMITS.buttonSamples);
    }

    if (
      (snapshot.tagName === 'input' && snapshot.inputType !== 'hidden')
      || snapshot.tagName === 'textarea'
      || snapshot.tagName === 'select'
    ) {
      pushSample(buckets.inputs, element, PAGE_STYLE_LIMITS.inputSamples);
    }

    if (
      snapshot.className.includes('tag')
      || snapshot.className.includes('badge')
      || element.hasAttribute('data-tag')
      || element.hasAttribute('data-badge')
    ) {
      pushSample(buckets.tags, element, PAGE_STYLE_LIMITS.tagSamples);
    }

    if (snapshot.tagName === 'p' || snapshot.tagName === 'li' || snapshot.tagName === 'blockquote') {
      pushSample(buckets.paragraphs, element, PAGE_STYLE_LIMITS.paragraphSamples);
    }

    if (snapshot.tagName === 'img' || snapshot.tagName === 'svg' || snapshot.tagName === 'canvas' || snapshot.tagName === 'picture') {
      buckets.visualCount = Math.min(PAGE_STYLE_LIMITS.imageDensityCount, buckets.visualCount + 1);
      if (snapshot.tagName === 'svg') {
        buckets.svgCount = Math.min(PAGE_STYLE_LIMITS.illustrationSvgCount, buckets.svgCount + 1);
      }
      pushSample(buckets.visuals, element, PAGE_STYLE_LIMITS.visualSamples);
    }

    if (looksLikeCardCandidate(element, snapshot)) {
      pushSample(buckets.cardCandidates, element, PAGE_STYLE_LIMITS.cardCandidates);
    }
  };

  const rootSnapshot = getSampledElementSnapshot(root, env);
  if (!isExtensionInjectedRoot(root) && rootSnapshot.visible) {
    visitElement(root);
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => {
      if (!(node instanceof Element)) return NodeFilter.FILTER_SKIP;
      if (isExtensionInjectedRoot(node)) return NodeFilter.FILTER_REJECT;
      const snapshot = getSampledElementSnapshot(node, env);
      if (snapshot.hiddenByDisplay) return NodeFilter.FILTER_REJECT;
      return snapshot.visible ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });

  let current = walker.nextNode();
  while (current && buckets.visitedCount < PAGE_STYLE_LIMITS.treeWalkVisits) {
    visitElement(current as Element);
    current = walker.nextNode();
  }

  return buckets;
}

/**
 * 从候选池中过滤真正的卡片样本。
 *
 * @param candidates - 候选元素列表。
 * @param env - 单轮分析上下文。
 * @returns 卡片样本。
 */
export function collectCardSamples(candidates: Element[], env: PageStyleAnalysisEnv): Element[] {
  const result: Element[] = [];
  for (const element of candidates) {
    if (!hasCardSignal(element, env)) continue;
    pushSample(result, element, PAGE_STYLE_LIMITS.cardSamples);
    if (result.length >= PAGE_STYLE_LIMITS.cardSamples) break;
  }
  return result;
}

/**
 * 判断元素是否属于 section/container 语义。
 *
 * @param snapshot - 当前元素快照。
 * @returns 是否应计入 section 样本。
 */
function isSectionLike(snapshot: SampledElementSnapshot): boolean {
  return snapshot.tagName === 'main'
    || snapshot.tagName === 'section'
    || snapshot.tagName === 'article'
    || snapshot.tagName === 'header';
}

/**
 * 判断元素是否值得进入卡片候选池。
 *
 * @param element - 当前元素。
 * @param snapshot - 当前元素快照。
 * @returns 是否应进入候选池。
 */
function looksLikeCardCandidate(element: Element, snapshot: SampledElementSnapshot): boolean {
  if (snapshot.className.includes('card') || snapshot.className.includes('panel') || snapshot.className.includes('tile')) return true;
  if (element.hasAttribute('data-card')) return true;
  if (snapshot.tagName === 'article' || snapshot.tagName === 'li') return true;
  if (snapshot.tagName === 'div') {
    const parentTag = element.parentElement?.tagName.toLowerCase() || '';
    return parentTag === 'section' || parentTag === 'article' || parentTag === 'main';
  }
  return false;
}

/**
 * 判断候选元素是否具备足够强的“卡片感”。
 *
 * @param element - 当前元素。
 * @param env - 单轮分析上下文。
 * @returns 是否应被保留为最终卡片样本。
 */
function hasCardSignal(element: Element, env: PageStyleAnalysisEnv): boolean {
  const snapshot = getSampledElementSnapshot(element, env);
  const borderWidth = parsePx(snapshot.style.borderTopWidth) ?? 0;
  return hasMeaningfulComplexCssValue(snapshot.style.boxShadow, env.cssValueCache)
    || (snapshot.style.borderTopStyle !== 'none' && borderWidth > 0)
    || (parsePx(snapshot.style.borderRadius) ?? 0) > 0
    || isMeaningfulColor(snapshot.style.backgroundColor);
}
