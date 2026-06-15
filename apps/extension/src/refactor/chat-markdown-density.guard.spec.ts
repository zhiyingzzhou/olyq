/**
 * 说明：`chat-markdown-density.guard` 源码模块。
 *
 * 职责：
 * - 固化聊天域 Markdown 的精致紧凑阅读密度；
 * - 防止标题、代码块、表格、引用和消息 surface 回退到文章页式大间距；
 * - 保证 MarkdownRenderer 在普通消息、compare、搜索预览和欢迎演示中保持一致节奏。
 *
 * 边界：
 * - 本 guard 只检查聊天 Markdown 视觉密度契约；
 * - 阅读列宽度和消息 lane 宽度继续由 `chat-wide-layout.guard` 与 MessageBubble 组件测试覆盖。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(SRC_ROOT, '..');

/**
 * 读取源码文件内容。
 *
 * @param relativePath - 相对仓库根目录的文件路径。
 * @returns 源码文本。
 */
function readRepoFile(relativePath: string) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('chat markdown density guard', () => {
  it('Markdown 基础排版保持精致紧凑密度', () => {
    const sourceText = readRepoFile('src/index.css');

    expect(sourceText).toContain('line-height: 1.62;');
    expect(sourceText).toContain('font-size: 0.875rem;');
    expect(sourceText).toContain('margin-bottom: 0.45em;');
    expect(sourceText).toContain('margin-top: 0.9em;');
    expect(sourceText).toContain('margin-bottom: 0.32em;');
    expect(sourceText).toContain('line-height: 1.28;');
    expect(sourceText).toContain('font-weight: 650;');
    expect(sourceText).toContain('.markdown-body h1 { font-size: 1.28em; }');
    expect(sourceText).toContain('.markdown-body h2 { font-size: 1.18em; }');
    expect(sourceText).toContain('.markdown-body h3 { font-size: 1.08em; }');
    expect(sourceText).toContain('margin: 1em 0;');
    expect(sourceText).not.toContain('line-height: 1.75;');
  });

  it('代码块保留语言栏和复制按钮，但使用紧凑栏与块内横向滚动', () => {
    const sourceText = readRepoFile('src/components/chat/MarkdownRendererImpl.tsx');

    expect(sourceText).toContain('my-2 overflow-hidden rounded-md');
    expect(sourceText).toContain('px-3 py-1 text-[11px] leading-4');
    expect(sourceText).toContain("fontSize: '0.8125rem'");
    expect(sourceText).toContain('lineHeight: 1.55');
    expect(sourceText).toContain("padding: '0.65rem 0.85rem'");
    expect(sourceText).toContain("overflowX: 'auto'");
    expect(sourceText).toContain('overflow-x-auto whitespace-pre bg-muted/20 px-3 py-2 text-[13px] leading-5');
    expect(sourceText).not.toContain('my-3 rounded-lg');
  });

  it('表格、引用和列表使用紧凑块级间距', () => {
    const sourceText = readRepoFile('src/components/chat/MarkdownRendererImpl.tsx');

    expect(sourceText).toContain('not-prose my-2 overflow-x-auto rounded-md');
    expect(sourceText).toContain('m-0 w-full min-w-full border-collapse text-sm');
    expect(sourceText).toContain('px-2.5 py-1.5');
    expect(sourceText).toContain('my-2 border-l-2');
    expect(sourceText).toContain('my-1.5 ml-4 list-disc space-y-0.5');
    expect(sourceText).toContain('my-1.5 ml-4 list-decimal space-y-0.5');
  });

  it('Mermaid 内嵌图表保持可读 SVG 宽度，由容器横向滚动承载宽图', () => {
    const cssText = readRepoFile('src/index.css');
    const mermaidSourceText = readRepoFile('src/components/chat/MarkdownMermaidBlock.tsx');

    expect(cssText).toContain('.markdown-body .olyq-mermaid-inline-scroll');
    expect(cssText).toContain('.markdown-body .olyq-mermaid-inline-trigger');
    expect(cssText).toContain('width: max(100%, var(--olyq-mermaid-readable-width, 100%));');
    expect(cssText).toContain('min-width: var(--olyq-mermaid-readable-width, 45rem);');
    expect(cssText).toContain('max-width: none;');
    expect(mermaidSourceText).toContain("'--olyq-mermaid-natural-width'");
    expect(mermaidSourceText).toContain("'--olyq-mermaid-natural-height'");
    expect(mermaidSourceText).toContain("'--olyq-mermaid-readable-width'");
    expect(mermaidSourceText).toContain("className=\"olyq-mermaid-inline-scroll overflow-x-auto p-4\"");
    expect(mermaidSourceText).toContain("className=\"olyq-mermaid-inline-trigger group relative mx-auto block max-w-none cursor-zoom-in text-left\"");
    expect(mermaidSourceText).toContain('olyq-mermaid-preview-hover-layer');
  });

  it('普通消息 surface 轻收，且 user Markdown 不再额外放大行距', () => {
    const viewSourceText = readRepoFile('src/components/chat/message-bubble/useMessageBubbleView.tsx');
    const layoutSourceText = readRepoFile('src/components/chat/message-bubble/MessageBubbleLayout.tsx');

    expect(viewSourceText).toContain('bg-card px-3.5 py-2.5 text-foreground shadow-none');
    expect(viewSourceText).toContain('dark:border-primary/15 dark:bg-primary/[0.06]');
    expect(viewSourceText).toContain('bg-card px-4 py-3');
    expect(viewSourceText).not.toContain('olyq-brand-gradient-surface rounded-2xl rounded-tr-sm');
    expect(viewSourceText).not.toContain('bg-primary px-4 py-3');
    expect(viewSourceText).not.toContain('bg-primary px-3.5 py-2.5');
    expect(viewSourceText).not.toContain('bg-card px-5 py-4');
    expect(layoutSourceText).toContain('user-bubble-markdown text-sm');
    expect(layoutSourceText).not.toContain('user-bubble-markdown text-sm leading-relaxed');
  });
});
