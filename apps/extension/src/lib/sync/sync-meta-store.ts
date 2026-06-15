/**
 * 说明：`sync-meta-store` 云同步元数据模块。
 *
 * 职责：
 * - 维护字段级 HLC、tombstone 与 secret hash 的本地元数据；
 * - 为同步引擎提供加载、延迟刷盘和从合并状态重建 meta 的能力；
 * - 记录 assistant/topic/message 的本地变更时钟。
 *
 * 边界：
 * - 本模块只管理 `olyq.sync.meta.v1` 这个同步内部 key；
 * - 不参与远端状态合并，也不读写 assistant/topic 实体数据；
 * - 变更记录是当前 v1 同步协议的一部分，不提供旧协议兼容路径。
 */
import { createSharedJsonConfigChannel } from '@/lib/storage/shared-json-config-channel';
import { isPlainRecord } from '@/lib/utils/type-guards';
import type { SyncState } from './diff-merge';
import { getHLC, type HLCTimestamp } from './hlc';

const SYNC_META_KEY = 'olyq.sync.meta.v1';
const SYNC_META_FLUSH_DELAY = 500;

/** 本地保存的同步元数据，用于字段级 LWW 合并与增量判断。 */
export interface SyncMeta {
  /** assistant 字段级时间戳：assistantId 到 fieldName 到 HLCTimestamp。 */
  assistantFieldTimestamps: Record<string, Record<string, HLCTimestamp>>;
  /** topic 字段级时间戳：topicId 到 fieldName 到 HLCTimestamp。 */
  topicFieldTimestamps: Record<string, Record<string, HLCTimestamp>>;
  /** topic 消息集合时间戳：topicId 到 HLCTimestamp。 */
  topicMessagesTimestamps: Record<string, HLCTimestamp>;
  /** 已删除 assistant 的 tombstone。 */
  assistantTombstones: Record<string, HLCTimestamp>;
  /** 已删除 topic 的 tombstone。 */
  topicTombstones: Record<string, HLCTimestamp>;
  /** topic 级消息清空时间戳。 */
  topicMessagesClearedAt: Record<string, HLCTimestamp>;
  /** 单条消息 tombstone。 */
  messageTombstones: Record<string, Record<string, HLCTimestamp>>;
  /** 最近一次本地 secret 配置变化的内容 hash。 */
  secretConfigHash: string | null;
  /** 最近一次本地 secret 配置变化的 HLC。 */
  secretConfigUpdatedAt: HLCTimestamp | null;
  /** 最近一次同步的全局时间戳。 */
  lastSyncTimestamp: HLCTimestamp | null;
}

const EMPTY_SYNC_META: SyncMeta = {
  assistantFieldTimestamps: {},
  topicFieldTimestamps: {},
  topicMessagesTimestamps: {},
  assistantTombstones: {},
  topicTombstones: {},
  topicMessagesClearedAt: {},
  messageTombstones: {},
  secretConfigHash: null,
  secretConfigUpdatedAt: null,
  lastSyncTimestamp: null,
};

let syncMetaCache: SyncMeta | null = null;
let syncMetaDirty = false;
let syncMetaFlushTimer: ReturnType<typeof setTimeout> | null = null;
let syncMetaLoadPromise: Promise<SyncMeta> | null = null;
let syncMetaMutationQueue: Promise<void> = Promise.resolve();

/**
 * 深拷贝同步元数据。
 *
 * @param meta - 当前同步元数据。
 * @returns 独立的元数据副本。
 */
export function cloneSyncMeta(meta: SyncMeta): SyncMeta {
  return JSON.parse(JSON.stringify(meta)) as SyncMeta;
}

/**
 * 将存储中的原始值收敛为当前 v1 sync meta。
 *
 * @param raw - 存储层读取到的原始值。
 * @returns 合法的同步元数据快照。
 */
function normalizeSyncMeta(raw: unknown): SyncMeta {
  if (isPlainRecord(raw)) {
    return {
      ...EMPTY_SYNC_META,
      ...(raw as Partial<SyncMeta>),
    };
  }
  return { ...EMPTY_SYNC_META };
}

const syncMetaChannel = createSharedJsonConfigChannel<SyncMeta>({
  storageKey: SYNC_META_KEY,
  fallback: EMPTY_SYNC_META,
  normalize: normalizeSyncMeta,
  clone: cloneSyncMeta,
  bootstrap: {
    bootstrapSource: 'bootstrap-mirror',
  },
  sameWindowSignal: {
    type: 'none',
  },
});

void syncMetaChannel.subscribe(() => {
  // 其它上下文写入了 sync meta 时，本上下文缓存必须失效，避免下一轮 LWW 基于旧时钟决策。
  syncMetaCache = null;
});

/**
 * 加载同步元数据快照。
 *
 * @remarks
 * 并发读取会折叠成一次真实 IO，避免多个同步入口同时启动时各自拿到不同缓存。
 */
export async function loadSyncMeta(): Promise<SyncMeta> {
  if (syncMetaCache) return syncMetaCache;
  if (syncMetaLoadPromise) return syncMetaLoadPromise;

  syncMetaLoadPromise = (async () => {
    const { value: next } = await syncMetaChannel.refreshFromStorage();
    syncMetaCache = next;
    return next;
  })();

  try {
    return await syncMetaLoadPromise;
  } finally {
    syncMetaLoadPromise = null;
  }
}

/**
 * 标记同步元数据已变更，并安排延迟刷盘。
 *
 * @param meta - 已更新的元数据快照。
 */
export function saveSyncMeta(meta: SyncMeta): void {
  syncMetaCache = cloneSyncMeta(meta);
  syncMetaDirty = true;
  if (!syncMetaFlushTimer) {
    syncMetaFlushTimer = setTimeout(() => {
      syncMetaFlushTimer = null;
      void flushSyncMeta();
    }, SYNC_META_FLUSH_DELAY);
  }
}

/**
 * 把内存中的 sync meta 强制刷回共享存储。
 */
async function flushSyncMeta(): Promise<void> {
  if (syncMetaFlushTimer) {
    clearTimeout(syncMetaFlushTimer);
    syncMetaFlushTimer = null;
  }
  if (!syncMetaDirty || !syncMetaCache) return;
  syncMetaChannel.save(syncMetaCache);
  syncMetaDirty = false;
}

/**
 * 串行提交 sync meta 变更。
 *
 * @param mutator - 对元数据快照的就地变更函数。
 */
function queueSyncMetaMutation(mutator: (meta: SyncMeta, hlc: ReturnType<typeof getHLC>) => void): Promise<void> {
  syncMetaMutationQueue = syncMetaMutationQueue
    .catch(() => undefined)
    .then(async () => {
      const meta = cloneSyncMeta(await loadSyncMeta());
      const hlc = getHLC();
      mutator(meta, hlc);
      saveSyncMeta(meta);
    });
  return syncMetaMutationQueue;
}

/**
 * 等待所有挂起的 sync meta 变更并立即刷盘。
 */
export async function flushSyncMetaPendingWrites(): Promise<void> {
  await syncMetaMutationQueue.catch(() => undefined);
  await flushSyncMeta();
}

/**
 * 从合并后的 SyncState 重建本地 sync meta。
 *
 * @param state - 当前已经确认成功推送/合并的同步状态。
 * @returns 可写回本地的同步元数据。
 */
export function buildSyncMetaFromState(state: SyncState): SyncMeta {
  const assistantFieldTimestamps: SyncMeta['assistantFieldTimestamps'] = {};
  const topicFieldTimestamps: SyncMeta['topicFieldTimestamps'] = {};
  const topicMessagesTimestamps: SyncMeta['topicMessagesTimestamps'] = {};

  for (const assistantState of state.assistants) {
    assistantFieldTimestamps[assistantState.assistant.id] = { ...assistantState.fieldTimestamps };
  }
  for (const topicState of state.topics) {
    topicFieldTimestamps[topicState.topic.id] = { ...topicState.fieldTimestamps };
    topicMessagesTimestamps[topicState.topic.id] = topicState.messagesTimestamp;
  }

  return {
    assistantFieldTimestamps,
    topicFieldTimestamps,
    topicMessagesTimestamps,
    assistantTombstones: { ...state.assistantTombstones },
    topicTombstones: { ...state.topicTombstones },
    topicMessagesClearedAt: { ...state.topicMessagesClearedAt },
    messageTombstones: { ...state.messageTombstones },
    secretConfigHash: null,
    secretConfigUpdatedAt: null,
    lastSyncTimestamp: state.timestamp,
  };
}

/**
 * 从 SyncState 重建 meta，并保留 secret 域的 LWW 元数据。
 *
 * @param state - 已合并状态。
 * @param secretMeta - 本轮 secret 域的 hash 与 HLC。
 * @returns 完整 sync meta。
 */
export function buildSyncMetaFromStateWithSecret(
  state: SyncState,
  secretMeta: Pick<SyncMeta, 'secretConfigHash' | 'secretConfigUpdatedAt'>,
): SyncMeta {
  return {
    ...buildSyncMetaFromState(state),
    secretConfigHash: secretMeta.secretConfigHash,
    secretConfigUpdatedAt: secretMeta.secretConfigUpdatedAt,
  };
}

/**
 * 用 HLC 时间戳记录本地 assistant 字段变更。
 *
 * @param assistantId - assistant ID。
 * @param field - 被修改的字段名。
 */
export function recordAssistantFieldChange(assistantId: string, field: string): void {
  const normalizedAssistantId = String(assistantId || '').trim();
  const normalizedField = String(field || '').trim();
  if (!normalizedAssistantId || !normalizedField) return;

  void queueSyncMetaMutation((meta, hlc) => {
    if (!meta.assistantFieldTimestamps[normalizedAssistantId]) {
      meta.assistantFieldTimestamps[normalizedAssistantId] = {};
    }
    meta.assistantFieldTimestamps[normalizedAssistantId][normalizedField] = hlc.now();
    delete meta.assistantTombstones[normalizedAssistantId];
  });
}

/**
 * 用 HLC 时间戳记录本地 topic 字段变更。
 *
 * @param topicId - topic ID。
 * @param field - 被修改的字段名。
 */
export function recordTopicFieldChange(topicId: string, field: string): void {
  const normalizedTopicId = String(topicId || '').trim();
  const normalizedField = String(field || '').trim();
  if (!normalizedTopicId || !normalizedField) return;

  void queueSyncMetaMutation((meta, hlc) => {
    if (!meta.topicFieldTimestamps[normalizedTopicId]) {
      meta.topicFieldTimestamps[normalizedTopicId] = {};
    }
    meta.topicFieldTimestamps[normalizedTopicId][normalizedField] = hlc.now();
    delete meta.topicTombstones[normalizedTopicId];
  });
}

/**
 * 记录话题消息集合发生了追加或更新。
 *
 * @param topicId - topic ID。
 */
export function recordTopicMessagesChange(topicId: string): void {
  const normalizedTopicId = String(topicId || '').trim();
  if (!normalizedTopicId) return;

  void queueSyncMetaMutation((meta, hlc) => {
    meta.topicMessagesTimestamps[normalizedTopicId] = hlc.now();
    delete meta.topicTombstones[normalizedTopicId];
  });
}

/**
 * 记录 assistant 被删除。
 *
 * @param assistantId - assistant ID。
 */
export function recordAssistantDeletion(assistantId: string): void {
  const normalizedAssistantId = String(assistantId || '').trim();
  if (!normalizedAssistantId) return;

  void queueSyncMetaMutation((meta, hlc) => {
    meta.assistantTombstones[normalizedAssistantId] = hlc.now();
    delete meta.assistantFieldTimestamps[normalizedAssistantId];
  });
}

/**
 * 记录 topic 被删除。
 *
 * @param topicId - topic ID。
 */
export function recordTopicDeletion(topicId: string): void {
  const normalizedTopicId = String(topicId || '').trim();
  if (!normalizedTopicId) return;

  void queueSyncMetaMutation((meta, hlc) => {
    meta.topicTombstones[normalizedTopicId] = hlc.now();
    delete meta.topicFieldTimestamps[normalizedTopicId];
    delete meta.topicMessagesTimestamps[normalizedTopicId];
    delete meta.topicMessagesClearedAt[normalizedTopicId];
    delete meta.messageTombstones[normalizedTopicId];
  });
}

/**
 * 记录 topic 消息被整体清空。
 *
 * @param topicId - topic ID。
 */
export function recordTopicMessagesCleared(topicId: string): void {
  const normalizedTopicId = String(topicId || '').trim();
  if (!normalizedTopicId) return;

  void queueSyncMetaMutation((meta, hlc) => {
    const timestamp = hlc.now();
    meta.topicMessagesTimestamps[normalizedTopicId] = timestamp;
    meta.topicMessagesClearedAt[normalizedTopicId] = timestamp;
    delete meta.topicTombstones[normalizedTopicId];
  });
}

/**
 * 记录单条消息删除 tombstone。
 *
 * @param topicId - topic ID。
 * @param messageIds - 被删除的消息 ID 列表。
 */
export function recordDeletedMessages(topicId: string, messageIds: string[]): void {
  const normalizedTopicId = String(topicId || '').trim();
  const normalizedIds = Array.isArray(messageIds)
    ? messageIds.map((messageId) => String(messageId || '').trim()).filter(Boolean)
    : [];
  if (!normalizedTopicId || normalizedIds.length < 1) return;

  void queueSyncMetaMutation((meta, hlc) => {
    const topicTombstones = meta.messageTombstones[normalizedTopicId] ?? {};
    for (const messageId of normalizedIds) {
      topicTombstones[messageId] = hlc.now();
    }
    meta.messageTombstones[normalizedTopicId] = topicTombstones;
    meta.topicMessagesTimestamps[normalizedTopicId] = hlc.now();
  });
}
