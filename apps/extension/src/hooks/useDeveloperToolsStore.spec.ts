/**
 * 说明：`useDeveloperToolsStore.spec` Hook 模块。
 *
 * 职责：
 * - 承载 `useDeveloperToolsStore.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useDeveloperToolsStore } from './useDeveloperToolsStore';

describe('useDeveloperToolsStore', () => {
  beforeEach(() => {
    useDeveloperToolsStore.setState({ events: [] });
  });

  it('只保留最近 200 条调试事件', () => {
    for (let i = 0; i < 205; i += 1) {
      useDeveloperToolsStore.getState().pushEvent({
        requestId: `req-${i}`,
        source: 'unknown',
        kind: `kind-${i}`,
        payload: { index: i },
      });
    }

    const events = useDeveloperToolsStore.getState().events;
    expect(events).toHaveLength(200);
    expect(events[0]?.kind).toBe('kind-5');
    expect(events.at(-1)?.kind).toBe('kind-204');
  });
});

