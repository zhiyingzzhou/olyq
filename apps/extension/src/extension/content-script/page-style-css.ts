/**
 * 说明：`page-style-css` 页面风格分析 CSS 归一化辅助模块。
 *
 * 职责：
 * - 为内容脚本里的页面风格采样提供稳定的 CSS 值规范化能力；
 * - 把颜色 canonicalization 与复杂 value 的 AST 解析集中到一个轻量 helper 中；
 * - 避免 `page-style.ts` 在遍历 DOM 时反复重复解析同一批 CSS 字符串。
 *
 * 边界：
 * - 这里只处理字符串级 CSS value，不接触 DOM 遍历、截图或消息通信；
 * - 复杂值的解析只作为稳定判定与归一化手段，不引入新的外部协议或持久化结构；
 * - 若 parser 无法解析，必须安全回退到原生序列化/轻量字符串归一化，而不是抛错中断主流程。
 */
import { generate, parse, walk } from 'css-tree';

/** 供单轮页面分析复用的 CSS value 解析缓存。 */
export type CssValueAnalysisCache = Map<string, CssValueAnalysis>;

/** 单个 CSS value 的解析结果。 */
export interface CssValueAnalysis {
  /** 规范化后的 value。 */
  canonical: string;
  /** 解析出的 function 名列表。 */
  functionNames: string[];
  /** 解析出的 identifier 名列表。 */
  identifiers: string[];
  /** 本次是否成功走 AST 解析。 */
  parsed: boolean;
}

/** 颜色序列化时复用的临时样式节点。 */
let colorSerializer: HTMLSpanElement | null = null;

/**
 * 延迟创建颜色序列化节点，避免非 DOM 环境在模块求值时直接访问 `document`。
 *
 * @returns 可复用的样式节点；当前环境不可用时返回 `null`。
 */
function getColorSerializer(): HTMLSpanElement | null {
  if (colorSerializer) return colorSerializer;
  if (typeof document === 'undefined') return null;
  colorSerializer = document.createElement('span');
  return colorSerializer;
}

/**
 * 归一化 CSS 字符串里的空白。
 *
 * @param value - 原始 value。
 * @returns 去掉多余空白后的结果。
 */
export function normalizeCssWhitespace(value: string | null | undefined): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 把颜色值交给浏览器样式系统做 canonicalization。
 *
 * 说明：
 * - 这里优先使用原生 CSS 序列化，把 `hsl()` / `hex` / 命名色尽量统一成浏览器会返回的稳定格式；
 * - 若浏览器无法识别该值，则安全回退到空白归一化结果。
 *
 * @param value - 原始颜色值。
 * @returns 规范化后的颜色字符串。
 */
export function canonicalizeCssColor(value: string | null | undefined): string {
  const normalized = normalizeCssWhitespace(value);
  if (!normalized) return '';
  const serializer = getColorSerializer();
  if (!serializer) return normalized;
  serializer.style.color = '';
  serializer.style.color = normalized;
  return normalizeCssWhitespace(serializer.style.color || normalized);
}

/**
 * 判断颜色是否属于真正可见的颜色。
 *
 * @param value - 原始颜色值。
 * @returns 是否不是透明色。
 */
export function isMeaningfulColor(value: string | null | undefined): boolean {
  const normalized = canonicalizeCssColor(value).toLowerCase();
  if (!normalized) return false;
  return normalized !== 'transparent'
    && normalized !== 'rgba(0, 0, 0, 0)'
    && normalized !== 'rgba(255, 255, 255, 0)'
    && normalized !== 'rgb(0, 0, 0 / 0)'
    && normalized !== 'rgb(255, 255, 255 / 0)';
}

/**
 * 解析规范化颜色值的透明度。
 *
 * @param value - 原始颜色值。
 * @returns 透明度；无法判断时返回 `null`。
 */
export function getCssColorAlpha(value: string | null | undefined): number | null {
  const normalized = canonicalizeCssColor(value).toLowerCase();
  if (!normalized) return null;
  if (normalized === 'transparent') return 0;

  const rgbaMatch = normalized.match(/^rgba\(\s*[^)]+,\s*([+-]?\d*\.?\d+)\s*\)$/);
  if (rgbaMatch?.[1]) {
    const alpha = Number(rgbaMatch[1]);
    return Number.isFinite(alpha) ? alpha : null;
  }

  const slashMatch = normalized.match(/^rgb\(\s*[^/]+\/\s*([+-]?\d*\.?\d+)\s*\)$/);
  if (slashMatch?.[1]) {
    const alpha = Number(slashMatch[1]);
    return Number.isFinite(alpha) ? alpha : null;
  }

  if (normalized.startsWith('rgb(')) return 1;
  return null;
}

/**
 * 判断颜色是否是“可见但带透明度”的半透明颜色。
 *
 * @param value - 原始颜色值。
 * @returns 是否属于玻璃态常见的半透明背景色。
 */
export function isTranslucentMeaningfulColor(value: string | null | undefined): boolean {
  if (!isMeaningfulColor(value)) return false;
  const alpha = getCssColorAlpha(value);
  return alpha !== null && alpha > 0 && alpha < 1;
}

/**
 * 分析复杂 CSS value，并把结果写入单轮缓存。
 *
 * @param value - 原始 CSS value。
 * @param cache - 单轮缓存。
 * @returns 解析结果。
 */
export function analyzeCssValue(
  value: string | null | undefined,
  cache: CssValueAnalysisCache,
): CssValueAnalysis {
  const normalized = normalizeCssWhitespace(value);
  if (!normalized) {
    return {
      canonical: '',
      functionNames: [],
      identifiers: [],
      parsed: false,
    };
  }

  const cached = cache.get(normalized);
  if (cached) return cached;

  const fallback: CssValueAnalysis = {
    canonical: normalized,
    functionNames: [],
    identifiers: [],
    parsed: false,
  };

  try {
    const ast = parse(normalized, { context: 'value' });
    const functionNames = new Set<string>();
    const identifiers = new Set<string>();

    walk(ast, (node) => {
      if (node.type === 'Function') {
        functionNames.add(node.name.toLowerCase());
        return;
      }
      if (node.type === 'Identifier') {
        identifiers.add(node.name.toLowerCase());
      }
    });

    const result: CssValueAnalysis = {
      canonical: normalizeCssWhitespace(generate(ast)),
      functionNames: [...functionNames],
      identifiers: [...identifiers],
      parsed: true,
    };
    cache.set(normalized, result);
    return result;
  } catch {
    cache.set(normalized, fallback);
    return fallback;
  }
}

/**
 * 读取复杂 CSS value 的规范化结果。
 *
 * @param value - 原始 value。
 * @param cache - 单轮缓存。
 * @returns 规范化后的字符串。
 */
export function normalizeComplexCssValue(
  value: string | null | undefined,
  cache: CssValueAnalysisCache,
): string {
  return analyzeCssValue(value, cache).canonical;
}

/**
 * 判断 CSS value 中是否包含指定函数。
 *
 * @param value - 原始 value。
 * @param names - 需要命中的函数名。
 * @param cache - 单轮缓存。
 * @returns 是否命中。
 */
export function cssValueHasFunction(
  value: string | null | undefined,
  names: readonly string[],
  cache: CssValueAnalysisCache,
): boolean {
  const expected = new Set(names.map((name) => name.toLowerCase()));
  const analysis = analyzeCssValue(value, cache);
  return analysis.functionNames.some((name) => expected.has(name));
}

/**
 * 判断复杂 CSS value 是否不是 `none`。
 *
 * @param value - 原始 value。
 * @param cache - 单轮缓存。
 * @returns 是否存在真实值。
 */
export function hasMeaningfulComplexCssValue(
  value: string | null | undefined,
  cache: CssValueAnalysisCache,
): boolean {
  const analysis = analyzeCssValue(value, cache);
  if (!analysis.canonical) return false;
  if (analysis.canonical.toLowerCase() === 'none') return false;
  return !(analysis.identifiers.length === 1 && analysis.identifiers[0] === 'none');
}
