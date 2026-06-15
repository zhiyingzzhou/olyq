/**
 * 说明：`openWorkspaceInNewTab.spec` 页面动作测试模块。
 *
 * 职责：
 * - 验证独立 sidepanel 页打开前会先写入当前工作区启动快照；
 * - 守住 assistants / runtime / 消息待写队列 / tabs.create 的时序 contract。
 *
 * 边界：
 * - 本文件只 mock 页面动作依赖，不覆盖真实浏览器 tabs API。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  assistantsFixture,
  flushChatStorePendingWritesMock,
  openSidepanelPageInNewTabMock,
  writeWorkspaceStartupStateMock,
} = vi.hoisted(() => ({
  assistantsFixture: [
    {
      id: 'assistant-1',
      scenario: 'general',
      name: '写作助手',
      prompt: '',
      topics: [
        {
          id: 'topic-current',
          assistantId: 'assistant-1',
          name: '当前话题',
          createdAt: 1,
          updatedAt: 1,
          pinned: false,
          order: 1,
          isNameManuallyEdited: false,
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  flushChatStorePendingWritesMock: vi.fn(async () => undefined),
  openSidepanelPageInNewTabMock: vi.fn(async () => ({ id: 42 } as chrome.tabs.Tab)),
  writeWorkspaceStartupStateMock: vi.fn(async () => undefined),
}));

vi.mock('@/hooks/useAssistantStore', () => ({
  useAssistantStore: {
    getState: () => ({
      assistants: assistantsFixture,
    }),
  },
}));

vi.mock('@/hooks/useChatStore', () => ({
  flushChatStorePendingWrites: flushChatStorePendingWritesMock,
  useChatStore: {
    getState: () => ({
      runtime: {
        activeAssistantId: 'assistant-1',
        activeTopicId: 'topic-stale',
      },
      activeConversationKey: 'topic-current',
    }),
  },
}));

vi.mock('@/lib/extension/ui-actions', () => ({
  openSidepanelPageInNewTab: openSidepanelPageInNewTabMock,
}));

vi.mock('@/lib/chat/workspace-startup-state', () => {
  return {
    writeWorkspaceStartupState: writeWorkspaceStartupStateMock,
  };
});

import { openCurrentWorkspaceInNewTab } from './openWorkspaceInNewTab';

/**
 * 创建由测试主动释放的 Promise。
 *
 * @remarks
 * 用于验证打开新标签页前必须等待消息 flush 完成，而不是只验证调用顺序。
 */
function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe('openCurrentWorkspaceInNewTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flushChatStorePendingWritesMock.mockResolvedValue(undefined);
    openSidepanelPageInNewTabMock.mockResolvedValue({ id: 42 } as chrome.tabs.Tab);
    writeWorkspaceStartupStateMock.mockResolvedValue(undefined);
  });

  it('打开新标签页前会先写入当前 assistants、runtime 并等待消息 flush', async () => {
    const tab = await openCurrentWorkspaceInNewTab();

    expect(tab).toEqual({ id: 42 });
    expect(writeWorkspaceStartupStateMock).toHaveBeenCalledWith(assistantsFixture, {
      activeAssistantId: 'assistant-1',
      activeTopicId: 'topic-current',
    });
    expect(flushChatStorePendingWritesMock).toHaveBeenCalledTimes(1);
    expect(openSidepanelPageInNewTabMock).toHaveBeenCalledTimes(1);

    const startupWriteOrder = writeWorkspaceStartupStateMock.mock.invocationCallOrder[0] ?? 0;
    const flushOrder = flushChatStorePendingWritesMock.mock.invocationCallOrder[0] ?? 0;
    const openOrder = openSidepanelPageInNewTabMock.mock.invocationCallOrder[0] ?? 0;
    expect(startupWriteOrder).toBeGreaterThan(0);
    expect(flushOrder).toBeGreaterThan(startupWriteOrder);
    expect(openOrder).toBeGreaterThan(flushOrder);
  });

  it('等待消息 flush 完成后才执行标签页打开 primitive', async () => {
    const flushGate = createDeferred<undefined>();
    flushChatStorePendingWritesMock.mockReturnValueOnce(flushGate.promise);

    const pending = openCurrentWorkspaceInNewTab();

    await Promise.resolve();
    await Promise.resolve();

    expect(writeWorkspaceStartupStateMock).toHaveBeenCalledTimes(1);
    expect(flushChatStorePendingWritesMock).toHaveBeenCalledTimes(1);
    expect(openSidepanelPageInNewTabMock).not.toHaveBeenCalled();

    flushGate.resolve(undefined);
    const tab = await pending;

    expect(tab).toEqual({ id: 42 });
    expect(openSidepanelPageInNewTabMock).toHaveBeenCalledTimes(1);
  });
});
