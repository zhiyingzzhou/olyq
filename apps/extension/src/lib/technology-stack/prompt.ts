/**
 * 说明：技术栈 AI 摘要 formatter。
 *
 * 职责：
 * - 把探测结果压缩成安全、短小、可供模型参考的摘要；
 * - 明确不包含原始 HTML、cookie 值、脚本片段、长 CSS 或长文本；
 * - 同时服务 browser-context prompt 与 UI 预览。
 */
import type { DetectedTechnology, TechnologyStackResult } from './types';
import { normalizePromptLanguage, type PromptLanguage } from '@/lib/prompt-language';

/** 单次注入技术数上限。 */
const MAX_PROMPT_TECHNOLOGIES = 18;

/** 默认分类优先级；快照分类缺少 priority 时使用。 */
const DEFAULT_CATEGORY_PRIORITY = 0;

/** 技术栈 prompt 自有标签的本地化文案。 */
const TECHNOLOGY_STACK_PROMPT_COPY: Record<PromptLanguage, {
  heading: string;
  page: string;
  currentPage: string;
  rulePackage: (total: number, snapshotVersion: string) => string;
  safeSummary: string;
  confidence: string;
  version: string;
  source: string;
}> = {
  'zh-CN': {
    heading: '## 页面技术栈摘要',
    page: '页面',
    currentPage: '当前页面',
    rulePackage: (total, snapshotVersion) => `规则包：${total} 项，本地快照 ${snapshotVersion}`,
    safeSummary: '以下只包含公开页面信号归纳，不包含原始 HTML、cookie 值、脚本片段或 CSS 原文。',
    confidence: '置信度',
    version: '版本',
    source: '来源',
  },
  'en-US': {
    heading: '## Page Technology Stack Summary',
    page: 'Page',
    currentPage: 'current page',
    rulePackage: (total, snapshotVersion) => `Rule package: ${total} entries, local snapshot ${snapshotVersion}`,
    safeSummary: 'This includes only summarized public page signals; it excludes raw HTML, cookie values, script snippets, and CSS source text.',
    confidence: 'confidence',
    version: 'version',
    source: 'source',
  },
};

/** 技术栈 UI 分组。 */
export interface TechnologyDisplayGroup {
  /** 分类 slug。 */
  category: string;
  /** 分类展示名。 */
  categoryLabel: string;
  /** 快照分类优先级。 */
  categoryPriority: number;
  /** 当前分类下的技术。 */
  technologies: DetectedTechnology[];
}

/**
 * 生成单项技术摘要。
 *
 * @param tech - 技术条目。
 * @returns 可写入 prompt 的单行。
 */
function formatTechnologyLine(tech: DetectedTechnology, language: PromptLanguage): string {
  const copy = TECHNOLOGY_STACK_PROMPT_COPY[language];
  const version = tech.version ? ` ${tech.version}` : '';
  const categories = tech.categoryInfos?.length
    ? tech.categoryInfos.map((category) => category.name).join('/')
    : tech.categories.join('/');
  const sources = tech.sources.slice(0, 4).join(', ');
  let reliability = '';
  if (tech.versionReliability) {
    reliability = language === 'en-US'
      ? `, ${copy.version} ${tech.versionReliability}`
      : `，${copy.version} ${tech.versionReliability}`;
  }
  return language === 'en-US'
    ? `- ${tech.name}${version} (${categories}, ${copy.confidence} ${tech.confidence}${reliability}, ${copy.source} ${sources})`
    : `- ${tech.name}${version}（${categories}，${copy.confidence} ${tech.confidence}${reliability}，${copy.source} ${sources}）`;
}

/**
 * 按分类分组技术。
 *
 * @param technologies - 技术列表。
 * @returns 分类与技术列表。
 */
export function groupTechnologiesForDisplay(technologies: DetectedTechnology[]): TechnologyDisplayGroup[] {
  const groups = new Map<string, TechnologyDisplayGroup>();
  for (const tech of technologies) {
    const categories = tech.categoryInfos?.length
      ? tech.categoryInfos
      : [{ id: -1, name: tech.categories[0] || 'Other', slug: tech.categories[0] || 'other', priority: DEFAULT_CATEGORY_PRIORITY }];
    for (const category of categories) {
      const existing = groups.get(category.slug) ?? {
        category: category.slug,
        categoryLabel: category.name,
        categoryPriority: category.priority,
        technologies: [],
      };
      if (!existing.technologies.some((item) => item.slug === tech.slug)) {
        existing.technologies.push(tech);
      }
      groups.set(category.slug, existing);
    }
  }
  return Array.from(groups.values())
    .sort((left, right) => {
      return right.categoryPriority - left.categoryPriority || left.categoryLabel.localeCompare(right.categoryLabel);
    })
    .map((group) => ({
      ...group,
      technologies: [...group.technologies].sort((left, right) => right.confidence - left.confidence || left.name.localeCompare(right.name)),
    }));
}

/**
 * 构建技术栈 prompt 片段。
 *
 * @param result - 技术栈结果。
 * @returns 安全 prompt 片段。
 */
export function buildTechnologyStackPrompt(
  result: TechnologyStackResult | null,
  options: { language?: string | null } = {},
): string | null {
  if (!result || (result.status !== 'ready' && result.status !== 'empty')) return null;
  if (result.technologies.length < 1) return null;
  const language = normalizePromptLanguage(options.language);
  const copy = TECHNOLOGY_STACK_PROMPT_COPY[language];

  const selected = result.technologies
    .filter((tech) => tech.confidence >= 20)
    .slice(0, MAX_PROMPT_TECHNOLOGIES);
  if (selected.length < 1) return null;

  return [
    copy.heading,
    `${copy.page}: ${result.title || result.url || copy.currentPage}`,
    ...(result.rulePackage ? [copy.rulePackage(result.rulePackage.total, result.rulePackage.snapshotVersion)] : []),
    copy.safeSummary,
    ...selected.map((tech) => formatTechnologyLine(tech, language)),
  ].join('\n');
}
