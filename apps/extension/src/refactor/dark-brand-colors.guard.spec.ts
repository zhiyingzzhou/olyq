/**
 * 说明：`dark-brand-colors.guard` 源码模块。
 *
 * 职责：
 * - 固化深色模式品牌色只使用品牌图中明确给出的两端色；
 * - 防止暗色主题主色回退成旧紫色，或把用户正文气泡重新改成高饱和渐变 surface；
 * - 确保主色实底前景使用可访问的品牌深色 ink，物理控制点使用独立浅色 token。
 * - 确保深色主题色切换不覆盖中性背景、surface、border 与 sidebar 底色。
 *
 * 边界：
 * - 本 guard 只约束深色模式的全局品牌 token 与聊天主视觉；
 * - 启动台应用入口等功能分类色不属于品牌主题真源。
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
 * 递归收集源码文件。
 *
 * @param directory - 当前扫描目录。
 * @returns 目录下全部源码文件路径。
 */
function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) return collectSourceFiles(absolutePath);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];

    return [absolutePath];
  });
}

/**
 * 查找生产代码里的 `Switch` 调用方。
 *
 * @returns 使用共享 `Switch` 的源码文件。
 */
function findSwitchCallSiteFiles() {
  return collectSourceFiles(SRC_ROOT)
    .filter((absolutePath) => !/\.spec\.(ts|tsx)$/.test(absolutePath))
    .filter((absolutePath) => path.relative(REPO_ROOT, absolutePath) !== 'src/components/ui/switch.tsx')
    .filter((absolutePath) => {
      const sourceText = fs.readFileSync(absolutePath, 'utf8');
      return sourceText.includes("@/components/ui/switch") || sourceText.includes('components/ui/switch');
    })
    .map((absolutePath) => path.relative(REPO_ROOT, absolutePath));
}

/**
 * 将 8 位十六进制以内的颜色转换为 sRGB 分量。
 *
 * @param hexColor - 形如 `#00D9A3` 的十六进制颜色。
 * @returns 归一化到 0-255 的 RGB 分量。
 */
function hexToRgb(hexColor: string) {
  const normalizedHex = hexColor.replace('#', '');
  const value = Number.parseInt(normalizedHex, 16);

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

/**
 * 将 sRGB 色彩通道转换为线性光通道值。
 *
 * @param channel - 0-255 的 sRGB 通道值。
 * @returns 线性光通道值。
 */
function srgbChannelToLinear(channel: number) {
  const srgb = channel / 255;

  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/**
 * 计算 WCAG 相对亮度。
 *
 * @param hexColor - 形如 `#06251F` 的十六进制颜色。
 * @returns 相对亮度。
 */
function relativeLuminance(hexColor: string) {
  const { r, g, b } = hexToRgb(hexColor);

  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

/**
 * 计算两个颜色的 WCAG 对比度。
 *
 * @param foreground - 前景色。
 * @param background - 背景色。
 * @returns 对比度。
 */
function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

describe('dark brand colors guard', () => {
  it('深色主题主色固定使用品牌图里的青绿到蓝青两端色', () => {
    const sourceText = readRepoFile('src/index.css');

    expect(sourceText).toContain('--olyq-brand-start: 165 100% 42.5%;');
    expect(sourceText).toContain('--olyq-brand-end: 195 100% 42.5%;');
    expect(sourceText).toContain('--olyq-brand-start: var(--olyq-dark-theme-brand-start, 165 100% 42.5%);');
    expect(sourceText).toContain('--olyq-brand-end: var(--olyq-dark-theme-brand-end, 195 100% 42.5%);');
    expect(sourceText).toContain('--primary: var(--olyq-brand-start);');
    expect(sourceText).toContain('--primary-foreground: var(--olyq-dark-theme-primary-foreground, 168 72% 8.4%);');
    expect(sourceText).toContain('--primary-control-thumb: var(--olyq-dark-theme-primary-control-thumb, 210 40% 98%);');
    expect(sourceText).toContain('--ring: var(--olyq-brand-start);');
    expect(sourceText).toContain('--sidebar-primary: var(--olyq-brand-start);');
    expect(sourceText).toContain('--sidebar-primary-foreground: var(--olyq-dark-theme-primary-foreground, 168 72% 8.4%);');
    expect(sourceText).toContain('--sidebar-ring: var(--olyq-brand-start);');
    expect(sourceText).toContain('linear-gradient(90deg, hsl(var(--olyq-brand-start)), hsl(var(--olyq-brand-end)))');
    expect(sourceText).not.toContain('250 80% 65%');
    expect(sourceText).not.toContain('--primary-foreground: 0 0% 100%;');
    expect(sourceText).not.toContain('--sidebar-primary-foreground: 0 0% 100%;');
    expect(sourceText).not.toContain('--primary-foreground: 230 25% 7%;');
    expect(sourceText).not.toContain('--sidebar-primary-foreground: 230 25% 7%;');
  });

  it('深色主题色切换保留 Olyq 默认品牌色，并固定预设数量', () => {
    const themeColorText = readRepoFile('src/lib/dark-theme-colors.ts');
    const startupText = readRepoFile('src/lib/extension/extension-page-startup.ts');
    const persistenceText = readRepoFile('src/lib/persistence/domains.ts');
    const presetSeedText = themeColorText.slice(
      themeColorText.indexOf('const PRESET_SEEDS'),
      themeColorText.indexOf('] as const;', themeColorText.indexOf('const PRESET_SEEDS')),
    );
    const presetIds = [
      'olyq-brand',
      ...Array.from(presetSeedText.matchAll(/\n\s+id: '([^']+)'/g), (match) => match[1]),
    ];

    expect(themeColorText).toContain("DEFAULT_DARK_THEME_COLOR_PRESET_ID = 'olyq-brand'");
    expect(themeColorText).toContain("OLYQ_BRAND_START_HEX = '#00D9A3'");
    expect(themeColorText).toContain("OLYQ_BRAND_END_HEX = '#00A3D9'");
    expect(presetIds).toEqual([
      'olyq-brand',
      'tech-blue',
      'emerald',
      'amber',
      'rose',
      'cyan',
      'lavender',
      'coral',
      'mint',
      'sunset',
      'jade',
      'deep-space',
    ]);
    expect(themeColorText).toContain("DEFAULT_DARK_THEME_COLOR_PRESET_ID,\n    labelKey: 'appearance.themeColorPresets.olyqBrand'");
    expect(themeColorText).not.toContain('#C084FC');
    expect(startupText).toContain("DARK_THEME_COLOR_STORAGE_KEY = 'olyq.dark-theme-color.v1'");
    expect(startupText).toContain('applyDarkThemeColorSelectionToDom(');
    expect(persistenceText).toContain("'olyq.dark-theme-color.v1'");
  });

  it('深色主题色运行时 CSS 只覆盖品牌强调色，不覆盖大面积中性背景', () => {
    const themeColorText = readRepoFile('src/lib/dark-theme-colors.ts');
    const cssVariableListText = themeColorText.slice(
      themeColorText.indexOf('const DARK_THEME_CSS_VARIABLE_NAMES'),
      themeColorText.indexOf('] as const;', themeColorText.indexOf('const DARK_THEME_CSS_VARIABLE_NAMES')),
    );

    expect(cssVariableListText).toContain("'olyq-dark-theme-brand-start'");
    expect(cssVariableListText).toContain("'olyq-dark-theme-brand-end'");
    expect(cssVariableListText).toContain("'olyq-dark-theme-primary-foreground'");
    expect(cssVariableListText).toContain("'olyq-dark-theme-primary-control-thumb'");
    expect(cssVariableListText).not.toMatch(/'(?:olyq-brand-start|olyq-brand-end|primary|primary-foreground|primary-control-thumb|ring|sidebar-primary|sidebar-primary-foreground|sidebar-ring|background|foreground|card|card-foreground|popover|popover-foreground|secondary|secondary-foreground|muted|muted-foreground|accent|accent-foreground|border|input|sidebar-background|sidebar-foreground|sidebar-accent|sidebar-accent-foreground|sidebar-border)'/);
    expect(themeColorText).not.toContain('backgroundHex');
    expect(themeColorText).not.toContain('surfaceHex');
    expect(themeColorText).not.toContain('mutedForegroundHex');
  });

  it('深色主题色运行时输入变量由 index.css 唯一映射到语义主色 token', () => {
    const indexCssText = readRepoFile('src/index.css');
    const themeColorText = readRepoFile('src/lib/dark-theme-colors.ts');
    const darkBlockText = indexCssText.slice(indexCssText.indexOf('  .dark {'), indexCssText.indexOf('  }\n}', indexCssText.indexOf('  .dark {')));

    expect(darkBlockText).toContain('--olyq-brand-start: var(--olyq-dark-theme-brand-start, 165 100% 42.5%);');
    expect(darkBlockText).toContain('--olyq-brand-end: var(--olyq-dark-theme-brand-end, 195 100% 42.5%);');
    expect(darkBlockText).toContain('--primary: var(--olyq-brand-start);');
    expect(darkBlockText).toContain('--ring: var(--olyq-brand-start);');
    expect(darkBlockText).toContain('--sidebar-primary: var(--olyq-brand-start);');
    expect(themeColorText).toContain('return `.dark {\\n${variableText}\\n}`;');
    expect(themeColorText).not.toMatch(/`\\s+--(?:primary|ring|sidebar-primary):/);
  });

  it('品牌深色 ink 在品牌渐变两端都满足正文级对比度', () => {
    const brandInk = '#06251F';

    expect(contrastRatio(brandInk, '#00D9A3')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(brandInk, '#00A3D9')).toBeGreaterThanOrEqual(4.5);
  });

  it('聊天用户正文气泡不再使用品牌渐变 surface', () => {
    const messageBubbleText = readRepoFile('src/components/chat/message-bubble/useMessageBubbleView.tsx');
    const surfaceStart = messageBubbleText.indexOf('const messageSurfaceClassName = cn(');
    const surfaceEnd = messageBubbleText.indexOf('const handleMessageRowClick', surfaceStart);
    const messageSurfaceText = messageBubbleText.slice(surfaceStart, surfaceEnd);
    const welcomeDemoText = readRepoFile('src/components/chat/WelcomeDemo.tsx');

    expect(messageBubbleText.match(/olyq-brand-gradient-surface/g)?.length).toBe(1);
    expect(messageSurfaceText).not.toContain('olyq-brand-gradient-surface');
    expect(messageSurfaceText).toContain('border border-border/60 bg-card px-3.5 py-2.5 text-foreground shadow-none');
    expect(messageSurfaceText).toContain('dark:border-primary/15 dark:bg-primary/[0.06]');
    expect(welcomeDemoText.match(/olyq-brand-gradient-surface/g)?.length).toBe(1);
  });

  it('主色控件内部控制点使用独立浅色控制点 token', () => {
    const switchText = readRepoFile('src/components/ui/switch.tsx');
    const sliderText = readRepoFile('src/components/ui/slider.tsx');
    const tailwindConfigText = readRepoFile('tailwind.config.mjs');

    expect(switchText).toContain('data-[state=checked]:bg-primary');
    expect(switchText).toContain('bg-primary-control-thumb');
    expect(switchText).toContain('data-[state=unchecked]:bg-background');
    expect(switchText).not.toContain('bg-primary-foreground');
    expect(switchText).not.toContain('rounded-full bg-background shadow-lg');
    expect(sliderText).toContain('SliderPrimitive.Range className="absolute h-full bg-primary"');
    expect(sliderText).toContain('border-2 border-primary bg-primary-control-thumb');
    expect(sliderText).not.toContain('border-2 border-primary bg-primary-foreground');
    expect(sliderText).not.toContain('border-2 border-primary bg-background');
    expect(tailwindConfigText).toContain('"control-thumb": "hsl(var(--primary-control-thumb))"');
  });

  it('Switch 调用方不再覆盖 checked 主色轨道', () => {
    const switchCallSiteFiles = findSwitchCallSiteFiles();

    expect(switchCallSiteFiles.length).toBeGreaterThan(0);
    for (const relativePath of switchCallSiteFiles) {
      expect(readRepoFile(relativePath)).not.toMatch(/data-\[state=checked\]:bg-/);
    }
  });

  it('外观主题色选择器保护左侧文案可读性，右侧控件通过换行重排', () => {
    const appearancePanelText = readRepoFile('src/components/chat/settings/AppearancePanel.tsx');

    expect(appearancePanelText).toContain("aria-label={t('appearance.themeColorPresetList')}");
    expect(appearancePanelText).toContain('grid-cols-[minmax(12rem,14rem)_minmax(0,1fr)]');
    expect(appearancePanelText).toContain('max-w-56 shrink-0');
    expect(appearancePanelText).toContain('whitespace-nowrap text-sm');
    expect(appearancePanelText).toContain('flex-wrap items-center justify-end gap-2');
    expect(appearancePanelText).toContain('relative h-6 w-6 shrink-0 rounded-full');
    expect(appearancePanelText).toContain('h-8 w-24 shrink-0');
    expect(appearancePanelText).not.toContain('overflow-x-auto');
    expect(appearancePanelText).not.toContain('overscroll-x-contain');
    expect(appearancePanelText).not.toContain('flex-nowrap');
    expect(appearancePanelText).not.toContain('flex min-w-0 flex-1 items-start gap-2');
    expect(appearancePanelText).not.toContain('min-w-[16rem] flex-1 flex-wrap');
  });
});
