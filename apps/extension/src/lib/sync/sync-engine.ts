/**
 * 说明：`sync-engine` 同步模块。
 *
 * 职责：
 * - 承载 `sync-engine` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SyncBackend`、`LocalStore`、`flushSyncMetaPendingWrites` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 同步引擎：整合 HLC + LWW + diff-merge 与不同存储后端。
 *
 * 同步约定：
 * - assistant 默认配置与 topic 元数据/消息分开同步；
 * - assistant tree 由「assistant defaults + topic metadata」在本地重建；
 * - topic messages 继续作为 topic payload 的一部分合并。
 */

import { buildTopicConversation } from '@/lib/chat/resolved-conversation';
import { sortAssistants } from '@/lib/chat/topic-tree-core';
import { isPlainRecord } from '@/lib/utils/type-guards';
import {
  CLOUD_SYNC_PLAIN_CONFIG_KEYS,
  buildCloudSyncPlainConfigSnapshot,
  normalizeSharedStorageSnapshot,
} from '@/lib/data-contracts/registry';
import {
  mergeSharedConfigWithSecrets,
  selectSecretMerge,
} from './secret-merge';
import { normalizeAssistantScenario } from '@/types/assistant';
import type { Assistant } from '@/types/assistant';
import type { Topic, TopicConversation } from '@/types/chat';
import type {
  SyncableAssistantState,
  SyncableTopicState,
  SyncState,
  SyncedAssistantConfig,
} from './diff-merge';
import {
  ASSISTANT_LWW_FIELDS,
  fullMerge,
  TOPIC_LWW_FIELDS,
} from './diff-merge';
import type { HLCTimestamp } from './hlc';
import { getHLC } from './hlc';
import {
  buildSyncMetaFromStateWithSecret,
  flushSyncMetaPendingWrites,
  loadSyncMeta,
  saveSyncMeta,
  type SyncMeta,
} from './sync-meta-store';

export {
  flushSyncMetaPendingWrites,
  recordAssistantDeletion,
  recordAssistantFieldChange,
  recordDeletedMessages,
  recordTopicDeletion,
  recordTopicFieldChange,
  recordTopicMessagesChange,
  recordTopicMessagesCleared,
} from './sync-meta-store';

/** 远端同步后端契约。 */
export type SyncBackend = {
  /** 读取远端同步状态；若远端无数据则返回 null */
  pull: () => Promise<SyncState | null>;
  /** 将合并后的同步状态写回远端 */
  push: (state: SyncState) => Promise<void>;
};

/** 本地 Assistant/Topic 存储适配器契约。 */
export type LocalStore = {
  /** 读取本地所有 assistant 默认配置及 topic 元数据树。 */
  getAssistants: () => Assistant[] | Promise<Assistant[]>;
  /** 读取本地所有 topic conversation（含消息）。 */
  getTopics: () => TopicConversation[] | Promise<TopicConversation[]>;
  /** 用新的 assistant tree 替换本地 assistant 存储。 */
  setAssistants: (assistants: Assistant[]) => void | Promise<void>;
  /** 用新的 topic conversation 列表替换本地消息/话题快照。 */
  setTopics: (topics: TopicConversation[]) => void | Promise<void>;
  /** 读取当前可参与 structured sync 的轻量共享配置。 */
  getSharedConfig?: () => Record<string, unknown> | Promise<Record<string, unknown>>;
  /** 写回合并后的轻量共享配置。 */
  setSharedConfig?: (snapshot: Record<string, unknown>) => void | Promise<void>;
  /** 读取已解密的敏感配置。 */
  getSecretConfig?: () => Record<string, unknown> | Promise<Record<string, unknown>>;
  /** 写回已解密的敏感配置。 */
  setSecretConfig?: (snapshot: Record<string, unknown>) => void | Promise<void>;
};

/**
 * 内部函数：`createBaseTimestamp`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function createBaseTimestamp(updatedAt: number, nodeId: string): HLCTimestamp {
  return {
    wallTime: updatedAt,
    logical: 0,
    nodeId,
  };
}

/**
 * 内部函数：`ensureFieldTimestamps`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function ensureFieldTimestamps(
  current: Record<string, HLCTimestamp> | undefined,
  fields: readonly string[],
  updatedAt: number,
  nodeId: string,
): Record<string, HLCTimestamp> {
  const next = { ...(current || {}) };
  for (const field of fields) {
    if (!next[field]) next[field] = createBaseTimestamp(updatedAt, nodeId);
  }
  return next;
}

/**
 * 内部函数：`stripAssistantTopics`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function stripAssistantTopics(assistant: Assistant): SyncedAssistantConfig {
  const { topics: _topics, ...assistantDefaults } = assistant;
  return assistantDefaults;
}

/**
 * 内部函数：`toTopicMeta`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function toTopicMeta(topic: TopicConversation): Topic {
  return {
    id: topic.id,
    assistantId: topic.assistantId,
    name: topic.title,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    pinned: topic.pinned,
    topicPrompt: topic.topicPrompt,
    model: topic.model,
    temperature: topic.temperature,
    topP: topic.topP,
    maxTokens: topic.maxTokens,
    contextLength: topic.contextLength,
    modelParams: topic.modelParams,
    browserContextMode: topic.browserContextMode,
    isNameManuallyEdited: topic.isNameManuallyEdited,
    order: topic.order,
  };
}

/**
 * 内部函数：`normalizeSyncState`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function normalizeSyncState(state: SyncState | null): SyncState | null {
  if (!state) return null;
  const hlc = getHLC();
  return {
    schemaVersion: 1,
    assistants: Array.isArray(state.assistants) ? state.assistants : [],
    topics: Array.isArray(state.topics) ? state.topics : [],
    sharedConfig: isPlainRecord(state.sharedConfig)
      ? normalizeSharedStorageSnapshot(state.sharedConfig, CLOUD_SYNC_PLAIN_CONFIG_KEYS)
      : {},
    secretVault: state.secretVault,
    decryptedSecretConfig: isPlainRecord(state.decryptedSecretConfig) ? state.decryptedSecretConfig : {},
    assistantTombstones: isPlainRecord(state.assistantTombstones) ? state.assistantTombstones as Record<string, HLCTimestamp> : {},
    topicTombstones: isPlainRecord(state.topicTombstones) ? state.topicTombstones as Record<string, HLCTimestamp> : {},
    topicMessagesClearedAt: isPlainRecord(state.topicMessagesClearedAt) ? state.topicMessagesClearedAt as Record<string, HLCTimestamp> : {},
    messageTombstones: isPlainRecord(state.messageTombstones)
      ? state.messageTombstones as Record<string, Record<string, HLCTimestamp>>
      : {},
    timestamp: state.timestamp ?? hlc.now(),
    nodeId: typeof state.nodeId === 'string' && state.nodeId.trim() ? state.nodeId : hlc.getNodeId(),
  };
}

/**
 * 内部函数：`buildSyntheticAssistant`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function buildSyntheticAssistant(
  assistantId: string,
  topics: Topic[],
  fallbackAssistant?: Assistant,
): Assistant {
  const sortedTopics = sortTopics(topics);
  const latestUpdatedAt = sortedTopics.reduce(
    (max, topic) => Math.max(max, topic.updatedAt),
    fallbackAssistant?.updatedAt ?? 0,
  );
  const createdAt = fallbackAssistant?.createdAt ?? sortedTopics[0]?.createdAt ?? Date.now();
  return {
    id: assistantId,
    scenario: normalizeAssistantScenario(fallbackAssistant?.scenario),
    name: fallbackAssistant?.name || `Assistant ${assistantId.slice(0, 8)}`,
    description: fallbackAssistant?.description,
    iconId: fallbackAssistant?.iconId,
    prompt: fallbackAssistant?.prompt ?? '',
    mcpSelection: fallbackAssistant?.mcpSelection,
    enableWebSearch: fallbackAssistant?.enableWebSearch,
    webSearchProviderId: fallbackAssistant?.webSearchProviderId,
    enableGenerateImage: fallbackAssistant?.enableGenerateImage,
    enableMemory: fallbackAssistant?.enableMemory,
    tags: fallbackAssistant?.tags,
    topics: sortedTopics,
    order: fallbackAssistant?.order ?? createdAt,
    createdAt,
    updatedAt: latestUpdatedAt || Date.now(),
  };
}

/**
 * 内部函数：`sortTopics`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function sortTopics(topics: Topic[]): Topic[] {
  return [...topics].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    const ao = typeof a.order === 'number' ? a.order : a.updatedAt;
    const bo = typeof b.order === 'number' ? b.order : b.updatedAt;
    return bo - ao;
  });
}

/**
 * 内部函数：`buildAssistantSyncStates`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function buildAssistantSyncStates(assistants: Assistant[], meta: SyncMeta, nodeId: string): SyncableAssistantState[] {
  return assistants.map((assistant) => {
    const assistantDefaults = stripAssistantTopics(assistant);
    return {
      assistant: assistantDefaults,
      fieldTimestamps: ensureFieldTimestamps(
        meta.assistantFieldTimestamps[assistant.id],
        ASSISTANT_LWW_FIELDS,
        assistant.updatedAt,
        nodeId,
      ),
    };
  });
}

/**
 * 内部函数：`buildTopicSyncStates`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function buildTopicSyncStates(
  assistants: Assistant[],
  topics: TopicConversation[],
  meta: SyncMeta,
  nodeId: string,
): SyncableTopicState[] {
  const topicsById = new Map(topics.map((topic) => [topic.id, topic]));
  const states: SyncableTopicState[] = [];
  const seenTopicIds = new Set<string>();

  for (const assistant of assistants) {
    for (const topicMeta of assistant.topics) {
      const topicConversation = buildTopicConversation(
        topicMeta,
        topicsById.get(topicMeta.id)?.messages ?? [],
      );
      seenTopicIds.add(topicConversation.id);
      states.push({
        topic: topicConversation,
        fieldTimestamps: ensureFieldTimestamps(
          meta.topicFieldTimestamps[topicConversation.id],
          TOPIC_LWW_FIELDS,
          topicConversation.updatedAt,
          nodeId,
        ),
        messagesTimestamp:
          meta.topicMessagesTimestamps[topicConversation.id]
          || createBaseTimestamp(topicConversation.updatedAt, nodeId),
      });
    }
  }

  for (const topicConversation of topics) {
    if (seenTopicIds.has(topicConversation.id)) continue;
    states.push({
      topic: topicConversation,
      fieldTimestamps: ensureFieldTimestamps(
        meta.topicFieldTimestamps[topicConversation.id],
        TOPIC_LWW_FIELDS,
        topicConversation.updatedAt,
        nodeId,
      ),
      messagesTimestamp:
        meta.topicMessagesTimestamps[topicConversation.id]
        || createBaseTimestamp(topicConversation.updatedAt, nodeId),
    });
  }

  return states;
}

/**
 * 使用本地 assistant defaults + topic 元数据/消息，构建 SyncState。
 */
async function buildLocalSyncState(assistants: Assistant[], topics: TopicConversation[]): Promise<SyncState> {
  const hlc = getHLC();
  const meta = await loadSyncMeta();

  return {
    schemaVersion: 1,
    // 本地状态不是简单读取 topics/messages，而是把“实体数据 + 字段级时钟 + tombstone”一起打成完整同步快照。
    assistants: buildAssistantSyncStates(assistants, meta, hlc.getNodeId()),
    topics: buildTopicSyncStates(assistants, topics, meta, hlc.getNodeId()),
    assistantTombstones: { ...meta.assistantTombstones },
    topicTombstones: { ...meta.topicTombstones },
    topicMessagesClearedAt: { ...meta.topicMessagesClearedAt },
    messageTombstones: { ...meta.messageTombstones },
    timestamp: meta.lastSyncTimestamp || hlc.now(),
    nodeId: hlc.getNodeId(),
  };
}

/**
 * 根据合并后的 topic 状态重建 assistant 树。
 *
 * @remarks
 * 这里不能简单沿用本地 assistant 列表，因为同步协议把 assistant 默认配置和 topic/message 结构拆开了：
 * 合并完成后必须重新把 topic 掛回 assistant，并为只有 topic、没有 defaults 的遗留数据补 synthetic assistant。
 */
function rebuildAssistants(
  mergedState: SyncState,
  fallbackAssistants: Assistant[],
): Assistant[] {
  const fallbackById = new Map(fallbackAssistants.map((assistant) => [assistant.id, assistant]));
  const topicsByAssistantId = new Map<string, Topic[]>();

  for (const topicState of mergedState.topics) {
    const topicMeta = toTopicMeta(topicState.topic);
    const bucket = topicsByAssistantId.get(topicMeta.assistantId) ?? [];
    bucket.push(topicMeta);
    topicsByAssistantId.set(topicMeta.assistantId, bucket);
  }

  const assistants: Assistant[] = mergedState.assistants.map((assistantState) => ({
    ...assistantState.assistant,
    topics: sortTopics(topicsByAssistantId.get(assistantState.assistant.id) ?? []),
  }));

  for (const [assistantId, topics] of topicsByAssistantId) {
    if (assistants.some((assistant) => assistant.id === assistantId)) continue;
    assistants.push(buildSyntheticAssistant(
      assistantId,
      topics,
      fallbackById.get(assistantId),
    ));
  }

  return sortAssistants(assistants);
}

/**
 * 一次同步运行返回的摘要结果。
 *
 * 说明：
 * - `status` 表示整体结论；
 * - `merged` 用于告知本轮从远端合并了多少话题；
 * - `error` 仅在失败时提供可读描述。
 */
export interface SyncResult {
  /** 同步结果状态 */
  status: 'success' | 'no-remote' | 'error';
  /** 从远端新增/更新的话题数量 */
  merged: number;
  /** 失败时的错误信息 */
  error?: string;
}

// 单进程内仍要挡住重复 runSync；
// 即便跨上下文已经有更高层的持久化锁，同一上下文里重复点“立即同步”也不该并发执行两套 merge。
let syncInflight: Promise<SyncResult> | null = null;

/**
 * 执行完整同步：pull → merge → push → 更新本地。
 */
export async function runSync(backend: SyncBackend, localStore: LocalStore): Promise<SyncResult> {
  if (syncInflight) return syncInflight;

  syncInflight = runSyncInternal(backend, localStore).finally(() => {
    syncInflight = null;
  });
  return syncInflight;
}

/**
 * 真正执行一次完整同步流程。
 *
 * @param backend - 远端同步后端。
 * @param localStore - 本地 assistant/topic 存储适配器。
 * @returns 同步结果摘要。
 */
async function runSyncInternal(backend: SyncBackend, localStore: LocalStore): Promise<SyncResult> {
  const hlc = getHLC();

  try {
    // 进入同步前先把挂起的字段时钟刷盘，保证本轮 buildLocalSyncState 能看到最新本地修改。
    await flushSyncMetaPendingWrites();

    // 1) 构建本地状态
    const [localAssistants, localTopics, localSharedConfig, localSecretConfig] = await Promise.all([
      localStore.getAssistants(),
      localStore.getTopics(),
      localStore.getSharedConfig?.() ?? {},
      localStore.getSecretConfig?.() ?? {},
    ]);
    const localState = {
      ...await buildLocalSyncState(localAssistants, localTopics),
      sharedConfig: buildCloudSyncPlainConfigSnapshot(localSharedConfig),
    };
    const baseMeta = await loadSyncMeta();

    // 2) 拉取远端状态
    const remoteState = normalizeSyncState(await backend.pull());

    if (!remoteState) {
      const secretMerge = await selectSecretMerge({
        localSecretConfig,
        remoteSecretConfig: {},
        remoteSecretUpdatedAt: null,
        meta: baseMeta,
        hlc,
      });
      // 远端无数据 → 将本地状态作为初始状态推送
      const initialState: SyncState = {
        ...localState,
        pendingSecretVault: secretMerge.result,
        timestamp: hlc.now(),
        nodeId: hlc.getNodeId(),
      };
      await backend.push(initialState);
      saveSyncMeta(buildSyncMetaFromStateWithSecret(initialState, secretMerge.meta));
      await flushSyncMetaPendingWrites();
      return { status: 'no-remote', merged: 0 };
    }

    // 3) 接收远端时钟
    hlc.receive(remoteState.timestamp);

    // 4) 合并
    const secretMerge = await selectSecretMerge({
      localSecretConfig,
      remoteSecretConfig: remoteState.decryptedSecretConfig ?? {},
      remoteSecretUpdatedAt: remoteState.secretVault?.updatedAt ?? null,
      meta: baseMeta,
      hlc,
    });
    const merged: SyncState = {
      ...fullMerge(localState, remoteState),
      pendingSecretVault: secretMerge.result,
    };

    // 5) 先推送到远端，成功后再更新本地状态。
    // 这样即使 push 失败，本地仍保持旧状态，不会出现“本地以为已合并、远端其实没写进去”的永久分叉。
    await backend.push(merged);

    // 6) 更新本地存储（push 成功后才写入，保证本地与远端一致）
    const mergedTopics = merged.topics.map((topicState) => topicState.topic);
    const mergedAssistants = rebuildAssistants(merged, localAssistants);
    const mergedSharedConfig = mergeSharedConfigWithSecrets(
      merged.sharedConfig ?? {},
      secretMerge.result?.snapshot ?? {},
    );
    await Promise.all([
      localStore.setAssistants(mergedAssistants),
      localStore.setTopics(mergedTopics),
      localStore.setSharedConfig?.(mergedSharedConfig),
    ]);

    // 7) 更新同步元数据
    // meta 必须基于 merged state 重建，而不是沿用 local meta 局部修补；否则远端 tombstone/时钟可能漏写回本地。
    saveSyncMeta(buildSyncMetaFromStateWithSecret(merged, secretMerge.meta));
    await flushSyncMetaPendingWrites();

    const mergedCount = merged.topics.length - localTopics.length;
    return { status: 'success', merged: Math.max(0, mergedCount) };
  } catch (e) {
    return {
      status: 'error',
      merged: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
