/**
 * 说明：模型视觉输入的出站图片规范化。
 *
 * 职责：
 * - 在 UI 侧把聊天附件、页面元素图片、页面风格截图等视觉输入收口成模型兼容格式；
 * - 只允许 PNG/JPEG/WebP 直接出站，其它 `image/*` 统一栅格化为 PNG；
 * - 转换失败时抛出可国际化错误，由发送链路阻断请求并提示用户。
 *
 * 边界：
 * - 本模块依赖 DOM Image/Canvas，只允许在 sidepanel 等 UI 运行时使用；
 * - Service Worker 只消费已经规范化后的聊天线协议，不在后台做 DOM 图片转换。
 */
import type { ApiAttachment, ApiImageAttachment } from '@/lib/chat-stream';
import { blobToDataUrl } from '@/lib/attachments';
import { I18nError } from '@/lib/i18n/error';
import {
  isOutboundModelImageMime,
  normalizeImageMimeType,
  type OutboundModelImageMime,
} from './outbound-image-formats';

/** 规范化后的图片 Blob，可直接作为模型视觉输入来源。 */
export type NormalizedOutboundImageBlob = {
  /** 规范化后的二进制内容。 */
  blob: Blob;
  /** 规范化后的 MIME，固定为 PNG/JPEG/WebP 之一。 */
  mime: OutboundModelImageMime;
  /** 与 MIME 同步后的展示名。 */
  name: string;
  /** 规范化后的字节大小。 */
  size: number;
  /** 是否经历过栅格化转换。 */
  converted: boolean;
};

type DecodedImageDataUrl = {
  blob: Blob;
  mime: string;
};

const PNG_MIME: OutboundModelImageMime = 'image/png';

/**
 * 在关键异步步骤前检查取消状态。
 *
 * @param signal - 当前发送或附件处理链路的取消信号。
 */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

/**
 * 创建图片格式规范化失败错误。
 *
 * @param cause - 原始失败原因，保留给调试与错误详情使用。
 * @returns 面向 UI 的国际化错误。
 */
function createNormalizeError(cause?: unknown): I18nError {
  return new I18nError('errors.imageFormatNormalizationFailed', undefined, cause === undefined ? undefined : { cause });
}

/**
 * 根据 MIME 选择规范化后的文件扩展名。
 *
 * @param mime - 已规范化的小写 MIME。
 * @returns 适合展示和落库的图片扩展名。
 */
function getExtensionForMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return 'png';
}

/**
 * 同步图片文件名与目标 MIME。
 *
 * @param name - 原始文件名。
 * @param mime - 目标 MIME。
 * @param converted - 是否已经发生格式转换。
 * @returns 与目标 MIME 保持一致的展示名。
 */
function normalizeImageName(name: unknown, mime: string, converted: boolean): string {
  const raw = String(name || '').trim() || `image.${getExtensionForMime(mime)}`;
  if (!converted) return raw;
  const base = raw.replace(/\.[a-z0-9]{1,8}$/i, '') || 'image';
  return `${base}.${getExtensionForMime(mime)}`;
}

/**
 * 从 SVG 尺寸属性中读取正数。
 *
 * @param value - `width`、`height` 或类似 CSS 长度字符串。
 * @returns 有效尺寸；无法解析时返回 `null`。
 */
function parseSvgNumber(value: string | null): number | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 读取 SVG 自带尺寸，作为 Image 解码尺寸缺失时的后备。
 *
 * @param blob - SVG 图片内容。
 * @returns SVG 的宽高；无法解析时返回 `null`。
 */
async function readSvgFallbackSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  try {
    const text = await blob.text();
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.localName.toLowerCase() !== 'svg') return null;
    const width = parseSvgNumber(svg.getAttribute('width'));
    const height = parseSvgNumber(svg.getAttribute('height'));
    if (width && height) return { width, height };

    const viewBox = String(svg.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number);
    if (viewBox.length === 4 && viewBox.every((n) => Number.isFinite(n)) && viewBox[2] > 0 && viewBox[3] > 0) {
      return { width: viewBox[2], height: viewBox[3] };
    }
  } catch {
    // 失败时交给 Image 自身尺寸或默认尺寸兜底，不在这里提前吞掉转换流程。
  }
  return null;
}

/**
 * 通过对象 URL 加载图片。
 *
 * @param url - 由 `URL.createObjectURL` 创建的本地图片 URL。
 * @param signal - 当前取消信号。
 * @returns 加载完成的 `HTMLImageElement`。
 */
function loadImageFromObjectUrl(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const image = new Image();
    /**
     * 清理图片加载监听，避免取消或失败后保留闭包引用。
     */
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener('abort', onAbort);
    };
    /**
     * 把外部取消信号转换成图片加载 Promise 的取消错误。
     */
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(createNormalizeError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    image.src = url;
  });
}

/**
 * 将 Canvas 内容导出为 PNG Blob。
 *
 * @param canvas - 已绘制完成的画布。
 * @returns PNG Blob。
 */
function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(createNormalizeError());
          return;
        }
        resolve(blob.slice(0, blob.size, PNG_MIME));
      }, PNG_MIME);
    } catch (error) {
      reject(createNormalizeError(error));
    }
  });
}

/**
 * 将不允许直接出站的图片格式栅格化为 PNG。
 *
 * @param blob - 原始图片内容。
 * @param mime - 原始图片 MIME。
 * @param signal - 当前取消信号。
 * @returns PNG 图片 Blob。
 */
async function rasterizeImageToPng(blob: Blob, mime: string, signal?: AbortSignal): Promise<Blob> {
  throwIfAborted(signal);
  const source = blob.slice(0, blob.size, mime || blob.type || 'image/*');
  const fallbackSize = mime === 'image/svg+xml' ? await readSvgFallbackSize(source) : null;
  const url = URL.createObjectURL(source);
  try {
    const image = await loadImageFromObjectUrl(url, signal);
    throwIfAborted(signal);
    const width = Math.max(1, Math.round(image.naturalWidth || image.width || fallbackSize?.width || 512));
    const height = Math.max(1, Math.round(image.naturalHeight || image.height || fallbackSize?.height || 512));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw createNormalizeError();
    context.drawImage(image, 0, 0, width, height);
    return await canvasToPngBlob(canvas);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error instanceof I18nError) throw error;
    throw createNormalizeError(error);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 解析图片 data URL。
 *
 * @remarks
 * 这里故意支持非 base64 data URL，覆盖 content script 序列化内联 SVG 时常见的 percent-encoded 形态。
 */
export function decodeOutboundImageDataUrl(dataUrl: string): DecodedImageDataUrl {
  const raw = String(dataUrl || '').trim();
  if (!raw.startsWith('data:')) throw createNormalizeError();
  const commaIndex = raw.indexOf(',');
  if (commaIndex < 0) throw createNormalizeError();

  const header = raw.slice(5, commaIndex);
  const body = raw.slice(commaIndex + 1);
  const parts = header.split(';').map((part) => part.trim()).filter(Boolean);
  const mime = normalizeImageMimeType(parts[0] || 'text/plain');
  if (!mime.startsWith('image/')) throw createNormalizeError();

  const isBase64 = parts.slice(1).some((part) => part.toLowerCase() === 'base64');
  if (isBase64) {
    try {
      const bin = atob(body);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      return { blob: new Blob([bytes], { type: mime }), mime };
    } catch (error) {
      throw createNormalizeError(error);
    }
  }

  try {
    return { blob: new Blob([decodeURIComponent(body)], { type: mime }), mime };
  } catch (error) {
    throw createNormalizeError(error);
  }
}

/**
 * 将任意图片 Blob 规范化为模型视觉输入允许的 Blob。
 *
 * @remarks
 * PNG/JPEG/WebP 只校准 Blob MIME，不重采样；SVG、GIF 与未知图片格式统一转 PNG。
 */
export async function normalizeOutboundImageBlob(params: {
  blob: Blob;
  mime?: string;
  name?: string;
  signal?: AbortSignal;
}): Promise<NormalizedOutboundImageBlob> {
  throwIfAborted(params.signal);
  const sourceMime = normalizeImageMimeType(params.mime || params.blob.type || 'image/*');

  if (isOutboundModelImageMime(sourceMime)) {
    const blob = params.blob.slice(0, params.blob.size, sourceMime);
    return {
      blob,
      mime: sourceMime,
      name: normalizeImageName(params.name, sourceMime, false),
      size: blob.size,
      converted: false,
    };
  }

  if (!sourceMime.startsWith('image/')) throw createNormalizeError();
  const pngBlob = await rasterizeImageToPng(params.blob, sourceMime, params.signal);
  return {
    blob: pngBlob,
    mime: PNG_MIME,
    name: normalizeImageName(params.name, PNG_MIME, true),
    size: pngBlob.size,
    converted: true,
  };
}

/**
 * 将图片 Blob 规范化为聊天线协议里的 image attachment。
 *
 * @remarks
 * 这是普通消息附件、重发和图片生成输入共同使用的唯一 Blob 到 API 图片出口。
 */
export async function normalizeOutboundImageBlobToApiAttachment(params: {
  blob: Blob;
  mime?: string;
  name?: string;
  size?: number;
  signal?: AbortSignal;
}): Promise<ApiImageAttachment> {
  const normalized = await normalizeOutboundImageBlob(params);
  const dataUrl = await blobToDataUrl(normalized.blob);
  return {
    type: 'image',
    url: dataUrl,
    name: normalized.name,
    mime: normalized.mime,
    size: normalized.size || params.size,
  };
}

/**
 * 规范化已经处于聊天线协议形态的图片附件。
 *
 * @remarks
 * 对已经是 base64 PNG/JPEG/WebP 的 data URL 直接返回，避免页面风格截图等热路径重复解码。
 */
export async function normalizeOutboundApiImageAttachment(
  attachment: ApiImageAttachment,
  signal?: AbortSignal,
): Promise<ApiImageAttachment> {
  const url = String(attachment.url || '').trim();
  if (!url.startsWith('data:')) return { ...attachment, url };

  const header = url.slice(5, Math.max(5, url.indexOf(',')));
  const mime = normalizeImageMimeType(header.split(';')[0]);
  const isBase64 = /;base64(?:,|$)/i.test(header);
  if (isBase64 && isOutboundModelImageMime(mime)) {
    return {
      ...attachment,
      url,
      mime,
    };
  }

  const decoded = decodeOutboundImageDataUrl(url);
  return await normalizeOutboundImageBlobToApiAttachment({
    blob: decoded.blob,
    mime: attachment.mime || decoded.mime,
    name: attachment.name,
    size: attachment.size,
    signal,
  });
}

/**
 * 批量规范化聊天线协议附件。
 *
 * @remarks
 * 非图片附件保持原样；图片附件一律经过 `normalizeOutboundApiImageAttachment`。
 */
export async function normalizeOutboundApiAttachments(
  attachments: ApiAttachment[],
  signal?: AbortSignal,
): Promise<ApiAttachment[]> {
  const out: ApiAttachment[] = [];
  for (const attachment of attachments) {
    throwIfAborted(signal);
    if (attachment.type === 'image') {
      out.push(await normalizeOutboundApiImageAttachment(attachment, signal));
      continue;
    }
    out.push(attachment);
  }
  return out;
}
