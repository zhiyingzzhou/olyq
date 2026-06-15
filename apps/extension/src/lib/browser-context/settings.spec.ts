/**
 * 说明：`settings.spec` 浏览器上下文设置测试。
 *
 * 职责：
 * - 验证全文模式预算的默认值已经切到新的 24000 字；
 * - 验证旧的 18000 字设置会被统一抬升到新的最小预算；
 * - 保持这次“彻底切换”不会被后续回归重新降回旧值。
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BROWSER_CONTEXT_SETTINGS,
} from './types';
import {
  normalizeBrowserContextSettings,
} from './settings';

describe('browser-context settings', () => {
  it('默认全文网页模式预算已经提升到 24000 字', () => {
    expect(DEFAULT_BROWSER_CONTEXT_SETTINGS.fullPagePromptChars).toBe(24_000);
  });

  it('旧的 18000 字设置会被统一抬升到新的最小预算', () => {
    const normalized = normalizeBrowserContextSettings({
      enabled: true,
      fullPagePromptChars: 18_000,
    });

    expect(normalized.fullPagePromptChars).toBe(24_000);
  });
});
