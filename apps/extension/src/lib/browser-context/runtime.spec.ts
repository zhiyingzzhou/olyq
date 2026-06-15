/**
 * 说明：`runtime.spec` 浏览器上下文运行时测试。
 *
 * 职责：
 * - 验证 runtime 视图状态会从 topic 持久化字段读取会话模式；
 * - 验证 topic 未显式写值时，会按 assistant `scenario` 走默认模式；
 * - 守住“conversation mode 不再依赖 runtime-only Map”的新真源契约。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAssistantStore } from '@/hooks/useAssistantStore';
import type { Assistant } from '@/types/assistant';
import type { Topic } from '@/types/chat';

vi.mock('./settings', () => ({
  getBrowserContextSettings: () => ({
    enabled: true,
    fullPagePromptChars: 18_000,
  }),
  isBrowserContextEnabled: () => true,
  setBrowserContextEnabled: vi.fn(),
}));

/**
 * 测试辅助函数：`makeTopic`。
 *
 * @remarks
 * 用于构造最小可用 topic，验证浏览器上下文模式的 topic 真源解析。
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
 * 用于构造最小可用 assistant，验证 browser/general 场景默认值与 topic 显式值的优先级。
 */
function makeAssistant(overrides?: Partial<Assistant>): Assistant {
  const { scenario = 'general', topics = [makeTopic()], ...rest } = overrides ?? {};
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

describe('browser-context runtime conversation mode', () => {
  afterEach(async () => {
    const runtime = await import('./runtime');
    runtime.setBrowserContextActiveConversationKey(null);
    runtime.resetBrowserContextRuntime();
    useAssistantStore.setState({
      presets: [],
      assistants: [],
    });
  });

  it('topic 未显式写值时，会按 browser assistant 默认开启自动上下文，但不会默认开启全文模式', async () => {
    const runtime = await import('./runtime');
    useAssistantStore.setState({
      presets: [],
      assistants: [
        makeAssistant({
          id: 'assistant-browser',
          scenario: 'browser',
          topics: [
            makeTopic({
              id: 'topic-a',
              assistantId: 'assistant-browser',
            }),
          ],
        }),
      ],
    });
    runtime.setBrowserContextActiveConversationKey('topic-a');

    expect(runtime.getBrowserContextViewState().conversationMode.enabled).toBe(true);
    expect(runtime.getBrowserContextViewState().conversationMode.fullPageEnabled).toBe(false);
    expect(runtime.getBrowserContextViewState().conversationMode.styleSignalsEnabled).toBe(false);
  });

  it('topic 未显式写值时，会按 general assistant 默认关闭自动上下文', async () => {
    const runtime = await import('./runtime');
    useAssistantStore.setState({
      presets: [],
      assistants: [
        makeAssistant({
          id: 'assistant-general',
          scenario: 'general',
          topics: [
            makeTopic({
              id: 'topic-general',
              assistantId: 'assistant-general',
            }),
          ],
        }),
      ],
    });
    runtime.setBrowserContextActiveConversationKey('topic-general');

    expect(runtime.getBrowserContextViewState().conversationMode.enabled).toBe(false);
    expect(runtime.getBrowserContextViewState().conversationMode.fullPageEnabled).toBe(false);
    expect(runtime.getBrowserContextViewState().conversationMode.styleSignalsEnabled).toBe(false);
  });

  it('topic 显式 browserContextMode 时，会覆盖 assistant 场景默认值', async () => {
    const runtime = await import('./runtime');
    useAssistantStore.setState({
      presets: [],
      assistants: [
        makeAssistant({
          id: 'assistant-browser',
          scenario: 'browser',
          topics: [
            makeTopic({
              id: 'topic-b',
              assistantId: 'assistant-browser',
              browserContextMode: {
                enabled: false,
                fullPageEnabled: false,
                styleSignalsEnabled: true,
              },
            }),
          ],
        }),
      ],
    });
    runtime.setBrowserContextActiveConversationKey('topic-b');

    expect(runtime.getBrowserContextViewState().conversationMode.enabled).toBe(false);
    expect(runtime.getBrowserContextViewState().conversationMode.fullPageEnabled).toBe(false);
    expect(runtime.getBrowserContextViewState().conversationMode.styleSignalsEnabled).toBe(true);
  });

  it('旧 topic 缺失 enabled 时，会按 assistant scenario 回填默认值，而不是一律开启', async () => {
    const runtime = await import('./runtime');
    useAssistantStore.setState({
      presets: [],
      assistants: [
        makeAssistant({
          id: 'assistant-browser',
          scenario: 'browser',
          topics: [
            makeTopic({
              id: 'topic-legacy',
              assistantId: 'assistant-browser',
              browserContextMode: {
                fullPageEnabled: false,
                styleSignalsEnabled: true,
              } as Topic['browserContextMode'],
            }),
          ],
        }),
      ],
    });
    runtime.setBrowserContextActiveConversationKey('topic-legacy');

    expect(runtime.getBrowserContextViewState().conversationMode.enabled).toBe(true);
    expect(runtime.getBrowserContextViewState().conversationMode.fullPageEnabled).toBe(false);
    expect(runtime.getBrowserContextViewState().conversationMode.styleSignalsEnabled).toBe(true);
  });

  it('切换活跃会话时，会清空上一会话的正文预览，避免旧页摘要残留', async () => {
    const runtime = await import('./runtime');
    useAssistantStore.setState({
      presets: [],
      assistants: [
        makeAssistant({
          id: 'assistant-browser',
          scenario: 'browser',
          topics: [
            makeTopic({
              id: 'topic-a',
              assistantId: 'assistant-browser',
            }),
            makeTopic({
              id: 'topic-b',
              assistantId: 'assistant-browser',
            }),
          ],
        }),
      ],
    });
    runtime.setBrowserContextActiveConversationKey('topic-a');
    runtime.setBrowserContextLastCollection({
      status: 'success',
      captureMode: 'article',
      sources: ['tab-meta', 'readable-dom'],
      issues: [],
      bodyAvailable: true,
      snippet: '旧会话摘要',
      headings: [],
      bodyChars: 1200,
      promptChars: 900,
      collectedAt: 1,
      promptTruncated: false,
    });

    runtime.setBrowserContextActiveConversationKey('topic-b');

    expect(runtime.getBrowserContextLastCollection()).toBeNull();
  });
});
