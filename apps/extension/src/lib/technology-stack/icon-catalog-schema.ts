/**
 * 说明：技术栈图标本地 compact catalog 的 schema-only 真源。
 *
 * 职责：
 * - 固定 Olyq UI 消费的本地扩展资产路径和 jsDelivr URL 拼接规则；
 * - 校验 compact catalog 中的 source id、SVG path、主题变体和 generic 分类映射；
 * - 提供无副作用的数据规整函数，供 UI client 与测试复用。
 *
 * 边界：
 * - 本模块不读写 storage，不触发 fetch，也不访问浏览器 API；
 * - compact catalog 只保存短 source id 和 SVG path，不包含第三方 SVG 内容；
 * - 运行时不遍历 provider、不读取上游 catalog，也不调用 Iconify Search/API。
 */

/** Olyq 运行时加载的本地 compact catalog 资产路径。 */
export const TECHNOLOGY_ICON_CATALOG_ASSET_PATH = 'data/technology-icons/catalog.compact.json';

/** jsDelivr URL 根路径；catalog 中的 source prefix 会拼到它后面。 */
export const TECHNOLOGY_ICON_CATALOG_CDN_ROOT = 'https://cdn.jsdelivr.net/';

/** compact catalog 当前 schema 版本。 */
const TECHNOLOGY_ICON_CATALOG_SCHEMA_VERSION = 1;

/** compact catalog 允许的短 source id。 */
export type TechnologyIconCatalogSourceId = 'ts' | 'si' | 'di' | 'mit' | 'ski' | 'tb';

/** compact catalog 的 source prefix 集合。 */
export type TechnologyIconCatalogSources = Record<TechnologyIconCatalogSourceId, string>;

/** 单个 SVG 文件 descriptor，使用短 source id + 相对 path。 */
export type TechnologyIconCatalogTuple = readonly [TechnologyIconCatalogSourceId, string];

/** 单个图标 descriptor；品牌图标可以是单文件，也可以有 light/dark 成对文件。 */
export type TechnologyIconCatalogDescriptor =
  | TechnologyIconCatalogTuple
  | {
    /** 默认 SVG。 */
    default?: TechnologyIconCatalogTuple;
    /** 浅色主题 SVG。 */
    light?: TechnologyIconCatalogTuple;
    /** 深色主题 SVG。 */
    dark?: TechnologyIconCatalogTuple;
  };

/** compact catalog 的 source rules 摘要。 */
export interface TechnologyIconCatalogSourceRules {
  /** 生成时读取的规则包路径。 */
  path: string;
  /** Olyq 指纹规则包快照版本。 */
  snapshotVersion: string | null;
  /** Olyq 指纹规则包生成时间。 */
  generatedAt: string | null;
  /** 规则数量。 */
  ruleCount: number;
  /** 技术数量。 */
  technologyCount: number;
  /** 分类数量。 */
  categoryCount: number | null;
}

/** UI 运行时已校验并索引后的图标 catalog。 */
export interface TechnologyIconCatalog {
  /** compact catalog schema 版本。 */
  schemaVersion: 1;
  /** catalog 生成时间。 */
  generatedAt: string;
  /** 生成输入规则包摘要。 */
  sourceRules: TechnologyIconCatalogSourceRules;
  /** 图标 key 数量。 */
  iconCount: number;
  /** jsDelivr source prefix。 */
  sources: TechnologyIconCatalogSources;
  /** 品牌/技术图标 key 到 compact descriptor 的映射。 */
  icons: Record<string, TechnologyIconCatalogDescriptor>;
  /** 品牌未命中时使用的 Tabler generic 分类图标。 */
  generic: Record<string, TechnologyIconCatalogTuple>;
}

/** URL key 只允许小写字母、数字和单横线分隔。 */
const ICON_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** source prefix 必须固定版本，避免跟随 latest/main 漂移。 */
const SOURCE_PREFIXES: TechnologyIconCatalogSources = {
  ts: 'gh/glincker/thesvg@v2.3.0/public/icons/',
  si: 'npm/simple-icons@16.18.1/icons/',
  di: 'npm/devicon@2.17.0/icons/',
  mit: 'npm/material-icon-theme@5.34.0/icons/',
  ski: 'gh/tandpfun/skill-icons@7f7e691e71aec64e8354bf697835e009d1ad80f8/icons/',
  tb: 'npm/@tabler/icons@3.44.0/icons/outline/',
};

/** 每个 source 允许的相对 SVG path。 */
const SOURCE_PATH_PATTERNS: Record<TechnologyIconCatalogSourceId, RegExp> = {
  ts: /^[a-z0-9]+(?:-[a-z0-9]+)*\/(?:default|dark|light|mono|wordmark)\.svg$/,
  si: /^[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/,
  di: /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*(?:-(?:original|plain|line)(?:-wordmark)?)?\.svg$/,
  mit: /^[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/,
  ski: /^[A-Za-z0-9]+(?:-(?:Light|Dark))?\.svg$/,
  tb: /^[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/,
};

/** 判断未知值是否为普通 record。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** 规整有限数字。 */
function normalizeFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 规整可空字符串。 */
function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** 规整 source rules 摘要。 */
function normalizeSourceRules(value: unknown): TechnologyIconCatalogSourceRules | null {
  if (!isRecord(value)) return null;
  const ruleCount = normalizeFiniteNumber(value.ruleCount);
  const technologyCount = normalizeFiniteNumber(value.technologyCount);
  if (ruleCount === null || technologyCount === null) return null;
  return {
    path: typeof value.path === 'string' ? value.path : '',
    snapshotVersion: normalizeNullableString(value.snapshotVersion),
    generatedAt: normalizeNullableString(value.generatedAt),
    ruleCount,
    technologyCount,
    categoryCount: normalizeFiniteNumber(value.categoryCount),
  };
}

/** 规整并校验 source prefix。 */
function normalizeSources(value: unknown): TechnologyIconCatalogSources | null {
  if (!isRecord(value)) return null;
  const normalized = {} as TechnologyIconCatalogSources;
  for (const sourceId of Object.keys(SOURCE_PREFIXES) as TechnologyIconCatalogSourceId[]) {
    if (value[sourceId] !== SOURCE_PREFIXES[sourceId]) return null;
    normalized[sourceId] = SOURCE_PREFIXES[sourceId];
  }
  return normalized;
}

/** 规整并校验单个 SVG tuple。 */
export function normalizeTechnologyIconTuple(value: unknown): TechnologyIconCatalogTuple | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const sourceId = String(value[0] || '') as TechnologyIconCatalogSourceId;
  const file = typeof value[1] === 'string' ? value[1].trim().replace(/^\/+/, '') : '';
  if (!(sourceId in SOURCE_PREFIXES) || !SOURCE_PATH_PATTERNS[sourceId].test(file)) return null;
  return [sourceId, file];
}

/** 规整并校验单个图标 descriptor。 */
function normalizeDescriptor(value: unknown): TechnologyIconCatalogDescriptor | null {
  const tuple = normalizeTechnologyIconTuple(value);
  if (tuple) return tuple;
  if (!isRecord(value)) return null;
  const descriptor: Exclude<TechnologyIconCatalogDescriptor, TechnologyIconCatalogTuple> = {};
  for (const key of ['default', 'light', 'dark'] as const) {
    if (value[key] === undefined) continue;
    const item = normalizeTechnologyIconTuple(value[key]);
    if (!item) return null;
    descriptor[key] = item;
  }
  return Object.keys(descriptor).length > 0 ? descriptor : null;
}

/** 规整并校验图标映射。 */
function normalizeIconMap(value: unknown): Record<string, TechnologyIconCatalogDescriptor> | null {
  if (!isRecord(value)) return null;
  const icons: Record<string, TechnologyIconCatalogDescriptor> = {};
  for (const [key, descriptorValue] of Object.entries(value)) {
    if (!ICON_KEY_PATTERN.test(key)) return null;
    const descriptor = normalizeDescriptor(descriptorValue);
    if (!descriptor) return null;
    icons[key] = descriptor;
  }
  return icons;
}

/** 规整并校验 generic 分类映射。 */
function normalizeGenericMap(value: unknown): Record<string, TechnologyIconCatalogTuple> | null {
  if (!isRecord(value)) return null;
  const generic: Record<string, TechnologyIconCatalogTuple> = {};
  for (const [category, descriptorValue] of Object.entries(value)) {
    if (category !== 'default' && !ICON_KEY_PATTERN.test(category)) return null;
    const descriptor = normalizeTechnologyIconTuple(descriptorValue);
    if (!descriptor || descriptor[0] !== 'tb') return null;
    generic[category] = descriptor;
  }
  return generic.default ? generic : null;
}

/**
 * 校验并规整本地 compact catalog。
 *
 * @param value - 未可信的 JSON。
 * @returns 合法 catalog；非法时返回 `null`。
 */
export function normalizeTechnologyIconCatalog(value: unknown): TechnologyIconCatalog | null {
  if (!isRecord(value) || value.schemaVersion !== TECHNOLOGY_ICON_CATALOG_SCHEMA_VERSION) return null;
  const generatedAt = normalizeNullableString(value.generatedAt);
  const sourceRules = normalizeSourceRules(value.sourceRules);
  const sources = normalizeSources(value.sources);
  const icons = normalizeIconMap(value.icons);
  const generic = normalizeGenericMap(value.generic);
  if (!generatedAt || !sourceRules || !sources || !icons || !generic) return null;
  const iconCount = normalizeFiniteNumber(value.iconCount);
  if (iconCount === null || iconCount !== Object.keys(icons).length) return null;
  return {
    schemaVersion: 1,
    generatedAt,
    sourceRules,
    iconCount,
    sources,
    icons,
    generic,
  };
}

