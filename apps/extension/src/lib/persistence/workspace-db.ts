/**
 * 说明：`workspace-db` 持久化模块。
 *
 * 职责：
 * - 承载 `workspace-db` 相关的当前文件实现与模块边界；
 * - 对外暴露 `WORKSPACE_DB_NAME`、`readWorkspaceSnapshot`、`writeWorkspaceSnapshot` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { requestToPromise, transactionDone } from '@/lib/utils/idb';
import { openManagedIndexedDb } from './indexeddb-engine';

/**
 * 导出常量：`WORKSPACE_DB_NAME`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const WORKSPACE_DB_NAME = 'olyq.persistence.workspace.v1';
const WORKSPACE_DB_VERSION = 1;
const STORE_SNAPSHOTS = 'snapshots';

type WorkspaceSnapshotRecord<T = unknown> = {
  key: string;
  value: T;
};

/**
 * 内部函数：`openWorkspaceDb`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function openWorkspaceDb(): Promise<IDBDatabase> {
  return await openManagedIndexedDb({
    name: WORKSPACE_DB_NAME,
    version: WORKSPACE_DB_VERSION,
        /**
     * 内部方法：`upgrade`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'key' });
      }
    },
  });
}

/**
 * 导出函数：`readWorkspaceSnapshot`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function readWorkspaceSnapshot<T>(key: string): Promise<T | null> {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return null;
  if (typeof indexedDB === 'undefined') return null;
  const db = await openWorkspaceDb();
  const tx = db.transaction([STORE_SNAPSHOTS], 'readonly');
  const record = await requestToPromise(
    tx.objectStore(STORE_SNAPSHOTS).get(normalizedKey) as IDBRequest<WorkspaceSnapshotRecord<T> | undefined>,
  );
  await transactionDone(tx);
  return record?.value ?? null;
}

/**
 * 导出函数：`writeWorkspaceSnapshot`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function writeWorkspaceSnapshot<T>(key: string, value: T): Promise<void> {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return;
  if (typeof indexedDB === 'undefined') return;
  const db = await openWorkspaceDb();
  const tx = db.transaction([STORE_SNAPSHOTS], 'readwrite');
  tx.objectStore(STORE_SNAPSHOTS).put({
    key: normalizedKey,
    value,
  } satisfies WorkspaceSnapshotRecord<T>);
  await transactionDone(tx);
}

/**
 * 导出函数：`deleteWorkspaceSnapshot`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function deleteWorkspaceSnapshot(key: string): Promise<void> {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return;
  if (typeof indexedDB === 'undefined') return;
  const db = await openWorkspaceDb();
  const tx = db.transaction([STORE_SNAPSHOTS], 'readwrite');
  tx.objectStore(STORE_SNAPSHOTS).delete(normalizedKey);
  await transactionDone(tx);
}
