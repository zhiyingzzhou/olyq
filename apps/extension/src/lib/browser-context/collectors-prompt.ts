/**
 * 说明：`collectors-prompt` 浏览器上下文 prompt 归一化模块。
 *
 * 职责：
 * - 承载 source 到 prompt 的纯函数拼装逻辑；
 * - 统一正文裁剪、JSON 压缩、预览片段和 issue 归一化规则；
 * - 让采集层与 prompt 渲染层彻底解耦，避免 source 收集时顺带拼 prompt。
 *
 * 边界：
 * - 本模块不访问 runtime store、source cache 或浏览器 API；
 * - 不负责 collector registry 查找，调用方需先决定每个 source 的 prompt 片段；
 * - 不处理截图附件和发送前 budget race，仅输出纯数据结果。
 */
import type {
  BrowserContextCollectedSource,
  BrowserContextCollectionIssue,
  BrowserContextCollectionIssueCode,
  BrowserContextCollectionPreview,
  BrowserContextHeading,
  BrowserContextMetadataSnapshot,
  BrowserContextProfile,
  BrowserContextPromptFragment,
  BrowserContextSourceId,
} from './types';
import {
  getBrowserContextIntro,
  getNarrativePromptIntroLength,
  composeNarrativePrompt,
  fitNarrativeSectionsToBudget,
  reduceTextToBudget,
  type NarrativePromptSection,
} from './collectors-prompt-budget';
import { normalizePromptLanguage, type PromptLanguage } from '@/lib/prompt-language';

/**
 * 单次 prompt 构建的内部结果。
 */
export interface BuiltBrowserContextPromptPayload {
  /** 最终 prompt。 */
  prompt: string | null;
  /** 实际注入 prompt 的字符数。 */
  promptChars: number;
  /** 本轮 prompt 是否被预算裁剪。 */
  promptTruncated: boolean;
}

/**
 * 去掉 Markdown 语法，生成更适合状态条预览的纯文本。
 *
 * @param text - 原始 Markdown / 文本。
 * @returns 清理后的纯文本。
 */
function stripMarkdownForPreview(text: string): string {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[^\n]*\n?/g, '').trim())
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * 把任意 heading 数据收敛成稳定的 h1-h3 列表。
 *
 * @param value - 原始 heading 数据。
 * @returns 结构标题列表。
 */
export function normalizeHeadings(value: unknown): BrowserContextHeading[] {
  if (!Array.isArray(value)) return [];

  const headings: BrowserContextHeading[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const level = Number(record.level);
    const text = String(record.text || '').replace(/\s+/g, ' ').trim();
    if (!text || !Number.isFinite(level) || level < 1 || level > 3) continue;
    headings.push({ level: level as 1 | 2 | 3, text });
    if (headings.length >= 8) break;
  }
  return headings;
}

/**
 * 为状态条构建轻量正文预览。
 *
 * @param text - 原始正文。
 * @param maxChars - 最大预览长度。
 * @returns 片段和截断标记。
 */
function buildPreviewSnippet(text: string, maxChars = 560): { snippet: string; truncated: boolean } {
  const normalized = stripMarkdownForPreview(text);
  if (!normalized) return { snippet: '', truncated: false };
  if (normalized.length <= maxChars) return { snippet: normalized, truncated: false };
  return {
    snippet: `${normalized.slice(0, Math.max(0, maxChars - 3)).trim()}...`,
    truncated: true,
  };
}

/**
 * 归一化正文采集模式。
 *
 * @param value - collector 返回的原始模式。
 * @returns 状态条可消费的当前模式。
 */
function normalizeCaptureMode(value: unknown): BrowserContextCollectionPreview['captureMode'] {
  switch (String(value || '').trim()) {
    case 'article':
      return 'article';
    case 'visible-page':
      return 'visible-page';
    case 'structured-page':
      return 'structured-page';
    case 'embedded-frame':
      return 'embedded-frame';
    case 'metadata-only':
    default:
      return 'metadata-only';
  }
}

/**
 * 统一收敛 collector 返回的 prompt 片段。
 *
 * @param fragment - collector 返回值。
 * @returns 规范化后的 prompt 片段；为空时返回 `null`。
 */
function normalizePromptFragment(fragment: string | BrowserContextPromptFragment | null): BrowserContextPromptFragment | null {
  if (!fragment) return null;
  if (typeof fragment === 'string') {
    const text = fragment.trim();
    return text ? { text, truncated: false } : null;
  }
  const text = String(fragment.text || '').trim();
  if (!text) return null;
  return {
    text,
    truncated: Boolean(fragment.truncated),
  };
}

/**
 * 将 collector 错误字符串收敛为稳定的问题编码。
 *
 * @param error - 原始错误字符串。
 * @returns 统一问题编码。
 */
export function normalizeCollectionIssueCode(error: string): BrowserContextCollectionIssueCode {
  switch (String(error || '').trim()) {
    case 'page-uncollectable':
      return 'page-uncollectable';
    case 'content-script-injection-failed':
      return 'content-script-injection-failed';
    case 'empty-body':
      return 'empty-body';
    case 'login-wall':
      return 'login-wall';
    case 'challenge-page':
      return 'challenge-page';
    case 'image-or-canvas-only':
      return 'image-or-canvas-only';
    case 'low-quality-extraction':
      return 'low-quality-extraction';
    case 'collector-unavailable':
      return 'collector-unavailable';
    case 'content-script-unreachable':
      return 'content-script-unreachable';
    case 'tab-unavailable':
      return 'tab-unavailable';
    case 'metadata-unavailable':
      return 'metadata-unavailable';
    case 'selection-unavailable':
      return 'selection-unavailable';
    case 'element-unavailable':
      return 'element-unavailable';
    case 'timeout':
      return 'timeout';
    case 'capture-quota-limited':
      return 'capture-quota-limited';
    case 'stale':
      return 'stale';
    default:
      return 'collector-unavailable';
  }
}

/**
 * 从失败 collector 中提炼状态条可消费的问题列表。
 *
 * @param collected - 本轮全部采集结果。
 * @returns 结构化问题列表。
 */
function buildCollectionIssues(collected: BrowserContextCollectedSource[]): BrowserContextCollectionIssue[] {
  return collected
    .filter((item) => !item.ok)
    .map((item) => {
      const message = String(item.error || 'collector-unavailable').trim() || 'collector-unavailable';
      if (
        message === 'selection unavailable'
        || message === 'selection-unavailable'
        || message === 'element unavailable'
        || message === 'element-unavailable'
        || message === 'metadata unavailable'
        || message === 'metadata-unavailable'
      ) {
        return null;
      }
      return {
        sourceId: item.sourceId,
        code: normalizeCollectionIssueCode(message),
        message,
      };
    })
    .filter((item): item is BrowserContextCollectionIssue => Boolean(item));
}

/**
 * 将 narrative prompt 的段落顺序改成内容优先。
 *
 * 说明：
 * - 命中 `readable-dom` 时，不再单独渲染 `tab-meta`，避免“标题/地址”抢占正文视觉；
 * - `selection` / `element` 仍然优先于正文，因为它们属于更明确的用户局部上下文。
 *
 * @param collected - 成功采集结果。
 * @returns 排序后的结果。
 */
function orderNarrativeCollectedSources(collected: BrowserContextCollectedSource[]): BrowserContextCollectedSource[] {
  const hasReadableDom = collected.some((item) => item.sourceId === 'readable-dom');
  const filtered = hasReadableDom
    ? collected.filter((item) => item.sourceId !== 'tab-meta')
    : collected;
  const priority: Record<BrowserContextSourceId, number> = {
    'selection-snapshot': 0,
    'element-snapshot': 1,
    'readable-dom': 2,
    'technology-stack': 3,
    'page-style-signals': 4,
    'tab-meta': 5,
  };
  return [...filtered].sort((a, b) => priority[a.sourceId] - priority[b.sourceId]);
}

/**
 * 从本轮采集结果中构建状态条预览。
 *
 * @param metadata - 当前 metadata。
 * @param collected - 成功采集结果。
 * @param promptResult - 当前 prompt 构建结果。
 * @returns 最近一次采集预览。
 */
export function buildCollectionPreview(
  metadata: BrowserContextMetadataSnapshot | null,
  collected: BrowserContextCollectedSource[],
  promptResult: BuiltBrowserContextPromptPayload,
): BrowserContextCollectionPreview | null {
  const successful = collected.filter((item) => item.ok && item.data);
  const issues = buildCollectionIssues(collected);
  if (successful.length < 1 && issues.length < 1) return null;

  const readableDom = successful.find((item) => item.sourceId === 'readable-dom');
  if (!readableDom?.data) {
    return {
      status: successful.length > 0 ? 'partial' : 'failed',
      captureMode: 'metadata-only',
      sources: successful.map((item) => item.sourceId),
      issues,
      bodyAvailable: false,
      snippet: '',
      headings: [],
      bodyChars: 0,
      promptChars: promptResult.promptChars,
      collectedAt: metadata?.extractedAt ?? Date.now(),
      promptTruncated: promptResult.promptTruncated,
      styleCapture: null,
    };
  }

  const data = readableDom.data;
  const text = String(data.text || '').trim();
  const markdown = String(data.markdown || '').trim();
  const bodyChars = Math.max(0, Number(data.contentChars) || stripMarkdownForPreview(text || markdown).length);
  const snippet = buildPreviewSnippet(text || markdown);
  const sourceKind = String(data.sourceKind || '').trim();

  return {
    status: issues.length > 0 ? 'partial' : 'success',
    captureMode: sourceKind === 'embedded-frame' ? 'embedded-frame' : normalizeCaptureMode(data.mode),
    sources: successful.map((item) => item.sourceId),
    issues,
    bodyAvailable: bodyChars > 0,
    snippet: snippet.snippet,
    headings: normalizeHeadings(data.headings),
    bodyChars,
    promptChars: promptResult.promptChars,
    collectedAt: Number(data.extractedAt) || metadata?.extractedAt || Date.now(),
    promptTruncated: promptResult.promptTruncated,
    styleCapture: null,
  };
}

/**
 * 为 `readable-dom` 构建内容优先的 prompt 片段。
 *
 * 说明：
 * - 正文预算跟随当前 profile 动态计算，而不是写死魔法常量；
 * - 先扣除固定前置说明与头部结构信息，再把余量留给正文主体。
 *
 * @param profile - 当前 profile。
 * @param headerLines - 正文前的结构说明。
 * @param content - 当前页面正文。
 * @returns 可拼接进 narrative prompt 的片段。
 */
export function buildReadableDomPromptFragment(
  profile: BrowserContextProfile,
  headerLines: string[],
  content: string,
  language?: string | null,
): BrowserContextPromptFragment {
  const normalizedContent = String(content || '').trim();
  const headerText = headerLines.join('\n').trim();
  if (!normalizedContent) return { text: headerText, truncated: false };

  const bodyBudget = Math.max(
    600,
    profile.maxPromptChars - getNarrativePromptIntroLength(language) - headerText.length - 32,
  );
  const reduced = reduceTextToBudget(normalizedContent, bodyBudget, language);
  return {
    text: `${headerText}\n${reduced.text}`.trim(),
    truncated: reduced.truncated,
  };
}

/**
 * 构建文本 / Markdown 形态的最终 prompt。
 *
 * @param profile - 当前 profile。
 * @param metadata - 当前 metadata。
 * @param collected - 已采集结果。
 * @param buildPrompt - source 到 prompt 片段的构建函数。
 * @returns prompt 文本。
 */
function buildNarrativePrompt(args: {
  profile: BrowserContextProfile;
  metadata: BrowserContextMetadataSnapshot | null;
  collected: BrowserContextCollectedSource[];
  language: PromptLanguage;
  buildPrompt: (input: {
    profile: BrowserContextProfile;
    metadata: BrowserContextMetadataSnapshot | null;
    source: BrowserContextCollectedSource;
    language: PromptLanguage;
  }) => string | BrowserContextPromptFragment | null;
}): BuiltBrowserContextPromptPayload {
  const sections = orderNarrativeCollectedSources(args.collected)
    .map((source) => {
      const fragment = normalizePromptFragment(args.buildPrompt({
        profile: args.profile,
        metadata: args.metadata,
        source,
        language: args.language,
      }));
      return fragment ? { ...fragment, sourceId: source.sourceId } : null;
    })
    .filter((item): item is NarrativePromptSection => Boolean(item));

  if (sections.length < 1) {
    return {
      prompt: null,
      promptChars: 0,
      promptTruncated: false,
    };
  }
  const fitted = fitNarrativeSectionsToBudget(sections, args.profile.maxPromptChars, args.language);
  const prompt = composeNarrativePrompt(fitted.sections, args.language);
  return {
    prompt: prompt || null,
    promptChars: prompt.length,
    promptTruncated: sections.some((item) => item.truncated) || fitted.truncated,
  };
}

/**
 * 构建 JSON 形态的最终 prompt。
 *
 * @param profile - 当前 profile。
 * @param metadata - 当前 metadata。
 * @param collected - 已采集结果。
 * @returns prompt 文本。
 */
function buildJsonPrompt(
  profile: BrowserContextProfile,
  metadata: BrowserContextMetadataSnapshot | null,
  collected: BrowserContextCollectedSource[],
  language: PromptLanguage,
): BuiltBrowserContextPromptPayload {
  const copy = language === 'en-US'
    ? {
        safeSummary: 'Contains only summarized public page signals; excludes raw HTML, cookie values, script snippets, and CSS source text.',
        truncatedNote: 'browser context truncated',
      }
    : {
        safeSummary: '只包含公开页面信号归纳，不包含原始 HTML、cookie 值、脚本片段或 CSS 原文。',
        truncatedNote: '浏览器上下文已截断',
      };
  /**
   * 递归压缩 JSON payload 中的长文本字段，保证最终仍然是合法 JSON。
   *
   * @param value - 当前值。
   * @param maxStringChars - 单个字符串允许的最大长度。
   * @returns 压缩后的值。
   */
  const compactJsonValue = (value: unknown, maxStringChars: number): { value: unknown; truncated: boolean } => {
    if (typeof value === 'string') {
      const reduced = reduceTextToBudget(value, maxStringChars, language);
      return { value: reduced.text, truncated: reduced.truncated };
    }
    if (Array.isArray(value)) {
      const reducedItems = value.map((item) => compactJsonValue(item, maxStringChars));
      return {
        value: reducedItems.map((item) => item.value),
        truncated: reducedItems.some((item) => item.truncated),
      };
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, compactJsonValue(item, maxStringChars)] as const);
      return {
        value: Object.fromEntries(entries.map(([key, item]) => [key, item.value])),
        truncated: entries.some(([, item]) => item.truncated),
      };
    }
    return { value, truncated: false };
  };

  /**
   * 将 technology-stack 原始结果压缩成 JSON prompt 的安全摘要。
   *
   * @param data - collector 原始结构化数据。
   * @returns 紧凑摘要。
   */
  const compactTechnologyStackForJson = (data: Record<string, unknown>): Record<string, unknown> => {
    const technologies = Array.isArray(data.technologies) ? data.technologies : [];
    const rulePackage = data.rulePackage && typeof data.rulePackage === 'object' && !Array.isArray(data.rulePackage)
      ? data.rulePackage as Record<string, unknown>
      : null;
    return {
      status: data.status,
      title: data.title,
      url: data.url,
      scanCoverage: data.scanCoverage,
      rulePackage: rulePackage
        ? {
            total: rulePackage.total,
            technologyCount: rulePackage.technologyCount,
            categoryCount: rulePackage.categoryCount,
            snapshotVersion: rulePackage.snapshotVersion,
          }
        : undefined,
      safeSummary: copy.safeSummary,
      technologies: technologies.slice(0, 18).map((item) => {
        const record = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {};
        return {
          name: record.name,
          slug: record.slug,
          version: record.version,
          versionReliability: record.versionReliability,
          categories: record.categories,
          confidence: record.confidence,
          sources: Array.isArray(record.sources) ? record.sources.slice(0, 4) : record.sources,
        };
      }),
    };
  };

  /**
   * 构建 JSON payload，并把 readable-dom 视为唯一长文本预算消费者。
   *
   * @param readableTextBudget - readable-dom 正文预算。
   * @returns payload 与截断标记。
   */
  const buildPayload = (readableTextBudget: number): { payload: Record<string, unknown>; truncated: boolean } => {
    const payload: Record<string, unknown> = {};
    let truncated = false;
    if (metadata) {
      payload.metadata = {
        title: metadata.title,
        url: metadata.url,
        favicon: metadata.favicon,
        tabId: metadata.tabId,
        extractedAt: metadata.extractedAt,
      };
    }

    for (const item of collected) {
      if (!item.ok || !item.data) continue;
      if (item.sourceId === 'technology-stack') {
        payload[item.sourceId] = compactTechnologyStackForJson(item.data);
        continue;
      }
      if (item.sourceId === 'readable-dom') {
        const text = String(item.data.text || '').trim();
        const markdown = String(item.data.markdown || '').trim();
        const reduced = reduceTextToBudget(markdown || text, readableTextBudget, language);
        const {
          html: _html,
          markdown: _markdown,
          text: _text,
          ...rest
        } = item.data;
        void _html;
        void _markdown;
        void _text;
        payload[item.sourceId] = {
          ...rest,
          text: reduced.text,
        };
        truncated = truncated || reduced.truncated;
        continue;
      }
      payload[item.sourceId] = item.data;
    }
    return { payload, truncated };
  };

  const initialPayload = buildPayload(profile.maxPromptChars);
  if (Object.keys(initialPayload.payload).length < 1) {
    return {
      prompt: null,
      promptChars: 0,
      promptTruncated: false,
    };
  }
  const jsonBudget = Math.max(200, profile.maxPromptChars - 80);
  for (const readableTextBudget of [jsonBudget, 4200, 2400, 1600, 1000, 600, 300, 0]) {
    const built = buildPayload(readableTextBudget);
    const maxStringChars = Math.max(300, Math.min(2400, readableTextBudget || 300));
    const compacted = compactJsonValue(built.payload, maxStringChars);
    const serialized = JSON.stringify(compacted.value, null, 2);
    if (serialized.length <= jsonBudget) {
      const prompt = `${getBrowserContextIntro(language).join('\n')}\n\n\`\`\`json\n${serialized}\n\`\`\``;
      return {
        prompt,
        promptChars: prompt.length,
        promptTruncated: built.truncated || compacted.truncated,
      };
    }
  }

  const fallbackPayload: Record<string, unknown> = {
    metadata,
    note: copy.truncatedNote,
  };
  const technologyStack = initialPayload.payload['technology-stack'];
  if (technologyStack) fallbackPayload['technology-stack'] = technologyStack;
  const fallbackCompacted = compactJsonValue(fallbackPayload, 300);
  const fallback = JSON.stringify(fallbackCompacted.value, null, 2);
  const prompt = `${getBrowserContextIntro(language).join('\n')}\n\n\`\`\`json\n${fallback}\n\`\`\``;
  return {
    prompt,
    promptChars: prompt.length,
    promptTruncated: true,
  };
}

/**
 * 根据 profile 的输出格式生成最终 prompt。
 *
 * @param args - prompt 构建参数。
 * @returns prompt 文本。
 */
export function buildPromptFromCollected(args: {
  profile: BrowserContextProfile;
  metadata: BrowserContextMetadataSnapshot | null;
  collected: BrowserContextCollectedSource[];
  language?: string | null;
  buildPrompt: (input: {
    profile: BrowserContextProfile;
    metadata: BrowserContextMetadataSnapshot | null;
    source: BrowserContextCollectedSource;
    language: PromptLanguage;
  }) => string | BrowserContextPromptFragment | null;
  allowMetadataDegrade?: boolean;
}): BuiltBrowserContextPromptPayload {
  const language = normalizePromptLanguage(args.language);
  let effectiveCollected = args.collected.filter((item) => item.ok && item.data);
  const expectsReadableDom = args.profile.sources.includes('readable-dom');
  const hasReadableDom = effectiveCollected.some((item) => item.sourceId === 'readable-dom');
  if (expectsReadableDom && !hasReadableDom && !args.allowMetadataDegrade) {
    // 自动页面上下文的正文若未采到，不再伪装成“只注入 metadata 也算成功”。
    // 这样聊天主链路会直接跳过无价值的页面噪音，状态条则通过 preview 明确展示失败原因。
    effectiveCollected = effectiveCollected.filter((item) => item.sourceId !== 'tab-meta');
  }
  if (effectiveCollected.length < 1) {
    return {
      prompt: null,
      promptChars: 0,
      promptTruncated: false,
    };
  }
  if (args.profile.outputFormat === 'json') {
    return buildJsonPrompt(args.profile, args.metadata, effectiveCollected, language);
  }
  return buildNarrativePrompt({
    profile: args.profile,
    metadata: args.metadata,
    collected: effectiveCollected,
    language,
    buildPrompt: args.buildPrompt,
  });
}
