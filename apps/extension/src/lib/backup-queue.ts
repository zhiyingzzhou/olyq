/**
 * 说明：`backup-queue` 备份模块。
 *
 * 职责：
 * - 承载 `backup-queue` 相关的当前文件实现与模块边界；
 * - 对外暴露 `runSerializedBackupJob`、`isBackupJobRunning` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/** 串行备份队列的尾指针；每个新任务都接在它后面执行。 */
let queueTail: Promise<void> = Promise.resolve();
/** 当前队列里正在执行的任务数。 */
let runningJobs = 0;

/**
 * 以全局串行队列执行备份任务。
 *
 * 说明：
 * - 与 `runExclusiveBackupJob` 的“同 key 互斥”不同，这里是所有备份任务统一排队；
 * - 主要用于导入/导出这类必须避免并发读写存储的场景。
 */
export function runSerializedBackupJob<T>(jobKey: string, job: () => Promise<T>): Promise<T> {
  const key = String(jobKey || '').trim();
  const run = queueTail
    .catch(() => undefined)
    .then(async () => {
      runningJobs += 1;
      try {
        return await job();
      } finally {
        runningJobs -= 1;
      }
    });

  queueTail = run
    .then(() => undefined)
    .catch(() => undefined);

  if (!key) return run;
  return run;
}

/** 判断当前是否仍有任意串行备份任务在运行。 */
export function isBackupJobRunning() {
  return runningJobs > 0;
}
