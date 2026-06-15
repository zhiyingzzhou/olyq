/**
 * 说明：`oauth-protocol` 基础能力模块。
 *
 * 职责：
 * - 承载 MCP OAuth 2.1 的底层协议细节；
 * - 统一处理安全 URL 校验、metadata discovery、DCR、PKCE 与 token exchange；
 * - 为高层缓存编排模块提供稳定、可复用的协议 helper。
 *
 * 边界：
 * - 本文件不读写 OAuth cache；
 * - 本文件不直接决定何时允许交互授权，由上层调用方控制。
 */

import type {
  McpAuthorizationServerMetadata,
  McpOAuthCacheEntry,
  McpOAuthClientIdentity,
  McpProtectedResourceMetadata,
  McpServerConfig,
} from '@/types/mcp';
import { getExtensionIdentity } from '@/lib/extension/runtime-api';

const DEFAULT_DYNAMIC_CLIENT_NAME = 'Olyq Browser Extension';

/**
 * Bearer challenge 里当前会消费的参数子集。
 *
 * 说明：
 * - 这里只保留 MCP OAuth 当前真正需要的字段；
 * - 其余 challenge 参数不会进入扩展内部真相。
 */
export type BearerChallenge = {
  scope?: string;
  resource?: string;
  authorizationUri?: string;
  resourceMetadata?: string;
};

/**
 * 把 `ArrayBuffer` 编码成 base64。
 *
 * @param buffer - 待编码的二进制内容。
 * @returns 标准 base64 字符串。
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const slice = bytes.subarray(index, Math.min(bytes.length, index + chunkSize));
    binary += String.fromCharCode(...Array.from(slice));
  }
  return btoa(binary);
}

/**
 * 把标准 base64 转成 URL-safe 形式。
 *
 * @param base64 - 标准 base64 文本。
 * @returns 去掉 padding 后的 URL-safe 文本。
 */
function base64ToUrlSafe(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * 生成 URL-safe 随机串。
 *
 * @param bytesLength - 原始随机字节长度。
 * @returns URL-safe 随机串。
 */
function randomUrlSafe(bytesLength: number): string {
  const bytes = new Uint8Array(bytesLength);
  globalThis.crypto.getRandomValues(bytes);
  return base64ToUrlSafe(arrayBufferToBase64(bytes.buffer));
}

/**
 * 计算输入文本的 SHA-256 URL-safe 摘要。
 *
 * @param input - 原始输入文本。
 * @returns URL-safe 编码后的 SHA-256 摘要。
 */
async function sha256UrlSafe(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(input));
  return base64ToUrlSafe(arrayBufferToBase64(digest));
}

/**
 * 判断 hostname 是否属于 loopback。
 *
 * @param hostname - 待判断的 hostname。
 * @returns 当前地址是否属于 `localhost / 127.0.0.1 / ::1`。
 */
function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '[::1]' || normalized === '::1';
}

/**
 * 判断 hostname 是否是私网 IPv4。
 *
 * @param hostname - 待判断的 hostname。
 * @returns 当前 hostname 是否命中 RFC1918/链路本地私网。
 */
function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/**
 * 判断 OAuth 相关 URL 是否满足当前安全约束。
 *
 * @param url - 已经解析好的 URL。
 * @returns 仅当 URL 是 HTTPS，或 loopback HTTP 时返回 `true`。
 */
function isSafeOAuthUrl(url: URL): boolean {
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:' && isLoopbackHostname(url.hostname)) return true;
  return false;
}

/**
 * 校验并返回可安全使用的 OAuth URL。
 *
 * @param rawUrl - 原始 URL 文本。
 * @param label - 出错时用于提示的字段标签。
 * @returns 通过安全校验的 `URL` 实例。
 */
function assertSafeOAuthUrl(rawUrl: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${label} 不是合法 URL`);
  }

  if (url.protocol === 'http:' && !isLoopbackHostname(url.hostname)) {
    throw new Error(`${label} 只允许 HTTPS 或 loopback HTTP`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`${label} 只允许 HTTP(S)`);
  }
  if (isPrivateIpv4(url.hostname) && !isLoopbackHostname(url.hostname)) {
    throw new Error(`${label} 不允许指向非 loopback 私网地址`);
  }
  if (!isSafeOAuthUrl(url)) {
    throw new Error(`${label} 不满足当前 OAuth 安全约束`);
  }
  return url;
}

/**
 * 为 protected resource metadata 构建候选地址。
 *
 * @param serverUrl - MCP server 的 Streamable HTTP URL。
 * @param overrideUrl - 用户显式覆盖的 metadata URL。
 * @param challengeMetadataUrl - Bearer challenge 返回的 metadata URL。
 * @returns 去重后的 metadata URL 候选列表。
 */
function createProtectedResourceMetadataCandidates(
  serverUrl: string,
  overrideUrl?: string,
  challengeMetadataUrl?: string,
): string[] {
  const candidates = [overrideUrl, challengeMetadataUrl].filter((value): value is string => Boolean(value?.trim()));
  if (candidates.length > 0) return [...new Set(candidates)];

  const url = new URL(serverUrl);
  const pathname = url.pathname.replace(/^\//, '');
  if (pathname) {
    candidates.push(`${url.origin}/.well-known/oauth-protected-resource/${pathname}`);
  }
  candidates.push(`${url.origin}/.well-known/oauth-protected-resource`);
  return [...new Set(candidates)];
}

/**
 * 为 authorization server metadata 构建候选地址。
 *
 * @param issuerOrMetadataUrl - issuer 或已知 metadata URL。
 * @param overrideUrl - 用户显式覆盖的 metadata URL。
 * @returns 去重后的 metadata URL 候选列表。
 */
function createAuthorizationMetadataCandidates(issuerOrMetadataUrl: string, overrideUrl?: string): string[] {
  if (overrideUrl?.trim()) return [overrideUrl.trim()];

  const parsed = new URL(issuerOrMetadataUrl);
  if (parsed.pathname.includes('/.well-known/')) return [parsed.toString()];

  const pathname = parsed.pathname.replace(/\/$/, '').replace(/^\//, '');
  const candidates: string[] = [];
  if (pathname) {
    candidates.push(`${parsed.origin}/.well-known/oauth-authorization-server/${pathname}`);
    candidates.push(`${parsed.origin}/.well-known/openid-configuration/${pathname}`);
  }
  candidates.push(`${parsed.origin}/.well-known/oauth-authorization-server`);
  candidates.push(`${parsed.origin}/.well-known/openid-configuration`);
  return [...new Set(candidates)];
}

/**
 * 以 JSON 形式拉取 OAuth metadata。
 *
 * @param url - 待请求的 metadata URL。
 * @returns 解析后的 JSON 结果。
 */
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`请求 OAuth metadata 失败：${res.status} ${res.statusText}`);
  }
  return await res.json() as T;
}

/**
 * 发现受保护资源 metadata。
 *
 * @param server - 当前 MCP server 配置。
 * @param challenge - 可选 Bearer challenge。
 * @returns 命中的 metadata；没有发现时返回 `null`。
 */
export async function discoverProtectedResourceMetadata(
  server: McpServerConfig,
  challenge?: BearerChallenge,
): Promise<{ url: string; metadata: McpProtectedResourceMetadata } | null> {
  for (const candidate of createProtectedResourceMetadataCandidates(
    server.url,
    server.oauth.protectedResourceMetadataUrl,
    challenge?.resourceMetadata,
  )) {
    const safeUrl = assertSafeOAuthUrl(candidate, 'OAuth resource metadata');
    try {
      const raw = await fetchJson<Record<string, unknown>>(safeUrl.toString());
      const metadata: McpProtectedResourceMetadata = {
        resource: typeof raw.resource === 'string' ? raw.resource : undefined,
        authorizationServers: Array.isArray(raw.authorization_servers)
          ? raw.authorization_servers.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          : undefined,
        scopesSupported: Array.isArray(raw.scopes_supported)
          ? raw.scopes_supported.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          : undefined,
      };
      return { url: safeUrl.toString(), metadata };
    } catch {
      // 逐个候选兜底；全部失败后再交给上层回退。
    }
  }
  return null;
}

/**
 * 发现 authorization server metadata。
 *
 * @param issuerOrMetadataUrl - issuer 或已知 metadata URL。
 * @param overrideUrl - 用户显式覆盖的 metadata URL。
 * @returns 命中的 metadata 与实际请求 URL。
 */
export async function discoverAuthorizationServerMetadata(
  issuerOrMetadataUrl: string,
  overrideUrl?: string,
): Promise<{ url: string; metadata: McpAuthorizationServerMetadata }> {
  const candidates = createAuthorizationMetadataCandidates(issuerOrMetadataUrl, overrideUrl);
  for (const candidate of candidates) {
    const safeUrl = assertSafeOAuthUrl(candidate, 'OAuth authorization server metadata');
    try {
      const raw = await fetchJson<Record<string, unknown>>(safeUrl.toString());
      const issuer = typeof raw.issuer === 'string' ? raw.issuer.trim() : new URL(issuerOrMetadataUrl).origin;
      const authorizationEndpoint = typeof raw.authorization_endpoint === 'string' ? raw.authorization_endpoint.trim() : '';
      const tokenEndpoint = typeof raw.token_endpoint === 'string' ? raw.token_endpoint.trim() : '';
      if (!authorizationEndpoint || !tokenEndpoint) continue;

      assertSafeOAuthUrl(authorizationEndpoint, 'OAuth authorization endpoint');
      assertSafeOAuthUrl(tokenEndpoint, 'OAuth token endpoint');
      if (typeof raw.registration_endpoint === 'string' && raw.registration_endpoint.trim()) {
        assertSafeOAuthUrl(raw.registration_endpoint.trim(), 'OAuth registration endpoint');
      }

      return {
        url: safeUrl.toString(),
        metadata: {
          issuer,
          authorizationEndpoint,
          tokenEndpoint,
          registrationEndpoint: typeof raw.registration_endpoint === 'string' ? raw.registration_endpoint.trim() : undefined,
          revocationEndpoint: typeof raw.revocation_endpoint === 'string' ? raw.revocation_endpoint.trim() : undefined,
          scopesSupported: Array.isArray(raw.scopes_supported)
            ? raw.scopes_supported.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            : undefined,
        },
      };
    } catch {
      // 尝试下一个候选。
    }
  }
  throw new Error('未能发现 OAuth authorization server metadata');
}

/**
 * 计算当前 server 的 OAuth client namespace。
 *
 * @param server - 当前 MCP server 配置。
 * @returns 用于 cache 隔离的 client namespace。
 */
export function resolveClientNamespace(server: McpServerConfig): string {
  if (server.oauth.registrationStrategy === 'preregistered') {
    return `preregistered:${server.oauth.preregClientId || 'missing'}`;
  }
  return `dynamic:${server.oauth.dynamicClientName || DEFAULT_DYNAMIC_CLIENT_NAME}`;
}

/**
 * 计算本轮授权请求使用的 scope 字符串。
 *
 * @param server - 当前 MCP server 配置。
 * @param resourceMetadata - 可选 protected resource metadata。
 * @param challenge - 可选 Bearer challenge。
 * @returns 以空格拼接后的 scope 字符串。
 */
export function buildScopeString(
  server: McpServerConfig,
  resourceMetadata?: McpProtectedResourceMetadata,
  challenge?: BearerChallenge,
): string {
  const explicitScopes = server.oauth.scopes.filter(Boolean);
  if (explicitScopes.length > 0) return explicitScopes.join(' ');
  if (challenge?.scope?.trim()) return challenge.scope.trim();
  if (Array.isArray(resourceMetadata?.scopesSupported) && resourceMetadata.scopesSupported.length > 0) {
    return resourceMetadata.scopesSupported.join(' ');
  }
  return '';
}

/**
 * 解析 OAuth redirect URL 里的参数。
 *
 * @param redirectUrl - `launchWebAuthFlow` 回调返回的 redirect URL。
 * @returns 搜索参数或 hash 参数解析结果。
 */
function parseOAuthRedirectParams(redirectUrl: string): URLSearchParams {
  const url = new URL(redirectUrl);
  const searchParams = new URLSearchParams(url.search);
  if (searchParams.get('code') || searchParams.get('error')) return searchParams;
  if (url.hash) return new URLSearchParams(url.hash.replace(/^#/, ''));
  return searchParams;
}

/**
 * 读取扩展 OAuth redirect URL。
 *
 * @returns 当前扩展 runtime 返回的 redirect URL。
 */
export function getRedirectUrl(): string {
  const identity = getExtensionIdentity();
  if (!identity?.getRedirectURL) {
    throw new Error('当前运行时不支持 chrome.identity.getRedirectURL');
  }
  return identity.getRedirectURL('mcp-oauth');
}

/**
 * 通过扩展 runtime 启动交互式 OAuth 流程。
 *
 * @param url - 待打开的授权 URL。
 * @returns 最终回调的 redirect URL。
 */
function launchWebAuthFlow(url: string): Promise<string> {
  const identity = getExtensionIdentity();
  if (!identity?.launchWebAuthFlow) {
    throw new Error('当前运行时不支持 chrome.identity.launchWebAuthFlow');
  }

  return new Promise<string>((resolve, reject) => {
    identity.launchWebAuthFlow({ url, interactive: true }, (redirectedUrl) => {
      const lastError = chrome.runtime?.lastError;
      if (lastError || !redirectedUrl) {
        reject(new Error(lastError?.message || 'OAuth 授权被取消或失败'));
        return;
      }
      resolve(redirectedUrl);
    });
  });
}

/**
 * 从 `WWW-Authenticate` 头里解析 Bearer challenge。
 *
 * @param header - 原始 challenge 头。
 * @returns 扩展当前会消费的 Bearer challenge 子集。
 */
export function parseBearerChallenge(header: string | null): BearerChallenge | undefined {
  if (!header) return undefined;
  const bearerIndex = header.toLowerCase().indexOf('bearer ');
  if (bearerIndex < 0) return undefined;

  const paramsText = header.slice(bearerIndex + 7);
  const params: BearerChallenge = {};
  const matcher = /([a-zA-Z_]+)=("([^"]*)"|[^,\s]+)/g;
  for (const match of paramsText.matchAll(matcher)) {
    const key = match[1]?.toLowerCase();
    const value = (match[3] ?? match[2] ?? '').replace(/^"|"$/g, '').trim();
    if (!key || !value) continue;
    if (key === 'scope') params.scope = value;
    if (key === 'resource') params.resource = value;
    if (key === 'authorization_uri') params.authorizationUri = value;
    if (key === 'resource_metadata') params.resourceMetadata = value;
  }
  return Object.keys(params).length > 0 ? params : undefined;
}

/**
 * 尝试向 authorization server 动态注册客户端。
 *
 * @param metadata - 已发现的 authorization server metadata。
 * @param redirectUri - 当前扩展 OAuth redirect URI。
 * @param server - 当前 MCP server 配置。
 * @returns 动态注册成功后的 client identity；不支持或失败时返回 `null`。
 */
export async function registerDynamicClient(
  metadata: McpAuthorizationServerMetadata,
  redirectUri: string,
  server: McpServerConfig,
): Promise<McpOAuthClientIdentity | null> {
  if (!metadata.registrationEndpoint) return null;

  const res = await fetch(metadata.registrationEndpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      client_name: server.oauth.dynamicClientName || DEFAULT_DYNAMIC_CLIENT_NAME,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'native',
    }),
  });
  if (!res.ok) return null;

  const raw = await res.json() as Record<string, unknown>;
  const clientId = typeof raw.client_id === 'string' ? raw.client_id.trim() : '';
  if (!clientId) return null;

  const tokenEndpointAuthMethod = raw.token_endpoint_auth_method === 'client_secret_post' ? 'client_secret_post' : 'none';
  return {
    clientId,
    clientSecret: typeof raw.client_secret === 'string' ? raw.client_secret : undefined,
    tokenEndpointAuthMethod,
    registrationStrategy: 'dynamic',
  };
}

/**
 * 从 server 配置里读取预注册 client。
 *
 * @param server - 当前 MCP server 配置。
 * @returns 预注册 client identity；配置不完整时返回 `null`。
 */
export function getPreregisteredClient(server: McpServerConfig): McpOAuthClientIdentity | null {
  const clientId = server.oauth.preregClientId?.trim();
  if (!clientId) return null;

  return {
    clientId,
    clientSecret: server.oauth.preregClientSecret?.trim() || undefined,
    tokenEndpointAuthMethod: server.oauth.tokenEndpointAuthMethod ?? 'none',
    registrationStrategy: 'preregistered',
  };
}

/**
 * 把授权码或刷新参数提交到 token endpoint。
 *
 * @param metadata - 已发现的 authorization server metadata。
 * @param body - token endpoint 表单体。
 * @param client - 当前 client identity。
 * @returns 规范化后的 access token 结果。
 */
async function exchangeToken(
  metadata: McpAuthorizationServerMetadata,
  body: URLSearchParams,
  client: McpOAuthClientIdentity,
): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: number }> {
  if (client.tokenEndpointAuthMethod === 'client_secret_post' && client.clientSecret) {
    body.set('client_secret', client.clientSecret);
  }

  const res = await fetch(metadata.tokenEndpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const rawText = await res.text();
  let raw: Record<string, unknown>;
  try {
    raw = rawText ? JSON.parse(rawText) as Record<string, unknown> : {};
  } catch {
    raw = {};
  }

  if (!res.ok) {
    const detail = typeof raw.error_description === 'string'
      ? raw.error_description
      : typeof raw.error === 'string'
        ? raw.error
        : `${res.status} ${res.statusText}`;
    throw new Error(`OAuth token exchange 失败：${detail}`);
  }

  const accessToken = typeof raw.access_token === 'string' ? raw.access_token : '';
  if (!accessToken) throw new Error('OAuth token exchange 未返回 access_token');

  const expiresIn = typeof raw.expires_in === 'number' && Number.isFinite(raw.expires_in) ? raw.expires_in : undefined;
  return {
    accessToken,
    refreshToken: typeof raw.refresh_token === 'string' ? raw.refresh_token : undefined,
    expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
  };
}

/**
 * 用 refresh token 刷新 access token。
 *
 * @param cache - 已存在的 OAuth cache 条目。
 * @returns 刷新成功后的 token 结果；失败时返回 `null`。
 */
export async function refreshAccessToken(
  cache: McpOAuthCacheEntry,
): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: number } | null> {
  if (!cache.refreshToken) return null;

  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', cache.refreshToken);
  body.set('client_id', cache.client.clientId);
  if (cache.resource) body.set('resource', cache.resource);

  try {
    return await exchangeToken(cache.metadata, body, cache.client);
  } catch {
    return null;
  }
}

/**
 * 执行完整的 PKCE 授权码流程。
 *
 * @param metadata - 已发现的 authorization server metadata。
 * @param client - 当前 client identity。
 * @param server - 当前 MCP server 配置。
 * @param resourceMetadata - 可选 protected resource metadata。
 * @param challenge - 可选 Bearer challenge。
 * @returns 授权成功后的 token 结果。
 */
export async function authorizeWithPkce(
  metadata: McpAuthorizationServerMetadata,
  client: McpOAuthClientIdentity,
  server: McpServerConfig,
  resourceMetadata: McpProtectedResourceMetadata | undefined,
  challenge: BearerChallenge | undefined,
): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: number }> {
  const redirectUri = getRedirectUrl();
  const state = randomUrlSafe(16);
  const codeVerifier = randomUrlSafe(32);
  const codeChallenge = await sha256UrlSafe(codeVerifier);
  const scope = buildScopeString(server, resourceMetadata, challenge);
  const resource = server.oauth.resource?.trim() || challenge?.resource?.trim() || resourceMetadata?.resource?.trim();

  const authUrl = new URL(metadata.authorizationEndpoint);
  authUrl.searchParams.set('client_id', client.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  if (scope) authUrl.searchParams.set('scope', scope);
  if (resource) authUrl.searchParams.set('resource', resource);

  const redirectedUrl = await launchWebAuthFlow(authUrl.toString());
  const redirectParams = parseOAuthRedirectParams(redirectedUrl);
  const error = redirectParams.get('error');
  if (error) {
    throw new Error(redirectParams.get('error_description') || error);
  }

  const returnedState = redirectParams.get('state');
  if (!returnedState || returnedState !== state) {
    throw new Error('OAuth state 校验失败');
  }
  const code = redirectParams.get('code');
  if (!code) throw new Error('OAuth 授权未返回 code');

  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('redirect_uri', redirectUri);
  body.set('client_id', client.clientId);
  body.set('code_verifier', codeVerifier);
  if (resource) body.set('resource', resource);
  return await exchangeToken(metadata, body, client);
}
