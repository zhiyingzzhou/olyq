/**
 * 说明：`image-download` AI 能力模块。
 *
 * 职责：
 * - 承载 `image-download` 相关的当前文件实现与模块边界；
 * - 对外暴露 `uint8ToBase64`、`DownloadedFile`、`getHostMatchPatternsForUrls` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 统一的“图片下载 + base64 编码”工具。
 *
 * 背景：
 * - 部分 OpenAI-compatible 平台在 /images/generations 返回 `url`，而不是 `b64_json`；
 * - AI SDK 的 openai-compatible ImageModel 对响应 schema 非常严格（只接受 b64_json）；
 * - 扩展端如果直接 fetch 远端图片 URL，可能会因 CORS 而拿不到二进制数据。
 *
 * 设计：
 * - 先尝试 `fetch(url)`（当远端允许 CORS 时最快、最标准）
 * - 若失败，再尝试 `XMLHttpRequest`（在浏览器扩展 host_permissions 场景下通常更“有权限”）
 *
 * 注意：
 * - 该模块不做任何“AI 逻辑”；只负责把 URL 下载成 base64，供上层适配不同供应商返回格式。
 */

import type { HostMatchPattern } from '@/lib/extension/host-match-patterns';
import { toHostMatchPatternFromUrl } from '@/lib/extension/host-match-patterns';

/** 把字节数组编码为 base64 字符串（不含 data: 前缀）。 */
export function uint8ToBase64(bytes: Uint8Array): string {
  // btoa 需要 binary string；这里做分片避免大数组导致栈溢出
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * 使用 `XMLHttpRequest` 下载远端二进制数据，并尽量保留响应的 MIME 类型。
 *
 * 说明：
 * - 这是 `fetch` 失败后的兜底路径，主要服务于扩展 host 权限下的图片下载。
 * - 返回 `ArrayBuffer` 以便上层统一转成 base64，不在这里引入任何图片解码逻辑。
 */
function xhrDownloadArrayBufferWithType(url: string, timeoutMs = 30_000): Promise<{ buffer: ArrayBuffer; mediaType?: string }> {
  return new Promise((resolve, reject) => {
    if (typeof XMLHttpRequest === 'undefined') {
      reject(new Error('XMLHttpRequest is not available'));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.timeout = timeoutMs;

    xhr.onload = () => {
      const status = xhr.status;
      if (status >= 200 && status < 300 && xhr.response) {
        const ct = xhr.getResponseHeader('content-type') || xhr.getResponseHeader('Content-Type') || '';
        const mediaType = ct.split(';')[0]?.trim() || undefined;
        resolve({ buffer: xhr.response, ...(mediaType ? { mediaType } : {}) });
        return;
      }
      reject(new Error(`XHR download failed: HTTP ${status || 0}`));
    };
    xhr.onerror = () => reject(new Error('XHR download failed: network error'));
    xhr.ontimeout = () => reject(new Error('XHR download failed: timeout'));
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));

    try {
      xhr.send();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/**
 * 远端文件下载并转码后的结果。
 *
 * 说明：
 * - `base64` 始终是不带 `data:` 前缀的纯编码内容，便于上层按需拼接不同 MIME；
 * - `mediaType` 为尽力推断值，缺失时由调用方按业务场景自行兜底。
 */
export type DownloadedFile = {
  /** base64 编码（不含 data: 前缀） */
  base64: string;
  /** 可选：MIME 类型（若获取失败可为空，调用方自行兜底） */
  mediaType?: string;
};

/** 对字符串列表做去空、裁剪和去重，避免重复申请权限或重复下载同一资源。 */
function uniqStrings(items: string[]): string[] {
  return Array.from(new Set(items.map((x) => String(x || '').trim()).filter(Boolean)));
}

/** 仅保留合法的 `http/https` URL，并复用统一的去重逻辑消除重复项。 */
function normalizeHttpUrls(urls: string[]): string[] {
  return uniqStrings(urls)
    .map((x) => String(x || '').trim())
    .filter((x) => x.startsWith('http://') || x.startsWith('https://'));
}

/**
 * 将 URL 列表映射为 host match patterns（仅 http/https）。
 * - 输出已去重
 * - 仅用于诊断和展示网络目标 origin（不包含路径段）
 */
export function getHostMatchPatternsForUrls(urls: string[]): HostMatchPattern[] {
  const patterns: HostMatchPattern[] = [];
  for (const u of normalizeHttpUrls(urls)) {
    const pat = toHostMatchPatternFromUrl(u);
    if (!pat) continue;
    patterns.push(pat);
  }
  return uniqStrings(patterns) as HostMatchPattern[];
}

/**
 * 解析 URL 下载涉及的 host match patterns。
 *
 * 说明：
 * - 当前安装期 host access 已覆盖普通 http/https；
 * - 这里仅返回诊断用 patterns，不阻断下载，也不触发任何网页授权流程。
 */
export async function resolveDownloadHostMatchPatterns(
  urls: string[],
  options?: { causeKind?: string },
): Promise<HostMatchPattern[]> {
  void options;
  return getHostMatchPatternsForUrls(urls);
}

/**
 * 下载远端 URL 并返回包含 `base64` 与 `mediaType` 的对象。
 *
 * 说明：
 * - 返回 null 表示下载失败（上层可选择降级或抛错）。
 */
export async function downloadUrlToFile(url: string, options?: { timeoutMs?: number }): Promise<DownloadedFile | null> {
  const u = String(url || '').trim();
  if (!u) return null;

  // 1) 首选 fetch：当远端允许跨域读取时最简单
  try {
    const res = await fetch(u, { cache: 'no-store' });
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const base64 = uint8ToBase64(new Uint8Array(buf));
      const ct = res.headers.get('content-type') || res.headers.get('Content-Type') || '';
      const mediaType = ct.split(';')[0]?.trim() || undefined;
      return { base64, ...(mediaType ? { mediaType } : {}) };
    }
  } catch {
    // ignore → fallback to XHR
  }

  // 2) XHR fallback：在扩展 host_permissions 场景下通常可以绕过部分 CORS 约束
  try {
    const { buffer, mediaType } = await xhrDownloadArrayBufferWithType(u, options?.timeoutMs);
    const base64 = uint8ToBase64(new Uint8Array(buffer));
    return { base64, ...(mediaType ? { mediaType } : {}) };
  } catch {
    return null;
  }
}

/**
 * 下载远端 URL 并返回 base64（不含 data: 前缀）。
 *
 * 说明：
 * - 返回空字符串表示下载失败（上层可选择降级为 url 透传或抛错）。
 */
export async function downloadUrlToBase64(url: string, options?: { timeoutMs?: number }): Promise<string> {
  const file = await downloadUrlToFile(url, options);
  return file?.base64 || '';
}
