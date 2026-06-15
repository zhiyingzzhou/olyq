/**
 * 说明：`chat-stream.test` 基础能力模块。
 *
 * 职责：
 * - 承载 `chat-stream.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { streamChat } from './chat-stream';

const {
  createIdMock,
  ensureUiPortReadyMock,
  onUiPortMessageMock,
  postUiPortMessageMock,
  offMock,
  addDisconnectListenerMock,
  removeDisconnectListenerMock,
  emitDeveloperDebugEventMock,
} = vi.hoisted(() => ({
  createIdMock: vi.fn(() => 'req-1'),
  ensureUiPortReadyMock: vi.fn(),
  onUiPortMessageMock: vi.fn(),
  postUiPortMessageMock: vi.fn(),
  offMock: vi.fn(),
  addDisconnectListenerMock: vi.fn(),
  removeDisconnectListenerMock: vi.fn(),
  emitDeveloperDebugEventMock: vi.fn(),
}));

vi.mock('@/lib/utils/id', () => ({
  createId: createIdMock,
}));

vi.mock('@/extension/bridge/ui-port', () => ({
  ensureUiPortReady: ensureUiPortReadyMock,
  onUiPortMessage: onUiPortMessageMock,
  postUiPortMessage: postUiPortMessageMock,
}));

vi.mock('@/hooks/useChatSettingsStore', () => ({
  useChatSettingsStore: {
    getState: () => ({ settings: { enableDeveloperMode: true } }),
  },
}));

vi.mock('@/lib/developer/debug-events', () => ({
  emitDeveloperDebugEvent: emitDeveloperDebugEventMock,
}));

describe('chat-stream abort semantics', () => {
  const globalWithChrome = globalThis as typeof globalThis & { chrome?: typeof chrome };
  let originalChrome: typeof globalThis.chrome | undefined;
  let subscriber: ((msg: unknown) => void) | undefined;
  let disconnectListener: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    subscriber = undefined;
    disconnectListener = undefined;
    originalChrome = globalWithChrome.chrome;
    globalWithChrome.chrome = {
      runtime: {
        id: 'ext-test',
        connect: vi.fn(),
      },
    } as unknown as typeof chrome;
    addDisconnectListenerMock.mockImplementation((listener: () => void) => {
      disconnectListener = listener;
    });
    removeDisconnectListenerMock.mockImplementation((listener: () => void) => {
      if (disconnectListener === listener) disconnectListener = undefined;
    });
    ensureUiPortReadyMock.mockResolvedValue({
      onDisconnect: {
        addListener: addDisconnectListenerMock,
        removeListener: removeDisconnectListenerMock,
      },
    } as unknown as chrome.runtime.Port);
    onUiPortMessageMock.mockImplementation((fn: (msg: unknown) => void) => {
      subscriber = fn;
      return offMock;
    });
    postUiPortMessageMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalChrome) {
      globalWithChrome.chrome = originalChrome;
      return;
    }
    (globalWithChrome as { chrome: typeof chrome | undefined }).chrome = undefined;
  });

  it('local abort only triggers onAbort and never masquerades as done', async () => {
    const controller = new AbortController();
    const onDone = vi.fn();
    const onAbort = vi.fn();
    const onError = vi.fn();

    await streamChat({
      messages: [{ role: 'user', content: 'hello' }],
      model: 'test/model',
      temperature: 0.7,
      topP: 1,
      maxTokens: 256,
      signal: controller.signal,
      onDelta: vi.fn(),
      onDone,
      onAbort,
      onError,
    });

    controller.abort();

    expect(postUiPortMessageMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'chat/stream-v1' }));
    expect(postUiPortMessageMock).toHaveBeenNthCalledWith(2, { type: 'chat/abort', requestId: 'req-1' });
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(offMock).toHaveBeenCalledTimes(1);
    expect(removeDisconnectListenerMock).toHaveBeenCalledTimes(1);
  });

  it('keeps remote done as the only success terminal even if abort happens later', async () => {
    const controller = new AbortController();
    const onDone = vi.fn();
    const onAbort = vi.fn();

    await streamChat({
      messages: [{ role: 'user', content: 'hello' }],
      model: 'test/model',
      temperature: 0.7,
      topP: 1,
      maxTokens: 256,
      signal: controller.signal,
      onDelta: vi.fn(),
      onDone,
      onAbort,
      onError: vi.fn(),
    });

    subscriber?.({ type: 'chat/done', requestId: 'req-1', usage: { inputTokens: 1, outputTokens: 2 } });
    controller.abort();

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith({ inputTokens: 1, outputTokens: 2 });
    expect(onAbort).not.toHaveBeenCalled();
    expect(postUiPortMessageMock).toHaveBeenCalledTimes(1);
    expect(offMock).toHaveBeenCalledTimes(1);
    expect(removeDisconnectListenerMock).toHaveBeenCalledTimes(1);
  });

  it('uses a caller-provided requestId when one is supplied', async () => {
    await streamChat({
      requestId: 'manual-42',
      messages: [{ role: 'user', content: 'hello' }],
      model: 'test/model',
      temperature: 0.7,
      topP: 1,
      maxTokens: 256,
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    });

    expect(postUiPortMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'chat/stream-v1',
      requestId: 'manual-42',
    }));
    expect(createIdMock).not.toHaveBeenCalled();
  });

  it('accept ack prevents premature timeout while waiting for the first real event', async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const onError = vi.fn();

    await streamChat({
      messages: [{ role: 'user', content: 'hello' }],
      model: 'test/model',
      temperature: 0.7,
      topP: 1,
      maxTokens: 256,
      onDelta: vi.fn(),
      onDone,
      onError,
    });

    subscriber?.({ type: 'chat/accepted', requestId: 'req-1' });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(onError).not.toHaveBeenCalled();

    subscriber?.({ type: 'chat/delta', requestId: 'req-1', delta: 'hello' });
    await vi.advanceTimersByTimeAsync(44_999);
    expect(onError).not.toHaveBeenCalled();

    subscriber?.({ type: 'chat/done', requestId: 'req-1', usage: { inputTokens: 1, outputTokens: 1 } });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(emitDeveloperDebugEventMock).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'req-1',
      kind: 'chat_stream_accepted',
    }));
    expect(removeDisconnectListenerMock).toHaveBeenCalledTimes(1);
  });

  it('dispatches chat/source to onSource and keeps the stream alive', async () => {
    const onSource = vi.fn();
    const onDone = vi.fn();

    await streamChat({
      messages: [{ role: 'user', content: 'hello' }],
      model: 'test/model',
      temperature: 0.7,
      topP: 1,
      maxTokens: 256,
      onDelta: vi.fn(),
      onSource,
      onDone,
      onError: vi.fn(),
    });

    subscriber?.({
      type: 'chat/source',
      requestId: 'req-1',
      source: { title: 'Example', url: 'https://example.com', snippet: '' },
    });
    subscriber?.({ type: 'chat/done', requestId: 'req-1', usage: { inputTokens: 1, outputTokens: 1 } });

    expect(onSource).toHaveBeenCalledWith({
      source: { title: 'Example', url: 'https://example.com', snippet: '' },
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('times out when the service worker never acknowledges or streams anything', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();

    await streamChat({
      messages: [{ role: 'user', content: 'hello' }],
      model: 'test/model',
      temperature: 0.7,
      topP: 1,
      maxTokens: 256,
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError,
    });

    await vi.advanceTimersByTimeAsync(3_000);

    expect(onError).toHaveBeenCalledWith({ key: 'errors.requestTimedOutOrDisconnected' });
    expect(offMock).toHaveBeenCalledTimes(1);
    expect(removeDisconnectListenerMock).toHaveBeenCalledTimes(1);
  });

  it('times out when the service worker acknowledges but never emits the first real event', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();

    await streamChat({
      messages: [{ role: 'user', content: 'hello' }],
      model: 'test/model',
      temperature: 0.7,
      topP: 1,
      maxTokens: 256,
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError,
    });

    subscriber?.({ type: 'chat/accepted', requestId: 'req-1' });
    await vi.advanceTimersByTimeAsync(15_000);

    expect(onError).toHaveBeenCalledWith({ key: 'errors.requestTimedOutOrDisconnected' });
    expect(offMock).toHaveBeenCalledTimes(1);
    expect(removeDisconnectListenerMock).toHaveBeenCalledTimes(1);
  });

  it('treats chat/progress as a real heartbeat without fabricating visible output', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const onDelta = vi.fn();

    await streamChat({
      messages: [{ role: 'user', content: 'hello' }],
      model: 'test/model',
      temperature: 0.7,
      topP: 1,
      maxTokens: 256,
      onDelta,
      onDone: vi.fn(),
      onError,
    });

    subscriber?.({ type: 'chat/accepted', requestId: 'req-1' });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(onError).not.toHaveBeenCalled();

    subscriber?.({ type: 'chat/progress', requestId: 'req-1', stage: 'reasoning-start' });
    expect(onDelta).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(44_999);
    expect(onError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onError).toHaveBeenCalledWith({ key: 'errors.requestTimedOutOrDisconnected' });
    expect(offMock).toHaveBeenCalledTimes(1);
    expect(removeDisconnectListenerMock).toHaveBeenCalledTimes(1);
  });

  it('会在接近 idle 截止前收到新的 chat/progress 时重新续命，而不是沿用旧计时器', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const onDelta = vi.fn();

    await streamChat({
      messages: [{ role: 'user', content: 'hello' }],
      model: 'test/model',
      temperature: 0.7,
      topP: 1,
      maxTokens: 256,
      onDelta,
      onDone: vi.fn(),
      onError,
    });

    subscriber?.({ type: 'chat/accepted', requestId: 'req-1' });
    subscriber?.({ type: 'chat/progress', requestId: 'req-1', stage: 'reasoning-start' });

    await vi.advanceTimersByTimeAsync(44_999);
    expect(onError).not.toHaveBeenCalled();
    expect(onDelta).not.toHaveBeenCalled();

    subscriber?.({ type: 'chat/progress', requestId: 'req-1', stage: 'response-in-progress' });

    await vi.advanceTimersByTimeAsync(44_999);
    expect(onError).not.toHaveBeenCalled();
    expect(onDelta).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onError).toHaveBeenCalledWith({ key: 'errors.requestTimedOutOrDisconnected' });
    expect(offMock).toHaveBeenCalledTimes(1);
    expect(removeDisconnectListenerMock).toHaveBeenCalledTimes(1);
  });

  it('treats the first real event as an implicit accept and times out only after idle silence', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();

    await streamChat({
      messages: [{ role: 'user', content: 'hello' }],
      model: 'test/model',
      temperature: 0.7,
      topP: 1,
      maxTokens: 256,
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError,
    });

    subscriber?.({ type: 'chat/delta', requestId: 'req-1', delta: 'hello' });
    await vi.advanceTimersByTimeAsync(44_999);
    expect(onError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onError).toHaveBeenCalledWith({ key: 'errors.requestTimedOutOrDisconnected' });
    expect(offMock).toHaveBeenCalledTimes(1);
    expect(removeDisconnectListenerMock).toHaveBeenCalledTimes(1);
  });

  it('fails fast when the service worker restarts mid-stream', async () => {
    const onError = vi.fn();

    await streamChat({
      messages: [{ role: 'user', content: 'hello' }],
      model: 'test/model',
      temperature: 0.7,
      topP: 1,
      maxTokens: 256,
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError,
    });

    subscriber?.({ type: 'sw/restarted' });

    expect(onError).toHaveBeenCalledWith({ key: 'errors.serviceWorkerRestarted' });
    expect(offMock).toHaveBeenCalledTimes(1);
    expect(removeDisconnectListenerMock).toHaveBeenCalledTimes(1);
  });

  it('APICall 调试事件只写 warn/debug，不写 console.error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onDebug = vi.fn();
    const onDone = vi.fn();

    try {
      await streamChat({
        messages: [{ role: 'user', content: 'hello' }],
        model: 'test/model',
        temperature: 0.7,
        topP: 1,
        maxTokens: 256,
        onDelta: vi.fn(),
        onDone,
        onError: vi.fn(),
        onDebug,
      });

      subscriber?.({ type: 'chat/accepted', requestId: 'req-1' });
      subscriber?.({
        type: 'chat/debug',
        requestId: 'req-1',
        kind: 'ai-sdk/apicall-error',
        payload: { statusCode: 503, message: 'Service temporarily unavailable' },
      });
      subscriber?.({ type: 'chat/done', requestId: 'req-1', usage: { inputTokens: 0, outputTokens: 0 } });

      expect(onDebug).toHaveBeenCalledWith({
        requestId: 'req-1',
        kind: 'ai-sdk/apicall-error',
        payload: { statusCode: 503, message: 'Service temporarily unavailable' },
      });
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('fails fast when the shared ui port disconnects mid-stream', async () => {
    const onError = vi.fn();

    await streamChat({
      messages: [{ role: 'user', content: 'hello' }],
      model: 'test/model',
      temperature: 0.7,
      topP: 1,
      maxTokens: 256,
      onDelta: vi.fn(),
      onDone: vi.fn(),
      onError,
    });

    disconnectListener?.();

    expect(onError).toHaveBeenCalledWith({ key: 'errors.serviceWorkerRestarted' });
    expect(offMock).toHaveBeenCalledTimes(1);
    expect(removeDisconnectListenerMock).toHaveBeenCalledTimes(1);
  });
});
