/**
 * 说明：`inline-ui-contract.spec` 内容脚本 React 网页工具契约测试。
 *
 * 职责：
 * - 锁住统一 React Shadow root 下的划词菜单、隐藏菜单、内联响应卡片、元素选择器和截图工具条；
 * - 防止 page-facing UI 回退到原生 HTML 模板、原生 `title` 或脱离 Olyq 浅色浮层 token；
 * - 验证所有工具共用同一个 Shadow DOM 与 tooltip contract。
 *
 * 边界：
 * - 这里只渲染 React 静态 UI，不启动 content script runtime；
 * - pointer 热路径、截图导出和 SW 路由由各自交互测试覆盖。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../i18n', () => ({
  default: { t: (key: string) => key },
}));

describe('page-facing React page tools contract', () => {
  afterEach(async () => {
    const { unmountPageToolsRoot } = await import('./page-tools/page-tools-root');
    unmountPageToolsRoot();
  });

  /**
   * 从静态 CSS 文本中读取指定 selector 的根规则。
   *
   * @param styles - Shadow DOM 样式源码。
   * @param selector - 需要检查的 CSS selector。
   * @returns 匹配到的 CSS rule 文本。
   */
  function getCssRule(styles: string, selector: string) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = styles.match(new RegExp(`${escaped}\\s*\\{[^}]+\\}`));
    expect(match).toBeTruthy();
    return match![0];
  }

  /** 读取 page tools 的真实 Shadow CSS，避免 Vitest 把 `?inline` CSS mock 成空字符串。 */
  function readPageToolsShadowCss() {
    return fs.readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'page-tools/page-tools.shadow.css'),
      'utf8',
    );
  }

  it('统一 React root 渲染所有 page tools，并保留 Olyq tooltip/aria contract', async () => {
    const { ensurePageToolsRoot, PAGE_TOOLS_HOST_ID } = await import('./page-tools/page-tools-root');
    const runtime = ensurePageToolsRoot();
    const shadow = runtime.refs.shadow;

    expect(document.getElementById(PAGE_TOOLS_HOST_ID)).toBe(runtime.refs.host);
    expect(shadow.querySelector('.page-tools-root')).toBeTruthy();
    expect(shadow.innerHTML).not.toContain('title=');

    expect(shadow.querySelector('.menu button[data-action="explain"]')).toBeTruthy();
    expect(shadow.querySelector('.menu button[data-action="translate"]')).toBeTruthy();
    expect(shadow.querySelector('.menu button[data-action="summarize"]')).toBeTruthy();
    expect(shadow.querySelector('.menu button[data-action="ask"]')).toBeTruthy();
    const hideTrigger = shadow.querySelector<HTMLButtonElement>('.menu button[data-hide-trigger="menu"]');
    expect(hideTrigger?.getAttribute('aria-controls')).toBe('olyq-inline-hide-panel');
    expect(hideTrigger?.getAttribute('data-olyq-tooltip')).toBe('contentScript.hide.hidePageToolsLabel');

    expect(shadow.querySelector('#olyq-inline-hide-panel')?.getAttribute('role')).toBe('menu');
    expect(shadow.querySelector('#olyq-inline-hide-panel button[data-hide-action="dismiss-session"]')).toBeTruthy();
    expect(shadow.querySelector('#olyq-inline-hide-panel button[data-hide-action="disable-site"]')).toBeTruthy();
    expect(shadow.querySelector('#olyq-inline-hide-panel button[data-hide-action="disable-global"]')).toBeTruthy();

    expect(shadow.querySelector('.response-card button[data-card-action="close"]')).toBeTruthy();
    expect(shadow.querySelector('.response-card button[data-card-action="copy"]')).toBeTruthy();
    expect(shadow.querySelector('.response-card button[data-card-action="open"]')).toBeTruthy();
    expect(shadow.querySelector('.response-card button[data-card-action="hide-options"]')).toBeNull();
  });

  it('元素选择器和截图编辑器由 React JSX 承载，不暴露划词动作菜单或备忘入口', async () => {
    const { ensurePageToolsRoot } = await import('./page-tools/page-tools-root');
    const { shadow } = ensurePageToolsRoot().refs;

    expect(shadow.querySelector('.hint [data-role="text"]')).toBeTruthy();
    expect(shadow.querySelector('.hint [data-role="summary"]')).toBeTruthy();
    expect(shadow.querySelector('.hint button[data-action="shrink"]')).toBeTruthy();
    expect(shadow.querySelector('.hint button[data-action="expand"]')).toBeTruthy();
    expect(shadow.querySelector('.hint button[data-action="commit"]')).toBeTruthy();
    expect(shadow.querySelector('.hint button[data-action="ask"]')).toBeNull();
    expect(shadow.querySelector('.hint button[data-action="explain"]')).toBeNull();

    expect(shadow.querySelector('.screenshot-toolbar button[data-action="chat"]')).toBeTruthy();
    expect(shadow.querySelector('.screenshot-toolbar button[data-action="ocr"]')).toBeTruthy();
    expect(shadow.querySelector('.screenshot-toolbar button[data-tool="mosaic"]')).toBeTruthy();
    expect(shadow.querySelector('.screenshot-toolbar button[data-action="memo"]')).toBeNull();
    shadow.querySelectorAll<HTMLButtonElement>('.screenshot-toolbar button').forEach((button) => {
      expect(button.getAttribute('aria-label')).toBeTruthy();
      expect(button.getAttribute('data-olyq-tooltip')).toBeTruthy();
    });
    const mosaicSvg = shadow.querySelector('.screenshot-toolbar button[data-tool="mosaic"] svg');
    expect(mosaicSvg?.querySelectorAll('rect')).toHaveLength(0);
    expect(mosaicSvg?.querySelectorAll('path')).toHaveLength(13);
    expect(shadow.querySelector('.text-annotation-layer')).toBeTruthy();
    expect(shadow.innerHTML).not.toContain('brush-body');
  });

  it('统一样式保留 Olyq 浅色毛玻璃、蓝色选区和分层 contract', async () => {
    const { PAGE_TOOLS_TAILWIND_TOKENS } = await import('./page-tools/page-tools-tokens');
    const { PAGE_TOOLTIP_STYLES } = await import('./page-tooltip');
    const pageToolsShadowCss = readPageToolsShadowCss();
    const PAGE_TOOLS_STYLES = `${pageToolsShadowCss}\n${PAGE_TOOLTIP_STYLES}`;

    expect(PAGE_TOOLS_STYLES).toContain('background: rgba(255,255,255,.96)');
    expect(PAGE_TOOLS_STYLES).toContain('border: 1px solid rgba(226,232,240,.95)');
    expect(PAGE_TOOLS_STYLES).toContain('rgba(74,222,128,.95)');
    expect(PAGE_TOOLS_STYLES).toContain('border: 2px solid rgba(59,130,246,.9)');
    expect(PAGE_TOOLS_STYLES).toContain('.page-tooltip');
    expect(PAGE_TOOLS_STYLES).not.toContain('background: rgba(12, 12, 16, .90)');
    expect(PAGE_TOOLS_STYLES).not.toContain('title=');

    expect(getCssRule(PAGE_TOOLS_STYLES, '.menu')).toContain('z-index: var(--olyq-page-tools-menu-z)');
    expect(getCssRule(PAGE_TOOLS_STYLES, '.response-card')).toContain('z-index: var(--olyq-page-tools-card-z)');
    expect(getCssRule(PAGE_TOOLS_STYLES, '.hide-panel')).toContain('z-index: var(--olyq-page-tools-panel-z)');
    expect(Number(PAGE_TOOLS_TAILWIND_TOKENS.zIndex['page-tools-menu'])).toBeLessThan(Number(PAGE_TOOLS_TAILWIND_TOKENS.zIndex['page-tools-card']));
    expect(Number(PAGE_TOOLS_TAILWIND_TOKENS.zIndex['page-tools-card'])).toBeLessThan(Number(PAGE_TOOLS_TAILWIND_TOKENS.zIndex['page-tools-panel']));
    expect(PAGE_TOOLTIP_STYLES).toContain('z-index: 1000');
  });
});
