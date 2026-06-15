/**
 * 说明：`backup-archive.spec` 备份模块。
 *
 * 职责：
 * - 承载 `backup-archive.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import JSZip from 'jszip';
import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  listAllTopicMessagesMock,
  replaceAllTopicMessagesMock,
  exportAllAttachmentsMock,
  replaceAllAttachmentsMock,
  exportAllMemoryRecordsMock,
  replaceAllMemoryRecordsMock,
  readPersistedPaintWorkspaceMock,
  replacePersistedPaintWorkspaceMock,
  clearPersistedPaintWorkspaceMock,
  summarizePaintWorkspaceMock,
  flushRegisteredPendingWritesMock,
  chromeStore,
} = vi.hoisted(() => ({
  listAllTopicMessagesMock: vi.fn(),
  replaceAllTopicMessagesMock: vi.fn(),
  exportAllAttachmentsMock: vi.fn(),
  replaceAllAttachmentsMock: vi.fn(),
  exportAllMemoryRecordsMock: vi.fn(),
  replaceAllMemoryRecordsMock: vi.fn(),
  readPersistedPaintWorkspaceMock: vi.fn(),
  replacePersistedPaintWorkspaceMock: vi.fn(),
  clearPersistedPaintWorkspaceMock: vi.fn(),
  summarizePaintWorkspaceMock: vi.fn(),
  flushRegisteredPendingWritesMock: vi.fn(async () => undefined),
  chromeStore: new Map<string, unknown>(),
}));

vi.mock('@/lib/chat/messages-db', () => ({
  listAllTopicMessages: listAllTopicMessagesMock,
  replaceAllTopicMessages: replaceAllTopicMessagesMock,
}));

vi.mock('./attachments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./attachments')>();
  return {
    ...actual,
    exportAllAttachments: exportAllAttachmentsMock,
    replaceAllAttachments: replaceAllAttachmentsMock,
  };
});

vi.mock('./memory/memory-store', () => ({
  exportAllMemoryRecords: exportAllMemoryRecordsMock,
  replaceAllMemoryRecords: replaceAllMemoryRecordsMock,
}));

vi.mock('@/lib/workspaces/paint-workspace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workspaces/paint-workspace')>();
  return {
    ...actual,
    readPersistedPaintWorkspace: readPersistedPaintWorkspaceMock,
    replacePersistedPaintWorkspace: replacePersistedPaintWorkspaceMock,
    clearPersistedPaintWorkspace: clearPersistedPaintWorkspaceMock,
    summarizePaintWorkspace: summarizePaintWorkspaceMock,
  };
});

vi.mock('@/lib/storage/pending-write-flushers', () => ({
  flushRegisteredPendingWrites: flushRegisteredPendingWritesMock,
}));

import {
  applyBackupRestorePlan,
  exportBackupArchiveBlob,
  planBackupRestore,
} from './backup-archive';
import { resetStorageAdapterForTesting } from './storage/storage-adapter';

const PACKAGE_VERSION = String(JSON.parse(fs.readFileSync(`${process.cwd()}/package.json`, 'utf8')).version || '').trim();

/**
 * 测试辅助函数：`createChromeApi`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createChromeApi() {
  return {
    runtime: {
      lastError: undefined,
    },
    storage: {
      onChanged: {
        addListener: () => {},
        removeListener: () => {},
      },
      local: {
        get: (_: unknown, callback: (items: Record<string, unknown>) => void) => {
          callback(Object.fromEntries(chromeStore.entries()));
        },
        set: (items: Record<string, unknown>, callback: () => void) => {
          for (const [key, value] of Object.entries(items)) chromeStore.set(key, value);
          callback();
        },
        remove: (keys: string[], callback: () => void) => {
          for (const key of keys) chromeStore.delete(key);
          callback();
        },
      },
    },
  } as unknown as typeof chrome;
}

describe('backup-archive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStorageAdapterForTesting();
    localStorage.clear();
    chromeStore.clear();
    vi.stubGlobal('chrome', createChromeApi());
    vi.stubGlobal('__OLYQ_BUILD_CONFIG__', { target: 'chromium', appVersion: PACKAGE_VERSION });

    readPersistedPaintWorkspaceMock.mockResolvedValue({
      paintings: [{
        id: 'paint-1',
        title: 'demo',
        model: '',
        prompt: '',
        params: { n: 1 },
        inputImages: [{ id: 'att-paint-in', name: 'input.png', mime: 'image/png', size: 1 }],
        outputImages: [{ id: 'att-paint-out', name: 'output.png', mime: 'image/png', size: 1 }],
        createdAt: 1,
        updatedAt: 1,
      }],
      activePaintingId: 'paint-1',
    });
    replacePersistedPaintWorkspaceMock.mockResolvedValue(undefined);
    clearPersistedPaintWorkspaceMock.mockResolvedValue(undefined);
    summarizePaintWorkspaceMock.mockResolvedValue({ itemCount: 1, bytes: 1 });
    localStorage.setItem('olyq.theme.v1', 'dark');
    chromeStore.set('olyq.quick-phrases.v1', [{
      id: 'phrase-1',
      title: 'hello',
      content: 'world',
      createdAt: 1,
      updatedAt: 1,
      order: 1,
    }]);

    listAllTopicMessagesMock.mockResolvedValue([{
      id: 'topic-1',
      messages: [{
        id: 'message-1',
        role: 'user',
        content: 'hello',
        attachments: [{ id: 'att-chat-1', type: 'image', name: 'demo.png' }],
      }],
    }]);
    exportAllAttachmentsMock.mockResolvedValue([{
      id: 'att-db-1',
      kind: 'file',
      name: 'demo.txt',
      mime: 'text/plain',
      size: 4,
      createdAt: 1,
      data: new Blob(['demo'], { type: 'text/plain' }),
    }]);
    exportAllMemoryRecordsMock.mockResolvedValue([{
      id: 'memory-1',
      userId: 'default-user',
      memory: 'remember this',
      embedding: [0.1, 0.2],
      createdAt: 1,
      updatedAt: 1,
    }]);
  });

  it('没有 chrome 全局对象时仍使用构建期版本生成 ZIP manifest', async () => {
    vi.stubGlobal('chrome', undefined);
    resetStorageAdapterForTesting();
    localStorage.setItem('olyq.quick-phrases.v1', JSON.stringify([{
      id: 'phrase-local-1',
      title: 'local',
      content: 'storage',
      createdAt: 1,
      updatedAt: 1,
      order: 1,
    }]));

    const blob = await exportBackupArchiveBlob('full');
    const zip = await JSZip.loadAsync(blob);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as {
      appVersion: string;
    };

    expect(manifest.appVersion).toBe(PACKAGE_VERSION);
  });

  it('导出 ZIP 时按注册域写入 manifest 和 domains 目录', async () => {
    const blob = await exportBackupArchiveBlob('full');
    const zip = await JSZip.loadAsync(blob);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as {
      version: number;
      appVersion: string;
      domains: Array<{ domainId: string; dataPath: string; blobPaths: string[]; containsSensitiveData: boolean }>;
    };

    expect(flushRegisteredPendingWritesMock).toHaveBeenCalled();
    expect(manifest.version).toBe(1);
    expect(manifest.appVersion).toBe(PACKAGE_VERSION);
    expect(manifest.domains.map((entry) => entry.domainId)).toEqual(expect.arrayContaining([
      'config.shared-storage',
      'config.local-storage',
      'workspace.paint',
      'chat.messages',
      'memory.records',
      'attachments.records',
    ]));
    expect(zip.file('domains/config.shared-storage/data.json')).toBeTruthy();
    expect(zip.file('domains/workspace.paint/data.json')).toBeTruthy();
    expect(zip.file('domains/chat.messages/data.json')).toBeTruthy();
    expect(zip.file('domains/attachments.records/files/att-db-1')).toBeTruthy();
    expect(manifest.domains.find((entry) => entry.domainId === 'config.shared-storage')?.containsSensitiveData).toBe(true);
  });

  it('lite 导出会保留结构化域并移除聊天与工作台里的附件引用', async () => {
    const blob = await exportBackupArchiveBlob('lite');
    const zip = await JSZip.loadAsync(blob);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as {
      domains: Array<{ domainId: string }>;
    };
    const chatSnapshot = JSON.parse(await zip.file('domains/chat.messages/data.json')!.async('string')) as {
      messages: Array<{ messages: Array<{ attachments?: unknown[] }> }>;
    };
    const paintSnapshot = JSON.parse(await zip.file('domains/workspace.paint/data.json')!.async('string')) as {
      paintings: Array<{ inputImages: unknown[]; outputImages: unknown[] }>;
    };

    expect(manifest.domains.map((entry) => entry.domainId)).toEqual(expect.arrayContaining([
      'config.shared-storage',
      'config.local-storage',
      'workspace.paint',
      'chat.messages',
      'memory.records',
    ]));
    expect(manifest.domains.map((entry) => entry.domainId)).not.toContain('attachments.records');
    expect(zip.file('domains/attachments.records/data.json')).toBeFalsy();
    expect(chatSnapshot.messages[0]?.messages[0]?.attachments).toEqual([]);
    expect(paintSnapshot.paintings[0]?.inputImages).toEqual([]);
    expect(paintSnapshot.paintings[0]?.outputImages).toEqual([]);
  });

  it('导出域校验失败时返回域、阶段和下层原因码', async () => {
    listAllTopicMessagesMock.mockResolvedValue([{ messages: [] }]);

    await expect(exportBackupArchiveBlob('full')).rejects.toMatchObject({
      i18n: {
        key: 'errors.backupFormatUnsupported',
        params: expect.objectContaining({
          detail: 'backup.archive.export.domain.export_failed',
          domainId: 'chat.messages',
          stage: 'export',
          causeDetail: 'backup.chat.messages.topic_id_missing',
        }),
      },
    });
  });

  it('planRestore 会拒绝被篡改的 hash', async () => {
    const blob = await exportBackupArchiveBlob('full');
    const zip = await JSZip.loadAsync(blob);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as {
      version: number;
      domains: Array<Record<string, unknown>>;
    };
    manifest.domains[0] = { ...manifest.domains[0], hash: 'tampered' };
    zip.file('manifest.json', JSON.stringify(manifest));
    const tampered = await zip.generateAsync({ type: 'blob' });

    await expect(planBackupRestore(tampered)).rejects.toMatchObject({
      i18n: { key: 'errors.backupFormatUnsupported' },
    });
  });

  it('planRestore 会拒绝非当前格式版本', async () => {
    const blob = await exportBackupArchiveBlob('full');
    const zip = await JSZip.loadAsync(blob);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as {
      version: number;
      domains: Array<Record<string, unknown>>;
    };
    manifest.version = 99;
    zip.file('manifest.json', JSON.stringify(manifest));
    const tampered = await zip.generateAsync({ type: 'blob' });

    await expect(planBackupRestore(tampered)).rejects.toMatchObject({
      i18n: { key: 'errors.backupFormatUnsupported' },
    });
  });

  it('会按 plan 执行 restore，并调用各域的 replace 逻辑', async () => {
    const blob = await exportBackupArchiveBlob('full');
    const plan = await planBackupRestore(blob);

    await applyBackupRestorePlan(plan);

    expect(replaceAllAttachmentsMock).toHaveBeenCalledTimes(1);
    expect(replaceAllTopicMessagesMock).toHaveBeenCalledTimes(1);
    expect(replaceAllMemoryRecordsMock).toHaveBeenCalledTimes(1);
  });
});
