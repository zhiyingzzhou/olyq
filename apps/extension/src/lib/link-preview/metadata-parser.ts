/**
 * 说明：`metadata-parser` 链接预览解析模块。
 *
 * 职责：
 * - 从有限 HTML 文本中提取 Open Graph / Twitter / 基础 HTML 元数据；
 * - 将标题、描述和图片 URL 归一化为 UI 可安全消费的结构化字段；
 *
 * 边界：
 * - 本文件不发起网络请求、不保存原始 HTML、不读取浏览器扩展 API；
 * - 解析逻辑只服务链接预览，不承担正文提取或网页分析。
 */
import type { LinkPreviewMetadata } from './types';
import { normalizeLinkPreviewUrl, resolveLinkPreviewSubresourceUrl } from './url-policy';

const TITLE_MAX_LENGTH = 180;
const DESCRIPTION_MAX_LENGTH = 320;
const SHORT_TEXT_MAX_LENGTH = 180;

/** 元数据解析输入。 */
interface ParseLinkPreviewMetadataArgs {
  /** 用户请求 URL。 */
  readonly requestedUrl: string;
  /** `fetch` 跟随重定向后的最终 URL。 */
  readonly finalUrl: string;
  /** 有限读取的 HTML 文本。 */
  readonly html: string;
  /** 解析完成时间戳。 */
  readonly fetchedAt: number;
}

/**
 * 从 HTML 中解析链接预览元数据。
 *
 * @param args - 解析所需的 URL 与 HTML 文本。
 * @returns 可展示的结构化预览元数据。
 */
export function parseLinkPreviewMetadata(args: ParseLinkPreviewMetadataArgs): LinkPreviewMetadata {
  const baseUrl = normalizeHttpUrl(args.finalUrl) ?? normalizeHttpUrl(args.requestedUrl) ?? args.requestedUrl;
  const hostname = resolveHostname(baseUrl);
  const headHtml = extractHeadHtml(args.html);
  const meta = collectMetaTags(headHtml);
  const titleTag = extractTitleText(headHtml);
  const title = pickFirstText(meta, ['og:title', 'twitter:title'], TITLE_MAX_LENGTH) ?? normalizeText(titleTag, TITLE_MAX_LENGTH);
  const description = pickFirstText(
    meta,
    ['og:description', 'twitter:description', 'description'],
    DESCRIPTION_MAX_LENGTH,
  );
  const rawImageUrl = pickFirstText(meta, ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'], 2048);
  const imageUrl = rawImageUrl ? resolveLinkPreviewSubresourceUrl(rawImageUrl, baseUrl) : null;
  const imageAlt = pickFirstText(meta, ['og:image:alt', 'og:imagealt', 'twitter:image:alt'], SHORT_TEXT_MAX_LENGTH);
  const siteName = pickFirstText(meta, ['og:site_name', 'application-name', 'twitter:site'], SHORT_TEXT_MAX_LENGTH);

  return {
    url: normalizeHttpUrl(args.requestedUrl) ?? args.requestedUrl,
    finalUrl: baseUrl,
    hostname,
    title,
    description,
    imageUrl,
    imageAlt,
    siteName,
    fetchedAt: args.fetchedAt,
  };
}

/**
 * 判断解析结果是否包含除 URL / hostname 以外的有效预览信息。
 *
 * @param metadata - 待判断的预览元数据。
 * @returns 存在标题、描述、图片或站点名时返回 `true`。
 */
export function hasMeaningfulLinkPreviewMetadata(metadata: LinkPreviewMetadata): boolean {
  return Boolean(
    metadata.title
    || metadata.description
    || metadata.imageUrl
    || metadata.siteName
  );
}

/**
 * 从 HTML 中截取 `<head>` 区域。
 *
 * @param html - 有限读取的 HTML 文本。
 * @returns `<head>` 内容；未找到时返回原文本，允许解析前置 meta。
 */
function extractHeadHtml(html: string): string {
  const headMatch = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html);
  if (headMatch?.[1]) return headMatch[1];
  const closingHeadIndex = html.search(/<\/head>/i);
  if (closingHeadIndex >= 0) return html.slice(0, closingHeadIndex);
  return html;
}

/**
 * 收集 HTML head 内的 meta 标签。
 *
 * @param headHtml - 待扫描的 head HTML。
 * @returns 小写 meta key 到首个 content 值的映射。
 */
function collectMetaTags(headHtml: string): Map<string, string> {
  const meta = new Map<string, string>();
  const metaTagPattern = /<meta\b[^>]*>/gi;
  for (const match of headHtml.matchAll(metaTagPattern)) {
    const attributes = parseAttributes(match[0]);
    const key = (attributes.get('property') ?? attributes.get('name') ?? '').trim().toLowerCase();
    const content = attributes.get('content');
    if (!key || content === undefined || meta.has(key)) continue;
    const normalized = normalizeText(content, 2048);
    if (normalized) meta.set(key, normalized);
  }
  return meta;
}

/**
 * 解析单个 HTML 标签上的属性键值。
 *
 * @param tagHtml - 单个标签文本。
 * @returns 小写属性名到解码后属性值的映射。
 */
function parseAttributes(tagHtml: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const attributePattern = /([^\s"'=<>`]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tagHtml.matchAll(attributePattern)) {
    const name = String(match[1] || '').trim().toLowerCase();
    if (!name || attributes.has(name)) continue;
    attributes.set(name, decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return attributes;
}

/**
 * 提取 HTML title 文本。
 *
 * @param headHtml - 待扫描的 head HTML。
 * @returns 解码后的标题文本；不存在时返回 `null`。
 */
function extractTitleText(headHtml: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(headHtml);
  if (!match?.[1]) return null;
  return decodeHtmlEntities(stripHtmlTagsFromText(match[1]));
}

/**
 * 从短 HTML 片段里提取文本，忽略标签内容边界。
 *
 * @remarks
 * 链接预览只读取有限 head 前缀；这里不做完整 DOM 解析，只用线性扫描删除标签，
 * 避免正则多字符清洗对畸形标签产生不完整处理。
 *
 * @param html - 原始 HTML 片段。
 * @returns 去掉标签后的文本。
 */
function stripHtmlTagsFromText(html: string): string {
  let out = '';
  let insideTag = false;
  for (const char of html) {
    if (char === '<') {
      insideTag = true;
      continue;
    }
    if (char === '>') {
      insideTag = false;
      continue;
    }
    if (!insideTag) out += char;
  }
  return out;
}

/**
 * 按优先级读取首个非空 meta 字段。
 *
 * @param meta - 已收集的 meta 字段映射。
 * @param keys - 优先级从高到低排列的字段名。
 * @param maxLength - 最大展示长度。
 * @returns 归一化后的文本；都为空时返回 `null`。
 */
function pickFirstText(meta: Map<string, string>, keys: readonly string[], maxLength: number): string | null {
  for (const key of keys) {
    const value = normalizeText(meta.get(key) ?? '', maxLength);
    if (value) return value;
  }
  return null;
}

/**
 * 归一化 UI 展示文本。
 *
 * @param value - 原始文本。
 * @param maxLength - 最大展示长度。
 * @returns 去除多余空白并裁剪后的文本；空文本返回 `null`。
 */
function normalizeText(value: string | null | undefined, maxLength: number): string | null {
  const decoded = decodeHtmlEntities(String(value ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
  if (!decoded) return null;
  if (decoded.length <= maxLength) return decoded;
  return decoded.slice(0, Math.max(0, maxLength - 1)).trimEnd();
}

/**
 * 解码常见 HTML 实体。
 *
 * @param value - 原始 HTML 属性或文本值。
 * @returns 解码后的字符串。
 */
function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    const normalized = body.toLowerCase();
    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    return namedEntities[normalized] ?? entity;
  });
}

/**
 * 解析并归一化公网 http/https URL。
 *
 * @param raw - 原始 URL。
 * @returns 标准 URL 字符串；不符合链接预览公网策略时返回 `null`。
 */
function normalizeHttpUrl(raw: string): string | null {
  const normalized = normalizeLinkPreviewUrl(raw);
  return 'error' in normalized ? null : normalized.url;
}

/**
 * 从 URL 中解析展示用 hostname。
 *
 * @param raw - 原始 URL。
 * @returns URL hostname；解析失败时返回原始 URL。
 */
function resolveHostname(raw: string): string {
  try {
    return new URL(raw).hostname;
  } catch {
    return raw;
  }
}
