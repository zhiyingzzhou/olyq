/**
 * 说明：`useSearchPopupView` 组件模块。
 *
 * 职责：
 * - 承载 `useSearchPopupView` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SearchPopupProps`、`useSearchPopupView` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CornerDownLeft, Loader2, MessageSquare, Search, X } from 'lucide-react';

import type { Message, ResolvedConversationContext, TopicSummary } from '@/types/chat';
import { getSuccessfulMessageTranslations } from '@/lib/chat/message-translations';
import { MessageTraceBlocks } from '@/components/chat/MessageTraceBlocks';
import { formatToolCallTraceText, getMessageTraceSegments } from '@/lib/chat/message-trace';
import { buildResolvedConversationContext } from '@/lib/chat/resolved-conversation';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useAssistantStore } from '@/hooks/useAssistantStore';
import { getBestEffortConversationMessages } from '@/hooks/useChatStore';
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore';

/**
 * 搜索弹窗首页路由。
 */
interface SearchPopupHomeRoute {
  /**
   * 首页视图，不携带额外上下文。
   */
  kind: 'home';
}

/**
 * 搜索弹窗话题详情路由。
 */
interface SearchPopupTopicRoute {
  /**
   * 话题详情页标识。
   */
  kind: 'topic';
  /**
   * 当前查看的话题 ID。
   */
  topicId: string;
}

/**
 * 搜索结果页路由。
 */
interface SearchPopupSearchRoute {
  /**
   * 搜索结果页标识。
   */
  kind: 'search';
  /**
   * 当前查询词。
   */
  query: string;
}

/**
 * 消息详情页路由。
 */
interface SearchPopupMessageRoute {
  /**
   * 单条消息详情页标识。
   */
  kind: 'message';
  /**
   * 该消息所属话题 ID。
   */
  topicId: string;
  /**
   * 当前高亮展示的消息 ID。
   */
  messageId: string;
  /**
   * 从哪个上级视图进入消息详情，用于返回路径判断。
   */
  from: 'topic' | 'search';
}

/** 搜索弹窗当前页面路由的联合类型。 */
type Route =
  | SearchPopupHomeRoute
  | SearchPopupTopicRoute
  | SearchPopupSearchRoute
  | SearchPopupMessageRoute;

/**
 * 全局搜索命中的单条结果。
 */
interface SearchResult {
  /**
   * 命中消息所属话题 ID。
   */
  topicId: string;
  /**
   * 话题标题，用于结果列表展示。
   */
  topicTitle: string;
  /**
   * 命中消息 ID。
   */
  messageId: string;
  /**
   * 命中消息角色，便于 UI 区分用户与助手发言。
   */
  role: Message['role'];
  /**
   * 命中消息创建时间戳。
   */
  createdAt: number;
  /**
   * 围绕命中词生成的预览片段。
   */
  snippet: string;
}

/** 全局搜索弹窗的组件入参。 */
export interface SearchPopupProps {
  /**
   * 当前弹窗是否打开。
   */
  open: boolean;
  /**
   * 请求关闭弹窗时触发。
   */
  onClose: () => void;
  /**
   * 普通话题列表摘要。
   */
  topics: TopicSummary[];
  /**
   * 在主聊天面板中打开目标话题或跳转到指定消息的回调。
   */
  onOpenInChat?: (topicId: string, messageId?: string) => void;
}

/**
 * 判断字符串是否只包含 ASCII 字符。
 *
 * @param s - 原始查询词。
 * @returns 仅当所有字符码点都在 ASCII 范围内时返回 `true`。
 */
function isAsciiOnly(s: string) {
  for (let i = 0; i < s.length; i += 1) {
    if (s.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

/**
 * 为查询词推导默认是否区分大小写。
 *
 * 仅当查询词是 ASCII 且包含大写字母时才默认区分大小写，
 * 兼顾代码搜索场景与自然语言搜索的召回率。
 *
 * @param q - 原始查询词。
 * @returns 当前查询是否默认区分大小写。
 */
function defaultCaseSensitiveForQuery(q: string) {
  const query = q.trim();
  if (!query) return false;
  if (!isAsciiOnly(query)) return false;
  return /[A-Z]/.test(query);
}

/**
 * 将 Markdown 内容尽量还原为纯文本，供全文检索使用。
 *
 * @param mdRaw - 原始 Markdown 文本。
 * @returns 去掉常见格式标记后的纯文本。
 */
function markdownToPlainText(mdRaw: string) {
  let s = String(mdRaw || '');
  if (!s) return '';
  s = s.replace(/\r\n/g, '\n');
  s = s.replace(/```[^\n]*\n([\s\S]*?)```/g, (_m, code: string) => `\n${code}\n`);
  s = s.replace(/`([^`]+)`/g, '$1');
  s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  s = s.replace(/^#{1,6}\s+/gm, '');
  s = s.replace(/^>\s?/gm, '');
  s = s.replace(/^(\s*)([-*+]|\d+\.)\s+/gm, '$1');
  s = s.replace(/(\*\*|__)(.*?)\1/g, '$2');
  s = s.replace(/(\*|_)(.*?)\1/g, '$2');
  s = s.replace(/~~(.*?)~~/g, '$1');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/[ \t]+/g, ' ');
  return s;
}

/**
 * 构建单条消息的可搜索文本。
 *
 * 助手消息会额外纳入推理文本和翻译结果，以提升命中率；
 * 系统消息会在调用方过滤，不纳入结果。
 *
 * @param m - 原始消息。
 * @returns 适合做全文匹配的纯文本内容。
 */
function buildMessageSearchText(m: Message) {
  if (m.role === 'assistant') {
    const parts: string[] = [];
    for (const segment of getMessageTraceSegments(m)) {
      if (segment.kind === 'reasoning') {
        const text = segment.text.trim();
        if (text) parts.push(text);
        continue;
      }
      const text = formatToolCallTraceText(segment.toolCall).trim();
      if (text) parts.push(text);
    }
    parts.push(markdownToPlainText(String(m.content || '')).trim());
    for (const translation of getSuccessfulMessageTranslations(m.translations)) {
      const txt = String(translation.content || '').trim();
      if (txt) parts.push(txt);
    }
    return parts.filter(Boolean).join('\n');
  }
  return markdownToPlainText(String(m.content || '')).trim();
}

/**
 * 生成围绕命中词的搜索结果片段。
 *
 * @param textRaw - 原始全文。
 * @param qRaw - 查询词。
 * @param caseSensitive - 当前搜索是否区分大小写。
 * @returns 截断后的预览片段，尽量把命中词放在中心区域。
 */
function makeSnippet(textRaw: string, qRaw: string, caseSensitive: boolean) {
  const text = String(textRaw || '');
  const q = String(qRaw || '').trim();
  if (!q) return text.slice(0, 180);
  const src = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? q : q.toLowerCase();
  const idx = src.indexOf(needle);
  if (idx < 0) return text.slice(0, 180);
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + needle.length + 90);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end)}${suffix}`.slice(0, 240);
}

/**
 * 格式化结果列表中的时间戳。
 *
 * @param ts - 毫秒级时间戳。
 * @returns 本地化时间字符串；失败时返回空字符串。
 */
function formatTime(ts: number) {
  try {
    return new Date(ts).toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * 按置顶状态与排序值对话题摘要排序。
 *
 * @param a - 左侧话题摘要。
 * @param b - 右侧话题摘要。
 * @returns 供 `sort` 使用的比较值。
 */
function sortByPinnedAndOrder(a: TopicSummary, b: TopicSummary) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  const ao = typeof a.order === 'number' ? a.order : a.updatedAt;
  const bo = typeof b.order === 'number' ? b.order : b.updatedAt;
  return bo - ao;
}

/**
 * 搜索弹窗视图组件。
 *
 * 该视图内部维护一个轻量路由栈，用于在首页、搜索结果、话题详情和消息详情之间切换，
 * 并通过 `messages-db` 加载持久化消息完成跨话题全文检索。
 *
 * @param props - 弹窗开关、话题摘要列表与打开聊天页回调。
 * @returns 全局搜索弹窗 JSX。
 */
export function useSearchPopupView({ open, onClose, topics, onOpenInChat }: SearchPopupProps) {
  const { t } = useTranslation();
  const assistants = useAssistantStore((s) => s.assistants);
  const chatSettings = useChatSettingsStore((s) => s.settings);
  const [stack, setStack] = useState<Route[]>([{ kind: 'home' }]);
  const [input, setInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loadingTopic, setLoadingTopic] = useState(false);
  const [topicData, setTopicData] = useState<ResolvedConversationContext | null>(null);

  const topicCacheRef = useRef<Map<string, ResolvedConversationContext>>(new Map());
  const inputRef = useRef<HTMLInputElement | null>(null);

  const route = stack[stack.length - 1] ?? { kind: 'home' } satisfies Route;

  useEffect(() => {
    if (!open) return;
    // 每次重新打开都回到首页，并清空上一次搜索产生的瞬时状态。
    topicCacheRef.current.clear();
    setStack([{ kind: 'home' }]);
    setInput('');
    setSearching(false);
    setResults([]);
    setTopicData(null);
    setLoadingTopic(false);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const push = useCallback((r: Route) => setStack((prev) => [...prev, r]), []);
  const pop = useCallback(() => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev)), []);

  const assistantById = useMemo(() => new Map(assistants.map((a) => [a.id, a])), [assistants]);
  const topicSummaryById = useMemo(() => new Map(topics.map((s) => [s.id, s])), [topics]);

  /**
   * 按话题 ID 读取完整话题数据，并在内存中做一次缓存。
   *
   * @param id - 目标话题 ID。
   * @returns 组装好的完整话题对象；若 ID 为空则返回 `null`。
   */
  const loadTopicConversation = useCallback(async (id: string) => {
    const key = String(id || '').trim();
    if (!key) return null;
    const cached = topicCacheRef.current.get(key);
    if (cached) return cached;
    const messages = await getBestEffortConversationMessages(key);
    const msgs = Array.isArray(messages) ? messages : [];

    const summary = topicSummaryById.get(key);
    const now = Date.now();
    const assistant = summary?.assistantId ? assistantById.get(summary.assistantId) : undefined;
    if (!summary?.assistantId || !assistant) return null;
    const topicConversation = buildResolvedConversationContext({
      assistant,
      topic: {
        id: key,
        assistantId: summary.assistantId,
        name: summary.title || t('chat.defaultTopicTitle'),
        pinned: summary.pinned,
        createdAt: summary.createdAt ?? now,
        updatedAt: summary.updatedAt ?? now,
        order: summary.order,
        topicPrompt: summary.topicPrompt,
        isNameManuallyEdited: summary.isNameManuallyEdited,
      },
      messages: msgs,
      settings: chatSettings,
    });

    topicCacheRef.current.set(key, topicConversation);
    return topicConversation;
  }, [assistantById, chatSettings, t, topicSummaryById]);

  // 进入 topic/message 视图时加载话题正文，避免首页和搜索页额外拉取完整消息。
  const routeTopicId = route.kind === 'topic' || route.kind === 'message' ? route.topicId : '';
  useEffect(() => {
    if (!open) return;
    const id = routeTopicId;
    if (!id) {
      setTopicData(null);
      setLoadingTopic(false);
      return;
    }

    let cancelled = false;
    setLoadingTopic(true);
    void loadTopicConversation(id).then((topicConversation) => {
      if (cancelled) return;
      setTopicData(topicConversation);
      setLoadingTopic(false);
    }).catch(() => {
      if (cancelled) return;
      setTopicData(null);
      setLoadingTopic(false);
    });
    return () => { cancelled = true; };
  }, [loadTopicConversation, open, routeTopicId]);

  /**
   * 在所有话题正文里执行全文搜索。
   *
   * @param queryRaw - 原始查询词。
   * @returns 搜索结果会实时写入本地 state；函数本身不直接返回命中列表。
   */
  const runSearch = useCallback(async (queryRaw: string) => {
    const q = String(queryRaw || '').trim();
    if (!q) return;
    const caseSensitive = defaultCaseSensitiveForQuery(q);

    topicCacheRef.current.clear();
    setSearching(true);
    setResults([]);

    let cancelled = false;
    const cancelToken = { cancel: () => { cancelled = true; } };

    // 在下一次搜索开始前可覆盖：用函数静态字段保存 cancelToken，实现“后搜覆盖前搜”。
    (runSearch as unknown as { _cancel?: { cancel: () => void } })._cancel?.cancel();
    (runSearch as unknown as { _cancel?: { cancel: () => void } })._cancel = cancelToken;

    const all = [...topics].sort(sortByPinnedAndOrder);
    const nextResults: SearchResult[] = [];

    for (const s of all) {
      if (cancelled) break;
      const topicConversation = await loadTopicConversation(s.id);
      if (!topicConversation) continue;
      const msgs = Array.isArray(topicConversation.messages) ? topicConversation.messages : [];
      for (const m of msgs) {
        if (cancelled) break;
        if (m.role === 'system') continue;
        const text = buildMessageSearchText(m);
        const src = caseSensitive ? text : text.toLowerCase();
        const needle = caseSensitive ? q : q.toLowerCase();
        if (!src.includes(needle)) continue;
        nextResults.push({
          topicId: topicConversation.id,
          topicTitle: topicConversation.title || s.title,
          messageId: m.id,
          role: m.role,
          createdAt: m.createdAt,
          snippet: makeSnippet(text, q, caseSensitive),
        });
        if (nextResults.length >= 200) break;
      }
      if (nextResults.length >= 200) break;
      // 逐话题刷新一次，避免长时间无反馈
      setResults([...nextResults]);
    }

    if (!cancelled) setResults([...nextResults]);
    if (!cancelled) setSearching(false);
  }, [loadTopicConversation, topics]);

  /**
   * 从当前输入框内容发起搜索并压栈到搜索结果页。
   */
  const goSearch = useCallback(async () => {
    const q = input.trim();
    if (!q) return;
    push({ kind: 'search', query: q });
    await runSearch(q);
  }, [input, push, runSearch]);

  const headerTitle = t('search.globalTitle');
  const canGoBack = stack.length > 1;

  const homeTopics = useMemo(() => [...topics].sort(sortByPinnedAndOrder), [topics]);

  const topicMessages = useMemo(() => {
    if (route.kind !== 'topic') return [];
    const msgs = Array.isArray(topicData?.messages) ? topicData!.messages : [];
    return msgs.filter((m) => m.role !== 'system');
  }, [route.kind, topicData]);

  const activeMessageId = route.kind === 'message' ? route.messageId : null;

  const activeMessage = useMemo(() => {
    if (!activeMessageId) return null;
    const msgs = Array.isArray(topicData?.messages) ? topicData!.messages : [];
    return msgs.find((m) => m.id === activeMessageId) ?? null;
  }, [activeMessageId, topicData]);

  const activeTopicTitle = topicData?.title || (route.kind !== 'home' ? (() => {
    const id = 'topicId' in route ? route.topicId : '';
    const found = [...topics].find((s) => s.id === id);
    return found?.title || '';
  })() : '');

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl h-[80vh] p-0 flex flex-col overflow-hidden">
        <DialogTitle className="sr-only">{headerTitle}</DialogTitle>
        <DialogDescription className="sr-only">{t('search.globalPlaceholder')}</DialogDescription>

        {/* Top bar */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          {canGoBack ? (
            <TooltipAction tooltip={t('search.prev')}>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={pop}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </TooltipAction>
          ) : (
            <Search className="h-4 w-4 text-muted-foreground" />
          )}

          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void goSearch();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                if (canGoBack) pop();
                else onClose();
              }
            }}
            placeholder={t('search.globalPlaceholder')}
            className="h-9"
          />

          <TooltipAction tooltip={t('search.next')}>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => void goSearch()}
              disabled={!input.trim()}
            >
              <CornerDownLeft className="h-4 w-4" />
            </Button>
          </TooltipAction>

          <TooltipAction tooltip={t('common.close')}>
            <Button size="icon" variant="ghost" className="h-8 w-8 ml-1" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </TooltipAction>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {route.kind === 'home' && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">{t('sidebar.topics')}</div>
              <div className="space-y-1">
                {homeTopics.length === 0 && <div className="text-sm text-muted-foreground">{t('sidebar.emptyTopics')}</div>}
                {homeTopics.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => push({ kind: 'topic', topicId: s.id })}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-muted/10 hover:bg-accent/40 transition-colors text-left"
                  >
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate text-sm">{s.title}</span>
                    <span className="text-xs text-muted-foreground">{formatTime(s.updatedAt)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {route.kind === 'topic' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{activeTopicTitle}</div>
                  <div className="text-xs text-muted-foreground">{t('chat.messages')}: {topicMessages.length}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8"
                    onClick={() => onOpenInChat?.(route.topicId)}
                  >
                    {t('search.openInChat')}
                  </Button>
                </div>
              </div>

              {loadingTopic && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}
                </div>
              )}

              {!loadingTopic && topicMessages.length === 0 && (
                <div className="text-sm text-muted-foreground">{t('search.noResults')}</div>
              )}

              <div className="space-y-2">
                {topicMessages.slice().reverse().slice(0, 80).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => push({ kind: 'message', topicId: route.topicId, messageId: m.id, from: 'topic' })}
                    className="w-full text-left px-3 py-2 rounded-lg border border-border/60 bg-muted/10 hover:bg-accent/40 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {m.role === 'user' ? t('chat.roleYou') : m.role === 'assistant' ? t('chat.assistant') : m.role}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatTime(m.createdAt)}</span>
                    </div>
                    <div className="text-sm text-foreground/90 line-clamp-2 mt-1">
                      {makeSnippet(buildMessageSearchText(m), '', true)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {route.kind === 'search' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium truncate">{t('search.globalTitle')} · {route.query}</div>
                {searching && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('common.loading')}
                  </div>
                )}
              </div>

              {!searching && results.length === 0 && (
                <div className="text-sm text-muted-foreground">{t('search.noResults')}</div>
              )}

              <div className="space-y-2">
                {results.map((r) => (
                  <button
                    key={`${r.topicId}:${r.messageId}`}
                    type="button"
                    onClick={() => push({ kind: 'message', topicId: r.topicId, messageId: r.messageId, from: 'search' })}
                    className="w-full text-left px-3 py-2 rounded-lg border border-border/60 bg-muted/10 hover:bg-accent/40 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground truncate">{r.topicTitle}</span>
                      <span className="text-xs text-muted-foreground">{formatTime(r.createdAt)}</span>
                    </div>
                    <div className="text-sm text-foreground/90 whitespace-pre-wrap line-clamp-2 mt-1">{r.snippet}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {route.kind === 'message' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{activeTopicTitle}</div>
                  <div className="text-xs text-muted-foreground">{activeMessage ? formatTime(activeMessage.createdAt) : ''}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8"
                    onClick={() => onOpenInChat?.(route.topicId, route.messageId)}
                  >
                    {t('search.openInChat')}
                  </Button>
                </div>
              </div>

              {loadingTopic && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}
                </div>
              )}

              {!loadingTopic && !activeMessage && (
                <div className="text-sm text-muted-foreground">{t('search.noResults')}</div>
              )}

              {activeMessage && (
                <div className="rounded-xl border border-border/60 bg-background/60 backdrop-blur-sm p-4">
                  {activeMessage.role === 'assistant' ? <MessageTraceBlocks message={activeMessage} /> : null}
                  <div className="markdown-body">
                    <MarkdownRenderer content={activeMessage.content || ''} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
