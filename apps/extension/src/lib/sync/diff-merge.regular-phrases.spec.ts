/**
 * 说明：`diff-merge.regular-phrases.spec` 测试模块。
 *
 * 职责：
 * - 固定 `regularPhrases` 已进入 assistant 字段级 LWW 真源；
 * - 防止同步字段列表后续重构时漏掉助手级常用短语。
 */
import { describe, expect, it } from 'vitest';

import { ASSISTANT_LWW_FIELDS } from './diff-merge';

describe('diff-merge assistant LWW fields', () => {
  it('包含助手级常用短语字段', () => {
    expect(ASSISTANT_LWW_FIELDS).toContain('regularPhrases');
  });
});
