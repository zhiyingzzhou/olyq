/**
 * 说明：`chat-utils.run-stream.test` 基础能力模块。
 *
 * 职责：
 * - 承载 `chat-utils.run-stream.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import type { Message, ResolvedConversationContext } from '@/types/chat';
import type { I18nText } from '@/types/i18n';
import { getMessageReasoningText } from '@/lib/chat/message-trace';
import { runStreamChat, type RunStreamChatOptions } from './run-stream-chat';

const {
  streamChatMock,
  getWebSearchSettingsMock,
  buildMemoryChatParamsMock,
  getMemoryConfigMock,
  createAutoMcpServerSelectionMock,
  putImageAttachmentMock,
  downloadUrlToFileMock,
  getHostMatchPatternsForUrlsMock,
} = vi.hoisted(() => ({
  streamChatMock: vi.fn(),
  getWebSearchSettingsMock: vi.fn(),
  buildMemoryChatParamsMock: vi.fn(),
  getMemoryConfigMock: vi.fn(),
  createAutoMcpServerSelectionMock: vi.fn(),
  putImageAttachmentMock: vi.fn(),
  downloadUrlToFileMock: vi.fn(),
  getHostMatchPatternsForUrlsMock: vi.fn(),
}));

vi.mock('@/lib/developer/stream-chat-with-developer-mode', () => ({
  streamChatWithDeveloperMode: streamChatMock,
}));

vi.mock('@/hooks/useAssistantStore', () => ({
  useAssistantStore: {
    getState: () => ({ getAssistant: () => null }),
  },
}));

vi.mock('@/lib/web-search/settings', () => ({
  getWebSearchSettings: getWebSearchSettingsMock,
}));

vi.mock('@/lib/memory', () => ({
  buildMemoryChatParams: buildMemoryChatParamsMock,
  getMemoryConfig: getMemoryConfigMock,
}));

vi.mock('@/lib/mcp/selection', () => ({
  createAutoMcpServerSelection: createAutoMcpServerSelectionMock,
}));

vi.mock('@/lib/attachments', () => ({
  putImageAttachment: putImageAttachmentMock,
}));

vi.mock('@/lib/ai/image-download', () => ({
  downloadUrlToFile: downloadUrlToFileMock,
  getHostMatchPatternsForUrls: getHostMatchPatternsForUrlsMock,
}));

/**
 * 测试辅助函数：`createTopic`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createTopic(): ResolvedConversationContext {
  return {
    id: 'topic-1',
    title: 'Topic',
    messages: [],
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
 * 测试辅助函数：`createBaseMessage`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createBaseMessage(): Message {
  return {
    id: 'user-1',
    askId: 'ask-1',
    role: 'user',
    content: 'hello',
    createdAt: 1,
  };
}

/**
 * 测试辅助函数：`createOptions`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createOptions(args: {
  controller: AbortController;
  onUpdateMessages: RunStreamChatOptions['onUpdateMessages'];
  onFinish?: () => void;
  onError?: (err: I18nText, details?: Message['errorDetails']) => void;
}): RunStreamChatOptions {
  return {
    apiMsgs: [{ role: 'user', content: 'hello' }],
    topic: createTopic(),
    askId: 'ask-1',
    targetIndex: 1,
    mode: 'insert',
    signal: args.controller.signal,
    baseMsgs: [createBaseMessage()],
    topicId: 'topic-1',
    onUpdateMessages: args.onUpdateMessages,
    onFinish: args.onFinish ?? vi.fn(),
    onError: args.onError ?? vi.fn(),
  };
}

/**
 * 测试辅助函数：`installAnimationFrameStub`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function installAnimationFrameStub() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const cancelAnimationFrameMock = vi.fn((id: number) => {
    callbacks.delete(id);
  });

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextId;
    nextId += 1;
    callbacks.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);

  return {
    cancelAnimationFrameMock,
    flushAll: (timestamp = 16) => {
      while (callbacks.size > 0) {
        const [id, callback] = callbacks.entries().next().value as [number, FrameRequestCallback];
        callbacks.delete(id);
        callback(timestamp);
      }
    },
    flushNext: (timestamp = 16) => {
      const next = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
      if (!next) return;
      callbacks.delete(next[0]);
      next[1](timestamp);
    },
    pendingCount: () => callbacks.size,
  };
}

describe('runStreamChat terminal handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_OLYQ_E2E', '0');
    getWebSearchSettingsMock.mockReturnValue(undefined);
    buildMemoryChatParamsMock.mockReturnValue(undefined);
    getMemoryConfigMock.mockReturnValue({});
    createAutoMcpServerSelectionMock.mockReturnValue({ mode: 'auto', manualServerIds: [] });
    putImageAttachmentMock.mockResolvedValue({
      id: 'img-1',
      name: 'generated.png',
      mime: 'image/png',
      size: 4,
    });
    downloadUrlToFileMock.mockResolvedValue(undefined);
    getHostMatchPatternsForUrlsMock.mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('keeps success after remote done even if the signal aborts later', async () => {
    const controller = new AbortController();
    let latest: Message[] = [];
    const onFinish = vi.fn();
    const onError = vi.fn();

    streamChatMock.mockImplementation(async (opts: {
      onDelta: (chunk: string) => void;
      onDone: () => void;
    }) => {
      opts.onDelta('finished reply');
      opts.onDone();
      controller.abort();
    });

    await runStreamChat(createOptions({
      controller,
      onUpdateMessages: (_id, msgs) => {
        latest = msgs;
      },
      onFinish,
      onError,
    }));

    const assistant = latest[1];
    expect(assistant?.status).toBe('success');
    expect(assistant?.content).toBe('finished reply');
    expect(assistant?.error).toBeUndefined();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('forwards modelParams into the underlying stream call', async () => {
    const controller = new AbortController();

    streamChatMock.mockImplementation(async (opts: {
      onDone: () => void;
    }) => {
      opts.onDone();
    });

    await runStreamChat(createOptions({
      controller,
      onUpdateMessages: () => undefined,
    }));

    expect(streamChatMock).toHaveBeenCalledWith(expect.objectContaining({
      modelParams: {},
      maxTokens: 256,
      mcpSelection: { mode: 'auto', manualServerIds: [] },
    }));
  });

  it('marks the message as paused only on a real abort terminal', async () => {
    const controller = new AbortController();
    let latest: Message[] = [];
    const onFinish = vi.fn();

    streamChatMock.mockImplementation(async (opts: {
      onDelta: (chunk: string) => void;
      onAbort?: () => void;
    }) => {
      opts.onDelta('partial reply');
      opts.onAbort?.();
    });

    await runStreamChat(createOptions({
      controller,
      onUpdateMessages: (_id, msgs) => {
        latest = msgs;
      },
      onFinish,
    }));

    const assistant = latest[1];
    expect(assistant?.status).toBe('paused');
    expect(assistant?.content).toBe('partial reply');
    expect(assistant?.error).toEqual({ key: 'chat.generationCancelled' });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('keeps image-only replies successful during attachment persistence even if abort happens late', async () => {
    const controller = new AbortController();
    let latest: Message[] = [];
    const onFinish = vi.fn();
    const onError = vi.fn();

    streamChatMock.mockImplementation(async (opts: {
      onFile: (event: { kind: 'base64'; data: string; mediaType: string }) => void;
      onDone: () => void;
    }) => {
      opts.onFile({ kind: 'base64', data: 'aGVsbG8=', mediaType: 'image/png' });
      opts.onDone();
      controller.abort();
    });

    await runStreamChat(createOptions({
      controller,
      onUpdateMessages: (_id, msgs) => {
        latest = msgs;
      },
      onFinish,
      onError,
    }));

    const assistant = latest[1];
    expect(assistant?.status).toBe('success');
    expect(assistant?.attachments).toEqual([
      {
        type: 'image',
        id: 'img-1',
        name: 'generated.png',
        mime: 'image/png',
        size: 4,
      },
    ]);
    expect(assistant?.error).toBeUndefined();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not block the stream on removed provider network-target preflight', async () => {
    streamChatMock.mockImplementation(async (opts: { onDone: () => void }) => {
      opts.onDone();
    });
    const controller = new AbortController();
    let latest: Message[] = [];
    const onFinish = vi.fn();
    const onError = vi.fn();

    await runStreamChat(createOptions({
      controller,
      onUpdateMessages: (_id, msgs) => {
        latest = msgs;
      },
      onFinish,
      onError,
    }));

    expect(streamChatMock).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(latest[1]?.status).toBe('success');
  });

  it('marks the assistant as error when the underlying stream times out', async () => {
    const controller = new AbortController();
    let latest: Message[] = [];
    const onError = vi.fn();

    streamChatMock.mockImplementation(async (opts: {
      onError: (err: string) => void;
    }) => {
      opts.onError(i18n.t('errors.requestTimedOutOrDisconnected'));
    });

    await runStreamChat(createOptions({
      controller,
      onUpdateMessages: (_id, msgs) => {
        latest = msgs;
      },
      onError,
    }));

    expect(latest[1]?.status).toBe('error');
    expect(latest[1]?.error).toBe(i18n.t('errors.requestTimedOutOrDisconnected'));
    expect(onError).toHaveBeenCalledWith(i18n.t('errors.requestTimedOutOrDisconnected'), undefined);
  });

  it('coalesces multiple stream deltas into a single frame update and skips topic meta touch', async () => {
    const controller = new AbortController();
    const raf = installAnimationFrameStub();
    const updates: Array<{ messages: Message[]; options?: { touchTopicMeta?: boolean } }> = [];

    streamChatMock.mockImplementation(async (opts: {
      onDelta: (chunk: string) => void;
      onReasoning: (chunk: string) => void;
      onDone: () => void;
    }) => {
      opts.onDelta('hello');
      opts.onDelta(' world');
      opts.onReasoning('thinking');
      expect(updates).toHaveLength(0);
      expect(raf.pendingCount()).toBe(1);
      raf.flushNext();
      opts.onDone();
    });

    await runStreamChat(createOptions({
      controller,
      onUpdateMessages: (_id, messages, options) => {
        updates.push({
          messages: messages.map((message) => ({ ...message })),
          options,
        });
      },
    }));

    expect(updates).toHaveLength(2);
    expect(updates[0]?.messages[1]?.content).toBe('hello world');
    expect(getMessageReasoningText(updates[0]?.messages[1])).toBe('thinking');
    expect(updates[0]?.messages[1]?.status).toBe('processing');
    expect(updates[0]?.options).toEqual({ touchTopicMeta: false });
    expect(updates[1]?.messages[1]?.status).toBe('success');
  });

  it('terminal flush cancels a pending frame update but still keeps the last chunk', async () => {
    const controller = new AbortController();
    const raf = installAnimationFrameStub();
    const updates: Array<{ messages: Message[]; options?: { touchTopicMeta?: boolean } }> = [];

    streamChatMock.mockImplementation(async (opts: {
      onDelta: (chunk: string) => void;
      onDone: () => void;
    }) => {
      opts.onDelta('last chunk');
      expect(raf.pendingCount()).toBe(1);
      opts.onDone();
    });

    await runStreamChat(createOptions({
      controller,
      onUpdateMessages: (_id, messages, options) => {
        updates.push({
          messages: messages.map((message) => ({ ...message })),
          options,
        });
      },
    }));

    expect(raf.cancelAnimationFrameMock).toHaveBeenCalledTimes(1);
    expect(raf.pendingCount()).toBe(0);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.messages[1]?.content).toBe('last chunk');
    expect(updates[0]?.messages[1]?.status).toBe('success');

    raf.flushAll();
    expect(updates).toHaveLength(1);
  });

  it('只在 assistant 首次真实写回时触发一次初始提交回调', async () => {
    const controller = new AbortController();
    const onInitialAssistantSnapshotCommitted = vi.fn();

    streamChatMock.mockImplementation(async (opts: {
      onDelta: (chunk: string) => void;
      onDone: () => void;
    }) => {
      opts.onDelta('hello');
      opts.onDelta(' world');
      opts.onDone();
    });

    await runStreamChat({
      ...createOptions({
        controller,
        onUpdateMessages: () => undefined,
      }),
      onInitialAssistantSnapshotCommitted,
    });

    expect(onInitialAssistantSnapshotCommitted).toHaveBeenCalledTimes(1);
  });
});
