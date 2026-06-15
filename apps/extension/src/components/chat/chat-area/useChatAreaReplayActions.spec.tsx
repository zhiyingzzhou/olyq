/**
 * 说明：`useChatAreaReplayActions.spec` 组件模块。
 *
 * 职责：
 * - 承载 `useChatAreaReplayActions.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message, ResolvedConversationContext } from '@/types/chat';
import { i18nText } from '@/lib/i18n/text';
import { useChatAreaReplayActions } from './useChatAreaReplayActions';
import {
  DEFAULT_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS,
  FULL_PAGE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS,
  STYLE_CAPTURE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS,
} from './browser-context-send-budget';

const {
  buildChatSystemContentMock,
  runStreamChatMock,
  resolveBrowserContextEffectiveStateMock,
  resolveBrowserContextForSendMock,
  buildPageStyleVisionAttachmentsFromFramesMock,
  supportsPageStyleVisionInputMock,
  toastMock,
  collectInputImagesFromAttachmentsMock,
  generateImageReplyAttachmentsMock,
} = vi.hoisted(() => ({
  buildChatSystemContentMock: vi.fn(),
  runStreamChatMock: vi.fn(),
  resolveBrowserContextEffectiveStateMock: vi.fn(),
  resolveBrowserContextForSendMock: vi.fn(),
  buildPageStyleVisionAttachmentsFromFramesMock: vi.fn(),
  supportsPageStyleVisionInputMock: vi.fn(),
  toastMock: vi.fn(),
  collectInputImagesFromAttachmentsMock: vi.fn(),
  generateImageReplyAttachmentsMock: vi.fn(),
}));

vi.mock('@/lib/chat/context-pipeline', () => ({
  buildChatSystemContent: buildChatSystemContentMock,
}));

vi.mock('@/lib/chat/chat-utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/chat/chat-utils')>('@/lib/chat/chat-utils');
  return {
    ...actual,
  };
});

vi.mock('@/lib/chat/run-stream-chat', () => ({
  runStreamChat: runStreamChatMock,
}));

vi.mock('@/hooks/useToast', () => ({
  toast: toastMock,
}));

vi.mock('@/lib/browser-context', () => ({
  resolveBrowserContextEffectiveState: resolveBrowserContextEffectiveStateMock,
  resolveBrowserContextForSend: resolveBrowserContextForSendMock,
}));

vi.mock('./page-style-input', () => ({
  buildPageStyleVisionAttachmentsFromFrames: buildPageStyleVisionAttachmentsFromFramesMock,
  supportsPageStyleVisionInput: supportsPageStyleVisionInputMock,
}));

vi.mock('./shared', () => ({
  collectInputImagesFromAttachments: collectInputImagesFromAttachmentsMock,
  generateImageReplyAttachments: generateImageReplyAttachmentsMock,
}));

/**
 * 测试辅助函数：`createDeferred`。
 *
 * @remarks
 * 用于显式卡住某个异步目标，验证多 assistant 重跑是否会在前一个目标完成前就启动后一个目标。
 */
function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

/**
 * 测试辅助函数：`createTopic`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
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
 * 测试辅助函数：`createPageStyleEffectiveState`。
 *
 * @remarks
 * 统一生成页面风格输入的 `effectiveState` mock，避免测试继续依赖已删除的旧返回字段。
 */
function createPageStyleEffectiveState(overrides?: {
  effective?: boolean;
  fullPageEnabled?: boolean;
  styleSignalsEnabled?: boolean;
}) {
  return {
    effective: overrides?.effective ?? true,
    conversationMode: {
      enabled: overrides?.effective ?? true,
      fullPageEnabled: overrides?.fullPageEnabled ?? false,
      styleSignalsEnabled: overrides?.styleSignalsEnabled ?? true,
    },
  };
}

/**
 * 测试辅助函数：`createMessages`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createMessages(): Message[] {
  return [
    {
      id: 'user-1',
      askId: 'ask-1',
      role: 'user',
      content: '上海天气',
      createdAt: 1,
    },
    {
      id: 'assistant-1',
      askId: 'ask-1',
      role: 'assistant',
      modelId: 'provider/model',
      content: '旧回复',
      status: 'success',
      createdAt: 2,
    },
  ];
}

/**
 * 测试辅助函数：`createT`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createT() {
  return ((key: string, params?: Record<string, unknown>) => {
    if (key === 'common.error') return '错误';
    if (key === 'common.cancelled') return '已取消';
    if (key === 'chat.generationCancelled') return '本次生成已取消';
    if (key === 'errors.unknownWithDetail') return String(params?.detail || key);
    return key;
  }) as never;
}

describe('useChatAreaReplayActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildChatSystemContentMock.mockResolvedValue({ systemContent: 'sys' });
    runStreamChatMock.mockResolvedValue(undefined);
    supportsPageStyleVisionInputMock.mockImplementation((model: unknown) => {
      const record = model && typeof model === 'object' ? model as { kind?: unknown; inputModalities?: unknown; features?: unknown } : {};
      const kind = String(record.kind || '').trim();
      const inputModalities = Array.isArray(record.inputModalities) ? record.inputModalities.map((item) => String(item || '').trim()) : [];
      const features = Array.isArray(record.features) ? record.features.map((item) => String(item || '').trim()) : [];
      return kind === 'multimodal-chat' || inputModalities.includes('image') || features.includes('vision-input');
    });
    resolveBrowserContextEffectiveStateMock.mockReturnValue(createPageStyleEffectiveState());
    resolveBrowserContextForSendMock.mockResolvedValue({
      browserContext: { prompt: 'page context' },
      captureFrames: [],
      captureWarning: null,
      styleCapture: null,
      degraded: false,
      status: 'ready',
    });
    buildPageStyleVisionAttachmentsFromFramesMock.mockImplementation((frames: Array<{ dataUrl: string; name: string; mime: string }>) => (
      frames.map((frame) => ({
        type: 'image',
        url: frame.dataUrl,
        name: frame.name,
        mime: frame.mime,
      }))
    ));
    collectInputImagesFromAttachmentsMock.mockResolvedValue([]);
    generateImageReplyAttachmentsMock.mockResolvedValue([]);
  });

  it('resendUserAsk triggers runStreamChat for a plain-text user message', async () => {
    const latestMessagesRef = { current: createMessages() };
    const updates: Message[][] = [];
    const onUpdateMessages = vi.fn((_: string, messages: Message[]) => {
      latestMessagesRef.current = messages;
      updates.push(messages);
    });

    const { result } = renderHook(() => useChatAreaReplayActions({
      abortControllersRef: { current: new Map() },
      buildApiMessages: vi.fn(async ({ contextMessages }) => contextMessages.map((message: Message) => ({ role: message.role, content: message.content }))),
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map(),
      onUpdateMessages,
      scrollToBottom: vi.fn(),
      scrollToBottomAfterNextCommitIfFollowing: vi.fn(() => false),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(latestMessagesRef.current),
    }));

    await act(async () => {
      await result.current.resendUserAsk('ask-1');
    });

    expect(runStreamChatMock).toHaveBeenCalledTimes(1);
    expect(runStreamChatMock).toHaveBeenCalledWith(expect.objectContaining({
      askId: 'ask-1',
      modelId: 'provider/model',
      mode: 'replace',
      targetIndex: 1,
      topicId: 'topic-1',
    }));
    const firstUpdate = updates[0] ?? [];
    expect(firstUpdate.find((message) => message.id === 'assistant-1')).toMatchObject({
      content: '旧回复',
      status: 'preparing',
    });
    expect(resolveBrowserContextForSendMock).toHaveBeenCalledWith(expect.objectContaining({
      requireReadableDom: true,
      budgetMs: DEFAULT_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS,
    }));
  });

  it('resendUserAsk 只在仍贴底时才预约下一次提交后的底部滚动', async () => {
    const latestMessagesRef = { current: createMessages() };
    const scrollToBottom = vi.fn();
    const scrollToBottomAfterNextCommit = vi.fn();
    const scrollToBottomAfterNextCommitIfFollowing = vi.fn(() => false);

    const { result } = renderHook(() => useChatAreaReplayActions({
      abortControllersRef: { current: new Map() },
      buildApiMessages: vi.fn(async ({ contextMessages }) => contextMessages.map((message: Message) => ({ role: message.role, content: message.content }))),
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map(),
      onUpdateMessages: vi.fn((_: string, messages: Message[]) => {
        latestMessagesRef.current = messages;
      }),
      scrollToBottom,
      scrollToBottomAfterNextCommitIfFollowing,
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(latestMessagesRef.current),
    }));

    await act(async () => {
      await result.current.resendUserAsk('ask-1');
    });

    expect(scrollToBottomAfterNextCommitIfFollowing).toHaveBeenCalledTimes(1);
    expect(scrollToBottom).not.toHaveBeenCalled();
    expect(scrollToBottomAfterNextCommit).not.toHaveBeenCalled();
  });

  it('resendUserAsk 离底重发时不注册 read tracking，消息提交仍走 executor 单一路径', async () => {
    const latestMessagesRef = { current: createMessages() };
    const commitOrder: string[] = [];
    runStreamChatMock.mockImplementation(async (options: {
      onUpdateMessages: (topicId: string, messages: Message[]) => void;
      topicId: string;
      baseMsgs: Message[];
      targetIndex: number;
    }) => {
      const nextMessages = [...options.baseMsgs];
      nextMessages[options.targetIndex] = {
        ...nextMessages[options.targetIndex]!,
        role: 'assistant',
        content: '新回复',
        status: 'success',
      } as Message;
      options.onUpdateMessages(options.topicId, nextMessages);
    });

    const { result } = renderHook(() => useChatAreaReplayActions({
      abortControllersRef: { current: new Map() },
      buildApiMessages: vi.fn(async ({ contextMessages }) => contextMessages.map((message: Message) => ({ role: message.role, content: message.content }))),
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map(),
      onUpdateMessages: vi.fn((_: string, messages: Message[]) => {
        commitOrder.push(`update:${messages.find((message) => message.id === 'assistant-1')?.status ?? 'missing'}`);
        latestMessagesRef.current = messages;
      }),
      scrollToBottom: vi.fn(),
      scrollToBottomAfterNextCommitIfFollowing: vi.fn(() => false),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(latestMessagesRef.current),
    }));

    await act(async () => {
      await result.current.resendUserAsk('ask-1');
    });

    expect(commitOrder).toEqual([
      'update:preparing',
      'update:success',
    ]);
  });

  it('resendUserAsk 仍贴底时保留 if-following 预约入口', async () => {
    const latestMessagesRef = { current: createMessages() };
    const scrollToBottomAfterNextCommitIfFollowing = vi.fn(() => true);

    const { result } = renderHook(() => useChatAreaReplayActions({
      abortControllersRef: { current: new Map() },
      buildApiMessages: vi.fn(async ({ contextMessages }) => contextMessages.map((message: Message) => ({ role: message.role, content: message.content }))),
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map(),
      onUpdateMessages: vi.fn((_: string, messages: Message[]) => {
        latestMessagesRef.current = messages;
      }),
      scrollToBottom: vi.fn(),
      scrollToBottomAfterNextCommitIfFollowing,
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(latestMessagesRef.current),
    }));

    await act(async () => {
      await result.current.resendUserAsk('ask-1');
    });

    expect(scrollToBottomAfterNextCommitIfFollowing).toHaveBeenCalledTimes(1);
  });

  it('resendUserAsk 在全文模式下会放宽 browser-context 发送前预算', async () => {
    const latestMessagesRef = { current: createMessages() };
    resolveBrowserContextEffectiveStateMock.mockReturnValue(createPageStyleEffectiveState({
      fullPageEnabled: true,
    }));

    const { result } = renderHook(() => useChatAreaReplayActions({
      abortControllersRef: { current: new Map() },
      buildApiMessages: vi.fn(async ({ contextMessages }) => contextMessages.map((message: Message) => ({ role: message.role, content: message.content }))),
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map(),
      onUpdateMessages: vi.fn((_: string, messages: Message[]) => {
        latestMessagesRef.current = messages;
      }),
      scrollToBottom: vi.fn(),
      scrollToBottomAfterNextCommitIfFollowing: vi.fn(() => false),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(latestMessagesRef.current),
    }));

    await act(async () => {
      await result.current.resendUserAsk('ask-1');
    });

    expect(resolveBrowserContextForSendMock).toHaveBeenCalledWith(expect.objectContaining({
      requireReadableDom: true,
      budgetMs: FULL_PAGE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS,
    }));
  });

  it('marks the target assistant as error instead of leaving an empty shell when preflight fails', async () => {
    const latestMessagesRef = { current: createMessages() };
    const updates: Message[][] = [];
    const onUpdateMessages = vi.fn((_: string, messages: Message[]) => {
      latestMessagesRef.current = messages;
      updates.push(messages);
    });

    buildChatSystemContentMock.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useChatAreaReplayActions({
      abortControllersRef: { current: new Map() },
      buildApiMessages: vi.fn(async ({ contextMessages }) => contextMessages.map((message: Message) => ({ role: message.role, content: message.content }))),
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map(),
      onUpdateMessages,
      scrollToBottom: vi.fn(),
      scrollToBottomAfterNextCommitIfFollowing: vi.fn(() => false),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(latestMessagesRef.current),
    }));

    await act(async () => {
      await result.current.resendUserAsk('ask-1');
    });

    expect(runStreamChatMock).not.toHaveBeenCalled();
    const lastAssistant = updates.at(-1)?.find((message) => message.id === 'assistant-1');
    expect(lastAssistant?.status).toBe('error');
    expect(lastAssistant?.error).toMatchObject({ key: 'errors.unknownWithDetail' });
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      title: '错误',
      variant: 'destructive',
    }));
  });

  it('only replays the contiguous assistant group directly under the user ask', async () => {
    const latestMessagesRef = {
      current: [
        {
          id: 'user-1',
          askId: 'ask-1',
          role: 'user',
          content: '第一问',
          createdAt: 1,
        },
        {
          id: 'assistant-1',
          askId: 'ask-1',
          role: 'assistant',
          modelId: 'provider/model',
          content: '第一问回复',
          status: 'success',
          createdAt: 2,
        },
        {
          id: 'user-2',
          askId: 'ask-2',
          role: 'user',
          content: '第二问',
          createdAt: 3,
        },
        {
          id: 'assistant-late',
          askId: 'ask-1',
          role: 'assistant',
          modelId: 'provider/model-2',
          content: '不应被重发',
          status: 'success',
          createdAt: 4,
        },
      ] as Message[],
    };
    const updates: Message[][] = [];
    const onUpdateMessages = vi.fn((_: string, messages: Message[]) => {
      latestMessagesRef.current = messages;
      updates.push(messages);
    });

    const { result } = renderHook(() => useChatAreaReplayActions({
      abortControllersRef: { current: new Map() },
      buildApiMessages: vi.fn(async ({ contextMessages }) => contextMessages.map((message: Message) => ({ role: message.role, content: message.content }))),
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map(),
      onUpdateMessages,
      scrollToBottom: vi.fn(),
      scrollToBottomAfterNextCommitIfFollowing: vi.fn(() => false),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(latestMessagesRef.current),
    }));

    await act(async () => {
      await result.current.resendUserAsk('ask-1');
    });

    expect(runStreamChatMock).toHaveBeenCalledTimes(1);
    expect(runStreamChatMock).toHaveBeenCalledWith(expect.objectContaining({
      askId: 'ask-1',
      targetIndex: 1,
    }));
    const firstUpdate = updates[0] ?? [];
    expect(firstUpdate.find((message) => message.id === 'assistant-1')?.status).toBe('preparing');
    expect(firstUpdate.find((message) => message.id === 'assistant-late')?.status).toBe('success');
    expect(firstUpdate.find((message) => message.id === 'assistant-late')?.content).toBe('不应被重发');
  });

  it('marks the target assistant as error when the replay stream fails after launch', async () => {
    const latestMessagesRef = { current: createMessages() };
    const updates: Message[][] = [];
    const setIsLoading = vi.fn();
    const onUpdateMessages = vi.fn((_: string, messages: Message[]) => {
      latestMessagesRef.current = messages;
      updates.push(messages);
    });

    runStreamChatMock.mockRejectedValue(i18nText('errors.requestTimedOutOrDisconnected'));

    const { result } = renderHook(() => useChatAreaReplayActions({
      abortControllersRef: { current: new Map() },
      buildApiMessages: vi.fn(async ({ contextMessages }) => contextMessages.map((message: Message) => ({ role: message.role, content: message.content }))),
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map(),
      onUpdateMessages,
      scrollToBottom: vi.fn(),
      scrollToBottomAfterNextCommitIfFollowing: vi.fn(() => false),
      setIsLoading,
      t: createT(),
      topic: createTopic(latestMessagesRef.current),
    }));

    await act(async () => {
      await result.current.resendUserAsk('ask-1');
    });

    const lastAssistant = updates.at(-1)?.find((message) => message.id === 'assistant-1');
    expect(lastAssistant?.status).toBe('error');
    expect(lastAssistant?.error).toEqual({ key: 'errors.requestTimedOutOrDisconnected' });
    expect(setIsLoading).toHaveBeenCalledWith(true);
    expect(setIsLoading).toHaveBeenLastCalledWith(false);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      title: '错误',
      variant: 'destructive',
    }));
  });

  it('resendUserAsk 在视觉模型下会把页面截图作为临时附件透传给 buildApiMessages', async () => {
    const latestMessagesRef = { current: createMessages() };
    const setBrowserContextPreflightPhase = vi.fn();
    const buildApiMessages = vi.fn(async ({ contextMessages }: { contextMessages: Message[] }) => (
      contextMessages.map((message) => ({ role: message.role, content: message.content }))
    ));
    resolveBrowserContextForSendMock.mockResolvedValue({
      browserContext: { prompt: 'page context' },
      captureFrames: [{
        name: 'page-style-01.png',
        mime: 'image/png',
        dataUrl: 'data:image/png;base64,replay-style',
        scrollY: 100,
      }],
      captureWarning: null,
      styleCapture: {
        requested: true,
        frameCount: 1,
        target: 'vision-input',
        warningCode: null,
      },
      degraded: false,
      status: 'ready',
    });

    const { result } = renderHook(() => useChatAreaReplayActions({
      abortControllersRef: { current: new Map() },
      buildApiMessages,
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map([['provider/model', {
        kind: 'multimodal-chat',
        inputModalities: ['text', 'image'],
        features: ['vision-input'],
      }]]),
      onUpdateMessages: vi.fn(),
      scrollToBottom: vi.fn(),
      scrollToBottomAfterNextCommitIfFollowing: vi.fn(() => false),
      setBrowserContextPreflightPhase,
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(latestMessagesRef.current),
    }));

    await act(async () => {
      await result.current.resendUserAsk('ask-1');
    });

    expect(resolveBrowserContextForSendMock).toHaveBeenCalledWith(expect.objectContaining({
      assistantId: 'assistant-1',
      conversationKey: 'topic-1',
      requireCaptures: true,
      budgetMs: STYLE_CAPTURE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS,
    }));
    expect(setBrowserContextPreflightPhase.mock.calls).toEqual([
      ['style-capture'],
      [null],
    ]);
    expect(buildApiMessages).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'provider/model',
      ephemeralUserAttachments: [{
        messageId: 'user-1',
        attachments: [expect.objectContaining({
          type: 'image',
          url: 'data:image/png;base64,replay-style',
        })],
      }],
    }));
  });

  it('resendUserAsk 即使收到旧截图结果，只要当前轮次风格模式未开启也不会透传附件', async () => {
    const latestMessagesRef = { current: createMessages() };
    const buildApiMessages = vi.fn(async ({ contextMessages }: { contextMessages: Message[] }) => (
      contextMessages.map((message) => ({ role: message.role, content: message.content }))
    ));
    resolveBrowserContextEffectiveStateMock.mockReturnValue(createPageStyleEffectiveState({
      styleSignalsEnabled: false,
    }));
    resolveBrowserContextForSendMock.mockResolvedValue({
      browserContext: { prompt: 'page context' },
      captureFrames: [{
        name: 'page-style-01.png',
        mime: 'image/png',
        dataUrl: 'data:image/png;base64,replay-style',
        scrollY: 100,
      }],
      captureWarning: null,
      styleCapture: null,
      degraded: false,
      status: 'ready',
    });

    const { result } = renderHook(() => useChatAreaReplayActions({
      abortControllersRef: { current: new Map() },
      buildApiMessages,
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map([['provider/model', {
        kind: 'multimodal-chat',
        inputModalities: ['text', 'image'],
        features: ['vision-input'],
      }]]),
      onUpdateMessages: vi.fn(),
      scrollToBottom: vi.fn(),
      scrollToBottomAfterNextCommitIfFollowing: vi.fn(() => false),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(latestMessagesRef.current),
    }));

    await act(async () => {
      await result.current.resendUserAsk('ask-1');
    });

    expect(buildApiMessages).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'provider/model',
      ephemeralUserAttachments: undefined,
    }));
  });

  it('resendUserAsk 会并发启动同一 ask 下的多个 assistant 重跑，并保持 assistant 顺序不乱', async () => {
    const latestMessagesRef = {
      current: [
        {
          id: 'user-1',
          askId: 'ask-1',
          role: 'user',
          content: '上海天气',
          createdAt: 1,
        },
        {
          id: 'assistant-1',
          askId: 'ask-1',
          role: 'assistant',
          modelId: 'provider/model-a',
          content: '旧回复 A',
          status: 'success',
          createdAt: 2,
        },
        {
          id: 'assistant-2',
          askId: 'ask-1',
          role: 'assistant',
          modelId: 'provider/model-b',
          content: '旧回复 B',
          status: 'success',
          createdAt: 3,
        },
      ] as Message[],
    };
    const updates: Message[][] = [];
    const onUpdateMessages = vi.fn((_: string, messages: Message[]) => {
      latestMessagesRef.current = messages;
      updates.push(messages);
    });
    const firstReplay = createDeferred<void>();
    const launchOrder: string[] = [];

    runStreamChatMock.mockImplementation(({ modelId }: { modelId: string }) => {
      launchOrder.push(modelId);
      if (modelId === 'provider/model-a') return firstReplay.promise;
      return Promise.resolve(undefined);
    });

    const { result } = renderHook(() => useChatAreaReplayActions({
      abortControllersRef: { current: new Map() },
      buildApiMessages: vi.fn(async ({ contextMessages }) => contextMessages.map((message: Message) => ({ role: message.role, content: message.content }))),
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map(),
      onUpdateMessages,
      scrollToBottom: vi.fn(),
      scrollToBottomAfterNextCommitIfFollowing: vi.fn(() => false),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(latestMessagesRef.current),
    }));

    await act(async () => {
      const task = result.current.resendUserAsk('ask-1');
      await waitFor(() => {
        expect(runStreamChatMock).toHaveBeenCalledTimes(2);
      });
      expect(launchOrder).toEqual(['provider/model-a', 'provider/model-b']);
      const firstUpdate = updates[0] ?? [];
      expect(firstUpdate.map((message) => message.id)).toEqual(['user-1', 'assistant-1', 'assistant-2']);
      firstReplay.resolve();
      await task;
    });
  });

  it('retryFailedAll 会并发重试全部失败 assistant，而不是逐个等待', async () => {
    const latestMessagesRef = {
      current: [
        {
          id: 'user-1',
          askId: 'ask-1',
          role: 'user',
          content: '上海天气',
          createdAt: 1,
        },
        {
          id: 'assistant-1',
          askId: 'ask-1',
          role: 'assistant',
          modelId: 'provider/model-a',
          content: '',
          status: 'error',
          createdAt: 2,
        },
        {
          id: 'assistant-2',
          askId: 'ask-1',
          role: 'assistant',
          modelId: 'provider/model-b',
          content: '',
          status: 'error',
          createdAt: 3,
        },
      ] as Message[],
    };
    const firstRetry = createDeferred<void>();
    const launchOrder: string[] = [];

    runStreamChatMock.mockImplementation(({ modelId }: { modelId: string }) => {
      launchOrder.push(modelId);
      if (modelId === 'provider/model-a') return firstRetry.promise;
      return Promise.resolve(undefined);
    });

    const { result } = renderHook(() => useChatAreaReplayActions({
      abortControllersRef: { current: new Map() },
      buildApiMessages: vi.fn(async ({ contextMessages }) => contextMessages.map((message: Message) => ({ role: message.role, content: message.content }))),
      isLoading: false,
      latestMessagesRef,
      modelMap: new Map(),
      onUpdateMessages: vi.fn((_: string, messages: Message[]) => {
        latestMessagesRef.current = messages;
      }),
      scrollToBottom: vi.fn(),
      scrollToBottomAfterNextCommitIfFollowing: vi.fn(() => false),
      setIsLoading: vi.fn(),
      t: createT(),
      topic: createTopic(latestMessagesRef.current),
    }));

    await act(async () => {
      const task = result.current.retryFailedAll('ask-1');
      await waitFor(() => {
        expect(runStreamChatMock).toHaveBeenCalledTimes(2);
      });
      expect(launchOrder).toEqual(['provider/model-a', 'provider/model-b']);
      firstRetry.resolve();
      await task;
    });
  });
});
