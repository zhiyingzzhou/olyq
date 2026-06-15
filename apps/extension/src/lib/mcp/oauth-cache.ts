/**
 * 说明：`oauth-cache` 基础能力模块。
 *
 * 职责：
 * - 承载 MCP OAuth token / client metadata 的本地缓存；
 * - 按 `server origin + client namespace` 做命名空间隔离；
 * - 通过串行写队列避免并发覆盖。
 */

import type { McpOAuthCacheEntry, McpOAuthCacheStore } from '@/types/mcp';
import { getStorageAdapter } from '@/lib/storage/storage-adapter';
import { isRecord } from '@/lib/utils/type-guards';
import { MCP_OAUTH_CACHE_STORAGE_KEY } from '@/lib/mcp/constants';

let oauthCacheWriteQueue: Promise<void> = Promise.resolve();

/**
 * 拼出 OAuth cache 的命名空间键。
 *
 * @param serverOrigin - MCP server origin。
 * @param clientNamespace - client identity namespace。
 * @returns 用于本地存储的复合键。
 */
function buildNamespace(serverOrigin: string, clientNamespace: string): string {
  return `${serverOrigin}::${clientNamespace}`;
}

/**
 * 把原始存储值规整成 OAuth cache 表。
 *
 * @param raw - 原始存储内容。
 * @returns 过滤无效项后的 cache 表。
 */
function parseOAuthCacheStore(raw: unknown): McpOAuthCacheStore {
  if (!isRecord(raw)) return {};
  const out: McpOAuthCacheStore = {};
  for (const [namespace, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    const clientRecord = isRecord(value.client) ? value.client : null;
    const metadataRecord = isRecord(value.metadata) ? value.metadata : null;
    const serverOrigin = typeof value.serverOrigin === 'string' ? value.serverOrigin.trim() : '';
    const clientNamespace = typeof value.clientNamespace === 'string' ? value.clientNamespace.trim() : '';
    const clientId = typeof clientRecord?.clientId === 'string'
      ? clientRecord.clientId.trim()
      : typeof value.clientId === 'string'
        ? value.clientId.trim()
        : '';
    if (!serverOrigin || !clientNamespace || !clientId) continue;
    const tokenEndpoint = typeof metadataRecord?.tokenEndpoint === 'string'
      ? metadataRecord.tokenEndpoint.trim()
      : typeof value.tokenEndpoint === 'string'
        ? value.tokenEndpoint.trim()
        : '';
    const authorizationEndpoint = typeof metadataRecord?.authorizationEndpoint === 'string'
      ? metadataRecord.authorizationEndpoint.trim()
      : typeof value.authorizationEndpoint === 'string'
        ? value.authorizationEndpoint.trim()
        : '';
    const issuer = typeof metadataRecord?.issuer === 'string'
      ? metadataRecord.issuer.trim()
      : typeof value.issuer === 'string'
        ? value.issuer.trim()
        : '';
    if (!authorizationEndpoint || !tokenEndpoint || !issuer) continue;

    out[namespace] = {
      serverOrigin,
      clientNamespace,
      client: {
        clientId,
        clientSecret: typeof clientRecord?.clientSecret === 'string'
          ? clientRecord.clientSecret
          : typeof value.clientSecret === 'string'
            ? value.clientSecret
            : undefined,
        tokenEndpointAuthMethod: clientRecord?.tokenEndpointAuthMethod === 'client_secret_post' || value.tokenEndpointAuthMethod === 'client_secret_post'
          ? 'client_secret_post'
          : 'none',
        registrationStrategy: clientRecord?.registrationStrategy === 'preregistered' || value.registrationStrategy === 'preregistered'
          ? 'preregistered'
          : 'dynamic',
      },
      protectedResourceMetadataUrl: typeof value.protectedResourceMetadataUrl === 'string' ? value.protectedResourceMetadataUrl : undefined,
      authorizationServerMetadataUrl: typeof value.authorizationServerMetadataUrl === 'string' ? value.authorizationServerMetadataUrl : undefined,
      metadata: {
        issuer,
        authorizationEndpoint,
        tokenEndpoint,
        registrationEndpoint: typeof metadataRecord?.registrationEndpoint === 'string'
          ? metadataRecord.registrationEndpoint
          : typeof value.registrationEndpoint === 'string'
            ? value.registrationEndpoint
            : undefined,
        revocationEndpoint: typeof metadataRecord?.revocationEndpoint === 'string'
          ? metadataRecord.revocationEndpoint
          : typeof value.revocationEndpoint === 'string'
            ? value.revocationEndpoint
            : undefined,
        scopesSupported: Array.isArray(metadataRecord?.scopesSupported)
          ? metadataRecord.scopesSupported.filter((scope): scope is string => typeof scope === 'string')
          : Array.isArray(value.scopesSupported)
            ? value.scopesSupported.filter((scope): scope is string => typeof scope === 'string')
            : undefined,
      },
      resource: typeof value.resource === 'string' ? value.resource : undefined,
      accessToken: typeof value.accessToken === 'string' ? value.accessToken : undefined,
      refreshToken: typeof value.refreshToken === 'string' ? value.refreshToken : undefined,
      accessTokenExpiresAt: typeof value.accessTokenExpiresAt === 'number' ? value.accessTokenExpiresAt : undefined,
    };
  }
  return out;
}

/**
 * 从 storage 读取整个 OAuth cache 表。
 *
 * @returns 规整后的 OAuth cache 表。
 */
async function readOAuthCacheStoreRaw(): Promise<McpOAuthCacheStore> {
  const raw = await getStorageAdapter().get([MCP_OAUTH_CACHE_STORAGE_KEY]);
  return parseOAuthCacheStore(raw[MCP_OAUTH_CACHE_STORAGE_KEY]);
}

/**
 * 在串行写队列里原子更新 OAuth cache 表。
 *
 * @param mutator - 对 cache 表执行原地修改的回调。
 * @returns 当前修改步骤返回的结果。
 */
async function mutateOAuthCacheStore<T>(mutator: (store: McpOAuthCacheStore) => T | Promise<T>): Promise<T> {
  let result!: T;
  oauthCacheWriteQueue = oauthCacheWriteQueue
    .catch(() => void 0)
    .then(async () => {
      const store = await readOAuthCacheStoreRaw();
      result = await mutator(store);
      if (Object.keys(store).length === 0) {
        await getStorageAdapter().remove([MCP_OAUTH_CACHE_STORAGE_KEY]);
        return;
      }
      await getStorageAdapter().set({ [MCP_OAUTH_CACHE_STORAGE_KEY]: store });
    });
  await oauthCacheWriteQueue;
  return result;
}

/** 生成 MCP OAuth 缓存命名空间。 */
export function createMcpOAuthCacheNamespace(serverOrigin: string, clientNamespace: string): string {
  return buildNamespace(serverOrigin, clientNamespace);
}

/** 读取指定 namespace 的 OAuth 缓存。 */
export async function readMcpOAuthCache(serverOrigin: string, clientNamespace: string): Promise<McpOAuthCacheEntry | undefined> {
  await oauthCacheWriteQueue.catch(() => void 0);
  const store = await readOAuthCacheStoreRaw();
  return store[buildNamespace(serverOrigin, clientNamespace)];
}

/** 局部写入指定 namespace 的 OAuth 缓存。 */
export async function writeMcpOAuthCache(
  serverOrigin: string,
  clientNamespace: string,
  patch: Partial<McpOAuthCacheEntry>,
): Promise<void> {
  const namespace = buildNamespace(serverOrigin, clientNamespace);
  await mutateOAuthCacheStore((store) => {
    const current = store[namespace];
    const next = {
      ...current,
      ...patch,
      serverOrigin,
      clientNamespace,
    } as McpOAuthCacheEntry;
    store[namespace] = next;
  });
}

/** 清空指定 namespace 的 OAuth 缓存。 */
export async function clearMcpOAuthCache(serverOrigin: string, clientNamespace: string): Promise<void> {
  const namespace = buildNamespace(serverOrigin, clientNamespace);
  await mutateOAuthCacheStore((store) => {
    delete store[namespace];
  });
}
