/**
 * 说明：`collectors-builtins` 浏览器上下文内置 collector 装配模块。
 *
 * 职责：
 * - 注册 `tab-meta`、`selection-snapshot`、`element-snapshot`、`readable-dom`、`page-style-signals` 内置 source；
 * - 保持 source 采集语义与 prompt 片段构建逻辑集中可见；
 * - 为 `collectors.ts` 门面提供一次性 side effect 注册。
 *
 * 边界：
 * - 本模块只负责注册，不直接驱动 runtime 预热或发送前 preflight；
 * - 不维护 source cache、截图队列和 UI 状态；
 * - 若后续新增内置 source，应继续通过 registry 装配，而不是回到单文件巨大实现。
 */
import { buildPageStyleSignalsContextPrompt } from '@/lib/prompt-builder';
import type { PageStyleSignalsPayload } from '@/types/sw-messages';
import { requestTechnologyStack } from '@/lib/extension/technology-stack-api';
import type { PromptLanguage } from '@/lib/prompt-language';
import { buildTechnologyStackPrompt } from '@/lib/technology-stack/prompt';
import type { TechnologyStackResult } from '@/lib/technology-stack/types';
import { resolvePageStyleContextSnapshot } from './page-style-context';
import {
  buildReadableDomPromptFragment,
  normalizeHeadings,
} from './collectors-prompt';
import { convertReadableHtmlToMarkdown } from './collectors-readable-markdown';
import {
  SEND_PREFLIGHT_FULL_PAGE_READABLE_DOM_STABLE_WAIT_MS,
  SEND_PREFLIGHT_READABLE_DOM_STABLE_WAIT_MS,
  queryActiveTabMetadata,
  requestReadableDomFromSw,
} from './collectors-sources';
import { registerBrowserContextCollector } from './collectors-registry';

/** 内置 collector 自有 prompt 标签的本地化文案。 */
const COLLECTOR_PROMPT_COPY: Record<PromptLanguage, {
  untitled: string;
  tabMeta: {
    heading: string;
    title: string;
    url: string;
    textTitle: string;
    textUrl: string;
  };
  selection: {
    heading: string;
    textHeading: string;
  };
  element: {
    heading: string;
    textHeading: string;
    type: string;
    code: string;
    kindMap: Record<string, string>;
  };
  readable: {
    heading: string;
    textHeading: string;
    pageTitle: string;
    pageUrl: string;
    extractionMode: string;
    articleMode: string;
    visiblePageMode: string;
    structuredPageMode: string;
    embeddedFrameMode: string;
    metadataOnlyMode: string;
    articleTitle: string;
    byline: string;
    excerpt: string;
    outline: string;
    body: string;
  };
}> = {
  'zh-CN': {
    untitled: '(无标题)',
    tabMeta: {
      heading: '## 页面元数据',
      title: '标题',
      url: '地址',
      textTitle: '页面标题',
      textUrl: '页面地址',
    },
    selection: {
      heading: '## 最近选中文本',
      textHeading: '最近选中文本',
    },
    element: {
      heading: '## 最近元素快照',
      textHeading: '最近元素快照',
      type: '类型',
      code: '代码',
      kindMap: {
        text: '文本',
        table: '表格',
        image: '图片',
        visual: '视觉区域',
      },
    },
    readable: {
      heading: '## 当前页面上下文',
      textHeading: '当前页面上下文',
      pageTitle: '页面标题',
      pageUrl: '页面地址',
      extractionMode: '提取模式',
      articleMode: '文章主体',
      visiblePageMode: '页面正文',
      structuredPageMode: '结构列表',
      embeddedFrameMode: '嵌入页面正文',
      metadataOnlyMode: '仅元数据',
      articleTitle: '文章标题',
      byline: '作者',
      excerpt: '摘要',
      outline: '结构提纲',
      body: '正文片段',
    },
  },
  'en-US': {
    untitled: '(untitled)',
    tabMeta: {
      heading: '## Page Metadata',
      title: 'Title',
      url: 'URL',
      textTitle: 'Page title',
      textUrl: 'Page URL',
    },
    selection: {
      heading: '## Recent Selected Text',
      textHeading: 'Recent selected text',
    },
    element: {
      heading: '## Recent Element Snapshot',
      textHeading: 'Recent element snapshot',
      type: 'Type',
      code: 'code',
      kindMap: {
        text: 'text',
        table: 'table',
        image: 'image',
        visual: 'visual region',
      },
    },
    readable: {
      heading: '## Current Page Context',
      textHeading: 'Current page context',
      pageTitle: 'Page title',
      pageUrl: 'Page URL',
      extractionMode: 'Extraction mode',
      articleMode: 'Article body',
      visiblePageMode: 'Visible page body',
      structuredPageMode: 'Structured list',
      embeddedFrameMode: 'Embedded page body',
      metadataOnlyMode: 'Metadata only',
      articleTitle: 'Article title',
      byline: 'Author',
      excerpt: 'Summary',
      outline: 'Outline',
      body: 'Body excerpt',
    },
  },
};

/** 读取内置 collector prompt 文案。 */
function getCollectorPromptCopy(language: PromptLanguage) {
  return COLLECTOR_PROMPT_COPY[language];
}

/** 根据当前 prompt 语言显示元素类型。 */
function formatElementKind(kind: string, language: PromptLanguage): string {
  const copy = getCollectorPromptCopy(language).element;
  if (kind === 'code') return copy.code;
  return copy.kindMap[kind] ?? kind;
}

/**
 * 按当前语言格式化正文采集模式。
 *
 * @param mode - 正文采集模式。
 * @param language - 当前 prompt 语言。
 * @returns 用户可读模式名。
 */
function formatReadableMode(mode: string, language: PromptLanguage): string {
  const copy = getCollectorPromptCopy(language).readable;
  switch (mode) {
    case 'article':
      return copy.articleMode;
    case 'visible-page':
      return copy.visiblePageMode;
    case 'structured-page':
      return copy.structuredPageMode;
    case 'embedded-frame':
      return copy.embeddedFrameMode;
    case 'metadata-only':
    default:
      return copy.metadataOnlyMode;
  }
}


registerBrowserContextCollector({
  id: 'tab-meta',
  collect: async (ctx) => {
    const metadata = ctx.metadata ?? await queryActiveTabMetadata();
    if (!metadata) {
      return {
        sourceId: 'tab-meta',
        ok: false,
        error: 'metadata-unavailable',
      };
    }
    return {
      sourceId: 'tab-meta',
      ok: true,
      data: metadata as unknown as Record<string, unknown>,
    };
  },
  buildPrompt: ({ profile, source, language }) => {
    if (!source.ok || !source.data) return null;
    const copy = getCollectorPromptCopy(language).tabMeta;
    const metadata = source.data as typeof source.data & { title?: string; url?: string };
    if (profile.outputFormat === 'markdown') {
      return [
        copy.heading,
        `- ${copy.title}: ${metadata.title || getCollectorPromptCopy(language).untitled}`,
        `- ${copy.url}: ${metadata.url || ''}`,
      ].join('\n');
    }
    return [
      `${copy.textTitle}: ${metadata.title || getCollectorPromptCopy(language).untitled}`,
      `${copy.textUrl}: ${metadata.url || ''}`,
    ].join('\n');
  },
});

registerBrowserContextCollector({
  id: 'selection-snapshot',
  collect: async (ctx) => {
    if (!ctx.selection?.text?.trim()) {
      return {
        sourceId: 'selection-snapshot',
        ok: false,
        error: 'selection-unavailable',
      };
    }
    return {
      sourceId: 'selection-snapshot',
      ok: true,
      data: {
        text: ctx.selection.text,
        url: ctx.selection.url || undefined,
        title: ctx.selection.title || undefined,
        capturedAt: ctx.selection.capturedAt,
      },
    };
  },
  buildPrompt: ({ profile, source, language }) => {
    if (!source.ok || !source.data) return null;
    const text = String(source.data.text || '').trim();
    if (!text) return null;
    const copy = getCollectorPromptCopy(language).selection;
    if (profile.outputFormat === 'markdown') {
      return `${copy.heading}\n\n> ${text.replace(/\n/g, '\n> ')}`;
    }
    return `[${copy.textHeading}]\n${text}`;
  },
});

registerBrowserContextCollector({
  id: 'element-snapshot',
  collect: async (ctx) => {
    if (!ctx.element?.text?.trim()) {
      return {
        sourceId: 'element-snapshot',
        ok: false,
        error: 'element-unavailable',
      };
    }
    return {
      sourceId: 'element-snapshot',
      ok: true,
      data: {
        kind: ctx.element.kind,
        text: ctx.element.text,
        codeLanguage: ctx.element.codeLanguage || undefined,
        url: ctx.element.url || undefined,
        title: ctx.element.title || undefined,
        capturedAt: ctx.element.capturedAt,
      },
    };
  },
  buildPrompt: ({ profile, source, language }) => {
    if (!source.ok || !source.data) return null;
    const kind = String(source.data.kind || 'text');
    const text = String(source.data.text || '').trim();
    const codeLanguage = String(source.data.codeLanguage || '').trim();
    if (!text) return null;
    const copy = getCollectorPromptCopy(language).element;
    const kindLabel = formatElementKind(kind, language);

    if (profile.outputFormat === 'markdown') {
      if (kind === 'code') {
        return `${copy.heading}\n\n${copy.type}: ${kindLabel}${codeLanguage ? ` (${codeLanguage})` : ''}\n\n\`\`\`${codeLanguage}\n${text}\n\`\`\``;
      }
      return `${copy.heading}\n\n${copy.type}: ${kindLabel}\n\n${text}`;
    }

    if (kind === 'code') {
      return [
        `[${copy.textHeading}] ${copy.type}: ${kindLabel}${codeLanguage ? ` (${codeLanguage})` : ''}`,
        text,
      ].join('\n');
    }
    return [
      `[${copy.textHeading}] ${copy.type}: ${kindLabel}`,
      text,
    ].join('\n');
  },
});

registerBrowserContextCollector({
  id: 'readable-dom',
  collect: async (ctx) => {
    // 普通发送前 preflight 的总等待预算可能覆盖 iframe 补采集；顶层正文稳定窗口仍保持短探测，
    // 否则 preview shell 会先等满长预算，后台还没来得及扫 embedded frame。显式全文模式继续
    // 使用调用方预算，保证“读取全文”仍能等待较长的可见 DOM 稳定窗口。
    const stableWaitMs = ctx.reason === 'send-preflight'
      ? ctx.readableDomIntent === 'normal'
        ? SEND_PREFLIGHT_READABLE_DOM_STABLE_WAIT_MS
        : SEND_PREFLIGHT_FULL_PAGE_READABLE_DOM_STABLE_WAIT_MS
      : ctx.stableWaitMs;
    const response = await requestReadableDomFromSw(ctx.metadata, stableWaitMs, ctx.readableDomIntent);
    const payload = response.payload ?? null;
    if (!payload?.text?.trim()) {
      return {
        sourceId: 'readable-dom',
        ok: false,
        error: response.error || 'collector-unavailable',
      };
    }

    const markdown = payload.html?.trim()
      ? convertReadableHtmlToMarkdown(payload.html, payload.text)
      : undefined;

    return {
      sourceId: 'readable-dom',
      ok: true,
      data: {
        mode: payload.mode,
        sourceKind: payload.sourceKind,
        frameId: payload.frameId,
        parentFrameId: payload.parentFrameId,
        frameUrl: payload.frameUrl,
        frameTitle: payload.frameTitle,
        isTopFrame: payload.isTopFrame,
        extractedAt: payload.extractedAt,
        pageFingerprint: payload.pageFingerprint,
        routeKey: payload.routeKey,
        stableWindowVersion: payload.stableWindowVersion,
        title: payload.articleTitle || payload.title,
        byline: payload.byline || undefined,
        excerpt: payload.excerpt || undefined,
        text: payload.text,
        headings: payload.headings,
        contentChars: payload.contentChars,
        visibleTextChars: payload.visibleTextChars,
        structuredItemCount: payload.structuredItemCount,
        degradeReason: payload.degradeReason,
        markdown,
      },
    };
  },
  buildPrompt: ({ profile, metadata, source, language }) => {
    if (!source.ok || !source.data) return null;
    const copy = getCollectorPromptCopy(language).readable;
    const title = String(source.data.title || '').trim();
    const byline = String(source.data.byline || '').trim();
    const excerpt = String(source.data.excerpt || '').trim();
    const text = String(source.data.text || '').trim();
    const markdown = String(source.data.markdown || '').trim();
    const mode = String(source.data.mode || '').trim();
    const sourceKind = String(source.data.sourceKind || '').trim();
    const headings = normalizeHeadings(source.data.headings);
    const pageTitle = String(metadata?.title || title || '').trim();
    const pageUrl = String(metadata?.url || '').trim();
    const frameUrl = String(source.data.frameUrl || '').trim();
    const readableMode = formatReadableMode(sourceKind === 'embedded-frame' ? 'embedded-frame' : mode, language);
    if (!text && !markdown) return null;

    if (profile.outputFormat === 'markdown') {
      const parts = [copy.heading];
      if (pageTitle) parts.push(`- ${copy.pageTitle}: ${pageTitle}`);
      if (pageUrl) parts.push(`- ${copy.pageUrl}: ${pageUrl}`);
      parts.push(`- ${copy.extractionMode}: ${readableMode}`);
      if (sourceKind === 'embedded-frame' && frameUrl && frameUrl !== pageUrl) parts.push(`- ${copy.pageUrl}: ${frameUrl}`);
      if (title && title !== pageTitle) parts.push(`- ${copy.articleTitle}: ${title}`);
      if (byline) parts.push(`- ${copy.byline}: ${byline}`);
      if (excerpt) parts.push(`- ${copy.excerpt}: ${excerpt}`);
      if (headings.length > 0) {
        parts.push('', `### ${copy.outline}`);
        parts.push(...headings.map((item) => `${'  '.repeat(item.level - 1)}- ${item.text}`));
      }
      parts.push('', `### ${copy.body}`);
      return buildReadableDomPromptFragment(profile, parts, markdown || text, language);
    }

    const header = [`[${copy.textHeading}]`];
    if (pageTitle) header.push(`${copy.pageTitle}: ${pageTitle}`);
    if (pageUrl) header.push(`${copy.pageUrl}: ${pageUrl}`);
    header.push(`${copy.extractionMode}: ${readableMode}`);
    if (sourceKind === 'embedded-frame' && frameUrl && frameUrl !== pageUrl) header.push(`${copy.pageUrl}: ${frameUrl}`);
    if (title && title !== pageTitle) header.push(`${copy.articleTitle}: ${title}`);
    if (byline) header.push(`${copy.byline}: ${byline}`);
    if (excerpt) header.push(`${copy.excerpt}: ${excerpt}`);
    if (headings.length > 0) {
      header.push(`${copy.outline}:`);
      header.push(...headings.map((item) => `${'  '.repeat(item.level - 1)}- ${item.text}`));
    }
    header.push(`${copy.body}:`);
    return buildReadableDomPromptFragment(profile, header, markdown || text, language);
  },
});

registerBrowserContextCollector({
  id: 'technology-stack',
  collect: async (ctx) => {
    const tabId = ctx.metadata?.tabId ?? 0;
    if (!tabId || !ctx.metadata?.url) {
      return {
        sourceId: 'technology-stack',
        ok: false,
        error: 'metadata-unavailable',
      };
    }

    const requestPayload = ctx.technologyStackMinPass === 'enhanced'
      ? { tabId, minPass: 'enhanced' as const, waitMs: ctx.technologyStackWaitMs }
      : { tabId };
    const response = await requestTechnologyStack(requestPayload);
    const payload = response?.payload ?? null;
    if (!response?.ok || !payload) {
      return {
        sourceId: 'technology-stack',
        ok: false,
        error: response?.error || 'collector-unavailable',
      };
    }
    if (payload.status === 'uncollectable') {
      return {
        sourceId: 'technology-stack',
        ok: false,
        error: payload.error || 'page-uncollectable',
      };
    }
    if (payload.status === 'error') {
      return {
        sourceId: 'technology-stack',
        ok: false,
        error: payload.error || 'collector-unavailable',
      };
    }
    return {
      sourceId: 'technology-stack',
      ok: true,
      data: payload as unknown as Record<string, unknown>,
      cacheMeta: {
        technologyStackPageKey: response.meta?.pageKey ?? ctx.metadata?.technologyStackPageKey,
        technologyStackEnhanced: Boolean(response.meta?.enhanced),
      },
    };
  },
  buildPrompt: ({ source, language }) => {
    if (!source.ok || !source.data) return null;
    return buildTechnologyStackPrompt(source.data as unknown as TechnologyStackResult, { language });
  },
});

registerBrowserContextCollector({
  id: 'page-style-signals',
  collect: async (ctx) => {
    const resolved = await resolvePageStyleContextSnapshot({
      conversationKey: ctx.conversationKey,
      metadata: ctx.metadata,
      forceSignals: Boolean(ctx.force),
      forceCaptures: false,
      requireCaptures: false,
      stableWaitMs: ctx.stableWaitMs,
    });
    const payload = resolved.snapshot?.signals ?? null;
    if (!payload) {
      return {
        sourceId: 'page-style-signals',
        ok: false,
        error: resolved.liveError || 'collector-unavailable',
      };
    }

    return {
      sourceId: 'page-style-signals',
      ok: true,
      data: payload as unknown as Record<string, unknown>,
    };
  },
  buildPrompt: ({ profile, metadata, source, language }) => {
    if (!source.ok || !source.data) return null;
    return buildPageStyleSignalsContextPrompt({
      source: {
        url: metadata?.url || String(source.data.url || ''),
        title: metadata?.title || String(source.data.title || ''),
      },
      signals: source.data as unknown as PageStyleSignalsPayload,
      format: profile.outputFormat === 'markdown' ? 'markdown' : 'text',
      language,
    });
  },
});
