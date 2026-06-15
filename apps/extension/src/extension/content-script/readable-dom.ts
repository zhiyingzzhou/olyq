/**
 * 说明：`readable-dom` 内容脚本正文采集入口模块。
 *
 * 职责：
 * - 组装文章主体、可见页面、结构列表和元数据降级四类采集策略；
 * - 暴露稳定 DOM 抽取入口供 fixture 单测复用；
 * - 在真实 content script 请求中等待页面稳定窗口并附加页面身份字段。
 *
 * 边界：
 * - 本模块只读取当前普通网页 DOM，不跨域深入 iframe，不 OCR canvas / 图片文字；
 * - 虚拟滚动和懒加载页面只采集当前已经渲染进 DOM 的内容；
 * - 不做站点白名单或域名特判，所有判断只基于通用 DOM、可见性和文本质量。
 */
import type {
  BrowserContextReadableDomIntent,
  BrowserContextReadableDomPayload,
} from '@/types/sw-messages';
import { waitForReadableDomStableWindow } from './page-stability';
import { buildArticleCandidate, classifyMetadataOnlyReason } from './readable-dom-article';
import {
  buildStructuredPageCandidate,
  buildVisiblePageCandidate,
  choosePageCandidate,
} from './readable-dom-page-candidates';
import {
  collectVisibleTextStats,
  type ExtractionCandidate,
  type ReadableDomBasePayload,
  type TextStats,
} from './readable-dom-helpers';

/**
 * 归一化正文采集意图。
 *
 * @param intent - 调用方传入的采集意图。
 * @returns 当前支持的采集意图。
 */
function normalizeReadableDomIntent(intent?: BrowserContextReadableDomIntent): BrowserContextReadableDomIntent {
  return intent === 'full-page' ? 'full-page' : 'normal';
}

/**
 * 将候选正文转换成 content script 协议 payload。
 *
 * @param base - 页面身份基础字段。
 * @param intent - 本轮采集意图。
 * @param candidate - 已选采集候选。
 * @returns 正文 payload。
 */
function buildPayloadFromCandidate(
  base: ReadableDomBasePayload,
  intent: BrowserContextReadableDomIntent,
  candidate: ExtractionCandidate,
): BrowserContextReadableDomPayload {
  const isTopFrame = window.top === window;
  return {
    ...base,
    intent,
    mode: candidate.mode,
    text: candidate.text,
    html: candidate.html || '',
    articleTitle: candidate.articleTitle || base.title,
    byline: candidate.byline || '',
    excerpt: candidate.excerpt || '',
    headings: candidate.headings,
    contentChars: candidate.contentChars,
    visibleTextChars: candidate.visibleTextChars,
    sourceKind: isTopFrame ? 'top-frame' : 'embedded-frame',
    frameUrl: location.href,
    frameTitle: document.title || candidate.articleTitle || base.title,
    isTopFrame,
    ...(candidate.structuredItemCount ? { structuredItemCount: candidate.structuredItemCount } : {}),
    ...(candidate.degradeReason ? { degradeReason: candidate.degradeReason } : {}),
  };
}

/**
 * 构造元数据降级 payload。
 *
 * @param base - 页面身份基础字段。
 * @param intent - 本轮采集意图。
 * @param stats - 页面可见文本统计。
 * @returns 元数据降级 payload。
 */
function buildMetadataOnlyPayload(
  base: ReadableDomBasePayload,
  intent: BrowserContextReadableDomIntent,
  stats: TextStats,
): BrowserContextReadableDomPayload {
  const isTopFrame = window.top === window;
  return {
    ...base,
    intent,
    mode: 'metadata-only',
    text: '',
    html: '',
    articleTitle: base.title,
    byline: '',
    excerpt: '',
    headings: [],
    contentChars: 0,
    visibleTextChars: stats.chars,
    degradeReason: classifyMetadataOnlyReason(stats),
    sourceKind: isTopFrame ? 'top-frame' : 'embedded-frame',
    frameUrl: location.href,
    frameTitle: document.title || base.title,
    isTopFrame,
  };
}

/**
 * 从当前稳定 DOM 中提取页面正文。
 *
 * 说明：
 * - `normal`：优先高质量 `article`，不达标再按页面结构采集；
 * - `full-page`：优先 `structured-page / visible-page`，只在页面结构不可用时尝试文章主体；
 * - 所有候选都必须经过字符量和质量门槛，失败时返回 `metadata-only` 与稳定原因码。
 *
 * @param base - 页面身份基础字段。
 * @param options - 采集选项。
 * @returns 正文 payload。
 */
export async function extractReadableDocumentFromStableDom(
  base: ReadableDomBasePayload,
  options: {
    maxLen?: number;
    intent?: BrowserContextReadableDomIntent;
  } = {},
): Promise<BrowserContextReadableDomPayload> {
  const maxLen = Math.max(1, Math.round(options.maxLen ?? 50_000));
  const intent = normalizeReadableDomIntent(options.intent);
  const visibleStats = collectVisibleTextStats(document.body || document.documentElement, { excludeNoise: false });
  const terminalReason = classifyMetadataOnlyReason(visibleStats);
  if (terminalReason === 'challenge-page') {
    return buildMetadataOnlyPayload(base, intent, visibleStats);
  }

  const visiblePage = buildVisiblePageCandidate(maxLen, visibleStats.chars);
  const structuredPage = buildStructuredPageCandidate(maxLen, visibleStats.chars);
  const pageCandidate = choosePageCandidate(structuredPage, visiblePage);
  if (intent === 'full-page') {
    if (pageCandidate) return buildPayloadFromCandidate(base, intent, pageCandidate);
    const article = await buildArticleCandidate(maxLen, visibleStats.chars);
    if (article) return buildPayloadFromCandidate(base, intent, article);
    return buildMetadataOnlyPayload(base, intent, visibleStats);
  }

  const article = await buildArticleCandidate(maxLen, visibleStats.chars);
  if (article) return buildPayloadFromCandidate(base, intent, article);
  if (pageCandidate) return buildPayloadFromCandidate(base, intent, pageCandidate);
  return buildMetadataOnlyPayload(base, intent, visibleStats);
}

/**
 * 提取页面可读正文结构，供 `browser-context/readable-dom` collector 使用。
 *
 * @param maxLen - 正文最大字符数。
 * @param stableWaitMs - 页面稳定窗口最长等待毫秒数。
 * @param intent - 正文采集意图。
 * @returns 正文 payload。
 */
export async function extractReadableDocument(
  maxLen = 50_000,
  stableWaitMs?: number,
  intent?: BrowserContextReadableDomIntent,
): Promise<BrowserContextReadableDomPayload> {
  const stability = await waitForReadableDomStableWindow({ maxWaitMs: stableWaitMs });
  return extractReadableDocumentFromStableDom({
    title: document.title || '',
    url: location.href,
    extractedAt: Date.now(),
    pageFingerprint: stability.pageFingerprint,
    routeKey: stability.routeKey,
    stableWindowVersion: stability.stableWindowVersion,
  }, { maxLen, intent });
}
