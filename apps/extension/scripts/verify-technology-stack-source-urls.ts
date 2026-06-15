/**
 * technology-stack 来源 URL 联网校验。
 *
 * 说明：
 * - 本脚本只验证当前中性技术指纹规则的来源 URL 是否在线可达；
 * - 它不把远程页面内容当作规则库，也不下载或执行远程代码；
 * - 结果写入 test-results，便于把“有来源字段”和“来源已联网验证”分开审计。
 */
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { buildTechnologyRulePackageFromLocalData } from './technology-stack-local-bundle';

const SCRIPT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, '..');
const RESULTS_DIR = path.join(PACKAGE_ROOT, 'test-results', 'technology-stack-source-urls');
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_RETRIES = 2;

type SourceUrlStatus = 'ok' | 'restricted' | 'failed';

interface SourceUrlEntry {
  url: string;
  normalizedUrl: string;
  slugs: string[];
}

interface SourceUrlCheckResult extends SourceUrlEntry {
  status: SourceUrlStatus;
  httpStatus?: number;
  finalUrl?: string;
  method?: 'HEAD' | 'GET';
  error?: string;
  durationMs: number;
}

interface SourceUrlVerificationReport {
  generatedAt: string;
  passed: boolean;
  totalRules: number;
  checkedRules: number;
  filterSlugs: string[];
  totalUrls: number;
  ok: number;
  restricted: number;
  failed: number;
  timeoutMs: number;
  concurrency: number;
  retries: number;
  results: SourceUrlCheckResult[];
}

/**
 * 读取本轮需要联网校验的规则 slug 过滤器。
 *
 * 说明：默认仍支持全量审计；规则扩容迭代时可以传入
 * `TECHNOLOGY_STACK_SOURCE_VERIFY_SLUGS=slug-a,slug-b`，只校验新增规则来源，
 * 避免历史 URL 迁移或旧站点限流阻塞当前增量质量验收。
 *
 * @returns slug 过滤集合；未配置时返回空集合表示全量校验。
 */
function readFilterSlugs(): Set<string> {
  const raw = process.env.TECHNOLOGY_STACK_SOURCE_VERIFY_SLUGS;
  if (!raw) return new Set();
  return new Set(raw.split(/[\s,]+/).map((slug) => slug.trim()).filter(Boolean));
}

/**
 * 读取正整数环境变量。
 *
 * @param name - 环境变量名。
 * @param fallback - 默认值。
 * @returns 正整数配置。
 */
function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * 归一化来源 URL，去掉不会发送到服务器的 hash。
 *
 * @param rawUrl - 原始来源 URL。
 * @returns 可联网请求的 URL。
 */
function normalizeSourceUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = '';
  return url.toString();
}

/**
 * 收集当前规则包的唯一来源 URL。
 *
 * @returns URL 到关联规则 slug 的映射。
 */
function collectSourceUrls(filterSlugs: ReadonlySet<string>): { entries: SourceUrlEntry[]; checkedRules: number } {
  const rulePackage = buildTechnologyRulePackageFromLocalData();
  const buckets = new Map<string, SourceUrlEntry>();
  for (const rule of rulePackage.rules) {
    if (filterSlugs.size > 0 && !filterSlugs.has(rule.slug)) continue;
    for (const sourceUrl of rule.sourceUrls) {
      const normalizedUrl = normalizeSourceUrl(sourceUrl);
      const existing = buckets.get(normalizedUrl);
      if (existing) {
        existing.slugs.push(rule.slug);
        continue;
      }
      buckets.set(normalizedUrl, {
        url: sourceUrl,
        normalizedUrl,
        slugs: [rule.slug],
      });
    }
  }
  return {
    entries: Array.from(buckets.values()).sort((left, right) => left.normalizedUrl.localeCompare(right.normalizedUrl)),
    checkedRules: rulePackage.rules.filter((rule) => filterSlugs.size === 0 || filterSlugs.has(rule.slug)).length,
  };
}

/**
 * 把 HTTP 状态码映射为来源校验状态。
 *
 * @param status - HTTP 状态码。
 * @returns 来源 URL 校验状态。
 */
function classifyHttpStatus(status: number): SourceUrlStatus {
  if (status >= 200 && status < 400) return 'ok';
  // 这些状态通常表示站点在线但拒绝自动化访问、需要登录或限流，不能等同于 URL 编造。
  if ([401, 403, 429].includes(status)) return 'restricted';
  return 'failed';
}

/**
 * 执行一次轻量 HTTP 请求。
 *
 * @param url - 请求 URL。
 * @param method - 请求方法。
 * @param timeoutMs - 超时时间。
 * @returns fetch 响应元数据。
 */
async function requestUrl(
  url: string,
  method: 'HEAD' | 'GET',
  timeoutMs: number,
): Promise<{ status: number; finalUrl: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent': 'OlyqTechnologyStackSourceVerifier/1.0 (+https://github.com/zzy/olyq)',
        ...(method === 'GET' ? { range: 'bytes=0-4095' } : {}),
      },
    });
    await response.body?.cancel();
    return { status: response.status, finalUrl: response.url };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 校验单个来源 URL。
 *
 * @param entry - 来源 URL 与关联规则。
 * @param timeoutMs - 单次请求超时。
 * @param retries - 失败重试次数。
 * @returns 来源 URL 校验结果。
 */
async function verifySourceUrl(entry: SourceUrlEntry, timeoutMs: number, retries: number): Promise<SourceUrlCheckResult> {
  const startedAt = performance.now();
  let lastError: string | undefined;
  try {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const head = await requestUrl(entry.normalizedUrl, 'HEAD', timeoutMs);
        const headStatus = classifyHttpStatus(head.status);
        if (headStatus === 'ok') {
          return {
            ...entry,
            status: headStatus,
            httpStatus: head.status,
            finalUrl: head.finalUrl,
            method: 'HEAD',
            durationMs: performance.now() - startedAt,
          };
        }

        const get = await requestUrl(entry.normalizedUrl, 'GET', timeoutMs);
        return {
          ...entry,
          status: classifyHttpStatus(get.status),
          httpStatus: get.status,
          finalUrl: get.finalUrl,
          method: 'GET',
          durationMs: performance.now() - startedAt,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    throw new Error(lastError ?? 'source URL check failed');
  } catch (error) {
    return {
      ...entry,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      durationMs: performance.now() - startedAt,
    };
  }
}

/**
 * 分批并发处理任务。
 *
 * @param items - 待处理项目。
 * @param concurrency - 并发数。
 * @param worker - 单项处理函数。
 * @returns 按原顺序排列的结果。
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length) as R[];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]!);
    }
  }));
  return results;
}

/**
 * 构建来源 URL 联网校验报告。
 *
 * @returns 联网校验报告。
 */
async function buildReport(): Promise<SourceUrlVerificationReport> {
  const timeoutMs = readPositiveIntEnv('TECHNOLOGY_STACK_SOURCE_VERIFY_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
  const concurrency = readPositiveIntEnv('TECHNOLOGY_STACK_SOURCE_VERIFY_CONCURRENCY', DEFAULT_CONCURRENCY);
  const retries = readPositiveIntEnv('TECHNOLOGY_STACK_SOURCE_VERIFY_RETRIES', DEFAULT_RETRIES);
  const filterSlugs = readFilterSlugs();
  const { entries, checkedRules } = collectSourceUrls(filterSlugs);
  if (filterSlugs.size > 0 && checkedRules !== filterSlugs.size) {
    const knownSlugs = new Set(entries.flatMap((entry) => entry.slugs));
    const missingSlugs = Array.from(filterSlugs).filter((slug) => !knownSlugs.has(slug));
    throw new Error(`source URL slug filter contains unknown rules: ${missingSlugs.join(', ')}`);
  }
  let completed = 0;
  const results = await mapWithConcurrency(entries, concurrency, async (entry) => {
    const result = await verifySourceUrl(entry, timeoutMs, retries);
    completed += 1;
    if (completed % 100 === 0 || completed === entries.length) {
      console.error(`[technology-stack-source-urls] checked ${completed}/${entries.length}`);
    }
    return result;
  });
  const ok = results.filter((result) => result.status === 'ok').length;
  const restricted = results.filter((result) => result.status === 'restricted').length;
  const failed = results.filter((result) => result.status === 'failed').length;

  return {
    generatedAt: new Date().toISOString(),
    passed: failed === 0,
    totalRules: buildTechnologyRulePackageFromLocalData().summary.total,
    checkedRules,
    filterSlugs: Array.from(filterSlugs).sort(),
    totalUrls: results.length,
    ok,
    restricted,
    failed,
    timeoutMs,
    concurrency,
    retries,
    results,
  };
}

/**
 * 渲染 Markdown 报告。
 *
 * @param report - 来源 URL 联网校验报告。
 * @returns Markdown 文本。
 */
function renderMarkdown(report: SourceUrlVerificationReport): string {
  const failedResults = report.results.filter((result) => result.status === 'failed');
  const restrictedResults = report.results.filter((result) => result.status === 'restricted');
  const lines = [
    '# Technology Stack Source URL Verification',
    '',
    `- 生成时间：${report.generatedAt}`,
    `- 总体结论：${report.passed ? 'PASS' : 'FAIL'}`,
    `- 规则数量：${report.totalRules}`,
    `- 本次校验规则：${report.checkedRules}${report.filterSlugs.length > 0 ? '（slug filter）' : '（全量）'}`,
    `- 唯一来源 URL：${report.totalUrls}`,
    `- ok：${report.ok}`,
    `- restricted：${report.restricted}`,
    `- failed：${report.failed}`,
    `- timeout：${report.timeoutMs}ms`,
    `- concurrency：${report.concurrency}`,
    `- retries：${report.retries}`,
    '',
    '## 说明',
    '',
    '- `ok` 表示来源 URL 返回 2xx/3xx。',
    '- `restricted` 表示站点在线但返回 401/403/429，通常是登录、反自动化或限流，不按编造 URL 处理。',
    '- `failed` 表示 4xx/5xx、DNS、TLS 或超时等硬失败，必须修规则来源后才能通过。',
    '- 设置 `TECHNOLOGY_STACK_SOURCE_VERIFY_SLUGS` 时只校验本轮新增规则来源；历史规则来源不作为该增量验收的 blocker。',
    '',
  ];

  if (failedResults.length > 0) {
    lines.push('## Failed', '');
    for (const result of failedResults) {
      lines.push(`- ${result.normalizedUrl} (${result.slugs.slice(0, 8).join(', ')})`);
      lines.push(`  - status: ${result.httpStatus ?? 'n/a'}`);
      lines.push(`  - error: ${result.error ?? 'n/a'}`);
    }
    lines.push('');
  }

  if (restrictedResults.length > 0) {
    lines.push('## Restricted', '');
    for (const result of restrictedResults.slice(0, 50)) {
      lines.push(`- ${result.normalizedUrl} (${result.httpStatus}, ${result.slugs.slice(0, 8).join(', ')})`);
    }
    if (restrictedResults.length > 50) {
      lines.push(`- ... ${restrictedResults.length - 50} more restricted URLs in latest.json`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

/**
 * 脚本入口。
 */
async function main(): Promise<void> {
  await fsp.mkdir(RESULTS_DIR, { recursive: true });
  const report = await buildReport();
  await fsp.writeFile(path.join(RESULTS_DIR, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const markdown = renderMarkdown(report);
  await fsp.writeFile(path.join(RESULTS_DIR, 'latest.md'), markdown, 'utf8');
  console.log(markdown);
  if (!report.passed) process.exitCode = 1;
}

await main();
