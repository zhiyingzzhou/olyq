/**
 * 说明：`page-context-responsive.guard` 源码模块。
 *
 * 职责：
 * - 固化 PageContextBar 的窄宽响应式降级契约；
 * - 防止宽度充足时同时展示 inline 控件和更多菜单；
 * - 防止“模式 / 操作”分组 label 被提前隐藏，导致宽屏分组语义退化。
 *
 * 边界：
 * - 本 guard 只检查静态源码契约；
 * - 具体交互回调仍由 `PageContextBar.spec.tsx` 覆盖。
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

describe('page context responsive guard', () => {
  it('PageContextBar 使用容器查询和互斥 compact controls 承载窄宽降级', () => {
    const cssText = readRepoFile('src/index.css');
    const pageContextText = readRepoFile('src/components/chat/PageContextBar.tsx');
    const controlsText = readRepoFile('src/components/chat/PageContextBarControls.tsx');
    const defaultCompactBlockMatch = cssText.match(/\[data-page-context-bar\]\s+\.page-context-compact-controls\s+\{[\s\S]*?\n\s{2}\}/);
    const compactBlockMatch = cssText.match(/@container\s+\(max-width:\s+680px\)\s+\{[\s\S]*?\n\s{2}\}/);

    expect(cssText).toContain('[data-page-context-bar]');
    expect(cssText).toContain('container-type: inline-size;');
    expect(pageContextText).toContain('grid-cols-[auto_minmax(0,1fr)_auto_auto]');
    expect(pageContextText).toContain('page-context-summary-shell');
    expect(pageContextText).toContain('overflow-hidden');
    expect(cssText).toContain('[data-page-context-bar] .page-context-summary-shell');
    expect(cssText).toContain('@container (max-width: 680px)');
    expect(cssText).toContain('[data-page-context-bar] .page-context-inline-control-group');
    expect(cssText).toContain('[data-page-context-bar] .page-context-compact-controls');
    expect(controlsText).toContain("className={cn('page-context-compact-controls', actionChipClassName)}");
    expect(controlsText).toContain('min-w-max shrink-0');
    expect(defaultCompactBlockMatch?.[0]).toContain('display: none !important;');
    expect(compactBlockMatch?.[0]).toContain('[data-page-context-bar] .page-context-inline-control-group');
    expect(compactBlockMatch?.[0]).toContain('display: none !important;');
    expect(compactBlockMatch?.[0]).toContain('[data-page-context-bar] .page-context-compact-controls');
    expect(compactBlockMatch?.[0]).toContain('display: inline-flex !important;');
  });

  it('宽度尚可时只隐藏摘要徽标，不提前隐藏模式和操作分组 label', () => {
    const cssText = readRepoFile('src/index.css');
    const pageContextText = readRepoFile('src/components/chat/PageContextBar.tsx');
    const badgeBlockMatch = cssText.match(/@container\s+\(max-width:\s+1020px\)\s+\{[\s\S]*?\n\s{2}\}/);

    expect(cssText).toContain('@container (max-width: 1020px)');
    expect(pageContextText).toContain('page-context-profile-badge inline-flex min-w-0');
    expect(pageContextText).toContain('page-context-body-badge inline-flex min-w-0');
    expect(pageContextText).toContain('page-context-hostname min-w-0');
    expect(badgeBlockMatch?.[0]).toContain('.page-context-hostname');
    expect(badgeBlockMatch?.[0]).toContain('.page-context-style-capture-badge');
    expect(badgeBlockMatch?.[0]).toContain('.page-context-body-badge');
    expect(badgeBlockMatch?.[0]).toContain('.page-context-profile-badge');
    expect(badgeBlockMatch?.[0]).toContain('.page-context-technology-stack-trigger span');
    expect(badgeBlockMatch?.[0]).not.toContain('page-context-mode-group');
    expect(badgeBlockMatch?.[0]).not.toContain('page-context-action-group');
    expect(pageContextText).toContain("const groupLabelClassName = 'text-[10px] font-medium text-muted-foreground/70';");
    expect(pageContextText).not.toContain("const groupLabelClassName = 'hidden");
    expect(pageContextText.match(/const groupLabelClassName = '[^']+';/)?.[0]).not.toContain('sm:inline');
  });

  it('自动上下文可见文字只在极窄容器下隐藏', () => {
    const cssText = readRepoFile('src/index.css');
    const compactBlockMatch = cssText.match(/@container\s+\(max-width:\s+680px\)\s+\{[\s\S]*?\n\s{2}\}/);
    const autoLabelBlockMatch = cssText.match(/@container\s+\(max-width:\s+460px\)\s+\{[\s\S]*?\n\s{2}\}/);

    expect(compactBlockMatch?.[0]).not.toContain('.page-context-auto-label');
    expect(autoLabelBlockMatch?.[0]).toContain('[data-page-context-bar] .page-context-auto-label');
    expect(autoLabelBlockMatch?.[0]).toContain('display: none;');
  });

  it('隐藏截图 badge 内部文本可截断，不再作为不可收缩项压住右侧控件', () => {
    const styleCaptureText = readRepoFile('src/components/chat/PageContextBarStyleCapture.tsx');
    const technologyStackText = readRepoFile('src/components/chat/TechnologyStackPopover.tsx');

    expect(styleCaptureText).toContain('page-context-style-capture-badge inline-flex min-w-0');
    expect(styleCaptureText).toContain('max-w-[16rem] shrink');
    expect(styleCaptureText).toContain('<span className="truncate">{text.summary}</span>');
    expect(technologyStackText).toContain("'page-context-technology-stack-trigger shrink-0'");
  });
});
