/**
 * 说明：`cloud-sync.test` 同步模块。
 *
 * 职责：
 * - 承载 `cloud-sync.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  broadcastStoreReloadSignalMock,
  flushRegisteredPendingWritesMock,
  flushSyncMetaPendingWritesMock,
  getObjectMock,
  listObjectsMock,
  putObjectMock,
  runSyncMock,
  capturedRuntimeStore,
  storageGetMock,
  storageSetMock,
} = vi.hoisted(() => ({
  broadcastStoreReloadSignalMock: vi.fn(async () => undefined),
  flushRegisteredPendingWritesMock: vi.fn(async () => undefined),
  flushSyncMetaPendingWritesMock: vi.fn(async () => undefined),
  getObjectMock: vi.fn(),
  listObjectsMock: vi.fn(),
  putObjectMock: vi.fn(async () => undefined),
  runSyncMock: vi.fn(),
  capturedRuntimeStore: { current: null as unknown },
  storageGetMock: vi.fn(),
  storageSetMock: vi.fn(async () => undefined),
}));

vi.mock('@/lib/storage/pending-write-flushers', () => ({
  flushRegisteredPendingWrites: flushRegisteredPendingWritesMock,
}));

vi.mock('@/lib/s3-client', () => ({
  deleteObject: vi.fn(async () => undefined),
  getObject: getObjectMock,
  listObjects: listObjectsMock,
  putObject: putObjectMock,
}));

vi.mock('@/lib/storage/reload-signal', () => ({
  broadcastStoreReloadSignal: broadcastStoreReloadSignalMock,
}));

vi.mock('@/lib/storage/storage-adapter', () => ({
  getStorageAdapter: () => ({
    get: storageGetMock,
    set: storageSetMock,
    remove: vi.fn(async () => undefined),
    onChange: vi.fn(() => () => undefined),
  }),
}));

vi.mock('./sync-engine', () => ({
  flushSyncMetaPendingWrites: flushSyncMetaPendingWritesMock,
  runSync: runSyncMock,
}));

vi.mock('./runtime-local-store', () => ({
  createRuntimeLocalStore: vi.fn(() => {
    capturedRuntimeStore.current = { kind: 'runtime-local-store' };
    return capturedRuntimeStore.current;
  }),
}));

import {
  S3_SYNC_KEY,
  S3_SYNC_STATUS_KEY,
  WEBDAV_SYNC_KEY,
  WEBDAV_SYNC_STATUS_KEY,
  buildWebDavSyncUrl,
  runS3StructuredSync,
  runWebDavStructuredSync,
} from './cloud-sync';

describe('cloud-sync entrypoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    storageGetMock.mockResolvedValue({});
    listObjectsMock.mockResolvedValue([]);
    getObjectMock.mockResolvedValue(null);
    putObjectMock.mockResolvedValue(undefined);
    capturedRuntimeStore.current = null;
  });

  it('安装期权限模型下远端 structured sync 不再做 all-sites 前置拦截', async () => {
    storageGetMock.mockResolvedValue({
      [WEBDAV_SYNC_KEY]: {
        url: 'https://dav.example.com/root',
        username: 'demo',
        password: 'secret',
        path: '/olyq',
      },
      [S3_SYNC_KEY]: {
        endpoint: 'https://s3.example.com',
        region: 'us-east-1',
        bucket: 'bucket',
        accessKeyId: 'ak',
        secretAccessKey: 'sk',
        root: 'olyq',
      },
    });
    runSyncMock.mockResolvedValue({ status: 'success', merged: 0 });

    await expect(runWebDavStructuredSync()).resolves.toEqual({ status: 'success', merged: 0 });
    await expect(runS3StructuredSync()).resolves.toEqual({ status: 'success', merged: 0 });

    expect(runSyncMock).toHaveBeenCalledTimes(2);
  });

  it('WebDAV 远端错误会中断 structured sync，并落失败状态且不广播 reload', async () => {
    storageGetMock.mockResolvedValue({
      [WEBDAV_SYNC_KEY]: {
        url: 'https://dav.example.com/root',
        username: 'demo',
        password: 'secret',
        path: '/olyq',
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('server exploded', {
      status: 500,
      statusText: 'Server Error',
    })));
    runSyncMock.mockImplementation(async (backend: { pull: () => Promise<unknown> }) => {
      await backend.pull();
      return { status: 'success', merged: 0 };
    });

    await expect(runWebDavStructuredSync()).rejects.toMatchObject({
      i18n: { key: 'errors.httpRequestFailedWithDetail' },
    });

    expect(storageSetMock).toHaveBeenCalledWith({
      [WEBDAV_SYNC_STATUS_KEY]: expect.objectContaining({
        ok: false,
        mode: 'sync',
        error: expect.objectContaining({ key: 'errors.httpRequestFailedWithDetail' }),
      }),
    });
    expect(broadcastStoreReloadSignalMock).not.toHaveBeenCalled();
  });

  it('WebDAV structured sync 会把地址自带路径和配置目录合并成状态同步文件 URL', async () => {
    storageGetMock.mockResolvedValue({
      [WEBDAV_SYNC_KEY]: {
        url: 'https://webdav.123pan.cn/webdav',
        username: 'demo',
        password: 'secret',
        path: 'olyq',
      },
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'GET') return new Response('', { status: 404 });
      return new Response('', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    runSyncMock.mockImplementation(async (backend: { pull: () => Promise<unknown>; push: (state: unknown) => Promise<void> }) => {
      await expect(backend.pull()).resolves.toBeNull();
      await backend.push({ nodeId: 'local', topics: [] });
      return { status: 'success', merged: 0 };
    });

    await expect(runWebDavStructuredSync()).resolves.toEqual({ status: 'success', merged: 0 });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://webdav.123pan.cn/webdav/olyq/olyq-sync-state.v1.json',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://webdav.123pan.cn/webdav/olyq/olyq-sync-state.v1.json',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('WebDAV 状态同步目标会稳定归一化目录和空路径', () => {
    expect(buildWebDavSyncUrl('https://dav.example.com/webdav/', '/olyq/')).toBe(
      'https://dav.example.com/webdav/olyq/olyq-sync-state.v1.json',
    );
    expect(buildWebDavSyncUrl('https://dav.example.com/webdav', '')).toBe(
      'https://dav.example.com/webdav/olyq/olyq-sync-state.v1.json',
    );
    expect(buildWebDavSyncUrl('https://dav.example.com/webdav', '/exports/olyq-backup.zip')).toBe(
      'https://dav.example.com/webdav/exports/olyq-backup.zip/olyq-sync-state.v1.json',
    );
  });

  it('S3 structured sync 成功时会写回远端并广播 reload 与状态', async () => {
    storageGetMock.mockResolvedValue({
      [S3_SYNC_KEY]: {
        endpoint: 'https://s3.example.com',
        region: 'ap-southeast-1',
        bucket: 'olyq-sync',
        accessKeyId: 'ak',
        secretAccessKey: 'sk',
        root: 'browser-extension',
      },
    });
    listObjectsMock.mockResolvedValue([{ key: 'browser-extension/olyq-sync-state.v1.json' }]);
    getObjectMock.mockResolvedValue(JSON.stringify({
      assistants: [],
      topics: [],
      assistantTombstones: {},
      topicTombstones: {},
      topicMessagesClearedAt: {},
      messageTombstones: {},
      timestamp: { wallTime: 1, logical: 0, nodeId: 'remote' },
      nodeId: 'remote',
    }));
    runSyncMock.mockImplementation(async (backend: { pull: () => Promise<unknown>; push: (state: unknown) => Promise<void> }) => {
      await expect(backend.pull()).resolves.toMatchObject({ nodeId: 'remote' });
      await backend.push({ nodeId: 'local', topics: [] });
      return { status: 'success', merged: 1 };
    });

    await expect(runS3StructuredSync()).resolves.toEqual({
      status: 'success',
      merged: 1,
    });

    expect(listObjectsMock).toHaveBeenCalledWith(expect.any(Object), 'browser-extension/olyq-sync-state.v1.json');
    expect(putObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://s3.example.com',
        bucket: 'olyq-sync',
      }),
      'browser-extension/olyq-sync-state.v1.json',
      expect.any(String),
      'application/json',
    );
    expect(broadcastStoreReloadSignalMock).toHaveBeenCalledTimes(1);
    expect(storageSetMock).toHaveBeenCalledWith({
      [S3_SYNC_STATUS_KEY]: expect.objectContaining({
        ok: true,
        mode: 'sync',
        status: 'success',
        merged: 1,
      }),
    });
  });

  it('WebDAV structured sync 推送远端时不会出现明文 secret', async () => {
    storageGetMock.mockResolvedValue({
      [WEBDAV_SYNC_KEY]: {
        url: 'https://dav.example.com/root',
        username: 'demo',
        password: 'webdav-password',
        path: '/olyq',
      },
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'GET') return new Response('', { status: 404 });
      return new Response('', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    runSyncMock.mockImplementation(async (backend: { push: (state: unknown) => Promise<void> }, localStore: unknown) => {
      expect(localStore).toBe(capturedRuntimeStore.current);
      await backend.push({
        schemaVersion: 1,
        assistants: [],
        topics: [],
        sharedConfig: {
          'olyq.providers.v1': [{
            id: 'openai',
            name: 'OpenAI',
            type: 'openai',
            apiHost: '',
            enabled: true,
            models: [],
          }],
        },
        pendingSecretVault: {
          snapshot: {
            'olyq.providers.v1': {
              openai: { apiKey: 'sk-live-secret' },
            },
            'olyq.websearch.settings.v1': {
              tavilyApiKey: 'tvly-secret',
            },
            'olyq.mcp.servers.v1': {
              'mcp-1': {
                headers: { Authorization: 'Bearer mcp-secret' },
                preregClientSecret: 'mcp-client-secret',
              },
            },
          },
          updatedAt: { wallTime: 100, logical: 0, nodeId: 'local' },
        },
        assistantTombstones: {},
        topicTombstones: {},
        topicMessagesClearedAt: {},
        messageTombstones: {},
        timestamp: { wallTime: 100, logical: 1, nodeId: 'local' },
        nodeId: 'local',
      });
      return { status: 'success', merged: 0 };
    });

    await expect(runWebDavStructuredSync()).resolves.toEqual({ status: 'success', merged: 0 });

    const putCall = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'PUT');
    const putBody = String((putCall?.[1] as RequestInit | undefined)?.body ?? '');
    expect(putBody).toContain('"secretVault"');
    expect(putBody).not.toContain('sk-live-secret');
    expect(putBody).not.toContain('tvly-secret');
    expect(putBody).not.toContain('mcp-secret');
    expect(putBody).not.toContain('mcp-client-secret');
    expect(putBody).not.toContain('webdav-password');
    expect(putBody).not.toContain('apiKey');
    expect(putBody).not.toContain('password');
    expect(putBody).not.toContain('Authorization');
  });

  it('S3 structured sync 会解密远端 secretVault 后交给同步引擎', async () => {
    const s3Config = {
      endpoint: 'https://s3.example.com',
      region: 'ap-southeast-1',
      bucket: 'olyq-sync',
      accessKeyId: 'ak',
      secretAccessKey: 'sk',
      root: 'browser-extension',
    };
    storageGetMock.mockResolvedValue({ [S3_SYNC_KEY]: s3Config });
    listObjectsMock.mockResolvedValue([{ key: 'browser-extension/olyq-sync-state.v1.json' }]);

    let encryptedState = '';
    runSyncMock
      .mockImplementationOnce(async (backend: { push: (state: unknown) => Promise<void> }) => {
        await backend.push({
          schemaVersion: 1,
          assistants: [],
          topics: [],
          pendingSecretVault: {
            snapshot: {
              'olyq.providers.v1': {
                openai: { apiKey: 'sk-restored-secret' },
              },
            },
            updatedAt: { wallTime: 200, logical: 0, nodeId: 'local' },
          },
          assistantTombstones: {},
          topicTombstones: {},
          topicMessagesClearedAt: {},
          messageTombstones: {},
          timestamp: { wallTime: 200, logical: 1, nodeId: 'local' },
          nodeId: 'local',
        });
        const firstPutCall = putObjectMock.mock.calls[0] as unknown[] | undefined;
        encryptedState = String(firstPutCall?.[2] ?? '');
        return { status: 'success', merged: 0 };
      })
      .mockImplementationOnce(async (backend: { pull: () => Promise<unknown> }) => {
        await expect(backend.pull()).resolves.toMatchObject({
          decryptedSecretConfig: {
            'olyq.providers.v1': {
              openai: { apiKey: 'sk-restored-secret' },
            },
          },
        });
        return { status: 'success', merged: 0 };
      });

    await expect(runS3StructuredSync()).resolves.toEqual({ status: 'success', merged: 0 });
    expect(encryptedState).not.toContain('sk-restored-secret');

    getObjectMock.mockResolvedValue(encryptedState);
    putObjectMock.mockClear();

    await expect(runS3StructuredSync()).resolves.toEqual({ status: 'success', merged: 0 });
  });
});
