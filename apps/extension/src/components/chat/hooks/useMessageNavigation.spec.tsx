/**
 * 说明：`useMessageNavigation.spec` 组件模块。
 *
 * 职责：
 * - 覆盖主聊天“上一问 / 下一问 / flow”导航的 ask 锚点语义；
 * - 固化 pending anchor 逻辑，避免连续点击时重新退回旧 viewport snapshot 计算目标。
 *
 * 边界：
 * - 本文件不验证虚拟滚动门面本身；
 * - 只验证导航 hook 如何消费统一的 viewport snapshot 与 anchor jump 命令。
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildRows } from '@/lib/chat/chat-utils';
import type { Message, ResolvedConversationContext } from '@/types/chat';
import { useMessageNavigation } from './useMessageNavigation';
import type { ChatViewportSnapshot } from '@/components/chat/chat-area/useChatAreaVirtualizer';

/**
 * 测试辅助函数：`createMessage`。
 *
 * @remarks
 * 统一生成测试消息，避免每个用例重复拼装消息字段。
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
 * 构造最小可用的话题对象，满足导航 hook 的 `topic` 依赖。
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
 * 测试辅助函数：`createNavigationProps`。
 *
 * @remarks
 * 统一生成导航 hook 的最小入参，便于显隐状态用例只覆盖自身交互契约。
 */
function createNavigationProps(options?: {
  messages?: Message[];
  topic?: ResolvedConversationContext | null;
  viewportSnapshot?: ChatViewportSnapshot;
  messageNavigation?: 'buttons' | 'off' | 'anchor';
  multiSelectMode?: boolean;
  jumpToMessageAnchor?: (messageId: string) => boolean;
  scrollToTop?: () => void;
  scrollToBottom?: () => void;
}) {
  const messages = options?.messages ?? [
    createMessage('user-1', 'user', '问题一', 1, 'ask-1'),
    createMessage('assistant-1', 'assistant', '回答一', 2, 'ask-1'),
  ];
  return {
    topic: options?.topic === undefined ? createTopic(messages) : options.topic,
    messagesAll: messages,
    rows: buildRows(messages, 0, false),
    viewportSnapshot: options?.viewportSnapshot ?? {
      kind: 'row-anchor',
      askId: 'ask-1',
      messageId: 'user-1',
      offset: 0,
      rowIndex: 0,
      rowKey: 'user-1',
    },
    isAtBottom: false,
    messageNavigation: options?.messageNavigation ?? 'buttons',
    multiSelectMode: options?.multiSelectMode ?? false,
    jumpToMessageAnchor: options?.jumpToMessageAnchor ?? vi.fn(() => true),
    scrollToTop: options?.scrollToTop ?? vi.fn(),
    scrollToBottom: options?.scrollToBottom ?? vi.fn(),
  };
}

describe('useMessageNavigation', () => {
  it('按钮模式下初始只准备锚点，导航面板默认收起', () => {
    const { result } = renderHook(() => useMessageNavigation(createNavigationProps()));

    expect(result.current.navAnchors).toHaveLength(1);
    expect(result.current.navPanelOpen).toBe(false);
  });

  it('关闭导航面板后可以立即再次打开，不再进入 60 秒屏蔽窗口', () => {
    const { result } = renderHook(() => useMessageNavigation(createNavigationProps()));

    act(() => {
      result.current.setNavPanelOpen(true);
    });
    expect(result.current.navPanelOpen).toBe(true);

    act(() => {
      result.current.setNavPanelOpen(false);
    });
    expect(result.current.navPanelOpen).toBe(false);

    act(() => {
      result.current.setNavPanelOpen(true);
    });
    expect(result.current.navPanelOpen).toBe(true);
  });

  it('切换话题时会关闭导航面板并清理 pending 状态', () => {
    const messages = [
      createMessage('user-1', 'user', '问题一', 1, 'ask-1'),
      createMessage('assistant-1', 'assistant', '回答一', 2, 'ask-1'),
      createMessage('user-2', 'user', '问题二', 3, 'ask-2'),
    ];
    const jumpToMessageAnchor = vi.fn(() => true);
    const props = createNavigationProps({ messages, jumpToMessageAnchor });
    const { result, rerender } = renderHook((nextProps: ReturnType<typeof createNavigationProps>) => (
      useMessageNavigation(nextProps)
    ), {
      initialProps: props,
    });

    act(() => {
      result.current.setNavPanelOpen(true);
      result.current.navGoNext();
    });

    expect(result.current.navPanelOpen).toBe(true);
    expect(result.current.navActiveAskId).toBe('user-2');

    const nextMessages = [
      createMessage('next-user-1', 'user', '新话题', 1, 'next-ask-1'),
    ];
    rerender(createNavigationProps({
      messages: nextMessages,
      topic: { ...createTopic(nextMessages), id: 'topic-2' },
      jumpToMessageAnchor,
    }));

    expect(result.current.navPanelOpen).toBe(false);
    expect(result.current.navActiveAskId).toBe('next-user-1');
    expect(result.current.navFlashRequest).toBeNull();
  });

  it('多选模式或非按钮模式会关闭导航面板', () => {
    const props = createNavigationProps();
    const { result, rerender } = renderHook((nextProps: ReturnType<typeof createNavigationProps>) => (
      useMessageNavigation(nextProps)
    ), {
      initialProps: props,
    });

    act(() => {
      result.current.setNavPanelOpen(true);
    });
    expect(result.current.navPanelOpen).toBe(true);

    rerender(createNavigationProps({ multiSelectMode: true }));
    expect(result.current.navPanelOpen).toBe(false);

    act(() => {
      result.current.setNavPanelOpen(true);
    });
    rerender(createNavigationProps({ messageNavigation: 'off' }));
    expect(result.current.navPanelOpen).toBe(false);
  });

  it('连续点击两次下一问时，会以前一次 pending anchor 为基准继续前进', () => {
    const messages = [
      createMessage('user-1', 'user', '问题一', 1, 'ask-1'),
      createMessage('assistant-1', 'assistant', '回答一', 2, 'ask-1'),
      createMessage('user-2', 'user', '问题二', 3, 'ask-2'),
      createMessage('assistant-2', 'assistant', '回答二', 4, 'ask-2'),
      createMessage('user-3', 'user', '问题三', 5, 'ask-3'),
      createMessage('assistant-3', 'assistant', '回答三', 6, 'ask-3'),
    ];
    const rows = buildRows(messages, 0, false);
    const jumpToMessageAnchor = vi.fn(() => true);

    const { result } = renderHook(() => useMessageNavigation({
      topic: createTopic(messages),
      messagesAll: messages,
      rows,
      viewportSnapshot: {
        kind: 'row-anchor',
        askId: 'ask-1',
        messageId: 'user-1',
        offset: 0,
        rowIndex: 0,
        rowKey: 'user-1',
      },
      isAtBottom: false,
      messageNavigation: 'buttons',
      multiSelectMode: false,
      jumpToMessageAnchor,
      scrollToTop: vi.fn(),
      scrollToBottom: vi.fn(),
    }));

    expect(result.current.navActiveAskId).toBe('user-1');
    expect(result.current.navActiveIndex).toBe(0);

    act(() => {
      result.current.navGoNext();
    });

    expect(jumpToMessageAnchor).toHaveBeenNthCalledWith(1, 'user-2');
    expect(result.current.navActiveAskId).toBe('user-2');
    expect(result.current.navActiveIndex).toBe(1);
    expect(result.current.navFlashRequest).toBeNull();

    act(() => {
      result.current.navGoNext();
    });

    expect(jumpToMessageAnchor).toHaveBeenNthCalledWith(2, 'user-3');
    expect(result.current.navActiveAskId).toBe('user-3');
    expect(result.current.navActiveIndex).toBe(2);
    expect(result.current.navFlashRequest).toBeNull();
  });

  it('下一问只会在目标 anchor 真正落位后发出一次 flash 请求', () => {
    const messages = [
      createMessage('user-1', 'user', '问题一', 1, 'ask-1'),
      createMessage('assistant-1', 'assistant', '回答一', 2, 'ask-1'),
      createMessage('user-2', 'user', '问题二', 3, 'ask-2'),
      createMessage('assistant-2', 'assistant', '回答二', 4, 'ask-2'),
      createMessage('user-3', 'user', '问题三', 5, 'ask-3'),
      createMessage('assistant-3', 'assistant', '回答三', 6, 'ask-3'),
    ];
    const rows = buildRows(messages, 0, false);
    const jumpToMessageAnchor = vi.fn(() => true);
    const baseProps = {
      topic: createTopic(messages),
      messagesAll: messages,
      rows,
      isAtBottom: false,
      messageNavigation: 'buttons',
      multiSelectMode: false,
      jumpToMessageAnchor,
      scrollToTop: vi.fn(),
      scrollToBottom: vi.fn(),
    } as const;

    const { result, rerender } = renderHook((props: typeof baseProps & {
      viewportSnapshot: {
        kind: 'row-anchor';
        askId: string | null;
        messageId: string | null;
        offset: number;
        rowIndex: number | null;
        rowKey: string;
      };
    }) => useMessageNavigation(props), {
      initialProps: {
        ...baseProps,
        viewportSnapshot: {
          kind: 'row-anchor',
          askId: 'ask-1',
          messageId: 'user-1',
          offset: 0,
          rowIndex: 0,
          rowKey: 'user-1',
        },
      },
    });

    act(() => {
      result.current.navGoNext();
    });
    act(() => {
      result.current.navGoNext();
    });

    expect(result.current.navFlashRequest).toBeNull();

    rerender({
      ...baseProps,
      viewportSnapshot: {
        kind: 'row-anchor',
        askId: 'ask-3',
        messageId: 'user-3',
        offset: 0,
        rowIndex: 4,
        rowKey: 'user-3',
      },
    });

    expect(result.current.navFlashRequest).toEqual({
      messageId: 'user-3',
      token: 1,
    });

    rerender({
      ...baseProps,
      viewportSnapshot: {
        kind: 'row-anchor',
        askId: 'ask-3',
        messageId: 'user-3',
        offset: 0,
        rowIndex: 4,
        rowKey: 'user-3',
      },
    });

    expect(result.current.navFlashRequest).toEqual({
      messageId: 'user-3',
      token: 1,
    });
  });

  it('flow 跳转与上一问共用同一条 anchor jump 逻辑，并在 snapshot 落位后发出新的 flash 请求', () => {
    const messages = [
      createMessage('user-1', 'user', '问题一', 1, 'ask-1'),
      createMessage('assistant-1', 'assistant', '回答一', 2, 'ask-1'),
      createMessage('user-2', 'user', '问题二', 3, 'ask-2'),
      createMessage('assistant-2', 'assistant', '回答二', 4, 'ask-2'),
      createMessage('user-3', 'user', '问题三', 5, 'ask-3'),
      createMessage('assistant-3', 'assistant', '回答三', 6, 'ask-3'),
    ];
    const rows = buildRows(messages, 0, false);
    const jumpToMessageAnchor = vi.fn(() => true);
    const baseProps = {
      topic: createTopic(messages),
      messagesAll: messages,
      rows,
      isAtBottom: false,
      messageNavigation: 'buttons',
      multiSelectMode: false,
      jumpToMessageAnchor,
      scrollToTop: vi.fn(),
      scrollToBottom: vi.fn(),
    } as const;

    const { result, rerender } = renderHook((props: typeof baseProps & {
      viewportSnapshot: {
        kind: 'row-anchor';
        askId: string | null;
        messageId: string | null;
        offset: number;
        rowIndex: number | null;
        rowKey: string;
      };
    }) => useMessageNavigation(props), {
      initialProps: {
        ...baseProps,
        viewportSnapshot: {
          kind: 'row-anchor',
          askId: 'ask-1',
          messageId: 'user-1',
          offset: 0,
          rowIndex: 0,
          rowKey: 'user-1',
        },
      },
    });

    act(() => {
      result.current.navJumpToAnchor('user-3');
    });

    expect(jumpToMessageAnchor).toHaveBeenCalledWith('user-3');
    expect(result.current.navActiveAskId).toBe('user-3');
    expect(result.current.navActiveIndex).toBe(2);
    expect(result.current.navFlashRequest).toBeNull();

    rerender({
      ...baseProps,
      viewportSnapshot: {
        kind: 'row-anchor',
        askId: 'ask-3',
        messageId: 'user-3',
        offset: 0,
        rowIndex: 4,
        rowKey: 'user-3',
      },
    });

    expect(result.current.navActiveAskId).toBe('user-3');
    expect(result.current.navActiveIndex).toBe(2);
    expect(result.current.navFlashRequest).toEqual({
      messageId: 'user-3',
      token: 1,
    });

    act(() => {
      result.current.navGoPrev();
    });

    expect(jumpToMessageAnchor).toHaveBeenLastCalledWith('user-2');
    expect(result.current.navFlashRequest).toEqual({
      messageId: 'user-3',
      token: 1,
    });

    rerender({
      ...baseProps,
      viewportSnapshot: {
        kind: 'row-anchor',
        askId: 'ask-2',
        messageId: 'user-2',
        offset: 0,
        rowIndex: 2,
        rowKey: 'user-2',
      },
    });

    expect(result.current.navFlashRequest).toEqual({
      messageId: 'user-2',
      token: 2,
    });
  });

  it('目标已经是当前有效 anchor 时允许 no-op，不重复发导航命令', () => {
    const messages = [
      createMessage('user-1', 'user', '问题一', 1, 'ask-1'),
      createMessage('assistant-1', 'assistant', '回答一', 2, 'ask-1'),
      createMessage('user-2', 'user', '问题二', 3, 'ask-2'),
      createMessage('assistant-2', 'assistant', '回答二', 4, 'ask-2'),
    ];
    const rows = buildRows(messages, 0, false);
    const jumpToMessageAnchor = vi.fn(() => true);

    const { result } = renderHook(() => useMessageNavigation({
      topic: createTopic(messages),
      messagesAll: messages,
      rows,
      viewportSnapshot: {
        kind: 'row-anchor',
        askId: 'ask-1',
        messageId: 'user-1',
        offset: 0,
        rowIndex: 0,
        rowKey: 'user-1',
      },
      isAtBottom: false,
      messageNavigation: 'buttons',
      multiSelectMode: false,
      jumpToMessageAnchor,
      scrollToTop: vi.fn(),
      scrollToBottom: vi.fn(),
    }));

    act(() => {
      result.current.navJumpToAnchor('user-1');
    });

    expect(jumpToMessageAnchor).not.toHaveBeenCalled();
  });

  it('top / bottom 只发滚动命令，不会生成 flash 请求', () => {
    const messages = [
      createMessage('user-1', 'user', '问题一', 1, 'ask-1'),
      createMessage('assistant-1', 'assistant', '回答一', 2, 'ask-1'),
      createMessage('user-2', 'user', '问题二', 3, 'ask-2'),
      createMessage('assistant-2', 'assistant', '回答二', 4, 'ask-2'),
    ];
    const rows = buildRows(messages, 0, false);
    const scrollToTop = vi.fn();
    const scrollToBottom = vi.fn();

    const { result } = renderHook(() => useMessageNavigation({
      topic: createTopic(messages),
      messagesAll: messages,
      rows,
      viewportSnapshot: {
        kind: 'row-anchor',
        askId: 'ask-2',
        messageId: 'user-2',
        offset: 0,
        rowIndex: 2,
        rowKey: 'user-2',
      },
      isAtBottom: false,
      messageNavigation: 'buttons',
      multiSelectMode: false,
      jumpToMessageAnchor: vi.fn(() => true),
      scrollToTop,
      scrollToBottom,
    }));

    act(() => {
      result.current.navGoTop();
    });

    expect(scrollToTop).toHaveBeenCalledTimes(1);
    expect(result.current.navFlashRequest).toBeNull();

    act(() => {
      result.current.navGoBottom();
    });

    expect(scrollToBottom).toHaveBeenCalledTimes(1);
    expect(result.current.navFlashRequest).toBeNull();
  });
});
