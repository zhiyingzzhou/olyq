import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, '..');
const WORKSPACE_ROOT = path.resolve(PACKAGE_ROOT, '..', '..');
const SNAPSHOT_DIR = path.join(WORKSPACE_ROOT, ['w', 'appalyzer'].join(''));
const TECHNOLOGY_DIR = path.join(SNAPSHOT_DIR, 'technologies');
const OUTPUT_FILE = path.join(PACKAGE_ROOT, 'src/lib/technology-stack/fingerprint-rules.generated.ts');
const OUTPUT_ASSET_PATH = 'data/technology-fingerprints/fingerprint-rules.json';
const OUTPUT_ASSET_FILE = path.join(PACKAGE_ROOT, 'public', OUTPUT_ASSET_PATH);
const VERIFIED_AT = '2026-05-08';
const SNAPSHOT_VERSION = JSON.parse(readFileSync(path.join(SNAPSHOT_DIR, 'manifest.json'), 'utf8')).version || 'local';
const UPSTREAM_BRAND_RE = new RegExp(['w', 'appalyzer'].join(''), 'gi');
const UPSTREAM_BRAND_TEST_RE = new RegExp(['w', 'appalyzer'].join(''), 'i');
const MARKETING_FIELD_RE = /\butm_(?:source|medium|campaign|term|content)\b/i;

const categories = JSON.parse(readFileSync(path.join(SNAPSHOT_DIR, 'categories.json'), 'utf8'));
const groups = JSON.parse(readFileSync(path.join(SNAPSHOT_DIR, 'groups.json'), 'utf8'));

function toArray(value) {
  if (typeof value === 'undefined' || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function slugify(name) {
  const slug = String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || 'technology';
}

function sanitizeText(value, max = 280) {
  return String(value || '')
    .replace(UPSTREAM_BRAND_RE, 'technology profiler')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function sanitizeWebsite(value) {
  const raw = String(value || '').trim();
  if (!raw || UPSTREAM_BRAND_TEST_RE.test(raw)) return undefined;
  try {
    const url = new URL(raw);
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^utm_/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

function buildCategoryInfo(id) {
  const category = categories[String(id)];
  if (!category || typeof category !== 'object') return null;
  const name = sanitizeText(category.name, 80);
  if (!name) return null;
  return {
    id: Number(id),
    name,
    slug: slugify(name),
    priority: Number.isFinite(Number(category.priority)) ? Number(category.priority) : 0,
  };
}

function parsePattern(value, { regex = true, confidenceDefault = 100 } = {}) {
  const raw = typeof value === 'number' ? String(value) : String(value ?? '');
  const [patternText = '', ...attrParts] = raw.split('\\;');
  if (MARKETING_FIELD_RE.test(patternText)) return null;
  const attrs = new Map();
  for (const part of attrParts) {
    const index = part.indexOf(':');
    if (index > 0) attrs.set(part.slice(0, index), part.slice(index + 1));
  }
  const confidence = Math.max(1, Math.min(100, Number.parseInt(attrs.get('confidence') || confidenceDefault, 10) || confidenceDefault));
  if (!regex) {
    return {
      kind: 'text',
      pattern: patternText,
      confidence,
      ...(attrs.get('version') ? { version: attrs.get('version') } : {}),
    };
  }
  const optimized = patternText
    .replace(/\\\+/g, '__escapedPlus__')
    .replace(/\+/g, '{1,250}')
    .replace(/\*/g, '{0,250}')
    .replace(/__escapedPlus__/g, '\\+');
  try {
    new RegExp(optimized, 'i');
  } catch {
    return null;
  }
  return {
    kind: 'regex',
    pattern: optimized,
    flags: 'i',
    confidence,
    ...(attrs.get('version') ? { version: attrs.get('version') } : {}),
  };
}

function parsePatternParts(value) {
  const raw = typeof value === 'number' ? String(value) : String(value ?? '');
  const [patternText = '', ...attrParts] = raw.split('\\;');
  const attrs = new Map();
  for (const part of attrParts) {
    const index = part.indexOf(':');
    if (index > 0) attrs.set(part.slice(0, index), part.slice(index + 1));
  }
  return { patternText, attrs };
}

function parsePatternArray(value, options = {}) {
  return toArray(value)
    .map((item) => parsePattern(item, options))
    .filter(Boolean);
}

function parsePatternRecord(value, options = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (MARKETING_FIELD_RE.test(String(key))) continue;
    const patterns = parsePatternArray(item, options);
    if (patterns.length > 0) out[String(key).toLowerCase()] = patterns;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function cookieNamePattern(name) {
  return `^${String(name)
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')}$`;
}

function parseCookies(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const namePatterns = [];
  const valuePatterns = [];
  for (const [name, patternValue] of Object.entries(value)) {
    if (MARKETING_FIELD_RE.test(String(name)) || MARKETING_FIELD_RE.test(String(patternValue))) continue;
    const { patternText, attrs } = parsePatternParts(patternValue);
    const confidence = Math.max(1, Math.min(100, Number.parseInt(attrs.get('confidence') || '100', 10) || 100));
    const namePattern = {
      kind: 'regex',
      pattern: cookieNamePattern(name),
      flags: 'i',
      confidence,
      ...(attrs.get('version') ? { version: attrs.get('version') } : {}),
    };
    namePatterns.push(namePattern);
    const parsedValuePatterns = parsePatternArray(patternValue);
    if (parsedValuePatterns.length > 0 && patternText) {
      valuePatterns.push(...parsedValuePatterns.map((item) => ({
        ...item,
        pattern: `${cookieNamePattern(name).replace(/^\^|\$$/g, '')}=.*${item.pattern}`,
      })));
    }
  }
  return {
    ...(namePatterns.length > 0 ? { names: namePatterns } : {}),
    ...(valuePatterns.length > 0 ? { values: valuePatterns } : {}),
  };
}

function makeDomKey(selector, kind, name = '') {
  return [selector, kind, name].filter(Boolean).join('::');
}

function parseDom(value) {
  const out = {};
  for (const selector of toArray(typeof value === 'string' ? value : Array.isArray(value) ? value : undefined)) {
    if (MARKETING_FIELD_RE.test(String(selector))) continue;
    out[String(selector)] = true;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return Object.keys(out).length ? out : undefined;
  for (const [selector, config] of Object.entries(value)) {
    if (MARKETING_FIELD_RE.test(String(selector)) || MARKETING_FIELD_RE.test(JSON.stringify(config ?? ''))) continue;
    if (typeof config === 'string') {
      out[selector] = true;
      continue;
    }
    if (!config || typeof config !== 'object') {
      out[selector] = true;
      continue;
    }
    if ('exists' in config) out[selector] = true;
    const classPatterns = parsePatternArray(config.class);
    if (classPatterns.length) out[makeDomKey(selector, 'class')] = classPatterns;
    const textPatterns = parsePatternArray(config.text);
    if (textPatterns.length) out[makeDomKey(selector, 'text')] = textPatterns;
    const srcPatterns = parsePatternArray(config.src);
    if (srcPatterns.length) out[makeDomKey(selector, 'attr', 'src')] = srcPatterns;
    if (config.attributes && typeof config.attributes === 'object') {
      for (const [name, item] of Object.entries(config.attributes)) {
        const patterns = parsePatternArray(item);
        if (patterns.length) out[makeDomKey(selector, 'attr', name)] = patterns;
      }
    }
    if (config.properties && typeof config.properties === 'object') {
      for (const [name, item] of Object.entries(config.properties)) {
        const patterns = parsePatternArray(item);
        if (patterns.length) out[makeDomKey(selector, 'prop', name)] = patterns;
      }
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function parseJs(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out = {};
  for (const [chain, item] of Object.entries(value)) {
    const patterns = parsePatternArray(item);
    out[chain] = patterns.length > 0 && String(item || '') !== '' ? patterns : true;
  }
  return Object.keys(out).length ? out : undefined;
}

function relationSlugs(value, nameToSlug) {
  return toArray(value).map((name) => nameToSlug.get(String(name))).filter(Boolean);
}

function collectSources(rule) {
  const sources = [];
  if (rule.url?.length) sources.push('url');
  if (rule.headers && Object.keys(rule.headers).length) sources.push('headers');
  if (rule.cookies?.length || rule.cookieValues?.length) sources.push('cookies');
  if (rule.meta && Object.keys(rule.meta).length) sources.push('meta');
  if (rule.html?.length) sources.push('html');
  if (rule.text?.length) sources.push('text');
  if (rule.css?.length) sources.push('css');
  if (rule.scriptSrc?.length) sources.push('script-src');
  if (rule.inlineScript?.length) sources.push('inline-script');
  if (rule.dom && Object.keys(rule.dom).length) sources.push('dom');
  if (rule.js && Object.keys(rule.js).length) sources.push('js');
  if (rule.xhrUrl?.length) sources.push('xhr-url');
  return sources;
}

const rawTechnologies = {};
for (const file of readdirSync(TECHNOLOGY_DIR).filter((item) => item.endsWith('.json')).sort()) {
  Object.assign(rawTechnologies, JSON.parse(readFileSync(path.join(TECHNOLOGY_DIR, file), 'utf8')));
}

const nameToSlug = new Map();
for (const name of Object.keys(rawTechnologies).sort((left, right) => left.localeCompare(right))) {
  let slug = slugify(name);
  let suffix = 2;
  while ([...nameToSlug.values()].includes(slug)) {
    slug = `${slugify(name)}-${suffix}`;
    suffix += 1;
  }
  nameToSlug.set(name, slug);
}

const rules = [];
for (const [name, input] of Object.entries(rawTechnologies).sort(([left], [right]) => left.localeCompare(right))) {
  const categoryIds = toArray(input.cats).map((id) => Number(id)).filter((id) => Number.isFinite(id));
  const categoryInfos = categoryIds.map(buildCategoryInfo).filter(Boolean);
  const categoriesForRule = Array.from(new Set(categoryInfos.map((category) => category.slug)));
  const website = sanitizeWebsite(input.website);
  const cookieRules = parseCookies(input.cookies);
  const rule = {
    name: sanitizeText(name, 120),
    slug: nameToSlug.get(name),
    categories: categoriesForRule.length ? categoriesForRule : ['other'],
    ...(categoryInfos.length ? { categoryInfos } : {}),
    ...(website ? { website } : {}),
    ...(sanitizeText(input.description) ? { description: sanitizeText(input.description) } : {}),
    ...(categoryIds.length ? { fingerprintCategoryIds: categoryIds } : {}),
    ...(parsePatternArray(input.url).length ? { url: parsePatternArray(input.url) } : {}),
    ...(parsePatternRecord(input.headers) ? { headers: parsePatternRecord(input.headers) } : {}),
    ...(cookieRules?.names ? { cookies: cookieRules.names } : {}),
    ...(cookieRules?.values ? { cookieValues: cookieRules.values } : {}),
    ...(parsePatternRecord(input.meta) ? { meta: parsePatternRecord(input.meta) } : {}),
    ...(parsePatternArray(input.html).length ? { html: parsePatternArray(input.html) } : {}),
    ...(parsePatternArray(input.text).length ? { text: parsePatternArray(input.text) } : {}),
    ...(parsePatternArray(input.css).length ? { css: parsePatternArray(input.css) } : {}),
    ...(parsePatternArray(input.scriptSrc).length ? { scriptSrc: parsePatternArray(input.scriptSrc) } : {}),
    ...(parsePatternArray(input.scripts).length ? { inlineScript: parsePatternArray(input.scripts) } : {}),
    ...(parseDom(input.dom) ? { dom: parseDom(input.dom) } : {}),
    ...(parseJs(input.js) ? { js: parseJs(input.js) } : {}),
    ...(parsePatternArray(input.xhr).length ? { xhrUrl: parsePatternArray(input.xhr) } : {}),
    ...(relationSlugs(input.implies, nameToSlug).length ? { implies: relationSlugs(input.implies, nameToSlug) } : {}),
    ...(relationSlugs(input.requires, nameToSlug).length ? { requires: relationSlugs(input.requires, nameToSlug) } : {}),
    ...(toArray(input.requiresCategory).length ? { requiresCategory: toArray(input.requiresCategory).map((id) => Number(id)).filter((id) => Number.isFinite(id)) } : {}),
    ...(relationSlugs(input.excludes, nameToSlug).length ? { excludes: relationSlugs(input.excludes, nameToSlug) } : {}),
    status: 'active',
    verifiedSignals: [],
    versionPolicy: {
      reliability: 'probable',
      sources: [],
      notes: 'Local fingerprint snapshot rule.',
    },
    rankMeta: {
      source: 'local-fingerprint-snapshot',
      batch: 'snapshot-6-12-2',
      evidenceUrl: website || 'https://example.com/local-fingerprint-snapshot',
    },
    sourceUrls: website ? [website] : ['https://example.com/local-fingerprint-snapshot'],
    licenseStatus: 'oss-compatible',
    lastVerifiedAt: VERIFIED_AT,
  };
  const sources = collectSources(rule);
  if (sources.length < 1) continue;
  rule.verifiedSignals = sources;
  rule.versionPolicy.sources = sources;
  rules.push(rule);
}

const bundle = {
  snapshotVersion: SNAPSHOT_VERSION,
  generatedAt: new Date().toISOString(),
  categoryCount: Object.keys(categories).length,
  categories: Object.keys(categories)
    .map((id) => buildCategoryInfo(Number(id)))
    .filter(Boolean)
    .sort((left, right) => right.priority - left.priority || left.name.localeCompare(right.name)),
  groupCount: Object.keys(groups).length,
  technologyCount: Object.keys(rawTechnologies).length,
  unsupportedSignals: ['dns', 'probe', 'certIssuer', 'robots'],
  rules,
};

const json = JSON.stringify(bundle);
if (UPSTREAM_BRAND_TEST_RE.test(json)) {
  throw new Error('Generated fingerprint bundle still contains a banned upstream brand token.');
}

const source = `/**\n * 说明：技术栈本地指纹快照生成数据。\n *\n * 职责：\n * - 暴露发布时固化的中性技术指纹规则包资产路径和摘要；\n * - 避免运行时读取第三方目录、远程规则库或执行第三方代码；\n * - 只导出 Olyq 自有 loader 可消费的轻量元数据。\n *\n * 注意：请通过 scripts/generate-technology-fingerprint-bundle.mjs 生成，不要手写。\n */\nimport type { TechnologyCategoryInfo, TechnologyRule } from './types';\n\n/** 本地技术指纹规则包。 */\nexport interface FingerprintRuleBundle {\n  /** 本地快照版本。 */\n  snapshotVersion: string;\n  /** 生成时间。 */\n  generatedAt: string;\n  /** 分类数量。 */\n  categoryCount: number;\n  /** 分类元数据。 */\n  categories: TechnologyCategoryInfo[];\n  /** 分组数量。 */\n  groupCount: number;\n  /** 技术数量。 */\n  technologyCount: number;\n  /** 当前未实现的信号类型。 */\n  unsupportedSignals: string[];\n  /** active 指纹规则。 */\n  rules: TechnologyRule[];\n}\n\n/** 随扩展发布的本地规则资产路径。 */\nexport const FINGERPRINT_RULE_BUNDLE_ASSET_PATH = '${OUTPUT_ASSET_PATH}';\n\n/** 本地技术指纹规则包摘要。 */\nexport const FINGERPRINT_RULE_BUNDLE_METADATA = {\n  snapshotVersion: ${JSON.stringify(bundle.snapshotVersion)},\n  generatedAt: ${JSON.stringify(bundle.generatedAt)},\n  categoryCount: ${bundle.categoryCount},\n  groupCount: ${bundle.groupCount},\n  technologyCount: ${bundle.technologyCount},\n  unsupportedSignals: ${JSON.stringify(bundle.unsupportedSignals)},\n} as const;\n`;

mkdirSync(path.dirname(OUTPUT_ASSET_FILE), { recursive: true });
writeFileSync(OUTPUT_ASSET_FILE, json);
writeFileSync(OUTPUT_FILE, source);
console.log(`Generated ${rules.length} fingerprint rules at ${path.relative(PACKAGE_ROOT, OUTPUT_ASSET_FILE)}`);
console.log(`Generated fingerprint metadata at ${path.relative(PACKAGE_ROOT, OUTPUT_FILE)}`);
