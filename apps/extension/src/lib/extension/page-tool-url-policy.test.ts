/**
 * 说明：`page-tool-url-policy.test` 页面工具 URL 策略测试。
 *
 * 职责：
 * - 固化 page tools 只用 URL parser 分类目标页面；
 * - 防止 Chrome Web Store、内部页和扩展页判断回退成 substring 匹配。
 */
import { describe, expect, it } from 'vitest';

import { classifyPageToolTargetUrl } from './page-tool-url-policy';

describe('page-tool-url-policy', () => {
  it('精确识别页面工具不可作用的 URL 类型', () => {
    expect(classifyPageToolTargetUrl('file:///Users/demo/index.html')).toBe('file-url');
    expect(classifyPageToolTargetUrl('chrome://extensions')).toBe('browser-internal-page');
    expect(classifyPageToolTargetUrl('moz-extension://extension-id/options.html')).toBe('extension-page');
    expect(classifyPageToolTargetUrl('https://chromewebstore.google.com/detail/abc')).toBe('chrome-web-store');
    expect(classifyPageToolTargetUrl('https://chrome.google.com/webstore/detail/abc')).toBe('chrome-web-store');
  });

  it('不会把包含相似字符串的普通站点误判为 Chrome Web Store', () => {
    expect(classifyPageToolTargetUrl('https://example.com/?next=https://chromewebstore.google.com')).toBe('ordinary-web-page');
    expect(classifyPageToolTargetUrl('https://chrome.google.com.evil.example/webstore/detail/abc')).toBe('ordinary-web-page');
  });
});
