/**
 * 说明：技术栈规则 schema 与商用合规 guard。
 *
 * 职责：
 * - 验证主规则包的来源、许可状态、核验日期与基础字段完整性；
 * - 对正则做保守安全检查，避免把高风险灾难性回溯模式带入页面热路径；
 * - 只处理 Olyq 本地指纹规则，不读取远程规则库，也不执行第三方代码。
 */
import type {
  TechnologyEvidenceSource,
  TechnologyPatternRule,
  TechnologyRule,
  TechnologyRuleLicenseStatus,
  TechnologyRuleStatus,
  TechnologyVersionReliability,
} from './types';

/** 允许进入主规则包的许可/来源状态。 */
export const TECHNOLOGY_RULE_LICENSE_STATUSES = [
  'vendor-public-doc',
  'public-web-observation',
  'oss-compatible',
] as const satisfies readonly TechnologyRuleLicenseStatus[];

const LICENSE_STATUS_SET = new Set<string>(TECHNOLOGY_RULE_LICENSE_STATUSES);
const RULE_STATUS_SET = new Set<string>(['candidate', 'active', 'deprecated', 'blocked'] satisfies TechnologyRuleStatus[]);
const VERSION_RELIABILITY_SET = new Set<string>(['exact', 'probable', 'unknown'] satisfies TechnologyVersionReliability[]);
const EVIDENCE_SOURCE_SET = new Set<string>([
  'headers',
  'url',
  'cookies',
  'meta',
  'html',
  'text',
  'css',
  'script-src',
  'inline-script',
  'dom',
  'js',
  'xhr-url',
  'language',
] satisfies TechnologyEvidenceSource[]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 判断正则源码是否包含高风险嵌套量词。
 *
 * @param source - RegExp.source 或字符串正则源码。
 * @returns 是否高风险。
 */
export function isUnsafeTechnologyRegexSource(source: string): boolean {
  const normalized = String(source || '');
  if (!normalized) return false;

  // 这组启发式故意保守：规则库规模扩大后，宁可要求重写规则，也不让热路径承受回溯炸弹。
  return /\((?:[^()\\]|\\.){0,120}(?:\.\*|\.\+|\[[^\]]+\][*+]|\S[*+])(?:[^()\\]|\\.){0,120}\)[*+{]/.test(normalized)
    || /\.\*[*+{]/.test(normalized)
    || /\.\+[*+{]/.test(normalized)
    || /\([^)]*\|[^)]*\)[*+{][^?]/.test(normalized);
}

/**
 * 提取 TechnologyPatternRule 里的正则源码，供 schema guard 扫描。
 *
 * @param pattern - 技术规则 pattern。
 * @returns 所有正则源码。
 */
function collectPatternRegexSources(pattern: TechnologyPatternRule): string[] {
  const sources: string[] = [];
  if (pattern instanceof RegExp) sources.push(pattern.source);
  else if (typeof pattern === 'object') {
    if (pattern.pattern instanceof RegExp) sources.push(pattern.pattern.source);
    else if (pattern.kind === 'regex') sources.push(pattern.pattern);
    if (pattern.version instanceof RegExp) sources.push(pattern.version.source);
    else if (typeof pattern.version === 'string' && !/\\\d|\$\d/.test(pattern.version)) sources.push(pattern.version);
  }
  return sources;
}

/** 遍历数组型规则里的正则源码。 */
function collectPatternArrayRegexSources(patterns: TechnologyPatternRule[] | undefined): string[] {
  return (patterns ?? []).flatMap((pattern) => collectPatternRegexSources(pattern));
}

/** 遍历 Record 型规则里的正则源码。 */
function collectPatternRecordRegexSources(record: Record<string, TechnologyPatternRule[]> | undefined): string[] {
  return Object.values(record ?? {}).flatMap((patterns) => collectPatternArrayRegexSources(patterns));
}

/**
 * 收集单条技术规则中的所有正则源码。
 *
 * @param rule - 技术规则。
 * @returns 正则源码列表。
 */
export function collectTechnologyRuleRegexSources(rule: TechnologyRule): string[] {
  const sources = [
    ...collectPatternRecordRegexSources(rule.headers),
    ...collectPatternArrayRegexSources(rule.url),
    ...collectPatternArrayRegexSources(rule.cookies),
    ...collectPatternArrayRegexSources(rule.cookieValues),
    ...collectPatternRecordRegexSources(rule.meta),
    ...collectPatternArrayRegexSources(rule.html),
    ...collectPatternArrayRegexSources(rule.text),
    ...collectPatternArrayRegexSources(rule.css),
    ...collectPatternArrayRegexSources(rule.scriptSrc),
    ...collectPatternArrayRegexSources(rule.inlineScript),
    ...collectPatternArrayRegexSources(rule.xhrUrl),
    ...collectPatternArrayRegexSources(rule.language),
  ];
  for (const value of Object.values(rule.dom ?? {})) {
    if (value !== true) sources.push(...collectPatternArrayRegexSources(value));
  }
  for (const value of Object.values(rule.js ?? {})) {
    if (value !== true) sources.push(...collectPatternArrayRegexSources(value));
  }
  return sources;
}

/**
 * 推导规则实际使用到的信号来源。
 *
 * @param rule - 技术规则。
 * @returns 来源集合。
 */
export function collectTechnologyRuleEvidenceSources(rule: TechnologyRule): TechnologyEvidenceSource[] {
  const sources = new Set<TechnologyEvidenceSource>();
  if (Object.keys(rule.headers ?? {}).length) sources.add('headers');
  if (rule.url?.length) sources.add('url');
  if (rule.cookies?.length || rule.cookieValues?.length) sources.add('cookies');
  if (Object.keys(rule.meta ?? {}).length) sources.add('meta');
  if (rule.html?.length) sources.add('html');
  if (rule.text?.length) sources.add('text');
  if (rule.css?.length) sources.add('css');
  if (rule.scriptSrc?.length) sources.add('script-src');
  if (rule.inlineScript?.length) sources.add('inline-script');
  if (Object.keys(rule.dom ?? {}).length) sources.add('dom');
  if (Object.keys(rule.js ?? {}).length) sources.add('js');
  if (rule.xhrUrl?.length) sources.add('xhr-url');
  if (rule.language?.length) sources.add('language');
  return Array.from(sources);
}

/**
 * 验证技术栈主规则包。
 *
 * @param rules - 技术规则列表。
 * @returns 校验错误列表；空数组表示通过。
 */
export function validateTechnologyRules(rules: readonly TechnologyRule[]): string[] {
  const errors: string[] = [];
  const slugs = new Set<string>();

  for (const rule of rules) {
    const slug = String(rule.slug || '').trim();
    if (!slug) errors.push(`${rule.name || '(unknown)'}: slug is required`);
    else if (slugs.has(slug)) errors.push(`${slug}: duplicate slug`);
    else slugs.add(slug);

    if (!String(rule.name || '').trim()) errors.push(`${slug || '(unknown)'}: name is required`);
    if (!Array.isArray(rule.categories) || rule.categories.length === 0) errors.push(`${slug}: categories are required`);
    if (rule.categoryInfos) {
      for (const category of rule.categoryInfos) {
        if (!Number.isFinite(category.id)) errors.push(`${slug}: categoryInfo.id is invalid`);
        if (!String(category.name || '').trim()) errors.push(`${slug}: categoryInfo.name is required`);
        if (!String(category.slug || '').trim()) errors.push(`${slug}: categoryInfo.slug is required`);
        if (!Number.isFinite(category.priority)) errors.push(`${slug}: categoryInfo.priority is invalid`);
      }
    }

    if (!Array.isArray(rule.sourceUrls) || rule.sourceUrls.length === 0) {
      errors.push(`${slug}: sourceUrls are required`);
    } else {
      for (const url of rule.sourceUrls) {
        if (!/^https?:\/\//i.test(String(url || '').trim())) errors.push(`${slug}: sourceUrl must be http(s): ${url}`);
      }
    }

    if (!LICENSE_STATUS_SET.has(String(rule.licenseStatus || ''))) {
      errors.push(`${slug}: licenseStatus is invalid`);
    }
    if (!RULE_STATUS_SET.has(String(rule.status || ''))) {
      errors.push(`${slug}: status is invalid`);
    }
    if (!ISO_DATE_RE.test(String(rule.lastVerifiedAt || ''))) {
      errors.push(`${slug}: lastVerifiedAt must use YYYY-MM-DD`);
    }
    if (!Array.isArray(rule.verifiedSignals) || rule.verifiedSignals.length === 0) {
      errors.push(`${slug}: verifiedSignals are required`);
    } else {
      const actualSources = collectTechnologyRuleEvidenceSources(rule);
      for (const source of rule.verifiedSignals) {
        if (!EVIDENCE_SOURCE_SET.has(source)) errors.push(`${slug}: verifiedSignal is invalid: ${source}`);
      }
      if (rule.status === 'active' && !rule.verifiedSignals.some((source) => actualSources.includes(source))) {
        errors.push(`${slug}: verifiedSignals must include at least one source used by the rule`);
      }
    }
    if (!rule.versionPolicy || !VERSION_RELIABILITY_SET.has(String(rule.versionPolicy.reliability || ''))) {
      errors.push(`${slug}: versionPolicy.reliability is required`);
    } else {
      for (const source of rule.versionPolicy.sources ?? []) {
        if (!EVIDENCE_SOURCE_SET.has(source)) errors.push(`${slug}: versionPolicy source is invalid: ${source}`);
      }
    }
    if (!rule.rankMeta?.source || !rule.rankMeta.batch || !/^https?:\/\//i.test(String(rule.rankMeta.evidenceUrl || ''))) {
      errors.push(`${slug}: rankMeta is required`);
    }

    for (const source of collectTechnologyRuleRegexSources(rule)) {
      if (isUnsafeTechnologyRegexSource(source)) errors.push(`${slug}: unsafe regex source ${source}`);
    }
  }

  return errors;
}
