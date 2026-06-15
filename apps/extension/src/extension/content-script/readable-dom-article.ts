/**
 * 说明：`readable-dom` 文章主体与降级质量判定模块。
 *
 * 职责：
 * - 仅在普通文章、博客、文档页中接受通过质量门槛的 Readability 结果；
 * - 拒绝短版权、登录提示、导航或页脚误抽取；
 * - 对确实无法读取正文的页面返回稳定 metadata-only 原因码。
 *
 * 边界：
 * - Readability 只是 `article` 策略候选，不再是全文模式唯一入口；
 * - 本模块不做站点特判，也不访问 browser-context runtime。
 */
import type { BrowserContextReadableDomDegradeReason } from '@/types/sw-messages';
import { Readability, isProbablyReaderable } from '@mozilla/readability';
import {
  ARTICLE_VISIBLE_RATIO_FLOOR,
  extractDocumentHeadings,
  MIN_ARTICLE_CHARS,
  normalizeText,
  type ExtractionCandidate,
  type TextStats,
} from './readable-dom-helpers';

const LOW_VALUE_TEXT_PATTERNS = [
  /copyright|all rights reserved|privacy policy|terms of (service|use)|cookie/i,
  /sign in|log in|login|register|create account|forgot password/i,
  /登录|登入|注册|忘记密码|隐私政策|服务条款|版权所有|版权/i,
  /menu|navigation|footer|breadcrumb|subscribe/i,
];

const CHALLENGE_CORE_TEXT_PATTERNS = [
  /checking your browser/i,
  /verify(?:ing)? (?:that )?you (?:are|['’]?re) human/i,
  /attention required/i,
  /ddos protection/i,
  /review(?:ing)? the security of your connection/i,
  /人机验证|正在检查你的浏览器/i,
];

const CHALLENGE_SHELL_TEXT_PATTERNS = [
  /just a moment/i,
  /请稍候|安全检查/i,
];

const CHALLENGE_PROVIDER_HINT_PATTERNS = [
  /cloudflare/i,
  /turnstile/i,
  /cf-ray|cf-chl|challenge-platform|challenges\.cloudflare\.com/i,
];

const LOGIN_WALL_PATTERNS = [
  /sign in|log in|login|register|create account|forgot password|password/i,
  /登录|登入|注册|请先登录|账号|密码|验证码/i,
];

/**
 * 判断短文本是否更像页脚、登录或导航噪声。
 *
 * @param text - 待判断文本。
 * @returns 低质量短文本返回 `true`。
 */
function isLowValueText(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return true;
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  const patternHits = LOW_VALUE_TEXT_PATTERNS.filter((pattern) => pattern.test(normalized)).length;
  if (patternHits >= 2 && normalized.length < 260) return true;
  if (patternHits >= 1 && normalized.length < 260) return true;
  return lines.length <= 3 && normalized.length < 320 && patternHits >= 1;
}

/**
 * 统计文本命中的挑战页特征数量。
 *
 * @param text - 已归一化的页面文本。
 * @param patterns - 候选特征正则。
 * @returns 命中数量。
 */
function countPatternHits(text: string, patterns: RegExp[]): number {
  return patterns.filter((pattern) => pattern.test(text)).length;
}

/**
 * 判断当前 DOM 是否带有 Cloudflare / Turnstile 挑战页结构信号。
 *
 * 说明：正文里出现 Cloudflare 或 challenge 只是普通内容，不能作为安全挑战真相；
 * 这里仅接受挑战平台脚本、iframe、表单 action 或 `cf-chl` / `cf-turnstile`
 * 这类结构性标记作为辅助 hint。
 *
 * @returns 存在挑战页结构 hint 时返回 `true`。
 */
function hasCloudflareChallengeDomHint(): boolean {
  try {
    if (document.querySelector([
      '.cf-turnstile',
      '[name="cf-turnstile-response"]',
      '[data-cf-turnstile-response]',
      'iframe[src*="challenges.cloudflare.com"]',
      'script[src*="challenges.cloudflare.com"]',
      'script[src*="/cdn-cgi/challenge-platform/"]',
      'form[action*="/cdn-cgi/challenge-platform/"]',
    ].join(','))) {
      return true;
    }
  } catch {
    // 特殊宿主 DOM 可能不支持完整 selector；下面仍用属性扫描兜住结构 hint。
  }

  return Array.from(document.querySelectorAll('[id], [class]')).some((element) => {
    const marker = [
      element.id,
      typeof element.className === 'string' ? element.className : '',
    ].join(' ').toLowerCase();
    return marker.includes('cf-chl') || marker.includes('cf-turnstile');
  });
}

/**
 * 判断可见文本是否像短安全挑战壳。
 *
 * @param text - 已归一化的页面文本。
 * @param stats - 页面可见文本统计。
 * @returns 短壳页面返回 `true`。
 */
function isShortChallengeShell(text: string, stats: TextStats): boolean {
  const lineCount = text.split('\n').map((line) => line.trim()).filter(Boolean).length;
  return stats.chars < 900 || lineCount <= 14;
}

/**
 * 判断当前页面是否足够像安全验证 / challenge 页。
 *
 * 说明：
 * - 单个品牌词、技术名或测试标题不能触发降级；
 * - 需要强挑战文案与短页面壳、Provider hint 或 DOM 结构信号互相印证；
 * - 仍然保留真实 Cloudflare / Turnstile challenge 的早退语义，避免伪造正文。
 *
 * @param stats - 页面可见文本统计。
 * @returns 确认为 challenge 页时返回 `true`。
 */
function isChallengePageLike(stats: TextStats): boolean {
  const combined = normalizeText([document.title || '', stats.text].join('\n'));
  const coreHits = countPatternHits(combined, CHALLENGE_CORE_TEXT_PATTERNS);
  const shellHits = countPatternHits(combined, CHALLENGE_SHELL_TEXT_PATTERNS);
  const hasProviderTextHint = CHALLENGE_PROVIDER_HINT_PATTERNS.some((pattern) => pattern.test(combined));
  const hasDomHint = hasCloudflareChallengeDomHint();
  const shortShell = isShortChallengeShell(combined, stats);

  if (coreHits >= 2 && (shortShell || hasDomHint || hasProviderTextHint)) return true;
  if (coreHits >= 1 && hasDomHint && shortShell) return true;
  if (coreHits >= 1 && hasProviderTextHint && shellHits >= 1 && shortShell) return true;
  if (coreHits >= 1 && hasProviderTextHint && stats.chars < 500) return true;
  return shellHits >= 1 && hasDomHint && hasProviderTextHint && shortShell;
}

/**
 * 校验 Readability 文章候选是否足够可信。
 *
 * @param text - Readability 正文。
 * @param visibleTextChars - 页面可见文本总量。
 * @param probablyReaderable - Readability 的 reader view 启发式结果。
 * @returns 合格返回 `true`。
 */
function isHighQualityArticleCandidate(text: string, visibleTextChars: number, probablyReaderable: boolean | null): boolean {
  const chars = normalizeText(text).length;
  if (chars < MIN_ARTICLE_CHARS) return false;
  if (isLowValueText(text)) return false;
  if (visibleTextChars >= 700 && chars / visibleTextChars < ARTICLE_VISIBLE_RATIO_FLOOR) return false;
  if (probablyReaderable === false && visibleTextChars >= 1_200 && chars < 500) return false;
  return true;
}

/**
 * 从显式语义 article 节点构建文章候选。
 *
 * 说明：Readability 在 jsdom、极短文档或部分语义完整页面上可能返回空；
 * 这里仍然只接受真实 `article/[role=article]` 节点，并复用同一质量门槛。
 *
 * @param maxLen - 最大字符数。
 * @param visibleTextChars - 页面可见文本总量。
 * @returns 文章候选；没有高质量语义 article 时返回 `null`。
 */
function buildSemanticArticleCandidate(maxLen: number, visibleTextChars: number): ExtractionCandidate | null {
  const root = document.querySelector('article, [role="article"]');
  if (!root) return null;
  const rawText = normalizeText(root.textContent || '');
  if (!isHighQualityArticleCandidate(rawText, visibleTextChars, true)) return null;
  return {
    mode: 'article',
    text: rawText.slice(0, maxLen).trim(),
    html: root.innerHTML || '',
    articleTitle: normalizeText(root.querySelector('h1')?.textContent || document.title || ''),
    byline: '',
    excerpt: '',
    headings: extractDocumentHeadings(root),
    contentChars: rawText.length,
    visibleTextChars,
    score: rawText.length + 420,
  };
}

/**
 * 构建高质量文章主体候选。
 *
 * @param maxLen - 最大字符数。
 * @param visibleTextChars - 页面可见文本总量。
 * @returns 文章候选；低质量或解析失败时返回 `null`。
 */
export async function buildArticleCandidate(maxLen: number, visibleTextChars: number): Promise<ExtractionCandidate | null> {
  try {
    const probablyReaderable = typeof isProbablyReaderable === 'function'
      ? isProbablyReaderable(document.cloneNode(true) as Document)
      : null;
    const clone = document.cloneNode(true) as Document;
    const article = new Readability(clone).parse();
    const rawText = normalizeText(article?.textContent || '');
    if (!rawText || !isHighQualityArticleCandidate(rawText, visibleTextChars, probablyReaderable)) {
      return buildSemanticArticleCandidate(maxLen, visibleTextChars);
    }
    const parsedContent = typeof article?.content === 'string'
      ? new DOMParser().parseFromString(article.content, 'text/html')
      : null;
    const headings = extractDocumentHeadings(parsedContent);
    return {
      mode: 'article',
      text: rawText.slice(0, maxLen).trim(),
      html: typeof article?.content === 'string' ? article.content : '',
      articleTitle: typeof article?.title === 'string' ? article.title : document.title || '',
      byline: typeof article?.byline === 'string' ? article.byline : '',
      excerpt: typeof article?.excerpt === 'string' ? article.excerpt : '',
      headings: headings.length > 0 ? headings : extractDocumentHeadings(document),
      contentChars: rawText.length,
      visibleTextChars,
      score: rawText.length + 500,
    };
  } catch {
    return buildSemanticArticleCandidate(maxLen, visibleTextChars);
  }
}

/**
 * 判断当前页面确实只能降级到元数据的稳定原因。
 *
 * @param stats - 页面可见文本统计。
 * @returns 降级原因。
 */
export function classifyMetadataOnlyReason(stats: TextStats): BrowserContextReadableDomDegradeReason {
  if (isChallengePageLike(stats)) return 'challenge-page';
  const combined = normalizeText([document.title || '', stats.text].join('\n'));
  if (LOGIN_WALL_PATTERNS.some((pattern) => pattern.test(combined)) && stats.chars < 500) return 'login-wall';
  if (stats.chars < 80 && (stats.imageCount > 0 || stats.canvasCount > 0)) return 'image-or-canvas-only';
  if (stats.chars < 1) return 'empty-body';
  return 'low-quality-extraction';
}
