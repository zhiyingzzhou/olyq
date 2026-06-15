/**
 * 说明：`dark-theme-colors` 深色主题色彩系统模块。
 *
 * 职责：
 * - 定义深色模式品牌 / 强调色预设与受控 CSS token palette；
 * - 从用户输入的 Hex 主色派生主色、品牌渐变和可访问前景色；
 * - 提供启动期和运行期都可复用的 DOM token 注入能力。
 *
 * 边界：
 * - 本文件不读写存储，也不订阅 storage 事件；
 * - 持久化真源由 `dark-theme-color-settings` 负责，启动快照由 `extension-page-startup` 负责；
 * - 输出只覆盖品牌 / 强调色 token，不覆盖背景、surface、border 或 sidebar 底色；
 * - 输出仍然是现有 HSL CSS variable，避免引入运行时重依赖或第二套 CSS 色彩语法。
 */

/** 深色主题色运行时 style 节点 ID。 */
export const DARK_THEME_COLOR_STYLE_ID = 'olyq-dark-theme-color-vars';
/** 当前 Olyq 品牌色预设 ID。 */
export const DEFAULT_DARK_THEME_COLOR_PRESET_ID = 'olyq-brand';
/** Olyq 默认品牌主色起点。 */
export const OLYQ_BRAND_START_HEX = '#00D9A3';
/** Olyq 默认品牌主色终点。 */
export const OLYQ_BRAND_END_HEX = '#00A3D9';
/** 主色实底默认品牌 ink。 */
export const OLYQ_BRAND_INK_HEX = '#06251F';

/** 深色主题色持久化选择。 */
export type DarkThemeColorSelection =
  | {
      readonly kind: 'preset';
      readonly presetId: string;
      readonly sourceHex: string;
    }
  | {
      readonly kind: 'custom';
      readonly presetId: null;
      readonly sourceHex: string;
    };

/** 深色主题品牌 / 强调色 CSS token palette。 */
export interface DarkThemeCssPalette {
  /** palette ID；自定义色固定为 `custom`。 */
  readonly id: string;
  /** 用于输入框展示和持久化的源色。 */
  readonly sourceHex: string;
  /** 色块展示起点。 */
  readonly swatchStartHex: string;
  /** 色块展示终点。 */
  readonly swatchEndHex: string;
  /** CSS variable 名称到 HSL 值的映射，不包含前缀 `--`。 */
  readonly variables: Readonly<Record<DarkThemeCssVariableName, string>>;
}

/** 深色主题预设。 */
export interface DarkThemeColorPreset {
  /** 稳定预设 ID。 */
  readonly id: string;
  /** i18n label key。 */
  readonly labelKey: string;
  /** 预设源色。 */
  readonly sourceHex: string;
  /** 色块展示起点。 */
  readonly swatchStartHex: string;
  /** 色块展示终点。 */
  readonly swatchEndHex: string;
  /** 预设品牌 / 强调色 palette。 */
  readonly palette: DarkThemeCssPalette;
}

type Rgb = {
  readonly r: number;
  readonly g: number;
  readonly b: number;
};

type Oklch = {
  readonly l: number;
  readonly c: number;
  readonly h: number;
};

type PaletteSeed = {
  readonly id: string;
  readonly labelKey: string;
  readonly accentHex: string;
  readonly brandEndHex?: string;
};

const DEFAULT_DARK_THEME_COLOR_SELECTION_VALUE: DarkThemeColorSelection = {
  kind: 'preset',
  presetId: DEFAULT_DARK_THEME_COLOR_PRESET_ID,
  sourceHex: OLYQ_BRAND_START_HEX,
};

/** 深色主题色默认选择。 */
export const DEFAULT_DARK_THEME_COLOR_SELECTION = cloneDarkThemeColorSelection(
  DEFAULT_DARK_THEME_COLOR_SELECTION_VALUE,
);

const DARK_THEME_CSS_VARIABLE_NAMES = [
  'olyq-dark-theme-brand-start',
  'olyq-dark-theme-brand-end',
  'olyq-dark-theme-primary-foreground',
  'olyq-dark-theme-primary-control-thumb',
] as const;

type DarkThemeCssVariableName = (typeof DARK_THEME_CSS_VARIABLE_NAMES)[number];

const PRESET_SEEDS: readonly PaletteSeed[] = [
  {
    id: DEFAULT_DARK_THEME_COLOR_PRESET_ID,
    labelKey: 'appearance.themeColorPresets.olyqBrand',
    accentHex: OLYQ_BRAND_START_HEX,
    brandEndHex: OLYQ_BRAND_END_HEX,
  },
  {
    id: 'tech-blue',
    labelKey: 'appearance.themeColorPresets.techBlue',
    accentHex: '#60A5FA',
  },
  {
    id: 'emerald',
    labelKey: 'appearance.themeColorPresets.emerald',
    accentHex: '#6EE7B7',
  },
  {
    id: 'amber',
    labelKey: 'appearance.themeColorPresets.amber',
    accentHex: '#FCD34D',
  },
  {
    id: 'rose',
    labelKey: 'appearance.themeColorPresets.rose',
    accentHex: '#FB7185',
  },
  {
    id: 'cyan',
    labelKey: 'appearance.themeColorPresets.cyan',
    accentHex: '#67E8F9',
  },
  {
    id: 'lavender',
    labelKey: 'appearance.themeColorPresets.lavender',
    accentHex: '#C4B5FD',
  },
  {
    id: 'coral',
    labelKey: 'appearance.themeColorPresets.coral',
    accentHex: '#FDA4AF',
  },
  {
    id: 'mint',
    labelKey: 'appearance.themeColorPresets.mint',
    accentHex: '#6EE7B7',
  },
  {
    id: 'sunset',
    labelKey: 'appearance.themeColorPresets.sunset',
    accentHex: '#FDBA74',
  },
  {
    id: 'jade',
    labelKey: 'appearance.themeColorPresets.jade',
    accentHex: '#5AF2C5',
  },
  {
    id: 'deep-space',
    labelKey: 'appearance.themeColorPresets.deepSpace',
    accentHex: '#8AA2FF',
  },
] as const;

/**
 * 复制深色主题色选择对象。
 *
 * @param selection - 当前选择。
 * @returns 新对象，避免调用方误改模块内常量。
 */
export function cloneDarkThemeColorSelection(selection: DarkThemeColorSelection): DarkThemeColorSelection {
  return selection.kind === 'custom'
    ? { kind: 'custom', presetId: null, sourceHex: selection.sourceHex }
    : { kind: 'preset', presetId: selection.presetId, sourceHex: selection.sourceHex };
}

/** 深色主题色预设列表，第一项固定为当前 Olyq Brand。 */
export const DARK_THEME_COLOR_PRESETS: readonly DarkThemeColorPreset[] = PRESET_SEEDS.map(buildPreset);

const presetsById = new Map(DARK_THEME_COLOR_PRESETS.map((preset) => [preset.id, preset]));

/**
 * 规范化 `#RRGGBB` 主题色输入。
 *
 * @param input - 用户或存储中的原始 Hex。
 * @returns 大写 Hex；非法时返回 null。
 */
export function normalizeDarkThemeHex(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const normalized = input.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : null;
}

/**
 * 判断原始值是否是当前协议认可的深色主题色选择。
 *
 * @param raw - 存储或启动快照中的原始值。
 * @returns 是否可直接作为可信启动值。
 */
export function isUsableDarkThemeColorSelectionValue(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const record = raw as Record<string, unknown>;
  if (record.kind === 'custom') return record.presetId === null && normalizeDarkThemeHex(record.sourceHex) !== null;
  if (record.kind !== 'preset' || typeof record.presetId !== 'string') return false;
  const preset = presetsById.get(record.presetId);
  return !!preset && normalizeDarkThemeHex(record.sourceHex) === preset.sourceHex;
}

/**
 * 将原始值收敛为深色主题色选择。
 *
 * @param raw - 存储、启动快照或调用方提交的原始值。
 * @returns 合法选择；非法值统一收敛到当前 Olyq Brand。
 */
export function normalizeDarkThemeColorSelection(raw: unknown): DarkThemeColorSelection {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return cloneDarkThemeColorSelection(DEFAULT_DARK_THEME_COLOR_SELECTION_VALUE);
  }

  const record = raw as Record<string, unknown>;
  if (record.kind === 'custom') {
    const sourceHex = normalizeDarkThemeHex(record.sourceHex);
    if (record.presetId === null && sourceHex) {
      return { kind: 'custom', presetId: null, sourceHex };
    }
  }

  if (record.kind === 'preset' && typeof record.presetId === 'string') {
    const preset = presetsById.get(record.presetId);
    if (preset) {
      return { kind: 'preset', presetId: preset.id, sourceHex: preset.sourceHex };
    }
  }

  return cloneDarkThemeColorSelection(DEFAULT_DARK_THEME_COLOR_SELECTION_VALUE);
}

/**
 * 按选择解析深色主题品牌 / 强调色 palette。
 *
 * @param selection - 深色主题色选择。
 * @returns 当前应写入 CSS token 的 palette。
 */
export function resolveDarkThemePalette(selection: DarkThemeColorSelection): DarkThemeCssPalette {
  if (selection.kind === 'custom') return deriveDarkThemePaletteFromHex(selection.sourceHex);
  return presetsById.get(selection.presetId)?.palette ?? DARK_THEME_COLOR_PRESETS[0].palette;
}

/**
 * 从自定义 Hex 派生深色主题品牌 / 强调色 palette。
 *
 * @param inputHex - 用户输入的 `#RRGGBB` 源色。
 * @returns 自动派生出的主色、渐变终点与可访问前景色。
 */
export function deriveDarkThemePaletteFromHex(inputHex: string): DarkThemeCssPalette {
  const sourceHex = normalizeDarkThemeHex(inputHex) ?? OLYQ_BRAND_START_HEX;
  const source = hexToOklch(sourceHex);
  const hue = source.c < 0.02 ? 166.93 : source.h;
  const chroma = source.c < 0.02 ? 0.15 : clamp(source.c, 0.08, 0.2);
  const primaryLightness = clamp(source.l, 0.5, 0.78);
  const primaryHex = oklchToHex(primaryLightness, chroma, hue);
  const brandEndHex = oklchToHex(clamp(primaryLightness + 0.02, 0.64, 0.8), clamp(chroma * 0.92, 0.08, 0.18), hue + 28);

  return buildBrandAccentPalette({
    id: 'custom',
    sourceHex,
    swatchStartHex: primaryHex,
    swatchEndHex: brandEndHex,
    accentHex: primaryHex,
    brandEndHex,
  });
}

/**
 * 序列化深色主题 CSS variable。
 *
 * @param palette - 当前 palette。
 * @returns 只作用于 `.dark` 的 CSS 文本。
 */
export function serializeDarkThemePaletteCss(palette: DarkThemeCssPalette): string {
  const variableText = DARK_THEME_CSS_VARIABLE_NAMES
    .map((name) => `  --${name}: ${palette.variables[name]};`)
    .join('\n');
  return `.dark {\n${variableText}\n}`;
}

/**
 * 把深色主题 palette 写入 DOM。
 *
 * @param palette - 当前 palette。
 * @param active - 是否让自定义 palette 在当前 DOM 中生效；false 会移除运行时 style。
 */
export function applyDarkThemePaletteToDom(palette: DarkThemeCssPalette, active: boolean): void {
  if (typeof document === 'undefined') return;

  const existing = document.getElementById(DARK_THEME_COLOR_STYLE_ID);
  if (!active) {
    existing?.remove();
    return;
  }

  const styleElement = existing ?? document.createElement('style');
  styleElement.id = DARK_THEME_COLOR_STYLE_ID;
  styleElement.textContent = serializeDarkThemePaletteCss(palette);
  if (!existing) document.head.appendChild(styleElement);
}

/**
 * 将深色主题色选择直接应用到 DOM。
 *
 * @param rawSelection - 原始选择值。
 * @param active - 是否让 palette 在当前 DOM 中生效。
 */
export function applyDarkThemeColorSelectionToDom(rawSelection: unknown, active: boolean): void {
  const selection = normalizeDarkThemeColorSelection(rawSelection);
  applyDarkThemePaletteToDom(resolveDarkThemePalette(selection), active);
}

/**
 * 计算两个 Hex 颜色之间的 WCAG 对比度。
 *
 * @param foregroundHex - 前景色。
 * @param againstHex - 被测对照色。
 * @returns WCAG contrast ratio。
 */
export function getContrastRatio(foregroundHex: string, againstHex: string): number {
  const foregroundLuminance = getRelativeLuminance(hexToRgb(foregroundHex));
  const backgroundLuminance = getRelativeLuminance(hexToRgb(againstHex));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 从静态图色值构建可消费的主题色预设。
 *
 * @param seed - 图中抽取并整理后的 palette 种子。
 * @returns 带品牌 / 强调色 CSS token 的预设对象。
 */
function buildPreset(seed: PaletteSeed): DarkThemeColorPreset {
  const palette = seed.id === DEFAULT_DARK_THEME_COLOR_PRESET_ID
    ? buildOlyqDefaultPalette(seed)
    : buildBrandAccentPalette({
        ...seed,
        id: seed.id,
        sourceHex: seed.accentHex,
        swatchStartHex: seed.accentHex,
        swatchEndHex: seed.brandEndHex ?? deriveBrandEndHex(seed.accentHex),
      });

  return {
    id: seed.id,
    labelKey: seed.labelKey,
    sourceHex: seed.accentHex,
    swatchStartHex: palette.swatchStartHex,
    swatchEndHex: palette.swatchEndHex,
    palette,
  };
}

/**
 * 构建 Olyq 默认深色品牌 / 强调色 palette。
 *
 * @param seed - Olyq Brand 种子色。
 * @returns 与 `index.css` 默认 `.dark` 主色 token 一致的 palette。
 */
function buildOlyqDefaultPalette(seed: PaletteSeed): DarkThemeCssPalette {
  return {
    id: seed.id,
    sourceHex: seed.accentHex,
    swatchStartHex: seed.accentHex,
    swatchEndHex: seed.brandEndHex ?? OLYQ_BRAND_END_HEX,
    variables: {
      'olyq-dark-theme-brand-start': '165 100% 42.5%',
      'olyq-dark-theme-brand-end': '195 100% 42.5%',
      'olyq-dark-theme-primary-foreground': '168 72% 8.4%',
      'olyq-dark-theme-primary-control-thumb': '210 40% 98%',
    },
  };
}

/**
 * 从主色构建可注入的深色品牌 / 强调色 token。
 *
 * @param options - 主色、渐变终点和色块展示元信息。
 * @returns 可直接注入 CSS variables 的品牌 / 强调色 palette。
 */
function buildBrandAccentPalette(options: {
  readonly id: string;
  readonly sourceHex: string;
  readonly swatchStartHex: string;
  readonly swatchEndHex: string;
  readonly accentHex: string;
  readonly brandEndHex?: string;
}): DarkThemeCssPalette {
  const primaryForegroundHex = choosePrimaryForegroundHex(options.accentHex);

  return {
    id: options.id,
    sourceHex: options.sourceHex,
    swatchStartHex: options.swatchStartHex,
    swatchEndHex: options.swatchEndHex,
    variables: {
      'olyq-dark-theme-brand-start': hexToHslString(options.accentHex),
      'olyq-dark-theme-brand-end': hexToHslString(options.brandEndHex ?? options.swatchEndHex),
      'olyq-dark-theme-primary-foreground': hexToHslString(primaryForegroundHex),
      'olyq-dark-theme-primary-control-thumb': '210 40% 98%',
    },
  };
}

/**
 * 为主色实底挑选可读前景色。
 *
 * @param primaryHex - 当前主色 Hex。
 * @returns 满足正文级对比度的深色 ink 或白色。
 */
function choosePrimaryForegroundHex(primaryHex: string): string {
  const primary = hexToOklch(primaryHex);
  const inkHex = oklchToHex(0.18, Math.min(Math.max(primary.c * 0.45, 0.025), 0.06), primary.h);
  if (getContrastRatio(inkHex, primaryHex) >= 4.5) return inkHex;
  if (getContrastRatio(OLYQ_BRAND_INK_HEX, primaryHex) >= 4.5) return OLYQ_BRAND_INK_HEX;
  return '#FFFFFF';
}

/**
 * 从主色派生品牌渐变终点。
 *
 * @param primaryHex - 当前主色 Hex。
 * @returns 相邻色相的渐变终点 Hex。
 */
function deriveBrandEndHex(primaryHex: string): string {
  const primary = hexToOklch(primaryHex);
  return oklchToHex(clamp(primary.l + 0.02, 0.62, 0.84), clamp(primary.c * 0.92, 0.07, 0.18), primary.h + 28);
}

/**
 * 将 Hex 转换为 RGB。
 *
 * @param hex - `#RRGGBB` 色值。
 * @returns RGB 通道。
 */
function hexToRgb(hex: string): Rgb {
  const normalized = normalizeDarkThemeHex(hex) ?? OLYQ_BRAND_START_HEX;
  const value = Number.parseInt(normalized.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

/**
 * 将 Hex 转为 Tailwind token 使用的 HSL 字符串。
 *
 * @param hex - `#RRGGBB` 色值。
 * @returns 形如 `165 100% 42.5%` 的 HSL 文本。
 */
function hexToHslString(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const rUnit = r / 255;
  const gUnit = g / 255;
  const bUnit = b / 255;
  const max = Math.max(rUnit, gUnit, bUnit);
  const min = Math.min(rUnit, gUnit, bUnit);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return `0 0% ${formatNumber(lightness * 100)}%`;

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === rUnit) hue = ((gUnit - bUnit) / delta) % 6;
  else if (max === gUnit) hue = (bUnit - rUnit) / delta + 2;
  else hue = (rUnit - gUnit) / delta + 4;

  return `${formatNumber((hue * 60 + 360) % 360)} ${formatNumber(saturation * 100)}% ${formatNumber(lightness * 100)}%`;
}

/**
 * 将 Hex 转为 OKLCH。
 *
 * @param hex - `#RRGGBB` 色值。
 * @returns 感知明度、色度和色相。
 */
function hexToOklch(hex: string): Oklch {
  const { r, g, b } = hexToRgb(hex);
  const linearR = srgbChannelToLinear(r);
  const linearG = srgbChannelToLinear(g);
  const linearB = srgbChannelToLinear(b);
  const l = Math.cbrt(0.4122214708 * linearR + 0.5363325363 * linearG + 0.0514459929 * linearB);
  const m = Math.cbrt(0.2119034982 * linearR + 0.6806995451 * linearG + 0.1073969566 * linearB);
  const s = Math.cbrt(0.0883024619 * linearR + 0.2817188376 * linearG + 0.6299787005 * linearB);
  const labA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const labB = 0.0259040371 * l + 0.7827717662 * m - 0.8086757662 * s;
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    c: Math.sqrt(labA ** 2 + labB ** 2),
    h: (Math.atan2(labB, labA) * 180 / Math.PI + 360) % 360,
  };
}

/**
 * 将 OKLCH 转回 sRGB Hex。
 *
 * @param lightness - OKLCH 明度。
 * @param chroma - OKLCH 色度。
 * @param hue - OKLCH 色相角度。
 * @returns 裁切到 sRGB 色域后的 Hex。
 */
function oklchToHex(lightness: number, chroma: number, hue: number): string {
  const hueRadians = ((hue % 360 + 360) % 360) * Math.PI / 180;
  const labA = Math.cos(hueRadians) * chroma;
  const labB = Math.sin(hueRadians) * chroma;
  const lPrime = lightness + 0.3963377774 * labA + 0.2158037573 * labB;
  const mPrime = lightness - 0.1055613458 * labA - 0.0638541728 * labB;
  const sPrime = lightness - 0.0894841775 * labA - 1.291485548 * labB;
  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;
  return rgbToHex({
    r: linearToSrgbChannel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgbChannel(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgbChannel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  });
}

/**
 * 将 RGB 转为 Hex。
 *
 * @param rgb - RGB 通道。
 * @returns 大写 `#RRGGBB`。
 */
function rgbToHex(rgb: Rgb): string {
  return `#${[rgb.r, rgb.g, rgb.b].map((channel) => (
    clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0').toUpperCase()
  )).join('')}`;
}

/**
 * 将 sRGB 通道转换为线性光。
 *
 * @param channel - 0-255 的 sRGB 通道。
 * @returns 线性光通道值。
 */
function srgbChannelToLinear(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/**
 * 将线性光通道转换为 sRGB 通道。
 *
 * @param channel - 线性光通道值。
 * @returns 0-255 的 sRGB 通道。
 */
function linearToSrgbChannel(channel: number): number {
  const srgb = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
  return clamp(srgb, 0, 1) * 255;
}

/**
 * 计算 WCAG 相对亮度。
 *
 * @param rgb - RGB 通道。
 * @returns 相对亮度。
 */
function getRelativeLuminance(rgb: Rgb): number {
  return 0.2126 * srgbChannelToLinear(rgb.r)
    + 0.7152 * srgbChannelToLinear(rgb.g)
    + 0.0722 * srgbChannelToLinear(rgb.b);
}

/**
 * 将数值限制到闭区间。
 *
 * @param value - 原始数值。
 * @param min - 最小值。
 * @param max - 最大值。
 * @returns 限制后的数值。
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 格式化 CSS token 数字。
 *
 * @param value - 原始数字。
 * @returns 最多保留一位小数的文本。
 */
function formatNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
