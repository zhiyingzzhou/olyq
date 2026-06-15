#!/usr/bin/env node
/**
 * 说明：手动校验技术栈图标 compact catalog。
 *
 * 职责：
 * - 校验本地 compact/full/coverage/missing 四个生成物的一致性；
 * - 校验 compact JSON 体积、source prefix、descriptor path 与最终 jsDelivr SVG URL；
 * - 固定关键匹配案例，防止 UmiJs、Cloudflare 父品牌和 substring 误命中回退。
 *
 * 边界：
 * - 本脚本只报告问题并失败退出，不自动修改生成物；
 * - 不接入 build/test/verify/lint/benchmark/init；
 * - 不读取 Iconify API，不执行远程 JavaScript/WASM。
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RULES_PATH = path.join(REPO_ROOT, 'public/data/technology-fingerprints/fingerprint-rules.json');
const OUTPUT_DIR = path.join(REPO_ROOT, 'public/data/technology-icons');
const COMPACT_PATH = path.join(OUTPUT_DIR, 'catalog.compact.json');
const FULL_PATH = path.join(OUTPUT_DIR, 'catalog.full.json');
const COVERAGE_PATH = path.join(OUTPUT_DIR, 'coverage.json');
const MISSING_PATH = path.join(OUTPUT_DIR, 'missing-icons.json');
const CDN_ROOT = 'https://cdn.jsdelivr.net/';
const DEFAULT_COMPACT_MAX_BYTES = 128 * 1024;

const SOURCES = {
  ts: 'gh/glincker/thesvg@v2.3.0/public/icons/',
  si: 'npm/simple-icons@16.18.1/icons/',
  di: 'npm/devicon@2.17.0/icons/',
  mit: 'npm/material-icon-theme@5.34.0/icons/',
  ski: 'gh/tandpfun/skill-icons@7f7e691e71aec64e8354bf697835e009d1ad80f8/icons/',
  tb: 'npm/@tabler/icons@3.44.0/icons/outline/',
};

const SOURCE_PATH_PATTERNS = {
  ts: /^[a-z0-9]+(?:-[a-z0-9]+)*\/(?:default|dark|light|mono|wordmark)\.svg$/,
  si: /^[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/,
  di: /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*(?:-(?:original|plain|line)(?:-wordmark)?)?\.svg$/,
  mit: /^[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/,
  ski: /^[A-Za-z0-9]+(?:-(?:Light|Dark))?\.svg$/,
  tb: /^[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/,
};

const ICON_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GENERIC_BRAND_PREFIXES = new Set([
  'a', 'an', 'the', 'app', 'apps', 'api', 'analytics', 'browser', 'cdn', 'cloud', 'cms', 'data', 'easy',
  'fast', 'js', 'javascript', 'live', 'model', 'new', 'open', 'plugin', 'plugins', 'rum', 'search',
  'simple', 'smart', 'theme', 'themes', 'web',
]);

function parseArgs() {
  const options = { compactMaxBytes: DEFAULT_COMPACT_MAX_BYTES, concurrency: 12 };
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') continue;
    if (arg.startsWith('--compact-max-kib=')) options.compactMaxBytes = Number(arg.slice('--compact-max-kib='.length)) * 1024;
    else if (arg === '--compact-max-kib') options.compactMaxBytes = Number(args[index += 1]) * 1024;
    else if (arg.startsWith('--concurrency=')) options.concurrency = Number(arg.slice('--concurrency='.length));
    else if (arg === '--concurrency') options.concurrency = Number(args[index += 1]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.compactMaxBytes) || options.compactMaxBytes < 16 * 1024) {
    throw new Error('--compact-max-kib must be at least 16');
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 32) {
    throw new Error('--concurrency must be an integer between 1 and 32');
  }
  return options;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, 'utf8'));
}

function stripDiacritics(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function splitIconWords(value, camelAware) {
  let normalized = stripDiacritics(value);
  if (camelAware) {
    normalized = normalized
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  }
  return normalized
    .replace(/\+/g, ' plus ')
    .replace(/#/g, ' sharp ')
    .replace(/&/g, ' and ')
    .replace(/\./g, ' ')
    .split(/[^a-zA-Z0-9]+/)
    .map((word) => word.toLowerCase())
    .filter(Boolean);
}

function normalizeIconKey(value) {
  const key = splitIconWords(value, true).join('-');
  return ICON_KEY_PATTERN.test(key) ? key : undefined;
}

function pushKey(keys, seen, value, reason) {
  const key = normalizeIconKey(value);
  if (!key || seen.has(key)) return;
  seen.add(key);
  keys.push({ key, reason });
}

function pushJsSuffixKey(keys, seen, key) {
  for (const suffix of ['-javascript', '-js']) {
    if (key.length > suffix.length + 2 && key.endsWith(suffix)) pushKey(keys, seen, key.slice(0, -suffix.length), 'js-suffix');
  }
  for (const suffix of ['javascript', 'js']) {
    if (!key.includes('-') && key.length > suffix.length + 2 && key.endsWith(suffix)) pushKey(keys, seen, key.slice(0, -suffix.length), 'js-suffix');
  }
}

function buildMatchKeys(rule) {
  const keys = [];
  const seen = new Set();
  const exactValues = [rule.slug, rule.name];
  for (const value of exactValues) pushKey(keys, seen, value, 'exact');
  const exactKeys = keys.filter((item) => item.reason === 'exact').map((item) => item.key);
  for (const value of exactValues) {
    const words = splitIconWords(value, true);
    if (words.length > 1 && (words.at(-1) === 'js' || words.at(-1) === 'javascript')) {
      pushKey(keys, seen, words.slice(0, -1).join('-'), 'js-suffix');
    }
  }
  for (const key of exactKeys) pushJsSuffixKey(keys, seen, key);
  for (const value of exactValues) {
    const words = splitIconWords(value, false);
    if (words.length <= 1) continue;
    const first = words[0];
    if (first.length >= 3 && !GENERIC_BRAND_PREFIXES.has(first)) pushKey(keys, seen, first, 'brand-prefix');
  }
  return keys.slice(0, 4);
}

function validateTuple(tuple, failures, label) {
  if (!Array.isArray(tuple) || tuple.length !== 2) {
    failures.push(`${label} must be [sourceId, path]`);
    return [];
  }
  const [sourceId, file] = tuple;
  if (!Object.hasOwn(SOURCES, sourceId)) failures.push(`${label} has invalid source: ${sourceId}`);
  else if (!SOURCE_PATH_PATTERNS[sourceId].test(String(file || ''))) failures.push(`${label} has invalid path: ${file}`);
  return Object.hasOwn(SOURCES, sourceId) ? [`${CDN_ROOT}${SOURCES[sourceId]}${file}`] : [];
}

function descriptorUrls(descriptor, failures, label) {
  if (Array.isArray(descriptor)) return validateTuple(descriptor, failures, label);
  if (!isRecord(descriptor)) {
    failures.push(`${label} must be descriptor`);
    return [];
  }
  const urls = [];
  for (const key of ['default', 'light', 'dark']) {
    if (descriptor[key] !== undefined) urls.push(...validateTuple(descriptor[key], failures, `${label}.${key}`));
  }
  if (urls.length < 1) failures.push(`${label} has no files`);
  return urls;
}

async function validateRemoteSvg(url) {
  let response;
  try {
    response = await fetch(url, { method: 'HEAD' });
  } catch {
    response = await fetch(url, { headers: { range: 'bytes=0-4095' } });
  }
  if (response.status === 405 || response.status === 403) {
    response = await fetch(url, { headers: { range: 'bytes=0-4095' } });
  }
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !/svg|xml/i.test(contentType)) throw new Error(`${url} -> ${response.status} ${contentType || '(no content-type)'}`);
}

async function runLimited(items, concurrency, worker) {
  const failures = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        await worker(items[index]);
      } catch (error) {
        failures.push(`${items[index]}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }));
  return failures;
}

function collectRuleCategories(rules) {
  return [...new Set(rules.flatMap((rule) => Array.isArray(rule.categories) ? rule.categories : []))]
    .filter((category) => ICON_KEY_PATTERN.test(category))
    .sort();
}

function assertRuleHit(compact, rule, expectedUrlPart, failures) {
  const hit = buildMatchKeys(rule).find((match) => compact.icons[match.key]);
  if (!hit) {
    failures.push(`${rule.name} did not resolve to a brand/technology icon`);
    return;
  }
  const urls = descriptorUrls(compact.icons[hit.key], failures, `icons.${hit.key}`);
  if (!urls.some((url) => url.includes(expectedUrlPart))) {
    failures.push(`${rule.name} resolved to ${urls.join(', ')} instead of ${expectedUrlPart}`);
  }
}

async function main() {
  const options = parseArgs();
  const [rulesBundle, compact, full, coverage, missing] = await Promise.all([
    readJson(RULES_PATH),
    readJson(COMPACT_PATH),
    readJson(FULL_PATH),
    readJson(COVERAGE_PATH),
    readJson(MISSING_PATH),
  ]);
  const failures = [];
  const compactBytes = (await fsp.readFile(COMPACT_PATH)).length;
  if (compactBytes > options.compactMaxBytes) failures.push(`catalog.compact.json ${compactBytes} bytes exceeds ${options.compactMaxBytes} bytes`);
  if (compact.schemaVersion !== 1) failures.push('compact schemaVersion must be 1');
  if (full.schemaVersion !== 1) failures.push('full schemaVersion must be 1');
  if (coverage.schemaVersion !== 1) failures.push('coverage schemaVersion must be 1');
  if (missing.schemaVersion !== 1) failures.push('missing schemaVersion must be 1');
  if (JSON.stringify(compact.sources) !== JSON.stringify(SOURCES)) failures.push('compact sources must match fixed jsDelivr prefixes');
  if (compact.iconCount !== Object.keys(compact.icons || {}).length) failures.push('compact iconCount must match icons length');
  if (full.iconCount !== compact.iconCount) failures.push('full iconCount must match compact iconCount');

  const rules = Array.isArray(rulesBundle.rules) ? rulesBundle.rules.filter((rule) => rule.status === 'active') : [];
  const categories = collectRuleCategories(rules);
  for (const category of categories) {
    if (!compact.generic?.[category]) failures.push(`generic missing category: ${category}`);
  }
  if (!compact.generic?.default) failures.push('generic missing default');
  if (coverage.visualCoveredRules !== coverage.ruleCount || coverage.visualCoveragePercent !== 100) failures.push('coverage visual coverage must be 100%');
  if (coverage.brandMatchedRules + coverage.genericCoveredRules !== coverage.ruleCount) failures.push('brandMatchedRules + genericCoveredRules must equal ruleCount');
  if (missing.brandMissingRules !== coverage.brandMissingRules) failures.push('missing brandMissingRules must match coverage');
  if (!Array.isArray(missing.missingRules) || missing.missingRules.length !== coverage.brandMissingRules) failures.push('missing rules length must match brandMissingRules');

  const urls = [];
  for (const [key, descriptor] of Object.entries(compact.icons || {})) {
    if (!ICON_KEY_PATTERN.test(key)) failures.push(`invalid icon key: ${key}`);
    urls.push(...descriptorUrls(descriptor, failures, `icons.${key}`));
  }
  for (const [category, descriptor] of Object.entries(compact.generic || {})) {
    if (category !== 'default' && !ICON_KEY_PATTERN.test(category)) failures.push(`invalid generic category: ${category}`);
    const genericUrls = validateTuple(descriptor, failures, `generic.${category}`);
    if (Array.isArray(descriptor) && descriptor[0] !== 'tb') failures.push(`generic.${category} must use Tabler source`);
    urls.push(...genericUrls);
  }

  const ruleBySlug = new Map(rules.map((rule) => [rule.slug, rule]));
  assertRuleHit(compact, ruleBySlug.get('umijs') ?? { name: 'UmiJs', slug: 'umijs', categories: ['javascript-frameworks'] }, 'npm/material-icon-theme@5.34.0/icons/umi.svg', failures);
  assertRuleHit(compact, ruleBySlug.get('cloudflare-browser-insights') ?? { name: 'Cloudflare Browser Insights', slug: 'cloudflare-browser-insights', categories: ['rum'] }, 'cloudflare', failures);
  for (const rule of [
    { name: 'Pulumi', slug: 'pulumi', categories: ['development'] },
    { name: 'Lumit', slug: 'lumit', categories: ['analytics'] },
    { name: 'YouMind', slug: 'youmind', categories: ['marketing-automation'] },
  ]) {
    if (buildMatchKeys(rule).some((item) => item.key === 'umi')) failures.push(`${rule.name} must not generate umi substring key`);
  }

  const remoteFailures = await runLimited([...new Set(urls)], options.concurrency, validateRemoteSvg);
  for (const failure of remoteFailures) failures.push(failure);

  process.stdout.write([
    'Olyq technology icon catalog verification.',
    `- compact bytes: ${compactBytes}`,
    `- icon keys: ${compact.iconCount}`,
    `- generic categories: ${Object.keys(compact.generic || {}).length - 1}`,
    `- brand coverage: ${coverage.brandMatchedRules}/${coverage.ruleCount} (${coverage.brandCoveragePercent}%)`,
    `- visual coverage: ${coverage.visualCoveredRules}/${coverage.ruleCount} (${coverage.visualCoveragePercent}%)`,
    `- checked SVG URLs: ${new Set(urls).size}`,
    `- failures: ${failures.length}`,
  ].join('\n') + '\n');
  for (const failure of failures) process.stderr.write(`FAIL ${failure}\n`);
  if (failures.length > 0) process.exitCode = 1;
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
