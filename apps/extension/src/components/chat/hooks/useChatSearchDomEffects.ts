/**
 * 说明：`useChatSearchDomEffects` 组件模块。
 *
 * 职责：
 * - 承载 `useChatSearchDomEffects` 相关的当前文件实现与模块边界；
 * - 对外暴露 `UseChatSearchDomEffectsOptions`、`useChatSearchDomEffects` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react';

import type { Message } from '@/types/chat';
import type { ContentSearchMatch } from '@/lib/chat/chat-utils';
import { cssEscape, isWordChar } from '@/lib/chat/chat-utils';
import type { MessageNavigationFlashRequest } from './useMessageNavigation';

type PendingSearchJump = null | { messageId: string; occurrence: number; messageIndex: number };
const NAVIGATION_FLASH_DURATION_MS = 1400;
const NAVIGATION_FLASH_MAX_RETRY_FRAMES = 12;
const SEARCH_HIGHLIGHT_STYLE_ID = 'olyq-chat-search-highlight-style';
const SEARCH_HIGHLIGHT_STYLE_CSS = `
::highlight(olyq-search-all) {
  background: hsl(var(--primary) / 0.18);
}

::highlight(olyq-search-current) {
  background: hsl(var(--primary) / 0.38);
}
`;

/**
 * 在支持时使用原生 `requestAnimationFrame`，否则退回到最小定时器模拟。
 *
 * @param callback - 下一帧执行的回调。
 * @returns 可用于取消的调度句柄。
 */
function scheduleFrame(callback: FrameRequestCallback) {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    return globalThis.requestAnimationFrame(callback);
  }
  return globalThis.setTimeout(() => callback(Date.now()), 16) as unknown as number;
}

/**
 * 取消由 `scheduleFrame` 创建的帧调度句柄。
 *
 * @param handle - 待取消的帧调度句柄。
 */
function cancelScheduledFrame(handle: number | null) {
  if (handle == null) return;
  if (typeof globalThis.cancelAnimationFrame === 'function') {
    globalThis.cancelAnimationFrame(handle);
    return;
  }
  clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
}

/**
 * 在当前扩展页面文档里安装 CSS Highlights API 样式。
 *
 * @remarks
 * LightningCSS 当前会把标准 `::highlight(...)` 误报为未知伪元素；把这段 CSS 放进运行时
 * `<style>` 后，构建链不再解析它，浏览器仍然按原生 Highlights API 渲染 Range 高亮。
 *
 * @param ownerDocument - 承载聊天 transcript 的文档对象。
 */
function ensureNativeSearchHighlightStyle(ownerDocument: Document) {
  if (ownerDocument.getElementById(SEARCH_HIGHLIGHT_STYLE_ID)) return;
  const style = ownerDocument.createElement('style');
  style.id = SEARCH_HIGHLIGHT_STYLE_ID;
  style.dataset.olyqOwner = 'chat-search-highlights';
  style.textContent = SEARCH_HIGHLIGHT_STYLE_CSS;
  (ownerDocument.head || ownerDocument.documentElement).appendChild(style);
}

/** 导出类型：`UseChatSearchDomEffectsOptions`。 */
export interface UseChatSearchDomEffectsOptions {
  readonly effectiveSearchCaseSensitive: boolean;
  readonly effectiveSearchWholeWord: boolean;
  readonly expandedThinkingIds: Set<string>;
  readonly latestMessagesRef: MutableRefObject<Message[]>;
  readonly msgIdToRowIndex: Map<string, number>;
  readonly navigationFlashRequest: MessageNavigationFlashRequest | null;
  readonly pendingSearchJumpRef: MutableRefObject<PendingSearchJump>;
  readonly roleByMsgId: Map<string, Message['role']>;
  readonly scrollRangeIntoView: (range: Range) => boolean;
  readonly scrollToMessageRow: (messageId: string, align?: 'auto' | 'start' | 'center' | 'end') => boolean;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly searchActiveIndex: number;
  readonly searchIncludeUser: boolean;
  readonly searchMatches: ContentSearchMatch[];
  readonly searchOpen: boolean;
  readonly searchQuery: string;
  readonly updateGroupPrefs: (askId: string, patch: Partial<NonNullable<Message['groupPrefs']>>) => void;
}

/**
 * 导出 Hook：`useChatSearchDomEffects`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export function useChatSearchDomEffects({
  effectiveSearchCaseSensitive,
  effectiveSearchWholeWord,
  expandedThinkingIds,
  latestMessagesRef,
  msgIdToRowIndex,
  navigationFlashRequest,
  pendingSearchJumpRef,
  roleByMsgId,
  scrollRangeIntoView,
  scrollToMessageRow,
  scrollRef,
  searchActiveIndex,
  searchIncludeUser,
  searchMatches,
  searchOpen,
  searchQuery,
  updateGroupPrefs,
}: UseChatSearchDomEffectsOptions) {
  const activeNavigationFlashCleanupRef = useRef<null | (() => void)>(null);
  const navigationFlashMessageId = navigationFlashRequest?.messageId ?? null;
  const navigationFlashToken = navigationFlashRequest?.token ?? null;

  useEffect(() => (
    () => {
      activeNavigationFlashCleanupRef.current?.();
      activeNavigationFlashCleanupRef.current = null;
    }
  ), []);

  useEffect(() => {
    if (!navigationFlashMessageId || navigationFlashToken == null) return;

    let disposed = false;
    let locateFrameHandle: number | null = null;
    let replayFrameHandle: number | null = null;
    let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
    let retriesRemaining = NAVIGATION_FLASH_MAX_RETRY_FRAMES;
    let activeNode: HTMLElement | null = null;
    let handleAnimationEnd: ((event: AnimationEvent) => void) | null = null;

    /**
     * 仅在当前 effect 仍然持有 cleanup owner 时，释放对应 ref。
     */
    const releaseIfCurrent = () => {
      if (activeNavigationFlashCleanupRef.current === cleanup) {
        activeNavigationFlashCleanupRef.current = null;
      }
    };

    /**
     * 移除当前节点上的 flash attribute 与 animationend 监听。
     */
    const clearNode = () => {
      if (!activeNode) return;
      if (handleAnimationEnd) activeNode.removeEventListener('animationend', handleAnimationEnd);
      delete activeNode.dataset.jumpFlash;
      activeNode = null;
      handleAnimationEnd = null;
    };

    /**
     * 终止当前导航 flash 任务，并清理帧调度、超时器和 DOM 状态。
     */
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      releaseIfCurrent();
      cancelScheduledFrame(locateFrameHandle);
      cancelScheduledFrame(replayFrameHandle);
      if (cleanupTimer != null) clearTimeout(cleanupTimer);
      cleanupTimer = null;
      clearNode();
    };

    activeNavigationFlashCleanupRef.current?.();
    activeNavigationFlashCleanupRef.current = cleanup;

    /**
     * 对目标节点执行“先清旧 attribute，再在下一帧重打 attribute”的重播流程。
     *
     * @param node - 已定位到的 transcript 消息节点。
     */
    const armFlash = (node: HTMLElement) => {
      if (disposed) return;
      activeNode = node;
      delete node.dataset.jumpFlash;
      replayFrameHandle = scheduleFrame(() => {
        if (disposed || activeNode !== node) return;
        node.dataset.jumpFlash = 'true';
        handleAnimationEnd = (event: AnimationEvent) => {
          if (event.target !== node) return;
          cleanup();
        };
        node.addEventListener('animationend', handleAnimationEnd);
        cleanupTimer = setTimeout(() => {
          cleanup();
        }, NAVIGATION_FLASH_DURATION_MS);
      });
    };

    /**
     * 在有限帧内重试定位目标消息节点，兼容虚拟列表尚未挂载的落位时序。
     */
    const tryLocateTargetNode = () => {
      if (disposed) return;
      const container = scrollRef.current;
      const node = container?.querySelector<HTMLElement>(`[data-msg-id="${cssEscape(navigationFlashMessageId)}"]`) ?? null;
      if (node) {
        armFlash(node);
        return;
      }
      if (retriesRemaining <= 0) {
        cleanup();
        return;
      }
      retriesRemaining -= 1;
      locateFrameHandle = scheduleFrame(tryLocateTargetNode);
    };

    tryLocateTargetNode();

    return cleanup;
  }, [navigationFlashMessageId, navigationFlashToken, scrollRef]);

  useEffect(() => {
    if (!searchOpen) return;
    const pending = pendingSearchJumpRef.current;
    if (!pending) return;

    const rowIdx = msgIdToRowIndex.get(pending.messageId);
    if (typeof rowIdx !== 'number') return;

    if (!scrollToMessageRow(pending.messageId, 'start')) return;

    const match = searchMatches[Math.min(searchMatches.length - 1, Math.max(0, searchActiveIndex))];
    if (match?.role === 'assistant' && match.askId) {
      const current = latestMessagesRef.current;
      const user = current.find((message) => message.role === 'user' && (message.askId || message.id) === match.askId) ?? null;
      const style = user?.groupPrefs?.style ?? 'fold';
      if (style === 'fold' && user?.groupPrefs?.foldSelectedModelId !== match.messageId) {
        updateGroupPrefs(match.askId, { foldSelectedModelId: match.messageId });
      }
    }

    pendingSearchJumpRef.current = null;
  }, [latestMessagesRef, msgIdToRowIndex, pendingSearchJumpRef, scrollToMessageRow, searchActiveIndex, searchMatches, searchOpen, updateGroupPrefs]);

  useEffect(() => {
    const css = (globalThis as unknown as { CSS?: { highlights?: Map<string, unknown> } }).CSS;
    const HighlightCtor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    const highlights = css?.highlights as unknown as Map<string, unknown> | undefined;

    if (!highlights || !HighlightCtor) return;

    /**
     * 清理当前文档注册的搜索高亮 Range。
     */
    const clear = () => {
      try { highlights.delete('olyq-search-all'); } catch { /* ignore */ }
      try { highlights.delete('olyq-search-current'); } catch { /* ignore */ }
    };

    const query = searchQuery.trim();
    if (!searchOpen || !query) {
      clear();
      return;
    }

    const container = scrollRef.current;
    if (!container) {
      clear();
      return;
    }
    ensureNativeSearchHighlightStyle(container.ownerDocument);

    const needle = effectiveSearchCaseSensitive ? query : query.toLowerCase();
    const active = searchMatches.length > 0
      ? searchMatches[Math.min(searchMatches.length - 1, Math.max(0, searchActiveIndex))]
      : null;

    const allRanges: Range[] = [];
    let currentRange: Range | null = null;

    const nodes = container.querySelectorAll<HTMLElement>('[data-msg-id]');
    for (const node of nodes) {
      const msgId = node.dataset.msgId;
      if (!msgId) continue;
      const role = roleByMsgId.get(msgId);
      if (role === 'system') continue;
      if (role === 'user' && !searchIncludeUser) continue;

      const scope = node.querySelector<HTMLElement>('[data-search-scope="true"]') ?? node;
      let occ = 0;

      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
        acceptNode: (candidate) => {
          if (!candidate.nodeValue) return NodeFilter.FILTER_REJECT;
          const parent = (candidate as unknown as { parentElement?: HTMLElement | null }).parentElement ?? null;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (parent.closest('button, [aria-hidden="true"], [data-skip-search="true"]')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      let currentNode: Node | null = walker.nextNode();
      while (currentNode) {
        const textNode = currentNode as Text;
        const raw = textNode.nodeValue || '';
        const source = effectiveSearchCaseSensitive ? raw : raw.toLowerCase();

        let idx = 0;
        while (idx <= source.length) {
          const hit = source.indexOf(needle, idx);
          if (hit < 0) break;
          if (effectiveSearchWholeWord) {
            const before = hit > 0 ? raw[hit - 1] : '';
            const after = hit + needle.length < raw.length ? raw[hit + needle.length] : '';
            if (isWordChar(before) || isWordChar(after)) {
              idx = hit + Math.max(1, needle.length);
              continue;
            }
          }

          const range = document.createRange();
          try {
            range.setStart(textNode, hit);
            range.setEnd(textNode, hit + needle.length);
          } catch {
            break;
          }
          allRanges.push(range);
          if (active && msgId === active.messageId && occ === active.occurrence) currentRange = range;
          occ += 1;
          idx = hit + Math.max(1, needle.length);
        }

        currentNode = walker.nextNode();
      }
    }

    clear();
    try {
      highlights.set('olyq-search-all', new HighlightCtor(...allRanges));
      if (currentRange) highlights.set('olyq-search-current', new HighlightCtor(currentRange));
    } catch {
      // CSS Highlights API 异常不影响基础搜索能力
    }

    if (currentRange) scrollRangeIntoView(currentRange);

    return clear;
  }, [
    effectiveSearchCaseSensitive,
    effectiveSearchWholeWord,
    expandedThinkingIds,
    roleByMsgId,
    scrollRangeIntoView,
    scrollRef,
    searchActiveIndex,
    searchIncludeUser,
    searchMatches,
    searchOpen,
    searchQuery,
  ]);

  useEffect(() => {
    const css = (globalThis as unknown as { CSS?: { highlights?: Map<string, unknown> } }).CSS;
    const HighlightCtor = (globalThis as unknown as { Highlight?: unknown }).Highlight;
    const supported = Boolean(css?.highlights && HighlightCtor);

    const container = scrollRef.current;
    if (!container) return;

    const nodes = container.querySelectorAll<HTMLElement>('[data-msg-id]');
    /**
     * 清理不支持 CSS Highlights API 时写入的容器级 fallback 标记。
     */
    const clear = () => {
      for (const node of nodes) {
        try { delete node.dataset.searchHit; } catch { /* ignore */ }
        try { delete node.dataset.searchCurrent; } catch { /* ignore */ }
      }
    };

    if (supported) {
      clear();
      return;
    }

    const query = searchQuery.trim();
    if (!searchOpen || !query || searchMatches.length === 0) {
      clear();
      return;
    }

    const hitIds = new Set(searchMatches.map((match) => match.messageId));
    const active = searchMatches[Math.min(searchMatches.length - 1, Math.max(0, searchActiveIndex))] ?? null;

    for (const node of nodes) {
      const id = node.dataset.msgId;
      if (!id) continue;
      if (hitIds.has(id)) node.dataset.searchHit = 'true';
      else delete node.dataset.searchHit;
      if (active && id === active.messageId) node.dataset.searchCurrent = 'true';
      else delete node.dataset.searchCurrent;
    }
  }, [scrollRef, searchActiveIndex, searchMatches, searchOpen, searchQuery]);

}
