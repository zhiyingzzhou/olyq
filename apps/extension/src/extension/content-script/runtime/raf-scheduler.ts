/**
 * 说明：Content Script RAF 调度器。
 *
 * 职责：
 * - 将 scroll / resize / pointer 热路径中的重复布局刷新合并到一帧；
 * - 提供显式 cancel，保证 content script 关闭工具时不会留下待执行回调；
 * - 不持有业务状态，只管理调度时序。
 */

/** 可取消的 RAF 任务。 */
export type RafScheduledTask = {
  /** 请求执行；同一帧内多次请求只执行一次。 */
  request: () => void;
  /** 取消尚未执行的帧任务。 */
  cancel: () => void;
};

/** 创建单任务 RAF 合帧调度器。 */
export function createRafScheduledTask(task: () => void): RafScheduledTask {
  let frameId = 0;
  return {
    request: () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        task();
      });
    },
    cancel: () => {
      if (!frameId) return;
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    },
  };
}
