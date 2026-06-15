/**
 * 说明：`useDeveloperToolsStore` Hook 模块。
 *
 * 职责：
 * - 承载 `useDeveloperToolsStore` 相关的当前文件实现与模块边界；
 * - 对外暴露 `DeveloperDebugSource`、`DeveloperDebugEvent`、`UseDeveloperToolsStore` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createWithEqualityFn } from 'zustand/traditional';
import { createId } from '@/lib/utils/id';

/** 开发者调试事件来源。 */
export type DeveloperDebugSource =
  | 'chat-topic'
  | 'chat-compare'
  | 'message-translation'
  | 'translation-panel'
  | 'input-translation'
  | 'unknown';

/** 单条开发者调试事件。 */
export interface DeveloperDebugEvent {
  /** 事件 ID。 */
  id: string;
  /** 事件时间戳（毫秒）。 */
  timestamp: number;
  /** 所属请求 ID。 */
  requestId: string;
  /** 调试事件来源。 */
  source: DeveloperDebugSource;
  /** 调试事件类型。 */
  kind: string;
  /** 原始调试负载。 */
  payload: unknown;
}

/** 写入调试事件时允许省略的字段。 */
type PushDeveloperDebugEventInput = Omit<DeveloperDebugEvent, 'id' | 'timestamp'> & {
  /** 可选：显式时间戳；未提供时自动写入当前时间。 */
  timestamp?: number;
};

interface DeveloperToolsStore {
  /** 最近的开发者调试事件。 */
  events: DeveloperDebugEvent[];
  /** 写入一条调试事件。 */
  pushEvent: (event: PushDeveloperDebugEventInput) => void;
  /** 清空全部调试事件。 */
  clearEvents: () => void;
}

const MAX_DEBUG_EVENTS = 200;

/** Dev/HMR 场景下复用全局单例，避免每次热更新都丢事件。 */
interface GlobalThisWithDeveloperToolsStore {
  __olyqUseDeveloperToolsStoreV1__?: ReturnType<typeof createDeveloperToolsStore>;
}

/**
 * 内部函数：`createDeveloperToolsStore`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function createDeveloperToolsStore() {
  return createWithEqualityFn<DeveloperToolsStore>()((set) => ({
    events: [],
    pushEvent: (event) => {
      const next: DeveloperDebugEvent = {
        id: createId(),
        timestamp: typeof event.timestamp === 'number' && Number.isFinite(event.timestamp)
          ? event.timestamp
          : Date.now(),
        requestId: String(event.requestId || '').trim(),
        source: event.source,
        kind: String(event.kind || '').trim(),
        payload: event.payload,
      };

      set((state) => ({
        events: [...state.events, next].slice(-MAX_DEBUG_EVENTS),
      }));
    },
    clearEvents: () => set({ events: [] }),
  }));
}

const globalForDeveloperToolsStore = globalThis as unknown as GlobalThisWithDeveloperToolsStore;
const developerToolsStore =
  globalForDeveloperToolsStore.__olyqUseDeveloperToolsStoreV1__ ?? createDeveloperToolsStore();
globalForDeveloperToolsStore.__olyqUseDeveloperToolsStoreV1__ = developerToolsStore;

type DeveloperToolsStoreApi = Pick<
  typeof developerToolsStore,
  'getState' | 'setState' | 'subscribe' | 'getInitialState'
>;

/** 导出类型：`UseDeveloperToolsStore`。 */
export type UseDeveloperToolsStore = {
  <T>(selector: (state: DeveloperToolsStore) => T, equalityFn?: (a: T, b: T) => boolean): T;
} & DeveloperToolsStoreApi;

/** 开发者工具内存态 store。 */
export const useDeveloperToolsStore: UseDeveloperToolsStore = developerToolsStore;
