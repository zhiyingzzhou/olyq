/**
 * 说明：technology-stack 页面侧重信号本地匹配器。
 *
 * 职责：
 * - 在 content script 内扫描 HTML、可见文本、CSSOM 和 inline script；
 * - quick-token 只回传候选技术 slug，完整 pattern 只回传安全命中摘要；
 * - 避免原始大段页面内容离开页面侧运行时。
 */
import type {
  TechnologyPagePatternMatch,
  TechnologyPagePatternScanRule,
  TechnologyPageQuickScanRule,
  TechnologyPageScanPlan,
} from '@/lib/technology-stack/types';

/** 页面侧重信号原文集合；只在 content script 内消费。 */
interface TechnologyLocalPatternSources {
  /** 预算内 HTML 原文。 */
  html: string;
  /** 预算内可见文本。 */
  text: string;
  /** 预算内 CSS / stylesheet URL 文本。 */
  cssTexts: string[];
  /** 预算内 inline script 文本。 */
  inlineScripts: string[];
}

/** 页面侧批处理让步函数。 */
type YieldToMain = () => Promise<void>;

/** 默认让步函数，测试或调用方未传入时使用。 */
async function defaultYieldToMain(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

/**
 * 规范化本地扫描候选版本。
 *
 * @param value - 原始候选。
 * @returns 可展示版本；hash、构建产物名或无数字片段会被丢弃。
 */
function normalizeLocalVersion(value: string): string | undefined {
  const cleaned = String(value || '').trim().replace(/^v/i, '');
  if (!cleaned) return undefined;
  if (cleaned.length > 15) return undefined;
  if (/^\d{10,}$/.test(cleaned)) return undefined;
  if (/^[a-f0-9]{8,}$/i.test(cleaned)) return undefined;
  if (/^[0-9a-f]{6,}\.(?:js|css)$/i.test(cleaned)) return undefined;
  if (!/[0-9]/.test(cleaned)) return undefined;
  return cleaned;
}

/** 把捕获组模板应用到正则命中结果。 */
function applyVersionTemplate(template: string | undefined, match: RegExpMatchArray | null): string | undefined {
  if (!template || !match) return undefined;
  const value = template.replace(/\\(\d+)|\$(\d+)/g, (_full, slashIndex: string, dollarIndex: string) => {
    const index = Number(slashIndex || dollarIndex || 0);
    return match[index] || '';
  });
  return normalizeLocalVersion(value);
}

/** 构造 quick-token 扫描用 token set。 */
function buildQuickTokenSet(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const token of text
      .toLowerCase()
      .split(/[^a-z0-9@._/-]+/i)
      .map((item) => item.trim())
      .filter(Boolean)) {
    tokens.add(token);
    for (const part of token.split(/[._/-]+/)) {
      if (part.length >= 3) tokens.add(part);
    }
    const domainParts = token.split('.');
    if (domainParts.length > 2) {
      for (let index = 1; index < domainParts.length - 1; index += 1) {
        const suffix = domainParts.slice(index).join('.');
        if (suffix.length >= 4) tokens.add(suffix);
      }
    }
  }
  return tokens;
}

/** 在 token set 与必要的原文 includes 之间选择低成本匹配方式。 */
function matchesQuickToken(token: string, text: string, tokenSet: Set<string>): boolean {
  if (!token) return false;
  if (/[\s/:?#&=]/.test(token)) return text.includes(token);
  return tokenSet.has(token);
}

/** 按来源读取页面侧原文。 */
function getQuickSourceText(source: TechnologyPageQuickScanRule['source'], sources: TechnologyLocalPatternSources): string {
  if (source === 'html') return sources.html;
  if (source === 'text') return sources.text;
  if (source === 'css') return sources.cssTexts.join('\n');
  return sources.inlineScripts.join('\n');
}

/**
 * 在 content script 内对页面重信号做 quick-token 候选扫描。
 *
 * @param scanPlan - 后台生成的 full 扫描计划。
 * @param sources - 页面侧原文集合。
 * @param yieldToMain - 批处理让步函数。
 * @returns 候选 slug 集合。
 */
export async function collectLocalCandidateSlugs(
  scanPlan: TechnologyPageScanPlan,
  sources: TechnologyLocalPatternSources,
  yieldToMain: YieldToMain = defaultYieldToMain,
): Promise<string[]> {
  const candidateSlugs = new Set<string>();
  const textCache = new Map<TechnologyPageQuickScanRule['source'], string>();
  const tokenCache = new Map<TechnologyPageQuickScanRule['source'], Set<string>>();

  /** 懒读取某个重信号来源的小写原文。 */
  const readText = (source: TechnologyPageQuickScanRule['source']): string => {
    const cached = textCache.get(source);
    if (cached !== undefined) return cached;
    const text = getQuickSourceText(source, sources).toLowerCase();
    textCache.set(source, text);
    return text;
  };
  /** 懒构造某个重信号来源的 token set。 */
  const readTokens = (source: TechnologyPageQuickScanRule['source']): Set<string> => {
    const cached = tokenCache.get(source);
    if (cached) return cached;
    const tokens = buildQuickTokenSet(readText(source));
    tokenCache.set(source, tokens);
    return tokens;
  };

  for (let index = 0; index < scanPlan.quickPatterns.length; index += 1) {
    const rule = scanPlan.quickPatterns[index]!;
    if (index > 0 && index % 512 === 0) await yieldToMain();
    if (!matchesQuickToken(rule.token, readText(rule.source), readTokens(rule.source))) continue;
    candidateSlugs.add(rule.ruleSlug);
  }

  return Array.from(candidateSlugs);
}

/** 编译 content script 本地页面扫描规则。 */
function compileLocalPattern(rule: TechnologyPagePatternScanRule): {
  test(text: string): RegExpMatchArray | null;
  extractVersion(text: string, match: RegExpMatchArray | null): string | undefined;
} | null {
  try {
    if (rule.kind === 'text') {
      const needle = rule.pattern.toLowerCase();
      if (!needle) return null;
      return {
        test: (text) => (text.toLowerCase().includes(needle) ? ([] as unknown as RegExpMatchArray) : null),
        extractVersion: (text) => {
          const templated = applyVersionTemplate(rule.versionTemplate, null);
          if (templated) return templated;
          if (!rule.versionPattern) return undefined;
          const versionRe = new RegExp(rule.versionPattern, rule.versionFlags?.replace(/g/g, '') || 'i');
          return normalizeLocalVersion(versionRe.exec(text)?.[1] || '')
            || (/^[A-Za-z0-9._-]+$/.test(rule.versionPattern) ? normalizeLocalVersion(rule.versionPattern) : undefined);
        },
      };
    }
    const flags = rule.flags?.replace(/g/g, '') || 'i';
    const re = new RegExp(rule.pattern, flags);
    const versionRe = rule.versionPattern
      ? new RegExp(rule.versionPattern, rule.versionFlags?.replace(/g/g, '') || flags)
      : null;
    return {
      test: (text) => re.exec(text),
      extractVersion: (text, match) => applyVersionTemplate(rule.versionTemplate, match)
        || normalizeLocalVersion((versionRe ? versionRe.exec(text)?.[1] : match?.[1]) || '')
        || (rule.versionPattern && /^[A-Za-z0-9._-]+$/.test(rule.versionPattern) ? normalizeLocalVersion(rule.versionPattern) : undefined),
    };
  } catch {
    return null;
  }
}

/** 按本地规则来源读取待匹配文本。 */
function getPatternTexts(source: TechnologyPagePatternScanRule['source'], sources: TechnologyLocalPatternSources): string[] {
  if (source === 'html') return [sources.html];
  if (source === 'text') return [sources.text];
  if (source === 'css') return sources.cssTexts;
  return sources.inlineScripts;
}

/**
 * 在 content script 内对完整页面文本执行本地规则扫描。
 *
 * @param scanPlan - 后台按规则包生成的 full 扫描计划。
 * @param sources - 完整页面信号文本。
 * @param yieldToMain - 批处理让步函数。
 * @returns 命中摘要。
 */
export async function collectLocalPatternMatches(
  scanPlan: TechnologyPageScanPlan,
  sources: TechnologyLocalPatternSources,
  yieldToMain: YieldToMain = defaultYieldToMain,
): Promise<TechnologyPagePatternMatch[]> {
  const matches: TechnologyPagePatternMatch[] = [];

  for (let index = 0; index < scanPlan.pagePatterns.length; index += 1) {
    const rule = scanPlan.pagePatterns[index]!;
    if (index > 0 && index % 96 === 0) await yieldToMain();
    const matcher = compileLocalPattern(rule);
    if (!matcher) continue;
    for (const text of getPatternTexts(rule.source, sources)) {
      if (!text) continue;
      const match = matcher.test(text);
      if (!match) continue;
      const version = matcher.extractVersion(text, match);
      matches.push({
        ruleSlug: rule.ruleSlug,
        source: rule.source,
        key: rule.key,
        confidence: rule.confidence,
        ...(version ? { version, versionReliability: rule.versionReliability } : {}),
      });
      break;
    }
  }

  return matches;
}
