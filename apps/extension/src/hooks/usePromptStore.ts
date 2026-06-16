/**
 * 说明：`usePromptStore` Hook 模块。
 *
 * 职责：
 * - 承载 `usePromptStore` 相关的当前文件实现与模块边界；
 * - 对外暴露 `UsePromptStore`、`usePromptStore` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createId } from '@/lib/utils/id';
import { createWithEqualityFn } from 'zustand/traditional';
import { subscribeWithSelector } from 'zustand/middleware';
import type { PromptTemplate } from '@/types/chat';
import {
  readBootstrapStoredJsonSeed,
  readStoredJsonWithBootstrapMirror,
  subscribeStoredKeys,
  writeStoredJsonWithBootstrapMirrorInBackground,
} from '@/lib/storage/json-storage';
import { consumeBackgroundStoragePromise } from '@/lib/storage/background-storage';
import { subscribeStoreReloadSignal } from '@/lib/storage/reload-signal';

/**
 * 说明：usePromptStore——Prompt 模板管理（从 useChatStore 拆分）。
 *
 * - 状态：`prompts`（PromptTemplate[]）
 * - 方法：addPrompt / deletePrompt / updatePrompt / reloadFromStorage
 * - 持久化：storage adapter 为主真源；localStorage 只保留 bootstrap mirror
 */

const STORAGE_KEY = 'olyq.chat.prompts.v1';

/**
 * 内部函数：`serializePrompts`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function serializePrompts(prompts: PromptTemplate[]) {
  try {
    return JSON.stringify(prompts);
  } catch {
    return '';
  }
}

/**
 * Prompt 模板 store 状态。
 *
 * 说明：
 * - 这里只管理用户可编辑模板，不负责内置模板的静态定义；
 * - 所有变更都会持久化到 storage adapter，并可通过统一 reload 事件刷新。
 */
interface PromptStore {
  /** 用户自定义 Prompt 模板列表（自动持久化到 storage adapter） */
  prompts: PromptTemplate[];
  /** 新增一个 Prompt 模板 */
  addPrompt: (prompt: Omit<PromptTemplate, 'id' | 'createdAt' | 'isBuiltin'>) => void;
  /** 删除一个 Prompt 模板 */
  deletePrompt: (id: string) => void;
  /** 更新一个 Prompt 模板（按 id 局部 patch） */
  updatePrompt: (id: string, updates: Partial<PromptTemplate>) => void;
  /** 从 storage adapter 重新加载（用于云同步/恢复后刷新内存态） */
  reloadFromStorage: () => void;
}

/** 创建 Prompt 模板 store。 */
function createPromptStore() {
  return createWithEqualityFn<PromptStore>()(
    subscribeWithSelector((set) => ({
      prompts: readBootstrapStoredJsonSeed(STORAGE_KEY, [], (raw) => (Array.isArray(raw) ? raw as PromptTemplate[] : [])),

      addPrompt: (prompt) => {
        set((state) => ({
          prompts: [
            ...state.prompts,
            { ...prompt, id: createId(), createdAt: Date.now(), isBuiltin: false },
          ],
        }));
      },

      deletePrompt: (id) => {
        set((state) => ({ prompts: state.prompts.filter((p) => p.id !== id) }));
      },

      updatePrompt: (id, updates) => {
        set((state) => ({
          prompts: state.prompts.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        }));
      },

      reloadFromStorage: () => {
        consumeBackgroundStoragePromise((async () => {
          const nextPrompts = await readStoredJsonWithBootstrapMirror(STORAGE_KEY, [], (raw) => (Array.isArray(raw) ? raw as PromptTemplate[] : []));
          set({ prompts: nextPrompts });
        })(), {
          key: STORAGE_KEY,
          operation: 'reload',
          owner: 'usePromptStore.reloadFromStorage',
        });
      },
    })),
  );
}

/** `createPromptStore()` 返回的 zustand hook 类型。 */
type PromptStoreHook = ReturnType<typeof createPromptStore>;

/**
 * 说明：Dev/HMR 场景下，模块可能被多次执行。
 * - 若每次都 create store，会导致重复订阅与状态丢失
 * - 因此把 store 缓存在 globalThis 上，确保单例
 */
interface GlobalThisWithPromptStore {
  /** HMR/多次模块执行时复用的 Prompt store 单例。 */
  __olyqUsePromptStoreV1__?: PromptStoreHook;
  /** 标记 Prompt store 的持久化与 reload 监听是否已经初始化。 */
  __olyqUsePromptStoreV1Inited__?: boolean;
}

const globalForPromptStore = globalThis as unknown as GlobalThisWithPromptStore;
const promptStore = globalForPromptStore.__olyqUsePromptStoreV1__ ?? createPromptStore();
globalForPromptStore.__olyqUsePromptStoreV1__ = promptStore;

/**
 * 初始化全局唯一的 Prompt store。
 *
 * 说明：
 * - 仅第一次执行时注册持久化和 reload 监听，避免 HMR 重复订阅；
 * - 该初始化不主动覆盖已有存储值，只负责后续变化同步。
 */
function initPromptStoreOnce(store: PromptStoreHook): void {
  if (globalForPromptStore.__olyqUsePromptStoreV1Inited__) return;
  globalForPromptStore.__olyqUsePromptStoreV1Inited__ = true;

  if (typeof window === 'undefined') return;
  let persistedSnapshot = serializePrompts(store.getState().prompts);

  store.subscribe(
    (s) => s.prompts,
    (value) => {
      const serialized = serializePrompts(value);
      if (serialized === persistedSnapshot) return;
      persistedSnapshot = serialized;
      writeStoredJsonWithBootstrapMirrorInBackground(STORAGE_KEY, value, 'usePromptStore');
    },
  );

    /**
   * 内部函数变量：`reload`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const reload = () => {
    consumeBackgroundStoragePromise((async () => {
      const nextPrompts = await readStoredJsonWithBootstrapMirror(STORAGE_KEY, [], (raw) => (Array.isArray(raw) ? raw as PromptTemplate[] : []));
      persistedSnapshot = serializePrompts(nextPrompts);
      store.setState({ prompts: nextPrompts });
    })(), {
      key: STORAGE_KEY,
      operation: 'reload',
      owner: 'usePromptStore.reload',
    });
  };
  subscribeStoredKeys([STORAGE_KEY], reload);
  subscribeStoreReloadSignal(reload);
  reload();
}

initPromptStoreOnce(promptStore);

/** 暴露给非 React 场景复用的 Prompt store API 子集。 */
type PromptStoreApi = Pick<PromptStoreHook, 'getState' | 'setState' | 'subscribe' | 'getInitialState'>;

/** `usePromptStore` 的安全导出类型。 */
export type UsePromptStore = {
  /** 订阅 Prompt store 中的某个切片。 */
  <T>(selector: (state: PromptStore) => T, equalityFn?: (a: T, b: T) => boolean): T;
} & PromptStoreApi;

/** Prompt 模板的全局 zustand hook。 */
export const usePromptStore: UsePromptStore = promptStore;
