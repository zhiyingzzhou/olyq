/**
 * 说明：`extension-page-startup.spec` 扩展页启动模块。
 *
 * 职责：
 * - 承载 `extension-page-startup.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现与回归验证能力；
 *
 * 边界：
 * - 本文件只验证扩展页启动快照、mirror 清理与首帧根节点属性修正，不覆盖业务 store。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getTopicMessagesMock,
  migrationMock,
  storageGetMock,
} = vi.hoisted(() => ({
  getTopicMessagesMock: vi.fn(async () => []),
  migrationMock: vi.fn(async () => undefined),
  storageGetMock: vi.fn(),
}));

vi.mock('@/lib/chat/messages-db', () => ({
  getTopicMessages: getTopicMessagesMock,
}));

vi.mock('@/lib/persistence/schema-migration-engine', () => ({
  runStartupPersistenceMigrations: migrationMock,
}));

vi.mock('@/lib/storage/storage-adapter', () => ({
  getStorageAdapter: () => ({
    get: storageGetMock,
    set: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    onChange: vi.fn(() => () => undefined),
  }),
}));

/**
 * 测试辅助函数：`writeBootstrapMirrorRaw`。
 *
 * @remarks
 * 用于当前测试中的 bootstrap mirror 场景搭建，不作为运行时代码复用。
 */
function writeBootstrapMirrorRaw(key: string, value: unknown): void {
  localStorage.setItem(`__olyq.bootstrap__.${key}`, JSON.stringify({
    schemaVersion: 1,
    expiresAt: Date.now() + 60_000,
    value,
  }));
}

describe('extension-page-startup', () => {
  beforeEach(async () => {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-glass');
    vi.resetModules();
    vi.unstubAllGlobals();
    migrationMock.mockReset();
    migrationMock.mockResolvedValue(undefined);
    getTopicMessagesMock.mockReset();
    getTopicMessagesMock.mockResolvedValue([]);
    storageGetMock.mockReset();

    const { __extensionPageStartupTestUtils } = await import('./extension-page-startup');
    __extensionPageStartupTestUtils.reset();
  });

  it('storage 不可用时只回退 bootstrap mirror，不读取旧 raw localStorage 真源', async () => {
    localStorage.setItem('olyq.theme.v1', JSON.stringify('light'));
    writeBootstrapMirrorRaw('olyq.theme.v1', 'dark');
    storageGetMock.mockRejectedValue(new Error('storage unavailable'));

    const {
      THEME_STORAGE_KEY,
      bootstrapExtensionPageStartup,
      readExtensionPageStartupValue,
    } = await import('./extension-page-startup');

    const snapshot = await bootstrapExtensionPageStartup();

    expect(snapshot.entries[THEME_STORAGE_KEY]).toEqual({ source: 'bootstrap', value: 'dark' });
    expect(readExtensionPageStartupValue(THEME_STORAGE_KEY, 'light')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('深色主题色会进入启动快照，并在首帧只通过 .dark style 应用', async () => {
    storageGetMock.mockResolvedValue({
      'olyq.theme.v1': 'dark',
      'olyq.dark-theme-color.v1': {
        kind: 'custom',
        presetId: null,
        sourceHex: '#14B8A6',
      },
    });

    const {
      DARK_THEME_COLOR_STORAGE_KEY,
      bootstrapExtensionPageStartup,
    } = await import('./extension-page-startup');
    const { DARK_THEME_COLOR_STYLE_ID } = await import('@/lib/dark-theme-colors');

    const snapshot = await bootstrapExtensionPageStartup();
    const styleElement = document.getElementById(DARK_THEME_COLOR_STYLE_ID);

    expect(snapshot.entries[DARK_THEME_COLOR_STORAGE_KEY]).toEqual({
      source: 'storage',
      value: {
        kind: 'custom',
        presetId: null,
        sourceHex: '#14B8A6',
      },
    });
    expect(styleElement?.textContent).toContain('.dark {');
    expect(styleElement?.textContent).toContain('--olyq-dark-theme-brand-start:');
    expect(styleElement?.textContent).not.toContain(':root');
  });

  it('storage 明确缺失 key 时会清理旧 mirror，而不是继续沿用脏缓存', async () => {
    writeBootstrapMirrorRaw('olyq.display-settings.v1', {
      sidebarPosition: 'right',
    });
    storageGetMock.mockResolvedValue({});

    const {
      DISPLAY_SETTINGS_STORAGE_KEY,
      bootstrapExtensionPageStartup,
    } = await import('./extension-page-startup');

    const snapshot = await bootstrapExtensionPageStartup();

    expect(snapshot.entries[DISPLAY_SETTINGS_STORAGE_KEY]).toEqual({ source: 'default' });
    expect(localStorage.getItem('__olyq.bootstrap__.olyq.display-settings.v1')).toBeNull();
    expect(document.documentElement.hasAttribute('data-glass')).toBe(false);
  });

  it('启动阶段会预解析当前激活话题并把首轮消息放进页内快照', async () => {
    vi.stubGlobal('indexedDB', {});
    getTopicMessagesMock.mockResolvedValue([{
      id: 'assistant-boot',
      askId: 'ask-boot',
      role: 'assistant',
      content: 'startup message',
      createdAt: 2,
    }] as never[]);
    storageGetMock.mockResolvedValue({
      'olyq.assistants.v1': [{
        id: 'assistant-1',
        name: '默认助手',
        prompt: 'hello',
        topics: [{
          id: 'topic-1',
          assistantId: 'assistant-1',
          name: '启动话题',
          createdAt: 1,
          updatedAt: 1,
          order: 1,
          pinned: false,
          isNameManuallyEdited: false,
        }],
        createdAt: 1,
        updatedAt: 1,
      }],
      'olyq.chat.runtime.v1': {
        activeAssistantId: 'assistant-1',
        activeTopicId: 'topic-1',
      },
    });

    const { bootstrapExtensionPageStartup } = await import('./extension-page-startup');

    const snapshot = await bootstrapExtensionPageStartup();

    expect(snapshot.activeConversation).toEqual({
      status: 'ready',
      assistantId: 'assistant-1',
      topicId: 'topic-1',
      messages: [{
        id: 'assistant-boot',
        askId: 'ask-boot',
        role: 'assistant',
        content: 'startup message',
        createdAt: 2,
      }],
    });
    expect(localStorage.getItem('__olyq.bootstrap__.activeConversation')).toBeNull();
  });

  it('激活话题消息预取失败时只退化到 loading-fallback，不回退旧 mirror', async () => {
    vi.stubGlobal('indexedDB', {});
    getTopicMessagesMock.mockRejectedValue(new Error('idb unavailable'));
    storageGetMock.mockResolvedValue({
      'olyq.assistants.v1': [{
        id: 'assistant-1',
        name: '默认助手',
        prompt: 'hello',
        topics: [{
          id: 'topic-1',
          assistantId: 'assistant-1',
          name: '启动话题',
          createdAt: 1,
          updatedAt: 1,
          order: 1,
          pinned: false,
          isNameManuallyEdited: false,
        }],
        createdAt: 1,
        updatedAt: 1,
      }],
      'olyq.chat.runtime.v1': {
        activeAssistantId: 'assistant-1',
        activeTopicId: 'topic-1',
      },
    });

    const { bootstrapExtensionPageStartup } = await import('./extension-page-startup');

    const snapshot = await bootstrapExtensionPageStartup();

    expect(snapshot.activeConversation).toEqual({
      status: 'loading-fallback',
      assistantId: 'assistant-1',
      topicId: 'topic-1',
      messages: [],
    });
  });
});
