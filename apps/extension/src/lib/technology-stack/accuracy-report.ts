/**
 * 说明：技术栈真实站点准确率报告的纯数据聚合逻辑。
 *
 * 职责：
 * - 校验人工金标样本站点的 schema 与合规来源边界；
 * - 把真实扩展采集结果聚合成 recall、疑似误报、可达率和覆盖趋势；
 * - 渲染 Markdown 报告，供显式网络评测脚本写入 test-results。
 *
 * 边界：
 * - 本模块不访问网络、不启动浏览器、不读取远程规则；
 * - 报告只保存 URL、slug、置信度、分类和扫描状态，不保存原始 HTML、脚本、CSS 或 cookie 值；
 * - 外部技术标签不能作为金标来源，第三方技术目录与 HTTP Archive technologies 数据必须被 guard 拦截。
 */
import type {
  DetectedTechnology,
  TechnologyCategory,
  TechnologyRule,
  TechnologyRulePackageSummary,
  TechnologyScanCoverage,
} from './types';

/** 真实站点评测里的单站点运行状态。 */
export type TechnologyStackAccuracySiteStatus =
  | 'ok'
  | 'unreachable'
  | 'timeout'
  | 'extension-error';

/** 人工维护的真实站点金标样本。 */
export interface TechnologyStackAccuracyGoldCase {
  /** 样本 ID，稳定用于报告和回归定位。 */
  id: string;
  /** 真实公开页面 URL。 */
  url: string;
  /** 站点所属主类别。 */
  category: TechnologyCategory;
  /** 期望命中的技术 slug。 */
  expectedSlugs: string[];
  /** 明确不应命中的技术 slug。 */
  blockedSlugs: string[];
  /** 人工标签来源 URL，只允许厂商公开文档或公开网页事实。 */
  labelSourceUrls: string[];
  /** 人工核验日期。 */
  lastVerifiedAt: string;
  /** 维护备注。 */
  notes?: string;
}

/** 报告里保留的安全技术摘要。 */
export interface TechnologyStackAccuracyDetectedTechnology {
  /** 技术 slug。 */
  slug: string;
  /** 技术名称。 */
  name: string;
  /** 技术分类。 */
  categories: TechnologyCategory[];
  /** 0-100 置信度。 */
  confidence: number;
  /** 安全来源摘要。 */
  sources: string[];
  /** 可靠版本；无法确认时为空。 */
  version?: string;
}

/** 单个真实页面的安全评测结果。 */
export interface TechnologyStackAccuracySiteResult {
  /** 样本 ID 或覆盖样本 ID。 */
  id: string;
  /** 请求 URL。 */
  url: string;
  /** 最终 URL。 */
  finalUrl?: string;
  /** HTTP 状态码。 */
  httpStatus?: number;
  /** 运行状态。 */
  status: TechnologyStackAccuracySiteStatus;
  /** 稳定错误摘要。 */
  error?: string;
  /** 单页耗时。 */
  durationMs: number;
  /** 检测覆盖状态。 */
  scanCoverage?: TechnologyScanCoverage;
  /** 安全技术摘要。 */
  technologies: TechnologyStackAccuracyDetectedTechnology[];
}

/** 金标样本站点评测结果。 */
export interface TechnologyStackAccuracyGoldCaseResult extends TechnologyStackAccuracySiteResult {
  /** 站点主类别。 */
  category: TechnologyCategory;
  /** 期望命中的技术 slug。 */
  expectedSlugs: string[];
  /** 明确不应命中的技术 slug。 */
  blockedSlugs: string[];
  /** 漏报的期望技术。 */
  missingExpectedSlugs: string[];
  /** 命中的禁止技术。 */
  blockedHits: string[];
  /** 未列入金标但高置信命中的技术，进入人工复核队列。 */
  unexpectedHighConfidenceDetections: string[];
}

/** Tranco 覆盖样本站点评测结果。 */
export interface TechnologyStackAccuracyCoverageSiteResult extends TechnologyStackAccuracySiteResult {
  /** Tranco 排名。 */
  rank: number;
  /** Tranco 域名。 */
  domain: string;
}

/** Tranco 样本元数据。 */
export interface TechnologyStackAccuracyTrancoMeta {
  /** Tranco list id。 */
  listId: string;
  /** 下载时间。 */
  downloadedAt: string;
  /** 来源 URL。 */
  sourceUrl: string;
  /** 请求样本数量。 */
  requestedSites: number;
}

/** 金标准确率汇总。 */
export interface TechnologyStackAccuracyGoldSummary {
  /** 金标样本数。 */
  totalCases: number;
  /** 成功到达并完成扩展检测的样本数。 */
  okCases: number;
  /** 期望 slug 总数。 */
  expectedSlugCount: number;
  /** 命中的期望 slug 数。 */
  expectedHitCount: number;
  /** 期望召回率。 */
  expectedRecall: number;
  /** 禁止 slug 总数。 */
  blockedSlugCount: number;
  /** 禁止 slug 命中数。 */
  blockedHitCount: number;
  /** 禁止 slug 疑似误报率。 */
  blockedFalsePositiveRate: number;
  /** 高置信额外命中数。 */
  unexpectedHighConfidenceCount: number;
  /** 完整扫描以外的比例。 */
  partialCoverageRate: number;
  /** 可达页面空结果比例。 */
  emptyRate: number;
}

/** Tranco 覆盖趋势汇总。 */
export interface TechnologyStackAccuracyCoverageSummary {
  /** 请求覆盖样本数量。 */
  requestedSites: number;
  /** 成功到达并完成扩展检测的样本数。 */
  reachableSites: number;
  /** 可达率。 */
  reachableRate: number;
  /** 可达页面中非空技术结果比例。 */
  nonEmptyDetectionRate: number;
  /** 可达页面中至少一个高置信命中的比例。 */
  highConfidenceDetectionRate: number;
  /** 完整扫描以外的比例。 */
  partialCoverageRate: number;
  /** 可达但未命中的站点。 */
  emptyReachableSites: string[];
  /** 下一批规则补齐候选域名。 */
  ruleGapCandidates: string[];
  /** 高频命中技术。 */
  topDetectedSlugs: Array<{ slug: string; count: number }>;
}

/** 技术栈真实站点准确率报告。 */
export interface TechnologyStackAccuracyReport {
  /** 生成时间。 */
  generatedAt: string;
  /** hard guard 是否通过。 */
  passed: boolean;
  /** hard guard 失败项。 */
  failures: string[];
  /** 当前规则包摘要。 */
  rulePackage: TechnologyRulePackageSummary;
  /** 金标汇总。 */
  goldSummary: TechnologyStackAccuracyGoldSummary;
  /** 覆盖趋势汇总。 */
  coverageSummary: TechnologyStackAccuracyCoverageSummary;
  /** Tranco 样本元数据。 */
  tranco: TechnologyStackAccuracyTrancoMeta | null;
  /** 金标逐站结果。 */
  goldResults: TechnologyStackAccuracyGoldCaseResult[];
  /** 覆盖样本逐站结果。 */
  coverageResults: TechnologyStackAccuracyCoverageSiteResult[];
  /** 报告说明。 */
  notes: string[];
}

const GOLD_STALE_WINDOW_DAYS = 180;
const HIGH_CONFIDENCE_THRESHOLD = 80;
const FORBIDDEN_LABEL_SOURCE_PATTERNS = [
  new RegExp(['w', 'appalyzer'].join(''), 'i'),
  /httparchive\.org\/technologies/i,
  /bigquery-public-data\.httparchive.*technolog/i,
] as const;

/** 判断 URL 是否是普通 http/https URL。 */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** 计算比例，分母为 0 时返回 0。 */
function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number((numerator / denominator).toFixed(4));
}

/** 判断日期是否超过金标维护窗口。 */
function isStaleDate(value: string, now: Date): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return true;
  return now.getTime() - parsed.getTime() > GOLD_STALE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/** 去重并稳定排序 slug。 */
function uniqueSlugs(slugs: readonly string[]): string[] {
  return Array.from(new Set(slugs.map((slug) => slug.trim()).filter(Boolean))).sort();
}

/**
 * 把 detector 输出转换成可写入评测报告的安全摘要。
 *
 * @param technologies - detector 技术结果。
 * @returns 不含原始页面内容或 cookie 值的摘要。
 */
export function sanitizeAccuracyTechnologies(
  technologies: readonly DetectedTechnology[],
): TechnologyStackAccuracyDetectedTechnology[] {
  return technologies.map((technology) => ({
    slug: technology.slug,
    name: technology.name,
    categories: [...technology.categories],
    confidence: technology.confidence,
    sources: technology.sources.map(String),
    ...(technology.version ? { version: technology.version } : {}),
  }));
}

/**
 * 校验真实站点金标样本。
 *
 * @param cases - 金标样本。
 * @param rules - 当前 active 规则包。
 * @param options - 期望数量与当前时间。
 * @returns schema 与合规错误列表。
 */
export function validateTechnologyStackAccuracyGoldCases(
  cases: readonly TechnologyStackAccuracyGoldCase[],
  rules: readonly TechnologyRule[],
  options: { expectedCount?: number; now?: Date } = {},
): string[] {
  const errors: string[] = [];
  const now = options.now ?? new Date();
  const ruleSlugs = new Set(rules.map((rule) => rule.slug));
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();

  if (typeof options.expectedCount === 'number' && cases.length !== options.expectedCount) {
    errors.push(`gold case count ${cases.length} !== ${options.expectedCount}`);
  }

  for (const goldCase of cases) {
    if (!goldCase.id.trim()) errors.push('gold case id is empty');
    if (seenIds.has(goldCase.id)) errors.push(`duplicate gold case id: ${goldCase.id}`);
    seenIds.add(goldCase.id);
    if (!isHttpUrl(goldCase.url)) errors.push(`gold case ${goldCase.id} url is not http(s): ${goldCase.url}`);
    if (seenUrls.has(goldCase.url)) errors.push(`duplicate gold case url: ${goldCase.url}`);
    seenUrls.add(goldCase.url);

    const expectedSlugs = uniqueSlugs(goldCase.expectedSlugs);
    const blockedSlugs = uniqueSlugs(goldCase.blockedSlugs);
    if (expectedSlugs.length < 1) errors.push(`gold case ${goldCase.id} expectedSlugs is empty`);
    if (expectedSlugs.length !== goldCase.expectedSlugs.length) errors.push(`gold case ${goldCase.id} expectedSlugs has duplicates`);
    if (blockedSlugs.length !== goldCase.blockedSlugs.length) errors.push(`gold case ${goldCase.id} blockedSlugs has duplicates`);

    for (const slug of [...expectedSlugs, ...blockedSlugs]) {
      if (!ruleSlugs.has(slug)) errors.push(`gold case ${goldCase.id} references unknown slug: ${slug}`);
    }
    for (const slug of expectedSlugs) {
      if (blockedSlugs.includes(slug)) errors.push(`gold case ${goldCase.id} blocks expected slug: ${slug}`);
    }

    if (goldCase.labelSourceUrls.length < 1) errors.push(`gold case ${goldCase.id} labelSourceUrls is empty`);
    for (const sourceUrl of goldCase.labelSourceUrls) {
      if (!isHttpUrl(sourceUrl)) errors.push(`gold case ${goldCase.id} label source is not http(s): ${sourceUrl}`);
      if (FORBIDDEN_LABEL_SOURCE_PATTERNS.some((pattern) => pattern.test(sourceUrl))) {
        errors.push(`gold case ${goldCase.id} uses forbidden label source: ${sourceUrl}`);
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(goldCase.lastVerifiedAt)) {
      errors.push(`gold case ${goldCase.id} lastVerifiedAt is invalid: ${goldCase.lastVerifiedAt}`);
    } else if (isStaleDate(goldCase.lastVerifiedAt, now)) {
      errors.push(`gold case ${goldCase.id} lastVerifiedAt is stale: ${goldCase.lastVerifiedAt}`);
    }
  }

  return errors;
}

/**
 * 合并金标定义与真实站点检测结果。
 *
 * @param goldCase - 金标定义。
 * @param siteResult - 真实页面检测结果。
 * @returns 金标评测结果。
 */
export function evaluateTechnologyStackGoldCase(
  goldCase: TechnologyStackAccuracyGoldCase,
  siteResult: TechnologyStackAccuracySiteResult,
): TechnologyStackAccuracyGoldCaseResult {
  const detectedSlugs = new Set(siteResult.technologies.map((technology) => technology.slug));
  const expectedSlugs = uniqueSlugs(goldCase.expectedSlugs);
  const blockedSlugs = uniqueSlugs(goldCase.blockedSlugs);
  const missingExpectedSlugs = expectedSlugs.filter((slug) => !detectedSlugs.has(slug));
  const blockedHits = blockedSlugs.filter((slug) => detectedSlugs.has(slug));
  const unexpectedHighConfidenceDetections = siteResult.technologies
    .filter((technology) => technology.confidence >= HIGH_CONFIDENCE_THRESHOLD)
    .map((technology) => technology.slug)
    .filter((slug) => !expectedSlugs.includes(slug) && !blockedSlugs.includes(slug))
    .sort();

  return {
    ...siteResult,
    category: goldCase.category,
    expectedSlugs,
    blockedSlugs,
    missingExpectedSlugs,
    blockedHits,
    unexpectedHighConfidenceDetections,
  };
}

/** 统计非完整扫描比例；当前 full scan 协议不再产生用户可见 partial 状态。 */
function summarizePartialCoverage(results: readonly TechnologyStackAccuracySiteResult[]): number {
  const okResults = results.filter((result) => result.status === 'ok');
  return ratio(0, okResults.length);
}

/** 构建金标准确率摘要。 */
function summarizeGoldResults(results: readonly TechnologyStackAccuracyGoldCaseResult[]): TechnologyStackAccuracyGoldSummary {
  const okResults = results.filter((result) => result.status === 'ok');
  const expectedSlugCount = okResults.reduce((total, result) => total + result.expectedSlugs.length, 0);
  const missingExpectedCount = okResults.reduce((total, result) => total + result.missingExpectedSlugs.length, 0);
  const blockedSlugCount = okResults.reduce((total, result) => total + result.blockedSlugs.length, 0);
  const blockedHitCount = okResults.reduce((total, result) => total + result.blockedHits.length, 0);
  const unexpectedHighConfidenceCount = okResults.reduce(
    (total, result) => total + result.unexpectedHighConfidenceDetections.length,
    0,
  );
  return {
    totalCases: results.length,
    okCases: okResults.length,
    expectedSlugCount,
    expectedHitCount: expectedSlugCount - missingExpectedCount,
    expectedRecall: ratio(expectedSlugCount - missingExpectedCount, expectedSlugCount),
    blockedSlugCount,
    blockedHitCount,
    blockedFalsePositiveRate: ratio(blockedHitCount, blockedSlugCount),
    unexpectedHighConfidenceCount,
    partialCoverageRate: summarizePartialCoverage(results),
    emptyRate: ratio(okResults.filter((result) => result.technologies.length < 1).length, okResults.length),
  };
}

/** 构建覆盖样本摘要。 */
function summarizeCoverageResults(
  results: readonly TechnologyStackAccuracyCoverageSiteResult[],
): TechnologyStackAccuracyCoverageSummary {
  const reachable = results.filter((result) => result.status === 'ok');
  const slugCounts = new Map<string, number>();
  for (const result of reachable) {
    for (const technology of result.technologies) {
      slugCounts.set(technology.slug, (slugCounts.get(technology.slug) ?? 0) + 1);
    }
  }
  return {
    requestedSites: results.length,
    reachableSites: reachable.length,
    reachableRate: ratio(reachable.length, results.length),
    nonEmptyDetectionRate: ratio(reachable.filter((result) => result.technologies.length > 0).length, reachable.length),
    highConfidenceDetectionRate: ratio(
      reachable.filter((result) => result.technologies.some((technology) => technology.confidence >= HIGH_CONFIDENCE_THRESHOLD)).length,
      reachable.length,
    ),
    partialCoverageRate: summarizePartialCoverage(results),
    emptyReachableSites: reachable
      .filter((result) => result.technologies.length < 1)
      .map((result) => result.finalUrl || result.url)
      .slice(0, 50),
    ruleGapCandidates: reachable
      .filter((result) => result.technologies.length < 1)
      .map((result) => result.finalUrl || result.url)
      .slice(0, 100),
    topDetectedSlugs: Array.from(slugCounts.entries())
      .map(([slug, count]) => ({ slug, count }))
      .sort((left, right) => right.count - left.count || left.slug.localeCompare(right.slug))
      .slice(0, 50),
  };
}

/**
 * 检查报告是否包含禁止落盘的原始页面信号。
 *
 * @param report - 技术栈准确率报告。
 * @returns 安全错误列表。
 */
export function validateTechnologyStackAccuracyReportSafety(report: TechnologyStackAccuracyReport): string[] {
  const serialized = JSON.stringify({
    goldResults: report.goldResults,
    coverageResults: report.coverageResults,
    tranco: report.tranco,
  }).toLowerCase();
  const forbiddenFragments = [
    '<html',
    '</html',
    '<script',
    '</script',
    'document.cookie',
    'cookievalues',
    'set-cookie',
    ['w', 'appalyzer'].join(''),
    'httparchive.org/technologies',
  ];
  return forbiddenFragments
    .filter((fragment) => serialized.includes(fragment))
    .map((fragment) => `accuracy report contains forbidden fragment: ${fragment}`);
}

/**
 * 构建完整技术栈真实站点准确率报告。
 *
 * @param args - 规则摘要、金标结果、覆盖结果和 Tranco 元数据。
 * @returns 可写入磁盘的报告。
 */
export function buildTechnologyStackAccuracyReport(args: {
  generatedAt: string;
  rulePackage: TechnologyRulePackageSummary;
  goldResults: readonly TechnologyStackAccuracyGoldCaseResult[];
  coverageResults: readonly TechnologyStackAccuracyCoverageSiteResult[];
  tranco: TechnologyStackAccuracyTrancoMeta | null;
  schemaErrors?: readonly string[];
}): TechnologyStackAccuracyReport {
  const report: TechnologyStackAccuracyReport = {
    generatedAt: args.generatedAt,
    passed: false,
    failures: [...(args.schemaErrors ?? [])],
    rulePackage: args.rulePackage,
    goldSummary: summarizeGoldResults(args.goldResults),
    coverageSummary: summarizeCoverageResults(args.coverageResults),
    tranco: args.tranco,
    goldResults: [...args.goldResults],
    coverageResults: [...args.coverageResults],
    notes: [
      '真实站点准确率评测只使用 Olyq 自建人工金标和 Tranco 站点抽样，不使用第三方技术目录或 HTTP Archive technologies 标签作为判定真相。',
      '金标 recall 与 blocked false positive 目前是 report-only baseline；首版只 hard fail schema、管线、安全和来源边界问题。',
      '覆盖样本只衡量公开页面信号趋势，不承诺识别登录后、服务端隐藏、私有、混淆或无公开特征技术。',
      '报告不保存原始 HTML、脚本、CSS 或 cookie 值；cookie 原始值仍只允许 detector 瞬时匹配。',
    ],
  };
  report.failures.push(...validateTechnologyStackAccuracyReportSafety(report));
  report.passed = report.failures.length < 1;
  return report;
}

/** 把百分比格式化为固定一位。 */
function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * 渲染技术栈真实站点准确率 Markdown 报告。
 *
 * @param report - 准确率报告。
 * @returns Markdown 文本。
 */
export function renderTechnologyStackAccuracyMarkdown(report: TechnologyStackAccuracyReport): string {
  const missingGold = report.goldResults.filter((result) => result.missingExpectedSlugs.length > 0);
  const blockedGold = report.goldResults.filter((result) => result.blockedHits.length > 0);
  const highConfidenceReview = report.goldResults
    .filter((result) => result.unexpectedHighConfidenceDetections.length > 0)
    .slice(0, 30);
  const lines = [
    '# Technology Stack Accuracy',
    '',
    `- 生成时间：${report.generatedAt}`,
    `- 总体结论：${report.passed ? 'PASS' : 'FAIL'}`,
    `- 规则包：${report.rulePackage.total} fingerprints / snapshot ${report.rulePackage.snapshotVersion}`,
    `- 金标样本：${report.goldSummary.totalCases}，可评测 ${report.goldSummary.okCases}`,
    `- expected recall：${percent(report.goldSummary.expectedRecall)} (${report.goldSummary.expectedHitCount}/${report.goldSummary.expectedSlugCount})`,
    `- blocked false positive：${percent(report.goldSummary.blockedFalsePositiveRate)} (${report.goldSummary.blockedHitCount}/${report.goldSummary.blockedSlugCount})`,
    `- unexpected high confidence：${report.goldSummary.unexpectedHighConfidenceCount}`,
    `- 金标 partial coverage：${percent(report.goldSummary.partialCoverageRate)}`,
    `- 金标 empty rate：${percent(report.goldSummary.emptyRate)}`,
    `- Tranco list：${report.tranco?.listId ?? 'n/a'} (${report.tranco?.downloadedAt ?? 'n/a'})`,
    `- 覆盖样本：${report.coverageSummary.requestedSites}，可达 ${report.coverageSummary.reachableSites} (${percent(report.coverageSummary.reachableRate)})`,
    `- 覆盖样本非空命中：${percent(report.coverageSummary.nonEmptyDetectionRate)}`,
    `- 覆盖样本高置信命中：${percent(report.coverageSummary.highConfidenceDetectionRate)}`,
    `- 覆盖样本 partial coverage：${percent(report.coverageSummary.partialCoverageRate)}`,
    '',
    '## Notes',
    '',
    ...report.notes.map((note) => `- ${note}`),
    '',
    '## Gold Missing Expected',
    '',
    ...(missingGold.length > 0
      ? missingGold.slice(0, 50).map((result) => `- ${result.id}: missing=${result.missingExpectedSlugs.join(', ')} url=${result.finalUrl || result.url}`)
      : ['- (none)']),
    '',
    '## Gold Blocked Hits',
    '',
    ...(blockedGold.length > 0
      ? blockedGold.slice(0, 50).map((result) => `- ${result.id}: blocked=${result.blockedHits.join(', ')} url=${result.finalUrl || result.url}`)
      : ['- (none)']),
    '',
    '## Unexpected High Confidence Review Queue',
    '',
    ...(highConfidenceReview.length > 0
      ? highConfidenceReview.map((result) => `- ${result.id}: ${result.unexpectedHighConfidenceDetections.join(', ')} url=${result.finalUrl || result.url}`)
      : ['- (none)']),
    '',
    '## Coverage Top Detected Slugs',
    '',
    ...(report.coverageSummary.topDetectedSlugs.length > 0
      ? report.coverageSummary.topDetectedSlugs.map((entry) => `- ${entry.slug}: ${entry.count}`)
      : ['- (none)']),
    '',
    '## Coverage Rule Gap Candidates',
    '',
    ...(report.coverageSummary.ruleGapCandidates.length > 0
      ? report.coverageSummary.ruleGapCandidates.slice(0, 50).map((url) => `- ${url}`)
      : ['- (none)']),
    '',
  ];
  if (report.failures.length > 0) {
    lines.push('## Failures', '', ...report.failures.map((failure) => `- ${failure}`), '');
  }
  return lines.join('\n');
}
