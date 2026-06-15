/**
 * 说明：technology-stack content script 采集器。
 *
 * 职责：
 * - 在 isolated world 中采集 meta、script src、inline script、CSS、DOM、文本、HTML 小样本和语言；
 * - 通过最小 web_accessible bridge 获取 allowlisted page-world window chain 信号；
 * - 给 Service Worker 返回预算内公开信号，供后台统一合并 headers/cookies/request URL 后检测。
 *
 * 边界：
 * - 不读取 cookie；
 * - 不把原始大段 HTML、CSS、脚本或可见文本送入 UI / AI；
 * - bridge 只作为扩展本地脚本注入，不加载远程代码。
 */
import { createId } from '@/lib/utils/id';
import type {
  TechnologyPageScanPlan,
  TechnologyPageSignals,
} from '@/lib/technology-stack/types';
import { collectLocalCandidateSlugs, collectLocalPatternMatches } from './technology-stack-local-patterns';

/** 采集预算。 */
const TECHNOLOGY_STACK_SIGNAL_BUDGETS = {
  maxMeta: 160,
  maxScriptSrc: 800,
  maxInlineScripts: 96,
  maxInlineScriptChars: 1_500,
  maxStylesheets: 240,
  maxCssBlocks: 96,
  maxCssBlockChars: 2_000,
  maxTextChars: 80_000,
  maxHtmlChars: 260_000,
  maxDomValueChars: 1_200,
} as const;

const BRIDGE_REQUEST_TYPE = 'olyq:technology-stack:js-signals:request';
const BRIDGE_RESPONSE_TYPE = 'olyq:technology-stack:js-signals:response';
const BRIDGE_SCRIPT_ID = '__olyq_technology_stack_bridge__';
const BRIDGE_TIMEOUT_MS = 450;
const DELAYED_JS_PASS_MS = 5_000;
const DEFAULT_DOM_SELECTORS = [
  '#root',
  '#__next',
  '#__nuxt',
  '[data-reactroot]',
  '[data-v-app]',
  '[v-cloak]',
  '[ng-version]',
  'app-root',
  '[data-wf-page]',
  '[data-wf-site]',
  'script#__NEXT_DATA__',
  'body > div::prop::_reactRootContainer',
  "link[rel='manifest']",
  "meta[property*='og:']",
];

/** 让出主线程，避免全量 selector / pattern 扫描阻塞页面交互。 */
async function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as typeof globalThis & { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (typeof scheduler?.yield === 'function') {
    await scheduler.yield();
    return;
  }
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}
const DEFAULT_JS_CHAINS = [
  'React',
  'React.version',
  '__REACT_DEVTOOLS_GLOBAL_HOOK__',
  '__NEXT_DATA__',
  'next',
  'Vue',
  '__VUE__',
  '__VUE_DEVTOOLS_GLOBAL_HOOK__',
  '__NUXT__',
  'ng',
  'jQuery',
  '$',
  'Shopify',
  'ga',
  'gtag',
  'dataLayer',
  'grecaptcha',
  'Stripe',
  'webpackChunk',
  'moment',
  'moment.version',
  'Hammer',
  'Hammer.VERSION',
  '__core-js_shared__',
  '__core-js_shared__.versions.0.version',
  '_ethers',
];

interface CachedTechnologyPageSignals {
  planKey: string;
  signals: TechnologyPageSignals;
}

let cachedFastPageSignals: CachedTechnologyPageSignals | null = null;

/**
 * 清理文本样本。
 *
 * @param value - 原始字符串。
 * @param maxChars - 最大字符数。
 * @returns 安全样本。
 */
function normalizeSample(value: string, maxChars: number): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

/**
 * 生成轻量页面指纹。
 *
 * @param input - 用于指纹的文本。
 * @returns 十六进制短指纹。
 */
function hashString(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

/** 读取 meta 键值。 */
function collectMeta(): Record<string, string> {
  const meta: Record<string, string> = {};
  const nodes = Array.from(document.querySelectorAll('meta')).slice(0, TECHNOLOGY_STACK_SIGNAL_BUDGETS.maxMeta);
  for (const node of nodes) {
    const key = (
      node.getAttribute('name')
      || node.getAttribute('property')
      || node.getAttribute('http-equiv')
      || node.getAttribute('itemprop')
      || ''
    ).trim().toLowerCase();
    if (!key) continue;
    const content = normalizeSample(node.getAttribute('content') || '', 300);
    if (!content) continue;
    meta[key] = content;
  }
  return meta;
}

/** 读取外链脚本 URL。 */
function collectScriptSrc(): string[] {
  return Array.from(document.scripts)
    .map((script) => script.src || '')
    .filter(Boolean);
}

/** 读取 inline script 小样本。 */
function collectInlineScripts(): string[] {
  const samples: string[] = [];
  for (const script of Array.from(document.scripts)) {
    if (script.src) continue;
    const text = normalizeSample(script.textContent || '', TECHNOLOGY_STACK_SIGNAL_BUDGETS.maxInlineScriptChars);
    if (!text) continue;
    samples.push(text);
    if (samples.length >= TECHNOLOGY_STACK_SIGNAL_BUDGETS.maxInlineScripts) break;
  }
  return samples;
}

/** 读取 CSS URL 与文本样本。 */
function collectCssSignals(): { stylesheetHrefs: string[]; cssText: string[] } {
  const stylesheetHrefs = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]'))
    .map((node) => node.href)
    .filter(Boolean);
  return {
    stylesheetHrefs,
    cssText: [],
  };
}

/**
 * 读取页面侧本地匹配用 CSS 文本。
 *
 * @returns CSS href、inline style 与可访问 CSSOM 规则文本；只在 content script 内消费。
 */
function collectRawCssTexts(stylesheetHrefs: string[]): string[] {
  const inlineStyleText = Array.from(document.querySelectorAll<HTMLStyleElement>('style'))
    .map((node) => normalizeSample(node.textContent || '', TECHNOLOGY_STACK_SIGNAL_BUDGETS.maxCssBlockChars))
    .filter(Boolean)
    .slice(0, TECHNOLOGY_STACK_SIGNAL_BUDGETS.maxCssBlocks);
  const ruleText: string[] = [];
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules ?? [])) {
        const text = normalizeSample(rule.cssText || '', TECHNOLOGY_STACK_SIGNAL_BUDGETS.maxCssBlockChars);
        if (text) ruleText.push(text);
        if (ruleText.length >= TECHNOLOGY_STACK_SIGNAL_BUDGETS.maxCssBlocks) break;
      }
      if (ruleText.length >= TECHNOLOGY_STACK_SIGNAL_BUDGETS.maxCssBlocks) break;
    }
  } catch {
    // 跨源 stylesheet 的 cssRules 可能被浏览器拒绝，保留 URL 与 inline style 继续探测。
  }
  return [...stylesheetHrefs, ...inlineStyleText, ...ruleText];
}

/** 读取 DOM 存在性信号。 */
function normalizeScanPlan(scanPlan?: TechnologyPageScanPlan): TechnologyPageScanPlan {
  return {
    mode: scanPlan?.mode ?? 'full',
    version: scanPlan?.version || 'fallback',
    // 规则包顺序不能决定探测能力；全量 selector / chain 由后续分批和候选过滤承载。
    domSelectors: Array.from(new Set([...DEFAULT_DOM_SELECTORS, ...(scanPlan?.domSelectors ?? [])])),
    jsChains: Array.from(new Set([...DEFAULT_JS_CHAINS, ...(scanPlan?.jsChains ?? [])])),
    quickPatterns: scanPlan?.quickPatterns ?? [],
    pagePatterns: scanPlan?.pagePatterns ?? [],
  };
}

/** 构造页面扫描计划缓存 key，确保 delayed JS 只复用同一规则计划下的 fast pass 信号。 */
function buildScanPlanCacheKey(scanPlan: TechnologyPageScanPlan): string {
  return [
    scanPlan.version,
    scanPlan.domSelectors.join('\u001f'),
    scanPlan.jsChains.join('\u001f'),
    scanPlan.quickPatterns.map((rule) => `${rule.ruleSlug}:${rule.source}:${rule.token}`).join('\u001f'),
    scanPlan.pagePatterns.map((rule) => `${rule.ruleSlug}:${rule.source}:${rule.kind}:${rule.pattern}:${rule.flags ?? ''}`).join('\u001f'),
  ].join('\u001e');
}

/**
 * 解析 DOM 扫描 key。
 *
 * @param scanKey - `selector::kind::name` 形式的扫描 key。
 * @returns 选择器、读取类型和字段名。
 */
function parseDomScanKey(scanKey: string): { selector: string; kind: string; name: string } {
  const [selector = '', kind = 'exists', ...rest] = scanKey.split('::');
  return { selector, kind, name: rest.join('::') };
}

/**
 * 读取 DOM property chain。
 *
 * @param node - 当前 DOM 节点。
 * @param propertyPath - property 或点分 chain。
 * @returns 读取到的值；不存在时返回 undefined。
 */
function readDomProperty(node: Element, propertyPath: string): unknown {
  let value: unknown = node;
  for (const part of propertyPath.split('.').filter(Boolean)) {
    if (value === null || value === undefined || (typeof value !== 'object' && typeof value !== 'function')) {
      return undefined;
    }
    if (!(part in Object(value))) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

/**
 * 把 DOM 读取值转成 detector 可消费的短标量。
 *
 * @param value - 原始 DOM 值。
 * @returns string/boolean；undefined 表示不存在。
 */
function toDomSignalValue(value: unknown): boolean | string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string' || typeof value === 'number') {
    return normalizeSample(String(value), TECHNOLOGY_STACK_SIGNAL_BUDGETS.maxDomValueChars);
  }
  return true;
}

/**
 * 聚合多节点 DOM 值。
 *
 * @param values - 当前 selector 下多个节点的值。
 * @returns detector 信号值。
 */
function aggregateDomValues(values: Array<boolean | string>): boolean | string | undefined {
  if (values.length < 1) return undefined;
  const stringValues = Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)));
  if (stringValues.length > 0) {
    return normalizeSample(stringValues.join(' '), TECHNOLOGY_STACK_SIGNAL_BUDGETS.maxDomValueChars);
  }
  return values.includes(true) ? true : values[0];
}

/** 读取 DOM 存在性、文本、属性和 property 信号。 */
async function collectDomSignals(scanPlan?: TechnologyPageScanPlan): Promise<Record<string, boolean | string>> {
  const selectors = normalizeScanPlan(scanPlan).domSelectors;
  const dom: Record<string, boolean | string> = {};
  const selectorCache = new Map<string, Element[]>();
  let workCount = 0;

  /** 按固定批次让出主线程。 */
  const tick = async (): Promise<void> => {
    workCount += 1;
    if (workCount % 64 === 0) await yieldToMain();
  };

  for (const scanKey of selectors) {
    const { selector, kind, name } = parseDomScanKey(scanKey);
    if (!selector) continue;
    try {
      let nodes = selectorCache.get(selector);
      if (!nodes) {
        nodes = Array.from(document.querySelectorAll(selector));
        selectorCache.set(selector, nodes);
      }
      await tick();
      if (nodes.length < 1) continue;
      if (kind === 'class') {
        const values: Array<boolean | string> = [];
        for (const node of nodes) {
          const className = (node as HTMLElement).className;
          const value = typeof className === 'string' ? className : node.getAttribute('class') || '';
          const normalized = toDomSignalValue(value);
          if (normalized !== undefined) values.push(normalized);
          await tick();
        }
        const aggregated = aggregateDomValues(values);
        if (aggregated !== undefined) dom[scanKey] = aggregated;
      } else if (kind === 'text') {
        const values: Array<boolean | string> = [];
        for (const node of nodes) {
          const normalized = toDomSignalValue(node.textContent || '');
          if (normalized !== undefined) values.push(normalized);
          await tick();
        }
        const aggregated = aggregateDomValues(values);
        if (aggregated !== undefined) dom[scanKey] = aggregated;
      } else if (kind === 'attr') {
        const values: Array<boolean | string> = [];
        for (const node of nodes) {
          if (!node.hasAttribute(name)) continue;
          const normalized = toDomSignalValue(node.getAttribute(name) ?? '');
          if (normalized !== undefined) values.push(normalized);
          await tick();
        }
        const aggregated = aggregateDomValues(values);
        if (aggregated !== undefined) dom[scanKey] = aggregated;
      } else if (kind === 'prop') {
        const values: Array<boolean | string> = [];
        for (const node of nodes) {
          const normalized = toDomSignalValue(readDomProperty(node, name));
          if (normalized !== undefined) values.push(normalized);
          await tick();
        }
        const aggregated = aggregateDomValues(values);
        if (aggregated !== undefined) dom[scanKey] = aggregated;
      } else {
        dom[scanKey] = true;
      }
    } catch {
      // 单个选择器失败不影响其它信号。
    }
  }
  return dom;
}

/** 注入 page-world bridge。 */
function ensureTechnologyStackBridge(): void {
  if (document.getElementById(BRIDGE_SCRIPT_ID)) return;
  const script = document.createElement('script');
  script.id = BRIDGE_SCRIPT_ID;
  script.src = chrome.runtime.getURL('technology-stack-bridge.js');
  script.async = false;
  script.onload = () => script.remove();
  (document.documentElement || document.head || document.body).appendChild(script);
}

/** 读取 page-world window chain 信号。 */
async function collectJsSignals(scanPlan?: TechnologyPageScanPlan): Promise<Record<string, boolean | string | number>> {
  ensureTechnologyStackBridge();
  const requestId = createId();
  const chains = normalizeScanPlan(scanPlan).jsChains;
  return await new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      resolve({});
    }, BRIDGE_TIMEOUT_MS);

    /**
     * 接收 bridge 返回。
     *
     * @param event - postMessage 事件。
     */
    function onMessage(event: MessageEvent) {
      if (event.source !== window) return;
      const data = event.data as { type?: unknown; requestId?: unknown; signals?: unknown } | null;
      if (!data || data.type !== BRIDGE_RESPONSE_TYPE || data.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      const rawSignals = data.signals && typeof data.signals === 'object' && !Array.isArray(data.signals)
        ? data.signals as Record<string, unknown>
        : {};
      const signals: Record<string, boolean | string | number> = {};
      for (const [key, value] of Object.entries(rawSignals)) {
        if (typeof value === 'boolean' || typeof value === 'number') {
          signals[key] = value;
        } else if (typeof value === 'string') {
          signals[key] = normalizeSample(value, 96);
        }
      }
      resolve(signals);
    }

    window.addEventListener('message', onMessage);
    window.postMessage({ type: BRIDGE_REQUEST_TYPE, requestId, chains }, '*');
  });
}

/**
 * 页面加载后追加一次 JS 读取。
 *
 * 说明：不少技术会在 hydration、异步 chunk 或 tag manager 执行后才把全局对象挂到
 * page world；延迟 pass 只补读 allowlist window chain，不重新采集正文、CSS 或 DOM。
 */
async function collectDelayedJsSignals(scanPlan?: TechnologyPageScanPlan): Promise<Record<string, boolean | string | number>> {
  if (typeof window === 'undefined') return {};
  await new Promise((resolve) => window.setTimeout(resolve, DELAYED_JS_PASS_MS));
  return collectJsSignals(scanPlan);
}

/**
 * 采集当前页面技术栈公开信号。
 *
 * @param scanPlan - Service Worker 生成的页面扫描计划。
 * @param options - 采集选项；`delayedJs` 只补读延迟 page-world JS chain。
 * @returns 页面信号 payload。
 */
export async function collectTechnologyPageSignals(
  scanPlan?: TechnologyPageScanPlan,
  options: { delayedJs?: boolean } = {},
): Promise<TechnologyPageSignals> {
  const normalizedPlan = normalizeScanPlan(scanPlan);
  const planKey = buildScanPlanCacheKey(normalizedPlan);
  const cachedSignals = cachedFastPageSignals?.planKey === planKey && cachedFastPageSignals.signals.url === location.href
    ? cachedFastPageSignals.signals
    : null;
  if (options.delayedJs && cachedSignals) {
    const delayedJs = await collectDelayedJsSignals(normalizedPlan);
    return {
      ...cachedSignals,
      title: document.title || cachedSignals.title,
      url: location.href,
      extractedAt: Date.now(),
      js: { ...cachedSignals.js, ...delayedJs },
    };
  }

  const meta = collectMeta();
  const scriptSrc = collectScriptSrc();
  const rawInlineScripts = collectInlineScripts();
  const { stylesheetHrefs, cssText } = collectCssSignals();
  const rawCssTexts = collectRawCssTexts(stylesheetHrefs);
  const rawHtml = (document.documentElement.outerHTML || '').slice(0, TECHNOLOGY_STACK_SIGNAL_BUDGETS.maxHtmlChars);
  const rawText = (document.body?.innerText || document.body?.textContent || '').slice(0, TECHNOLOGY_STACK_SIGNAL_BUDGETS.maxTextChars);
  const language = normalizeSample(
    document.documentElement.lang || meta.language || meta['og:locale'] || navigator.language || '',
    80,
  );
  const localCandidateSlugs = await collectLocalCandidateSlugs(normalizedPlan, {
    html: rawHtml,
    text: rawText,
    cssTexts: rawCssTexts,
    inlineScripts: rawInlineScripts,
  }, yieldToMain);
  const hasLocalPatterns = normalizedPlan.pagePatterns.length > 0;
  const localPatternMatches = hasLocalPatterns
    ? await collectLocalPatternMatches(normalizedPlan, {
      html: rawHtml,
      text: rawText,
      cssTexts: rawCssTexts,
      inlineScripts: rawInlineScripts,
    }, yieldToMain)
    : [];
  const dom = await collectDomSignals(normalizedPlan);
  const js = await collectJsSignals(normalizedPlan);
  const result: TechnologyPageSignals = {
    title: document.title || '',
    url: location.href,
    extractedAt: Date.now(),
    pageFingerprint: hashString([
      location.href,
      document.title,
      rawHtml.slice(0, 2_000),
      scriptSrc.join('|').slice(0, 2_000),
      language,
    ].join('\n')),
    language,
    meta,
    scriptSrc,
    inlineScript: [],
    stylesheetHrefs,
    cssText,
    dom,
    text: '',
    html: '',
    js,
    localPatternMatches,
    localCandidateSlugs,
    scanCoverage: 'complete',
  };
  cachedFastPageSignals = { planKey, signals: result };

  if (!options.delayedJs) return result;
  const delayedJs = await collectDelayedJsSignals(normalizedPlan);
  return {
    ...result,
    extractedAt: Date.now(),
    js: { ...result.js, ...delayedJs },
  };
}

/** 重置技术栈 content script 内存态，仅供单测使用。 */
export function resetTechnologyStackContentScriptRuntimeForTesting(): void {
  cachedFastPageSignals = null;
}
