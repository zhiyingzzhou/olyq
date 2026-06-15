/**
 * 说明：`paint-responsive-layout.guard` 源码模块。
 *
 * 职责：
 * - 固化 Paint 工作台 expanded / compact 响应式布局契约；
 * - 防止窄宽重新退回三栏硬挤；
 * - 防止 Paint 抽屉被懒加载或动态 import 化。
 *
 * 边界：
 * - 本 guard 只检查静态源码契约；
 * - 真实布局几何由 Paint E2E 覆盖。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(SRC_ROOT, '..');

/**
 * 读取仓库内文件文本。
 *
 * @param relativePath - 相对 `olyq/` 根目录的文件路径。
 * @returns 文件 UTF-8 文本。
 */
function readRepoFile(relativePath: string) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('paint responsive layout guard', () => {
  it('Paint 使用 960px 容器宽度切换三栏和 compact 抽屉', () => {
    const paintText = readRepoFile('src/pages/Paint.tsx');
    const contractText = readRepoFile('src/pages/paint/paintResponsiveLayoutContract.ts');
    const layoutText = readRepoFile('src/pages/paint/PaintResponsiveLayout.tsx');

    expect(contractText).toContain('export const PAINT_COMPACT_LAYOUT_MAX_WIDTH = 960');
    expect(contractText).toContain("export type PaintLayoutMode = 'compact' | 'expanded'");
    expect(contractText).toContain("export type PaintCompactDrawer = 'settings' | 'history'");
    expect(paintText).toContain('resolvePaintLayoutMode');
    expect(paintText).toContain('const [layoutMode, setLayoutMode] = useState<PaintLayoutMode>');
    expect(paintText).toContain('new ResizeObserver(updateLayoutMode)');
    expect(paintText).toContain('data-paint-layout={layoutMode}');
    expect(paintText).toContain('testId="paint-expanded-panel-group"');
    expect(layoutText).toContain("'paint-settings-drawer'");
    expect(layoutText).toContain("'paint-history-drawer'");
    expect(paintText).toContain("const PAINT_EXPANDED_LAYOUT_STORAGE_ID = 'olyq:paint:layout.v2'");
    expect(paintText).toContain('autoSaveId={PAINT_EXPANDED_LAYOUT_STORAGE_ID}');
    expect(paintText).toContain('defaultLayout={PAINT_EXPANDED_DEFAULT_LAYOUT}');
    expect(paintText).toContain("if (layoutMode === 'expanded') setCompactDrawer(null)");
  });

  it('Paint expanded 三栏丢弃旧布局并在折叠态隐藏内容', () => {
    const paintText = readRepoFile('src/pages/Paint.tsx');
    const historyPanelText = readRepoFile('src/pages/paint/PaintHistoryPanel.tsx');

    expect(paintText).toContain("'paint-settings': 24");
    expect(paintText).toContain("'paint-artboard': 52");
    expect(paintText).toContain("'paint-history': 24");
    expect(paintText).toContain('defaultSize="24%"');
    expect(paintText).toContain('minSize="18%"');
    expect(paintText).toContain('maxSize="36%"');
    expect(paintText).toContain('defaultSize="52%"');
    expect(paintText).toContain('minSize="32%"');
    expect(paintText).toContain('collapsedSize="0%"');
    expect(paintText).toContain('className="min-w-0 overflow-hidden border-r border-border/60 bg-muted/20"');
    expect(paintText).toContain('className="min-w-0 overflow-hidden border-l border-border/60 bg-muted/20"');
    expect(paintText).toContain('{leftCollapsed ? null : settingsPanel}');
    expect(paintText).toContain('{rightCollapsed ? null : historyPanel}');
    expect(historyPanelText).toContain('data-testid="paint-history-panel"');
  });

  it('Paint compact 配置抽屉打开模型选择器时保持打开', () => {
    const paintText = readRepoFile('src/pages/Paint.tsx');
    const match = paintText.match(/const openModelPicker = useCallback\(\(\) => \{[\s\S]*?\n\s{2}\}, \[[^\]]*\]\);/);

    expect(match?.[0]).toBeDefined();
    expect(match?.[0]).toContain('setPickerOpen(true)');
    expect(match?.[0]).not.toContain('setCompactDrawer(null)');
  });

  it('Paint compact 抽屉复用同步 Dialog，不引入 lazy / Suspense / dynamic import', () => {
    const paintText = readRepoFile('src/pages/Paint.tsx');
    const layoutText = readRepoFile('src/pages/paint/PaintResponsiveLayout.tsx');
    const combinedText = `${paintText}\n${layoutText}`;

    expect(layoutText).toContain("import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog'");
    expect(layoutText).toContain('useAutoBlurActiveElementOnMount');
    expect(layoutText).toContain('preventRadixCloseAutoFocus');
    expect(combinedText).not.toContain('React.lazy');
    expect(combinedText).not.toContain('lazy(');
    expect(combinedText).not.toContain('<Suspense');
    expect(combinedText).not.toContain('import(');
  });

  it('Paint 设置面板使用容器查询保护窄栏文字和控件', () => {
    const cssText = readRepoFile('src/index.css');
    const panelText = readRepoFile('src/pages/paint/PaintSettingsPanel.tsx');

    expect(cssText).toContain('[data-paint-settings-panel] {');
    expect(cssText).toContain('container-type: inline-size;');
    expect(cssText).toContain('@container (max-width: 280px)');
    expect(cssText).toContain('[data-paint-settings-panel] .paint-settings-row');
    expect(cssText).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(cssText).toContain('[data-paint-settings-panel] .paint-input-images-header');
    expect(cssText).toContain('flex-direction: column;');
    expect(cssText).toContain('@container (max-width: 220px)');
    expect(panelText).toContain('data-paint-settings-panel');
    expect(panelText).toContain('paint-settings-row');
    expect(panelText).toContain('paint-settings-control');
    expect(panelText).toContain('paint-input-images-header');
    expect(panelText).toContain('paint-input-images-grid');
  });

  it('Paint 提示词输入框沿用聊天输入区的透明 composer 语气', () => {
    const composerText = readRepoFile('src/pages/paint/PaintPromptComposer.tsx');

    expect(composerText).toContain('data-paint-prompt-composer');
    expect(composerText).toContain('rounded-2xl border border-border/60 bg-card/50');
    expect(composerText).toContain('focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/30');
    expect(composerText).toContain('bg-transparent text-sm placeholder:text-muted-foreground/60 focus:outline-none');
    expect(composerText).not.toContain('shadow-inner');
    expect(composerText).not.toContain('bg-background/80');
    expect(composerText).not.toContain('border-border/70');
  });
});
