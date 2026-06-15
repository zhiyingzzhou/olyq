/**
 * 说明：`oauth` 基础能力模块。
 *
 * 职责：
 * - 承载 MCP Streamable HTTP 的 OAuth 2.1 基础设施；
 * - 处理 metadata discovery、DCR、预注册 client 回退、PKCE 授权、refresh 与 token cache；
 * - 对 metadata / auth server URL 施加安全 guard，拒绝非 HTTPS 与非 loopback 私网。
 *
 * 边界：
 * - 本文件只处理浏览器扩展内的 OAuth 客户端行为；
 * - 不实现 token passthrough，也不为 stdio / bridge 提供任何兼容分支。
 */

import type {
  McpAuthorizationServerMetadata,
  McpOAuthCacheEntry,
  McpOAuthClientIdentity,
  McpProtectedResourceMetadata,
  McpServerConfig,
} from '@/types/mcp';
import { clearMcpOAuthCache, readMcpOAuthCache, writeMcpOAuthCache } from '@/lib/mcp/oauth-cache';
import {
  authorizeWithPkce,
  discoverAuthorizationServerMetadata,
  discoverProtectedResourceMetadata,
  getPreregisteredClient,
  getRedirectUrl,
  parseBearerChallenge,
  refreshAccessToken,
  registerDynamicClient,
  resolveClientNamespace,
  type BearerChallenge,
} from '@/lib/mcp/oauth-protocol';

const ACCESS_TOKEN_EXPIRY_SKEW_MS = 60_000;

type OAuthAuthorizeResult = {
  accessToken: string;
  clientNamespace: string;
};

/**
 * 解析本轮 OAuth 授权真正需要的 metadata、client 与 resource 上下文。
 *
 * @param server - 当前 MCP server 配置。
 * @param challenge - 可选 Bearer challenge。
 * @param existingCache - 可选已有 OAuth cache。
 * @returns 本轮授权流程需要的完整上下文。
 */
async function resolveAuthorizationContext(
  server: McpServerConfig,
  challenge?: BearerChallenge,
  existingCache?: McpOAuthCacheEntry,
): Promise<{
  resourceMetadata?: McpProtectedResourceMetadata;
  protectedResourceMetadataUrl?: string;
  authorizationServerMetadataUrl: string;
  metadata: McpAuthorizationServerMetadata;
  client: McpOAuthClientIdentity;
  resource?: string;
}> {
  if (existingCache?.metadata?.authorizationEndpoint && existingCache?.metadata?.tokenEndpoint) {
    return {
      protectedResourceMetadataUrl: existingCache.protectedResourceMetadataUrl,
      authorizationServerMetadataUrl: existingCache.authorizationServerMetadataUrl || existingCache.metadata.issuer,
      metadata: existingCache.metadata,
      client: existingCache.client,
      resource: existingCache.resource,
    };
  }

  const protectedResource = await discoverProtectedResourceMetadata(server, challenge);
  const authorizationAuthority = server.oauth.authorizationServerMetadataUrl?.trim()
    || challenge?.authorizationUri?.trim()
    || protectedResource?.metadata.authorizationServers?.[0]
    || new URL(server.url).origin;

  const authorizationServer = await discoverAuthorizationServerMetadata(
    authorizationAuthority,
    server.oauth.authorizationServerMetadataUrl,
  );

  let client = existingCache?.client;
  if (!client) {
    if (server.oauth.registrationStrategy === 'dynamic') {
      client = await registerDynamicClient(authorizationServer.metadata, getRedirectUrl(), server) ?? undefined;
      if (!client) {
        client = getPreregisteredClient(server) ?? undefined;
      }
    } else {
      client = getPreregisteredClient(server) ?? undefined;
    }
  }

  if (!client) {
    throw new Error('当前 MCP server 未获得可用 OAuth client；请补充预注册 client 或确认服务器支持 DCR');
  }

  return {
    resourceMetadata: protectedResource?.metadata,
    protectedResourceMetadataUrl: protectedResource?.url,
    authorizationServerMetadataUrl: authorizationServer.url,
    metadata: authorizationServer.metadata,
    client,
    resource: server.oauth.resource?.trim() || challenge?.resource?.trim() || protectedResource?.metadata.resource?.trim(),
  };
}

/**
 * 读取一个仍可用的 access token；若没有可用 token，且允许交互，则走完整 OAuth 流程。
 *
 * 说明：
 * - `allowInteractive=false` 时最多只尝试本地缓存与 refresh；
 * - `allowInteractive=true` 时会在需要时触发 DCR / PKCE / token exchange。
 */
export async function ensureMcpOAuthAccessToken(
  server: McpServerConfig,
  options?: {
    allowInteractive?: boolean;
    forceRefresh?: boolean;
    bearerChallengeHeader?: string | null;
  },
): Promise<OAuthAuthorizeResult | null> {
  if (!server.oauth.enabled) return null;

  const serverOrigin = new URL(server.url).origin;
  const clientNamespace = resolveClientNamespace(server);
  const cache = await readMcpOAuthCache(serverOrigin, clientNamespace);
  const allowInteractive = Boolean(options?.allowInteractive);
  const challenge = parseBearerChallenge(options?.bearerChallengeHeader ?? null);

  if (cache && !options?.forceRefresh) {
    if (cache.accessToken && (!cache.accessTokenExpiresAt || cache.accessTokenExpiresAt - ACCESS_TOKEN_EXPIRY_SKEW_MS > Date.now())) {
      return { accessToken: cache.accessToken, clientNamespace };
    }

    const refreshed = await refreshAccessToken(cache);
    if (refreshed?.accessToken) {
      await writeMcpOAuthCache(serverOrigin, clientNamespace, {
        ...cache,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? cache.refreshToken,
        accessTokenExpiresAt: refreshed.expiresAt,
      });
      return { accessToken: refreshed.accessToken, clientNamespace };
    }
  }

  if (!allowInteractive) return null;

  const context = await resolveAuthorizationContext(server, challenge, cache);
  const authorized = await authorizeWithPkce(
    context.metadata,
    context.client,
    server,
    context.resourceMetadata,
    challenge,
  );

  await writeMcpOAuthCache(serverOrigin, clientNamespace, {
    serverOrigin,
    clientNamespace,
    client: context.client,
    protectedResourceMetadataUrl: context.protectedResourceMetadataUrl,
    authorizationServerMetadataUrl: context.authorizationServerMetadataUrl,
    metadata: context.metadata,
    resource: context.resource,
    accessToken: authorized.accessToken,
    refreshToken: authorized.refreshToken,
    accessTokenExpiresAt: authorized.expiresAt,
  });

  return {
    accessToken: authorized.accessToken,
    clientNamespace,
  };
}

/** 主动清除指定 MCP server 的 OAuth 授权缓存。 */
export async function clearMcpOAuthAuthorization(server: McpServerConfig): Promise<void> {
  const serverOrigin = new URL(server.url).origin;
  const clientNamespace = resolveClientNamespace(server);
  await clearMcpOAuthCache(serverOrigin, clientNamespace);
}
