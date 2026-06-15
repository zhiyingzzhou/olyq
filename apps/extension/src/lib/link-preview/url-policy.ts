/**
 * 说明：`url-policy` 链接预览 URL 安全策略模块。
 *
 * 职责：
 * - 为链接预览所有网络目标提供统一公网 `http/https` 校验；
 * - 拒绝本机、环回、私网、链路本地、文档保留地址与 mDNS `.local` host；
 *
 * 边界：
 * - 本文件只做 URL 语法与字面 host 策略判断，不发起 DNS 解析或网络请求；
 * - Service Worker 抓取目标与 UI 图片预览 URL 都必须复用这里的判定。
 */
import type { LinkPreviewErrorCode } from './types';

/** 归一化后的公网链接预览 URL。 */
export interface NormalizedLinkPreviewUrl {
  /** 标准化后的 URL 字符串。 */
  readonly url: string;
}

/**
 * 归一化并校验链接预览 URL。
 *
 * @param rawUrl - 原始 URL。
 * @returns 成功时返回标准 URL；失败时返回稳定错误码。
 */
export function normalizeLinkPreviewUrl(rawUrl: string): NormalizedLinkPreviewUrl | { error: LinkPreviewErrorCode } {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { error: 'invalid-url' };
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { error: 'unsupported-protocol' };
    if (isBlockedLinkPreviewHostname(parsed.hostname)) return { error: 'blocked-local-url' };
    return { url: parsed.toString() };
  } catch {
    return { error: 'invalid-url' };
  }
}

/**
 * 基于页面 URL 解析并校验预览子资源 URL。
 *
 * @param rawUrl - HTML metadata 中声明的原始 URL，可为相对地址。
 * @param baseUrl - 已通过安全策略校验的页面 URL。
 * @returns 允许 UI 加载的公网 `http/https` URL；不允许时返回 `null`。
 */
export function resolveLinkPreviewSubresourceUrl(rawUrl: string, baseUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim(), baseUrl);
    const normalized = normalizeLinkPreviewUrl(parsed.toString());
    return 'error' in normalized ? null : normalized.url;
  } catch {
    return null;
  }
}

/**
 * 判断链接预览是否应拒绝某个 hostname。
 *
 * @remarks
 * 这里不做 DNS 解析；如果公网域名在 DNS 层解析到内网地址，浏览器扩展没有稳定 DNS API
 * 可在这个模块内复核。当前策略覆盖 URL 字面 host 与浏览器 URL parser 会归一化出的 IP 形态。
 *
 * @param hostname - URL 解析得到的 hostname。
 * @returns 应拒绝时返回 `true`。
 */
export function isBlockedLinkPreviewHostname(hostname: string): boolean {
  const host = normalizePolicyHostname(hostname);
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;

  const ipv4 = parseIpv4Address(host);
  if (ipv4) return isNonPublicIpv4Address(ipv4);

  return isNonPublicIpv6Address(host);
}

/**
 * 归一化用于安全策略判断的 hostname。
 *
 * @param hostname - URL parser 返回的 hostname。
 * @returns 去掉 IPv6 方括号和尾点的小写 host。
 */
function normalizePolicyHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\.$/, '');
}

/**
 * 解析点分十进制 IPv4 地址。
 *
 * @param host - 已归一化的 host。
 * @returns 四段整数；不是标准 IPv4 时返回 `null`。
 */
function parseIpv4Address(host: string): readonly [number, number, number, number] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return Number.NaN;
    return Number(part);
  });
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null;
  return octets as [number, number, number, number];
}

/**
 * 判断 IPv4 地址是否不是公网单播地址。
 *
 * @param octets - IPv4 四段整数。
 * @returns 内网、环回、链路本地、文档保留、组播或保留地址时返回 `true`。
 */
function isNonPublicIpv4Address(octets: readonly [number, number, number, number]): boolean {
  const [a, b, c] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && c === 2)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

/**
 * 判断 IPv6 地址是否不是公网单播地址。
 *
 * @param host - 已归一化的 host。
 * @returns 环回、未指定、ULA、链路本地或映射到非公网 IPv4 时返回 `true`。
 */
function isNonPublicIpv6Address(host: string): boolean {
  if (!host.includes(':')) return false;
  if (host === '::' || host === '::1') return true;
  const [firstHextet = '', secondHextet = ''] = host.split(':');
  const ipv4Mapped = /^::ffff:(.+)$/i.exec(host);
  if (ipv4Mapped?.[1]) {
    const ipv4 = parseIpv4Address(ipv4Mapped[1]);
    return ipv4 ? isNonPublicIpv4Address(ipv4) : true;
  }
  if (host.startsWith('::')) return true;
  if (/^f[cd][0-9a-f]{0,2}$/i.test(firstHextet)) return true;
  if (/^fe[89ab][0-9a-f]?$/i.test(firstHextet)) return true;
  if (/^ff[0-9a-f]{0,2}$/i.test(firstHextet)) return true;
  if (firstHextet === '100') return true;
  if (firstHextet === '2001' && secondHextet === 'db8') return true;
  return false;
}
