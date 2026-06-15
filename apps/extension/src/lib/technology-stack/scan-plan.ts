/**
 * 说明：technology-stack 页面扫描计划。
 *
 * 职责：
 * - 从调用方已加载的本地指纹规则包生成 content script 需要的 DOM selector / JS chain allowlist；
 * - 让页面侧采集随规则包扩容自动覆盖新信号，避免硬编码少量 selector；
 * - 只暴露选择器、window chain 和页面侧可执行的安全扫描规则。
 * - full 计划下发当前规则包全部可支持页面 pattern，quick-token 仅用于排序加速。
 */
import { deriveTechnologyRuleQuickTokens } from './rule-quick-tokens';
import type {
  TechnologyPagePatternScanRule,
  TechnologyPageQuickScanRule,
  TechnologyPageScanPlan,
  TechnologyPatternRule,
  TechnologyRule,
  TechnologyRulePackageSummary,
} from './types';

/** 页面扫描计划版本前缀。 */
export const TECHNOLOGY_PAGE_SCAN_PLAN_VERSION_PREFIX = 'technology-stack-fingerprint';

/** content script 本地完整扫描的来源集合。 */
const PAGE_PATTERN_SOURCES = ['html', 'text', 'css', 'inlineScript'] as const;

/** 将 camelCase 规则字段映射为证据来源。 */
const PAGE_PATTERN_SOURCE_TO_EVIDENCE = {
  html: 'html',
  text: 'text',
  css: 'css',
  inlineScript: 'inline-script',
} as const;

/** 页面侧 quick-token 扫描的来源集合。 */
const PAGE_QUICK_SOURCE_TO_EVIDENCE = {
  html: 'html',
  text: 'text',
  css: 'css',
  inlineScript: 'inline-script',
} as const;

/** 构建页面扫描计划的选项。 */
export interface BuildTechnologyPageScanPlanOptions {
  /** 已加载的 active 技术规则。 */
  rules: readonly TechnologyRule[];
  /** 规则包摘要，用于生成稳定扫描计划版本。 */
  summary: TechnologyRulePackageSummary;
}

/**
 * 把规则库里的 pattern 转成可跨 runtime 消息传递的本地扫描规则。
 *
 * @param args - 所属技术、来源、键名和原始 pattern。
 * @returns 序列化后的扫描规则。
 */
function serializePagePatternRule(args: {
  ruleSlug: string;
  source: TechnologyPagePatternScanRule['source'];
  key: string;
  pattern: TechnologyPatternRule;
  fallbackReliability: TechnologyPagePatternScanRule['versionReliability'];
}): TechnologyPagePatternScanRule {
  const raw = args.pattern;
  const base = {
    ruleSlug: args.ruleSlug,
    source: args.source,
    key: args.key,
    confidence: 35,
  };
  if (typeof raw === 'string') {
    return {
      ...base,
      kind: 'text',
      pattern: raw,
      versionReliability: args.fallbackReliability,
    };
  }
  if (raw instanceof RegExp) {
    return {
      ...base,
      kind: 'regex',
      pattern: raw.source,
      flags: raw.flags.replace(/g/g, ''),
      versionReliability: args.fallbackReliability,
    };
  }
  const pattern = raw.pattern;
  const version = raw.version;
  const isRegex = raw.kind === 'regex' || pattern instanceof RegExp;
  return {
    ...base,
    confidence: Math.max(1, Math.min(100, Math.round(raw.confidence ?? 35))),
    kind: isRegex ? 'regex' : 'text',
    pattern: pattern instanceof RegExp ? pattern.source : String(pattern),
    ...(isRegex ? { flags: (pattern instanceof RegExp ? pattern.flags : raw.flags || 'i').replace(/g/g, '') } : {}),
    ...(version instanceof RegExp ? { versionPattern: version.source, versionFlags: version.flags.replace(/g/g, '') } : {}),
    ...(typeof version === 'string' && /\\\d|\$\d/.test(version) ? { versionTemplate: version } : {}),
    ...(typeof version === 'string' && !/\\\d|\$\d/.test(version) ? { versionPattern: version } : {}),
    versionReliability: raw.versionReliability ?? args.fallbackReliability,
  };
}

/**
 * 构建技术栈页面扫描计划。
 *
 * @returns content script 页面扫描计划。
 */
export function buildTechnologyPageScanPlan(options: BuildTechnologyPageScanPlanOptions): TechnologyPageScanPlan {
  const domSelectors = new Set<string>();
  const jsChains = new Set<string>();
  const quickPatternKeys = new Set<string>();
  const quickPatterns: TechnologyPageQuickScanRule[] = [];
  const pagePatterns: TechnologyPagePatternScanRule[] = [];

  for (const rule of options.rules) {
    for (const selector of Object.keys(rule.dom ?? {})) {
      domSelectors.add(selector);
    }
    for (const chain of Object.keys(rule.js ?? {})) {
      jsChains.add(chain);
    }
    for (const source of Object.values(PAGE_QUICK_SOURCE_TO_EVIDENCE)) {
      for (const token of deriveTechnologyRuleQuickTokens(rule, source)) {
        const key = `${rule.slug}::${source}::${token}`;
        if (quickPatternKeys.has(key)) continue;
        quickPatternKeys.add(key);
        quickPatterns.push({ ruleSlug: rule.slug, source, token });
      }
    }
    for (const field of PAGE_PATTERN_SOURCES) {
      const patterns = rule[field] ?? [];
      for (const pattern of patterns) {
        pagePatterns.push(serializePagePatternRule({
          ruleSlug: rule.slug,
          source: PAGE_PATTERN_SOURCE_TO_EVIDENCE[field],
          key: PAGE_PATTERN_SOURCE_TO_EVIDENCE[field],
          pattern,
          fallbackReliability: rule.versionPolicy.reliability,
        }));
      }
    }
  }

  return {
    mode: 'full',
    version: `${TECHNOLOGY_PAGE_SCAN_PLAN_VERSION_PREFIX}-${options.summary.snapshotVersion}-${options.rules.length}`,
    domSelectors: Array.from(domSelectors),
    jsChains: Array.from(jsChains),
    quickPatterns,
    pagePatterns,
  };
}
