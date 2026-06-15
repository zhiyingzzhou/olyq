/**
 * 说明：technology-stack detector 候选规则选择器。
 *
 * 职责：
 * - 根据当前页面实际存在的公开信号来源挑选候选规则；
 * - 用页面侧 quick-token 候选做轻量排序，不把 token miss 当硬门槛；
 * - 保持 detector 主文件只负责规则执行、关系合并和结果归一化。
 *
 * 边界：
 * - 本模块不执行正式 pattern 匹配，不产生用户可见证据；
 * - quickMatch 只是排序加速，不能作为丢弃规则的硬门槛；
 * - 宽文本来源只允许用规则 pattern 自身字面量做“不可能命中”加速。
 * - 预筛只使用当前信号的预算内安全摘要，不读取远程资源。
 */
import { deriveTechnologyRulePatternLiteralTokens } from './rule-quick-tokens';
import type {
  TechnologyDetectionSignals,
  TechnologyEvidenceSource,
  TechnologyRule,
} from './types';

/** 候选选择所需的规则索引视图。 */
export interface TechnologyCandidateRuleSet {
  /** source 到 rules。 */
  rulesBySource: Map<TechnologyEvidenceSource, TechnologyRule[]>;
  /** slug 到 rule；用于页面侧本地候选和命中摘要直达正式匹配。 */
  rulesBySlug?: Map<string, TechnologyRule>;
}

const PAGE_TEXT_SOURCES = new Set<TechnologyEvidenceSource>(['html', 'text', 'css', 'inline-script']);
const BROAD_TEXT_SOURCES = new Set<TechnologyEvidenceSource>([
  'url',
  'cookies',
  ...PAGE_TEXT_SOURCES,
  'script-src',
  'xhr-url',
]);

/**
 * 判断数组是否有至少一个有效字符串。
 *
 * @param items - 字符串数组。
 * @returns 有文本内容时返回 true。
 */
function hasTextItems(items: readonly string[] | undefined): boolean {
  return Boolean(items?.some((item) => String(item || '').trim()));
}

/**
 * 判断对象是否至少有一个 key。
 *
 * @param record - 任意 record。
 * @returns 至少有一个 key 时返回 true。
 */
function hasKeys(record: Record<string, unknown> | undefined): boolean {
  return Boolean(record && Object.keys(record).length > 0);
}

/**
 * 判断当前规则在 key-value 型信号上是否至少有一个真实存在的 key。
 *
 * source-first 索引负责先按信号大类分桶；这里再对 headers/meta/dom/js 做 key-aware
 * 过滤，避免页面只暴露一个全局对象时把所有同 source 规则都拉进正式匹配。
 *
 * @param rule - 候选规则。
 * @param source - 当前信号来源。
 * @param signals - 页面与网络公开信号。
 * @returns 当前 source 对此规则有可用 key 时返回 true。
 */
function hasActiveKeyForSource(
  rule: TechnologyRule,
  source: TechnologyEvidenceSource,
  signals: TechnologyDetectionSignals,
): boolean {
  if (source === 'headers') {
    const headers = signals.network.headers;
    return Object.keys(rule.headers ?? {}).some((key) => Boolean(headers[key.toLowerCase()]));
  }
  if (source === 'meta') {
    const meta = signals.page.meta;
    return Object.keys(rule.meta ?? {}).some((key) => Boolean(meta[key.toLowerCase()]));
  }
  if (source === 'dom') {
    const dom = signals.page.dom;
    return Object.keys(rule.dom ?? {}).some((key) => key in dom);
  }
  if (source === 'js') {
    const js = signals.page.js;
    return Object.keys(rule.js ?? {}).some((key) => key in js);
  }
  return true;
}

/**
 * 根据当前页面实际采集到的信号，挑出需要参与检测的规则。
 *
 * @param signals - 页面和网络公开信号。
 * @param ruleSet - 编译规则索引。
 * @returns 候选规则列表。
 */
export function selectCandidateRules(
  signals: TechnologyDetectionSignals,
  ruleSet: TechnologyCandidateRuleSet,
): TechnologyRule[] {
  const activeSources: TechnologyEvidenceSource[] = [];
  /**
   * 记录当前页面实际存在的信号来源。
   *
   * @param source - 存在公开信号的来源。
   */
  const addActiveSource = (source: TechnologyEvidenceSource): void => {
    if (!activeSources.includes(source)) activeSources.push(source);
  };
  if (hasKeys(signals.network.headers)) addActiveSource('headers');
  if (String(signals.page.url || '').trim()) addActiveSource('url');
  if (hasTextItems(signals.network.cookieNames)) addActiveSource('cookies');
  if (hasKeys(signals.page.meta)) addActiveSource('meta');
  if (String(signals.page.html || '').trim()) addActiveSource('html');
  if (String(signals.page.text || '').trim()) addActiveSource('text');
  if (hasTextItems(signals.page.cssText) || hasTextItems(signals.page.stylesheetHrefs)) addActiveSource('css');
  if (hasTextItems(signals.page.scriptSrc)) addActiveSource('script-src');
  if (hasTextItems(signals.page.inlineScript)) addActiveSource('inline-script');
  if (hasKeys(signals.page.dom)) addActiveSource('dom');
  if (hasKeys(signals.page.js)) addActiveSource('js');
  if (hasTextItems(signals.network.requestUrls)) addActiveSource('xhr-url');
  if (String(signals.page.language || '').trim()) addActiveSource('language');
  for (const match of signals.page.localPatternMatches ?? []) addActiveSource(match.source);

  const selected = new Map<TechnologyRule, number>();
  /**
   * 加入候选规则，并记录 quick/local 命中的排序分。
   *
   * @param rule - 技术规则。
   * @param score - 排序分，越高越早进入正式匹配。
   */
  const addSelected = (rule: TechnologyRule, score = 0): void => {
    selected.set(rule, Math.max(selected.get(rule) ?? 0, score));
  };
  for (const slug of signals.page.localCandidateSlugs ?? []) {
    const rule = ruleSet.rulesBySlug?.get(slug);
    if (rule) addSelected(rule, 80);
  }
  for (const match of signals.page.localPatternMatches ?? []) {
    const rule = ruleSet.rulesBySlug?.get(match.ruleSlug);
    if (rule) addSelected(rule, 100);
  }
  const sourceText = new Map<TechnologyEvidenceSource, string>();
  const sourceTokens = new Map<TechnologyEvidenceSource, Set<string>>();
  /**
   * 懒构造单个信号来源的低成本索引文本。
   *
   * @param source - 当前证据来源。
   * @returns 小写后的预算内摘要文本。
   */
  const getSourceText = (source: TechnologyEvidenceSource): string => {
    const cached = sourceText.get(source);
    if (cached !== undefined) return cached;
    const value = (() => {
      if (source === 'headers') return Object.entries(signals.network.headers).map(([key, item]) => `${key}:${item}`).join('\n');
      if (source === 'url') return signals.page.url;
      if (source === 'cookies') {
        return [
          ...(signals.network.cookieNames ?? []),
          ...(signals.network.cookieValues ?? []).map((cookie) => `${cookie.name}=${cookie.value}`),
        ].join('\n');
      }
      if (source === 'meta') return Object.entries(signals.page.meta).map(([key, item]) => `${key}:${item}`).join('\n');
      if (source === 'html') return signals.page.html;
      if (source === 'text') return signals.page.text;
      if (source === 'css') return [...signals.page.cssText, ...signals.page.stylesheetHrefs].join('\n');
      if (source === 'script-src') return signals.page.scriptSrc.join('\n');
      if (source === 'inline-script') return signals.page.inlineScript.join('\n');
      if (source === 'dom') return Object.entries(signals.page.dom).map(([key, item]) => `${key}:${item}`).join('\n');
      if (source === 'js') return Object.entries(signals.page.js).map(([key, item]) => `${key}:${item}`).join('\n');
      if (source === 'xhr-url') return signals.network.requestUrls.join('\n');
      return signals.page.language;
    })().toLowerCase();
    sourceText.set(source, value);
    return value;
  };
  /**
   * 懒构造 broad text source 的 token set。
   *
   * 说明：script URL / inline script / HTML 这类来源在大页面上会很长；
   * quickMatch 的绝大多数 token 都是域名、包名、全局对象名或 class 片段，
   * 先切成 set 可以避免 `rules * tokens * text.length` 的重复 substring 扫描。
   *
   * @param source - 当前证据来源。
   * @returns 小写 token 集合。
   */
  const getSourceTokens = (source: TechnologyEvidenceSource): Set<string> => {
    const cached = sourceTokens.get(source);
    if (cached) return cached;
    const tokens = new Set<string>();
    for (const rawToken of getSourceText(source)
        .split(/[^a-z0-9@._-]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length > 0)) {
      const token = rawToken.replace(/^[._/@:-]+|[._/@:-]+$/g, '');
      if (!token) continue;
      tokens.add(token);
      // CDN 文件名和域名常把有效技术名包在 `lodash.min.js`、
      // `cdn.usefathom.com` 这类复合 token 里；登记子片段可以保持
      // O(1) membership，同时不回到每条规则扫整段 URL 文本。
      for (const part of token.split(/[._-]+/)) {
        if (part.length >= 3) tokens.add(part);
      }
      const hyphenParts = token.split(/[-/]+/).filter(Boolean);
      for (let index = 0; index < hyphenParts.length - 1; index += 1) {
        const suffix = hyphenParts.slice(index).join('-');
        if (suffix.length >= 4) tokens.add(suffix);
      }
      const pathParts = token.split('/').filter(Boolean);
      for (let index = 0; index < pathParts.length - 1; index += 1) {
        const suffix = pathParts.slice(index).join('/');
        if (suffix.length >= 4) tokens.add(suffix);
      }
      const host = token.split('/')[0] || token;
      const domainParts = host.split('.');
      if (domainParts.length > 1) {
        for (let index = 1; index < domainParts.length - 1; index += 1) {
          const suffix = domainParts.slice(index).join('.');
          if (suffix.length >= 4) tokens.add(suffix);
        }
      }
    }
    sourceTokens.set(source, tokens);
    return tokens;
  };
  /**
   * 判断 quickMatch token 是否在当前来源里出现。
   *
   * @param source - 当前证据来源。
   * @param token - 规则 quickMatch token。
   * @returns 命中时返回 true。
   */
  const hasQuickMatchToken = (source: TechnologyEvidenceSource, token: string): boolean => {
    if (!BROAD_TEXT_SOURCES.has(source)) return getSourceText(source).includes(token);
    if (/[\s/:?#&=]/.test(token)) return getSourceText(source).includes(token);
    return getSourceTokens(source).has(token);
  };
  for (const source of activeSources) {
    for (const rule of ruleSet.rulesBySource.get(source) ?? []) {
      if (!hasActiveKeyForSource(rule, source, signals)) continue;
      let quickScore = 0;
      if (BROAD_TEXT_SOURCES.has(source)) {
        const literalTokens = deriveTechnologyRulePatternLiteralTokens(rule, source);
        const hasLiteralHit = literalTokens.length > 0 && literalTokens.some((token) => hasQuickMatchToken(source, token));
        if (literalTokens.length > 0 && !hasLiteralHit) continue;
        quickScore = hasLiteralHit ? 40 : 0;
      }
      addSelected(rule, quickScore);
    }
  }
  return Array.from(selected.entries())
    .sort((left, right) => right[1] - left[1] || left[0].name.localeCompare(right[0].name))
    .map(([rule]) => rule);
}
