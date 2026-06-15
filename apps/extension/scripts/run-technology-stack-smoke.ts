/**
 * technology-stack smoke runner。
 *
 * 说明：
 * - 使用本地规则包和稳定 fixture 验证真实站点常见公开信号矩阵；
 * - 默认回归不访问真实网络，避免外部站点变化导致验证不稳定；
 * - 失败时输出缺失/误报详情并返回非零退出码。
 */
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { buildTechnologyRulePackageFromLocalData } from './technology-stack-local-bundle';
import { runTechnologyStackSmokeCases } from './technology-stack-smoke-cases';

const SCRIPT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, '..');
const RESULTS_DIR = path.join(PACKAGE_ROOT, 'test-results', 'technology-stack-smoke');

/**
 * 读取当前本地技术栈规则包。
 *
 * @returns 展开后的规则包。
 */
function loadRulePackage() {
  return buildTechnologyRulePackageFromLocalData();
}

/**
 * 渲染 smoke Markdown 报告。
 *
 * @param generatedAt - 生成时间。
 * @param results - 用例结果。
 * @returns Markdown 文本。
 */
function renderMarkdown(generatedAt: string, results: ReturnType<typeof runTechnologyStackSmokeCases>): string {
  const failed = results.filter((result) => !result.passed);
  const lines = [
    '# Technology Stack Smoke',
    '',
    `- 生成时间：${generatedAt}`,
    `- 总体结论：${failed.length < 1 ? 'PASS' : 'FAIL'}`,
    `- 用例：${results.length}`,
    '',
  ];
  for (const result of results) {
    lines.push(`## ${result.id}`);
    lines.push('');
    lines.push(`- status: ${result.passed ? 'PASS' : 'FAIL'}`);
    lines.push(`- url: ${result.url}`);
    lines.push(`- expected: ${result.expectedSlugs.join(', ') || '(none)'}`);
    lines.push(`- blocked: ${result.blockedSlugs.join(', ') || '(none)'}`);
    lines.push(`- detected: ${result.detectedSlugs.join(', ') || '(none)'}`);
    lines.push(`- scanCoverage: ${result.scanCoverage}`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * 主入口。
 */
async function main(): Promise<void> {
  const rulePackage = loadRulePackage();
  const generatedAt = new Date().toISOString();
  const results = runTechnologyStackSmokeCases(rulePackage.rules);
  const failures = results.filter((result) => !result.passed);
  const report = {
    generatedAt,
    passed: failures.length < 1,
    failures: failures.map((result) => result.id),
    rulePackage: rulePackage.summary,
    results,
  };
  const markdown = renderMarkdown(generatedAt, results);
  await fsp.mkdir(RESULTS_DIR, { recursive: true });
  await fsp.writeFile(path.join(RESULTS_DIR, 'latest.json'), JSON.stringify(report, null, 2));
  await fsp.writeFile(path.join(RESULTS_DIR, 'latest.md'), markdown);
  process.stdout.write(`${markdown}\n`);
  if (failures.length > 0) process.exitCode = 1;
}

void main().catch((error) => {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${detail}\n`);
  process.exitCode = 1;
});
