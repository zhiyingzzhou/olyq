/**
 * 说明：`screenshot-editor-ui.spec` 截图编辑器 UI contract 测试。
 *
 * 职责：
 * - 锁住截图编辑器必须沿用 page-facing 浮层视觉 token；
 * - 确保工具条按钮使用共享 tooltip 属性和 `aria-label`，不回退到原生 title；
 * - 防止后续把外部样式或浏览器原生提示误搬进页面注入层。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  default: { t: (key: string) => key },
}));

describe('screenshot editor page-facing ui contract', () => {
  afterEach(async () => {
    const { unmountPageToolsRoot } = await import('@/extension/content-script/page-tools/page-tools-root');
    unmountPageToolsRoot();
  });

  it('工具条沿用注入网页工具风格并接入共享 tooltip', async () => {
    const { ensurePageToolsRoot } = await import('@/extension/content-script/page-tools/page-tools-root');
    const { PAGE_TOOLTIP_STYLES } = await import('@/extension/content-script/page-tooltip');
    const pageToolsShadowCss = fs.readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../../../extension/content-script/page-tools/page-tools.shadow.css',
      ),
      'utf8',
    );
    const PAGE_TOOLS_STYLES = `${pageToolsShadowCss}\n${PAGE_TOOLTIP_STYLES}`;
    const { shadow } = ensurePageToolsRoot().refs;

    expect(PAGE_TOOLS_STYLES).toContain('background: rgba(255,255,255,.96)');
    expect(PAGE_TOOLS_STYLES).toContain('border: 1px solid rgba(226,232,240,.95)');
    expect(PAGE_TOOLS_STYLES).toContain('rgba(74,222,128,.95)');
    expect(PAGE_TOOLS_STYLES).toContain('.page-tooltip');
    expect(PAGE_TOOLS_STYLES).toContain('border-radius: 12px');
    expect(PAGE_TOOLS_STYLES).not.toContain('title=');

    expect(shadow.querySelector('.screenshot-toolbar button[data-action="chat"]')).toBeTruthy();
    expect(shadow.querySelector('.screenshot-toolbar button[data-action="ocr"]')).toBeTruthy();
    expect(shadow.querySelector('.screenshot-toolbar button[data-tool="mosaic"]')).toBeTruthy();
    expect(shadow.querySelector('.tool-options')).toBeTruthy();
    expect(shadow.querySelector('.tool-feedback[role="status"]')).toBeTruthy();
    expect(shadow.querySelector('.ocr-popover[role="dialog"]')).toBeTruthy();
    expect(shadow.querySelector('.ocr-drag-indicator')).toBeNull();
    expect(shadow.innerHTML).not.toContain('••');
    expect(shadow.querySelector('.ocr-popover button[data-ocr-action="copy"]')?.getAttribute('data-olyq-tooltip')).toBeTruthy();
    expect(shadow.querySelector('.ocr-popover button[data-ocr-action="close"]')?.getAttribute('data-olyq-tooltip')).toBeTruthy();
    expect(shadow.querySelector('.tool-options button[data-style-color="#FF3D00"]')).toBeTruthy();
    expect(shadow.querySelector('.tool-options button[data-style-size="2"]')).toBeTruthy();
    expect(shadow.querySelector('.tool-options button[data-mosaic-style-size="8"]')).toBeTruthy();
    expect(shadow.querySelector('.screenshot-editor')?.contains(shadow.querySelector('.ocr-popover'))).toBe(false);
    expect(shadow.querySelector('.tool-options button[data-style-font-size="24"]')).toBeTruthy();
    expect(shadow.querySelector('.screenshot-toolbar button[data-action="memo"]')).toBeNull();
    expect(shadow.innerHTML).not.toContain('title=');
    expect(shadow.innerHTML).not.toContain('Grid2X2');

    const toolbarButtons = shadow.querySelectorAll<HTMLButtonElement>('.screenshot-toolbar button, .tool-options button');
    expect(toolbarButtons.length).toBeGreaterThan(0);
    toolbarButtons.forEach((button) => {
      expect(button.getAttribute('data-olyq-tooltip')).toBeTruthy();
      expect(button.getAttribute('aria-label')).toBeTruthy();
    });
    const mosaicSvg = shadow.querySelector('.screenshot-toolbar button[data-tool="mosaic"] svg');
    expect(mosaicSvg?.classList.contains('lucide-mosaic')).toBe(true);
    expect(mosaicSvg?.getAttribute('fill')).toBe('none');
    expect(mosaicSvg?.querySelectorAll('rect')).toHaveLength(0);
    const mosaicPixels = [...(mosaicSvg?.querySelectorAll('path') ?? [])];
    expect(mosaicPixels).toHaveLength(13);
    expect(mosaicPixels.every((pixel) => pixel.getAttribute('fill') === 'currentColor')).toBe(true);
    expect(mosaicPixels.every((pixel) => pixel.getAttribute('stroke') === 'none')).toBe(true);
    expect(mosaicPixels.map((pixel) => pixel.getAttribute('d'))).toContain('M6 2H2v4h4V2Z');
    expect(shadow.innerHTML).not.toContain('brush-body');
    const textEditor = shadow.querySelector<HTMLElement>('.text-editor');
    expect(shadow.querySelector<HTMLElement>('.text-annotation-layer')).toBeTruthy();
    expect(textEditor?.tagName).toBe('DIV');
    expect(textEditor).toHaveAttribute('contenteditable', 'true');
    expect(textEditor).toHaveAttribute('role', 'textbox');
    expect(textEditor).toHaveAttribute('aria-multiline', 'true');
    expect(textEditor).toHaveAttribute('data-olyq-text-editor', 'true');
    expect(PAGE_TOOLS_STYLES).toContain('.text-editor');
    expect(PAGE_TOOLS_STYLES).toContain('.text-annotation');
    expect(PAGE_TOOLS_STYLES).toContain('cursor: move');
    expect(PAGE_TOOLS_STYLES).toContain('.tool-options');
    expect(PAGE_TOOLS_STYLES).toContain('.chip[data-disabled="true"]');
    expect(PAGE_TOOLS_STYLES).toContain('.ocr-header');
    expect(PAGE_TOOLS_STYLES).toContain('cursor: grab');
    expect(PAGE_TOOLS_STYLES).toContain('.ocr-body');
    expect(PAGE_TOOLS_STYLES).toContain('user-select: text');
    expect(PAGE_TOOLS_STYLES).toContain('-webkit-user-select: text');
    expect(PAGE_TOOLS_STYLES).not.toContain('.ocr-drag-indicator');
    const ocrPopoverRule = PAGE_TOOLS_STYLES.match(/\.ocr-popover \{[^}]+\}/)?.[0] ?? '';
    expect(ocrPopoverRule).not.toMatch(/\b(?:animation|transition|transform)\b/);
    const ocrOpenRule = PAGE_TOOLS_STYLES.match(/\.ocr-popover\[data-open="true"\] \{[^}]+\}/)?.[0] ?? '';
    expect(ocrOpenRule).toContain('animation: ocrPopoverFadeIn');
    const ocrFadeKeyframes = PAGE_TOOLS_STYLES.match(/@keyframes ocrPopoverFadeIn \{[^}]+}\s*to \{[^}]+}/)?.[0] ?? '';
    expect(ocrFadeKeyframes).toContain('opacity');
    expect(ocrFadeKeyframes).not.toMatch(/\b(?:transform|translate|left|top)\b/);
    expect(PAGE_TOOLS_STYLES).toContain('background: transparent');
    expect(PAGE_TOOLS_STYLES).toContain('box-shadow: none');
    expect(PAGE_TOOLS_STYLES).toContain('cursor: text');
    expect(PAGE_TOOLS_STYLES).toContain('width: fit-content');
    expect(PAGE_TOOLS_STYLES).toContain('font: 24px/1 sans-serif');
    expect(PAGE_TOOLS_STYLES).not.toContain('resize: none');
  });
});
