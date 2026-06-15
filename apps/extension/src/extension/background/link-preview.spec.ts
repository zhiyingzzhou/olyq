/**
 * 说明：`link-preview.spec` 后台链接预览测试。
 *
 * 职责：
 * - 锁定 Service Worker 侧链接预览抓取的协议校验、超时和错误语义；
 * - 覆盖结构化缓存与同 URL in-flight 合并；
 *
 * 边界：
 * - 本文件只 mock `fetch`，不访问真实网络。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetLinkPreviewRuntimeStateForTest, resolveLinkPreviewMetadata } from './link-preview';

/**
 * 构造可控 Promise。
 *
 * @returns promise 与 resolve/reject 控制器。
 */
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * 构造 HTML 响应。
 *
 * @param html - 响应 HTML。
 * @param status - HTTP 状态码。
 * @returns Response 实例。
 */
function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

/**
 * 构造没有 content-type 响应头的 HTML 响应。
 *
 * @param html - 响应 HTML。
 * @returns Response 实例。
 */
function htmlResponseWithoutContentType(html: string): Response {
  return new Response(new TextEncoder().encode(html));
}

/**
 * 构造重定向响应。
 *
 * @param location - Location 响应头。
 * @returns 302 响应。
 */
function redirectResponse(location: string): Response {
  return new Response('', {
    status: 302,
    headers: { location },
  });
}

describe('link-preview background resolver', () => {
  beforeEach(() => {
    resetLinkPreviewRuntimeStateForTest();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetLinkPreviewRuntimeStateForTest();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('拒绝非 http/https URL 且不发起 fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveLinkPreviewMetadata('mailto:hello@example.com')).resolves.toEqual({
      payload: null,
      error: 'unsupported-protocol',
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['空 URL', '', 'invalid-url'],
    ['非法 URL', 'https://', 'invalid-url'],
    ['localhost', 'http://localhost:3000/page', 'blocked-local-url'],
    ['localhost 子域', 'http://app.localhost/page', 'blocked-local-url'],
    ['0 段 IPv4', 'http://0.0.0.0/page', 'blocked-local-url'],
    ['10/8 私网 IPv4', 'http://10.0.0.1/page', 'blocked-local-url'],
    ['loopback IPv4', 'http://127.0.0.1/page', 'blocked-local-url'],
    ['短写 loopback IPv4', 'http://127.1/page', 'blocked-local-url'],
    ['CGNAT IPv4', 'http://100.64.0.1/page', 'blocked-local-url'],
    ['链路本地 IPv4', 'http://169.254.1.1/page', 'blocked-local-url'],
    ['172.16/12 私网 IPv4', 'http://172.16.0.1/page', 'blocked-local-url'],
    ['私网 IPv4', 'http://192.168.1.2/page', 'blocked-local-url'],
    ['文档保留 IPv4', 'http://203.0.113.1/page', 'blocked-local-url'],
    ['benchmark 保留 IPv4', 'http://198.18.0.1/page', 'blocked-local-url'],
    ['组播 IPv4', 'http://224.0.0.1/page', 'blocked-local-url'],
    ['mDNS local', 'http://printer.local/page', 'blocked-local-url'],
    ['IPv6 loopback', 'http://[::1]/page', 'blocked-local-url'],
    ['IPv6 ULA', 'http://[fd00::1]/page', 'blocked-local-url'],
    ['IPv6 link-local', 'http://[fe80::1]/page', 'blocked-local-url'],
    ['IPv4-mapped IPv6 loopback', 'http://[::ffff:127.0.0.1]/page', 'blocked-local-url'],
    ['IPv6 discard-only', 'http://[100::1]/page', 'blocked-local-url'],
    ['IPv6 documentation', 'http://[2001:db8::1]/page', 'blocked-local-url'],
    ['IPv6 multicast', 'http://[ff00::1]/page', 'blocked-local-url'],
  ])('URL 安全策略拒绝 %s 且不发起 fetch', async (_name, url, error) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveLinkPreviewMetadata(url)).resolves.toEqual({
      payload: null,
      error,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['http 公网域名', 'http://example.com/post'],
    ['https 编码 URL', 'https://example.com/%E4%B8%AD%E6%96%87?x=%E2%9C%93'],
    ['https 公网 IPv6', 'https://[2606:4700:4700::1111]/post'],
  ])('URL 安全策略允许 %s', async (_name, url) => {
    const fetchMock = vi.fn(async () => htmlResponse('<head><meta property="og:title" content="Allowed"></head>'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveLinkPreviewMetadata(url)).resolves.toMatchObject({
      payload: { title: 'Allowed' },
    });
    expect(fetchMock).toHaveBeenCalledWith(new URL(url).toString(), expect.objectContaining({
      credentials: 'omit',
      redirect: 'manual',
    }));
  });

  it('成功解析 HTML 后只返回结构化元数据', async () => {
    const fetchMock = vi.fn(async () => htmlResponse(`
      <head>
        <meta property="og:title" content="Example Title">
        <meta property="og:description" content="Example Description">
      </head>
    `));
    vi.stubGlobal('fetch', fetchMock);

    const result = await resolveLinkPreviewMetadata('https://example.com/post');

    expect(result.error).toBeUndefined();
    expect(result.payload).toMatchObject({
      url: 'https://example.com/post',
      hostname: 'example.com',
      title: 'Example Title',
      description: 'Example Description',
    });
    expect(JSON.stringify(result)).not.toContain('<head>');
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/post', expect.objectContaining({
      credentials: 'omit',
      redirect: 'manual',
      referrerPolicy: 'no-referrer',
    }));
  });

  it('无 content-type 的 2xx 响应仍按 HTML 尝试解析', async () => {
    const fetchMock = vi.fn(async () => htmlResponseWithoutContentType('<head><title>No Header</title></head>'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveLinkPreviewMetadata('https://example.com/post')).resolves.toMatchObject({
      payload: { title: 'No Header' },
    });
  });

  it('非 HTML 响应返回 not-html', async () => {
    const fetchMock = vi.fn(async () => new Response('PNG', {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveLinkPreviewMetadata('https://example.com/image.png')).resolves.toEqual({
      payload: null,
      error: 'not-html',
    });
  });

  it('HTTP 失败返回稳定 http-error', async () => {
    const fetchMock = vi.fn(async () => htmlResponse('missing', 404));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveLinkPreviewMetadata('https://example.com/missing')).resolves.toEqual({
      payload: null,
      error: 'http-error',
    });
  });

  it('手动跟随公网重定向并使用最终 URL 解析元数据', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(redirectResponse('/target'))
      .mockResolvedValueOnce(htmlResponse('<head><meta property="og:title" content="Redirected"></head>'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await resolveLinkPreviewMetadata('https://example.com/start');

    expect(result).toMatchObject({
      payload: {
        title: 'Redirected',
        finalUrl: 'https://example.com/target',
      },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://example.com/start', expect.objectContaining({ redirect: 'manual' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://example.com/target', expect.objectContaining({ redirect: 'manual' }));
  });

  it('重定向到非 http/https 或本地地址时不会继续请求目标', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(redirectResponse('http://127.0.0.1/private'))
      .mockResolvedValueOnce(htmlResponse('<head><title>Should not fetch</title></head>'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveLinkPreviewMetadata('https://example.com/start')).resolves.toEqual({
      payload: null,
      error: 'blocked-local-url',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('重定向到非 http/https 协议时不会继续请求目标', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(redirectResponse('ftp://example.com/file'))
      .mockResolvedValueOnce(htmlResponse('<head><title>Should not fetch</title></head>'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveLinkPreviewMetadata('https://example.com/start')).resolves.toEqual({
      payload: null,
      error: 'unsupported-protocol',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('重定向到非 HTML 资源时返回 not-html', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(redirectResponse('/image.png'))
      .mockResolvedValueOnce(new Response('PNG', {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveLinkPreviewMetadata('https://example.com/start')).resolves.toEqual({
      payload: null,
      error: 'not-html',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('浏览器过滤 manual redirect 为 opaque redirect 时稳定失败且不自动 follow', async () => {
    const opaqueRedirect = {
      body: null,
      headers: new Headers(),
      ok: false,
      status: 0,
      type: 'opaqueredirect',
      url: '',
    } as unknown as Response;
    const fetchMock = vi.fn(async () => opaqueRedirect);
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveLinkPreviewMetadata('https://example.com/start')).resolves.toEqual({
      payload: null,
      error: 'http-error',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('过多重定向返回稳定 too-many-redirects', async () => {
    const fetchMock = vi.fn(async () => redirectResponse('/again'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveLinkPreviewMetadata('https://example.com/start')).resolves.toEqual({
      payload: null,
      error: 'too-many-redirects',
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it.each([
    ['AbortError', new DOMException('Aborted', 'AbortError'), 'timeout'],
    ['TimeoutError', new DOMException('Timed out', 'TimeoutError'), 'timeout'],
    ['普通 TypeError', new TypeError('fetch failed'), 'fetch-failed'],
  ])('fetch 抛出 %s 时返回稳定错误码', async (_name, error, expected) => {
    const fetchMock = vi.fn(async () => {
      throw error;
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveLinkPreviewMetadata('https://example.com/post')).resolves.toEqual({
      payload: null,
      error: expected,
    });
  });

  it('body 读取中途失败时返回 fetch-failed', async () => {
    const stream = new ReadableStream<Uint8Array>({
      /** 模拟远端在 body read 阶段中断连接。 */
      pull: (controller) => {
        controller.error(new TypeError('read failed'));
      },
    });
    const fetchMock = vi.fn(async () => new Response(stream, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveLinkPreviewMetadata('https://example.com/broken-body')).resolves.toEqual({
      payload: null,
      error: 'fetch-failed',
    });
  });

  it('204 或空 body 会返回结构化 empty-metadata 而不是悬挂', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveLinkPreviewMetadata('https://example.com/empty')).resolves.toMatchObject({
      payload: {
        finalUrl: 'https://example.com/empty',
        hostname: 'example.com',
        title: null,
      },
      error: 'empty-metadata',
    });
  });

  it('同 URL in-flight 请求会合并', async () => {
    const deferred = createDeferred<Response>();
    const fetchMock = vi.fn(() => deferred.promise);
    vi.stubGlobal('fetch', fetchMock);

    const first = resolveLinkPreviewMetadata('https://example.com/post');
    const second = resolveLinkPreviewMetadata('https://example.com/post');
    deferred.resolve(htmlResponse('<head><meta property="og:title" content="Merged"></head>'));

    await expect(first).resolves.toMatchObject({ payload: { title: 'Merged' } });
    await expect(second).resolves.toMatchObject({ payload: { title: 'Merged' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('成功结果会在 TTL 内复用内存缓存', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T00:00:00Z'));
    const fetchMock = vi.fn(async () => htmlResponse('<head><meta property="og:title" content="Cached"></head>'));
    vi.stubGlobal('fetch', fetchMock);

    await resolveLinkPreviewMetadata('https://example.com/post');
    await resolveLinkPreviewMetadata('https://example.com/post');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('失败结果只短期缓存，过期后重新请求', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T00:00:00Z'));
    const fetchMock = vi.fn(async () => htmlResponse('missing', 500));
    vi.stubGlobal('fetch', fetchMock);

    await resolveLinkPreviewMetadata('https://example.com/post');
    await resolveLinkPreviewMetadata('https://example.com/post');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-05-20T00:02:01Z'));
    await resolveLinkPreviewMetadata('https://example.com/post');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fetch 超时会返回 timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T00:00:00Z'));
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = resolveLinkPreviewMetadata('https://example.com/slow');
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(pending).resolves.toEqual({ payload: null, error: 'timeout' });
  });

  it('body 读取不返回时由总 deadline 收束为 timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T00:00:00Z'));
    const stream = new ReadableStream<Uint8Array>({
      pull: () => new Promise(() => {}),
    });
    const fetchMock = vi.fn(async () => new Response(stream, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = resolveLinkPreviewMetadata('https://example.com/slow-body');
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(pending).resolves.toEqual({ payload: null, error: 'timeout' });
  });

  it('reader.cancel 卡住也不会阻塞已读取前缀的解析结果', async () => {
    const prefix = '<head><meta property="og:title" content="Big Prefix"></head>';
    const bytes = new Uint8Array(513 * 1024);
    bytes.fill(32);
    bytes.set(new TextEncoder().encode(prefix));
    const stream = new ReadableStream<Uint8Array>({
      /** 首个 chunk 超过读取上限，让 resolver 立即进入 cancel 清理路径。 */
      start: (controller) => {
        controller.enqueue(bytes);
      },
      cancel: () => new Promise(() => {}),
    });
    const fetchMock = vi.fn(async () => new Response(stream, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveLinkPreviewMetadata('https://example.com/big')).resolves.toMatchObject({
      payload: { title: 'Big Prefix' },
    });
  });

  it('metadata 太靠后时只读取有限 HTML 前缀并稳定降级', async () => {
    const lateTitle = '<head><meta property="og:title" content="Late Metadata"></head>';
    const bytes = new Uint8Array((512 * 1024) + lateTitle.length + 1);
    bytes.fill(32);
    bytes.set(new TextEncoder().encode(lateTitle), (512 * 1024) + 1);
    const fetchMock = vi.fn(async () => new Response(bytes, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveLinkPreviewMetadata('https://example.com/late')).resolves.toMatchObject({
      payload: {
        hostname: 'example.com',
        title: null,
      },
      error: 'empty-metadata',
    });
  });

  it('timeout 不写入缓存，下一次请求可以重新访问网络', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T00:00:00Z'));
    const fetchMock = vi.fn()
      .mockImplementationOnce((_url: string, _init?: RequestInit) => new Promise<Response>(() => {}))
      .mockResolvedValueOnce(htmlResponse('<head><meta property="og:title" content="Recovered"></head>'));
    vi.stubGlobal('fetch', fetchMock);

    const timedOut = resolveLinkPreviewMetadata('https://example.com/slow');
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(timedOut).resolves.toEqual({ payload: null, error: 'timeout' });

    await expect(resolveLinkPreviewMetadata('https://example.com/slow')).resolves.toMatchObject({
      payload: { title: 'Recovered' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
