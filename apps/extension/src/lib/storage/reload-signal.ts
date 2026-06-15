/**
 * 说明：`reload-signal` 基础能力模块。
 *
 * 职责：
 * - 承载 `reload-signal` 相关的当前文件实现与模块边界；
 * - 对外暴露 `STORE_RELOAD_EVENT`、`broadcastStoreReloadSignal`、`subscribeStoreReloadSignal` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import {
  readStoredJson,
  subscribeStoredKeys,
  writeStoredJson,
} from '@/lib/storage/json-storage';

/**
 * 导出常量：`STORE_RELOAD_EVENT`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const STORE_RELOAD_EVENT = 'olyq:store-reload';
const STORE_RELOAD_SIGNAL_KEY = 'olyq.store-reload.v1';

type ReloadSignalPayload = {
  token: string;
  at: number;
};

let lastSeenReloadToken = '';

/**
 * 内部函数：`isReloadSignalPayload`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function isReloadSignalPayload(raw: unknown): raw is ReloadSignalPayload {
  if (!raw || typeof raw !== 'object') return false;
  const record = raw as Record<string, unknown>;
  return typeof record.token === 'string' && typeof record.at === 'number';
}

/**
 * 内部函数：`emitReloadEvent`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function emitReloadEvent(payload: ReloadSignalPayload) {
  if (payload.token && payload.token === lastSeenReloadToken) return;
  lastSeenReloadToken = payload.token;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ReloadSignalPayload>(STORE_RELOAD_EVENT, { detail: payload }));
}

/**
 * 导出函数：`broadcastStoreReloadSignal`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function broadcastStoreReloadSignal(): Promise<void> {
  const payload: ReloadSignalPayload = {
    token: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    at: Date.now(),
  };
  emitReloadEvent(payload);
  await writeStoredJson(STORE_RELOAD_SIGNAL_KEY, payload);
}

/**
 * 导出函数：`subscribeStoreReloadSignal`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function subscribeStoreReloadSignal(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  /**
   * 内部函数变量：`onWindowEvent`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const onWindowEvent = (event: Event) => {
    const detail = event instanceof CustomEvent ? event.detail : undefined;
    if (isReloadSignalPayload(detail)) {
      if (detail.token && detail.token === lastSeenReloadToken) {
        callback();
        return;
      }
      lastSeenReloadToken = detail.token;
    }
    callback();
  };

  const unsubscribeStorage = subscribeStoredKeys([STORE_RELOAD_SIGNAL_KEY], () => {
    void readStoredJson<ReloadSignalPayload | null>(
      STORE_RELOAD_SIGNAL_KEY,
      null,
      (raw) => (isReloadSignalPayload(raw) ? raw : null),
    ).then((payload) => {
      if (!payload) return;
      if (payload.token && payload.token === lastSeenReloadToken) return;
      emitReloadEvent(payload);
    });
  });

  window.addEventListener(STORE_RELOAD_EVENT, onWindowEvent);
  return () => {
    unsubscribeStorage();
    window.removeEventListener(STORE_RELOAD_EVENT, onWindowEvent);
  };
}
