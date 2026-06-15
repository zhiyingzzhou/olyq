/**
 * technology-stack benchmark runner。
 *
 * 说明：
 * - 直接驱动当前本地规则包和 detector 热路径；
 * - 固定覆盖大 DOM、大脚本列表、大 cookie 集、多第三方请求和 SPA soft route；
 * - 输出 JSON / Markdown 报告，并用预算失败阻断提交。
 *
 * 边界：
 * - 不读取远程规则库，不执行远程代码；
 * - 不读取第三方快照目录；
 * - cookie 样本只使用名称，报告不包含 cookie 原始值。
 */
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { detectTechnologyStackWithRules } from '../src/lib/technology-stack/detector';
import { buildTechnologyRulePackageFromLocalData } from './technology-stack-local-bundle';
import type { TechnologyDetectionSignals, TechnologyRule } from '../src/lib/technology-stack/types';

const SCRIPT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, '..');
const RESULTS_DIR = path.join(PACKAGE_ROOT, 'test-results', 'technology-stack-benchmark');
const BUDGETS_PATH = path.join(SCRIPT_DIR, 'technology-stack-benchmark-budgets.json');

type TechnologyStackBenchmarkScenarioId =
  | 'large-dom'
  | 'large-script-list'
  | 'large-cookie-set'
  | 'request-heavy'
  | 'spa-soft-route';

interface ScenarioBudget {
  iterations: number;
  maxMeanMs: number;
  maxP95Ms: number;
  minTechnologies: number;
  mustReportPartialCoverage: boolean;
}

type ScenarioBudgetMap = Record<TechnologyStackBenchmarkScenarioId, ScenarioBudget>;

interface RulePackageBudget {
  minFingerprints: number;
  maxColdLoadMs: number;
}

interface TechnologyStackBenchmarkSample {
  durationMs: number;
  technologyCount: number;
  scanCoverage: string;
}

interface TechnologyStackScenarioSummary {
  scenarioId: TechnologyStackBenchmarkScenarioId;
  iterations: number;
  duration: {
    meanMs: number;
    p95Ms: number;
    minMs: number;
    maxMs: number;
  };
  technologyCount: {
    min: number;
    max: number;
  };
  partialCoverageCount: number;
}

interface TechnologyStackRulePackageSummary {
  batch: string;
  snapshotVersion: string;
  total: number;
  technologyCount: number;
  coldLoadMs: number;
}

/**
 * 读取 benchmark 预算。
 *
 * @returns 技术栈 benchmark 预算。
 */
async function loadBudgets(): Promise<{ rulePackage: RulePackageBudget; scenarios: ScenarioBudgetMap }> {
  return JSON.parse(await fsp.readFile(BUDGETS_PATH, 'utf8')) as { rulePackage: RulePackageBudget; scenarios: ScenarioBudgetMap };
}

/**
 * 读取当前本地指纹规则包。
 *
 * @returns 规则包、体积和冷加载耗时摘要。
 */
async function loadRulePackageForBenchmark(): Promise<{ rules: TechnologyRule[]; summary: TechnologyStackRulePackageSummary }> {
  const startedAt = performance.now();
  const rulePackage = buildTechnologyRulePackageFromLocalData();
  const coldLoadMs = performance.now() - startedAt;
  return {
    rules: rulePackage.rules,
    summary: {
      batch: rulePackage.summary.source,
      snapshotVersion: rulePackage.summary.snapshotVersion,
      total: rulePackage.summary.total,
      technologyCount: rulePackage.summary.technologyCount,
      coldLoadMs,
    },
  };
}

/**
 * 生成重复文本。
 *
 * @param seed - 基础片段。
 * @param repeat - 重复次数。
 * @returns 重复后的字符串。
 */
function repeatText(seed: string, repeat: number): string {
  return Array.from({ length: repeat }, () => seed).join(' ');
}

/**
 * 构造基础探测信号。
 *
 * @returns 可被各场景扩展的探测信号。
 */
function createBaseSignals(): TechnologyDetectionSignals {
  return {
    page: {
      title: 'Technology Stack Benchmark',
      url: 'https://benchmark.example.com/',
      extractedAt: Date.now(),
      pageFingerprint: 'bench-base',
      language: 'en-US',
      meta: {
        generator: 'WordPress 6.5',
      },
      scriptSrc: [
        'https://cdn.example.com/_next/static/chunks/main.js',
        'https://www.googletagmanager.com/gtag/js?id=G-TEST',
        'https://www.googletagmanager.com/gtm.js?id=GTM-TEST',
        'https://js.stripe.com/v3',
        'https://www.google.com/recaptcha/api.js',
        'https://cdn.shopify.com/shopifycloud/shopify.js',
        'https://code.jquery.com/jquery-3.7.1.min.js',
        'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
      ],
      inlineScript: [
        'window.__NEXT_DATA__ = {}; window.dataLayer = window.dataLayer || []; gtag("js", new Date());',
        'window.Shopify = { theme: { name: "Benchmark" } }; window.webpackChunk = [];',
      ],
      stylesheetHrefs: [
        'https://fonts.googleapis.com/css2?family=Inter',
        'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
      ],
      cssText: [
        ':root { --tw-ring-color: rgb(59 130 246); --bs-primary: #0d6efd; } .prose { color: #111827; }',
        'https://fonts.googleapis.com/css2?family=Inter',
      ],
      dom: {
        '#__next': true,
        'script#__NEXT_DATA__': true,
        '#root': 'true',
        '[data-reactroot]': true,
      },
      text: repeatText('Benchmark page with React Next.js WordPress WooCommerce Shopify Google Analytics GTM Cloudflare nginx', 60),
      html: [
        '<html><head><meta name="generator" content="WordPress 6.5"></head><body>',
        '<div id="__next" data-reactroot class="container mx-auto bg-slate-100 dark:text-white">',
        '<script id="__NEXT_DATA__" type="application/json">{}</script>',
        '<link rel="https://api.w.org/" href="https://benchmark.example.com/wp-json/">',
        '<div class="woocommerce wc-cart-fragments">Shopify.theme</div>',
        '<script src="https://cdn.shopify.com/theme.js"></script>',
        '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-TEST"></iframe></noscript>',
        '</div></body></html>',
      ].join(''),
      js: {
        React: true,
        __NEXT_DATA__: true,
        Shopify: true,
        dataLayer: 2,
        gtag: true,
        Stripe: true,
        grecaptcha: true,
        jQuery: true,
        webpackChunk: 1,
      },
      scanCoverage: 'complete',
    },
    network: {
      headers: {
        server: 'cloudflare, nginx/1.25.3',
        'x-powered-by': 'PHP/8.3',
        link: '<https://benchmark.example.com/wp-json/>; rel="https://api.w.org/"',
        'cf-ray': 'benchmark',
        'cf-cache-status': 'HIT',
      },
      cookieNames: [
        '_ga',
        '_gid',
        '_gcl_au',
        '__cf_bm',
        'woocommerce_cart_hash',
        'wp_woocommerce_session_bench',
        'PHPSESSID',
      ],
      requestUrls: [
        'https://benchmark.example.com/wp-json/wp/v2/posts',
        'https://www.google-analytics.com/g/collect',
        'https://www.googletagmanager.com/gtm.js?id=GTM-TEST',
      ],
      updatedAt: Date.now(),
    },
  };
}

/**
 * 构造具体场景信号。
 *
 * @param scenarioId - benchmark 场景。
 * @param iteration - 当前迭代序号。
 * @returns 探测输入。
 */
function createScenarioSignals(
  scenarioId: TechnologyStackBenchmarkScenarioId,
  iteration: number,
): TechnologyDetectionSignals {
  const base = createBaseSignals();
  const route = `https://benchmark.example.com/products/${iteration % 7}`;
  if (scenarioId === 'large-dom') {
    base.page.html += repeatText('<section class="container mx-auto text-lg bg-blue-100 wp-content woocommerce">content</section>', 180);
    base.page.text += repeatText('visible benchmark content for large dom', 300);
    base.page.pageFingerprint = `bench-large-dom-${iteration}`;
    return base;
  }

  if (scenarioId === 'large-script-list') {
    base.page.scriptSrc.push(
      ...Array.from({ length: 180 }, (_, index) => `https://cdn.example.com/assets/chunk.${String(index).padStart(3, '0')}.abcdef12.js`),
      'https://cdn.example.com/_nuxt/app.js',
      'https://cdn.example.com/vue.global.prod.js',
    );
    base.page.html += '<div id="__nuxt" data-v-app></div>';
    base.page.js = { ...base.page.js, Vue: true, __NUXT__: true };
    base.page.pageFingerprint = `bench-large-script-list-${iteration}`;
    return base;
  }

  if (scenarioId === 'large-cookie-set') {
    base.network.cookieNames.push(
      ...Array.from({ length: 120 }, (_, index) => `bench_cookie_${index}`),
      'laravel_session',
      'XSRF-TOKEN',
      'csrftoken',
      'sessionid',
      '_shopify_y',
      'cart_currency',
    );
    base.network.headers['x-frame-options'] = 'SAMEORIGIN';
    base.page.pageFingerprint = `bench-large-cookie-set-${iteration}`;
    return base;
  }

  if (scenarioId === 'request-heavy') {
    base.network.requestUrls.push(
      ...Array.from({ length: 220 }, (_, index) => `https://api.benchmark.example.com/v1/events/${index}?source=xhr-tech`),
      'https://benchmark.example.com/wp-json/wc/store/cart',
      'https://www.google-analytics.com/collect',
      'https://js.stripe.com/v3',
    );
    base.page.pageFingerprint = `bench-request-heavy-${iteration}`;
    return base;
  }

  base.page.url = route;
  base.page.pageFingerprint = `bench-spa-soft-route-${iteration % 3}`;
  base.page.html += `<main data-route="${route}"><app-root ng-version="17.0.0"></app-root><div data-wf-page="abc" data-wf-site="def"></div></main>`;
  base.page.dom = {
    ...base.page.dom,
    '[ng-version]': true,
    'app-root': true,
    '[data-wf-page]': true,
    '[data-wf-site]': true,
  };
  base.page.js = { ...base.page.js, ng: true };
  base.network.requestUrls.push(`${route}?analytics=gtag`);
  return base;
}

/**
 * 计算分位和均值。
 *
 * @param values - 数值数组。
 * @returns 均值、p95、最小值和最大值。
 */
function summarizeValues(values: number[]): TechnologyStackScenarioSummary['duration'] {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length < 1) return { meanMs: 0, p95Ms: 0, minMs: 0, maxMs: 0 };
  const meanMs = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    meanMs,
    p95Ms: sorted[p95Index] ?? 0,
    minMs: sorted[0] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
}

/**
 * 执行单个 benchmark 场景。
 *
 * @param scenarioId - 场景 ID。
 * @param budget - 预算。
 * @returns 场景摘要。
 */
function runScenario(
  scenarioId: TechnologyStackBenchmarkScenarioId,
  budget: ScenarioBudget,
  rules: readonly TechnologyRule[],
): TechnologyStackScenarioSummary {
  const samples: TechnologyStackBenchmarkSample[] = [];
  for (let index = 0; index < budget.iterations; index += 1) {
    const startedAt = performance.now();
    const result = detectTechnologyStackWithRules(createScenarioSignals(scenarioId, index), rules);
    const durationMs = performance.now() - startedAt;
    samples.push({
      durationMs,
      technologyCount: result.technologies.length,
      scanCoverage: result.scanCoverage,
    });
  }
  const counts = samples.map((sample) => sample.technologyCount);
  return {
    scenarioId,
    iterations: samples.length,
    duration: summarizeValues(samples.map((sample) => sample.durationMs)),
    technologyCount: {
      min: Math.min(...counts),
      max: Math.max(...counts),
    },
    partialCoverageCount: 0,
  };
}

/**
 * 检查场景预算。
 *
 * @param summary - 场景摘要。
 * @param budget - 场景预算。
 * @returns 失败信息。
 */
function evaluateBudget(summary: TechnologyStackScenarioSummary, budget: ScenarioBudget): string[] {
  const failures: string[] = [];
  if (summary.duration.meanMs > budget.maxMeanMs) {
    failures.push(`${summary.scenarioId} mean=${summary.duration.meanMs.toFixed(2)}ms 超过预算 ${budget.maxMeanMs}ms`);
  }
  if (summary.duration.p95Ms > budget.maxP95Ms) {
    failures.push(`${summary.scenarioId} p95=${summary.duration.p95Ms.toFixed(2)}ms 超过预算 ${budget.maxP95Ms}ms`);
  }
  if (summary.technologyCount.min < budget.minTechnologies) {
    failures.push(`${summary.scenarioId} technologyCount min=${summary.technologyCount.min} 低于预算 ${budget.minTechnologies}`);
  }
  if (budget.mustReportPartialCoverage && summary.partialCoverageCount < 1) {
    failures.push(`${summary.scenarioId} 应报告 partial coverage，但当前为 0`);
  }
  return failures;
}

/**
 * 检查规则包预算。
 *
 * @param summary - 规则包摘要。
 * @param budget - 规则包预算。
 * @returns 失败信息。
 */
function evaluateRulePackageBudget(
  summary: TechnologyStackRulePackageSummary,
  budget: RulePackageBudget,
): string[] {
  const failures: string[] = [];
  if (summary.batch !== 'local-fingerprint-snapshot') failures.push(`rule package batch=${summary.batch} 不是 local-fingerprint-snapshot`);
  if (summary.total < budget.minFingerprints) {
    failures.push(`fingerprints=${summary.total} 低于最小预算 ${budget.minFingerprints}`);
  }
  if (summary.coldLoadMs > budget.maxColdLoadMs) {
    failures.push(`rule package coldLoad=${summary.coldLoadMs.toFixed(2)}ms 超过预算 ${budget.maxColdLoadMs}ms`);
  }
  return failures;
}

/**
 * 渲染 Markdown 报告。
 *
 * @param generatedAt - 生成时间。
 * @param summaries - 场景摘要。
 * @param failures - 失败信息。
 * @returns Markdown 文本。
 */
function renderMarkdownReport(
  generatedAt: string,
  rulePackage: TechnologyStackRulePackageSummary,
  summaries: TechnologyStackScenarioSummary[],
  failures: string[],
): string {
  const lines = [
    '# Technology Stack Benchmark',
    '',
    `- 生成时间：${generatedAt}`,
    `- 总体结论：${failures.length < 1 ? 'PASS' : 'FAIL'}`,
    `- 规则包：${rulePackage.batch}，snapshot ${rulePackage.snapshotVersion}，fingerprints ${rulePackage.total} / technologies ${rulePackage.technologyCount}`,
    `- 规则包冷加载：${rulePackage.coldLoadMs.toFixed(2)}ms`,
    '',
  ];

  for (const summary of summaries) {
    lines.push(`## ${summary.scenarioId}`);
    lines.push('');
    lines.push(`- iterations: ${summary.iterations}`);
    lines.push(`- duration mean/p95: ${summary.duration.meanMs.toFixed(2)}ms / ${summary.duration.p95Ms.toFixed(2)}ms`);
    lines.push(`- duration min/max: ${summary.duration.minMs.toFixed(2)}ms / ${summary.duration.maxMs.toFixed(2)}ms`);
    lines.push(`- technology count min/max: ${summary.technologyCount.min} / ${summary.technologyCount.max}`);
    lines.push(`- partial coverage count: ${summary.partialCoverageCount}`);
    lines.push('');
  }

  if (failures.length > 0) {
    lines.push('## Failures');
    lines.push('');
    for (const failure of failures) lines.push(`- ${failure}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 主入口。
 */
async function main(): Promise<void> {
  const budgets = await loadBudgets();
  const rulePackage = await loadRulePackageForBenchmark();
  const scenarioIds = Object.keys(budgets.scenarios) as TechnologyStackBenchmarkScenarioId[];
  const summaries = scenarioIds.map((scenarioId) => runScenario(scenarioId, budgets.scenarios[scenarioId], rulePackage.rules));
  const failures = [
    ...evaluateRulePackageBudget(rulePackage.summary, budgets.rulePackage),
    ...summaries.flatMap((summary) => evaluateBudget(summary, budgets.scenarios[summary.scenarioId])),
  ];
  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    passed: failures.length < 1,
    failures,
    rulePackage: rulePackage.summary,
    summaries,
  };
  const markdown = renderMarkdownReport(generatedAt, rulePackage.summary, summaries, failures);

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
