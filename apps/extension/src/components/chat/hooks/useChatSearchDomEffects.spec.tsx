/**
 * 说明：`useChatSearchDomEffects.spec` 组件模块。
 *
 * 职责：
 * - 覆盖 transcript DOM 装饰层里的导航 flash 行为；
 * - 固化 data-jump-flash 的重播、清理与延迟挂载补命中语义。
 *
 * 边界：
 * - 本文件不验证虚拟滚动命令 owner；
 * - 只验证 DOM effect 如何消费一次性 navigation flash request。
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RefObject } from 'react';

import type { Message } from '@/types/chat';
import type { UseChatSearchDomEffectsOptions } from './useChatSearchDomEffects';
import { useChatSearchDomEffects } from './useChatSearchDomEffects';

const NAVIGATION_FLASH_DURATION_MS = 1400;

/**
 * 测试辅助函数：`createMessage`。
 *
 * @remarks
 * 统一构造最小消息对象，避免每个用例重复声明公共字段。
 */
function createMessage(id: string, role: Message['role'], content: string, createdAt = 1): Message {
  return {
    id,
    role,
    content,
    createdAt,
  };
}

/**
 * 测试辅助函数：`createMessageNode`。
 *
 * @remarks
 * 为 transcript 容器创建一个最小消息节点，复用真实 `data-msg-id` 选择器。
 */
function createMessageNode(messageId: string) {
  const node = document.createElement('div');
  node.dataset.msgId = messageId;
  node.textContent = `message:${messageId}`;
  return node;
}

/**
 * 测试辅助函数：`createOptions`。
 *
 * @remarks
 * 生成 hook 需要的最小入参，默认关闭搜索链路，只保留 DOM effect 所需依赖。
 */
function createOptions(
  scrollRef: RefObject<HTMLDivElement | null>,
  overrides: Partial<UseChatSearchDomEffectsOptions> = {},
): UseChatSearchDomEffectsOptions {
  const messages = [
    createMessage('user-1', 'user', '问题一'),
    createMessage('assistant-1', 'assistant', '回答一', 2),
    createMessage('user-2', 'user', '问题二', 3),
  ];

  return {
    effectiveSearchCaseSensitive: false,
    effectiveSearchWholeWord: false,
    expandedThinkingIds: new Set(),
    latestMessagesRef: { current: messages },
    msgIdToRowIndex: new Map<string, number>([
      ['user-1', 0],
      ['assistant-1', 1],
      ['user-2', 2],
    ]),
    navigationFlashRequest: null,
    pendingSearchJumpRef: { current: null },
    roleByMsgId: new Map<string, Message['role']>([
      ['user-1', 'user'],
      ['assistant-1', 'assistant'],
      ['user-2', 'user'],
    ]),
    scrollRangeIntoView: vi.fn(() => true),
    scrollToMessageRow: vi.fn(() => true),
    scrollRef,
    searchActiveIndex: 0,
    searchIncludeUser: true,
    searchMatches: [],
    searchOpen: false,
    searchQuery: '',
    updateGroupPrefs: vi.fn(),
    ...overrides,
  };
}

describe('useChatSearchDomEffects navigation flash', () => {
  let rafId = 0;
  let rafQueue = new Map<number, FrameRequestCallback>();

  /**
   * 按批次冲刷当前挂起的 `requestAnimationFrame` 队列。
   *
   * @param count - 需要连续冲刷的帧数。
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
    document.getElementById('olyq-chat-search-highlight-style')?.remove();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('会写入 data-jump-flash，并在超时兜底后自动清理', () => {
    const scrollNode = document.createElement('div');
    const targetNode = createMessageNode('user-2');
    scrollNode.appendChild(targetNode);
    document.body.appendChild(scrollNode);
    const scrollRef = { current: scrollNode } as RefObject<HTMLDivElement | null>;

    renderHook(() => useChatSearchDomEffects(createOptions(scrollRef, {
      navigationFlashRequest: { messageId: 'user-2', token: 1 },
    })));

    act(() => {
      flushAnimationFrames(1);
    });

    expect(targetNode.dataset.jumpFlash).toBe('true');

    act(() => {
      vi.advanceTimersByTime(NAVIGATION_FLASH_DURATION_MS);
    });

    expect(targetNode.dataset.jumpFlash).toBeUndefined();
  });

  it('同一条消息连续收到新 token 时会先清掉旧 attribute，再重新触发', () => {
    const scrollNode = document.createElement('div');
    const targetNode = createMessageNode('user-2');
    scrollNode.appendChild(targetNode);
    document.body.appendChild(scrollNode);
    const scrollRef = { current: scrollNode } as RefObject<HTMLDivElement | null>;
    const baseOptions = createOptions(scrollRef);

    const { rerender } = renderHook((options: UseChatSearchDomEffectsOptions) => useChatSearchDomEffects(options), {
      initialProps: {
        ...baseOptions,
        navigationFlashRequest: { messageId: 'user-2', token: 1 },
      },
    });

    act(() => {
      flushAnimationFrames(1);
    });

    expect(targetNode.dataset.jumpFlash).toBe('true');

    rerender({
      ...baseOptions,
      navigationFlashRequest: { messageId: 'user-2', token: 2 },
    });

    expect(targetNode.dataset.jumpFlash).toBeUndefined();

    act(() => {
      flushAnimationFrames(1);
    });

    expect(targetNode.dataset.jumpFlash).toBe('true');
  });

  it('目标节点延迟挂载时，有限帧内仍然能补命中并触发 flash', () => {
    const scrollNode = document.createElement('div');
    document.body.appendChild(scrollNode);
    const scrollRef = { current: scrollNode } as RefObject<HTMLDivElement | null>;

    renderHook(() => useChatSearchDomEffects(createOptions(scrollRef, {
      navigationFlashRequest: { messageId: 'user-2', token: 1 },
    })));

    act(() => {
      flushAnimationFrames(2);
    });

    const targetNode = createMessageNode('user-2');
    scrollNode.appendChild(targetNode);

    act(() => {
      flushAnimationFrames(2);
    });

    expect(targetNode.dataset.jumpFlash).toBe('true');
  });

  it('原生 Highlights 搜索样式通过运行时 style 注入，避免构建链解析 ::highlight', () => {
    class TestHighlight {
      readonly ranges: Range[];

      constructor(...ranges: Range[]) {
        this.ranges = ranges;
      }
    }

    const highlights = new Map<string, TestHighlight>();
    vi.stubGlobal('CSS', { highlights });
    vi.stubGlobal('Highlight', TestHighlight);

    const scrollNode = document.createElement('div');
    const targetNode = createMessageNode('user-1');
    const searchScope = document.createElement('span');
    searchScope.dataset.searchScope = 'true';
    searchScope.textContent = 'hello world hello';
    targetNode.textContent = '';
    targetNode.appendChild(searchScope);
    scrollNode.appendChild(targetNode);
    document.body.appendChild(scrollNode);

    const scrollRef = { current: scrollNode } as RefObject<HTMLDivElement | null>;
    const scrollRangeIntoView = vi.fn(() => true);

    renderHook(() => useChatSearchDomEffects(createOptions(scrollRef, {
      scrollRangeIntoView,
      searchMatches: [{
        messageId: 'user-1',
        messageIndex: 0,
        occurrence: 1,
        role: 'user',
        part: 'content',
      }],
      searchOpen: true,
      searchQuery: 'hello',
    })));

    const style = document.getElementById('olyq-chat-search-highlight-style');
    expect(style?.textContent).toContain('::highlight(olyq-search-all)');
    expect(highlights.get('olyq-search-all')?.ranges).toHaveLength(2);
    expect(highlights.get('olyq-search-current')?.ranges).toHaveLength(1);
    expect(scrollRangeIntoView).toHaveBeenCalledWith(highlights.get('olyq-search-current')?.ranges[0]);
  });
});
