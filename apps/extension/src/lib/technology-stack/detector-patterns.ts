/**
 * 说明：technology-stack detector 的单规则 pattern 匹配逻辑。
 *
 * 职责：
 * - 对 headers/cookies/meta/html/text/css/script/dom/js/xhr/language 执行正式匹配；
 * - 消费 content script 本地完整扫描产生的安全命中摘要；
 * - 只产出内部 RuleHit，不做关系推断、排序或结果归一化。
 *
 * 边界：
 * - cookie 原始值只在本地匹配时瞬时使用，证据里不暴露 value；
 * - 原始 HTML、脚本片段和长 CSS 只会被压缩成短摘要；
 * - 单条规则异常由 detector 入口隔离，本模块不吞掉调用方预算语义。
 */
import {
  DEFAULT_TECHNOLOGY_CONFIDENCE,
  MAX_TECHNOLOGY_EVIDENCE_PER_RESULT,
} from './detector-constants';
import { deriveTechnologyPatternQuickTokens } from './rule-quick-tokens';
import type { TechnologyVersionHit } from './detector-versions';
import type {
  TechnologyDetectionSignals,
  TechnologyEvidence,
  TechnologyEvidenceSource,
  TechnologyPagePatternMatch,
  TechnologyPatternRule,
  TechnologyRule,
  TechnologyVersionReliability,
} from './types';

/** 单项规则匹配后的内部命中。 */
export interface TechnologyRuleHit {
  /** 证据集合。 */
  evidence: TechnologyEvidence[];
  /** 命中的版本候选。 */
  versions: TechnologyVersionHit[];
}

/** 单次检测内可复用的 matcher 缓存。 */
export interface TechnologyRuleMatchContext {
  /** source text hash 到 token set；只在本轮检测内存活。 */
  sourceTokenSets: Map<string, Set<string>>;
  /** 合并数组型 source 后的文本缓存。 */
  combinedTexts: WeakMap<readonly string[], string>;
  /** 合并数组型 source 的小写文本缓存。 */
  combinedLowerTexts: WeakMap<readonly string[], string>;
  /** 合并数组型 source 的 token set 缓存。 */
  combinedTokenSets: WeakMap<readonly string[], Set<string>>;
}

const compiledRegexCache = new Map<string, RegExp>();

/** 需要用 token set 避免大量无关正则启动的宽文本来源。 */
const BROAD_TEXT_SOURCES = new Set<TechnologyEvidenceSource>([
  'url',
  'cookies',
  'html',
  'text',
  'css',
  'script-src',
  'inline-script',
  'xhr-url',
  'dom',
  'js',
]);

/**
 * 将字符串安全压缩为短摘要。
 *
 * @param value - 原始值。
 * @returns 去换行和截断后的摘要。
 */
function summarizeValue(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/**
 * 创建单次检测 matcher 上下文。
 *
 * @returns matcher 缓存上下文。
 */
export function createTechnologyRuleMatchContext(): TechnologyRuleMatchContext {
  return {
    sourceTokenSets: new Map(),
    combinedTexts: new WeakMap(),
    combinedLowerTexts: new WeakMap(),
    combinedTokenSets: new WeakMap(),
  };
}

/**
 * 生成短 hash，避免用页面原文作为缓存 key。
 *
 * @param input - 任意文本。
 * @returns hash。
 */
function hashString(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

/**
 * 读取 TechnologyPatternRule 的模式。
 *
 * @param rule - 原始规则。
 * @returns 规整后的模式、置信度与版本提取器。
 */
function normalizePatternRule(rule: TechnologyPatternRule): {
  pattern: string | RegExp;
  kind?: 'text' | 'regex';
  flags?: string;
  confidence: number;
  version?: string | RegExp;
  versionReliability?: TechnologyVersionReliability;
} {
  if (typeof rule === 'string' || rule instanceof RegExp) {
    return { pattern: rule, confidence: DEFAULT_TECHNOLOGY_CONFIDENCE };
  }
  return {
    pattern: rule.pattern,
    kind: rule.kind,
    flags: rule.flags,
    confidence: Math.max(1, Math.min(100, Math.round(rule.confidence ?? DEFAULT_TECHNOLOGY_CONFIDENCE))),
    version: rule.version,
    versionReliability: rule.versionReliability,
  };
}

/**
 * 编译并缓存规则正则。
 *
 * 说明：本地指纹包规模达到数千条后，同一批规则会在每次探测里反复匹配。
 * 这里仅按规则 pattern 与 flags 缓存 `RegExp` 实例，不把页面 HTML、脚本、CSS
 * 或 cookie value 放进缓存 key，避免把性能缓存变成内容存储通道。
 *
 * @param pattern - 字符串或正则规则。
 * @param flags - 正则 flags。
 * @returns 可复用的正则实例。
 */
function compilePatternRegex(pattern: string | RegExp, flags: string): RegExp {
  const source = pattern instanceof RegExp ? pattern.source : String(pattern);
  const normalizedFlags = flags.includes('g') ? flags.replace(/g/g, '') : flags || 'i';
  const cacheKey = `${normalizedFlags}\u0000${source}`;
  const cached = compiledRegexCache.get(cacheKey);
  if (cached) return cached;
  const compiled = new RegExp(source, normalizedFlags);
  compiledRegexCache.set(cacheKey, compiled);
  return compiled;
}

/**
 * 执行字符串/正则匹配。
 *
 * @param text - 被匹配文本。
 * @param pattern - 字符串或正则。
 * @returns 是否命中与正则 match。
 */
function matchPattern(text: string, pattern: string | RegExp, options: { kind?: 'text' | 'regex'; flags?: string } = {}): { matched: boolean; match: RegExpMatchArray | null } {
  const source = String(text || '');
  if (!source) return { matched: false, match: null };
  if (pattern instanceof RegExp || options.kind === 'regex') {
    const patternFlags = pattern instanceof RegExp ? pattern.flags : options.flags || 'i';
    const re = compilePatternRegex(pattern, patternFlags);
    const match = source.match(re);
    return { matched: Boolean(match), match };
  }
  return { matched: source.toLowerCase().includes(String(pattern).toLowerCase()), match: null };
}

/**
 * 构造宽文本匹配的 token set。
 *
 * @param text - 小写 source 文本。
 * @returns token set。
 */
function buildSourceTokenSet(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const rawToken of text
      .split(/[^a-z0-9@._/-]+/i)
      .map((item) => item.trim())
      .filter(Boolean)) {
    const token = rawToken.replace(/^[._/@:-]+|[._/@:-]+$/g, '');
    if (!token) continue;
    tokens.add(token);
    const host = token.split('/')[0] || token;
    for (const part of token.split(/[._/-]+/)) {
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
    const domainParts = host.split('.');
    if (domainParts.length > 2) {
      for (let index = 1; index < domainParts.length - 1; index += 1) {
        const suffix = domainParts.slice(index).join('.');
        if (suffix.length >= 4) tokens.add(suffix);
      }
    }
  }
  return tokens;
}

/**
 * 读取本轮检测内可复用的 source token set。
 *
 * @param context - 单次检测上下文。
 * @param source - 证据来源。
 * @param text - 小写 source 文本。
 * @returns token set。
 */
function getSourceTokenSet(context: TechnologyRuleMatchContext | undefined, source: TechnologyEvidenceSource, text: string): Set<string> {
  if (!context) return buildSourceTokenSet(text);
  const key = `${source}:${text.length}:${hashString(text)}`;
  const cached = context.sourceTokenSets.get(key);
  if (cached) return cached;
  const tokens = buildSourceTokenSet(text);
  context.sourceTokenSets.set(key, tokens);
  return tokens;
}

/**
 * 合并数组型 source 文本，并在本轮检测内复用。
 *
 * @param context - 单次检测上下文。
 * @param texts - 原始 source 数组。
 * @returns 合并文本。
 */
function getCombinedText(context: TechnologyRuleMatchContext | undefined, texts: readonly string[]): string {
  if (!context) return texts.join('\n');
  const cached = context.combinedTexts.get(texts);
  if (cached !== undefined) return cached;
  const text = texts.join('\n');
  context.combinedTexts.set(texts, text);
  return text;
}

/**
 * 读取合并文本的小写形式。
 *
 * @param context - 单次检测上下文。
 * @param texts - 原始 source 数组。
 * @param combinedText - 已合并文本。
 * @returns 小写文本。
 */
function getCombinedLowerText(
  context: TechnologyRuleMatchContext | undefined,
  texts: readonly string[],
  combinedText: string,
): string {
  if (!context) return combinedText.toLowerCase();
  const cached = context.combinedLowerTexts.get(texts);
  if (cached !== undefined) return cached;
  const lower = combinedText.toLowerCase();
  context.combinedLowerTexts.set(texts, lower);
  return lower;
}

/**
 * 读取合并数组型 source 的 token set。
 *
 * @param context - 单次检测上下文。
 * @param texts - 原始 source 数组。
 * @param lowerText - 小写合并文本。
 * @returns token set。
 */
function getCombinedTokenSet(
  context: TechnologyRuleMatchContext | undefined,
  texts: readonly string[],
  lowerText: string,
): Set<string> {
  if (!context) return buildSourceTokenSet(lowerText);
  const cached = context.combinedTokenSets.get(texts);
  if (cached) return cached;
  const tokens = buildSourceTokenSet(lowerText);
  context.combinedTokenSets.set(texts, tokens);
  return tokens;
}

/**
 * 判断字面量 token 是否出现在当前 source。
 *
 * @param token - 规则字面量 token。
 * @param text - 小写 source 文本。
 * @param tokenSet - source token set。
 * @returns 命中时返回 true。
 */
function sourceHasToken(token: string, text: string, tokenSet: Set<string>): boolean {
  if (!token) return false;
  void text;
  return tokenSet.has(token);
}

/**
 * 规范化候选版本值。
 *
 * @param value - 正则捕获到的原始候选。
 * @returns 可展示版本；hash、构建产物名或无数字片段会被丢弃。
 */
function normalizeVersionValue(value: string): string | undefined {
  const cleaned = String(value || '').trim().replace(/^v/i, '');
  if (!cleaned) return undefined;
  if (cleaned.length > 15) return undefined;
  if (/^\d{10,}$/.test(cleaned)) return undefined;
  if (/^[a-f0-9]{8,}$/i.test(cleaned)) return undefined;
  if (/^[0-9a-f]{6,}\.(?:js|css)$/i.test(cleaned)) return undefined;
  if (!/[0-9]/.test(cleaned)) return undefined;
  return cleaned;
}

/**
 * 从命中值里提取版本号。
 *
 * @param text - 被匹配文本。
 * @param versionRule - 版本提取规则。
 * @param match - 主匹配结果。
 * @returns 版本号。
 */
function extractVersion(text: string, versionRule: string | RegExp | undefined, match: RegExpMatchArray | null): string | undefined {
  if (versionRule) {
    if (typeof versionRule === 'string' && /\\\d|\$\d/.test(versionRule)) {
      const templated = versionRule.replace(/\\(\d+)|\$(\d+)/g, (_full, slashIndex: string, dollarIndex: string) => {
        const index = Number(slashIndex || dollarIndex || 0);
        return match?.[index] || '';
      });
      const version = normalizeVersionValue(templated);
      if (version) return version;
    }
    const versionMatch = matchPattern(text, versionRule).match;
    const version = normalizeVersionValue(String(versionMatch?.[1] || ''));
    if (version) return version;
    if (typeof versionRule === 'string' && /^[A-Za-z0-9._-]+$/.test(versionRule)) {
      return normalizeVersionValue(versionRule);
    }
  }
  return normalizeVersionValue(String(match?.[1] || ''));
}

/**
 * 对一组文本运行同一来源规则。
 *
 * @param args - source、key、文本集合与规则。
 * @returns 内部命中。
 */
function matchTextPatterns(args: {
  source: TechnologyEvidenceSource;
  key: string;
  texts: string[];
  patterns?: TechnologyPatternRule[];
  exposeValue?: boolean;
  combineTexts?: boolean;
  versionReliability?: TechnologyVersionReliability;
  context?: TechnologyRuleMatchContext;
}): TechnologyRuleHit | null {
  const patterns = args.patterns ?? [];
  if (patterns.length === 0) return null;

  const evidence: TechnologyEvidence[] = [];
  const versions: TechnologyVersionHit[] = [];
  // URL 列表类来源在大页面里可能有上百条；合并后匹配可以把复杂度从
  // `rules * urls * patterns` 降到 `rules * patterns`，证据仍只暴露短摘要。
  const texts = args.combineTexts ? [getCombinedText(args.context, args.texts)] : args.texts;
  for (const text of texts) {
    const normalizedText = String(text || '');
    if (!normalizedText) continue;
    const shouldPrecheck = BROAD_TEXT_SOURCES.has(args.source) && Boolean(args.combineTexts);
    const lowerText = shouldPrecheck
      ? args.combineTexts
        ? getCombinedLowerText(args.context, args.texts, normalizedText)
        : normalizedText.toLowerCase()
      : '';
    const tokenSet = lowerText
      ? args.combineTexts
        ? getCombinedTokenSet(args.context, args.texts, lowerText)
        : getSourceTokenSet(args.context, args.source, lowerText)
      : null;
    for (const rawRule of patterns) {
      const tokens = tokenSet ? deriveTechnologyPatternQuickTokens(rawRule) : [];
      if (tokens.length > 0 && !tokens.some((token) => sourceHasToken(token, lowerText, tokenSet!))) continue;
      const rule = normalizePatternRule(rawRule);
      const hit = matchPattern(normalizedText, rule.pattern, { kind: rule.kind, flags: rule.flags });
      if (!hit.matched) continue;
      const version = extractVersion(normalizedText, rule.version, hit.match);
      if (version) {
        versions.push({
          value: version,
          reliability: rule.versionReliability ?? args.versionReliability ?? 'unknown',
          source: args.source,
          key: args.key,
        });
      }
      evidence.push({
        source: args.source,
        key: args.key,
        ...(args.exposeValue ? { value: summarizeValue(hit.match?.[0] ?? normalizedText) } : {}),
        confidence: rule.confidence,
      });
      if (evidence.length >= MAX_TECHNOLOGY_EVIDENCE_PER_RESULT) break;
    }
    if (evidence.length >= MAX_TECHNOLOGY_EVIDENCE_PER_RESULT) break;
  }
  return evidence.length > 0 ? { evidence, versions } : null;
}

/**
 * 合并内部命中。
 *
 * @param target - 当前规则命中累积器。
 * @param hit - 本次来源命中。
 */
function appendHit(target: TechnologyRuleHit, hit: TechnologyRuleHit | null): void {
  if (!hit) return;
  target.evidence.push(...hit.evidence);
  target.versions.push(...hit.versions);
}

/**
 * 判断当前命中是否只有 URL 类弱证据。
 *
 * 说明：大量第三方脚本、打包依赖和 CDN 资源会在页面上留下 `script src` 或
 * XHR URL 痕迹；这只能证明页面加载过某个公开资源，不能单独证明它就是页面
 * 用户可感知的技术栈。规则库规模扩大后，这里把 URL-only 运行时命中降级为
 * 未命中，要求规则至少再命中 inline 初始化、JS window chain、DOM、cookie、
 * header、meta 等独立信号，避免把弱依赖痕迹展示给用户或注入 AI。
 *
 * @param hit - 单条规则累积命中。
 * @returns 只有 URL 类证据时返回 true。
 */
function isUrlOnlyRuntimeHit(hit: TechnologyRuleHit): boolean {
  const sources = new Set(hit.evidence.map((item) => item.source));
  if (sources.size < 1) return false;
  return Array.from(sources).every((source) => source === 'script-src' || source === 'xhr-url');
}

/**
 * 判断当前命中是否满足规则要求的最少独立信号数。
 *
 * @param rule - 当前规则。
 * @param hit - 单条规则累积命中。
 * @returns 满足最少来源约束时返回 true。
 */
function satisfiesMinimumEvidenceSources(rule: TechnologyRule, hit: TechnologyRuleHit): boolean {
  const minimum = Math.max(1, Math.round(rule.minimumEvidenceSources ?? 1));
  if (minimum <= 1) return true;
  const sources = new Set(hit.evidence.map((item) => item.source));
  return sources.size >= minimum;
}

/**
 * 读取 content script 本地完整扫描产生的命中摘要。
 *
 * @param rule - 当前技术规则。
 * @param matches - 页面侧本地扫描命中。
 * @returns 内部命中。
 */
function matchLocalPagePatterns(rule: TechnologyRule, matches: TechnologyPagePatternMatch[] | undefined): TechnologyRuleHit | null {
  const relevant = (matches ?? []).filter((match) => match.ruleSlug === rule.slug);
  if (relevant.length < 1) return null;
  return {
    evidence: relevant.slice(0, MAX_TECHNOLOGY_EVIDENCE_PER_RESULT).map((match) => ({
      source: match.source,
      key: match.key,
      ...(match.value ? { value: summarizeValue(match.value) } : {}),
      confidence: Math.max(1, Math.min(100, Math.round(match.confidence))),
    })),
    versions: relevant
      .filter((match) => match.version)
      .map((match) => ({
        value: match.version!,
        reliability: match.versionReliability ?? rule.versionPolicy.reliability,
        source: match.source,
        key: match.key,
      })),
  };
}

/**
 * 对单条技术规则执行正式匹配。
 *
 * @param rule - 技术规则。
 * @param signals - 页面和网络公开信号。
 * @returns 命中或 null。
 */
export function matchTechnologyRule(
  rule: TechnologyRule,
  signals: TechnologyDetectionSignals,
  context?: TechnologyRuleMatchContext,
): TechnologyRuleHit | null {
  const hit: TechnologyRuleHit = { evidence: [], versions: [] };
  const page = signals.page;
  const network = signals.network;
  const localPageHit = matchLocalPagePatterns(rule, page.localPatternMatches);
  appendHit(hit, localPageHit);
  const localPageSources = new Set(localPageHit?.evidence.map((evidence) => evidence.source) ?? []);

  appendHit(hit, matchTextPatterns({
    source: 'url',
    key: 'page-url',
    texts: [page.url],
    patterns: rule.url,
    exposeValue: true,
    versionReliability: rule.versionPolicy.reliability,
    context,
  }));

  for (const [headerName, patterns] of Object.entries(rule.headers ?? {})) {
    const headerValue = network.headers[headerName.toLowerCase()] || '';
    appendHit(hit, matchTextPatterns({
      source: 'headers',
      key: headerName.toLowerCase(),
      texts: [headerValue],
      patterns,
      exposeValue: true,
      versionReliability: rule.versionPolicy.reliability,
      context,
    }));
  }

  appendHit(hit, matchTextPatterns({
    source: 'cookies',
    key: 'cookie-name',
    texts: network.cookieNames,
    patterns: rule.cookies,
    exposeValue: true,
    versionReliability: rule.versionPolicy.reliability,
    context,
  }));

  appendHit(hit, matchTextPatterns({
    source: 'cookies',
    key: 'cookie-pattern-hit',
    texts: (network.cookieValues ?? []).map((cookie) => `${cookie.name}=${cookie.value}`),
    patterns: rule.cookieValues,
    exposeValue: false,
    versionReliability: rule.versionPolicy.reliability,
    context,
  }));

  for (const [metaName, patterns] of Object.entries(rule.meta ?? {})) {
    const metaValue = page.meta[metaName.toLowerCase()] || '';
    appendHit(hit, matchTextPatterns({
      source: 'meta',
      key: metaName.toLowerCase(),
      texts: [metaValue],
      patterns,
      exposeValue: true,
      versionReliability: rule.versionPolicy.reliability,
      context,
    }));
  }

  if (!localPageSources.has('html')) {
    appendHit(hit, matchTextPatterns({ source: 'html', key: 'html', texts: [page.html], patterns: rule.html, versionReliability: rule.versionPolicy.reliability, context }));
  }
  if (!localPageSources.has('text')) {
    appendHit(hit, matchTextPatterns({ source: 'text', key: 'text', texts: [page.text], patterns: rule.text, versionReliability: rule.versionPolicy.reliability, context }));
  }
  if (!localPageSources.has('css')) {
    appendHit(hit, matchTextPatterns({ source: 'css', key: 'css', texts: [...page.cssText, ...page.stylesheetHrefs], patterns: rule.css, versionReliability: rule.versionPolicy.reliability, context }));
  }
  appendHit(hit, matchTextPatterns({ source: 'script-src', key: 'script-src', texts: page.scriptSrc, patterns: rule.scriptSrc, exposeValue: true, combineTexts: true, versionReliability: rule.versionPolicy.reliability, context }));
  if (!localPageSources.has('inline-script')) {
    appendHit(hit, matchTextPatterns({ source: 'inline-script', key: 'inline-script', texts: page.inlineScript, patterns: rule.inlineScript, versionReliability: rule.versionPolicy.reliability, context }));
  }
  appendHit(hit, matchTextPatterns({ source: 'xhr-url', key: 'request-url', texts: network.requestUrls, patterns: rule.xhrUrl, exposeValue: true, combineTexts: true, versionReliability: rule.versionPolicy.reliability, context }));
  appendHit(hit, matchTextPatterns({ source: 'language', key: 'language', texts: [page.language], patterns: rule.language, exposeValue: true, versionReliability: rule.versionPolicy.reliability, context }));

  for (const [selector, patterns] of Object.entries(rule.dom ?? {})) {
    const value = page.dom[selector];
    if (value === undefined) continue;
    if (patterns === true) {
      hit.evidence.push({ source: 'dom', key: selector, confidence: DEFAULT_TECHNOLOGY_CONFIDENCE });
      continue;
    }
    appendHit(hit, matchTextPatterns({
      source: 'dom',
      key: selector,
      texts: [String(value)],
      patterns,
      exposeValue: true,
      versionReliability: rule.versionPolicy.reliability,
      context,
    }));
  }

  for (const [chain, patterns] of Object.entries(rule.js ?? {})) {
    const value = page.js[chain];
    if (value === undefined) continue;
    if (patterns === true) {
      hit.evidence.push({ source: 'js', key: chain, confidence: DEFAULT_TECHNOLOGY_CONFIDENCE });
      continue;
    }
    appendHit(hit, matchTextPatterns({
      source: 'js',
      key: chain,
      texts: [String(value)],
      patterns,
      exposeValue: true,
      versionReliability: rule.versionPolicy.reliability,
      context,
    }));
  }

  if (hit.evidence.length < 1) return null;
  if (rule.minimumEvidenceSources && isUrlOnlyRuntimeHit(hit)) return null;
  if (!satisfiesMinimumEvidenceSources(rule, hit)) return null;
  hit.evidence = hit.evidence.slice(0, MAX_TECHNOLOGY_EVIDENCE_PER_RESULT);
  return hit;
}
