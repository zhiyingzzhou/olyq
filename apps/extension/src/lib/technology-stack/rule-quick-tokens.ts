/**
 * 说明：技术指纹规则 quick-token 派生器。
 *
 * 职责：
 * - 从规则 pattern 中提取低成本候选 token，服务 full scan 的排序和不可能命中加速；
 * - 复用规则自带 quickMatch，并为本地快照规则补足中性 token；
 * - 保持 token 派生只基于 Olyq 自有规则结构，不暴露第三方快照格式。
 *
 * 边界：
 * - 显式 quickMatch 只用于排序，不作为丢弃规则的硬门槛；
 * - 不把页面原文、cookie value 或脚本文本保存到规则对象；
 * - 派生失败时返回空数组，由调用方决定是否跳过页面重信号规则。
 */
import type {
  TechnologyEvidenceSource,
  TechnologyPatternRule,
  TechnologyRule,
} from './types';

const MAX_TOKENS_PER_SOURCE = 4;
const MIN_TOKEN_LENGTH = 3;
const PREWARM_TOKEN_SOURCES: TechnologyEvidenceSource[] = [
  'url',
  'cookies',
  'html',
  'text',
  'css',
  'script-src',
  'inline-script',
  'xhr-url',
];
const COMMON_TOKENS = new Set([
  'api',
  'app',
  'asset',
  'assets',
  'body',
  'cart',
  'cdn',
  'checkout',
  'client',
  'cloud',
  'com',
  'content',
  'core',
  'css',
  'data',
  'dist',
  'div',
  'example',
  'file',
  'files',
  'head',
  'html',
  'http',
  'https',
  'img',
  'images',
  'js',
  'main',
  'min',
  'net',
  'org',
  'page',
  'pages',
  'plugin',
  'plugins',
  'script',
  'scripts',
  'section',
  'server',
  'session',
  'shop',
  'site',
  'src',
  'static',
  'store',
  'style',
  'styles',
  'test',
  'theme',
  'widget',
  'www',
]);
const ruleQuickTokenCache = new WeakMap<TechnologyRule, Map<TechnologyEvidenceSource, string[]>>();
const rulePatternLiteralTokenCache = new WeakMap<TechnologyRule, Map<TechnologyEvidenceSource, string[]>>();
const patternQuickTokenCache = new Map<string, string[]>();

/**
 * 判断 token 是否适合作为候选预筛。
 *
 * @param token - 待检查 token。
 * @returns 可用于 quick scan 时返回 true。
 */
function isUsefulToken(token: string): boolean {
  const normalized = token.replace(/^[._/@:-]+|[._/@:-]+$/g, '').toLowerCase();
  return normalized.length >= MIN_TOKEN_LENGTH
    && /[a-z]/i.test(normalized)
    && !COMMON_TOKENS.has(normalized);
}

/**
 * 规整候选 token。
 *
 * @param token - 原始 token。
 * @returns 小写 token，若无效则返回空字符串。
 */
function normalizeToken(token: string): string {
  const normalized = token
    .replace(/\\([./:_@-])/g, '$1')
    .replace(/\\([a-z0-9])/gi, '$1')
    .replace(/^[._/@:-]+|[._/@:-]+$/g, '')
    .toLowerCase();
  return isUsefulToken(normalized) ? normalized : '';
}

/**
 * 从正则源码中提取连续字面量片段。
 *
 * @param source - 正则源码。
 * @returns 字面量片段。
 */
function collectRegexLiteralRuns(source: string): string[] {
  const runs: string[] = [];
  let current = '';
  let inCharacterClass = false;
  /** 刷出当前字面量片段。 */
  const flush = (): void => {
    const token = normalizeToken(current);
    if (token) runs.push(token);
    current = '';
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? '';
    if (char === '\\') {
      const next = source[index + 1] ?? '';
      index += 1;
      if (inCharacterClass) continue;
      if (!next || /[dDsSwWbB]/.test(next)) {
        flush();
      } else if (/[a-z0-9./:_@-]/i.test(next)) {
        current += next;
      } else {
        flush();
      }
      continue;
    }
    if (inCharacterClass) {
      if (char === ']') inCharacterClass = false;
      continue;
    }
    if (char === '[') {
      flush();
      inCharacterClass = true;
      continue;
    }
    if (/[a-z0-9./:_@-]/i.test(char)) {
      current += char;
      continue;
    }
    flush();
  }
  flush();
  return runs;
}

/**
 * 把长 token 拆成可用于 token-set 命中的片段。
 *
 * @param token - 已规整 token。
 * @returns token 本身与高价值片段。
 */
function expandTokenParts(token: string): string[] {
  const parts = new Set<string>();
  const normalized = normalizeToken(token);
  if (!normalized) return [];
  parts.add(normalized);
  for (const part of normalized.split(/[./:_@-]+/)) {
    const item = normalizeToken(part);
    if (item) parts.add(item);
  }
  const domainParts = normalized.split('.');
  if (domainParts.length > 2) {
    for (let index = 1; index < domainParts.length - 1; index += 1) {
      const suffix = normalizeToken(domainParts.slice(index).join('.'));
      if (suffix) parts.add(suffix);
    }
  }
  return Array.from(parts);
}

/**
 * 读取规则里的 pattern 源码。
 *
 * @param rule - 单条 pattern 规则。
 * @returns pattern 文本与语义。
 */
function readPatternSource(rule: TechnologyPatternRule): { source: string; kind: 'text' | 'regex' } | null {
  if (typeof rule === 'string') return { source: rule, kind: 'text' };
  if (rule instanceof RegExp) return { source: rule.source, kind: 'regex' };
  if (rule.pattern instanceof RegExp) return { source: rule.pattern.source, kind: 'regex' };
  return { source: String(rule.pattern || ''), kind: rule.kind === 'regex' ? 'regex' : 'text' };
}

/**
 * 从单条 pattern 中提取候选 token。
 *
 * @param rule - 单条 pattern 规则。
 * @returns 按价值排序后的 token。
 */
export function deriveTechnologyPatternQuickTokens(rule: TechnologyPatternRule): string[] {
  const pattern = readPatternSource(rule);
  if (!pattern?.source) return [];
  const cacheKey = `${pattern.kind}\u0000${pattern.source}`;
  const cached = patternQuickTokenCache.get(cacheKey);
  if (cached) return cached;
  const runs = pattern.kind === 'regex'
    ? collectRegexLiteralRuns(pattern.source)
    : [pattern.source, ...pattern.source.split(/[^a-z0-9./:_@-]+/i)];
  const tokens = new Set<string>();
  for (const run of runs) {
    for (const token of expandTokenParts(run)) tokens.add(token);
  }
  const derived = Array.from(tokens)
    .sort((left, right) => {
      const leftSpecific = /[./:_@-]/.test(left) ? 1 : 0;
      const rightSpecific = /[./:_@-]/.test(right) ? 1 : 0;
      return rightSpecific - leftSpecific || right.length - left.length || left.localeCompare(right);
    })
    .slice(0, MAX_TOKENS_PER_SOURCE);
  patternQuickTokenCache.set(cacheKey, derived);
  return derived;
}

/**
 * 按证据来源读取规则 pattern 数组。
 *
 * @param rule - 技术规则。
 * @param source - 证据来源。
 * @returns 该来源对应的 pattern。
 */
function getPatternsForSource(rule: TechnologyRule, source: TechnologyEvidenceSource): TechnologyPatternRule[] {
  if (source === 'url') return rule.url ?? [];
  if (source === 'cookies') return [...(rule.cookies ?? []), ...(rule.cookieValues ?? [])];
  if (source === 'html') return rule.html ?? [];
  if (source === 'text') return rule.text ?? [];
  if (source === 'css') return rule.css ?? [];
  if (source === 'script-src') return rule.scriptSrc ?? [];
  if (source === 'inline-script') return rule.inlineScript ?? [];
  if (source === 'xhr-url') return rule.xhrUrl ?? [];
  return [];
}

/**
 * 为规则的某个来源派生 quick-token。
 *
 * @param rule - 技术规则。
 * @param source - 证据来源。
 * @returns 可用于候选预筛的小写 token。
 */
export function deriveTechnologyRuleQuickTokens(
  rule: TechnologyRule,
  source: TechnologyEvidenceSource,
): string[] {
  const cachedBySource = ruleQuickTokenCache.get(rule);
  const cached = cachedBySource?.get(source);
  if (cached) return cached;

  const explicit = (rule.quickMatch?.[source] ?? [])
    .map((token) => normalizeToken(token))
    .filter(Boolean);
  if (explicit.length > 0) {
    const tokens = Array.from(new Set(explicit)).slice(0, MAX_TOKENS_PER_SOURCE);
    const bucket = cachedBySource ?? new Map<TechnologyEvidenceSource, string[]>();
    bucket.set(source, tokens);
    if (!cachedBySource) ruleQuickTokenCache.set(rule, bucket);
    return tokens;
  }

  const tokens = new Set<string>();
  for (const pattern of getPatternsForSource(rule, source)) {
    for (const token of deriveTechnologyPatternQuickTokens(pattern)) tokens.add(token);
    if (tokens.size >= MAX_TOKENS_PER_SOURCE) break;
  }
  const derived = Array.from(tokens).slice(0, MAX_TOKENS_PER_SOURCE);
  const bucket = cachedBySource ?? new Map<TechnologyEvidenceSource, string[]>();
  bucket.set(source, derived);
  if (!cachedBySource) ruleQuickTokenCache.set(rule, bucket);
  return derived;
}

/**
 * 为规则的某个来源派生 pattern 自身包含的字面量 token。
 *
 * 说明：这里故意不读取 `quickMatch`，因为 quickMatch 只服务排序；只有 pattern
 * 自身字面量在当前页面来源里完全不存在时，调用方才可以把该来源视为不可能命中。
 *
 * @param rule - 技术规则。
 * @param source - 证据来源。
 * @returns 可用于不可能命中加速的小写字面量 token。
 */
export function deriveTechnologyRulePatternLiteralTokens(
  rule: TechnologyRule,
  source: TechnologyEvidenceSource,
): string[] {
  const cachedBySource = rulePatternLiteralTokenCache.get(rule);
  const cached = cachedBySource?.get(source);
  if (cached) return cached;

  // 没有显式 quickMatch 时，deriveTechnologyRuleQuickTokens 的结果就是 pattern
  // 字面量派生结果。复用它，避免规则包预热时为绝大多数规则重复解析正则源码。
  if ((rule.quickMatch?.[source] ?? []).length < 1) {
    const quickCached = ruleQuickTokenCache.get(rule)?.get(source);
    if (quickCached) {
      const bucket = cachedBySource ?? new Map<TechnologyEvidenceSource, string[]>();
      bucket.set(source, quickCached);
      if (!cachedBySource) rulePatternLiteralTokenCache.set(rule, bucket);
      return quickCached;
    }
  }

  const tokens = new Set<string>();
  for (const pattern of getPatternsForSource(rule, source)) {
    for (const token of deriveTechnologyPatternQuickTokens(pattern)) tokens.add(token);
    if (tokens.size >= MAX_TOKENS_PER_SOURCE) break;
  }
  const derived = Array.from(tokens).slice(0, MAX_TOKENS_PER_SOURCE);
  const bucket = cachedBySource ?? new Map<TechnologyEvidenceSource, string[]>();
  bucket.set(source, derived);
  if (!cachedBySource) rulePatternLiteralTokenCache.set(rule, bucket);
  return derived;
}

/**
 * 预热规则包的 quick-token 缓存。
 *
 * 说明：quick-token 只由规则 pattern 决定，和网页内容无关。把这一步放到规则包
 * 加载阶段，可以让首个真实页面检测不把 token 派生成本压进页面热路径；
 * 冷加载耗时仍由 benchmark 单独记录。
 *
 * @param rules - 当前 active 技术指纹规则。
 */
export function warmTechnologyRuleQuickTokenCache(rules: readonly TechnologyRule[]): void {
  for (const rule of rules) {
    for (const source of PREWARM_TOKEN_SOURCES) {
      deriveTechnologyRuleQuickTokens(rule, source);
      deriveTechnologyRulePatternLiteralTokens(rule, source);
    }
  }
}
