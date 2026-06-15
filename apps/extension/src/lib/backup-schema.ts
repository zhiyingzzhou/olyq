/**
 * 说明：`backup-schema` 备份模块。
 *
 * 职责：
 * - 承载 `backup-schema` 相关的当前文件实现与模块边界；
 * - 对外暴露 `BackupChatMetadata`、`BackupChatSnapshot`、`BackupMemoryMetadata` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { TopicMessagesRow } from '@/lib/chat/messages-db';
import { I18nError, isI18nError } from '@/lib/i18n/error';
import { BACKUP_LIMITS } from './backup-config';
import type { MemoryBackupRecord } from './memory/memory-store';

/** 聊天数据备份的元信息。 */
export type BackupChatMetadata = {
  /** 话题条目数量。 */
  topicCount: number;
  /** 消息行数量。 */
  messageCount: number;
};

/** 聊天数据备份结构。 */
export type BackupChatSnapshot = {
  /** 所有话题消息行。 */
  messages: TopicMessagesRow[];
  /** 聊天数据元信息。 */
  metadata: BackupChatMetadata;
};

/** 记忆数据备份的元信息。 */
export type BackupMemoryMetadata = {
  /** 记忆记录数量。 */
  count: number;
};

/** 记忆数据备份结构。 */
export type BackupMemorySnapshot = {
  /** 所有记忆记录。 */
  records: MemoryBackupRecord[];
  /** 记忆数据元信息。 */
  metadata: BackupMemoryMetadata;
};

/** 备份格式错误可持久化诊断上下文。 */
export interface BackupFormatErrorContext {
  /** 稳定原因码。 */
  detail: string;
  /** 归档域 ID。 */
  domainId?: string;
  /** 失败阶段。 */
  stage?: string;
  /** 相关归档路径。 */
  path?: string;
}

/** 提取嵌套备份格式错误中的稳定原因码。 */
export function getBackupFormatErrorDetail(error: unknown): string | undefined {
  if (isI18nError(error) && error.i18n.key === 'errors.backupFormatUnsupported') {
    const detail = error.i18n.params?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail.trim();
  }
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause !== undefined) return getBackupFormatErrorDetail(cause);
  }
  return undefined;
}

/**
 * 构造统一的“备份格式不支持”错误。
 *
 * @param context - 稳定原因码和可选域级上下文。
 * @param cause - 可选：原始错误原因。
 * @returns 统一的国际化错误对象。
 */
export function createBackupFormatError(context: BackupFormatErrorContext, cause?: unknown): I18nError {
  const causeDetail = getBackupFormatErrorDetail(cause);
  return new I18nError(
    'errors.backupFormatUnsupported',
    {
      detail: context.detail,
      ...(context.domainId ? { domainId: context.domainId } : {}),
      ...(context.stage ? { stage: context.stage } : {}),
      ...(context.path ? { path: context.path } : {}),
      ...(causeDetail && causeDetail !== context.detail ? { causeDetail } : {}),
    },
    cause === undefined ? undefined : { cause },
  );
}

/**
 * 判断某个错误是否已经是统一的“备份格式不支持”错误。
 */
export function isBackupFormatError(error: unknown): error is I18nError {
  return isI18nError(error) && error.i18n.key === 'errors.backupFormatUnsupported';
}

/**
 * 将任意错误规整为备份格式错误。
 */
export function normalizeBackupFormatError(error: unknown, context: BackupFormatErrorContext): I18nError {
  const detail = getBackupFormatErrorDetail(error);
  return isBackupFormatError(error) && detail ? error : createBackupFormatError(context, error);
}

/**
 * 根据消息行列表计算话题数量。
 *
 * @param messages - 备份中的消息行
 * @returns 不重复的话题数量
 */
function computeTopicCount(messages: TopicMessagesRow[]): number {
  const topicIds = new Set<string>();
  for (const messageRow of messages) {
    const id = (messageRow as { id?: unknown }).id;
    if (typeof id !== 'string' || !id.trim()) {
      throw createBackupFormatError({ detail: 'backup.chat.messages.topic_id_missing' });
    }
    topicIds.add(id);
  }
  return topicIds.size;
}

/**
 * 构建聊天数据备份快照。
 *
 * @param messages - 话题消息行列表
 * @returns 带 metadata 的聊天快照
 */
export function buildBackupChatSnapshot(messages: TopicMessagesRow[]): BackupChatSnapshot {
  if (!Array.isArray(messages)) throw createBackupFormatError({ detail: 'backup.chat.messages.array_required' });
  if (messages.length > BACKUP_LIMITS.maxChatMessages) {
    throw createBackupFormatError({ detail: 'backup.chat.messages.count_limit_exceeded' });
  }
  return {
    messages,
    metadata: {
      topicCount: computeTopicCount(messages),
      messageCount: messages.length,
    },
  };
}

/**
 * 构建记忆数据备份快照。
 *
 * @param records - 记忆记录数组
 * @returns 带 metadata 的记忆快照
 */
export function buildBackupMemorySnapshot(records: MemoryBackupRecord[]): BackupMemorySnapshot {
  if (!Array.isArray(records)) throw createBackupFormatError({ detail: 'backup.memory.records.array_required' });
  return {
    records,
    metadata: {
      count: records.length,
    },
  };
}
