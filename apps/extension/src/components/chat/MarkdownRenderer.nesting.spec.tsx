/**
 * 说明：`MarkdownRenderer.nesting.spec` 组件模块。
 *
 * 职责：
 * - 承载 `MarkdownRenderer.nesting.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';

// 测试环境不需要完整 i18n（否则 useTranslation 会在控制台输出 NO_I18NEXT_INSTANCE 并影响断言）
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

/**
 * 目的：防止 validateDOMNesting 警告回归。
 *
 * 背景：
 * - react-markdown 默认会把图片渲染在 \<p\> 内
 * - 我们的 ImageRenderer 支持点击放大（使用 portal）
 * - 一旦实现不当（例如在 \<p\> 内直接渲染 \<div\>），React 会在控制台输出：
 *   控制台警告（原文）： "validateDOMNesting(...): \<div\> cannot appear as a descendant of \<p\>"
 */
describe('MarkdownRenderer DOM nesting', () => {
  it('图片放大预览不应触发 validateDOMNesting（div in p）', async () => {
    const { MarkdownRenderer } = await import('./MarkdownRendererImpl');
    const errors: unknown[][] = [];
    const orig = console.error;
    console.error = (...args) => {
      errors.push(args);
      orig(...args);
    };

    try {
      // 说明：
      // - react-markdown 默认会对 url 做 sanitize，data: 协议可能被清空（src 变为空字符串），导致无法渲染 <img>。
      // - 测试中仅验证 DOM 结构与 portal 行为，因此使用 https URL 即可（jsdom 不会实际加载图片资源）。
      const md = '![demo](https://example.com/demo.png)';
      const { container } = render(<MarkdownRenderer content={md} />);
      await waitFor(() => {
        expect(container.querySelector('img')).toBeTruthy();
      });

      // 点击图片触发"放大预览"（内部会 createPortal 到 document.body）
      const img = container.querySelector('img');
      expect(img).toBeTruthy();
      fireEvent.click(img as Element);

      // 等待一次微任务，让 portal 内容完成挂载
      await new Promise((r) => setTimeout(r, 0));
    } finally {
      console.error = orig;
    }

    const msg = errors.map((e) => String(e[0] ?? '')).join('\n');
    expect(msg).not.toContain('validateDOMNesting');
  }, 15_000);

  it('链接预览触发器不应触发 validateDOMNesting（div in p）', async () => {
    const { MarkdownRenderer } = await import('./MarkdownRendererImpl');
    const errors: unknown[][] = [];
    const orig = console.error;
    console.error = (...args) => {
      errors.push(args);
      orig(...args);
    };

    try {
      render(<MarkdownRenderer content="[demo](https://example.com/demo)" />);
      await waitFor(() => {
        expect(document.querySelector('a[href="https://example.com/demo"]')).toBeTruthy();
      });
    } finally {
      console.error = orig;
    }

    const msg = errors.map((e) => String(e[0] ?? '')).join('\n');
    expect(msg).not.toContain('validateDOMNesting');
  }, 15_000);
});
