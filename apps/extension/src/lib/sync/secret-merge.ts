/**
 * 说明：`secret-merge` 云同步 secret 域合并模块。
 *
 * 职责：
 * - 把明文 sharedConfig 与解密后的 secretConfig 合成可写回本地的完整配置；
 * - 为 secret 域计算稳定 hash，并基于 HLC 选择本地或远端版本；
 * - 保持 secret 冲突策略独立于 assistant/topic 的 diff merge。
 *
 * 边界：
 * - 本模块只处理同步运行期已经解密的 secret snapshot；
 * - 远端加密、密钥派生和密文文件清洗由 `secret-vault` 与 `cloud-sync` 负责；
 * - 不读取或写入任何持久化存储。
 */
import { mergeProviderSecrets } from '@/lib/ai/provider-secrets';
import { PROVIDERS_STORAGE_KEY } from '@/lib/ai/storage-keys';
import { MCP_SERVERS_STORAGE_KEY } from '@/lib/mcp/constants';
import { mergeMcpServerSecrets } from '@/lib/mcp/server-secrets';
import { buildCloudSyncSecretConfigSnapshot } from '@/lib/data-contracts/registry';
import { isPlainRecord } from '@/lib/utils/type-guards';
import type { SyncSecretMergeResult } from './diff-merge';
import { compareHLC, type HLCTimestamp } from './hlc';
import type { getHLC } from './hlc';
import { cloneSyncMeta, type SyncMeta } from './sync-meta-store';

/**
 * 合并明文配置与 secret 配置。
 *
 * @param sharedConfig - 已合并出的明文配置。
 * @param secretConfig - 本轮选中的 secret 明文快照。
 * @returns 可写回本地 shared storage 的完整配置。
 */
export function mergeSharedConfigWithSecrets(
  sharedConfig: Record<string, unknown>,
  secretConfig: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...sharedConfig };
  if (PROVIDERS_STORAGE_KEY in next || PROVIDERS_STORAGE_KEY in secretConfig) {
    next[PROVIDERS_STORAGE_KEY] = mergeProviderSecrets(
      next[PROVIDERS_STORAGE_KEY],
      secretConfig[PROVIDERS_STORAGE_KEY],
    );
  }
  if (MCP_SERVERS_STORAGE_KEY in next || MCP_SERVERS_STORAGE_KEY in secretConfig) {
    next[MCP_SERVERS_STORAGE_KEY] = mergeMcpServerSecrets(
      next[MCP_SERVERS_STORAGE_KEY],
      secretConfig[MCP_SERVERS_STORAGE_KEY],
    );
  }
  for (const [key, value] of Object.entries(secretConfig)) {
    if (key === PROVIDERS_STORAGE_KEY || key === MCP_SERVERS_STORAGE_KEY) continue;
    next[key] = isPlainRecord(next[key]) && isPlainRecord(value)
      ? { ...next[key], ...value }
      : value;
  }
  return next;
}

/**
 * 计算 JSON 快照的 SHA-256 十六进制 hash。
 *
 * @param value - 待计算的 JSON 值。
 * @returns 稳定 hash 字符串。
 */
async function sha256HexJson(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value ?? null));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 判断普通对象是否为空。
 *
 * @param value - 目标对象。
 * @returns 没有自有 key 时返回 `true`。
 */
function isEmptyRecord(value: Record<string, unknown>): boolean {
  return Object.keys(value).length < 1;
}

/**
 * 在本地 secret 与远端 secret 之间选择胜出快照。
 *
 * @param args - 本地/远端 secret、远端 HLC 与当前本地 meta。
 * @returns 本轮应写入远端 vault 的 secret 结果，以及更新后的 meta。
 */
export async function selectSecretMerge(args: {
  localSecretConfig: Record<string, unknown>;
  remoteSecretConfig: Record<string, unknown>;
  remoteSecretUpdatedAt: HLCTimestamp | null;
  meta: SyncMeta;
  hlc: ReturnType<typeof getHLC>;
}): Promise<{ result: SyncSecretMergeResult | undefined; meta: SyncMeta }> {
  const localSecretSnapshot = buildCloudSyncSecretConfigSnapshot(args.localSecretConfig);
  const localHash = await sha256HexJson(localSecretSnapshot);
  const nextMeta = cloneSyncMeta(args.meta);
  let localUpdatedAt = nextMeta.secretConfigUpdatedAt;
  const hasKnownLocalSecretState = nextMeta.secretConfigHash !== null || !isEmptyRecord(localSecretSnapshot);

  if (hasKnownLocalSecretState && nextMeta.secretConfigHash !== localHash) {
    localUpdatedAt = args.hlc.now();
    nextMeta.secretConfigHash = localHash;
    nextMeta.secretConfigUpdatedAt = localUpdatedAt;
  }

  const remoteUpdatedAt = args.remoteSecretUpdatedAt;
  const useRemote = remoteUpdatedAt
    && (!localUpdatedAt || compareHLC(remoteUpdatedAt, localUpdatedAt) > 0);
  const selectedSnapshot = useRemote ? args.remoteSecretConfig : localSecretSnapshot;
  const selectedUpdatedAt = useRemote ? remoteUpdatedAt : localUpdatedAt;

  if (!selectedUpdatedAt) {
    if (nextMeta.secretConfigHash === null) nextMeta.secretConfigHash = localHash;
    return { result: undefined, meta: nextMeta };
  }

  nextMeta.secretConfigHash = await sha256HexJson(selectedSnapshot);
  nextMeta.secretConfigUpdatedAt = selectedUpdatedAt;
  return {
    result: {
      snapshot: selectedSnapshot,
      updatedAt: selectedUpdatedAt,
    },
    meta: nextMeta,
  };
}
