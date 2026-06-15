/**
 * 说明：`useChatStore.remediation.spec` Hook 模块。
 *
 * 职责：
 * - 承载 `useChatStore.remediation.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  builtinTemplate,
  clearMessagesDbMock,
  deleteAttachmentsMock,
  deleteTopicMessagesMock,
  ensureTopicRowMock,
  getTopicMessagesMock,
  listAllTopicMessagesMock,
  loadAssistantPresetsMock,
  putTopicMessagesMock,
} = vi.hoisted(() => ({
  builtinTemplate: {
    id: '__builtin_default_role__',
    name: '默认助手',
    prompt: 'builtin prompt',
    iconId: 'bot' as const,
  },
  clearMessagesDbMock: vi.fn(async () => undefined),
  deleteAttachmentsMock: vi.fn(async () => undefined),
  deleteTopicMessagesMock: vi.fn(async () => undefined),
  ensureTopicRowMock: vi.fn(async () => undefined),
  getTopicMessagesMock: vi.fn(async () => []),
  listAllTopicMessagesMock: vi.fn(async () => []),
  loadAssistantPresetsMock: vi.fn(),
  putTopicMessagesMock: vi.fn(async () => undefined),
}));

vi.mock('@/lib/attachments', () => ({
  deleteAttachments: deleteAttachmentsMock,
}));

vi.mock('@/lib/chat/messages-db', () => ({
  clearMessagesDb: clearMessagesDbMock,
  deleteTopicMessages: deleteTopicMessagesMock,
  ensureTopicRow: ensureTopicRowMock,
  getTopicMessages: getTopicMessagesMock,
  listAllTopicMessages: listAllTopicMessagesMock,
  putTopicMessages: putTopicMessagesMock,
}));

vi.mock('@/data/role-templates', () => ({
  buildAssistantPresetCatalogScaffold: () => ([
    { key: 'browser', title: '浏览器场景', categories: ['解读'], presets: [] },
    { key: 'general', title: '通用助手', categories: ['写作'], presets: [] },
  ]),
  buildBuiltinDefaultAssistantPreset: () => builtinTemplate,
  loadAssistantPresetCatalog: vi.fn(async () => [
    { key: 'browser', title: '浏览器场景', categories: ['解读'], presets: [] },
    { key: 'general', title: '通用助手', categories: ['写作'], presets: [] },
  ]),
  loadAssistantPresets: loadAssistantPresetsMock,
}));

vi.mock('@/lib/sync/message-mutation-recorder', () => ({
  recordDeletedMessages: vi.fn(),
  recordTopicMessagesChange: vi.fn(),
  recordTopicMessagesCleared: vi.fn(),
}));

vi.mock('@/lib/sync/sync-engine', () => ({
  recordAssistantDeletion: vi.fn(),
  recordAssistantFieldChange: vi.fn(),
  recordTopicDeletion: vi.fn(),
  recordTopicFieldChange: vi.fn(),
}));

/**
 * 测试辅助函数：`resetAssistantStoreGlobals`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function resetAssistantStoreGlobals() {
  const globalForStore = globalThis as typeof globalThis & {
    __olyqUseAssistantStoreV1__?: unknown;
    __olyqUseAssistantStoreV1Inited__?: boolean;
    __olyqUseAssistantStoreV1LangBound__?: boolean;
    __olyqUseAssistantStoreV1ReloadBound__?: boolean;
  };
  delete globalForStore.__olyqUseAssistantStoreV1__;
  delete globalForStore.__olyqUseAssistantStoreV1Inited__;
  delete globalForStore.__olyqUseAssistantStoreV1LangBound__;
  delete globalForStore.__olyqUseAssistantStoreV1ReloadBound__;
}

/**
 * 测试辅助函数：`resetChatStoreGlobals`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function resetChatStoreGlobals() {
  const globalForStore = globalThis as typeof globalThis & {
    __olyqFlushPendingWritesV4__?: unknown;
    __olyqUseChatStoreV4__?: unknown;
    __olyqUseChatStoreV4Inited__?: boolean;
    __olyqUseChatStoreV4UnloadBound__?: boolean;
    __olyqUseChatStoreV4ReloadBound__?: boolean;
  };
  delete globalForStore.__olyqFlushPendingWritesV4__;
  delete globalForStore.__olyqUseChatStoreV4__;
  delete globalForStore.__olyqUseChatStoreV4Inited__;
  delete globalForStore.__olyqUseChatStoreV4UnloadBound__;
  delete globalForStore.__olyqUseChatStoreV4ReloadBound__;
}

/**
 * 测试辅助函数：`createLegacyAssistant`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createLegacyAssistant(id: string) {
  return [{
    id,
    name: 'Legacy Assistant',
    prompt: 'legacy prompt',
    topics: [{
      id: `${id}-topic`,
      assistantId: id,
      name: 'Legacy Topic',
      pinned: false,
      createdAt: 1,
      updatedAt: 1,
      order: 1,
      isNameManuallyEdited: false,
    }],
    createdAt: 1,
    updatedAt: 1,
  }];
}

describe('useChatStore legal remediation', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAssistantStoreGlobals();
    resetChatStoreGlobals();
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.stubGlobal('chrome', undefined);
    vi.stubGlobal('indexedDB', {});
    clearMessagesDbMock.mockClear();
    deleteAttachmentsMock.mockClear();
    deleteTopicMessagesMock.mockClear();
    ensureTopicRowMock.mockClear();
    getTopicMessagesMock.mockReset();
    getTopicMessagesMock.mockResolvedValue([]);
    listAllTopicMessagesMock.mockReset();
    listAllTopicMessagesMock.mockResolvedValue([]);
    loadAssistantPresetsMock.mockReset();
    loadAssistantPresetsMock.mockResolvedValue([builtinTemplate]);
    putTopicMessagesMock.mockReset();
    putTopicMessagesMock.mockResolvedValue(undefined);
  });

  it('整改流程会清空旧聊天运行态和消息库，并可写入新的默认话题', async () => {
    localStorage.setItem('olyq.assistants.v1', JSON.stringify(createLegacyAssistant('legacy-assistant')));
    localStorage.setItem('olyq.chat.runtime.v1', JSON.stringify({
      activeAssistantId: 'legacy-assistant',
      activeTopicId: 'legacy-assistant-topic',
    }));

    await import('./useAssistantStore');
    const { flushChatStorePendingWrites, useChatStore } = await import('./useChatStore');

    await waitFor(() => {
      expect(clearMessagesDbMock).toHaveBeenCalledTimes(1);
      expect(useChatStore.getState().activeConversationKey).toBeTruthy();
      expect(JSON.parse(localStorage.getItem('olyq.legal.preset-remediation.v1') || 'null')).toMatchObject({
        presetSet: 'olyq-browser-v1',
      });
    });

    const activeTopicId = useChatStore.getState().activeConversationKey;
    expect(activeTopicId).toBeTruthy();
    expect(activeTopicId).not.toBe('legacy-assistant-topic');

    const nextMessages = [{
      id: 'message-1',
      role: 'user',
      content: 'hello',
      attachments: [],
    }];
    useChatStore.getState().setMessagesForActiveConversation(nextMessages as never[]);
    await flushChatStorePendingWrites();

    expect(putTopicMessagesMock).toHaveBeenCalledWith(activeTopicId, nextMessages);
    expect(localStorage.getItem('olyq.chat.runtime.v1') ?? '').not.toContain('legacy-assistant-topic');
  });
});
