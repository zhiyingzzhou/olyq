/**
 * 说明：`shared-json-config-channel.spec` 共享配置通道测试。
 *
 * 职责：
 * - 验证 startup/bootstrap、storage 回流和同窗口即时更新已经统一收口到单一 helper；
 * - 守住“本页立即更新一次、跨上下文回流一次”的通知语义；
 * - 防止业务模块再次复制 `bootstrap + cache + storage + custom-event` 组合协议。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonStorageMock } from '@/test/json-storage-mock';

vi.mock('./json-storage', async () => {
  const { createJsonStorageMockModule } = await import('@/test/json-storage-mock');
  return createJsonStorageMockModule();
});

/**
 * 等待当前轮微任务完成，便于断言异步 storage / event 回流。
 */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('shared-json-config-channel', () => {
  beforeEach(() => {
    vi.resetModules();
    jsonStorageMock.reset();
  });

  it('信任有效 startup snapshot，并把 hydratedFromStartupStorage 标成 true', async () => {
    const { createSharedJsonConfigChannel } = await import('./shared-json-config-channel');
    const channel = createSharedJsonConfigChannel({
      storageKey: 'olyq.test.channel.v1',
      fallback: { enabled: false },
      normalize: (raw) => {
        const record = raw && typeof raw === 'object' ? raw as { enabled?: unknown } : {};
        return { enabled: Boolean(record.enabled) };
      },
      clone: (value) => ({ ...value }),
      bootstrap: {
        bootstrapSource: 'startup-snapshot',
        readRaw: () => ({ enabled: true }),
        hasStorageValue: () => true,
        isUsableValue: (raw) => Boolean(raw && typeof raw === 'object' && 'enabled' in (raw as object)),
      },
    });

    expect(channel.hydratedFromStartupStorage).toBe(true);
    expect(channel.getSnapshot()).toEqual({ enabled: true });
    expect(jsonStorageMock.readStoredJsonMock).not.toHaveBeenCalled();
  });

  it('本地 save 只通知一次订阅者，不会被自己的 custom-event 再回放一遍', async () => {
    const { createSharedJsonConfigChannel } = await import('./shared-json-config-channel');
    const channel = createSharedJsonConfigChannel({
      storageKey: 'olyq.test.channel.v1',
      fallback: { enabled: false },
      normalize: (raw) => {
        const record = raw && typeof raw === 'object' ? raw as { enabled?: unknown } : {};
        return { enabled: Boolean(record.enabled) };
      },
      clone: (value) => ({ ...value }),
      sameWindowSignal: {
        type: 'custom-event',
        eventName: 'olyq:test-shared-channel',
      },
    });
    const callback = vi.fn();
    const unsubscribe = channel.subscribe(callback);

    const next = channel.save({ enabled: true });
    await flushMicrotasks();

    expect(next).toEqual({ enabled: true });
    expect(channel.getSnapshot()).toEqual({ enabled: true });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(jsonStorageMock.writeStoredJsonInBackgroundMock).toHaveBeenCalledWith(
      'olyq.test.channel.v1',
      { enabled: true },
      'shared-json-config-channel',
    );

    unsubscribe();
  });

  it('只有 registry 允许的 bootstrap key 才会走 mirror-aware 写入', async () => {
    const { createSharedJsonConfigChannel } = await import('./shared-json-config-channel');
    const channel = createSharedJsonConfigChannel({
      storageKey: 'olyq.language.v1',
      fallback: 'zh-CN',
      normalize: (raw) => (raw === 'en-US' ? 'en-US' : 'zh-CN'),
      clone: (value) => value,
      bootstrap: {
        bootstrapSource: 'bootstrap-mirror',
      },
    });

    channel.save('en-US');
    await flushMicrotasks();

    expect(jsonStorageMock.writeStoredJsonWithBootstrapMirrorInBackgroundMock).toHaveBeenCalledWith(
      'olyq.language.v1',
      'en-US',
      'shared-json-config-channel',
    );
    expect(jsonStorageMock.writeStoredJsonInBackgroundMock).not.toHaveBeenCalled();
  });

  it('storage 回流和外部 custom-event 都会复用同一刷新路径', async () => {
    jsonStorageMock.setStoredValue('olyq.test.channel.v1', { enabled: false });

    const { createSharedJsonConfigChannel } = await import('./shared-json-config-channel');
    const channel = createSharedJsonConfigChannel({
      storageKey: 'olyq.test.channel.v1',
      fallback: { enabled: false },
      normalize: (raw) => {
        const record = raw && typeof raw === 'object' ? raw as { enabled?: unknown } : {};
        return { enabled: Boolean(record.enabled) };
      },
      clone: (value) => ({ ...value }),
      sameWindowSignal: {
        type: 'custom-event',
        eventName: 'olyq:test-shared-channel',
      },
    });
    const callback = vi.fn();
    channel.subscribe(callback);

    jsonStorageMock.setStoredValue('olyq.test.channel.v1', { enabled: true });
    jsonStorageMock.emitStoredKeysChanged(['olyq.test.channel.v1']);
    await flushMicrotasks();

    expect(channel.getSnapshot()).toEqual({ enabled: true });
    expect(callback).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new CustomEvent('olyq:test-shared-channel', {
      detail: { token: 'external-token' },
    }));
    await flushMicrotasks();

    expect(channel.getSnapshot()).toEqual({ enabled: true });
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
