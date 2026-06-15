/**
 * 说明：`useChatStore` Hook 模块。
 *
 * 职责：
 * - 承载 `useChatStore` 相关的当前文件实现与模块边界；
 * - 对外暴露 `flushChatStorePendingWrites`、`getBestEffortConversationMessages`、`UseChatStore` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * Chat Store（V1）：
 * - 只负责运行时激活态与当前话题消息；
 * - Assistant / Topic 元数据统一由 `useAssistantStore` 维护；
 * - 不再读写 `olyq.chat.topics.v1`。
 */

import { createWithEqualityFn } from 'zustand/traditional';
import { subscribeWithSelector } from 'zustand/middleware';

import { deleteAttachments } from '@/lib/attachments';
import {
  deleteTopicMessages,
  ensureTopicRow,
  getTopicMessages,
  listAllTopicMessages,
  putTopicMessages,
} from '@/lib/chat/messages-db';
import type { RuntimeState } from '@/lib/chat/runtime-selection';
import { resolveRuntimeSelection, sanitizeRuntime } from '@/lib/chat/runtime-selection';
import { pickAssistantEntryTopic, resolveAssistantTopic } from '@/lib/chat/topic-tree';
import { logger } from '@/lib/logger';
import {
  recordDeletedMessages,
  recordTopicMessagesChange,
  recordTopicMessagesCleared,
} from '@/lib/sync/message-mutation-recorder';
import { useAssistantStore } from '@/hooks/useAssistantStore';
import type { Message, MessageUpdateOptions } from '@/types/chat';
import {
  CHAT_RUNTIME_STORAGE_KEY,
  ensureLegalPresetRemediation,
} from '@/lib/legal/preset-remediation';
import {
  hasExtensionPageStartupStorageValue,
} from '@/lib/extension/extension-page-startup';
import {
  publishTopicMessagesChanged,
  subscribeTopicMessagesChanged,
} from '@/lib/chat/message-change-signal';
import {
  readStoredJson,
  subscribeStoredKeys,
  writeStoredJsonInBackground,
} from '@/lib/storage/json-storage';
import { consumeBackgroundStoragePromise } from '@/lib/storage/background-storage';
import { registerPendingWriteFlusher } from '@/lib/storage/pending-write-flushers';
import { subscribeStoreReloadSignal } from '@/lib/storage/reload-signal';
import { deletePageStyleContextSnapshot } from '@/lib/browser-context/page-style-context';
import {
  collectAttachmentIdsFromMessages,
  flattenTopicIds,
  getDeletedMessageIds,
  hasIndexedDbSupport,
  hasStartupLegalPresetRemediationMarker,
  readInitialChatSnapshot,
  serializeRuntime,
  type InitialChatStoreSnapshot,
} from '@/hooks/useChatStore.utils';

const STORAGE_KEYS = {
  runtime: CHAT_RUNTIME_STORAGE_KEY,
} as const;

// 说明：聊天消息正文存 IndexedDB，运行时“当前选中了哪个助手/话题”存共享 JSON。
// 这两个层次的写入节奏不同，因此需要单独的队列和去抖控制，避免 UI 高频更新把 IDB 打爆。

const persistTimers = new Map<string, number>();
const pendingSnapshots = new Map<string, Message[]>();
const writeQueues = new Map<string, Promise<void>>();

// 说明：三张表分别承担不同职责：
// - `persistTimers`：UI 高频改动的去抖定时器；
// - `pendingSnapshots`：最后一次待落盘快照；
// - `writeQueues`：按话题串行化 IDB 写入，避免旧请求覆盖新请求。

/**
 * 把某个话题的写操作串行加入队列。
 *
 * @remarks
 * 这里按 conversationKey 维度单独排队，保证同一话题内的写入顺序稳定，
 * 同时允许不同话题并行写，避免全局大锁把输入体验拖慢。
 */
function enqueueWrite(conversationKey: string, fn: () => Promise<void>) {
  const prev = writeQueues.get(conversationKey) ?? Promise.resolve();
  const next = prev
    .catch((error) => logger.topic.error('write queue: previous step failed', error, { conversationKey }))
    .then(() => fn());
  writeQueues.set(conversationKey, next);
  void next.finally(() => {
    if (writeQueues.get(conversationKey) === next) writeQueues.delete(conversationKey);
  });
}

/**
 * 将某个话题的消息快照真正写入 IndexedDB。
 *
 * @remarks
 * 外层已经做过去抖，但这里仍然放进串行队列，
 * 避免“上一轮写慢、下一轮写快”导致旧快照反向覆盖新快照。
 */
function persistSnapshot(conversationKey: string, snapshot: Message[]) {
  enqueueWrite(conversationKey, async () => {
    await putTopicMessages(conversationKey, snapshot);
    if (pendingSnapshots.get(conversationKey) === snapshot) pendingSnapshots.delete(conversationKey);
    await publishPersistedTopicMessagesChanged(conversationKey);
  });
}

/**
 * 发布已落盘消息快照的跨宿主变更信号。
 *
 * @remarks
 * 消息写入成功才允许广播，保证其它宿主收到信号后重读 IndexedDB 一定能看到新快照。
 * 广播失败不能反向破坏消息持久化队列，因此这里只记录错误，不把异常继续抛给写队列。
 */
async function publishPersistedTopicMessagesChanged(topicId: string) {
  await publishTopicMessagesChanged(topicId).catch((error) => {
    logger.topic.error('publish topic messages changed failed', error, { topicId });
  });
}

/**
 * 取消某个话题尚未执行的延迟写入。
 *
 * @remarks
 * 常见于切换话题、清空话题或删除话题时，防止后续旧定时器又把脏数据写回去。
 */
function cancelPendingPersist(conversationKey: string) {
  const normalizedKey = String(conversationKey || '').trim();
  if (!normalizedKey) return;
  const timer = persistTimers.get(normalizedKey);
  if (timer) {
    window.clearTimeout(timer);
    persistTimers.delete(normalizedKey);
  }
  pendingSnapshots.delete(normalizedKey);
}

/**
 * 立即冲刷某个话题的待写消息。
 *
 * @remarks
 * 在用户离开当前话题前调用，尽量缩短“UI 已切换但消息尚未落盘”的窗口。
 */
function flushConversationWrite(conversationKey: string | null | undefined) {
  const normalizedKey = String(conversationKey || '').trim();
  if (!normalizedKey) return;
  const timer = persistTimers.get(normalizedKey);
  if (!timer) return;
  window.clearTimeout(timer);
  persistTimers.delete(normalizedKey);
  const snapshot = pendingSnapshots.get(normalizedKey);
  if (!snapshot) return;
  persistSnapshot(normalizedKey, snapshot);
}

/**
 * 将所有待写消息都尽力落盘。
 *
 * @remarks
 * 该函数会被 beforeunload、测试工具和恢复编排复用，因此需要等待所有 inflight promise 结束。
 */
async function flushPendingWrites() {
  for (const [, timer] of persistTimers) window.clearTimeout(timer);
  persistTimers.clear();
  for (const [key, snapshot] of pendingSnapshots) {
    persistSnapshot(key, snapshot);
  }
  const inflightWrites = Array.from(writeQueues.values());
  if (inflightWrites.length > 0) {
    await Promise.allSettled(inflightWrites);
  }
}

(globalThis as unknown as { __olyqFlushPendingWritesV4__?: () => Promise<void> }).__olyqFlushPendingWritesV4__ = flushPendingWrites;
registerPendingWriteFlusher('chat-store', flushPendingWrites);

/**
 * 导出函数：`flushChatStorePendingWrites`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function flushChatStorePendingWrites() {
  await flushPendingWrites();
}

interface AutoRenameStateEntry {
  loading: boolean;
  error?: string;
}

type ActiveConversationState = InitialChatStoreSnapshot['activeConversationState'];

interface ChatStore {
  runtime: RuntimeState;
  activeConversationKey: string | null;
  activeMessages: Message[];
  activeMessagesLoading: boolean;
  activeConversationState: ActiveConversationState;

  setActiveAssistant: (assistantId: string | null) => void;
  setActiveTopic: (topicId: string | null) => void;
  activateLocalEmptyTopic: (topicId: string) => void;
  reconcileWithAssistants: () => void;

  setMessagesForActiveConversation: (messages: Message[], options?: MessageUpdateOptions) => void;
  updateTopicMessages: (topicId: string, messages: Message[], options?: MessageUpdateOptions) => void;
  clearTopicMessages: (topicId: string) => void;
  reloadActiveConversationMessages: () => void;

  reloadFromStorage: () => void;

  autoRenameState: Record<string, AutoRenameStateEntry>;
  setAutoRenameState: (id: string, val: AutoRenameStateEntry | null) => void;
}

/**
 * 删除一个话题遗留的消息和孤儿附件。
 *
 * @remarks
 * 顺序必须是：
 * 1. 先取消待写队列；
 * 2. 再删除消息；
 * 3. 最后扫描附件是否仍被别的话题引用。
 * 否则很容易出现“消息删了但旧定时器又写回来”或“共享附件被误删”的问题。
 */
async function cleanupDeletedTopicArtifacts(topicId: string) {
  const normalizedTopicId = String(topicId || '').trim();
  if (!normalizedTopicId) return;
  if (!hasIndexedDbSupport()) return;

  const pendingMessages = pendingSnapshots.get(normalizedTopicId);
  cancelPendingPersist(normalizedTopicId);

  const targetMessages = Array.isArray(pendingMessages)
    ? pendingMessages
    : await getTopicMessages(normalizedTopicId).catch(() => []);
  const attachmentsToMaybeDelete = collectAttachmentIdsFromMessages(targetMessages);

  await new Promise<void>((resolve) => {
    enqueueWrite(normalizedTopicId, async () => {
      await deleteTopicMessages(normalizedTopicId).catch(() => {});
      resolve();
    });
  });

  if (attachmentsToMaybeDelete.length === 0) return;

  const allRows = await listAllTopicMessages().catch(() => []);
  const usedElsewhere = new Set<string>();
  for (const row of allRows) {
    if (row.id === normalizedTopicId) continue;
    for (const attachmentId of collectAttachmentIdsFromMessages(Array.isArray(row.messages) ? row.messages : [])) {
      usedElsewhere.add(attachmentId);
    }
  }
  const safeToDelete = attachmentsToMaybeDelete.filter((attachmentId) => !usedElsewhere.has(attachmentId));
  if (safeToDelete.length > 0) void deleteAttachments(safeToDelete);
}

/**
 * 创建聊天运行时 store。
 *
 * @remarks
 * 这个 store 只维护“当前 UI 正在编辑/查看什么”以及当前会话消息快照。
 * 助手树、话题元数据和预设治理仍然交给 `useAssistantStore`。
 */
function createChatStore() {
  // 说明：消息加载是异步的，而且用户可能在加载过程中快速切换话题。
  // `activeLoadSeq` 用来丢弃过期响应，避免旧话题的消息回填到新话题界面。
  let activeLoadSeq = 0;
  const hasRuntimeStartupSeed = hasStartupLegalPresetRemediationMarker();
  const initialSnapshot = readInitialChatSnapshot(hasRuntimeStartupSeed);

  interface LoadMessagesIntoStateOptions {
    /** 是否保留当前内存中的旧消息，避免同 topic reload 时回退为空态。 */
    keepPreviousMessages?: boolean;
    /** 是否保留当前会话的 ready 态，避免背景 reload 再次切成首屏 loading 壳子。 */
    preserveConversationState?: boolean;
  }

  /**
   * 把指定话题的消息异步加载进当前 store。
   *
   * @remarks
   * 如果加载完成时序号已经落后，说明用户已经切换到别的话题，本次结果必须被丢弃。
   */
  async function loadMessagesIntoState(
    topicId: string,
    set: (partial: Partial<ChatStore>) => void,
    {
      keepPreviousMessages = false,
      preserveConversationState = false,
    }: LoadMessagesIntoStateOptions = {},
  ) {
    const loadingPatch: Partial<ChatStore> = {
      activeMessagesLoading: true,
      activeConversationState: preserveConversationState ? 'ready' : 'resolving',
    };
    if (!keepPreviousMessages) loadingPatch.activeMessages = [];
    set(loadingPatch);

    if (!hasIndexedDbSupport()) {
      const fallbackPatch: Partial<ChatStore> = {
        activeMessagesLoading: false,
        activeConversationState: 'ready',
      };
      if (!keepPreviousMessages) fallbackPatch.activeMessages = [];
      set(fallbackPatch);
      return;
    }
    const seq = ++activeLoadSeq;
    try {
      await ensureTopicRow(topicId).catch(() => undefined);
      const messages = await getTopicMessages(topicId);
      if (seq !== activeLoadSeq) return;
      set({
        activeMessages: Array.isArray(messages) ? messages : [],
        activeMessagesLoading: false,
        activeConversationState: 'ready',
      });
    } catch (error) {
      if (seq !== activeLoadSeq) return;
      logger.topic.error('load messages failed', error, { topicId });
      const errorPatch: Partial<ChatStore> = {
        activeMessagesLoading: false,
        activeConversationState: 'ready',
      };
      if (!keepPreviousMessages) errorPatch.activeMessages = [];
      set(errorPatch);
    }
  }

  /**
   * 为某个话题安排一次去抖后的消息落盘。
   *
   * @remarks
   * 聊天消息会随着流式输出高频变更；如果每个 delta 都写 IDB，输入性能会明显恶化。
   * 因此这里先缓存最后快照，再用短去抖窗口合并写入。
   */
  function schedulePersist(topicId: string, messages: Message[]) {
    pendingSnapshots.set(topicId, messages);
    const existing = persistTimers.get(topicId);
    if (existing) return;
    const timer = window.setTimeout(() => {
      persistTimers.delete(topicId);
      const snapshot = pendingSnapshots.get(topicId);
      if (!snapshot) return;
      persistSnapshot(topicId, snapshot);
    }, 350);
    persistTimers.set(topicId, timer);
  }

  return createWithEqualityFn<ChatStore>()(
    subscribeWithSelector((set, get) => ({
      runtime: initialSnapshot.runtime,
      activeConversationKey: initialSnapshot.activeConversationKey,
      activeMessages: initialSnapshot.activeMessages,
      activeMessagesLoading: initialSnapshot.activeMessagesLoading,
      activeConversationState: initialSnapshot.activeConversationState,
      autoRenameState: {},

      setAutoRenameState: (id, val) => {
        const key = String(id || '').trim();
        if (!key) return;
        set((state) => {
          const next = { ...(state.autoRenameState || {}) };
          if (!val) delete next[key];
          else next[key] = val;
          return { autoRenameState: next };
        });
      },

      reloadFromStorage: () => {
        consumeBackgroundStoragePromise((async () => {
          await ensureLegalPresetRemediation();
          const runtime = sanitizeRuntime(await readStoredJson(STORAGE_KEYS.runtime, null, sanitizeRuntime));
          const previousKey = get().activeConversationKey;
          set({ runtime });
          // 说明：运行时选择态与助手树、消息仓库是分层存储。
          // reload 运行时后必须同步重算助手/话题归属，并触发当前消息重载。
          get().reconcileWithAssistants();
          if (get().activeConversationKey === previousKey) get().reloadActiveConversationMessages();
        })(), {
          key: STORAGE_KEYS.runtime,
          operation: 'reload',
          owner: 'useChatStore.reloadFromStorage',
        });
      },

      reloadActiveConversationMessages: () => {
        consumeBackgroundStoragePromise((async () => {
          await ensureLegalPresetRemediation();
          const state = get();
          const topicId = state.activeConversationKey ?? state.runtime.activeTopicId;
          if (!hasIndexedDbSupport()) {
            set({
              activeMessagesLoading: false,
              activeConversationState: topicId ? 'ready' : 'none',
            });
            return;
          }
          if (!topicId) {
            set({
              activeMessages: [],
              activeMessagesLoading: false,
              activeConversationState: 'none',
            });
            return;
          }
          void loadMessagesIntoState(topicId, (partial) => set(partial), {
            keepPreviousMessages: state.activeConversationKey === topicId && state.activeConversationState === 'ready',
            preserveConversationState: state.activeConversationKey === topicId && state.activeConversationState === 'ready',
          });
        })(), {
          key: STORAGE_KEYS.runtime,
          operation: 'reload',
          owner: 'useChatStore.reloadActiveConversationMessages',
        });
      },

      setActiveAssistant: (assistantId) => {
        const normalizedAssistantId = String(assistantId || '').trim();
        if (!normalizedAssistantId) {
          const previousKey = get().activeConversationKey;
          if (previousKey) flushConversationWrite(previousKey);
          set({
            runtime: { activeAssistantId: null, activeTopicId: null },
            activeConversationKey: null,
            activeMessages: [],
            activeMessagesLoading: false,
            activeConversationState: 'none',
          });
          return;
        }

        const assistant = useAssistantStore.getState().assistants.find((item) => item.id === normalizedAssistantId) ?? null;
        if (!assistant) {
          get().reconcileWithAssistants();
          return;
        }

        const topic = pickAssistantEntryTopic(assistant) ?? null;
        if (!topic) {
          get().reconcileWithAssistants();
          return;
        }

        set((state) => ({
          runtime: {
            ...state.runtime,
            activeAssistantId: normalizedAssistantId,
          },
        }));
        get().setActiveTopic(topic.id);
      },

      setActiveTopic: (topicId) => {
        const normalizedTopicId = String(topicId || '').trim();
        const previousKey = get().activeConversationKey;
        // 说明：切换话题前先冲刷旧话题待写快照，尽量缩短“界面切走但数据还没入库”的窗口。
        if (previousKey && previousKey !== normalizedTopicId) flushConversationWrite(previousKey);

        if (!normalizedTopicId) {
          set((state) => ({
            runtime: { ...state.runtime, activeTopicId: null },
            activeConversationKey: null,
            activeMessages: [],
            activeMessagesLoading: false,
            activeConversationState: 'none',
          }));
          return;
        }

        const resolved = resolveAssistantTopic(useAssistantStore.getState().assistants, normalizedTopicId);
        if (!resolved) {
          get().reconcileWithAssistants();
          return;
        }

        const state = get();
        const isSameActiveTopic =
          normalizedTopicId === previousKey
          && state.runtime.activeTopicId === normalizedTopicId
          && state.activeConversationKey === normalizedTopicId;

        if (isSameActiveTopic) {
          set((current) => ({
            runtime: {
              ...current.runtime,
              activeAssistantId: resolved.assistantId,
              activeTopicId: normalizedTopicId,
            },
            activeConversationKey: normalizedTopicId,
          }));
          if (state.activeMessagesLoading || state.activeConversationState === 'resolving') {
            void loadMessagesIntoState(normalizedTopicId, (partial) => set(partial), {
              keepPreviousMessages: state.activeMessages.length > 0,
              preserveConversationState: state.activeConversationState === 'ready',
            });
          }
          return;
        }

        set((state) => ({
          runtime: {
            ...state.runtime,
            activeAssistantId: resolved.assistantId,
            activeTopicId: normalizedTopicId,
          },
          activeConversationKey: normalizedTopicId,
          activeMessages: [],
          activeMessagesLoading: true,
          activeConversationState: 'resolving',
        }));

        if (!hasIndexedDbSupport()) {
          set({
            activeMessagesLoading: false,
            activeConversationState: 'ready',
          });
          return;
        }

        void loadMessagesIntoState(normalizedTopicId, (partial) => set(partial));
      },

      activateLocalEmptyTopic: (topicId) => {
        const normalizedTopicId = String(topicId || '').trim();
        const previousKey = get().activeConversationKey;
        if (previousKey && previousKey !== normalizedTopicId) flushConversationWrite(previousKey);

        if (!normalizedTopicId) {
          set((state) => ({
            runtime: { ...state.runtime, activeTopicId: null },
            activeConversationKey: null,
            activeMessages: [],
            activeMessagesLoading: false,
            activeConversationState: 'none',
          }));
          return;
        }

        const resolved = resolveAssistantTopic(useAssistantStore.getState().assistants, normalizedTopicId);
        if (!resolved) {
          get().reconcileWithAssistants();
          return;
        }

        // 本地新建的空话题已经由 assistant store 同步创建，消息真源应立即表现为 ready + []。
        // 这里递增加载序号，防止旧话题的异步加载晚到后把空话题又覆盖回旧消息或 loading。
        activeLoadSeq += 1;
        set((state) => ({
          runtime: {
            ...state.runtime,
            activeAssistantId: resolved.assistantId,
            activeTopicId: normalizedTopicId,
          },
          activeConversationKey: normalizedTopicId,
          activeMessages: [],
          activeMessagesLoading: false,
          activeConversationState: 'ready',
        }));

        if (!hasIndexedDbSupport()) return;
        enqueueWrite(normalizedTopicId, async () => {
          await ensureTopicRow(normalizedTopicId).catch((error) => {
            logger.topic.error('ensure local empty topic row failed', error, { topicId: normalizedTopicId });
          });
        });
      },

      reconcileWithAssistants: () => {
        const state = get();
        const resolved = resolveRuntimeSelection(useAssistantStore.getState().assistants, state.runtime);
        if (!resolved) {
          const previousKey = state.activeConversationKey;
          if (previousKey) flushConversationWrite(previousKey);
          set({
            runtime: { activeAssistantId: null, activeTopicId: null },
            activeConversationKey: null,
            activeMessages: [],
            activeMessagesLoading: false,
            activeConversationState: 'none',
          });
          return;
        }

        if (
          state.runtime.activeAssistantId === resolved.assistantId
          && state.runtime.activeTopicId === resolved.topicId
          && state.activeConversationKey === resolved.topicId
        ) {
          return;
        }

        set((current) => ({
          runtime: {
            ...current.runtime,
            activeAssistantId: resolved.assistantId,
          },
        }));
        // 说明：`setActiveTopic` 内部还会负责消息重载和旧话题 flush，
        // 因此不要在这里复制一遍切换逻辑。
        get().setActiveTopic(resolved.topicId);
      },

      setMessagesForActiveConversation: (messages, options) => {
        const topicId = get().activeConversationKey;
        if (!topicId) return;
        const nextMessages = Array.isArray(messages) ? messages : [];
        const previousMessages = Array.isArray(get().activeMessages) ? get().activeMessages : [];
        set({
          activeMessages: nextMessages,
          activeConversationState: 'ready',
        });
        schedulePersist(topicId, nextMessages);
        // 说明：同步域需要知道“哪些 message 被删掉了”，而不只是整话题发生过更新。
        // 所以这里在覆盖快照后仍要补一轮差集记录。
        const deletedMessageIds = getDeletedMessageIds(previousMessages, nextMessages);
        if (deletedMessageIds.length > 0) recordDeletedMessages(topicId, deletedMessageIds);
        recordTopicMessagesChange(topicId);
        if (options?.touchTopicMeta !== false) {
          useAssistantStore.getState().updateTopicMeta(topicId, { updatedAt: Date.now() });
        }
      },

      updateTopicMessages: (topicId, messages, options) => {
        const normalizedTopicId = String(topicId || '').trim();
        if (!normalizedTopicId) return;
        if (normalizedTopicId === get().activeConversationKey) {
          get().setMessagesForActiveConversation(messages, options);
          return;
        }
        const nextMessages = Array.isArray(messages) ? messages : [];
        const previousMessages = pendingSnapshots.get(normalizedTopicId);
        if (previousMessages) {
          const deletedMessageIds = getDeletedMessageIds(previousMessages, nextMessages);
          if (deletedMessageIds.length > 0) recordDeletedMessages(normalizedTopicId, deletedMessageIds);
        } else {
          void getTopicMessages(normalizedTopicId)
            .then((storedMessages) => {
              const deletedMessageIds = getDeletedMessageIds(storedMessages, nextMessages);
              if (deletedMessageIds.length > 0) recordDeletedMessages(normalizedTopicId, deletedMessageIds);
            })
            .catch(() => undefined);
        }
        schedulePersist(normalizedTopicId, nextMessages);
        recordTopicMessagesChange(normalizedTopicId);
        if (options?.touchTopicMeta !== false) {
          useAssistantStore.getState().updateTopicMeta(normalizedTopicId, { updatedAt: Date.now() });
        }
      },

      clearTopicMessages: (topicId) => {
        const normalizedTopicId = String(topicId || '').trim();
        if (!normalizedTopicId) return;
        cancelPendingPersist(normalizedTopicId);
        enqueueWrite(normalizedTopicId, async () => {
          await putTopicMessages(normalizedTopicId, []);
          await publishPersistedTopicMessagesChanged(normalizedTopicId);
        });
        if (get().activeConversationKey === normalizedTopicId) {
          set({
            activeMessages: [],
            activeConversationState: 'ready',
          });
        }
        recordTopicMessagesCleared(normalizedTopicId);
        // 清空消息代表把当前话题回到“新话题壳”：消息仓库清空，标题也回到默认命名状态，
        // 但模型、提示词、浏览器上下文等话题设置仍由 updateTopicMeta 的显式字段覆盖语义保留。
        useAssistantStore.getState().updateTopicMeta(normalizedTopicId, {
          name: '',
          isNameManuallyEdited: false,
          updatedAt: Date.now(),
        });
      },

    })),
  );
}

type ChatStoreHook = ReturnType<typeof createChatStore>;

interface GlobalThisWithChatStore {
  __olyqUseChatStoreV4__?: ChatStoreHook;
  __olyqUseChatStoreV4Inited__?: boolean;
  __olyqUseChatStoreV4UnloadBound__?: boolean;
  __olyqUseChatStoreV4ReloadBound__?: boolean;
}

const globalForChatStore = globalThis as unknown as GlobalThisWithChatStore;
const chatStore = globalForChatStore.__olyqUseChatStoreV4__ ?? createChatStore();
globalForChatStore.__olyqUseChatStoreV4__ = chatStore;

/**
 * 为聊天 store 绑定一次性的持久化、联动和清理监听。
 *
 * @remarks
 * 这个初始化阶段同时处理三类协作关系：
 * - runtime 选择态与共享 JSON 的双向联动；
 * - 助手树变化与话题消息仓库的联动；
 * - 页面生命周期与待写消息冲刷的联动。
 */
function initChatStoreOnce(store: ChatStoreHook): void {
  if (globalForChatStore.__olyqUseChatStoreV4Inited__) return;
  globalForChatStore.__olyqUseChatStoreV4Inited__ = true;

  if (typeof window === 'undefined') return;

  let persistedRuntimeSnapshot = serializeRuntime(store.getState().runtime);
  // 说明：首轮 bootstrap seed 只是 UI 预热值，不能立刻回写共享存储。
  // 只有真正从共享真源 hydrate 完成后，后续 runtime 变更才允许触发 write-back。
  let runtimeHydrated = hasExtensionPageStartupStorageValue(STORAGE_KEYS.runtime);
  const canSkipInitialReplay = runtimeHydrated && store.getState().activeConversationState === 'ready';
  /**
   * 从共享真源重载聊天运行时，并联动刷新当前消息。
   *
   * @remarks
   * restore / import / migration 会把 runtime 与消息仓库分开落盘，
   * 因此 reload runtime 后还必须再触发一次消息侧的 reconcile。
   */
  const reloadRuntime = () => {
    consumeBackgroundStoragePromise((async () => {
      await ensureLegalPresetRemediation();
      const runtime = sanitizeRuntime(await readStoredJson(STORAGE_KEYS.runtime, null, sanitizeRuntime));
      runtimeHydrated = true;
      persistedRuntimeSnapshot = serializeRuntime(runtime);
      const previousKey = store.getState().activeConversationKey;
      store.setState({ runtime });
      store.getState().reconcileWithAssistants();
      if (store.getState().activeConversationKey === previousKey) {
        store.getState().reloadActiveConversationMessages();
      }
    })(), {
      key: STORAGE_KEYS.runtime,
      operation: 'reload',
      owner: 'useChatStore.reloadRuntime',
    });
  };

  store.subscribe((state) => state.runtime, (value) => {
    if (!runtimeHydrated) return;
    const serialized = serializeRuntime(value);
    if (serialized === persistedRuntimeSnapshot) return;
    persistedRuntimeSnapshot = serialized;
    writeStoredJsonInBackground(STORAGE_KEYS.runtime, value, 'useChatStore.runtime');
  });

  useAssistantStore.subscribe(
    (state) => state.assistants,
    (next, prev) => {
      // 说明：助手树变化不仅意味着“当前选中项可能失效”，
      // 还可能意味着某些话题被彻底删除，必须顺手回收消息和孤儿附件。
      const prevTopicIds = flattenTopicIds(prev ?? []);
      const nextTopicIds = flattenTopicIds(next ?? []);
      const removedTopicIds = Array.from(prevTopicIds).filter((topicId) => !nextTopicIds.has(topicId));
      for (const topicId of removedTopicIds) {
        void deletePageStyleContextSnapshot(topicId).catch((error) => {
          logger.topic.error('cleanup deleted page style snapshot failed', error, { topicId });
        });
        void cleanupDeletedTopicArtifacts(topicId).catch((error) => {
          logger.topic.error('cleanup deleted topic failed', error, { topicId });
        });
      }
      if (!runtimeHydrated) return;
      store.getState().reconcileWithAssistants();
    },
  );

  if (!globalForChatStore.__olyqUseChatStoreV4UnloadBound__) {
    globalForChatStore.__olyqUseChatStoreV4UnloadBound__ = true;
    window.addEventListener('beforeunload', () => {
      void flushPendingWrites();
    });
  }

  if (!globalForChatStore.__olyqUseChatStoreV4ReloadBound__) {
    globalForChatStore.__olyqUseChatStoreV4ReloadBound__ = true;
    subscribeStoredKeys([STORAGE_KEYS.runtime], reloadRuntime);
    subscribeStoreReloadSignal(reloadRuntime);
    subscribeTopicMessagesChanged((payload) => {
      if (payload.topicId !== store.getState().activeConversationKey) return;
      store.getState().reloadActiveConversationMessages();
    });
    if (canSkipInitialReplay) {
      return;
    }
    if (runtimeHydrated) {
      store.getState().reconcileWithAssistants();
      store.getState().reloadActiveConversationMessages();
    } else {
      reloadRuntime();
    }
  }
}

initChatStoreOnce(chatStore);

/**
 * 尽力返回某个话题当前最可信的一份消息快照。
 *
 * @remarks
 * 读取优先级固定为：
 * 1. 当前激活态内存；
 * 2. 尚未落盘的 pending snapshot；
 * 3. IndexedDB。
 * 这样在 restore / unload / 切话题边缘时也尽量不给调用方旧数据。
 */
export async function getBestEffortConversationMessages(conversationId: string): Promise<Message[]> {
  const normalizedTopicId = String(conversationId || '').trim();
  if (!normalizedTopicId) return [];

  const state = chatStore.getState();
  if (
    normalizedTopicId === state.activeConversationKey
    && (state.activeConversationState === 'ready' || !state.activeMessagesLoading)
  ) {
    return Array.isArray(state.activeMessages) ? state.activeMessages : [];
  }

  const pending = pendingSnapshots.get(normalizedTopicId);
  if (pending) return Array.isArray(pending) ? pending : [];

  return getTopicMessages(normalizedTopicId).catch(() => []);
}

type ChatStoreApi = Pick<ChatStoreHook, 'getState' | 'setState' | 'subscribe' | 'getInitialState'>;

/** 导出类型：`UseChatStore`。 */
export type UseChatStore = {
  <T>(selector: (state: ChatStore) => T, equalityFn?: (a: T, b: T) => boolean): T;
} & ChatStoreApi;

/**
 * 导出 Hook：`useChatStore`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export const useChatStore: UseChatStore = chatStore;
