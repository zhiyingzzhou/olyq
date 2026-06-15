/**
 * technology-stack 覆盖率报告。
 *
 * 说明：
 * - 汇总当前本地规则包的数量、分类、信号来源、批次和 smoke 矩阵；
 * - 明确输出探测边界：当前规则包只能识别公开可观察信号，不承诺支持所有网站；
 * - 报告只读取本地打包规则资产，不访问远程规则库、不执行远程代码。
 */
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { buildTechnologyRulePackageFromLocalData } from './technology-stack-local-bundle';
import {
  collectTechnologyRuleEvidenceSources,
  validateTechnologyRules,
} from '../src/lib/technology-stack/rule-schema';
import type {
  TechnologyEvidenceSource,
  TechnologyRule,
  TechnologyStackCoverageReport,
  TechnologyStackRuleBatchSummary,
} from '../src/lib/technology-stack/types';
import { runTechnologyStackSmokeCases } from './technology-stack-smoke-cases';

const SCRIPT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, '..');
const RESULTS_DIR = path.join(PACKAGE_ROOT, 'test-results', 'technology-stack-coverage');
const STALE_RULE_WINDOW_DAYS = 180;

const SIGNAL_KEYS: TechnologyEvidenceSource[] = [
  'url',
  'headers',
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
];

/**
 * 读取当前本地技术栈规则包。
 *
 * @returns 展开后的规则包。
 */
function loadRulePackage() {
  return buildTechnologyRulePackageFromLocalData();
}

/**
 * 创建全 key 计数器。
 *
 * @param keys - 枚举 key。
 * @returns 初始值全为 0 的计数器。
 */
function createCounter<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

/**
 * 按规则批次聚合摘要。
 *
 * @param rules - active 技术规则。
 * @returns 批次摘要。
 */
function summarizeBatches(rules: readonly TechnologyRule[]): TechnologyStackRuleBatchSummary[] {
  const buckets = new Map<string, TechnologyStackRuleBatchSummary>();
  for (const rule of rules) {
    const batch = rule.rankMeta.batch;
    const existing = buckets.get(batch);
    const evidenceUrl = rule.rankMeta.evidenceUrl || rule.sourceUrls[0] || 'https://github.com/zzy/olyq';
    if (!existing) {
      buckets.set(batch, {
        batch,
        source: rule.rankMeta.source,
        total: 1,
        lastVerifiedAt: rule.lastVerifiedAt,
        evidenceUrl,
      });
      continue;
    }
    existing.total += 1;
    if (rule.lastVerifiedAt > existing.lastVerifiedAt) existing.lastVerifiedAt = rule.lastVerifiedAt;
  }
  return Array.from(buckets.values()).sort((left, right) => left.batch.localeCompare(right.batch));
}

/**
 * 判断规则是否超过维护窗口。
 *
 * @param rule - 技术规则。
 * @param now - 当前时间。
 * @returns 超过维护窗口时返回 true。
 */
function isStaleRule(rule: TechnologyRule, now: Date): boolean {
  const verifiedAt = new Date(`${rule.lastVerifiedAt}T00:00:00.000Z`);
  if (Number.isNaN(verifiedAt.getTime())) return true;
  const ageMs = now.getTime() - verifiedAt.getTime();
  return ageMs > STALE_RULE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * 构建覆盖率报告。
 *
 * @returns 技术栈覆盖率报告。
 */
async function buildCoverageReport(): Promise<TechnologyStackCoverageReport> {
  const rulePackage = loadRulePackage();
  const categoryKeys = Array.from(new Set(rulePackage.rules.flatMap((rule) => rule.categories))).sort();
  const categoryCoverage = createCounter(categoryKeys);
  const signalCoverage = createCounter(SIGNAL_KEYS);
  for (const rule of rulePackage.rules) {
    for (const category of rule.categories) categoryCoverage[category] += 1;
    for (const source of collectTechnologyRuleEvidenceSources(rule)) signalCoverage[source] += 1;
  }

  const schemaErrors = validateTechnologyRules(rulePackage.rules);
  const smokeCases = runTechnologyStackSmokeCases(rulePackage.rules);
  const staleRuleCount = rulePackage.rules.filter((rule) => isStaleRule(rule, new Date())).length;
  const missingSourceRuleCount = rulePackage.rules.filter((rule) => !rule.sourceUrls?.length).length;
  const failures = [
    ...schemaErrors,
    ...(rulePackage.summary.total < 7_000 ? [`fingerprint rules ${rulePackage.summary.total} < 7000`] : []),
    ...(staleRuleCount > 0 ? [`stale rules ${staleRuleCount} > 0`] : []),
    ...(missingSourceRuleCount > 0 ? [`missing source rules ${missingSourceRuleCount} > 0`] : []),
    ...smokeCases.filter((result) => !result.passed).map((result) => `smoke failed: ${result.id}`),
  ];

  return {
    generatedAt: new Date().toISOString(),
    passed: failures.length < 1,
    failures,
    rulePackage: rulePackage.summary,
    targetActiveRules: rulePackage.summary.technologyCount,
    currentMilestoneActiveRules: rulePackage.summary.total,
    targetReached: rulePackage.summary.total >= 7_000,
    currentMilestoneReached: rulePackage.summary.total >= 7_000,
    batches: summarizeBatches(rulePackage.rules),
    categoryCoverage,
    signalCoverage,
    staleRuleCount,
    missingSourceRuleCount,
    smokeCases,
    notes: [
      '当前规则包由 Olyq 本地指纹快照生成，运行时不远程更新规则、不执行第三方代码。',
      '技术栈探测只能识别页面公开暴露的信号，不承诺支持所有私有、隐藏、混淆或 bundle-only 技术。',
      `当前主包为 ${rulePackage.summary.total} 条 active fingerprint，源快照技术数 ${rulePackage.summary.technologyCount}，分类数 ${rulePackage.summary.categoryCount}。`,
      `暂不支持信号：${rulePackage.summary.unsupportedSignals.join(', ') || '(none)'}。`,
    ],
  };
}

/**
 * 渲染 Markdown 报告。
 *
 * @param report - 覆盖率报告。
 * @returns Markdown 文本。
 */
function renderMarkdown(report: TechnologyStackCoverageReport): string {
  const lines = [
    '# Technology Stack Coverage',
    '',
    `- 生成时间：${report.generatedAt}`,
    `- 总体结论：${report.passed ? 'PASS' : 'FAIL'}`,
    `- 规则包：${report.rulePackage.total} fingerprints / snapshot ${report.rulePackage.snapshotVersion}`,
    `- 快照技术数：${report.rulePackage.technologyCount}`,
    `- 快照分类数：${report.rulePackage.categoryCount}`,
    `- 核验过期规则：${report.staleRuleCount}`,
    `- 缺少来源证明规则：${report.missingSourceRuleCount}`,
    '',
    '## Notes',
    '',
    ...report.notes.map((note) => `- ${note}`),
    '',
    '## Batches',
    '',
    ...report.batches.map((batch) => `- ${batch.batch}: ${batch.total} rules, source=${batch.source}, verified=${batch.lastVerifiedAt}`),
    '',
    '## Category Coverage',
    '',
    ...Object.entries(report.categoryCoverage)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([category, count]) => `- ${category}: ${count}`),
    '',
    '## Signal Coverage',
    '',
    ...SIGNAL_KEYS.map((source) => `- ${source}: ${report.signalCoverage[source]}`),
    '',
    '## Smoke Matrix',
    '',
    ...report.smokeCases.map((result) => `- ${result.passed ? 'PASS' : 'FAIL'} ${result.id}: expected=${result.expectedSlugs.join(',') || '(none)'} detected=${result.detectedSlugs.join(',') || '(none)'}`),
    '',
  ];
  if (report.failures.length > 0) {
    lines.push('## Failures');
    lines.push('');
    for (const failure of report.failures) lines.push(`- ${failure}`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * 主入口。
 */
async function main(): Promise<void> {
  const report = await buildCoverageReport();
  const markdown = renderMarkdown(report);
  await fsp.mkdir(RESULTS_DIR, { recursive: true });
  await fsp.writeFile(path.join(RESULTS_DIR, 'latest.json'), JSON.stringify(report, null, 2));
  await fsp.writeFile(path.join(RESULTS_DIR, 'latest.md'), markdown);
  process.stdout.write(`${markdown}\n`);
  if (!report.passed) process.exitCode = 1;
}

void main().catch((error) => {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${detail}\n`);
  process.exitCode = 1;
});
