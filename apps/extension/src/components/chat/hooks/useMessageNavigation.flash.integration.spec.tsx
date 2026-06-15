/**
 * 说明：`useMessageNavigation.flash.integration.spec` 组件模块。
 *
 * 职责：
 * - 组合验证消息导航 hook 与 transcript DOM effect；
 * - 固化上一问 / 下一问 / flow 的瞬时双闪入口，以及非目标链路不误触发。
 *
 * 边界：
 * - 本文件不验证虚拟滚动实现细节；
 * - 只验证点击入口到 `data-jump-flash` DOM 装饰的联动结果。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMemo, useRef, useState } from 'react';

import { buildRows, type ChatRow } from '@/lib/chat/chat-utils';
import type { Message, ResolvedConversationContext } from '@/types/chat';
import { useChatSearchDomEffects } from './useChatSearchDomEffects';
import { useMessageNavigation } from './useMessageNavigation';

type ViewportSnapshot =
  | { kind: 'top' }
  | { kind: 'bottom' }
  | {
      kind: 'row-anchor';
      askId: string | null;
      messageId: string | null;
      offset: number;
      rowIndex: number | null;
      rowKey: string;
    };

/**
 * 测试辅助函数：`createMessage`。
 *
 * @remarks
 * 统一生成最小消息对象，避免每个用例重复构造字段。
 */
function createMessage(id: string, role: Message['role'], content: string, createdAt = 1, askId?: string): Message {
  return {
    id,
    role,
    content,
    createdAt,
    ...(askId ? { askId } : {}),
  };
}

/**
 * 测试辅助函数：`createTopic`。
 *
 * @remarks
 * 构造满足导航 hook 所需的最小话题上下文。
 */
function createTopic(messages: Message[]): ResolvedConversationContext {
  return {
    id: 'topic-1',
    title: 'Topic',
    messages,
    folderId: null,
    pinned: false,
    createdAt: 1,
    updatedAt: 1,
    assistantId: 'assistant-1',
    topicPrompt: '',
    isNameManuallyEdited: false,
    order: 1,
    systemPrompt: '',
    model: 'provider/model',
    temperature: 0.7,
    topP: 1,
    maxTokens: 256,
    contextLength: 20,
    modelParams: {},
    mcpSelection: { mode: 'auto', manualServerIds: [] },
    enableGenerateImage: false,
    enableWebSearch: false,
  };
}

/**
 * 测试辅助函数：`buildAnchorSnapshot`。
 *
 * @remarks
 * 根据消息 ID 构造统一的 row-anchor viewport snapshot。
 */
function buildAnchorSnapshot(rows: ChatRow[], messages: Message[], messageId: string): ViewportSnapshot {
  const rowIndex = rows.findIndex((row) => row.kind === 'message' && row.message.id === messageId);
  const message = messages.find((item) => item.id === messageId) ?? null;
  return {
    kind: 'row-anchor',
    askId: message?.askId ?? messageId,
    messageId,
    offset: 0,
    rowIndex,
    rowKey: messageId,
  };
}

const messages = [
  createMessage('user-1', 'user', '问题一', 1, 'ask-1'),
  createMessage('assistant-1', 'assistant', '回答一', 2, 'ask-1'),
  createMessage('user-2', 'user', '问题二', 3, 'ask-2'),
  createMessage('assistant-2', 'assistant', '回答二', 4, 'ask-2'),
  createMessage('user-3', 'user', '问题三', 5, 'ask-3'),
  createMessage('assistant-3', 'assistant', '回答三', 6, 'ask-3'),
];

/**
 * 把导航 hook 与 DOM effect 组装成可点击的最小测试壳。
 *
 * @remarks
 * 用于验证真实按钮点击后，目标消息节点是否会收到 `data-jump-flash`。
 */
function NavigationFlashHarness() {
  const rows = useMemo(() => buildRows(messages, 0, false), []);
  const topic = useMemo(() => createTopic(messages), []);
  const latestMessagesRef = useRef(messages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingSearchJumpRef = useRef<null | { messageId: string; occurrence: number; messageIndex: number }>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [viewportSnapshot, setViewportSnapshot] = useState<ViewportSnapshot>(() => buildAnchorSnapshot(rows, messages, 'user-1'));

  const roleByMsgId = useMemo(() => new Map<string, Message['role']>(messages.map((message) => [message.id, message.role])), []);
  const msgIdToRowIndex = useMemo(() => {
    const map = new Map<string, number>();
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row) continue;
      if (row.kind === 'message') map.set(row.message.id, index);
      if (row.kind === 'divider') map.set(row.message.id, index);
      if (row.kind === 'group') row.assistants.forEach((assistant) => map.set(assistant.id, index));
    }
    return map;
  }, [rows]);

  const messageNavigation = useMessageNavigation({
    topic,
    messagesAll: messages,
    rows,
    viewportSnapshot,
    isAtBottom: viewportSnapshot.kind === 'bottom',
    messageNavigation: 'buttons',
    multiSelectMode: false,
    jumpToMessageAnchor: (messageId) => {
      const snapshot = buildAnchorSnapshot(rows, messages, messageId);
      setViewportSnapshot(snapshot);
      return true;
    },
    scrollToTop: () => {
      setViewportSnapshot({ kind: 'top' });
    },
    scrollToBottom: () => {
      setViewportSnapshot({ kind: 'bottom' });
    },
  });

  useChatSearchDomEffects({
    effectiveSearchCaseSensitive: false,
    effectiveSearchWholeWord: false,
    expandedThinkingIds: new Set(),
    latestMessagesRef,
    msgIdToRowIndex,
    navigationFlashRequest: messageNavigation.navFlashRequest,
    pendingSearchJumpRef,
    roleByMsgId,
    scrollRangeIntoView: () => true,
    scrollToMessageRow: (messageId) => {
      setViewportSnapshot(buildAnchorSnapshot(rows, messages, messageId));
      return true;
    },
    scrollRef,
    searchActiveIndex: 0,
    searchIncludeUser: true,
    searchMatches: [],
    searchOpen,
    searchQuery: '',
    updateGroupPrefs: () => {},
  });

  return (
    <div>
      <button onClick={messageNavigation.navGoPrev} type="button">prev</button>
      <button onClick={messageNavigation.navGoNext} type="button">next</button>
      <button onClick={() => messageNavigation.navJumpToAnchor('user-3')} type="button">flow</button>
      <button onClick={messageNavigation.navGoTop} type="button">top</button>
      <button onClick={messageNavigation.navGoBottom} type="button">bottom</button>
      <button
        onClick={() => {
          pendingSearchJumpRef.current = { messageId: 'user-2', occurrence: 0, messageIndex: 2 };
          setSearchOpen(true);
        }}
        type="button"
      >
        search
      </button>
      <div ref={scrollRef}>
        {messages.map((message) => (
          <div data-msg-id={message.id} data-testid={message.id} key={message.id}>
            {message.content}
          </div>
        ))}
      </div>
    </div>
  );
}

describe('message navigation flash integration', () => {
  let rafId = 0;
  let rafQueue = new Map<number, FrameRequestCallback>();

  /**
   * 按批次执行挂起的动画帧回调，模拟浏览器逐帧推进。
   *
   * @param count - 连续推进的帧数。
   */
  const flushAnimationFrames = (count = 1) => {
    for (let index = 0; index < count; index += 1) {
      const pending = Array.from(rafQueue.entries());
      rafQueue = new Map();
      for (const [id, callback] of pending) {
        if (!callback) continue;
        callback(id * 16);
      }
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    rafId = 0;
    rafQueue = new Map();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      rafId += 1;
      rafQueue.set(rafId, callback);
      return rafId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      rafQueue.delete(id);
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('点击上一问 / 下一问 / flow 后，目标用户消息会出现 data-jump-flash', () => {
    render(<NavigationFlashHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    act(() => {
      flushAnimationFrames(1);
    });
    expect(screen.getByTestId('user-2')).toHaveAttribute('data-jump-flash', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'prev' }));
    act(() => {
      flushAnimationFrames(1);
    });
    expect(screen.getByTestId('user-1')).toHaveAttribute('data-jump-flash', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'flow' }));
    act(() => {
      flushAnimationFrames(1);
    });
    expect(screen.getByTestId('user-3')).toHaveAttribute('data-jump-flash', 'true');
  });

  it('top / bottom 与搜索跳转不会写入 data-jump-flash', () => {
    render(<NavigationFlashHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'top' }));
    act(() => {
      flushAnimationFrames(2);
    });
    expect(screen.getByTestId('user-1')).not.toHaveAttribute('data-jump-flash');
    expect(screen.getByTestId('user-2')).not.toHaveAttribute('data-jump-flash');
    expect(screen.getByTestId('user-3')).not.toHaveAttribute('data-jump-flash');

    fireEvent.click(screen.getByRole('button', { name: 'bottom' }));
    act(() => {
      flushAnimationFrames(2);
    });
    expect(screen.getByTestId('user-1')).not.toHaveAttribute('data-jump-flash');
    expect(screen.getByTestId('user-2')).not.toHaveAttribute('data-jump-flash');
    expect(screen.getByTestId('user-3')).not.toHaveAttribute('data-jump-flash');

    fireEvent.click(screen.getByRole('button', { name: 'search' }));
    act(() => {
      flushAnimationFrames(2);
    });
    expect(screen.getByTestId('user-2')).not.toHaveAttribute('data-jump-flash');
  });
});
