/**
 * 说明：`chat-input-toolbar-responsive.guard` 源码模块。
 *
 * 职责：
 * - 固化聊天输入区底部工具栏的窄宽响应式契约；
 * - 防止展开/收起入口和持久状态回流；
 * - 防止发送区在窄宽下被二级工具挤出视口。
 *
 * 边界：
 * - 本 guard 只检查静态源码契约；
 * - 具体按钮交互仍由 `ChatInputToolbar.spec.tsx` 和 quick panel 集成测试覆盖。
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

/**
 * 提取指定 CSS at-rule 的完整块内容。
 *
 * 静态 guard 需要只检查目标容器查询内部声明；直接使用 `[\s\S]*`
 * 容易跨过后续容器块并把其它断点的规则误判为当前断点。
 *
 * @param cssText - 完整 CSS 文本。
 * @param ruleHeader - 目标 at-rule 头部文本。
 * @returns at-rule 外层花括号内的 CSS 文本。
 */
function extractCssAtRuleBlock(cssText: string, ruleHeader: string) {
  const ruleStart = cssText.indexOf(ruleHeader);
  if (ruleStart < 0) {
    throw new Error(`Missing CSS at-rule: ${ruleHeader}`);
  }

  const blockStart = cssText.indexOf('{', ruleStart);
  if (blockStart < 0) {
    throw new Error(`Missing CSS block for at-rule: ${ruleHeader}`);
  }

  let depth = 0;
  for (let index = blockStart; index < cssText.length; index += 1) {
    const char = cssText[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return cssText.slice(blockStart + 1, index);
  }

  throw new Error(`Unclosed CSS block for at-rule: ${ruleHeader}`);
}

describe('chat input toolbar responsive guard', () => {
  it('输入区工具栏使用容器查询收纳次要工具，不恢复旧整组展开布局', () => {
    const cssText = readRepoFile('src/index.css');
    const compact260Block = extractCssAtRuleBlock(cssText, '@container (max-width: 260px)');

    expect(cssText).not.toContain('[data-chat-input-toolbar] {');
    expect(cssText).not.toMatch(/\[data-chat-input-toolbar\][\s\S]*container-type:\s*inline-size;/);
    expect(cssText).toContain('[data-chat-input-container]');
    expect(cssText).toContain('container-type: inline-size;');
    expect(cssText).toContain('[data-chat-input-container] .chat-input-toolbar-tools');
    expect(cssText).toContain('[data-chat-input-container] .chat-input-toolbar-actions');
    expect(cssText).toContain('justify-content: flex-end;');
    expect(cssText).toContain('[data-chat-input-container] .chat-input-more-tools-trigger');
    expect(cssText).toContain('@container (max-width: 520px)');
    expect(cssText).toContain('[data-chat-input-container] .chat-input-secondary-tool');
    expect(cssText).toContain('display: none;');
    expect(cssText).toContain('[data-chat-input-container] .chat-input-send-button');
    expect(cssText).toContain('gap: 0.25rem;');
    expect(cssText).toContain('min-width: 3.375rem;');
    expect(cssText).toContain('@container (max-width: 360px)');
    expect(cssText).toContain('grid-template-columns: repeat(auto-fit, minmax(1.75rem, 1fr));');
    expect(cssText).toContain('justify-items: center;');
    expect(cssText).toContain('@container (max-width: 260px)');
    expect(cssText).toContain('flex-wrap: wrap;');
    expect(cssText).not.toMatch(/@media\s*\(max-width:\s*520px\)\s*\{[\s\S]*\[data-chat-right-toolbar\][\s\S]*display:\s*none\s*!important/);
    expect(cssText).not.toMatch(/\[data-chat-right-toolbar\][\s\S]{0,160}display:\s*none\s*!important/);
    expect(cssText).toContain('[data-chat-main-shell]');
    expect(cssText).toContain('container-type: inline-size;');
    expect(cssText).toContain('[data-chat-right-toolbar] .chat-right-toolbar-main');
    expect(cssText).not.toContain('chat-right-toolbar-compact-only');
    expect(cssText).not.toContain('chat-right-toolbar-compact-hidden');
    expect(cssText).toContain('[data-chat-input-container] .chat-input-send-label');
    expect(cssText).toContain('white-space: nowrap;');
    expect(cssText).not.toMatch(/\.chat-input-send-label\s*\{[^}]*display:\s*none;/);
    expect(cssText).not.toMatch(/\.chat-input-send-button\s*\{[^}]*width:\s*1\.(?:25|5|875)rem;/);
    expect(compact260Block).not.toMatch(/\.chat-input-toolbar-tools\s*\{[^}]*display:\s*grid;/);
    expect(compact260Block).toMatch(/\.chat-input-toolbar-tools\s*\{[^}]*display:\s*flex;/);
    expect(cssText).not.toContain('@container (max-width: 96px)');
  });

  it('输入区 composer 空态使用紧凑最小高度，拖拽高度由 textarea 吃剩余空间', () => {
    const cssText = readRepoFile('src/index.css');
    const layoutText = readRepoFile('src/components/chat/chat-input/ChatInputLayout.tsx');
    const layoutStateText = readRepoFile('src/components/chat/chat-input/useInputLayoutState.ts');

    expect(cssText).toContain('[data-chat-composer-shell]');
    expect(cssText).toContain('min-height: max(6.5rem, var(--chat-composer-shell-height, 7.75rem));');
    expect(cssText).not.toMatch(/\[data-chat-composer-shell\]\s*\{[^}]*max-height:/);
    expect(cssText).toContain('[data-chat-input-container]');
    expect(cssText).toContain('container-type: inline-size;');
    expect(cssText).toContain('[data-chat-input-container] .chat-input-textarea');
    expect(cssText).toContain('flex: 1 1 0;');
    expect(cssText).toContain('max-height: none;');
    expect(cssText).not.toContain('max-height: min(8rem, 18dvh);');
    expect(layoutText).toContain('data-chat-composer-shell');
    expect(layoutText).toContain('data-chat-input-container');
    expect(layoutText).toContain("'--chat-composer-shell-height': `${composerShellHeight}px`");
    expect(layoutText).not.toMatch(/data-chat-composer-shell[\s\S]{0,240}overflow-hidden/);
    expect(layoutText).toContain('absolute left-0 right-0 top-0 z-10 h-2 cursor-row-resize');
    expect(layoutText).toContain('min-h-[2.75rem]');
    expect(layoutText).toContain('chat-input-textarea min-h-[2.75rem] w-full flex-1 basis-0');
    expect(layoutText).toContain('chat-input-toolbar-frame mt-1.5 shrink-0');
    expect(layoutText).not.toContain('min-h-[72px]');
    expect(layoutStateText).toContain('COMPOSER_SHELL_HEIGHT_DEFAULT = 124');
    expect(layoutStateText).toContain('COMPOSER_SHELL_HEIGHT_MIN = 104');
  });

  it('输入区工具栏不再保留展开按钮或展开状态真源', () => {
    const toolbarText = readRepoFile('src/components/chat/ChatInputToolbar.tsx');
    const layoutStateText = readRepoFile('src/components/chat/chat-input/useInputLayoutState.ts');
    const registryText = readRepoFile('src/lib/data-contracts/registry.ts');
    const zhChatText = readRepoFile('src/i18n/locales/zh-CN/chat.json');
    const enChatText = readRepoFile('src/i18n/locales/en-US/chat.json');
    const e2eChatDialogText = readRepoFile('e2e/chat-dialog.spec.ts');

    expect(toolbarText).toContain('data-chat-input-toolbar');
    expect(toolbarText).toContain('chat-input-toolbar flex flex-wrap items-end gap-x-2 gap-y-2');
    expect(toolbarText).toContain('chat-input-toolbar-tools flex min-w-0 flex-[1_1_auto] flex-wrap items-center gap-1');
    expect(toolbarText).toContain('chat-input-toolbar-actions ml-auto flex shrink-0 items-center justify-end gap-2');
    expect(toolbarText).toContain('chat-input-more-tools-trigger');
    expect(toolbarText).toContain('chat.moreInputTools');
    expect(toolbarText).toContain('chat-input-secondary-tool');
    expect(toolbarText).not.toContain('chat-input-toolbar-core');
    expect(toolbarText).not.toContain('chat-input-toolbar-main');
    expect(toolbarText).not.toContain('chat-input-toolbar-advanced');
    expect(toolbarText).not.toContain('chat-input-toolbar-main flex min-w-0 flex-[1_1_auto] flex-wrap items-center gap-1');
    expect(toolbarText).not.toContain('chat-input-toolbar-main flex min-w-0 flex-1');
    expect(toolbarText).not.toContain('chat-toolbar-expand-toggle');
    expect(toolbarText).not.toContain('chat-input-toolbar-expand');
    expect(toolbarText).not.toContain('toolbarExpanded');
    expect(toolbarText).not.toContain('onToggleToolbarExpanded');
    expect(layoutStateText).not.toContain('olyq.inputbar.expanded.v1');
    expect(layoutStateText).not.toContain('toggleToolbarExpanded');
    expect(registryText).not.toContain('olyq.inputbar.expanded.v1');
    expect(zhChatText).not.toContain('expandToolbar');
    expect(zhChatText).not.toContain('collapseToolbar');
    expect(enChatText).not.toContain('expandToolbar');
    expect(enChatText).not.toContain('collapseToolbar');
    expect(e2eChatDialogText).not.toContain('chat-toolbar-expand-toggle');
  });

  it('主工作区宽度不足时把完整侧栏切到 rail + floating，不回退旧 viewport matchMedia', () => {
    const indexPageText = readRepoFile('src/pages/index-page/IndexPageView.tsx');
    const rightToolbarText = readRepoFile('src/components/chat/RightToolbar.tsx');
    const layoutModeText = readRepoFile('src/pages/index-page/sidebarLayoutMode.ts');
    const sidebarText = readRepoFile('src/components/chat/TopicSidebar.tsx');
    const miniText = readRepoFile('src/components/chat/topic-sidebar/TopicSidebarMini.tsx');
    const cssText = readRepoFile('src/index.css');

    expect(layoutModeText).toContain('SIDEBAR_FLOATING_BREAKPOINT_PX = 860');
    expect(layoutModeText).toContain("workspaceWidth >= SIDEBAR_FLOATING_BREAKPOINT_PX ? 'full' : 'floating'");
    expect(indexPageText).toContain('ResizeObserver');
    expect(indexPageText).toContain('resolveSidebarLayoutMode(nextWidth)');
    expect(indexPageText).toContain("sidebarLayoutMode === 'floating'");
    expect(indexPageText).toContain('data-sidebar-layout-mode={sidebarLayoutMode}');
    expect(indexPageText).toContain('data-chat-main-shell');
    expect(rightToolbarText).toContain('data-chat-right-toolbar');
    expect(rightToolbarText).toContain('overflow-y-auto');
    expect(rightToolbarText).toContain('toolbar-launchpad');
    expect(rightToolbarText).toContain('toolbar-element-picker');
    expect(rightToolbarText).toContain('toolbar-screenshot-editor');
    expect(rightToolbarText).toContain('toolbar-phrases');
    expect(rightToolbarText).toContain('toolbar-translation');
    expect(rightToolbarText).not.toContain('toolbar-more-actions');
    expect(rightToolbarText).not.toContain('chat.moreToolbarActions');
    expect(rightToolbarText).not.toContain('chat-right-toolbar-compact-only');
    expect(rightToolbarText).not.toContain('chat-right-toolbar-compact-hidden');
    expect(indexPageText).not.toContain('SIDEBAR_COMPACT_VIEWPORT_QUERY');
    expect(indexPageText).not.toContain('matchesSidebarCompactViewport');
    expect(indexPageText).not.toContain('window.matchMedia(SIDEBAR_COMPACT_VIEWPORT_QUERY)');
    expect(indexPageText).not.toMatch(/updateDisplaySettings\([\s\S]*sidebarLayoutMode/);
    expect(sidebarText).toContain("presentation = 'inline'");
    expect(sidebarText).toContain('floatingOpen = false');
    expect(sidebarText).toContain("data-sidebar-presentation={shellPresentation}");
    expect(sidebarText).toContain('data-topic-sidebar-floating-layer');
    expect(sidebarText).toContain('handleCloseFloatingSidebar');
    expect(sidebarText).toContain("if (presentation === 'floating') handleCloseFloatingSidebar();");
    expect(sidebarText).not.toContain('w-72 h-full flex flex-col');
    expect(miniText).toContain('PanelRightOpen');
    expect(miniText).toContain('data-testid="topic-sidebar-mini-rail"');
    expect(miniText).toContain('data-testid="topic-sidebar-rail-expand"');
    expect(cssText).toContain('[data-topic-sidebar-shell]');
    expect(cssText).toContain('width: clamp(15.5rem, 24vw, 18rem);');
    expect(cssText).toContain('[data-topic-sidebar-shell][data-sidebar-presentation="floating"]');
    expect(cssText).toContain('width: min(18rem, calc(100vw - 3rem));');
  });
});
