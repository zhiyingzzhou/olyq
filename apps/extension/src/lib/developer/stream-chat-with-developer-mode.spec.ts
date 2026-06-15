/**
 * 说明：`stream-chat-with-developer-mode.spec` 基础能力模块。
 *
 * 职责：
 * - 承载 `stream-chat-with-developer-mode.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/types/chat';
import { useChatSettingsStore } from '@/hooks/useChatSettingsStore';
import { useDeveloperToolsStore } from '@/hooks/useDeveloperToolsStore';
import { streamChatWithDeveloperMode } from './stream-chat-with-developer-mode';

const streamChatMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/chat-stream', () => ({
  streamChat: streamChatMock,
}));

describe('streamChatWithDeveloperMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS, enableDeveloperMode: false });
    useDeveloperToolsStore.setState({ events: [] });
  });

  it('默认跟随开发者模式开启 debug，并把事件写入开发者 store', async () => {
    useChatSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS, enableDeveloperMode: true });
    const onDebug = vi.fn();

    streamChatMock.mockImplementation(async (opts: {
      debug?: boolean;
      onDebug?: (event: { requestId: string; kind: string; payload: unknown }) => void;
    }) => {
      opts.onDebug?.({ requestId: 'req-1', kind: 'websearch/execute', payload: { q: 'hello' } });
    });

    await streamChatWithDeveloperMode({
      developerSource: 'chat-topic',
      messages: [{ role: 'user', content: 'hello' }],
      model: 'openai/gpt-5.4',
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 256,
      onDelta: () => {},
      onDone: () => {},
      onError: () => {},
      onDebug,
    });

    expect(streamChatMock).toHaveBeenCalledWith(expect.objectContaining({ debug: true }));
    expect(onDebug).toHaveBeenCalledWith({
      requestId: 'req-1',
      kind: 'websearch/execute',
      payload: { q: 'hello' },
    });
    expect(useDeveloperToolsStore.getState().events).toEqual([
      expect.objectContaining({
        requestId: 'req-1',
        source: 'chat-topic',
        kind: 'websearch/execute',
        payload: { q: 'hello' },
      }),
    ]);
  });

  it('显式 debug=false 时会覆盖开发者模式默认值', async () => {
    useChatSettingsStore.getState().setSettings({ ...DEFAULT_SETTINGS, enableDeveloperMode: true });
    streamChatMock.mockResolvedValue(undefined);

    await streamChatWithDeveloperMode({
      developerSource: 'chat-compare',
      debug: false,
      messages: [{ role: 'user', content: 'hello' }],
      model: 'openai/gpt-5.4',
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 256,
      onDelta: () => {},
      onDone: () => {},
      onError: () => {},
    });

    expect(streamChatMock).toHaveBeenCalledWith(expect.objectContaining({ debug: false }));
  });
});
