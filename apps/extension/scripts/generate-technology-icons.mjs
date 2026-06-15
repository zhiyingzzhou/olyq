#!/usr/bin/env node
/**
 * 说明：手动生成技术栈图标 compact catalog。
 *
 * 职责：
 * - 读取本地技术栈规则包，按确定性 key 匹配固定版本开源 SVG 源；
 * - 为品牌/技术图标写入一个最佳 compact descriptor；
 * - 为品牌未命中的技术保留 coverage/missing 报告，并通过 Tabler generic 分类图标实现视觉覆盖。
 *
 * 边界：
 * - 本脚本只供人工执行，不接入 build/test/verify/lint/benchmark/init；
 * - 运行时不消费本脚本读取的上游 catalog，也不动态探测远程 URL；
 * - 不使用 favicon、Logo SaaS、WorldVectorLogo、品牌官网抓取或手写假 logo。
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_RULE_BUNDLE = path.join(REPO_ROOT, 'public/data/technology-fingerprints/fingerprint-rules.json');
const OUTPUT_DIR = path.join(REPO_ROOT, 'public/data/technology-icons');
const COMPACT_PATH = path.join(OUTPUT_DIR, 'catalog.compact.json');
const FULL_PATH = path.join(OUTPUT_DIR, 'catalog.full.json');
const COVERAGE_PATH = path.join(OUTPUT_DIR, 'coverage.json');
const MISSING_PATH = path.join(OUTPUT_DIR, 'missing-icons.json');
const DEFAULT_COMPACT_MAX_BYTES = 128 * 1024;
const CDN_ROOT = 'https://cdn.jsdelivr.net/';

const SOURCES = {
  ts: {
    provider: 'theSVG',
    prefix: 'gh/glincker/thesvg@v2.3.0/public/icons/',
    license: 'MIT',
    catalogUrl: 'https://data.jsdelivr.com/v1/package/gh/glincker/thesvg@v2.3.0/flat',
  },
  si: {
    provider: 'simple-icons',
    prefix: 'npm/simple-icons@16.18.1/icons/',
    license: 'CC0-1.0',
    licenseNote: 'Brand trademarks remain owned by their respective owners.',
    catalogUrl: 'https://data.jsdelivr.com/v1/package/npm/simple-icons@16.18.1/flat',
  },
  di: {
    provider: 'devicon',
    prefix: 'npm/devicon@2.17.0/icons/',
    license: 'MIT',
    catalogUrl: 'https://data.jsdelivr.com/v1/package/npm/devicon@2.17.0/flat',
  },
  mit: {
    provider: 'material-icon-theme',
    prefix: 'npm/material-icon-theme@5.34.0/icons/',
    license: 'MIT',
    catalogUrl: 'https://data.jsdelivr.com/v1/package/npm/material-icon-theme@5.34.0/flat',
  },
  ski: {
    provider: 'skill-icons',
    prefix: 'gh/tandpfun/skill-icons@7f7e691e71aec64e8354bf697835e009d1ad80f8/icons/',
    license: 'MIT',
    catalogUrl: 'https://data.jsdelivr.com/v1/package/gh/tandpfun/skill-icons@7f7e691e71aec64e8354bf697835e009d1ad80f8/flat',
  },
  tb: {
    provider: 'Tabler Icons',
    prefix: 'npm/@tabler/icons@3.44.0/icons/outline/',
    license: 'MIT',
  },
};

const SOURCE_ORDER = ['ts', 'si', 'di', 'mit', 'ski'];
const ICON_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GENERIC_NOTE = 'Generic category icon; not a brand logo.';
const GENERIC_BRAND_PREFIXES = new Set([
  'a',
  'an',
  'the',
  'app',
  'apps',
  'api',
  'analytics',
  'browser',
  'cdn',
  'cloud',
  'cms',
  'data',
  'easy',
  'fast',
  'js',
  'javascript',
  'live',
  'model',
  'new',
  'open',
  'plugin',
  'plugins',
  'rum',
  'search',
  'simple',
  'smart',
  'theme',
  'themes',
  'web',
]);

const SKILL_ICON_ACRONYMS = {
  ai: 'AI',
  api: 'API',
  aws: 'AWS',
  cdn: 'CDN',
  cli: 'CLI',
  cms: 'CMS',
  css: 'CSS',
  gcp: 'GCP',
  html: 'HTML',
  http: 'HTTP',
  js: 'JS',
  json: 'JSON',
  ml: 'ML',
  php: 'PHP',
  sql: 'SQL',
  svg: 'SVG',
  ui: 'UI',
  xml: 'XML',
};

const GENERIC_CATEGORY_ICON_BY_CATEGORY = {
  'a-b-testing': 'chart-dots',
  accessibility: 'certificate',
  accounting: 'building-bank',
  advertising: 'speakerphone',
  'affiliate-programs': 'affiliate',
  analytics: 'chart-line',
  'appointment-scheduling': 'calendar-time',
  'augmented-reality': 'augmented-reality',
  authentication: 'lock',
  blogs: 'news',
  'browser-fingerprinting': 'device-analytics',
  'buy-now-pay-later': 'credit-card',
  caching: 'server',
  'cart-abandonment': 'shopping-cart',
  cdn: 'cloud',
  ci: 'arrows-exchange',
  cms: 'template',
  'comment-systems': 'message-circle',
  containers: 'packages',
  'content-curation': 'list-search',
  'control-systems': 'settings',
  'cookie-compliance': 'cookie',
  crm: 'users',
  'cross-border-ecommerce': 'world-www',
  cryptominers: 'cpu',
  'customer-data-platform': 'database',
  'database-managers': 'database',
  databases: 'database',
  development: 'code',
  'digital-asset-management': 'photo',
  dms: 'file-text',
  documentation: 'book',
  'domain-parking': 'world-www',
  ecommerce: 'shopping-cart',
  'ecommerce-frontends': 'building-store',
  editors: 'brush',
  email: 'mail',
  'feature-management': 'settings',
  'feed-readers': 'rss',
  'font-scripts': 'file-code',
  'form-builders': 'forms',
  fulfilment: 'truck-delivery',
  'fundraising-and-donations': 'heart-handshake',
  geolocation: 'map-pin',
  hosting: 'cloud',
  'hosting-panels': 'layout-dashboard',
  iaas: 'server',
  'issue-trackers': 'list-search',
  'javascript-frameworks': 'code',
  'javascript-graphics': 'chart-arcs',
  'javascript-libraries': 'file-code',
  'live-chat': 'message-circle',
  livestreaming: 'player-play',
  lms: 'school',
  'load-balancers': 'arrows-exchange',
  'loyalty-and-rewards': 'star',
  maps: 'map',
  'marketing-automation': 'speakerphone',
  'media-servers': 'video',
  'message-boards': 'messages',
  miscellaneous: 'puzzle',
  'mobile-frameworks': 'device-mobile',
  'network-devices': 'server',
  'network-storage': 'database',
  'operating-systems': 'device-desktop',
  paas: 'cloud',
  'page-builders': 'layout-grid',
  'payment-processors': 'credit-card',
  performance: 'chart-line',
  personalization: 'wand',
  'photo-galleries': 'photo',
  'programming-languages': 'file-code',
  'recruitment-and-staffing': 'briefcase',
  'referral-marketing': 'user-plus',
  'remote-access': 'device-desktop',
  'reservations-and-delivery': 'calendar-time',
  retargeting: 'arrows-exchange',
  returns: 'truck',
  'reverse-proxies': 'server',
  reviews: 'star',
  'rich-text-editors': 'file-text',
  rum: 'device-analytics',
  'search-engines': 'search',
  security: 'shield-check',
  segmentation: 'chart-pie',
  seo: 'search',
  'shipping-carriers': 'truck-delivery',
  'shopify-apps': 'shopping-bag',
  'shopify-themes': 'building-store',
  'ssl-tls-certificate-authorities': 'certificate',
  'static-site-generator': 'template',
  surveys: 'forms',
  'tag-managers': 'tag',
  'ticket-booking': 'calendar-time',
  translation: 'language',
  'ui-frameworks': 'brush',
  'user-onboarding': 'user-plus',
  'video-players': 'video',
  'web-frameworks': 'window',
  'web-server-extensions': 'puzzle',
  'web-servers': 'server',
  webmail: 'mail-fast',
  widgets: 'puzzle',
  wikis: 'book',
  'wordpress-plugins': 'puzzle',
  'wordpress-themes': 'brand-wordpress',
};

function parseArgs() {
  const options = {
    rules: DEFAULT_RULE_BUNDLE,
    compactMaxBytes: DEFAULT_COMPACT_MAX_BYTES,
    concurrency: 12,
  };
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') continue;
    if (arg.startsWith('--rules=')) options.rules = path.resolve(arg.slice('--rules='.length));
    else if (arg === '--rules') options.rules = path.resolve(args[index += 1]);
    else if (arg.startsWith('--compact-max-kib=')) options.compactMaxBytes = Number(arg.slice('--compact-max-kib='.length)) * 1024;
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
    if (key.length > suffix.length + 2 && key.endsWith(suffix)) {
      pushKey(keys, seen, key.slice(0, -suffix.length), 'js-suffix');
    }
  }
  for (const suffix of ['javascript', 'js']) {
    if (!key.includes('-') && key.length > suffix.length + 2 && key.endsWith(suffix)) {
      pushKey(keys, seen, key.slice(0, -suffix.length), 'js-suffix');
    }
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
    if (first.length >= 3 && !GENERIC_BRAND_PREFIXES.has(first)) {
      pushKey(keys, seen, first, 'brand-prefix');
    }
  }
  return keys.slice(0, 4);
}

function buildSkillIconFileBase(key) {
  const normalized = normalizeIconKey(key);
  if (!normalized) return undefined;
  return normalized
    .split('-')
    .map((word) => SKILL_ICON_ACRONYMS[word] ?? `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join('');
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
  return response.json();
}

async function readRules(filePath) {
  const bundle = JSON.parse(await fsp.readFile(filePath, 'utf8'));
  const rules = Array.isArray(bundle.rules) ? bundle.rules.filter((rule) => rule.status === 'active') : [];
  return { bundle, rules };
}

function normalizeFlatName(file) {
  return String(file?.name || '').replace(/^\/+/, '');
}

function chooseDeviconFile(files) {
  const preference = [
    /-original\.svg$/,
    /-plain\.svg$/,
    /-line\.svg$/,
    /-original-wordmark\.svg$/,
    /-plain-wordmark\.svg$/,
  ];
  for (const pattern of preference) {
    const file = files.find((item) => pattern.test(item));
    if (file) return file;
  }
  return files.find((item) => !/-wordmark\.svg$/.test(item)) ?? files[0];
}

async function loadCatalogs() {
  const [theSvgFlat, simpleIconsFlat, deviconFlat, materialIconThemeFlat, skillIconsFlat] = await Promise.all([
    fetchJson(SOURCES.ts.catalogUrl),
    fetchJson(SOURCES.si.catalogUrl),
    fetchJson(SOURCES.di.catalogUrl),
    fetchJson(SOURCES.mit.catalogUrl),
    fetchJson(SOURCES.ski.catalogUrl),
  ]);

  const thesvg = new Map();
  for (const file of theSvgFlat.files ?? []) {
    const match = normalizeFlatName(file).match(/^public\/icons\/([^/]+)\/default\.svg$/);
    if (match) thesvg.set(match[1], [match[1], 'default.svg'].join('/'));
  }

  const simpleIcons = new Map();
  for (const file of simpleIconsFlat.files ?? []) {
    const match = normalizeFlatName(file).match(/^icons\/([a-z0-9-]+)\.svg$/);
    if (match) simpleIcons.set(match[1], `${match[1]}.svg`);
  }

  const deviconGroups = new Map();
  for (const file of deviconFlat.files ?? []) {
    const match = normalizeFlatName(file).match(/^icons\/([^/]+)\/([^/]+\.svg)$/);
    if (!match) continue;
    const folder = match[1];
    deviconGroups.set(folder, [...(deviconGroups.get(folder) ?? []), `${folder}/${match[2]}`]);
  }
  const devicon = new Map();
  for (const [folder, files] of deviconGroups) {
    const chosen = chooseDeviconFile(files);
    if (chosen) devicon.set(folder, chosen);
  }

  const materialIconTheme = new Map();
  for (const file of materialIconThemeFlat.files ?? []) {
    const match = normalizeFlatName(file).match(/^icons\/([a-z0-9-]+)\.svg$/);
    if (match) materialIconTheme.set(match[1], `${match[1]}.svg`);
  }

  const skillIconsFiles = new Set();
  for (const file of skillIconsFlat.files ?? []) {
    const match = normalizeFlatName(file).match(/^icons\/([A-Za-z0-9][A-Za-z0-9-]*\.svg)$/);
    if (match) skillIconsFiles.add(match[1]);
  }

  return { thesvg, simpleIcons, devicon, materialIconTheme, skillIconsFiles };
}

function sourceUrl(tuple) {
  return `${CDN_ROOT}${SOURCES[tuple[0]].prefix}${tuple[1]}`;
}

function findCandidate(key, catalogs) {
  if (catalogs.thesvg.has(key)) return { key, sourceId: 'ts', descriptor: ['ts', catalogs.thesvg.get(key)] };
  if (catalogs.simpleIcons.has(key)) return { key, sourceId: 'si', descriptor: ['si', catalogs.simpleIcons.get(key)] };
  if (catalogs.devicon.has(key)) return { key, sourceId: 'di', descriptor: ['di', catalogs.devicon.get(key)] };
  if (catalogs.materialIconTheme.has(key)) return { key, sourceId: 'mit', descriptor: ['mit', catalogs.materialIconTheme.get(key)] };

  const skillBase = buildSkillIconFileBase(key);
  if (skillBase) {
    const light = `${skillBase}-Light.svg`;
    const dark = `${skillBase}-Dark.svg`;
    const plain = `${skillBase}.svg`;
    if (catalogs.skillIconsFiles.has(light) || catalogs.skillIconsFiles.has(dark)) {
      return {
        key,
        sourceId: 'ski',
        descriptor: {
          ...(catalogs.skillIconsFiles.has(light) ? { light: ['ski', light] } : {}),
          ...(catalogs.skillIconsFiles.has(dark) ? { dark: ['ski', dark] } : {}),
        },
      };
    }
    if (catalogs.skillIconsFiles.has(plain)) return { key, sourceId: 'ski', descriptor: ['ski', plain] };
  }
  return null;
}

function descriptorTuples(descriptor) {
  return Array.isArray(descriptor)
    ? [descriptor]
    : Object.values(descriptor);
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
  if (!response.ok || !/svg|xml/i.test(contentType)) {
    throw new Error(`${url} -> ${response.status} ${contentType || '(no content-type)'}`);
  }
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

function buildGenericMap(categories) {
  const generic = { default: ['tb', 'code.svg'] };
  for (const category of categories) {
    generic[category] = ['tb', `${GENERIC_CATEGORY_ICON_BY_CATEGORY[category] ?? 'code'}.svg`];
  }
  return generic;
}

function resolveGenericForRule(rule, generic) {
  const categories = Array.isArray(rule.categories) ? rule.categories : [];
  const category = categories.find((item) => generic[item]) ?? null;
  const descriptor = category ? generic[category] : generic.default;
  return {
    note: GENERIC_NOTE,
    category,
    descriptor,
    url: sourceUrl(descriptor),
  };
}

function collectIcons(rules, catalogs) {
  const icons = {};
  const fullIcons = {};
  const providerCounts = {};
  const reasonCounts = { exact: 0, 'js-suffix': 0, 'brand-prefix': 0 };

  for (const rule of rules) {
    for (const match of buildMatchKeys(rule)) {
      if (icons[match.key]) continue;
      const candidate = findCandidate(match.key, catalogs);
      if (!candidate) continue;
      icons[match.key] = candidate.descriptor;
      providerCounts[SOURCES[candidate.sourceId].provider] = (providerCounts[SOURCES[candidate.sourceId].provider] ?? 0) + 1;
      reasonCounts[match.reason] = (reasonCounts[match.reason] ?? 0) + 1;
      fullIcons[match.key] = {
        key: match.key,
        provider: SOURCES[candidate.sourceId].provider,
        sourceId: candidate.sourceId,
        license: SOURCES[candidate.sourceId].license,
        licenseNote: SOURCES[candidate.sourceId].licenseNote ?? null,
        descriptor: candidate.descriptor,
        urls: descriptorTuples(candidate.descriptor).map(sourceUrl),
        matchedRuleSlug: rule.slug,
        matchedRuleName: rule.name,
        matchReason: match.reason,
      };
      break;
    }
  }

  return { icons, fullIcons, providerCounts, reasonCounts };
}

function buildCoverage(rules, icons, fullIcons, generic, sourceRules) {
  const matchedRules = [];
  const missingRules = [];
  const missingCategoryCounts = {};
  const ruleHitReasonCounts = { exact: 0, 'js-suffix': 0, 'brand-prefix': 0 };
  for (const rule of rules) {
    const keys = buildMatchKeys(rule);
    const hit = keys.find((match) => icons[match.key]);
    if (hit) {
      ruleHitReasonCounts[hit.reason] = (ruleHitReasonCounts[hit.reason] ?? 0) + 1;
      matchedRules.push({
        slug: rule.slug,
        name: rule.name,
        hitKey: hit.key,
        matchReason: hit.reason,
        provider: fullIcons[hit.key]?.provider,
      });
      continue;
    }
    const categories = Array.isArray(rule.categories) ? rule.categories : [];
    for (const category of categories) missingCategoryCounts[category] = (missingCategoryCounts[category] ?? 0) + 1;
    missingRules.push({
      slug: rule.slug,
      name: rule.name,
      categories,
      keys: keys.map((item) => item.key),
      generic: resolveGenericForRule(rule, generic),
    });
  }
  const ruleCount = rules.length;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceRules,
    ruleCount,
    iconCount: Object.keys(icons).length,
    brandMatchedRules: matchedRules.length,
    brandMissingRules: missingRules.length,
    genericCoveredRules: missingRules.length,
    visualCoveredRules: ruleCount,
    visualCoveragePercent: ruleCount > 0 ? 100 : 0,
    brandCoveragePercent: ruleCount > 0 ? Number(((matchedRules.length / ruleCount) * 100).toFixed(2)) : 0,
    ruleHitReasonCounts,
    topMissingCategories: Object.entries(missingCategoryCounts)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 30)
      .map(([category, count]) => ({ category, count })),
    matchedRules,
    missingRules,
  };
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

async function main() {
  const options = parseArgs();
  const { bundle, rules } = await readRules(options.rules);
  const catalogs = await loadCatalogs();
  const categories = collectRuleCategories(rules);
  const generic = buildGenericMap(categories);
  const { icons, fullIcons, providerCounts, reasonCounts } = collectIcons(rules, catalogs);
  const sources = Object.fromEntries(Object.entries(SOURCES).map(([id, source]) => [id, source.prefix]));
  const sourceRules = {
    path: path.relative(REPO_ROOT, options.rules),
    snapshotVersion: typeof bundle.snapshotVersion === 'string' ? bundle.snapshotVersion : null,
    generatedAt: typeof bundle.generatedAt === 'string' ? bundle.generatedAt : null,
    ruleCount: rules.length,
    technologyCount: Number.isInteger(bundle.technologyCount) ? bundle.technologyCount : rules.length,
    categoryCount: Number.isInteger(bundle.categoryCount) ? bundle.categoryCount : categories.length,
  };
  const compact = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceRules,
    iconCount: Object.keys(icons).length,
    sources,
    icons: sortObject(icons),
    generic: sortObject(generic),
  };
  const full = {
    schemaVersion: 1,
    generatedAt: compact.generatedAt,
    sourceRules,
    sources: Object.fromEntries(Object.entries(SOURCES).map(([id, source]) => [id, {
      provider: source.provider,
      prefix: source.prefix,
      license: source.license,
      licenseNote: source.licenseNote ?? null,
    }])),
    iconCount: compact.iconCount,
    providerCounts: sortObject(providerCounts),
    iconMatchReasonCounts: reasonCounts,
    icons: Object.values(sortObject(fullIcons)),
    generic: {
      note: GENERIC_NOTE,
      provider: SOURCES.tb.provider,
      sourceId: 'tb',
      license: SOURCES.tb.license,
      descriptors: compact.generic,
    },
  };
  const coverage = buildCoverage(rules, compact.icons, fullIcons, compact.generic, sourceRules);
  const missing = {
    schemaVersion: 1,
    generatedAt: coverage.generatedAt,
    sourceRules,
    brandMissingRules: coverage.brandMissingRules,
    genericCoveredRules: coverage.genericCoveredRules,
    visualCoveredRules: coverage.visualCoveredRules,
    visualCoveragePercent: coverage.visualCoveragePercent,
    missingRules: coverage.missingRules,
  };

  const tuples = [
    ...Object.values(compact.icons).flatMap(descriptorTuples),
    ...Object.values(compact.generic),
  ];
  const uniqueUrls = [...new Set(tuples.map(sourceUrl))];
  const validationFailures = await runLimited(uniqueUrls, options.concurrency, validateRemoteSvg);
  if (validationFailures.length > 0) {
    throw new Error(`SVG validation failed:\n${validationFailures.slice(0, 20).join('\n')}`);
  }

  const compactText = `${JSON.stringify(compact, null, 2)}\n`;
  if (Buffer.byteLength(compactText, 'utf8') > options.compactMaxBytes) {
    throw new Error(`catalog.compact.json ${Buffer.byteLength(compactText, 'utf8')} bytes exceeds ${options.compactMaxBytes} bytes`);
  }

  await fsp.mkdir(OUTPUT_DIR, { recursive: true });
  await fsp.writeFile(COMPACT_PATH, compactText);
  await fsp.writeFile(FULL_PATH, `${JSON.stringify(full, null, 2)}\n`);
  await fsp.writeFile(COVERAGE_PATH, `${JSON.stringify({ ...coverage, missingRules: undefined }, null, 2)}\n`);
  await fsp.writeFile(MISSING_PATH, `${JSON.stringify(missing, null, 2)}\n`);

  process.stdout.write([
    'Olyq technology icon catalog generated.',
    `- rules: ${rules.length}`,
    `- icon keys: ${compact.iconCount}`,
    `- brand coverage: ${coverage.brandMatchedRules}/${coverage.ruleCount} (${coverage.brandCoveragePercent}%)`,
    `- visual coverage: ${coverage.visualCoveredRules}/${coverage.ruleCount} (${coverage.visualCoveragePercent}%)`,
    `- compact: ${path.relative(process.cwd(), COMPACT_PATH)} ${Buffer.byteLength(compactText, 'utf8')} bytes gzip ${zlib.gzipSync(compactText).length} bytes`,
    `- full: ${path.relative(process.cwd(), FULL_PATH)}`,
    `- missing: ${path.relative(process.cwd(), MISSING_PATH)}`,
  ].join('\n') + '\n');
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
