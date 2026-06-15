/**
 * 说明：技术栈图标本地文字占位。
 *
 * 职责：
 * - 只根据技术分类和名称生成本地 fallback 字符；
 * - 供 Service Worker 探测结果归一化和 UI 图标 resolver 共用；
 * - 不包含任何远程图标 URL、候选算法或图片加载逻辑，避免后台热路径带入 UI 图标代码。
 */
import type { TechnologyCategory } from './types';

/** 技术图标文字占位只需要的规则字段。 */
export interface TechnologyIconFallbackRuleLike {
  /** 技术展示名。 */
  name: string;
  /** 技术分类。 */
  categories: readonly TechnologyCategory[];
}

/** 常见分类占位字符。 */
const CATEGORY_FALLBACK: Record<string, string> = {
  framework: 'F',
  'ui-framework': 'U',
  'javascript-frameworks': 'J',
  'web-frameworks': 'W',
  'static-site-generator': 'S',
  'javascript-libraries': 'J',
  'ui-frameworks': 'U',
  widgets: 'W',
  cms: 'C',
  cdn: 'N',
  ecommerce: 'E',
  analytics: 'A',
  'tag-manager': 'T',
  'web-server': 'S',
  'web-servers': 'S',
  'programming-language': 'L',
  'programming-languages': 'L',
  'backend-framework': 'B',
  database: 'D',
  databases: 'D',
  'font-script': 'F',
  'font-scripts': 'F',
  security: 'S',
  'build-tool': 'B',
  payment: 'P',
  marketing: 'M',
  hosting: 'H',
  paas: 'P',
  other: '?',
  miscellaneous: '?',
};

/**
 * 为技术项生成本地文字占位。
 *
 * @param rule - 技术规则或探测结果。
 * @returns 首选分类字符；分类未知时使用技术名首字母。
 */
export function resolveTechnologyIconFallback(rule: TechnologyIconFallbackRuleLike): string {
  const primaryCategory: TechnologyCategory = rule.categories[0] ?? 'other';
  return CATEGORY_FALLBACK[primaryCategory] || rule.name.charAt(0).toUpperCase() || '?';
}
