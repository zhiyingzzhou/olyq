/**
 * 说明：`locale-merge.test` locale 合并安全测试。
 *
 * 职责：
 * - 证明 locale JSON 合并不会污染对象原型；
 * - 固化运行时与 locale audit 共用的安全合并策略。
 */
import { describe, expect, it } from 'vitest';

import {
  createLocaleResourceRecord,
  safeDeepMergeLocaleResources,
} from './locale-merge';

describe('locale-merge', () => {
  it('跳过原型污染键并保留正常嵌套 locale', () => {
    const target = createLocaleResourceRecord();
    const malicious = JSON.parse('{"common":{"ok":"yes"},"__proto__":{"polluted":true},"constructor":{"prototype":{"x":1}}}') as Record<string, unknown>;

    safeDeepMergeLocaleResources(target, malicious);

    expect((target.common as Record<string, unknown>).ok).toBe('yes');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('x');
    expect(target).not.toHaveProperty('__proto__');
    expect(target).not.toHaveProperty('constructor');
  });
});
