/**
 * 说明：`port-chat-handlers` 端口层回归测试。
 *
 * 职责：
 * - 验证聊天端口处理器不会吞掉 MCP 自动路由后的工具收集错误；
 * - 防止 `collectChatTools` 失败后继续调用无工具的 `streamChatV1`，导致用户看到普通模型澄清。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nError } from '../../../lib/i18n/error';
import { createPortChatHandlerMap } from './port-chat-handlers';

const {
  collectChatToolsMock,
  streamChatV1Mock,
  getDefaultModelIdMock,
  maybeOrchestrateExternalWebSearchMock,
  maybeProcessConversationMemoryMock,
  loadImageRuntimeMock,
} = vi.hoisted(() => ({
  collectChatToolsMock: vi.fn(),
  streamChatV1Mock: vi.fn(),
  getDefaultModelIdMock: vi.fn(),
  maybeOrchestrateExternalWebSearchMock: vi.fn(),
  maybeProcessConversationMemoryMock: vi.fn(),
  loadImageRuntimeMock: vi.fn(),
}));

vi.mock('./runtime-loaders', () => ({
  IS_E2E: false,
  buildWebSearchDebugPayload: vi.fn(() => undefined),
  loadChatRuntime: vi.fn(async () => ({
    collectChatTools: collectChatToolsMock,
    getDefaultModelId: getDefaultModelIdMock,
    maybeOrchestrateExternalWebSearch: maybeOrchestrateExternalWebSearchMock,
    maybeProcessConversationMemory: maybeProcessConversationMemoryMock,
    streamChatV1: streamChatV1Mock,
  })),
  loadHealthRuntime: vi.fn(),
  loadImageRuntime: loadImageRuntimeMock,
  loadMockChatRuntime: vi.fn(),
  loadObjectRuntime: vi.fn(),
  loadSpeechRuntime: vi.fn(),
  loadTranscriptionRuntime: vi.fn(),
}));

/** 构造端口 handler 所需的最小后台上下文。 */
function makeContext() {
  return {
    activeChats: new Map(),
    activeImages: new Map(),
    activeTranscriptions: new Map(),
    activeSpeeches: new Map(),
    activeObjects: new Map(),
    toolCallToRequestId: new Map(),
    activeHealthChecks: new Map(),
    ensurePanel: vi.fn(),
    openPanelForTabFromUserGesture: vi.fn(),
    getActiveTabId: vi.fn(),
    pushBrowserContextMetadataForTab: vi.fn(),
    getSwStatus: vi.fn(),
    applyKeepAliveConfig: vi.fn(),
    postToAllUi: vi.fn(),
    beginPageToolSidePanelOwner: vi.fn(({ tabId, tool = 'screenshot-editor', sessionId }: { tabId: number; tool?: 'element-picker' | 'screenshot-editor'; sessionId?: string }) => ({ tabId, tool, sessionId, generation: 1, createdAt: Date.now() })),
    cancelPageToolSidePanelOwner: vi.fn(),
    claimPageToolSidePanelOwner: vi.fn(({ fallbackTabId, sessionId, tool = 'screenshot-editor', returnToPanel }: { fallbackTabId?: number | null; sessionId?: string | null; tool?: 'element-picker' | 'screenshot-editor' | null; returnToPanel?: boolean }) => ({ ok: true as const, owner: { tabId: fallbackTabId ?? 42, tool: tool ?? 'screenshot-editor', ...(sessionId ? { sessionId } : {}), generation: 1, createdAt: Date.now() }, returnToPanel: returnToPanel !== false })),
    postPageToolCommandToSidePanel: vi.fn(async () => ({ ok: true as const })),
    loadKeepAliveConfig: vi.fn(),
  };
}

/** 构造只记录 `postMessage` 调用的测试 Port。 */
function makePort() {
  return {
    postMessage: vi.fn(),
  } as unknown as chrome.runtime.Port & { postMessage: ReturnType<typeof vi.fn> };
}

describe('port chat handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDefaultModelIdMock.mockResolvedValue('provider/model');
    maybeOrchestrateExternalWebSearchMock.mockResolvedValue({});
    maybeProcessConversationMemoryMock.mockResolvedValue(undefined);
    streamChatV1Mock.mockResolvedValue(undefined);
    loadImageRuntimeMock.mockReset();
  });

  it('does not continue to streamChat when chat tool collection fails', async () => {
    collectChatToolsMock.mockRejectedValueOnce(new I18nError('errors.mcpAutoRouterToolListFailed', { server: 'amap' }));
    const port = makePort();
    const handlers = createPortChatHandlerMap(makeContext());

    handlers['chat/stream-v1']?.(port, {
      type: 'chat/stream-v1',
      requestId: 'req-mcp-fail',
      payload: {
        model: 'provider/model',
        messages: [{ role: 'user', content: '上海国华金融中心坐标' }],
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 256,
        topicKind: 'topic',
        mcpSelection: { mode: 'auto', manualServerIds: [] },
      },
    });

    await vi.waitFor(() => {
      expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'chat/error',
        requestId: 'req-mcp-fail',
        error: expect.objectContaining({ key: 'errors.mcpAutoRouterToolListFailed' }),
      }));
    });
    expect(streamChatV1Mock).not.toHaveBeenCalled();
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'chat/done', requestId: 'req-mcp-fail' });
  });

  it('blocks normal streaming when auto router requires MCP but no MCP tool is injected', async () => {
    collectChatToolsMock.mockImplementationOnce(async ({ params }) => {
      params.mcpAutoRouterState = {
        evaluated: true,
        needsMcp: true,
        serverIds: ['amap'],
        selectedServerIds: ['amap'],
        injectedToolNames: [],
        intent: 'read',
        reason: 'location lookup',
      };
      return undefined;
    });
    const port = makePort();
    const handlers = createPortChatHandlerMap(makeContext());

    handlers['chat/stream-v1']?.(port, {
      type: 'chat/stream-v1',
      requestId: 'req-mcp-no-tool',
      payload: {
        model: 'provider/model',
        messages: [{ role: 'user', content: '上海国华金融中心坐标' }],
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 256,
        topicKind: 'topic',
        mcpSelection: { mode: 'auto', manualServerIds: [] },
      },
    });

    await vi.waitFor(() => {
      expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'chat/error',
        requestId: 'req-mcp-no-tool',
        error: expect.objectContaining({ key: 'errors.mcpForcedToolUnavailable' }),
      }));
    });
    expect(streamChatV1Mock).not.toHaveBeenCalled();
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'chat/done', requestId: 'req-mcp-no-tool' });
  });

  it('tool collection pending 期间通过 chat/progress 给 UI watchdog 续命', async () => {
    vi.useFakeTimers();
    try {
      let resolveTools!: (value: undefined) => void;
      collectChatToolsMock.mockReturnValueOnce(new Promise((resolve) => {
        resolveTools = resolve;
      }));
      const port = makePort();
      const handlers = createPortChatHandlerMap(makeContext());

      handlers['chat/stream-v1']?.(port, {
        type: 'chat/stream-v1',
        requestId: 'req-tool-collection',
        payload: {
          model: 'provider/model',
          messages: [{ role: 'user', content: 'hello' }],
          temperature: 0.7,
          topP: 0.9,
          maxTokens: 256,
          topicKind: 'topic',
          mcpSelection: { mode: 'disabled', manualServerIds: [] },
        },
      });

      await vi.waitFor(() => {
        expect(port.postMessage).toHaveBeenCalledWith({
          type: 'chat/progress',
          requestId: 'req-tool-collection',
          stage: 'tool-collection',
        });
      });
      await vi.advanceTimersByTimeAsync(10_000);
      /** 读取当前端口已收到的 tool collection progress 事件。 */
      const progressMessages = () => port.postMessage.mock.calls
        .map(([message]) => message)
        .filter((message) => (message as { type?: unknown; stage?: unknown }).type === 'chat/progress'
          && (message as { stage?: unknown }).stage === 'tool-collection');
      expect(progressMessages()).toHaveLength(2);

      resolveTools(undefined);
      await vi.waitFor(() => {
        expect(streamChatV1Mock).toHaveBeenCalledWith(expect.objectContaining({
          requestId: 'req-tool-collection',
          tools: undefined,
        }));
      });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(progressMessages()).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Web Search pipeline progress 会透传到端口层，但不触发 debug raw 输出', async () => {
    collectChatToolsMock.mockResolvedValueOnce(undefined);
    maybeOrchestrateExternalWebSearchMock.mockImplementationOnce(async ({ emitProgress }) => {
      emitProgress({ type: 'chat/progress', stage: 'web-search-planning' });
      return {};
    });
    const port = makePort();
    const handlers = createPortChatHandlerMap(makeContext());

    handlers['chat/stream-v1']?.(port, {
      type: 'chat/stream-v1',
      requestId: 'req-web-progress',
      payload: {
        model: 'provider/model',
        messages: [{ role: 'user', content: 'latest search topic' }],
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 256,
        topicKind: 'topic',
        webSearchProviderId: 'mock-search',
        webSearchSettings: { providerId: 'mock-search', maxResults: 5 },
        mcpSelection: { mode: 'disabled', manualServerIds: [] },
      },
    });

    await vi.waitFor(() => {
      expect(port.postMessage).toHaveBeenCalledWith({
        type: 'chat/progress',
        requestId: 'req-web-progress',
        stage: 'web-search-planning',
      });
    });
    expect(port.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'chat/debug' }));
    expect(streamChatV1Mock).toHaveBeenCalled();
  });

  it('returns a task error and clears active state when a media runtime loader fails', async () => {
    loadImageRuntimeMock.mockRejectedValueOnce(new I18nError('errors.imageGenerationFailed'));
    const port = makePort();
    const context = makeContext();
    const handlers = createPortChatHandlerMap(context);

    handlers['image/generate']?.(port, {
      type: 'image/generate',
      requestId: 'req-image-loader-fail',
      payload: {
        model: 'provider/image-model',
        prompt: 'a quiet workspace',
      },
    });

    await vi.waitFor(() => {
      expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'image/error',
        requestId: 'req-image-loader-fail',
        error: expect.objectContaining({ key: 'errors.imageGenerationFailed' }),
      }));
    });
    expect(context.activeImages.has('req-image-loader-fail')).toBe(false);
  });
});
