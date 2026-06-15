#!/usr/bin/env node
/**
 * page-style 真实浏览器 benchmark runner。
 *
 * 说明：
 * - 运行前由 `benchmark:page-style` 先产出 `dist-e2e` 与 `dist-firefox-e2e`；
 * - 这里不会复刻 page-style 逻辑，而是直接驱动 benchmark 页面里的真实内核；
 * - 输出包括原始 JSON、汇总 Markdown，以及结构性 / 相对性能 guard 判定。
 */
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { chromium, firefox } from '@playwright/test';

const SCRIPT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, '..');
const RESULTS_DIR = path.join(PACKAGE_ROOT, 'test-results', 'page-style-benchmark');
const BENCHMARK_PAGE_PATH = '/src/bench/page-style/index.html';
const BUDGETS_PATH = path.join(SCRIPT_DIR, 'page-style-benchmark-budgets.json');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * 读取 benchmark 预算配置。
 *
 * @returns 预算对象。
 */
async function loadBudgets() {
  const raw = await fsp.readFile(BUDGETS_PATH, 'utf8');
  return JSON.parse(raw);
}

/**
 * 读取 test build manifest，并提取 page-style chunk 的 raw/gzip 体积。
 *
 * @param browserName - 当前浏览器名。
 * @param buildDir - 构建目录。
 * @param budgets - 预算配置。
 * @returns 体积报告与失败列表。
 */
async function collectChunkSizeMetrics(browserName, buildDir, budgets) {
  const chunkSizeEntries = [];
  const failures = [];
  const chunkSizeBudgets = budgets.chunkSizeBudgets || {};
  if (Object.keys(chunkSizeBudgets).length < 1) {
    return { chunkSizeEntries, failures };
  }

  const manifestPath = path.join(buildDir, '.vite', 'manifest.json');
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));

  for (const [budgetKey, chunkBudget] of Object.entries(chunkSizeBudgets)) {
    const matchedEntry = Object.entries(manifest).find(([, value]) => (
      String(value?.name || '') === String(chunkBudget.chunkName || '')
      && String(value?.file || '').endsWith('.js')
    ));

    if (!matchedEntry) {
      failures.push(`${browserName}: 缺少 chunk size budget 对应产物 ${budgetKey}`);
      continue;
    }

    const [manifestKey, manifestEntry] = matchedEntry;
    const filePath = path.join(buildDir, manifestEntry.file);
    const rawBuffer = await fsp.readFile(filePath);
    const rawBytes = rawBuffer.byteLength;
    const gzipBytes = gzipSync(rawBuffer).byteLength;

    chunkSizeEntries.push({
      key: budgetKey,
      manifestKey,
      file: manifestEntry.file,
      rawBytes,
      gzipBytes,
    });

    if (typeof chunkBudget.maxRawBytes === 'number' && rawBytes > chunkBudget.maxRawBytes) {
      failures.push(`${browserName}: ${budgetKey} rawBytes=${rawBytes} 超过预算 ${chunkBudget.maxRawBytes}`);
    }
    if (typeof chunkBudget.maxGzipBytes === 'number' && gzipBytes > chunkBudget.maxGzipBytes) {
      failures.push(`${browserName}: ${budgetKey} gzipBytes=${gzipBytes} 超过预算 ${chunkBudget.maxGzipBytes}`);
    }
  }

  return {
    chunkSizeEntries,
    failures,
  };
}

/**
 * 启动一个极简静态文件服务器，用来托管 benchmark test build。
 *
 * @param rootDir - 要托管的构建目录。
 * @returns 本地访问地址与关闭函数。
 */
async function startStaticServer(rootDir) {
  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
      const relativePath = decodeURIComponent(requestUrl.pathname);
      const resolvedPath = path.resolve(rootDir, `.${relativePath}`);
      if (!resolvedPath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      let filePath = resolvedPath;
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      const ext = path.extname(filePath);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const content = await fsp.readFile(filePath);
      res.writeHead(200, { 'content-type': contentType });
      res.end(content);
    } catch (error) {
      res.writeHead(500);
      res.end(`Internal Server Error: ${String(error)}`);
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('无法解析 benchmark 静态服务器端口');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

/**
 * 计算数值数组的平均值。
 *
 * @param values - 原始数组。
 * @returns 平均值。
 */
function mean(values) {
  if (values.length < 1) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * 计算简单的 P95。
 *
 * @param values - 原始数组。
 * @returns P95 值。
 */
function p95(values) {
  if (values.length < 1) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index];
}

/**
 * 把单场景的样本汇总成报告项。
 *
 * @param key - `fixture/scenario` 组合键。
 * @param samples - 原始样本。
 * @returns 聚合结果。
 */
function aggregateScenario(key, samples) {
  const durations = samples.map((sample) => sample.durationMs);
  const countersMax = samples.reduce((currentMax, sample) => ({
    createTreeWalkerCalls: Math.max(currentMax.createTreeWalkerCalls, sample.counters.createTreeWalkerCalls),
    getComputedStyleCalls: Math.max(currentMax.getComputedStyleCalls, sample.counters.getComputedStyleCalls),
    getBoundingClientRectCalls: Math.max(currentMax.getBoundingClientRectCalls, sample.counters.getBoundingClientRectCalls),
  }), {
    createTreeWalkerCalls: 0,
    getComputedStyleCalls: 0,
    getBoundingClientRectCalls: 0,
  });

  return {
    key,
    fixtureId: samples[0]?.fixtureId || '',
    scenarioId: samples[0]?.scenarioId || '',
    sampleKind: samples[0]?.sampleKind || 'signals',
    iterations: samples.length,
    meanMs: mean(durations),
    p95Ms: p95(durations),
    minMs: durations.length > 0 ? Math.min(...durations) : 0,
    maxMs: durations.length > 0 ? Math.max(...durations) : 0,
    countersMax,
    samples,
  };
}

/**
 * 构建 `fixture/scenario` 组合键。
 *
 * @param fixtureId - 样本页。
 * @param scenarioId - 场景名。
 * @returns 组合键。
 */
function scenarioKey(fixtureId, scenarioId) {
  return `${fixtureId}/${scenarioId}`;
}

/**
 * 针对单个浏览器执行 benchmark。
 *
 * @param options - 浏览器、构建目录与预算配置。
 * @returns 该浏览器的完整 benchmark 结果。
 */
async function runBrowserBenchmarks(options) {
  const {
    browserName,
    browserType,
    buildDir,
    budgets,
  } = options;
  const staticServer = await startStaticServer(buildDir);
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport: budgets.desktopViewport,
  });
  const page = await context.newPage();
  const benchmarkUrl = `${staticServer.baseUrl}${BENCHMARK_PAGE_PATH}`;
  const failures = [];

  try {
    await page.goto(benchmarkUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__OLYQ_PAGE_STYLE_BENCHMARK__));
    await page.evaluate(async () => {
      await window.__OLYQ_PAGE_STYLE_BENCHMARK__.ready();
    });

    const results = {};

    /**
     * 对普通单场景重复采样并汇总。
     *
     * @param fixtureId - 样本页。
     * @param scenarioId - 场景名。
     * @param runner - 单次执行函数。
     */
    async function measureScenario(fixtureId, scenarioId, runner) {
      const samples = [];
      for (let index = 0; index < budgets.iterations; index += 1) {
        samples.push(await runner());
      }
      results[scenarioKey(fixtureId, scenarioId)] = aggregateScenario(
        scenarioKey(fixtureId, scenarioId),
        samples,
      );
    }

    await measureScenario('feature-rich', 'cold-signals', async () => {
      await page.setViewportSize(budgets.desktopViewport);
      return await page.evaluate(async () => {
        return await window.__OLYQ_PAGE_STYLE_BENCHMARK__.measureColdSignals('feature-rich');
      });
    });
    await measureScenario('feature-rich', 'warm-signals', async () => {
      await page.setViewportSize(budgets.desktopViewport);
      return await page.evaluate(async () => {
        return await window.__OLYQ_PAGE_STYLE_BENCHMARK__.measureWarmSignals('feature-rich');
      });
    });
    await measureScenario('feature-rich', 'scroll-metrics', async () => {
      await page.setViewportSize(budgets.desktopViewport);
      return await page.evaluate(async () => {
        return await window.__OLYQ_PAGE_STYLE_BENCHMARK__.measureScrollMetrics('feature-rich', 680);
      });
    });
    await measureScenario('feature-rich', 'mutation-signals', async () => {
      await page.setViewportSize(budgets.desktopViewport);
      return await page.evaluate(async () => {
        return await window.__OLYQ_PAGE_STYLE_BENCHMARK__.measureMutationSignals('feature-rich');
      });
    });
    await measureScenario('sparse', 'cold-signals', async () => {
      await page.setViewportSize(budgets.desktopViewport);
      return await page.evaluate(async () => {
        return await window.__OLYQ_PAGE_STYLE_BENCHMARK__.measureColdSignals('sparse');
      });
    });
    await measureScenario('sparse', 'warm-signals', async () => {
      await page.setViewportSize(budgets.desktopViewport);
      return await page.evaluate(async () => {
        return await window.__OLYQ_PAGE_STYLE_BENCHMARK__.measureWarmSignals('sparse');
      });
    });
    await measureScenario('dense', 'cold-signals', async () => {
      await page.setViewportSize(budgets.desktopViewport);
      return await page.evaluate(async () => {
        return await window.__OLYQ_PAGE_STYLE_BENCHMARK__.measureColdSignals('dense');
      });
    });
    await measureScenario('dense', 'warm-signals', async () => {
      await page.setViewportSize(budgets.desktopViewport);
      return await page.evaluate(async () => {
        return await window.__OLYQ_PAGE_STYLE_BENCHMARK__.measureWarmSignals('dense');
      });
    });

    const resizeMetricSamples = [];
    const resizeSignalSamples = [];
    for (let index = 0; index < budgets.iterations; index += 1) {
      await page.setViewportSize(budgets.desktopViewport);
      const prep = await page.evaluate(async () => {
        return await window.__OLYQ_PAGE_STYLE_BENCHMARK__.prepareResizeFixture('feature-rich');
      });
      await page.setViewportSize(budgets.compactViewport);
      const metricsSample = await page.evaluate(async () => {
        return await window.__OLYQ_PAGE_STYLE_BENCHMARK__.measureResizeMetrics('feature-rich');
      });
      const signalsSample = await page.evaluate(async () => {
        return await window.__OLYQ_PAGE_STYLE_BENCHMARK__.measureResizeSignals('feature-rich');
      });

      if (metricsSample.pageFingerprint === prep.baselineFingerprint) {
        failures.push(`${browserName}: feature-rich/resize-metrics 未改变 pageFingerprint`);
      }
      if (signalsSample.pageFingerprint !== metricsSample.pageFingerprint) {
        failures.push(`${browserName}: feature-rich/resize-signals 与 resize-metrics 的 pageFingerprint 不一致`);
      }

      resizeMetricSamples.push(metricsSample);
      resizeSignalSamples.push(signalsSample);
    }
    results['feature-rich/resize-metrics'] = aggregateScenario('feature-rich/resize-metrics', resizeMetricSamples);
    results['feature-rich/resize-signals'] = aggregateScenario('feature-rich/resize-signals', resizeSignalSamples);

    const scrollAggregate = results['feature-rich/scroll-metrics'];
    for (const sample of scrollAggregate.samples) {
      if (sample.scrollY !== 680) {
        failures.push(`${browserName}: feature-rich/scroll-metrics 的 scrollY 不是 680，而是 ${sample.scrollY}`);
      }
    }

    const chunkMetrics = await collectChunkSizeMetrics(browserName, buildDir, budgets);
    failures.push(...chunkMetrics.failures);

    return {
      browserName,
      buildDir,
      benchmarkUrl,
      results,
      chunkSizeEntries: chunkMetrics.chunkSizeEntries,
      failures,
    };
  } finally {
    await context.close();
    await browser.close();
    await staticServer.close();
  }
}

/**
 * 根据预算配置执行结构性 guard。
 *
 * @param browserResult - 单浏览器 benchmark 结果。
 * @param budgets - 预算配置。
 * @returns 失败列表。
 */
function evaluateBudgets(browserResult, budgets) {
  const failures = [...browserResult.failures];

  for (const [key, counterBudget] of Object.entries(budgets.counterBudgets)) {
    const aggregate = browserResult.results[key];
    if (!aggregate) {
      failures.push(`${browserResult.browserName}: 缺少计数预算对应场景 ${key}`);
      continue;
    }

    for (const sample of aggregate.samples) {
      for (const [counterName, range] of Object.entries(counterBudget)) {
        const value = sample.counters[counterName];
        if (typeof range.min === 'number' && value < range.min) {
          failures.push(`${browserResult.browserName}: ${key} 的 ${counterName}=${value} 小于最小预算 ${range.min}`);
        }
        if (typeof range.max === 'number' && value > range.max) {
          failures.push(`${browserResult.browserName}: ${key} 的 ${counterName}=${value} 大于最大预算 ${range.max}`);
        }
      }
    }
  }

  for (const [key, ratioBudget] of Object.entries(budgets.ratioBudgets)) {
    const target = browserResult.results[key];
    const baseline = browserResult.results[ratioBudget.baseline];
    if (!target || !baseline) {
      failures.push(`${browserResult.browserName}: 缺少比值预算对应场景 ${key} 或 baseline ${ratioBudget.baseline}`);
      continue;
    }

    const meanRatio = baseline.meanMs > 0 ? target.meanMs / baseline.meanMs : Number.POSITIVE_INFINITY;
    const p95Ratio = baseline.p95Ms > 0 ? target.p95Ms / baseline.p95Ms : Number.POSITIVE_INFINITY;
    if (meanRatio > ratioBudget.maxMeanRatio) {
      failures.push(`${browserResult.browserName}: ${key} meanRatio=${meanRatio.toFixed(2)} 超过预算 ${ratioBudget.maxMeanRatio}`);
    }
    if (p95Ratio > ratioBudget.maxP95Ratio) {
      failures.push(`${browserResult.browserName}: ${key} p95Ratio=${p95Ratio.toFixed(2)} 超过预算 ${ratioBudget.maxP95Ratio}`);
    }
  }

  return failures;
}

/**
 * 生成 Markdown 报告。
 *
 * @param fullResult - 全量 benchmark 结果。
 * @returns Markdown 字符串。
 */
function renderMarkdownReport(fullResult) {
  const lines = [
    '# Page Style Benchmark',
    '',
    `- 生成时间：${fullResult.generatedAt}`,
    `- 迭代次数：${fullResult.iterations}`,
    `- 总体结论：${fullResult.passed ? 'PASS' : 'FAIL'}`,
    '',
  ];

  for (const browserResult of fullResult.browsers) {
    lines.push(`## ${browserResult.browserName}`);
    lines.push('');
    lines.push(`- 构建目录：\`${path.relative(PACKAGE_ROOT, browserResult.buildDir)}\``);
    lines.push(`- benchmark 页面：\`${browserResult.benchmarkUrl}\``);
    lines.push('');
    lines.push('| 场景 | Mean (ms) | P95 (ms) | TreeWalker | getComputedStyle | getBoundingClientRect |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');

    for (const aggregate of Object.values(browserResult.results)) {
      lines.push(`| ${aggregate.key} | ${aggregate.meanMs.toFixed(2)} | ${aggregate.p95Ms.toFixed(2)} | ${aggregate.countersMax.createTreeWalkerCalls} | ${aggregate.countersMax.getComputedStyleCalls} | ${aggregate.countersMax.getBoundingClientRectCalls} |`);
    }

    lines.push('');
    if (browserResult.chunkSizeEntries.length > 0) {
      lines.push('### Chunk Sizes');
      lines.push('');
      lines.push('| Chunk | 文件 | Raw (bytes) | Gzip (bytes) |');
      lines.push('| --- | --- | ---: | ---: |');
      for (const chunkEntry of browserResult.chunkSizeEntries) {
        lines.push(`| ${chunkEntry.key} | \`${chunkEntry.file}\` | ${chunkEntry.rawBytes} | ${chunkEntry.gzipBytes} |`);
      }
      lines.push('');
    }
    if (browserResult.guardFailures.length > 0) {
      lines.push('### Guard Failures');
      lines.push('');
      for (const failure of browserResult.guardFailures) {
        lines.push(`- ${failure}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

async function main() {
  const budgets = await loadBudgets();
  await fsp.mkdir(RESULTS_DIR, { recursive: true });

  const browserResults = [];
  browserResults.push(await runBrowserBenchmarks({
    browserName: 'chromium',
    browserType: chromium,
    buildDir: path.join(PACKAGE_ROOT, 'dist-e2e'),
    budgets,
  }));
  browserResults.push(await runBrowserBenchmarks({
    browserName: 'firefox',
    browserType: firefox,
    buildDir: path.join(PACKAGE_ROOT, 'dist-firefox-e2e'),
    budgets,
  }));

  for (const browserResult of browserResults) {
    browserResult.guardFailures = evaluateBudgets(browserResult, budgets);
  }

  const fullResult = {
    generatedAt: new Date().toISOString(),
    iterations: budgets.iterations,
    passed: browserResults.every((browserResult) => browserResult.guardFailures.length < 1),
    browsers: browserResults,
  };

  const jsonPath = path.join(RESULTS_DIR, 'latest.json');
  const markdownPath = path.join(RESULTS_DIR, 'latest.md');
  await fsp.writeFile(jsonPath, JSON.stringify(fullResult, null, 2), 'utf8');
  await fsp.writeFile(markdownPath, renderMarkdownReport(fullResult), 'utf8');

  console.log(`Page-style benchmark JSON: ${jsonPath}`);
  console.log(`Page-style benchmark Markdown: ${markdownPath}`);

  for (const browserResult of browserResults) {
    console.log(`\n[${browserResult.browserName}]`);
    for (const aggregate of Object.values(browserResult.results)) {
      console.log(
        `${aggregate.key.padEnd(28)} mean=${aggregate.meanMs.toFixed(2)}ms p95=${aggregate.p95Ms.toFixed(2)}ms `
        + `tree=${aggregate.countersMax.createTreeWalkerCalls} style=${aggregate.countersMax.getComputedStyleCalls} rect=${aggregate.countersMax.getBoundingClientRectCalls}`,
      );
    }
    for (const chunkEntry of browserResult.chunkSizeEntries) {
      console.log(
        `${`${chunkEntry.key} chunk`.padEnd(28)} raw=${chunkEntry.rawBytes}B gzip=${chunkEntry.gzipBytes}B file=${chunkEntry.file}`,
      );
    }
    if (browserResult.guardFailures.length > 0) {
      console.log('Guard failures:');
      for (const failure of browserResult.guardFailures) {
        console.log(`- ${failure}`);
      }
    }
  }

  if (!fullResult.passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
