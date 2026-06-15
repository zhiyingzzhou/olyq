/**
 * 说明：`operation-coordinator` 持久化模块。
 *
 * 职责：
 * - 承载 `operation-coordinator` 相关的当前文件实现与模块边界；
 * - 对外暴露 `withPersistenceOperationLock` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { I18nError } from '@/lib/i18n/error';
import { requestToPromise, transactionDone } from '@/lib/utils/idb';

const DB_NAME = 'olyq.persistence.coordinator.v1';
const DB_VERSION = 1;
const STORE = 'locks';
const GLOBAL_LOCK_KEY = 'global-write';
const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_WAIT_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 5_000;

type LockRecord = {
  key: string;
  token: string;
  owner: string;
  leaseUntil: number;
  acquiredAt: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;
let localTokenCounter = 0;
const fallbackLocks = new Map<string, { token: string; leaseUntil: number }>();

/**
 * 生成一个只在当前 JS 进程内唯一的持锁 token。
 */
function createOwnerToken(scope: string): string {
  localTokenCounter += 1;
  return `${scope}:${Date.now().toString(36)}:${localTokenCounter.toString(36)}`;
}

/**
 * 打开协调器专用的 IndexedDB。
 *
 * @remarks
 * 这里单独维护一个极小的锁库，而不是复用业务库，
 * 是为了让 backup/restore/sync 的互斥语义不受业务 store 升级影响。
 */
async function openCoordinatorDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
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
    req.onblocked = () => {
      // 锁库被其它旧版本连接卡住时必须显式失败，不能悄悄退化成“假拿到锁”。
      reject(new I18nError('errors.persistenceLockCoordinatorBlocked'));
    };
  });
  return dbPromise;
}

/**
 * 读取当前 scope 的锁记录。
 */
async function readLock(store: IDBObjectStore, key: string): Promise<LockRecord | undefined> {
  return await requestToPromise(store.get(key) as IDBRequest<LockRecord | undefined>);
}

/**
 * 获取指定 scope 的租约锁。
 *
 * @remarks
 * 这里不是“等待事务锁”，而是显式租约：
 * - SW / UI / offscreen 跨上下文时，只有把锁写进共享存储层才有全局意义；
 * - 进程崩溃后租约会自然过期，避免永久死锁。
 */
async function acquireLock(scope: string, owner: string, leaseMs: number, waitMs: number): Promise<string> {
  const key = String(scope || '').trim() || GLOBAL_LOCK_KEY;
  const deadline = Date.now() + Math.max(1_000, waitMs);
  const leaseDuration = Math.max(1_000, leaseMs);
  const token = createOwnerToken(key);

  if (typeof indexedDB === 'undefined') {
    // 这条分支只用于极少数无 IDB 的宿主；它只能保证单进程 best-effort 互斥，不能替代真正的跨上下文锁。
    while (Date.now() <= deadline) {
      const current = fallbackLocks.get(key);
      const now = Date.now();
      if (!current || current.leaseUntil <= now) {
        fallbackLocks.set(key, { token, leaseUntil: now + leaseDuration });
        return token;
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new I18nError('errors.persistenceLockBusy', { scope: key });
  }

  while (Date.now() <= deadline) {
    const db = await openCoordinatorDb();
    const tx = db.transaction([STORE], 'readwrite');
    const store = tx.objectStore(STORE);
    const existing = await readLock(store, key);
    const now = Date.now();

    if (!existing || existing.leaseUntil <= now) {
      store.put({
        key,
        token,
        owner,
        leaseUntil: now + leaseDuration,
        acquiredAt: now,
      } satisfies LockRecord);
      await transactionDone(tx);
      return token;
    }

    // 锁仍被别人持有时，主动 abort 当前事务并短暂退避，避免长时间占住 readwrite 事务。
    tx.abort();
    await new Promise((resolve) => setTimeout(resolve, 75));
  }

  throw new I18nError('errors.persistenceLockBusy', { scope: key });
}

/**
 * 续租当前持有的锁。
 */
async function refreshLock(scope: string, token: string, owner: string, leaseMs: number): Promise<boolean> {
  const key = String(scope || '').trim() || GLOBAL_LOCK_KEY;
  if (typeof indexedDB === 'undefined') {
    const current = fallbackLocks.get(key);
    if (!current || current.token !== token) return false;
    fallbackLocks.set(key, {
      token,
      leaseUntil: Date.now() + Math.max(1_000, leaseMs),
    });
    return true;
  }

  const db = await openCoordinatorDb();
  const tx = db.transaction([STORE], 'readwrite');
  const store = tx.objectStore(STORE);
  const current = await readLock(store, key);
  if (!current || current.token !== token) {
    tx.abort();
    return false;
  }

  store.put({
    ...current,
    owner,
    leaseUntil: Date.now() + Math.max(1_000, leaseMs),
  } satisfies LockRecord);
  await transactionDone(tx);
  return true;
}

/**
 * 释放当前 token 对应的锁。
 *
 * @remarks
 * 释放时必须再次校验 token，避免“旧任务 finally”误删新任务已经接管的租约记录。
 */
async function releaseLock(scope: string, token: string): Promise<void> {
  const key = String(scope || '').trim() || GLOBAL_LOCK_KEY;
  if (typeof indexedDB === 'undefined') {
    const current = fallbackLocks.get(key);
    if (current?.token === token) fallbackLocks.delete(key);
    return;
  }

  const db = await openCoordinatorDb();
  const tx = db.transaction([STORE], 'readwrite');
  const store = tx.objectStore(STORE);
  const current = await readLock(store, key);
  if (current?.token === token) {
    store.delete(key);
  } else {
    tx.abort();
    return;
  }
  await transactionDone(tx);
}

/**
 * 导出函数：`withPersistenceOperationLock`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function withPersistenceOperationLock<T>(
  opType: string,
  job: () => Promise<T>,
  options?: {
    scope?: string;
    leaseMs?: number;
    waitMs?: number;
  },
): Promise<T> {
  const owner = String(opType || '').trim() || 'persistence-operation';
  const scope = String(options?.scope || '').trim() || GLOBAL_LOCK_KEY;
  const leaseMs = Math.max(1_000, options?.leaseMs ?? DEFAULT_LEASE_MS);
  const waitMs = Math.max(1_000, options?.waitMs ?? DEFAULT_WAIT_MS);
  const token = await acquireLock(scope, owner, leaseMs, waitMs);

  // 持锁任务可能超过单次 lease 周期，所以必须定时续租；否则长备份/长恢复会被别的上下文抢锁。
  const timer = setInterval(() => {
    void refreshLock(scope, token, owner, leaseMs).catch(() => undefined);
  }, HEARTBEAT_INTERVAL_MS);

  try {
    return await job();
  } finally {
    clearInterval(timer);
    // finally 里释放锁必须吞掉异常，避免“业务任务已完成但解锁失败”反向覆盖原始结果。
    await releaseLock(scope, token).catch(() => undefined);
  }
}
