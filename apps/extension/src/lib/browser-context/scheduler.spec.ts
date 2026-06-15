/**
 * 说明：`scheduler.spec` 浏览器上下文调度测试模块。
 *
 * 职责：
 * - 验证 browser-context 预热任务的取消、外部 abort 与早期异常都会回收 collecting 状态；
 * - 守住刷新按钮不会因为 collector 入口前失败或任务取消而长期旋转。
 *
 * 边界：
 * - 本文件只覆盖调度器生命周期 owner；
 * - 采集内容、source manifest 和 prompt 渲染仍由 collectors 相关测试覆盖。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/types/assistant';
import type { Topic } from '@/types/chat';
import type { BrowserContextProfile } from './types';

const mocks = vi.hoisted(() => ({
  assistants: [] as Assistant[],
  buildBrowserContextPromptMock: vi.fn(),
  settingsEnabled: true,
  conversationEnabled: true,
  collectingValues: [] as boolean[],
  lastCollection: undefined as unknown,
  status: 'unavailable',
  sourceManifest: null as null | ReturnType<typeof import('./types').createEmptyBrowserContextSourceManifest>,
  metadataToStaleLatencies: [] as number[],
  profile: {
    id: 'minimal-page',
    title: 'Minimal Page',
    description: '内容优先',
    sources: ['tab-meta', 'readable-dom'],
    outputFormat: 'markdown',
    maxPromptChars: 6000,
    cacheTtlMs: 60_000,
  } as BrowserContextProfile,
}));

vi.mock('@/hooks/useAssistantStore', () => ({
  useAssistantStore: {
    getState: () => ({ assistants: mocks.assistants }),
  },
}));

vi.mock('./collectors', () => ({
  buildBrowserContextPrompt: mocks.buildBrowserContextPromptMock,
}));

vi.mock('./settings', () => ({
  getBrowserContextSettings: () => ({
    enabled: mocks.settingsEnabled,
    fullPagePromptChars: 24_000,
  }),
  isBrowserContextEnabled: () => mocks.settingsEnabled,
  setBrowserContextEnabled: vi.fn(),
}));

vi.mock('./conversation-mode', () => ({
  getBrowserContextConversationMode: () => ({
    enabled: mocks.conversationEnabled,
    fullPageEnabled: false,
    styleSignalsEnabled: false,
  }),
}));

vi.mock('./policy', () => ({
  resolveBrowserContextPolicyForAssistant: () => ({
    source: 'default',
    profile: { ...mocks.profile, sources: [...mocks.profile.sources] },
  }),
}));

vi.mock('./metrics', () => ({
  recordBrowserContextMetadataToStaleLatency: (value: number) => {
    mocks.metadataToStaleLatencies.push(value);
  },
}));

vi.mock('./runtime', async () => {
  const types = await vi.importActual<typeof import('./types')>('./types');
  return {
    getBrowserContextSourceManifest: () => mocks.sourceManifest ?? types.createEmptyBrowserContextSourceManifest(),
    setBrowserContextLastCollection: (value: unknown) => {
      mocks.lastCollection = value;
    },
    setBrowserContextCollecting: (value: boolean) => {
      mocks.collectingValues.push(value);
    },
    setBrowserContextSourceManifest: (value: ReturnType<typeof types.createEmptyBrowserContextSourceManifest>) => {
      mocks.sourceManifest = value;
    },
    setBrowserContextStatus: (value: string) => {
      mocks.status = value;
    },
  };
});

/**
 * 构造最小可用话题。
 *
 * @param overrides - 局部覆盖字段。
 * @returns 话题 fixture。
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
 * 构造最小可用助手。
 *
 * @param overrides - 局部覆盖字段。
 * @returns 助手 fixture。
 */
function makeAssistant(overrides?: Partial<Assistant>): Assistant {
  const { topics = [makeTopic()], ...rest } = overrides ?? {};
  return {
    id: 'assistant-a',
    scenario: 'browser',
    name: '助手 A',
    prompt: 'assistant prompt',
    topics,
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...rest,
  };
}

/**
 * 等待当前 promise microtask 队列完成。
 *
 * @returns 空 promise。
 */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('browser-context scheduler', () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.assistants = [makeAssistant()];
    mocks.buildBrowserContextPromptMock.mockReset();
    mocks.settingsEnabled = true;
    mocks.conversationEnabled = true;
    mocks.collectingValues = [];
    mocks.lastCollection = undefined;
    mocks.status = 'unavailable';
    mocks.sourceManifest = null;
    mocks.metadataToStaleLatencies = [];
  });

  it('启动新预热任务时会取消旧任务并回收 collecting 状态', async () => {
    const first = new Promise(() => {});
    mocks.buildBrowserContextPromptMock
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({});
    const scheduler = await import('./scheduler');

    scheduler.scheduleBrowserContextWork({ reason: 'panel-visible', conversationKey: 'topic-a' });
    scheduler.scheduleBrowserContextWork({ reason: 'input-intent', conversationKey: 'topic-a' });
    await flushMicrotasks();

    expect(mocks.buildBrowserContextPromptMock).toHaveBeenCalledTimes(2);
    expect(mocks.buildBrowserContextPromptMock.mock.calls[0]?.[0]?.signal.aborted).toBe(true);
    expect(mocks.collectingValues).toContain(false);
    expect(mocks.collectingValues.at(-1)).toBe(false);
  });

  it('外部 abort 发生在 collector 入口前也会回收 collecting 状态', async () => {
    mocks.buildBrowserContextPromptMock.mockReturnValue(new Promise(() => {}));
    const scheduler = await import('./scheduler');
    const controller = new AbortController();

    scheduler.scheduleBrowserContextWork({
      reason: 'manual-refresh',
      conversationKey: 'topic-a',
      abortSignal: controller.signal,
    });
    controller.abort();
    await flushMicrotasks();

    expect(mocks.buildBrowserContextPromptMock).toHaveBeenCalledTimes(1);
    expect(mocks.buildBrowserContextPromptMock.mock.calls[0]?.[0]?.signal.aborted).toBe(true);
    expect(mocks.collectingValues.at(-1)).toBe(false);
  });

  it('collector 早期异常时会标记 degraded 并回收 collecting 状态', async () => {
    mocks.buildBrowserContextPromptMock.mockRejectedValue(new Error('resolve page failed'));
    const scheduler = await import('./scheduler');

    scheduler.scheduleBrowserContextWork({ reason: 'manual-refresh', conversationKey: 'topic-a' });
    await flushMicrotasks();

    expect(mocks.status).toBe('degraded');
    expect(mocks.collectingValues.at(-1)).toBe(false);
  });

  it('预热任务永不返回时会在总超时后 abort 并回收 collecting 状态', async () => {
    vi.useFakeTimers();
    try {
      mocks.buildBrowserContextPromptMock.mockReturnValue(new Promise(() => {}));
      const scheduler = await import('./scheduler');

      scheduler.scheduleBrowserContextWork({ reason: 'panel-visible', conversationKey: 'topic-a' });
      await flushMicrotasks();

      const signal = mocks.buildBrowserContextPromptMock.mock.calls[0]?.[0]?.signal as AbortSignal;
      expect(signal.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(6_000);
      await flushMicrotasks();

      expect(signal.aborted).toBe(true);
      expect(mocks.status).toBe('degraded');
      expect(mocks.collectingValues.at(-1)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('metadata-follow 会取消仍在进行的预热任务并回收 collecting 状态', async () => {
    mocks.buildBrowserContextPromptMock.mockReturnValue(new Promise(() => {}));
    const scheduler = await import('./scheduler');

    scheduler.scheduleBrowserContextWork({ reason: 'panel-visible', conversationKey: 'topic-a' });
    scheduler.scheduleBrowserContextWork({ reason: 'metadata-follow', conversationKey: 'topic-a' });
    await flushMicrotasks();

    expect(mocks.buildBrowserContextPromptMock.mock.calls[0]?.[0]?.signal.aborted).toBe(true);
    expect(mocks.status).toBe('stale');
    expect(mocks.lastCollection).toBeNull();
    expect(mocks.collectingValues.at(-1)).toBe(false);
  });

  it('会话关闭后再次调度会取消旧任务并回收 collecting 状态', async () => {
    mocks.buildBrowserContextPromptMock.mockReturnValue(new Promise(() => {}));
    const scheduler = await import('./scheduler');

    scheduler.scheduleBrowserContextWork({ reason: 'panel-visible', conversationKey: 'topic-a' });
    scheduler.scheduleBrowserContextWork({ reason: 'panel-visible', conversationKey: '' });
    await flushMicrotasks();

    expect(mocks.buildBrowserContextPromptMock.mock.calls[0]?.[0]?.signal.aborted).toBe(true);
    expect(mocks.collectingValues.at(-1)).toBe(false);
  });

  it('自动上下文失效时会取消旧任务并回收 collecting 状态', async () => {
    mocks.buildBrowserContextPromptMock.mockReturnValue(new Promise(() => {}));
    const scheduler = await import('./scheduler');

    scheduler.scheduleBrowserContextWork({ reason: 'panel-visible', conversationKey: 'topic-a' });
    mocks.conversationEnabled = false;
    scheduler.scheduleBrowserContextWork({ reason: 'input-intent', conversationKey: 'topic-a' });
    await flushMicrotasks();

    expect(mocks.buildBrowserContextPromptMock).toHaveBeenCalledTimes(1);
    expect(mocks.buildBrowserContextPromptMock.mock.calls[0]?.[0]?.signal.aborted).toBe(true);
    expect(mocks.status).toBe('unavailable');
    expect(mocks.lastCollection).toBeNull();
    expect(mocks.collectingValues.at(-1)).toBe(false);
  });
});
