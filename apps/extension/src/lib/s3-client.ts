/**
 * 说明：`s3-client` 基础能力模块。
 *
 * 职责：
 * - 承载 `s3-client` 相关的当前文件实现与模块边界；
 * - 对外暴露 `S3Config`、`putObject`、`getObject` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 最小化的 S3 兼容客户端（AWS Signature V4 签名）。
 * 可运行在浏览器 / Chrome 扩展环境（无 Node.js 依赖）。
 * 支持：PutObject、GetObject、ListObjectsV2、DeleteObject。
 */

import { I18nError } from '@/lib/i18n/error';

/** S3 兼容存储配置（用于 Signature V4 签名与请求拼装） */
export interface S3Config {
  /** Endpoint（例如 "https://s3.amazonaws.com" 或 "https://\<account\>.r2.cloudflarestorage.com"） */
  endpoint: string;
  /** 区域（例如 "us-east-1"；部分 S3 兼容实现会忽略，但签名仍需要） */
  region: string;
  /** Bucket 名称 */
  bucket: string;
  /** Access Key ID（访问密钥 ID；与 secretAccessKey 成对使用） */
  accessKeyId: string;
  /** Secret Access Key（访问密钥 Secret；与 accessKeyId 成对使用） */
  secretAccessKey: string;
  /** 可选：备份目录前缀（不会参与签名，仅用于调用方拼 key） */
  root?: string;
}

/** S3 兼容服务常见 XML 错误字段。 */
interface ParsedS3ServiceError {
  /** 服务端错误码，例如 `NoSuchKey`。 */
  code?: string;
  /** 服务端消息，例如 `The specified key does not exist.`。 */
  message?: string;
  /** 服务端返回的资源标识。 */
  resource?: string;
  /** 服务端返回的请求 ID。 */
  requestId?: string;
  /** 兼容实现返回的 TraceId（例如腾讯云 COS）。 */
  traceId?: string;
  /** AWS S3 常见的 HostId。 */
  hostId?: string;
}

// ---------- 工具函数 ----------

const encoder = new TextEncoder();

/**
 * 使用 HMAC-SHA256 对消息进行签名。
 *
 * @param key - 原始密钥字节。
 * @param message - 待签名文本。
 * @returns HMAC 签名结果。
 */
async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
}

/**
 * 计算内容的 SHA-256 十六进制摘要。
 *
 * @param data - 待摘要的数据。
 * @returns 十六进制摘要字符串。
 */
async function sha256(data: ArrayBuffer | string): Promise<string> {
  const buf = typeof data === 'string' ? encoder.encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return hexEncode(hash);
}

/**
 * 将二进制缓冲区编码为十六进制字符串。
 *
 * @param buf - 原始缓冲区。
 * @returns 小写十六进制字符串。
 */
function hexEncode(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 生成当前请求所需的 AWS 日期字符串。
 *
 * @returns 同时包含 `dateStamp` 与 `amzDate` 的对象。
 */
function getDateStrings() {
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, ''); // 日期戳格式：YYYYMMDD
  const amzDate = dateStamp + 'T' + now.toISOString().slice(11, 19).replace(/:/g, '') + 'Z'; // 时间戳格式：YYYYMMDDTHHmmssZ（UTC）
  return { dateStamp, amzDate };
}

/**
 * 按 AWS Canonical URI 规则编码路径/查询字段。
 *
 * @param str - 原始字符串。
 * @param encodeSlash - 是否同时编码 `/`。
 * @returns 编码后的结果。
 */
function uriEncode(str: string, encodeSlash = true): string {
  return str.split('').map(ch => {
    if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === '_' || ch === '-' || ch === '~' || ch === '.') {
      return ch;
    }
    if (ch === '/' && !encodeSlash) return ch;
    const code = ch.charCodeAt(0);
    if (code <= 0x7f) return `%${code.toString(16).toUpperCase().padStart(2, '0')}`;
    return encodeURIComponent(ch);
  }).join('');
}

/**
 * 将服务端原始文本压成适合 toast 展示的一行详情。
 *
 * @param text - 原始错误文本。
 * @returns 压缩空白后的单行文本。
 */
function collapseS3ErrorText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 解码 S3 XML 错误响应里的常见实体。
 *
 * @param text - 原始 XML 字段值。
 * @returns 解码后的文本。
 */
function decodeS3XmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * 从 S3 XML 错误响应里提取指定字段。
 *
 * @param xml - 原始 XML 文本。
 * @param tagName - 字段标签名。
 * @returns 去空白并解码后的字段值；若不存在则返回空串。
 */
function extractS3XmlTag(xml: string, tagName: string): string {
  const match = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i').exec(xml);
  const value = match?.[1];
  return value ? collapseS3ErrorText(decodeS3XmlEntities(value)) : '';
}

/**
 * 解析 S3 兼容服务的标准 XML 错误响应。
 *
 * 参考：
 * - AWS S3 REST Error Responses 文档定义了 `Code / Message / Resource / RequestId / HostId`。
 * - 腾讯云 COS 错误响应会在相同结构下追加 `TraceId`。
 *
 * @param xml - 服务端返回的原始文本。
 * @returns 命中的标准错误字段；若不是可识别的 XML 错误响应则返回 `null`。
 */
function parseS3ServiceError(xml: string): ParsedS3ServiceError | null {
  if (!/<Error[\s>]/i.test(xml)) return null;

  const parsed: ParsedS3ServiceError = {
    code: extractS3XmlTag(xml, 'Code') || undefined,
    message: extractS3XmlTag(xml, 'Message') || undefined,
    resource: extractS3XmlTag(xml, 'Resource') || undefined,
    requestId: extractS3XmlTag(xml, 'RequestId') || undefined,
    traceId: extractS3XmlTag(xml, 'TraceId') || undefined,
    hostId: extractS3XmlTag(xml, 'HostId') || undefined,
  };

  return Object.values(parsed).some(Boolean) ? parsed : null;
}

/**
 * 将 S3 兼容错误响应格式化为一条适合用户直接阅读的诊断详情。
 *
 * @param rawText - 原始响应文本。
 * @param fallbackStatusText - HTTP status text 兜底文案。
 * @returns 优先使用标准错误字段拼出的详情；若无法解析，则回退到压缩后的原始文本。
 */
function formatS3ErrorDetail(rawText: string, fallbackStatusText = ''): string {
  const parsed = parseS3ServiceError(rawText);
  if (parsed) {
    const parts = [
      parsed.code ? `Code=${parsed.code}` : '',
      parsed.message ? `Message=${parsed.message}` : '',
      parsed.resource ? `Resource=${parsed.resource}` : '',
      parsed.requestId ? `RequestId=${parsed.requestId}` : '',
      parsed.traceId ? `TraceId=${parsed.traceId}` : '',
      parsed.hostId ? `HostId=${parsed.hostId}` : '',
    ].filter(Boolean);

    if (parts.length > 0) return parts.join('; ');
  }

  const fallbackText = collapseS3ErrorText(rawText || fallbackStatusText || '');
  return fallbackText ? fallbackText.slice(0, 500) : 'Unknown error';
}

/**
 * 从非 2xx S3 响应里读取服务端细节并抛出 I18nError。
 *
 * @param response - 失败的 HTTP 响应。
 * @param errorKey - 面向 UI 的错误 key。
 * @throws I18nError 总是抛出。
 */
async function throwS3HttpError(response: Response, errorKey: string): Promise<never> {
  const rawText = await response.text().catch(() => '');
  const detail = formatS3ErrorDetail(rawText, response.statusText);
  throw new I18nError(errorKey, { status: response.status, detail });
}

// ---------- AWS Signature V4（签名） ----------

/**
 * 派生 AWS Signature V4 最终签名密钥。
 *
 * @param secretKey - Secret Access Key。
 * @param dateStamp - 日期戳。
 * @param region - 区域。
 * @param service - 服务名。
 * @returns 派生后的签名密钥。
 */
async function getSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(encoder.encode(`AWS4${secretKey}`).buffer as ArrayBuffer, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

/** 已完成签名的请求参数（可直接用于 fetch） */
interface SignedRequestInit {
  /** HTTP 方法 */
  method: string;
  /** 完整 URL（包含 query string） */
  url: string;
  /** 签名后的请求头（不包含 host；fetch 会自动补全） */
  headers: Record<string, string>;
  /** 可选：请求体 */
  body?: string | ArrayBuffer;
}

/**
 * 为指定 S3 请求生成 Signature V4 签名。
 *
 * @param config - S3 连接配置。
 * @param method - HTTP 方法。
 * @param path - 已拼好的桶内路径。
 * @param queryParams - 查询参数。
 * @param headers - 额外请求头。
 * @param body - 可选请求体。
 * @returns 可直接传给 `fetch` 的签名请求参数。
 */
async function signRequest(
  config: S3Config,
  method: string,
  path: string,
  queryParams: Record<string, string> = {},
  headers: Record<string, string> = {},
  body: string | ArrayBuffer | Uint8Array | undefined = undefined,
): Promise<SignedRequestInit> {
  const { dateStamp, amzDate } = getDateStrings();
  const service = 's3';
  const { region, accessKeyId, secretAccessKey } = config;

  // 构造 URL
  const baseUrl = config.endpoint.replace(/\/+$/, '');
  const encodedPath = uriEncode(path, false);
  const queryString = Object.keys(queryParams)
    .sort()
    .map(k => `${uriEncode(k)}=${uriEncode(queryParams[k])}`)
    .join('&');
  const url = queryString ? `${baseUrl}${encodedPath}?${queryString}` : `${baseUrl}${encodedPath}`;

  // 从 endpoint 解析 host
  const urlObj = new URL(baseUrl);
  const host = urlObj.host;

  const normalizedBody =
    body instanceof Uint8Array
      ? body.slice().buffer
      : body;

  // 请求体哈希
  const payloadHash = normalizedBody != null
    ? await sha256(typeof normalizedBody === 'string' ? normalizedBody : normalizedBody)
    : await sha256('');

  // 参与签名的请求头
  const allHeaders: Record<string, string> = {
    host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    ...headers,
  };

  const signedHeaderKeys = Object.keys(allHeaders).map(k => k.toLowerCase()).sort();
  const signedHeaders = signedHeaderKeys.join(';');

  const canonicalHeaders = signedHeaderKeys.map(k => `${k}:${allHeaders[k] ?? (allHeaders as Record<string,string>)[Object.keys(allHeaders).find(h => h.toLowerCase() === k)!]}\n`).join('');

  // 规范化请求（Canonical Request）
  const canonicalRequest = [
    method,
    encodedPath,
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  // 待签名字符串
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join('\n');

  // 派生签名密钥并生成签名
  const signingKey = await getSigningKey(secretAccessKey, dateStamp, region, service);
  const signatureBuffer = await hmacSha256(signingKey, stringToSign);
  const signature = hexEncode(signatureBuffer);

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  // 构造最终请求头（排除 host：fetch 会自动补充）
  const outHeaders: Record<string, string> = {};
  for (const k of Object.keys(allHeaders)) {
    if (k.toLowerCase() === 'host') continue;
    outHeaders[k] = allHeaders[k];
  }
  outHeaders['Authorization'] = authorization;

  return { method, url, headers: outHeaders, body: normalizedBody };
}

// ---------- 对外 API ----------

/**
 * 上传（PUT）对象到 S3。
 */
export async function putObject(config: S3Config, key: string, body: string | Uint8Array, contentType = 'application/json') {
  const path = `/${config.bucket}/${key.replace(/^\/+/, '')}`;
  const req = await signRequest(config, 'PUT', path, {}, { 'content-type': contentType }, body);
  const resp = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
  if (!resp.ok) {
    await throwS3HttpError(resp, 'errors.s3PutFailedWithDetail');
  }
  return resp;
}

/**
 * 下载（GET）S3 对象内容（返回文本）。
 */
export async function getObject(config: S3Config, key: string): Promise<string> {
  const path = `/${config.bucket}/${key.replace(/^\/+/, '')}`;
  const req = await signRequest(config, 'GET', path);
  const resp = await fetch(req.url, { method: req.method, headers: req.headers });
  if (!resp.ok) {
    await throwS3HttpError(resp, 'errors.s3GetFailedWithDetail');
  }
  return resp.text();
}

/**
 * 下载（GET）S3 对象内容（返回 Blob）。
 *
 * @param config - S3 连接配置。
 * @param key - 目标对象 key。
 * @returns 目标对象的 Blob。
 */
export async function getObjectBlob(config: S3Config, key: string): Promise<Blob> {
  const path = `/${config.bucket}/${key.replace(/^\/+/, '')}`;
  const req = await signRequest(config, 'GET', path);
  const resp = await fetch(req.url, { method: req.method, headers: req.headers });
  if (!resp.ok) {
    await throwS3HttpError(resp, 'errors.s3GetFailedWithDetail');
  }
  return resp.blob();
}

/**
 * 删除 S3 对象。
 */
export async function deleteObject(config: S3Config, key: string) {
  const path = `/${config.bucket}/${key.replace(/^\/+/, '')}`;
  const req = await signRequest(config, 'DELETE', path);
  const resp = await fetch(req.url, { method: req.method, headers: req.headers });
  if (!resp.ok && resp.status !== 204) {
    await throwS3HttpError(resp, 'errors.s3DeleteFailedWithDetail');
  }
  return resp;
}

/** ListObjectsV2 解析后返回的单个对象条目。 */
export interface S3Object {
  /** 对象 Key（包含 prefix） */
  key: string;
  /** 最后修改时间（ISO 字符串） */
  lastModified: string;
  /** 对象大小（字节） */
  size: number;
}

/**
 * 从 XML 文本中读取单个标签内容。
 *
 * @param xml - 原始 XML 文本。
 * @param tagName - 目标标签名。
 * @returns 解码后的标签内容；不存在时返回空串。
 */
function extractXmlTag(xml: string, tagName: string): string {
  const value = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i').exec(xml)?.[1] ?? '';
  return value ? decodeS3XmlEntities(value).trim() : '';
}

/**
 * 判断 ListObjectsV2 响应是否还有下一页。
 *
 * @param xml - 原始 ListObjectsV2 XML 响应。
 * @returns 服务端声明 `IsTruncated=true` 时返回 true。
 */
function isListObjectsTruncated(xml: string): boolean {
  return /^true$/i.test(extractXmlTag(xml, 'IsTruncated'));
}

/**
 * 列出桶内对象（ListObjectsV2），可选按 prefix 过滤。
 *
 * 说明：
 * - 远端备份恢复依赖完整版本清单，所以这里必须消费分页；
 * - 每页请求 1000 个对象，直到服务端不再返回 `NextContinuationToken`；
 * - 若服务端声明还有下一页但不返回 token，则停止在当前结果并避免死循环。
 */
export async function listObjects(config: S3Config, prefix = ''): Promise<S3Object[]> {
  const path = `/${config.bucket}`;
  const objects: S3Object[] = [];
  let continuationToken = '';

  do {
    const params: Record<string, string> = { 'list-type': '2', 'max-keys': '1000' };
    if (prefix) params['prefix'] = prefix;
    if (continuationToken) params['continuation-token'] = continuationToken;

    const req = await signRequest(config, 'GET', path, params);
    const resp = await fetch(req.url, { method: req.method, headers: req.headers });
    if (!resp.ok) {
      await throwS3HttpError(resp, 'errors.s3ListFailedWithDetail');
    }

    const xml = await resp.text();
    objects.push(...parseListObjectsResponse(xml));
    continuationToken = isListObjectsTruncated(xml) ? extractXmlTag(xml, 'NextContinuationToken') : '';
  } while (continuationToken);

  return objects;
}

/**
 * 解析 ListObjectsV2 XML 响应。
 *
 * @param xml - 原始 XML 文本。
 * @returns 解析出的对象列表。
 */
function parseListObjectsResponse(xml: string): S3Object[] {
  const objects: S3Object[] = [];
  // 不依赖 DOMParser 的简易 XML 解析（Service Worker 中也可用）
  const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match: RegExpExecArray | null;
  while ((match = contentsRegex.exec(xml)) !== null) {
    const block = match[1];
    const key = extractXmlTag(block, 'Key');
    const lastModified = extractXmlTag(block, 'LastModified');
    const size = parseInt(extractXmlTag(block, 'Size') || '0', 10);
    if (key) objects.push({ key, lastModified, size });
  }
  return objects;
}

/**
 * 通过列出对象（最多 1 个）来测试连接是否可用。
 *
 * 说明：
 * - 连接测试必须把服务端标准错误细节保留下来，避免 UI 只能提示“无法访问存储桶”；
 * - 非 2xx 会直接抛出带 `Code / Message / Resource / RequestId / TraceId / HostId` 细节的 `I18nError`。
 */
export async function testConnection(config: S3Config): Promise<void> {
  const path = `/${config.bucket}`;
  const params: Record<string, string> = { 'list-type': '2', 'max-keys': '1' };
  const req = await signRequest(config, 'GET', path, params);
  const resp = await fetch(req.url, { method: req.method, headers: req.headers });
  if (!resp.ok) {
    await throwS3HttpError(resp, 'errors.s3ConnectionFailedWithDetail');
  }
}
