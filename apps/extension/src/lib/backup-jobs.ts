/**
 * 说明：`backup-jobs` 备份模块。
 *
 * 职责：
 * - 承载 `backup-jobs` 相关的当前文件实现与模块边界；
 * - 对外暴露 `runExclusiveBackupJob`、`isBackupJobRunning` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/** 当前进行中的互斥备份任务表：jobKey -\> Promise。 */
const inflightJobs = new Map<string, Promise<unknown>>();

/**
 * 按 jobKey 保证同类备份任务全局互斥。
 *
 * 说明：
 * - 同一个 key 的任务若已在执行，则后续调用直接复用同一 Promise；
 * - 常用于自动备份场景，避免重复上传或重复导出。
 */
export function runExclusiveBackupJob<T>(jobKey: string, job: () => Promise<T>): Promise<T> {
  const key = String(jobKey || '').trim();
  if (!key) return job();

  const existing = inflightJobs.get(key);
  if (existing) return existing as Promise<T>;

  const next = Promise.resolve().then(job);
  inflightJobs.set(key, next);
  void next.finally(() => {
    if (inflightJobs.get(key) === next) inflightJobs.delete(key);
  });
  return next;
}

/** 查询指定备份任务 key 当前是否仍在执行。 */
export function isBackupJobRunning(jobKey: string) {
  return inflightJobs.has(String(jobKey || '').trim());
}
