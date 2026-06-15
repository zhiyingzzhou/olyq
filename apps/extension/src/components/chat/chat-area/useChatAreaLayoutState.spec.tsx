/**
 * 说明：`useChatAreaLayoutState.spec` 组件模块。
 *
 * 职责：
 * - 仅验证聊天区布局状态里的业务态编排；
 * - 虚拟滚动测量、startup restore 与 viewport 重测已迁到 `useChatAreaVirtualizer.spec`。
 *
 * 边界：
 * - 本文件不再直接覆盖 TanStack Virtual 实例行为；
 * - 只验证布局状态如何消费聊天虚拟化门面暴露的稳定接口。
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Message, ResolvedConversationContext } from '@/types/chat';
import { visibleAssistantOutputSignature } from '@/lib/chat/chat-utils';
import type { ChatReadMarker } from './useChatAreaVirtualizer';
import { useChatAreaLayoutState } from './useChatAreaLayoutState';

type ChatVirtualizerMockState = {
  handleKeyScrollIntent: ReturnType<typeof vi.fn>;
  handleScroll: ReturnType<typeof vi.fn>;
  handleScrollbarDragStart: ReturnType<typeof vi.fn>;
  handleTouchMove: ReturnType<typeof vi.fn>;
  handleTouchStart: ReturnType<typeof vi.fn>;
  handleTranscriptInteraction: ReturnType<typeof vi.fn>;
  handleWheelIntent: ReturnType<typeof vi.fn>;
  hasFollowBottomIntent: boolean;
  isAtBottom: boolean;
  isAtTop: boolean;
  isStrictBottom: boolean;
  markRead: ReturnType<typeof vi.fn>;
  measureElement: ReturnType<typeof vi.fn>;
  messageViewportHeight: number;
  readMarker: ChatReadMarker;
  scrollRangeIntoView: ReturnType<typeof vi.fn>;
  scrollToBottom: ReturnType<typeof vi.fn>;
  scrollToBottomAfterNextCommit: ReturnType<typeof vi.fn>;
  scrollToBottomAfterNextCommitIfFollowing: ReturnType<typeof vi.fn>;
  scrollToBottomIfFollowing: ReturnType<typeof vi.fn>;
  jumpToMessageAnchor: ReturnType<typeof vi.fn>;
  scrollToMessageRow: ReturnType<typeof vi.fn>;
  scrollToRowIndex: ReturnType<typeof vi.fn>;
  scrollToTop: ReturnType<typeof vi.fn>;
  totalSize: number;
  virtualItems: Array<{ index: number; key: string; start: number }>;
  viewportSnapshot:
    | { kind: 'bottom' | 'top' }
    | {
      askId?: string | null;
      kind: 'row-anchor';
      messageId?: string | null;
      offset?: number;
      rowIndex?: number | null;
      rowKey?: string;
    };
  visibleTopRowIndex: number;
};

const {
  chatVirtualizerInstanceRef,
  chatVirtualizerStateRef,
  useChatAreaVirtualizerMock,
  useChatSearchDomEffectsMock,
  useContentSearchMock,
  useMessageNavigationMock,
  useMultiSelectMock,
  useTranslationTasksMock,
} = vi.hoisted(() => ({
  chatVirtualizerInstanceRef: { current: null as null | Record<string, unknown> },
  chatVirtualizerStateRef: {
    current: {
      handleKeyScrollIntent: vi.fn(),
      handleScroll: vi.fn(),
      handleScrollbarDragStart: vi.fn(),
      handleTouchMove: vi.fn(),
      handleTouchStart: vi.fn(),
      handleTranscriptInteraction: vi.fn(),
      handleWheelIntent: vi.fn(),
      hasFollowBottomIntent: true,
      isAtBottom: true,
      isAtTop: false,
      isStrictBottom: true,
      markRead: vi.fn(),
      measureElement: vi.fn(),
      messageViewportHeight: 480,
      readMarker: { lastMessageId: null, lastVisibleOutputSignature: '', messageCount: 0 } satisfies ChatReadMarker,
      scrollRangeIntoView: vi.fn(() => true),
      scrollToBottom: vi.fn(),
      scrollToBottomAfterNextCommit: vi.fn(),
      scrollToBottomAfterNextCommitIfFollowing: vi.fn(() => false),
      scrollToBottomIfFollowing: vi.fn(() => false),
      jumpToMessageAnchor: vi.fn(() => true),
      scrollToMessageRow: vi.fn(() => true),
      scrollToRowIndex: vi.fn(),
      scrollToTop: vi.fn(),
      totalSize: 0,
      virtualItems: [] as Array<{ index: number; key: string; start: number }>,
      viewportSnapshot: { kind: 'bottom' } as {
        kind: 'bottom' | 'top' | 'row-anchor';
        rowKey?: string;
        rowIndex?: number | null;
        offset?: number;
        messageId?: string | null;
        askId?: string | null;
      },
      visibleTopRowIndex: 5,
    } as ChatVirtualizerMockState,
  },
  useChatAreaVirtualizerMock: vi.fn(),
  useChatSearchDomEffectsMock: vi.fn(),
  useContentSearchMock: vi.fn(),
  useMessageNavigationMock: vi.fn(),
  useMultiSelectMock: vi.fn(),
  useTranslationTasksMock: vi.fn(),
}));

vi.mock('./useChatAreaVirtualizer', () => ({
  useChatAreaVirtualizer: useChatAreaVirtualizerMock,
}));

vi.mock('@/components/chat/hooks/useContentSearch', () => ({
  useContentSearch: useContentSearchMock,
}));

vi.mock('@/components/chat/hooks/useMessageNavigation', () => ({
  useMessageNavigation: useMessageNavigationMock,
}));

vi.mock('@/components/chat/hooks/useChatSearchDomEffects', () => ({
  useChatSearchDomEffects: useChatSearchDomEffectsMock,
}));

vi.mock('@/components/chat/hooks/useMultiSelect', () => ({
  useMultiSelect: useMultiSelectMock,
}));

vi.mock('@/components/chat/hooks/useTranslationTasks', () => ({
  useTranslationTasks: useTranslationTasksMock,
}));

/**
 * 测试辅助函数：`createTopic`。
 *
 * @remarks
 * 构造最小可用的话题上下文，避免每个用例重复拼装公共字段。
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
 * 测试辅助函数：`createMessage`。
 *
 * @remarks
 * 统一生成测试消息，保证最小消息结构在所有用例里一致。
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
 * 测试辅助函数：`createReadMarkerFor`。
 *
 * @remarks
 * 让测试里的已读标记和生产实现保持同一套“尾部 assistant 正文/附件可见输出”语义。
 */
function createReadMarkerFor(messages: Message[]): ChatReadMarker {
  const lastMessage = messages.at(-1) ?? null;
  return {
    lastMessageId: lastMessage?.id ?? null,
    lastVisibleOutputSignature: visibleAssistantOutputSignature(lastMessage),
    messageCount: messages.length,
  };
}

/**
 * 测试辅助函数：`createProps`。
 *
 * @remarks
 * 为 `useChatAreaLayoutState` 提供统一初始入参。
 */
function createProps(messagesAll: Message[], options?: { isLoading?: boolean; messageNavigation?: "off" | "buttons" | "anchor" }) {
  return {
    abortControllersRef: { current: new Map() },
    confirm: vi.fn(async () => true),
    latestMessagesRef: { current: messagesAll },
    messageNavigation: options?.messageNavigation ?? 'off',
    messagesAll,
    onUpdateMessages: vi.fn(),
    topic: createTopic(messagesAll),
    isLoading: options?.isLoading ?? false,
  };
}

describe('useChatAreaLayoutState banner state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

    useChatAreaVirtualizerMock.mockImplementation(({ rows }: { rows: unknown[] }) => {
      const instance = {
        ...chatVirtualizerStateRef.current,
        totalSize: rows.length * 120,
        virtualItems: rows.map((_, index) => ({ index, key: `row-${index}`, start: index * 120 })),
      };
      chatVirtualizerInstanceRef.current = instance;
      return instance;
    });
    chatVirtualizerStateRef.current = {
      handleKeyScrollIntent: vi.fn(),
      handleScroll: vi.fn(),
      handleScrollbarDragStart: vi.fn(),
      handleTouchMove: vi.fn(),
      handleTouchStart: vi.fn(),
      handleTranscriptInteraction: vi.fn(),
      handleWheelIntent: vi.fn(),
      hasFollowBottomIntent: true,
      isAtBottom: true,
      isAtTop: false,
      isStrictBottom: true,
      markRead: vi.fn(),
      measureElement: vi.fn(),
      messageViewportHeight: 480,
      readMarker: { lastMessageId: null, lastVisibleOutputSignature: '', messageCount: 0 } satisfies ChatReadMarker,
      scrollRangeIntoView: vi.fn(() => true),
      scrollToBottom: vi.fn(),
      scrollToBottomAfterNextCommit: vi.fn(),
      scrollToBottomAfterNextCommitIfFollowing: vi.fn(() => false),
      scrollToBottomIfFollowing: vi.fn(() => false),
      jumpToMessageAnchor: vi.fn(() => true),
      scrollToMessageRow: vi.fn(() => true),
      scrollToRowIndex: vi.fn(),
      scrollToTop: vi.fn(),
      totalSize: 0,
      virtualItems: [],
      viewportSnapshot: { kind: 'bottom' } as {
        kind: 'bottom' | 'top' | 'row-anchor';
        rowKey?: string;
        rowIndex?: number | null;
        offset?: number;
        messageId?: string | null;
        askId?: string | null;
      },
      visibleTopRowIndex: 5,
    } as ChatVirtualizerMockState;

    useContentSearchMock.mockReturnValue({
      effectiveSearchCaseSensitive: false,
      effectiveSearchWholeWord: false,
      pendingSearchJumpRef: { current: null },
      searchActiveIndex: 0,
      searchMatches: [],
      searchOpen: false,
      searchQuery: '',
      searchIncludeUser: true,
      searchCanCaseSensitive: true,
      searchCanWholeWord: true,
      searchNext: vi.fn(),
      searchPrev: vi.fn(),
      openSearch: vi.fn(),
      closeSearch: vi.fn(),
      setSearchQuery: vi.fn(),
      setSearchIncludeUser: vi.fn(),
      setSearchCaseSensitive: vi.fn(),
      setSearchWholeWord: vi.fn(),
      resetSearchState: vi.fn(),
    });
    useMessageNavigationMock.mockReturnValue({
      navAnchors: [],
      navActiveAskId: null,
      navActiveIndex: -1,
      navPanelOpen: false,
      navFlashRequest: null,
      flowOpen: false,
      navGoBottom: vi.fn(),
      navGoNext: vi.fn(),
      navGoPrev: vi.fn(),
      navGoTop: vi.fn(),
      navJumpToAnchor: vi.fn(),
      navUserRows: [],
      navAnchorIndexById: new Map(),
      setFlowOpen: vi.fn(),
      setNavPanelOpen: vi.fn(),
    });
    useChatSearchDomEffectsMock.mockReturnValue(undefined);
    useMultiSelectMock.mockReturnValue({
      multiSelectMode: false,
      setMultiSelectMode: vi.fn(),
      selectedIds: new Set(),
      setSelectedIds: vi.fn(),
      allSelected: false,
      selectDragRef: { current: null },
      selectRect: null,
      setSelectRect: vi.fn(),
      enterMultiSelect: vi.fn(),
      exitMultiSelect: vi.fn(),
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      cleanupUnusedAttachments: vi.fn(),
      handleMultiSelectCopy: vi.fn(),
      handleMultiSelectSave: vi.fn(),
      handleMultiSelectDelete: vi.fn(),
      onMultiSelectMouseDown: vi.fn(),
    });
    useTranslationTasksMock.mockReturnValue({
      discardTranslationTaskByReqId: vi.fn(),
      translateAssistantMessage: vi.fn(),
      clearTranslations: vi.fn(),
      removeTranslation: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('把函数式跳转接口和 viewportSnapshot 传给搜索副作用与消息导航，而不是暴露原始 virtualizer', () => {
    renderHook((props) => useChatAreaLayoutState(props), {
      initialProps: createProps([
        createMessage('user-1', 'user', 'hello', 1, 'ask-1'),
        createMessage('assistant-1', 'assistant', 'world', 2, 'ask-1'),
      ]),
    });

    const chatVirtualizer = chatVirtualizerInstanceRef.current as {
      scrollToMessageRow: unknown;
      viewportSnapshot: { kind: string };
    };

    const searchArgs = useChatSearchDomEffectsMock.mock.calls.at(-1)?.[0];
    const navigationArgs = useMessageNavigationMock.mock.calls.at(-1)?.[0];

    expect(searchArgs?.scrollToMessageRow).toBe(chatVirtualizer.scrollToMessageRow);
    expect(searchArgs?.navigationFlashRequest).toBeNull();
    expect(searchArgs).not.toHaveProperty('rowVirtualizer');
    expect(navigationArgs?.viewportSnapshot).toEqual(chatVirtualizer.viewportSnapshot);
    expect(navigationArgs?.isAtBottom).toBe(true);
  });

  it('在用户离开底部后会把 row-anchor snapshot 和严格底部状态交给消息导航', async () => {
    const props = createProps([
      createMessage('user-1', 'user', 'hello', 1, 'ask-1'),
      createMessage('assistant-1', 'assistant', 'world', 2, 'ask-1'),
    ], { messageNavigation: 'buttons' });
    const { result, rerender } = renderHook((nextProps) => useChatAreaLayoutState(nextProps), {
      initialProps: props,
    });

    chatVirtualizerStateRef.current.isStrictBottom = false;
    chatVirtualizerStateRef.current.viewportSnapshot = {
      kind: 'row-anchor',
      rowKey: 'assistant-1',
      rowIndex: 1,
      offset: -24,
      messageId: 'assistant-1',
      askId: 'ask-1',
    };
    rerender(props);

    act(() => {
      result.current.handleScroll();
    });

    await waitFor(() => {
      expect(chatVirtualizerStateRef.current.handleScroll).toHaveBeenCalledTimes(1);
      const navigationArgs = useMessageNavigationMock.mock.calls.at(-1)?.[0];
      expect(navigationArgs?.viewportSnapshot).toEqual(chatVirtualizerStateRef.current.viewportSnapshot);
      expect(navigationArgs?.isAtBottom).toBe(false);
    });
  });

  it('shows new message counts when the user is reading above', () => {
    const initialMessages = [createMessage('m1', 'assistant', 'hello')];
    const { result, rerender } = renderHook((props) => useChatAreaLayoutState(props), {
      initialProps: createProps(initialMessages),
    });

    act(() => {
      chatVirtualizerStateRef.current.hasFollowBottomIntent = false;
      chatVirtualizerStateRef.current.isAtBottom = false;
      chatVirtualizerStateRef.current.isStrictBottom = false;
      chatVirtualizerStateRef.current.readMarker = createReadMarkerFor(initialMessages);
    });

    rerender(createProps(initialMessages));
    const nextMessages = [...initialMessages, createMessage('m2', 'assistant', 'new reply', 2)];
    rerender(createProps(nextMessages));

    expect(result.current.newCount).toBe(1);
    expect(result.current.showNewBanner).toBe(true);
  });

  it('shows a banner when the tail assistant visible text continues streaming', () => {
    const initialMessages = [createMessage('m1', 'assistant', 'hello')];
    const { result, rerender } = renderHook((props) => useChatAreaLayoutState(props), {
      initialProps: createProps(initialMessages),
    });

    act(() => {
      chatVirtualizerStateRef.current.hasFollowBottomIntent = false;
      chatVirtualizerStateRef.current.isAtBottom = false;
      chatVirtualizerStateRef.current.isStrictBottom = false;
      chatVirtualizerStateRef.current.readMarker = createReadMarkerFor(initialMessages);
    });

    rerender(createProps(initialMessages));
    rerender(createProps([createMessage('m1', 'assistant', 'hello world')], { isLoading: true }));

    expect(result.current.newCount).toBe(1);
    expect(result.current.showNewBanner).toBe(true);
  });

  it('detached-reading 下尾部继续增长时，strict-bottom 几何快照不能压掉未读 banner', () => {
    const initialMessages = [createMessage('m1', 'assistant', 'hello')];
    const { result, rerender } = renderHook((props) => useChatAreaLayoutState(props), {
      initialProps: createProps(initialMessages),
    });

    act(() => {
      chatVirtualizerStateRef.current.hasFollowBottomIntent = false;
      chatVirtualizerStateRef.current.isAtBottom = true;
      chatVirtualizerStateRef.current.isStrictBottom = true;
      chatVirtualizerStateRef.current.readMarker = createReadMarkerFor(initialMessages);
    });

    rerender(createProps(initialMessages));
    rerender(createProps([createMessage('m1', 'assistant', 'hello world')], { isLoading: true }));

    expect(result.current.newCount).toBe(1);
    expect(result.current.showNewBanner).toBe(true);
  });

  it('follow-bottom 临时离底 gap 下尾部 assistant 流式增长不显示 banner', () => {
    const initialMessages = [createMessage('m1', 'assistant', 'hello')];
    const { result, rerender } = renderHook((props) => useChatAreaLayoutState(props), {
      initialProps: createProps(initialMessages),
    });

    act(() => {
      chatVirtualizerStateRef.current.hasFollowBottomIntent = true;
      chatVirtualizerStateRef.current.isAtBottom = true;
      chatVirtualizerStateRef.current.isStrictBottom = false;
      chatVirtualizerStateRef.current.readMarker = createReadMarkerFor(initialMessages);
    });

    rerender(createProps(initialMessages));
    rerender(createProps([createMessage('m1', 'assistant', 'hello world')], { isLoading: true }));

    expect(result.current.newCount).toBe(0);
    expect(result.current.showNewBanner).toBe(false);
  });

  it('virtualizer 到底刷新 read marker 后会隐藏流式正文 banner，后续 chunk 不重新显示', () => {
    const initialMessages = [createMessage('m1', 'assistant', 'hello')];
    const streamedMessages = [createMessage('m1', 'assistant', 'hello world')];
    const nextChunkMessages = [createMessage('m1', 'assistant', 'hello world again')];
    const { result, rerender } = renderHook((props) => useChatAreaLayoutState(props), {
      initialProps: createProps(initialMessages),
    });

    act(() => {
      chatVirtualizerStateRef.current.hasFollowBottomIntent = false;
      chatVirtualizerStateRef.current.isAtBottom = false;
      chatVirtualizerStateRef.current.isStrictBottom = false;
      chatVirtualizerStateRef.current.readMarker = createReadMarkerFor(initialMessages);
    });
    rerender(createProps(initialMessages));
    rerender(createProps(streamedMessages, { isLoading: true }));

    expect(result.current.newCount).toBe(1);
    expect(result.current.showNewBanner).toBe(true);

    act(() => {
      chatVirtualizerStateRef.current.isAtBottom = true;
      chatVirtualizerStateRef.current.isStrictBottom = true;
      chatVirtualizerStateRef.current.hasFollowBottomIntent = true;
      chatVirtualizerStateRef.current.readMarker = createReadMarkerFor(streamedMessages);
    });
    rerender(createProps(streamedMessages, { isLoading: true }));

    expect(result.current.newCount).toBe(0);
    expect(result.current.showNewBanner).toBe(false);
    expect(chatVirtualizerStateRef.current.markRead).not.toHaveBeenCalled();

    act(() => {
      chatVirtualizerStateRef.current.readMarker = createReadMarkerFor(nextChunkMessages);
    });
    rerender(createProps(nextChunkMessages, { isLoading: true }));

    expect(result.current.newCount).toBe(0);
    expect(result.current.showNewBanner).toBe(false);
  });

  it('shows a banner when the tail assistant visible attachment output appears', () => {
    const initialMessages = [createMessage('m1', 'assistant', '')];
    const { result, rerender } = renderHook((props) => useChatAreaLayoutState(props), {
      initialProps: createProps(initialMessages),
    });

    act(() => {
      chatVirtualizerStateRef.current.hasFollowBottomIntent = false;
      chatVirtualizerStateRef.current.isAtBottom = false;
      chatVirtualizerStateRef.current.isStrictBottom = false;
      chatVirtualizerStateRef.current.readMarker = createReadMarkerFor(initialMessages);
    });

    rerender(createProps(initialMessages));
    rerender(createProps([{
      ...initialMessages[0]!,
      attachments: [{ id: 'image-1', type: 'image', name: 'output.png', mime: 'image/png', size: 1024 }],
    }], { isLoading: true }));

    expect(result.current.newCount).toBe(1);
    expect(result.current.showNewBanner).toBe(true);
  });

  it('does not show a banner when only the tail assistant status or reasoning changes', () => {
    const initialMessages = [createMessage('m1', 'assistant', 'hello')];
    const { result, rerender } = renderHook((props) => useChatAreaLayoutState(props), {
      initialProps: createProps(initialMessages),
    });

    act(() => {
      chatVirtualizerStateRef.current.hasFollowBottomIntent = false;
      chatVirtualizerStateRef.current.isAtBottom = false;
      chatVirtualizerStateRef.current.isStrictBottom = false;
      chatVirtualizerStateRef.current.readMarker = createReadMarkerFor(initialMessages);
    });

    rerender(createProps(initialMessages));
    rerender(createProps([{
      ...initialMessages[0]!,
      status: 'processing' as const,
      trace: [{ kind: 'reasoning' as const, text: 'thinking...' }],
    }], { isLoading: true }));

    expect(result.current.newCount).toBe(0);
    expect(result.current.showNewBanner).toBe(false);
  });

  it('历史重发原位 initial / stream / final 更新不显示底部新内容 banner', () => {
    const initialMessages = [
      createMessage('user-1', 'user', 'java 的呢?', 1, 'ask-1'),
      createMessage('assistant-1', 'assistant', '旧回复', 2, 'ask-1'),
      createMessage('user-2', 'user', '后续问题', 3, 'ask-2'),
      createMessage('assistant-2', 'assistant', '后续回复', 4, 'ask-2'),
    ];
    const { result, rerender } = renderHook((props) => useChatAreaLayoutState(props), {
      initialProps: createProps(initialMessages),
    });

    act(() => {
      chatVirtualizerStateRef.current.hasFollowBottomIntent = false;
      chatVirtualizerStateRef.current.isAtBottom = false;
      chatVirtualizerStateRef.current.isStrictBottom = false;
      chatVirtualizerStateRef.current.readMarker = createReadMarkerFor(initialMessages);
    });
    rerender(createProps(initialMessages));

    const preparingMessages = initialMessages.map((message) => (
      message.id === 'assistant-1'
        ? { ...message, status: 'preparing' as const }
        : message
    ));
    rerender(createProps(preparingMessages, { isLoading: true }));

    expect(result.current.newCount).toBe(0);
    expect(result.current.showNewBanner).toBe(false);

    const streamMessages = preparingMessages.map((message) => (
      message.id === 'assistant-1'
        ? { ...message, content: 'Java 里的正则更新中', status: 'processing' as const }
        : message
    ));
    rerender(createProps(streamMessages, { isLoading: true }));

    expect(result.current.newCount).toBe(0);
    expect(result.current.showNewBanner).toBe(false);

    const finalMessages = streamMessages.map((message) => (
      message.id === 'assistant-1'
        ? { ...message, content: 'Java 里的正则更新完成', status: 'success' as const }
        : message
    ));
    rerender(createProps(finalMessages));

    expect(result.current.showNewBanner).toBe(false);
  });

  it('历史重发最终原位快照不会因为 tail signature 变化而闪 banner', () => {
    const initialMessages = [
      createMessage('user-1', 'user', 'js 正则表达式', 1, 'ask-1'),
      createMessage('assistant-1', 'assistant', '旧回复', 2, 'ask-1'),
      createMessage('user-2', 'user', '后续问题', 3, 'ask-2'),
      createMessage('assistant-2', 'assistant', '后续回复', 4, 'ask-2'),
    ];
    const { result, rerender } = renderHook((props) => useChatAreaLayoutState(props), {
      initialProps: createProps(initialMessages),
    });

    act(() => {
      chatVirtualizerStateRef.current.hasFollowBottomIntent = false;
      chatVirtualizerStateRef.current.isAtBottom = false;
      chatVirtualizerStateRef.current.isStrictBottom = false;
      chatVirtualizerStateRef.current.readMarker = createReadMarkerFor(initialMessages);
    });
    rerender(createProps(initialMessages));

    const finalMessages = initialMessages.map((message) => (
      message.id === 'assistant-1'
        ? { ...message, content: '新的历史原位回复', status: 'success' as const }
        : message
    ));
    rerender(createProps(finalMessages));

    expect(chatVirtualizerStateRef.current.readMarker).toEqual(createReadMarkerFor(initialMessages));
    expect(result.current.newCount).toBe(0);
    expect(result.current.showNewBanner).toBe(false);
  });

  it('历史重发原位更新后追加真实尾部新消息时仍显示底部未读 banner', () => {
    const initialMessages = [
      createMessage('user-1', 'user', 'js 正则表达式', 1, 'ask-1'),
      createMessage('assistant-1', 'assistant', '旧回复', 2, 'ask-1'),
      createMessage('user-2', 'user', '后续问题', 3, 'ask-2'),
      createMessage('assistant-2', 'assistant', '后续回复', 4, 'ask-2'),
    ];
    const { result, rerender } = renderHook((props) => useChatAreaLayoutState(props), {
      initialProps: createProps(initialMessages),
    });

    act(() => {
      chatVirtualizerStateRef.current.hasFollowBottomIntent = false;
      chatVirtualizerStateRef.current.isAtBottom = false;
      chatVirtualizerStateRef.current.isStrictBottom = false;
      chatVirtualizerStateRef.current.readMarker = createReadMarkerFor(initialMessages);
    });
    rerender(createProps(initialMessages));

    const inlineMessages = initialMessages.map((message) => (
      message.id === 'assistant-1'
        ? { ...message, content: '新的历史原位回复', status: 'success' as const }
        : message
    ));
    rerender(createProps(inlineMessages));
    expect(result.current.showNewBanner).toBe(false);

    const messagesWithRealUnread = [
      ...inlineMessages,
      createMessage('assistant-3', 'assistant', '真正位于底部的新回复', 5, 'ask-3'),
    ];
    rerender(createProps(messagesWithRealUnread));

    expect(result.current.newCount).toBe(1);
    expect(result.current.showNewBanner).toBe(true);
  });

  it('历史重发在原位置插入新 assistant stub 时不显示底部未读 banner', () => {
    const initialMessages = [
      createMessage('user-1', 'user', '多模型问题', 1, 'ask-1'),
      createMessage('assistant-1', 'assistant', '旧回复 A', 2, 'ask-1'),
      createMessage('user-2', 'user', '后续问题', 3, 'ask-2'),
      createMessage('assistant-2', 'assistant', '后续回复', 4, 'ask-2'),
    ];
    const { result, rerender } = renderHook((props) => useChatAreaLayoutState(props), {
      initialProps: createProps(initialMessages),
    });

    act(() => {
      chatVirtualizerStateRef.current.hasFollowBottomIntent = false;
      chatVirtualizerStateRef.current.isAtBottom = false;
      chatVirtualizerStateRef.current.isStrictBottom = false;
      chatVirtualizerStateRef.current.readMarker = createReadMarkerFor(initialMessages);
    });
    rerender(createProps(initialMessages));

    const messagesWithInlineStub = [
      initialMessages[0]!,
      { ...initialMessages[1]!, status: 'processing' as const },
      createMessage('assistant-inline-new', 'assistant', '', 5, 'ask-1'),
      initialMessages[2]!,
      initialMessages[3]!,
    ];
    rerender(createProps(messagesWithInlineStub, { isLoading: true }));

    expect(result.current.newCount).toBe(0);
    expect(result.current.showNewBanner).toBe(false);
  });

  it('仍处于贴底时只消费 virtualizer 已读状态，不再由 layout 刷新已读标记', () => {
    const initialMessages = [createMessage('m1', 'assistant', 'hello')];
    const { result, rerender } = renderHook((props) => useChatAreaLayoutState(props), {
      initialProps: createProps(initialMessages),
    });

    const nextMessages = [...initialMessages, createMessage('m2', 'assistant', 'new reply', 2)];
    rerender(createProps(nextMessages));

    expect(chatVirtualizerStateRef.current.markRead).not.toHaveBeenCalledWith(2, 'm2', visibleAssistantOutputSignature(nextMessages.at(-1)));
    expect(result.current.showNewBanner).toBe(false);
    expect(chatVirtualizerStateRef.current.scrollToBottom).not.toHaveBeenCalled();
  });

  it('scrollToBottom 只发底部命令，不会提前写入已读标记', () => {
    const initialMessages = [createMessage('m1', 'assistant', 'hello')];
    const { result, rerender } = renderHook((props) => useChatAreaLayoutState(props), {
      initialProps: createProps(initialMessages),
    });

    act(() => {
      chatVirtualizerStateRef.current.isAtBottom = false;
      chatVirtualizerStateRef.current.isStrictBottom = false;
    });

    rerender(createProps(initialMessages));
    const nextMessages = [...initialMessages, createMessage('m2', 'assistant', 'new reply', 2)];
    rerender(createProps(nextMessages));

    const chatVirtualizer = chatVirtualizerInstanceRef.current as {
      markRead: ReturnType<typeof vi.fn>;
      scrollToBottom: ReturnType<typeof vi.fn>;
    };
    chatVirtualizer.markRead.mockClear();

    act(() => {
      result.current.scrollToBottom();
    });

    expect(chatVirtualizer.markRead).not.toHaveBeenCalled();
    expect(chatVirtualizer.scrollToBottom).toHaveBeenCalledWith('raf');
  });

  it('流式进行中点击底部会立即发真实 bottom command，而不是只预约下一次 commit', () => {
    const initialMessages = [createMessage('m1', 'assistant', 'hello')];
    const { result } = renderHook((props) => useChatAreaLayoutState(props), {
      initialProps: createProps(initialMessages, { isLoading: true }),
    });

    const chatVirtualizer = chatVirtualizerInstanceRef.current as {
      markRead: ReturnType<typeof vi.fn>;
      scrollToBottom: ReturnType<typeof vi.fn>;
      scrollToBottomAfterNextCommit: ReturnType<typeof vi.fn>;
    };
    chatVirtualizer.markRead.mockClear();
    chatVirtualizer.scrollToBottom.mockClear();
    chatVirtualizer.scrollToBottomAfterNextCommit.mockClear();

    act(() => {
      result.current.scrollToBottom();
    });

    expect(chatVirtualizer.markRead).not.toHaveBeenCalled();
    expect(chatVirtualizer.scrollToBottom).toHaveBeenCalledWith('raf');
    expect(chatVirtualizer.scrollToBottomAfterNextCommit).not.toHaveBeenCalled();
  });

  it('历史重发的下一次提交滚动只在仍贴底时透传', () => {
    const initialMessages = [createMessage('m1', 'assistant', 'hello')];
    const { result, rerender } = renderHook((props) => useChatAreaLayoutState(props), {
      initialProps: createProps(initialMessages, { isLoading: true }),
    });

    const chatVirtualizer = chatVirtualizerInstanceRef.current as {
      scrollToBottomAfterNextCommitIfFollowing: ReturnType<typeof vi.fn>;
    };
    chatVirtualizer.scrollToBottomAfterNextCommitIfFollowing.mockClear();

    act(() => {
      result.current.scrollToBottomAfterNextCommitIfFollowing();
    });

    expect(chatVirtualizer.scrollToBottomAfterNextCommitIfFollowing).toHaveBeenCalledWith('raf');

    chatVirtualizerStateRef.current.scrollToBottomAfterNextCommitIfFollowing = vi.fn(() => true);
    rerender(createProps(initialMessages, { isLoading: true }));

    expect(result.current.scrollToBottomAfterNextCommitIfFollowing()).toBe(true);
  });

  it('jumpToMessageAnchor 会直接通过虚拟化门面的 anchor jump 落地', () => {
    const messages = Array.from({ length: 120 }, (_, index) => (
      createMessage(`m-${index + 1}`, 'assistant', `message-${index + 1}`, index + 1)
    ));
    const { result } = renderHook((props) => useChatAreaLayoutState(props), {
      initialProps: createProps(messages),
    });

    expect(result.current.rows).toHaveLength(120);

    act(() => {
      result.current.jumpToMessageAnchor('m-10');
    });

    expect(chatVirtualizerStateRef.current.jumpToMessageAnchor).toHaveBeenCalledWith('m-10', 'start');
  });

  it('topic 切换时会清空 transient UI 状态', () => {
    const resetSearchState = vi.fn();
    const setNavPanelOpen = vi.fn();
    const setFlowOpen = vi.fn();
    const setMultiSelectMode = vi.fn();
    const setSelectedIds = vi.fn();
    const setSelectRect = vi.fn();
    const selectDragRef = { current: { started: true } };

    useContentSearchMock.mockReturnValue({
      effectiveSearchCaseSensitive: false,
      effectiveSearchWholeWord: false,
      pendingSearchJumpRef: { current: { messageId: 'stale', occurrence: 0, messageIndex: 0 } },
      searchActiveIndex: 0,
      searchMatches: [],
      searchOpen: false,
      searchQuery: '',
      searchIncludeUser: true,
      searchCanCaseSensitive: true,
      searchCanWholeWord: true,
      searchNext: vi.fn(),
      searchPrev: vi.fn(),
      openSearch: vi.fn(),
      closeSearch: vi.fn(),
      setSearchQuery: vi.fn(),
      setSearchIncludeUser: vi.fn(),
      setSearchCaseSensitive: vi.fn(),
      setSearchWholeWord: vi.fn(),
      resetSearchState,
    });
    useMessageNavigationMock.mockReturnValue({
      navAnchors: [],
      navActiveAskId: 'user-1',
      navActiveIndex: 0,
      navPanelOpen: true,
      navFlashRequest: null,
      flowOpen: true,
      navGoBottom: vi.fn(),
      navGoNext: vi.fn(),
      navGoPrev: vi.fn(),
      navGoTop: vi.fn(),
      navJumpToAnchor: vi.fn(),
      navUserRows: [],
      navAnchorIndexById: new Map(),
      setFlowOpen,
      setNavPanelOpen,
    });
    useMultiSelectMock.mockReturnValue({
      multiSelectMode: true,
      setMultiSelectMode,
      selectedIds: new Set(['assistant-1']),
      setSelectedIds,
      allSelected: false,
      selectDragRef,
      selectRect: { left: 0, top: 0, width: 10, height: 10 },
      setSelectRect,
      enterMultiSelect: vi.fn(),
      exitMultiSelect: vi.fn(),
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      cleanupUnusedAttachments: vi.fn(),
      handleMultiSelectCopy: vi.fn(),
      handleMultiSelectSave: vi.fn(),
      handleMultiSelectDelete: vi.fn(),
      onMultiSelectMouseDown: vi.fn(),
    });

    renderHook((props) => useChatAreaLayoutState(props), {
      initialProps: createProps([createMessage('m1', 'assistant', 'hello world')]),
    });

    expect(resetSearchState).toHaveBeenCalledTimes(1);
    expect(setMultiSelectMode).toHaveBeenCalledWith(false);
    expect(setSelectedIds).toHaveBeenCalledWith(new Set());
    expect(setSelectRect).toHaveBeenCalledWith(null);
    expect(selectDragRef.current).toBeNull();
    expect(setNavPanelOpen).toHaveBeenCalledWith(false);
    expect(setFlowOpen).toHaveBeenCalledWith(false);
  });
});
