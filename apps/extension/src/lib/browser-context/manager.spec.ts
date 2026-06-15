/**
 * 说明：`manager.spec` 浏览器上下文 bridge 编排测试。
 *
 * 职责：
 * - 验证 SW 推送 metadata 后，当前活跃会话会按真实生效态自动重建自动上下文；
 * - 验证同页重复 metadata 与关闭态不会误触发正文采集；
 * - 守住“tab 切换后自动上下文必须跟着当前页走”的 bridge 契约。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAssistantStore } from '@/hooks/useAssistantStore';
import type { Assistant } from '@/types/assistant';
import type { Topic } from '@/types/chat';

const mocks = vi.hoisted(() => ({
  invalidateBrowserContextPromptCacheForTabMock: vi.fn(),
  invalidateBrowserContextSourceCacheMock: vi.fn(),
  upsertTechnologyStackSourceCacheFromRuntimeUpdateMock: vi.fn(),
  scheduleBrowserContextWorkMock: vi.fn(),
  postUiPortMessageMock: vi.fn(),
  uiPortListener: null as null | ((msg: { type: string; payload?: unknown }) => void),
  settingsEnabled: true,
  policySource: 'default' as 'default' | 'assistant-disabled',
  policySources: ['tab-meta', 'readable-dom'] as string[],
}));

vi.mock('@/extension/bridge/ui-port', () => ({
  onUiPortMessage: (listener: (msg: { type: string; payload?: unknown }) => void) => {
    mocks.uiPortListener = listener;
    return () => {
      if (mocks.uiPortListener === listener) mocks.uiPortListener = null;
    };
  },
  postUiPortMessage: mocks.postUiPortMessageMock,
}));

vi.mock('./collectors', () => ({
  invalidateBrowserContextPromptCacheForTab: mocks.invalidateBrowserContextPromptCacheForTabMock,
  invalidateBrowserContextSourceCache: mocks.invalidateBrowserContextSourceCacheMock,
  upsertTechnologyStackSourceCacheFromRuntimeUpdate: mocks.upsertTechnologyStackSourceCacheFromRuntimeUpdateMock,
}));

vi.mock('./scheduler', () => ({
  scheduleBrowserContextWork: mocks.scheduleBrowserContextWorkMock,
}));

vi.mock('./settings', () => ({
  getBrowserContextSettings: () => ({
    enabled: mocks.settingsEnabled,
    fullPagePromptChars: 24_000,
  }),
  isBrowserContextEnabled: () => mocks.settingsEnabled,
  setBrowserContextEnabled: vi.fn(),
}));

vi.mock('./policy', () => ({
  resolveBrowserContextPolicyForAssistant: () => ({
    source: mocks.policySource,
    profile: {
      id: 'minimal-page',
      title: 'Minimal Page',
      description: '内容优先',
      sources: mocks.policySources,
      outputFormat: 'markdown',
      maxPromptChars: 6000,
      cacheTtlMs: 60_000,
    },
  }),
}));

/**
 * 测试辅助函数：`makeTopic`。
 *
 * @remarks
 * 用于构造最小可用 topic，验证 manager 在不同会话模式下的自动重建边界。
 */
function makeTopic(overrides?: Partial<Topic>): Topic {
  return {
    id: 'topic-a',
    assistantId: 'assistant-a',
    name: '话题 A',
    pinned: false,
    createdAt: 1,
    updatedAt: 1,
    order: 1,
    isNameManuallyEdited: false,
    ...overrides,
  };
}

/**
 * 测试辅助函数：`makeAssistant`。
 *
 * @remarks
 * 用于构造最小可用 assistant，验证 manager 自动重建会基于当前活跃会话正确解析助手场景与配置。
 */
function makeAssistant(overrides?: Partial<Assistant>): Assistant {
  const { scenario = 'browser', topics = [makeTopic()], ...rest } = overrides ?? {};
  return {
    id: 'assistant-a',
    scenario,
    name: '助手 A',
    prompt: 'assistant prompt',
    topics,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...rest,
  };
}

describe('browser-context manager', () => {
  beforeEach(async () => {
    mocks.invalidateBrowserContextPromptCacheForTabMock.mockReset();
    mocks.invalidateBrowserContextSourceCacheMock.mockReset();
    mocks.upsertTechnologyStackSourceCacheFromRuntimeUpdateMock.mockReset();
    mocks.scheduleBrowserContextWorkMock.mockReset();
    mocks.postUiPortMessageMock.mockReset();
    mocks.uiPortListener = null;
    mocks.settingsEnabled = true;
    mocks.policySource = 'default';
    mocks.policySources = ['tab-meta', 'readable-dom'];

    const runtime = await import('./runtime');
    const manager = await import('./manager');
    manager.disposeBrowserContextListener();
    runtime.setBrowserContextActiveConversationKey(null);
    runtime.resetBrowserContextRuntime();

    useAssistantStore.setState({
      presets: [],
      assistants: [
        makeAssistant({
          id: 'assistant-a',
          scenario: 'browser',
          topics: [
            makeTopic({
              id: 'topic-a',
              assistantId: 'assistant-a',
            }),
          ],
        }),
      ],
    });
  });

  afterEach(async () => {
    const runtime = await import('./runtime');
    const manager = await import('./manager');
    manager.disposeBrowserContextListener();
    runtime.setBrowserContextActiveConversationKey(null);
    runtime.resetBrowserContextRuntime();
    useAssistantStore.setState({
      presets: [],
      assistants: [],
    });
  });

  it('收到新页面 metadata 后，会为当前活跃会话自动重建自动上下文', async () => {
    const runtime = await import('./runtime');
    const manager = await import('./manager');
    runtime.setBrowserContextActiveConversationKey('topic-a');
    manager.initBrowserContextListener();

    expect(mocks.postUiPortMessageMock).toHaveBeenCalledWith({ type: 'browser-context/metadata/request' });

    mocks.uiPortListener?.({
      type: 'browser-context/metadata/update',
      payload: {
        title: 'Docs',
        url: 'https://example.com/docs',
        favicon: 'https://example.com/favicon.ico',
        tabId: 7,
        extractedAt: 1,
      },
    });
    await Promise.resolve();

    expect(runtime.getBrowserContextMetadata()?.url).toBe('https://example.com/docs');
    expect(mocks.scheduleBrowserContextWorkMock).toHaveBeenCalledWith({
      reason: 'metadata-follow',
      conversationKey: 'topic-a',
    });
  });

  it('自动上下文关闭时，即使收到 metadata 也不会误触发重建', async () => {
    const runtime = await import('./runtime');
    const manager = await import('./manager');
    useAssistantStore.setState({
      presets: [],
      assistants: [
        makeAssistant({
          id: 'assistant-a',
          scenario: 'browser',
          topics: [
            makeTopic({
              id: 'topic-disabled',
              assistantId: 'assistant-a',
              browserContextMode: {
                enabled: false,
                fullPageEnabled: true,
                styleSignalsEnabled: false,
              },
            }),
          ],
        }),
      ],
    });
    runtime.setBrowserContextActiveConversationKey('topic-disabled');
    manager.initBrowserContextListener();

    mocks.uiPortListener?.({
      type: 'browser-context/metadata/update',
      payload: {
        title: 'Docs',
        url: 'https://example.com/docs',
        favicon: '',
        tabId: 7,
        extractedAt: 1,
      },
    });
    await Promise.resolve();

    expect(mocks.scheduleBrowserContextWorkMock).not.toHaveBeenCalled();
  });

  it('assistant 显式禁用 browser-context 时，不会自动重建', async () => {
    const runtime = await import('./runtime');
    const manager = await import('./manager');
    mocks.policySource = 'assistant-disabled';
    runtime.setBrowserContextActiveConversationKey('topic-a');
    manager.initBrowserContextListener();

    mocks.uiPortListener?.({
      type: 'browser-context/metadata/update',
      payload: {
        title: 'Docs',
        url: 'https://example.com/docs',
        favicon: '',
        tabId: 7,
        extractedAt: 1,
      },
    });
    await Promise.resolve();

    expect(mocks.scheduleBrowserContextWorkMock).not.toHaveBeenCalled();
  });

  it('同页 metadata 重复推送且已有预览时，不会重复触发重建', async () => {
    const runtime = await import('./runtime');
    const manager = await import('./manager');
    runtime.setBrowserContextActiveConversationKey('topic-a');
    runtime.setBrowserContextMetadata({
      title: 'Docs',
      url: 'https://example.com/docs',
      favicon: '',
      tabId: 7,
      extractedAt: 1,
    });
    runtime.setBrowserContextLastCollection({
      status: 'success',
      captureMode: 'article',
      sources: ['tab-meta', 'readable-dom'],
      issues: [],
      bodyAvailable: true,
      snippet: '已有预览',
      headings: [],
      bodyChars: 1200,
      promptChars: 900,
      collectedAt: 1,
      promptTruncated: false,
    });
    manager.initBrowserContextListener();

    mocks.uiPortListener?.({
      type: 'browser-context/metadata/update',
      payload: {
        title: 'Docs',
        url: 'https://example.com/docs',
        favicon: '',
        tabId: 7,
        extractedAt: 2,
      },
    });
    await Promise.resolve();

    expect(mocks.scheduleBrowserContextWorkMock).not.toHaveBeenCalled();
  });

  it('同 URL 但 technologyStackPageKey 变化时只失效技术栈 source cache', async () => {
    const runtime = await import('./runtime');
    const manager = await import('./manager');
    runtime.setBrowserContextActiveConversationKey('topic-a');
    runtime.setBrowserContextMetadata({
      title: 'Docs',
      url: 'https://example.com/docs',
      favicon: '',
      tabId: 7,
      extractedAt: 1,
      technologyStackPageKey: '7::https://example.com/docs::0',
    });
    manager.initBrowserContextListener();

    mocks.uiPortListener?.({
      type: 'browser-context/metadata/update',
      payload: {
        title: 'Docs',
        url: 'https://example.com/docs',
        favicon: '',
        tabId: 7,
        extractedAt: 2,
        technologyStackPageKey: '7::https://example.com/docs::1',
      },
    });
    await Promise.resolve();

    expect(mocks.invalidateBrowserContextPromptCacheForTabMock).not.toHaveBeenCalled();
    expect(mocks.invalidateBrowserContextSourceCacheMock).toHaveBeenCalledWith({
      sourceId: 'technology-stack',
      identity: '7::https://example.com/docs::0',
      tabId: 7,
      url: 'https://example.com/docs',
    });
    expect(mocks.scheduleBrowserContextWorkMock).not.toHaveBeenCalled();
  });

  it('当前 pageKey 的技术栈 runtime update 会刷新 technology-stack source cache', async () => {
    const runtime = await import('./runtime');
    const manager = await import('./manager');
    mocks.policySources = ['tab-meta', 'technology-stack'];
    runtime.setBrowserContextActiveConversationKey('topic-a');
    runtime.setBrowserContextMetadata({
      title: 'Docs',
      url: 'https://example.com/docs',
      favicon: '',
      tabId: 7,
      extractedAt: 1,
      technologyStackPageKey: '7::https://example.com/docs::0',
    });
    manager.initBrowserContextListener();

    mocks.uiPortListener?.({
      type: 'technology-stack/result-updated',
      payload: {
        pageKey: '7::https://example.com/docs::0',
        enhanced: true,
        result: {
          status: 'ready',
          tabId: 7,
          url: 'https://example.com/docs',
          title: 'Docs',
          pageFingerprint: 'fingerprint-docs-v1',
          detectedAt: 10,
          technologies: [],
        },
      },
    });

    expect(mocks.upsertTechnologyStackSourceCacheFromRuntimeUpdateMock).toHaveBeenCalledWith({
      pageKey: '7::https://example.com/docs::0',
      enhanced: true,
      cacheTtlMs: 60_000,
      result: expect.objectContaining({
        tabId: 7,
        url: 'https://example.com/docs',
      }),
    });
  });

  it('旧 pageKey 的技术栈 runtime update 不会写入 source cache', async () => {
    const runtime = await import('./runtime');
    const manager = await import('./manager');
    mocks.policySources = ['tab-meta', 'technology-stack'];
    runtime.setBrowserContextActiveConversationKey('topic-a');
    runtime.setBrowserContextMetadata({
      title: 'Docs',
      url: 'https://example.com/docs',
      favicon: '',
      tabId: 7,
      extractedAt: 1,
      technologyStackPageKey: '7::https://example.com/docs::1',
    });
    manager.initBrowserContextListener();

    mocks.uiPortListener?.({
      type: 'technology-stack/result-updated',
      payload: {
        pageKey: '7::https://example.com/docs::0',
        enhanced: true,
        result: {
          status: 'ready',
          tabId: 7,
          url: 'https://example.com/docs',
          title: 'Docs',
          pageFingerprint: 'fingerprint-docs-v1',
          detectedAt: 10,
          technologies: [],
        },
      },
    });

    expect(mocks.upsertTechnologyStackSourceCacheFromRuntimeUpdateMock).not.toHaveBeenCalled();
  });
});
