/**
 * 说明：`indexeddb-engine` 持久化模块。
 *
 * 职责：
 * - 承载 `indexeddb-engine` 相关的当前文件实现与模块边界；
 * - 对外暴露 `openManagedIndexedDb` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { I18nError } from '@/lib/i18n/error';

type OpenManagedIndexedDbOptions = {
  name: string;
  version: number;
  upgrade?: (
    db: IDBDatabase,
    context: {
      oldVersion: number;
      newVersion: number | null;
      transaction: IDBTransaction | null;
    },
  ) => void;
};

const dbPromises = new Map<string, Promise<IDBDatabase>>();

/**
 * 内部函数：`getCacheKey`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function getCacheKey(name: string, version: number): string {
  return `${name}@${version}`;
}

/**
 * 内部函数：`createOpenDbError`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function createOpenDbError(detail: string, cause?: unknown): I18nError {
  const normalizedDetail = String(detail || '').trim();
  return normalizedDetail
    ? new I18nError('errors.indexedDbOpenFailedWithDetail', { detail: normalizedDetail }, { cause })
    : new I18nError('errors.indexedDbOpenFailed', undefined, { cause });
}

/**
 * 导出函数：`openManagedIndexedDb`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function openManagedIndexedDb(options: OpenManagedIndexedDbOptions): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw createOpenDbError('indexedDB unavailable');
  }

  const name = String(options.name || '').trim();
  const version = Math.max(1, Math.floor(options.version));
  const cacheKey = getCacheKey(name, version);
  const cached = dbPromises.get(cacheKey);
  if (cached) return cached;

  const openPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, version);

    request.onupgradeneeded = (event) => {
      const versionEvent = event as IDBVersionChangeEvent;
      options.upgrade?.(request.result, {
        oldVersion: versionEvent.oldVersion,
        newVersion: versionEvent.newVersion,
        transaction: request.transaction,
      });
    };

    request.onsuccess = () => {
      const db = request.result;
            /**
       * 内部函数变量：`clearCache`。
       *
       * @remarks
       * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
       */
      const clearCache = () => {
        if (dbPromises.get(cacheKey) === openPromise) {
          dbPromises.delete(cacheKey);
        }
      };

      db.onclose = clearCache;
      db.onerror = clearCache;
      db.onversionchange = () => {
        db.close();
        clearCache();
      };

      resolve(db);
    };

    request.onerror = () => {
      dbPromises.delete(cacheKey);
      reject(createOpenDbError(request.error?.message || '', request.error));
    };

    request.onblocked = () => {
      dbPromises.delete(cacheKey);
      reject(createOpenDbError('blocked by another context'));
    };
  });

  dbPromises.set(cacheKey, openPromise);
  return openPromise;
}
