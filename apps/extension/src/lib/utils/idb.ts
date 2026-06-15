/**
 * 说明：`idb` 基础能力模块。
 *
 * 职责：
 * - 承载 `idb` 相关的当前文件实现与模块边界；
 * - 对外暴露 `requestToPromise`、`transactionDone` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：IndexedDB 是事件回调式 API；这里将常用的 request/transaction 封装为 Promise，便于组合与异常传播。
 *
 * 约束：封装会覆盖 `req.onsuccess/req.onerror` 与 `tx.on*` 回调；因此只应传入"新创建且未挂载处理器"的对象。
 */
import { I18nError } from '@/lib/i18n/error';

/**
 * 把单个 IndexedDB request 封装成 Promise。
 *
 * 说明：
 * - 成功时直接返回 `req.result`，失败时把底层 `DOMException` 转换为可国际化错误；
 * - 适合包装 `get/add/put/delete/openCursor` 等一次性 request，便于在 async 流程中串联。
 */
export function requestToPromise<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      const detail = req.error?.message ? String(req.error.message) : '';
      reject(detail ? new I18nError('errors.indexedDbRequestFailedWithDetail', { detail }, { cause: req.error }) : (req.error ?? new I18nError('errors.indexedDbRequestFailed')));
    };
  });
}

/**
 * 等待一个 IndexedDB transaction 结束。
 *
 * 说明：
 * - 只有在 `complete` 后才表示事务已真正提交成功；
 * - `abort` 与 `error` 会分别映射成不同的可国际化错误，方便上层区分是主动中止还是执行失败。
 */
export function transactionDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => {
      const detail = tx.error?.message ? String(tx.error.message) : '';
      reject(detail ? new I18nError('errors.indexedDbTransactionAbortedWithDetail', { detail }, { cause: tx.error }) : (tx.error ?? new I18nError('errors.indexedDbTransactionAborted')));
    };
    tx.onerror = () => {
      const detail = tx.error?.message ? String(tx.error.message) : '';
      reject(detail ? new I18nError('errors.indexedDbTransactionFailedWithDetail', { detail }, { cause: tx.error }) : (tx.error ?? new I18nError('errors.indexedDbTransactionFailed')));
    };
  });
}
