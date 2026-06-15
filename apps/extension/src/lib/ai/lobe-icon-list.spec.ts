/**
 * 说明：`lobe-icon-list.spec` AI 能力测试模块。
 *
 * 职责：
 * - 覆盖 lobe icon 列表的后台缓存写入失败语义；
 * - 确认缓存失败不会影响已成功拉取的图标列表；
 * - 防止 `chrome.storage.local.set` rejection 再次泄漏成未捕获 Promise。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggerMocks = vi.hoisted(() => ({
  generalWarn: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    general: {
      warn: loggerMocks.generalWarn,
    },
  },
}));

/**
 * 创建一个写入失败的 chrome.storage mock。
 *
 * @returns 可触发 `runtime.lastError` 的 Chrome mock。
 */
function createFailingStorageChromeMock(): typeof chrome {
  let lastError: { message?: string } | undefined;
  return {
    runtime: {
      /** 返回当前 callback 窗口内暴露的 runtime.lastError。 */
      get lastError() {
        return lastError;
      },
    },
    storage: {
      local: {
        get: vi.fn((_keys: string[], callback: (result: Record<string, unknown>) => void) => {
          callback({});
        }),
        set: vi.fn((_items: Record<string, unknown>, callback?: () => void) => {
          lastError = { message: 'Extension context invalidated.' };
          callback?.();
          lastError = undefined;
        }),
        remove: vi.fn((_keys: string[], callback?: () => void) => {
          callback?.();
        }),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  } as unknown as typeof chrome;
}

describe('fetchLobeIcons', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    loggerMocks.generalWarn.mockReset();
  });

  it('后台缓存写入失败时仍返回已拉取的图标列表', async () => {
    vi.stubGlobal('chrome', createFailingStorageChromeMock());
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        files: [
          { path: '/openai.webp' },
          { path: '/openai-color.webp' },
          { path: '/openai-text.webp' },
        ],
      }),
    } as unknown as Response)));

    const { fetchLobeIcons } = await import('./lobe-icon-list');
    const icons = await fetchLobeIcons(true);

    await Promise.resolve();
    await Promise.resolve();

    expect(icons).toEqual([{ id: 'openai', c: true }]);
    expect(loggerMocks.generalWarn).toHaveBeenCalledWith('background storage operation failed', {
      key: 'olyq.lobe-icons.v1',
      operation: 'set',
      owner: 'lobe-icon-list.writeCache',
      error: 'I18nError: errors.chromeStorageFailedWithDetail',
    });
  });
});
