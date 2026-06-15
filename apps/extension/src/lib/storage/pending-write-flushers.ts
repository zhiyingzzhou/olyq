/**
 * 说明：`pending-write-flushers` 基础能力模块。
 *
 * 职责：
 * - 承载 `pending-write-flushers` 相关的当前文件实现与模块边界；
 * - 对外暴露 `PendingWriteFlusher`、`registerPendingWriteFlusher`、`flushRegisteredPendingWrites` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/** 导出类型：`PendingWriteFlusher`。 */
export type PendingWriteFlusher = () => Promise<void> | void;

const pendingWriteFlushers = new Map<string, PendingWriteFlusher>();

/**
 * 导出函数：`registerPendingWriteFlusher`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function registerPendingWriteFlusher(id: string, flusher: PendingWriteFlusher): () => void {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) {
    throw new Error("pending write flusher id is required");
  }

  pendingWriteFlushers.set(normalizedId, flusher);
  return () => {
    if (pendingWriteFlushers.get(normalizedId) === flusher) {
      pendingWriteFlushers.delete(normalizedId);
    }
  };
}

/**
 * 导出函数：`flushRegisteredPendingWrites`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function flushRegisteredPendingWrites(): Promise<void> {
  const tasks = Array.from(new Set(pendingWriteFlushers.values())).map(async (flusher) => {
    await flusher();
  });

  if (tasks.length === 0) return;
  await Promise.allSettled(tasks);
}
