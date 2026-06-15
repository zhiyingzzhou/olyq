/**
 * 说明：`diff-merge` 同步模块。
 *
 * 职责：
 * - 承载 `diff-merge` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SyncedAssistantConfig`、`SyncableAssistantState`、`SyncableTopicState` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 同步用的状态 Diff 与合并逻辑。
 *
 * 说明：
 * - assistant 默认配置与 topic 元数据/消息分开同步；
 * - assistant 使用字段级 LWW；
 * - topic 使用字段级 LWW + 消息集合合并。
 */

import type { Assistant } from '@/types/assistant';
import type { TopicConversation, Message } from '@/types/chat';
import type { HLCTimestamp } from './hlc';
import { compareHLC, getHLC } from './hlc';

/** 导出类型：`SyncedAssistantConfig`。 */
export type SyncedAssistantConfig = Omit<Assistant, 'topics'>;

/** 可参与同步与冲突合并的 assistant 默认配置包装结构。 */
export interface SyncableAssistantState {
  /** assistant 默认配置正文。 */
  assistant: SyncedAssistantConfig;
  /** 用于冲突解决的字段级 HLC 时间戳。 */
  fieldTimestamps: Record<string, HLCTimestamp>;
}

/** 可参与同步与冲突合并的话题包装结构。 */
export interface SyncableTopicState {
  /** 话题正文（仅 topic-owned 字段 + messages）。 */
  topic: TopicConversation;
  /** 用于冲突解决的字段级 HLC 时间戳。 */
  fieldTimestamps: Record<string, HLCTimestamp>;
  /** 最近一次追加消息的 HLC 时间戳。 */
  messagesTimestamp: HLCTimestamp;
}

/** 一次同步快照的完整状态。 */
export interface SyncState {
  /** 同步状态 schema 版本；当前固定为 1。 */
  schemaVersion?: 1;
  /** 助手默认配置列表。 */
  assistants: SyncableAssistantState[];
  /** 可同步的话题列表。 */
  topics: SyncableTopicState[];
  /** 参与 structured sync 的轻量共享配置快照。 */
  sharedConfig?: Record<string, unknown>;
  /** 加密后的敏感配置包；明文密钥不得进入远端同步状态。 */
  secretVault?: EncryptedSyncSecretVault;
  /** 同步引擎内部持有的已解密远端 secret；不会写入远端 JSON。 */
  decryptedSecretConfig?: Record<string, unknown>;
  /** 同步引擎提交给远端 backend 加密的 secret 快照；不会写入远端 JSON。 */
  pendingSecretVault?: SyncSecretMergeResult;
  /** 已删除 assistant 的 tombstone。 */
  assistantTombstones: Record<string, HLCTimestamp>;
  /** 已删除 topic 的 tombstone。 */
  topicTombstones: Record<string, HLCTimestamp>;
  /** topic 级消息清空时间戳。 */
  topicMessagesClearedAt: Record<string, HLCTimestamp>;
  /** topic 下已删除消息的 tombstone。 */
  messageTombstones: Record<string, Record<string, HLCTimestamp>>;
  /** 整体同步状态的 HLC 时间戳。 */
  timestamp: HLCTimestamp;
  /** 产出该状态的节点 ID。 */
  nodeId: string;
}

/** structured sync 的加密 secret 包。 */
export interface EncryptedSyncSecretVault {
  /** secret 包 schema；当前固定为 1。 */
  version: 1;
  /** 加密算法。 */
  algorithm: 'AES-GCM';
  /** KDF 算法。 */
  kdf: 'PBKDF2-SHA256';
  /** PBKDF2 迭代次数。 */
  iterations: number;
  /** base64 编码 salt。 */
  salt: string;
  /** base64 编码 iv。 */
  iv: string;
  /** base64 编码密文。 */
  ciphertext: string;
  /** 产出该 secret 包的节点 ID。 */
  nodeId: string;
  /** 产出时间戳。 */
  updatedAt: HLCTimestamp;
}

/** structured sync 合并后给远端 backend 包装 secretVault 的明文结果。 */
export interface SyncSecretMergeResult {
  /** 需要被 backend 加密后写入远端 vault 的 secret 快照。 */
  snapshot: Record<string, unknown>;
  /** 该 secret 快照的 LWW 时间戳。 */
  updatedAt: HLCTimestamp;
}

interface AssistantConflict {
  assistantId: string;
  local: SyncableAssistantState;
  remote: SyncableAssistantState;
}

interface TopicConflict {
  topicId: string;
  local: SyncableTopicState;
  remote: SyncableTopicState;
}

/** 本地与远端快照 diff 的结果结构。 */
export interface DiffResult {
  assistantLocalOnly: SyncedAssistantConfig[];
  assistantRemoteOnly: SyncedAssistantConfig[];
  assistantConflicts: AssistantConflict[];
  topicLocalOnly: TopicConversation[];
  topicRemoteOnly: TopicConversation[];
  topicConflicts: TopicConflict[];
}

/**
 * 导出常量：`ASSISTANT_LWW_FIELDS`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const ASSISTANT_LWW_FIELDS = [
  'name',
  'description',
  'iconId',
  'prompt',
  'mcpSelection',
  'enableWebSearch',
  'webSearchProviderId',
  'enableGenerateImage',
  'enableMemory',
  'tags',
  'regularPhrases',
  'order',
  'createdAt',
  'updatedAt',
] as const;

/**
 * 导出常量：`TOPIC_LWW_FIELDS`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const TOPIC_LWW_FIELDS = [
  'title',
  'folderId',
  'pinned',
  'order',
  'assistantId',
  'topicPrompt',
  'model',
  'temperature',
  'topP',
  'maxTokens',
  'contextLength',
  'modelParams',
  'browserContextMode',
  'isNameManuallyEdited',
  'createdAt',
  'updatedAt',
] as const;

/**
 * 计算本地与远端同步状态的差异。
 */
export function computeDiff(local: SyncState, remote: SyncState): DiffResult {
  const localAssistantMap = new Map(local.assistants.map((state) => [state.assistant.id, state]));
  const remoteAssistantMap = new Map(remote.assistants.map((state) => [state.assistant.id, state]));
  const localTopicMap = new Map(local.topics.map((state) => [state.topic.id, state]));
  const remoteTopicMap = new Map(remote.topics.map((state) => [state.topic.id, state]));

  const assistantLocalOnly: SyncedAssistantConfig[] = [];
  const assistantRemoteOnly: SyncedAssistantConfig[] = [];
  const assistantConflicts: AssistantConflict[] = [];
  const topicLocalOnly: TopicConversation[] = [];
  const topicRemoteOnly: TopicConversation[] = [];
  const topicConflicts: TopicConflict[] = [];

  for (const [id, localAssistant] of localAssistantMap) {
    const remoteAssistant = remoteAssistantMap.get(id);
    if (!remoteAssistant) {
      assistantLocalOnly.push(localAssistant.assistant);
    } else {
      assistantConflicts.push({ assistantId: id, local: localAssistant, remote: remoteAssistant });
    }
  }

  for (const [id, remoteAssistant] of remoteAssistantMap) {
    if (!localAssistantMap.has(id)) assistantRemoteOnly.push(remoteAssistant.assistant);
  }

  for (const [id, localTopic] of localTopicMap) {
    const remoteTopic = remoteTopicMap.get(id);
    if (!remoteTopic) {
      topicLocalOnly.push(localTopic.topic);
    } else {
      topicConflicts.push({ topicId: id, local: localTopic, remote: remoteTopic });
    }
  }

  for (const [id, remoteTopic] of remoteTopicMap) {
    if (!localTopicMap.has(id)) topicRemoteOnly.push(remoteTopic.topic);
  }

  return {
    assistantLocalOnly,
    assistantRemoteOnly,
    assistantConflicts,
    topicLocalOnly,
    topicRemoteOnly,
    topicConflicts,
  };
}

/**
 * 读取消息级 revision。
 *
 * @param message - 当前消息。
 * @returns 当前消息的 revision；缺失时返回空字符串。
 */
function getMessageRevision(message: Message): string {
  const revision = (message as unknown as { revision?: unknown }).revision;
  return typeof revision === 'string' ? revision : '';
}

/**
 * 解析消息 revision 时间。
 *
 * @param message - 当前消息。
 * @returns revisionClock 或 revision 前缀对应的时间；都缺失时回退 createdAt。
 */
function getMessageRevisionTime(message: Message): number {
  const record = message as unknown as Record<string, unknown>;
  const revisionClock = record.revisionClock as { wallTime?: unknown } | undefined;
  if (revisionClock && typeof revisionClock.wallTime === 'number' && Number.isFinite(revisionClock.wallTime)) {
    return revisionClock.wallTime;
  }
  if (typeof record.revision === 'string') {
    const parsed = Number.parseInt(record.revision.slice(0, 13), 16);
    if (Number.isFinite(parsed)) return parsed;
  }
  return typeof message.createdAt === 'number' && Number.isFinite(message.createdAt) ? message.createdAt : 0;
}

/**
 * 判断同 ID 消息冲突时是否采用 incoming。
 *
 * @param existing - 当前已选消息。
 * @param incoming - 待合入消息。
 * @returns incoming revision 更新时返回 `true`。
 */
function shouldUseIncomingMessage(existing: Message, incoming: Message): boolean {
  const incomingRevision = getMessageRevision(incoming);
  const existingRevision = getMessageRevision(existing);
  if (incomingRevision && existingRevision && incomingRevision !== existingRevision) {
    const incomingTime = getMessageRevisionTime(incoming);
    const existingTime = getMessageRevisionTime(existing);
    if (incomingTime !== existingTime) return incomingTime > existingTime;
    return incomingRevision > existingRevision;
  }
  if (incomingRevision && !existingRevision) return true;
  if (!incomingRevision && existingRevision) return false;
  return getMessageRevisionTime(incoming) > getMessageRevisionTime(existing);
}

/**
 * 合并两组消息。
 *
 * @remarks
 * 同 ID 冲突只认消息级 `revision/revisionClock`，不依赖不存在的 `updatedAt` 字段。
 */
function mergeMessages(a: Message[], b: Message[]): Message[] {
  const map = new Map<string, Message>();
  for (const message of a) map.set(message.id, message);
  for (const message of b) {
    const existing = map.get(message.id);
    if (!existing) {
      map.set(message.id, message);
      continue;
    }
    if (shouldUseIncomingMessage(existing, message)) map.set(message.id, message);
  }
  return Array.from(map.values()).sort((x, y) => x.createdAt - y.createdAt);
}

/**
 * 内部函数：`mergeTimestampRecord`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function mergeTimestampRecord(
  local: Record<string, HLCTimestamp>,
  remote: Record<string, HLCTimestamp>,
): Record<string, HLCTimestamp> {
  const merged: Record<string, HLCTimestamp> = { ...local };
  for (const [id, timestamp] of Object.entries(remote)) {
    const current = merged[id];
    if (!current || compareHLC(timestamp, current) > 0) {
      merged[id] = timestamp;
    }
  }
  return merged;
}

/**
 * 内部函数：`mergeNestedTimestampRecord`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function mergeNestedTimestampRecord(
  local: Record<string, Record<string, HLCTimestamp>>,
  remote: Record<string, Record<string, HLCTimestamp>>,
): Record<string, Record<string, HLCTimestamp>> {
  const merged: Record<string, Record<string, HLCTimestamp>> = { ...local };
  for (const [topicId, remoteRecord] of Object.entries(remote)) {
    merged[topicId] = mergeTimestampRecord(merged[topicId] ?? {}, remoteRecord);
  }
  return merged;
}

/**
 * 内部函数：`latestStateTimestamp`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function latestStateTimestamp(
  fieldTimestamps: Record<string, HLCTimestamp>,
  fallback: HLCTimestamp,
): HLCTimestamp {
  let latest = fallback;
  for (const timestamp of Object.values(fieldTimestamps)) {
    if (compareHLC(timestamp, latest) > 0) latest = timestamp;
  }
  return latest;
}

/**
 * 内部函数：`filterDeletedMessages`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function filterDeletedMessages(
  topic: TopicConversation,
  clearedAt: HLCTimestamp | undefined,
  tombstones: Record<string, HLCTimestamp> | undefined,
): TopicConversation {
  const messageTombstones = tombstones ?? {};
  const messages = Array.isArray(topic.messages) ? topic.messages : [];
  return {
    ...topic,
    messages: messages.filter((message) => {
      if (!message?.id) return false;
      if (message.id in messageTombstones) return false;
      if (!clearedAt) return true;
      const updatedAt = typeof (message as unknown as Record<string, unknown>).updatedAt === 'number'
        ? (message as unknown as Record<string, number>).updatedAt
        : message.createdAt;
      return updatedAt > clearedAt.wallTime;
    }),
  };
}

/** 基于 LWW 按字段合并两个 assistant 默认配置。 */
export function mergeAssistantState(
  local: SyncableAssistantState,
  remote: SyncableAssistantState,
): SyncableAssistantState {
  const mergedAssistant = { ...local.assistant };
  const mergedTimestamps = { ...local.fieldTimestamps };

  for (const field of ASSISTANT_LWW_FIELDS) {
    const localTs = local.fieldTimestamps[field];
    const remoteTs = remote.fieldTimestamps[field];
    if (!localTs && remoteTs) {
      (mergedAssistant as Record<string, unknown>)[field] = (remote.assistant as Record<string, unknown>)[field];
      mergedTimestamps[field] = remoteTs;
    } else if (localTs && remoteTs && compareHLC(remoteTs, localTs) > 0) {
      (mergedAssistant as Record<string, unknown>)[field] = (remote.assistant as Record<string, unknown>)[field];
      mergedTimestamps[field] = remoteTs;
    }
  }

  mergedAssistant.updatedAt = Math.max(local.assistant.updatedAt, remote.assistant.updatedAt);

  return {
    assistant: mergedAssistant,
    fieldTimestamps: mergedTimestamps,
  };
}

/** 基于 LWW 按字段合并两个话题。 */
export function mergeTopicState(
  local: SyncableTopicState,
  remote: SyncableTopicState,
): SyncableTopicState {
  const mergedTopic = { ...local.topic };
  const mergedTimestamps = { ...local.fieldTimestamps };
  const mergedTopicRecord = mergedTopic as unknown as Record<string, unknown>;
  const remoteTopicRecord = remote.topic as unknown as Record<string, unknown>;

  for (const field of TOPIC_LWW_FIELDS) {
    const localTs = local.fieldTimestamps[field];
    const remoteTs = remote.fieldTimestamps[field];
    if (!localTs && remoteTs) {
      mergedTopicRecord[field] = remoteTopicRecord[field];
      mergedTimestamps[field] = remoteTs;
    } else if (localTs && remoteTs && compareHLC(remoteTs, localTs) > 0) {
      mergedTopicRecord[field] = remoteTopicRecord[field];
      mergedTimestamps[field] = remoteTs;
    }
  }

  mergedTopic.messages = mergeMessages(
    Array.isArray(local.topic.messages) ? local.topic.messages : [],
    Array.isArray(remote.topic.messages) ? remote.topic.messages : [],
  );
  mergedTopic.updatedAt = Math.max(local.topic.updatedAt, remote.topic.updatedAt);

  const messagesTimestamp = compareHLC(remote.messagesTimestamp, local.messagesTimestamp) > 0
    ? remote.messagesTimestamp
    : local.messagesTimestamp;

  return {
    topic: mergedTopic,
    fieldTimestamps: mergedTimestamps,
    messagesTimestamp,
  };
}

/**
 * 全量合并：计算 diff，解决冲突，返回统一状态。
 */
export function fullMerge(local: SyncState, remote: SyncState): SyncState {
  const hlc = getHLC();
  const diff = computeDiff(local, remote);
  const assistantTombstones = mergeTimestampRecord(local.assistantTombstones, remote.assistantTombstones);
  const topicTombstones = mergeTimestampRecord(local.topicTombstones, remote.topicTombstones);
  const topicMessagesClearedAt = mergeTimestampRecord(local.topicMessagesClearedAt, remote.topicMessagesClearedAt);
  const messageTombstones = mergeNestedTimestampRecord(local.messageTombstones, remote.messageTombstones);

  const mergedAssistants: SyncableAssistantState[] = [];
  const mergedTopics: SyncableTopicState[] = [];

    /**
   * 内部函数变量：`isAssistantDeleted`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const isAssistantDeleted = (state: SyncableAssistantState) => {
    const deletedAt = assistantTombstones[state.assistant.id];
    if (!deletedAt) return false;
    const latest = latestStateTimestamp(
      state.fieldTimestamps,
      state.fieldTimestamps.updatedAt ?? Object.values(state.fieldTimestamps)[0] ?? deletedAt,
    );
    return compareHLC(deletedAt, latest) >= 0;
  };

    /**
   * 内部函数变量：`isTopicDeleted`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const isTopicDeleted = (state: SyncableTopicState) => {
    const deletedAt = topicTombstones[state.topic.id];
    if (!deletedAt) return false;
    const latest = latestStateTimestamp(state.fieldTimestamps, state.messagesTimestamp);
    return compareHLC(deletedAt, latest) >= 0;
  };

    /**
   * 内部函数变量：`applyTopicDeletions`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const applyTopicDeletions = (state: SyncableTopicState): SyncableTopicState => ({
    ...state,
    topic: filterDeletedMessages(
      state.topic,
      topicMessagesClearedAt[state.topic.id],
      messageTombstones[state.topic.id],
    ),
  });

  for (const assistant of diff.assistantLocalOnly) {
    const state = local.assistants.find((item) => item.assistant.id === assistant.id);
    if (state && !isAssistantDeleted(state)) mergedAssistants.push(state);
  }
  for (const assistant of diff.assistantRemoteOnly) {
    const state = remote.assistants.find((item) => item.assistant.id === assistant.id);
    if (state && !isAssistantDeleted(state)) mergedAssistants.push(state);
  }
  for (const conflict of diff.assistantConflicts) {
    const mergedState = mergeAssistantState(conflict.local, conflict.remote);
    if (!isAssistantDeleted(mergedState)) mergedAssistants.push(mergedState);
  }

  for (const topic of diff.topicLocalOnly) {
    const state = local.topics.find((item) => item.topic.id === topic.id);
    if (state && !isTopicDeleted(state)) mergedTopics.push(applyTopicDeletions(state));
  }
  for (const topic of diff.topicRemoteOnly) {
    const state = remote.topics.find((item) => item.topic.id === topic.id);
    if (state && !isTopicDeleted(state)) mergedTopics.push(applyTopicDeletions(state));
  }
  for (const conflict of diff.topicConflicts) {
    const mergedState = mergeTopicState(conflict.local, conflict.remote);
    if (!isTopicDeleted(mergedState)) mergedTopics.push(applyTopicDeletions(mergedState));
  }

  mergedAssistants.sort((a, b) => {
    const ao = typeof a.assistant.order === 'number' ? a.assistant.order : a.assistant.createdAt;
    const bo = typeof b.assistant.order === 'number' ? b.assistant.order : b.assistant.createdAt;
    if (bo !== ao) return bo - ao;
    return b.assistant.updatedAt - a.assistant.updatedAt;
  });
  mergedTopics.sort((a, b) => b.topic.updatedAt - a.topic.updatedAt);

  return {
    schemaVersion: 1,
    assistants: mergedAssistants,
    topics: mergedTopics,
    sharedConfig: {
      ...(local.sharedConfig ?? {}),
      ...(remote.sharedConfig ?? {}),
    },
    secretVault: remote.secretVault ?? local.secretVault,
    assistantTombstones,
    topicTombstones,
    topicMessagesClearedAt,
    messageTombstones,
    timestamp: hlc.now(),
    nodeId: hlc.getNodeId(),
  };
}
