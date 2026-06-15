/**
 * 说明：`backup-queue.spec` 备份模块。
 *
 * 职责：
 * - 承载 `backup-queue.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest';
import { isBackupJobRunning, runSerializedBackupJob } from './backup-queue';

describe('runSerializedBackupJob', () => {
  it('会串行执行后续任务', async () => {
    const events: string[] = [];
    let releaseFirst: (() => void) | null = null;

    const first = runSerializedBackupJob('backup:first', async () => {
      events.push('first:start');
      await new Promise<void>((resolve) => {
        releaseFirst = () => {
          events.push('first:end');
          resolve();
        };
      });
      return 'first';
    });

    const second = runSerializedBackupJob('backup:second', async () => {
      events.push('second:start');
      events.push('second:end');
      return 'second';
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(['first:start']);
    expect(isBackupJobRunning()).toBe(true);

    const release = releaseFirst as (() => void) | null;
    if (!release) throw new Error('releaseFirst not initialized');
    release();

    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
    expect(events).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ]);
    expect(isBackupJobRunning()).toBe(false);
  });
});
