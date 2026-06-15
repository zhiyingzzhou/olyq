/**
 * 说明：`outbound-image-normalization.spec` 基础能力测试。
 *
 * 职责：
 * - 锁定模型视觉输入出站图片格式规范化契约；
 * - 验证 SVG / GIF / 未知图片格式不会再以原 MIME 穿透到模型请求。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeOutboundImageDataUrl,
  normalizeOutboundApiImageAttachment,
  normalizeOutboundImageBlob,
  normalizeOutboundImageBlobToApiAttachment,
} from './outbound-image-normalization';

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;
const originalImage = globalThis.Image;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalToBlob = HTMLCanvasElement.prototype.toBlob;

/**
 * 安装图片栅格化所需的 jsdom mock。
 *
 * @returns 画布绘制 spy，供断言转换链路是否执行。
 */
function installRasterMocks() {
  const drawImage = vi.fn();
  URL.createObjectURL = vi.fn(() => 'blob:outbound-image') as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = vi.fn((callback: BlobCallback) => {
    callback(new Blob(['png'], { type: 'image/png' }));
  }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;

  class MockImage {
    onload: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    naturalWidth = 120;
    naturalHeight = 80;
    width = 120;
    height = 80;

    /**
     * 模拟浏览器设置图片地址后异步触发加载完成。
     */
    set src(_value: string) {
      queueMicrotask(() => this.onload?.(new Event('load')));
    }
  }

  vi.stubGlobal('Image', MockImage);
  return { drawImage };
}

describe('outbound-image-normalization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toBlob = originalToBlob;
    vi.stubGlobal('Image', originalImage);
  });

  it('PNG/JPEG/WebP 图片直接通过，不做栅格化转换', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });

    const normalized = await normalizeOutboundImageBlob({
      blob,
      name: 'demo.png',
      mime: 'image/png',
    });

    expect(normalized).toEqual(expect.objectContaining({
      mime: 'image/png',
      name: 'demo.png',
      size: blob.size,
      converted: false,
    }));
    expect(URL.createObjectURL).toBe(originalCreateObjectUrl);
  });

  it('SVG Blob 会栅格化为 PNG，文件名和 MIME 同步改成 PNG', async () => {
    const { drawImage } = installRasterMocks();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200"><rect width="1200" height="1200"/></svg>';
    const blob = new Blob([svg], { type: 'image/svg+xml' });

    const normalized = await normalizeOutboundImageBlob({
      blob,
      name: 'webpack.svg',
      mime: 'image/svg+xml',
    });

    expect(normalized).toEqual(expect.objectContaining({
      mime: 'image/png',
      name: 'webpack.png',
      size: 3,
      converted: true,
    }));
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:outbound-image');
  });

  it('percent-encoded SVG data URL 会被解析并作为 PNG API 图片出站', async () => {
    installRasterMocks();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="24"><rect width="32" height="24"/></svg>';
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    const decoded = decodeOutboundImageDataUrl(dataUrl);
    expect(decoded.mime).toBe('image/svg+xml');
    expect(decoded.blob.type).toBe('image/svg+xml');
    expect(decoded.blob.size).toBeGreaterThan(0);

    const attachment = await normalizeOutboundImageBlobToApiAttachment({
      blob: decoded.blob,
      mime: decoded.mime,
      name: 'inline.svg',
    });
    expect(attachment).toEqual(expect.objectContaining({
      type: 'image',
      mime: 'image/png',
      name: 'inline.png',
      size: 3,
    }));
    expect(attachment.url).toMatch(/^data:image\/png;base64,/);
  });

  it('已规范化的 base64 PNG API 图片保持原 URL，不重复解码', async () => {
    const attachment = await normalizeOutboundApiImageAttachment({
      type: 'image',
      url: 'data:image/png;base64,AAAA',
      mime: 'image/svg+xml',
      name: 'wrong.svg',
    });

    expect(attachment).toEqual({
      type: 'image',
      url: 'data:image/png;base64,AAAA',
      mime: 'image/png',
      name: 'wrong.svg',
    });
  });
});
