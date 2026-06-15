/**
 * 说明：`dark-theme-colors.spec` 深色主题色测试模块。
 *
 * 职责：
 * - 固化深色主题色预设数量与默认品牌 palette；
 * - 验证自定义 Hex 派生和关键 WCAG 对比度；
 * - 确认运行时 CSS 只通过 `.dark` 选择器覆盖品牌 / 强调色，不改大面积背景。
 */
import { describe, expect, it } from 'vitest';

import {
  DARK_THEME_COLOR_PRESETS,
  DEFAULT_DARK_THEME_COLOR_PRESET_ID,
  DARK_THEME_COLOR_STYLE_ID,
  OLYQ_BRAND_END_HEX,
  OLYQ_BRAND_START_HEX,
  applyDarkThemeColorSelectionToDom,
  deriveDarkThemePaletteFromHex,
  getContrastRatio,
  normalizeDarkThemeColorSelection,
  normalizeDarkThemeHex,
  serializeDarkThemePaletteCss,
} from './dark-theme-colors';

/**
 * 将 `h s% l%` HSL token 转成 Hex。
 *
 * @param hsl - Tailwind token 形式的 HSL 字符串。
 * @returns 大写 `#RRGGBB`。
 */
function hslTokenToHex(hsl: string): string {
  const match = hsl.match(/^(\d+(?:\.\d)?) (\d+(?:\.\d)?)% (\d+(?:\.\d)?)%$/);
  if (!match) throw new Error(`Invalid HSL token: ${hsl}`);

  const hue = Number(match[1]);
  const saturation = Number(match[2]) / 100;
  const lightness = Number(match[3]) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = lightness - chroma / 2;
  const [r, g, b] = hue < 60
    ? [chroma, x, 0]
    : hue < 120
      ? [x, chroma, 0]
      : hue < 180
        ? [0, chroma, x]
        : hue < 240
          ? [0, x, chroma]
          : hue < 300
            ? [x, 0, chroma]
            : [chroma, 0, x];

  return `#${[r, g, b].map((channel) => (
    Math.round((channel + m) * 255).toString(16).padStart(2, '0').toUpperCase()
  )).join('')}`;
}

describe('dark-theme-colors', () => {
  it('固定 12 套深色主题色预设，并把 Olyq Brand 放在第一项', () => {
    expect(DARK_THEME_COLOR_PRESETS).toHaveLength(12);
    expect(DARK_THEME_COLOR_PRESETS[0]).toEqual(expect.objectContaining({
      id: DEFAULT_DARK_THEME_COLOR_PRESET_ID,
      sourceHex: OLYQ_BRAND_START_HEX,
      swatchStartHex: OLYQ_BRAND_START_HEX,
      swatchEndHex: OLYQ_BRAND_END_HEX,
    }));
    expect(DARK_THEME_COLOR_PRESETS[0].palette.variables['olyq-dark-theme-brand-start']).toBe('165 100% 42.5%');
    expect(DARK_THEME_COLOR_PRESETS[0].palette.variables['olyq-dark-theme-brand-end']).toBe('195 100% 42.5%');
    expect(DARK_THEME_COLOR_PRESETS[0].palette.variables['olyq-dark-theme-primary-foreground']).toBe('168 72% 8.4%');
  });

  it('黄色预设只写深色主题输入变量，交给 index.css 映射到主色控件', () => {
    const amber = DARK_THEME_COLOR_PRESETS.find((preset) => preset.id === 'amber');

    expect(amber).toBeDefined();
    expect(amber?.sourceHex).toBe('#FCD34D');
    expect(amber?.palette.variables['olyq-dark-theme-brand-start']).toBe('45.9 96.7% 64.5%');

    const cssText = serializeDarkThemePaletteCss(amber!.palette);
    expect(cssText).toContain('--olyq-dark-theme-brand-start: 45.9 96.7% 64.5%;');
    expect(cssText).not.toMatch(/--(?:primary|ring|sidebar-primary):/);
  });

  it('只接受 #RRGGBB 并把非法存储值收敛回默认品牌', () => {
    expect(normalizeDarkThemeHex('#abc123')).toBe('#ABC123');
    expect(normalizeDarkThemeHex('#123')).toBeNull();
    expect(normalizeDarkThemeHex('00D9A3')).toBeNull();
    expect(normalizeDarkThemeColorSelection({ kind: 'preset', presetId: 'missing', sourceHex: '#FFFFFF' })).toEqual({
      kind: 'preset',
      presetId: DEFAULT_DARK_THEME_COLOR_PRESET_ID,
      sourceHex: OLYQ_BRAND_START_HEX,
    });
  });

  it('自定义 Hex 会派生主色与可访问前景色，并保证主色实底文字达到正文级对比度', () => {
    const palette = deriveDarkThemePaletteFromHex('#6D28D9');
    const primaryHex = palette.swatchStartHex;
    const primaryForeground = palette.variables['olyq-dark-theme-primary-foreground'];

    expect(palette.id).toBe('custom');
    expect(palette.sourceHex).toBe('#6D28D9');
    expect(primaryHex).toMatch(/^#[0-9A-F]{6}$/);
    expect(primaryForeground).toMatch(/^\d+(?:\.\d)? \d+(?:\.\d)?% \d+(?:\.\d)?%$/);
    expect(getContrastRatio(hslTokenToHex(primaryForeground), primaryHex)).toBeGreaterThanOrEqual(4.5);
  });

  it('序列化和 DOM 注入只作用于 .dark，并且只覆盖品牌强调色 token', () => {
    const palette = deriveDarkThemePaletteFromHex('#14B8A6');
    const cssText = serializeDarkThemePaletteCss(palette);

    expect(cssText.startsWith('.dark {')).toBe(true);
    expect(cssText).toContain('--olyq-dark-theme-brand-start:');
    expect(cssText).toContain('--olyq-dark-theme-brand-end:');
    expect(cssText).toContain('--olyq-dark-theme-primary-foreground:');
    expect(cssText).toContain('--olyq-dark-theme-primary-control-thumb: 210 40% 98%;');
    expect(cssText).not.toContain(':root');
    expect(cssText).not.toMatch(/--(?:olyq-brand-start|olyq-brand-end|primary|primary-foreground|primary-control-thumb|ring|sidebar-primary|sidebar-primary-foreground|sidebar-ring|background|foreground|card|card-foreground|popover|popover-foreground|secondary|secondary-foreground|muted|muted-foreground|accent|accent-foreground|border|input|sidebar-background|sidebar-foreground|sidebar-accent|sidebar-accent-foreground|sidebar-border):/);

    applyDarkThemeColorSelectionToDom({ kind: 'custom', presetId: null, sourceHex: '#14B8A6' }, true);
    const styleElement = document.getElementById(DARK_THEME_COLOR_STYLE_ID);
    expect(styleElement?.textContent).toContain('.dark {');

    applyDarkThemeColorSelectionToDom({ kind: 'custom', presetId: null, sourceHex: '#14B8A6' }, false);
    expect(document.getElementById(DARK_THEME_COLOR_STYLE_ID)).toBeNull();
  });
});
