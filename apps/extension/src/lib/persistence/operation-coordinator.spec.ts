/**
 * 说明：`operation-coordinator.spec` 持久化模块。
 *
 * 职责：
 * - 承载 `operation-coordinator.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest';
import { withPersistenceOperationLock } from './operation-coordinator';

describe('withPersistenceOperationLock', () => {
  it('同一 scope 会串行执行', async () => {
    if (typeof indexedDB === 'undefined') return;

    const events: string[] = [];
    const releaseFirstRef: { current: null | (() => void) } = { current: null };

    const first = withPersistenceOperationLock('first', async () => {
      events.push('first:start');
      await new Promise<void>((resolve) => {
        releaseFirstRef.current = () => {
          events.push('first:end');
          resolve();
        };
      });
    });

    const second = withPersistenceOperationLock('second', async () => {
      events.push('second:start');
      events.push('second:end');
    });

    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(events).toEqual(['first:start']);

    if (releaseFirstRef.current) releaseFirstRef.current();
    await Promise.all([first, second]);

    expect(events).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ]);
  });
});
