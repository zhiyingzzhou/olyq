/**
 * 说明：`cloud-sync` 数据契约同步快照模块。
 *
 * 职责：
 * - 根据 Data Contract Registry v1 生成 structured cloud sync 的明文配置快照；
 * - 从共享配置中提取需要进入 encrypted secretVault 的敏感配置；
 * - 统一 provider、Web Search 和 MCP 的 secret/public 字段拆分语义。
 *
 * 边界：
 * - 本文件只构造同步包中的配置片段；
 * - 不做加密、远端 IO 或冲突合并；
 * - WebDAV/S3 自身连接凭据不进入这里的远端同步包。
 */
import { splitProviderSecrets } from '@/lib/ai/provider-secrets';
import { PROVIDERS_STORAGE_KEY } from '@/lib/ai/storage-keys';
import { MCP_SERVERS_STORAGE_KEY } from '@/lib/mcp/constants';
import { splitMcpServerSecrets } from '@/lib/mcp/server-secrets';
import { WEB_SEARCH_SETTINGS_STORAGE_KEY } from '@/lib/web-search/settings-schema';
import {
  extractWebSearchSecrets,
  stripWebSearchSecrets,
} from '@/lib/web-search/settings-secrets';
import {
  CLOUD_SYNC_SECRET_CONFIG_KEYS,
  CLOUD_SYNC_SHARED_CONFIG_KEYS,
  SHARED_STORAGE_CONTRACT_BY_KEY,
} from './registry';

/**
 * 生成 cloud sync 的明文配置快照。
 *
 * @remarks
 * 对 `encrypted-secret` key 会先剥离敏感字段，只保留非敏感部分进入明文同步包。
 */
export function buildCloudSyncPlainConfigSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of CLOUD_SYNC_SHARED_CONFIG_KEYS) {
    if (!(key in snapshot)) continue;
    const contract = SHARED_STORAGE_CONTRACT_BY_KEY.get(key);
    if (!contract) continue;
    out[key] = contract.normalize(snapshot[key]);
  }
  if (PROVIDERS_STORAGE_KEY in snapshot) {
    out[PROVIDERS_STORAGE_KEY] = splitProviderSecrets(snapshot[PROVIDERS_STORAGE_KEY]).publicProviders;
  }
  if (WEB_SEARCH_SETTINGS_STORAGE_KEY in snapshot) {
    out[WEB_SEARCH_SETTINGS_STORAGE_KEY] = stripWebSearchSecrets(snapshot[WEB_SEARCH_SETTINGS_STORAGE_KEY]);
  }
  if (MCP_SERVERS_STORAGE_KEY in snapshot) {
    out[MCP_SERVERS_STORAGE_KEY] = splitMcpServerSecrets(snapshot[MCP_SERVERS_STORAGE_KEY]).publicServers;
  }
  return out;
}

/**
 * 从共享配置快照中提取需要加密同步的敏感配置。
 *
 * @param snapshot - 当前本地共享配置快照。
 * @returns secretVault 加密前的明文 secret 配置。
 */
export function buildCloudSyncSecretConfigSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (PROVIDERS_STORAGE_KEY in snapshot) {
    const secrets = splitProviderSecrets(snapshot[PROVIDERS_STORAGE_KEY]);
    if (Object.keys(secrets.secretsByProviderId).length > 0) {
      out[PROVIDERS_STORAGE_KEY] = secrets.secretsByProviderId;
    }
  }
  for (const key of CLOUD_SYNC_SECRET_CONFIG_KEYS) {
    if (key === PROVIDERS_STORAGE_KEY) continue;
    if (key === WEB_SEARCH_SETTINGS_STORAGE_KEY) {
      if (key in snapshot) {
        const secrets = extractWebSearchSecrets(snapshot[key]);
        if (Object.keys(secrets).length > 0) out[key] = secrets;
      }
      continue;
    }
    if (key === MCP_SERVERS_STORAGE_KEY) {
      if (key in snapshot) {
        const secrets = splitMcpServerSecrets(snapshot[key]);
        if (Object.keys(secrets.secretsByServerId).length > 0) {
          out[key] = secrets.secretsByServerId;
        }
      }
      continue;
    }
    if (!(key in snapshot)) continue;
    const contract = SHARED_STORAGE_CONTRACT_BY_KEY.get(key);
    if (!contract) continue;
    out[key] = contract.normalize(snapshot[key]);
  }
  return out;
}
