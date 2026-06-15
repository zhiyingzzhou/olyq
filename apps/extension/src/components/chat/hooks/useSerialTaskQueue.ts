/**
 * 说明：`useSerialTaskQueue` 组件模块。
 *
 * 职责：
 * - 承载 `useSerialTaskQueue` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useSerialTaskQueue` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useRef } from 'react';

/**
 * 串行任务队列 hook。
 *
 * 返回一个任务调度函数，确保传入的异步任务按提交顺序串行执行；
 * 前一个任务失败不会阻断后一个任务进入队列。
 *
 * @returns 串行执行异步任务的调度函数。
 */
export function useSerialTaskQueue() {
  const tailRef = useRef<Promise<void>>(Promise.resolve());

  /**
   * 将任务追加到当前队尾，并返回该任务的执行结果。
   *
   * @param task - 需要串行执行的异步任务。
   * @returns 当前任务的完成结果。
   */
  return useCallback(async <T>(task: () => Promise<T>): Promise<T> => {
    const previous = tailRef.current.catch(() => void 0);
    const current = previous.then(task);

    // 无论当前任务成功还是失败，都要把队尾推进到“已完成”状态，避免后续任务被阻塞。
    tailRef.current = current.then(() => void 0, () => void 0);
    return await current;
  }, []);
}
