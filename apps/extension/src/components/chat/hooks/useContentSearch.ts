/**
 * 说明：`useContentSearch` 组件模块。
 *
 * 职责：
 * - 承载 `useContentSearch` 相关的当前文件实现与模块边界；
 * - 对外暴露 `UseContentSearchParams`、`UseContentSearchResult`、`useContentSearch` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type { Message } from '@/types/chat';
import type { ContentSearchMatch } from '@/lib/chat/chat-utils';
import { getSuccessfulMessageTranslations } from '@/lib/chat/message-translations';
import { formatToolCallTraceText, getMessageTraceSegments } from '@/lib/chat/message-trace';
import {
  isAsciiOnly,
  isWordQuery,
  defaultCaseSensitiveForQuery,
  findAllOccurrences,
  markdownToPlainText,
} from '@/lib/chat/chat-utils';

/**
 * 内容搜索 hook 入参。
 */
export interface UseContentSearchParams {
  /**
   * 当前话题中全部消息，包含系统消息。
   */
  messagesAll: Message[];
  /**
   * 当前是否处于多选模式；多选模式下会自动关闭搜索面板。
   */
  multiSelectMode: boolean;
  /**
   * 输入框外层容器引用，用于关闭搜索后把焦点还回输入框。
   */
  inputWrapRef: RefObject<HTMLDivElement | null>;
}

/**
 * 内容搜索 hook 返回值。
 */
export interface UseContentSearchResult {
  /**
   * 搜索面板是否打开。
   */
  searchOpen: boolean;
  /**
   * 当前搜索词。
   */
  searchQuery: string;
  /**
   * 更新搜索词。
   */
  setSearchQuery: (value: string) => void;
  /**
   * 是否把用户消息也纳入搜索。
   */
  searchIncludeUser: boolean;
  /**
   * 更新“包含用户消息”开关。
   */
  setSearchIncludeUser: (value: boolean) => void;
  /**
   * 用户显式设置的大小写敏感开关。
   */
  searchCaseSensitive: boolean;
  /**
   * 更新大小写敏感开关。
   */
  setSearchCaseSensitive: (value: boolean) => void;
  /**
   * 用户显式设置的整词匹配开关。
   */
  searchWholeWord: boolean;
  /**
   * 更新整词匹配开关。
   */
  setSearchWholeWord: (value: boolean) => void;
  /**
   * 当前高亮命中的索引。
   */
  searchActiveIndex: number;
  /**
   * 手动设置当前高亮命中索引。
   */
  setSearchActiveIndex: (value: number) => void;
  /**
   * 当前查询词是否支持大小写敏感模式。
   */
  searchCanCaseSensitive: boolean;
  /**
   * 当前查询词是否支持整词匹配模式。
   */
  searchCanWholeWord: boolean;
  /**
   * 实际生效的大小写敏感标志。
   */
  effectiveSearchCaseSensitive: boolean;
  /**
   * 实际生效的整词匹配标志。
   */
  effectiveSearchWholeWord: boolean;
  /**
   * 当前全部搜索命中列表。
   */
  searchMatches: ContentSearchMatch[];
  /**
   * 待跳转的命中目标，由外层在 DOM 更新后消费。
   */
  pendingSearchJumpRef: MutableRefObject<null | { messageId: string; occurrence: number; messageIndex: number }>;
  /**
   * 关闭搜索并重置全部状态。
   */
  closeSearch: () => void;
  /**
   * 静默重置搜索状态，不做焦点回退。
   */
  resetSearchState: () => void;
  /**
   * 打开搜索面板，可选传入初始查询词。
   */
  openSearch: (initialQuery?: string) => void;
  /**
   * 跳到上一个命中。
   */
  searchPrev: () => void;
  /**
   * 跳到下一个命中。
   */
  searchNext: () => void;
}

/**
 * 聊天内容搜索控制器。
 *
 * 负责维护搜索面板状态、大小写/整词匹配开关，以及从消息正文、推理内容、
 * 翻译结果中计算命中列表。
 *
 * @param params - 全量消息、输入框引用与多选模式状态。
 * @returns 搜索面板状态、命中结果和导航动作。
 */
export function useContentSearch({ messagesAll, multiSelectMode, inputWrapRef }: UseContentSearchParams) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIncludeUser, setSearchIncludeUser] = useState(false);
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [searchWholeWord, setSearchWholeWord] = useState(false);
  const [searchActiveIndex, setSearchActiveIndex] = useState(0);
  const pendingSearchJumpRef = useRef<null | { messageId: string; occurrence: number; messageIndex: number }>(null);

  /**
   * 当前搜索词是否允许开启大小写敏感搜索。
   */
  const searchCanCaseSensitive = useMemo(() => {
    const q = searchQuery.trim();
    return Boolean(q) && isAsciiOnly(q);
  }, [searchQuery]);

  /**
   * 当前搜索词是否允许开启整词匹配。
   */
  const searchCanWholeWord = useMemo(() => isWordQuery(searchQuery), [searchQuery]);

  const effectiveSearchCaseSensitive = searchCanCaseSensitive ? searchCaseSensitive : false;
  const effectiveSearchWholeWord = searchCanWholeWord ? searchWholeWord : false;

  useEffect(() => {
    if (!searchCanCaseSensitive && searchCaseSensitive) setSearchCaseSensitive(false);
    if (!searchCanWholeWord && searchWholeWord) setSearchWholeWord(false);
  }, [searchCanCaseSensitive, searchCanWholeWord, searchCaseSensitive, searchWholeWord]);

  /**
   * 根据当前设置计算所有命中项。
   */
  const searchMatches = useMemo((): ContentSearchMatch[] => {
    const q = searchQuery.trim();
    if (!searchOpen || !q) return [];
    const caseSensitive = effectiveSearchCaseSensitive;
    const wholeWord = effectiveSearchWholeWord;
    const out: ContentSearchMatch[] = [];

    for (let i = 0; i < messagesAll.length; i += 1) {
      const m = messagesAll[i]!;
      if (m.role === 'system') continue;
      if (m.role === 'user' && !searchIncludeUser) continue;

      let occ = 0;

      if (m.role === 'assistant') {
        const content = markdownToPlainText(String(m.content || '')).trim();
        const translations = getSuccessfulMessageTranslations(m.translations)
          .map((translation) => String(translation.content || '').trim())
          .filter(Boolean);

        const parts: Array<{ part: ContentSearchMatch['part']; text: string }> = [];
        for (const segment of getMessageTraceSegments(m)) {
          if (segment.kind === 'reasoning') {
            if (segment.text.trim()) parts.push({ part: 'reasoning', text: segment.text.trim() });
            continue;
          }
          const text = formatToolCallTraceText(segment.toolCall).trim();
          if (text) parts.push({ part: 'tool-call', text });
        }
        if (content) parts.push({ part: 'content', text: content });
        if (translations.length > 0) parts.push({ part: 'translation', text: translations.join('\n') });

        for (const p of parts) {
          const hits = findAllOccurrences(p.text, q, { caseSensitive, wholeWord });
          for (let k = 0; k < hits.length; k += 1) {
            out.push({ messageId: m.id, messageIndex: i, occurrence: occ, role: m.role, askId: m.askId, part: p.part });
            occ += 1;
          }
        }
        continue;
      }

      const content = markdownToPlainText(String(m.content || '')).trim();
      const hits = findAllOccurrences(content, q, { caseSensitive, wholeWord });
      for (let k = 0; k < hits.length; k += 1) {
        out.push({ messageId: m.id, messageIndex: i, occurrence: occ, role: m.role, askId: m.askId, part: 'content' });
        occ += 1;
      }
    }
    return out;
  }, [effectiveSearchCaseSensitive, effectiveSearchWholeWord, messagesAll, searchIncludeUser, searchOpen, searchQuery]);

  useEffect(() => {
    if (!searchOpen) return;
    setSearchActiveIndex(0);
  }, [effectiveSearchCaseSensitive, effectiveSearchWholeWord, searchIncludeUser, searchOpen, searchQuery]);

  useEffect(() => {
    if (!searchOpen) return;
    if (searchActiveIndex < searchMatches.length) return;
    setSearchActiveIndex(0);
  }, [searchActiveIndex, searchMatches.length, searchOpen]);

  const resetSearchState = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchIncludeUser(false);
    setSearchCaseSensitive(false);
    setSearchWholeWord(false);
    setSearchActiveIndex(0);
    pendingSearchJumpRef.current = null;
  }, []);

  /**
   * 关闭搜索面板并把焦点还回输入框。
   */
  const closeSearch = useCallback(() => {
    resetSearchState();
    queueMicrotask(() => {
      const el = inputWrapRef.current?.querySelector('textarea') as HTMLTextAreaElement | null;
      el?.focus();
    });
  }, [inputWrapRef, resetSearchState]);

  /**
   * 打开搜索面板，可选注入初始查询词。
   */
  const openSearch = useCallback((initialQuery?: string) => {
    const nextQuery = typeof initialQuery === 'string' ? initialQuery : searchQuery;
    setSearchOpen(true);
    if (!searchOpen) {
      setSearchIncludeUser(false);
      setSearchWholeWord(false);
      setSearchCaseSensitive(defaultCaseSensitiveForQuery(nextQuery));
    }
    if (typeof initialQuery === 'string') setSearchQuery(initialQuery);
  }, [searchOpen, searchQuery]);

  /**
   * 跳到上一个搜索命中。
   */
  const searchPrev = useCallback(() => {
    if (!searchOpen) return;
    const total = searchMatches.length;
    if (total <= 0) return;
    setSearchActiveIndex((prev) => (prev - 1 + total) % total);
  }, [searchMatches.length, searchOpen]);

  /**
   * 跳到下一个搜索命中。
   */
  const searchNext = useCallback(() => {
    if (!searchOpen) return;
    const total = searchMatches.length;
    if (total <= 0) return;
    setSearchActiveIndex((prev) => (prev + 1) % total);
  }, [searchMatches.length, searchOpen]);

  // 进入多选模式时关闭搜索（避免快捷键/焦点冲突）
  useEffect(() => {
    if (!multiSelectMode) return;
    if (searchOpen) closeSearch();
  }, [closeSearch, multiSelectMode, searchOpen]);

  const result = {
    searchOpen,
    searchQuery,
    setSearchQuery,
    searchIncludeUser,
    setSearchIncludeUser,
    searchCaseSensitive,
    setSearchCaseSensitive,
    searchWholeWord,
    setSearchWholeWord,
    searchActiveIndex,
    setSearchActiveIndex,
    searchCanCaseSensitive,
    searchCanWholeWord,
    effectiveSearchCaseSensitive,
    effectiveSearchWholeWord,
    searchMatches,
    pendingSearchJumpRef,
    closeSearch,
    resetSearchState,
    openSearch,
    searchPrev,
    searchNext,
  } satisfies UseContentSearchResult;

  return result;
}
