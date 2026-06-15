/**
 * technology-stack 真实站点准确率评测 runner。
 *
 * 说明：
 * - 这是显式网络评测命令，不进入默认 `pnpm verify`；
 * - 使用真实 Chromium + Olyq test extension 访问普通 http/https 页面；
 * - 通过 Service Worker 的 `technology-stack/refresh` 复用静态 content script、webRequest、cookies、
 *   staged full scan 和 detector 主链路；
 * - 报告只保存安全摘要，不落盘原始 HTML、脚本、CSS 或 cookie 值。
 */
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import JSZip from 'jszip';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import {
  buildTechnologyStackAccuracyReport,
  evaluateTechnologyStackGoldCase,
  renderTechnologyStackAccuracyMarkdown,
  sanitizeAccuracyTechnologies,
  validateTechnologyStackAccuracyGoldCases,
  type TechnologyStackAccuracyCoverageSiteResult,
  type TechnologyStackAccuracyGoldCase,
  type TechnologyStackAccuracyGoldCaseResult,
  type TechnologyStackAccuracySiteResult,
  type TechnologyStackAccuracySiteStatus,
  type TechnologyStackAccuracyTrancoMeta,
} from '../src/lib/technology-stack/accuracy-report';
import { buildTechnologyRulePackageFromLocalData } from './technology-stack-local-bundle';
import type { TechnologyStackResult } from '../src/lib/technology-stack/types';
import {
  TECHNOLOGY_STACK_ACCURACY_GOLD_CASE_COUNT,
  buildTechnologyStackAccuracyGoldCases,
} from './technology-stack-accuracy-gold';
import {
  parseExtensionIdFromUrl,
  resolveExtensionDistDir,
  resolveHeadlessMode,
} from '../e2e/runtime';

const SCRIPT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, '..');
const RESULTS_DIR = path.join(PACKAGE_ROOT, 'test-results', 'technology-stack-accuracy');
const TRANC0_TOP_LIST_URL = 'https://tranco-list.eu/top-1m.csv.zip';
const TRANC0_LIST_ID_URL = 'https://tranco-list.eu/top-1m-id';
const DEFAULT_GOLD_LIMIT = 200;
const DEFAULT_COVERAGE_LIMIT = 1_000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_PAGE_TIMEOUT_MS = 20_000;
const DEFAULT_SETTLE_MS = 1_200;

interface AccuracyExtensionHandle {
  context: BrowserContext;
  extensionPage: Page;
  extensionId: string;
  userDataDir: string;
}

interface TrancoSite {
  rank: number;
  domain: string;
  url: string;
}

interface TrancoDownloadResult {
  meta: TechnologyStackAccuracyTrancoMeta;
  sites: TrancoSite[];
}

interface RuntimeTechnologyStackResponse {
  ok?: boolean;
  payload?: TechnologyStackResult | null;
  error?: string;
}

/** 读取正整数环境变量。 */
function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** 等待指定毫秒。 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 判断错误是否是 Playwright 导航超时。 */
function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && /timeout/i.test(error.message);
}

/** 确保扩展构建产物存在并启动真实 Chromium 扩展上下文。 */
async function launchAccuracyExtension(): Promise<AccuracyExtensionHandle> {
  const extPath = resolveExtensionDistDir({ browser: 'chromium', preferTestBuild: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'olyq-technology-stack-accuracy-'));
  let context: BrowserContext | null = null;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: resolveHeadlessMode(),
      ignoreHTTPSErrors: true,
      args: [
        `--disable-extensions-except=${extPath}`,
        `--load-extension=${extPath}`,
      ],
    });
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 30_000 }));
    const extensionId = parseExtensionIdFromUrl(worker.url());
    if (!extensionId) {
      await context.close();
      throw new Error(`无法解析 extensionId（serviceWorkerUrl=${worker.url()}）`);
    }
    const extensionPage = await context.newPage();
    await extensionPage.goto(`chrome-extension://${extensionId}/src/extension/sidepanel/index.html`, {
      waitUntil: 'domcontentloaded',
    });
    await extensionPage.waitForFunction(() => Boolean((globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome?.runtime?.sendMessage), {
      timeout: 10_000,
    });
    return { context, extensionPage, extensionId, userDataDir };
  } catch (error) {
    if (context) {
      await context.close().catch(() => undefined);
    }
    fs.rmSync(userDataDir, { recursive: true, force: true });
    if (resolveHeadlessMode()) {
      throw new Error(
        `真实扩展准确率评测未拿到 MV3 Service Worker；当前 Chromium headless 环境可能不支持扩展。请不设置 PW_HEADLESS 后重试。原始错误：${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    throw error;
  }
}

/** 关闭真实扩展上下文并删除临时 profile。 */
async function closeAccuracyExtension(handle: AccuracyExtensionHandle): Promise<void> {
  await handle.context.close();
  fs.rmSync(handle.userDataDir, { recursive: true, force: true });
}

/** 归一化 URL 用于 tab 匹配。 */
function normalizeUrlForMatch(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    return url.toString();
  } catch {
    return rawUrl;
  }
}

/** 从扩展页查询普通网页 tabId。 */
async function resolveTabIdForPage(extensionPage: Page, finalUrl: string): Promise<number | null> {
  return await extensionPage.evaluate(async (targetUrl) => {
    const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome;
    const tabsApi = chromeApi?.tabs;
    if (!tabsApi?.query) return null;
    const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => tabsApi.query({}, (items) => resolve(items)));
    const normalize = (rawUrl: string | undefined) => {
      try {
        const url = new URL(rawUrl || '');
        url.hash = '';
        return url.toString();
      } catch {
        return rawUrl || '';
      }
    };
    const normalizedTarget = normalize(targetUrl);
    const targetOrigin = (() => {
      try {
        return new URL(targetUrl).origin;
      } catch {
        return '';
      }
    })();
    const exact = tabs.find((tab) => typeof tab.id === 'number' && normalize(tab.url) === normalizedTarget);
    if (typeof exact?.id === 'number') return exact.id;
    const sameOrigin = tabs.find((tab) => {
      if (typeof tab.id !== 'number' || !tab.url || !targetOrigin) return false;
      try {
        return new URL(tab.url).origin === targetOrigin;
      } catch {
        return false;
      }
    });
    return typeof sameOrigin?.id === 'number' ? sameOrigin.id : null;
  }, finalUrl);
}

/** 通过 Service Worker 主链路刷新指定 tab 的技术栈。 */
async function refreshTechnologyStackForTab(extensionPage: Page, tabId: number): Promise<RuntimeTechnologyStackResponse | undefined> {
  return await extensionPage.evaluate(async (targetTabId) => {
    const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome;
    if (!chromeApi?.runtime?.sendMessage) return undefined;
    return await new Promise<RuntimeTechnologyStackResponse | undefined>((resolve) => {
      chromeApi.runtime.sendMessage({
        type: 'technology-stack/refresh',
        payload: { tabId: targetTabId },
      }, (response) => {
        void chromeApi.runtime.lastError;
        resolve(response as RuntimeTechnologyStackResponse | undefined);
      });
    });
  }, tabId);
}

/** 把 detector 结果压成 accuracy report 允许保存的安全站点结果。 */
function buildSiteResult(args: {
  id: string;
  url: string;
  finalUrl?: string;
  httpStatus?: number;
  status: TechnologyStackAccuracySiteStatus;
  error?: string;
  durationMs: number;
  payload?: TechnologyStackResult | null;
}): TechnologyStackAccuracySiteResult {
  return {
    id: args.id,
    url: args.url,
    ...(args.finalUrl ? { finalUrl: args.finalUrl } : {}),
    ...(typeof args.httpStatus === 'number' ? { httpStatus: args.httpStatus } : {}),
    status: args.status,
    ...(args.error ? { error: args.error } : {}),
    durationMs: Math.max(0, Math.round(args.durationMs)),
    ...(args.payload?.scanCoverage ? { scanCoverage: args.payload.scanCoverage } : {}),
    technologies: sanitizeAccuracyTechnologies(args.payload?.technologies ?? []),
  };
}

/** 访问真实页面并通过扩展主链路检测技术栈。 */
async function evaluateUrlWithExtension(args: {
  handle: AccuracyExtensionHandle;
  id: string;
  url: string;
  pageTimeoutMs: number;
  settleMs: number;
}): Promise<TechnologyStackAccuracySiteResult> {
  const startedAt = performance.now();
  const page = await args.handle.context.newPage();
  try {
    let responseStatus: number | undefined;
    try {
      const response = await page.goto(args.url, {
        waitUntil: 'domcontentloaded',
        timeout: args.pageTimeoutMs,
      });
      responseStatus = response?.status();
    } catch (error) {
      return buildSiteResult({
        id: args.id,
        url: args.url,
        finalUrl: page.url(),
        status: isTimeoutError(error) ? 'timeout' : 'unreachable',
        error: error instanceof Error ? error.message : String(error),
        durationMs: performance.now() - startedAt,
      });
    }
    await Promise.race([
      page.waitForLoadState('networkidle', { timeout: args.settleMs }).catch(() => undefined),
      delay(args.settleMs),
    ]);
    const finalUrl = normalizeUrlForMatch(page.url());
    const tabId = await resolveTabIdForPage(args.handle.extensionPage, finalUrl);
    if (typeof tabId !== 'number') {
      return buildSiteResult({
        id: args.id,
        url: args.url,
        finalUrl,
        httpStatus: responseStatus,
        status: 'extension-error',
        error: 'tab-id-unavailable',
        durationMs: performance.now() - startedAt,
      });
    }

    let runtimeResponse = await refreshTechnologyStackForTab(args.handle.extensionPage, tabId);
    if (!runtimeResponse?.payload && runtimeResponse?.error === 'content-script-unreachable') {
      await delay(500);
      runtimeResponse = await refreshTechnologyStackForTab(args.handle.extensionPage, tabId);
    }
    const payload = runtimeResponse?.payload ?? null;
    if (!payload || payload.status === 'error' || payload.status === 'uncollectable') {
      return buildSiteResult({
        id: args.id,
        url: args.url,
        finalUrl,
        httpStatus: responseStatus,
        status: 'extension-error',
        error: runtimeResponse?.error || payload?.error || payload?.status || 'technology-stack-unavailable',
        durationMs: performance.now() - startedAt,
        payload,
      });
    }
    return buildSiteResult({
      id: args.id,
      url: args.url,
      finalUrl,
      httpStatus: responseStatus,
      status: 'ok',
      durationMs: performance.now() - startedAt,
      payload,
    });
  } finally {
    await page.close().catch(() => undefined);
  }
}

/** 并发 map，限制真实网页打开数量。 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length) as R[];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]!, index);
    }
  }));
  return results;
}

/** 下载 Tranco 最新 Top N 域名作为覆盖趋势样本。 */
async function downloadTrancoSites(limit: number): Promise<TrancoDownloadResult> {
  if (limit <= 0) {
    return {
      meta: {
        listId: 'skipped',
        downloadedAt: new Date().toISOString(),
        sourceUrl: TRANC0_TOP_LIST_URL,
        requestedSites: 0,
      },
      sites: [],
    };
  }
  const [idResponse, zipResponse] = await Promise.all([
    fetch(TRANC0_LIST_ID_URL),
    fetch(TRANC0_TOP_LIST_URL),
  ]);
  if (!idResponse.ok) throw new Error(`Tranco list id failed: HTTP ${idResponse.status}`);
  if (!zipResponse.ok) throw new Error(`Tranco list download failed: HTTP ${zipResponse.status}`);
  const listId = (await idResponse.text()).trim();
  const zip = await JSZip.loadAsync(await zipResponse.arrayBuffer());
  const csvFile = Object.values(zip.files).find((file) => file.name.endsWith('.csv') && !file.dir);
  if (!csvFile) throw new Error('Tranco zip does not contain csv file');
  const csv = await csvFile.async('string');
  const sites = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit)
    .map((line) => {
      const [rankText, domain] = line.split(',');
      const rank = Number.parseInt(rankText || '', 10);
      if (!Number.isFinite(rank) || !domain) throw new Error(`Invalid Tranco row: ${line}`);
      return { rank, domain, url: `https://${domain}/` };
    });
  return {
    meta: {
      listId,
      downloadedAt: new Date().toISOString(),
      sourceUrl: TRANC0_TOP_LIST_URL,
      requestedSites: limit,
    },
    sites,
  };
}

/** 执行金标样本评测。 */
async function evaluateGoldCases(args: {
  handle: AccuracyExtensionHandle;
  cases: readonly TechnologyStackAccuracyGoldCase[];
  concurrency: number;
  pageTimeoutMs: number;
  settleMs: number;
}): Promise<TechnologyStackAccuracyGoldCaseResult[]> {
  return await mapWithConcurrency(args.cases, args.concurrency, async (goldCase, index) => {
    const siteResult = await evaluateUrlWithExtension({
      handle: args.handle,
      id: goldCase.id,
      url: goldCase.url,
      pageTimeoutMs: args.pageTimeoutMs,
      settleMs: args.settleMs,
    });
    if ((index + 1) % 25 === 0 || index + 1 === args.cases.length) {
      console.error(`[technology-stack-accuracy] gold ${index + 1}/${args.cases.length}`);
    }
    return evaluateTechnologyStackGoldCase(goldCase, siteResult);
  });
}

/** 执行 Tranco 覆盖趋势评测。 */
async function evaluateCoverageSites(args: {
  handle: AccuracyExtensionHandle;
  sites: readonly TrancoSite[];
  concurrency: number;
  pageTimeoutMs: number;
  settleMs: number;
}): Promise<TechnologyStackAccuracyCoverageSiteResult[]> {
  return await mapWithConcurrency(args.sites, args.concurrency, async (site, index) => {
    const siteResult = await evaluateUrlWithExtension({
      handle: args.handle,
      id: `tranco-${site.rank}-${site.domain}`,
      url: site.url,
      pageTimeoutMs: args.pageTimeoutMs,
      settleMs: args.settleMs,
    });
    if ((index + 1) % 50 === 0 || index + 1 === args.sites.length) {
      console.error(`[technology-stack-accuracy] coverage ${index + 1}/${args.sites.length}`);
    }
    return {
      ...siteResult,
      rank: site.rank,
      domain: site.domain,
    };
  });
}

/** 主入口。 */
async function main(): Promise<void> {
  const goldLimit = Math.min(readPositiveIntEnv('TECHNOLOGY_STACK_ACCURACY_GOLD_LIMIT', DEFAULT_GOLD_LIMIT), DEFAULT_GOLD_LIMIT);
  const coverageLimit = readPositiveIntEnv('TECHNOLOGY_STACK_ACCURACY_COVERAGE_LIMIT', DEFAULT_COVERAGE_LIMIT);
  const concurrency = readPositiveIntEnv('TECHNOLOGY_STACK_ACCURACY_CONCURRENCY', DEFAULT_CONCURRENCY);
  const pageTimeoutMs = readPositiveIntEnv('TECHNOLOGY_STACK_ACCURACY_TIMEOUT_MS', DEFAULT_PAGE_TIMEOUT_MS);
  const settleMs = readPositiveIntEnv('TECHNOLOGY_STACK_ACCURACY_SETTLE_MS', DEFAULT_SETTLE_MS);

  const rulePackage = buildTechnologyRulePackageFromLocalData();
  const allGoldCases = buildTechnologyStackAccuracyGoldCases(rulePackage.rules);
  const schemaErrors = validateTechnologyStackAccuracyGoldCases(
    allGoldCases,
    rulePackage.rules,
    { expectedCount: TECHNOLOGY_STACK_ACCURACY_GOLD_CASE_COUNT },
  );
  const goldCases = allGoldCases.slice(0, goldLimit);
  const tranco = await downloadTrancoSites(coverageLimit);
  let handle: AccuracyExtensionHandle | null = null;
  let evaluationResults: {
    coverageResults: TechnologyStackAccuracyCoverageSiteResult[];
    goldResults: TechnologyStackAccuracyGoldCaseResult[];
  };

  try {
    handle = await launchAccuracyExtension();
    const goldResults = await evaluateGoldCases({
      handle,
      cases: goldCases,
      concurrency,
      pageTimeoutMs,
      settleMs,
    });
    const coverageResults = await evaluateCoverageSites({
      handle,
      sites: tranco.sites,
      concurrency,
      pageTimeoutMs,
      settleMs,
    });
    evaluationResults = { coverageResults, goldResults };
  } finally {
    if (handle) await closeAccuracyExtension(handle);
  }

  const report = buildTechnologyStackAccuracyReport({
    generatedAt: new Date().toISOString(),
    rulePackage: rulePackage.summary,
    goldResults: evaluationResults.goldResults,
    coverageResults: evaluationResults.coverageResults,
    tranco: tranco.meta,
    schemaErrors,
  });
  const markdown = renderTechnologyStackAccuracyMarkdown(report);
  await fsp.mkdir(RESULTS_DIR, { recursive: true });
  await fsp.writeFile(path.join(RESULTS_DIR, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fsp.writeFile(path.join(RESULTS_DIR, 'latest.md'), `${markdown}\n`, 'utf8');
  process.stdout.write(`${markdown}\n`);
  if (!report.passed) process.exitCode = 1;
}

await main().catch((error) => {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${detail}\n`);
  process.exitCode = 1;
});
