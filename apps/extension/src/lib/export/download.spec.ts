/**
 * 说明：`download.spec` 导出下载 helper 测试。
 *
 * 职责：
 * - 验证 `downloadBlob` 会优先走共享扩展下载 contract；
 * - 守住 contract 不可用时回退到 DOM `<a download>` 的行为。
 *
 * 边界：
 * - 这里只测试下载 helper 的边界编排，不覆盖上层导出内容生成逻辑。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestExtensionDownload = vi.fn();

vi.mock('@/lib/extension/download-api', () => ({
  requestExtensionDownload,
}));

/**
 * 用保留构造能力的 URL 子类替换 Blob URL 静态 API。
 *
 * @param createObjectURL - 测试用 createObjectURL mock。
 * @param revokeObjectURL - 测试用 revokeObjectURL mock。
 */
function stubBlobUrlApi(createObjectURL: ReturnType<typeof vi.fn>, revokeObjectURL: ReturnType<typeof vi.fn>) {
  const NativeURL = URL;
  class TestURL extends NativeURL {}
  TestURL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
  TestURL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL;
  vi.stubGlobal('URL', TestURL);
}

describe('export/download', () => {
  beforeEach(() => {
    vi.resetModules();
    requestExtensionDownload.mockReset();
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('downloadBlob 会优先走共享扩展下载 contract', async () => {
    requestExtensionDownload.mockResolvedValue(true);
    vi.useFakeTimers();

    const createObjectURL = vi.fn(() => 'blob:contract-download');
    const revokeObjectURL = vi.fn();
    stubBlobUrlApi(createObjectURL, revokeObjectURL);

    const appendChild = vi.spyOn(document.body, 'appendChild');
    const removeChild = vi.spyOn(document.body, 'removeChild');

    const { downloadBlob } = await import('./download');
    await downloadBlob(new Blob(['hello']), ' report?.txt ');

    expect(requestExtensionDownload).toHaveBeenCalledWith({
      url: 'blob:contract-download',
      filename: 'report_.txt',
      saveAs: true,
    });
    expect(appendChild).not.toHaveBeenCalled();
    expect(removeChild).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:contract-download');
  });

  it('downloadBlob 在扩展下载 contract 不可用时回退到 DOM 下载', async () => {
    requestExtensionDownload.mockResolvedValue(false);
    vi.useFakeTimers();

    const createObjectURL = vi.fn(() => 'blob:dom-download');
    const revokeObjectURL = vi.fn();
    stubBlobUrlApi(createObjectURL, revokeObjectURL);

    const originalCreateElement = document.createElement.bind(document);
    const anchor = originalCreateElement('a');
    const click = vi.fn();
    anchor.click = click;
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === 'a') return anchor;
      return originalCreateElement(tagName);
    });

    const appendChild = vi.spyOn(document.body, 'appendChild');
    const removeChild = vi.spyOn(document.body, 'removeChild');

    const { downloadBlob } = await import('./download');
    await downloadBlob(new Blob(['hello']), 'bad/name?.txt');

    expect(requestExtensionDownload).toHaveBeenCalledWith({
      url: 'blob:dom-download',
      filename: 'bad_name_.txt',
      saveAs: true,
    });
    expect(anchor.download).toBe('bad_name_.txt');
    expect(click).toHaveBeenCalledTimes(1);
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(removeChild).toHaveBeenCalledWith(anchor);

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:dom-download');
  });
});
