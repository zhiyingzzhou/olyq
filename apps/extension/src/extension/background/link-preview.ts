/**
 * 说明：`link-preview` 后台元数据抓取模块。
 *
 * 职责：
 * - 在 Service Worker 内为聊天 Markdown 链接预览抓取远程网页 head 元数据；
 * - 统一处理公网 http/https 校验、总超时、有限 HTML 读取、in-flight 合并与短期内存缓存；
 *
 * 边界：
 * - 本模块不新增权限、不写持久化存储、不缓存原始 HTML；
 * - UI 只能通过 one-shot 消息拿到结构化 `LinkPreviewMetadata`。
 */
import { hasMeaningfulLinkPreviewMetadata, parseLinkPreviewMetadata } from '@/lib/link-preview/metadata-parser';
import type { LinkPreviewErrorCode, LinkPreviewResolution } from '@/lib/link-preview/types';
import { normalizeLinkPreviewUrl } from '@/lib/link-preview/url-policy';

const LINK_PREVIEW_TOTAL_TIMEOUT_MS = 5_000;
const LINK_PREVIEW_MAX_HTML_BYTES = 512 * 1024;
const LINK_PREVIEW_SUCCESS_TTL_MS = 15 * 60 * 1000;
const LINK_PREVIEW_FAILURE_TTL_MS = 2 * 60 * 1000;
const LINK_PREVIEW_MAX_CACHE_ENTRIES = 128;
const LINK_PREVIEW_MAX_REDIRECTS = 5;

/** 链接预览内存缓存条目。 */
interface LinkPreviewCacheEntry {
  /** 缓存失效时间戳。 */
  readonly expiresAt: number;
  /** 可直接返回给 UI 的结构化解析结果。 */
  readonly resolution: LinkPreviewResolution;
}

/** 已完成重定向跟随的响应。 */
interface LinkPreviewFetchResponse {
  /** 最终响应对象。 */
  readonly response: Response;
  /** 已经过安全策略校验的最终 URL。 */
  readonly finalUrl: string;
}

/** Service Worker 生命周期内的短期结构化缓存。 */
const linkPreviewCache = new Map<string, LinkPreviewCacheEntry>();

/** 同一 URL 的并发请求合并表。 */
const linkPreviewInFlight = new Map<string, Promise<LinkPreviewResolution>>();

/**
 * 解析并获取链接预览元数据。
 *
 * @param rawUrl - UI 传入的原始链接。
 * @returns 可展示的结构化预览结果；失败时返回稳定错误码。
 */
export async function resolveLinkPreviewMetadata(rawUrl: string): Promise<LinkPreviewResolution> {
  const normalized = normalizeLinkPreviewUrl(rawUrl);
  if ('error' in normalized) return { payload: null, error: normalized.error };

  const now = Date.now();
  pruneExpiredLinkPreviewCache(now);
  const cached = linkPreviewCache.get(normalized.url);
  if (cached && cached.expiresAt > now) return cached.resolution;

  const existing = linkPreviewInFlight.get(normalized.url);
  if (existing) return await existing;

  const task = fetchAndParseLinkPreviewMetadata(normalized.url)
    .then((resolution) => {
      if (shouldCacheLinkPreviewResolution(resolution)) {
        rememberLinkPreviewResolution(normalized.url, resolution, Date.now());
      }
      return resolution;
    })
    .finally(() => {
      if (linkPreviewInFlight.get(normalized.url) === task) {
        linkPreviewInFlight.delete(normalized.url);
      }
    });

  linkPreviewInFlight.set(normalized.url, task);
  return await task;
}

/**
 * 清空链接预览运行时缓存。
 *
 * @remarks
 * 只供单元测试使用；生产路径依赖 MV3 Service Worker 生命周期自然回收内存态。
 */
export function resetLinkPreviewRuntimeStateForTest(): void {
  linkPreviewCache.clear();
  linkPreviewInFlight.clear();
}

/**
 * 执行远程抓取并解析 HTML 元数据。
 *
 * @param url - 已归一化的 http/https URL。
 * @returns 链接预览解析结果。
 */
async function fetchAndParseLinkPreviewMetadata(url: string): Promise<LinkPreviewResolution> {
  const controller = new AbortController();
  let timedOut = false;
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  const work = fetchAndParseLinkPreviewMetadataWithinDeadline(url, controller.signal)
    .catch((error: unknown): LinkPreviewResolution => ({
      payload: null,
      error: isAbortLikeError(error) || timedOut ? 'timeout' : 'fetch-failed',
    }));
  const timeout = new Promise<LinkPreviewResolution>((resolve) => {
    timeoutId = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
      resolve({ payload: null, error: 'timeout' });
    }, LINK_PREVIEW_TOTAL_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
  }
}

/**
 * 执行真实抓取与解析。
 *
 * @remarks
 * 调用方已经用总 deadline 包裹本函数；这里不再叠局部超时，避免出现多个 owner 争抢
 * 同一请求生命周期。任何网络、重定向、读取或解析异常都会被外层转换为稳定错误码。
 *
 * @param url - 已归一化并通过初始安全策略的 URL。
 * @param signal - 总 deadline 对应的 abort signal。
 * @returns 链接预览解析结果。
 */
async function fetchAndParseLinkPreviewMetadataWithinDeadline(
  url: string,
  signal: AbortSignal,
): Promise<LinkPreviewResolution> {
  const fetched = await fetchPreviewResponseWithRedirects(url, signal);
  if ('error' in fetched) return { payload: null, error: fetched.error };

  const { response, finalUrl } = fetched;
  if (!response.ok) return { payload: null, error: 'http-error' };
  if (!isHtmlResponse(response)) return { payload: null, error: 'not-html' };

  const html = await readLimitedResponseText(response, LINK_PREVIEW_MAX_HTML_BYTES);
  const metadata = parseLinkPreviewMetadata({
    requestedUrl: url,
    finalUrl,
    html,
    fetchedAt: Date.now(),
  });

  if (!hasMeaningfulLinkPreviewMetadata(metadata)) {
    return { payload: metadata, error: 'empty-metadata' };
  }
  return { payload: metadata };
}

/**
 * 按安全策略手动跟随重定向。
 *
 * @remarks
 * `redirect: "follow"` 会在代码检查最终 URL 之前先访问重定向目标。链接预览属于
 * 扩展后台的跨域能力，因此这里必须先解析每一跳 `Location` 并确认目标仍是公网
 * `http/https`，再发起下一跳请求。
 *
 * @param initialUrl - 首跳 URL。
 * @param signal - 总 deadline 对应的 abort signal。
 * @returns 最终响应，或稳定错误码。
 */
async function fetchPreviewResponseWithRedirects(
  initialUrl: string,
  signal: AbortSignal,
): Promise<LinkPreviewFetchResponse | { error: LinkPreviewErrorCode }> {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= LINK_PREVIEW_MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      credentials: 'omit',
      redirect: 'manual',
      referrerPolicy: 'no-referrer',
      signal,
    });

    if (response.type === 'opaqueredirect') {
      // 某些浏览器会把 `redirect: "manual"` 的跨源重定向过滤成 opaque redirect，
      // 此时无法读取 Location。不能退回自动 follow，否则可能先访问到被禁止的目标。
      void response.body?.cancel().catch(() => {});
      return { error: 'http-error' };
    }

    if (!isRedirectResponse(response)) {
      const finalUrl = response.url || currentUrl;
      const normalizedFinal = normalizeLinkPreviewUrl(finalUrl);
      if ('error' in normalizedFinal) return { error: normalizedFinal.error };
      return { response, finalUrl: normalizedFinal.url };
    }

    const location = response.headers.get('location');
    void response.body?.cancel().catch(() => {});
    if (!location) return { error: 'http-error' };
    if (redirectCount >= LINK_PREVIEW_MAX_REDIRECTS) return { error: 'too-many-redirects' };

    try {
      const redirected = new URL(location, currentUrl);
      const normalizedRedirect = normalizeLinkPreviewUrl(redirected.toString());
      if ('error' in normalizedRedirect) return { error: normalizedRedirect.error };
      currentUrl = normalizedRedirect.url;
    } catch {
      return { error: 'invalid-url' };
    }
  }
  return { error: 'too-many-redirects' };
}

/**
 * 判断响应是否是需要手动跟随的 HTTP redirect。
 *
 * @param response - fetch 响应对象。
 * @returns 3xx 且语义为重定向时返回 `true`。
 */
function isRedirectResponse(response: Response): boolean {
  return response.status >= 300
    && response.status < 400
    && response.status !== 304;
}

/**
 * 判断响应是否适合作为 HTML 元数据来源。
 *
 * @param response - fetch 响应对象。
 * @returns 响应没有 content-type 或明确是 HTML/XHTML 时返回 `true`。
 */
function isHtmlResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type')?.toLowerCase().trim() ?? '';
  if (!contentType) return true;
  return contentType.includes('text/html') || contentType.includes('application/xhtml+xml');
}

/**
 * 有限读取响应文本。
 *
 * @remarks
 * 只读取最多 `maxBytes` 的前缀内容，随后以 best-effort 方式取消 reader；Open Graph 与
 * title 通常位于 head 区域，预览功能不需要也不允许把整页 HTML 长期保留在内存缓存中。
 *
 * @param response - fetch 响应对象。
 * @param maxBytes - 允许读取的最大字节数。
 * @returns 解码后的 HTML 前缀文本。
 */
async function readLimitedResponseText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    return text.slice(0, maxBytes);
  }

  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;
  try {
    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - totalBytes;
      const bytes = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(decoder.decode(bytes, { stream: totalBytes + bytes.byteLength < maxBytes }));
      totalBytes += bytes.byteLength;
      if (value.byteLength > remaining) break;
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } finally {
    void reader.cancel().catch(() => {});
  }
}

/**
 * 判断解析结果是否应该写入短期内存缓存。
 *
 * @remarks
 * 超时代表请求生命周期没有完整收束，不能缓存成 URL 级事实；否则用户下一次 hover 会
 * 继续命中陈旧 timeout，看起来像又“卡住”。其它失败仍短期缓存，用来合并同一坏响应的
 * 高频 hover。
 *
 * @param resolution - 本轮解析结果。
 * @returns 应缓存时返回 `true`。
 */
function shouldCacheLinkPreviewResolution(resolution: LinkPreviewResolution): boolean {
  return resolution.error !== 'timeout';
}

/**
 * 保存结构化缓存并限制缓存规模。
 *
 * @param url - 缓存键。
 * @param resolution - 解析结果。
 * @param now - 当前时间戳。
 */
function rememberLinkPreviewResolution(url: string, resolution: LinkPreviewResolution, now: number): void {
  const ttl = resolution.payload && !resolution.error ? LINK_PREVIEW_SUCCESS_TTL_MS : LINK_PREVIEW_FAILURE_TTL_MS;
  linkPreviewCache.set(url, {
    expiresAt: now + ttl,
    resolution,
  });

  while (linkPreviewCache.size > LINK_PREVIEW_MAX_CACHE_ENTRIES) {
    const oldestKey = linkPreviewCache.keys().next().value;
    if (typeof oldestKey !== 'string') break;
    linkPreviewCache.delete(oldestKey);
  }
}

/**
 * 清理已过期缓存条目。
 *
 * @param now - 当前时间戳。
 */
function pruneExpiredLinkPreviewCache(now: number): void {
  for (const [key, entry] of linkPreviewCache.entries()) {
    if (entry.expiresAt <= now) linkPreviewCache.delete(key);
  }
}

/**
 * 判断未知错误是否来自超时/中止。
 *
 * @param error - fetch 或 reader 抛出的未知错误。
 * @returns 是中止类错误时返回 `true`。
 */
function isAbortLikeError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError');
}
