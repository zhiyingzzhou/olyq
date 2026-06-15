/**
 * 说明：技术项本地 compact catalog 图标 resolver。
 *
 * 职责：
 * - 根据当前技术项的 `slug/name` 生成少量确定性匹配 key；
 * - 只从已加载的本地 compact catalog 展开固定版本 jsDelivr 静态 SVG URL；
 * - 不在运行时遍历 provider，不读取上游 catalog，也不执行远程 JavaScript/WASM。
 *
 * 失败语义：
 * - catalog 命中时每个技术项只输出一个品牌/技术图标候选，避免连续 404；
 * - catalog 未加载时直接回到本地文字占位；catalog 已加载但品牌未命中时走 Tabler generic 分类图标。
 */
import {
  TECHNOLOGY_ICON_CATALOG_CDN_ROOT,
  normalizeTechnologyIconTuple,
  type TechnologyIconCatalog,
  type TechnologyIconCatalogDescriptor,
  type TechnologyIconCatalogTuple,
} from './icon-catalog-schema';
import {
  resolveTechnologyIconFallback,
  type TechnologyIconFallbackRuleLike,
} from './icon-fallback';
import type {
  TechnologyCategory,
  TechnologyIconCandidate,
} from './types';

export { resolveTechnologyIconFallback } from './icon-fallback';

/** 技术图标 resolver 只需要的规则字段。 */
export interface TechnologyIconRuleLike extends TechnologyIconFallbackRuleLike {
  /** 技术稳定 slug。 */
  slug: string;
  /** 技术分类。 */
  categories: readonly TechnologyCategory[];
}

/** 图标候选 key 的来源。 */
export type TechnologyIconMatchReason = 'exact' | 'js-suffix' | 'brand-prefix';

/** 动态图标候选 key。 */
export interface TechnologyIconMatchKey {
  /** 可直接拼入静态 SVG URL 的安全 key。 */
  key: string;
  /** 当前 key 的生成原因，用于测试和后续审计排序。 */
  reason: TechnologyIconMatchReason;
}

/** 单个技术项最多派生的 key 数量，避免无边界远程图片 404。 */
const MAX_ICON_MATCH_KEYS = 4;

/** URL key 只允许小写字母、数字和单横线分隔。 */
const ICON_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 这些通用词不作为父品牌 key，避免 `Open Graph -> open` 这类噪声候选。 */
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

/** 去除 Unicode 组合重音，保证跨语言输入能稳定收敛。 */
function stripDiacritics(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * 把原始技术名称切成语义 token。
 *
 * 说明：camel-aware 只用于 exact / JS 后缀派生；父品牌必须来自显式分隔，
 * 避免 `YouMind` 被拆成 `you` 并生成错误父品牌候选。
 */
function splitIconWords(value: string, camelAware: boolean): string[] {
  let normalized = stripDiacritics(String(value || ''));
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

/**
 * 把名称或 slug 规整成远程静态图标 URL key。
 *
 * @param value - 原始名称或 slug。
 * @returns 安全 URL key；无法收敛时返回 `undefined`。
 */
export function normalizeTechnologyIconKey(value: string | undefined): string | undefined {
  const words = splitIconWords(value ?? '', true);
  const key = words.join('-');
  return ICON_KEY_PATTERN.test(key) ? key : undefined;
}

/**
 * 把一个原始值规范化后加入候选 key 列表。
 *
 * @param keys - 当前已经收集的候选 key。
 * @param seen - 已加入过的 key 集合，用于保持稳定去重。
 * @param value - 待规范化的原始 slug/name/key。
 * @param reason - 当前 key 的派生原因。
 */
function pushMatchKey(
  keys: TechnologyIconMatchKey[],
  seen: Set<string>,
  value: string | undefined,
  reason: TechnologyIconMatchReason,
): void {
  const key = normalizeTechnologyIconKey(value);
  if (!key || seen.has(key)) return;
  seen.add(key);
  keys.push({ key, reason });
}

/**
 * 根据常见 JavaScript 后缀派生基础产品 key。
 *
 * @param keys - 当前已经收集的候选 key。
 * @param seen - 已加入过的 key 集合。
 * @param key - 已规范化的 exact key。
 */
function pushJsSuffixKey(keys: TechnologyIconMatchKey[], seen: Set<string>, key: string): void {
  for (const suffix of ['-javascript', '-js']) {
    if (key.length > suffix.length + 2 && key.endsWith(suffix)) {
      pushMatchKey(keys, seen, key.slice(0, -suffix.length), 'js-suffix');
    }
  }
  for (const suffix of ['javascript', 'js']) {
    if (!key.includes('-') && key.length > suffix.length + 2 && key.endsWith(suffix)) {
      pushMatchKey(keys, seen, key.slice(0, -suffix.length), 'js-suffix');
    }
  }
}

/**
 * 为一条技术规则生成动态图标候选 key。
 *
 * @param rule - 当前技术规则或探测结果。
 * @returns 按 exact、JS 后缀、显式父品牌排序后的有限 key 列表。
 */
export function buildTechnologyIconMatchKeys(rule: TechnologyIconRuleLike): TechnologyIconMatchKey[] {
  const keys: TechnologyIconMatchKey[] = [];
  const seen = new Set<string>();
  const exactValues = [rule.slug, rule.name];

  for (const value of exactValues) {
    pushMatchKey(keys, seen, value, 'exact');
  }

  const exactKeys = keys.filter((item) => item.reason === 'exact').map((item) => item.key);
  for (const value of exactValues) {
    const words = splitIconWords(value, true);
    if (words.length > 1 && (words.at(-1) === 'js' || words.at(-1) === 'javascript')) {
      pushMatchKey(keys, seen, words.slice(0, -1).join('-'), 'js-suffix');
    }
  }
  for (const key of exactKeys) {
    pushJsSuffixKey(keys, seen, key);
  }

  for (const value of exactValues) {
    const words = splitIconWords(value, false);
    if (words.length <= 1) continue;
    const first = words[0];
    if (first.length >= 3 && !GENERIC_BRAND_PREFIXES.has(first)) {
      pushMatchKey(keys, seen, first, 'brand-prefix');
    }
  }

  return keys.slice(0, MAX_ICON_MATCH_KEYS);
}

/**
 * 生成固定版本 jsDelivr SVG URL。
 *
 * @param tuple - compact catalog 中的 `[sourceId, path]`。
 * @param catalog - 已校验 compact catalog。
 * @returns 可直接用于 `<img>` 的 SVG URL；非法 tuple 返回 `undefined`。
 */
export function buildCatalogIconUrl(
  tuple: TechnologyIconCatalogTuple | undefined,
  catalog: TechnologyIconCatalog | null | undefined,
): string | undefined {
  const normalized = normalizeTechnologyIconTuple(tuple);
  if (!normalized || !catalog?.sources[normalized[0]]) return undefined;
  return `${TECHNOLOGY_ICON_CATALOG_CDN_ROOT}${catalog.sources[normalized[0]]}${normalized[1]}`;
}

/** 判断 descriptor 是否为单文件 tuple。 */
function isTupleDescriptor(value: TechnologyIconCatalogDescriptor): value is TechnologyIconCatalogTuple {
  return Array.isArray(value);
}

/**
 * 把 compact descriptor 展开成 UI 候选。
 *
 * @param descriptor - compact catalog 中的图标 descriptor。
 * @param catalog - 已校验 compact catalog。
 * @param provider - UI 候选来源类型。
 * @returns UI 可消费的图标候选；非法 tuple 返回 `null`。
 */
function buildCandidateFromDescriptor(
  descriptor: TechnologyIconCatalogDescriptor,
  catalog: TechnologyIconCatalog,
  provider: TechnologyIconCandidate['provider'],
): TechnologyIconCandidate | null {
  if (isTupleDescriptor(descriptor)) {
    const url = buildCatalogIconUrl(descriptor, catalog);
    return url ? { provider, url } : null;
  }
  const url = buildCatalogIconUrl(descriptor.default ?? descriptor.dark ?? descriptor.light, catalog);
  if (!url) return null;
  const lightUrl = buildCatalogIconUrl(descriptor.light, catalog);
  const darkUrl = buildCatalogIconUrl(descriptor.dark, catalog);
  return {
    provider,
    url,
    ...(lightUrl ? { lightUrl } : {}),
    ...(darkUrl ? { darkUrl } : {}),
  };
}

/**
 * 从已加载本地 compact catalog 中查找单个 key 的候选。
 *
 * @param key - 已规范化的匹配 key。
 * @param catalog - 已校验 compact catalog；为空时不输出候选。
 * @returns compact catalog 中存在且路径合法的候选。
 */
function buildCandidatesForKey(key: string, catalog: TechnologyIconCatalog | null | undefined): TechnologyIconCandidate[] {
  const descriptor = catalog?.icons[key];
  if (!descriptor || !catalog) return [];
  const candidate = buildCandidateFromDescriptor(descriptor, catalog, 'catalog');
  return candidate ? [candidate] : [];
}

/**
 * 品牌未命中时按技术分类选择通用开源图标。
 *
 * 说明：generic 明确标记为非品牌 logo，只表示“这个技术属于某类能力”。
 * 只有本地 compact catalog 已加载且提供 generic 区块时才返回候选，避免运行时猜路径。
 */
function buildGenericCandidate(rule: TechnologyIconRuleLike, catalog: TechnologyIconCatalog | null | undefined): TechnologyIconCandidate[] {
  if (!catalog?.generic) return [];
  const category = rule.categories.find((item) => catalog.generic[item]);
  const descriptor = category ? catalog.generic[category] : catalog.generic.default;
  if (!descriptor) return [];
  const candidate = buildCandidateFromDescriptor(descriptor, catalog, 'generic');
  return candidate ? [candidate] : [];
}

/**
 * 为技术规则生成技术项 logo 元信息。
 *
 * @param rule - 技术规则。
 * @param catalog - 已加载的本地 compact catalog；未加载时返回空候选。
 * @returns 精选镜像图标候选与最终本地文本 fallback。
 */
export function resolveTechnologyIcon(rule: TechnologyIconRuleLike, catalog?: TechnologyIconCatalog | null): {
  iconCandidates: TechnologyIconCandidate[];
  iconFallback: string;
} {
  const iconCandidates: TechnologyIconCandidate[] = [];
  for (const { key } of buildTechnologyIconMatchKeys(rule)) {
    for (const candidate of buildCandidatesForKey(key, catalog)) {
      iconCandidates.push(candidate);
      return {
        iconCandidates,
        iconFallback: resolveTechnologyIconFallback(rule),
      };
    }
  }

  const genericCandidates = buildGenericCandidate(rule, catalog);
  if (genericCandidates.length > 0) {
    return {
      iconCandidates: genericCandidates,
      iconFallback: resolveTechnologyIconFallback(rule),
    };
  }

  return {
    iconCandidates,
    iconFallback: resolveTechnologyIconFallback(rule),
  };
}
