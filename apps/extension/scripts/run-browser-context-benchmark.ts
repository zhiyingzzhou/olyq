/**
 * browser-context benchmark runner。
 *
 * 说明：
 * - 直接驱动当前 browser-context 真实实现，不再造第二套 mock-only benchmark 语义；
 * - 输出 JSON 与 Markdown 报告，供根级可靠性文档和状态文件引用；
 * - 预算失败时以非零退出码结束，防止热点场景性能回退被静默带入主分支。
 */
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import {
  runCaptureCoalescingBenchmark,
  runSendPreflightBenchmark,
  runTabSwitchFollowBenchmark,
  type BrowserContextBenchmarkSample,
  type BrowserContextBenchmarkScenarioResult,
} from '../src/bench/browser-context/runtime';

const SCRIPT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, '..');
const RESULTS_DIR = path.join(PACKAGE_ROOT, 'test-results', 'browser-context-benchmark');
const BUDGETS_PATH = path.join(SCRIPT_DIR, 'browser-context-benchmark-budgets.json');

type ScenarioBudgetMap = {
  'tab-switch-follow': {
    iterations: number;
    maxMeanMs: number;
    maxP95Ms: number;
    minStaleEntries: number;
  };
  'send-preflight': {
    iterations: number;
    maxMeanMs: number;
    maxP95Ms: number;
    maxWarmMeanMs: number;
    maxWarmP95Ms: number;
    expectedLayoutRequestsPerIteration: number;
    expectedReadableDomRequestsPerIteration: number;
    expectedTechnologyStackRequestsPerIteration: number;
    minSourceCacheHitRatio: number;
    maxDegradedSendRate: number;
  };
  'capture-coalescing': {
    iterations: number;
    maxMeanMs: number;
    maxP95Ms: number;
    maxCaptureCallsPerIteration: number;
    minCaptureCoalescingHitRatio: number;
    maxQuotaRetryRate: number;
  };
};

interface ScenarioStats {
  meanMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
}

/**
 * 读取预算配置。
 *
 * @returns benchmark 预算。
 */
async function loadBudgets(): Promise<{ scenarios: ScenarioBudgetMap }> {
  return JSON.parse(await fsp.readFile(BUDGETS_PATH, 'utf8')) as { scenarios: ScenarioBudgetMap };
}

/**
 * 计算时延统计。
 *
 * @param values - 原始时延数组。
 * @returns 聚合结果。
 */
function toStats(values: number[]): ScenarioStats {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length < 1) {
    return {
      meanMs: 0,
      p95Ms: 0,
      minMs: 0,
      maxMs: 0,
    };
  }
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    meanMs: total / sorted.length,
    p95Ms: sorted[p95Index] ?? 0,
    minMs: sorted[0] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
}

/**
 * 读取样本明细里的某个数值字段。
 *
 * @param samples - 原始样本。
 * @param key - 明细字段。
 * @returns 数值列表。
 */
function readSampleDetail(samples: BrowserContextBenchmarkSample[], key: string): number[] {
  return samples.map((sample) => Number(sample.details?.[key] ?? 0));
}

/**
 * 构建单个场景的可读摘要。
 *
 * @param result - 场景结果。
 * @returns 结构化摘要。
 */
function summarizeScenario(result: BrowserContextBenchmarkScenarioResult) {
  const durationStats = toStats(result.samples.map((sample) => sample.durationMs));
  const detailStats = {
    staleEntries: toStats(readSampleDetail(result.samples, 'staleEntries')),
    warmDurationMs: toStats(readSampleDetail(result.samples, 'warmDurationMs')),
    layoutRequests: toStats(readSampleDetail(result.samples, 'layoutRequests')),
    readableDomRequests: toStats(readSampleDetail(result.samples, 'readableDomRequests')),
    technologyStackRequests: toStats(readSampleDetail(result.samples, 'technologyStackRequests')),
    captureCalls: toStats(readSampleDetail(result.samples, 'captureCalls')),
    layoutReads: toStats(readSampleDetail(result.samples, 'layoutReads')),
    scrollWrites: toStats(readSampleDetail(result.samples, 'scrollWrites')),
    degraded: toStats(readSampleDetail(result.samples, 'degraded')),
  };
  return {
    scenarioId: result.scenarioId,
    iterations: result.samples.length,
    duration: durationStats,
    details: detailStats,
    metrics: result.metrics,
  };
}

/**
 * 断言单个场景预算。
 *
 * @param summary - 场景摘要。
 * @param budgets - 预算配置。
 * @returns 失败信息列表。
 */
function evaluateScenarioBudgets(
  summary: ReturnType<typeof summarizeScenario>,
  budgets: ScenarioBudgetMap,
): string[] {
  const failures: string[] = [];

  if (summary.scenarioId === 'tab-switch-follow') {
    const budget = budgets['tab-switch-follow'];
    if (summary.duration.meanMs > budget.maxMeanMs) {
      failures.push(`tab-switch-follow mean=${summary.duration.meanMs.toFixed(2)}ms 超过预算 ${budget.maxMeanMs}ms`);
    }
    if (summary.duration.p95Ms > budget.maxP95Ms) {
      failures.push(`tab-switch-follow p95=${summary.duration.p95Ms.toFixed(2)}ms 超过预算 ${budget.maxP95Ms}ms`);
    }
    if (summary.details.staleEntries.minMs < budget.minStaleEntries) {
      failures.push(`tab-switch-follow staleEntries 最小值=${summary.details.staleEntries.minMs.toFixed(0)}，低于预算 ${budget.minStaleEntries}`);
    }
    return failures;
  }

  if (summary.scenarioId === 'send-preflight') {
    const budget = budgets['send-preflight'];
    if (summary.duration.meanMs > budget.maxMeanMs) {
      failures.push(`send-preflight cold mean=${summary.duration.meanMs.toFixed(2)}ms 超过预算 ${budget.maxMeanMs}ms`);
    }
    if (summary.duration.p95Ms > budget.maxP95Ms) {
      failures.push(`send-preflight cold p95=${summary.duration.p95Ms.toFixed(2)}ms 超过预算 ${budget.maxP95Ms}ms`);
    }
    if (summary.details.warmDurationMs.meanMs > budget.maxWarmMeanMs) {
      failures.push(`send-preflight warm mean=${summary.details.warmDurationMs.meanMs.toFixed(2)}ms 超过预算 ${budget.maxWarmMeanMs}ms`);
    }
    if (summary.details.warmDurationMs.p95Ms > budget.maxWarmP95Ms) {
      failures.push(`send-preflight warm p95=${summary.details.warmDurationMs.p95Ms.toFixed(2)}ms 超过预算 ${budget.maxWarmP95Ms}ms`);
    }
    if (summary.details.layoutRequests.minMs !== budget.expectedLayoutRequestsPerIteration || summary.details.layoutRequests.maxMs !== budget.expectedLayoutRequestsPerIteration) {
      failures.push(`send-preflight layoutRequests 必须稳定为 ${budget.expectedLayoutRequestsPerIteration}，当前区间 ${summary.details.layoutRequests.minMs.toFixed(0)}-${summary.details.layoutRequests.maxMs.toFixed(0)}`);
    }
    if (summary.details.readableDomRequests.minMs !== budget.expectedReadableDomRequestsPerIteration || summary.details.readableDomRequests.maxMs !== budget.expectedReadableDomRequestsPerIteration) {
      failures.push(`send-preflight readableDomRequests 必须稳定为 ${budget.expectedReadableDomRequestsPerIteration}，当前区间 ${summary.details.readableDomRequests.minMs.toFixed(0)}-${summary.details.readableDomRequests.maxMs.toFixed(0)}`);
    }
    if (summary.details.technologyStackRequests.minMs !== budget.expectedTechnologyStackRequestsPerIteration || summary.details.technologyStackRequests.maxMs !== budget.expectedTechnologyStackRequestsPerIteration) {
      failures.push(`send-preflight technologyStackRequests 必须稳定为 ${budget.expectedTechnologyStackRequestsPerIteration}，当前区间 ${summary.details.technologyStackRequests.minMs.toFixed(0)}-${summary.details.technologyStackRequests.maxMs.toFixed(0)}`);
    }
    if (summary.metrics.ratios.sourceCacheHitRatio < budget.minSourceCacheHitRatio) {
      failures.push(`send-preflight sourceCacheHitRatio=${summary.metrics.ratios.sourceCacheHitRatio.toFixed(2)} 低于预算 ${budget.minSourceCacheHitRatio}`);
    }
    if (summary.metrics.ratios.degradedSendRate > budget.maxDegradedSendRate) {
      failures.push(`send-preflight degradedSendRate=${summary.metrics.ratios.degradedSendRate.toFixed(2)} 超过预算 ${budget.maxDegradedSendRate}`);
    }
    return failures;
  }

  const budget = budgets['capture-coalescing'];
  if (summary.duration.meanMs > budget.maxMeanMs) {
    failures.push(`capture-coalescing mean=${summary.duration.meanMs.toFixed(2)}ms 超过预算 ${budget.maxMeanMs}ms`);
  }
  if (summary.duration.p95Ms > budget.maxP95Ms) {
    failures.push(`capture-coalescing p95=${summary.duration.p95Ms.toFixed(2)}ms 超过预算 ${budget.maxP95Ms}ms`);
  }
  if (summary.details.captureCalls.maxMs > budget.maxCaptureCallsPerIteration) {
    failures.push(`capture-coalescing captureCalls 最大值=${summary.details.captureCalls.maxMs.toFixed(0)} 超过预算 ${budget.maxCaptureCallsPerIteration}`);
  }
  if (summary.metrics.ratios.captureCoalescingHitRatio < budget.minCaptureCoalescingHitRatio) {
    failures.push(`capture-coalescing hitRatio=${summary.metrics.ratios.captureCoalescingHitRatio.toFixed(2)} 低于预算 ${budget.minCaptureCoalescingHitRatio}`);
  }
  if (summary.metrics.ratios.quotaRetryRate > budget.maxQuotaRetryRate) {
    failures.push(`capture-coalescing quotaRetryRate=${summary.metrics.ratios.quotaRetryRate.toFixed(2)} 超过预算 ${budget.maxQuotaRetryRate}`);
  }
  return failures;
}

/**
 * 把 benchmark 结果渲染成 Markdown 报告。
 *
 * @param generatedAt - 生成时间。
 * @param summaries - 场景摘要。
 * @param failures - 失败列表。
 * @returns Markdown 文本。
 */
function renderMarkdownReport(
  generatedAt: string,
  summaries: ReturnType<typeof summarizeScenario>[],
  failures: string[],
): string {
  const lines: string[] = [
    '# Browser Context Benchmark',
    '',
    `- 生成时间：${generatedAt}`,
    `- 总体结论：${failures.length < 1 ? 'PASS' : 'FAIL'}`,
    '',
  ];

  for (const summary of summaries) {
    lines.push(`## ${summary.scenarioId}`);
    lines.push('');
    lines.push(`- iterations: ${summary.iterations}`);
    lines.push(`- duration mean/p95: ${summary.duration.meanMs.toFixed(2)}ms / ${summary.duration.p95Ms.toFixed(2)}ms`);
    if (summary.scenarioId === 'tab-switch-follow') {
      lines.push(`- staleEntries min/max: ${summary.details.staleEntries.minMs.toFixed(0)} / ${summary.details.staleEntries.maxMs.toFixed(0)}`);
      lines.push(`- metadata-to-stale mean/p95: ${summary.metrics.latencies.metadataToStale.meanMs.toFixed(2)}ms / ${summary.metrics.latencies.metadataToStale.p95Ms.toFixed(2)}ms`);
    } else if (summary.scenarioId === 'send-preflight') {
      lines.push(`- warm duration mean/p95: ${summary.details.warmDurationMs.meanMs.toFixed(2)}ms / ${summary.details.warmDurationMs.p95Ms.toFixed(2)}ms`);
      lines.push(`- requests per iteration: layout=${summary.details.layoutRequests.meanMs.toFixed(2)} readable-dom=${summary.details.readableDomRequests.meanMs.toFixed(2)} technology-stack=${summary.details.technologyStackRequests.meanMs.toFixed(2)}`);
      lines.push(`- source cache hit ratio: ${summary.metrics.ratios.sourceCacheHitRatio.toFixed(2)}`);
      lines.push(`- degraded send rate: ${summary.metrics.ratios.degradedSendRate.toFixed(2)}`);
      lines.push(`- send-preflight latency mean/p95: ${summary.metrics.latencies.sendPreflight.meanMs.toFixed(2)}ms / ${summary.metrics.latencies.sendPreflight.p95Ms.toFixed(2)}ms`);
    } else {
      lines.push(`- capture calls per iteration: ${summary.details.captureCalls.meanMs.toFixed(2)}`);
      lines.push(`- capture coalescing hit ratio: ${summary.metrics.ratios.captureCoalescingHitRatio.toFixed(2)}`);
      lines.push(`- capture queue wait mean/p95: ${summary.metrics.latencies.captureQueueWait.meanMs.toFixed(2)}ms / ${summary.metrics.latencies.captureQueueWait.p95Ms.toFixed(2)}ms`);
      lines.push(`- quota retry rate: ${summary.metrics.ratios.quotaRetryRate.toFixed(2)}`);
    }
    lines.push('');
  }

  if (failures.length > 0) {
    lines.push('## Failures');
    lines.push('');
    for (const failure of failures) {
      lines.push(`- ${failure}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 主执行入口。
 */
async function main(): Promise<void> {
  const budgets = await loadBudgets();
  const tabSwitch = await runTabSwitchFollowBenchmark(budgets.scenarios['tab-switch-follow'].iterations);
  const sendPreflight = await runSendPreflightBenchmark(budgets.scenarios['send-preflight'].iterations);
  const captureCoalescing = await runCaptureCoalescingBenchmark(budgets.scenarios['capture-coalescing'].iterations);
  const summaries = [tabSwitch, sendPreflight, captureCoalescing].map((result) => summarizeScenario(result));
  const failures = summaries.flatMap((summary) => evaluateScenarioBudgets(summary, budgets.scenarios));
  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    passed: failures.length < 1,
    failures,
    summaries,
  };
  const markdown = renderMarkdownReport(generatedAt, summaries, failures);

  await fsp.mkdir(RESULTS_DIR, { recursive: true });
  await fsp.writeFile(path.join(RESULTS_DIR, 'latest.json'), JSON.stringify(report, null, 2));
  await fsp.writeFile(path.join(RESULTS_DIR, 'latest.md'), markdown);

  process.stdout.write(`${markdown}\n`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${detail}\n`);
  process.exitCode = 1;
});
