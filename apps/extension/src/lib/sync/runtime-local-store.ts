/**
 * 说明：`runtime-local-store` 同步模块。
 *
 * 职责：
 * - 承载 `runtime-local-store` 相关的当前文件实现与模块边界；
 * - 对外暴露 `createRuntimeLocalStore` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { sanitizeAssistants } from '@/lib/assistant/assistant-storage';
import { mergeProviderSecrets } from '@/lib/ai/provider-secrets';
import { PROVIDERS_STORAGE_KEY } from '@/lib/ai/storage-keys';
import { buildTopicConversation } from '@/lib/chat/resolved-conversation';
import {
  listAllTopicMessages,
  replaceAllTopicMessages,
  type TopicMessagesRow,
} from '@/lib/chat/messages-db';
import {
  CLOUD_SYNC_PLAIN_CONFIG_KEYS,
  CLOUD_SYNC_SECRET_CONFIG_KEYS,
  normalizeSharedStorageSnapshot,
} from '@/lib/data-contracts/registry';
import { MCP_SERVERS_STORAGE_KEY } from '@/lib/mcp/constants';
import { mergeMcpServerSecrets } from '@/lib/mcp/server-secrets';
import {
  readStoredJsonWithBootstrapMirror,
  writeStoredJsonWithBootstrapMirror,
} from '@/lib/storage/json-storage';
import { storageEngine } from '@/lib/persistence/storage-engine';
import { WEB_SEARCH_SETTINGS_STORAGE_KEY } from '@/lib/web-search/settings-schema';
import { mergeWebSearchSecrets } from '@/lib/web-search/settings-secrets';
import type { Assistant } from '@/types/assistant';
import type { LocalStore } from './sync-engine';

const ASSISTANTS_STORAGE_KEY = 'olyq.assistants.v1';

/**
 * 内部函数：`readStoredAssistants`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function readStoredAssistants(): Promise<Assistant[]> {
  return sanitizeAssistants(await readStoredJsonWithBootstrapMirror<unknown>(ASSISTANTS_STORAGE_KEY, [], (raw) => raw), {
    sort: true,
    fallbackToDefaultTopics: false,
  });
}

/**
 * 读取 structured sync 允许处理的共享配置键。
 *
 * @remarks
 * 这里直接读取批量 key，是因为同步引擎需要同一时间点的快照；
 * 具体每个 key 的 schema 仍由 Data Contract Registry 统一规整。
 */
async function readSharedConfigSnapshot(keys: readonly string[]): Promise<Record<string, unknown>> {
  const snapshot = await storageEngine.read('chrome-storage-local', keys);
  return normalizeSharedStorageSnapshot(snapshot, keys);
}

/**
 * 写回 structured sync 合并出的共享配置。
 *
 * @remarks
 * `setSharedConfig` 只覆盖可云同步的普通配置，不删除 device-local/cache key；
 * 这保证云同步不会改变当前设备的 WebDAV/S3 连接凭据、状态缓存或锁。
 */
async function writeSharedConfigSnapshot(snapshot: Record<string, unknown>): Promise<void> {
  const normalized = normalizeSharedStorageSnapshot(snapshot, CLOUD_SYNC_PLAIN_CONFIG_KEYS);
  await storageEngine.write('chrome-storage-local', normalized);
}

/**
 * 写回已解密的 secret 配置。
 *
 * @remarks
 * provider 与 Web Search 的明文元数据仍来自 sharedConfig；
 * secretConfig 只负责把密钥合并回当前存储行，避免覆盖非敏感编辑。
 */
async function writeSecretConfigSnapshot(snapshot: Record<string, unknown>): Promise<void> {
  const current = await storageEngine.read('chrome-storage-local', CLOUD_SYNC_SECRET_CONFIG_KEYS);
  const next: Record<string, unknown> = {};

  if (PROVIDERS_STORAGE_KEY in snapshot) {
    next[PROVIDERS_STORAGE_KEY] = mergeProviderSecrets(
      current[PROVIDERS_STORAGE_KEY],
      snapshot[PROVIDERS_STORAGE_KEY],
    );
  }

  if (WEB_SEARCH_SETTINGS_STORAGE_KEY in snapshot) {
    next[WEB_SEARCH_SETTINGS_STORAGE_KEY] = mergeWebSearchSecrets(
      current[WEB_SEARCH_SETTINGS_STORAGE_KEY],
      snapshot[WEB_SEARCH_SETTINGS_STORAGE_KEY],
    );
  }

  if (MCP_SERVERS_STORAGE_KEY in snapshot) {
    next[MCP_SERVERS_STORAGE_KEY] = mergeMcpServerSecrets(
      current[MCP_SERVERS_STORAGE_KEY],
      snapshot[MCP_SERVERS_STORAGE_KEY],
    );
  }

  if (Object.keys(next).length > 0) await storageEngine.write('chrome-storage-local', next);
}

/**
 * 导出函数：`createRuntimeLocalStore`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function createRuntimeLocalStore(): LocalStore {
  return {
    getAssistants: async () => await readStoredAssistants(),
    getTopics: async () => {
      const [assistants, messageRows] = await Promise.all([
        readStoredAssistants(),
        listAllTopicMessages().catch(() => [] as TopicMessagesRow[]),
      ]);
      const messagesByTopicId = new Map(
        messageRows.map((row) => [row.id, Array.isArray(row.messages) ? row.messages : []]),
      );
      return assistants.flatMap((assistant) => (
        assistant.topics.map((topic) => buildTopicConversation(topic, messagesByTopicId.get(topic.id) ?? []))
      ));
    },
    setAssistants: async (assistants) => {
      await writeStoredJsonWithBootstrapMirror(ASSISTANTS_STORAGE_KEY, assistants);
    },
    setTopics: async (topics) => {
      await replaceAllTopicMessages(
        topics.map((topic) => ({
          id: topic.id,
          messages: Array.isArray(topic.messages) ? topic.messages : [],
        })),
      );
    },
    getSharedConfig: async () => await readSharedConfigSnapshot(CLOUD_SYNC_PLAIN_CONFIG_KEYS),
    setSharedConfig: async (snapshot) => {
      await writeSharedConfigSnapshot(snapshot);
    },
    getSecretConfig: async () => await readSharedConfigSnapshot(CLOUD_SYNC_SECRET_CONFIG_KEYS),
    setSecretConfig: async (snapshot) => {
      await writeSecretConfigSnapshot(snapshot);
    },
  };
}
