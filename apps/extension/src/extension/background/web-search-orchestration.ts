/**
 * 说明：`web-search-orchestration` 后台运行时模块。
 *
 * 职责：
 * - 承载 `web-search-orchestration` 相关的当前文件实现与模块边界；
 * - 对外暴露 `maybeOrchestrateExternalWebSearch` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { generateText } from 'ai';

import { toUserFacingAiErrorText } from '@/lib/ai/utils/api-errors';
import { createId } from '@/lib/utils/id';
import { i18nText } from '@/lib/i18n/text';
import type { ChatMessage, ChatStreamParams } from '@/lib/ai/types';
import {
  isWebSearchProviderUsable,
  resolveWebSearchProviderId,
} from '@/lib/web-search/provider-registry';
import type { WebSearchResult, WebSearchSettings } from '@/lib/web-search/types';
import { executeWebSearch } from '@/lib/web-search/search-service';
import type { I18nText } from '@/types/i18n';
import { isPlainRecord } from '../../lib/utils/type-guards';
import { clamp } from '../../lib/utils/math';
import type { ChatPipelineContext } from './pipeline-types';
import {
  buildTextTaskCallPlan,
  toGenerateTextCallSettings,
} from './text-task-call-plan';
import { runWithChatPipelineHeartbeat } from './chat-pipeline-activity';

/** 模型从 XML 输出中提取出的联网搜索意图结构。 */
type WebSearchExtraction = {
  /** 规范化后的搜索问题列表，按优先级排序，最多保留少量高质量 query。 */
  question: string[];
  /** 可选：模型显式抽取出的 URL 列表，用于定向抓取或调试展示。 */
  links?: string[];
};

/** 把任意搜索异常归一化为更适合 UI 的 I18nText。 */
function toWebSearchErrorText(e: unknown): I18nText {
  const name = isPlainRecord(e) ? e['name'] : null;
  if (name === 'AbortError') return i18nText('errors.cancelled');

  const t = toUserFacingAiErrorText(e);
  if (t.key === 'errors.unknown') return i18nText('errors.webSearchFailed');
  if (t.key === 'errors.unknownWithDetail') {
    const detail = typeof t.params?.detail === 'string' ? t.params.detail.trim() : '';
    return detail
      ? i18nText('errors.webSearchFailedWithDetail', { detail })
      : i18nText('errors.webSearchFailed');
  }
  return t;
}

/** 读取最近一条用户消息文本。 */
function pickLastUserText(params: ChatStreamParams): string {
  const msgs = Array.isArray(params.messages) ? params.messages : [];
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i];
    if (m?.role === 'user' && typeof m.content === 'string') return m.content;
  }
  return '';
}

/** 读取最近一条助手消息文本。 */
function pickLastAssistantText(params: ChatStreamParams): string {
  const msgs = Array.isArray(params.messages) ? params.messages : [];
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i];
    if (m?.role === 'assistant' && typeof m.content === 'string') return m.content;
  }
  return '';
}

/** 从 XML-like 文本中提取指定标签内容。 */
function extractXmlSection(text: string, tagName: string): string | null {
  const src = String(text || '');
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const m = re.exec(src);
  return m ? m[1] : null;
}

/** 从模型输出的 XML 中提取联网搜索意图。 */
function extractWebSearchFromXml(text: string): WebSearchExtraction | null {
  const src = String(text || '');
  const body = extractXmlSection(src, 'websearch') ?? extractXmlSection(src, 'web_search') ?? src;

  const questions = Array.from(body.matchAll(/<question[^>]*>([\s\S]*?)<\/question>/gi))
    .map((m) => String(m[1] || '').trim())
    .filter(Boolean);

  const links = Array.from(body.matchAll(/<links[^>]*>([\s\S]*?)<\/links>/gi))
    .map((m) => String(m[1] || '').trim())
    .filter(Boolean);

  if (questions.length === 0) return null;
  return {
    question: questions,
    ...(links.length > 0 ? { links } : {}),
  };
}

/**
 * 规范化模型提取出来的联网搜索意图。
 *
 * 说明：
 * - 问题为空时会回退到用户原始问题；
 * - `not_needed` 语义必须严格保留为单一值。
 */
function normalizeExtraction(extracted: WebSearchExtraction | null, fallbackQuestion: string): WebSearchExtraction {
  const q = String(fallbackQuestion || '').trim();

  if (!extracted) return { question: q ? [q] : ['search'] };

  const questions = Array.isArray(extracted.question)
    ? extracted.question.map((x) => String(x || '').trim()).filter(Boolean)
    : [];

  const first = questions[0] ? questions[0].trim() : '';
  if (!first) return { question: q ? [q] : ['search'] };

  // 约束：最多 3 条；避免生成过多无意义查询
  const compact = questions.slice(0, 3);
  const links = Array.isArray(extracted.links)
    ? extracted.links.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 5)
    : [];

  // 说明：标记 not_needed 需严格保留单一值（按当前实现语义）
  if (compact[0] === 'not_needed') return { question: ['not_needed'], ...(links.length > 0 ? { links } : {}) };

  return { question: compact, ...(links.length > 0 ? { links } : {}) };
}

/**
 * 借助模型把用户最新问题改写成搜索 query。
 *
 * 说明：
 * - 意图提取失败不会阻塞主对话，最终会回退为直接使用原问题；
 * - 输出格式约束成 XML，是为了让后续提取逻辑更稳定。
 */
async function extractSearchKeywordsWithModel(ctx: ChatPipelineContext, question: string, lastAnswer: string): Promise<WebSearchExtraction> {
  const q = String(question || '').trim();
  if (!q) return { question: ['not_needed'] };

  const prompt = [
    'You are a web-search query rewriter.',
    "Your job: rewrite the user's latest message into standalone search queries that can be used to retrieve relevant information from the internet.",
    '',
    'Output format: XML only. No explanations.',
    'Template (links optional; multiple questions allowed):',
    '<websearch>',
    '  <question>...</question>',
    '  <question>...</question>',
    '  <links>https://example.com</links>',
    '</websearch>',
    '',
    'Rules:',
    '1) If the user explicitly requests no web browsing / no internet / offline answer / do not search -> return <question>not_needed</question>.',
    '2) If the user message is only small talk or a pure writing task (poem/story), brainstorming, translation, rewriting, or summarizing text that the user already provided -> return not_needed.',
    "3) Otherwise, return 1-3 short, specific, searchable queries in the user's language.",
    '4) If the user includes URLs, put each URL into its own <links> tag.',
    '5) Keep queries concise; prefer concrete keywords (names, version, location, date) when present.',
    '',
    'Examples:',
    'Q: 你好 / hi',
    '<websearch><question>not_needed</question></websearch>',
    'Q: Docker 是什么？',
    '<websearch><question>Docker 是什么</question></websearch>',
    'Q: 总结这篇文章 https://example.com',
    '<websearch><question>summarize</question><links>https://example.com</links></websearch>',
    '',
    '<conversation>',
    lastAnswer ? `assistant: ${lastAnswer}` : '',
    '</conversation>',
    '',
    `Follow up question: ${q}`,
    'Rephrased question:',
  ].filter(Boolean).join('\n');

  try {
    const plan = await buildTextTaskCallPlan({
      model: ctx.params.model,
      temperature: 0.2,
      maxTokens: 260,
      modelParams: ctx.params.modelParams,
      enableWebSearch: false,
    });
    const { text } = await runWithChatPipelineHeartbeat(ctx, 'web-search-planning', () => generateText({
      model: plan.languageModel,
      prompt,
      ...toGenerateTextCallSettings(plan.callSettings),
      abortSignal: ctx.signal,
      ...(plan.providerOptions ? { providerOptions: plan.providerOptions } : {}),
    }));
    const extracted = extractWebSearchFromXml(text);
    return normalizeExtraction(extracted, q);
  } catch {
    // 尽力而为：意图分析失败不应阻塞主对话；此时直接用原问题作为搜索 query
    return { question: q ? [q] : ['search'] };
  }
}

/** 把搜索结果转成注入给模型的系统上下文。 */
function buildSearchContextForModel(results: WebSearchResult[]): string {
  if (!results || results.length === 0) return '';

  const citationData = results.map((r, idx) => ({
    number: idx + 1,
    title: String(r.title || '').trim() || '(untitled)',
    url: String(r.url || '').trim(),
    snippet: String(r.snippet || '').trim(),
  }));

  return [
    '以下是网络搜索结果（请在回答中用 [编号] 标注引用来源，例如“…。[3]”）：',
    '```json',
    JSON.stringify(citationData, null, 2),
    '```',
    '如果来源不相关或不足以支撑结论，请明确说明，并基于你的知识回答。',
  ].join('\n');
}

/** 把搜索结果上下文插入到最后一条用户消息之前。 */
function injectSystemBeforeLastUser(messages: ChatMessage[], systemContent: string): ChatMessage[] {
  const text = String(systemContent || '').trim();
  if (!text) return messages;

  const idx = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'user') return i;
    }
    return -1;
  })();

  const sys: ChatMessage = { role: 'system', content: text };
  if (idx < 0) return [...messages, sys];
  return [...messages.slice(0, idx), sys, ...messages.slice(idx)];
}

/** 外部联网搜索编排后的产物。 */
type WebSearchOrchestrationResult = {
  /**
   * 如有值，表示已把搜索结果上下文注入到消息列表中；
   * 调用方应使用这里返回的新消息数组继续后续模型请求。
   */
  messages?: ChatMessage[];
};

/**
 * 外部联网搜索编排（Topic 模式）
 *
 * 目标（按当前实现语义）：
 * - “选了外部 Provider” ≠ “每轮都搜”
 * - 先做意图识别，仅在需要时执行搜索
 * - 搜索失败不阻塞对话：回退为不注入上下文
 * - 与模型能力无关：不依赖 tool calling（用户明确要求“别管模型”）
 */
export async function maybeOrchestrateExternalWebSearch(ctx: ChatPipelineContext): Promise<WebSearchOrchestrationResult> {
  const pid = resolveWebSearchProviderId(ctx.params.webSearchProviderId);
  const settings = ctx.params.webSearchSettings;
  const debug = Boolean(ctx.params.debug);
  if (!pid || !settings) return {};
  if (!isWebSearchProviderUsable(pid, settings)) return {};

  // 只围绕“最后一条用户问题”决定是否联网，避免旧轮次历史把本轮判断带偏。
  const lastUser = pickLastUserText(ctx.params);
  if (!lastUser.trim()) return {};

  const lastAnswer = pickLastAssistantText(ctx.params);
  const extracted = await extractSearchKeywordsWithModel(ctx, lastUser, lastAnswer);
  const prepared = (extracted.question || []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 3);
  if (prepared.length === 0) return {};
  if (prepared[0] === 'not_needed') {
    if (debug) {
      ctx.emit({
        type: 'chat/debug',
        requestId: ctx.requestId,
        kind: 'websearch/decision',
        payload: { needed: false, providerId: pid },
      });
    }
    return {};
  }

  const preparedLinks = Array.isArray(extracted.links) ? extracted.links.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 5) : [];

  // 继续沿用现有 chat/tool-call 事件模型，让 UI 调试视图能感知“外部搜索”这一步。
  const toolCallId = createId();
  ctx.emit({
    type: 'chat/tool-call',
    requestId: ctx.requestId,
    toolCallId,
    toolName: 'builtin__web_search',
    args: { additionalContext: '' },
  });

  const q = prepared[0]!;
  const maxResults = clamp(Number(settings.maxResults ?? 5), 1, 20);
  const searchWithTime = settings.searchWithTime !== false;
  const excludeDomains = Array.isArray(settings.excludeDomains)
    ? settings.excludeDomains.map((d) => String(d || '').trim()).filter(Boolean)
    : [];

  const effectiveSettings: WebSearchSettings = {
    ...settings,
    providerId: pid,
    maxResults,
    searchWithTime,
    excludeDomains,
  };

  try {
    if (debug) {
      ctx.emit({
        type: 'chat/debug',
        requestId: ctx.requestId,
        kind: 'websearch/execute',
        payload: { providerId: pid, query: q, preparedQueries: prepared, preparedLinks },
      });
    }

    const results = await runWithChatPipelineHeartbeat(
      ctx,
      'web-search-execution',
      () => executeWebSearch(q, effectiveSettings, ctx.signal),
    );
    ctx.emit({
      type: 'chat/tool-result',
      requestId: ctx.requestId,
      toolCallId,
      toolName: 'builtin__web_search',
      result: {
        providerId: pid,
        query: q,
        results,
        preparedQueries: prepared,
        preparedLinks,
      },
    });

    // 搜索结果不会直接改写用户问题，而是以系统上下文形式插入到最后一条 user 前。
    const ctxText = buildSearchContextForModel(results);
    if (!ctxText) return {};

    return {
      messages: injectSystemBeforeLastUser(ctx.params.messages, ctxText),
    };
  } catch (e: unknown) {
    // 联网失败只回传 tool-error 事件，不中断后续模型生成。
    ctx.emit({
      type: 'chat/tool-error',
      requestId: ctx.requestId,
      toolCallId,
      toolName: 'builtin__web_search',
      args: { additionalContext: '' },
      error: toWebSearchErrorText(e),
    });
    return {};
  }
}
