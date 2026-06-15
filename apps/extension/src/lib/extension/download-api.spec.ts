/**
 * 说明：`download-api.spec` 扩展下载 contract 测试。
 *
 * 职责：
 * - 验证扩展下载 contract 会统一承载 `chrome.downloads.download` 调用；
 * - 守住“成功接管下载返回 true，失败或不可用返回 false”的降级语义。
 *
 * 边界：
 * - 这里只测试 contract 层，不覆盖上层 Blob URL 或 DOM `<a download>` 回退行为。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('download-api', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('requestExtensionDownload 会通过 chrome.downloads.download 触发扩展下载', async () => {
    const download = vi.fn((options: chrome.downloads.DownloadOptions, callback: (downloadId?: number) => void) => {
      callback(42);
    });

    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-extension',
        lastError: undefined,
      },
      downloads: {
        download,
      },
    });

    const { requestExtensionDownload } = await import('./download-api');
    const handled = await requestExtensionDownload({
      url: 'blob:test-download',
      filename: 'archive.zip',
      saveAs: true,
    });

    expect(download).toHaveBeenCalledWith(
      {
        url: 'blob:test-download',
        filename: 'archive.zip',
        saveAs: true,
      },
      expect.any(Function),
    );
    expect(handled).toBe(true);
  });

  it('requestExtensionDownload 在下载 API 不可用时返回 false', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-extension',
        lastError: undefined,
      },
    });

    const { requestExtensionDownload } = await import('./download-api');
    const handled = await requestExtensionDownload({
      url: 'blob:test-download',
      filename: 'archive.zip',
    });

    expect(handled).toBe(false);
  });

  it('requestExtensionDownload 在 runtime.lastError 存在时返回 false', async () => {
    const download = vi.fn((_options: chrome.downloads.DownloadOptions, callback: (downloadId?: number) => void) => {
      callback(undefined);
    });

    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-extension',
        lastError: {
          message: 'downloads disabled by policy',
        },
      },
      downloads: {
        download,
      },
    });

    const { requestExtensionDownload } = await import('./download-api');
    const handled = await requestExtensionDownload({
      url: 'blob:test-download',
      filename: 'archive.zip',
    });

    expect(handled).toBe(false);
  });

  it('requestExtensionDownload 在 downloads.download 直接抛错时返回 false', async () => {
    const download = vi.fn(() => {
      throw new Error('boom');
    });

    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-extension',
        lastError: undefined,
      },
      downloads: {
        download,
      },
    });

    const { requestExtensionDownload } = await import('./download-api');
    const handled = await requestExtensionDownload({
      url: 'blob:test-download',
      filename: 'archive.zip',
    });

    expect(handled).toBe(false);
  });
});
