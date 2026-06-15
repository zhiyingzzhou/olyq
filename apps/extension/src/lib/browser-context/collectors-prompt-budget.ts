/**
 * 说明：`collectors-prompt-budget` 浏览器上下文 prompt 预算模块。
 *
 * 职责：
 * - 提供 browser-context prompt 的通用文本裁剪 helper；
 * - 承载 narrative prompt 的 source-aware 预算分配；
 * - 保证长正文只能消费弹性预算，不吞掉紧凑高优先级 source。
 *
 * 边界：
 * - 本模块只处理纯文本预算，不访问 runtime、source cache 或浏览器 API；
 * - 不决定 source 顺序，也不理解 collector 数据结构；
 * - JSON payload 的结构压缩仍由 `collectors-prompt.ts` 负责。
 */
import type {
  BrowserContextPromptFragment,
  BrowserContextSourceId,
} from './types';
import { normalizePromptLanguage, type PromptLanguage } from '@/lib/prompt-language';

/** Narrative prompt 的 source 片段。 */
export interface NarrativePromptSection extends BrowserContextPromptFragment {
  /** 片段来源 ID。 */
  sourceId: BrowserContextSourceId;
}

/** browser-context prompt 的本地化文案。 */
const PROMPT_BUDGET_COPY: Record<PromptLanguage, {
  intro: string[];
  truncated: string;
  readableBodyMarkers: string[];
}> = {
  'zh-CN': {
    intro: [
      '以下是自动采集的当前浏览器上下文，仅在与本轮问题相关时使用。',
      '若与用户明确提供的信息冲突，以用户消息为准；若无关，请忽略这些上下文。',
    ],
    truncated: '…（已截断）',
    readableBodyMarkers: ['\n### 正文片段\n', '\n正文片段：\n'],
  },
  'en-US': {
    intro: [
      'The following browser context was collected automatically. Use it only when it is relevant to this turn.',
      'If it conflicts with information explicitly provided by the user, follow the user message. If it is unrelated, ignore it.',
    ],
    truncated: '...(truncated)',
    readableBodyMarkers: ['\n### Body excerpt\n', '\nBody excerpt:\n'],
  },
};

/**
 * 读取当前语言的 browser-context prompt 前置说明。
 *
 * @param language - prompt 语言。
 * @returns 前置说明文本数组。
 */
export function getBrowserContextIntro(language?: string | null): string[] {
  return [...PROMPT_BUDGET_COPY[normalizePromptLanguage(language)].intro];
}

/** Narrative prompt 的固定前置说明长度。 */
export const NARRATIVE_PROMPT_INTRO_LENGTH = `${getBrowserContextIntro('zh-CN').join('\n')}\n\n`.length;

/**
 * 计算当前语言 narrative prompt 的固定前置说明长度。
 *
 * @param language - prompt 语言。
 * @returns 前置说明字符数。
 */
export function getNarrativePromptIntroLength(language?: string | null): number {
  return `${getBrowserContextIntro(language).join('\n')}\n\n`.length;
}

/** Narrative prompt 中不同 source 之间的分隔符。 */
const NARRATIVE_SECTION_SEPARATOR = '\n\n';

/**
 * 将文本裁剪到预算以内。
 *
 * @param text - 原始文本。
 * @param maxChars - 最大字符数。
 * @returns 裁剪后的文本。
 */
export function reduceTextToBudget(
  text: string,
  maxChars: number,
  language?: string | null,
): { text: string; truncated: boolean } {
  const copy = PROMPT_BUDGET_COPY[normalizePromptLanguage(language)];
  const normalized = String(text || '').trim();
  if (!normalized) return { text: '', truncated: false };
  if (maxChars <= 0) return { text: '', truncated: true };
  if (normalized.length <= maxChars) return { text: normalized, truncated: false };

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length < 2) {
    return {
      text: `${normalized.slice(0, Math.max(0, maxChars - copy.truncated.length - 1)).trim()}\n${copy.truncated}`,
      truncated: true,
    };
  }

  const kept: string[] = [];
  let used = 0;
  for (const paragraph of paragraphs) {
    const nextSize = used + paragraph.length + (kept.length > 0 ? 2 : 0);
    if (nextSize > maxChars - 8) break;
    kept.push(paragraph);
    used = nextSize;
  }

  if (kept.length < 1) {
    return {
      text: `${normalized.slice(0, Math.max(0, maxChars - copy.truncated.length - 1)).trim()}\n${copy.truncated}`,
      truncated: true,
    };
  }
  return {
    text: `${kept.join('\n\n')}\n\n${copy.truncated}`,
    truncated: true,
  };
}

/**
 * 拼接 narrative prompt。
 *
 * @param sections - 已完成 source-aware 预算处理的片段。
 * @returns 最终 narrative prompt。
 */
export function composeNarrativePrompt(
  sections: NarrativePromptSection[],
  language?: string | null,
): string {
  const body = sections
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join(NARRATIVE_SECTION_SEPARATOR);
  return [...getBrowserContextIntro(language), '', body].join('\n').trim();
}

/**
 * 计算某个 source 片段在保留其它 source 后还能使用的预算。
 *
 * @param sections - 当前全部片段。
 * @param sectionIndex - 目标片段索引。
 * @param maxPromptChars - prompt 总预算。
 * @returns 目标片段剩余预算。
 */
function calculateSectionBudget(
  sections: NarrativePromptSection[],
  sectionIndex: number,
  maxPromptChars: number,
  language?: string | null,
): number {
  const visibleSections = sections.filter((item) => item.text.trim());
  const target = sections[sectionIndex];
  if (!target?.text.trim()) return 0;
  const visibleIndex = visibleSections.indexOf(target);
  if (visibleIndex < 0) return 0;
  const otherTextChars = visibleSections
    .filter((item) => item !== target)
    .reduce((sum, item) => sum + item.text.trim().length, 0);
  const separatorChars = Math.max(0, visibleSections.length - 1) * NARRATIVE_SECTION_SEPARATOR.length;
  return maxPromptChars - getNarrativePromptIntroLength(language) - otherTextChars - separatorChars;
}

/**
 * 裁剪 readable-dom 片段时只裁正文主体，尽量保留标题、URL、提取模式和结构提纲。
 *
 * @param text - readable-dom 完整片段。
 * @param maxChars - 当前 source 可用预算。
 * @returns 裁剪后的片段。
 */
function reduceReadableDomSectionToBudget(
  text: string,
  maxChars: number,
  language?: string | null,
): { text: string; truncated: boolean } {
  const copy = PROMPT_BUDGET_COPY[normalizePromptLanguage(language)];
  const normalized = String(text || '').trim();
  if (!normalized) return { text: '', truncated: false };
  if (maxChars <= 0) return { text: '', truncated: true };
  if (normalized.length <= maxChars) return { text: normalized, truncated: false };

  const marker = copy.readableBodyMarkers
    .map((candidate) => ({
      index: normalized.indexOf(candidate),
      marker: candidate,
    }))
    .find((candidate) => candidate.index >= 0);
  if (!marker) return reduceTextToBudget(normalized, maxChars, language);

  const headerEnd = marker.index + marker.marker.length;
  const header = normalized.slice(0, headerEnd).trimEnd();
  const body = normalized.slice(headerEnd).trim();
  const bodyBudget = maxChars - header.length - 1;
  if (bodyBudget <= 12) {
    const fallback = `${header}\n${copy.truncated}`.trim();
    if (fallback.length <= maxChars) return { text: fallback, truncated: true };
    return reduceTextToBudget(normalized, maxChars, language);
  }

  const reduced = reduceTextToBudget(body, bodyBudget, language);
  const nextText = `${header}\n${reduced.text}`.trim();
  if (nextText.length <= maxChars) return { text: nextText, truncated: true };
  return reduceTextToBudget(normalized, maxChars, language);
}

/**
 * 在最终 prompt 级别做 source-aware 预算分配。
 *
 * 说明：`technology-stack` 是短小的高优先级安全摘要，必须先被保留；
 * `readable-dom` 是长正文来源，只能消费其它 source 之后的弹性预算。
 *
 * @param sections - collector 已生成的 prompt 片段。
 * @param maxPromptChars - prompt 总预算。
 * @returns 预算处理后的片段与截断标记。
 */
export function fitNarrativeSectionsToBudget(
  sections: NarrativePromptSection[],
  maxPromptChars: number,
  language?: string | null,
): { sections: NarrativePromptSection[]; truncated: boolean } {
  let next = sections.map((item) => ({ ...item, text: item.text.trim() })).filter((item) => item.text);
  let truncated = false;

  for (const [index, section] of next.entries()) {
    if (section.sourceId !== 'readable-dom') continue;
    const budget = calculateSectionBudget(next, index, maxPromptChars, language);
    if (section.text.length <= budget) continue;
    const reduced = reduceReadableDomSectionToBudget(section.text, budget, language);
    next[index] = { ...section, text: reduced.text, truncated: true };
    truncated = true;
  }
  next = next.filter((item) => item.text);
  if (composeNarrativePrompt(next, language).length <= maxPromptChars) return { sections: next, truncated };

  const shrinkOrder: BrowserContextSourceId[] = [
    'readable-dom',
    'page-style-signals',
    'element-snapshot',
    'selection-snapshot',
    'tab-meta',
  ];
  for (const sourceId of shrinkOrder) {
    for (const [index, section] of next.entries()) {
      if (section.sourceId !== sourceId) continue;
      const currentPrompt = composeNarrativePrompt(next, language);
      const overBudgetChars = currentPrompt.length - maxPromptChars;
      if (overBudgetChars <= 0) return { sections: next, truncated };
      const targetChars = Math.max(0, section.text.length - overBudgetChars - 16);
      const reduced = sourceId === 'readable-dom'
        ? reduceReadableDomSectionToBudget(section.text, targetChars, language)
        : reduceTextToBudget(section.text, targetChars, language);
      next[index] = { ...section, text: reduced.text, truncated: true };
      truncated = true;
      next = next.filter((item) => item.text);
      if (composeNarrativePrompt(next, language).length <= maxPromptChars) return { sections: next, truncated };
    }
  }

  const technologySections = next.filter((item) => item.sourceId === 'technology-stack');
  if (technologySections.length > 0 && composeNarrativePrompt(technologySections, language).length <= maxPromptChars) {
    return { sections: technologySections, truncated: true };
  }

  return { sections: next, truncated };
}
