/**
 * 说明：`messages-db` 基础能力模块。
 *
 * 职责：
 * - 承载 `messages-db` 相关的当前文件实现与模块边界；
 * - 对外暴露 `TopicMessagesRow`、`MessagesDbStats`、`openMessagesDb` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { Message } from '@/types/chat';
import { requestToPromise, transactionDone } from '@/lib/utils/idb';
import { I18nError } from '@/lib/i18n/error';
import { normalizeMessagesFromStorage } from '@/lib/chat/message-translations';
import { getHLC, serializeHLC, type HLCTimestamp } from '@/lib/sync/hlc';

/**
 * 对话消息库（IndexedDB）
 *
 * 彻底切换（v1）：
 * - 仅存储“按话题 ID 索引的消息数组”
 * - 话题元数据（名称/置顶/提示词/排序/归属助手）由上层 store 以 v1 key 持久化
 * - assistant 内部过程只保留 `trace` 单一真源，不兼容旧 `reasoning/toolCalls`
 */
/** 消息 IndexedDB 名称，E2E 与备份恢复测试必须复用该真源，避免写入旧库名。 */
export const MESSAGES_DB_NAME = 'olyq.chat.v1';
/** 消息 IndexedDB 当前版本；开发期只维护当前 schema，不保留旧版本写入路径。 */
export const MESSAGES_DB_VERSION = 1;
/** 按话题 ID 存储完整消息数组的对象仓库名。 */
export const MESSAGES_DB_STORE = 'topics';

/**
 * IndexedDB 中单个话题消息记录。
 */
export type TopicMessagesRow = {
  /**
   * 话题唯一标识。
   */
  id: string;
  /**
   * 该话题当前持久化的完整消息数组。
   *
   * 数组顺序即消息显示顺序；写入时由上层保证消息结构合法。
   */
  messages: Message[];
};

/**
 * 消息库统计信息。
 */
export interface MessagesDbStats {
  /**
   * 当前库内已持久化的话题数量。
   */
  topics: number;
}

/**
 * 复用单例连接 Promise，避免同一事件循环内重复打开 IndexedDB。
 *
 * 当数据库被关闭、出错或版本切换时会重置，后续调用会重新建立连接。
 */
let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * 为消息补齐稳定同步 revision。
 *
 * @remarks
 * 这是消息库写入边界上的当前 schema 收口点：
 * - 已有 revision 的消息保持不变，避免流式增量写回反复改变冲突时钟；
 * - 缺失 revision 的消息只在当前彻底切换写入时补当前 HLC；
 * - 远端同步合并将只依赖该字段或 `createdAt` 兜底，不再读取不存在的 `updatedAt`。
 */
export function normalizeMessageRevisions(messages: Message[]): Message[] {
  if (!Array.isArray(messages)) return [];
  const hlc = getHLC();
  let changed = false;
  const nextMessages = messages.map((message) => {
    if (!message || typeof message !== 'object') {
      changed = true;
      return message;
    }
    const record = message as Message & { revision?: unknown; revisionClock?: unknown };
    if (typeof record.revision === 'string' && record.revision.trim()) return message;
    const revisionClock: HLCTimestamp = hlc.now();
    changed = true;
    return {
      ...message,
      revision: serializeHLC(revisionClock),
      revisionClock,
    };
  });
  return changed ? nextMessages : messages;
}

/**
 * 打开消息 IndexedDB，并在首次调用时完成对象仓库初始化。
 *
 * @returns 可复用的数据库连接 Promise；若连接失效会在下次调用时重新创建。
 * @throws 当 IndexedDB 打开失败时抛出带国际化键的错误。
 */
export async function openMessagesDb() {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(MESSAGES_DB_NAME, MESSAGES_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(MESSAGES_DB_STORE)) {
          db.createObjectStore(MESSAGES_DB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // 连接一旦被浏览器关闭或版本升级替换，就让后续调用重新走打开流程。
        db.onclose = () => { dbPromise = null; };
        db.onerror = () => { dbPromise = null; };
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => {
        dbPromise = null;
        const detail = typeof req.error?.message === 'string' ? req.error.message.trim() : '';
        reject(
          detail
            ? new I18nError('errors.indexedDbOpenFailedWithDetail', { detail }, { cause: req.error })
            : new I18nError('errors.indexedDbOpenFailed', undefined, { cause: req.error }),
        );
      };
    });
  }
  return dbPromise;
}

/**
 * 读取指定话题的完整消息数组。
 *
 * @param topicId - 话题 ID。
 * @returns 若记录不存在或键为空，则返回空数组。
 */
export async function getTopicMessages(topicId: string): Promise<Message[]> {
  const key = String(topicId || '').trim();
  if (!key) return [];
  const db = await openMessagesDb();
  const tx = db.transaction([MESSAGES_DB_STORE], 'readonly');
  const row = await requestToPromise(tx.objectStore(MESSAGES_DB_STORE).get(key) as IDBRequest<TopicMessagesRow | undefined>);
  await transactionDone(tx);
  const rawMessages = Array.isArray(row?.messages) ? row!.messages : [];
  const { messages, changed } = normalizeMessagesFromStorage(rawMessages);
  const normalizedMessages = normalizeMessageRevisions(messages);
  if (changed || normalizedMessages !== messages) await putTopicMessages(key, normalizedMessages);
  return normalizedMessages;
}

/**
 * 覆盖写入指定话题的消息数组。
 *
 * @param topicId - 话题 ID。
 * @param messages - 需要完整替换的消息列表；非数组输入会被降级为空数组。
 * @returns 写入完成后返回。
 */
export async function putTopicMessages(topicId: string, messages: Message[]): Promise<void> {
  const key = String(topicId || '').trim();
  if (!key) return;
  const db = await openMessagesDb();
  const tx = db.transaction([MESSAGES_DB_STORE], 'readwrite');
  await requestToPromise(tx.objectStore(MESSAGES_DB_STORE).put({ id: key, messages: normalizeMessageRevisions(messages) } satisfies TopicMessagesRow));
  await transactionDone(tx);
}

/**
 * 确保指定话题在数据库中已有一条记录。
 *
 * 仅在不存在时写入空消息数组，避免上层在首次持久化前缺少占位记录。
 *
 * @param topicId - 话题 ID。
 * @returns 若记录已存在或键为空，函数会安静返回。
 */
export async function ensureTopicRow(topicId: string): Promise<void> {
  const key = String(topicId || '').trim();
  if (!key) return;
  const db = await openMessagesDb();
  const tx = db.transaction([MESSAGES_DB_STORE], 'readwrite');
  const store = tx.objectStore(MESSAGES_DB_STORE);
  const existing = await requestToPromise(store.get(key) as IDBRequest<TopicMessagesRow | undefined>);
  if (!existing) {
    await requestToPromise(store.put({ id: key, messages: [] } satisfies TopicMessagesRow));
  }
  await transactionDone(tx);
}

/**
 * 删除指定话题的消息记录。
 *
 * @param topicId - 话题 ID。
 * @returns 删除完成后返回；空键不会触发任何写操作。
 */
export async function deleteTopicMessages(topicId: string): Promise<void> {
  const key = String(topicId || '').trim();
  if (!key) return;
  const db = await openMessagesDb();
  const tx = db.transaction([MESSAGES_DB_STORE], 'readwrite');
  await requestToPromise(tx.objectStore(MESSAGES_DB_STORE).delete(key));
  await transactionDone(tx);
}

/**
 * 枚举数据库内所有话题消息记录。
 *
 * @returns 按 IndexedDB cursor 遍历顺序返回所有合法记录，用于导出、迁移或调试。
 * @throws 当 cursor 遍历请求失败时抛出国际化错误。
 */
export async function listAllTopicMessages(): Promise<TopicMessagesRow[]> {
  const db = await openMessagesDb();
  const tx = db.transaction([MESSAGES_DB_STORE], 'readonly');
  const store = tx.objectStore(MESSAGES_DB_STORE);
  const items: TopicMessagesRow[] = [];

  await new Promise<void>((resolve, reject) => {
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve();
      const v = cursor.value as unknown;
      // 只接受最小合法结构，避免历史脏数据把导出流程拖崩。
      if (v && typeof v === 'object' && typeof (v as Record<string, unknown>).id === 'string') {
        const row = v as TopicMessagesRow;
        items.push({ id: row.id, messages: normalizeMessageRevisions(Array.isArray(row.messages) ? row.messages : []) });
      }
      cursor.continue();
    };
    req.onerror = () => {
      const detail = typeof req.error?.message === 'string' ? req.error.message.trim() : '';
      reject(
        detail
          ? new I18nError('errors.indexedDbRequestFailedWithDetail', { detail }, { cause: req.error })
          : new I18nError('errors.indexedDbRequestFailed', undefined, { cause: req.error }),
      );
    };
  });

  await transactionDone(tx);
  return items;
}

/**
 * 清空后批量重建整个消息库内容。
 *
 * 常用于导入备份或数据恢复；函数不会校验消息体细节，只做最小结构规整。
 *
 * @param items - 需要写回的全部话题记录列表。
 * @returns 替换完成后返回。
 */
export async function replaceAllTopicMessages(items: TopicMessagesRow[]): Promise<void> {
  const db = await openMessagesDb();
  const tx = db.transaction([MESSAGES_DB_STORE], 'readwrite');
  const store = tx.objectStore(MESSAGES_DB_STORE);
  await requestToPromise(store.clear());
  for (const row of items) {
    if (!row || typeof row !== 'object') continue;
    const id = String((row as TopicMessagesRow).id || '').trim();
    if (!id) continue;
    const messages = normalizeMessageRevisions(
      Array.isArray((row as TopicMessagesRow).messages) ? (row as TopicMessagesRow).messages : [],
    );
    // put 在同一事务内逐条覆盖，保持最终库内容与导入快照一致。
    store.put({ id, messages } satisfies TopicMessagesRow);
  }
  await transactionDone(tx);
}

/**
 * 清空整个消息对象仓库。
 *
 * @returns 清空完成后返回。
 */
export async function clearMessagesDb(): Promise<void> {
  const db = await openMessagesDb();
  const tx = db.transaction([MESSAGES_DB_STORE], 'readwrite');
  await requestToPromise(tx.objectStore(MESSAGES_DB_STORE).clear());
  await transactionDone(tx);
}

/**
 * 读取消息库当前统计信息。
 *
 * @returns 当前仅包含话题总数，便于设置页或调试页面展示库规模。
 */
export async function getMessagesDbStats(): Promise<MessagesDbStats> {
  const db = await openMessagesDb();
  const tx = db.transaction([MESSAGES_DB_STORE], 'readonly');
  const topics = await requestToPromise(tx.objectStore(MESSAGES_DB_STORE).count());
  await transactionDone(tx);
  return { topics: Number(topics || 0) };
}
