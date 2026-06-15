/**
 * 说明：`backup-jobs.spec` 备份模块。
 *
 * 职责：
 * - 承载 `backup-jobs.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest';
import { isBackupJobRunning, runExclusiveBackupJob } from './backup-jobs';

describe('backup-jobs', () => {
  it('deduplicates concurrent jobs with the same key', async () => {
    let runs = 0;
        /**
     * 测试辅助函数：`resolveJob`。
     *
     * @remarks
     * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
     */
    let resolveJob: () => void = () => {};

    const job = runExclusiveBackupJob('webdav', async () => {
      runs += 1;
      expect(isBackupJobRunning('webdav')).toBe(true);
      await new Promise<void>((resolve) => {
        resolveJob = resolve;
      });
      return 'done';
    });

    const duplicate = runExclusiveBackupJob('webdav', async () => {
      runs += 1;
      return 'unexpected';
    });

    await Promise.resolve();

    expect(job).toBe(duplicate);
    expect(runs).toBe(1);

    resolveJob();

    await expect(job).resolves.toBe('done');
    expect(isBackupJobRunning('webdav')).toBe(false);
    expect(runs).toBe(1);
  });
});
